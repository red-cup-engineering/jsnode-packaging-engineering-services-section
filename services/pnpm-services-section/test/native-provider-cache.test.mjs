import assert from 'node:assert/strict';
import test from 'node:test';
import {setImmediate as turn} from 'node:timers/promises';
import {createNativeMetadataCacheGroup,patchNativeDistribution} from '../src/native-provider-patch.mjs';

test('all maps share a byte budget and eviction releases the owning index',()=>{
  const events=[],group=createNativeMetadataCacheGroup(300,0,'fixture',{report:value=>events.push(value)}),a=group.createMap(),b=group.createMap();
  a.set('first','a'.repeat(100));b.set('second','b'.repeat(100));
  assert.equal(a.get('first'),undefined);assert.equal(a.size,0);assert.equal(b.get('second'),'b'.repeat(100));
  assert.ok(events.every(e=>e.retainedBytes<=e.byteLimit));assert.equal(group.stats().evictions,1);
  b.clear();assert.equal(group.stats().retainedBytes,0);assert.equal(group.stats().settledEntries,0);
});
test('maps and sets account their contents; oversized values remain unretained',()=>{
  const group=createNativeMetadataCacheGroup(256,0,'fixture',{report:()=>{}}),cache=group.createMap();
  cache.set('map',new Map([['claim','x'.repeat(1024)]]));cache.set('set',new Set(['x'.repeat(1024)]));
  assert.equal(cache.size,0);assert.equal(group.stats().oversizedEntries,2);assert.equal(group.stats().retainedBytes,0);
});
test('the shared cache keeps its original fixed TTL without renewing on read',()=>{
  let now=0;const group=createNativeMetadataCacheGroup(512,120000,'shared',{clock:()=>now,report:()=>{}}),cache=group.createMap();
  cache.set('held',{value:'unchanged'});now=119999;assert.equal(cache.get('held').value,'unchanged');
  now=120000;assert.equal(cache.get('held'),undefined);assert.equal(cache.size,0);assert.equal(group.stats().retainedBytes,0);
});
test('pending promises deduplicate, settle to measured retention and preserve the original result',async()=>{
  const group=createNativeMetadataCacheGroup(1024,0,'fixture',{report:()=>{}}),cache=group.createMap();let resolve;
  const work=new Promise(done=>{resolve=done});cache.set('same',work);
  assert.equal(cache.get('same'),work);assert.equal(group.stats().pendingEntries,1);assert.equal(group.stats().retainedBytes,0);
  const value=new Map([['entry','retained']]);resolve(value);assert.equal(await work,value);await turn();
  assert.equal(cache.get('same'),work);assert.equal(group.stats().pendingEntries,0);assert.ok(group.stats().retainedBytes>64);
  cache.clear();assert.equal(group.stats().retainedBytes,0);
});
test('a rejected promise leaves no cached rejection and a later request stays usable',async()=>{
  const group=createNativeMetadataCacheGroup(1024,0,'fixture',{report:()=>{}}),cache=group.createMap();let reject;
  const work=new Promise((_,fail)=>{reject=fail});cache.set('same',work);reject(new Error('original transport refusal'));
  await assert.rejects(work,/original transport refusal/);await turn();
  assert.equal(cache.get('same'),undefined);assert.equal(group.stats().pendingEntries,0);assert.equal(group.stats().rejectedEntries,1);
  const next=Promise.resolve('received');cache.set('same',next);await next;await turn();assert.equal(await cache.get('same'),'received');
});
test('clearing or replacing pending work cannot resurrect its settled payload',async()=>{
  const group=createNativeMetadataCacheGroup(1024,0,'fixture',{report:()=>{}}),cache=group.createMap();let resolve;
  const work=new Promise(done=>{resolve=done});cache.set('old',work);cache.clear();cache.set('old','new');
  resolve('discarded');await work;await turn();assert.equal(cache.get('old'),'new');assert.equal(group.stats().pendingEntries,0);
});
test('oversized promise results are still returned but never retained',async()=>{
  const group=createNativeMetadataCacheGroup(256,0,'fixture',{report:()=>{}}),cache=group.createMap(),value='x'.repeat(2048),work=Promise.resolve(value);
  cache.set('large',work);assert.equal(await work,value);await turn();
  assert.equal(cache.get('large'),undefined);assert.equal(group.stats().pendingEntries,0);assert.equal(group.stats().oversizedEntries,1);
});
test('unrelated input cannot be transformed into a native supplier',()=>{
  assert.throws(()=>patchNativeDistribution(Buffer.from('not the received upstream distribution')),/exact original PNPM/);
});
