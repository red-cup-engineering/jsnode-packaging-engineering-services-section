import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,readdir,rm,chmod,symlink} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import {receiveSourcePublicationBuildWorker} from '../src/source-build-worker-receiving.mjs';
import {spawn,spawnSync} from 'node:child_process';
import {admitSourcePublicationBuild,receiveSourcePublicationBuildAdmission,executeAdmittedSourcePublicationBuild,
 receiveAdmittedSourcePublicationBuild,receiveQualifiedPublicationBuildProducts} from '../src/source-build-qualification.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
const source={repository:'fixture/consumer',commit:'1'.repeat(40)};
const provider={profile:'native-manual-request/1',job:'fixture-build',release:'2'.repeat(40),declarationSHA256:'3'.repeat(64)};
const ownerQualification={source:{repository:'fixture/npm-owner',commit:'4'.repeat(40)},closureSHA256:'5'.repeat(64)};
const consumer={source,path:'fixture-source-record.json',sha256:'6'.repeat(64)};
let retainWrapperCustody=false;
const reference=async path=>{const b=await readFile(path);return {path,bytes:b.length,sha256:sha(b)};};
async function fixture(registry='http://127.0.0.1:1/',integrity='sha512-YQ=='){
 const base=await mkdtemp(join(tmpdir(),'fixed-build-handoff-')),directory=join(base,'source'),root=join(base,'evidence');
 await mkdir(root,{mode:0o700});
 const manifest={name:'fixed-build-fixture',version:'1.0.0',type:'module',scripts:{build:'tsc -p tsconfig.build.json',test:'node --test test/*.test.mjs'},devDependencies:{typescript:'0.0.0'},files:['dist'],exports:'./dist/index.mjs'};
 const lock={name:manifest.name,version:manifest.version,lockfileVersion:3,packages:{'':{name:manifest.name,version:manifest.version,devDependencies:manifest.devDependencies},'node_modules/typescript':{version:'0.0.0',resolved:registry+'typescript.tgz',integrity,bin:{tsc:'tsc.cjs'}}}};
 const files={'package.json':JSON.stringify(manifest),'package-lock.json':JSON.stringify(lock),'tsconfig.build.json':JSON.stringify({compilerOptions:{rootDir:'src',outDir:'dist'},include:['src/**/*.mts']}),'src/index.mts':'export const value=7;\n','test/index.test.mjs':"import test from 'node:test';import assert from 'node:assert/strict';import {value} from '../dist/index.mjs';test('original product',()=>assert.equal(value,7));\n"};
 const entries=[];for(const [path,text]of Object.entries(files)){await mkdir(dirname(join(directory,path)),{recursive:true});await writeFile(join(directory,path),text,{mode:0o644});entries.push({path,mode:'100644',bytes:Buffer.from(text)});}
 return {base,root,directory,options:{root,id:'original-occurrence',source,consumer,provider,ownerQualification,directory,manifest,entries,registry,timeout:30000},cleanup:()=>rm(base,{recursive:true,force:true})};
}
function correlation(request){return {NODE_JOB_REQUEST_PROFILE:provider.profile,NODE_JOB_REQUEST_ID:request.id,NODE_JOB_REQUEST_DIGEST:request.digest,NODE_JOB_ID:provider.job,NODE_JOB_RELEASE:provider.release,NODE_JOB_REQUEST_ATTEMPT:randomUUID(),INVOCATION_ID:randomUUID().replaceAll('-','')};}
async function withCorrelation(request,run){const env=correlation(request),before={};for(const key of Object.keys(env)){before[key]=process.env[key];process.env[key]=env[key];}try{return await run();}finally{for(const key of Object.keys(env))if(before[key]===undefined)delete process.env[key];else process.env[key]=before[key];}}
async function wrapper(root,request){
 const script=fileURLToPath(new URL('../scripts/run-admitted-source-build.mjs',import.meta.url));
 return await new Promise((resolve,reject)=>{const child=spawn(process.execPath,[script,root],{env:{...process.env,...correlation(request)},stdio:['ignore','pipe','pipe']});let stdout='',stderr='';const timer=setTimeout(()=>child.kill('SIGTERM'),45000);child.stdout.on('data',b=>{stdout+=b;if(stdout.length>1048576)child.kill('SIGTERM');});child.stderr.on('data',b=>{stderr+=b;if(stderr.length>1048576)child.kill('SIGTERM');});child.on('error',error=>{clearTimeout(timer);retainWrapperCustody=true;reject(error);});child.on('close',(status,signal)=>{clearTimeout(timer);if(signal||status!==0)retainWrapperCustody=true;resolve({status,signal,stdout,stderr});});});
}
test('exact occurrence admission and repeated read do not execute or collapse occurrences',async()=>{
 const f=await fixture();try{const a=await admitSourcePublicationBuild(f.options),before=await readdir(f.root);
  assert.equal(a.institutionalAdmission,false);assert.equal(a.providerAdmission,false);
  const r=await receiveSourcePublicationBuildAdmission({root:f.root,request:a.request});assert.deepEqual(r.request,a.request);
  assert.deepEqual(await receiveSourcePublicationBuildAdmission({root:f.root,request:a.request}),r);assert.deepEqual(await readdir(f.root),before);
  await assert.rejects(admitSourcePublicationBuild({...f.options,registry:'http://127.0.0.1:2/'}),{code:'EEXIST'});
  await assert.rejects(receiveSourcePublicationBuildAdmission({root:f.root,request:{...a.request,digest:'0'.repeat(64)}}));
 }finally{await f.cleanup();}
});
test('unsupported fields, malformed provenance, unsafe registry and source drift create no admission',async()=>{
 for(const alter of [o=>({...o,codeGate:()=>{throw Error('must not run');}}),o=>({...o,id:'../escape'}),o=>({...o,registry:'https://fixture:synthetic@invalid/'}),o=>({...o,registry:'https://invalid/?synthetic=token'}),o=>({...o,timeout:0}),o=>({...o,provider:{...provider,profile:'arbitrary'}}),o=>({...o,entries:[...o.entries,o.entries[0]]}),o=>({...o,source:{...source,commit:'wrong'}})]){
  const f=await fixture();try{await assert.rejects(admitSourcePublicationBuild(alter(f.options)));assert.deepEqual(await readdir(f.root),[]);}finally{await f.cleanup();}
 }
});
test('queued source additions and generated products refuse before execution intent',async()=>{
 for(const addition of ['dist/index.mjs','src/unreviewed.mjs']){const f=await fixture();try{const a=await admitSourcePublicationBuild(f.options);await mkdir(dirname(join(f.directory,addition)),{recursive:true});await writeFile(join(f.directory,addition),'unreceived');
  await withCorrelation(a.request,()=>assert.rejects(executeAdmittedSourcePublicationBuild({root:f.root,request:a.request}),/unreceived initial/));
  assert.deepEqual(await readdir(dirname(a.admission.path)),['admission.json']);
 }finally{await f.cleanup();}}
});
test('missing provider correlation, changed authored bytes and redirected files refuse without intent',async()=>{
 for(const change of ['correlation','bytes','symlink']){const f=await fixture();try{const a=await admitSourcePublicationBuild(f.options);
  if(change==='bytes')await writeFile(join(f.directory,'src/index.mts'),'changed');
  if(change==='symlink'){await rm(join(f.directory,'src/index.mts'));await symlink('../package.json',join(f.directory,'src/index.mts'));}
  await assert.rejects(executeAdmittedSourcePublicationBuild({root:f.root,request:a.request}));
  assert.deepEqual(await readdir(dirname(a.admission.path)),['admission.json']);
 }finally{await f.cleanup();}}
});
test('actual fixed wrapper retains original semantics across process boundaries; drift, transplant and duplicate refuse; next job runs',async()=>{
 // Synthetic compiler archive is an exact loopback fixture, not TypeScript qualification.
 const carrier=await mkdtemp(join(tmpdir(),'fixed-build-compiler-')),pkg=join(carrier,'package');await mkdir(pkg);
 await writeFile(join(pkg,'package.json'),JSON.stringify({name:'typescript',version:'0.0.0',bin:{tsc:'tsc.cjs'}}));
 await writeFile(join(pkg,'tsc.cjs'),"#!/usr/bin/env node\nconst fs=require('node:fs');fs.mkdirSync('dist',{recursive:true});fs.copyFileSync('src/index.mts','dist/index.mjs');\n");await chmod(join(pkg,'tsc.cjs'),0o755);
 const packed=spawnSync('tar',['-czf','-','-C',carrier,'package'],{maxBuffer:1048576});assert.equal(packed.status,0,packed.stderr.toString());
 const integrity='sha512-'+createHash('sha512').update(packed.stdout).digest('base64');let gets=0;
 const server=createServer((req,res)=>{if(req.url!=='/typescript.tgz'){res.writeHead(404).end();return;}gets++;res.writeHead(200,{'content-type':'application/octet-stream'});res.end(packed.stdout);});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const registry=`http://127.0.0.1:${server.address().port}/`;
 const f=await fixture(registry,integrity),g=await fixture(registry,integrity);
 try{
  const a=await admitSourcePublicationBuild(f.options),first=await wrapper(f.root,a.request);assert.equal(first.status,0,first.stderr);assert.equal(first.signal,null);
  const done=JSON.parse(first.stdout);assert.equal(done.providerSettlementReceived,false);
  const received=await receiveAdmittedSourcePublicationBuild({root:f.root,request:a.request,result:done.result});
  assert.equal(received.providerSettlementReceived,false);assert.equal(received.registryReceiving,false);
  for(const invalid of [null,false,undefined,{}, {...done.result,bytes:-1}])await assert.rejects(receiveAdmittedSourcePublicationBuild({root:f.root,request:a.request,result:invalid}),/exact retained result reference/);
  const products=await receiveQualifiedPublicationBuildProducts(received.qualification,{directory:f.directory});assert.equal(products.length,1);assert.equal(products[0].bytes.toString(),'export const value=7;\n');
  const before=await readFile(done.result.path),again=await receiveAdmittedSourcePublicationBuild({root:f.root,request:a.request});assert.deepEqual(again.qualification,received.qualification);assert.deepEqual(await readFile(done.result.path),before);
  const oldProduct=await readFile(join(f.directory,'dist/index.mjs'));await writeFile(join(f.directory,'dist/index.mjs'),'export const value=8;\n');await assert.rejects(receiveAdmittedSourcePublicationBuild({root:f.root,request:a.request,result:done.result}),/products changed/);await writeFile(join(f.directory,'dist/index.mjs'),oldProduct);
  await chmod(join(f.directory,'dist/index.mjs'),0o755);await assert.rejects(receiveAdmittedSourcePublicationBuild({root:f.root,request:a.request,result:done.result}),/products changed/);await chmod(join(f.directory,'dist/index.mjs'),0o644);
  const beforeGets=gets;const duplicate=await wrapper(f.root,a.request);assert.notEqual(duplicate.status,0);assert.equal(gets,beforeGets);assert.deepEqual(await readFile(done.result.path),before);
  const b=await admitSourcePublicationBuild({...g.options,id:'subsequent-occurrence'}),second=await wrapper(g.root,b.request);assert.equal(second.status,0,second.stderr);const secondDone=JSON.parse(second.stdout);
  const subsequent=await receiveAdmittedSourcePublicationBuild({root:g.root,request:b.request,result:secondDone.result});assert.equal((await receiveQualifiedPublicationBuildProducts(subsequent.qualification,{directory:g.directory})).length,1);
  // A valid other worker chain cannot be transplanted into this admission.
  const original=JSON.parse(before),other=JSON.parse(await readFile(secondDone.result.path));
  // Rebind a complete second original chain into this private fixture's fixed
  // names. The generic public process reader accepts it; the stronger bridge
  // must still reject its different admitted source, registry and deadline.
  const home=join(dirname(a.admission.path),'worker','build-home'),otherHome=join(dirname(b.admission.path),'worker','build-home');
  const names=['input.json','worker-evidence/request.json','worker-evidence/start.json','worker-evidence/terminal.json','worker-evidence/stdout.bin','worker-evidence/stderr.bin'];
  const retained=new Map();for(const name of names)retained.set(name,await readFile(join(home,name)));
  for(const change of ['source','registry','timeout']){
   for(const name of names)await writeFile(join(home,name),await readFile(join(otherHome,name)));
   const input=JSON.parse(await readFile(join(home,'input.json')));input.scratch=dirname(home);
   if(change!=='source'){input.directory=f.directory;input.manifest=await reference(join(f.directory,'package.json'));}
   if(change==='registry')input.registry='http://127.0.0.1:9/';
   if(change==='timeout')input.timeout=29000;
   await writeFile(join(home,'input.json'),JSON.stringify(input)+'\n');
   const reqPath=join(home,'worker-evidence/request.json'),req=JSON.parse(await readFile(reqPath));req.input=await reference(join(home,'input.json'));req.cwd=input.scratch;req.timeout=input.timeout;req.arguments=[input.gate.path,'--qualify-build','--package',input.directory,'--registry',input.registry];await writeFile(reqPath,JSON.stringify(req)+'\n');
   const startPath=join(home,'worker-evidence/start.json'),start=JSON.parse(await readFile(startPath));start.request=await reference(reqPath);await writeFile(startPath,JSON.stringify(start)+'\n');
   const terminalPath=join(home,'worker-evidence/terminal.json'),terminal=JSON.parse(await readFile(terminalPath));terminal.request=await reference(reqPath);terminal.start=await reference(startPath);for(const stream of ['stdout','stderr'])terminal.raw[stream]=await reference(join(home,'worker-evidence',stream+'.bin'));await writeFile(terminalPath,JSON.stringify(terminal)+'\n');
   const receiving={kind:'npm.source-build-worker.receiving.v1',scratch:input.scratch,input:req.input,request:await reference(reqPath)};
   assert.equal(receiveSourcePublicationBuildWorker(receiving).state,'settled-success');
   const transplanted={...original,workerReceiving:receiving,terminal:await reference(terminalPath),report:terminal.raw.stdout};await writeFile(done.result.path,JSON.stringify(transplanted)+'\n');
   await assert.rejects(receiveAdmittedSourcePublicationBuild({root:f.root,request:a.request,result:await reference(done.result.path)}),/nested worker does not bind/);
  }
  for(const [name,bytes]of retained)await writeFile(join(home,name),bytes);
  await writeFile(done.result.path,before);
  for(const altered of [{...original,workerReceiving:other.workerReceiving,terminal:other.terminal,report:other.report},{...original,unadmitted:true},{...original,products:[]}]){
   await writeFile(done.result.path,JSON.stringify(altered)+'\n');await assert.rejects(receiveAdmittedSourcePublicationBuild({root:f.root,request:a.request,result:await reference(done.result.path)}));
  }
  await writeFile(done.result.path,before);
  await rm(done.result.path);await assert.rejects(receiveAdmittedSourcePublicationBuild({root:f.root,request:a.request,result:done.result}),{code:'ENOENT'});
  await rm(join(f.directory,'dist'),{recursive:true});const beforeMissingRetry=gets;
  const stillDuplicate=await wrapper(f.root,a.request);assert.notEqual(stillDuplicate.status,0);assert.match(stillDuplicate.stderr,/EEXIST/);assert.equal(gets,beforeMissingRetry);
 }finally{await new Promise(resolve=>server.close(resolve));if(!retainWrapperCustody){await f.cleanup();await g.cleanup();await rm(carrier,{recursive:true,force:true});}else process.stderr.write('Nonzero or unreceived fixed-wrapper outcome; conservatively retaining all fixture source/custody.\n');}
});
