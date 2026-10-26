import nodeTest from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile,rm,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {offlineFixture} from './native-precall-fixture.mjs';
import {receiveNativePrecallAdmission,assertNativePrecallAdmission,receiveNativeOfflineInstall} from '../src/native-precall-admission.mjs';
const supplier=process.env.PNPM_PRECALL_TEST_SUPPLIER,native=process.env.PNPM_PRECALL_NATIVE_TESTS==='1',supervisorPath=process.env.PNPM_PRECALL_TEST_SUPERVISOR;
assert.ok(supplier&&native&&supervisorPath,'explicit native registry receiving requires original supplier and supervisor; absence is not a skip');
const test=(name,options,fn)=>nodeTest(name,{...options,skip:!supplier||options.skip},fn);
test('standalone registry consumer executes original native offline command without inventing workspace',{skip:!native||!supervisorPath},async t=>{
  const f=await offlineFixture(t);await rm(join(f.cwd,'pnpm-workspace.yaml'));
  const manifest=JSON.parse(await readFile(join(f.cwd,'package.json'),'utf8'));
  manifest.scripts={install:'node -e "require(\'fs\').writeFileSync(\'lifecycle-ran\',\'bad\')"'};
  await writeFile(join(f.cwd,'package.json'),JSON.stringify(manifest));
  const paths=['package.json','pnpm-lock.yaml','.npmrc'],before=await Promise.all(paths.map(path=>readFile(join(f.cwd,path))));
  const input={...f.input,sourceProfile:'registry-consumer'},cap=await receiveNativePrecallAdmission(input);
  await assertNativePrecallAdmission(cap,{cwd:f.cwd,program:'pnpm',arguments:input.installArguments});
  const {runSourceWorkerProcess}=await import(supervisorPath);
  const result=await runSourceWorkerProcess(join(supplier,'bin/pnpm.cjs'),input.installArguments,
    {cwd:f.cwd,env:{...process.env},timeout:30000,maxBuffer:1048576,receiveProcess:true,signal:t.signal});
  assert.equal(result.processObservation.quiescent,true);assert.equal(result.processObservation.status,0);
  assert.deepEqual(await Promise.all(paths.map(path=>readFile(join(f.cwd,path)))),before);
  for(const name of ['pnpm-workspace.yaml','lifecycle-ran'])assert.equal((await readdir(f.cwd)).includes(name),false);
  // This dependency-empty fixture verifies native standalone execution/custody,
  // not fresh policy or artifact receiving. No verifier event is manufactured.
  let received=false;try{await receiveNativeOfflineInstall(cap,{stdout:result.stdout,
    terminal:{invoked:true,code:0,signal:null},
    observation:{startedAt:result.processObservation.startedAt,endedAt:result.processObservation.closedAt,complete:true},
    lockfilePath:join(f.cwd,'pnpm-lock.yaml')});received=true;}catch(error){assert.match(error.message,/fresh native verification|persistence/);}
  t.diagnostic(JSON.stringify({nativeStandalone:true,quiescent:true,authoredInputsUnchanged:true,
    workspaceCreated:false,lifecycleExecuted:false,freshVerificationReceived:received,installedArtifactReceiving:false}));
});
test('local root workspace bounds native ancestor policy discovery',{skip:!native||!supervisorPath},async t=>{
  const f=await offlineFixture(t),input={...f.input,sourceProfile:'registry-consumer'};
  await writeFile(join(f.root,'pnpm-workspace.yaml'),'packages: [\n');
  await writeFile(join(f.root,'.npmrc'),'cafile='+join(f.root,'does-not-exist.pem')+'\n');
  const paths=['package.json','pnpm-lock.yaml','pnpm-workspace.yaml','.npmrc'];
  const before=await Promise.all(paths.map(path=>readFile(join(f.cwd,path))));
  const cap=await receiveNativePrecallAdmission(input);
  await assertNativePrecallAdmission(cap,{cwd:f.cwd,program:'pnpm',arguments:input.installArguments});
  const {runSourceWorkerProcess}=await import(supervisorPath);
  const result=await runSourceWorkerProcess(join(supplier,'bin/pnpm.cjs'),input.installArguments,
    {cwd:f.cwd,env:{...process.env},timeout:30000,maxBuffer:1048576,receiveProcess:true,signal:t.signal});
  assert.equal(result.processObservation.quiescent,true);assert.equal(result.processObservation.status,0);
  assert.deepEqual(await Promise.all(paths.map(path=>readFile(join(f.cwd,path)))),before);
  t.diagnostic('Native local workspace ignores ancestor malformed workspace and nonexistent ancestor cafile; no inherited settings rewritten.');
});
