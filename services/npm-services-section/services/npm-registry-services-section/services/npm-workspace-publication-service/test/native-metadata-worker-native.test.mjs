import test from 'node:test';import assert from 'node:assert/strict';
import{mkdtemp,mkdir,writeFile,readFile,stat}from'node:fs/promises';import{join,resolve}from'node:path';import{tmpdir}from'node:os';import{createHash}from'node:crypto';import{createServer}from'node:http';
import{createNativeMetadataWorker}from'../src/native-metadata-worker.mjs';
const bindingPath=process.env.NPM_METADATA_WORKER_TEST_BINDINGS;
const root=bindingPath?await mkdtemp(join(tmpdir(),'npm-native-metadata-')):null,sha=b=>createHash('sha256').update(b).digest('hex');
const bindings=bindingPath?JSON.parse(await readFile(resolve(bindingPath))):null,service=bindings?await createNativeMetadataWorker({bindings}):null;
console.log('owned native fixture evidence:',root);
for(const scenario of ['producer-reader','http-error','request-timeout','post-query-drift','malformed-report'])test('original supervised native metadata: '+scenario,{timeout:180000,skip:!bindingPath},async t=>{
 const at=join(root,scenario);await mkdir(at,{mode:0o700});for(const n of ['source','attempt','cache','home','config'])await mkdir(join(at,n),{mode:0o700});
 const requests=[],sockets=new Set();const server=createServer((req,res)=>{
  requests.push(req.url);if(req.url!=='/metadata-worker-fixture'){res.writeHead(500).end();return;}
  if(scenario==='http-error'){res.writeHead(500).end('synthetic upstream refusal');return;}
  if(scenario==='request-timeout')return;
  const v=version=>({name:'metadata-worker-fixture',version,dist:{integrity:'sha512-'+Buffer.alloc(64,1).toString('base64'),tarball:`http://127.0.0.1:${server.address().port}/must-not-fetch.tgz`}});
  res.setHeader('content-type','application/json');res.end(JSON.stringify({name:'metadata-worker-fixture','dist-tags':{latest:'2.0.0'},versions:{'1.0.0':v('1.0.0'),'2.0.0':v('2.0.0')},time:{'1.0.0':'2020-01-01T00:00:00.000Z','2.0.0':'2020-01-01T00:00:00.000Z'}}));
 });server.on('connection',s=>{sockets.add(s);s.on('close',()=>sockets.delete(s));});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 t.after(async()=>{for(const s of sockets)s.destroy();await new Promise(r=>server.close(r));});
 const registry=`http://127.0.0.1:${server.address().port}/`,selection=[{name:'metadata-worker-fixture',version:'1.0.0',registry,integrity:'sha512-'+Buffer.alloc(64,1).toString('base64')}];
 const files={'package.json':JSON.stringify({name:'metadata-worker-source',private:true,dependencies:{'metadata-worker-fixture':'1.0.0'}}),
  'pnpm-lock.yaml':JSON.stringify({lockfileVersion:'9.0',importers:{'.':{dependencies:{'metadata-worker-fixture':{specifier:'1.0.0',version:'1.0.0'}}}}}),
  'pnpm-workspace.yaml':'packages: []\nminimumReleaseAge: 1440\nminimumReleaseAgeStrict: true\n','.npmrc':`registry=${registry}\n`};
 const canonicalFiles=[];for(const[name,text]of Object.entries(files)){const path=join(at,'source',name);await writeFile(path,text);canonicalFiles.push({path,bytes:Buffer.byteLength(text),sha256:sha(text)});}
 const keys=['manifestSHA256','lockSHA256','workspaceSHA256','registryConfigurationSHA256'];
 const environment={PATH:process.env.PATH,HOME:join(at,'home'),XDG_CONFIG_HOME:join(at,'config')};
 const input={attemptDirectory:join(at,'attempt'),canonicalFiles,policyContext:'authored-consumer',timeoutMilliseconds:140000,environment,
  environmentPolicy:{stable:Object.fromEntries(Object.entries(environment).map(([k,v])=>[k,sha(v)])),relays:{}},
  query:{name:'metadata-worker-fixture',selections:selection,policy:{minimumReleaseAge:1440,minimumReleaseAgeStrict:true},
    canonical:{sourceHead:'a'.repeat(40),...Object.fromEntries(keys.map((k,i)=>[k,canonicalFiles[i].sha256])),selectionSHA256:sha(JSON.stringify(selection))},
    registry,directory:join(at,'attempt/query'),cacheDirectory:join(at,'cache')}};
 let modified=false,watch;
 if(['post-query-drift','malformed-report'].includes(scenario))watch=setInterval(async()=>{
  if(modified)return;const result=join(at,'attempt/result.json');try{await stat(result);}catch{return;}modified=true;
  if(scenario==='post-query-drift')await writeFile(join(at,'attempt/query/package.json'),'{}\n');else await writeFile(result,'{}\n');
 },5);
 let result;try{result=await service.run(input);}finally{clearInterval(watch);}
 await writeFile(join(at,'qualification.json'),JSON.stringify({scenario,requests,modified,result},null,2)+'\n');
 assert.equal(result.processObservation?.quiescent,true,'actual original outer group must settle');
 assert.ok(requests.length>0);assert.ok(requests.every(x=>x==='/metadata-worker-fixture'),'no archives, install or other package requests');
 assert.equal(result.accepted,scenario==='producer-reader');
 if(scenario==='producer-reader'){assert.equal(result.state,'complete');assert.equal(result.strictPolicyVerified,false);assert.equal(result.installationReceived,false);assert.equal(requests.length,1);}
 if(['http-error','request-timeout'].includes(scenario)){
  const report=JSON.parse(await readFile(join(at,'attempt/result.json')));assert.equal(report.accepted,false);assert.equal(report.reader,undefined);assert.equal(result.outerFailure,'WORKER_EXIT');
 }
 if(['post-query-drift','malformed-report'].includes(scenario))assert.equal(modified,true);
});
