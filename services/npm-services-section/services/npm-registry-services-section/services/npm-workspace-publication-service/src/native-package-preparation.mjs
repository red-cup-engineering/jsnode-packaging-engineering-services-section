// Fixed source-qualified package preparation at the original composing owner.
// Process groups remain exclusively owned by source-worker-process.
import {readFile,writeFile,lstat,realpath,mkdir,readdir,statfs,access,readlink} from 'node:fs/promises';
import {constants} from 'node:fs';
import {join,dirname,relative,basename} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {runSourceWorkerProcess} from './source-worker-process.mjs';
import {retainSourceWorkerPhaseRequest,sourceWorkerOutcomeFailure} from './source-worker-evidence.mjs';
import {packageManagerInstallCommand} from './package-manager.mjs';
import {createInstalledContractReader} from './installed-contract-owner.mjs';
import {readRegistryArchiveProjection,receiveInstalledRegistryProjection,readRegistryArchiveMembers,receiveInstalledArtifactMembers} from './artifact-member-receiving.mjs';
import {observedHeadroomProfile,deriveNativePackageResourceRequirements,observeNativePackageResourceCapacity,observeNativePackageMemory as memoryObservation} from './native-package-resources.mjs';
import {observeNativeInstallation} from './produce-registry-runtime.mjs';
import {sha,own,clone,bytes,identity,absent,directory,inside,save,receiveBindings} from './native-worker-custody.mjs';
const operationBounds=Object.freeze({refresh:{native:120000,outer:180000},materialize:{native:240000,outer:300000},offline:{native:120000,outer:180000},offlineMaterialize:{native:120000,outer:180000},initialOffline:{native:120000,outer:180000},initialOnline:{native:240000,outer:300000}});
const tickets=new WeakMap();
const rawLimit=33554432;
const projectionPolicy='registry-projection-consumer-v2',projectionProfile='npm-registry-legacy-idempotent-files-v1';
const projected=context=>context.registryProjectionPolicy===projectionPolicy;
function cancellation(signal){if(signal!==undefined&&(!(signal instanceof AbortSignal)||Object.getOwnPropertyDescriptor(AbortSignal.prototype,'aborted').get.call(signal)))throw Object.assign(new Error('original package operation cancelled before effect'),{code:'ABORT_ERR'});}
async function saveRaw(path,value){const text=JSON.stringify(value)+'\n';if(Buffer.byteLength(text)>rawLimit)throw new TypeError('original executor receipt exceeds retained bound');await writeFile(path,text,{flag:'wx',mode:0o600});return identity(path,rawLimit);}
async function ownFiles(){const root=dirname(fileURLToPath(import.meta.url)),paths=[join(root,'../package.json'),join(root,'../scripts/prepare-native-package.mjs')];for(const entry of await readdir(root,{withFileTypes:true}))if(entry.isFile()&&entry.name.endsWith('.mjs'))paths.push(join(root,entry.name));return Promise.all(paths.map(p=>identity(fileURLToPath(pathToFileURL(p)))));}
async function stable(held,self,canonical,environmentFiles){await receiveBindings(held,'package');if(!isDeepStrictEqual(self,await ownFiles()))throw new TypeError('original package worker source changed');for(const f of [...canonical,...environmentFiles])if(!isDeepStrictEqual(f,await identity(f.path)))throw new TypeError('original package input changed');}
async function pathProgram(name,environment){for(const dir of environment.PATH.split(':'))try{const p=join(dir,name);await access(p,constants.X_OK);return await realpath(p);}catch(error){if(!['ENOENT','ENOTDIR','EACCES'].includes(error.code))throw error;}throw new TypeError('original executable missing');}
function settled(raw){return raw?.result?.status===0&&raw.result.signal===null&&raw.result.error==='';}
function observed(raw,interval,lockfilePath){return {terminal:{invoked:true,code:raw.result.status,signal:raw.result.signal,timedOut:false,truncated:false,failedToStart:false},observation:{...interval,complete:true},stdout:raw.result.stdout,lockfilePath};}
async function parseLock(yaml,body){
 if(body.length>16777216)throw new TypeError('diagnostic lock size exceeds bound');
 const text=new TextDecoder('utf-8',{fatal:true}).decode(body),doc=yaml.parseDocument(text,{uniqueKeys:true,version:'1.2',schema:'core',customTags:[]});
 if(doc.errors.length||doc.warnings.length)throw new TypeError('diagnostic YAML syntax or tag is unsupported');
 let n=0;yaml.visit(doc,(_key,node)=>{if(++n>200000||yaml.isAlias(node)||node?.anchor||node?.tag)throw new TypeError('diagnostic YAML alias/tag/node bound refused');});
 return clone(doc.toJS({maxAliasCount:0}));
}
async function receiveAllocation(held,self,context,attemptDirectory,archivePaths=[]){
 const attempt=await directory(attemptDirectory,true),allocation=await directory(context.cacheRoot,true);
 if(inside(attempt.path,context.cwd)||inside(context.cwd,attempt.path)||inside(allocation.path,attempt.path)||inside(attempt.path,allocation.path))throw new TypeError('package attempt overlaps source/cache');
 for(const source of [context.cwd,...(context.sourceDirectory===undefined?[]:[context.sourceDirectory])]){await directory(source);if(inside(source,attempt.path)||inside(attempt.path,source)||inside(source,allocation.path)||inside(allocation.path,source))throw new TypeError('package allocation overlaps original source');}
 const protectedFiles=[...held.files,...self,...context.canonicalFiles,...context.receivingFiles,...context.environmentFiles],protectedPaths=[...protectedFiles.map(f=>f.path),...archivePaths];
 const supplierRoots=protectedFiles.filter(f=>basename(f.path)==='package.json').map(f=>dirname(f.path));
 if(protectedPaths.some(p=>inside(attempt.path,p)||inside(allocation.path,p))||supplierRoots.some(p=>inside(p,attempt.path)||inside(p,allocation.path)))throw new TypeError('package allocation overlaps source/transport/archive');
 return {attempt,allocation};
}
async function runFixed({held,self,pnpm,context,capability,operation,attemptDirectory,signal}){
 const bounds=operationBounds[operation];if(!bounds)throw new TypeError('unsupported fixed package operation');
 cancellation(signal);
 const {attempt,allocation}=await receiveAllocation(held,self,context,attemptDirectory);
 for(const name of ['input.json','result.json','outer-result.json','received.json','receiving-refused.json','receipts','worker-evidence'])await absent(join(attempt.path,name));
 const request={type:'JavascriptNodeCommandExecutionRequest',version:1,command:held.nativeEntry,arguments:capability.transformation.derivedArguments.slice(),directory:context.cwd,environment:context.environment,input:null};
 await pnpm.assertNativePrecallAdmission(capability,{cwd:request.directory,program:request.command,arguments:request.arguments,environment:request.environment});
 await stable(held,self,[...context.canonicalFiles,...context.receivingFiles],context.environmentFiles);
 if(await pathProgram('node',context.environment)!==held.nativeProgram||await pathProgram('ps',context.environment)!==held.ps||await realpath('/usr/bin/env')!==held.env)throw new TypeError('native shebang/error-path supplier changed');
 if(context.resourceProfile===observedHeadroomProfile&&!context.contentResources)throw new TypeError('observed native content requirement missing');
 let contentCapacityObservation=null;
 if(context.contentResources){
  contentCapacityObservation=await observeNativePackageResourceCapacity({...context,attemptDirectory:attempt.path},context.contentResources.rows);
  if(context.resourceProfile!==observedHeadroomProfile||!isDeepStrictEqual(contentCapacityObservation.requirements,context.contentResources.requirements))throw new TypeError('native resource requirement context changed');
  context.contentResources.observation=contentCapacityObservation;
 }
 const memory=await memoryObservation(536870912);
 const disk=await statfs(context.cacheRoot);if(disk.bavail*disk.bsize<67108864||disk.ffree<1024)throw new TypeError('fresh operation capacity unreceived');
 const payload={held,self,context,operation,attempt,allocation,request,bounds};
 const intent=await save(join(attempt.path,'input.json'),payload);await mkdir(join(attempt.path,'receipts'),{mode:0o700});
 let execution,error;try{execution=await runSourceWorkerProcess(held.nativeProgram,[fileURLToPath(new URL('../scripts/prepare-native-package.mjs',import.meta.url)),intent.path,intent.sha256],{cwd:attempt.path,env:context.environment,timeout:bounds.outer,maxBuffer:1048576,receiveProcess:true,signal,evidence:{directory:join(attempt.path,'worker-evidence'),input:intent}});}
 catch(caught){error=caught;execution={stdout:caught.stdout??'',stderr:caught.stderr??'',processObservation:caught.processObservation??null};}
 let postCustody=true,report=null,raw=null;const retainedExecutorReceipts=[];
 try{const stableFiles=operation==='refresh'?context.canonicalFiles.filter(f=>f.path!==join(context.cwd,'pnpm-lock.yaml')):context.canonicalFiles;await stable(held,self,[...stableFiles,...context.receivingFiles],context.environmentFiles);if(!isDeepStrictEqual(attempt,await directory(attempt.path,true))||!isDeepStrictEqual(allocation,await directory(allocation.path,true))||!isDeepStrictEqual(intent,await identity(intent.path)))throw new TypeError();}catch{postCustody=false;}
 try{const reportPath=join(attempt.path,'result.json'),summary=JSON.parse(execution.stdout);own(summary,['path','sha256']);if(summary.path!==reportPath||summary.sha256!==(await identity(reportPath)).sha256)throw new TypeError();report=JSON.parse(await bytes(reportPath));if(report.inputSHA256!==intent.sha256||report.operation!==operation||!isDeepStrictEqual(report.request,request))throw new TypeError();
 if(context.contentResources){const got=report.contentCapacityObservation;if(!got||got.profile!==observedHeadroomProfile||!isDeepStrictEqual(got.requirements,context.contentResources.requirements)||!Number.isSafeInteger(got.at)||got.at<execution.processObservation.startedAt||got.at>execution.processObservation.closedAt)throw new TypeError('original child resource observation unreceived');}
 const phases=['materialize','offlineMaterialize'].includes(operation)?['versionBefore','native','versionAfter']:['native'];
 let missing=false;
 for(const phase of phases){const record=report[phase];if(!record){missing=true;if(report.accepted)throw new TypeError();continue;}if(missing)throw new TypeError();
 if(record.original.path!==join(attempt.path,'receipts',phase+'.json')||!isDeepStrictEqual(record.original,await identity(record.original.path,rawLimit)))throw new TypeError();
 const receipt=JSON.parse(await bytes(record.original.path,rawLimit)),expected={...request,arguments:phase==='native'?request.arguments:['--version']};
 if(!isDeepStrictEqual(receipt.request,expected)||report.accepted&&(!settled(receipt)||phase!=='native'&&receipt.result.stdout.trim()!=='11.28.5'))throw new TypeError();
 if(!Number.isSafeInteger(record.interval?.startedAt)||!Number.isSafeInteger(record.interval?.endedAt)||record.interval.startedAt<execution.processObservation.startedAt||record.interval.endedAt>execution.processObservation.closedAt||record.interval.endedAt<record.interval.startedAt)throw new TypeError();
 retainedExecutorReceipts.push({phase,original:record.original,status:receipt.result.status,signal:receipt.result.signal,errorSHA256:sha(receipt.result.error),interval:record.interval});if(phase==='native')raw=receipt;
 }
 }catch{report=null;raw=null;}
 const processObservation=execution.processObservation,accepted=!error&&postCustody&&processObservation?.quiescent===true&&processObservation.status===0&&processObservation.signal===null&&report?.accepted===true&&raw;
 const evidence={kind:'npm.native-package-operation.v1',operation,accepted:Boolean(accepted),state:accepted?'received':processObservation?.quiescent===true?'refused':'unknown',intent,processObservation,postCustody,workerEvidenceReceived:Boolean(report),retainedExecutorReceipts,failure:error?.code??null,requestSHA256:sha(JSON.stringify(request)),resourceObservation:{memory,contentCapacityObservation,cacheAvailableBytes:disk.bavail*disk.bsize,cacheFreeInodes:disk.ffree,reservation:false},report:report?await identity(join(attempt.path,'result.json')):null};
 try{await save(join(attempt.path,'outer-result.json'),evidence);}catch(receivingError){throw sourceWorkerOutcomeFailure('package',evidence,error,receivingError);}
 if(!accepted)throw Object.assign(new TypeError('original fixed package execution unreceived'),{nativePackageEvidence:evidence});
 return {evidence,raw,interval:report.native.interval,request,rawIdentity:report.native.original};
}


