import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceWorkerModuleArguments,sourceWorkerCaches} from '../src/source-worker-transport.mjs';
import {packageManagerInstallCommand} from '../src/package-manager.mjs';
const original=process.env.NATIVE_SOURCE_TEST_STORE + '/.native-module-revision/register.mjs';
const previous=process.env.NATIVE_PREVIOUS_SOURCE_TEST_STORE + '/.native-module-revision/register.mjs';
test('only the already selected native registration crosses the child launch boundary',async()=>{
 assert.deepEqual(await sourceWorkerModuleArguments({environment:{},arguments:[]}),[]);
 assert.deepEqual(await sourceWorkerModuleArguments({environment:{NODE_OPTIONS:'--require=/arbitrary.cjs',GITHUB_TOKEN:'never-forward'},arguments:['--test']}),[]);
 assert.deepEqual(await sourceWorkerModuleArguments({environment:{NODE_OPTIONS:'--import=file://'+original+' --max-old-space-size=256'},arguments:['--import',original]}),['--import=file://'+original]);
});
test('mutable, redirected, competing and oversized source contexts refuse',async()=>{
 await assert.rejects(sourceWorkerModuleArguments({environment:{},arguments:['--import','/tmp/.native-module-revision/register.mjs']}),/immutable canonical/);
 await assert.rejects(sourceWorkerModuleArguments({environment:{},arguments:['--import',original,'--import',previous]}),/competing/);
 await assert.rejects(sourceWorkerModuleArguments({environment:{NODE_OPTIONS:' '.repeat(16385)},arguments:[]}),/bounded/);
});
test('upstream fresh PNPM resolution shares payload while isolating metadata and keeping the lock frozen',()=>{
 const command=packageManagerInstallCommand('pnpm','https://registry.561.group','verify',{cacheRoot:'/owner/cache'});
 assert.equal(command.command,'pnpm');
 assert.ok(command.arguments.includes('--frozen-lockfile'));
 assert.ok(command.arguments.includes('/owner/cache/pnpm-metadata'));
 assert.ok(command.arguments.includes('--config.prefer-offline=false'));
 assert.ok(!command.arguments.includes('--store-dir'));
 const npm=packageManagerInstallCommand('npm','https://registry.561.group','verify',{cacheRoot:'/owner/cache'});
 assert.ok(!npm.arguments.includes('--cache'));
 assert.ok(npm.arguments.includes('--prefer-online'));
});
test('isolating HOME keeps native cache paths and refuses disposable cache roots',()=>{
 const caches=sourceWorkerCaches({},'/native/home',['/job/source','/job/scratch']);
 assert.equal(caches.XDG_DATA_HOME,'/native/home/.local/share');
 assert.equal(caches.npm_config_cache,'/native/home/.npm');
 assert.throws(()=>sourceWorkerCaches({XDG_DATA_HOME:'/job/scratch/payload'},'/native/home',['/job/scratch']),/disposable/);
});
