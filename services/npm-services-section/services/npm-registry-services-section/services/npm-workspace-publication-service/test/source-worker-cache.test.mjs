import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sourceWorkerCaches} from '../src/source-worker-transport.mjs';

test('isolated HOME retains only native cache data coordinates',()=>{
  assert.deepEqual(sourceWorkerCaches({NODE_AUTH_TOKEN:'secret',HOME:'/tmp/private'},'/home/owner',['/tmp/private']),{
    XDG_DATA_HOME:'/home/owner/.local/share',XDG_CACHE_HOME:'/home/owner/.cache',npm_config_cache:'/home/owner/.npm',
  });
  const explicit={XDG_DATA_HOME:'/data',XDG_CACHE_HOME:'/cache',NPM_CONFIG_CACHE:'/npm',PNPM_HOME:'/pnpm',YARN_CACHE_FOLDER:'/yarn'};
  assert.deepEqual(sourceWorkerCaches(explicit,'/home/owner'),{XDG_DATA_HOME:'/data',XDG_CACHE_HOME:'/cache',npm_config_cache:'/npm',PNPM_HOME:'/pnpm',YARN_CACHE_FOLDER:'/yarn'});
});

test('relative, redirected syntax and disposable cache coordinates refuse',()=>{
  for(const path of ['relative','/cache/../temporary','/cache\ninvalid','/tmp/work','/tmp/work/cache'])
    assert.throws(()=>sourceWorkerCaches({XDG_DATA_HOME:path},'/home/owner',['/tmp/work']),/cache/);
  assert.equal(sourceWorkerCaches({XDG_DATA_HOME:'/tmp/work-other'},'/home/owner',['/tmp/work']).XDG_DATA_HOME,'/tmp/work-other');
});
