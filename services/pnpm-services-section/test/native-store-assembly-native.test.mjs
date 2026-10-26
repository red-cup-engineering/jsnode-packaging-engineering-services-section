import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,copyFile,lstat,realpath,unlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';import {promisify} from 'node:util';
import {withFrozenPnpmStore} from '../src/native-store-lease.mjs';
import {createNativeStoreAssemblyService} from '../src/native-store-assembly.mjs';
const execute=promisify(execFile),hash=b=>createHash('sha256').update(b).digest('hex');
test('original PNPM11.28.5 executes frozen offline imports under native exclusive cache custody',async()=>{
 assert.equal(process.version,'v24.18.0');
 const entry=await realpath(process.env.PNPM_NATIVE_ASSEMBLY_ENTRY);
 const supplierRoot=dirname(dirname(entry)),supplier=JSON.parse(await readFile(join(supplierRoot,'package.json'),'utf8'));
 assert.equal(supplier.name,'pnpm');assert.equal(supplier.version,'11.28.5');
 const distribution=hash(await readFile(join(supplierRoot,'dist/pnpm.mjs')));
 assert.equal(distribution,'e3738fda08262f74611d7a1ffc11b3e87fa52b466c07eb73211d179ebcb98810');
 const root=await mkdtemp(join(tmpdir(),'pnpm-native-store-assembly-'));
 const seed=join(root,'seed'),stage=join(root,'consumer'),storeBase=join(root,'native-store'),cache=join(root,'metadata');
 await mkdir(seed);await mkdir(stage);
 let phase='seed',report={kind:'pnpm.native-store-assembly.source-qualification',root,sourceOnly:true,production:false,provider:{node:process.version,pnpm:supplier.version,distribution}};
 const record=async()=>writeFile(join(root,'receiving.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});
 const run=async(args,cwd,label)=>{
  try{const r=await execute(process.execPath,[entry,...args],{cwd,timeout:120000,maxBuffer:2097152,env:{...process.env,CI:'true'}});
   await writeFile(join(root,label+'.stdout'),r.stdout);await writeFile(join(root,label+'.stderr'),r.stderr);return r;
  }catch(e){await writeFile(join(root,label+'.stdout'),e.stdout??'');await writeFile(join(root,label+'.stderr'),e.stderr??'');throw e;}
 };
 try{
  const manifest={name:'native-pnpm-store-assembly-fixture',version:'0.0.0-dev.0',private:true,type:'module',dependencies:{semver:'7.7.2'},
   scripts:{postinstall:'node -e "require(\'node:fs\').writeFileSync(\'forbidden-lifecycle\',\'ran\')"'}};
  for(const cwd of[seed,stage]){
   await writeFile(join(cwd,'package.json'),JSON.stringify(manifest,null,2)+'\n');
   await writeFile(join(cwd,'pnpm-workspace.yaml'),'packages: []\n');
   await writeFile(join(cwd,'.npmrc'),'registry=https://registry.561.group/\n');
   await writeFile(join(cwd,'.pnpmfile.cjs'),'module.exports={hooks:{readPackage(pkg){return pkg;}}};\n');
  }
  const seedResult=await run(['install','--no-frozen-lockfile','--ignore-scripts','--store-dir',storeBase,'--cache-dir',cache,'--reporter=append-only'],seed,'seed');
  const nativeStore=(await run(['--store-dir',storeBase,'store','path'],seed,'store-path')).stdout.trim();
  assert.equal(nativeStore,join(storeBase,'v11'));
  await copyFile(join(seed,'pnpm-lock.yaml'),join(stage,'pnpm-lock.yaml'));
  const lockBefore=await readFile(join(stage,'pnpm-lock.yaml'));
  const indexBefore=hash(await readFile(join(nativeStore,'index.db')));
  const events=join(root,'native-import-events.ndjson');await writeFile(events,'',{mode:0o600});
  const hook=join(root,'strict-native-import.mjs'),module=pathToFileURL(new URL('../src/native-strict-store-importer.mjs',import.meta.url).pathname).href;
  await writeFile(hook,'import{appendFileSync}from"node:fs";\nimport{createStrictStoreImporter}from '+JSON.stringify(module)+';\n'+
   'const importer=await createStrictStoreImporter('+JSON.stringify({storeDirectory:nativeStore,installationDirectory:stage})+');\n'+
   'export const hooks={importPackage:async(...args)=>{const method=await importer.importPackage(...args);appendFileSync('+JSON.stringify(events)+',JSON.stringify(importer.read())+"\\n");return method;}};\n');
  phase='frozen-native-assembly';await record();
  const args=['install','--frozen-lockfile','--ignore-scripts','--frozen-store','--offline','--store-dir',storeBase,'--cache-dir',cache,
   '--global-pnpmfile',hook,'--config.enable-global-virtual-store=false','--reporter=append-only'];
  const received=await withFrozenPnpmStore({storeDirectory:nativeStore,installationDirectory:stage},()=>run(args,stage,'frozen'));
  assert.equal(hash(await readFile(join(stage,'pnpm-lock.yaml'))),hash(lockBefore));
  assert.equal(hash(await readFile(join(nativeStore,'index.db'))),indexBefore);
  const rows=(await readFile(events,'utf8')).trim().split('\n').map(JSON.parse);
  assert.ok(rows.length>0);assert.ok(rows.every(r=>r.copiedPayloadBytes===0));
  const installed=await realpath(join(stage,'node_modules/semver/package.json'));
  assert.ok((await lstat(installed)).nlink>=2);
  await assert.rejects(lstat(join(seed,'forbidden-lifecycle')),{code:'ENOENT'});
  await assert.rejects(lstat(join(stage,'forbidden-lifecycle')),{code:'ENOENT'});
  report={...report,status:'source-native-qualified',phase,store:nativeStore,locked:received.receipt,
   wantedLockSHA256:hash(lockBefore),indexSHA256:indexBefore,imports:rows.at(-1),
   localHookPreserved:true,lifecycleExecuted:false,seedOutputBytes:Buffer.byteLength(seedResult.stdout)};
  phase='prepared-original-service';await record();
  const serviceStage=join(root,'service-consumer');await mkdir(serviceStage);
  for(const name of['package.json','pnpm-lock.yaml','pnpm-workspace.yaml','.npmrc','.pnpmfile.cjs'])await copyFile(join(stage,name),join(serviceStage,name));
  const service=createNativeStoreAssemblyService();
  const prepared=await service.prepare({entry,cwd:serviceStage,storeBase,receiptDirectory:root,policyArguments:['--config.minimumReleaseAgeStrict=true','--config.minimumReleaseAge=0']});
  await assert.rejects(service.revalidate({...prepared.session}),/foreign/);
  await service.revalidate(prepared.session);
  const native=await service.withStoreRead(prepared.session,command=>run(command.arguments.slice(1),serviceStage,'prepared-native'));
  const receiving=await service.receive(prepared.session,{invoked:true,code:0,signal:null});
  assert.equal(receiving.accepted,true);assert.equal(receiving.evidence.imports.copiedPayloadBytes,0);
  assert.equal(hash(await readFile(join(serviceStage,'pnpm-lock.yaml'))),hash(lockBefore));
  assert.equal(hash(await readFile(join(nativeStore,'index.db'))),indexBefore);
  await assert.rejects(service.withStoreRead(prepared.session,()=>null),/single use/);
  const missingStage=join(root,'missing-cache-consumer');await mkdir(missingStage);
  for(const name of['package.json','pnpm-lock.yaml','pnpm-workspace.yaml','.npmrc','.pnpmfile.cjs'])await copyFile(join(stage,name),join(missingStage,name));
  const payloadDigest=createHash('sha512').update(await readFile(installed)).digest('hex');
  const missingPayload=join(nativeStore,'files',payloadDigest.slice(0,2),payloadDigest.slice(2));
  assert.equal((await lstat(missingPayload)).ino,(await lstat(installed)).ino);
  await unlink(missingPayload); // Only this test's privately procured fixture cache.
  const missing=await service.prepare({entry,cwd:missingStage,storeBase,receiptDirectory:root,policyArguments:['--config.minimumReleaseAgeStrict=true','--config.minimumReleaseAge=0']});
  let refusedOutcome;
  await assert.rejects(service.withStoreRead(missing.session,command=>run(command.arguments.slice(1),missingStage,'missing-cache')),error=>{refusedOutcome={invoked:true,code:error.code,signal:error.signal??null};return true;});
  const refused=await service.receive(missing.session,refusedOutcome);
  assert.equal(refused.accepted,false);assert.equal(hash(await readFile(join(nativeStore,'index.db'))),indexBefore);
  await assert.rejects(lstat(missingPayload),{code:'ENOENT'});
  const changedStage=join(root,'changed-hook-consumer');await mkdir(changedStage);
  for(const name of['package.json','pnpm-lock.yaml','pnpm-workspace.yaml','.npmrc','.pnpmfile.cjs'])await copyFile(join(stage,name),join(changedStage,name));
  const changed=await service.prepare({entry,cwd:changedStage,storeBase,receiptDirectory:root,policyArguments:[]});
  await writeFile(join(changedStage,'.pnpmfile.cjs'),'throw new Error("must not execute");\n');
  await assert.rejects(service.revalidate(changed.session),/configuration changed/);
  report={...report,phase,preparedService:{supplier:prepared.supplier,receiving,stdoutBytes:Buffer.byteLength(native.stdout)},
   controls:{missingCacheRefused:!refused.accepted,noCacheFill:true,changedHookRefusedBeforeProbe:true,foreignSessionRefused:true,singleUse:true}};
  await record();console.log(JSON.stringify(report));
 }catch(error){report={...report,status:'refused-or-failed',phase,error:{code:error.code,message:error.message}};await record();throw error;}
});
