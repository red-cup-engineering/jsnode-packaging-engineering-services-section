import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile,lstat} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {projectNativeMetadataQuery,projectNativeMetadataBatchQuery,receiveNativeMetadataBatchFiles,
  createNativeMetadataBatchPreparationService,createNativeMetadataPreparationService} from '../src/native-metadata-preparation.mjs';
import {fixture,execution,sha} from './native-metadata-session-fixture.mjs';

const registry='https://registry.example/',integrity='sha512-'+Buffer.alloc(64,1).toString('base64');
const selections=[{name:'alpha',version:'1.0.0',registry,integrity},{name:'alpha',version:'1.1.0',registry,integrity},{name:'beta',version:'2.0.0',registry,integrity}];
const refinement={purpose:'raw-registry-metadata-acquisition',category:'abbreviated'};
const base=()=>({names:['alpha','beta'],selections,policy:{minimumReleaseAge:1440,minimumReleaseAgeStrict:true,minimumReleaseAgeExclude:['@red-cup-engineering/*']},canonical:{sourceHead:'a'.repeat(40),manifestSHA256:'b'.repeat(64),lockSHA256:'c'.repeat(64),workspaceSHA256:'d'.repeat(64),registryConfigurationSHA256:'e'.repeat(64),selectionSHA256:sha(JSON.stringify(selections))},registry,directory:'/private/query',cacheDirectory:'/private/cache'});
const query=()=>({...base(),...refinement});
const stateOptions={skip:!process.env.QUALIFIED_PNPM_ENTRY};
async function rawFixture(t,raw=true){const f=await fixture(t);f.input.query={...(raw?query():base()),directory:f.input.query.directory,cacheDirectory:f.input.query.cacheDirectory};f.service=createNativeMetadataBatchPreparationService();return f;}

// Explicit synthetic indexed mirrors and executor receipts: never native provenance.
async function mirrors(p,{time,modified,omit=[],missingManifest=[],wrongIntegrity=[]}={}){
 for(const m of p.members){if(omit.includes(m.name))continue;const fragments=[],spans=[];let offset=0;
  for(const s of p.originalSelections.filter(s=>s.name===m.name)){
   if(missingManifest.includes(s.name+'@'+s.version))continue;
   const fragment=Buffer.from(JSON.stringify({name:s.name,version:s.version,dist:{integrity:wrongIntegrity.includes(s.name)?'sha512-wrong':s.integrity}}));
   spans.push([s.version,offset,fragment.length]);fragments.push(fragment);offset+=fragment.length;
  }
  const headers=JSON.stringify(modified===undefined?{}:{modified}),index=JSON.stringify({name:m.name,distTags:{latest:m.representative},versions:spans,
   ...(time===undefined?{}:{time:Object.fromEntries(m.selectedVersions.map(v=>[v,time]))})});
  const bytes=Buffer.concat([Buffer.from(`pnpm-meta-v1 ${Buffer.byteLength(headers)} ${Buffer.byteLength(index)}\n${headers}${index}`),...fragments]);
  await mkdir(dirname(m.expectedMirrorPath),{recursive:true});await writeFile(m.expectedMirrorPath,bytes);
 }
}
const output=p=>Object.fromEntries(p.members.map(m=>[m.name,{wanted:m.representative,latest:m.representative}]));
const result=(launch,p,overrides={})=>execution(launch.request,{stdout:JSON.stringify(output(p)),...overrides});
async function launched(t,opts={}){const f=await rawFixture(t),p=await f.service.prepare(f.input),launch=await f.service.revalidate(p.ticket,{phase:'producer',environment:f.input.environment});await mirrors(p.projection,opts);return{f,p,launch};}

