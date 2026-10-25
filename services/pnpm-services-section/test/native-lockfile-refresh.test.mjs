import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname,join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {projectHousePackageNativePolicy,createNativePolicyReceiver} from '../src/native-policy.mjs';
import {deriveNativeLockfileRefreshArguments,deriveNativeOfflineLockfileRefreshArguments,
  deriveNativeLifecycleDisabledInstallArguments,receiveNativePrecallAdmission,
  assertNativePrecallAdmission,receiveNativeLockfileRefresh} from '../src/native-precall-admission.mjs';

const supplier=process.env.PNPM_PRECALL_TEST_SUPPLIER;
const native=process.env.PNPM_PRECALL_NATIVE_TESTS==='1';
const execute=promisify(execFile);
const profileTest=(name,fn)=>test(name,{skip:!supplier},fn);
const policy={minimumReleaseAge:1440,minimumReleaseAgeStrict:true};
const scopes=['@561-group/*','@causeway-services/*','@coesite-operations/*','@emsenn/*',
  '@emsweb/*','@harmonious-union/*','@koios-news/*','@lenticule-science/*',
  '@red-cup-engineering/*','@red-cup-science/*','@rsc-quiescent/*',
  '@turntide-islands/*','@union-officer-academy/*'];
const original=['install','--no-frozen-lockfile','--registry','https://registry.561.group/',
  '--cache-dir','/private/pnpm-metadata','--store-dir','/private/pnpm-store','--config.prefer-offline=false'];
const terminal=()=>({terminal:{invoked:true,code:0,signal:null,timedOut:false,truncated:false,failedToStart:false},
  observation:{startedAt:Date.now()-5,endedAt:Date.now(),complete:true}});

test('current source house policy is exact, immutable, idempotent and retains external controls',()=>{
  const proposed=projectHousePackageNativePolicy(policy);
  assert.deepEqual(proposed,{...policy,minimumReleaseAgeExclude:scopes});
  assert.deepEqual(projectHousePackageNativePolicy(proposed),proposed);
  assert.ok(Object.isFrozen(proposed));assert.ok(Object.isFrozen(proposed.minimumReleaseAgeExclude));
  assert.equal(projectHousePackageNativePolicy({...policy,minimumReleaseAge:2880}).minimumReleaseAge,2880);
  assert.deepEqual(policy,{minimumReleaseAge:1440,minimumReleaseAgeStrict:true});
});
test('house projection refuses implicit controls and arbitrary or per-release exclusions',()=>{
  for(const input of [undefined,{},[],{...policy,minimumReleaseAge:0},{...policy,minimumReleaseAge:NaN},
    {...policy,minimumReleaseAgeStrict:false},{...policy,minimumReleaseAgeExclude:['@red-cup-engineering/media@0.2.0']},
    {...policy,minimumReleaseAgeExclude:['*']},{...policy,approved:true},Object.create(policy)])
    assert.throws(()=>projectHousePackageNativePolicy(input));
  const getter={minimumReleaseAgeStrict:true};Object.defineProperty(getter,'minimumReleaseAge',{get(){throw new Error('must not evaluate');},enumerable:true});
  assert.throws(()=>projectHousePackageNativePolicy(getter),/explicit positive/);
  const nested=scopes.slice();Object.defineProperty(nested,'0',{get(){throw new Error('must not evaluate');},enumerable:true});
  assert.throws(()=>projectHousePackageNativePolicy({...policy,minimumReleaseAgeExclude:nested}),/reconciliation/);
});
test('house projection cannot supply an exact-artifact qualification ticket',()=>{
  const receiver=createNativePolicyReceiver({verificationResultOf:async()=>null,receivingDispositionOf:async()=>null});
  assert.throws(()=>receiver.project({qualifications:[{...projectHousePackageNativePolicy(policy),eligible:true}]}),/did not issue/);
});
test('lock refresh derives only named native controls and refuses broadened argv',()=>{
  const args=deriveNativeLockfileRefreshArguments(original);
  assert.deepEqual(args,[...original,'--lockfile-only','--ignore-scripts']);
  assert.deepEqual(deriveNativeLockfileRefreshArguments(args),args);assert.ok(Object.isFrozen(args));
  const offline=deriveNativeOfflineLockfileRefreshArguments(original);
  assert.deepEqual(offline,[...args,'--offline','--reporter=ndjson']);
  assert.deepEqual(deriveNativeOfflineLockfileRefreshArguments(offline),offline);
  for(const input of [[...original,'--force'],[...original,'--ignore-scripts'],
    [...args,'--ignore-scripts=false'],[...args,'--config.minimumReleaseAge=0'],
    [...original.slice(0,1),'--frozen-lockfile',...original.slice(2)]])
    assert.throws(()=>deriveNativeLockfileRefreshArguments(input));
  assert.throws(()=>deriveNativeLifecycleDisabledInstallArguments(original));
});

