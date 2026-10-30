import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,chmod,lstat,statfs,realpath,rename,symlink,unlink,readdir,readlink} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';import {tmpdir} from 'node:os';import {createHash} from 'node:crypto';import {createServer} from 'node:https';import {pathToFileURL} from 'node:url';
import {create as createTar} from 'tar';
import {gunzipSync,gzipSync} from 'node:zlib';
import {runSourceWorkerProcess} from '../src/source-worker-process.mjs';
import {createNativeMetadataWorker} from '../src/native-metadata-worker.mjs';
import {createNativePackagePreparationWorker} from '../src/native-package-preparation.mjs';
import {receiveSourceRegistryConsumers} from '../src/source-registry-closure.mjs';
import {produceRegistryRuntime} from '../src/produce-registry-runtime.mjs';
const bindingPath=process.env.NPM_PACKAGE_PREPARATION_TEST_BINDINGS,sha=b=>createHash('sha256').update(b).digest('hex');
const file=async path=>{const b=await readFile(path);return {path,bytes:b.length,sha256:sha(b)}};
const exists=async path=>{try{await lstat(path);return true}catch(e){if(e.code==='ENOENT')return false;throw e;}};
// Independent bounded fixture inventory; not a runtime observer/normalizer.
// Its complete framed digest must equal the original production observer.
async function fixtureTreeManifest(cwd){
 const root=join(cwd,'node_modules'),rows=[];let bytes=0;
 const stable=(a,b)=>['dev','ino','size','mtimeMs','ctimeMs','mode'].every(k=>a[k]===b[k]);
 async function visit(path,relative){
  assert.ok(rows.length<128);const before=await lstat(path),mode=before.mode&0o777;
  if(before.isSymbolicLink())rows.push(['link',relative,mode,await readlink(path),(await realpath(path)).slice(root.length+1)]);
  else if(before.isDirectory()){rows.push(['directory',relative,mode]);for(const name of(await readdir(path)).sort())await visit(join(path,name),relative?relative+'/'+name:name);}
  else{assert.equal(before.isFile(),true);assert.ok(before.size<=1048576);const body=await readFile(path);bytes+=body.length;assert.ok(bytes<=2097152);rows.push(['file',relative,mode,body.length,sha(body)]);}
  assert.equal(stable(before,await lstat(path)),true,'fixture inventory custody changed');
 }
 await visit(root,'');const workspacePath=join(root,'.pnpm-workspace-state-v1.json'),workspaceText=await readFile(workspacePath,'utf8');
 assert.ok(Buffer.byteLength(workspaceText)<8192);const row=rows.find(r=>r[1]==='.pnpm-workspace-state-v1.json');assert.equal(row[4],sha(workspaceText));
 return{rows,sha256:sha(rows.map(row=>JSON.stringify(row)+'\n').join('')),workspaceText};
}
let priorUnknown=false;
for(const scenario of ['initial-online','initial-offline-missing-store','registry-runtime','registry-peer-consumer','registry-resource-consumer','registry-projection-consumer'])test(scenario+': original unchanged-lock registry-consumer receiving',{skip:!bindingPath,timeout:1200000},async t=>{
 const transitive=['registry-runtime','registry-peer-consumer','registry-resource-consumer'].includes(scenario),peerConsumer=['registry-peer-consumer','registry-resource-consumer'].includes(scenario),resourceConsumer=scenario==='registry-resource-consumer',projectionConsumer=scenario==='registry-projection-consumer';
 assert.equal(priorUnknown,false,'prior unknown settlement stops dependent fixtures');
 const bindings=JSON.parse(await readFile(resolve(bindingPath))),root=await mkdtemp(join(tmpdir(),'npm-native-package-'+scenario+'-'));console.log('owned connected native qualification:',root);
 const space=await statfs(root);assert.ok(space.bavail*space.bsize>268435456);assert.ok(space.ffree>10000);
 for(const n of ['source','previous','allocation','full','raw','refresh','materialize','offline','home','config','transport','archive-source','archives'])await mkdir(join(root,n),{mode:0o700});
 await mkdir(join(root,'allocation/pnpm-metadata'),{mode:0o700});await mkdir(join(root,'allocation/pnpm-store'),{mode:0o700});
 let activeOperation;const ownOperation=async promise=>{activeOperation=promise;try{const result=await promise;if(result?.state==='unknown'||result?.processObservation?.invoked&&!result.processObservation.quiescent)priorUnknown=true;return result}catch(error){if(error.nativePackageEvidence?.state==='unknown'||error.nativeMetadataEvidence?.state==='unknown'||error.processObservation?.invoked&&!error.processObservation.quiescent||error.code==='BUILD_WORKER_CUSTODY_UNCERTAIN')priorUnknown=true;throw error}finally{activeOperation=null;}};
 // Qualification-only local CA, generated through the already-owned supervisor.
 // No production TLS settings, certificates or trust store are changed.
 const cert=join(root,'transport/ca.pem'),key=join(root,'transport/key.pem'),openssl=await realpath('/usr/bin/openssl');
 let certificateOperation;try{certificateOperation=await ownOperation(runSourceWorkerProcess(openssl,['req','-x509','-newkey','rsa:2048','-nodes','-keyout',key,'-out',cert,'-days','1','-subj','/CN=127.0.0.1','-addext','subjectAltName=IP:127.0.0.1'],{cwd:join(root,'transport'),env:{PATH:'/usr/bin:/bin'},timeout:10000,maxBuffer:65536,receiveProcess:true,signal:t.signal}));assert.equal(certificateOperation.processObservation.quiescent,true);}catch(error){await writeFile(join(root,'certificate-refused.json'),JSON.stringify({openssl:await file(openssl),processObservation:error.processObservation??certificateOperation?.processObservation??null,priorUnknown,failure:{name:error.name,code:error.code??null},stdout:error.stdout??'',stderr:error.stderr??''})+'\n',{flag:'wx'});throw error;}
 const name='connected-native-fixture',version='1.0.0',pkg=join(root,'archive-source/package');await mkdir(pkg);
 const packageManifest={name,version,...(transitive?{dependencies:{'connected-transitive-fixture':'1.0.0'}}:{}),type:'module',exports:'./index.mjs',bin:{'connected-native-fixture':'cli.mjs'},scripts:{install:'node -e "require(\'fs\').writeFileSync(\'lifecycle-ran\',\'not-admitted\')"'}};
 await writeFile(join(pkg,'package.json'),JSON.stringify(packageManifest)+'\n');await writeFile(join(pkg,'index.mjs'),transitive?'export {received} from "connected-transitive-fixture";\n':'export const received = "actual-native-installed";\n');await writeFile(join(pkg,'cli.mjs'),transitive?'#!/usr/bin/env node\nimport {received} from "connected-transitive-fixture"; console.log(received);\n':'#!/usr/bin/env node\nconsole.log("native bin fixture");\n');await chmod(join(pkg,'cli.mjs'),0o755);
 const archive=join(root,'archives/package.tgz');await createTar({gzip:true,file:archive,cwd:join(root,'archive-source'),portable:true,noMtime:true},['package']);if(projectionConsumer){
  // Independent qualification wire formation only. Original retained registry
  // archives are never rewritten. Keep a literal duplicate regular index plus
  // separately framed old-GNU and local-PAX files in this new fixture archive.
  const plain=gunzipSync(await readFile(archive));let at=0,duplicate;
  while(plain[at]!==0){const size=parseInt(plain.subarray(at+124,at+136).toString().replace(/\0.*$/u,''),8),end=at+512+Math.ceil(size/512)*512;if(plain.subarray(at,at+100).toString().replace(/\0.*$/u,'')==='package/index.mjs')duplicate=plain.subarray(at,end);at=end;}
  assert.ok(duplicate);
  const header=(name,body,type='0',gnu=false)=>{const h=Buffer.alloc(512);h.write(name);h.write('0000644\0',100);h.write('0000000\0',108);h.write('0000000\0',116);h.write(body.length.toString(8).padStart(11,'0')+'\0',124);h.write('00000000000\0',136);h.fill(32,148,156);h.write(type,156);h.write(gnu?'ustar  \0':'ustar\0'+'00',257);h.write([...h].reduce((a,b)=>a+b,0).toString(8).padStart(6,'0')+'\0 ',148);return Buffer.concat([h,body,Buffer.alloc((512-body.length%512)%512)]);};
  const record=(key,value)=>{const tail=' '+key+'='+value+'\n';let n=Buffer.byteLength(tail)+1;while(String(n).length+Buffer.byteLength(tail)!==n)n=String(n).length+Buffer.byteLength(tail);return n+tail;};
  const pax=Buffer.from(record('path','package/metadata.txt')+record('mtime','0'));
  await writeFile(archive,gzipSync(Buffer.concat([plain.subarray(0,at),duplicate,header('package/readme.txt',Buffer.from('GNU fixture\n'),'0',true),header('package/PaxHeader',pax,'x'),header('package/placeholder',Buffer.from('PAX fixture\n')),Buffer.alloc(1024)])));
 }const tar=await readFile(archive),integrity='sha512-'+createHash('sha512').update(tar).digest('base64');

 const published=[{name,version,manifest:packageManifest,path:archive,tar,integrity}];
 if(transitive){
  const childRoot=join(root,'transitive-archive'),childPackage=join(childRoot,'package');await mkdir(childPackage,{recursive:true});
  const childManifest={name:'connected-transitive-fixture',version:'1.0.0',type:'module',exports:'./index.mjs'};
  await writeFile(join(childPackage,'package.json'),JSON.stringify(childManifest)+'\n');await writeFile(join(childPackage,'index.mjs'),'export const received="actual-native-installed";\n');
  const childPath=join(root,'archives/transitive.tgz');await createTar({gzip:true,file:childPath,cwd:childRoot,portable:true,noMtime:true},['package']);const childTar=await readFile(childPath);
  published.push({name:childManifest.name,version:childManifest.version,manifest:childManifest,path:childPath,tar:childTar,integrity:'sha512-'+createHash('sha512').update(childTar).digest('base64')});
 }

 if(peerConsumer){
  const dir=join(root,'optional-peer-archive'),pkg=join(dir,'package');await mkdir(pkg,{recursive:true});
  const manifest={name:'connected-optional-peer-fixture',version:'1.0.0',type:'module',exports:'./index.mjs'};
  await writeFile(join(pkg,'package.json'),JSON.stringify(manifest)+'\n');await writeFile(join(pkg,'index.mjs'),'export const optionalPeer=true;\n');
  const path=join(root,'archives/optional-peer.tgz');await createTar({gzip:true,file:path,cwd:dir,portable:true,noMtime:true},['package']);const tar=await readFile(path);
  published.push({name:manifest.name,version:manifest.version,manifest,path,tar,integrity:'sha512-'+createHash('sha512').update(tar).digest('base64')});
 }

 const requests=[],sockets=new Set();let registry;
 function responseFor({method,url,accept}){
  const refused=(status,body)=>({status,body:Buffer.from(body),type:'text/plain',accepted:false,kind:'refusal'});
  if(method!=='GET')return refused(405,'fixture requires GET');
  for(const item of published){
   const {name,version,manifest,tar,integrity}=item;
   if(url===`/${name}`){
    if(typeof accept!=='string'||!/(?:application\/json|application\/vnd\.npm\.install-v1\+json)/u.test(accept))return refused(406,'unsupported fixture metadata representation');
    const selected={...manifest,dist:{tarball:`${registry}${name}/-/${name}-${version}.tgz`,integrity}};
    return {status:200,type:'application/json',accepted:true,kind:accept.includes('application/vnd.npm.install-v1+json')?'abbreviated':'full',body:Buffer.from(JSON.stringify({name,'dist-tags':{latest:version},versions:{[version]:selected},time:{[version]:'2020-01-01T00:00:00.000Z',modified:'2020-01-02T00:00:00.000Z'}}))};
   }
   if(url===`/${name}/-/${name}-${version}.tgz`)return {status:200,type:'application/octet-stream',accepted:true,kind:'archive',body:tar};
   if(url===`/-/npm/v1/attestations/${name}@${version}`)return {status:404,type:'application/json',accepted:true,kind:'attestation-absent',body:Buffer.from('{}')};
  }
  return refused(500,'unexpected fixture request');
 }
 const server=createServer({key:await readFile(key),cert:await readFile(cert)},(req,res)=>{
  const response=responseFor({method:req.method,url:req.url,accept:req.headers.accept});
  requests.push({method:req.method,url:req.url,accept:req.headers.accept??null,at:Date.now(),kind:response.kind,responseStatus:response.status,bytes:response.body.length,responseSHA256:sha(response.body),unexpected:!response.accepted});
  res.writeHead(response.status,{'content-type':response.type});res.end(response.body);
 });server.on('connection',s=>{sockets.add(s);s.on('close',()=>sockets.delete(s));});await new Promise(r=>server.listen(0,'127.0.0.1',r));registry=`https://127.0.0.1:${server.address().port}/`;
 t.after(async()=>{if(activeOperation)await activeOperation.catch(()=>{});for(const s of sockets)s.destroy();await new Promise(r=>server.close(r));});
 // The same pure selector serving native requests is qualified before invocation.
 for(const item of published){
 const {name,version,manifest:packageManifest,tar,integrity}=item;
 for(const accept of ['application/json; q=1.0, */*','application/vnd.npm.install-v1+json; q=1.0, application/json; q=0.8, */*']){
  const r=responseFor({method:'GET',url:`/${name}`,accept}),body=JSON.parse(r.body);
  assert.equal(r.status,200);assert.equal(r.accepted,true);assert.deepEqual(body.versions[version],{...packageManifest,dist:{tarball:`${registry}${name}/-/${name}-${version}.tgz`,integrity}});assert.equal(body.time[version],'2020-01-01T00:00:00.000Z');
 }
 const archiveResponse=responseFor({method:'GET',url:`/${name}/-/${name}-${version}.tgz`});assert.deepEqual(archiveResponse.body,tar);assert.equal('sha512-'+createHash('sha512').update(archiveResponse.body).digest('base64'),integrity);
 assert.equal(responseFor({method:'GET',url:`/-/npm/v1/attestations/${name}@${version}`}).status,404);
 for(const url of [`/${name}`,`/${name}/-/${name}-${version}.tgz`,`/-/npm/v1/attestations/${name}@${version}`])assert.equal(responseFor({method:'POST',url,accept:'application/json'}).status,405);
 assert.equal(responseFor({method:'GET',url:'/unknown',accept:'application/json'}).accepted,false);
 assert.equal(responseFor({method:'GET',url:`/${name}`,accept:'text/html'}).status,406);

 }

 const cwd=join(root,'source'),cacheRoot=join(root,'allocation');
 const manifest={name:'unchanged-registry-consumer',version:'1.0.0',type:'module',dependencies:{[name]:version}};
 if(scenario==='registry-runtime'){
  manifest.files=['index.mjs','release'];manifest.exports={'.':'./index.mjs','./frozen-lockfile':'./release/pnpm-lock.yaml'};
  manifest.registryConsumption={frozenLockfile:'./release/pnpm-lock.yaml',nodeEntrances:['./index.mjs']};
  await writeFile(join(cwd,'index.mjs'),'export {received} from "connected-native-fixture";\n');
 }
 if(peerConsumer){manifest.devDependencies={'connected-transitive-fixture':'1.0.0','connected-optional-peer-fixture':'1.0.0'};manifest.peerDependencies={...manifest.devDependencies};manifest.peerDependenciesMeta={'connected-optional-peer-fixture':{optional:true}};}
 const environment={PATH:dirname(bindings.nativeProgram)+':/usr/bin:/bin',HOME:join(root,'home'),XDG_CONFIG_HOME:join(root,'config'),NODE_EXTRA_CA_CERTS:cert,TMPDIR:root,TEMP:root,TMP:root,npm_config_userconfig:join(root,'home/npmrc'),npm_config_globalconfig:join(root,'home/global-npmrc'),npm_config_ignore_scripts:'true',npm_config_update_notifier:'false',npm_config_audit:'false',npm_config_fund:'false'};
 await writeFile(environment.npm_config_userconfig,'');await writeFile(environment.npm_config_globalconfig,'');
 const environmentPolicy={stable:Object.fromEntries(Object.entries(environment).filter(([k])=>['PATH','HOME','XDG_CONFIG_HOME','NODE_EXTRA_CA_CERTS'].includes(k)).map(([k,v])=>[k,sha(v)])),relays:{}};
 const originalManifest={...manifest};delete originalManifest.dependencies;
 const delta=await import(pathToFileURL(bindings.pnpmLockDeltaModule)),yaml=await import(pathToFileURL(bindings.yamlModule));
 let lock,lockGeneration=null;
 if(transitive){
  // Generate the complete transitive lock with the genuine native producer.
  // This independent fixture-generation operation is not a preparation ticket.
  await createNativePackagePreparationWorker({bindings});
  const generation=join(root,'lock-generation');await mkdir(generation,{mode:0o700});
  const generationSource=join(generation,'source');await mkdir(generationSource,{mode:0o700});
  await writeFile(join(generationSource,'package.json'),JSON.stringify(manifest)+'\n');await writeFile(join(generationSource,'.npmrc'),`registry=${registry}\n`);
  const arguments_=[bindings.nativeEntry,'install','--lockfile-only','--ignore-scripts','--registry',registry,'--cache-dir',join(generation,'cache'),'--store-dir',join(generation,'store'),'--config.prefer-offline=false','--config.update-notifier=false','--reporter=ndjson'];
  const intent={scope:'native transitive fixture lock production only',program:bindings.nativeProgram,arguments:arguments_,cwd:generationSource,manifest:await file(join(generationSource,'package.json')),archives:await Promise.all(published.map(p=>file(p.path)))};
  const inputPath=join(generation,'intent.json');await writeFile(inputPath,JSON.stringify(intent)+'\n',{flag:'wx'});
  let terminal;try{terminal=await ownOperation(runSourceWorkerProcess(bindings.nativeProgram,arguments_,{cwd:generationSource,env:environment,timeout:60000,maxBuffer:4194304,receiveProcess:true,signal:t.signal,evidence:{directory:join(generation,'worker-evidence'),input:await file(inputPath)}}));}
  catch(error){await writeFile(join(generation,'refused.json'),JSON.stringify({message:error.message,processObservation:error.processObservation??null,stdout:error.stdout??'',stderr:error.stderr??''})+'\n',{flag:'wx'});throw error;}
  assert.equal(terminal.processObservation.status,0);assert.equal(terminal.processObservation.quiescent,true);
  lock=await readFile(join(generationSource,'pnpm-lock.yaml'),'utf8');
  const lockRecord=yaml.parse(lock),profile=delta.inspectNativeRegistryLockProfile({lock:lockRecord,manifest,...(peerConsumer?{profile:'unchanged-registry-consumer'}:{})});assert.equal(profile.accepted,true,JSON.stringify(profile));
  assert.equal(Object.keys(lockRecord.packages).length,peerConsumer?3:2);assert.equal(lockRecord.snapshots[name+'@'+version].dependencies['connected-transitive-fixture'],'1.0.0');
  lockGeneration={intent,terminal,lock:await file(join(generationSource,'pnpm-lock.yaml')),profile,predecessorTicketClaimed:false};await writeFile(join(generation,'received.json'),JSON.stringify(lockGeneration)+'\n',{flag:'wx'});
  await writeFile(join(root,'fixture-formation.json'),JSON.stringify({scope:'actual native transitive lock generation; separate fresh frozen receiving follows',lockGeneration,protocolPreflight:true,archives:published.map(({name,version,integrity,manifest})=>({name,version,integrity,manifest}))},null,2)+'\n');
 }else{
 const beforeLock={lockfileVersion:'9.0',settings:{autoInstallPeers:true,excludeLinksFromLockfile:false},importers:{'.':{}}};
 const lockRecord={...beforeLock,importers:{'.':{dependencies:{[name]:{specifier:version,version}}}},packages:{[name+'@'+version]:{resolution:{integrity},hasBin:true}},snapshots:{[name+'@'+version]:{}}};
 // Fixture formation only: the original owner derives the complete expected
 // addition from the actual archive manifest and compares every lock field.
 // This semantic proof is not a native refresh or a runtime predecessor ticket.

 const formed=delta.compareNativeRootDependencyLockDelta({beforeLock,afterLock:lockRecord,beforeManifest:originalManifest,afterManifest:manifest,change:{kind:'add',name,next:{manifest:packageManifest,integrity}}});
 assert.equal(formed.accepted,true,JSON.stringify(formed));
 const missingBin=structuredClone(lockRecord);delete missingBin.packages[name+'@'+version].hasBin;
 const malformed=delta.compareNativeRootDependencyLockDelta({beforeLock,afterLock:missingBin,beforeManifest:originalManifest,afterManifest:manifest,change:{kind:'add',name,next:{manifest:packageManifest,integrity}}});
 assert.equal(malformed.accepted,false);assert.ok(malformed.mismatchPaths.some(p=>p.at(-1)==='hasBin')); 
 lock=yaml.stringify(lockRecord);
 await writeFile(join(root,'fixture-formation.json'),JSON.stringify({scope:'semantic fixture formation, not native refresh',archiveManifest:packageManifest,archiveManifestIdentity:await file(join(pkg,'package.json')),lockRecord,comparison:formed,originalMissingBinRefused:malformed,protocol:{metadata:{path:`/${name}`,abbreviatedAndFull:true,status:200},archive:{path:`/${name}/-/${name}-${version}.tgz`,status:200,integrity},attestation:{path:`/-/npm/v1/attestations/${name}@${version}`,status:404,meaning:'no fixture attestation; native may consult authored publication time'},methods:{allowed:['GET'],otherStatus:405},unsupportedMetadataAccept:406,preflightPassed:true,other:{status:500,accepted:false}}},null,2)+'\n');
 }
 const texts=[JSON.stringify(manifest)+'\n',lock,...(projectionConsumer?['sideEffectsCache: false\n']:[]),`registry=${registry}\n`],canonicalFiles=[];
 for(const[i,n]of ['package.json','pnpm-lock.yaml',...(projectionConsumer?['pnpm-workspace.yaml']:[]),'.npmrc'].entries()){const path=join(cwd,n);await writeFile(path,texts[i]);canonicalFiles.push(await file(path));}
 const worker=await createNativePackagePreparationWorker({bindings}),limits={members:100,bytes:1048576,archiveBytes:1048576,tarBytes:2097152,metadataBytes:1048576,sourcePaths:1000,sourceRepositories:4};
 const input={attemptDirectory:join(root,'materialize'),cwd,cacheRoot,registry,sourceHead:'a'.repeat(40),environment,environmentPolicy,canonicalFiles,content:published.map(({name,version,path,integrity})=>({name,version,archive:{path,integrity},limits})),selectedArtifacts:[name+'@'+version]};
 if(resourceConsumer||projectionConsumer)input.resourceProfile='observed-headroom-v1';
 if(projectionConsumer){input.registryProjectionPolicy='registry-projection-consumer-v2';input.selectedArtifactInstances=[{artifact:name+'@'+version,specifier:name,importer:join(cwd,'package.json'),resolved:join(cwd,'node_modules',name,'index.mjs'),binDirectory:join(cwd,'node_modules/.bin'),lockImporter:'.'}];}
 if(projectionConsumer){input.sourceDirectory=join(root,'previous');for(const f of canonicalFiles)await writeFile(join(input.sourceDirectory,f.path.split('/').at(-1)),await readFile(f.path));} 
 const outcomes={root,scenario,sourceRole:'explicit-synthetic-unchanged-lock-local-HTTPS-qualification',sourceHeadIsSyntheticFixtureLineage:true,requests,lockGeneration,archive:await file(archive),certificateOperation:certificateOperation.processObservation};
 try{
  if(resourceConsumer){
   await assert.rejects(worker.receiveFrozenOnline({...input,resourceProfile:'automatic'}),/resource profile/);
   const overlapping=join(cwd,'bad-attempt');await mkdir(overlapping,{mode:0o700});await assert.rejects(worker.qualifyFrozenContent({...input,attemptDirectory:overlapping}),/overlaps/);assert.equal(await exists(join(overlapping,'content-receiving')),false);
   const attemptDirectory=join(root,'content-only');await mkdir(attemptDirectory,{mode:0o700});
   const partial=await worker.qualifyFrozenContent({...input,attemptDirectory,content:input.content.slice(0,1)});
   assert.equal(partial.nativeInvoked,false);assert.equal(partial.effectTicketIssued,false);assert.equal(partial.coverage.complete,false);assert.equal(partial.coverage.lowerBound,true);assert.equal(partial.coverage.missing.length,2);assert.equal(partial.coverage.acceptedForNative,false);assert.equal(await exists(join(cwd,'node_modules')),false);outcomes.partialContent=partial;
   await assert.rejects(worker.qualifyFrozenContent({...input,attemptDirectory,content:input.content.slice(0,1)}),{code:'EEXIST'});
   const staleSource=join(root,'stale-source');await mkdir(staleSource,{mode:0o700});const staleFiles=[];
   for(const f of canonicalFiles){const path=join(staleSource,f.path.split('/').at(-1));await writeFile(path,await readFile(f.path));if(path.endsWith('/package.json')){const changed=JSON.parse(await readFile(path));changed.dependencies[name]='2.0.0';await writeFile(path,JSON.stringify(changed)+'\n');}staleFiles.push(await file(path));}
   const staleAttempt=join(root,'stale-content');await mkdir(staleAttempt,{mode:0o700});const staleInput={...input,cwd:staleSource,canonicalFiles:staleFiles,attemptDirectory:staleAttempt,selectedArtifacts:[name+'@2.0.0']};
   const staleRead=await worker.qualifyFrozenContent(staleInput);assert.equal(staleRead.resourceStageAccepted,true);assert.equal(staleRead.nativeEligible,false);assert.equal(staleRead.coverage.sourceSelectionCompatible,false);assert.equal(staleRead.coverage.selectedOutsideLock[0].reference,name+'@2.0.0');assert.equal(staleRead.coverage.complete,true);outcomes.sourceMismatch=staleRead.coverage;
   const badAttempt=join(root,'wrong-version-attempt');await mkdir(badAttempt,{mode:0o700});await assert.rejects(worker.qualifyFrozenContent({...staleInput,attemptDirectory:badAttempt,selectedArtifacts:[name+'@3.0.0']}),/subset/);assert.equal(await exists(join(badAttempt,'content-receiving')),false);await assert.rejects(worker.qualifyFrozenContent({...staleInput,attemptDirectory:badAttempt,selectedArtifacts:[name+'@2.0.0',name+'@2.0.0']}),/subset/);assert.equal(await exists(join(badAttempt,'content-receiving')),false);
   const staleNativeAttempt=join(root,'stale-native');await mkdir(staleNativeAttempt,{mode:0o700});await assert.rejects(worker.receiveFrozenOnline({...staleInput,attemptDirectory:staleNativeAttempt}),/subset/);assert.equal(await exists(join(staleNativeAttempt,'content-receiving')),false);assert.equal(await exists(join(staleNativeAttempt,'receipts')),false);

  }
  if(scenario==='initial-offline-missing-store'){
   let caught;try{await ownOperation(worker.receiveFrozenOffline(input,{signal:t.signal}));}catch(e){caught=e;}
   assert.ok(caught,'empty store must not materialize');assert.ok(await exists(join(root,'materialize/receipts/native.json')),caught.message);const raw=JSON.parse(await readFile(join(root,'materialize/receipts/native.json'))),outer=JSON.parse(await readFile(join(root,'materialize/outer-result.json')));
   assert.notEqual(raw.result.status,0);assert.match(raw.result.stdout+raw.result.stderr,/ERR_PNPM_NO_OFFLINE_TARBALL|ERR_PNPM_NO_OFFLINE_META/);assert.equal(outer.processObservation.quiescent,true);assert.equal(requests.length,0);outcomes.negative={nativeStatus:raw.result.status,quiescent:true,requests:0,installationReceived:false};
  }else if(scenario==='registry-runtime'){
   await mkdir(join(cwd,'node_modules'));await writeFile(join(cwd,'node_modules/prior'),'preserved original installation');
   const {cwd:ignoredCwd,canonicalFiles:ignoredCanonical,...request}=input;
   const nativeInitialFrozen={...request,bindings,mode:'online'};
   const received=await ownOperation(receiveSourceRegistryConsumers({consumerPaths:[cwd],releases:[],logDirectory:join(root,'receiving'),nativeInitialFrozen,readMemoryPressure:async()=>0}));
   assert.deepEqual(received.refusals,[]);assert.equal(received.packages.length,1);assert.equal(received.receivingProfile,'native-initial-frozen');outcomes.received=received;
   assert.equal(await readFile(join(received.packages[0].previousInstallation,'prior'),'utf8'),'preserved original installation');
   const stage=received.packages[0].nativeInitialFrozen.retainedStaging;
   assert.equal(await readFile(join(stage,'pnpm-lock.yaml'),'utf8'),lock);assert.equal(await exists(join(stage,'node_modules')),false);
   const produce=(suffix,receipt=received,transferInstallation=false)=>produceRegistryRuntime({consumerPath:cwd,receiving:receipt,destination:join(root,suffix),receivingProfile:'native-initial-frozen',transferInstallation});
   await assert.rejects(produce('copied',structuredClone(received)),/original unchanged in-process/);assert.equal(await exists(join(root,'copied')),false);
   const copiedWithoutMarker=structuredClone(received);delete copiedWithoutMarker.receivingProfile;await assert.rejects(produce('copied-without-marker',copiedWithoutMarker),/original unchanged in-process/);
   delete received.receivingProfile;await assert.rejects(produceRegistryRuntime({consumerPath:cwd,receiving:received,destination:join(root,'genuine-marker-deleted')}),/original unchanged in-process/);received.receivingProfile='native-initial-frozen';

   const packageRoot=await realpath(join(cwd,'node_modules',name)),bodyPath=join(packageRoot,'index.mjs'),body=await readFile(bodyPath);
   await writeFile(bodyPath,'export const received="mutated";\n');await assert.rejects(produce('body-tampered'));assert.equal(await exists(join(root,'body-tampered')),false);await writeFile(bodyPath,body);
   const shim=join(cwd,'node_modules/.bin',name),shimBody=await readFile(shim),shimMode=(await lstat(shim)).mode&0o777;
   outcomes.shim={absoluteTargetMetadata:/^# cmd-shim-target=\//mu.test(shimBody.toString()),referencesOriginalStage:shimBody.toString().includes(stage),bodySHA256:sha(shimBody),claim:'literal original metadata retained, not rewritten for relocation'};
   await writeFile(shim,Buffer.concat([shimBody,Buffer.from('\necho tampered-body\n')]));await assert.rejects(produce('shim-tampered'),/whole native installation|registration changed/);assert.equal(await exists(join(root,'shim-tampered')),false);await writeFile(shim,shimBody);await chmod(shim,shimMode);
   for(const f of canonicalFiles){const original=await readFile(f.path);await writeFile(f.path,Buffer.concat([original,Buffer.from(' ')]));await assert.rejects(produce('canonical-tampered'));assert.equal(await exists(join(root,'canonical-tampered')),false);await writeFile(f.path,original);}
   const originalLink=join(cwd,'node_modules',name),savedLink=join(cwd,'node_modules',name+'-saved');await rename(originalLink,savedLink);await symlink(pkg,originalLink,'dir');await assert.rejects(produce('redirected'));await unlink(originalLink);await rename(savedLink,originalLink);
   await mkdir(join(root,'occupied'));await writeFile(join(root,'occupied/keep'),'existing product');await assert.rejects(produce('occupied'),{code:'EEXIST'});assert.equal(await readFile(join(root,'occupied/keep'),'utf8'),'existing product');
   const copied=await produce('portable-copy');assert.equal(copied.installedArtifactReceiving.originalArtifactComparisons[0].ok,true);assert.equal(copied.installedArtifactReceiving.freshInstallationClaimed,false);
   assert.equal((await import(pathToFileURL(join(root,'portable-copy/index.mjs')))).received,'actual-native-installed');
   assert.equal(await readFile(join(root,'portable-copy/release/pnpm-lock.yaml'),'utf8'),lock);assert.equal(await exists(join(root,'portable-copy/.npmrc')),false);
   // A source-only escape refuses before transfer; the original producer's
   // separate fault-injected unit case receives post-transfer rollback.
   await symlink(pkg,join(cwd,'node_modules/outside'),'dir');await assert.rejects(produce('transfer-refused',received,true),/link leaves/);assert.equal(await exists(join(cwd,'node_modules')),true);assert.equal(await exists(join(root,'transfer-refused')),false);await unlink(join(cwd,'node_modules/outside'));
   const transferred=await produce('portable-transfer',received,true);assert.equal(transferred.installationTransferred,true);assert.equal(transferred.installedArtifactReceiving.originalArtifactComparisons[0].ok,true);assert.equal(await exists(join(cwd,'node_modules')),false);
   assert.equal((await import(pathToFileURL(join(root,'portable-transfer/index.mjs')))).received,'actual-native-installed');
   const bin=join(root,'portable-transfer/node_modules/.bin',name);
   const binTerminal=await ownOperation(runSourceWorkerProcess(bin,[],{cwd:join(root,'portable-transfer'),env:environment,timeout:10000,maxBuffer:65536,receiveProcess:true,signal:t.signal}));
   assert.equal(binTerminal.processObservation.status,0);assert.equal(binTerminal.processObservation.quiescent,true);assert.equal(binTerminal.stdout.trim(),'actual-native-installed');
   outcomes.relocatedBin={path:bin,stdout:binTerminal.stdout,processObservation:binTerminal.processObservation,originalInstallationAbsent:true};
   await assert.rejects(produce('stale-after-transfer'));assert.equal(await exists(join(root,'stale-after-transfer')),false);
   outcomes.portable={copied,transferred,consumerImport:'actual-native-installed',copiedReceiptRefused:true,memberMutationRefused:true,shimMutationRefused:true,canonicalMutationRefused:true,redirectedLinkRefused:true,occupiedDestinationPreserved:true,transferPreflightConfinementRefused:true,staleAfterTransferRefused:true};
  }else{
   const received=await ownOperation(worker.receiveFrozenOnline(input,{signal:t.signal}));outcomes.received=received;
   assert.equal(received.lockRefreshed,false);assert.equal(received.execution.policyVerification,'fresh-native');assert.equal(received.execution.kind,'pnpm.publisher-online-installation.v1');assert.equal(received.comparisons[0].ok,true);
   const packageRoot=await realpath(join(cwd,'node_modules',name));assert.equal(await exists(join(packageRoot,'lifecycle-ran')),false);
   const imported=await import(pathToFileURL(join(packageRoot,'index.mjs')));assert.equal(imported.received,'actual-native-installed');outcomes.consumerImport={received:imported.received,lifecycleMarkerAbsent:true};
   if(projectionConsumer){
    assert.equal(received.registryProjection.observedRoute,null);assert.equal(received.registryProjection.routeEvidence,'source-qualified-closed-set');assert.equal(received.registryProjection.storeBefore.exists,false);assert.equal(received.registryProjection.storeAfter.exists,true);
    const comparison=received.comparisons[0];assert.equal(comparison.kind,'npm.native-installed-registry-projection-receiving');assert.equal(comparison.sourceArchive.occurrences.filter(o=>o.projectedPath==='index.mjs').length,2);assert.equal(comparison.sourceArchive.extensions.length,1);assert.ok(comparison.sourceArchive.occurrences.some(o=>o.layout==='old-gnu-zero-suffix'));
    assert.equal(comparison.selectedInstance.provider.version,version);assert.equal(comparison.selectedInstance.importer.path,join(cwd,'package.json'));
    const inventory=received.artifactInventory[0],rawReceipt=JSON.parse(await readFile(inventory.receipt.path));assert.equal(inventory.headerCount,rawReceipt.sourceArchive.occurrences.length+rawReceipt.sourceArchive.extensions.length);assert.equal(rawReceipt.projection.projectionSHA256,comparison.projection.projectionSHA256);
    await assert.rejects(worker.revalidateFrozenInstallation(structuredClone(received),{installationRoot:cwd}),/original unchanged/);
    const reobserved=await worker.revalidateFrozenInstallation(received,{installationRoot:cwd});assert.equal(reobserved.freshInstallationClaimed,false);
    outcomes.resourceProfile='observed-headroom-v1';outcomes.projection={rawOccurrences:comparison.sourceArchive.occurrences.length,extensions:comparison.sourceArchive.extensions.length,uniqueTargets:comparison.projection.members.length,nativeFreshReceiving:true,observedRoute:null,routineReuseClaimed:false};
    // A new original same-consumer routine transition, not another initial
    // request, cross-path equivalence claim or replay of a refused operation.
    const routineAttempt=join(root,'routine-attempt');await mkdir(routineAttempt,{mode:0o700});
    await assert.rejects(worker.verifyFrozenOffline(structuredClone(received),{attemptDirectory:routineAttempt}),/original unused/);
    assert.equal(await exists(join(routineAttempt,'input.json')),false);
    const beforeTree=await fixtureTreeManifest(cwd);assert.equal(beforeTree.sha256,received.installedTree.sha256);
    await writeFile(join(root,'routine-before-tree.json'),JSON.stringify(beforeTree,null,2)+'\n',{flag:'wx'});
    const requestStart=requests.length,routinePromise=ownOperation(worker.verifyFrozenOffline(received,{attemptDirectory:routineAttempt},{signal:t.signal}));
    await assert.rejects(worker.verifyFrozenOffline(received,{attemptDirectory:routineAttempt},{signal:t.signal}),/original unused/);
    const routineReceived=await routinePromise;
    outcomes.routine={nativeReceivingReturned:true,received:routineReceived,accepted:false,acceptanceChecksCompleted:false};
    assert.equal(routineReceived.execution.policyVerification,'cached-native');assert.equal(routineReceived.execution.freshPolicyRecomputationReceived,false);assert.equal(routineReceived.cleanInstallationClaimed,false);
    assert.equal(routineReceived.operation.accepted,true);assert.equal(routineReceived.operation.processObservation.quiescent,true);assert.equal(priorUnknown,false);
    assert.equal(routineReceived.registryProjection.storeBefore.exists,true);assert.deepEqual(routineReceived.registryProjection.storeBefore,routineReceived.registryProjection.storeAfter);assert.equal(routineReceived.registryProjection.observedRoute,null);assert.equal(routineReceived.comparisons[0].ok,true);
    for(const f of canonicalFiles)assert.deepEqual(await file(f.path),f);
    const afterTree=await fixtureTreeManifest(cwd);assert.equal(afterTree.sha256,routineReceived.installedTree.sha256);
    await writeFile(join(root,'routine-after-tree.json'),JSON.stringify(afterTree,null,2)+'\n',{flag:'wx'});
    const workspacePath='.pnpm-workspace-state-v1.json',beforeState=JSON.parse(beforeTree.workspaceText),afterState=JSON.parse(afterTree.workspaceText);
    assert.deepEqual(afterTree.rows.filter(row=>row[1]!==workspacePath),beforeTree.rows.filter(row=>row[1]!==workspacePath));
    const beforeRow=beforeTree.rows.find(row=>row[1]===workspacePath),afterRow=afterTree.rows.find(row=>row[1]===workspacePath);assert.deepEqual(afterRow.slice(0,3),beforeRow.slice(0,3));
    const firstInterval=received.operation.retainedExecutorReceipts.find(row=>row.phase==='native').interval,routineInterval=routineReceived.operation.retainedExecutorReceipts.find(row=>row.phase==='native').interval;
    for(const[state,interval]of [[beforeState,firstInterval],[afterState,routineInterval]]){assert.ok(Number.isSafeInteger(state.lastValidatedTimestamp));assert.ok(state.lastValidatedTimestamp>=interval.startedAt&&state.lastValidatedTimestamp<=interval.endedAt);}
    // PNPM11.28.5 createWorkspaceState238942/updateWorkspaceState238962 owns
    // this exact Date.now field and JSON serialization, not npm normalization.
    assert.equal(afterTree.workspaceText,JSON.stringify({...beforeState,lastValidatedTimestamp:afterState.lastValidatedTimestamp},null,2)+'\n');
    const metadataTransition={owner:'pnpm@11.28.5',distributionSHA256:'e3738fda08262f74611d7a1ffc11b3e87fa52b466c07eb73211d179ebcb98810',sourceLines:[238942,238978],path:workspacePath,before:beforeState.lastValidatedTimestamp,after:afterState.lastValidatedTimestamp,firstInterval,routineInterval,allOtherRowsUnchanged:true,beforeTreeSHA256:beforeTree.sha256,afterTreeSHA256:afterTree.sha256,wholeTreeIdentityPreserved:beforeTree.sha256===afterTree.sha256};
    outcomes.routine.metadataTransition=metadataTransition;

    const routinePackage=await realpath(join(cwd,'node_modules',name));assert.equal((await import(pathToFileURL(join(routinePackage,'index.mjs')))).received,'actual-native-installed');assert.equal(await exists(join(routinePackage,'lifecycle-ran')),false);
    await assert.rejects(worker.verifyFrozenOffline(received,{attemptDirectory:routineAttempt}),/original unused/);
    await assert.rejects(worker.verifyFrozenOffline(structuredClone(routineReceived),{attemptDirectory:routineAttempt}),/original unused/);
    await assert.rejects(worker.revalidateFrozenInstallation(received,{installationRoot:cwd}),/original unchanged/);
    assert.equal((await worker.revalidateFrozenInstallation(routineReceived,{installationRoot:cwd})).freshInstallationClaimed,false);
    const originalSourceManifest=join(input.sourceDirectory,'package.json'),savedSource=await readFile(originalSourceManifest);await writeFile(originalSourceManifest,Buffer.concat([savedSource,Buffer.from(' ')]));
    await assert.rejects(worker.revalidateFrozenInstallation(routineReceived,{installationRoot:cwd}),/custody|changed/);await writeFile(originalSourceManifest,savedSource);
    assert.equal(requests.length,requestStart,'offline routine must not make registry requests');
    outcomes.routine={accepted:true,acceptanceChecksCompleted:true,metadataTransition,received:routineReceived,consumerImport:'actual-native-installed',lifecycleMarkerAbsent:true,firstInstallationPreserved:true,preservationScope:'all payload,bin,topology and other rows unchanged; exact native workspace timestamp transition retained',requests:requests.slice(requestStart),inferenceCalls:0,inferenceClaimScope:'fixed owner workflow source contains no inference port; actual native package job only',observedRoute:null,clonedPredecessorRefused:true,concurrentDuplicateRefused:true,consumedPredecessorRefused:true,clonedSuccessorRefused:true,sourceDirectoryDriftRefused:true};outcomes.projection.routineReceivingSucceeded=true;

   }

   if(peerConsumer){assert.equal(received.preflight.profile,'unchanged-registry-consumer');assert.equal((await import(pathToFileURL(join(await realpath(join(cwd,'node_modules/connected-optional-peer-fixture')),'index.mjs')))).optionalPeer,true);outcomes.peerRoles={requiredAndOptionalPeersPresent:true,exactPeerDevelopmentRoles:true,portableProductClaimed:false};if(resourceConsumer){assert.equal(received.capacityObservation.profile,'observed-headroom-v1');assert.equal(received.operation.resourceObservation.contentCapacityObservation.profile,'observed-headroom-v1');assert.ok(received.artifactInventory.every(r=>r.receipt&&r.headerCount&&!r.headers));outcomes.resourceProfile='observed-headroom-v1';}}
   assert.ok(requests.some(r=>r.url===`/${name}/-/${name}-${version}.tgz`));assert.ok(requests.every(r=>!r.unexpected));
  }
  for(const f of canonicalFiles)assert.deepEqual(await file(f.path),f);assert.equal(await exists(join(cwd,'pnpm-workspace.yaml')),projectionConsumer);outcomes.canonicalUnchanged=true;outcomes.accepted=true;
 }catch(error){outcomes.accepted=false;outcomes.failure={name:error.name,message:error.message,nativePackageEvidence:error.nativePackageEvidence??null,nativeOnlineEvidence:error.nativeOnlineEvidence??null,nativeOfflineEvidence:error.nativeOfflineEvidence??null};throw error;}
 finally{await writeFile(join(root,'qualification.json'),JSON.stringify(outcomes,null,2)+'\n');}
});
