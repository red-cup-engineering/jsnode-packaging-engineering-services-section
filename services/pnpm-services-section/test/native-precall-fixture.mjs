import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname,join} from 'node:path';
import {deriveNativeLifecycleDisabledInstallArguments,deriveNativeOfflineFrozenInstallArguments} from '../src/native-precall-admission.mjs';
const supplier=process.env.PNPM_PRECALL_TEST_SUPPLIER;
export async function fixture(t) {
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
export async function offlineFixture(t) {
  const f = await fixture(t), cacheRoot = join(f.root, 'allocation');
  await mkdir(cacheRoot, {mode: 0o700});
  await mkdir(join(cacheRoot, 'pnpm-metadata')); await mkdir(join(cacheRoot, 'pnpm-store'));
  const original = f.originalArgs.slice(); original[5] = join(cacheRoot, 'pnpm-metadata'); original[7] = join(cacheRoot, 'pnpm-store');
  return {...f, cacheRoot, input: {...f.input, qualificationMode: 'offline-frozen', cacheRoot,
    originalInstallArguments: original, installArguments: deriveNativeOfflineFrozenInstallArguments(original)}};
}
