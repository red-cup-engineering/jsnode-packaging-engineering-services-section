// UNIT SUPPLIER DOUBLES, NOT NATIVE QUALIFICATION. The unchanged fixed composers
// execute their real public call/catch/projection/save/return paths. Only their
// source-admission, PNPM/YAML and supervisor suppliers are explicitly doubled.
import test,{mock} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,copyFile,readdir,realpath,lstat,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';

const root=await mkdtemp(join(tmpdir(),'npm-fixed-composer-unit-'));
const source=join(root,'owner'),src=join(source,'src'),scripts=join(source,'scripts');
await mkdir(src,{recursive:true,mode:0o700});await mkdir(scripts,{mode:0o700});
const base=fileURLToPath(new URL('../../',import.meta.url));
const candidate=base,original=base;
const sha=x=>createHash('sha256').update(x).digest('hex');
const bound=[];
for(const name of ['native-metadata-worker.mjs','native-package-preparation.mjs','source-worker-process.mjs','source-worker-evidence.mjs']){
 const bytes=await readFile(join(candidate,'src',name));await writeFile(join(src,name),bytes);bound.push({path:name,sha256:sha(bytes)});
}
await copyFile(join(original,'src/native-worker-custody.mjs'),join(src,'native-worker-custody.mjs'));
await copyFile(join(original,'package.json'),join(source,'package.json'));
for(const name of ['prepare-native-package.mjs','prepare-native-metadata.mjs'])await copyFile(join(original,'scripts',name),join(scripts,name));
await copyFile(join(original,'src/package-manager.mjs'),join(src,'package-manager.mjs'));
for(const name of ['artifact-member-receiving.mjs','unit-pnpm.mjs','unit-yaml.mjs','unit-delta.mjs'])await writeFile(join(src,name),'// Explicit test-only module supplier double; never native admission.\n');
// The prepared owner root must carry every sibling module the workers import; copy the rest of src unless a supplier double above already holds the name.
for(const name of await readdir(join(original,'src')))if(name.endsWith('.mjs'))await access(join(src,name)).catch(()=>copyFile(join(original,'src',name),join(src,name)));
const custody=await import(pathToFileURL(join(original,'src/native-worker-custody.mjs')));
let scenario;
const mocks=[];
const moduleMock=(path,namedExports)=>mocks.push(mock.module(pathToFileURL(path).href,{namedExports}));
moduleMock(join(src,'native-worker-custody.mjs'),{...custody,
 receiveBindings:async bindings=>bindings,
 save:async(path,value)=>{
  if(path.endsWith('/outer-result.json')){scenario.outerSaveAttempts++;scenario.projectedOutcome=structuredClone(value);if(scenario.failSave)throw scenario.receivingError;}
  return custody.save(path,value);
 }
});
moduleMock(join(src,'artifact-member-receiving.mjs'),{
 readRegistryArchiveMembers:()=>{throw new Error('not part of lock-refresh unit case');},
 readRegistryArchiveProjection:()=>{throw new Error('not part of lock-refresh unit case');},
 receiveInstalledRegistryProjection:()=>{throw new Error('not part of lock-refresh unit case');},
 receiveInstalledArtifactMembers:()=>{throw new Error('not part of lock-refresh unit case');}
});
function projection(query){return {kind:'pnpm.native-metadata-query.v1',directory:query.directory,expectedMirrorPath:join(query.cacheDirectory,'unit-mirror.json'),projectionSHA256:sha(JSON.stringify(query)),files:{'unit-query.json':'unit query bytes'}};}
function mirror(p){return {fileObserved:true,bytes:6,sha256:sha('mirror'),projectionSHA256:p.projectionSHA256};}
moduleMock(join(src,'unit-pnpm.mjs'),{
 createNativeMetadataPreparationService:()=>({unitSupplierDouble:true}),projectNativeMetadataQuery:projection,receiveNativeMetadataFile:async p=>mirror(p),
 receiveNativeTransportEnvironment:async environment=>({values:environment}),
 deriveNativeOfflineLockfileRefreshArguments:args=>args.slice(),
 receiveNativePrecallAdmission:async input=>({transformation:{derivedArguments:input.installArguments.slice()}}),
 assertNativePrecallAdmission:async()=>{},
 receiveNativeLockfileRefresh:async()=>({accepted:true,unitSupplierDouble:true})
});
moduleMock(join(src,'unit-delta.mjs'),{inspectNativeRegistryLockProfile:()=>({accepted:true,unitSupplierDouble:true}),compareNativeRootDependencyLockDelta:()=>({accepted:true,unitSupplierDouble:true})});
moduleMock(join(src,'unit-yaml.mjs'),{parseDocument:text=>({errors:[],warnings:[],toJS:()=>JSON.parse(text)}),visit:()=>{},isAlias:()=>false});
const fakeObservation=uncertain=>({pid:424242,processGroup:424242,startedAt:10,closedAt:50,status:uncertain?null:0,signal:null,invoked:true,quiescent:!uncertain,
 workerEvidence:{request:{path:'unit-request',sha256:'a'.repeat(64)},start:{path:'unit-start',sha256:'b'.repeat(64)},terminal:null},
 evidenceFailures:uncertain?[{stage:'terminal',code:'EIO'}]:[]});
