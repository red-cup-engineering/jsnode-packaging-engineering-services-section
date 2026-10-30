import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {runSourceWorkerProcess as run} from '../src/source-worker-process.mjs';
const root=await mkdtemp(join(tmpdir(),'npm-metadata-supervisor-'));
const env={PATH:process.env.PATH,HOME:root};
const options={cwd:root,env,timeout:5000,maxBuffer:65536,receiveProcess:true};
const outcomes=[];
const receive=async(name,operation)=>{let result,error;try{result=await operation();}catch(e){error=e;result={stdout:e.stdout,stderr:e.stderr,processObservation:e.processObservation,code:e.code};}outcomes.push({name,...result});await writeFile(join(root,'outcomes.json'),JSON.stringify(outcomes,null,2)+'\n');return {result,error};};
test('legacy worker shape and successful metadata group receiving preserve output',async()=>{
 const legacy=await run(process.execPath,['-e',"process.stdout.write('out');process.stderr.write('err')"],{...options,receiveProcess:false});
 assert.deepEqual(legacy,{stdout:'out',stderr:'err'});
 const {result,error}=await receive('success',()=>run(process.execPath,['-e',"process.stdout.write('exact')"],options));
 assert.equal(error,undefined);assert.equal(result.stdout,'exact');assert.equal(result.processObservation.quiescent,true);assert.equal(result.processObservation.status,0);
});
test('native worker refusal keeps original exit status and bounded output',async()=>{
 const {result,error}=await receive('exit2',()=>run(process.execPath,['-e',"process.stdout.write('refused');process.stderr.write('why');process.exitCode=2"],options));
 assert.equal(error.code,2);assert.equal(result.stdout,'refused');assert.equal(result.stderr,'why');assert.equal(result.processObservation.quiescent,true);
});
test('normal outer exit settles its still-running inherited-group descendant',async()=>{
 const marker=join(root,'descendant-heartbeat');
 const child=`const fs=require('node:fs');fs.writeFileSync(${JSON.stringify(marker)},'started');setInterval(()=>fs.appendFileSync(${JSON.stringify(marker)},'.'),10);`;
 const parent=`const{spawn}=require('node:child_process');const fs=require('node:fs');spawn(process.execPath,['-e',${JSON.stringify(child)}],{stdio:'ignore'});const t=setInterval(()=>{if(fs.existsSync(${JSON.stringify(marker)})){clearInterval(t);process.exit(0)}},5);`;
 const {result,error}=await receive('normal-close-descendant',()=>run(process.execPath,['-e',parent],options));
 assert.equal(error,undefined);assert.equal(result.processObservation.quiescent,true);
 const before=await readFile(marker,'utf8');await new Promise(r=>setTimeout(r,80));assert.equal(await readFile(marker,'utf8'),before);
});
test('outer timeout stops its owned group before rejection',async()=>{
 const {result,error}=await receive('timeout',()=>run(process.execPath,['-e','setInterval(()=>{},1000)'],{...options,timeout:150}));
 assert.equal(error.code,'ETIMEDOUT');assert.equal(result.processObservation.timedOut,true);assert.equal(result.processObservation.quiescent,true);
});
test('output overflow stops group and retains bounded captured evidence',async()=>{
 const {result,error}=await receive('overflow',()=>run(process.execPath,['-e',"process.stdout.write('prefix');setTimeout(()=>process.stdout.write('x'.repeat(500000)),30);setInterval(()=>{},1000)"],{...options,maxBuffer:128}));
 assert.equal(error.code,'ERR_CHILD_PROCESS_STDIO_MAXBUFFER');assert.equal(result.processObservation.truncated,true);assert.equal(result.processObservation.quiescent,true);assert.ok(result.stdout.length<=128);
});
test('cancellation uses the same owned settlement; malformed signal refuses before spawn',async()=>{
 const c=new AbortController();setTimeout(()=>c.abort(),100);
 const {result,error}=await receive('cancel',()=>run(process.execPath,['-e','setInterval(()=>{},1000)'],{...options,signal:c.signal}));
 assert.equal(error.code,'ABORT_ERR');assert.equal(result.processObservation.cancelled,true);assert.equal(result.processObservation.quiescent,true);
 await assert.rejects(run(process.execPath,['-e','throw 1'],{...options,signal:{}}),/native cancellation/);
 const already=new AbortController();already.abort();await assert.rejects(run(process.execPath,['-e','throw 1'],{...options,signal:already.signal}),/before launch/);
});
test('failed spawn does not claim an invoked group or ESRCH quiescence',async()=>{
 const {result,error}=await receive('failed-start',()=>run(join(root,'missing-executable'),[],options));
 assert.equal(error.code,'ENOENT');assert.equal(result.processObservation.invoked,false);assert.equal(result.processObservation.processGroup,null);assert.equal(result.processObservation.quiescent,false);
});
test('settlement refusal preserves earlier captured output rather than fabricating quiescence',async()=>{
 const original=process.kill;process.kill=(pid,signal)=>{if(signal==='SIGKILL')throw Object.assign(new Error('synthetic stop refusal after already-exited child'),{code:'EPERM'});return original(pid,signal);};
 try{
  const {result,error}=await receive('stop-refusal-after-exit',()=>run(process.execPath,['-e',"process.stdout.write('retained');process.stderr.write('also-retained')"],options));
  assert.equal(error.code,'BUILD_WORKER_CUSTODY_UNCERTAIN');assert.equal(result.processObservation.quiescent,false);assert.equal(result.stdout,'retained');assert.equal(result.stderr,'also-retained');
 }finally{process.kill=original;}
});
console.log('owned fixture evidence:',root);

test('caller signal method and aborted overrides never dispatch after spawn',async()=>{
 const controller=new AbortController();let calls=0;
 for(const key of ['addEventListener','removeEventListener','aborted'])Object.defineProperty(controller.signal,key,{get(){calls++;throw new Error('caller override');}});
 setTimeout(()=>controller.abort(),100);
 const {result,error}=await receive('signal-overrides',()=>run(process.execPath,['-e','setInterval(()=>{},1000)'],{...options,signal:controller.signal}));
 assert.equal(error.code,'ABORT_ERR');assert.equal(result.processObservation.quiescent,true);assert.equal(calls,0);
});