async function fixture(t,{offline=false}={}) {
  const root=await mkdtemp(join(tmpdir(),'pnpm-lock-refresh-')),cwd=join(root,'source'),home=join(root,'home'),bin=join(root,'bin'),cacheRoot=join(root,'allocation');
  await Promise.all([mkdir(cwd),mkdir(home),mkdir(bin),mkdir(cacheRoot,{mode:0o700})]);
  await Promise.all([mkdir(join(cacheRoot,'pnpm-metadata')),mkdir(join(cacheRoot,'pnpm-store'))]);
  await symlink(join(supplier,'bin','pnpm.cjs'),join(bin,'pnpm'));
  const saved={...process.env};
  const env={PATH:bin+':'+dirname(process.execPath),HOME:home,TMPDIR:root,TEMP:root,TMP:root,
    npm_config_userconfig:join(home,'npmrc'),npm_config_globalconfig:join(home,'global-npmrc'),
    npm_config_ignore_scripts:'true',npm_config_update_notifier:'false',npm_config_audit:'false',npm_config_fund:'false'};
  const sourcePolicy='packages: []\nminimumReleaseAge: 1440\nminimumReleaseAgeStrict: true\nminimumReleaseAgeExclude:\n'+scopes.map(scope=>`  - '${scope}'\n`).join('');
  await Promise.all([writeFile(env.npm_config_userconfig,''),writeFile(env.npm_config_globalconfig,''),
    writeFile(join(cwd,'package.json'),JSON.stringify({name:'lock-refresh-fixture',version:'0.1.0',engines:{node:'>=24'}})),
    writeFile(join(cwd,'pnpm-workspace.yaml'),sourcePolicy),writeFile(join(cwd,'.npmrc'),'registry=https://registry.561.group/\n'),
    writeFile(join(cwd,'pnpm-lock.yaml'),"lockfileVersion: '9.0'\nsettings:\n  autoInstallPeers: true\n  excludeLinksFromLockfile: false\nimporters:\n  .: {}\n")]);
  for(const key of Object.keys(process.env))delete process.env[key];Object.assign(process.env,env);
  t.after(async()=>{for(const key of Object.keys(process.env))delete process.env[key];Object.assign(process.env,saved);await rm(root,{recursive:true,force:true});});
  const base=original.slice();base[5]=join(cacheRoot,'pnpm-metadata');base[7]=join(cacheRoot,'pnpm-store');
  const args=(offline?deriveNativeOfflineLockfileRefreshArguments:deriveNativeLockfileRefreshArguments)(base);
  const input={cwd,pnpm:'pnpm',operation:'lockfile-refresh',sourceProfile:'root-package-no-manager-pin',
    originalInstallArguments:base,installArguments:args,...(offline?{qualificationMode:'offline-lockfile-refresh',cacheRoot}:{})};
  return {root,cwd,home,cacheRoot,input,args,env};
}
profileTest('explicit no-pin root source admits refresh only, not producer or frozen proof',async t=>{
  const f=await fixture(t),cap=await receiveNativePrecallAdmission(f.input);
  assert.equal(cap.kind,'pnpm.publisher-lockfile-refresh-precall-profile.v1');
  await assertNativePrecallAdmission(cap,{cwd:f.cwd,program:'pnpm',arguments:f.args});
  await assert.rejects(assertNativePrecallAdmission(cap),/producer entry/);
  await assert.rejects(assertNativePrecallAdmission({...cap}),/process-local/);
  for(const args of [['--version'],['list','--recursive','--depth=-1','--json']])
    await assert.rejects(assertNativePrecallAdmission(cap,{cwd:f.cwd,program:'pnpm',arguments:args}),/command/);
  await assert.rejects(receiveNativePrecallAdmission({...f.input,sourceProfile:undefined}),/legacy manager pin/);
});
profileTest('no-pin profile refuses manager/runtime activation and absent root policy',async t=>{
  const f=await fixture(t),path=join(f.cwd,'package.json'),base={name:'fixture',version:'0.1.0'};
  for(const delta of [{packageManager:'pnpm@11.28.5'},{packageManager:null},
    {devEngines:{packageManager:{name:'pnpm',version:'11.28.5'}}},{engines:{runtime:{name:'node',version:'25'}}}]){
    await writeFile(path,JSON.stringify({...base,...delta}));await assert.rejects(receiveNativePrecallAdmission(f.input),/manager|runtime/);
  }
  await writeFile(path,JSON.stringify(base));await rm(join(f.cwd,'pnpm-workspace.yaml'));
  await assert.rejects(receiveNativePrecallAdmission(f.input),{code:'ENOENT'});
});
profileTest('receiving permits only lock bytes and consumes success without qualifying an install',async t=>{
  const f=await fixture(t),cap=await receiveNativePrecallAdmission(f.input),lock=join(f.cwd,'pnpm-lock.yaml');
  await writeFile(lock,(await readFile(lock,'utf8'))+'# native fixture output\n');
  const received=await receiveNativeLockfileRefresh(cap,terminal());
  assert.notEqual(received.beforeLock.sha256,received.afterLock.sha256);
  assert.equal(received.lockSemanticsReceived,false);assert.equal(received.installationReceived,false);
  assert.equal(received.nativeFrozenVerificationReceived,false);
  await assert.rejects(assertNativePrecallAdmission(cap,{cwd:f.cwd,program:'pnpm',arguments:f.args}),/consumed/);
  await assert.rejects(receiveNativeLockfileRefresh(cap,terminal()),/already received/);
});
profileTest('changed policy or manifest refuses and preserves actual changed bytes',async t=>{
  const f=await fixture(t);
  for(const name of ['pnpm-workspace.yaml','package.json','.npmrc']){
    const path=join(f.cwd,name),before=await readFile(path),cap=await receiveNativePrecallAdmission(f.input);
    const after=Buffer.concat([before,Buffer.from('\n')]);await writeFile(path,after);
    await assert.rejects(receiveNativeLockfileRefresh(cap,terminal()),error=>{
      assert.equal(error.nativeLockRefreshEvidence.capabilityClosed,true);return /changed/.test(error.message);
    });
    assert.deepEqual(await readFile(path),after);await writeFile(path,before);
  }
});
profileTest('failed or incomplete execution consumes lock refresh without retry',async t=>{
  const f=await fixture(t);
  for(const change of [{code:1},{signal:'SIGTERM'},{timedOut:true},{truncated:true},{failedToStart:true},{invoked:false}]){
    const cap=await receiveNativePrecallAdmission(f.input),result=terminal();Object.assign(result.terminal,change);
    await assert.rejects(receiveNativeLockfileRefresh(cap,result),/complete successful/);
    await assert.rejects(receiveNativeLockfileRefresh(cap,terminal()),/already received/);
  }
  const cap=await receiveNativePrecallAdmission(f.input),result=terminal();result.observation.complete=false;
  await assert.rejects(receiveNativeLockfileRefresh(cap,result),/complete successful/);
});
profileTest('offline refresh binds original private cache without claiming fresh verification',async t=>{
  const f=await fixture(t,{offline:true}),cap=await receiveNativePrecallAdmission(f.input);
  await assertNativePrecallAdmission(cap,{cwd:f.cwd,program:'pnpm',arguments:f.args});
  // Synthetic state-transition fixture; not original native history evidence.
  await writeFile(join(f.cacheRoot,'pnpm-metadata','lockfile-verified.jsonl'),'synthetic retained history\n');
  const receipt=await receiveNativeLockfileRefresh(cap,terminal());
  assert.equal(receipt.offline,true);assert.equal(receipt.nativeFrozenVerificationReceived,false);
  assert.equal(receipt.priorNativeHistory.exists,false);assert.equal(receipt.nativeHistory.exists,true);
  assert.equal(Object.hasOwn(receipt.nativeHistory,'text'),false);
  await assert.rejects(receiveNativePrecallAdmission({...f.input,qualificationMode:'offline-frozen'}),/does not match/);
  await assert.rejects(receiveNativePrecallAdmission({...f.input,cacheRoot:f.cwd}),/overlaps/);
});

