import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,mkdir,writeFile,readFile,rm,chmod,lstat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {sourcePublicationBuildRecipe,qualifySourcePublicationBuild} from '../src/source-build-qualification.mjs';
const run=promisify(execFile),gate=fileURLToPath(new URL('../scripts/publish-package.mjs',import.meta.url));
async function fixture(t,{failure=false,extraPeer=false,cache=false}={}){
 const root=await mkdtemp(join(tmpdir(),'development-publication-'));t.after(()=>rm(root,{recursive:true,force:true}));const directory=join(root,'source'),bin=join(root,'bin');await mkdir(directory);await mkdir(bin);
 const manifest={name:'@scope/driver',version:'1.0.0',type:'module',packageManager:'pnpm@11.19.0',exports:{'./package.json':'./package.json','./engine':'./engine.mjs'},devDependencies:{'@scope/library':'1.0.0'},scripts:{test:'node --test test/*.test.mjs','test:coordination':'node --test test/coordination/*.test.mjs',prepack:'node prepack.mjs'},registryConsumption:{sourceQualification:{kind:'development-root-self',testLibrary:{name:'@scope/library',version:'1.0.0',peerVersion:'0.9.0'},selector:{variable:'DRIVER_LIBRARY',value:'@scope/library'}}}};
 const files={'package.json':JSON.stringify(manifest),'pnpm-lock.yaml':"lockfileVersion: '9.0'\n",'pnpm-workspace.yaml':'packages: []\n','engine.mjs':'export const source="current-root";\n','test/index.test.mjs':`import {test} from 'node:test';import assert from 'node:assert/strict';import {source} from '@scope/library';test('actual current self host',()=>{assert.equal(source,${failure?'"wrong-root"':'"current-root"'});assert.equal(process.env.DRIVER_LIBRARY,'@scope/library');});\n`,'test/coordination/index.test.mjs':"import {test} from 'node:test';import assert from 'node:assert/strict';import {source} from '@scope/library';test('same self host during coordination',()=>assert.equal(source,'current-root'));\n",'prepack.mjs':"import assert from 'node:assert/strict';import {source} from '@scope/library';assert.equal(source,'current-root');assert.equal(process.env.DRIVER_LIBRARY,'@scope/library');\n"};
 const entries=[];for(const [path,text]of Object.entries(files)){await mkdir(dirname(join(directory,path)),{recursive:true});await writeFile(join(directory,path),text);entries.push({path,bytes:Buffer.from(text),mode:'100644'});}
 // A native fixture graph only, not a registry/supplier integration claim. The
 // real gate/Node tests/prepack run unchanged against this deterministic shape.
 const pnpm=`#!/usr/bin/env node\nconst fs=require('node:fs'),path=require('node:path');const args=process.argv.slice(2);if(args[0]==='peers'){const missing={'@scope/driver':[{parents:[{name:'@scope/library',version:'1.0.0'}],optional:false,wantedRange:'0.9.0'}]};if(${extraPeer})missing.typescript=[{parents:[{name:'foreign',version:'1.0.0'}],optional:false,wantedRange:'>=5.0.4'}];console.log(JSON.stringify({'.':{bad:{},missing,conflicts:[],intersections:{'@scope/driver':'0.9.0'}}}));process.exit(1);}const root=args[args.indexOf('--dir')+1];if(!root||!args.includes('--frozen-lockfile'))throw Error('original frozen receiver required');const m=path.join(root,'node_modules'),p=path.join(m,'@scope/library');fs.mkdirSync(p,{recursive:true});fs.writeFileSync(path.join(m,'.modules.yaml'),'layoutVersion: 5\\n');fs.writeFileSync(path.join(p,'package.json'),JSON.stringify({name:'@scope/library',version:'1.0.0',type:'module',main:'./index.mjs',peerDependencies:{'@scope/driver':'0.9.0'}}));fs.writeFileSync(path.join(p,'index.mjs'),"export {source} from '@scope/driver/engine';\\n");console.log('synthetic frozen graph fixture');\n`;
 await writeFile(join(bin,'pnpm'),pnpm);await chmod(join(bin,'pnpm'),0o755);
 const environment={...process.env,PATH:bin+':'+process.env.PATH,npm_config_ignore_scripts:'true'};delete environment.NODE_TEST_CONTEXT;delete environment.NODE_TEST_WORKER_ID;
 const cacheRoot=join(root,'release-cache');if(cache)await mkdir(cacheRoot,{mode:0o700});
 const codeGate=async()=>{const result=await run(process.execPath,[gate,'--qualify-build','--package',directory,...(cache?['--qualification-cache-root',cacheRoot]:[])],{env:environment,maxBuffer:4*1024*1024,timeout:30000}).catch(error=>error);assert(result.stdout,result.stderr);return JSON.parse(result.stdout);};
 return {root,directory,manifest,entries,cacheRoot,scratch:root,registry:'https://registry.561.group/',codeGate};
}
test('authored native development recipe reaches original CLI frozen receiver, own tests, coordination and prepack',async t=>{
 const f=await fixture(t);const before=await readFile(join(f.directory,'package.json'));const result=await qualifySourcePublicationBuild(f);
 assert.equal(result.operation,'qualify-source-publication-build');assert.equal(result.apply,false);assert.equal(result.developmentSourceQa.kind,'npm.development-root-self.source-qa');assert.equal(result.steps[0].evidence.lockfile.receiving.packages.length,1);assert.equal(result.steps[0].evidence.lockfile.nativePeerProcess.status,1);assert.equal(result.steps[0].evidence.lockfile.peerFrontier.authoredPeerSatisfied,false);assert.equal(result.developmentSourceQa.registryPeerClosureReceived,false);
 const evidence=result.steps[1].evidence;assert.deepEqual(evidence.testCount,{tests:1,pass:1,fail:0});assert.deepEqual(evidence.coordinationTestCount,{tests:1,pass:1,fail:0});assert.equal(evidence.prepack.ran,true);
 assert.deepEqual(await readFile(join(f.directory,'package.json')),before);await assert.rejects(lstat(join(f.directory,'node_modules/@scope/driver')),{code:'ENOENT'});
});
test('real original test failure stays refused before pack or publication, restoring self bindings',async t=>{
 const f=await fixture(t,{failure:true});await assert.rejects(qualifySourcePublicationBuild(f),/Code publication gate refused/);await assert.rejects(lstat(join(f.directory,'node_modules/@scope/driver')),{code:'ENOENT'});
});
test('plain JavaScript stays pack-only unless the source explicitly declares development QA',()=>{
 assert.equal(sourcePublicationBuildRecipe({scripts:{test:'node --test test/*.test.mjs'}}),null);
});
test('development recipe requires canonical PNPM evidence before calling original gate',async t=>{
 const f=await fixture(t);f.entries=f.entries.filter(row=>row.path!=='pnpm-lock.yaml');let called=false;await assert.rejects(qualifySourcePublicationBuild({...f,codeGate:()=>{called=true;}}),/authored native PNPM lock/);assert.equal(called,false);
});
test('a generic source-build report cannot masquerade as root-self development receiving',async t=>{
 const f=await fixture(t);await assert.rejects(qualifySourcePublicationBuild({...f,codeGate:async()=>({kind:'npm.source-build-qualification',outcome:'source-build-qualified',package:f.manifest.name,state:{sourceVersion:f.manifest.version},steps:[{step:1,ok:true},{step:2,ok:true,evidence:{testCount:{tests:1,pass:1,fail:0}}}]})}),/exact development source context/);
});

