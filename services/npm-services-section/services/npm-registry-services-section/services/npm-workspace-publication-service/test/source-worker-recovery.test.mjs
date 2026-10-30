import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,readdirSync,existsSync,copyFileSync,unlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {runSourceWorkerProcess as run} from '../src/source-worker-process.mjs';
import {receiveSourceWorkerEvidence as receive} from '../src/source-worker-evidence.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
function fixture(){const root=mkdtempSync(join(tmpdir(),'npm-recovery-')),path=join(root,'input.json'),body=Buffer.from('{}\n');writeFileSync(path,body,{mode:0o600});return {root,cwd:root,env:{PATH:process.env.PATH},timeout:2000,maxBuffer:65536,receiveProcess:true,evidence:{directory:join(root,'evidence'),input:{path,bytes:body.length,sha256:sha(body)}}};}
const reference=f=>{const path=join(f.evidence.directory,'request.json'),body=readFileSync(path);return {directory:f.evidence.directory,request:{path,bytes:body.length,sha256:sha(body)}};};
const launch=(f,source="process.stdout.write('original')")=>run(process.execPath,['-e',source],f);
const edit=(f,name,change)=>{const path=join(f.evidence.directory,name);writeFileSync(path,JSON.stringify(change(JSON.parse(readFileSync(path))))+'\n');};
test('valid terminal receives twice without effects, mutation or replay authority',async()=>{const f=fixture();await launch(f);const args=reference(f),before=readdirSync(args.directory).map(n=>[n,sha(readFileSync(join(args.directory,n)))]);for(let n=0;n<2;n++){const r=receive(args);assert.equal(r.state,'settled-success');assert.equal(r.semanticReceiving,false);assert.equal(r.replayPermitted,false);assert.equal(r.signalAuthority,'none');}assert.deepEqual(readdirSync(args.directory).map(n=>[n,sha(readFileSync(join(args.directory,n)))]),before);});
test('original nonzero terminal remains settled-refused',async()=>{const f=fixture();await assert.rejects(launch(f,'process.exit(7)'));assert.equal(receive(reference(f)).state,'settled-refused');});
test('start without terminal remains unknown, never evidence of not-running',async()=>{const f=fixture(),pending=launch(f,'setTimeout(()=>{},100)');assert.equal(receive(reference(f)).state,'unknown');await pending;assert.equal(receive(reference(f)).state,'settled-success');});
test('missing start and terminal remains unknown without source effects',async()=>{const f=fixture();await launch(f);unlinkSync(join(f.evidence.directory,'start.json'));unlinkSync(join(f.evidence.directory,'terminal.json'));assert.equal(receive(reference(f)).reason,'launch-unobserved');});
for(const variant of ['truncated-terminal','corrupt-stream','stale-request','mismatched-start','mismatched-terminal','missing-start','copied-terminal','false-quiescence'])test(variant+' cannot become received success',async()=>{const f=fixture();await launch(f);const args=reference(f);
 if(variant==='truncated-terminal')writeFileSync(join(args.directory,'terminal.json'),'{');
 if(variant==='corrupt-stream')writeFileSync(join(args.directory,'stdout.bin'),'changed');
 if(variant==='stale-request')args.request.sha256='0'.repeat(64);
 if(variant==='mismatched-start')edit(f,'start.json',x=>({...x,request:{...x.request,sha256:'0'.repeat(64)}}));
 if(variant==='mismatched-terminal')edit(f,'terminal.json',x=>({...x,request:{...x.request,sha256:'0'.repeat(64)}}));
 if(variant==='missing-start')unlinkSync(join(args.directory,'start.json'));
 if(variant==='copied-terminal'){const other=fixture();await launch(other);copyFileSync(join(other.evidence.directory,'terminal.json'),join(args.directory,'terminal.json'));}
 if(variant==='false-quiescence'){edit(f,'terminal.json',x=>({...x,processObservation:{...x.processObservation,quiescent:false}}));assert.equal(receive(args).state,'unknown');return;}
 assert.throws(()=>receive(args));
});
test('unsupported restart-recoverable custody refuses before spawn or evidence allocation',async()=>{for(const custodyMode of ['restart-recoverable','durable',true]){const f=fixture(),marker=join(f.root,'effect');await assert.rejects(run(process.execPath,['-e',`require('node:fs').writeFileSync(${JSON.stringify(marker)},'bad')`],{...f,custodyMode}),{code:'WORKER_CUSTODY_MODE_UNSUPPORTED'});assert.equal(existsSync(marker),false);assert.equal(existsSync(f.evidence.directory),false);}});
test('explicit live-parent preserves original bounded execution',async()=>{const f=fixture();await run(process.execPath,['-e',''],{...f,custodyMode:'live-parent'});assert.equal(receive(reference(f)).state,'settled-success');});
for(const field of ['timedOut','truncated','cancelled'])test('missing or nonboolean '+field+' cannot receive success',async()=>{for(const value of [undefined,null,'true']){const f=fixture();await launch(f);edit(f,'terminal.json',t=>({...t,processObservation:{...t.processObservation,[field]:value}}));assert.throws(()=>receive(reference(f)));}});
test('conflicting original start timestamp refuses despite matching pid and group',async()=>{const f=fixture();await launch(f);edit(f,'terminal.json',t=>({...t,processObservation:{...t.processObservation,startedAt:t.processObservation.startedAt+1}}));assert.throws(()=>receive(reference(f)));});
