import test from 'node:test';
import assert from 'node:assert/strict';
import {compareNativeRootDependencyLockDelta as compare,inspectNativeRegistryLockProfile as inspect} from '../src/native-lock-delta.mjs';

const clone=structuredClone,name='@example/selected',oldVersion='0.0.51-dev.946',newVersion='0.0.51-dev.955';
const sri=n=>'sha512-'+Buffer.alloc(64,n).toString('base64');
// Exact nested peer-context shape from the retained Koios lock; the following
// trees and after values are synthetic comparison fixtures, never native output.
const peerSuffix='(@types/node@26.6.5)(bufferutil@4.1.0)(debug@4.4.3(supports-color@10.2.2))(ethers@6.17.0(bufferutil@4.1.0)(utf-8-validate@6.0.6))(supports-color@10.2.2)(typescript@5.9.3)(utf-8-validate@6.0.6)(zod@3.25.76)';
function base(){return{beforeManifest:{name:'consumer',version:'1.0.0',dependencies:{kept:'1.0.0'}},beforeLock:{lockfileVersion:'9.0',settings:{autoInstallPeers:true,excludeLinksFromLockfile:false},importers:{'.':{dependencies:{kept:{specifier:'1.0.0',version:'1.0.0'}}}},packages:{'kept@1.0.0':{resolution:{integrity:sri(3)}}},snapshots:{'kept@1.0.0':{}}}};}
function add(manifest={name,version:'0.2.0'},packageFields={}){
 const b=base(),afterManifest=clone(b.beforeManifest),afterLock=clone(b.beforeLock);afterManifest.dependencies[name]=manifest.version;
 afterLock.importers['.'].dependencies[name]={specifier:manifest.version,version:manifest.version};
 afterLock.packages[name+'@'+manifest.version]={resolution:{integrity:sri(2)},...clone(packageFields)};afterLock.snapshots[name+'@'+manifest.version]={};
 return{...b,afterManifest,afterLock,change:{kind:'add',name,next:{manifest,integrity:sri(2)}}};
}
function replace(suffix=peerSuffix){
 const b=base(),prior={name,version:oldVersion,type:'module',dependencies:{kept:'1.0.0'},exports:{'.':'./index.mjs'},engines:{node:'>=24.2.0'},bin:{selected:'./bin.mjs'}},next={...clone(prior),version:newVersion};
 b.beforeManifest.dependencies[name]=oldVersion;b.beforeLock.importers['.'].dependencies[name]={specifier:oldVersion,version:oldVersion+suffix};
 b.beforeLock.packages[name+'@'+oldVersion]={resolution:{integrity:sri(1)},engines:{node:'>=24.2.0'},hasBin:true};
 b.beforeLock.snapshots[name+'@'+oldVersion+suffix]={dependencies:{kept:'1.0.0'},transitivePeerDependencies:['@types/node','bufferutil','zod']};
 const afterManifest=clone(b.beforeManifest),afterLock=clone(b.beforeLock);afterManifest.dependencies[name]=newVersion;
 afterLock.importers['.'].dependencies[name]={specifier:newVersion,version:newVersion+suffix};
 afterLock.packages[name+'@'+newVersion]={...afterLock.packages[name+'@'+oldVersion],resolution:{integrity:sri(2)}};delete afterLock.packages[name+'@'+oldVersion];
 afterLock.snapshots[name+'@'+newVersion+suffix]=afterLock.snapshots[name+'@'+oldVersion+suffix];delete afterLock.snapshots[name+'@'+oldVersion+suffix];
 return{...b,afterManifest,afterLock,change:{kind:'replace',name,prior:{manifest:prior,integrity:sri(1)},next:{manifest:next,integrity:sri(2)}}};
}
function refused(input,reason){const r=compare(input);assert.equal(r.accepted,false);if(reason)assert.match(r.reason,reason);return r;}