async function contentCapacity(context,archives){
 let expanded=0,headers=0,maxArchive=0;
 for(const a of archives){if(!isDeepStrictEqual(a.identity,await identity(a.identity.path,67108864)))throw new TypeError('received content changed before native operation');expanded+=a.observation.expandedBytes;headers+=a.observation.headers.length;maxArchive=Math.max(maxArchive,a.observation.expandedBytes);}
 const space=await statfs(context.cwd),cache=await statfs(context.cacheRoot),needed=expanded*4+67108864,inodes=headers*4+archives.length*32+1024;
 if(!Number.isSafeInteger(needed)||needed>1073741824||headers>65536||Math.min(space.bavail*space.bsize,cache.bavail*cache.bsize)<needed||Math.min(space.ffree,cache.ffree)<inodes)throw new TypeError('bounded full-content operation capacity unreceived');
 const memory=await memoryObservation(Math.max(536870912,maxArchive*3+archives.length*1048576));
 return {availableSourceBytes:space.bavail*space.bsize,availableCacheBytes:cache.bavail*cache.bsize,requiredFreeBytes:needed,expandedArchiveBytes:expanded,requiredFreeInodes:inodes,memory,reservation:false};
}
async function retainReceivingFailure(attemptDirectory,error,operation){
 const evidence={operation,receivingAccepted:false,localChangesMayExist:true,
  nativeLockRefreshEvidence:error.nativeLockRefreshEvidence??null,nativePreparedEvidence:error.nativePreparedEvidence??null,nativeOfflineEvidence:error.nativeOfflineEvidence??null,nativeOnlineEvidence:error.nativeOnlineEvidence??null,nativePackageEvidence:error.nativePackageEvidence??null,
  nativeInstalledArtifactEvidence:error.nativeInstalledArtifactEvidence??null};
 try{await save(join(attemptDirectory,'receiving-refused.json'),evidence);}catch(receivingError){error.receivingEvidenceLost=true;error.receivingEvidenceFailure=receivingError.name;}
}
// The selector names an edge, never grants an installed package root. The
// existing native contract reader determines the provider at the actual importer.
async function receiveSelectedInstance(context,entry,key,yaml){
 const selector=context.selectedArtifactInstances.find(s=>s.artifact===key);
 const root=context.cwd, importer=await realpath(selector.importer),resolved=await realpath(selector.resolved),binDirectory=await realpath(selector.binDirectory);
 if(!inside(root,importer)||!inside(root,resolved)||!inside(root,binDirectory))throw new TypeError('selected importer instance leaves received installation');
 const importerIdentity=await identity(importer),reader=createInstalledContractReader({root,installation:join(root,'node_modules')}),owner=reader.owner(importer),provider=reader.provider(selector.specifier,importer,resolved);
 if(provider.name!==entry.name||provider.version!==entry.version||selector.specifier!==entry.name)throw new TypeError('native importer selects another artifact instance');
 const lock=await parseLock(yaml,await bytes(join(root,'pnpm-lock.yaml')));let edge;
 if(selector.lockImporter!==undefined){
  if(selector.lockImporter!=='.'||owner.directory!==root)throw new TypeError('only exact root lock importer admitted');
  edge=lock.importers?.['.'];
 }else{
  const prefix=owner.name+'@'+owner.version,keys=Object.keys(lock.snapshots??{}).filter(k=>k===prefix||k.startsWith(prefix+'('));
  if(keys.length!==1||keys[0]!==selector.lockSnapshot)throw new TypeError('exact installed peer snapshot remains unreceived');
  edge=lock.snapshots[keys[0]];
 }
 const versions=['dependencies','devDependencies','optionalDependencies'].flatMap(role=>Object.hasOwn(edge?.[role]??{},entry.name)?[edge[role][entry.name]]:[]).map(v=>typeof v==='string'?v:v.version);
 if(!versions.length||versions.some(v=>v!==entry.version&&!v.startsWith(entry.version+'(')))throw new TypeError('selected installed instance differs from frozen lock edge');
 return {packageRoot:provider.directory,binDirectory,witness:{selector:clone(selector),importer:importerIdentity,importerOwner:{name:owner.name,version:owner.version,directory:owner.directory},provider:{name:provider.name,version:provider.version,directory:provider.directory,manifest:await identity(join(provider.directory,'package.json'))},resolved:await identity(resolved),resolutionClaim:'native-importer-relative-provider-package; module execution separately received'}};
}
async function receiveInstalledAfter(context,archives,selected,execution,run,{pnpm,projectionBinding,yaml}={}){
 for(const archive of archives)if(!isDeepStrictEqual(archive.identity,await identity(archive.identity.path,67108864)))throw new TypeError('received archive changed during native materialization');
 await access(join(context.cwd,'node_modules','.modules.yaml'));
 const installation={kind:'native-package-installation',status:0,platform:process.platform,manager:execution.nativeProvider.manager,requestSHA256:run.evidence.requestSHA256,receipt:run.rawIdentity.path,receiptSHA256:run.rawIdentity.sha256,manifestSHA256:context.canonicalFiles[0].sha256,lockSHA256:context.canonicalFiles[1].sha256,normalization:'posix-package-files-0644-0755'};
 const comparisons=[];
 for(const key of selected){
  const archive=archives.find(a=>a.entry.name+'@'+a.entry.version===key),{entry}=archive;
  let selection={packageRoot:join(context.cwd,'node_modules',entry.name),binDirectory:join(context.cwd,'node_modules','.bin')},registryProjectionBinding;
  if(projected(context)){
   await pnpm.assertNativeRegistryProjectionBinding(projectionBinding);
   selection=await receiveSelectedInstance(context,entry,key,yaml);
   const {kind,policy,routes,storeAllocation,storeBefore,storeAfter,configuration,...nativeFacts}=projectionBinding;
   registryProjectionBinding={...nativeFacts,profile:projectionProfile,integrity:entry.archive.integrity,expandedSHA256:archive.observation.expandedSHA256,rawInventorySHA256:archive.observation.rawInventorySHA256,projectionSHA256:archive.observation.projectionSHA256,requestSHA256:installation.requestSHA256,receiptSHA256:installation.receiptSHA256};
  }
  // Constructed only here, after runFixed's actual executor receipt, group
  // quiescence and original PNPM receiving. Operation JSON cannot inject it.
  const nativeInstallation=async()=>{if(projected(context))await pnpm.assertNativeRegistryProjectionBinding(projectionBinding);return {installation,provider:execution.nativeProvider.provider,...(registryProjectionBinding?{registryProjectionBinding}:{})};};
  const result=await (projected(context)?receiveInstalledRegistryProjection:receiveInstalledArtifactMembers)({...entry,registry:context.registry,packageRoot:selection.packageRoot,installationRoot:context.cwd,binDirectory:selection.binDirectory,...(projected(context)?{profile:projectionProfile}:{})},{nativeInstallation});
  if(selection.witness)result.selectedInstance=selection.witness;
  comparisons.push(result);if(!result.ok)throw Object.assign(new TypeError('original installed artifact comparison refused'),{nativeInstalledArtifactEvidence:{selectedArtifact:key,comparisons}});
 }
 return comparisons;
}

