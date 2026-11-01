import test from 'node:test';
import assert from 'node:assert/strict';
import https from 'node:https';
import { PassThrough } from 'node:stream';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { receiveRegistryTarball } from '../src/registry.mjs';
const bytes=Buffer.from('fixture artifact');
const registry='https://registry.example/',tarball=registry+'fixture.tgz';
const integrity='sha512-'+createHash('sha512').update(bytes).digest('base64');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function input(t){const root=await mkdtemp(join(tmpdir(),'registry-lifetime-'));t.after(()=>rm(root,{recursive:true,force:true}));return {registry,tarball,integrity,destination:join(root,'artifact.tgz'),timeoutMs:500,inactivityTimeoutMs:100};}
async function absent(i){await assert.rejects(readFile(i.destination),{code:'ENOENT'});}
const timeout=phase=>error=>error.code==='ERR_REGISTRY_TRANSFER_TIMEOUT'&&error.phase===phase&&error.transportCleanup==='requested-unconfirmed';

for(const field of ['timeoutMs','inactivityTimeoutMs'])for(const value of [0,-1,NaN,Infinity,1.5,120001,'5000',null])test(`invalid ${field}=${value} refuses before transport`,async t=>{
  const i=await input(t);let calls=0;await assert.rejects(receiveRegistryTarball({...i,[field]:value,fetchImpl:()=>{calls++;}}),TypeError);assert.equal(calls,0);await absent(i);
});
test('invalid signal or port refuses before transport',async t=>{const i=await input(t);await assert.rejects(receiveRegistryTarball({...i,signal:{aborted:false}}),TypeError);await assert.rejects(receiveRegistryTarball({...i,fetchImpl:{}}),TypeError);});
test('delayed headers and chunks succeed within selected lifetimes',async t=>{
  const i=await input(t);const result=await receiveRegistryTarball({...i,fetchImpl:async()=>{await pause(20);return new Response(new ReadableStream({async start(c){c.enqueue(bytes.subarray(0,5));await pause(20);c.enqueue(bytes.subarray(5));c.close();}}));}});assert.equal(result.bytes,bytes.length);assert.deepEqual(await readFile(i.destination),bytes);
});
test('ignored fetch abort with no response settles at inactivity and signals cancellation',async t=>{
  const i=await input(t);let signal;await assert.rejects(receiveRegistryTarball({...i,inactivityTimeoutMs:20,fetchImpl:(_u,o)=>{signal=o.signal;return new Promise(()=>{});}}),timeout('inactivity'));assert.equal(signal.aborted,true);await absent(i);
});
test('late signal-ignoring response is canceled and never written',async t=>{
  const i=await input(t);let canceled=false;await assert.rejects(receiveRegistryTarball({...i,inactivityTimeoutMs:20,fetchImpl:async()=>{await pause(60);return new Response(new ReadableStream({cancel(){canceled=true;}}));}}),timeout('inactivity'));await pause(70);assert.equal(canceled,true);await absent(i);
});
test('hung body read and hung cancellation cannot hold caller or reader lock',async t=>{
  const i=await input(t);let canceled=false;const body=new ReadableStream({pull(){return new Promise(()=>{});},cancel(){canceled=true;return new Promise(()=>{});}});
  await assert.rejects(receiveRegistryTarball({...i,inactivityTimeoutMs:20,fetchImpl:async()=>new Response(body)}),timeout('inactivity'));assert.equal(canceled,true);assert.equal(body.locked,false);await absent(i);
});
test('active trickle cannot extend the total deadline',async t=>{
  const i=await input(t);let interval,canceled=false;const body=new ReadableStream({start(c){interval=setInterval(()=>c.enqueue(Uint8Array.of(1)),5);},cancel(){clearInterval(interval);canceled=true;}});t.after(()=>clearInterval(interval));
  await assert.rejects(receiveRegistryTarball({...i,timeoutMs:60,inactivityTimeoutMs:40,fetchImpl:async()=>new Response(body)}),timeout('total'));assert.equal(canceled,true);await absent(i);
});
test('empty chunks do not keep an otherwise idle body alive',async t=>{
  const i=await input(t);let interval;const body=new ReadableStream({start(c){interval=setInterval(()=>c.enqueue(new Uint8Array()),5);},cancel(){clearInterval(interval);}});t.after(()=>clearInterval(interval));await assert.rejects(receiveRegistryTarball({...i,inactivityTimeoutMs:30,fetchImpl:async()=>new Response(body)}),timeout('inactivity'));await absent(i);
});
test('preaborted signal causes no transport effect',async t=>{
  const i=await input(t),controller=new AbortController();controller.abort('stop');let calls=0;await assert.rejects(receiveRegistryTarball({...i,signal:controller.signal,fetchImpl:()=>{calls++;}}),e=>e.code==='ABORT_ERR'&&e.cause==='stop');assert.equal(calls,0);await absent(i);
});
test('midbody caller abort cancels ignored port and releases reader',async t=>{
  const i=await input(t),controller=new AbortController();let canceled=false,portSignal;const body=new ReadableStream({start(c){c.enqueue(bytes);},cancel(){canceled=true;}});const task=receiveRegistryTarball({...i,signal:controller.signal,fetchImpl:async(_u,o)=>{portSignal=o.signal;return new Response(body);}});await pause(5);controller.abort('cancel');await assert.rejects(task,e=>e.code==='ABORT_ERR');assert.equal(portSignal.aborted,true);assert.equal(canceled,true);assert.equal(body.locked,false);await absent(i);
});
test('port rejection and body error preserve original failure',async t=>{
  for(const stage of ['port','body']){const i=await input(t),error=new Error(stage);await assert.rejects(receiveRegistryTarball({...i,fetchImpl:async()=>{if(stage==='port')throw error;return new Response(new ReadableStream({start(c){c.error(error);}}));}}),e=>e===error);await absent(i);}
});
test('HTTP rejection cancels rather than draining body',async t=>{
  const i=await input(t);let canceled=false;await assert.rejects(receiveRegistryTarball({...i,fetchImpl:async()=>new Response(new ReadableStream({cancel(){canceled=true;return new Promise(()=>{});}}),{status:403})}),/does not match/);assert.equal(canceled,true);await absent(i);
});
test('successful transfer preserves exclusive destination and releases timers',async t=>{
  const i=await input(t);await writeFile(i.destination,'prior');let signal;await assert.rejects(receiveRegistryTarball({...i,fetchImpl:async(_u,o)=>{signal=o.signal;return new Response(bytes);}}),{code:'EEXIST'});await pause(110);assert.equal(signal.aborted,false);assert.equal(await readFile(i.destination,'utf8'),'prior');
});

