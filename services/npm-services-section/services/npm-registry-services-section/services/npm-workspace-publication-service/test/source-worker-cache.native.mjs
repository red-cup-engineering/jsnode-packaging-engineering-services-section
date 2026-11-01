import{test}from'node:test';import assert from'node:assert/strict';
import{mkdtemp,mkdir,writeFile,rm}from'node:fs/promises';import{tmpdir}from'node:os';import{join}from'node:path';import{spawnSync}from'node:child_process';
import{sourceWorkerCaches}from'../src/source-worker-transport.mjs';
test('native PNPM store and npm archive cache survive credential HOME isolation',async t=>{
 const entry=process.env.SOURCE_CACHE_TEST_PNPM_ENTRY;assert(entry,'explicit qualified native PNPM entry is required');
 const root=await mkdtemp(join(tmpdir(),'native-worker-cache-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const home=join(root,'native-home'),privateHome=join(root,'worker-home');await mkdir(home);await mkdir(privateHome);
 const userconfig=join(root,'npmrc'),globalconfig=join(root,'global-npmrc');await writeFile(userconfig,'');await writeFile(globalconfig,'');
 const original={PATH:process.env.PATH,HOME:home,npm_config_userconfig:userconfig,npm_config_globalconfig:globalconfig,npm_config_update_notifier:'false'};
 const isolated={...original,...sourceWorkerCaches(original,home,[privateHome]),HOME:privateHome};
 const run=(program,args,env)=>{const r=spawnSync(program,args,{cwd:root,env,encoding:'utf8',timeout:15000,maxBuffer:65536});assert.equal(r.status,0,r.stderr);return r.stdout.trim();};
 assert.equal(run(process.execPath,[entry,'store','path'],isolated),run(process.execPath,[entry,'store','path'],original));
 assert.equal(run('npm',['config','get','cache','--json'],isolated),run('npm',['config','get','cache','--json'],original));
 assert.notEqual(isolated.HOME,original.HOME);assert.equal('NODE_AUTH_TOKEN' in isolated,false);
});
