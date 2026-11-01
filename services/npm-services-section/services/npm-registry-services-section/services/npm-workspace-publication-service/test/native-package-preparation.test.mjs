import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {resolve} from 'node:path';
import {createNativePackagePreparationWorker} from '../src/native-package-preparation.mjs';
const p=process.env.NPM_PACKAGE_PREPARATION_TEST_BINDINGS,bindings=p?JSON.parse(await readFile(resolve(p))):null;
test('package constructor refuses getters and arbitrary execution ports before evaluation',async()=>{let calls=0;const input={};Object.defineProperty(input,'bindings',{enumerable:true,get(){calls++;return bindings;}});await assert.rejects(createNativePackagePreparationWorker(input),/unsupported worker/);assert.equal(calls,0);await assert.rejects(createNativePackagePreparationWorker({bindings,execute:()=>{}}),/unsupported worker/);});
test('qualified constructor refuses changed source role, missing env launcher and closure member',{skip:!bindings},async()=>{
 for(const role of ['pnpmPrecallModule','pnpmLockDeltaModule','yamlModule','env']){const b=structuredClone(bindings);delete b[role];await assert.rejects(createNativePackagePreparationWorker({bindings:b}),/missing worker field/);}
 const b=structuredClone(bindings);b.files=b.files.filter(f=>f.path!==b.yamlModule);await assert.rejects(createNativePackagePreparationWorker({bindings:b}),/supplier/);
});
test('JSON tickets and arbitrary commands never become prepared execution',{skip:!bindings},async()=>{
 const service=await createNativePackagePreparationWorker({bindings});for(const ticket of [{},{kind:'npm.native-package-preparation.ticket.v1',phase:'refreshed'}]){await assert.rejects(service.materialize(ticket,{attemptDirectory:'/tmp/uncreated-native-attempt',content:[],selectedArtifacts:[]}),/original unused/);await assert.rejects(service.materializeOffline(ticket,{attemptDirectory:'/tmp/uncreated-native-attempt',content:[],selectedArtifacts:[]}),/original unused/);await assert.rejects(service.verifyOffline(ticket,{attemptDirectory:'/tmp/uncreated-native-attempt'}),/original unused/);await assert.rejects(service.verifyFrozenOffline(ticket,{attemptDirectory:'/tmp/uncreated-native-attempt'}),/original unused/);}
 await assert.rejects(service.refresh({command:'/bin/true'}),/unsupported worker field/);
 const abort=new AbortController();abort.abort();await assert.rejects(service.refresh({}, {signal:abort.signal}),{code:'ABORT_ERR'});
});
