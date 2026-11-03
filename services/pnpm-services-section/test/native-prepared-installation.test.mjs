// Synthetic custody/grammar receiving only: no native process is invoked here.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,lstat} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {receiveNativePrecallAdmission,assertNativePrecallAdmission,deriveNativeOfflineLockfileRefreshArguments,
  deriveNativeOfflineFrozenInstallArguments,deriveNativePreparedOfflineInstallArguments,deriveNativePreparedOnlineInstallArguments,deriveNativeLifecycleDisabledInstallArguments,
  receiveNativeOfflineInstall,receiveNativeLockfileRefresh,receiveNativePreparedInstallAdmission,receiveNativePreparedInstall} from '../src/native-precall-admission.mjs';
import {receiveNativeOfflineVerification,receiveNativeCachedVerification} from '../src/native-observation.mjs';
const supplier=process.env.PNPM_PRECALL_TEST_SUPPLIER;
const sha=x=>createHash('sha256').update(x).digest('hex');
const terminal=()=>({invoked:true,code:0,signal:null,timedOut:false,truncated:false,failedToStart:false});
const observed=(time=Date.now())=>({startedAt:time-1000,endedAt:time+1000,complete:true});
const outcome=(f,events=[],time=Date.now())=>({terminal:terminal(),observation:observed(time),lockfilePath:f.lock,stdout:events.map(x=>JSON.stringify(x)+'\n').join('')});
const cached=(f,time=Date.now())=>({name:'pnpm:lockfile-verification',status:'cached',level:'debug',time,pid:123,lockfilePath:f.lock,verifiedAt:f.verifiedAt});
async function fixture(t){
  const root=await mkdtemp(join(tmpdir(),'pnpm-prepared-synthetic-')),cwd=join(root,'source'),home=join(root,'home'),cacheRoot=join(root,'allocation');
  await Promise.all([mkdir(cwd),mkdir(home),mkdir(cacheRoot,{mode:0o700})]);
  await Promise.all([mkdir(join(cacheRoot,'pnpm-metadata')),mkdir(join(cacheRoot,'pnpm-store'))]);
  const environment={PATH:dirname(process.execPath)+':/usr/bin:/bin',HOME:home,TMPDIR:root,TEMP:root,TMP:root,
    npm_config_userconfig:join(home,'npmrc'),npm_config_globalconfig:join(home,'global-npmrc'),
    npm_config_ignore_scripts:'true',npm_config_update_notifier:'false',npm_config_audit:'false',npm_config_fund:'false'};
  const lock=join(cwd,'pnpm-lock.yaml'),history=join(cacheRoot,'pnpm-metadata','lockfile-verified.jsonl');
  await Promise.all([writeFile(environment.npm_config_userconfig,''),writeFile(environment.npm_config_globalconfig,''),
    writeFile(join(cwd,'package.json'),JSON.stringify({name:'prepared-fixture',version:'1.0.0'})),
    writeFile(join(cwd,'pnpm-workspace.yaml'),'packages: []\nminimumReleaseAge: 1440\nminimumReleaseAgeStrict: true\n'),
    writeFile(join(cwd,'.npmrc'),'registry=https://registry.example/\n'),writeFile(lock,"lockfileVersion: '9.0'\nimporters:\n  .: {}\n")]);
  t.after(()=>rm(root,{recursive:true,force:true}));
  const originalInstallArguments=['install','--no-frozen-lockfile','--registry','https://registry.example/','--cache-dir',join(cacheRoot,'pnpm-metadata'),'--store-dir',join(cacheRoot,'pnpm-store'),'--config.prefer-offline=false'];
  const input={cwd,pnpm:join(supplier,'bin','pnpm.mjs'),operation:'lockfile-refresh',sourceProfile:'root-package-no-manager-pin',qualificationMode:'offline-lockfile-refresh',cacheRoot,
    originalInstallArguments,installArguments:deriveNativeOfflineLockfileRefreshArguments(originalInstallArguments),environmentProfile:'inherited-native-transport',environment,
    environmentPolicy:{stable:{PATH:sha(environment.PATH),HOME:sha(home)},relays:{}}};
  const cap=await receiveNativePrecallAdmission(input);
  return {root,cwd,input,cap,lock,history};
}
async function refresh(f){
  await writeFile(f.lock,(await readFile(f.lock,'utf8'))+'# synthetic changed lock\n');
  const stat=await lstat(f.lock,{bigint:true});f.verifiedAt=new Date().toISOString();
  f.row={lockfile:{path:f.lock,hash:'opaque-native-hash',size:Number(stat.size),mtimeNs:String(stat.mtimeNs),inode:String(stat.ino)},verifiedAt:f.verifiedAt,policy:{minimumReleaseAge:1440}};
  await writeFile(f.history,JSON.stringify(f.row)+'\n');
  return receiveNativeLockfileRefresh(f.cap,outcome(f));
}
const profile=(name,fn)=>test(name,{skip:!supplier},fn);
profile('prepared capability requires original received predecessor and remains process-local',async t=>{
 const f=await fixture(t);await assert.rejects(receiveNativePreparedInstallAdmission(f.cap),/received/);await refresh(f);
 await assert.rejects(receiveNativePreparedInstallAdmission({...f.cap}),/process-local/);
 const cap=await receiveNativePreparedInstallAdmission(f.cap);assert.equal(cap.offline,false);
 assert.equal(cap.transformation.kind,'pnpm.prepared-online-frozen.v1');
 assert.equal(cap.transformation.derivedArguments.at(-1),'--config.update-notifier=false');
 await assertNativePrecallAdmission(cap,{cwd:f.cwd,program:f.input.pnpm,arguments:cap.transformation.derivedArguments,environment:f.input.environment});
 await assert.rejects(receiveNativePreparedInstallAdmission(f.cap),/received/);
});
profile('online receiving does not invent policy verification; exact cached offline may follow',async t=>{
 const f=await fixture(t);await refresh(f);const online=await receiveNativePreparedInstallAdmission(f.cap);
 const r=await receiveNativePreparedInstall(online,outcome(f));assert.equal(r.policyVerification,'not-observed');assert.equal(r.installedArtifactMembersReceived,false);
 await assert.rejects(assertNativePrecallAdmission(online,{cwd:f.cwd,program:f.input.pnpm,arguments:online.transformation.derivedArguments,environment:f.input.environment}),/closed/);
 const offline=await receiveNativePreparedInstallAdmission(online,{offline:true});
 assert.equal(offline.transformation.kind,'pnpm.prepared-offline-frozen.v1');
 assert.equal(offline.transformation.derivedArguments.at(-1),'--no-optimistic-repeat-install');
 const received=await receiveNativePreparedInstall(offline,outcome(f,[cached(f)]));assert.equal(received.policyVerification,'cached-native');assert.equal(received.freshPolicyRecomputationReceived,false);
 await assert.rejects(receiveNativePreparedInstall(offline,outcome(f,[cached(f)])),/closed/);
});
profile('prepared admission refuses changed source, history or same-bytes changed stat',async t=>{
 for(const what of ['source','history','stat']){const f=await fixture(t);await refresh(f);
  if(what==='source')await writeFile(join(f.cwd,'package.json'),'{}');
  else if(what==='history')await writeFile(f.history,'');
  else await writeFile(f.lock,await readFile(f.lock));
  await assert.rejects(receiveNativePreparedInstallAdmission(f.cap),/changed|stat/);
  await assert.rejects(receiveNativePreparedInstallAdmission(f.cap),/received/);
 }
});
profile('history latest same-path malformed row is not skipped in favor of older valid row',async t=>{
 const f=await fixture(t);await writeFile(f.lock,'changed');const stat=await lstat(f.lock,{bigint:true});const at=new Date().toISOString();
 const row={lockfile:{path:f.lock,hash:'opaque',size:Number(stat.size),mtimeNs:String(stat.mtimeNs),inode:String(stat.ino)},verifiedAt:at,policy:{}};
 await writeFile(f.history,JSON.stringify(row)+'\n'+JSON.stringify({...row,verifiedAt:'invalid'})+'\n');await receiveNativeLockfileRefresh(f.cap,outcome(f));
 await assert.rejects(receiveNativePreparedInstallAdmission(f.cap),/causality/);
});
profile('post-operation history mutation refuses and closes without rollback',async t=>{
 const f=await fixture(t);await refresh(f);const cap=await receiveNativePreparedInstallAdmission(f.cap,{offline:true});
 await writeFile(f.history,JSON.stringify(f.row)+'\n'+JSON.stringify(f.row)+'\n');
 await assert.rejects(receiveNativePreparedInstall(cap,outcome(f,[cached(f)])),/history changed/);
 assert.equal((await readFile(f.history,'utf8')).split('\n').length,3);
 await assert.rejects(receiveNativePreparedInstall(cap,outcome(f,[cached(f)])),/closed/);
});
profile('failed original terminal cannot become prepared success',async t=>{
 for(const change of [{code:1},{signal:'SIGKILL'},{timedOut:true},{truncated:true},{failedToStart:true}]){
  const f=await fixture(t);await refresh(f);const cap=await receiveNativePreparedInstallAdmission(f.cap),result=outcome(f);Object.assign(result.terminal,change);
  await assert.rejects(receiveNativePreparedInstall(cap,result),/successful complete/);
 }
});
test('cached observation is separate from unchanged fresh-only contract',()=>{
 const f={lock:'/source/pnpm-lock.yaml',verifiedAt:new Date(1000).toISOString()},result={stdout:JSON.stringify(cached(f,2000))+'\n',lockfilePath:f.lock,terminal:{invoked:true,code:0,signal:null},observation:{startedAt:1500,endedAt:2500,complete:true}};
 assert.equal(receiveNativeOfflineVerification(result).accepted,false);assert.equal(receiveNativeCachedVerification(result,f.verifiedAt).accepted,true);
 for(const event of [{...cached(f,2000),verifiedAt:new Date(3000).toISOString()},{...cached(f,2000),pid:0},{...cached(f,2000),lockfilePath:'/another'},cached(f,900)])
  assert.equal(receiveNativeCachedVerification({...result,stdout:JSON.stringify(event)+'\n'},event.verifiedAt).accepted,false);
 for(const stdout of [result.stdout+result.stdout,result.stdout.trim(),result.stdout+'not-json\n'])assert.equal(receiveNativeCachedVerification({...result,stdout},f.verifiedAt).accepted,false);
});

