import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { unlink, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fixture } from './native-metadata-session-fixture.mjs';
const enabled=Boolean(process.env.QUALIFIED_PNPM_ENTRY&&process.env.QUALIFIED_ASYNC_EXECUTOR);

for(const scenario of ['producer-reader','offline-missing-after-issuance','missing-time-default','http-error','request-timeout','caller-unknown'])test(`original async executor and PNPM metadata tickets: ${scenario}`,{skip:!enabled,timeout:200000},async t=>{
 let offline=false;const requests=[],sockets=new Set();
 const server=createServer((request,response)=>{
  requests.push({method:request.method,path:request.url,offline});
  if(offline||request.url!=='/ticket-fixture'){response.writeHead(500).end();return;}
  if(scenario==='http-error'){response.writeHead(500).end('synthetic error');return;}
  if(scenario==='request-timeout')return;
  const version=v=>({name:'ticket-fixture',version:v,dist:{integrity:'sha512-'+Buffer.alloc(64,1).toString('base64'),tarball:`http://127.0.0.1:${server.address().port}/unused.tgz`}});
  response.setHeader('content-type','application/json');response.end(JSON.stringify({name:'ticket-fixture','dist-tags':{latest:'2.0.0'},versions:{'1.0.0':version('1.0.0'),'2.0.0':version('2.0.0')},...(scenario==='missing-time-default'?{}:{time:{modified:'2020-01-01T00:00:00.000Z','1.0.0':'2020-01-01T00:00:00.000Z','2.0.0':'2020-01-01T00:00:00.000Z'}})}));
 });
 server.on('connection',socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(async()=>{for(const socket of sockets)socket.destroy();await new Promise(resolve=>server.close(resolve));});
 const registry=`http://127.0.0.1:${server.address().port}/`,f=await fixture(t,registry);
 const {executeJavascriptNodeCommandAsynchronously:execute}=await import(pathToFileURL(process.env.QUALIFIED_ASYNC_EXECUTOR));
 const prepared=await f.service.prepare(f.input);
 const launch=await f.service.revalidate(prepared.ticket,{phase:'producer',environment:f.input.environment});
 const native=await execute(launch.request,launch.policy);
 await writeFile(join(f.root,'original-producer-execution.json'),JSON.stringify(native,null,2)+'\n');
 if(scenario==='caller-unknown'){
  const unknown=await f.service.receive(prepared.ticket,{phase:'producer',uncertain:true});
  assert.equal(unknown.state,'unknown');assert.equal(unknown.accepted,false);
  await assert.rejects(f.service.revalidate(prepared.ticket,{phase:'reader',environment:f.input.environment}),/transition/);
  await writeFile(join(f.root,'native-session-result.json'),JSON.stringify({scenario,requests,unknown,originalExecutor:true},null,2)+'\n');return;
 }
 const producer=await f.service.receive(prepared.ticket,{phase:'producer',executionReceipt:native});
 if(['http-error','request-timeout'].includes(scenario)){
  assert.equal(producer.accepted,false);assert.equal(producer.state,'failed');assert.equal(requests.length,1);
  assert.ok(requests.every(r=>r.path==='/ticket-fixture'&&!r.offline));
  assert.match(native.result.stdout+native.result.stderr,scenario==='http-error'?/500|META_FETCH_FAIL/u:/TIMEOUT|timeout|META_FETCH_FAIL/iu);
  await assert.rejects(f.service.revalidate(prepared.ticket,{phase:'reader',environment:f.input.environment}),/transition/);
  await writeFile(join(f.root,'native-session-result.json'),JSON.stringify({scenario,requests,producer,originalExecutor:true},null,2)+'\n');return;
 }
 assert.equal(producer.accepted,true);assert.equal(producer.state,'producer-received');
 assert.ok(requests.length>0);assert.ok(requests.every(r=>r.path==='/ticket-fixture'&&!r.offline));
 offline=true;
 const readerLaunch=await f.service.revalidate(prepared.ticket,{phase:'reader',environment:f.input.environment});
 if(scenario==='offline-missing-after-issuance')await unlink(prepared.projection.expectedMirrorPath);
 const readerNative=await execute(readerLaunch.request,readerLaunch.policy);
 const reader=await f.service.receive(prepared.ticket,{phase:'reader',executionReceipt:readerNative});
 assert.ok(requests.every(r=>!r.offline),'offline reader must not request loopback');
 assert.equal(reader.accepted,scenario!=='offline-missing-after-issuance');
 if(scenario==='missing-time-default'){assert.equal(producer.mirror.rawCoverage.complete,false);assert.match(native.result.stderr,/time|publish|release/iu);}
 if(reader.accepted){assert.equal(reader.state,'complete');assert.equal(reader.mirror.sha256,producer.mirror.sha256);}
 else {assert.equal(reader.state,'failed');assert.match(readerNative.result.stdout+readerNative.result.stderr,/NO_OFFLINE_META|offline/iu);}
 const receipt={scenario,requests,producer,reader,originalExecutor:true,strictPolicyVerified:false,installationReceived:false};
 await writeFile(join(f.root,'native-session-result.json'),JSON.stringify(receipt,null,2)+'\n');
 assert.equal(JSON.parse(await readFile(reader.receipt.path,'utf8')).state,reader.state);
});
