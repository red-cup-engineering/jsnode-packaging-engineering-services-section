import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as fs from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {SourceTextModule,SyntheticModule} from 'node:vm';
import {runSourceWorkerProcess} from '../../src/source-worker-process.mjs';

const selected=process.argv[2];
const uncertain=['uncertain','queued','supplier-failure','receipt-failure','log-failure','progress-failure','progress-null','progress-undefined','progress-getters','unwind-failure'].includes(selected);
const root=await fs.mkdtemp(join(tmpdir(),'npm-custody-unit-'));
const logs=join(root,'logs'),receipts=join(root,'receipts');await fs.mkdir(receipts);
const paths=[];
for(let i=0;i<3;i++){
 const dir=join(root,'consumer-'+i);await fs.mkdir(dir);
 await fs.writeFile(join(dir,'package.json'),JSON.stringify({name:'consumer-'+i,version:'1.0.0'}));
 await fs.writeFile(join(dir,'pnpm-lock.yaml'),"lockfileVersion: '9.0'\n");
 await fs.writeFile(join(dir,'pnpm-workspace.yaml'),'packages: []\nminimumReleaseAge: 1440\nminimumReleaseAgeStrict: true\n');
 await fs.mkdir(join(dir,'node_modules'));await fs.writeFile(join(dir,'node_modules/prior'),'keep');
 paths.push(dir);
}
const entry=join(root,'harmless-child.cjs');
await fs.writeFile(entry,`const fs=require('node:fs'),path=require('node:path');
const dir=process.argv[process.argv.indexOf('--dir')+1];
fs.mkdirSync(path.join(dir,'node_modules'),{recursive:true});
fs.writeFileSync(path.join(dir,'node_modules/.modules.yaml'),'layoutVersion: 5\\n');
fs.writeFileSync(path.join(dir,'child-completed'),'harmless child reached its terminal branch');
process.stdout.write('original-out');process.stderr.write('original-err');
${selected==='settled-timeout'?'setInterval(()=>{},1000);':selected==='settled-failure'?'process.exitCode=2;':''}
`);
let originalFailure,prepared=[],executed=0,receivingCalls=0,secondaryGetterReads=0,exitedChildVerified=false;
let start;const started=new Promise(resolve=>{start=resolve;});
let queuedCheckpoint;const secondQueued=new Promise(resolve=>{queuedCheckpoint=resolve;});
let secondQueueObserved=false;const createdStages=[];
const actualKill=process.kill;let refuseStop=uncertain;
// Same existing supervisor assay seam: only the first SIGKILL after this
// harmless child has already closed is synthetically refused. No live job,
// registry, native manager or unrelated process is manipulated.
process.kill=(pid,signal)=>{
 if(refuseStop&&signal==='SIGKILL'){
  // The supervisor signals a negative owned PGID. Verify the direct child
  // actually disappeared before injecting any refusal; otherwise real stop
  // proceeds and this qualification fails rather than leaving a live child.
  assert.ok(Number.isSafeInteger(pid)&&pid<0);
  try{actualKill(-pid,0);}catch(error){if(error.code==='ESRCH')exitedChildVerified=true;else throw error;}
  if(exitedChildVerified){refuseStop=false;throw Object.assign(new Error('synthetic stop refusal after harmless child exit'),{code:'EPERM'});}
 }
 return actualKill(pid,signal);
};
const worker=async(...args)=>{
 executed++;
 if(selected==='queued')assert.equal(secondQueueObserved,true,'first child cannot run before second call reached queue');
 try{return await runSourceWorkerProcess(...args);}
 catch(error){originalFailure=error;throw error;}
};
const service={
 async prepare(input){
  const command={program:process.execPath,arguments:[selected==='never-invoked'?join(root,'missing-node'):entry,'--dir',input.cwd]};
  // Failed-spawn control uses an absent program, not a Node module failure.
  if(selected==='never-invoked')command.program=join(root,'missing-program');
  const session={command,cwd:input.cwd};prepared.push(session);return{session,command,receiptDirectory:receipts};
 },
 async withStoreRead(session,work){
  start();
  if(selected==='queued'){
   let timer;
   try{await Promise.race([secondQueued,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('second queue checkpoint not reached')),2000);})]);}
   finally{clearTimeout(timer);}
  }
  try{return await work(session.command);}
  catch(error){if(selected==='unwind-failure')throw Object.assign(new Error('synthetic supplier unwind failure'),{code:'EUNWIND'});throw error;}
 },
 async receive(session,outcome){
  receivingCalls++;
  if(selected==='supplier-failure')throw Object.assign(new Error('synthetic supplier receiving failure'),{code:'ERECEIVE'});
  return{accepted:outcome.invoked===true&&outcome.code===0&&!outcome.signal,evidence:{native:outcome}};
 }
};
const fail=()=>{throw Error('unrelated supplier must not run in custody unit assay');};
const doubles={
 './carrier-surface.mjs':{carrierSurfaceViolations:fail,packageExportSurfacePaths:fail},
 './tarball-guard.mjs':{SECRET_PATH:/$a/,secretBearingContentPaths:fail},
 './registry.mjs':Object.fromEntries(['readRegistryPackage','readRegistryPackageVersion','publishConfiguredNpmRegistryArtifact','downloadConfiguredNpmRegistryTarball','receiveRegistryTarball'].map(name=>[name,fail])),
 './dependency-policy.mjs':{dependencySpecificationViolations:manifest=>{assert.match(manifest.name,/^consumer-[0-2]$/);return[];}},
 './npm-pack-result.mjs':{npmPackResult:fail},
 './publication-carrier-manifest.mjs':{preparePublicationCarrierManifest:fail},
 './source-worker-process.mjs':{runSourceWorkerProcess:worker}
};
const synthetic=values=>new SyntheticModule(Object.keys(values),function(){for(const[name,value]of Object.entries(values))this.setExport(name,value);});
const fsProvider={...fs,
 mkdtemp:async(...args)=>{const path=await fs.mkdtemp(...args);if(String(args[0]).endsWith('/.registry-install-'))createdStages.push(path);return path;},
 cp:async(from,to,...args)=>{
  try{return await fs.cp(from,to,...args);}
  finally{
   if(selected==='queued'&&createdStages.length===2&&dirname(to)===createdStages[1]){
    // This is the final awaited staging effect in the original receiver.
    // Its rejection/continuation microtasks reach receiveExclusively before
    // this next event-loop checkpoint releases the first harmless worker.
    setImmediate(()=>{secondQueueObserved=true;queuedCheckpoint();});
   }
  }
 },
 writeFile:async(path,...args)=>{
 const value=String(path);
 if(originalFailure&&selected==='receipt-failure'&&value.startsWith(receipts+'/'))throw Object.assign(new Error('synthetic receipt persistence failure'),{code:'EWRITE'});
 if(originalFailure&&selected==='log-failure'&&value.endsWith('/consumer-0.log'))throw Object.assign(new Error('synthetic text log failure'),{code:'ELOG'});
 return fs.writeFile(path,...args);
}};
const sourceURL=new URL('../../src/source-registry-closure.mjs',import.meta.url);
const module=new SourceTextModule(await fs.readFile(sourceURL,'utf8'),{
 identifier:sourceURL.href,
 importModuleDynamically:async specifier=>{
  assert.equal(specifier,'@red-cup-engineering/pnpm-engineering-services-section/native-store-assembly');
  const result=synthetic({createNativeStoreAssemblyService:()=>service});await result.link(()=>{throw Error('unexpected import');});await result.evaluate();return result;
 }
});
await module.link(async specifier=>{
 if(specifier==='node:fs/promises')return synthetic(fsProvider);
 if(specifier.startsWith('node:'))return synthetic(await import(specifier));
 assert.ok(Object.hasOwn(doubles,specifier),'unreceived source import '+specifier);return synthetic(doubles[specifier]);
});
await module.evaluate();
const receive=module.namespace.receiveSourceRegistryConsumers;
const options={releases:[],logDirectory:logs,pnpm:process.execPath,pnpmArguments:[entry],
 nativeStoreAssembly:{storeBase:root,receiptDirectory:receipts},readMemoryPressure:async()=>0,
 onProgress:async()=>{
  if(selected==='progress-failure')throw Object.assign(new Error('synthetic progress failure'),{code:'EPROGRESS'});
  if(selected==='progress-null')throw null;
  if(selected==='progress-undefined')throw undefined;
  if(selected==='progress-getters')throw Object.defineProperties({},Object.fromEntries(['code','message'].map(key=>[key,{get(){secondaryGetterReads++;throw Error('secondary accessor must not run');}}])));
 },
 installationTimeout:selected==='settled-timeout'?100:3000};
