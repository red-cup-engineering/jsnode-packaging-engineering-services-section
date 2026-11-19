// Pure diagnostic comparison. No YAML parser, native operation, filesystem or
// source/artifact/policy authority is supplied by this module.
import {isDeepStrictEqual} from 'node:util';
import semver from 'semver';

const own=(v,k)=>Object.hasOwn(v,k);
const record=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
const namePattern=/^(?:@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*|[a-z0-9][a-z0-9._-]*)$/u;
const versionPattern=/^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u;
const contractFields=['dependencies','devDependencies','optionalDependencies','peerDependencies','peerDependenciesMeta',
  'dependenciesMeta','exports','imports','engines','devEngines','type','main','module','browser','bin','directories',
  'cpu','os','libc','bundledDependencies','bundleDependencies'];
const dependencyFields=['dependencies','devDependencies','optionalDependencies','peerDependencies'];
class Refusal extends Error {}
const requireScope=(condition,reason)=>{if(!condition)throw new Refusal(reason);};

function finiteClone(input){
 let bytes=0,nodes=0;const ancestors=new Set();
 function visit(value,depth){
  if(++nodes>262144||depth>24)throw new TypeError('finite lock diagnostic tree required');
  if(typeof value==='string'){if(value.length>16384)throw new TypeError('bounded lock diagnostic string required');bytes+=Buffer.byteLength(value)*6+2;}
  else if(value===null||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value))bytes+=32;
  else if(value&&typeof value==='object'){
   const array=Array.isArray(value),prototype=Object.getPrototypeOf(value),keys=Reflect.ownKeys(value);
   if(ancestors.has(value)||!(array?prototype===Array.prototype:[Object.prototype,null].includes(prototype)))throw new TypeError('acyclic own-data lock diagnostic tree required');
   if(keys.length>(array?8193:8192)||array&&(value.length>8192||keys.length!==value.length+1))throw new TypeError('dense bounded lock diagnostic collection required');
   const output=array?[]:Object.create(null);ancestors.add(value);bytes+=2;
   for(const key of keys){
    if(array&&key==='length')continue;
    if(typeof key!=='string'||key.length>16384||array&&(!/^(0|[1-9][0-9]*)$/u.test(key)||Number(key)>=value.length))throw new TypeError('bounded own-data lock diagnostic key required');
    const d=Object.getOwnPropertyDescriptor(value,key);
    if(!d.enumerable||!own(d,'value'))throw new TypeError('own-data lock diagnostic field required');
    bytes+=Buffer.byteLength(key)*6+4;output[key]=visit(d.value,depth+1);
   }
   ancestors.delete(value);if(bytes>33554432)throw new TypeError('lock diagnostic data bound exceeded');return output;
  }else throw new TypeError('finite JSON lock diagnostic value required');
  if(bytes>33554432)throw new TypeError('lock diagnostic data bound exceeded');return value;
 }
 return visit(input,0);
}
function exactKeys(value,keys){
 if(!record(value)||Object.keys(value).length!==keys.length||keys.some(k=>!own(value,k)))throw new TypeError('exact lock diagnostic fields required');
}
function packageSelection(value,name){
 exactKeys(value,['manifest','integrity']);const m=value.manifest;
 requireScope(record(m)&&m.name===name&&typeof m.version==='string'&&m.version.length<=128&&versionPattern.test(m.version)&&semver.valid(m.version)!==null,'exact-selected-package-identity-required');
 const match=typeof value.integrity==='string'&&/^sha512-([A-Za-z0-9+/]+={0,2})$/u.exec(value.integrity);
 requireScope(Boolean(match)&&Buffer.from(match[1],'base64').length===64&&Buffer.from(match[1],'base64').toString('base64')===match[1],'canonical-selected-sha512-required');
 for(const field of ['engines','devEngines'])if(own(m,field))requireScope(record(m[field])&&!own(m[field],'runtime')&&!own(m[field],'packageManager'),'selected-runtime-activation-unsupported');
 for(const field of ['bundledDependencies','bundleDependencies'])if(own(m,field))requireScope(m[field]===false||Array.isArray(m[field])&&m[field].length===0,'selected-bundled-payload-unsupported');
 return m;
}
function emptyMap(m,key){return !own(m,key)||record(m[key])&&Object.keys(m[key]).length===0;}
function additionPackage(m,integrity){
 for(const field of ['dependencies','optionalDependencies','peerDependencies','peerDependenciesMeta','dependenciesMeta'])requireScope(emptyMap(m,field),'addition-runtime-dependencies-or-peers-unsupported');
 const value={resolution:{integrity}};
 if(own(m,'engines')){
  requireScope(Object.values(m.engines).every(v=>typeof v==='string'),'unsupported-selected-engines');
  const engines=Object.fromEntries(Object.entries(m.engines).filter(([,v])=>v!=='*'));if(Object.keys(engines).length)value.engines=engines;
 }
 for(const field of ['cpu','os','libc'])if(own(m,field)){
  requireScope(Array.isArray(m[field])&&m[field].every(v=>typeof v==='string'&&v.length>0),'unsupported-selected-platform');value[field]=m[field];
 }
 if(own(m,'deprecated')){requireScope(typeof m.deprecated==='string','unsupported-selected-deprecation');if(m.deprecated)value.deprecated=m.deprecated;}
 if(own(m,'bin'))requireScope(typeof m.bin==='string'||record(m.bin)&&Object.values(m.bin).every(v=>typeof v==='string'),'unsupported-selected-bin');
 if(own(m,'directories'))requireScope(record(m.directories)&&(!own(m.directories,'bin')||typeof m.directories.bin==='string'),'unsupported-selected-directories');
 const hasBin=own(m,'bin')?(typeof m.bin==='string'?m.bin.length>0:Object.keys(m.bin).length>0):Boolean(m.directories?.bin);
 if(hasBin)value.hasBin=true;
 // Normalize object prototypes consistently with the already-received trees.
 return finiteClone(value);
}
function rootLock(lock){
 requireScope(record(lock)&&['9.0',9].includes(lock.lockfileVersion)&&record(lock.importers)&&record(lock.importers['.']),'root-lockfile-nine-required');
 for(const field of ['packages','snapshots'])requireScope(!own(lock,field)||record(lock[field]),'lock-record-map-required');
 const root=lock.importers['.'];for(const field of dependencyFields)requireScope(!own(root,field)||record(root[field]),'root-lock-dependency-map-required');
 return root;
}
function manifestRoot(m,name){
 requireScope(record(m)&&typeof m.name==='string'&&m.name!==name,'consumer-manifest-required');
 for(const field of dependencyFields){requireScope(!own(m,field)||record(m[field]),'consumer-dependency-map-required');if(field!=='dependencies')requireScope(!own(m[field]??{},name),'selected-root-alias-in-other-category');}
}
function suffixOf(reference,version){
 requireScope(typeof reference==='string'&&(reference===version||reference.startsWith(version+'(')),'selected-reference-is-not-exact');
 const suffix=reference.slice(version.length);let depth=0;
 requireScope(suffix.length<=8192&&/^[()@a-zA-Z0-9._/+\-]*$/u.test(suffix),'unsupported-selected-peer-context');
 for(let i=0;i<suffix.length;i++){
  const c=suffix[i];if(c==='('){requireScope(++depth<=32&&suffix[i+1]!==')','unsupported-selected-peer-context');}
  else if(c===')')requireScope(--depth>=0,'unsupported-selected-peer-context');
  else requireScope(depth>0,'unsupported-selected-peer-context');
 }
 requireScope(depth===0,'unsupported-selected-peer-context');return suffix;
}
const keyFor=(name,version)=>name+'@'+version;
function hasToken(text,token){
 let offset=text.indexOf(token);while(offset>=0){const next=text[offset+token.length];if(next===undefined||!/[0-9A-Za-z.+-]/u.test(next))return true;offset=text.indexOf(token,offset+1);}return false;
}
function refuseOtherReferences(lock,name,version,packageKey,snapshotKey){
 const rootPath=['importers','.','dependencies',name];
 const samePath=(a,b)=>a.length===b.length&&a.every((v,i)=>v===b[i]);
 function visit(value,path){
  if(samePath(path,rootPath))return;
  if(typeof value==='string'){requireScope(!hasToken(value,packageKey),'inherited-or-aliased-old-reference');return;}
  if(!value||typeof value!=='object')return;
  for(const [key,child]of Object.entries(value)){
   const childPath=[...path,key],selectedKey=path.length===1&&(path[0]==='packages'&&key===packageKey||path[0]==='snapshots'&&key===snapshotKey);
   requireScope(selectedKey||!hasToken(key,packageKey),'inherited-or-multiple-old-context');
   if(key===name&&!samePath(childPath,rootPath)){
    const ref=typeof child==='string'?child:record(child)?child.version:null;
    requireScope(!(typeof ref==='string'&&(ref===version||ref.startsWith(version+'('))),'inherited-old-reference');
   }
   visit(child,childPath);
  }
 }
 visit(lock,[]);
}
function refuseExistingName(lock,name){
 function visit(value){
  if(typeof value==='string'){requireScope(!value.includes(name+'@'),'addition-package-reference-already-present');return;}
  if(!value||typeof value!=='object')return;
  for(const [key,child]of Object.entries(value)){
   requireScope(key!==name&&!key.startsWith(name+'@')&&!(key==='name'&&child===name),'addition-package-reference-already-present');visit(child);
  }
 }
 visit(lock);
}
function mismatchPaths(expected,actual){
 const paths=[];let truncated=false;
 function visit(a,b,path){
  if(isDeepStrictEqual(a,b))return;
  if(paths.length>=64){truncated=true;return;}
  if(record(a)&&record(b)){
   for(const key of [...new Set([...Object.keys(a),...Object.keys(b)])].sort()){
    if(!own(a,key)||!own(b,key)){if(paths.length<64)paths.push([...path,key]);else truncated=true;}
    else visit(a[key],b[key],[...path,key]);
   }
  }else paths.push(path);
 }
 visit(expected,actual,[]);return {mismatchPaths:paths,mismatchPathsTruncated:truncated};
}