// Exercise the original HTTPS entrance through its existing global-agent port.
// This is an in-process transport fixture, not a production replacement agent.
async function withAgent(t,scenario){const prior=https.globalAgent,agent=new https.Agent();https.globalAgent=agent;t.after(()=>{https.globalAgent=prior;agent.destroy();});agent.addRequest=(request,options)=>scenario(request,options);}
function response(request,status=200){const stream=new PassThrough();stream.statusCode=status;stream.complete=false;request.emit('response',stream);return stream;}
test('HTTPS passes default5000 and explicit CONNECT timeout before agent admission',async t=>{
  let observed=[];await withAgent(t,(req,options)=>{observed.push({timeout:req.timeout,option:options.timeout,agent:req.agent});queueMicrotask(()=>{const r=response(req);r.complete=true;r.end(bytes);});});
  for(const selected of [undefined,30000]){const i=await input(t);delete i.timeoutMs;delete i.inactivityTimeoutMs;if(selected)i.inactivityTimeoutMs=selected;await receiveRegistryTarball(i);assert.deepEqual(await readFile(i.destination),bytes);}
  assert.deepEqual(observed.map(v=>[v.timeout,v.option]),[[5000,5000],[30000,30000]]);assert.ok(observed.every(v=>v.agent===https.globalAgent));
});
test('HTTPS no-response connection is destroyed on absolute deadline',async t=>{
  let req;await withAgent(t,r=>{req=r;});const i=await input(t);await assert.rejects(receiveRegistryTarball({...i,timeoutMs:20,inactivityTimeoutMs:100}),timeout('total'));assert.equal(req.destroyed,true);await absent(i);
});
test('HTTPS idle body is destroyed and produces no destination',async t=>{
  let req,res;await withAgent(t,r=>{req=r;queueMicrotask(()=>{res=response(r);res.write(bytes);});});const i=await input(t);await assert.rejects(receiveRegistryTarball({...i,inactivityTimeoutMs:20}),timeout('inactivity'));assert.equal(req.destroyed,true);assert.equal(res.destroyed,true);await absent(i);
});
test('HTTPS premature close and HTTP failure terminate immediately',async t=>{
  let status=200,res;await withAgent(t,r=>queueMicrotask(()=>{res=response(r,status);if(status===200)res.destroy();}));
  for(status of [200,403]){const i=await input(t);await assert.rejects(receiveRegistryTarball(i),status===200?/closed before completion/:/HTTP 403/);assert.equal(res.destroyed,true);await absent(i);}
});
test('HTTPS caller cancellation destroys request',async t=>{
  let req;await withAgent(t,r=>{req=r;});const i=await input(t),controller=new AbortController();const task=receiveRegistryTarball({...i,signal:controller.signal});controller.abort();await assert.rejects(task,{code:'ABORT_ERR'});assert.equal(req.destroyed,true);await absent(i);
});
test('HTTPS delayed headers and chunks complete within extended lifetime',async t=>{
  await withAgent(t,req=>{setTimeout(()=>{const r=response(req);r.write(bytes.subarray(0,4));setTimeout(()=>{r.complete=true;r.end(bytes.subarray(4));},15);},15);});const i=await input(t);await receiveRegistryTarball(i);assert.deepEqual(await readFile(i.destination),bytes);
});
test('HTTPS continuous chunking cannot escape total lifetime',async t=>{
  let interval,res;await withAgent(t,req=>queueMicrotask(()=>{res=response(req);interval=setInterval(()=>res.write('x'),5);res.on('close',()=>clearInterval(interval));}));t.after(()=>clearInterval(interval));const i=await input(t);await assert.rejects(receiveRegistryTarball({...i,timeoutMs:50,inactivityTimeoutMs:30}),timeout('total'));assert.equal(res.destroyed,true);await absent(i);
});
test('size overflow cancels even when cancel promise never settles',async t=>{
  const i=await input(t);let canceled=false;const body=new ReadableStream({pull(c){c.enqueue(new Uint8Array(1024*1024));},cancel(){canceled=true;return new Promise(()=>{});}});await assert.rejects(receiveRegistryTarball({...i,timeoutMs:2000,inactivityTimeoutMs:1000,fetchImpl:async()=>new Response(body)}),/64 MiB/);assert.equal(canceled,true);assert.equal(body.locked,false);await absent(i);
});