test('RAW1/MT25 exact metadata cohort is the only additive serialized projection change',()=>{
 // Original immutable supplier goldens remain unchanged. MT25 explicitly adds
 // this exact metadata-only inventory, not new query/config/policy semantics.
 const projections=[
  [projectNativeMetadataBatchQuery(base()),'215ddfa33d76e083665179287de8753c31f332bb7a800a6426d4bd57a029ff7c'],
  [projectNativeMetadataQuery({...base(),name:'alpha'}),'8625c0deed0d10658e95896c56f0ce9298675174e3f0231bc5dd95226c9f384b'],
 ];
 for(const [projection,originalDigest]of projections){
  assert.deepEqual(projection.requiredProvider,{node:'24.19.0',supportedNodeVersions:['24.18.0','24.19.0'],pnpm:'11.28.5',
   distributionSHA256:'e3738fda08262f74611d7a1ffc11b3e87fa52b466c07eb73211d179ebcb98810'});
  const legacy=JSON.parse(JSON.stringify(projection));
  delete legacy.requiredProvider.supportedNodeVersions;
  assert.equal(sha(JSON.stringify(legacy)),originalDigest);
  assert.deepEqual(projection.requiredProvider.supportedNodeVersions,['24.18.0','24.19.0']);
 }
});
test('RAW2-3 positive canonical policy is unchanged; only query workspace age is zero',()=>{
 const q=query(),before=JSON.stringify(q),p=projectNativeMetadataBatchQuery(q),full=projectNativeMetadataBatchQuery(base());
 assert.equal(JSON.stringify(q),before);assert.deepEqual(p.policy,q.policy);assert.deepEqual(p.canonical,full.canonical);
 assert.deepEqual(p.queryPolicy,{...q.policy,minimumReleaseAge:0});assert.equal(p.purpose,refinement.purpose);assert.equal(p.category,'abbreviated');
 assert.deepEqual(p.arguments,full.arguments);assert.equal(p.arguments.some(a=>a==='--long'||a.includes('minimumReleaseAge')),false);
 for(const name of ['package.json','pnpm-lock.yaml','.npmrc'])assert.equal(p.files[name],full.files[name]);
 assert.deepEqual(JSON.parse(p.files['pnpm-workspace.yaml']),{packages:[],...p.queryPolicy,fetchRetries:0,fetchTimeout:15000,networkConcurrency:1});
 assert.equal(p.installableGraph,false);assert.equal(JSON.stringify(p).match(/"originalSelections"/g).length,1);
 assert.ok(p.expectedMirrorPaths.every(x=>x.includes('/v12/metadata/')));assert.ok(full.expectedMirrorPaths.every(x=>x.includes('/v12/metadata-full/')));
 assert.ok(Object.isFrozen(p.queryPolicy));assert.ok(Object.isFrozen(p.queryPolicy.minimumReleaseAgeExclude));
});
test('RAW3 projection hash binds canonical age even when generated age-zero files are identical',()=>{
 const a=projectNativeMetadataBatchQuery(query()),b=projectNativeMetadataBatchQuery({...query(),policy:{...query().policy,minimumReleaseAge:2880}});
 assert.deepEqual(a.files,b.files);assert.notEqual(a.projectionSHA256,b.projectionSHA256);
 assert.notEqual(a.projectionSHA256,projectNativeMetadataBatchQuery(base()).projectionSHA256);
 const scoped={...query(),names:['@red-cup-engineering/demo'],selections:[{...selections[0],name:'@red-cup-engineering/demo'}],registry:'https://registry.example:8443/'};
 scoped.selections[0].registry=scoped.registry;
 assert.match(projectNativeMetadataBatchQuery(scoped).expectedMirrorPaths[0],/metadata\/https%3A\+registry.example\+8443\/@red-cup-engineering\/demo.jsonl$/);
});
for(const change of [{purpose:refinement.purpose},{category:'abbreviated'},{purpose:'other',category:'abbreviated'},
 {...refinement,category:'metadata-full'},{...refinement,queryPolicy:{minimumReleaseAge:0}},{...refinement,arguments:['install']}])
 test('RAW1 refuses unpaired/unknown or caller-derived fields '+JSON.stringify(change),()=>assert.throws(()=>projectNativeMetadataBatchQuery({...base(),...change})));
