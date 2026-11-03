import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFile,mkdir,symlink,copyFile,unlink,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {offlineFixture} from './native-precall-fixture.mjs';
import {receiveNativeOfflineInstall,receiveNativePrecallAdmission,assertNativePrecallAdmission,receiveNativeRegistryProjectionBinding,assertNativeRegistryProjectionBinding} from '../src/native-precall-admission.mjs';
const officialSupplier=process.env.PNPM_PRECALL_TEST_SUPPLIER;
const policy='registry-projection-consumer-v2';
async function setup(t){const f=await offlineFixture(t);return {...f,input:{...f.input,sourceProfile:'registry-consumer',registryProjectionPolicy:policy}};}
const authored='packages: []\nsideEffectsCache: false\n';
test('v2 refuses actual default true and explicitly true without launching native',async t=>{
 const f=await setup(t);
 await assert.rejects(receiveNativePrecallAdmission(f.input),/requires authored sideEffectsCache/);
 await writeFile(join(f.cwd,'pnpm-workspace.yaml'),'packages: []\nsideEffectsCache: true\n');
 await assert.rejects(receiveNativePrecallAdmission(f.input),/workspace value/);
});
test('v2 admits explicit false with absent v11 but cannot issue pre-execution or cloned proof',async t=>{
 const f=await setup(t);await writeFile(join(f.cwd,'pnpm-workspace.yaml'),authored);
 const cap=await receiveNativePrecallAdmission(f.input);
 await assertNativePrecallAdmission(cap,{cwd:f.cwd,program:'pnpm',arguments:f.input.installArguments});
 await assert.rejects(receiveNativeRegistryProjectionBinding(cap),/successful frozen/);
 await assert.rejects(receiveNativeRegistryProjectionBinding({...cap}),/successful frozen/);
 await assert.rejects(assertNativeRegistryProjectionBinding({version:2}),/process-local/);
});
test('v2 refuses redirected store and before-call store appearance',async t=>{
 const f=await setup(t);await writeFile(join(f.cwd,'pnpm-workspace.yaml'),authored);
 const cap=await receiveNativePrecallAdmission(f.input);await mkdir(join(f.cacheRoot,'pnpm-store','v11'));
 await assert.rejects(assertNativePrecallAdmission(cap,{cwd:f.cwd,program:'pnpm',arguments:f.input.installArguments}),/store custody changed/);
});
test('v2 refuses symlink effective store without changing target',async t=>{
 const f=await setup(t);await writeFile(join(f.cwd,'pnpm-workspace.yaml'),authored);
 await symlink(f.home,join(f.cacheRoot,'pnpm-store','v11'));
 await assert.rejects(receiveNativePrecallAdmission(f.input),/owned and unredirected/);
});
test('v2 refuses package config and lock transforms; strict default is unchanged',async t=>{
 const f=await setup(t);await writeFile(join(f.cwd,'pnpm-workspace.yaml'),authored);
 const strict={...f.input};delete strict.registryProjectionPolicy;
 await assert.rejects(receiveNativePrecallAdmission(strict),/workspace setting/);
 await writeFile(join(f.cwd,'package.json'),JSON.stringify({name:'fixture',pnpm:{sideEffectsCache:true}}));
 await assert.rejects(receiveNativePrecallAdmission(f.input),/manifest PNPM/);
 await writeFile(join(f.cwd,'package.json'),JSON.stringify({name:'fixture'}));
 await writeFile(join(f.cwd,'pnpm-lock.yaml'),"lockfileVersion: '9.0'\npatchedDependencies: {}\n");
 await assert.rejects(receiveNativePrecallAdmission(f.input),/lock transforms/);
});
test('v2 refuses prepared-online policy rather than granting unobserved receiving',async t=>{
 const f=await setup(t);f.input.qualificationMode='prepared-online-frozen';
 await assert.rejects(receiveNativePrecallAdmission(f.input),/registry frozen profile/);
});
async function syntheticResult(f) {
 const now=Date.now(),lockfilePath=join(f.cwd,'pnpm-lock.yaml');
 const start={name:'pnpm:lockfile-verification',status:'started',time:now,pid:123,level:'debug',entries:1,lockfilePath};
 const result={stdout:[start,{...start,status:'done',time:now+1,elapsedMs:1}].map(x=>JSON.stringify(x)+'\n').join(''),
 terminal:{invoked:true,code:0,signal:null},observation:{startedAt:now-100,endedAt:now+100,complete:true},lockfilePath};
 await writeFile(join(f.cacheRoot,'pnpm-metadata','lockfile-verified.jsonl'),JSON.stringify({lockfile:{path:lockfilePath},verifiedAt:new Date(now).toISOString()})+'\n');
 return result;
}
for(const existing of [false,true])test(`synthetic state only: v11 ${existing?'retained':'created'} transition and process-local binding`,async t=>{
 const f=await setup(t);await writeFile(join(f.cwd,'pnpm-workspace.yaml'),authored);
 const path=join(f.cacheRoot,'pnpm-store','v11');if(existing)await mkdir(path);
 const cap=await receiveNativePrecallAdmission(f.input);
 if(!existing)await mkdir(path);
 await receiveNativeOfflineInstall(cap,await syntheticResult(f));
 const binding=await receiveNativeRegistryProjectionBinding(cap);
 assert.equal(binding.storeBefore.exists,existing);assert.equal(binding.storeAfter.exists,true);
 assert.equal(binding.observedRoute,null);assert.equal(binding.routeEvidence,'source-qualified-closed-set');
 assert.equal(binding.sideEffectsCacheRead,false);assert.ok(Object.isFrozen(binding.configuration));
 assert.equal(await assertNativeRegistryProjectionBinding(binding),binding);
 await assert.rejects(assertNativeRegistryProjectionBinding(JSON.parse(JSON.stringify(binding))),/process-local/);
 await writeFile(join(f.cwd,'pnpm-workspace.yaml'),authored+'# drift\n');
 await assert.rejects(assertNativeRegistryProjectionBinding(binding),/custody changed/);
 t.diagnostic('Synthetic reporter/state-machine evidence only; no PNPM or extraction route executed.');
});
test('synthetic state only: absent after v11 refuses and closes original capability',async t=>{
 const f=await setup(t);await writeFile(join(f.cwd,'pnpm-workspace.yaml'),authored);
 const cap=await receiveNativePrecallAdmission(f.input);
 await assert.rejects(receiveNativeOfflineInstall(cap,await syntheticResult(f)),/store creation/);
 await assert.rejects(receiveNativeRegistryProjectionBinding(cap),/successful frozen/);
 await assert.rejects(assertNativePrecallAdmission(cap),/capability is closed/);
});
test('actual copied provider worker drift refuses before any native invocation',async t=>{
 const f=await setup(t);await writeFile(join(f.cwd,'pnpm-workspace.yaml'),authored);
 const supplier=join(f.root,'supplier');await mkdir(supplier);await mkdir(join(supplier,'bin'));await mkdir(join(supplier,'dist'));
 for(const file of ['package.json','bin/pnpm.cjs','bin/pnpm.mjs','dist/pnpm.mjs','dist/pnpmrc','dist/worker.js'])
   await copyFile(join(officialSupplier,file),join(supplier,file));
 await unlink(join(f.bin,'pnpm'));await symlink(join(supplier,'bin/pnpm.cjs'),join(f.bin,'pnpm'));
 const cap=await receiveNativePrecallAdmission(f.input);
 await writeFile(join(supplier,'dist/worker.js'),'changed');
 await assert.rejects(assertNativePrecallAdmission(cap,{cwd:f.cwd,program:'pnpm',arguments:f.input.installArguments}),/unqualified registry worker/);
});
