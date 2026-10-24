import nodeTest from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,symlink,copyFile,chmod,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {receiveNativePrecallAdmission,assertNativePrecallAdmission,deriveNativeLifecycleDisabledInstallArguments,deriveNativeOfflineFrozenInstallArguments,receiveNativeOfflineInstall} from '../src/native-precall-admission.mjs';
const run=promisify(execFile);
const supplier=process.env.PNPM_PRECALL_TEST_SUPPLIER;
const newsroom=process.env.PNPM_PRECALL_TEST_CONSUMER;
const test=(name, options, fn)=>typeof options==='function'?nodeTest(name,{skip:!supplier},options):nodeTest(name,{...options,skip:!supplier || options.skip},fn);
const native=process.env.PNPM_PRECALL_NATIVE_TESTS === '1';
async function fixture(t) {
  assert.ok(supplier,'exact official supplier root required');
  const root=await mkdtemp(join(tmpdir(),'pnpm-precall-')),cwd=join(root,'source'),home=join(root,'home'),bin=join(root,'bin');
  await Promise.all([mkdir(cwd),mkdir(home),mkdir(bin)]);
  await symlink(join(supplier,'bin','pnpm.cjs'),join(bin,'pnpm'));
  const saved={...process.env};
  const env={PATH:bin+':'+dirname(process.execPath),HOME:home,TMPDIR:root,TEMP:root,TMP:root,
    npm_config_userconfig:join(home,'npmrc'),npm_config_globalconfig:join(home,'global-npmrc'),
    npm_config_ignore_scripts:'true',npm_config_update_notifier:'false',npm_config_audit:'false',npm_config_fund:'false'};
  await Promise.all([writeFile(env.npm_config_userconfig,''),writeFile(env.npm_config_globalconfig,''),
    writeFile(join(cwd,'package.json'),JSON.stringify({name:'native-precall-fixture',version:'1.0.0',packageManager:'pnpm@11.28.5'})),
    writeFile(join(cwd,'pnpm-workspace.yaml'),'packages: []\nminimumReleaseAge: 1440\nminimumReleaseAgeStrict: true\n'),
    writeFile(join(cwd,'.npmrc'),'registry=https://registry.npmjs.org/\n'),
    writeFile(join(cwd,'pnpm-lock.yaml'),"lockfileVersion: '9.0'\n\nsettings:\n  autoInstallPeers: true\n  excludeLinksFromLockfile: false\n\nimporters:\n\n  .: {}\n")]);
  for(const key of Object.keys(process.env))delete process.env[key]; Object.assign(process.env,env);
  t.after(async()=>{for(const key of Object.keys(process.env))delete process.env[key];Object.assign(process.env,saved);await rm(root,{recursive:true,force:true});});
  const originalArgs=['install','--frozen-lockfile','--registry','https://registry.npmjs.org/','--cache-dir',join(root,'cache'),'--store-dir',join(root,'store'),'--config.prefer-offline=false'];
  const args=deriveNativeLifecycleDisabledInstallArguments(originalArgs);
  return {root,cwd,home,bin,env,args,originalArgs,input:{cwd,pnpm:'pnpm',installArguments:args,originalInstallArguments:originalArgs}};
}
test('stable original supplier and exact commands yield a process-local capability',async t=>{
  const f=await fixture(t),cap=await receiveNativePrecallAdmission(f.input);
  assert.equal(cap.kind,'pnpm.publisher-precall-profile.v1'); assert.ok(Object.isFrozen(cap));
  for(const args of [f.args,['--version'],['list','--recursive','--depth=-1','--json']])
    assert.equal(await assertNativePrecallAdmission(cap,{cwd:f.cwd,program:'pnpm',arguments:args}),cap.identity);
  await assert.rejects(assertNativePrecallAdmission({...cap}),/process-local/);
  await assert.rejects(assertNativePrecallAdmission(cap,{cwd:f.cwd,program:'pnpm',arguments:['list','--json']}),/command/);
});
test('renamed and configuration dependency selectors refuse before native invocation',async t=>{
  const f=await fixture(t);
  for(const key of ['pnpmfile','globalPnpmfile','configDependencies','ignorePnpmfile','config_dependencies']){
    await writeFile(join(f.cwd,'pnpm-workspace.yaml'),`packages: []\n${key}: hook.cjs\n`);
    await assert.rejects(receiveNativePrecallAdmission(f.input),/composable|workspace/);
  }
});
test('default hooks and alternate manifests refuse',async t=>{
  const f=await fixture(t);
  for(const name of ['.pnpmfile.cjs','.pnpmfile.mjs','package.json5','package.yaml']){
    await writeFile(join(f.cwd,name),'throw new Error("must not run")');
    await assert.rejects(receiveNativePrecallAdmission(f.input),/unexpected configuration/);await rm(join(f.cwd,name));
  }
});
test('global configuration and auth sources refuse, including token helper routes',async t=>{
  const f=await fixture(t);await mkdir(join(f.home,'.config','pnpm'),{recursive:true});
  for(const name of [join(f.home,'.npmrc'),join(f.home,'.config','pnpm','config.yaml'),join(f.home,'.config','pnpm','auth.ini')]){
    await writeFile(name,'tokenHelper=/not-executed\n');
    await assert.rejects(receiveNativePrecallAdmission(f.input),/unexpected configuration/);await rm(name);
  }
  await writeFile(process.env.npm_config_userconfig,'tokenHelper=/not-executed\n');
  await assert.rejects(receiveNativePrecallAdmission(f.input),/empty worker config/);
});
test('manager and runtime acquisition declarations refuse without changing the legacy pin',async t=>{
  const f=await fixture(t),base={name:'fixture',version:'1.0.0',packageManager:'pnpm@11.28.5'};
  for(const delta of [{packageManager:'pnpm@12.0.0'},{packageManager:'pnpm@^11.28.5'},
    {devEngines:{packageManager:{name:'pnpm',version:'11.28.5'}}},
    {devEngines:{runtime:{name:'node',version:'25',onFail:'download'}}},
    {engines:{runtime:{name:'node',version:'25',onFail:'download'}}}]){
    await writeFile(join(f.cwd,'package.json'),JSON.stringify({...base,...delta}));
    await assert.rejects(receiveNativePrecallAdmission(f.input),/manager|runtime/);
  }
});
test('original lifecycle controls and exact environment are required, not synthesized',async t=>{
  const f=await fixture(t);delete process.env.npm_config_ignore_scripts;
  await assert.rejects(receiveNativePrecallAdmission(f.input),/worker npm control/);
  process.env.npm_config_ignore_scripts='true';process.env.NODE_OPTIONS='--import=/not-run.mjs';
  await assert.rejects(receiveNativePrecallAdmission(f.input),/environment/);
  delete process.env.NODE_OPTIONS;process.env.PNPM_CONFIG_PNPMFILE='hook.cjs';
  await assert.rejects(receiveNativePrecallAdmission(f.input),/environment/);
});
test('changed configuration, lock, manifest and environment invalidate prior capability',async t=>{
  const f=await fixture(t);
  for(const name of ['pnpm-workspace.yaml','.npmrc','pnpm-lock.yaml','package.json']){
    const path=join(f.cwd,name),bytes=await readFile(path),cap=await receiveNativePrecallAdmission(f.input);
    await writeFile(path,Buffer.concat([bytes,Buffer.from('\n')]));
    await assert.rejects(assertNativePrecallAdmission(cap),/changed/);await writeFile(path,bytes);
  }
  const cap=await receiveNativePrecallAdmission(f.input);process.env.LANG='C';
  await assert.rejects(assertNativePrecallAdmission(cap),/changed/);
});
test('unknown settings, interpolation, duplicated roots and broader workspaces refuse',async t=>{
  const f=await fixture(t);
  for(const text of ['packages: ["packages/*"]\n','packages: []\npackages: []\n','packages: []\nexecutionEnv: {}\n',
    'packages: []\nminimumReleaseAge: ${AGE}\n','packages: []\n"pnpmfile": hook.cjs\n']){
    await writeFile(join(f.cwd,'pnpm-workspace.yaml'),text);
    await assert.rejects(receiveNativePrecallAdmission(f.input));
  }
});
test('project npmrc cannot introduce credentials, helpers or arbitrary settings',async t=>{
  const f=await fixture(t);
  for(const text of ['tokenHelper=/not-run\n','registry=https://user:password@example.com/\n','userconfig=/other\n','registry=${REGISTRY}\n']){
    await writeFile(join(f.cwd,'.npmrc'),text);await assert.rejects(receiveNativePrecallAdmission(f.input));
  }
});
test('extra arguments, aliases and mutable-lock operations refuse',async t=>{
  const f=await fixture(t);
  for(const args of [[...f.args,'--ignore-pnpmfile'],f.args.map(x=>x==='--frozen-lockfile'?'--no-frozen-lockfile':x),['install'],['list','--recursive','--depth=-1','--json']])
    await assert.rejects(receiveNativePrecallAdmission({...f.input,installArguments:args}),/grammar|suppression/);
});
test('wrong PATH manager cannot receive the qualified provider capability',async t=>{
  const f=await fixture(t);await rm(join(f.bin,'pnpm'));await writeFile(join(f.bin,'pnpm'),'#!/bin/sh\nexit 0\n');
  await assert.rejects(receiveNativePrecallAdmission(f.input));
});
test('exact real consumer configuration is admitted unchanged', {skip:!newsroom},async t=>{
  const f=await fixture(t);
  for(const name of ['package.json','pnpm-workspace.yaml','.npmrc','pnpm-lock.yaml'])await copyFile(join(newsroom,name),join(f.cwd,name));
  const before=await Promise.all(['package.json','pnpm-workspace.yaml','.npmrc','pnpm-lock.yaml'].map(name=>readFile(join(f.cwd,name))));
  const cap=await receiveNativePrecallAdmission(f.input);await assertNativePrecallAdmission(cap);
  const after=await Promise.all(['package.json','pnpm-workspace.yaml','.npmrc','pnpm-lock.yaml'].map(name=>readFile(join(f.cwd,name))));assert.deepEqual(after,before);
});
test('original native version, inventory and frozen fixture installation use the admitted unchanged context',{skip:!native},async t=>{
  const f=await fixture(t);
  const manifest=JSON.parse(await readFile(join(f.cwd,'package.json'),'utf8'));
  manifest.scripts=Object.fromEntries(['preinstall','install','postinstall','prepare'].map(name=>[name,`node -e \"require('fs').writeFileSync('${name}-executed','bad')\"`]));
  await writeFile(join(f.cwd,'package.json'),JSON.stringify(manifest));
  const names=['package.json','pnpm-workspace.yaml','pnpm-lock.yaml','.npmrc'];
  const before=await Promise.all(names.map(name=>readFile(join(f.cwd,name),'utf8')));
  const cap=await receiveNativePrecallAdmission(f.input);
  for(const args of [['--version'],['list','--recursive','--depth=-1','--json'],f.args]){
    await assertNativePrecallAdmission(cap,{cwd:f.cwd,program:'pnpm',arguments:args});
    const result=await run('pnpm',args,{cwd:f.cwd,env:{...process.env},timeout:30000,maxBuffer:1048576});
    if(args[0]==='--version'){assert.equal(result.stdout.trim(),'11.28.5');assert.deepEqual((await readdir(f.home)).sort(),['global-npmrc','npmrc']);}
    if(args[0]==='list')assert.equal(JSON.parse(result.stdout)[0].path,f.cwd);
  }
  for (const name of ['preinstall','install','postinstall','prepare']) assert.equal((await readdir(f.cwd)).includes(name+'-executed'),false);
  const after=await Promise.all(names.map(name=>readFile(join(f.cwd,name),'utf8')));
  for(let i=0;i<names.length;i++) if(before[i]!==after[i])t.diagnostic(JSON.stringify({changed:names[i],before:before[i],after:after[i]}));
  await assertNativePrecallAdmission(cap);
});

