// Test-only owner receiving. No publication, deployment, credentials or policy exemption.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,realpathSync,readdirSync,lstatSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {receiveCITransport,receiveRequiredTests,receiveProcess,receiveSuite,receiveNativeProductSuite,emitNativeFailureDiagnostics,emitCIFailureDiagnostics,receiveArchive} from './native-ci-receiving-contract.mjs';
import {constructNativeProvider} from '../src/native-provider-construction.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>JSON.parse(readFileSync(p,'utf8'));
const digest=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const manifest=read(join(root,'package.json')),contract=read(join(root,'ci-native-qualification.json'));
assert.equal(process.version,'v24.19.0');
assert.equal(contract.version,1);assert.equal(manifest.devDependencies.pnpm,contract.supplier.version);
assert.equal(manifest.dependencies.pnpm,undefined,'test supplier must not become a runtime dependency');
const supplier=realpathSync(join(root,'node_modules','pnpm'));
assert.equal(read(join(supplier,'package.json')).version,contract.supplier.version);
assert.equal(digest(join(supplier,'dist','pnpm.mjs')),contract.supplier.inputDistributionSHA256);
const packer=realpathSync(join(root,'node_modules','npm'));
assert.equal(read(join(packer,'package.json')).version,contract.packer.version);
assert.equal(manifest.dependencies.npm,undefined,'packer must remain a test dependency');
const npmEntry=join(packer,'bin','npm-cli.js');
const files=receiveRequiredTests(root,manifest.receivingTests);
const nativeProductFiles=receiveRequiredTests(root,[contract.nativeProductSource.file]);
assert.equal(contract.nativeProductSource.file,'test/native-provider-construction-native.test.mjs');
assert.ok(!files.includes(contract.nativeProductSource.file),'native product receiving must remain source-only');
const protectedFiles=['package.json','pnpm-lock.yaml','ci-native-qualification.json','scripts/receive-native-ci.mjs','scripts/native-ci-receiving-contract.mjs','test/native-ci-receiving-contract.test.mjs','native-ci-receiving.spec.md','README.md',...files,...nativeProductFiles,
 ...readdirSync(join(root,'src')).filter(p=>p.endsWith('.mjs')).map(p=>'src/'+p)];
const before=Object.fromEntries(protectedFiles.map(p=>[p,digest(join(root,p))]));
const base=process.env.RUNNER_TEMP?resolve(process.env.RUNNER_TEMP):join(root,'data','logs');
mkdirSync(base,{recursive:true});const stage=mkdtempSync(join(base,'pnpm-native-receiving-'));
const product=await constructNativeProvider({sourceDirectory:supplier,outputDirectory:join(stage,'native-provider')});
assert.equal(product.distributionSHA256,contract.supplier.distributionSHA256);
assert.equal(product.inventorySHA256,contract.supplier.inventorySHA256);
const entry=product.entry;
const home=join(stage,'home');mkdirSync(home);
const userconfig=join(stage,'user.npmrc'),globalconfig=join(stage,'global.npmrc');
writeFileSync(userconfig,'');writeFileSync(globalconfig,'');
const env={PATH:process.env.PATH,HOME:home,TMPDIR:stage,TEMP:stage,TMP:stage,
 npm_config_userconfig:userconfig,npm_config_globalconfig:globalconfig,npm_config_update_notifier:'false',CI:'true',
 QUALIFIED_PNPM_ENTRY:entry,PNPM_PRECALL_TEST_SUPPLIER:product.directory,PNPM_PRECALL_NATIVE_TESTS:'1'};
const transport=await receiveCITransport(process.env,home);Object.assign(env,transport.values);
function command(program,args,cwd,name,receive=output=>output,additionalEnv={}){
 const result=spawnSync(program,args,{cwd,env:{...env,...additionalEnv},encoding:'utf8',timeout:180000,maxBuffer:16*1024*1024,shell:false});
 const stdout=result.stdout??'',stderr=result.stderr??'';
 writeFileSync(join(stage,name+'.stdout'),stdout);writeFileSync(join(stage,name+'.stderr'),stderr);
 const terminal={status:result.status,signal:result.signal,error:result.error?{name:result.error.name,code:result.error.code,message:result.error.message}:null};
 const retained={stage:name,command:[program,...args],cwd,terminal,stdout:join(stage,name+'.stdout'),stderr:join(stage,name+'.stderr'),
  stdoutSHA256:digest(join(stage,name+'.stdout')),stderrSHA256:digest(join(stage,name+'.stderr'))};
 receipt.commands.push(retained);
 try{return receive(receiveProcess(result));}catch(error){
  retained.refusal={name:error.name,message:error.message};
  if(name==='native-product-source-tests'){
   try{retained.nativeFailureDiagnostics=emitNativeFailureDiagnostics(additionalEnv.PNPM_NATIVE_QUALIFICATION_STATE,{stdout,stderr,terminal});}
   catch{retained.nativeFailureDiagnostics={version:1,state:'diagnostics-only',view:'public-safe-projection',status:'diagnostics-unavailable'};}
   receipt.nativeProductSource.failureDiagnostics=retained.nativeFailureDiagnostics;
   // Raw output and the original refusal remain in isolated local custody. A
   // fresh fixed refusal prevents an assertion's arbitrary native text/cause
   // from escaping through this entrypoint's eventual uncaught-error output.
   throw new Error('native-product-source-tests refused; raw evidence retained locally; public diagnostics are a bounded safe projection');
  }
  try{retained.failureDiagnostics=emitCIFailureDiagnostics(name,{stdout,stderr,terminal});}
  catch{
   retained.failureDiagnostics={version:1,state:'diagnostics-only',view:'public-safe-projection',status:'diagnostics-unavailable'};
   console.error(JSON.stringify(retained.failureDiagnostics));
  }
  throw new Error('native CI command refused; raw evidence retained locally; public diagnostics are a bounded safe projection');
 }
}
function suite(cwd,name){
 return command(process.execPath,['--test','--test-reporter=tap',...files],cwd,name,tap=>receiveSuite(tap,contract.optionalSkippedCases));
}
const receipt={version:1,sourceCommit:process.env.GITHUB_SHA??null,supplier:contract.supplier,constructedSupplier:product,sourceFiles:before,
 outsideThisReceiving:contract.outsideThisReceiving,transport:transport.identity,commands:[]};
