import {createHash} from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert';
import { gzipSync } from 'node:zlib';
import { encodeNativeContextGraph, decodeNativeContextGraph } from '../src/native-context-encoding.mjs';

test('roundtrip and determinism', () => {
  const obj = { b: 2, a: [1, { d: 4, c: 3 }] };
  const enc1 = encodeNativeContextGraph(obj);
  const enc2 = encodeNativeContextGraph({ a: [1, { c: 3, d: 4 }], b: 2 });
  assert.strictEqual(enc1.sha256, enc2.sha256);
  assert.strictEqual(enc1.data, enc2.data);
  assert.deepStrictEqual(decodeNativeContextGraph(enc1), obj);
});

test('canonical base64 rejects whitespace', () => {
  const r = encodeNativeContextGraph({ a: 1 });
  assert.throws(() => decodeNativeContextGraph({ ...r, data: ' \n' + r.data }));
});

test('decoder must not invoke getter', () => {
  const r = encodeNativeContextGraph({ a: 1 });
  const bad = { ...r };
  Object.defineProperty(bad, 'kind', { enumerable: true, get() { return r.kind; } });
  assert.throws(() => decodeNativeContextGraph(bad));
});

test('encoder must not invoke getters or toJSON', () => {
  const x = {};
  Object.defineProperty(x, 'a', { enumerable: true, get() { return 1; } });
  assert.throws(() => encodeNativeContextGraph(x));
  assert.throws(() => encodeNativeContextGraph({ toJSON() { throw Error('invoked'); } }));
});

test('appended empty gzip member is not this deterministic Code encoding', () => {
  const r = encodeNativeContextGraph({ a: 1 });
  const data = Buffer.concat([Buffer.from(r.data, 'base64'), gzipSync(Buffer.alloc(0))]).toString('base64');
  assert.throws(() => decodeNativeContextGraph({ ...r, data }));
});
test('strict descriptor/UTF8/schema receiving does not execute user behavior',()=>{
 let invoked=0;const value={};Object.defineProperty(value,'x',{enumerable:true,get(){invoked++;return 1;}});
 assert.throws(()=>encodeNativeContextGraph(value));assert.equal(invoked,0);
 const encoded=encodeNativeContextGraph({a:[1,{b:'x'}]});const object={...encoded};
 Object.defineProperty(object,'kind',{enumerable:true,get(){invoked++;return encoded.kind;}});
 assert.throws(()=>decodeNativeContextGraph(object));assert.equal(invoked,0);
 assert.throws(()=>encodeNativeContextGraph({toJSON(){invoked++;return {};}}));assert.equal(invoked,0);
 for(const record of[{...encoded,bytes:0},{...encoded,bytes:encoded.bytes+1},{...encoded,bytes:1.5},{...encoded,sha256:'0'.repeat(64)},{...encoded,extra:true}])assert.throws(()=>decodeNativeContextGraph(record));
 const cyclic={};cyclic.self=cyclic;assert.throws(()=>encodeNativeContextGraph(cyclic));
 const sparse=[];sparse.length=2;assert.throws(()=>encodeNativeContextGraph(sparse));
});
test('canonical UTF8 rejects BOM and invalid bytes, preserving all valid context facts',()=>{
 for(const bytes of[Buffer.concat([Buffer.from([0xef,0xbb,0xbf]),Buffer.from('{"a":1}')]),Buffer.from([0xff])]){
  const r={kind:'npm.native-context-graph.gzip/v1',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),data:gzipSync(bytes,{mtime:0}).toString('base64')};
  assert.throws(()=>decodeNativeContextGraph(r));
 }
 const value={contexts:[{directory:'/gnu/store/'+ '0'.repeat(32)+'-scope/node_modules/@fixture/pkg',edges:[{name:'peer',declared:'0.1.1',version:'0.1.3',absent:false}]}]};
 assert.deepStrictEqual(decodeNativeContextGraph(encodeNativeContextGraph(value)),value);
});
