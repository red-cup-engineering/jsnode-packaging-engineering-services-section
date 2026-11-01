import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,symlinkSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {receiveSourcePublicationBuildWorker as receive} from '@red-cup-engineering/npm-workspace-publication-service/source-build-worker-receiving';
import {prepareSourceBuildWorkerHome,retainSourceBuildWorkerInput,sourceWorkerFileReference} from '../src/source-worker-evidence.mjs';
import {runSourceWorkerProcess as run} from '../src/source-worker-process.mjs';
test('public build receiving resolves to the original owner module across release versions', () => {
  assert.equal(import.meta.resolve('@red-cup-engineering/npm-workspace-publication-service/source-build-worker-receiving'),
    new URL('../src/source-build-worker-receiving.mjs', import.meta.url).href,
    'release version changes must preserve the accepted public port, not forward to a replacement receiver');
});
const fixture=()=>{
 const scratch=mkdtempSync(join(tmpdir(),'fixed-build-receiving-'));prepareSourceBuildWorkerHome(scratch);
 const directory=join(scratch,'package'),scripts=join(scratch,'scripts');mkdirSync(directory);mkdirSync(scripts);
 const gate=join(scripts,'publish-package.mjs');writeFileSync(gate,'console.log(JSON.stringify({outcome:"fixture-only"}));');writeFileSync(join(directory,'package.json'),'{}');
 const value={kind:'npm.source-build-worker.input.v1',profile:'live-parent',scratch,directory,program:process.execPath,gate:sourceWorkerFileReference(gate),manifest:sourceWorkerFileReference(join(directory,'package.json')),registry:'https://registry.example',cacheRoot:null,timeout:3000,maxBuffer:16*1024*1024};
 return {scratch,value};
};
async function execute(f,change=()=>{}){
 const input=retainSourceBuildWorkerInput(join(f.scratch,'build-home'),f.value),args=[f.value.gate.path,'--qualify-build','--package',f.value.directory,'--registry',f.value.registry];change(args);
 const result=await run(process.execPath,args,{cwd:f.scratch,env:{PATH:process.env.PATH},timeout:f.value.timeout,maxBuffer:f.value.maxBuffer,receiveProcess:true,evidence:{directory:join(f.scratch,'build-home','worker-evidence'),input}});
 return {kind:'npm.source-build-worker.receiving.v1',scratch:f.scratch,input,request:result.processObservation.workerEvidence.request};
}
test('public fixed operation receiving separates settled process from semantic qualification and is replay-free',async()=>{
 const f=fixture(),request=await execute(f),first=receive(request);assert.equal(first.state,'settled-success');assert.equal(first.semanticReceiving,false);assert.equal(first.qualifiedProducts,false);assert.equal(first.replayPermitted,false);assert.deepEqual(receive(request),first);
});
test('original invocation must bind fixed argv even with valid supervisor terminal',async()=>{const f=fixture(),r=await execute(f,args=>args.push('--extra'));assert.throws(()=>receive(r),/does not bind/);});
for(const [name,mutate] of Object.entries({profile:v=>v.profile='restart-recoverable',gate:v=>v.gate.path=join(v.scratch,'other.mjs'),manifest:v=>v.manifest.path=join(v.directory,'other.json'),limit:v=>v.maxBuffer=1024,kind:v=>v.kind='other'}))test('fixed input refuses '+name,async()=>{
 const f=fixture();if(name==='gate'){const r=await execute(f);const body=readFileSync(r.input.path);writeFileSync(r.input.path,body.toString().replace('publish-package.mjs','another-package.mjs'));assert.throws(()=>receive(r));return;}
 if(name==='kind'){f.value.kind='other';assert.throws(()=>retainSourceBuildWorkerInput(join(f.scratch,'build-home'),f.value));return;}
 mutate(f.value);const r=await execute(f);assert.throws(()=>receive(r));
});
test('wrong caller input and request references refuse without following arbitrary path',async()=>{const r=await execute(fixture());assert.throws(()=>receive({...r,input:{...r.input,sha256:'0'.repeat(64)}}));assert.throws(()=>receive({...r,request:{...r.request,sha256:'0'.repeat(64)}}));assert.throws(()=>receive({...r,extra:true}));});
test('fresh scratch creation requires private parent and never adopts an existing build home',()=>{const root=mkdtempSync(join(tmpdir(),'build-home-'));const child=join(root,'fresh');prepareSourceBuildWorkerHome(child);assert.throws(()=>prepareSourceBuildWorkerHome(child));const link=join(root,'link');symlinkSync(child,link);assert.throws(()=>prepareSourceBuildWorkerHome(link));const open=join(root,'open');mkdirSync(open,{mode:0o755});assert.throws(()=>prepareSourceBuildWorkerHome(open));});

test('public receiving preserves missing terminal as unknown, without inferring retry authority',async()=>{
 const f=fixture(),r=await execute(f);const {unlinkSync}=await import('node:fs');unlinkSync(join(f.scratch,'build-home','worker-evidence','terminal.json'));
 const received=receive(r);assert.equal(received.state,'unknown');assert.equal(received.replayPermitted,false);assert.equal(received.qualifiedProducts,false);
});
test('public receiving keeps a fixed-operation process refusal separate from semantic report',async()=>{
 const f=fixture();writeFileSync(f.value.gate.path,'process.exitCode=2;console.log(JSON.stringify({kind:"npm.source-build-qualification",outcome:"refused"}));');f.value.gate=sourceWorkerFileReference(f.value.gate.path);
 const input=retainSourceBuildWorkerInput(join(f.scratch,'build-home'),f.value);
 const error=await run(process.execPath,[f.value.gate.path,'--qualify-build','--package',f.value.directory,'--registry',f.value.registry],{cwd:f.scratch,env:{PATH:process.env.PATH},timeout:3000,maxBuffer:16*1024*1024,receiveProcess:true,evidence:{directory:join(f.scratch,'build-home','worker-evidence'),input}}).catch(e=>e);
 const result=receive({kind:'npm.source-build-worker.receiving.v1',scratch:f.scratch,input,request:error.workerEvidence.request});assert.equal(result.state,'settled-refused');assert.equal(result.semanticReceiving,false);
});


test('receiving rejects credential, query and fragment registry in already enrolled input',async()=>{
 for(const registry of ['https://fixture-user:fixture-secret@registry.example','https://registry.example?token=fixture-secret','https://registry.example/#fixture-secret']){
  const f=fixture();f.value.registry=registry;const r=await execute(f);assert.throws(()=>receive(r),error=>error instanceof TypeError&&!String(error).includes('fixture-secret'));
 }
});
