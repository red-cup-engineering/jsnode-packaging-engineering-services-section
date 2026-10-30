import test from 'node:test';
import assert from 'node:assert/strict';
import https from 'node:https';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {createServer,connect} from 'node:net';
import {createHash} from 'node:crypto';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';import {tmpdir} from 'node:os';
import {receiveRegistryTarball,receiveRegistryTransferSettlement} from '../src/registry.mjs';
const bytes=Buffer.from('fixture'),registry='https://registry.example/',tarball=registry+'archive.tgz';
const integrity='sha512-'+createHash('sha512').update(bytes).digest('base64');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function input(t){const root=await mkdtemp(join(tmpdir(),'transport-receiving-'));t.after(()=>rm(root,{recursive:true,force:true}));return {registry,tarball,integrity,destination:join(root,'artifact.tgz'),timeoutMs:100,inactivityTimeoutMs:15};}
async function failed(promise){let result,caught=false;try{await promise;}catch(error){result=error;caught=true;}assert.equal(caught,true,'expected original transfer failure');return result;}
async function absent(i){await assert.rejects(readFile(i.destination),{code:'ENOENT'});}
function agent(t,scenario){const prior=https.globalAgent,current=new https.Agent();https.globalAgent=current;t.after(()=>{https.globalAgent=prior;current.destroy();});current.addRequest=(request,options)=>scenario(request,options);}
function localSocket(){const socket=new EventEmitter();socket.setTimeout=()=>socket;socket.connecting=false;return socket;}
function tracked(t,{response=false}={}){let request,res;const socket=localSocket();agent(t,req=>{request=req;queueMicrotask(()=>{req.emit('socket',socket);if(response){res=new PassThrough();res.statusCode=200;res.complete=false;req.emit('response',res);res.write(bytes);}});});return {socket,get request(){return request;},get response(){return res;}};}

test('native resource close observations remain receivable after the original error',async t=>{
 const i=await input(t),fixture=tracked(t),error=await failed(receiveRegistryTarball(i));
 assert.equal(error.code,'ERR_REGISTRY_TRANSFER_TIMEOUT');assert.equal(error.transportCleanup,'requested-unconfirmed');
 let receipt=await receiveRegistryTransferSettlement(error,{timeoutMs:0});assert.equal(receipt.state,'unknown');
 fixture.request.emit('close');fixture.socket.emit('close');
 receipt=await receiveRegistryTransferSettlement(error,{timeoutMs:0});assert.equal(receipt.state,'observed-local-resources-closed');
 assert.deepEqual(receipt.occurrence,{id:receipt.occurrence.id,registry,tarball,integrity});assert.equal(receipt.remoteSettlement,false);assert.equal(receipt.replayAuthority,false);
 assert.deepEqual(await receiveRegistryTransferSettlement(error),receipt);await absent(i);
});

test('request and response close alone do not imply assigned socket close',async t=>{
 const i=await input(t),fixture=tracked(t,{response:true}),error=await failed(receiveRegistryTarball(i));
 fixture.request.emit('close');fixture.response.emit('close');
 const before=await receiveRegistryTransferSettlement(error,{timeoutMs:5});assert.equal(before.state,'unknown');
 assert.equal(before.resources.find(x=>x.kind==='socket').closeObserved,false);
 fixture.socket.emit('close');assert.equal((await receiveRegistryTransferSettlement(error)).state,'observed-local-resources-closed');await absent(i);
});

test('bounded duplicate readers independently receive delayed local close',async t=>{
 const i=await input(t),fixture=tracked(t),error=await failed(receiveRegistryTarball(i));
 const short=receiveRegistryTransferSettlement(error,{timeoutMs:1}),long=receiveRegistryTransferSettlement(error,{timeoutMs:100});
 assert.equal((await short).state,'unknown');fixture.request.emit('close');fixture.socket.emit('close');
 assert.equal((await long).state,'observed-local-resources-closed');await absent(i);
});

test('late socket and response assignments after failure are counted rather than ignored',async t=>{
 let req;agent(t,r=>{req=r;});const i=await input(t),error=await failed(receiveRegistryTarball(i));
 req.emit('close');assert.equal((await receiveRegistryTransferSettlement(error,{timeoutMs:0})).state,'unknown');
 const socket=localSocket(),response=new PassThrough();response.statusCode=200;response.complete=false;
 req.emit('socket',socket);req.emit('response',response);
 await pause(0);let receipt=await receiveRegistryTransferSettlement(error,{timeoutMs:0});assert.equal(receipt.resources.length,3);assert.equal(receipt.state,'unknown');
 socket.emit('close');response.emit('close');assert.equal((await receiveRegistryTransferSettlement(error,{timeoutMs:0})).state,'observed-local-resources-closed');await absent(i);
});

test('a later extra assigned socket invalidates a prior snapshot without rewriting it',async t=>{
 const i=await input(t),fixture=tracked(t),error=await failed(receiveRegistryTarball(i));fixture.request.emit('close');fixture.socket.emit('close');
 const first=await receiveRegistryTransferSettlement(error,{timeoutMs:0});assert.equal(first.state,'observed-local-resources-closed');
 const other=localSocket();fixture.request.emit('socket',other);const next=await receiveRegistryTransferSettlement(error,{timeoutMs:0});
 assert.equal(first.resources.length,2);assert.equal(next.resources.length,3);assert.equal(next.state,'unknown');other.emit('close');await absent(i);
});