test('native offline no-pin refresh retains root-only policy, suppresses lifecycle and does not install',
  {skip:!supplier||!native},async t=>{
  const f=await fixture(t,{offline:true}),manifestPath=join(f.cwd,'package.json');
  const pkg=JSON.parse(await readFile(manifestPath,'utf8'));
  pkg.scripts={preinstall:'node -e "require(\'fs\').writeFileSync(\'lifecycle-ran\',\'bad\')"'};
  await writeFile(manifestPath,JSON.stringify(pkg));
  const sourceBefore=await Promise.all(['package.json','pnpm-workspace.yaml','.npmrc'].map(name=>readFile(join(f.cwd,name))));
  const cap=await receiveNativePrecallAdmission(f.input);
  await assertNativePrecallAdmission(cap,{cwd:f.cwd,program:'pnpm',arguments:f.args});
  const startedAt=Date.now();
  const result=await execute('pnpm',f.args,{cwd:f.cwd,env:process.env,timeout:15000,maxBuffer:1048576});
  const endedAt=Date.now();
  const receipt=await receiveNativeLockfileRefresh(cap,{terminal:{invoked:true,code:0,signal:null,timedOut:false,truncated:false,failedToStart:false},
    observation:{startedAt,endedAt,complete:true}});
  assert.equal(receipt.offline,true);assert.equal(receipt.installationReceived,false);
  assert.doesNotMatch(result.stdout,/Added .*minimumReleaseAgeExclude/);
  for(const [i,name] of ['package.json','pnpm-workspace.yaml','.npmrc'].entries())assert.deepEqual(await readFile(join(f.cwd,name)),sourceBefore[i]);
  await assert.rejects(readFile(join(f.cwd,'lifecycle-ran')),{code:'ENOENT'});
  await assert.rejects(readFile(join(f.cwd,'node_modules','.modules.yaml')),{code:'ENOENT'});
  const text=await readFile(join(f.cwd,'pnpm-lock.yaml'),'utf8');assert.match(text,/\.: \{\}/);
  t.diagnostic(JSON.stringify({provider:'pnpm@11.28.5',sourceProfile:receipt.sourceProfile,
    sourcePolicyUnchanged:true,lifecycleRan:false,installationReceived:false,lockSHA256:receipt.afterLock.sha256}));
});

