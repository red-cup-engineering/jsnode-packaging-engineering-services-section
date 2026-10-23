import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, readFile, mkdir, rename, symlink } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fixture, execution, syntheticMirror, sha } from './native-metadata-session-fixture.mjs';
const options={skip:!process.env.QUALIFIED_PNPM_ENTRY};

test('metadata ticket producer and reader are separate one-issuance transitions',options,async t=>{
 const f=await fixture(t),p=await f.service.prepare(f.input);
 await assert.rejects(f.service.revalidate(p.ticket,{phase:'reader',environment:f.input.environment}),/transition/);
 const launch=await f.service.revalidate(p.ticket,{phase:'producer',environment:f.input.environment});
 await assert.rejects(f.service.revalidate(p.ticket,{phase:'producer',environment:f.input.environment}),/transition/);
 await syntheticMirror(p.projection);
 const received=await f.service.receive(p.ticket,{phase:'producer',executionReceipt:execution(launch.request)});
 assert.equal(received.accepted,true);assert.equal(received.state,'producer-received');assert.equal(received.mirror.rawCoverage.complete,false);
 const reader=await f.service.revalidate(p.ticket,{phase:'reader',environment:f.input.environment});
 assert.equal(reader.request.arguments.at(-1),'--config.offline=true');
 assert.equal(reader.request.directory,launch.request.directory);
 const result=await f.service.receive(p.ticket,{phase:'reader',executionReceipt:execution(reader.request)});
 assert.equal(result.state,'complete');assert.equal(result.installationReceived,false);assert.equal(result.strictPolicyVerified,false);
 await assert.rejects(f.service.receive(p.ticket,{phase:'reader',executionReceipt:execution(reader.request)}),/transition/);
});

test('foreign ticket refusal does not damage prepared ticket',options,async t=>{
 const f=await fixture(t),p=await f.service.prepare(f.input);
 await assert.rejects(f.service.revalidate({...p.ticket},{phase:'producer',environment:f.input.environment}),/foreign/);
 assert.ok((await f.service.revalidate(p.ticket,{phase:'producer',environment:f.input.environment})).request);
 const result=await f.service.receive(p.ticket,{phase:'producer',uncertain:true});assert.equal(result.state,'unknown');
 await assert.rejects(f.service.revalidate(p.ticket,{phase:'producer',environment:f.input.environment}),/transition/);
});

for(const scenario of ['missing','wrong-identity','native-error','truncated','changed-query'])test(`metadata receipt refuses ${scenario}`,options,async t=>{
 const f=await fixture(t),p=await f.service.prepare(f.input),launch=await f.service.revalidate(p.ticket,{phase:'producer',environment:f.input.environment});
 if(scenario!=='missing')await syntheticMirror(p.projection);
 const overrides=scenario==='wrong-identity'?{stdout:JSON.stringify({'ticket-fixture':{wanted:'2.0.0'}})}:scenario==='native-error'?{status:null,error:'synthetic failure'}:scenario==='truncated'?{stdout:'x'.repeat(1048576)}:{};
 if(scenario==='changed-query')await writeFile(join(p.projection.directory,'.npmrc'),'changed');
 const result=await f.service.receive(p.ticket,{phase:'producer',executionReceipt:execution(launch.request,overrides)});
 assert.equal(result.accepted,false);assert.equal(result.state,'failed');
 const raw=JSON.parse(await readFile(result.raw.path,'utf8'));assert.deepEqual(raw.result,execution(launch.request,overrides).result);
 await assert.rejects(f.service.revalidate(p.ticket,{phase:'reader',environment:f.input.environment}),/transition/);
});

test('existing selected mirror refuses fresh production without deleting it',options,async t=>{
 const f=await fixture(t);const path=join(f.input.query.cacheDirectory,'v12','metadata-full','https%3A+registry.example','ticket-fixture.jsonl');
 await mkdir(dirname(path),{recursive:true});await writeFile(path,'existing');
 await assert.rejects(f.service.prepare(f.input),/must be absent/);assert.equal(await readFile(path,'utf8'),'existing');
});

test('new default hook is refused before request issuance',options,async t=>{
 const f=await fixture(t),p=await f.service.prepare(f.input);await writeFile(join(p.projection.directory,'.pnpmfile.mjs'),'throw Error("never execute")');
 await assert.rejects(f.service.revalidate(p.ticket,{phase:'producer',environment:f.input.environment}),/configuration source/);
});