test('RAW1-2 getters and caller age-zero/no-downgrade policy refuse without executing accessors',()=>{
 let calls=0;const q=query();Object.defineProperty(q,'category',{enumerable:true,get(){calls++;return'abbreviated'}});
 assert.throws(()=>projectNativeMetadataBatchQuery(q),/own-data/);
 const policy={...base().policy};Object.defineProperty(policy,'minimumReleaseAge',{enumerable:true,get(){calls++;return 1440}});
 assert.throws(()=>projectNativeMetadataBatchQuery({...query(),policy}),/own-data/);assert.equal(calls,0);
 assert.throws(()=>projectNativeMetadataBatchQuery({...query(),policy:{...base().policy,minimumReleaseAge:0}}),/nonzero/);
 assert.throws(()=>projectNativeMetadataBatchQuery({...query(),policy:{...base().policy,trustPolicy:'no-downgrade'}}),/no-downgrade/);
 assert.equal(projectNativeMetadataBatchQuery({...query(),policy:{...base().policy,trustPolicy:'off'}}).queryPolicy.trustPolicy,'off');
});
for(const [label,modified]of [['absent',undefined],['old','2020-01-01T00:00:00.000Z'],['recent','2026-10-25T20:00:00.000Z'],['invalid','not-a-date']])
 test('RAW5 missing time completes structural coverage with '+label+' modified, not maturity',stateOptions,async t=>{
  const f=await rawFixture(t),p=projectNativeMetadataBatchQuery(f.input.query);await mirrors(p,{modified});const seen=await receiveNativeMetadataBatchFiles(p);
  assert.equal(seen.allFilesObserved,true);for(const file of seen.files){assert.equal(file.rawCoverage.complete,true);assert.equal(file.rawCoverage.timestampCoverageComplete,false);
   assert.ok(file.rawCoverage.versions.every(v=>v.timestamp===null&&!v.validTimestamp&&v.manifestPresent));
   assert.deepEqual(file.rawCoverage.modified,{present:modified!==undefined,validTimestamp:['old','recent'].includes(label),timestamp:['old','recent'].includes(label)?modified:null});
   assert.ok(file.selectedIntegrityCoverage.every(v=>v.integrityMatches));}
  assert.equal(seen.nativeReaderConsumed,false);assert.equal(seen.strictPolicyVerified,false);assert.equal(seen.installationReceived,false);
 });
test('RAW5 invalid time, missing manifest and wrong SRI remain distinct raw diagnostics',stateOptions,async t=>{
 const f=await rawFixture(t),p=projectNativeMetadataBatchQuery(f.input.query);await mirrors(p,{time:'invalid',missingManifest:['alpha@1.1.0'],wrongIntegrity:['beta']});
 const seen=await receiveNativeMetadataBatchFiles(p);assert.equal(seen.files[0].rawCoverage.complete,false);assert.equal(seen.files[0].rawCoverage.timestampCoverageComplete,false);
 assert.equal(seen.files[1].rawCoverage.complete,true);assert.equal(seen.files[1].selectedIntegrityCoverage[0].integrityMatches,false);
 const other=await rawFixture(t,false),full=projectNativeMetadataBatchQuery(other.input.query);await mirrors(full);const fullSeen=await receiveNativeMetadataBatchFiles(full);
 assert.equal(fullSeen.files[0].rawCoverage.complete,false);assert.equal(Object.hasOwn(fullSeen.files[0].rawCoverage,'modified'),false);
});
test('RAW3/5 file receiving refuses category/queryPolicy/canonical-policy mutation',stateOptions,async t=>{
 const f=await rawFixture(t),p=projectNativeMetadataBatchQuery(f.input.query);await mirrors(p);
 for(const changed of [{...p,category:'full'},{...p,queryPolicy:p.policy},{...p,policy:{...p.policy,minimumReleaseAge:2880}},
  {...p,expectedMirrorPaths:p.expectedMirrorPaths.map(x=>x.replace('/metadata/','/metadata-full/'))}])await assert.rejects(receiveNativeMetadataBatchFiles(changed));
});
test('RAW4 existing session completes exact latest/wanted producer and offline reader without time',stateOptions,async t=>{
 const{f,p,launch}=await launched(t);const canonicalBefore={...p.projection.canonical};
 const first=await f.service.receive(p.ticket,{phase:'producer',executionReceipt:result(launch,p.projection)});assert.equal(first.accepted,true);
 const reader=await f.service.revalidate(p.ticket,{phase:'reader',environment:f.input.environment});assert.deepEqual(reader.request.arguments,[...launch.request.arguments,'--config.offline=true']);
 const received=await f.service.receive(p.ticket,{phase:'reader',executionReceipt:result(reader,p.projection,{status:0})});assert.equal(received.accepted,true);assert.equal(received.state,'complete');
 assert.equal(received.strictPolicyVerified,false);assert.equal(received.installationReceived,false);assert.deepEqual(p.projection.canonical,canonicalBefore);
 assert.equal(JSON.parse(await readFile(join(p.projection.directory,'pnpm-workspace.yaml'),'utf8')).minimumReleaseAge,0);
 await assert.rejects(f.service.revalidate(p.ticket,{phase:'reader',environment:f.input.environment}),/transition/);
 await assert.rejects(f.service.revalidate({...p.ticket},{phase:'producer',environment:f.input.environment}),/foreign/);
});
for(const scenario of ['missing-latest','wrong-latest','wrong-wanted','missing-name','extra-name','duplicate-name'])
 test('RAW4 refuses '+scenario+' and retains the synthetic original result',stateOptions,async t=>{
  const{f,p,launch}=await launched(t),value=output(p.projection);
  if(scenario==='missing-latest')delete value.alpha.latest;if(scenario==='wrong-latest')value.alpha.latest='1.1.0';if(scenario==='wrong-wanted')value.alpha.wanted='1.1.0';
  if(scenario==='missing-name')delete value.beta;if(scenario==='extra-name')value.gamma={wanted:'1.0.0',latest:'1.0.0'};
  const stdout=scenario==='duplicate-name'?'{"alpha":{"wanted":"1.0.0","latest":"1.0.0"},"\\u0061lpha":{"wanted":"1.0.0","latest":"1.0.0"},"beta":{"wanted":"2.0.0","latest":"2.0.0"}}':JSON.stringify(value);
  const original=result(launch,p.projection,{stdout}),received=await f.service.receive(p.ticket,{phase:'producer',executionReceipt:original});assert.equal(received.accepted,false);
  assert.deepEqual(JSON.parse(await readFile(received.raw.path,'utf8')),original);await assert.rejects(f.service.revalidate(p.ticket,{phase:'reader',environment:f.input.environment}),/transition/);
 });