export function compareNativeRootDependencyLockDelta(input){
 const value=finiteClone(input);exactKeys(value,['beforeLock','afterLock','beforeManifest','afterManifest','change']);
 const {beforeLock,afterLock,beforeManifest,afterManifest,change}=value;
 if(!record(change)||!['add','replace'].includes(change.kind))throw new TypeError('named lock delta kind required');
 exactKeys(change,change.kind==='add'?['kind','name','next']:['kind','name','prior','next']);
 const result={kind:'pnpm.native-lock-delta-diagnostic.v1',accepted:false,semanticComparisonOnly:true,
  nativeExecutionReceived:false,policyVerified:false,artifactVerificationReceived:false,installationReceived:false};
 try{
  const {name}=change;requireScope(typeof name==='string'&&name.length<=214&&namePattern.test(name),'exact-selected-name-required');
  const next=packageSelection(change.next,name),prior=change.kind==='replace'?packageSelection(change.prior,name):null;
  result.selection={kind:change.kind,name,fromVersion:prior?.version??null,toVersion:next.version};
  const beforeRoot=rootLock(beforeLock);rootLock(afterLock);manifestRoot(beforeManifest,name);manifestRoot(afterManifest,name);
  for(const field of dependencyFields.filter(f=>f!=='dependencies'))requireScope(!own(beforeRoot[field]??{},name),'selected-root-alias-in-other-category');
  const expectedManifest=finiteClone(beforeManifest);expectedManifest.dependencies??=Object.create(null);
  if(prior)requireScope(beforeManifest.dependencies?.[name]===prior.version,'prior-root-manifest-selection-mismatch');
  else requireScope(!own(beforeManifest.dependencies??{},name),'addition-root-edge-already-present');
  expectedManifest.dependencies[name]=next.version;
  requireScope(isDeepStrictEqual(expectedManifest,afterManifest),'consumer-manifest-delta-outside-selection');
  const expected=finiteClone(beforeLock),root=expected.importers['.'];root.dependencies??=Object.create(null);
  expected.packages??=Object.create(null);expected.snapshots??=Object.create(null);
  const newKey=keyFor(name,next.version);
  requireScope(!Object.keys(expected.packages).some(k=>k===newKey||k.startsWith(newKey+'('))&&!Object.keys(expected.snapshots).some(k=>k===newKey||k.startsWith(newKey+'(')),'new-selected-key-already-present');
  let suffix='';
  if(!prior){
   requireScope(!own(beforeRoot.dependencies??{},name),'addition-lock-edge-already-present');
   requireScope(!Object.keys(expected.packages).some(k=>k.startsWith(name+'@'))&&!Object.keys(expected.snapshots).some(k=>k.startsWith(name+'@')),'addition-package-already-present');
   refuseExistingName(beforeLock,name);
   expected.packages[newKey]=additionPackage(next,change.next.integrity);expected.snapshots[newKey]=Object.create(null);
  }else{
   requireScope(prior.version!==next.version,'replacement-version-unchanged');
   for(const field of contractFields)requireScope(own(prior,field)===own(next,field)&&isDeepStrictEqual(prior[field],next[field]),'replacement-manifest-contract-changed:'+field);
   const edge=beforeRoot.dependencies?.[name];requireScope(record(edge)&&Object.keys(edge).length===2&&edge.specifier===prior.version&&own(edge,'version'),'prior-root-lock-selection-mismatch');
   suffix=suffixOf(edge.version,prior.version);const oldKey=keyFor(name,prior.version),oldSnapshotKey=oldKey+suffix;
   requireScope(!hasToken(suffix,oldKey),'self-referential-selected-peer-context');
   const selectedPackages=Object.keys(expected.packages).filter(k=>k===oldKey||k.startsWith(oldKey+'(')),selectedSnapshots=Object.keys(expected.snapshots).filter(k=>k===oldKey||k.startsWith(oldKey+'('));
   requireScope(selectedPackages.length===1&&selectedPackages[0]===oldKey&&selectedSnapshots.length===1&&selectedSnapshots[0]===oldSnapshotKey,'ambiguous-or-missing-selected-context');
   const oldPackage=expected.packages[oldKey];requireScope(record(oldPackage)&&record(oldPackage.resolution)&&Object.keys(oldPackage.resolution).length===1&&oldPackage.resolution.integrity===change.prior.integrity,'prior-selected-integrity-or-resolution-mismatch');
   requireScope(record(expected.snapshots[oldSnapshotKey]),'selected-snapshot-record-required');
   refuseOtherReferences(beforeLock,name,prior.version,oldKey,oldSnapshotKey);
   oldPackage.resolution.integrity=change.next.integrity;expected.packages[newKey]=oldPackage;delete expected.packages[oldKey];
   expected.snapshots[newKey+suffix]=expected.snapshots[oldSnapshotKey];delete expected.snapshots[oldSnapshotKey];
  }
  root.dependencies[name]=finiteClone({specifier:next.version,version:next.version+suffix});
  const comparison=mismatchPaths(expected,afterLock);Object.assign(result,comparison);
  result.accepted=comparison.mismatchPaths.length===0&&!comparison.mismatchPathsTruncated;
  result.reason=result.accepted?'complete-intended-semantic-delta':'lock-delta-outside-selection';
  result.counts={before:{importers:Object.keys(beforeLock.importers).length,packages:Object.keys(beforeLock.packages??{}).length,snapshots:Object.keys(beforeLock.snapshots??{}).length},
   after:{importers:Object.keys(afterLock.importers).length,packages:Object.keys(afterLock.packages??{}).length,snapshots:Object.keys(afterLock.snapshots??{}).length}};
  result.selection.preservedPeerSuffix=suffix;
 }catch(error){if(!(error instanceof Refusal))throw error;result.reason=error.message;}
 return freeze(result);
}