test('different relay roles retain exact values and stable policy refuses changes',options,async t=>{
 const f=await fixture(t);f.input.environment.HTTP_PROXY='http://127.0.0.1:1234';f.input.environment.ALL_PROXY='socks5h://127.0.0.1:5678';
 f.input.environmentPolicy.relays={HTTP_PROXY:{protocol:'http:',hostnameSHA256:sha('127.0.0.1')},ALL_PROXY:{protocol:'socks5h:',hostnameSHA256:sha('127.0.0.1')}};
 const p=await f.service.prepare(f.input),env={...f.input.environment,HTTP_PROXY:'http://127.0.0.1:4321'};
 const launch=await f.service.revalidate(p.ticket,{phase:'producer',environment:env});assert.deepEqual(launch.request.environment,env);
 assert.notEqual(launch.request.environment,env);
});

test('wrong request receipt refuses without advancing',options,async t=>{
 const f=await fixture(t),p=await f.service.prepare(f.input),launch=await f.service.revalidate(p.ticket,{phase:'producer',environment:f.input.environment});
 await assert.rejects(f.service.receive(p.ticket,{phase:'producer',executionReceipt:execution({...launch.request,directory:f.root})}),/request mismatch/);
 await assert.rejects(f.service.revalidate(p.ticket,{phase:'reader',environment:f.input.environment}),/transition/);
});

test('changed received mirror cannot issue an offline reader',options,async t=>{
 const f=await fixture(t),p=await f.service.prepare(f.input),launch=await f.service.revalidate(p.ticket,{phase:'producer',environment:f.input.environment});
 await syntheticMirror(p.projection);assert.equal((await f.service.receive(p.ticket,{phase:'producer',executionReceipt:execution(launch.request)})).accepted,true);
 await writeFile(p.projection.expectedMirrorPath,'changed');
 await assert.rejects(f.service.revalidate(p.ticket,{phase:'reader',environment:f.input.environment}),/metadata changed/);
});

test('phase receipt conflict blocks request issuance',options,async t=>{
 const f=await fixture(t),p=await f.service.prepare(f.input);await writeFile(join(f.input.receiptDirectory,'producer-launch.json'),'existing');
 await assert.rejects(f.service.revalidate(p.ticket,{phase:'producer',environment:f.input.environment}),{code:'EEXIST'});
 assert.equal(await readFile(join(f.input.receiptDirectory,'producer-launch.json'),'utf8'),'existing');
 await assert.rejects(f.service.revalidate(p.ticket,{phase:'producer',environment:f.input.environment}),/transition/);
});

test('global config and credential-bearing relay profiles refuse without native execution',options,async t=>{
 const f=await fixture(t);await mkdir(join(f.input.environment.XDG_CONFIG_HOME,'pnpm'));await writeFile(join(f.input.environment.XDG_CONFIG_HOME,'pnpm/config.yaml'),'configDependencies: {}\n');
 await assert.rejects(f.service.prepare(f.input),/configuration source/);
 const other=await fixture(t);other.input.environment.HTTP_PROXY='http://user:synthetic@127.0.0.1:1234';other.input.environmentPolicy.relays.HTTP_PROXY={protocol:'http:',hostnameSHA256:sha('127.0.0.1')};
 await assert.rejects(other.service.prepare(other.input),/credential bearing/);
});

test('unknown fields, getters and unqualified limits refuse before provider inspection',async()=>{
 const {createNativeMetadataPreparationService}=await import('../src/native-metadata-preparation.mjs');
 const service=createNativeMetadataPreparationService();let called=false;
 await assert.rejects(service.prepare({get program(){called=true;return 'invalid';}}),/data field/);assert.equal(called,false);
 await assert.rejects(service.prepare({unknown:true}),/data field/);
});

test('receipt getter is rejected rather than executed',options,async t=>{
 const f=await fixture(t),p=await f.service.prepare(f.input),launch=await f.service.revalidate(p.ticket,{phase:'producer',environment:f.input.environment});
 const r=execution(launch.request);let called=false;Object.defineProperty(r.result,'stdout',{enumerable:true,get(){called=true;return '{}';}});
 await assert.rejects(f.service.receive(p.ticket,{phase:'producer',executionReceipt:r}),/own-data/);assert.equal(called,false);
});

for(const target of ['cache','receipts'])test(`redirected ${target} root refuses before request issuance`,options,async t=>{
 const f=await fixture(t),p=await f.service.prepare(f.input);
 const path=target==='cache'?f.input.query.cacheDirectory:f.input.receiptDirectory;
 await rename(path,path+'-retained');await symlink(path+'-retained',path);
 await assert.rejects(f.service.revalidate(p.ticket,{phase:'producer',environment:f.input.environment}),/real existing private directory/);
 await assert.rejects(f.service.revalidate(p.ticket,{phase:'producer',environment:f.input.environment}),/transition/);
});

test('native null error is not the original executor result contract',options,async t=>{
 const f=await fixture(t),p=await f.service.prepare(f.input),launch=await f.service.revalidate(p.ticket,{phase:'producer',environment:f.input.environment});
 await assert.rejects(f.service.receive(p.ticket,{phase:'producer',executionReceipt:execution(launch.request,{error:null})}),/result contract/);
});