test('explicit lifecycle transformation preserves original argv and requires native flag',async t=>{
  const f=await fixture(t),original=f.originalArgs.slice();
  assert.deepEqual(deriveNativeLifecycleDisabledInstallArguments(original),[...original,'--ignore-scripts']);
  assert.deepEqual(original,f.originalArgs);
  assert.deepEqual(deriveNativeLifecycleDisabledInstallArguments(f.args),f.args);
  for(const flag of ['--ignore-scripts=false','--no-ignore-scripts','--config.ignoreScripts=false'])assert.throws(()=>deriveNativeLifecycleDisabledInstallArguments([...original,flag]),/grammar/);
  const cap=await receiveNativePrecallAdmission({...f.input,originalInstallArguments:f.args});
  assert.deepEqual(cap.transformation.originalArguments,f.args);assert.deepEqual(cap.transformation.derivedArguments,f.args);assert.match(cap.transformation.identity,/^[a-f0-9]{64}$/u);
  await assert.rejects(receiveNativePrecallAdmission({...f.input,installArguments:original}),/native lifecycle suppression/);
});
test('actual registry spelling and non-executable PATH precedence are qualified',async t=>{
  const f=await fixture(t),first=join(f.root,'nonexecutable');await mkdir(first);
  await writeFile(join(first,'pnpm'),'not executable');await chmod(join(first,'pnpm'),0o600);
  process.env.PATH=first+':'+process.env.PATH;
  const original=f.originalArgs.slice();original[3]='https://registry.561.group';
  const cap=await receiveNativePrecallAdmission({...f.input,originalInstallArguments:original,installArguments:deriveNativeLifecycleDisabledInstallArguments(original)});
  await assertNativePrecallAdmission(cap);
  await chmod(join(first,'pnpm'),0o700);
  await assert.rejects(assertNativePrecallAdmission(cap));
});