moduleMock(join(src,'source-worker-process.mjs'),{runSourceWorkerProcess:async(program,args,options)=>{
 scenario.supervisorCalls++;assert.equal(program,scenario.bindings.nativeProgram);assert.equal(options.evidence.directory,join(scenario.input.attemptDirectory,'worker-evidence'));
 assert.deepEqual(options.evidence.input,await custody.identity(args[1]));assert.equal(args[2],options.evidence.input.sha256);
 if(scenario.uncertain){scenario.originalError=Object.assign(new Error('unit supplier uncertain settlement'),{code:'BUILD_WORKER_CUSTODY_UNCERTAIN',workerProcessGroup:424242,stdout:'original unit raw stdout',stderr:'original unit raw stderr',processObservation:fakeObservation(true)});throw scenario.originalError;}
 const payload=JSON.parse(await readFile(args[1],'utf8')),reportPath=join(options.cwd,'result.json');let report;
 if(args[0].endsWith('/prepare-native-metadata.mjs')){
  const p=projection(payload.preparation.query);await mkdir(p.directory,{mode:0o700});
  for(const [name,body] of Object.entries(p.files))await writeFile(join(p.directory,name),body);
  const prepared=await custody.save(join(payload.preparation.receiptDirectory,'prepared.json'),{unitSupplierDouble:true});
  report={inputSHA256:args[2],projectionSHA256:p.projectionSHA256,policyContext:payload.policyContext,accepted:true,prepared,queryDirectory:await custody.directory(p.directory,true)};
  for(const phase of ['producer','reader'])report[phase]={phase,accepted:true,state:phase==='producer'?'producer-received':'complete',mirror:mirror(p),receipt:await custody.save(join(payload.preparation.receiptDirectory,phase+'-received.json'),{unitSupplierDouble:true}),raw:await custody.save(join(payload.preparation.receiptDirectory,phase+'-execution.json'),{unitSupplierDouble:true})};
 }else{
  assert.ok(args[0].endsWith('/prepare-native-package.mjs'));
  const raw={request:payload.request,result:{status:0,signal:null,error:'',stdout:'unit native output',stderr:''}};
  report={inputSHA256:args[2],operation:payload.operation,request:payload.request,accepted:true,native:{original:await custody.save(join(options.cwd,'receipts','native.json'),raw),interval:{startedAt:20,endedAt:30}}};
 }
 const saved=await custody.save(reportPath,report);
 return {stdout:JSON.stringify({path:saved.path,sha256:saved.sha256}),stderr:'',processObservation:fakeObservation(false)};
}});
const {createNativeMetadataWorker}=await import(pathToFileURL(join(src,'native-metadata-worker.mjs')));
const {createNativePackagePreparationWorker}=await import(pathToFileURL(join(src,'native-package-preparation.mjs')));
async function fixture(kind,variant){
 const parent=await mkdtemp(join(tmpdir(),'npm-composer-case-'));for(const name of ['attempt','source','cache','previous'])await mkdir(join(parent,name),{mode:0o700});
 const cwd=join(parent,'source'),canonicalFiles=[];
 for(const [name,text] of [['package.json','{}'],['pnpm-lock.yaml','{}'],['pnpm-workspace.yaml','packages: []\n'],['.npmrc','registry=https://unit.invalid/\n']]){await writeFile(join(cwd,name),text);canonicalFiles.push(await custody.identity(join(cwd,name)));}
 const environment={PATH:dirname(process.execPath)+':/usr/bin',HOME:parent};
 const bindings={files:[],nativeProgram:await realpath(process.execPath),nativeEntry:join(src,'unit-pnpm.mjs'),ps:await realpath('/usr/bin/ps'),env:await realpath('/usr/bin/env'),pnpmModule:join(src,'unit-pnpm.mjs'),pnpmPrecallModule:join(src,'unit-pnpm.mjs'),pnpmLockDeltaModule:join(src,'unit-delta.mjs'),yamlModule:join(src,'unit-yaml.mjs')};
 const common={attemptDirectory:join(parent,'attempt'),canonicalFiles,environment,environmentPolicy:{}};
 let input;
 if(kind==='metadata'){
  const selections=[{name:'unit-fixture',version:'1.0.0'}];input={...common,policyContext:'source-owned-qualification-proposal',timeoutMilliseconds:1000,query:{name:'unit-fixture',selections,directory:join(parent,'attempt','query'),cacheDirectory:join(parent,'cache'),canonical:{...Object.fromEntries(['manifestSHA256','lockSHA256','workspaceSHA256','registryConfigurationSHA256'].map((key,i)=>[key,canonicalFiles[i].sha256])),selectionSHA256:sha(JSON.stringify(selections))}}};
 }else{
  const previous=join(parent,'previous','package.json');await writeFile(previous,'{}');input={...common,cwd,cacheRoot:join(parent,'cache'),registry:'https://unit.invalid/',sourceHead:'a'.repeat(40),sourceProfile:'explicit-unit-supplier-double',previousManifest:await custody.identity(previous),change:{unitSupplierDouble:true}};
 }
 return {kind,variant,parent,input,bindings,uncertain:variant==='uncertain-save-fails',failSave:variant!=='success',supervisorCalls:0,outerSaveAttempts:0,receivingError:Object.assign(new Error('unit outer receipt failure'),{code:'ENOSPC'})};
}
for(const kind of ['metadata','package'])for(const variant of ['uncertain-save-fails','success-save-fails','success'])test(`actual ${kind} fixed caller: ${variant} (explicit unit suppliers)`,async()=>{
 scenario=await fixture(kind,variant);
 const service=kind==='metadata'?await createNativeMetadataWorker({bindings:scenario.bindings}):await createNativePackagePreparationWorker({bindings:scenario.bindings});
 let result,error;try{result=await (kind==='metadata'?service.run(scenario.input):service.refresh(scenario.input));}catch(caught){error=caught;}
 assert.equal(scenario.supervisorCalls,1);assert.equal(scenario.outerSaveAttempts,1);
 const field=kind==='metadata'?'nativeMetadataEvidence':'nativePackageEvidence';
 if(variant==='success'){
  assert.equal(error,undefined);assert.equal(scenario.projectedOutcome.accepted,true);
  const retained=JSON.parse(await readFile(join(scenario.input.attemptDirectory,'outer-result.json'),'utf8'));assert.equal(retained.accepted,true);assert.equal(retained.processObservation.quiescent,true);
  if(kind==='metadata')assert.equal(result.accepted,true);else{assert.equal(result.evidence.operation.accepted,true);assert.equal(result.ticket.phase,'refreshed');assert.equal(JSON.parse(await readFile(join(scenario.input.attemptDirectory,'received.json'),'utf8')).operation.accepted,true);}
 }else{
  assert.ok(error, 'actual caller must reject outer receiving failure');await assert.rejects(access(join(scenario.input.attemptDirectory,'outer-result.json')),{code:'ENOENT'});
  const evidence=error[field];assert.ok(evidence);assert.equal(evidence.accepted,false);assert.equal(evidence.receivingEvidenceLost,true);assert.equal(evidence.receivingEvidenceFailure.code,'ENOSPC');
  if(scenario.uncertain){assert.equal(error,scenario.originalError);assert.equal(error.code,'BUILD_WORKER_CUSTODY_UNCERTAIN');assert.equal(error.workerProcessGroup,424242);assert.equal(error.stdout,'original unit raw stdout');assert.equal(error.stderr,'original unit raw stderr');assert.equal(evidence.state,'unknown');assert.equal(evidence.processObservation,scenario.originalError.processObservation);assert.deepEqual(evidence.processObservation.evidenceFailures,[{stage:'terminal',code:'EIO'}]);assert.equal(scenario.projectedOutcome.accepted,false);}
  else{assert.equal(error,scenario.receivingError);assert.equal(evidence.state,'refused');assert.equal(evidence.processObservation.quiescent,true);assert.equal(scenario.projectedOutcome.accepted,true,'must reach successful execution/receiving before injected outer save failure');}
 }
});
console.log('Exact v2 composer unit source identities:',JSON.stringify(bound));
console.log('Unit fixture owner root:',source);
