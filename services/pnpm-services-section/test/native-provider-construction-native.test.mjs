import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {join} from 'node:path';
import {constructNativeProvider,receiveConstructedNativeProvider} from '../src/native-provider-construction.mjs';
import {storeAssemblyProvider} from '../src/native-provider.mjs';
import {PATCHED_DISTRIBUTION_SHA256,UPSTREAM_DISTRIBUTION_SHA256} from '../src/native-provider-patch.mjs';
const run=promisify(execFile),state=process.env.PNPM_NATIVE_QUALIFICATION_STATE,upstream=process.env.PNPM_NATIVE_UPSTREAM;
if(process.version!=='v24.18.0'||!state||!upstream)throw Error('actual Node24.18, original upstream and explicit owned qualification state required');
const sri='sha512-'+Buffer.alloc(64,7).toString('base64'),old='2001-01-01T00:00:00.000Z',fresh=new Date().toISOString();
const received=[],requests=[];let product,sequence=0;
const mkdir=p=>fs.mkdirSync(p,{recursive:true,mode:0o700});
test('construct and receive only the complete selected native Code product',async()=>{
  product=await constructNativeProvider({sourceDirectory:upstream,outputDirectory:join(state,'product')});
  assert.equal(product.members,559);assert.equal(product.installationClaimed,false);assert.equal(product.publicationClaimed,false);
  const selected=await storeAssemblyProvider(process.execPath,[product.entry],state,undefined,false);
  assert.equal(selected.provider.distSHA256,PATCHED_DISTRIBUTION_SHA256);
  assert.equal(createHash('sha256').update(fs.readFileSync(join(upstream,'dist/pnpm.mjs'))).digest('hex'),UPSTREAM_DISTRIBUTION_SHA256);
  await assert.rejects(storeAssemblyProvider(process.execPath,[join(upstream,'bin/pnpm.cjs')],state,undefined,false),/unqualified PNPM/);
  assert.equal((await receiveConstructedNativeProvider(product.directory)).inventorySHA256,product.inventorySHA256);
  global.gc?.();
});
async function scenario(label,{count=4,concurrency=1,oversize=false,kind='positive',versions=['1.0.0']}={}){
  const root=join(state,'fixture-'+(++sequence)+'-'+label);mkdir(root);
  const names=Array.from({length:count},(_,i)=>'native-cache-fixture-'+i),calls=new Map();let active=0,maximumActive=0;
  const server=createServer(async(req,res)=>{
    if(req.method!=='GET'){res.writeHead(405);res.end();return;}
    const name=decodeURIComponent(req.url.split('?')[0]).slice(1),full=(req.headers.accept??'').includes('application/json');
    const key=name+' '+(full?'full':'abbreviated');calls.set(key,(calls.get(key)??0)+1);active++;maximumActive=Math.max(maximumActive,active);
    const finish=()=>{active--};res.once('close',finish);
    await new Promise(done=>setTimeout(done,15));
    if(kind==='transport'&&full&&name===names[0]&&calls.get(key)===1){res.writeHead(500,{'content-type':'application/json'});res.end('{"error":"original fixture transport failure"}');return;}
    const manifest=version=>({name,version,dist:{integrity:sri,tarball:base+name+'/-/'+name+'-'+version+'.tgz'}});
    const held=Object.fromEntries(versions.map(v=>[v,manifest(v)]));
    if(kind==='url')held[versions[0]].dist.tarball=base+'different-artifact.tgz';
    if(kind==='revision')held[versions[0]].dist.revision=1;
    if(kind==='trust')held['0.9.0']={...manifest('0.9.0'),_npmUser:{trustedPublisher:{id:'github',oidcConfigId:'original-strong-fixture'}},dist:{...manifest('0.9.0').dist,attestations:{provenance:{predicateType:'https://slsa.dev/provenance/v1'}}}};
    const time=Object.fromEntries(Object.keys(held).map(v=>[v,kind==='young'&&v===versions[0]?fresh:kind==='trust'&&v==='0.9.0'?'2000-01-01T00:00:00.000Z':old]));
    const meta={name,'dist-tags':{latest:versions.at(-1)},versions:held,modified:fresh,...(full?{time}:{} )};
    res.writeHead(200,{'content-type':'application/json'});
    if(oversize&&full){
      const {time:originalTime,...withoutTime}=meta;const prefix=JSON.stringify(withoutTime);res.write(prefix.slice(0,-1)+',"time":{');
      for(const[v,at]of Object.entries(time))res.write(JSON.stringify(v)+':'+JSON.stringify(at)+',');
      res.write('"');const piece='x'.repeat(4096);
      for(let i=0;i<2176;i++)if(!res.write(piece))await once(res,'drain');
      res.end('":'+JSON.stringify(old)+'}}');
    }else res.end(JSON.stringify(meta));
  });
  await new Promise(done=>server.listen(0,'127.0.0.1',done));const base='http://127.0.0.1:'+server.address().port+'/';
  const dependencies={},packages={},snapshots={};for(const name of names)for(const version of versions){const alias=versions.length===1?name:name+'-'+version.replaceAll('.','-');dependencies[alias]=versions.length===1?version:'npm:'+name+'@'+version;const id=name+'@'+version;packages[id]={resolution:{integrity:sri,...(kind==='url'?{tarball:base+name+'/-/'+name+'-'+version+'.tgz'}:{}),...(kind==='revision'?{revision:1}:{} )}};snapshots[id]={};}
  if(kind==='integrity')delete packages[Object.keys(packages)[0]].resolution.integrity;
  const importer=Object.fromEntries(Object.entries(dependencies).map(([alias,specifier])=>[alias,{specifier,version:specifier.startsWith('npm:')?specifier.slice(4):specifier}]));
  fs.writeFileSync(join(root,'package.json'),JSON.stringify({name:'native-pnpm-code-fixture',version:'1.0.0',private:true,packageManager:'pnpm@11.28.5',dependencies}));
  fs.writeFileSync(join(root,'pnpm-lock.yaml'),JSON.stringify({lockfileVersion:'9.0',settings:{autoInstallPeers:true,excludeLinksFromLockfile:false},importers:{'.':{dependencies:importer}},packages,snapshots}));
  fs.writeFileSync(join(root,'pnpm-workspace.yaml'),JSON.stringify({...(kind==='trust'?{trustPolicy:'no-downgrade'}:{})}));
  fs.writeFileSync(join(root,'.npmrc'),'registry='+base+'\n');fs.writeFileSync(join(root,'user.npmrc'),'');fs.writeFileSync(join(root,'global.npmrc'),'');
  const args=['--max-old-space-size=96','--max-semi-space-size=4',product.entry,'install','--lockfile-only','--ignore-scripts','--no-frozen-lockfile','--pm-on-fail=error','--network-concurrency='+concurrency,'--child-concurrency=1','--fetch-retries=0','--fetch-timeout=10000','--no-update-notifier','--reporter=ndjson','--store-dir='+join(root,'store'),'--config.cache-dir='+join(root,'cache'),'--config.userconfig='+join(root,'user.npmrc'),'--config.globalconfig='+join(root,'global.npmrc')];
  let outcome;
  try{outcome=await run(process.execPath,args,{cwd:root,env:{...process.env,CI:'true',TMPDIR:root},maxBuffer:16*1024*1024,timeout:90000});outcome={...outcome,code:0};}
  catch(error){outcome={stdout:error.stdout??'',stderr:error.stderr??'',code:error.code,signal:error.signal};}
  finally{server.closeAllConnections();await new Promise(done=>server.close(done));}
  fs.writeFileSync(join(root,'native.stdout'),outcome.stdout);fs.writeFileSync(join(root,'native.stderr'),outcome.stderr);
  const events=outcome.stdout.split('\n').flatMap(line=>{try{return[JSON.parse(line)]}catch{return[]}});
  const caches=events.filter(e=>e.name==='pnpm:metadata-cache-retention'),admission=events.filter(e=>e.name==='pnpm:lockfile-verification-admission');
  const result={label,root,command:[process.execPath,...args],code:outcome.code,signal:outcome.signal??null,maximumHTTPActive:maximumActive,requests:[...calls],cacheEvents:caches.length,admission,maximumRetainedBytes:Math.max(0,...caches.map(e=>e.retainedBytes)),oversized:Math.max(0,...caches.map(e=>e.oversizedEntries)),rejected:Math.max(0,...caches.map(e=>e.rejectedEntries))};
  received.push(result);fs.writeFileSync(join(state,'native-receiving.json'),JSON.stringify({product,received},null,2)+'\n');
  assert.equal(fs.existsSync(join(root,'node_modules')),false,'lock construction must not claim or create an installed graph');
  assert.ok(caches.every(e=>e.retainedBytes<=8388608),'all process-wide settled metadata caches stay byte bounded');
  if(kind==='positive'){assert.equal(outcome.code,0,outcome.stderr+'\n'+outcome.stdout.slice(-1500));assert.ok(admission.some(e=>e.checked===count*versions.length));assert.ok(admission.every(e=>e.maximumActive<=concurrency));}
  else assert.notEqual(outcome.code,0,'native supply-chain refusal must remain a refusal');
  global.gc?.();return{...result,events,output:outcome.stdout+'\n'+outcome.stderr};
}
test('actual native policy checks every existing pin with admitted inflight one',async()=>{
  const r=await scenario('bounded');assert.equal(r.maximumHTTPActive,1);assert.ok(r.cacheEvents>0);
});
test('actual concurrent repeated-package metadata remains deduplicated',async()=>{
  const r=await scenario('dedup',{count:1,concurrency:2,versions:['1.0.0','1.0.1']});
  assert.ok(r.requests.every(([,n])=>n===1));assert.ok(r.admission.every(e=>e.maximumActive<=2));
});
test('actual oversized metadata is checked without retaining an oversized value',async()=>{
  const r=await scenario('oversize',{count:1,oversize:true,versions:['1.0.0','1.0.1']});assert.ok(r.oversized>0);assert.ok(r.requests.some(([key,n])=>key.endsWith(' full')&&n>=2));
});
test('actual rejected metadata is cleared while the original transport refusal survives',async()=>{
  const r=await scenario('rejection',{count:1,kind:'transport',versions:['1.0.0','1.0.1']});assert.ok(r.rejected>0);assert.ok(r.requests.some(([key,n])=>key.endsWith(' full')&&n>=2));
});
for(const kind of['young','integrity','url','revision','trust'])test('actual native '+kind+' policy negative control remains refused',async()=>{
  const r=await scenario(kind,{count:1,kind});assert.match(r.output,kind==='young'?/MINIMUM_RELEASE_AGE|published at|supply.chain|NO_MATURE/:kind==='integrity'?/integrity|MISSING_TARBALL/:kind==='trust'?/TRUST_DOWNGRADE|trust|downgrade/:/TARBALL|tarball|revision|supply.chain/iu);
});