async function offlineFixture(t) {
  const f = await fixture(t), cacheRoot = join(f.root, 'allocation');
  await mkdir(cacheRoot, {mode: 0o700});
  await mkdir(join(cacheRoot, 'pnpm-metadata')); await mkdir(join(cacheRoot, 'pnpm-store'));
  const original = f.originalArgs.slice(); original[5] = join(cacheRoot, 'pnpm-metadata'); original[7] = join(cacheRoot, 'pnpm-store');
  return {...f, cacheRoot, input: {...f.input, qualificationMode: 'offline-frozen', cacheRoot,
    originalInstallArguments: original, installArguments: deriveNativeOfflineFrozenInstallArguments(original)}};
}
test('offline derivation is explicit, idempotent and cannot enter the online profile', async t => {
  const f = await offlineFixture(t), args = f.input.installArguments;
  assert.deepEqual(args.slice(-3), ['--ignore-scripts','--offline','--reporter=ndjson']);
  assert.deepEqual(deriveNativeOfflineFrozenInstallArguments(args), args);
  const cap = await receiveNativePrecallAdmission(f.input);
  assert.equal(cap.kind, 'pnpm.publisher-offline-precall-profile.v1');
  await assertNativePrecallAdmission(cap, {cwd:f.cwd,program:'pnpm',arguments:args});
  await assert.rejects(assertNativePrecallAdmission(cap), /must be received/);
  await assert.rejects(assertNativePrecallAdmission(cap,{cwd:f.cwd,program:'pnpm',arguments:['--version']}), /must be received/);
  await assert.rejects(receiveNativePrecallAdmission({...f.input,qualificationMode:undefined,cacheRoot:undefined}), /suppression/);
  for (const extra of ['--online','--offline=false','--reporter=append-only']) assert.throws(() => deriveNativeOfflineFrozenInstallArguments([...args,extra]));
});
test('offline admission binds exact private allocation and refuses redirected children', async t => {
  const f=await offlineFixture(t);
  await assert.rejects(receiveNativePrecallAdmission({...f.input,cacheRoot:f.cwd}), /overlaps/);
  await chmod(f.cacheRoot,0o755); await assert.rejects(receiveNativePrecallAdmission(f.input), /private/); await chmod(f.cacheRoot,0o700);
  const cap=await receiveNativePrecallAdmission(f.input);
  await rm(join(f.cacheRoot,'pnpm-store'),{recursive:true});await symlink(join(f.cacheRoot,'pnpm-metadata'),join(f.cacheRoot,'pnpm-store'));
  await assert.rejects(assertNativePrecallAdmission(cap,{cwd:f.cwd,program:'pnpm',arguments:f.input.installArguments}), /unredirected/);
});
test('offline cached success cannot authorize a producer or erase retained history', async t => {
  const f=await offlineFixture(t), history=join(f.cacheRoot,'pnpm-metadata','lockfile-verified.jsonl');
  const bytes='retained original history fixture\n';await writeFile(history,bytes);
  const cap=await receiveNativePrecallAdmission(f.input), now=Date.now(),lockfilePath=join(f.cwd,'pnpm-lock.yaml');
  const stdout=JSON.stringify({name:'pnpm:lockfile-verification',status:'cached',time:now,pid:123,level:'debug',lockfilePath,verifiedAt:new Date(now-1000).toISOString()})+'\n';
  await assert.rejects(receiveNativeOfflineInstall(cap,{stdout,terminal:{invoked:true,code:0,signal:null},observation:{startedAt:now-100,endedAt:now+100,complete:true},lockfilePath}), /fresh native verification not received/);
  assert.equal(await readFile(history,'utf8'),bytes);await assert.rejects(assertNativePrecallAdmission(cap),/capability is closed/);
});
function syntheticFreshResult(f) {
 const now=Date.now(),lockfilePath=join(f.cwd,'pnpm-lock.yaml');
 const start={name:'pnpm:lockfile-verification',status:'started',time:now,pid:123,level:'debug',entries:1,lockfilePath};
 return {stdout:[start,{...start,status:'done',time:now+1,elapsedMs:1}].map(x=>JSON.stringify(x)+'\n').join(''),
 terminal:{invoked:true,code:0,signal:null},observation:{startedAt:now-100,endedAt:now+100,complete:true},lockfilePath};
}
test('synthetic state assay receives one verdict transition, binds it and prohibits reinstall',async t=>{
 const f=await offlineFixture(t),cap=await receiveNativePrecallAdmission(f.input),result=syntheticFreshResult(f);
 const path=join(f.cacheRoot,'pnpm-metadata','lockfile-verified.jsonl');
 // Synthetic fixture is state-machine evidence only, never native policy receiving.
 await writeFile(path,JSON.stringify({lockfile:{path:result.lockfilePath},verifiedAt:new Date(result.observation.startedAt+100).toISOString()})+'\n');
 const receipt=await receiveNativeOfflineInstall(cap,result);assert.equal(receipt.policyVerification,'fresh-native');
 assert.equal(receipt.priorVerdict.exists,false);assert.equal(receipt.verdict.exists,true);
 await assertNativePrecallAdmission(cap);
 await assert.rejects(assertNativePrecallAdmission(cap,{cwd:f.cwd,program:'pnpm',arguments:f.input.installArguments}),/single-use/);
 await assert.rejects(receiveNativeOfflineInstall(cap,result),/already received/);
 await writeFile(path,'changed\n');await assert.rejects(assertNativePrecallAdmission(cap),/changed/);
});
test('unpersisted fresh report or unrelated verdict cannot discharge the transition',async t=>{
 const f=await offlineFixture(t),path=join(f.cacheRoot,'pnpm-metadata','lockfile-verified.jsonl');
 await writeFile(path,'original unrelated history\n');
 const cap=await receiveNativePrecallAdmission(f.input),result=syntheticFreshResult(f);
 await assert.rejects(receiveNativeOfflineInstall(cap,result),error=>{
  assert.match(error.message,/persistence unestablished/);assert.equal(error.nativeOfflineEvidence.capabilityClosed,true);
  assert.equal(error.nativeOfflineEvidence.verification.accepted,true);return true;
 });
 await assert.rejects(assertNativePrecallAdmission(cap,{cwd:f.cwd,program:'pnpm',arguments:f.input.installArguments}),/closed/);
 const next=await receiveNativePrecallAdmission(f.input);
 await writeFile(path,JSON.stringify({lockfile:{path:'/another/lock'},verifiedAt:new Date().toISOString()})+'\n');
 await assert.rejects(receiveNativeOfflineInstall(next,result),/matching native verification verdict/);
});
test('changed observer is rejected before replacement code can execute',async t=>{
 const f=await offlineFixture(t),owner=join(f.root,'owner');await mkdir(join(owner,'src'),{recursive:true});
 for(const name of ['native-precall-admission.mjs','native-observation.mjs','native-provider.mjs','native-hook-profile.mjs'])
  await copyFile(new URL('../src/'+name,import.meta.url),join(owner,'src',name));
 await copyFile(new URL('../package.json',import.meta.url),join(owner,'package.json'));
 const own=await import(new URL('file://'+join(owner,'src','native-precall-admission.mjs')));
 const cap=await own.receiveNativePrecallAdmission(f.input);
 await writeFile(join(owner,'src','native-observation.mjs'),'throw new Error("REPLACEMENT_EXECUTED");\n');
 await assert.rejects(own.receiveNativeOfflineInstall(cap,syntheticFreshResult(f)),error=>{
  assert.match(error.message,/changed during installation/);assert.doesNotMatch(error.message,/REPLACEMENT_EXECUTED/);return true;
 });
});
