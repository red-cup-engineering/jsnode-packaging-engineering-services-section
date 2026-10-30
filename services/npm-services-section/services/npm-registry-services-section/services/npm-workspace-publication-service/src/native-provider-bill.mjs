import {createHash} from 'node:crypto';
import {isExactSemver} from './dependency-policy.mjs';
const fail=m=>{throw new TypeError('native provider bill: '+m);};
function record(value,keys){
 if(value===null||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))fail('plain Data record required');
 const descriptors=Object.getOwnPropertyDescriptors(value),actual=Reflect.ownKeys(descriptors);
 if(actual.some(k=>typeof k!=='string')||actual.length!==keys.length||keys.some(k=>!Object.hasOwn(descriptors,k)))fail('closed record fields required');
 const out={};
 for(const key of keys){const d=descriptors[key];if(!Object.hasOwn(d,'value')||!d.enumerable)fail('Data fields must be ordinary values');out[key]=d.value;}
 return out;
}
const field=(v,pattern,label)=>{if(typeof v!=='string'||v.match(pattern)?.[0]!==v)fail('invalid '+label);return v;};
const name=v=>{if(typeof v!=='string'||v.length>214)fail('invalid npm name');return field(v,/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/u,'npm name');};
const version=v=>{if(typeof v!=='string'||!isExactSemver(v))fail('exact version required');return v;};
const hex=(v,n)=>field(v,new RegExp('^[a-f0-9]{'+n+'}$'),'source digest');
function directory(v){
 if(typeof v!=='string')fail('canonical immutable store directory required');
 const pattern=/^[/]gnu[/]store[/][0123456789abcdfghijklmnpqrsvwxyz]{32}-[A-Za-z0-9+._?=-]+(?:[/][^/\\\u0000-\u001f\u007f]+)*$/u;
 if(v.match(pattern)?.[0]!==v||v.split('/').slice(1).some(p=>!p||p==='.'||p==='..')||v.endsWith('/'))fail('canonical immutable store directory required');
 return v;
}
function source(value){
 const own=Object.getOwnPropertyDescriptor(value??{},'kind');
 if(!own||!Object.hasOwn(own,'value'))fail('source kind required');
 if(own.value==='registry-archive'){
  const r=record(value,['kind','name','version','gitHead','integrity']);
  name(r.name);version(r.version);hex(r.gitHead,40);
  if(typeof r.integrity!=='string'||!r.integrity.startsWith('sha512-'))fail('SHA512 SRI required');
  const literal=r.integrity.slice(7),bytes=Buffer.from(literal,'base64');
  if(bytes.length!==64||bytes.toString('base64')!==literal)fail('canonical SHA512 SRI required');
  return r;
 }
 if(own.value==='git-source-snapshot'){
  const r=record(value,['kind','repository','commit','tree','contentSHA256','name','version']);
  field(r.repository,/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u,'repository');if(r.repository.split('/').some(p=>p==='.'||p==='..'))fail('canonical repository required');hex(r.commit,40);hex(r.tree,40);hex(r.contentSHA256,64);name(r.name);version(r.version);return r;
 }
 fail('unknown source kind');
}
function freeze(value){if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;}
function denseDataArray(value,label){
 if(!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype)fail('plain '+label+' array required');
 const ds=Object.getOwnPropertyDescriptors(value),length=ds.length.value;
 if(Reflect.ownKeys(ds).length!==length+1)fail('dense '+label+' array required');
 return Array.from({length},(_,i)=>{const d=ds[i];if(!d||!Object.hasOwn(d,'value')||!d.enumerable)fail(label+' must be ordinary Data');return d.value;});
}
export function normalizeNativeRetainedContextEdges(value=[]){
 const seen=new Set();
 return freeze(denseDataArray(value,'retained context edges').map(value=>{
  const e=record(value,['parentDirectory','parentName','parentVersion','parentManifestSHA256','field','name','declared','directory','version','manifestSHA256']);
  directory(e.parentDirectory);name(e.parentName);version(e.parentVersion);hex(e.parentManifestSHA256,64);
  if(!['dependencies','optionalDependencies','peerDependencies'].includes(e.field))fail('native declaration role required');
  name(e.name);field(e.declared,/^[^\u0000-\u001f\u007f]+$/u,'authored declaration');
  directory(e.directory);version(e.version);hex(e.manifestSHA256,64);
  const key=JSON.stringify([e.parentDirectory,e.field,e.name]);if(seen.has(key))fail('duplicate retained context edge');seen.add(key);
  return e;
 }).sort((a,b)=>{const x=JSON.stringify([a.parentDirectory,a.field,a.name]),y=JSON.stringify([b.parentDirectory,b.field,b.name]);return x<y?-1:x>y?1:0;}));
}
export function normalizeNativeProviderBill(value){
 const r=record(value,Object.hasOwn(value??{},'retainedContextEdges')?['kind','sourceIdentity','bindings','retainedContextEdges']:['kind','sourceIdentity','bindings']);
 if(r.kind!=='npm.native-provider-bill/v1'||!Array.isArray(r.bindings))fail('typed native provider bill required');
 const sourceIdentity=source(r.sourceIdentity),seen=new Set();
 const descriptors=Object.getOwnPropertyDescriptors(r.bindings),length=descriptors.length.value;
 if(Object.getPrototypeOf(r.bindings)!==Array.prototype||Reflect.ownKeys(descriptors).length!==length+1)fail('dense plain binding array required');
 const values=[];
 for(let i=0;i<length;i++){const d=descriptors[i];if(!d||!Object.hasOwn(d,'value')||!d.enumerable)fail('binding array values must be ordinary Data');values.push(d.value);}
 const bindings=values.map(value=>{
  const own=Object.getOwnPropertyDescriptor(value??{},'absent');
  const absent=own&&Object.hasOwn(own,'value')&&own.value===true;
  const hasContext=Object.hasOwn(value??{},'contextRoot');
  const b=record(value,absent?['name','absent']:['name','version','directory','manifestSHA256',...(hasContext?['contextRoot']:[])]);
  name(b.name);if(seen.has(b.name))fail('duplicate provider name');seen.add(b.name);
  if(!absent){version(b.version);directory(b.directory);hex(b.manifestSHA256,64);if(hasContext){directory(b.contextRoot);if(b.contextRoot.split('/').length!==4)fail('direct immutable context root required');}}
  return b;
 }).sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0);
 const retainedContextEdges=normalizeNativeRetainedContextEdges(r.retainedContextEdges);
 return freeze({kind:r.kind,sourceIdentity,bindings,...(retainedContextEdges.length?{retainedContextEdges}:{})});
}
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
/** A pure selection digest. It grants no store, source or execution authority. */
export function nativeProviderBillIdentity(value){return createHash('sha256').update(JSON.stringify(canonical(normalizeNativeProviderBill(value)))).digest('hex');}
export function requireNativeProviderBillIdentity(value,expectedSHA256){
 hex(expectedSHA256,64);const normalized=normalizeNativeProviderBill(value);
 if(nativeProviderBillIdentity(normalized)!==expectedSHA256)fail('selected bill identity changed');
 return normalized;
}

export function assertNativeProviderBillIdentity(value,expectedSHA256){requireNativeProviderBillIdentity(value,expectedSHA256);return nativeProviderBillIdentity(value);}
