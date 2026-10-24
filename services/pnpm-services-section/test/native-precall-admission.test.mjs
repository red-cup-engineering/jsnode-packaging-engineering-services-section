import nodeTest from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,symlink,copyFile,chmod,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {receiveNativePrecallAdmission,assertNativePrecallAdmission,deriveNativeLifecycleDisabledInstallArguments} from '../src/native-precall-admission.mjs';
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