test('DELTA1-3 dependency-free exact root addition compares the complete lock without claims',()=>{
 const input=add(),before=clone(input),r=compare(input);assert.equal(r.accepted,true);assert.deepEqual(input,before);
 assert.equal(r.semanticComparisonOnly,true);for(const key of ['nativeExecutionReceived','policyVerified','artifactVerificationReceived','installationReceived'])assert.equal(r[key],false);
 assert.deepEqual(r.counts,{before:{importers:1,packages:1,snapshots:1},after:{importers:1,packages:2,snapshots:2}});
 assert.equal(Object.hasOwn(r,'lockfile'),false);assert.equal(Object.hasOwn(r,'expectedLock'),false);assert.ok(Object.isFrozen(r.selection));
});
test('DELTA3 derives engines/platform/deprecation/bin fields, not resolution alone',()=>{
 const m={name,version:'1.0.0',engines:{node:'>=24.2.0',npm:'*'},cpu:['x64','arm64'],os:['linux'],libc:['glibc'],deprecated:'use another package',bin:{selected:'./bin.mjs'}};
 const fields={engines:{node:'>=24.2.0'},cpu:m.cpu,os:m.os,libc:m.libc,deprecated:m.deprecated,hasBin:true};const input=add(m,fields);assert.equal(compare(input).accepted,true);
 delete input.afterLock.packages[name+'@1.0.0'].engines;refused(input,/outside-selection/);
});
for(const [label,fields,expected]of [['string-bin',{bin:'./bin.mjs'},{hasBin:true}],['directory-bin',{directories:{bin:'./bin'}},{hasBin:true}],['empty-string-bin-suppresses-directory',{bin:'',directories:{bin:'./bin'}},{}],['empty-map-bin-suppresses-directory',{bin:{},directories:{bin:'./bin'}},{}],['empty-bin-star-engine',{bin:{},engines:{node:'*'}},{}]])
 test('DELTA3 native writer shape '+label,()=>assert.equal(compare(add({name,version:'1.0.0',...fields},expected)).accepted,true));
for(const extra of [{dependencies:{child:'1.0.0'}},{optionalDependencies:{child:'1.0.0'}},{peerDependencies:{child:'*'}},{peerDependenciesMeta:{child:{optional:true}}},{dependenciesMeta:{child:{injected:true}}},{bundledDependencies:true},{bundleDependencies:['child']},{engines:{runtime:{name:'node',version:'24'}}},{devEngines:{runtime:{name:'node'}}}])
 test('DELTA3 unsupported addition '+JSON.stringify(extra),()=>refused(add({name,version:'1.0.0',...extra}),/unsupported/));
test('DELTA3 can add to a genuinely empty root with absent package/snapshot maps',()=>{
 const input=add();input.beforeManifest.dependencies={};input.afterManifest.dependencies={[name]:'0.2.0'};
 input.beforeLock.importers['.']={};delete input.beforeLock.packages;delete input.beforeLock.snapshots;
 input.afterLock.importers['.'].dependencies={[name]:{specifier:'0.2.0',version:'0.2.0'}};delete input.afterLock.packages['kept@1.0.0'];delete input.afterLock.snapshots['kept@1.0.0'];
 assert.equal(compare(input).accepted,true);
});
test('DELTA4 exact long nested peer suffix replacement preserves every snapshot field',()=>{
 const input=replace(),original=clone(input),r=compare(input);assert.equal(r.accepted,true);assert.equal(r.selection.preservedPeerSuffix,peerSuffix);assert.deepEqual(input,original);
 assert.equal(r.counts.before.packages,r.counts.after.packages);assert.equal(compare(replace('')).accepted,true);
});
for(const field of ['dependencies','optionalDependencies','peerDependencies','exports','engines','bin','type'])
 test('DELTA5 replacement contract changed '+field,()=>{const input=replace();input.change.next.manifest[field]=field==='type'?'commonjs':{changed:'value'};refused(input,/manifest-contract-changed/);});
test('DELTA4 rejects changed peer suffix, snapshot body or extra context',()=>{
 let input=replace();input.afterLock.importers['.'].dependencies[name].version=newVersion+'(zod@4.0.0)';refused(input,/outside-selection/);
 input=replace();input.afterLock.snapshots[name+'@'+newVersion+peerSuffix].transitivePeerDependencies.push('extra');refused(input,/outside-selection/);
 input=replace();input.beforeLock.snapshots[name+'@'+oldVersion+'(other@1.0.0)']={};refused(input,/ambiguous/);
 input=replace();input.afterLock.snapshots[name+'@'+newVersion+'(other@1.0.0)']={};refused(input,/outside-selection/);
});
for(const suffix of ['(peer@1.0.0','(peer@1.0.0))','()','(peer@1.0.0)trailing','(patch_hash=abc)','(peer@1.0.0)\n'])
 test('DELTA4 refuses unsupported peer reference '+JSON.stringify(suffix),()=>refused(replace(suffix),/peer-context/));