let result,error,queuedResult;
try{
 if(selected==='legacy')delete options.nativeStoreAssembly;
 if(selected==='queued'){
  const first=receive({...options,consumerPaths:paths.slice(0,2)});await started;
  [result,queuedResult]=await Promise.allSettled([first,receive({...options,consumerPaths:[paths[2]]})]);
  assert.equal(result.status,'rejected');error=result.reason;
  assert.equal(queuedResult.status,'rejected');assert.equal(queuedResult.reason.code,'BUILD_WORKER_RECEIVING_HELD');
  assert.equal(createdStages.length,2);assert.equal(secondQueueObserved,true);
  assert.equal(prepared.length,1,'queued native preparation must not begin');assert.equal(executed,1);
 }else{
  try{result=await receive({...options,consumerPaths:[paths[0]]});}catch(caught){error=caught;}
 }
 if(uncertain){
  assert.equal(error,originalFailure,'retain the original supervisor error, not a secondary refusal');
  assert.equal(error.code,'BUILD_WORKER_CUSTODY_UNCERTAIN');assert.equal(exitedChildVerified,true);
  assert.equal(error.processObservation.quiescent,false);
  assert.equal(error.stdout,'original-out');assert.equal(error.stderr,'original-err');
  assert.equal(await fs.readFile(join(prepared[0].cwd,'child-completed'),'utf8'),'harmless child reached its terminal branch');
  assert.equal(await fs.readFile(join(prepared[0].cwd,'pnpm-lock.yaml'),'utf8'),"lockfileVersion: '9.0'\n");
  assert.equal(await fs.readFile(join(paths[0],'node_modules/prior'),'utf8'),'keep');
  assert.equal(error.retainedStaging,prepared[0].cwd);
  const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
  const expectedRequest={program:prepared[0].command.program,arguments:prepared[0].command.arguments,cwd:prepared[0].cwd,timeout:options.installationTimeout,
   manifestSHA256:digest(await fs.readFile(join(prepared[0].cwd,'package.json'))),lockSHA256:digest(await fs.readFile(join(prepared[0].cwd,'pnpm-lock.yaml'))),
   workspacePolicySHA256:digest(await fs.readFile(join(prepared[0].cwd,'pnpm-workspace.yaml'))),packageHookSHA256:null};
  assert.deepEqual(error.nativeRequest,expectedRequest,'exact request survives even total receipt persistence failure');
  assert.ok(Object.isFrozen(error.nativeRequest)&&Object.isFrozen(error.nativeRequest.arguments));
  assert.equal(error.receivingReceipt.packages.length,0);
  assert.equal(error.receivingReceipt.refusals[0].reason,'BUILD_WORKER_CUSTODY_UNCERTAIN');
  assert.deepEqual(error.receivingReceipt.refusals[0].nativeRequest,expectedRequest);
  const stored=(await fs.readdir(receipts)).filter(name=>name.endsWith('.native-store-uncertain.json'));
  if(selected==='receipt-failure'){
   assert.equal(stored.length,0);assert.ok(error.receivingEvidenceFailures.some(e=>e.code==='EWRITE'));
  }else{
   assert.equal(stored.length,1);const terminal=JSON.parse(await fs.readFile(join(receipts,stored[0]),'utf8'));
   assert.equal(terminal.stdout,error.stdout);assert.equal(terminal.stderr,error.stderr);
   assert.equal(terminal.processObservation.quiescent,false);assert.equal(terminal.request.cwd,prepared[0].cwd);
  }
  if(selected==='supplier-failure')assert.ok(error.receivingEvidenceFailures.some(e=>e.code==='ERECEIVE'));
  if(selected==='log-failure')assert.ok(error.receivingEvidenceFailures.some(e=>e.code==='ELOG'));
  if(selected==='progress-failure')assert.ok(error.receivingEvidenceFailures.some(e=>e.code==='EPROGRESS'));
  if(selected==='progress-null'||selected==='progress-undefined')assert.ok(error.receivingEvidenceFailures.some(e=>e.phase==='progress-delivery'&&e.message===(selected==='progress-null'?'null':'undefined')+' rejection'));
  if(selected==='progress-getters'){assert.equal(secondaryGetterReads,0);assert.ok(error.receivingEvidenceFailures.some(e=>e.phase==='progress-delivery'&&e.message==='object rejection'));}
  if(selected==='unwind-failure')assert.ok(error.receivingEvidenceFailures.some(e=>e.code==='EUNWIND'));
  const before=prepared.length;
  await assert.rejects(receive({...options,consumerPaths:[paths[2]]}),{code:'BUILD_WORKER_RECEIVING_HELD'});
  assert.equal(prepared.length,before,'no automatic reset on the next call');
 }else{
  assert.equal(error,undefined);
  if(['success','legacy'].includes(selected)){
   assert.equal(result.packages.length,1);assert.equal(result.refusals.length,0);
   assert.equal(await fs.readFile(join(result.packages[0].previousInstallation,'prior'),'utf8'),'keep');
  }else{
   assert.equal(result.packages.length,0);assert.equal(result.refusals.length,1);
   assert.equal(await fs.readFile(join(paths[0],'node_modules/prior'),'utf8'),'keep');
   if(selected==='never-invoked')assert.equal(originalFailure.processObservation.invoked,false);
   else assert.equal(originalFailure.processObservation.quiescent,true);
   if(selected==='settled-timeout')assert.equal(originalFailure.processObservation.timedOut,true);
   const again=await receive({...options,consumerPaths:[paths[1]]});assert.equal(again.refusals.length,1);
  }
  for(const item of prepared)await assert.rejects(fs.lstat(item.cwd),{code:'ENOENT'});
 }
 const report={case:selected,accepted:true,scope:'original receiver/supervisor unit composition; PNPM provider doubled',root,prepared:prepared.length,executed,receivingCalls,...(selected==='queued'?{secondQueuedBeforeFirstExecution:secondQueueObserved}:{})};
 await fs.writeFile(join(root,'unit-receiving.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report));
}finally{process.kill=actualKill;}