test('prepared options refuse getters without evaluating them',async()=>{let calls=0;const options={};Object.defineProperty(options,'offline',{enumerable:true,get(){calls++;return true;}});await assert.rejects(receiveNativePreparedInstallAdmission({},options),/own-data/);assert.equal(calls,0);});

test('prepared verifier derivation is exact and idempotent without changing legacy arguments',()=>{
 const original=['install','--frozen-lockfile','--registry','https://registry.example/','--cache-dir','/allocation/pnpm-metadata','--store-dir','/allocation/pnpm-store','--config.prefer-offline=false'];
 const before=original.slice(),legacy=[...original,'--ignore-scripts','--offline','--reporter=ndjson'],prepared=[...legacy,'--no-optimistic-repeat-install'];
 assert.deepEqual(deriveNativeOfflineFrozenInstallArguments(original),legacy);
 assert.deepEqual(deriveNativeOfflineFrozenInstallArguments(legacy),legacy);
 for(const input of [original,legacy,prepared])assert.deepEqual(deriveNativePreparedOfflineInstallArguments(input),prepared);
 assert.deepEqual(original,before);assert.ok(Object.isFrozen(deriveNativePreparedOfflineInstallArguments(original)));
 assert.throws(()=>deriveNativeOfflineFrozenInstallArguments(prepared));
 assert.throws(()=>deriveNativeLifecycleDisabledInstallArguments(prepared));
 for(const args of [[...prepared,'--force'],[...legacy,'--optimistic-repeat-install=false'],[...legacy,'--no-optimistic-repeat-install','--no-optimistic-repeat-install'],[...legacy,'--no-minimum-release-age'],[...prepared.slice(0,11),'--no-optimistic-repeat-install','--reporter=ndjson']])assert.throws(()=>deriveNativePreparedOfflineInstallArguments(args));
});
profile('new static mode admits only exact verifier/vector and version, never prepared authority',async t=>{
 const f=await fixture(t),original=f.input.originalInstallArguments.slice();original[1]='--frozen-lockfile';
 const input={...f.input,operation:undefined,qualificationMode:'prepared-offline-frozen',originalInstallArguments:original,installArguments:deriveNativePreparedOfflineInstallArguments(original)};
 const cap=await receiveNativePrecallAdmission(input),command=arguments_=>({cwd:f.cwd,program:f.input.pnpm,arguments:arguments_,environment:f.input.environment});
 assert.equal(cap.kind,'pnpm.prepared-offline-precall-profile.v1');
 await assertNativePrecallAdmission(cap,command(input.installArguments));await assertNativePrecallAdmission(cap,command(['--version']));
 await assert.rejects(assertNativePrecallAdmission(cap),/producer entry/);
 await assert.rejects(assertNativePrecallAdmission(cap,command(['list','--recursive','--depth=-1','--json'])),/outside admitted/);
 await assert.rejects(receiveNativePreparedInstall(cap,outcome(f,[cached(f)])),/unrecognized/);
 await assert.rejects(receiveNativePreparedInstallAdmission(cap),/process-local/);
 await assert.rejects(receiveNativeOfflineInstall(cap,outcome(f,[cached(f)])),/unrecognized/);
 await assert.rejects(receiveNativePrecallAdmission({...input,qualificationMode:'offline-frozen'}),/offline reporter grammar/);
 await assert.rejects(receiveNativePrecallAdmission({...input,operation:'lockfile-refresh'}),/does not match operation/);
 for(const installArguments of [deriveNativeOfflineFrozenInstallArguments(original),[...input.installArguments,'--force'],[...input.installArguments.slice(0,-1),'--optimistic-repeat-install=false']])await assert.rejects(receiveNativePrecallAdmission({...input,installArguments}));
});
profile('prepared verifier still refuses absent verification events and consumes its capability',async t=>{
 const f=await fixture(t);await refresh(f);const cap=await receiveNativePreparedInstallAdmission(f.cap,{offline:true});
 const version={cwd:f.cwd,program:f.input.pnpm,arguments:['--version'],environment:f.input.environment};await assertNativePrecallAdmission(cap,version);
 await assert.rejects(receiveNativePreparedInstall(cap,outcome(f)),/cached native verification unreceived/);
 await assert.rejects(receiveNativePreparedInstall(cap,outcome(f,[cached(f)])),/closed/);
 await assert.rejects(assertNativePrecallAdmission(cap,version),/closed/);
});