test('DELTA4 refuses inherited, aliased and peer-context references to the old version',()=>{
 let input=replace();input.beforeLock.snapshots['kept@1.0.0'].dependencies={[name]:oldVersion+peerSuffix};refused(input,/inherited/);
 input=replace();input.beforeLock.snapshots['kept@1.0.0'].dependencies={alias:'npm:'+name+'@'+oldVersion};refused(input,/inherited/);
 input=replace();input.beforeLock.importers.other={dependencies:{[name]:{specifier:oldVersion,version:oldVersion+peerSuffix}}};refused(input,/inherited/);
 input=replace();input.beforeLock.snapshots['kept@1.0.0('+name+'@'+oldVersion+')']={};refused(input,/inherited/);
 input=replace();input.beforeLock.snapshots[name+'@'+oldVersion+peerSuffix].dependencies[name]=oldVersion;refused(input,/inherited/);
});
test('DELTA2-4 rejects key collision, wrong prior SRI and selected exotic resolution',()=>{
 let input=replace();input.beforeLock.packages[name+'@'+newVersion]={resolution:{integrity:sri(2)}};refused(input,/already-present/);
 input=replace();input.change.prior.integrity=sri(4);refused(input,/integrity/);
 input=replace();input.beforeLock.packages[name+'@'+oldVersion].resolution.tarball='https://registry.example/archive.tgz';refused(input,/resolution/);
 input=replace();input.beforeLock.importers['.'].dependencies[name].specifier='^'+oldVersion;refused(input,/selection-mismatch/);
});
test('DELTA2 rejects root alias duplication and any unrelated manifest change',()=>{
 let input=add();input.beforeManifest.devDependencies={[name]:'0.2.0'};refused(input,/other-category/);
 input=replace();input.beforeLock.importers['.'].optionalDependencies={[name]:{specifier:oldVersion,version:oldVersion}};refused(input,/other-category/);
 input=add();input.afterManifest.version='2.0.0';refused(input,/manifest-delta/);
 input=replace();input.afterManifest.dependencies.kept='2.0.0';refused(input,/manifest-delta/);
});
test('DELTA3 refuses dangling prior additions and wrong added snapshot/package fields',()=>{
 let input=add();input.beforeLock.snapshots['kept@1.0.0'].dependencies={[name]:'0.2.0'};refused(input,/reference-already-present/);
 input=add();input.afterLock.snapshots[name+'@0.2.0'].dependencies={kept:'1.0.0'};refused(input,/outside-selection/);
 input=add();input.afterLock.packages[name+'@0.2.0'].engines={node:'>=18'};refused(input,/outside-selection/);
 input=add();input.afterLock.packages[name+'@0.2.0'].resolution.integrity=sri(4);refused(input,/outside-selection/);
});
for(const section of ['settings','importers','packages','snapshots'])test('DELTA6 detects unrelated '+section+' changes',()=>{
 const input=replace();if(section==='settings')input.afterLock.settings.autoInstallPeers=false;
 if(section==='importers')input.afterLock.importers.other={};if(section==='packages')input.afterLock.packages['kept@1.0.0'].resolution.integrity=sri(9);
 if(section==='snapshots')input.afterLock.snapshots['kept@1.0.0'].optional=true;
 const r=refused(input,/outside-selection/);assert.ok(r.mismatchPaths.some(path=>path[0]===section));
});
test('DELTA6 full 924-package synthetic closure compares every inherited record, not just counts',()=>{
 const input=replace();for(let i=1;i<=922;i++)for(const lock of [input.beforeLock,input.afterLock]){
  lock.packages['kept-'+i+'@1.0.0']={resolution:{integrity:sri(3)},engines:{node:'>=18'}};lock.snapshots['kept-'+i+'@1.0.0']={dependencies:{kept:'1.0.0'}};
 }
 assert.equal(compare(input).accepted,true);input.afterLock.snapshots['kept-922@1.0.0'].dependencies.kept='2.0.0';refused(input,/outside-selection/);
});
test('DELTA1 refuses getters/prototypes/sparse/cyclic/nonfinite and over-limit data without evaluating accessors',()=>{
 let called=0;const input=add();Object.defineProperty(input.beforeLock,'evil',{enumerable:true,get(){called++;return'bad'}});assert.throws(()=>compare(input),/own-data/);assert.equal(called,0);
 const inherited=Object.create(add());assert.throws(()=>compare(inherited),/own-data/);
 for(const bad of [NaN,Infinity,undefined,()=>0,Symbol('x')]){const x=add();x.beforeLock.extra=bad;assert.throws(()=>compare(x),/JSON/);}
 let x=add();x.beforeLock.extra=['a','b'];delete x.beforeLock.extra[0];assert.throws(()=>compare(x),/dense/);
 x=add();x.beforeLock.extra=x;assert.throws(()=>compare(x),/acyclic/);
 x=add();x.beforeLock.extra='x'.repeat(16385);assert.throws(()=>compare(x),/bounded/);
 x=add();x.beforeLock.extra=Object.fromEntries(Array.from({length:8193},(_,i)=>['k'+i,i]));assert.throws(()=>compare(x),/bounded/);
});
test('DELTA1 strict input shape, exact versions and canonical selected integrity',()=>{
 assert.throws(()=>compare({...add(),accepted:true}),/exact/);const x=add();x.change.kind='update-anything';assert.throws(()=>compare(x),/named/);
 for(const version of ['^1.0.0','latest','01.0.0'])refused(add({name,version}),/identity/);
 for(const integrity of ['sha512-bad',sri(2)+' '+sri(2),'sha1-'+Buffer.alloc(20).toString('base64')]){const input=add();input.change.next.integrity=integrity;refused(input,/sha512/);}
});
test('DELTA6 diagnostic paths are bounded and never disguise a truncated difference set as accepted',()=>{
 const input=add();for(let i=0;i<100;i++)input.afterLock.packages['extra-'+i+'@1.0.0']={};const r=refused(input,/outside-selection/);assert.equal(r.mismatchPaths.length,64);assert.equal(r.mismatchPathsTruncated,true);
});