/** Conservative pre-effect input classification, not a native lock parser or
 * resolver. In particular, no registry-only result grants archive/store effects. */
export function inspectNativeRegistryLockProfile(input){
 const value=finiteClone(input);
 const unchanged=record(value)&&own(value,'profile');
 exactKeys(value,unchanged?['lock','manifest','profile']:record(value)&&own(value,'change')?['lock','manifest','change']:['lock','manifest']);
 if(unchanged&&value.profile!=='unchanged-registry-consumer')throw new TypeError('explicit unchanged registry consumer profile required');
 const result={kind:'pnpm.native-registry-lock-profile-diagnostic.v1',accepted:false,semanticComparisonOnly:true,
  nativeExecutionReceived:false,policyVerified:false,artifactVerificationReceived:false,installationReceived:false};
 const exactVersion=v=>typeof v==='string'&&v.length<=128&&versionPattern.test(v)&&semver.valid(v)!==null;
 const validName=v=>typeof v==='string'&&v.length<=214&&namePattern.test(v);
 const fields=(v,allowed,reason)=>requireScope(record(v)&&Object.keys(v).every(k=>allowed.includes(k)),reason);
 const integrity=v=>{const m=typeof v==='string'&&/^sha512-([A-Za-z0-9+/]+={0,2})$/u.exec(v);return Boolean(m)&&Buffer.from(m[1],'base64').length===64&&Buffer.from(m[1],'base64').toString('base64')===m[1];};
 function packageKey(key,peers=false){
  requireScope(typeof key==='string','exact-registry-package-key-required');
  const opening=key.indexOf('('),base=opening<0?key:key.slice(0,opening),split=base.lastIndexOf('@'),name=base.slice(0,split),version=base.slice(split+1);
  requireScope(split>0&&validName(name)&&exactVersion(version),'exact-registry-package-key-required');
  const suffix=suffixOf(version+(opening<0?'':key.slice(opening)),version);
  requireScope(peers||suffix==='','peer-context-on-package-record-unsupported');
  return {name,version,base,suffix};
 }
 try{
  const {lock,manifest}=value,root=rootLock(lock);
  fields(lock,['lockfileVersion','settings','overrides','importers','packages','snapshots'],'unsupported-lock-configuration');
  requireScope(Object.keys(lock.importers).length===1,'root-only-lock-required');
  if(own(lock,'settings')){fields(lock.settings,['autoInstallPeers','excludeLinksFromLockfile'],'unsupported-lock-settings');
   requireScope((!own(lock.settings,'autoInstallPeers')||typeof lock.settings.autoInstallPeers==='boolean')&&(!own(lock.settings,'excludeLinksFromLockfile')||lock.settings.excludeLinksFromLockfile===false),'unsupported-lock-settings');}
  if(own(lock,'overrides')){requireScope(record(lock.overrides),'unsupported-lock-overrides');for(const [selector,version]of Object.entries(lock.overrides)){
   if(!validName(selector))packageKey(selector);requireScope(exactVersion(version),'unsupported-lock-overrides');}}
  requireScope(record(manifest)&&validName(manifest.name),'consumer-manifest-required');
  for(const key of ['pnpm','overrides','resolutions','workspaces','dependenciesMeta',...(!unchanged?['peerDependenciesMeta']:[])])requireScope(!own(manifest,key),'unsupported-manifest-configuration:'+key);
  if(unchanged&&own(manifest,'peerDependenciesMeta')){
   requireScope(record(manifest.peerDependenciesMeta),'unsupported-consumer-peer-metadata');
   for(const [name,meta]of Object.entries(manifest.peerDependenciesMeta))requireScope(validName(name)&&own(manifest.peerDependencies??{},name)&&record(meta)&&Object.keys(meta).length===1&&meta.optional===true,'unsupported-consumer-peer-metadata');
  }
  if(own(manifest,'packageManager'))requireScope(manifest.packageManager==='pnpm@11.28.5','unsupported-manifest-package-manager');
  for(const key of ['engines','devEngines'])if(own(manifest,key))requireScope(record(manifest[key])&&!own(manifest[key],'runtime')&&!own(manifest[key],'packageManager')&&Object.values(manifest[key]).every(v=>typeof v==='string'),'unsupported-manifest-runtime-configuration');
  const declared=new Set(),roles=new Map();for(const field of dependencyFields){if(!own(manifest,field))continue;
   requireScope(record(manifest[field]),'exact-manifest-registry-map-required');for(const [name,version]of Object.entries(manifest[field])){
    const prior=roles.get(name);
    const peerDevelopment=unchanged&&field==='peerDependencies'&&prior?.field==='devDependencies'&&prior.version===version;
    requireScope(validName(name)&&exactVersion(version)&&(!declared.has(name)||peerDevelopment),'exact-unique-manifest-registry-dependency-required');declared.add(name);roles.set(name,{field,version});}}
  const packages=lock.packages??Object.create(null),snapshots=lock.snapshots??Object.create(null),represented=new Set();
  for(const [key,pkg]of Object.entries(packages)){
   packageKey(key);fields(pkg,['resolution','engines','cpu','os','libc','deprecated','hasBin','peerDependencies','peerDependenciesMeta'],'unsupported-registry-package-fields');
   requireScope(record(pkg.resolution)&&Object.keys(pkg.resolution).length===1&&integrity(pkg.resolution.integrity),'canonical-integrity-only-registry-resolution-required');
   if(own(pkg,'engines'))requireScope(record(pkg.engines)&&!own(pkg.engines,'runtime')&&!own(pkg.engines,'packageManager')&&Object.values(pkg.engines).every(v=>typeof v==='string'),'unsupported-package-engines');
   for(const field of ['cpu','os','libc'])if(own(pkg,field))requireScope(Array.isArray(pkg[field])&&pkg[field].every(v=>typeof v==='string'&&v.length>0),'unsupported-package-platform');
   if(own(pkg,'deprecated'))requireScope(typeof pkg.deprecated==='string','unsupported-package-deprecation');
   if(own(pkg,'hasBin'))requireScope(pkg.hasBin===true,'unsupported-package-bin-flag');
   if(own(pkg,'peerDependencies')){requireScope(record(pkg.peerDependencies),'unsupported-package-peer-map');for(const [name,range]of Object.entries(pkg.peerDependencies))requireScope(validName(name)&&typeof range==='string'&&semver.validRange(range)!==null,'unsupported-package-peer-range');}
   if(own(pkg,'peerDependenciesMeta')){requireScope(record(pkg.peerDependenciesMeta),'unsupported-package-peer-metadata');for(const [name,meta]of Object.entries(pkg.peerDependenciesMeta))requireScope(validName(name)&&own(pkg.peerDependencies??{},name)&&record(meta)&&Object.keys(meta).length===1&&meta.optional===true,'unsupported-package-peer-metadata');}
  }
  let references=0;
  function dependency(name,reference){
   requireScope(validName(name)&&typeof reference==='string','exact-registry-reference-required');
   const parsed=packageKey(name+'@'+reference,true);requireScope(parsed.name===name&&own(packages,parsed.base)&&own(snapshots,name+'@'+reference),'dangling-or-exotic-registry-reference');references++;
  }
  for(const [key,snapshot]of Object.entries(snapshots)){
   const parsed=packageKey(key,true);requireScope(own(packages,parsed.base),'orphan-registry-snapshot');represented.add(parsed.base);
   fields(snapshot,['dependencies','optionalDependencies','transitivePeerDependencies','optional'],'unsupported-registry-snapshot-fields');
   if(own(snapshot,'optional'))requireScope(snapshot.optional===true,'unsupported-snapshot-optional-flag');
   for(const field of ['dependencies','optionalDependencies'])if(own(snapshot,field)){requireScope(record(snapshot[field]),'exact-snapshot-registry-map-required');for(const [name,ref]of Object.entries(snapshot[field]))dependency(name,ref);}
   if(own(snapshot,'transitivePeerDependencies'))requireScope(Array.isArray(snapshot.transitivePeerDependencies)&&snapshot.transitivePeerDependencies.every(validName)&&new Set(snapshot.transitivePeerDependencies).size===snapshot.transitivePeerDependencies.length,'unsupported-transitive-peer-names');
  }
  requireScope(represented.size===Object.keys(packages).length,'orphan-registry-package');
  fields(root,['dependencies','devDependencies','optionalDependencies'],'unsupported-root-importer-fields');
  const aliases=new Set();for(const field of ['dependencies','devDependencies','optionalDependencies'])if(own(root,field))for(const [name,edge]of Object.entries(root[field])){
   requireScope(record(edge)&&Object.keys(edge).length===2&&own(edge,'specifier')&&own(edge,'version')&&exactVersion(edge.specifier)&&!aliases.has(name),'exact-unique-root-registry-edge-required');aliases.add(name);dependency(name,edge.version);}
  if(own(value,'change')){
   const change=value.change;
   requireScope(record(change)&&['add','replace'].includes(change.kind),'supported-selected-change-required');
   exactKeys(change,change.kind==='add'?['kind','name','next']:['kind','name','prior','next']);
   const name=change.name;requireScope(validName(name),'exact-selected-name-required');
   const next=packageSelection(change.next,name),prior=change.kind==='replace'?packageSelection(change.prior,name):null;
   requireScope(manifest.dependencies?.[name]===next.version,'next-root-manifest-selection-mismatch');
   const newKey=keyFor(name,next.version);
   requireScope(!Object.keys(packages).some(k=>k===newKey||k.startsWith(newKey+'('))&&!Object.keys(snapshots).some(k=>k===newKey||k.startsWith(newKey+'(')),'new-selected-key-already-present');
   for(const selected of prior?[prior,next]:[next])for(const field of ['dependencies','optionalDependencies','peerDependencies'])if(own(selected,field)){
    requireScope(record(selected[field]),'selected-registry-dependency-map-required');
    for(const [dependency,range]of Object.entries(selected[field]))requireScope(validName(dependency)&&typeof range==='string'&&semver.validRange(range)!==null,'selected-exotic-dependency-unsupported');
   }
   if(!prior){refuseExistingName(lock,name);additionPackage(next,change.next.integrity);}
   else{
    requireScope(prior.version!==next.version,'replacement-version-unchanged');
    for(const field of contractFields)requireScope(own(prior,field)===own(next,field)&&isDeepStrictEqual(prior[field],next[field]),'replacement-manifest-contract-changed:'+field);
    const edge=root.dependencies?.[name];requireScope(record(edge)&&edge.specifier===prior.version,'prior-root-lock-selection-mismatch');
    const suffix=suffixOf(edge.version,prior.version),oldKey=keyFor(name,prior.version),oldSnapshot=oldKey+suffix;
    requireScope(!hasToken(suffix,oldKey),'self-referential-selected-peer-context');
    requireScope(Object.keys(snapshots).filter(k=>k===oldKey||k.startsWith(oldKey+'(')).length===1&&own(snapshots,oldSnapshot),'ambiguous-or-missing-selected-context');
    requireScope(packages[oldKey]?.resolution.integrity===change.prior.integrity,'prior-selected-integrity-or-resolution-mismatch');
    refuseOtherReferences(lock,name,prior.version,oldKey,oldSnapshot);
   }
   result.selection={kind:change.kind,name,fromVersion:prior?.version??null,toVersion:next.version};
  }
  if(unchanged)result.profile='unchanged-registry-consumer';
  result.accepted=true;result.reason='complete-registry-only-input-profile';result.counts={packages:Object.keys(packages).length,snapshots:Object.keys(snapshots).length,references,manifestDeclarations:declared.size};
 }catch(error){if(!(error instanceof Refusal))throw error;result.reason=error.message;}
 return freeze(result);
}