/** All transitions remain in this original parent's lifetime. JSON never
 * supplies a predecessor ticket, executor callback or installed-success port. */
export async function createNativePackagePreparationWorker(input){
 own(input,['bindings']);const held=await receiveBindings(input.bindings,'package'),self=await ownFiles();
 const pnpm=await import(pathToFileURL(held.pnpmPrecallModule)),delta=await import(pathToFileURL(held.pnpmLockDeltaModule)),yaml=await import(pathToFileURL(held.yamlModule));
 const owner={}, frozenReceivings=new WeakMap();
 async function registrations(comparisons,root){
  const rows=[];for(const comparison of comparisons)for(const r of comparison.installation.registrations){
   const stat=await lstat(r.path);rows.push({name:r.name,kind:r.kind,path:relative(root,r.path),target:relative(root,r.target),mode:stat.mode&0o777,body:stat.isSymbolicLink()?await readlink(r.path):(await identity(r.path,262144)).sha256});
  }return rows;
 }
 function take(ticket){const state=tickets.get(ticket);if(!state||state.owner!==owner||state.closed)throw new TypeError('original unused preparation ticket required');state.closed=true;return state;}
 const ticketFor=state=>{const ticket=Object.freeze({kind:'npm.native-package-preparation.ticket.v1',phase:state.phase});tickets.set(ticket,{...state,owner,closed:false});return ticket;};
 async function receiveContent(context,input,{partial=false}={}){
  const selected=clone(input.selectedArtifacts),content=clone(input.content);if(!Array.isArray(content)||!content.length||content.length>4096||!Array.isArray(selected)||!selected.length)throw new TypeError('finite complete artifact inputs required');
  const lock=await parseLock(yaml,await bytes(join(context.cwd,'pnpm-lock.yaml'))),entries=Object.entries(lock.packages??{}),seen=new Set();let expanded=0,headers=0,maxArchive=0;const archives=[];
  const sourceManifest=JSON.parse(await bytes(join(context.cwd,'package.json'))),sourceReferences=new Map();
  for(const role of ['dependencies','devDependencies','optionalDependencies','peerDependencies'])for(const [name,version]of Object.entries(sourceManifest[role]??{})){const key=name+'@'+version;sourceReferences.set(key,[...(sourceReferences.get(key)??[]),{role,version}]);}
  if(selected.some(key=>typeof key!=='string'||(!Object.hasOwn(lock.packages??{},key)&&(!partial||!sourceReferences.has(key))))||new Set(selected).size!==selected.length)throw new TypeError('exact selected artifact subset required');
  const selectedOutsideLock=selected.filter(key=>!Object.hasOwn(lock.packages??{},key)).map(reference=>({reference,sourceDeclarations:sourceReferences.get(reference),reason:'declared-source-version-absent-from-lock'}));
  const measured=context.resourceProfile===observedHeadroomProfile,resourceRows=[];let retainedMetadataBytes=0;
  const contentDirectory=join(input.attemptDirectory,'content-receiving');if(measured){await receiveAllocation(held,self,context,input.attemptDirectory,content.map(entry=>entry.archive?.path));await mkdir(contentDirectory,{mode:0o700});}
  for(const entry of content){own(entry,['name','version','archive','limits']);const key=entry.name+'@'+entry.version;if(seen.has(key)||lock.packages?.[key]?.resolution?.integrity!==entry.archive?.integrity)throw new TypeError('artifact content differs from native lock');seen.add(key);if([context.cwd,context.cacheRoot,input.attemptDirectory].some(root=>inside(root,entry.archive.path)))throw new TypeError('archive custody overlaps mutable native allocation');if(!Number.isSafeInteger(entry.limits?.tarBytes)||!Number.isSafeInteger(entry.limits?.archiveBytes))throw new TypeError('finite original archive bounds required');await memoryObservation(Math.max(536870912,3*entry.limits.tarBytes+2*entry.limits.archiveBytes+(projected(context)?134217728:67108864)));const got=await (projected(context)?readRegistryArchiveProjection:readRegistryArchiveMembers)({...entry.archive,limits:entry.limits,...(projected(context)?{profile:projectionProfile}:{})});const rawHeaderCount=projected(context)?got.sourceArchive.occurrences.length+got.sourceArchive.extensions.length:got.observation.headers.length;const manifest=JSON.parse((projected(context)?got.projection:got.archive).manifestText);if(manifest.name!==entry.name||manifest.version!==entry.version)throw new TypeError('archive content identity differs');expanded+=got.observation.expandedBytes;headers+=rawHeaderCount;maxArchive=Math.max(maxArchive,got.observation.expandedBytes);if(headers>65536||expanded>(measured?1073741824:251658240))throw new TypeError('initial full-content stage exceeds bounded aggregate profile');
   const archiveIdentity=await identity(entry.archive.path,67108864);
   if(measured){
    const originalObservation={archiveIdentity,observation:got.observation,...(projected(context)?{sourceArchive:got.sourceArchive,projection:got.projection}:{})},receiptBytes=Buffer.byteLength(JSON.stringify(originalObservation)+'\n');
    if(receiptBytes>16777216||retainedMetadataBytes+receiptBytes>67108864)throw new TypeError('bounded original archive observation storage required');
    const receipt=await save(join(contentDirectory,String(archives.length).padStart(4,'0')+'.json'),originalObservation);retainedMetadataBytes+=receipt.bytes;
    const row={archive:archiveIdentity,receipt,expandedBytes:got.observation.expandedBytes,headerCount:rawHeaderCount,...(projected(context)?{registryProjectionPolicy:projectionPolicy}:{})};resourceRows.push(row);deriveNativePackageResourceRequirements(resourceRows);
    const {headers:originalHeaders,...rest}=got.observation;
    archives.push({entry,identity:archiveIdentity,observation:{...rest,headerCount:rawHeaderCount,headersSHA256:sha(JSON.stringify(originalHeaders)),receipt}});
   }else archives.push({entry,observation:got.observation,identity:archiveIdentity});}
  const missing=entries.filter(([k])=>!seen.has(k)).map(([k])=>k),selectedMissing=selected.filter(k=>!seen.has(k));
  if(entries.some(([,v])=>Object.keys(v.resolution??{}).some(k=>k!=='integrity'))||!partial&&missing.length)throw new TypeError('complete registry-only artifact closure required');
  if(!partial&&selectedMissing.length)throw new TypeError('exact selected artifact subset required');
  const coverage={sourceSelectionScope:'requested-artifact-references-only',sourceSelectionCompatible:selectedOutsideLock.length===0,selectedOutsideLock,complete:missing.length===0,expected:entries.length,received:archives.length,missing,selectedMissing,lowerBound:missing.length!==0,acceptedForNative:false};
  const capacityObservation=measured?await observeNativePackageResourceCapacity({...context,attemptDirectory:input.attemptDirectory},resourceRows):await contentCapacity(context,archives);
  if(measured)context.contentResources={rows:resourceRows,requirements:capacityObservation.requirements,observation:capacityObservation};
  // Receive compact representation before effects, not only after native work.
  clone(archives);await stable(held,self,context.canonicalFiles,context.environmentFiles);
  return {archives,selected,capacityObservation,coverage};
 }
 async function materializePrepared(ticket,input,options,offline){
  own(options,['signal'],[]);cancellation(options.signal);own(input,['attemptDirectory','content','selectedArtifacts']);const state=take(ticket);if(state.phase!=='refreshed')throw new TypeError('refresh predecessor required');
  const {archives,selected,capacityObservation}=await receiveContent(state.context,input);
  const cap=await pnpm.receiveNativePreparedInstallAdmission(state.cap,{offline}),run=await runFixed({held,self,pnpm,context:state.context,capability:cap,operation:offline?'offlineMaterialize':'materialize',attemptDirectory:input.attemptDirectory,signal:options.signal});
  try{
  const execution=await pnpm.receiveNativePreparedInstall(cap,observed(run.raw,run.interval,join(state.context.cwd,'pnpm-lock.yaml')));
  const comparisons=await receiveInstalledAfter(state.context,archives,selected,execution,run);
  const evidence={operation:run.evidence,execution,comparisons,capacityObservation,artifactInventory:archives.map(a=>a.observation)};await save(join(input.attemptDirectory,'received.json'),evidence);
  return Object.freeze({evidence,ticket:ticketFor({phase:'materialized',context:state.context,cap,archives,selected})});
  }catch(error){await retainReceivingFailure(input.attemptDirectory,error,run.evidence);throw error;}
 }
 async function receiveFrozen(input,options,offline,readOnly=false){
  own(options,['signal'],[]);cancellation(options.signal);
  own(input,['attemptDirectory','cwd','cacheRoot','registry','sourceHead','environment','environmentPolicy','canonicalFiles','content','selectedArtifacts','sourceDirectory','resourceProfile','registryProjectionPolicy','selectedArtifactInstances'],['attemptDirectory','cwd','cacheRoot','registry','sourceHead','environment','environmentPolicy','canonicalFiles','content','selectedArtifacts']);
  const context=clone(input);for(const key of ['attemptDirectory','content','selectedArtifacts'])delete context[key];
  context.sourceProfile='registry-consumer';context.receivingFiles=[];
  if(context.resourceProfile!==undefined&&context.resourceProfile!==observedHeadroomProfile)throw new TypeError('explicit supported native resource profile required');
  if(context.registryProjectionPolicy!==undefined&&context.registryProjectionPolicy!==projectionPolicy)throw new TypeError('unsupported registry projection policy');
  if(projected(context)){
   if(context.resourceProfile!==observedHeadroomProfile)throw new TypeError('registry projection requires observed headroom profile');
   if(!Array.isArray(context.selectedArtifactInstances)||context.selectedArtifactInstances.length!==input.selectedArtifacts.length)throw new TypeError('exact selected importer instances required');
   const seen=new Set();for(const selector of context.selectedArtifactInstances){
    own(selector,['artifact','specifier','importer','resolved','binDirectory','lockImporter','lockSnapshot'],['artifact','specifier','importer','resolved','binDirectory']);
    if(!input.selectedArtifacts.includes(selector.artifact)||seen.has(selector.artifact)||typeof selector.specifier!=='string'||(selector.lockImporter===undefined)===(selector.lockSnapshot===undefined))throw new TypeError('exact selected importer edge required');seen.add(selector.artifact);
    for(const key of ['importer','resolved','binDirectory'])if(typeof selector[key]!=='string'||!selector[key].startsWith('/')||!inside(context.cwd,selector[key]))throw new TypeError('selected importer path leaves source context');
   }
  }else if(context.selectedArtifactInstances!==undefined)throw new TypeError('selected importer instances require explicit registry projection policy');
  if(readOnly&&context.resourceProfile!==observedHeadroomProfile)throw new TypeError('read-only content qualification requires observed headroom profile');
  if(!/^[a-f0-9]{40}$/u.test(context.sourceHead)||!Array.isArray(context.canonicalFiles))throw new TypeError('exact committed consumer source frame required');
  const expected=['package.json','pnpm-lock.yaml'];
  for(const name of ['pnpm-workspace.yaml','.npmrc']){try{await lstat(join(context.cwd,name));expected.push(name);}catch(error){if(error.code!=='ENOENT')throw error;}}
  if(context.canonicalFiles.length!==expected.length||expected.some((name,i)=>context.canonicalFiles[i].path!==join(context.cwd,name)))throw new TypeError('canonical consumer source order or presence differs');
  await directory(context.cwd);await directory(context.cacheRoot,true);await absent(join(context.cwd,'node_modules'));
  context.environmentFiles=[];for(const key of ['NODE_EXTRA_CA_CERTS','SSL_CERT_FILE'])if(context.environment[key])context.environmentFiles.push(await identity(context.environment[key],1048576));
  await stable(held,self,context.canonicalFiles,context.environmentFiles);
  const lock=await parseLock(yaml,await bytes(join(context.cwd,'pnpm-lock.yaml'))),manifest=JSON.parse(await bytes(join(context.cwd,'package.json')));
  const preflight=delta.inspectNativeRegistryLockProfile({lock,manifest,profile:'unchanged-registry-consumer'});
  if(!preflight.accepted)throw Object.assign(new TypeError('committed registry-only lock preflight refused'),{nativeLockPreflight:preflight});
  const {archives,selected,capacityObservation,coverage}=await receiveContent(context,input,{partial:readOnly});
  if(readOnly){const evidence={kind:'npm.native-frozen-content-qualification.v1',resourceStageAccepted:true,nativeEligible:false,nativeInvoked:false,effectTicketIssued:false,preflight,coverage,capacityObservation,artifactInventory:archives.map(a=>a.observation),sourceHead:context.sourceHead};await save(join(input.attemptDirectory,'content-received.json'),evidence);return Object.freeze(evidence);}
  const original=packageManagerInstallCommand('pnpm',context.registry,'verify',{cacheRoot:context.cacheRoot});
  const admission={cwd:context.cwd,pnpm:held.nativeEntry,sourceProfile:context.sourceProfile,qualificationMode:offline?'offline-frozen':'online-frozen',cacheRoot:context.cacheRoot,originalInstallArguments:original.arguments,installArguments:(offline?pnpm.deriveNativeOfflineFrozenInstallArguments:pnpm.deriveNativeOnlineFrozenInstallArguments)(original.arguments),environmentProfile:'inherited-native-transport',environment:context.environment,environmentPolicy:context.environmentPolicy};
  // Original lifecycle-disabled precall contract observes source/config/provider
  // custody without claiming or snapshotting the separate evolving verifier log.
  const sourceAdmission=context.sourceDirectory===undefined?null:{cwd:context.sourceDirectory,pnpm:held.nativeEntry,sourceProfile:context.sourceProfile,originalInstallArguments:original.arguments,installArguments:pnpm.deriveNativeLifecycleDisabledInstallArguments(original.arguments),environmentProfile:'inherited-native-transport',environment:context.environment,environmentPolicy:context.environmentPolicy};
  const sourceCapability=sourceAdmission?await (projected(context)?pnpm.receiveNativeRegistryProjectionSourceCustody({...sourceAdmission,registryProjectionPolicy:projectionPolicy}):pnpm.receiveNativePrecallAdmission(sourceAdmission)):null;
  const sourceRequest=sourceAdmission?{cwd:sourceAdmission.cwd,program:held.nativeEntry,arguments:sourceAdmission.installArguments,environment:context.environment}:null;
  if(projected(context))admission.registryProjectionPolicy=projectionPolicy;
  const cap=await pnpm.receiveNativePrecallAdmission(admission),run=await runFixed({held,self,pnpm,context,capability:cap,operation:offline?'initialOffline':'initialOnline',attemptDirectory:input.attemptDirectory,signal:options.signal});
  try{
   const execution=await (offline?pnpm.receiveNativeOfflineInstall:pnpm.receiveNativeOnlineInstall)(cap,{stdout:run.raw.result.stdout,terminal:{invoked:true,code:run.raw.result.status,signal:run.raw.result.signal},observation:{...run.interval,complete:true},lockfilePath:join(context.cwd,'pnpm-lock.yaml')});
   if(sourceCapability)await (projected(context)?pnpm.assertNativeRegistryProjectionSourceCustody(sourceCapability):pnpm.assertNativePrecallAdmission(sourceCapability,sourceRequest));
   const projectionBinding=projected(context)?await pnpm.receiveNativeRegistryProjectionBinding(cap):null;
   const comparisons=await receiveInstalledAfter(context,archives,selected,execution,run,{pnpm,projectionBinding,yaml});
   const installedTree=await observeNativeInstallation(context.cwd);
   const evidence={operation:run.evidence,execution,...(projectionBinding?{registryProjection:clone(projectionBinding)}:{}),preflight,comparisons,installedTree,capacityObservation,artifactInventory:archives.map(a=>a.observation),sourceHead:context.sourceHead,lockRefreshed:false};
   await save(join(input.attemptDirectory,'received.json'),evidence);
   frozenReceivings.set(evidence,{cap,nextConsumed:false,verdict:clone(execution.verdict),installedTree,projectionBinding,sourceCapability,sourceRequest,context:clone(context),archives:clone(archives),selected:clone(selected),execution:clone(execution),run:clone(run),snapshot:clone(evidence),registrations:await registrations(comparisons,context.cwd)});
   return Object.freeze(evidence);
  }catch(error){await retainReceivingFailure(input.attemptDirectory,error,run.evidence);throw error;}
 }
 async function revalidateFrozenInstallation(evidence,input,allowConsumed=false){
  own(input,['installationRoot']);const state=frozenReceivings.get(evidence);
  if(!state||state.nextConsumed&&!allowConsumed||!isDeepStrictEqual(evidence,state.snapshot))throw new TypeError('original unchanged in-process frozen receiving required');
  await directory(input.installationRoot);
  if(state.projectionBinding)await pnpm.assertNativeRegistryProjectionBinding(state.projectionBinding);
  if(state.sourceCapability)await (projected(state.context)?pnpm.assertNativeRegistryProjectionSourceCustody(state.sourceCapability):pnpm.assertNativePrecallAdmission(state.sourceCapability,state.sourceRequest));
  await stable(held,self,state.context.canonicalFiles,state.context.environmentFiles);
  for(const f of [state.run.rawIdentity,state.run.evidence.intent,state.run.evidence.report])
   if(!isDeepStrictEqual(f,await identity(f.path,rawLimit)))throw new TypeError('original frozen operation evidence changed');
  const verdict=state.verdict;
  const verdictIdentity=await identity(verdict.path,rawLimit);
  if(verdict.exists!==true||verdictIdentity.bytes!==verdict.bytes||verdictIdentity.sha256!==verdict.sha256)throw new TypeError('original native verification history changed');
  const installedTree=await observeNativeInstallation(input.installationRoot);
  if(!isDeepStrictEqual(installedTree,state.installedTree))throw new TypeError('whole native installation changed during relocation');
  for(const archive of state.archives)if(!isDeepStrictEqual(archive.identity,await identity(archive.identity.path,67108864)))throw new TypeError('original independently received archive changed');
  // Original PNPM shim metadata names the true original installation. This
  // observation does not rewrite it or pretend its non-relocating receiver ran
  // anew. Complete byte/mode/link equality preserves the original comparison.
  return {kind:'npm.native-frozen-installation.reobserved',originalInstallationRoot:state.context.cwd,installationRoot:input.installationRoot,installedTree,
   originalArtifactComparisons:clone(state.snapshot.comparisons),originalBinRegistrations:clone(state.registrations),freshInstallationClaimed:false,freshArtifactComparisonClaimed:false};

 }
 return Object.freeze({
 revalidateFrozenInstallation:(evidence,input)=>revalidateFrozenInstallation(evidence,input),
 async verifyFrozenOffline(predecessor,input,options={}){
  own(options,['signal'],[]);cancellation(options.signal);own(input,['attemptDirectory']);
  const state=frozenReceivings.get(predecessor);
  if(!state||state.nextConsumed||!isDeepStrictEqual(predecessor,state.snapshot))throw new TypeError('original unused frozen receiving predecessor required');
  if(!projected(state.context))throw new TypeError('routine frozen verification requires explicit registry projection policy');
  // Consume before the first await: two concurrent callers cannot obtain runners.
  state.nextConsumed=true;
  await revalidateFrozenInstallation(predecessor,{installationRoot:state.context.cwd},true);
  const context=clone(state.context);
  await receiveAllocation(held,self,context,input.attemptDirectory,state.archives.map(a=>a.identity.path));
  const capacityObservation=await observeNativePackageResourceCapacity({...context,attemptDirectory:input.attemptDirectory},context.contentResources.rows);
  if(!isDeepStrictEqual(capacityObservation.requirements,context.contentResources.requirements))throw new TypeError('routine content resource requirement changed');
  context.contentResources.observation=capacityObservation;
  const cap=await pnpm.receiveNativePreparedInstallAdmission(state.cap,{offline:true});
  const run=await runFixed({held,self,pnpm,context,capability:cap,operation:'offline',attemptDirectory:input.attemptDirectory,signal:options.signal});
  try{
   const execution=await pnpm.receiveNativePreparedInstall(cap,observed(run.raw,run.interval,join(context.cwd,'pnpm-lock.yaml')));
   if(state.sourceCapability)await pnpm.assertNativeRegistryProjectionSourceCustody(state.sourceCapability);
   const projectionBinding=await pnpm.receiveNativeRegistryProjectionBinding(cap);
   const comparisons=await receiveInstalledAfter(context,state.archives,state.selected,execution,run,{pnpm,projectionBinding,yaml});
   const installedTree=await observeNativeInstallation(context.cwd);
   const evidence={kind:'npm.native-frozen-routine-verification.v1',operation:run.evidence,execution,registryProjection:clone(projectionBinding),comparisons,installedTree,capacityObservation,artifactInventory:state.archives.map(a=>a.observation),sourceHead:context.sourceHead,lockRefreshed:false,cleanInstallationClaimed:false,predecessor:{requestSHA256:state.run.evidence.requestSHA256,receipt:state.run.rawIdentity}};
   await save(join(input.attemptDirectory,'received.json'),evidence);
   frozenReceivings.set(evidence,{cap,nextConsumed:false,verdict:clone(state.verdict),installedTree,projectionBinding,sourceCapability:state.sourceCapability,sourceRequest:state.sourceRequest,context:clone(context),archives:clone(state.archives),selected:clone(state.selected),execution:clone(execution),run:clone(run),snapshot:clone(evidence),registrations:await registrations(comparisons,context.cwd)});
   return Object.freeze(evidence);
  }catch(error){await retainReceivingFailure(input.attemptDirectory,error,run.evidence);throw error;}
 },

 qualifyFrozenContent:(input,options={})=>receiveFrozen(input,options,true,true),
 receiveFrozenOffline:(input,options={})=>receiveFrozen(input,options,true),
 receiveFrozenOnline:(input,options={})=>receiveFrozen(input,options,false),
 async refresh(input,options={}){
  own(options,['signal'],[]);cancellation(options.signal);own(input,['attemptDirectory','cwd','cacheRoot','registry','sourceHead','sourceProfile','environment','environmentPolicy','canonicalFiles','previousManifest','change']);const context=clone(input);delete context.attemptDirectory;delete context.change;delete context.previousManifest;
  if(!/^[a-f0-9]{40}$/u.test(context.sourceHead)||!Array.isArray(context.canonicalFiles)||context.canonicalFiles.length!==4)throw new TypeError('exact original source frame required');
  for(const [i,name]of ['package.json','pnpm-lock.yaml','pnpm-workspace.yaml','.npmrc'].entries())if(context.canonicalFiles[i].path!==join(context.cwd,name))throw new TypeError('canonical source order differs');
  await directory(context.cwd);await directory(context.cacheRoot,true);await absent(join(context.cwd,'node_modules'));
  context.environmentFiles=[];for(const key of ['NODE_EXTRA_CA_CERTS','SSL_CERT_FILE'])if(context.environment[key])context.environmentFiles.push(await identity(context.environment[key],1048576));
  const previous=clone(input.previousManifest);own(previous,['path','bytes','sha256']);if(!isDeepStrictEqual(previous,await identity(previous.path)))throw new TypeError('previous source manifest changed');context.receivingFiles=[previous];
  await stable(held,self,[...context.canonicalFiles,...context.receivingFiles],context.environmentFiles);
  const beforeLock=await bytes(join(context.cwd,'pnpm-lock.yaml')),beforeManifest=JSON.parse(await bytes(previous.path)),afterManifest=JSON.parse(await bytes(join(context.cwd,'package.json')));
  const parsedBeforeLock=await parseLock(yaml,beforeLock),change=clone(input.change);
  const preflight=delta.inspectNativeRegistryLockProfile({lock:parsedBeforeLock,manifest:afterManifest,change});
  if(!preflight.accepted)throw Object.assign(new TypeError('registry-only lock preparation preflight refused'),{nativeLockPreflight:preflight});
  const original=packageManagerInstallCommand('pnpm',context.registry,'update-lock',{cacheRoot:context.cacheRoot});
  const admission={cwd:context.cwd,pnpm:held.nativeEntry,sourceProfile:context.sourceProfile,operation:'lockfile-refresh',qualificationMode:'offline-lockfile-refresh',cacheRoot:context.cacheRoot,originalInstallArguments:original.arguments,installArguments:pnpm.deriveNativeOfflineLockfileRefreshArguments(original.arguments),environmentProfile:'inherited-native-transport',environment:context.environment,environmentPolicy:context.environmentPolicy};
  const cap=await pnpm.receiveNativePrecallAdmission(admission),run=await runFixed({held,self,pnpm,context,capability:cap,operation:'refresh',attemptDirectory:input.attemptDirectory,signal:options.signal});
  try{
  await absent(join(context.cwd,'node_modules'));
  const execution=await pnpm.receiveNativeLockfileRefresh(cap,observed(run.raw,run.interval,join(context.cwd,'pnpm-lock.yaml')));
  const afterLock=await bytes(join(context.cwd,'pnpm-lock.yaml')),comparison=delta.compareNativeRootDependencyLockDelta({beforeLock:parsedBeforeLock,afterLock:await parseLock(yaml,afterLock),beforeManifest,afterManifest,change});
  if(comparison.accepted!==true)throw Object.assign(new TypeError('complete intended native lock delta unreceived'),{nativePackageEvidence:{execution,comparison,operation:run.evidence}});
  context.canonicalFiles[1]=await identity(join(context.cwd,'pnpm-lock.yaml'));
  const evidence={execution,preflight,comparison,diagnosticParser:{name:'yaml',version:'2.9.1',entrySHA256:sha(await bytes(held.yamlModule))},operation:run.evidence};await save(join(input.attemptDirectory,'received.json'),evidence);
  return Object.freeze({evidence,ticket:ticketFor({phase:'refreshed',context,cap})});
  }catch(error){await retainReceivingFailure(input.attemptDirectory,error,run.evidence);throw error;}
 },
 materialize:(ticket,input,options={})=>materializePrepared(ticket,input,options,false),
 materializeOffline:(ticket,input,options={})=>materializePrepared(ticket,input,options,true),
 async verifyOffline(ticket,input,options={}){
  own(options,['signal'],[]);cancellation(options.signal);own(input,['attemptDirectory']);const state=take(ticket);if(state.phase!=='materialized')throw new TypeError('received materialization predecessor required');
  const capacityObservation=await contentCapacity(state.context,state.archives);
  const cap=await pnpm.receiveNativePreparedInstallAdmission(state.cap,{offline:true}),run=await runFixed({held,self,pnpm,context:state.context,capability:cap,operation:'offline',attemptDirectory:input.attemptDirectory,signal:options.signal});
  try{
  const execution=await pnpm.receiveNativePreparedInstall(cap,observed(run.raw,run.interval,join(state.context.cwd,'pnpm-lock.yaml')));
  const comparisons=await receiveInstalledAfter(state.context,state.archives,state.selected,execution,run);
  const evidence={operation:run.evidence,execution,comparisons,capacityObservation,cleanInstallationClaimed:false};await save(join(input.attemptDirectory,'received.json'),evidence);return Object.freeze(evidence);
  }catch(error){await retainReceivingFailure(input.attemptDirectory,error,run.evidence);throw error;}
 }
 });
}

