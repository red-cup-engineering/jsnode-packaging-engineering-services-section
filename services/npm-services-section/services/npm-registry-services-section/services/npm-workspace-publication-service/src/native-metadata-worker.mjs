import {readFile,writeFile,lstat,realpath,mkdir,readdir,access} from 'node:fs/promises';
import {constants} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire,isBuiltin} from 'node:module';
import {dirname,isAbsolute,join,resolve,relative,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {runSourceWorkerProcess} from './source-worker-process.mjs';
import {retainSourceWorkerPhaseRequest,sourceWorkerOutcomeFailure} from './source-worker-evidence.mjs';

import {sha,own,clone,absolute,bytes,identity,absent,directory,inside,save,receiveBindings} from './native-worker-custody.mjs';
async function custody(bindings,canonicalFiles,environmentFiles=[]){await receiveBindings(bindings);for(const f of [...canonicalFiles,...environmentFiles]){if(!isDeepStrictEqual(await identity(f.path),f))throw new TypeError('canonical source changed');}}
async function selfFiles(){const paths=[fileURLToPath(import.meta.url),fileURLToPath(new URL('./native-worker-custody.mjs',import.meta.url)),fileURLToPath(new URL('./source-worker-process.mjs',import.meta.url)),fileURLToPath(new URL('./source-worker-evidence.mjs',import.meta.url)),fileURLToPath(new URL('../scripts/prepare-native-metadata.mjs',import.meta.url)),fileURLToPath(new URL('../package.json',import.meta.url))];return Promise.all(paths.map(path=>identity(path)));}
async function loadPnpm(bindings){const mod=await import(pathToFileURL(bindings.pnpmModule));if(typeof mod.createNativeMetadataPreparationService!=='function'||typeof mod.projectNativeMetadataQuery!=='function'||typeof mod.receiveNativeMetadataFile!=='function')throw new TypeError('original PNPM metadata contract absent');return mod;}
function metadataProfile(pnpm,query){
  const batch=Object.hasOwn(query,'names');
  const project=batch?pnpm.projectNativeMetadataBatchQuery:pnpm.projectNativeMetadataQuery;
  const receive=batch?pnpm.receiveNativeMetadataBatchFiles:pnpm.receiveNativeMetadataFile;
  const create=batch?pnpm.createNativeMetadataBatchPreparationService:pnpm.createNativeMetadataPreparationService;
  if([project,receive,create].some(f=>typeof f!=='function'))throw new TypeError('qualified original metadata profile absent');
  return {batch,project,receive,create};
}
function completeMirror(projection,mirror){
  if(projection.kind!=='pnpm.native-metadata-batch-query.v1')return mirror?.fileObserved===true;
  return mirror?.allFilesObserved===true&&Array.isArray(mirror.files)&&mirror.files.length===projection.members.length
    &&projection.members.every((member,index)=>{const file=mirror.files[index];return file?.name===member.name&&file.path===member.expectedMirrorPath&&file.fileObserved===true&&file.projectionSHA256===projection.projectionSHA256;});
}
function sameMirrors(projection,left,right){
  if(!completeMirror(projection,left)||!completeMirror(projection,right))return false;
  if(projection.kind!=='pnpm.native-metadata-batch-query.v1')return left.sha256===right.sha256;
  return left.files.every((file,index)=>file.sha256===right.files[index].sha256&&file.bytes===right.files[index].bytes);
}
async function transport(bindings,environment,policy){
  // Public metadata subpath re-exports its original role validator.
  const mod=await loadPnpm(bindings);if(typeof mod.receiveNativeTransportEnvironment!=='function')throw new TypeError('original transport contract absent');
  return mod.receiveNativeTransportEnvironment(environment,policy);
}

/** Local exact-source composition. Bindings are independently qualified owner
 * inputs, never an operation JSON port granting code-selection authority. */
export async function createNativeMetadataWorker(input){
  own(input,['bindings']);const bindings=input.bindings;
  const held=await receiveBindings(bindings),self=await selfFiles();
  const pnpm=await loadPnpm(held);
  return Object.freeze({async run(input,options={}){
    own(options,['signal'],[]);const signal=options.signal;
    own(input,['attemptDirectory','query','environment','environmentPolicy','canonicalFiles','policyContext','timeoutMilliseconds']);
    const value=clone(input);
    if(!['authored-consumer','source-owned-qualification-proposal'].includes(value.policyContext))throw new TypeError('explicit actual policy context required');
    if(!Number.isSafeInteger(value.timeoutMilliseconds)||value.timeoutMilliseconds<1000||value.timeoutMilliseconds>150000)throw new TypeError('finite metadata worker deadline required');
    if(signal!==undefined&&!(signal instanceof AbortSignal))throw new TypeError('native cancellation signal required');
    if(signal!==undefined&&Object.getOwnPropertyDescriptor(AbortSignal.prototype,'aborted').get.call(signal))throw Object.assign(new Error('metadata worker cancelled before launch'),{code:'ABORT_ERR'});
    if(!Array.isArray(value.canonicalFiles)||value.canonicalFiles.length!==4)throw new TypeError('four actual canonical input identities required');
    const canonicalKeys=['manifestSHA256','lockSHA256','workspaceSHA256','registryConfigurationSHA256'];
    for(const [index,f]of value.canonicalFiles.entries()){own(f,['path','bytes','sha256']);if(f.sha256!==value.query?.canonical?.[canonicalKeys[index]])throw new TypeError('canonical file mapping differs');}
    if(sha(JSON.stringify(value.query?.selections))!==value.query?.canonical?.selectionSHA256)throw new TypeError('complete selection identity differs');
    await custody(held,value.canonicalFiles);if(!isDeepStrictEqual(self,await selfFiles()))throw new TypeError('npm worker source changed');
    const root=await directory(value.attemptDirectory,true),cache=await directory(value.query.cacheDirectory,true);
    if(inside(root.path,cache.path)||inside(cache.path,root.path)||value.canonicalFiles.some(f=>inside(root.path,f.path)||inside(cache.path,f.path)))throw new TypeError('metadata allocation overlaps canonical inputs');
    const query={...value.query,directory:join(root.path,'query')};
    if(value.query.directory!==query.directory)throw new TypeError('fixed metadata query directory required');
    const profile=metadataProfile(pnpm,query),projection=profile.project(query);
    await absent(projection.directory);for(const path of profile.batch?projection.expectedMirrorPaths:[projection.expectedMirrorPath])await absent(path);
    for(const path of ['input.json','result.json','outer-result.json','receipts','worker-evidence'])await absent(join(root.path,path));
    const admitted=await transport(held,value.environment,value.environmentPolicy);
    const environmentFiles=[];for(const key of ['NODE_EXTRA_CA_CERTS','SSL_CERT_FILE'])if(value.environment[key])environmentFiles.push(await identity(value.environment[key],1048576));
    if(!isDeepStrictEqual(admitted.values,value.environment))throw new TypeError('native transport changed');
    let ps;for(const part of value.environment.PATH.split(':')){if(!isAbsolute(part))throw new TypeError('absolute native PATH required');try{await access(join(part,'ps'),constants.X_OK);ps=await realpath(join(part,'ps'));break;}catch(error){if(!['ENOENT','ENOTDIR','EACCES'].includes(error.code))throw error;}}
    if(ps!==held.ps)throw new TypeError('native error-path ps supplier differs');
    const protectedFiles=[...held.files,...self,...value.canonicalFiles,...environmentFiles];
    const sourceRoots=[...held.files,...self].filter(f=>f.path.endsWith('/package.json')).map(f=>dirname(f.path));
    if(protectedFiles.some(f=>inside(root.path,f.path)||inside(cache.path,f.path))||sourceRoots.some(path=>inside(path,root.path)||inside(path,cache.path)))throw new TypeError('metadata allocation overlaps owned source or transport inputs');
    const preparation={program:held.nativeProgram,entry:held.nativeEntry,query,receiptDirectory:join(root.path,'receipts'),
      environment:value.environment,environmentPolicy:value.environmentPolicy,limits:{timeoutMilliseconds:45000,outputLimit:1048576}};
    const payload={bindings:held,self,canonicalFiles:value.canonicalFiles,environmentFiles,policyContext:value.policyContext,preparation,projectionSHA256:projection.projectionSHA256,root,cache};
    const intent=await save(join(root.path,'input.json'),payload); // Exclusive one-operation replay boundary.
    await mkdir(preparation.receiptDirectory,{mode:0o700});
    await custody(held,value.canonicalFiles,environmentFiles);
    let terminal,error,postCustody=true,report=null,reportIdentity=null;
    try{terminal=await runSourceWorkerProcess(held.nativeProgram,[fileURLToPath(new URL('../scripts/prepare-native-metadata.mjs',import.meta.url)),intent.path,intent.sha256],
      {cwd:root.path,env:value.environment,timeout:value.timeoutMilliseconds,maxBuffer:1048576,receiveProcess:true,signal,evidence:{directory:join(root.path,'worker-evidence'),input:intent}});}
    catch(caught){error=caught;terminal={stdout:caught.stdout??'',stderr:caught.stderr??'',processObservation:caught.processObservation??null};}
    // Settlement belongs to the original outer runner and occurs before any of these reads.
    try{await custody(held,value.canonicalFiles,environmentFiles);if(!isDeepStrictEqual(self,await selfFiles())||!isDeepStrictEqual(root,await directory(root.path,true))||!isDeepStrictEqual(cache,await directory(cache.path,true))||!isDeepStrictEqual(intent,await identity(intent.path)))throw new TypeError();}
    catch{postCustody=false;}
    try{
      reportIdentity=await identity(join(root.path,'result.json'));report=JSON.parse(await bytes(reportIdentity.path));
      const summary=JSON.parse(terminal.stdout);own(summary,['path','sha256']);
      if(summary.path!==reportIdentity.path||summary.sha256!==reportIdentity.sha256||report.inputSHA256!==intent.sha256||report.projectionSHA256!==projection.projectionSHA256||report.policyContext!==value.policyContext)throw new TypeError();
      if(!isDeepStrictEqual(report.queryDirectory,await directory(projection.directory,true)))throw new TypeError();
      for(const [name,text]of Object.entries(projection.files))if(!(await bytes(join(projection.directory,name))).equals(Buffer.from(text)))throw new TypeError();
      if(report.prepared?.path!==join(preparation.receiptDirectory,'prepared.json')||!isDeepStrictEqual(await identity(report.prepared.path),report.prepared))throw new TypeError();
      for(const phase of ['producer','reader']){const f=report[phase+'Executor'];if(f&&(f.path!==join(preparation.receiptDirectory,phase+'-executor-original.json')||!isDeepStrictEqual(await identity(f.path),f)))throw new TypeError();}
      for(const phase of ['producer','reader'])if(report[phase]){
        const r=report[phase];if(r.phase!==phase||r.mirror?.projectionSHA256!==projection.projectionSHA256||r.receipt?.path!==join(preparation.receiptDirectory,phase+'-received.json')||r.raw?.path!==join(preparation.receiptDirectory,phase+'-execution.json'))throw new TypeError();
        for(const f of [r.receipt,r.raw])if(!isDeepStrictEqual(await identity(f.path),f))throw new TypeError();
      }
    }catch{report=null;}
    let mirror=null;try{mirror=await profile.receive(projection);}catch{}
    const processObservation=terminal.processObservation;
    const accepted=!error&&postCustody&&processObservation?.quiescent===true&&processObservation.status===0&&processObservation.signal===null
      &&report?.accepted===true&&report.producer?.accepted===true&&report.reader?.accepted===true
      &&report.producer.state==='producer-received'&&report.reader.state==='complete'
      &&sameMirrors(projection,mirror,report.reader.mirror);
    const outcome={accepted:Boolean(accepted),state:accepted?'complete':processObservation?.quiescent===true?'refused':'unknown',intent,report:reportIdentity,
      processObservation,postCustody,workerEvidenceReceived:Boolean(report),mirror,policyContext:value.policyContext,outerFailure:error?(['BUILD_WORKER_CUSTODY_UNCERTAIN','WORKER_EVIDENCE_UNRECEIVED','ABORT_ERR','ETIMEDOUT','ERR_CHILD_PROCESS_STDIO_MAXBUFFER','ENOENT'].includes(error.code)?error.code:Number.isInteger(error.code)?'WORKER_EXIT':'WORKER_FAILURE'):null,projectionSHA256:projection.projectionSHA256,strictPolicyVerified:false,installationReceived:false};
    try{await save(join(root.path,'outer-result.json'),outcome);}catch(receivingError){throw sourceWorkerOutcomeFailure('metadata',outcome,error,receivingError);}
    return Object.freeze(outcome);
  }});
}

/** Fixed private worker implementation; no general command/program dispatch. */
export async function performNativeMetadataWorker(inputPath,inputSHA256){
  const inputBytes=await bytes(inputPath);if(sha(inputBytes)!==inputSHA256)throw new TypeError('worker input changed');
  const payload=JSON.parse(inputBytes);own(payload,['bindings','self','canonicalFiles','environmentFiles','policyContext','preparation','projectionSHA256','root','cache']);
  await custody(payload.bindings,payload.canonicalFiles,payload.environmentFiles);if(!isDeepStrictEqual(payload.self,await selfFiles()))throw new TypeError('worker source changed');
  if(!isDeepStrictEqual(payload.root,await directory(payload.root.path,true))||!isDeepStrictEqual(payload.cache,await directory(payload.cache.path,true)))throw new TypeError('worker directories changed');
  if(!isDeepStrictEqual({...process.env},payload.preparation.environment))throw new TypeError('worker environment differs');
  if(payload.preparation.program!==payload.bindings.nativeProgram||payload.preparation.entry!==payload.bindings.nativeEntry)throw new TypeError('fixed native provider required');
  const pnpm=await loadPnpm(payload.bindings),executor=await import(pathToFileURL(payload.bindings.executorModule));
  const result={inputSHA256,projectionSHA256:payload.projectionSHA256,policyContext:payload.policyContext,accepted:false};
  try{
    const profile=metadataProfile(pnpm,payload.preparation.query),service=profile.create(),prepared=await service.prepare(payload.preparation);
    if(prepared.projection.projectionSHA256!==payload.projectionSHA256)throw new TypeError('worker projection changed');
    result.prepared=prepared.prepared;result.queryDirectory=await directory(prepared.projection.directory,true);
    for(const phase of ['producer','reader']){
      await custody(payload.bindings,payload.canonicalFiles,payload.environmentFiles);
      const launch=await service.revalidate(prepared.ticket,{phase,environment:payload.preparation.environment});
      const limits={timeoutMilliseconds:45000,maximumOutputBytes:1048576};
      retainSourceWorkerPhaseRequest(payload.preparation.receiptDirectory,phase,inputSHA256,launch.request,limits);
      const receipt=executor.executeJavascriptNodeCommand(launch.request,limits);
      // spawnSync's byte allowance is a stop threshold with bounded-chunk overshoot,
      // not an exact retained-byte cap. Preserve its original receipt before PNPM's
      // stricter bounded receiver can refuse it. This evidence grants no acceptance.
      result[phase+'Executor']=await save(join(payload.preparation.receiptDirectory,phase+'-executor-original.json'),receipt);
      result[phase]=await service.receive(prepared.ticket,{phase,executionReceipt:receipt});
      if(!result[phase].accepted)break;
    }
    result.accepted=result.reader?.accepted===true;
  }catch(error){result.failure={name:error instanceof TypeError?'TypeError':'WorkerFailure'};}
  const saved=await save(join(payload.root.path,'result.json'),result);
  return {accepted:result.accepted,summary:{path:saved.path,sha256:saved.sha256}};
}
