import nodeTest from 'node:test';import assert from 'node:assert/strict';import{readFile,mkdtemp,mkdir,writeFile,copyFile,symlink}from'node:fs/promises';import{join,resolve,dirname}from'node:path';import{tmpdir}from'node:os';import{createHash}from'node:crypto';
import{createNativeMetadataWorker}from'../src/native-metadata-worker.mjs';
const bindingPath=process.env.NPM_METADATA_WORKER_TEST_BINDINGS;
const test=(name,fn)=>nodeTest(name,{skip:!bindingPath},fn);
const sha=b=>createHash('sha256').update(b).digest('hex'),bindings=bindingPath?JSON.parse(await readFile(resolve(bindingPath))):null;
const service=bindings?await createNativeMetadataWorker({bindings}):null;
async function input(){const root=await mkdtemp(join(tmpdir(),'npm-metadata-preflight-'));for(const n of ['attempt','source','cache','home','config'])await mkdir(join(root,n),{mode:0o700});
 const texts=['{}','lock','packages: []\nminimumReleaseAge: 1440\nminimumReleaseAgeStrict: true\n','registry=https://registry.example/\n'],canonicalFiles=[];
 for(const [i,text]of texts.entries()){const path=join(root,'source',String(i));await writeFile(path,text);canonicalFiles.push({path,bytes:Buffer.byteLength(text),sha256:sha(text)});}
 const environment={PATH:process.env.PATH,HOME:join(root,'home'),XDG_CONFIG_HOME:join(root,'config')};const selections=[{name:'metadata-fixture',version:'1.0.0',registry:'https://registry.example/',integrity:'sha512-'+Buffer.alloc(64,1).toString('base64')}];
 return {attemptDirectory:join(root,'attempt'),canonicalFiles,policyContext:'source-owned-qualification-proposal',timeoutMilliseconds:90000,environment,
 environmentPolicy:{stable:Object.fromEntries(Object.entries(environment).map(([k,v])=>[k,sha(v)])),relays:{}},query:{name:'metadata-fixture',selections,policy:{minimumReleaseAge:1440,minimumReleaseAgeStrict:true},registry:'https://registry.example/',directory:join(root,'attempt/query'),cacheDirectory:join(root,'cache'),canonical:{sourceHead:'a'.repeat(40),...Object.fromEntries(['manifestSHA256','lockSHA256','workspaceSHA256','registryConfigurationSHA256'].map((k,i)=>[k,canonicalFiles[i].sha256])),selectionSHA256:sha(JSON.stringify(selections))}}};}