test('original CLI refuses an additional native required peer before functional tests or self binding',async t=>{const f=await fixture(t,{extraPeer:true});await assert.rejects(qualifySourcePublicationBuild(f),/additional native peer issues/);await assert.rejects(lstat(join(f.directory,'node_modules/@scope/driver')),{code:'ENOENT'});});

test('retained cache keeps development source-QA state and separate original frozen receiving attempts',async t=>{
 const f=await fixture(t,{cache:true});
 const first=await f.codeGate();assert.equal(first.outcome,'source-build-qualified');
 assert.equal(first.state.cacheRoot,f.cacheRoot);assert.equal(first.state.developmentSourceQa.kind,'npm.development-root-self.source-qa');
 assert.equal(first.state.developmentSourceQa.registryPeerClosureReceived,false);
 assert.equal(first.state.freshInstallTestCount.pass,1);
 const oldScratch=first.state.qualificationScratchRoot;
 const firstReceipt=join(oldScratch,'first-receiving-marker');await writeFile(firstReceipt,'original receiving retained\n');
 const second=await f.codeGate();assert.equal(second.outcome,'source-build-qualified');
 assert.notEqual(second.state.qualificationScratchRoot,oldScratch);
 assert.notEqual(second.state.qualificationScratchRoot,f.cacheRoot);
 assert.equal(second.state.developmentSourceQa.kind,'npm.development-root-self.source-qa');
 assert.equal(second.state.freshInstallLockfileCheck.kind,'npm.development-root-self.installation');
 assert.equal(second.state.freshInstallLockfileCheck.registryPeerClosureReceived,false);
 assert.equal(await readFile(firstReceipt,'utf8'),'original receiving retained\n');
 await assert.rejects(lstat(join(f.directory,'node_modules/@scope/driver')),{code:'ENOENT'});
});
