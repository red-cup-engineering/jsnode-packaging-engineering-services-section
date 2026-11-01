// Private persistence only. The original source-worker-process exclusively owns
// execution, deadlines, signalling and settlement; saved PIDs confer no authority.
import {openSync,closeSync,writeSync,fsyncSync,readFileSync,readlinkSync,lstatSync,
  realpathSync,mkdirSync,linkSync,unlinkSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {dirname,isAbsolute,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const failure=error=>({name:error instanceof TypeError?'TypeError':'EvidenceFailure',code:typeof error?.code==='string'?error.code:null});
const absolute=path=>typeof path==='string'&&isAbsolute(path)&&resolve(path)===path&&!/[\0\r\n]/u.test(path);
function privateDirectory(path){
  if(!absolute(path))throw new TypeError('normalized evidence directory required');
  const s=lstatSync(path);
  if(!s.isDirectory()||s.uid!==process.getuid()||(s.mode&0o077)!==0||realpathSync(path)!==path)throw new TypeError('owned private real evidence directory required');
}
function fileIdentity(path,max=16777216){
  if(!absolute(path))throw new TypeError('normalized evidence file required');
  const before=lstatSync(path);
  if(!before.isFile()||before.size>max||realpathSync(path)!==path)throw new TypeError('bounded real evidence file required');
  const body=readFileSync(path),after=lstatSync(path);
  if(before.dev!==after.dev||before.ino!==after.ino||before.size!==after.size||before.mtimeMs!==after.mtimeMs||before.ctimeMs!==after.ctimeMs||body.length!==before.size)throw new TypeError('evidence input changed while reading');
  return {path,bytes:body.length,sha256:sha(body)};
}
function writeAll(fd,body){let at=0;while(at<body.length){const written=writeSync(fd,body,at,body.length-at);if(written<=0)throw new Error('evidence write made no progress');at+=written;}}
function syncDirectory(path){const fd=openSync(path,'r');try{fsyncSync(fd);}finally{closeSync(fd);}}
function save(path,value,max=65536){
  const body=Buffer.from(JSON.stringify(value)+'\n');
  const candidate={path,bytes:body.length,sha256:sha(body)};
  try{
  if(body.length>max)throw new TypeError('source worker evidence exceeds bound');
  const temporary=path+'.pending',fd=openSync(temporary,'wx',0o600);
  try{writeAll(fd,body);fsyncSync(fd);}finally{closeSync(fd);}
  // No overwrite and no final pathname exposing a partially written JSON file.
  linkSync(temporary,path);unlinkSync(temporary);syncDirectory(dirname(path));
  return candidate;
  }catch(error){error.evidenceCandidate=candidate;throw error;}
}
function processIdentity(pid){
  const identity={pid,observedAt:Date.now(),bootId:null,pidNamespace:null,startTicks:null,processGroup:null,session:null,available:false};
  try{
    if(process.platform!=='linux'||!Number.isInteger(pid)||pid<=0)throw new TypeError('Linux process identity unavailable');
    identity.bootId=readFileSync('/proc/sys/kernel/random/boot_id','utf8').trim();
    identity.pidNamespace=readlinkSync(`/proc/${pid}/ns/pid`);
    // comm is parenthesized and may itself contain parentheses or whitespace.
    const stat=readFileSync(`/proc/${pid}/stat`,'utf8'),end=stat.lastIndexOf(')'),fields=stat.slice(end+2).trim().split(/\s+/u);
    if(end<0||Number(stat.slice(0,stat.indexOf(' ')))!==pid||!/^\d+$/u.test(fields[19]??''))throw new TypeError('invalid process identity');
    identity.startTicks=fields[19];identity.processGroup=Number(fields[2]);identity.session=Number(fields[3]);
    if(!Number.isSafeInteger(identity.processGroup)||!Number.isSafeInteger(identity.session))throw new TypeError('invalid process group identity');
    identity.available=true;
  }catch(error){identity.failure=failure(error);}
  return identity;
}
function requestData(program,args,cwd,environment){
  if(typeof program!=='string'||!Array.isArray(args)||args.some(x=>typeof x!=='string')||!absolute(cwd)||!environment||typeof environment!=='object')throw new TypeError('explicit original request required');
  const entries=Object.entries(environment).sort(([a],[b])=>a<b?-1:a>b?1:0);
  if(entries.some(([key,value])=>typeof key!=='string'||typeof value!=='string'))throw new TypeError('explicit string environment required');
  return {program,arguments:args.slice(),cwd,environmentSHA256:sha(JSON.stringify(entries))};
}

export function createSourceWorkerEvidence(program,args,options){
  if(options.evidence===undefined)return null;
  const refs={directory:options.evidence.directory,request:null,start:null,terminal:null};
  try{return prepareSourceWorkerEvidence(program,args,options,refs);}
  catch(error){error.workerEvidence={...refs,...(error.evidenceCandidate?{unreceivedCandidate:error.evidenceCandidate}:{})};throw error;}
}
function prepareSourceWorkerEvidence(program,args,options,refs){
  const input=options.evidence.input,directory=options.evidence.directory;
  if(!absolute(directory)||!Number.isSafeInteger(options.timeout)||options.timeout<1||options.timeout>300000||!Number.isSafeInteger(options.maxBuffer)||options.maxBuffer<1||options.maxBuffer>16777216)throw new TypeError('bounded source worker evidence required');
  privateDirectory(dirname(directory));
  if(!input||!Number.isSafeInteger(input.bytes)||input.bytes<0||!/^[a-f0-9]{64}$/u.test(input.sha256??''))throw new TypeError('original input identity required');
  const received=fileIdentity(input.path);
  if(received.bytes!==input.bytes||received.sha256!==input.sha256)throw new TypeError('original evidence input differs');
  const request={kind:'npm.source-worker.request.v1',id:randomUUID(),preparedAt:Date.now(),input:received,
    ...requestData(program,args,options.cwd,options.env),timeout:options.timeout,maxBuffer:options.maxBuffer,
    owner:processIdentity(process.pid),source:['source-worker-process.mjs','source-worker-evidence.mjs'].map(name=>fileIdentity(fileURLToPath(new URL(name,import.meta.url)))),
    signalAuthority:'original-live-owner-only',namespaceIsolation:false};
  mkdirSync(directory,{mode:0o700});syncDirectory(dirname(directory));
  const fds={};
  try{
    for(const stream of ['stdout','stderr'])fds[stream]=openSync(join(directory,stream+'.bin'),'wx',0o600);
    refs.request=save(join(directory,'request.json'),request);
  }catch(error){for(const fd of Object.values(fds))try{closeSync(fd);}catch{}throw error;}
  let finished=false;
  return Object.freeze({
    reference:()=>({...refs}),
    start(pid,startedAt){try{refs.start=save(join(directory,'start.json'),{kind:'npm.source-worker.start.v1',request:refs.request,startedAt,invoked:pid!==undefined,pid:pid??null,processGroup:pid??null,identity:processIdentity(pid??null),namespaceIsolation:false,signalAuthority:'original-live-owner-only'});}catch(error){refs.unreceivedStart=error.evidenceCandidate??null;throw error;}},
    append(stream,bytes){writeAll(fds[stream],bytes);},
    finish(observation,error,earlierFailures){
      if(finished)throw new Error('source worker evidence already finalized');finished=true;
      const failures=earlierFailures.slice(),raw={};
      for(const stream of ['stdout','stderr']){
        try{fsyncSync(fds[stream]);}catch(error){failures.push({stage:stream+'-sync',...failure(error)});}
        finally{try{closeSync(fds[stream]);}catch(error){failures.push({stage:stream+'-close',...failure(error)});}}
        try{
          raw[stream]=fileIdentity(join(directory,stream+'.bin'),options.maxBuffer);
          const capture=observation.capture?.[stream];
          if(capture&&(raw[stream].bytes!==capture.retainedBytes||raw[stream].sha256!==capture.retainedSHA256))throw new TypeError('retained stream differs from original capture');
        }catch(error){failures.push({stage:stream+'-receive',...failure(error)});}
      }
      try{refs.terminal=save(join(directory,'terminal.json'),{kind:'npm.source-worker.terminal.v1',request:refs.request,start:refs.start,processObservation:observation,
        originalFailure:typeof error?.code==='string'||Number.isInteger(error?.code)?error.code:error?'WORKER_FAILURE':null,evidenceFailures:failures,raw,semanticReceiving:false});}
      catch(error){refs.unreceivedTerminal=error.evidenceCandidate??null;failures.push({stage:'terminal',...failure(error)});}
      return {reference:{...refs},failures};
    }
  });
}

// Fixed child-side phase intent, before the existing synchronous executor call.
// Neither this intent nor its observed worker identity proves native invocation.
export function retainSourceWorkerPhaseRequest(directory,phase,inputSHA256,request,limits){
  privateDirectory(directory);
  if(!['producer','reader','versionBefore','native','versionAfter'].includes(phase)||!/^[a-f0-9]{64}$/u.test(inputSHA256))throw new TypeError('fixed phase identity required');
  const value={kind:'npm.source-worker.phase-request.v1',phase,inputSHA256,preparedAt:Date.now(),
    ...requestData(request.command,request.arguments,request.directory,request.environment),limits,
    worker:processIdentity(process.pid),nativeProcessIdentity:null,invocation:'not-yet-observed'};
  return save(join(directory,phase+'-request.json'),value);
}

// Pure fixed-composer error transport. An outer receipt-write failure must not
// erase original execution uncertainty or turn an otherwise received run green.
export function sourceWorkerOutcomeFailure(kind,evidence,originalError,receivingError){
  const field={metadata:'nativeMetadataEvidence',package:'nativePackageEvidence'}[kind];
  if(!field)throw new TypeError('fixed source worker outcome kind required');
  const error=originalError??receivingError;
  error[field]=Object.freeze({...evidence,accepted:false,
    state:evidence.processObservation?.quiescent===true?'refused':'unknown',
    receivingEvidenceLost:true,receivingEvidenceFailure:failure(receivingError)});
  return error;
}

// Read only the original attempt. References are compared before parsing; paths
// in retained JSON never select another file. No PID lookup, signal or replay.
export function receiveSourceWorkerEvidence({directory,request:expectedRequest}){
  privateDirectory(directory);
  const same=(a,b)=>a?.path===b?.path&&a?.bytes===b?.bytes&&a?.sha256===b?.sha256;
  const validRef=r=>r&&absolute(r.path)&&Number.isSafeInteger(r.bytes)&&r.bytes>=0&&/^[a-f0-9]{64}$/u.test(r.sha256??'');
  const read=(name,optional=false)=>{
    const path=join(directory,name);
    try{
      const reference=fileIdentity(path,65536),body=readFileSync(path);
      if(body.length!==reference.bytes||sha(body)!==reference.sha256)throw new TypeError('worker receipt changed while receiving');
      return {reference,value:JSON.parse(body.toString('utf8'))};
    }catch(error){if(optional&&error.code==='ENOENT')return null;throw error;}
  };
  if(!validRef(expectedRequest)||expectedRequest.path!==join(directory,'request.json'))throw new TypeError('exact original request reference required');
  const request=read('request.json');
  if(!same(expectedRequest,request.reference)||request.value.kind!=='npm.source-worker.request.v1'||typeof request.value.id!=='string'||!validRef(request.value.input)||!Number.isSafeInteger(request.value.maxBuffer)||request.value.maxBuffer<1||request.value.maxBuffer>16777216)throw new TypeError('original worker request differs');
  const start=read('start.json',true),terminal=read('terminal.json',true);
  if(start&&(start.value.kind!=='npm.source-worker.start.v1'||!same(start.value.request,request.reference)||typeof start.value.invoked!=='boolean'))throw new TypeError('worker start does not bind original request');
  const references={request:request.reference,start:start?.reference??null,terminal:terminal?.reference??null};
  const result={kind:'npm.source-worker.recovery.v1',references,invocation:{input:request.value.input,program:request.value.program,arguments:request.value.arguments,cwd:request.value.cwd,timeout:request.value.timeout,maxBuffer:request.value.maxBuffer,source:request.value.source},executionCustody:'live-parent',semanticReceiving:false,replayPermitted:false,signalAuthority:'none'};
  if(!terminal)return Object.freeze({...result,state:'unknown',reason:start?'terminal-unreceived':'launch-unobserved'});
  const t=terminal.value,o=t.processObservation;
  if(t.kind!=='npm.source-worker.terminal.v1'||!same(t.request,request.reference)||(start?!same(t.start,start.reference):t.start!==null)||t.semanticReceiving!==false||!o||typeof o.invoked!=='boolean'||typeof o.quiescent!=='boolean'||!Array.isArray(t.evidenceFailures))throw new TypeError('worker terminal does not bind original attempt');
  if(start&&(o.invoked!==start.value.invoked||o.pid!==start.value.pid||o.processGroup!==start.value.processGroup||o.startedAt!==start.value.startedAt))throw new TypeError('worker terminal launch identity differs');
  if(o.invoked&&!start)throw new TypeError('invoked worker lacks original start');
  if(o.invoked&&(!Number.isSafeInteger(o.pid)||o.pid<=0||!Number.isSafeInteger(o.processGroup)||o.processGroup<=0||!Number.isFinite(o.startedAt)||!Number.isFinite(o.closedAt)||['timedOut','truncated','cancelled'].some(key=>typeof o[key]!=='boolean')))throw new TypeError('invalid original worker observation');
  if(o.quiescent&&!Number.isFinite(o.settledAt))throw new TypeError('invalid worker settlement time');
  let total=0;
  for(const stream of ['stdout','stderr']){
    const reference=fileIdentity(join(directory,stream+'.bin'),request.value.maxBuffer),recorded=t.raw?.[stream];
    if(!validRef(recorded)||!same(reference,recorded))throw new TypeError('retained worker stream differs');
    total+=reference.bytes;
    const capture=o.capture?.[stream];
    if(o.invoked&&(!capture||capture.retainedBytes!==reference.bytes||capture.retainedSHA256!==reference.sha256||!Number.isSafeInteger(capture.observedBytes)||capture.observedBytes<reference.bytes))throw new TypeError('worker capture differs from retained bytes');
  }
  if(total>request.value.maxBuffer)throw new TypeError('combined worker evidence exceeds bound');
  // Read all final immutable references again; partial or changed reads refuse.
  for(const reference of Object.values(references).filter(Boolean))if(!same(reference,fileIdentity(reference.path,65536)))throw new TypeError('worker receipt changed during receiving');
  if(!o.quiescent)return Object.freeze({...result,state:'unknown',reason:'settlement-unreceived'});
  if(!o.invoked||!Number.isInteger(o.status)&&o.status!==null||o.signal!==null&&typeof o.signal!=='string')throw new TypeError('invalid worker settlement');
  const failed=t.originalFailure!==null||t.evidenceFailures.length>0||o.status!==0||o.signal!==null||o.timedOut===true||o.truncated===true||o.cancelled===true;
  return Object.freeze({...result,state:failed?'settled-refused':'settled-success',reason:failed?'original-execution-or-evidence-refusal':null,processObservation:o});
}


// Internal fixed build-input ports reuse the original bounded persistence owner.
export const sourceWorkerFileReference = path => fileIdentity(path);
export function retainSourceBuildWorkerInput(home,value){privateDirectory(home);if(value?.kind!=='npm.source-build-worker.input.v1')throw new TypeError('fixed source build input required');return save(join(home,'input.json'),value);}
export function receiveSourceBuildWorkerInput(home,expected){privateDirectory(home);const path=join(home,'input.json'),reference=fileIdentity(path,65536);if(expected?.path!==path||expected.bytes!==reference.bytes||expected.sha256!==reference.sha256)throw new TypeError('original fixed build input differs');const body=readFileSync(path);if(body.length!==reference.bytes||sha(body)!==reference.sha256)throw new TypeError('fixed build input changed');return {reference,value:JSON.parse(body)};}

export function prepareSourceBuildWorkerHome(scratch){
  if(!absolute(scratch))throw new TypeError('normalized build scratch required');
  try { privateDirectory(scratch); }
  catch(error){if(error.code!=='ENOENT')throw error;privateDirectory(dirname(scratch));mkdirSync(scratch,{mode:0o700});syncDirectory(dirname(scratch));privateDirectory(scratch);}
  const home=join(scratch,'build-home');mkdirSync(home,{mode:0o700});syncDirectory(scratch);privateDirectory(home);
  return home;
}

export function validateSourceBuildRegistry(registry){
  let value;
  try { if(typeof registry!=='string')throw new TypeError();value=new URL(registry); }
  catch { throw new TypeError('source build registry must be an uncredentialed HTTP URL without query or fragment'); }
  if(!['http:','https:'].includes(value.protocol)||value.username||value.password||value.search||value.hash)
    throw new TypeError('source build registry must be an uncredentialed HTTP URL without query or fragment');
  return registry;
}

// Fixed build handoff extends this existing persistence owner only. No executor,
// queue, signal, PID adoption, replacement or directory discovery is exposed.
export function sourceBuildOccurrenceDirectory(root,id){
 privateDirectory(root);
 if(typeof id!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(id))throw new TypeError('bounded build occurrence id required');
 return join(root,sha(id));
}
export function retainSourceBuildOccurrence(root,id,value){
 const directory=sourceBuildOccurrenceDirectory(root,id);
 if(value?.kind!=='npm.fixed-build.admission.v1'||value.id!==id||Buffer.byteLength(JSON.stringify(value)+'\n')>16777216)throw new TypeError('bounded fixed build admission required');
 mkdirSync(directory,{mode:0o700});syncDirectory(root);privateDirectory(directory);
 return save(join(directory,'admission.json'),value,16777216);
}
const buildRecordNames=new Set(['admission.json','execution.json','result.json']);
export function retainSourceBuildOccurrenceRecord(root,id,name,value){
 if(!buildRecordNames.has(name)||name==='admission.json')throw new TypeError('fixed build result name required');
 const directory=sourceBuildOccurrenceDirectory(root,id);privateDirectory(directory);
 try{lstatSync(join(directory,name));throw Object.assign(new Error('original fixed build record already exists'),{code:'EEXIST'});}catch(error){if(error.code!=='ENOENT')throw error;}
 return save(join(directory,name),value,16777216);
}
export function receiveSourceBuildOccurrenceRecord(root,id,name,expected){
 if(!buildRecordNames.has(name))throw new TypeError('fixed build record name required');
 const directory=sourceBuildOccurrenceDirectory(root,id);privateDirectory(directory);
 const path=join(directory,name),reference=fileIdentity(path);
 if(expected&&(expected.path!==path||expected.bytes!==reference.bytes||expected.sha256!==reference.sha256))throw new TypeError('original build record differs');
 const raw=readFileSync(path);if(raw.length!==reference.bytes||sha(raw)!==reference.sha256)throw new TypeError('build record changed while receiving');
 return {reference,value:JSON.parse(raw)};
}
export function receiveSourceBuildWorkerReport(home,request){
 const directory=join(home,'worker-evidence'),received=receiveSourceWorkerEvidence({directory,request});
 if(received.state!=='settled-success')throw new TypeError('original fixed build worker not successfully settled');
 const path=join(directory,'stdout.bin'),reference=fileIdentity(path),raw=readFileSync(path);
 if(raw.length!==reference.bytes||sha(raw)!==reference.sha256)throw new TypeError('original build report changed');
 const again=receiveSourceWorkerEvidence({directory,request});
 if(again.references.terminal?.sha256!==received.references.terminal?.sha256)throw new TypeError('original build terminal changed');
 return {reference,value:JSON.parse(raw),terminal:received.references.terminal};
}
