import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,lstat,realpath,copyFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {runSourceWorkerProcess} from '../src/source-worker-process.mjs';
import {receiveSourceRegistryConsumers} from '../src/source-registry-closure.mjs';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
test('original Code receives a real strict PNPM cache graph, preserves policy and prior installation',{
 skip:process.env.CODE_STORE_ASSEMBLY_NATIVE_TESTS!=='1'
},async()=>{
 assert.equal(process.version,'v24.18.0');
 const entry=await realpath(process.env.PNPM_NATIVE_ASSEMBLY_ENTRY);
 const supplierRoot=dirname(dirname(entry)),supplier=JSON.parse(await readFile(join(supplierRoot,'package.json'),'utf8'));
 assert.equal(supplier.name,'pnpm');assert.equal(supplier.version,'11.28.5');
 assert.equal(hash(await readFile(join(supplierRoot,'dist/pnpm.mjs'))),'e3738fda08262f74611d7a1ffc11b3e87fa52b466c07eb73211d179ebcb98810');
 const root=await mkdtemp(join(tmpdir(),'code-store-assembly-native-')),seed=join(root,'seed'),consumer=join(root,'consumer'),
 storeBase=join(root,'store'),receipts=join(root,'receipts');
 for(const path of[seed,consumer,storeBase,receipts])await mkdir(path);
 const manifest={name:'code-native-store-assembly-fixture',version:'0.0.0-dev.0',private:true,
  dependencies:{semver:'7.7.2'},scripts:{postinstall:'node -e "throw Error(\'lifecycle must not execute\')"'}};
 for(const path of[seed,consumer]){
  await writeFile(join(path,'package.json'),JSON.stringify(manifest,null,2)+'\n');
  await writeFile(join(path,'pnpm-workspace.yaml'),'packages: []\nminimumReleaseAge: 0\n');
  await writeFile(join(path,'.npmrc'),'registry=https://registry.npmjs.org/\n');
  await writeFile(join(path,'.pnpmfile.cjs'),'module.exports={hooks:{readPackage(pkg){return pkg;}}};\n');
 }
 await runSourceWorkerProcess(process.execPath,[entry,'install','--no-frozen-lockfile','--ignore-scripts','--store-dir',storeBase,'--cache-dir',join(root,'cache'),'--network-concurrency=1','--fetch-retries=0','--fetch-timeout=15000'],{
  cwd:seed,env:{...process.env,CI:'true'},timeout:30000,maxBuffer:1048576,receiveProcess:true});
 await copyFile(join(seed,'pnpm-lock.yaml'),join(consumer,'pnpm-lock.yaml'));
 await mkdir(join(consumer,'node_modules'));await writeFile(join(consumer,'node_modules/prior'),'original prior installation');
 const before={};for(const file of['package.json','pnpm-lock.yaml','pnpm-workspace.yaml','.pnpmfile.cjs'])before[file]=hash(await readFile(join(consumer,file)));
 const result=await receiveSourceRegistryConsumers({consumerPaths:[consumer],releases:[],logDirectory:join(root,'logs'),
  pnpm:process.execPath,pnpmArguments:[entry],nativeStoreAssembly:{storeBase,receiptDirectory:receipts},installationTimeout:20000,admissionTimeout:10000});
 await writeFile(join(root,'receiving.json'),JSON.stringify({sourceQualificationOnly:true,production:false,result},null,2)+'\n');
 assert.deepEqual(result.refusals,[]);assert.equal(result.packages.length,1);
 const received=result.packages[0];assert.equal(received.nativeStoreAssembly.accepted,true);
 assert.equal(received.nativeStoreAssembly.evidence.imports.copiedPayloadBytes,0);
 assert.ok((await lstat(await realpath(join(consumer,'node_modules/semver/package.json')))).nlink>=2);
 assert.equal(await readFile(join(received.previousInstallation,'prior'),'utf8'),'original prior installation');
 for(const[file,digest]of Object.entries(before))assert.equal(hash(await readFile(join(consumer,file))),digest);
 console.log(JSON.stringify({kind:'code.native-store-assembly.source-qualification',root,production:false,
  imports:received.nativeStoreAssembly.evidence.imports,previousInstallationPreserved:true,authoredInputsPreserved:true}));
});