test('prepared online derivation suppresses only the update lookup and preserves legacy grammar',()=>{
 const original=['install','--frozen-lockfile','--registry','https://registry.example/','--cache-dir','/allocation/pnpm-metadata','--store-dir','/allocation/pnpm-store','--config.prefer-offline=false'];
 const before=original.slice(),legacy=[...original,'--ignore-scripts'],prepared=[...legacy,'--config.update-notifier=false'];
 assert.deepEqual(deriveNativeLifecycleDisabledInstallArguments(original),legacy);
 assert.deepEqual(deriveNativeLifecycleDisabledInstallArguments(legacy),legacy);
 for(const input of [original,legacy,prepared])assert.deepEqual(deriveNativePreparedOnlineInstallArguments(input),prepared);
 assert.deepEqual(original,before);assert.ok(Object.isFrozen(deriveNativePreparedOnlineInstallArguments(original)));
 assert.throws(()=>deriveNativeLifecycleDisabledInstallArguments(prepared));
 assert.throws(()=>deriveNativeOfflineFrozenInstallArguments(prepared));
 assert.throws(()=>deriveNativePreparedOfflineInstallArguments(prepared));
 for(const args of [[...prepared,'--force'],[...legacy,'--no-update-notifier'],[...legacy,'--update-notifier=false'],[...legacy,'--config.update-notifier=true'],[...prepared,'--config.update-notifier=false'],[...prepared,'--offline'],[...original,'--config.update-notifier=false','--ignore-scripts'],deriveNativePreparedOfflineInstallArguments(original)])assert.throws(()=>deriveNativePreparedOnlineInstallArguments(args));
});
profile('prepared online static profile admits exact command/version but grants no predecessor authority',async t=>{
 const f=await fixture(t),original=f.input.originalInstallArguments.slice();original[1]='--frozen-lockfile';
 const input={...f.input,operation:undefined,qualificationMode:'prepared-online-frozen',originalInstallArguments:original,installArguments:deriveNativePreparedOnlineInstallArguments(original)};
 const cap=await receiveNativePrecallAdmission(input),command=arguments_=>({cwd:f.cwd,program:f.input.pnpm,arguments:arguments_,environment:f.input.environment});
 assert.equal(cap.kind,'pnpm.prepared-online-precall-profile.v1');assert.equal(cap.transformation.kind,'pnpm.prepared-online-frozen.v1');
 await assertNativePrecallAdmission(cap,command(input.installArguments));await assertNativePrecallAdmission(cap,command(['--version']));
 await assert.rejects(assertNativePrecallAdmission(cap),/producer entry/);
 await assert.rejects(assertNativePrecallAdmission(cap,command(['list','--recursive','--depth=-1','--json'])),/outside admitted/);
 await assert.rejects(receiveNativePreparedInstall(cap,outcome(f)),/unrecognized/);
 await assert.rejects(receiveNativePreparedInstallAdmission(cap),/process-local/);
 await assert.rejects(receiveNativeOfflineInstall(cap,outcome(f,[cached(f)])),/unrecognized/);
 await assert.rejects(receiveNativePrecallAdmission({...input,operation:'lockfile-refresh'}),/does not match operation/);
 await assert.rejects(receiveNativePrecallAdmission({...input,qualificationMode:'offline-frozen'}));
 await assert.rejects(receiveNativePrecallAdmission({...input,qualificationMode:'prepared-offline-frozen'}));
 const {qualificationMode:_,cacheRoot:__,...legacyInput}=input;await assert.rejects(receiveNativePrecallAdmission(legacyInput),/lifecycle suppression/);
 for(const installArguments of [deriveNativeLifecycleDisabledInstallArguments(original),[...input.installArguments,'--force'],[...input.installArguments.slice(0,-1),'--no-update-notifier']])await assert.rejects(receiveNativePrecallAdmission({...input,installArguments}));
 await assert.rejects(receiveNativePrecallAdmission({...input,cacheRoot:undefined}),/cache allocation/);
});
