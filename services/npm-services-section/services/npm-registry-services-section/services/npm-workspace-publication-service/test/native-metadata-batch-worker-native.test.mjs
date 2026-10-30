import test from'node:test';import assert from'node:assert/strict';import{mkdtemp,mkdir,writeFile,readFile,stat,unlink}from'node:fs/promises';import{join,resolve}from'node:path';import{tmpdir}from'node:os';import{createHash}from'node:crypto';import{createServer}from'node:http';
import{createNativeMetadataWorker}from'../src/native-metadata-worker.mjs';
const path=process.env.NPM_METADATA_WORKER_TEST_BINDINGS,sha=b=>createHash('sha256').update(b).digest('hex');
const bindings=path?JSON.parse(await readFile(resolve(path))):null,service=bindings?await createNativeMetadataWorker({bindings}):null;
let priorUnknown=false;
const run=async input=>{let result;try{result=await service.run(input);}catch(error){if(error.nativeMetadataEvidence?.state==='unknown')priorUnknown=true;throw error;}if(result.state==='unknown')priorUnknown=true;return result;};
const root=path?await mkdtemp(join(tmpdir(),'npm-native-metadata-batch-')):null;console.log('owned batch fixture evidence:',root);
for(const scenario of ['success','partial-http-failure','missing-produced-mirror','changed-before-reader','reuse-cache','outer-timeout'])test('original supervised native metadata batch: '+scenario,{skip:!path,timeout:240000},async t=>{
 assert.equal(priorUnknown,false,'prior unknown settlement stops all later fixture effects');
 const at=join(root,scenario);await mkdir(at,{mode:0o700});for(const n of ['source','attempt','attempt-two','cache','home','config'])await mkdir(join(at,n),{mode:0o700});
 const requests=[],sockets=new Set();let active=0,maximumActive=0;
 const server=createServer((req,res)=>{requests.push(req.url);active++;maximumActive=Math.max(maximumActive,active);let settled=false;res.on('close',()=>{if(!settled){settled=true;active--;}});
  if(!/^\/batch-fixture-[a-e]$/u.test(req.url)){res.writeHead(500).end();return;}
  const name=req.url.slice(1);const done=()=>{if(res.destroyed)return;if(scenario==='partial-http-failure'&&name==='batch-fixture-b'){res.writeHead(500).end('fixture refusal');return;}
   const v=version=>({name,version,dist:{integrity:'sha512-'+Buffer.alloc(64,1).toString('base64'),tarball:`http://127.0.0.1:${server.address().port}/must-not-fetch.tgz`}});
   res.setHeader('content-type','application/json');res.end(JSON.stringify({name,'dist-tags':{latest:'2.0.0'},versions:{'1.0.0':v('1.0.0'),'1.1.0':v('1.1.0'),'2.0.0':v('2.0.0')},time:{'1.0.0':'2020-01-01T00:00:00.000Z','1.1.0':'2020-01-01T00:00:00.000Z','2.0.0':'2020-01-01T00:00:00.000Z'}}));};
  if(scenario==='outer-timeout')return;setTimeout(done,scenario==='partial-http-failure'?(name==='batch-fixture-a'?100:name==='batch-fixture-b'?350:1500):100);
 });server.on('connection',s=>{sockets.add(s);s.on('close',()=>sockets.delete(s));});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(async()=>{for(const s of sockets)s.destroy();await new Promise(r=>server.close(r));});
 const registry=`http://127.0.0.1:${server.address().port}/`,names=['batch-fixture-a','batch-fixture-b','batch-fixture-c'];
 const selections=['a','b','c','d','e'].map(x=>({name:'batch-fixture-'+x,version:'1.0.0',registry,integrity:'sha512-'+Buffer.alloc(64,1).toString('base64')}));selections.splice(1,0,{...selections[0],version:'1.1.0'});
 const texts=['{}','original-lock','packages: []\nminimumReleaseAge: 1440\nminimumReleaseAgeStrict: true\n',`registry=${registry}\n`],canonicalFiles=[];for(const [index,text]of texts.entries()){const p=join(at,'source',String(index));await writeFile(p,text);canonicalFiles.push({path:p,bytes:Buffer.byteLength(text),sha256:sha(text)});}
 const keys=['manifestSHA256','lockSHA256','workspaceSHA256','registryConfigurationSHA256'],environment={PATH:process.env.PATH,HOME:join(at,'home'),XDG_CONFIG_HOME:join(at,'config')};
 const input={attemptDirectory:join(at,'attempt'),canonicalFiles,policyContext:'source-owned-qualification-proposal',timeoutMilliseconds:scenario==='outer-timeout'?12000:140000,environment,environmentPolicy:{stable:Object.fromEntries(Object.entries(environment).map(([k,v])=>[k,sha(v)])),relays:{}},query:{names,selections,policy:{minimumReleaseAge:1440,minimumReleaseAgeStrict:true},canonical:{sourceHead:'a'.repeat(40),...Object.fromEntries(keys.map((k,i)=>[k,canonicalFiles[i].sha256])),selectionSHA256:sha(JSON.stringify(selections))},registry,directory:join(at,'attempt/query'),cacheDirectory:join(at,'cache')}};
 let changed=false,watch,watchFailure,checking=false,watchTask=Promise.resolve();const chosen=join(at,'cache/v12/metadata-full',`http%3A+127.0.0.1+${server.address().port}`,'batch-fixture-b.jsonl');
 if(['missing-produced-mirror','changed-before-reader'].includes(scenario))watch=setInterval(()=>{if(changed||checking)return;checking=true;watchTask=(async()=>{const marker=join(at,'attempt/receipts',scenario==='missing-produced-mirror'?'producer-executor-original.json':'producer-received.json');try{await stat(marker)}catch{return;}changed=true;if(scenario==='missing-produced-mirror')await unlink(chosen);else await writeFile(chosen,'changed');})().catch(error=>{watchFailure=error;changed=true;}).finally(()=>{checking=false;});},5);
 let result;try{result=await run(input)}finally{clearInterval(watch);await watchTask}const outcomes=[result];await writeFile(join(at,'qualification-prefix.json'),JSON.stringify({scenario,requests,maximumActive,changed,outcomes},null,2)+'\n');assert.equal(watchFailure,undefined);
 assert.equal(result.processObservation?.quiescent,true);assert.ok(requests.every(x=>/^\/batch-fixture-[a-e]$/u.test(x)),'no archive requests');
 if(scenario==='reuse-cache'){
  assert.equal(result.accepted,true);const held=result.mirror.files.map(f=>({path:f.path,sha256:f.sha256}));
  const second=await run({...input,attemptDirectory:join(at,'attempt-two'),query:{...input.query,names:['batch-fixture-d','batch-fixture-e'],directory:join(at,'attempt-two/query')}});outcomes.push(second);assert.equal(second.accepted,true);assert.equal(second.processObservation.quiescent,true);for(const f of held)assert.equal(sha(await readFile(f.path)),f.sha256);
 }
 if(['success','reuse-cache'].includes(scenario)){assert.equal(result.accepted,true);assert.equal(result.mirror.allFilesObserved,true);assert.equal(result.mirror.files.length,3);assert.equal(result.mirror.files[0].selectedIntegrityCoverage.length,2);assert.ok(result.mirror.files.every(f=>f.selectedIntegrityCoverage.every(v=>v.integrityMatches)));assert.equal(maximumActive,3,'native aliases genuinely fan out despite networkConcurrency1');}
 else{assert.equal(result.accepted,false);if(scenario==='outer-timeout')assert.equal(result.outerFailure,'ETIMEDOUT');else{const report=JSON.parse(await readFile(join(at,'attempt/result.json')));assert.equal(report.reader,undefined);}}
 if(['missing-produced-mirror','changed-before-reader'].includes(scenario))assert.equal(changed,true);
 await writeFile(join(at,'qualification.json'),JSON.stringify({scenario,requests,maximumActive,changed,outcomes},null,2)+'\n');
});
