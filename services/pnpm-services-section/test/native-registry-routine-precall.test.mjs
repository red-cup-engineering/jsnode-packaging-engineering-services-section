import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFile,mkdir,lstat,appendFile,readFile,rename} from 'node:fs/promises';
import {join} from 'node:path';
import {offlineFixture} from './native-precall-fixture.mjs';
import {receiveNativePrecallAdmission,assertNativePrecallAdmission,receiveNativeOfflineInstall,
 receiveNativePreparedInstallAdmission,receiveNativePreparedInstall,receiveNativeRegistryProjectionBinding,
 assertNativeRegistryProjectionBinding,receiveNativeRegistryProjectionSourceCustody,
 assertNativeRegistryProjectionSourceCustody,deriveNativeLifecycleDisabledInstallArguments,
 deriveNativePreparedOfflineInstallArguments} from '../src/native-precall-admission.mjs';
const policy='registry-projection-consumer-v2';
const authored='packages: []\nsideEffectsCache: false\n';
async function setup(t){const f=await offlineFixture(t);await writeFile(join(f.cwd,'pnpm-workspace.yaml'),authored);return {...f,input:{...f.input,sourceProfile:'registry-consumer',registryProjectionPolicy:policy}};}
async function initial(t){
 const f=await setup(t),cap=await receiveNativePrecallAdmission(f.input),now=Date.now(),lockfilePath=join(f.cwd,'pnpm-lock.yaml');
 await mkdir(join(f.cacheRoot,'pnpm-store','v11'));
 const stat=await lstat(lockfilePath,{bigint:true});
 const record={lockfile:{path:lockfilePath,hash:'synthetic-opaque-native-hash',size:Number(stat.size),mtimeNs:String(stat.mtimeNs),inode:String(stat.ino)},verifiedAt:new Date(now).toISOString(),policy:{synthetic:true}};
 const history=join(f.cacheRoot,'pnpm-metadata','lockfile-verified.jsonl');await writeFile(history,JSON.stringify(record)+'\n');
 const start={name:'pnpm:lockfile-verification',status:'started',time:now,pid:123,level:'debug',entries:1,lockfilePath};
 await receiveNativeOfflineInstall(cap,{stdout:[start,{...start,status:'done',time:now+1,elapsedMs:1}].map(x=>JSON.stringify(x)+'\n').join(''),terminal:{invoked:true,code:0,signal:null},observation:{startedAt:now-100,endedAt:now+100,complete:true},lockfilePath});
 return {...f,cap,record,history,lockfilePath};
}
function cached(f,verifiedAt=f.record.verifiedAt){const now=Date.now();return {stdout:JSON.stringify({name:'pnpm:lockfile-verification',status:'cached',time:now,pid:123,level:'debug',lockfilePath:f.lockfilePath,verifiedAt})+'\n',terminal:{invoked:true,code:0,signal:null,timedOut:false,truncated:false,failedToStart:false},observation:{startedAt:now-100,endedAt:now+100,complete:true},lockfilePath:f.lockfilePath};}
test('synthetic same-path routine state: initial private success → cached successor → repeated routine',async t=>{
 const f=await initial(t),before=await readFile(f.history);
 const cap=await receiveNativePreparedInstallAdmission(f.cap,{offline:true});
 assert.ok(cap.transformation.derivedArguments.includes('--no-optimistic-repeat-install'));
 await assertNativePrecallAdmission(cap,{cwd:f.cwd,program:'pnpm',arguments:cap.transformation.derivedArguments});
 await assert.rejects(receiveNativePreparedInstallAdmission(f.cap,{offline:true}),/original received/);
 const receipt=await receiveNativePreparedInstall(cap,cached(f));
 assert.equal(receipt.policyVerification,'cached-native');assert.equal(receipt.freshPolicyRecomputationReceived,false);
 const binding=await receiveNativeRegistryProjectionBinding(cap);assert.deepEqual(binding.storeBefore,binding.storeAfter);
 assert.equal(binding.observedRoute,null);await assertNativeRegistryProjectionBinding(binding);
 const successor=await receiveNativePreparedInstallAdmission(cap,{offline:true});
 await receiveNativePreparedInstall(successor,cached(f));await receiveNativeRegistryProjectionBinding(successor);
 assert.deepEqual(await readFile(f.history),before);
 t.diagnostic('Synthetic state-machine replay only; no native policy, installation or runtime branch is claimed.');
});
test('routine requires private completed lineage and offline reporter; source-only cannot be predecessor',async t=>{
 const f=await initial(t);
 await assert.rejects(receiveNativePreparedInstallAdmission({...f.cap},{offline:true}),/original received/);
 await assert.rejects(receiveNativePreparedInstallAdmission(f.cap,{offline:false}),/prepared offline/);
 const staticCap=await receiveNativePrecallAdmission({...f.input,qualificationMode:'prepared-offline-frozen',installArguments:deriveNativePreparedOfflineInstallArguments(f.input.originalInstallArguments)});
 await assert.rejects(receiveNativePreparedInstall(staticCap,cached(f)),/unrecognized/);
 await assert.rejects(receiveNativeRegistryProjectionBinding(staticCap),/successful frozen/);
});
for(const change of ['source','history','store','lock-stat'])test('routine predecessor rejects '+change+' drift without effects',async t=>{
 const f=await initial(t);
 if(change==='source')await appendFile(join(f.cwd,'pnpm-workspace.yaml'),'# drift\n');
 if(change==='history')await appendFile(f.history,JSON.stringify({...f.record,verifiedAt:'wrong'})+'\n');
 if(change==='store'){const p=join(f.cacheRoot,'pnpm-store','v11');await rename(p,p+'-preserved');await mkdir(p);}
 if(change==='lock-stat'){const content=await readFile(f.lockfilePath);await rename(f.lockfilePath,f.lockfilePath+'.preserved');await writeFile(f.lockfilePath,content);}
 await assert.rejects(receiveNativePreparedInstallAdmission(f.cap,{offline:true}),/changed|history\/stat/);
 await assert.rejects(receiveNativePreparedInstallAdmission(f.cap,{offline:true}),/original received/);
});
test('routine wrong cached timestamp consumes capability, cannot mint projection or retry',async t=>{
 const f=await initial(t),cap=await receiveNativePreparedInstallAdmission(f.cap,{offline:true});
 await assert.rejects(receiveNativePreparedInstall(cap,cached(f,new Date(0).toISOString())),/cached native verification/);
 await assert.rejects(receiveNativePreparedInstall(cap,cached(f)),/closed/);
 await assert.rejects(receiveNativeRegistryProjectionBinding(cap),/successful frozen/);
});
test('fresh-only receiving still refuses cached; no routine fallback for failed capability',async t=>{
 const f=await setup(t),cap=await receiveNativePrecallAdmission(f.input),now=Date.now();
 const result=cached({...f,record:{verifiedAt:new Date(now-1000).toISOString()},lockfilePath:join(f.cwd,'pnpm-lock.yaml')});
 delete result.terminal.timedOut;delete result.terminal.truncated;delete result.terminal.failedToStart;
 await assert.rejects(receiveNativeOfflineInstall(cap,result),/fresh native verification/);
 await assert.rejects(receiveNativePreparedInstallAdmission(cap,{offline:true}),/original received/);
});
test('source-only v2 custody validates authored false and cannot authorize native or binding',async t=>{
 const f=await setup(t),input={...f.input};delete input.qualificationMode;delete input.cacheRoot;
 input.installArguments=deriveNativeLifecycleDisabledInstallArguments(input.originalInstallArguments);
 const cap=await receiveNativeRegistryProjectionSourceCustody(input);await assertNativeRegistryProjectionSourceCustody(cap);
 await assert.rejects(assertNativeRegistryProjectionSourceCustody({...cap}),/unrecognized/);
 await assert.rejects(assertNativePrecallAdmission(cap),/read-only/);
 await assert.rejects(assertNativePrecallAdmission(cap,{cwd:f.cwd,program:'pnpm',arguments:input.installArguments}),/read-only/);
 await assert.rejects(receiveNativePreparedInstallAdmission(cap,{offline:true}),/original received/);
 await assert.rejects(receiveNativeRegistryProjectionBinding(cap),/successful frozen/);
 await appendFile(join(f.cwd,'pnpm-workspace.yaml'),'# drift\n');
 await assert.rejects(assertNativeRegistryProjectionSourceCustody(cap),/custody changed/);
});
for(const change of ['history','store','partial-output','failed-terminal'])test('routine post-execution '+change+' refusal is terminal and preserves evidence',async t=>{
 const f=await initial(t),cap=await receiveNativePreparedInstallAdmission(f.cap,{offline:true}),result=cached(f);
 if(change==='history')await appendFile(f.history,'{"lockfile":');
 if(change==='store'){const p=join(f.cacheRoot,'pnpm-store','v11');await rename(p,p+'-preserved');await mkdir(p);}
 if(change==='partial-output')result.observation.complete=false;
 if(change==='failed-terminal')result.terminal.code=1;
 await assert.rejects(receiveNativePreparedInstall(cap,result),error=>error.nativePreparedEvidence?.capabilityClosed===true&&error.nativePreparedEvidence.localChangesMayExist===true);
 await assert.rejects(receiveNativePreparedInstall(cap,cached(f)),/closed/);
 await assert.rejects(receiveNativeRegistryProjectionBinding(cap),/successful frozen/);
});
