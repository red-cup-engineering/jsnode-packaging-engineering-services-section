// Test-only owner receiving. No publication, deployment, credentials or policy exemption.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,realpathSync,readdirSync,lstatSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {receiveCITransport,receiveRequiredTests,receiveProcess,receiveSuite,receiveArchive} from './native-ci-receiving-contract.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>JSON.parse(readFileSync(p,'utf8'));
const digest=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const manifest=read(join(root,'package.json')),contract=read(join(root,'ci-native-qualification.json'));
assert.equal(process.version,'v24.19.0');
assert.equal(contract.version,1);assert.equal(manifest.devDependencies.pnpm,contract.supplier.version);
assert.equal(manifest.dependencies.pnpm,undefined,'test supplier must not become a runtime dependency');
const supplier=realpathSync(join(root,'node_modules','pnpm'));
assert.equal(read(join(supplier,'package.json')).version,contract.supplier.version);
assert.equal(digest(join(supplier,'dist','pnpm.mjs')),contract.supplier.distributionSHA256);
const entry=join(supplier,'bin','pnpm.mjs');
const packer=realpathSync(join(root,'node_modules','npm'));
assert.equal(read(join(packer,'package.json')).version,contract.packer.version);
assert.equal(manifest.dependencies.npm,undefined,'packer must remain a test dependency');
const npmEntry=join(packer,'bin','npm-cli.js');
const files=receiveRequiredTests(root,manifest.receivingTests);
const protectedFiles=['package.json','pnpm-lock.yaml','ci-native-qualification.json','scripts/receive-native-ci.mjs','scripts/native-ci-receiving-contract.mjs','test/native-ci-receiving-contract.test.mjs','native-ci-receiving.spec.md','README.md',...files,
 ...readdirSync(join(root,'src')).filter(p=>p.endsWith('.mjs')).map(p=>'src/'+p)];
const before=Object.fromEntries(protectedFiles.map(p=>[p,digest(join(root,p))]));
const base=process.env.RUNNER_TEMP?resolve(process.env.RUNNER_TEMP):join(root,'data','logs');
mkdirSync(base,{recursive:true});const stage=mkdtempSync(join(base,'pnpm-native-receiving-'));
const home=join(stage,'home');mkdirSync(home);
const userconfig=join(stage,'user.npmrc'),globalconfig=join(stage,'global.npmrc');
writeFileSync(userconfig,'');writeFileSync(globalconfig,'');
const env={PATH:process.env.PATH,HOME:home,TMPDIR:stage,TEMP:stage,TMP:stage,
 npm_config_userconfig:userconfig,npm_config_globalconfig:globalconfig,npm_config_update_notifier:'false',CI:'true',
 QUALIFIED_PNPM_ENTRY:entry,PNPM_PRECALL_TEST_SUPPLIER:supplier,PNPM_PRECALL_NATIVE_TESTS:'1'};
const transport=await receiveCITransport(process.env,home);Object.assign(env,transport.values);
function command(program,args,cwd,name){
 const result=spawnSync(program,args,{cwd,env,encoding:'utf8',timeout:180000,maxBuffer:16*1024*1024,shell:false});
 writeFileSync(join(stage,name+'.stdout'),result.stdout??'');writeFileSync(join(stage,name+'.stderr'),result.stderr??'');
 return receiveProcess(result);
}
function suite(cwd,name){
 const tap=command(process.execPath,['--test','--test-reporter=tap',...files],cwd,name);
 return receiveSuite(tap,contract.optionalSkippedCases);
}
const receipt={version:1,sourceCommit:process.env.GITHUB_SHA??null,supplier:contract.supplier,sourceFiles:before,
 outsideThisReceiving:contract.outsideThisReceiving,transport:transport.identity};
try{
 command(process.execPath,['--test','test/native-ci-receiving-contract.test.mjs'],root,'receiving-contract-tests');
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
}catch(error){receipt.state='refused';receipt.failure={name:error.name,message:error.message};throw error;}finally{writeFileSync(join(stage,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');}
console.log(JSON.stringify({state:receipt.state,source:receipt.source,installed:receipt.installed,archiveSHA256:receipt.archive.sha256,
 outsideThisReceiving:receipt.outsideThisReceiving,receipt:join(stage,'receipt.json')},null,2));