try{
 command(process.execPath,['--test','test/native-ci-receiving-contract.test.mjs'],root,'receiving-contract-tests');
 const qualificationState=join(stage,'native-product-qualification');mkdirSync(qualificationState,{mode:0o700});
 receipt.nativeProductSource={state:'running',scope:'source-only',file:contract.nativeProductSource.file,node:process.version,
  qualificationState,upstream:supplier,constructedProduct:product.directory,testHeapMiB:128,pnpmHeapMiB:96,testConcurrency:1,timeoutMs:180000,maxOutputBytes:16*1024*1024};
 Object.assign(receipt.nativeProductSource,command(process.execPath,
  ['--max-old-space-size=128','--expose-gc','--test','--test-concurrency=1','--test-reporter=tap',...nativeProductFiles],root,'native-product-source-tests',
  tap=>receiveNativeProductSuite(tap,contract.nativeProductSource.expectedNames),
  {PNPM_NATIVE_CONSTRUCTED_PRODUCT:product.directory,PNPM_NATIVE_UPSTREAM:supplier,PNPM_NATIVE_QUALIFICATION_STATE:qualificationState}),{state:'received'});
 receipt.source=suite(root,'source-tests');
 for(const hook of ['prepack','prepare','postpack'])assert.equal(manifest.scripts?.[hook],undefined,'unexpected pack lifecycle');
 const packed=JSON.parse(command(process.execPath,[npmEntry,'pack','--ignore-scripts','--workspaces=false','--json','--pack-destination',stage],root,'native-pack'));
 assert.equal(packed.length,1);assert.match(packed[0].filename,/^[a-zA-Z0-9._-]+\.tgz$/);
 const archive=join(stage,packed[0].filename);
 const members=command('tar',['-tzf',archive],root,'archive-members').trim().split('\n');
 receiveArchive(members,manifest);
 receipt.archive={sha256:digest(archive),members};
 const consumer=join(stage,'consumer');mkdirSync(consumer);
 writeFileSync(join(consumer,'package.json'),JSON.stringify({private:true,type:'module',dependencies:{[manifest.name]:'file:'+archive}}));
 const common=['--ignore-scripts','--registry=https://registry.npmjs.org/','--store-dir='+join(stage,'store'),'--cache-dir='+join(stage,'cache'),'--network-concurrency=1','--fetch-retries=0','--fetch-timeout=15000'];
 command(process.execPath,[entry,'install','--lockfile-only',...common],consumer,'consumer-lock');
 const lockBefore=digest(join(consumer,'pnpm-lock.yaml'));
 command(process.execPath,[entry,'install','--frozen-lockfile',...common],consumer,'consumer-install');
 assert.equal(digest(join(consumer,'pnpm-lock.yaml')),lockBefore);
 const installed=realpathSync(join(consumer,'node_modules',manifest.name));
 assert.deepEqual(read(join(installed,'package.json')).dependencies,manifest.dependencies);
 for(const p of protectedFiles.filter(p=>p.startsWith('src/')||files.includes(p)))
  assert.equal(digest(join(installed,p)),before[p],'installed bytes differ from original '+p);
 assert.equal(lstatSync(join(installed,'package.json')).isFile(),true);
 receipt.installed=suite(installed,'installed-tests');receipt.consumerLockSHA256=lockBefore;
 for(const [p,hash] of Object.entries(before))assert.equal(digest(join(root,p)),hash,'changed original source '+p);
 receipt.state='received';
}catch(error){receipt.state='refused';if(receipt.nativeProductSource?.state==='running')receipt.nativeProductSource.state='refused';receipt.failure={name:error.name,message:error.message};throw new Error('native CI receiving refused; original failure retained locally');}finally{writeFileSync(join(stage,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');}
// TAP fingerprints remain in the private receipt, never the public summary.
console.log(JSON.stringify({state:receipt.state,nativeProductSource:{...receipt.nativeProductSource,outputSHA256:undefined},source:{...receipt.source,outputSHA256:undefined},installed:{...receipt.installed,outputSHA256:undefined},archiveSHA256:receipt.archive.sha256,
 outsideThisReceiving:receipt.outsideThisReceiving,receipt:join(stage,'receipt.json')},null,2));
