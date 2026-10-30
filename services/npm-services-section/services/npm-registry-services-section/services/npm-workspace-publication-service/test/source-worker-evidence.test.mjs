import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {mkdtemp,writeFile,readFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {syncBuiltinESMExports} from 'node:module';
import {runSourceWorkerProcess as run} from '../src/source-worker-process.mjs';
import {retainSourceWorkerPhaseRequest,sourceWorkerOutcomeFailure} from '../src/source-worker-evidence.mjs';
const execute=promisify(execFile),sha=x=>createHash('sha256').update(x).digest('hex');
const read=path=>JSON.parse(fs.readFileSync(path,'utf8'));
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function fixture(){
 const root=await mkdtemp(join(tmpdir(),'npm-worker-evidence-')),body=Buffer.from('{"fixed":"test"}\n'),path=join(root,'input.json');
 await writeFile(path,body,{mode:0o600});
 return {root,options:{cwd:root,env:{PATH:process.env.PATH,HOME:root,PRIVATE_TEST_VALUE:'not-written-to-evidence'},timeout:3000,maxBuffer:65536,receiveProcess:true,evidence:{directory:join(root,'worker-evidence'),input:{path,bytes:body.length,sha256:sha(body)}}}};
}
const launch=(f,source,extra={})=>run(process.execPath,['-e',source],{...f.options,...extra});
const targetFDs=root=>fs.readdirSync('/proc/self/fd').flatMap(fd=>{try{return fs.readlinkSync('/proc/self/fd/'+fd).startsWith(root)?[fd]:[];}catch{return [];}});
async function patched(name,implementation,operation){const original=fs[name];fs[name]=implementation(original);syncBuiltinESMExports();try{return await operation();}finally{fs[name]=original;syncBuiltinESMExports();}}
const eio=()=>Object.assign(new Error('synthetic evidence I/O refusal'),{code:'EIO'});
async function rejected(promise){try{await promise;assert.fail('expected refusal');}catch(error){assert.notEqual(error.code,'ERR_ASSERTION');return error;}}

test('SWE1–5 original request/start precede terminal; actual identities and raw bytes are retained',async()=>{
 const f=await fixture(),work=launch(f,"process.stdout.write('out\\u0000');process.stderr.write('err');setTimeout(()=>{},180)");
 const dir=f.options.evidence.directory,request=read(join(dir,'request.json')),start=read(join(dir,'start.json'));
 assert.equal(fs.existsSync(join(dir,'terminal.json')),false);assert.equal(request.input.sha256,f.options.evidence.input.sha256);
 assert.equal(JSON.stringify(request).includes('not-written-to-evidence'),false);assert.equal(request.environment,undefined);
 assert.equal(start.invoked,true);assert.equal(start.namespaceIsolation,false);assert.equal(start.identity.available,true);
 const stat=fs.readFileSync(`/proc/${start.pid}/stat`,'utf8');assert.equal(start.identity.startTicks,stat.slice(stat.lastIndexOf(')')+2).trim().split(/\s+/u)[19]);
 assert.equal(start.identity.pidNamespace,fs.readlinkSync(`/proc/${start.pid}/ns/pid`));assert.equal(start.processGroup,start.pid);
 const result=await work,terminal=read(join(dir,'terminal.json'));
 assert.equal(result.stdout,'out\u0000');assert.equal(result.stderr,'err');assert.equal(terminal.processObservation.quiescent,true);assert.equal(terminal.semanticReceiving,false);
 for(const stream of ['stdout','stderr']){const bytes=fs.readFileSync(join(dir,stream+'.bin'));assert.equal(terminal.raw[stream].sha256,sha(bytes));assert.equal(terminal.raw[stream].bytes,bytes.length);assert.equal(terminal.processObservation.capture[stream].retainedSHA256,sha(bytes));}
 assert.equal(result.processObservation.workerEvidence.terminal.sha256,sha(fs.readFileSync(join(dir,'terminal.json'))));
 assert.deepEqual(targetFDs(f.root),[]);
});

test('SWE5 discarded caller observation does not prevent original owner terminal persistence',async()=>{
 const f=await fixture(),script=join(f.root,'owner.mjs');
 await writeFile(script,`import {runSourceWorkerProcess as run} from ${JSON.stringify(new URL('../src/source-worker-process.mjs',import.meta.url).href)}; void run(process.execPath,['-e',"process.stdout.write('received without a promise handle')"],${JSON.stringify(f.options)});`);
 await execute(process.execPath,[script],{timeout:3000});
 const terminal=read(join(f.options.evidence.directory,'terminal.json'));
 assert.equal(terminal.processObservation.status,0);assert.equal(terminal.processObservation.quiescent,true);assert.equal(fs.readFileSync(join(f.options.evidence.directory,'stdout.bin'),'utf8'),'received without a promise handle');
});

test('SWE3–5 controlled owner exit leaves original launch/prefix UNKNOWN without terminal',async()=>{
 const f=await fixture(),script=join(f.root,'owner.mjs'),dir=f.options.evidence.directory;
 await writeFile(script,`import fs from 'node:fs';import {runSourceWorkerProcess as run} from ${JSON.stringify(new URL('../src/source-worker-process.mjs',import.meta.url).href)};void run(process.execPath,['-e',"process.stdout.write('prefix');setTimeout(()=>{},250)"],${JSON.stringify(f.options)});const until=Date.now()+1000;const timer=setInterval(()=>{if(fs.statSync(${JSON.stringify(join(dir,'stdout.bin'))}).size>0){clearInterval(timer);process.exit(0)}if(Date.now()>until)process.exit(2)},5);`);
 await execute(process.execPath,[script],{timeout:2000});
 assert.equal(read(join(dir,'start.json')).invoked,true);assert.equal(fs.readFileSync(join(dir,'stdout.bin'),'utf8'),'prefix');
 await pause(400);assert.equal(fs.existsSync(join(dir,'terminal.json')),false);
 // No saved numeric identity is used for signalling, retry or a settlement claim.
});

test('SWE2 existing evidence, changed input and invalid bounds refuse before child effects',async()=>{
 for(const variant of ['existing','input','bounds']){
  const f=await fixture(),marker=join(f.root,'invoked');
  if(variant==='existing'){await mkdir(f.options.evidence.directory,{mode:0o700});await writeFile(join(f.options.evidence.directory,'keep'),'original');}
  if(variant==='input')await writeFile(f.options.evidence.input.path,'changed');
  if(variant==='bounds')f.options.maxBuffer=0;
  const error=await rejected(launch(f,`require('node:fs').writeFileSync(${JSON.stringify(marker)},'bad')`));
  assert.equal(error.code,'WORKER_EVIDENCE_UNRECEIVED');assert.equal(error.processObservation.invoked,false);assert.equal(fs.existsSync(marker),false);assert.deepEqual(targetFDs(f.root),[]);
  if(variant==='existing')assert.equal(await readFile(join(f.options.evidence.directory,'keep'),'utf8'),'original');
 }
});

test('SWE2 pre-spawn persistence failure closes files and retains attempted request identity',async()=>{
 const f=await fixture(),marker=join(f.root,'invoked');
 await patched('linkSync',original=>(from,to)=>{if(to.endsWith('/request.json'))throw eio();return original(from,to);},async()=>{
  const error=await rejected(launch(f,`require('node:fs').writeFileSync(${JSON.stringify(marker)},'bad')`));
  assert.equal(error.code,'WORKER_EVIDENCE_UNRECEIVED');assert.equal(error.processObservation.invoked,false);assert.equal(error.workerEvidence.unreceivedCandidate.path,join(f.options.evidence.directory,'request.json'));assert.equal(fs.existsSync(marker),false);assert.deepEqual(targetFDs(f.root),[]);
 });
});

test('SWE6 start persistence failure settles through the original owner and preserves references',async()=>{
 const f=await fixture();
 await patched('linkSync',original=>(from,to)=>{if(to.endsWith('/start.json'))throw eio();return original(from,to);},async()=>{
  const error=await rejected(launch(f,'setTimeout(()=>{},500)'));
  assert.equal(error.code,'WORKER_EVIDENCE_UNRECEIVED');assert.equal(error.processObservation.quiescent,true);assert.ok(error.workerEvidence.request);assert.equal(error.workerEvidence.start,null);assert.ok(error.workerEvidence.unreceivedStart.sha256);assert.ok(error.workerEvidence.terminal);assert.ok(error.evidenceFailures.some(x=>x.stage==='start'));assert.deepEqual(targetFDs(f.root),[]);
 });
});

test('SWE4/6 stream persistence failure is bounded refusal with original in-memory capture',async()=>{
 const f=await fixture();
 await patched('writeSync',original=>(fd,...args)=>{if(fs.readlinkSync('/proc/self/fd/'+fd)===join(f.options.evidence.directory,'stdout.bin'))throw eio();return original(fd,...args);},async()=>{
  const error=await rejected(launch(f,"process.stdout.write('original-prefix');setTimeout(()=>{},500)"));
  assert.equal(error.code,'WORKER_EVIDENCE_UNRECEIVED');assert.equal(error.stdout,'original-prefix');assert.equal(error.processObservation.quiescent,true);assert.ok(error.evidenceFailures.some(x=>x.stage==='stdout'));assert.deepEqual(targetFDs(f.root),[]);
 });
});

test('SWE4 raw-file readback must equal the original retained capture',async()=>{
 const f=await fixture();
 await patched('writeSync',original=>(fd,bytes,offset,length,...rest)=>{if(fs.readlinkSync('/proc/self/fd/'+fd)===join(f.options.evidence.directory,'stdout.bin'))return length;return original(fd,bytes,offset,length,...rest);},async()=>{
  const error=await rejected(launch(f,"process.stdout.write('unaltered original capture')"));
  assert.equal(error.code,'WORKER_EVIDENCE_UNRECEIVED');assert.equal(error.stdout,'unaltered original capture');assert.equal(error.processObservation.quiescent,true);assert.ok(error.evidenceFailures.some(x=>x.stage==='stdout-receive'));assert.deepEqual(targetFDs(f.root),[]);
 });
});

test('SWE6 terminal failure refuses success and preserves original nonzero failure',async()=>{
 for(const status of [0,7]){
  const f=await fixture();
  await patched('linkSync',original=>(from,to)=>{if(to.endsWith('/terminal.json'))throw eio();return original(from,to);},async()=>{
   const error=await rejected(launch(f,`process.stdout.write('terminal-prefix');process.exitCode=${status}`));
   assert.equal(error.code,status===0?'WORKER_EVIDENCE_UNRECEIVED':status);assert.equal(error.stdout,'terminal-prefix');assert.equal(error.processObservation.quiescent,true);assert.ok(error.workerEvidence.request);assert.ok(error.workerEvidence.start);assert.equal(error.workerEvidence.terminal,null);assert.ok(error.workerEvidence.unreceivedTerminal.sha256);assert.ok(error.evidenceFailures.some(x=>x.stage==='terminal'));assert.deepEqual(error.processObservation.evidenceFailures,error.evidenceFailures);assert.deepEqual(targetFDs(f.root),[]);
  });
 }
});

test('SWE6 original custody uncertainty wins over every final evidence write failure',async()=>{
 const f=await fixture(),originalKill=process.kill;
 process.kill=(pid,signal)=>{if(signal==='SIGKILL')throw Object.assign(new Error('synthetic settlement refusal after already-exited child'),{code:'EPERM'});return originalKill(pid,signal);};
 try{await patched('linkSync',original=>(from,to)=>{if(to.endsWith('/terminal.json'))throw eio();return original(from,to);},async()=>{
  const error=await rejected(launch(f,"process.stdout.write('uncertain-original');process.stderr.write('stderr-original')"));
  assert.equal(error.code,'BUILD_WORKER_CUSTODY_UNCERTAIN');assert.equal(error.workerProcessGroup,error.processObservation.processGroup);assert.equal(error.processObservation.quiescent,false);assert.equal(error.stdout,'uncertain-original');assert.equal(error.stderr,'stderr-original');assert.ok(error.workerEvidence.request);assert.ok(error.workerEvidence.start);assert.equal(error.workerEvidence.terminal,null);assert.deepEqual(targetFDs(f.root),[]);
 });}finally{process.kill=originalKill;}
});

test('SWE5 failed spawn records non-invocation without fabricated quiescence',async()=>{
 const f=await fixture(),error=await rejected(run(join(f.root,'missing'),[],f.options));
 assert.equal(error.code,'ENOENT');const terminal=read(join(f.options.evidence.directory,'terminal.json'));
 assert.equal(terminal.processObservation.invoked,false);assert.equal(terminal.processObservation.processGroup,null);assert.equal(terminal.processObservation.quiescent,false);assert.equal(terminal.originalFailure,'ENOENT');assert.deepEqual(targetFDs(f.root),[]);
});

test('SWE4 existing combined output bound, timeout and cancellation remain effective',async()=>{
 for(const mode of ['overflow','timeout','cancel']){
  const f=await fixture(),controller=new AbortController();
  const extra=mode==='overflow'?{maxBuffer:64}:mode==='timeout'?{timeout:100}:{signal:controller.signal};
  if(mode==='cancel')setTimeout(()=>controller.abort(),100);
  const error=await rejected(launch(f,mode==='overflow'?"process.stdout.write('prefix');setTimeout(()=>process.stderr.write('x'.repeat(500000)),30);setTimeout(()=>{},1000)":'setTimeout(()=>{},1000)',extra));
  assert.equal(error.code,{overflow:'ERR_CHILD_PROCESS_STDIO_MAXBUFFER',timeout:'ETIMEDOUT',cancel:'ABORT_ERR'}[mode]);assert.equal(error.processObservation.quiescent,true);
  const terminal=read(join(f.options.evidence.directory,'terminal.json'));assert.ok(terminal.raw.stdout.bytes+terminal.raw.stderr.bytes<=(extra.maxBuffer??f.options.maxBuffer));assert.deepEqual(targetFDs(f.root),[]);
 }
});

test('SWE7 phase intent is exclusive, precedes invocation, and excludes environment values',async()=>{
 const f=await fixture(),receipts=join(f.root,'receipts');await mkdir(receipts,{mode:0o700});
 const request={command:process.execPath,arguments:['--version'],directory:f.root,environment:f.options.env},limits={timeoutMilliseconds:10000,maximumOutputBytes:65536};
 const ref=retainSourceWorkerPhaseRequest(receipts,'native',f.options.evidence.input.sha256,request,limits),record=read(ref.path);
 assert.equal(record.invocation,'not-yet-observed');assert.equal(record.nativeProcessIdentity,null);assert.equal(record.inputSHA256,f.options.evidence.input.sha256);assert.equal(JSON.stringify(record).includes('not-written-to-evidence'),false);assert.equal(record.environment,undefined);
 assert.throws(()=>retainSourceWorkerPhaseRequest(receipts,'native',f.options.evidence.input.sha256,request,limits));assert.equal(sha(fs.readFileSync(ref.path)),ref.sha256);
});

test('SWE1/7 both fixed callers bind the new helper in source custody and precede original executor',async()=>{
 for(const name of ['native-metadata-worker','native-package-preparation']){
  const source=await readFile(new URL('../src/'+name+'.mjs',import.meta.url),'utf8');
  assert.match(source,/evidence:\{directory:join\((?:root|attempt)\.path,'worker-evidence'\),input:intent\}/u);
  assert.ok(source.indexOf('retainSourceWorkerPhaseRequest(',source.indexOf('export async function perform'))<source.indexOf('executor.executeJavascriptNodeCommand(',source.indexOf('export async function perform')));
  if(name==='native-metadata-worker')assert.match(source,/async function selfFiles\(\).*source-worker-evidence\.mjs/u);
  else assert.match(source,/entry\.name\.endsWith\('\.mjs'\)/u);
 }
});


test('SWE6 fixed outcome error transport preserves original uncertainty and secondary write failure',()=>{
 for(const kind of ['metadata','package'])for(const code of ['BUILD_WORKER_CUSTODY_UNCERTAIN',7,'WORKER_EVIDENCE_UNRECEIVED']){
  const processObservation={quiescent:code!=='BUILD_WORKER_CUSTODY_UNCERTAIN',workerEvidence:{request:{sha256:'a'.repeat(64)},start:{sha256:'b'.repeat(64)},terminal:null},evidenceFailures:[{stage:'terminal',code:'EIO'}]};
  const original=Object.assign(new Error('original'),{code,workerProcessGroup:123,stdout:'original output',processObservation});
  const evidence={accepted:false,state:'unknown',processObservation,failure:code},secondary=Object.assign(new Error('receipt'),{code:'ENOSPC'});
  const result=sourceWorkerOutcomeFailure(kind,evidence,original,secondary),received=result[kind==='metadata'?'nativeMetadataEvidence':'nativePackageEvidence'];
  assert.equal(result,original);assert.equal(result.code,code);assert.equal(result.workerProcessGroup,123);assert.equal(result.stdout,'original output');assert.equal(received.accepted,false);assert.equal(received.state,processObservation.quiescent?'refused':'unknown');assert.equal(received.processObservation,processObservation);assert.equal(received.receivingEvidenceLost,true);assert.equal(received.receivingEvidenceFailure.code,'ENOSPC');assert.equal(evidence.receivingEvidenceLost,undefined);
 }
});

test('SWE6 fixed successful execution becomes refused when outer outcome persistence fails',()=>{
 for(const kind of ['metadata','package']){
  const evidence={accepted:true,state:'received',processObservation:{quiescent:true}},secondary=Object.assign(new Error('receipt'),{code:'ENOSPC'});
  const result=sourceWorkerOutcomeFailure(kind,evidence,undefined,secondary),received=result[kind==='metadata'?'nativeMetadataEvidence':'nativePackageEvidence'];
  assert.equal(result,secondary);assert.equal(received.accepted,false);assert.equal(received.state,'refused');assert.equal(received.receivingEvidenceLost,true);assert.equal(evidence.accepted,true);
 }
});

test('SWE6 actual fixed composer catch sites retain the original error and typed outcome',async()=>{
 for(const [name,kind,outcome] of [['native-metadata-worker','metadata','outcome'],['native-package-preparation','package','evidence']]){
  const source=await readFile(new URL('../src/'+name+'.mjs',import.meta.url),'utf8');
  assert.ok(source.includes("catch(receivingError){throw sourceWorkerOutcomeFailure('"+kind+"',"+outcome+",error,receivingError);}"));
 }
});