/** Fixed child repeats source and precall admission; parent's causal ticket is
 * intentionally neither passed nor reconstructed from operation JSON. */
export async function performNativePackagePreparation(inputPath,inputSHA256){
 const input=await bytes(inputPath);if(sha(input)!==inputSHA256)throw new TypeError('package operation intent changed');const p=JSON.parse(input);own(p,['held','self','context','operation','attempt','allocation','request','bounds']);
 if(!isDeepStrictEqual(p.bounds,operationBounds[p.operation])||!isDeepStrictEqual(p.request.environment,{...process.env})||p.request.command!==p.held.nativeEntry)throw new TypeError('fixed child command context differs');
 await stable(p.held,p.self,[...p.context.canonicalFiles,...p.context.receivingFiles],p.context.environmentFiles);if(!isDeepStrictEqual(p.attempt,await directory(p.attempt.path,true))||!isDeepStrictEqual(p.allocation,await directory(p.allocation.path,true)))throw new TypeError('package allocation changed');
 if(p.context.resourceProfile!==undefined&&(p.context.resourceProfile!==observedHeadroomProfile||!p.context.contentResources))throw new TypeError('fixed child resource profile incomplete');
 const pnpm=await import(pathToFileURL(p.held.pnpmPrecallModule)),executor=await import(pathToFileURL(p.held.executorModule));
 const original=packageManagerInstallCommand('pnpm',p.context.registry,p.operation==='refresh'?'update-lock':'verify',{cacheRoot:p.context.cacheRoot});
 const admission={cwd:p.context.cwd,pnpm:p.held.nativeEntry,sourceProfile:p.context.sourceProfile,originalInstallArguments:original.arguments,installArguments:p.request.arguments,environmentProfile:'inherited-native-transport',environment:p.context.environment,environmentPolicy:p.context.environmentPolicy,...(p.operation==='refresh'?{operation:'lockfile-refresh',qualificationMode:'offline-lockfile-refresh',cacheRoot:p.context.cacheRoot}:['initialOffline','initialOnline'].includes(p.operation)?{qualificationMode:p.operation==='initialOffline'?'offline-frozen':'online-frozen',cacheRoot:p.context.cacheRoot}:['offline','offlineMaterialize'].includes(p.operation)?{qualificationMode:'prepared-offline-frozen',cacheRoot:p.context.cacheRoot}:{qualificationMode:'prepared-online-frozen',cacheRoot:p.context.cacheRoot})};
 if(p.context.registryProjectionPolicy!==undefined){if(!['initialOffline','initialOnline','offline'].includes(p.operation)||p.context.registryProjectionPolicy!==projectionPolicy)throw new TypeError('registry projection supports only explicit initial or routine frozen operations');admission.registryProjectionPolicy=projectionPolicy;}
 const cap=await pnpm.receiveNativePrecallAdmission(admission),result={inputSHA256,operation:p.operation,request:p.request,accepted:false};
 try{for(const phase of ['materialize','offlineMaterialize'].includes(p.operation)?['versionBefore','native','versionAfter']:['native']){
  await stable(p.held,p.self,[...p.context.canonicalFiles,...p.context.receivingFiles],p.context.environmentFiles);
  if(p.context.contentResources){
   const fresh=await observeNativePackageResourceCapacity({...p.context,attemptDirectory:p.attempt.path},p.context.contentResources.rows);
   if(p.context.resourceProfile!==observedHeadroomProfile||!isDeepStrictEqual(fresh.requirements,p.context.contentResources.requirements)||!isDeepStrictEqual(fresh.filesystems.map(f=>f.directory),p.context.contentResources.observation.filesystems.map(f=>f.directory)))throw new TypeError('fixed child resource context changed');
   result.contentCapacityObservation=fresh;
  }
  const request={...p.request,arguments:phase==='native'?p.request.arguments:['--version']};await pnpm.assertNativePrecallAdmission(cap,{cwd:request.directory,program:request.command,arguments:request.arguments,environment:request.environment});
  const limits={timeoutMilliseconds:phase==='native'?p.bounds.native:10000,maximumOutputBytes:phase==='native'?4194304:65536};
  retainSourceWorkerPhaseRequest(join(p.attempt.path,'receipts'),phase,inputSHA256,request,limits);
  const startedAt=Date.now(),receipt=executor.executeJavascriptNodeCommand(request,limits),endedAt=Date.now();
  result[phase]={original:await saveRaw(join(p.attempt.path,'receipts',phase+'.json'),receipt),interval:{startedAt,endedAt}};
  if(!settled(receipt)||phase!=='native'&&receipt.result.stdout.trim()!=='11.28.5')throw new TypeError('original native terminal refused');
 }result.accepted=true;}catch(error){result.failure={name:error instanceof TypeError?'TypeError':'NativePackageFailure'};}
 const saved=await save(join(p.attempt.path,'result.json'),result);return {accepted:result.accepted,summary:{path:saved.path,sha256:saved.sha256}};
}