test('native offline refresh refuses missing registry metadata without accepting changed lock',
  {skip:!supplier||!native},async t=>{
  const f=await fixture(t,{offline:true}),manifestPath=join(f.cwd,'package.json');
  const pkg=JSON.parse(await readFile(manifestPath,'utf8'));pkg.dependencies={'missing-lock-refresh-fixture':'0.1.0'};
  await writeFile(manifestPath,JSON.stringify(pkg));
  const before=await readFile(join(f.cwd,'pnpm-lock.yaml')),cap=await receiveNativePrecallAdmission(f.input);
  await assertNativePrecallAdmission(cap,{cwd:f.cwd,program:'pnpm',arguments:f.args});
  let failure;try{await execute('pnpm',f.args,{cwd:f.cwd,env:process.env,timeout:15000,maxBuffer:1048576});}catch(error){failure=error;}
  assert.equal(failure?.code,1);assert.equal(failure?.signal,null);assert.equal(failure?.killed,false);
  assert.match(failure.stdout,/ERR_PNPM_NO_OFFLINE_META/);
  const result=terminal();result.terminal.code=1;
  await assert.rejects(receiveNativeLockfileRefresh(cap,result),/complete successful/);
  assert.deepEqual(await readFile(join(f.cwd,'pnpm-lock.yaml')),before);
});
