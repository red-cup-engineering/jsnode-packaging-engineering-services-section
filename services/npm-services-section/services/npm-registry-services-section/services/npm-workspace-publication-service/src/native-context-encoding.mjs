import { gzipSync, gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';

import { types } from 'node:util';

// Ordinary JSON Data only: inspecting descriptors never executes getters/toJSON.
function dataDescriptors(value,array=false){
 if(value===null||typeof value!=='object'||types.isProxy(value))throw new TypeError('plain context Data required');
 const prototype=Object.getPrototypeOf(value);
 if(array?prototype!==Array.prototype:![Object.prototype,null].includes(prototype))throw new TypeError('plain context Data required');
 const descriptors=Object.getOwnPropertyDescriptors(value);
 for(const key of Reflect.ownKeys(descriptors)){
  if(typeof key!=='string')throw new TypeError('context symbols are not JSON Data');
  const d=descriptors[key];
  if(!Object.hasOwn(d,'value')||(!d.enumerable&&!(array&&key==='length')))throw new TypeError('context fields must be ordinary enumerable Data');
 }
 return descriptors;
}
const canonicalize=(value,seen=new WeakSet())=>{
 if(value===null||typeof value==='string'||typeof value==='boolean')return JSON.stringify(value);
 if(typeof value==='number'){if(!Number.isFinite(value)||Object.is(value,-0))throw new TypeError('canonical finite context number required');return JSON.stringify(value);}
 if(typeof value!=='object')throw new TypeError('context value is not JSON Data');
 if(seen.has(value))throw new TypeError('context Data cycle');seen.add(value);
 try{
  const array=Array.isArray(value),d=dataDescriptors(value,array);
  if(array){
   const length=d.length.value;if(Reflect.ownKeys(d).length!==length+1)throw new TypeError('dense context array required');
   const values=[];for(let i=0;i<length;i++){if(!Object.hasOwn(d,String(i)))throw new TypeError('dense context array required');values.push(canonicalize(d[i].value,seen));}
   return '['+values.join(',')+']';
  }
  return '{'+Object.keys(d).sort().map(k=>JSON.stringify(k)+':'+canonicalize(d[k].value,seen)).join(',')+'}';
 }finally{seen.delete(value);}
};

export const encodeNativeContextGraph = (input) => {
  if (typeof input !== 'object' || input === null) throw new TypeError('context graph Data required');
  const json = canonicalize(input);
  const buf = Buffer.from(json, 'utf8');
  const sha256 = createHash('sha256').update(buf).digest('hex');
  const compressed = gzipSync(buf, { mtime: 0 });
  return Object.freeze({ kind: "npm.native-context-graph.gzip/v1", sha256, bytes: buf.length, data: compressed.toString('base64') });
};

/** Decode only privately received immutable metadata; the codec grants no store authority. */
export const decodeNativeContextGraph = (record) => {
  const d=dataDescriptors(record);
  const keys=['kind','sha256','bytes','data'];
  if(Object.keys(d).length!==keys.length||keys.some(k=>!Object.hasOwn(d,k)))throw new TypeError('closed context encoding required');
  const {kind,sha256,bytes,data}=Object.fromEntries(keys.map(k=>[k,d[k].value]));
  if(kind!=='npm.native-context-graph.gzip/v1'||typeof sha256!=='string'||sha256.length!==64||!/^[a-f0-9]+$/u.test(sha256)||!Number.isSafeInteger(bytes)||bytes<=0||typeof data!=='string')throw new TypeError('invalid context encoding schema');
  const raw = Buffer.from(data, 'base64');
  if (raw.toString('base64') !== data) throw new Error('Invalid base64');
  const buf = gunzipSync(raw, { maxOutputLength: bytes });
  if (buf.length !== bytes || createHash('sha256').update(buf).digest('hex') !== sha256) throw new Error('Integrity mismatch');
  if (!gzipSync(buf, { mtime: 0 }).equals(raw)) throw new Error('Non-canonical gzip');
  const text=new TextDecoder('utf-8',{fatal:true}).decode(buf);
  if(!Buffer.from(text,'utf8').equals(buf))throw new TypeError('noncanonical context UTF8 bytes');
  const value=JSON.parse(text);
  if(canonicalize(value)!==text)throw new TypeError('noncanonical context JSON');
  return value;
};