test('missing socket and throwing configured agent remain unknown',async t=>{
 const i=await input(t),expected=new Error('agent fixture');agent(t,()=>{throw expected;});
 const error=await failed(receiveRegistryTarball(i));assert.equal(error,expected);
 assert.equal((await receiveRegistryTransferSettlement(error,{timeoutMs:1})).state,'unknown');await absent(i);
});

test('pre-aborted input is distinguished as no invocation',async t=>{
 const i=await input(t),controller=new AbortController();controller.abort('fixture');let calls=0;agent(t,()=>{calls++;});
 const error=await failed(receiveRegistryTarball({...i,signal:controller.signal}));
 const receipt=await receiveRegistryTransferSettlement(error,{timeoutMs:0});assert.equal(receipt.state,'not-invoked');assert.deepEqual(receipt.resources,[]);assert.equal(calls,0);await absent(i);
});

test('opaque fetch cancellation remains unknown even when its cancellation promise resolves',async t=>{
 const i=await input(t);let canceled=0;const body=new ReadableStream({pull(){return new Promise(()=>{});},cancel(){canceled++;}});
 const error=await failed(receiveRegistryTarball({...i,fetchImpl:async()=>new Response(body)}));
 const receipt=await receiveRegistryTransferSettlement(error,{timeoutMs:100});assert.equal(receipt.state,'unknown');assert.equal(receipt.transport,'opaque-fetch-port');assert.equal(canceled,1);await absent(i);
});

test('copied, serialized and later product errors cannot name a transfer occurrence',async t=>{
 const i=await input(t),fixture=tracked(t),error=await failed(receiveRegistryTarball(i));
 for(const copied of [new Error(error.message),{...error},JSON.parse(JSON.stringify(error)),null,'failure'])await assert.rejects(receiveRegistryTransferSettlement(copied,{timeoutMs:0}),/original live/);
 error.transportCleanup='pretend-closed';error.occurrence={id:'forged'};
 const receipt=await receiveRegistryTransferSettlement(error,{timeoutMs:0});assert.notEqual(receipt.occurrence.id,'forged');assert.equal(receipt.state,'unknown');
 fixture.request.emit('close');fixture.socket.emit('close');
 const wrong=await failed(receiveRegistryTarball({...i,integrity:'sha512-'+Buffer.alloc(64).toString('base64'),fetchImpl:async()=>new Response(bytes)}));
 await assert.rejects(receiveRegistryTransferSettlement(wrong),/original live/);await absent(i);
});

test('primitive port rejection is preserved without fabricating a receiving capability',async t=>{
 const i=await input(t),error=await failed(receiveRegistryTarball({...i,fetchImpl:async()=>{throw 'fixture-primitive';}}));assert.equal(error,'fixture-primitive');
 await assert.rejects(receiveRegistryTransferSettlement(error),/original live/);await absent(i);
});

test('one reused error object cannot ambiguously name multiple occurrences',async t=>{
 const i=await input(t),error=new Error('same fixture failure');
 for(let n=0;n<2;n++)assert.equal(await failed(receiveRegistryTarball({...i,fetchImpl:async()=>{throw error;}})),error);
 await assert.rejects(receiveRegistryTransferSettlement(error),/one original/);await absent(i);
});

test('receiving options are strict and do not evaluate timeout getters',async t=>{
 const i=await input(t),controller=new AbortController();controller.abort();const error=await failed(receiveRegistryTarball({...i,signal:controller.signal}));let getter=0;
 for(const options of [null,[],{timeoutMs:-1},{timeoutMs:5001},{timeoutMs:NaN},{timeoutMs:1.5},{timeoutMs:'1'},{other:1},{get timeoutMs(){getter++;return 1;}}])await assert.rejects(receiveRegistryTransferSettlement(error,options),TypeError);
 assert.equal(getter,0);assert.equal((await receiveRegistryTransferSettlement(error,{timeoutMs:5000})).state,'not-invoked');
});

test('real private loopback socket closure is observed separately from request failure',async t=>{
 const sockets=new Set(),server=createServer(socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));socket.on('data',()=>{});});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>{for(const s of sockets)s.destroy();server.close();});
 // Existing global-agent fixture routes this request to a private raw socket;
 // this qualifies actual local close events, not TLS/proxy/remote settlement.
 agent(t,req=>req.onSocket(connect({port:server.address().port,host:'127.0.0.1'})));
 const i=await input(t),error=await failed(receiveRegistryTarball(i));const result=await receiveRegistryTransferSettlement(error,{timeoutMs:100});
 assert.equal(result.state,'observed-local-resources-closed');assert.equal(result.remoteSettlement,false);await absent(i);
});

test('an error reused while a reader waits cannot change the selected occurrence silently',async t=>{
 const i=await input(t),fixture=tracked(t),error=await failed(receiveRegistryTarball(i));
 const receiving=receiveRegistryTransferSettlement(error,{timeoutMs:20});
 assert.equal(await failed(receiveRegistryTarball({...i,fetchImpl:async()=>{throw error;}})),error);
 fixture.request.emit('close');fixture.socket.emit('close');await assert.rejects(receiving,/one original/);await absent(i);
});

test('resource enrollment overflow is bounded and permanently unknown',async t=>{
 const i=await input(t),fixture=tracked(t),error=await failed(receiveRegistryTarball(i));
 fixture.request.emit('close');fixture.socket.emit('close');
 for(let n=0;n<100;n++){const socket=localSocket();fixture.request.emit('socket',socket);socket.emit('close');}
 const receipt=await receiveRegistryTransferSettlement(error,{timeoutMs:0});assert.equal(receipt.state,'unknown');assert.equal(receipt.resourceOverflow,true);assert.equal(receipt.resources.length,64);await absent(i);
});