test('RAW4 reader must independently report latest; full batch still accepts wanted-only',stateOptions,async t=>{
 const{f,p,launch}=await launched(t);await f.service.receive(p.ticket,{phase:'producer',executionReceipt:result(launch,p.projection)});
 const reader=await f.service.revalidate(p.ticket,{phase:'reader',environment:f.input.environment}),value=output(p.projection);delete value.beta.latest;
 assert.equal((await f.service.receive(p.ticket,{phase:'reader',executionReceipt:result(reader,p.projection,{stdout:JSON.stringify(value)})})).accepted,false);
 const old=await rawFixture(t,false),prepared=await old.service.prepare(old.input),oldLaunch=await old.service.revalidate(prepared.ticket,{phase:'producer',environment:old.input.environment});await mirrors(prepared.projection);
 const wanted=Object.fromEntries(prepared.projection.members.map(m=>[m.name,{wanted:m.representative}]));
 assert.equal((await old.service.receive(prepared.ticket,{phase:'producer',executionReceipt:execution(oldLaunch.request,{stdout:JSON.stringify(wanted)})})).accepted,true);
});
test('RAW6 full mirror coexists unchanged; selected abbreviated mirror cannot be adopted',stateOptions,async t=>{
 const f=await rawFixture(t),q=f.input.query,{purpose,category,...fullInput}=q,full=projectNativeMetadataBatchQuery(fullInput);await mirrors(full,{time:'2020-01-01T00:00:00.000Z'});
 const before=await Promise.all(full.expectedMirrorPaths.map(path=>readFile(path)));const p=await f.service.prepare(f.input);
 const seen=await receiveNativeMetadataBatchFiles(p.projection);assert.equal(seen.allFilesObserved,false);
 for(let i=0;i<before.length;i++)assert.deepEqual(await readFile(full.expectedMirrorPaths[i]),before[i]);
 const other=await rawFixture(t),otherProjection=projectNativeMetadataBatchQuery(other.input.query);await mirrors(otherProjection);
 await assert.rejects(other.service.prepare(other.input),/must be absent/);await assert.rejects(lstat(otherProjection.directory),{code:'ENOENT'});
});
test('RAW4/6 missing or changed selected mirror closes the raw session',stateOptions,async t=>{
 const missing=await launched(t,{omit:['beta']});assert.equal((await missing.f.service.receive(missing.p.ticket,{phase:'producer',executionReceipt:result(missing.launch,missing.p.projection)})).accepted,false);
 const{f,p,launch}=await launched(t);await f.service.receive(p.ticket,{phase:'producer',executionReceipt:result(launch,p.projection)});
 await writeFile(p.projection.members[0].expectedMirrorPath,'changed');await assert.rejects(f.service.revalidate(p.ticket,{phase:'reader',environment:f.input.environment}),/metadata changed/);
});
test('RAW1 invalid refinement refuses before query allocation; one-name service does not widen',stateOptions,async t=>{
 const f=await rawFixture(t);delete f.input.query.category;await assert.rejects(f.service.prepare(f.input));await assert.rejects(lstat(f.input.query.directory),{code:'ENOENT'});
 const one=await fixture(t);one.input.query={...one.input.query,...refinement};await assert.rejects(createNativeMetadataPreparationService().prepare(one.input),/unsupported/);
});