test('constructor and operation options refuse getters without evaluating them',async()=>{let called=0;const outer={};Object.defineProperty(outer,'bindings',{enumerable:true,get(){called++;return bindings;}});await assert.rejects(createNativeMetadataWorker(outer),/unsupported worker field/);const i=await input(),options={};Object.defineProperty(options,'signal',{enumerable:true,get(){called++;return null;}});await assert.rejects(service.run(i,options),/unsupported worker field/);assert.equal(called,0);});
test('policy context and caller program or callback fields cannot open execution',async()=>{for(const change of [{policyContext:'approved'},{program:'/bin/true'},{execute:()=>{}},{timeoutMilliseconds:Infinity}]){const i=await input();await assert.rejects(service.run({...i,...change}));await assert.rejects(readFile(join(i.attemptDirectory,'input.json')),{code:'ENOENT'});}});
test('missing closure members and changed original executor bytes refuse',async()=>{await assert.rejects(createNativeMetadataWorker({bindings:{...bindings,files:bindings.files.filter(f=>f.path!==join(dirname(bindings.pnpmModule),'native-transport-environment.mjs'))}}),/incomplete/);const changed=structuredClone(bindings);changed.files.find(f=>f.path===changed.executorModule).sha256='a'.repeat(64);await assert.rejects(createNativeMetadataWorker({bindings:changed}),/source bytes changed/);});
test('nearer package directory without manifest cannot fall through to valid ancestor',async()=>{
 const root=await mkdtemp(join(tmpdir(),'npm-nearer-package-')),exe=join(root,'executor');await mkdir(join(exe,'scripts'),{recursive:true});await mkdir(join(exe,'data/records/schema'),{recursive:true});await mkdir(join(root,'node_modules/@red-cup-engineering'),{recursive:true});await mkdir(join(exe,'node_modules/@red-cup-engineering/javascript-node-services-section'),{recursive:true});
 const orig=dirname(dirname(bindings.executorModule)),copy=structuredClone(bindings);copy.executorModule=join(exe,'scripts/execute-javascript-node-command.mjs');
 for(const rel of ['package.json','scripts/execute-javascript-node-command.mjs','data/records/schema/execute-javascript-node-command.input.schema.json','data/records/schema/execute-javascript-node-command.output.schema.json']){const dest=join(exe,rel);await copyFile(join(orig,rel),dest);const b=await readFile(dest);copy.files.push({path:dest,bytes:b.length,sha256:sha(b)});}
 let original;for(const f of bindings.files.filter(f=>f.path.endsWith('/package.json'))){if(JSON.parse(await readFile(f.path)).name==='@red-cup-engineering/javascript-node-services-section'){assert.equal(original,undefined,'unique original JSNode package');original=f;}}assert.ok(original);await symlink(dirname(original.path),join(root,'node_modules/@red-cup-engineering/javascript-node-services-section'));
 await assert.rejects(createNativeMetadataWorker({bindings:copy}),{code:'ENOENT'});
});
test('existing retained output or query refuses before any input overwrite or launch',async()=>{
 for(const path of ['outer-result.json','result.json','input.json','query']){const i=await input(),p=join(i.attemptDirectory,path);await writeFile(p,'retained');await assert.rejects(service.run(i),/already exists/);assert.equal(await readFile(p,'utf8'),'retained');}
});
test('credentials and unreadable CA are refused before the intent is retained',async()=>{
 const i=await input();i.environment.HTTPS_PROXY='http://user:synthetic-secret@relay.example:1234';i.environmentPolicy.relays.HTTPS_PROXY={protocol:'http:',hostnameSHA256:sha('relay.example')};await assert.rejects(service.run(i),/credential bearing/);await assert.rejects(readFile(join(i.attemptDirectory,'input.json')),{code:'ENOENT'});
 const ca=await input();ca.environment.NODE_EXTRA_CA_CERTS=join(ca.attemptDirectory,'absent-ca');ca.environmentPolicy.stable.NODE_EXTRA_CA_CERTS=sha(ca.environment.NODE_EXTRA_CA_CERTS);await assert.rejects(service.run(ca),{code:'ENOENT'});await assert.rejects(readFile(join(ca.attemptDirectory,'input.json')),{code:'ENOENT'});
});

test('owned CA inside allocation refuses before creating any evidence',async()=>{
 const i=await input(),path=join(i.attemptDirectory,'ca.pem');await writeFile(path,'fixture CA bytes');i.environment.NODE_EXTRA_CA_CERTS=path;i.environmentPolicy.stable.NODE_EXTRA_CA_CERTS=sha(path);
 await assert.rejects(service.run(i),/overlaps owned source or transport/);await assert.rejects(readFile(join(i.attemptDirectory,'input.json')),{code:'ENOENT'});assert.equal(await readFile(path,'utf8'),'fixture CA bytes');
});

test('batch data cannot widen name count or mix one-name and batch profiles',async()=>{
 for(const names of [[],['metadata-fixture','b','c','d','e'],['metadata-fixture','metadata-fixture']]){const i=await input();delete i.query.name;i.query.names=names;await assert.rejects(service.run(i));await assert.rejects(readFile(join(i.attemptDirectory,'input.json')),{code:'ENOENT'});}
 const mixed=await input();mixed.query.names=['metadata-fixture'];await assert.rejects(service.run(mixed));await assert.rejects(readFile(join(mixed.attemptDirectory,'input.json')),{code:'ENOENT'});
});