function registryInput(){const b=base();return{lock:b.beforeLock,manifest:b.beforeManifest};}
test('DELTA8-9 pre-effect registry classification preserves exact input without freshness or effect claims',()=>{
 const input=registryInput(),original=clone(input);input.manifest.dependencies.new='1.2.3';original.manifest.dependencies.new='1.2.3';
 const r=inspect(input);assert.equal(r.accepted,true);assert.deepEqual(input,original);assert.deepEqual(r.counts,{packages:1,snapshots:1,references:1,manifestDeclarations:2});
 for(const key of ['nativeExecutionReceived','policyVerified','artifactVerificationReceived','installationReceived'])assert.equal(r[key],false);
 assert.equal(Object.hasOwn(r,'lock'),false);assert.ok(Object.isFrozen(r));
});
test('DELTA8 pre-effect inventory preserves opaque genuine nested peer suffix and registry overrides',()=>{
 const input=registryInput(),key='kept@1.0.0';input.lock.snapshots[key+peerSuffix]=input.lock.snapshots[key];delete input.lock.snapshots[key];
 input.lock.importers['.'].dependencies.kept.version='1.0.0'+peerSuffix;input.lock.overrides={'kept@0.9.0':'1.0.0',another:'2.0.0'};
 assert.equal(inspect(input).accepted,true);
});
for(const reference of ['file:../local','link:../local','workspace:*','npm:kept@1.0.0','git+https://example.test/x.git','https://example.test/a.tgz','1.0.0(patch_hash=abc)','^1.0.0'])
 test('DELTA8 rejects pre-effect exotic reference '+reference,()=>{const input=registryInput();input.lock.importers['.'].dependencies.kept.version=reference;assert.equal(inspect(input).accepted,false);});
