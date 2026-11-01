import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {qualifyPackageBuild} from '../scripts/publish-package.mjs';

for(const scenario of ['qualified-with-cache','refused-with-cache','throws-with-cache','qualified-without-cache'])
 test('the real publisher disposes invocation scratch: '+scenario,{concurrency:false},async()=>{
  const root=await fs.mkdtemp(path.join(process.env.TEST_DATA_ROOT??os.tmpdir(),'publisher-disposition-fixture-'));
  const before={PATH:process.env.PATH,TMPDIR:process.env.TMPDIR,ignore:process.env.npm_config_ignore_scripts,scenario:process.env.DISPOSITION_SCENARIO};
  try {
   const pkg=path.join(root,'package'), cache=path.join(root,'cache'),bin=path.join(root,'bin'), temporary=path.join(root,'temporary');
   for(const d of [pkg,cache,bin,temporary])await fs.mkdir(d,{mode:0o700});
   await fs.writeFile(path.join(cache,'owner-marker'),'original reusable cache');
   await fs.writeFile(path.join(pkg,'package.json'),JSON.stringify({name:'disposition-fixture',version:'1.0.0',packageManager:'npm@11.0.0',scripts:{test:'node --test'}}));
   await fs.writeFile(path.join(pkg,'package-lock.json'),scenario==='throws-with-cache'?'invalid JSON':JSON.stringify({name:'disposition-fixture',version:'1.0.0',lockfileVersion:3,packages:{'':{name:'disposition-fixture',version:'1.0.0'}}}));
   const command=`#!${process.execPath}\nimport fs from 'node:fs';import p from 'node:path';const at=process.env.TMPDIR;for(const d of fs.readdirSync(at))if(d.startsWith('qualify-package-build-')){fs.mkdirSync(p.join(at,d,'temporary-child-output'),{recursive:true});fs.writeFileSync(p.join(at,d,'temporary-child-output','payload'),'terminal child output');}if(process.argv[2]==='test'){if(process.env.DISPOSITION_SCENARIO==='refused-with-cache'){console.log('TAP version 13\\n1..1\\nnot ok 1 - actual refusal\\n# tests 1\\n# pass 0\\n# fail 1');process.exit(1)}console.log('TAP version 13\\n1..1\\nok 1 - native fixture\\n# tests 1\\n# pass 1\\n# fail 0');}else if(!['ci','install'].includes(process.argv[2])){throw Error('Unexpected producer command '+process.argv[2]);}\n`;
   await fs.writeFile(path.join(bin,'npm'),command,{mode:0o700});
   process.env.PATH=bin+path.delimiter+before.PATH;process.env.TMPDIR=temporary;
   process.env.npm_config_ignore_scripts='true';process.env.DISPOSITION_SCENARIO=scenario;
   const input={packageDir:pkg,...(scenario==='qualified-without-cache'?{}:{cacheRoot:cache})};
   if(scenario==='throws-with-cache')await assert.rejects(qualifyPackageBuild(input),SyntaxError);
   else {
    const result=await qualifyPackageBuild(input);
    assert.equal(result.outcome,scenario==='refused-with-cache'?'refused':'source-build-qualified',JSON.stringify(result));
    assert.equal(result.state.qualificationScratchDisposition.status,'removed');
    await assert.rejects(fs.stat(result.state.qualificationScratchDisposition.path),{code:'ENOENT'});
    if(scenario==='refused-with-cache')assert.equal(result.refusal.step,2);
   }
   assert.deepEqual(await fs.readdir(temporary),[],'invocation child output must leave with scratch');
   assert.equal(await fs.readFile(path.join(cache,'owner-marker'),'utf8'),'original reusable cache');
   assert.equal(JSON.parse(await fs.readFile(path.join(pkg,'package.json'),'utf8')).version,'1.0.0');
  } finally {
   for(const [key,value] of Object.entries({PATH:before.PATH,TMPDIR:before.TMPDIR,npm_config_ignore_scripts:before.ignore,DISPOSITION_SCENARIO:before.scenario}))if(value===undefined)delete process.env[key];else process.env[key]=value;
   await fs.rm(root,{recursive:true,force:true});
  }
 });
