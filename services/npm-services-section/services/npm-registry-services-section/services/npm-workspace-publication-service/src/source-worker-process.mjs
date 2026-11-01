import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createSourceWorkerEvidence } from './source-worker-evidence.mjs';

const aborted = Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted').get;
const listen = EventTarget.prototype.addEventListener;
const unlisten = EventTarget.prototype.removeEventListener;
const evidenceFailure = (stage,error) => ({stage,code:typeof error?.code==='string'?error.code:null});
const evidenceError = () => Object.assign(new Error('source worker evidence could not be retained'),{code:'WORKER_EVIDENCE_UNRECEIVED'});

// The existing npm source worker's process-group owner, shared privately by the
// original build and the separately selected metadata-only composition.
export const runSourceWorkerProcess = (program, args, options) => new Promise((accept, reject) => {
  // A durable evidence file does not make this live-parent executor durable.
  // No caller boolean or unverified provider label upgrades its custody contract.
  if (options.custodyMode !== undefined && options.custodyMode !== 'live-parent') {
    reject(Object.assign(new Error('restart-recoverable execution requires an admitted persistent provider'), {code:'WORKER_CUSTODY_MODE_UNSUPPORTED'})); return;
  }
  if (options.signal !== undefined && !(options.signal instanceof AbortSignal)) { reject(new TypeError('native cancellation signal required')); return; }
  const cancellationSignal = options.signal;
  if (cancellationSignal !== undefined && aborted.call(cancellationSignal)) { reject(Object.assign(new Error('source worker cancelled before launch'), {code:'ABORT_ERR'})); return; }
  let evidence;
  try { evidence=createSourceWorkerEvidence(program,args,options); }
  catch(error){
    const refused=evidenceError();refused.workerEvidence=error.workerEvidence??{directory:options.evidence?.directory??null};
    refused.evidenceFailures=[evidenceFailure('before-spawn',error)];
    refused.processObservation={pid:null,processGroup:null,invoked:false,quiescent:false,workerEvidence:refused.workerEvidence,evidenceFailures:refused.evidenceFailures};
    reject(refused);return;
  }
  const evidenceFailures=[],failedStreams=new Set();
  // This finalizer never throws out of the asynchronous close handler. Receipt
  // failure is secondary to original execution/settlement failure, never success.
  const finishEvidence=(observation,error)=>{
    if(!evidence)return error;
    try{
      const result=evidence.finish(observation,error,evidenceFailures);
      observation.workerEvidence=result.reference;
      if(result.failures.length){error??=evidenceError();error.evidenceFailures=result.failures;observation.evidenceFailures=result.failures;}
    }catch(caught){error??=evidenceError();error.evidenceFailures=[...evidenceFailures,evidenceFailure('finalize',caught)];observation.workerEvidence=evidence.reference();observation.evidenceFailures=error.evidenceFailures;}
    if(error){error.workerEvidence=observation.workerEvidence;error.processObservation=observation;}
    return error;
  };
  const startedAt = Date.now();
  let child;
  try { child = spawn(program, args, {cwd:options.cwd,env:options.env,detached:true,shell:false,stdio:['ignore','pipe','pipe']}); }
  catch(error){error=finishEvidence({pid:null,processGroup:null,startedAt,closedAt:Date.now(),invoked:false,quiescent:false},error);reject(error);return;}
  const chunks={stdout:[],stderr:[]}, totals={stdout:0,stderr:0};
  let size=0,failure,timedOut=false,truncated=false,cancelled=false,stopFailure;
  const stop=()=>{if(child.pid===undefined)return;try{process.kill(-child.pid,'SIGKILL');}catch(error){if(error.code!=='ESRCH')throw error;}};
  const requestStop=error=>{failure??=error;try{stop();}catch(error){stopFailure=error;failure??=error;}};
  const timer=setTimeout(()=>{timedOut=true;requestStop(Object.assign(new Error('source build worker timed out'),{code:'ETIMEDOUT',killed:true}));},options.timeout);
  const abort=()=>{cancelled=true;requestStop(Object.assign(new Error('source worker cancelled'),{code:'ABORT_ERR',killed:true}));};
  for(const stream of ['stdout','stderr'])child[stream].on('data',bytes=>{
    size+=bytes.length;totals[stream]+=bytes.length;
    if(size<=options.maxBuffer){
      chunks[stream].push(bytes);
      if(evidence&&!failedStreams.has(stream))try{evidence.append(stream,bytes);}catch(error){failedStreams.add(stream);evidenceFailures.push(evidenceFailure(stream,error));requestStop(evidenceError());}
    }else if(!truncated){truncated=true;requestStop(Object.assign(new Error('source build worker output exceeds its bound'),{code:'ERR_CHILD_PROCESS_STDIO_MAXBUFFER',killed:true}));}
  });
  child.on('error',error=>{failure=error;});
  child.on('close',async(code,signal)=>{
    clearTimeout(timer);
    if(cancellationSignal!==undefined)try{unlisten.call(cancellationSignal,'abort',abort);}catch(error){failure??=error;}
    const buffers=Object.fromEntries(['stdout','stderr'].map(key=>[key,Buffer.concat(chunks[key])]));
    const stdout=buffers.stdout.toString('utf8'),stderr=buffers.stderr.toString('utf8');
    const observation={pid:child.pid??null,processGroup:child.pid??null,startedAt,closedAt:Date.now(),
      status:Number.isInteger(code)?code:null,signal:typeof signal==='string'?signal:null,
      timedOut,truncated,cancelled,invoked:child.pid!==undefined,quiescent:false,
      capture:Object.fromEntries(['stdout','stderr'].map(key=>[key,{observedBytes:totals[key],retainedBytes:buffers[key].length,
        retainedSHA256:createHash('sha256').update(buffers[key]).digest('hex')}]))};
    try{
      if(child.pid!==undefined){
        stop();const deadline=Date.now()+2000;
        for(;;){try{process.kill(-child.pid,0);}catch(error){if(error.code==='ESRCH')break;throw error;}
          if(Date.now()>=deadline)throw new Error('source worker process group did not quiesce');
          await new Promise(accept=>setTimeout(accept,10));}
      }
      if(stopFailure)throw stopFailure;
      observation.quiescent=child.pid!==undefined;observation.settledAt=Date.now();
    }catch(error){
      error.code='BUILD_WORKER_CUSTODY_UNCERTAIN';error.workerProcessGroup=child.pid;
      Object.assign(error,{stdout,stderr,processObservation:observation});
      reject(finishEvidence(observation,error));return;
    }
    let error;
    if(failure||code!==0||signal!==null){
      error=failure??new Error('source build worker did not complete successfully');
      Object.assign(error,{code:failure?.code??code,signal,stdout,stderr});
      if(options.receiveProcess===true)error.processObservation=observation;
    }
    error=finishEvidence(observation,error);
    if(error){Object.assign(error,{stdout,stderr});reject(error);}
    else accept({stdout,stderr,...(options.receiveProcess===true?{processObservation:observation}:{})});
  });
  if(evidence)try{evidence.start(child.pid,startedAt);}catch(error){evidenceFailures.push(evidenceFailure('start',error));requestStop(evidenceError());}
  if(cancellationSignal!==undefined)try{listen.call(cancellationSignal,'abort',abort,{once:true});if(aborted.call(cancellationSignal))abort();}catch(error){requestStop(error);}
});