test('DELTA8 every snapshot edge and both package/snapshot existence are checked',()=>{
 for(const mutate of [x=>x.lock.snapshots['kept@1.0.0'].dependencies={missing:'1.0.0'},x=>x.lock.snapshots['kept@1.0.0'].optionalDependencies={kept:'file:../kept'},x=>delete x.lock.snapshots['kept@1.0.0'],x=>delete x.lock.packages['kept@1.0.0'],x=>x.lock.packages['unused@1.0.0']={resolution:{integrity:sri(2)}}]){const input=registryInput();mutate(input);assert.equal(inspect(input).accepted,false);}
});
test('DELTA8 package resolutions and unknown native configuration fail closed',()=>{
 for(const mutate of [x=>x.lock.packages['kept@1.0.0'].resolution.tarball='https://example.test/a.tgz',x=>x.lock.packages['kept@1.0.0'].resolution.integrity='sha1-YQ==',x=>x.lock.packages['kept@1.0.0'].patched=true,x=>x.lock.patchedDependencies={},x=>x.lock.settings.injectWorkspacePackages=true,x=>x.lock.settings.excludeLinksFromLockfile=true,x=>x.lock.importers.other={},x=>x.lock.snapshots['kept@1.0.0'].id='file:local',x=>x.lock.overrides={kept:'file:local'},x=>x.lock.overrides={'parent>child':'1.0.0'}]){const input=registryInput();mutate(input);assert.equal(inspect(input).accepted,false);}
});
test('DELTA8 valid native package fields are accepted but peer/runtime exotics refuse',()=>{
 const input=registryInput(),pkg=input.lock.packages['kept@1.0.0'];Object.assign(pkg,{engines:{node:'>=20'},cpu:['x64'],os:['linux'],libc:['glibc'],deprecated:'old',hasBin:true,peerDependencies:{peer:'^1.0.0'},peerDependenciesMeta:{peer:{optional:true}}});assert.equal(inspect(input).accepted,true);
 for(const mutate of [p=>p.engines.runtime={name:'node'},p=>p.peerDependencies.peer='file:../x',p=>p.peerDependenciesMeta.peer.optional=false,p=>p.hasBin=false]){const bad=clone(input);mutate(bad.lock.packages['kept@1.0.0']);assert.equal(inspect(bad).accepted,false);}
});
for(const key of ['pnpm','overrides','resolutions','workspaces','dependenciesMeta','peerDependenciesMeta'])
 test('DELTA9 rejects configured manifest '+key,()=>{const input=registryInput();input.manifest[key]={};assert.equal(inspect(input).accepted,false);});
test('DELTA9 manifest selections are exact unique registry identities with closed activation',()=>{
 for(const mutate of [m=>m.dependencies.kept='^1.0.0',m=>m.dependencies.kept='npm:other@1.0.0',m=>m.optionalDependencies={kept:'1.0.0'},m=>m.packageManager='pnpm@11.0.0',m=>m.engines={runtime:{name:'node'}},m=>m.devEngines={packageManager:{name:'pnpm'}}]){const input=registryInput();mutate(input.manifest);assert.equal(inspect(input).accepted,false);}
 const input=registryInput();input.manifest.packageManager='pnpm@11.28.5';assert.equal(inspect(input).accepted,true);
});
test('DELTA8 diagnostic own-data bounds run before any accessor can be evaluated',()=>{
 let calls=0;const input={manifest:registryInput().manifest,get lock(){calls++;return{}}};assert.throws(()=>inspect(input),/own-data/);assert.equal(calls,0);
 assert.throws(()=>inspect({...registryInput(),unexpected:true}),/exact/);
});

test('DELTA10 selected dependency-free addition is checked before effects',()=>{
 const fixture=add(),input={lock:fixture.beforeLock,manifest:fixture.afterManifest,change:fixture.change};assert.equal(inspect(input).accepted,true);
 for(const extra of [{dependencies:{child:'1.0.0'}},{peerDependencies:{peer:'*'}},{optionalDependencies:{child:'file:../x'}},{engines:{runtime:{name:'node'}}},{bin:false}]){
  const invalid=clone(input);Object.assign(invalid.change.next.manifest,extra);assert.equal(inspect(invalid).accepted,false);
 }
 const mismatched=clone(input);mismatched.manifest.dependencies[name]='0.9.0';assert.equal(inspect(mismatched).accepted,false);
});
test('DELTA10 unique exact replacement is checked before effects with its existing suffix',()=>{
 const fixture=replace(),input={lock:fixture.beforeLock,manifest:fixture.afterManifest,change:fixture.change};assert.equal(inspect(input).accepted,true);
 for(const mutate of [x=>x.change.next.manifest.exports={'.':'./different.mjs'},x=>x.change.prior.integrity=sri(9),x=>x.lock.snapshots[name+'@'+oldVersion]={},x=>x.lock.snapshots['kept@1.0.0'].dependencies={[name]:oldVersion+peerSuffix},x=>{x.change.prior.manifest.dependencies.local='file:../x';x.change.next.manifest.dependencies.local='file:../x';}]){
  const invalid=clone(input);mutate(invalid);assert.equal(inspect(invalid).accepted,false);
 }
});
test('DELTA10 selected preflight data has exact own-data shape and does not invoke getters',()=>{
 const input=registryInput();input.change={kind:'unknown'};assert.equal(inspect(input).accepted,false);
 const fixture=add();let calls=0;const change={...fixture.change};Object.defineProperty(change,'next',{enumerable:true,get(){calls++;return fixture.change.next}});
 assert.throws(()=>inspect({lock:fixture.beforeLock,manifest:fixture.afterManifest,change}),/own-data/);assert.equal(calls,0);
});
