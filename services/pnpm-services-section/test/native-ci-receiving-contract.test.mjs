import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,symlinkSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {EventEmitter,once} from 'node:events';
import * as diagnostics from '../scripts/native-ci-receiving-contract.mjs';
import {receiveCITransport,receiveRequiredTests,receiveProcess,receiveSuite,receiveArchive,receiveNativeProductSuite,receiveNativeFailureDiagnostics,emitNativeFailureDiagnostics} from '../scripts/native-ci-receiving-contract.mjs';
const tap='ok 1 - required\nok 2 - private consumer # SKIP\n# tests 2\n# pass 1\n# fail 0\n# cancelled 0\n# skipped 1\n';
test('missing enrolled test refuses before execution',t=>{
 const root=mkdtempSync(join(tmpdir(),'ci-test-contract-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 assert.throws(()=>receiveRequiredTests(root,['test/absent.test.mjs']),/ENOENT/);
 assert.throws(()=>receiveRequiredTests(root,['../escape.test.mjs']));
 mkdirSync(join(root,'test'));writeFileSync(join(root,'test/present.test.mjs'),'');
 assert.deepEqual(receiveRequiredTests(root,['test/present.test.mjs']),['test/present.test.mjs']);
});
test('failed started, signalled and nonzero commands cannot yield receiving',()=>{
 assert.equal(receiveProcess({stdout:'received',status:0,signal:null}),'received');
 for(const row of [{status:1,signal:null},{status:null,signal:'SIGTERM'},{status:0,signal:null,error:new Error('bounded output overflow')}])
  assert.throws(()=>receiveProcess({...row,stdout:tap}));
});
test('unexplained skips, empty and incomplete TAP refuse',()=>{
 assert.equal(receiveSuite(tap,['private consumer']).passed,1);
 for(const text of [tap.replace('private consumer','missing supplier'),tap.replace('# fail 0','# fail 1'),tap.replace('# cancelled 0','# cancelled 1'),tap.replace('# pass 1','# pass 0'),''])
  assert.throws(()=>receiveSuite(text,['private consumer']));
 assert.throws(()=>receiveSuite(tap,[]));
});
test('missing archived tests or exports and bundled test tools refuse',()=>{
 const manifest={receivingTests:['test/required.test.mjs'],exports:{'.':'./src/index.mjs'}};
 const complete=['package/test/required.test.mjs','package/src/index.mjs'];
 assert.deepEqual(receiveArchive(complete,manifest),complete);
 for(const members of [complete.slice(0,1),complete.slice(1),[...complete,'package/node_modules/pnpm/bin/pnpm.mjs']])
  assert.throws(()=>receiveArchive(members,manifest));
});
test('original transport admission preserves noncredential relays and typed control; secrets never echo',async()=>{
 const input={PATH:'/usr/bin',HTTPS_PROXY:'http://relay.example:8080',NO_PROXY:'localhost',NODE_USE_ENV_PROXY:'1'};
 assert.equal((await receiveCITransport(input,'/tmp')).values.HTTPS_PROXY,input.HTTPS_PROXY);
 for(const proxy of ['http://private-user:secret-value@relay.example:8080','not-a-url-secret-value','http://relay.example:8080/?token=secret-value']){
  await assert.rejects(receiveCITransport({...input,HTTPS_PROXY:proxy},'/tmp'),error=>{
   assert.equal(error.message,'unqualified native CI transport; no command issued');assert.ok(!error.stack.includes('secret-value'));return true;
  });
 }
 for(const value of ['true','',2])await assert.rejects(receiveCITransport({...input,NODE_USE_ENV_PROXY:value},'/tmp'));
});
test('CA custody uses original bounded regular-file admission',async t=>{
 const root=mkdtempSync(join(tmpdir(),'ci-ca-contract-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const file=join(root,'ca.pem');writeFileSync(file,'fixture certificate bytes');
 const input={PATH:'/usr/bin',NODE_EXTRA_CA_CERTS:file};
 assert.equal((await receiveCITransport(input,root)).identity.files.NODE_EXTRA_CA_CERTS.length,64);
 await assert.rejects(receiveCITransport({...input,NODE_EXTRA_CA_CERTS:join(root,'absent')},root));
 symlinkSync(file,join(root,'redirected'));await assert.rejects(receiveCITransport({...input,NODE_EXTRA_CA_CERTS:join(root,'redirected')},root));
});

// Independent test-only receiving controls. Synthetic TAP is parser input, never
// an authentic native execution, provider capability or qualification receipt.
const nativeNames=[
 'receive only the complete source-constructed native Code product',
 'actual native policy checks every existing pin with admitted inflight one',
 'actual concurrent repeated-package metadata remains deduplicated',
 'actual oversized metadata is checked without retaining an oversized value',
 'actual rejected metadata is cleared while the original transport refusal survives',
 ...['young','integrity','url','revision','trust'].map(kind=>'actual native '+kind+' policy negative control remains refused')
];
const nativeTap=names=>'TAP version 13\n'+names.map((name,i)=>
 '# Subtest: '+name+'\nok '+(i+1)+' - '+name+'\n  ---\n  duration_ms: 1.25\n  type: test\n  ...\n').join('')+
 '1..'+names.length+'\n# tests '+names.length+'\n# suites 0\n# pass '+names.length+'\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n# duration_ms 13.5\n';
const completeNativeTap=nativeTap(nativeNames);
test('mandatory native receiving requires all ten exact ordered successful case identities',()=>{
 const receipt=receiveNativeProductSuite(completeNativeTap,nativeNames);
 assert.equal(receipt.tests,10);assert.equal(receipt.passed,10);assert.deepEqual(receipt.names,nativeNames);
 assert.match(receipt.outputSHA256,/^[a-f0-9]{64}$/);
 for(const names of [[],nativeNames.slice(1),[...nativeNames,'extra'],[nativeNames[0],...nativeNames.slice(0,9)]])
  assert.throws(()=>receiveNativeProductSuite(completeNativeTap,names));
 for(const names of [nativeNames.slice(1),[...nativeNames,'extra'],['wrong identity',...nativeNames.slice(1)],
  [nativeNames[0],...nativeNames.slice(0,9)],[nativeNames[1],nativeNames[0],...nativeNames.slice(2)]])
  assert.throws(()=>receiveNativeProductSuite(nativeTap(names),nativeNames));
});
test('mandatory native receiving rejects skipped and TODO cases even with a false clean summary',()=>{
 for(const directive of ['SKIP','TODO','skip','todo']){
  const mutated=completeNativeTap.replace('ok 1 - '+nativeNames[0],'ok 1 - '+nativeNames[0]+' # '+directive+' native supplier absent');
  assert.throws(()=>receiveNativeProductSuite(mutated,nativeNames));
  const key=directive.toLowerCase()==='skip'?'skipped':'todo';
  assert.throws(()=>receiveNativeProductSuite(mutated.replace('# '+key+' 0','# '+key+' 1'),nativeNames));
 }
});
test('mandatory native receiving rejects failure, cancellation, bailout and incomplete evidence',()=>{
 for(const mutated of [
  '',completeNativeTap.replace('ok 1 -','not ok 1 -'),completeNativeTap+'not ok 11 - hidden failure\n',
  completeNativeTap.replace('# fail 0','# fail 1'),completeNativeTap.replace('# cancelled 0','# cancelled 1'),
  completeNativeTap.replace('# skipped 0','# skipped 1'),completeNativeTap.replace('# todo 0','# todo 1'),
  completeNativeTap.replace('# pass 10','# pass 0'),completeNativeTap.replace('# tests 10','# tests 11'),
  completeNativeTap.replace('# pass 10','# pass 9'),completeNativeTap.replace('1..10','1..9'),
  completeNativeTap.replace('1..10\n',''),completeNativeTap.replace('# todo 0\n',''),
  completeNativeTap.replace('# cancelled 0\n',''),completeNativeTap.replace('# fail 0\n',''),
  completeNativeTap.replace('ok 2 -','ok 1 -'),completeNativeTap.replace('ok 2 -','ok 20 -'),
  completeNativeTap.replace('ok 2 -','  ok 2 -'),completeNativeTap+'Bail out! incomplete native run\n',
  completeNativeTap+'# fail 0\n',completeNativeTap+'1..10\n'
 ])assert.throws(()=>receiveNativeProductSuite(mutated,nativeNames));
});
const ownerRoot=fileURLToPath(new URL('../',import.meta.url));
const readOwner=path=>readFileSync(join(ownerRoot,path),'utf8');
test('original CI separately dispatches the complete native source family before archive and consumer work',()=>{
 const ci=readOwner('scripts/receive-native-ci.mjs'),contract=JSON.parse(readOwner('ci-native-qualification.json'));
 assert.equal(contract.nativeProductSource.file,'test/native-provider-construction-native.test.mjs');
 assert.deepEqual(contract.nativeProductSource.expectedNames,nativeNames);
 assert.ok(!contract.outsideThisReceiving.some(item=>JSON.stringify(item).includes(contract.nativeProductSource.file)));
 assert.match(ci,/receiveRequiredTests\(root,\[contract\.nativeProductSource\.file\]\)/);
 assert.match(ci,/Object\.assign\(receipt\.nativeProductSource,command\(process\.execPath,[\s\S]*?\.\.\.nativeProductFiles\],root,'native-product-source-tests',[\s\S]*?tap=>receiveNativeProductSuite\(tap,contract\.nativeProductSource\.expectedNames\)/);
 assert.match(ci,/PNPM_NATIVE_UPSTREAM:\s*supplier/);
 assert.match(ci,/PNPM_NATIVE_CONSTRUCTED_PRODUCT:\s*product\.directory/);
 assert.match(ci,/const qualificationState=join\(stage,'native-product-qualification'\);mkdirSync\(qualificationState,\{mode:0o700\}\)/);
 assert.match(ci,/PNPM_NATIVE_QUALIFICATION_STATE:qualificationState/);
 assert.match(ci,/env:\{\.\.\.env,\.\.\.additionalEnv\}/);
 assert.match(ci,/return receive\(receiveProcess\(result\)\)/);
 assert.match(ci,/--test-concurrency=1/);assert.match(ci,/--max-old-space-size=128/);
 assert.match(ci,/timeout:180000/);assert.match(ci,/maxBuffer:16\*1024\*1024/);
 const gate=ci.indexOf('receipt.nativeProductSource=');
 assert.ok(gate>=0,'native receipt must be independently admitted');
 assert.ok(gate<ci.indexOf("'native-pack'"),'native gate must precede packing');
 assert.ok(gate<ci.indexOf("'consumer-lock'"),'native gate must precede consumer registry work');
});
test('metadata-only native family uses the established dual-Node metadata profile without weakening product admission',()=>{
 const native=readOwner('test/native-provider-construction-native.test.mjs');
 const provider=readOwner('src/native-provider.mjs');
 assert.match(native,/import\s*\{metadataProvider\}\s*from ['"]\.\.\/src\/native-provider\.mjs['"]/);
 assert.doesNotMatch(native,/storeAssemblyProvider/);
 assert.match(native,/metadataProvider\(process\.execPath,\[product\.entry\],state,undefined,false\)/);
 assert.match(native,/assert\.rejects\(metadataProvider\(process\.execPath,\[join\(upstream,'bin\/pnpm\.mjs'\)\]/);
 assert.match(native,/if\(!\['v24\.18\.0','v24\.19\.0'\]\.includes\(process\.version\)\|\|!state\|\|!upstream\)throw Error/);
 assert.match(provider,/export const metadataProvider = .*qualifiedProvider\(program,args,cwd,expected,probeVersion,\['v24\.18\.0','v24\.19\.0'\]\)/);
 assert.match(native,/await receiveConstructedNativeProvider\(process\.env\.PNPM_NATIVE_CONSTRUCTED_PRODUCT\)/);
 assert.match(native,/PATCHED_DISTRIBUTION_SHA256/);assert.match(native,/UPSTREAM_DISTRIBUTION_SHA256/);
 assert.match(native,/--max-old-space-size=96/);assert.match(native,/timeout:90000/);
});

// Synthetic local log fixtures exercise failure diagnostics only. They are not
// native supplier output, branded capabilities or successful native receiving.
const secretCanary='DO_NOT_PUBLISH_CREDENTIAL_CANARY_938271';
function ownedDiagnosticFixture(t){
 const state=mkdtempSync(join(tmpdir(),'ci-native-diagnostics-'));
 t.after(()=>rmSync(state,{recursive:true,force:true}));
 const fixture=join(state,'fixture-1-bounded');mkdirSync(fixture);
 const cache={name:'pnpm:metadata-cache-retention',retainedBytes:8123456,peakRetainedBytes:8388608,
  pendingEntries:2,peakPendingEntries:3,settledEntries:4,evictions:5,oversizedEntries:6,rejectedEntries:7,
  message:secretCanary,headers:{authorization:secretCanary}};
 const admission={name:'pnpm:lockfile-verification-admission',selectedConcurrency:1,maximumActive:1,checked:9,url:'https://user:'+secretCanary+'@example.invalid/'};
 writeFileSync(join(fixture,'native.stdout'),JSON.stringify(cache)+'\n'+JSON.stringify(admission)+'\n'+secretCanary+'\n');
 writeFileSync(join(fixture,'native.stderr'),'Error: '+secretCanary+'\nAuthorization: Bearer '+secretCanary+'\n');
 writeFileSync(join(state,'native-receiving.json'),JSON.stringify({product:{credentials:secretCanary},received:[
  {label:'bounded',root:fixture,command:['node',secretCanary],code:1,signal:null,maximumHTTPActive:1,
   cacheEvents:1,maximumRetainedBytes:8123456,oversized:6,rejected:7,admission:[admission],requests:[[secretCanary,1]],extra:secretCanary}
 ]}));
 return {state,fixture};
}
test('native failure diagnostics retain numeric observations and emit no untrusted nested log fields',t=>{
 const {state}=ownedDiagnosticFixture(t),emitted=[];
 const received=emitNativeFailureDiagnostics(state,{},value=>emitted.push(value));
 assert.equal(received.state,'diagnostics-only');assert.deepEqual(emitted,[received]);
 const output=JSON.stringify(received);assert.ok(Buffer.byteLength(output)<=32768);
 assert.ok(!output.includes(secretCanary));assert.ok(!output.includes('example.invalid'));
 const fixture=received.fixtures.find(row=>row.fixture==='bounded');assert.ok(fixture);
 assert.equal(fixture.receipt.terminal.exitCode,1);
 assert.equal(fixture.receipt.metrics.maximumHTTPActive,1);
 assert.equal(fixture.stdout.events.cache.maxima.retainedBytes,8123456);
 assert.equal(fixture.stdout.events.cache.maxima.oversizedEntries,6);
 assert.equal(fixture.stdout.events.admission.maxima.checked,9);
 assert.equal(fixture.stdout.evidence.evidenceSHA256,undefined);
 assert.equal(fixture.stderr.evidence.evidenceSHA256,undefined);
});
test('native failure diagnostics salvage owned log observations when partial receipt is absent or malformed',t=>{
 const {state}=ownedDiagnosticFixture(t),path=join(state,'native-receiving.json');
 rmSync(path);
 for(const value of [undefined,'{malformed:'+secretCanary]){
  if(value!==undefined)writeFileSync(path,value);
  const received=receiveNativeFailureDiagnostics(state),output=JSON.stringify(received);
  assert.equal(received.state,'diagnostics-only');assert.ok(!output.includes(secretCanary));
  assert.equal(received.fixtures.find(row=>row.fixture==='bounded').stdout.events.cache.maxima.rejectedEntries,7);
 }
});
test('native failure diagnostics refuse symlink custody and never follow receipt paths',t=>{
 const {state,fixture}=ownedDiagnosticFixture(t);
 const other=mkdtempSync(join(tmpdir(),'ci-diagnostics-outside-'));t.after(()=>rmSync(other,{recursive:true,force:true}));
 const target=join(other,'outside.stdout');writeFileSync(target,JSON.stringify({name:'pnpm:metadata-cache-retention',retainedBytes:87654321,message:secretCanary})+'\n');
 rmSync(join(fixture,'native.stdout'));symlinkSync(target,join(fixture,'native.stdout'));
 let received=receiveNativeFailureDiagnostics(state),output=JSON.stringify(received);
 assert.ok(!output.includes('87654321'));assert.ok(!output.includes(secretCanary));assert.match(output,/unsafe|refused/);
 rmSync(fixture,{recursive:true});symlinkSync(other,fixture);
 received=receiveNativeFailureDiagnostics(state);output=JSON.stringify(received);
 assert.ok(!output.includes('87654321'));assert.match(output,/unsafe|refused/);
 const rootLink=join(other,'redirected-state');symlinkSync(state,rootLink);
 received=receiveNativeFailureDiagnostics(rootLink);
 assert.equal(received.qualificationStateStatus,'unsafe');assert.match(JSON.stringify(received),/unsafe|refused/);
});
test('native failure diagnostics mark bounded prefixes and oversized receipts without exposing omitted text',t=>{
 const {state,fixture}=ownedDiagnosticFixture(t);
 const log=join(fixture,'native.stdout');const start=readFileSync(log);
 writeFileSync(log,Buffer.concat([start,Buffer.alloc(300000,120),Buffer.from(secretCanary)]));
 writeFileSync(join(state,'native-receiving.json'),' '.repeat(524289)+secretCanary);
 const received=receiveNativeFailureDiagnostics(state),output=JSON.stringify(received);
 assert.ok(Buffer.byteLength(output)<=32768);assert.ok(!output.includes(secretCanary));
 const row=received.fixtures.find(row=>row.fixture==='bounded');
 assert.equal(row.stdout.evidence.truncated,true);assert.ok(row.stdout.evidence.readBytes<=262144);
 assert.equal(row.stdout.events.cache.maxima.retainedBytes,8123456);
 assert.notEqual(received.receipt.formatStatus,'received');assert.equal(received.truncated,true);
});

test('actual native CI failure branch keeps raw evidence local and publishes only useful safe observations',t=>{
 const {state}=ownedDiagnosticFixture(t),publicLines=[];
 const ci=readOwner('scripts/receive-native-ci.mjs');
 const start=ci.indexOf('function command('),end=ci.indexOf('\nfunction suite(',start);
 assert.ok(start>=0&&end>start);
 // Execute the exact original CI command body with a real failing local Node
 // child. This is an orchestration negative control, never a supplier test.
 const receipt={commands:[],nativeProductSource:{state:'running'}};
 const digest=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
 const fakeConsole={error:value=>publicLines.push(String(value))};
 const safeProcess={stdout:{write:value=>publicLines.push(String(value))},stderr:{write:value=>publicLines.push(String(value))}};
 const command=new Function('spawnSync','writeFileSync','join','digest','receiveProcess','emitNativeFailureDiagnostics','receipt','stage','env','console','process','product',
  ci.slice(start,end)+'\nreturn command;')(spawnSync,writeFileSync,join,digest,receiveProcess,
  (directory,outer)=>emitNativeFailureDiagnostics(directory,outer,value=>publicLines.push(JSON.stringify(value))),
  receipt,state,{},fakeConsole,safeProcess,undefined);
 const outerTap='TAP version 13\nnot ok 1 - '+secretCanary+'\n# tests 1\n# pass 0\n# fail 1\n# cancelled 0\n# skipped 0\n# todo 0\n';
 const program='process.stdout.write('+JSON.stringify(outerTap)+');process.stderr.write('+JSON.stringify('Authorization: Bearer '+secretCanary)+');process.exitCode=1;';
 let refused;
 try{command(process.execPath,['-e',program],state,'native-product-source-tests',value=>value,{PNPM_NATIVE_QUALIFICATION_STATE:state});}
 catch(error){refused=error;}
 assert.ok(refused,'failed command must remain refused');assert.match(refused.message,/native-product-source-tests refused/);
 assert.equal(refused.cause,undefined);assert.ok(!refused.stack.includes(secretCanary));
 assert.ok(readFileSync(join(state,'native-product-source-tests.stdout'),'utf8').includes(secretCanary));
 assert.ok(readFileSync(join(state,'native-product-source-tests.stderr'),'utf8').includes(secretCanary));
 const published=publicLines.join('\n');assert.ok(!published.includes(secretCanary));
 const privateCommand=receipt.commands[0];
 assert.equal(privateCommand.stdoutSHA256,digest(join(state,'native-product-source-tests.stdout')));
 assert.equal(privateCommand.stderrSHA256,digest(join(state,'native-product-source-tests.stderr')));
 assert.ok(!published.includes(privateCommand.stdoutSHA256));assert.ok(!published.includes(privateCommand.stderrSHA256));
 assert.equal(publicLines.length,1);assert.ok(Buffer.byteLength(published)<=32768);
 const view=JSON.parse(publicLines[0]);assert.equal(view.state,'diagnostics-only');
 assert.equal(view.outer.refusalClass,'nonzero-exit');assert.equal(view.outer.terminal.exitCode,1);
 assert.equal(view.outer.stdout.tap.counters.fail,1);assert.equal(view.outer.stdout.tap.failedResultsObserved,1);
 assert.equal(view.fixtures.find(row=>row.fixture==='bounded').stdout.events.cache.maxima.retainedBytes,8123456);
 assert.deepEqual(receipt.nativeProductSource.failureDiagnostics,view);
});
test('native failure projection preserves timeout and output-bound classes without publishing native error messages',t=>{
 const {state}=ownedDiagnosticFixture(t);
 for(const [code,expected]of [['ETIMEDOUT','timeout'],['ENOBUFS','output-limit'],['ENOENT','command-error']]){
  const emitted=[];
  const result=emitNativeFailureDiagnostics(state,{stdout:secretCanary,stderr:secretCanary,
   terminal:{status:null,signal:null,error:{code,message:secretCanary,name:secretCanary}}},value=>emitted.push(value));
  assert.equal(result.outer.refusalClass,expected);assert.equal(result.outer.terminal.errorCode,code);
  assert.ok(!JSON.stringify(emitted).includes(secretCanary));assert.equal(result.state,'diagnostics-only');
 }
});

// NVP-7 fixture-response controls only. Execute the exact original HTTP handler
// with in-memory request/response objects, never a supplier or network server.
const abbreviatedAccept='application/vnd.npm.install-v1+json; q=1.0, application/json; q=0.8, */*';
const fullAccept='application/json; q=1.0, */*';
function nativeFixtureHandler({oversize=false,kind='positive'}={}){
 const source=readOwner('test/native-provider-construction-native.test.mjs');
 const start=source.indexOf('  const names=Array.from('),end=source.indexOf('  await new Promise(done=>server.listen(',start);
 assert.ok(start>=0&&end>start,'original native response handler required');
 return new Function('count','versions','kind','oversize','sri','old','fresh','once','createServer','base',
  source.slice(start,end)+'\nreturn {handler:server,calls,activity:()=>({active,maximumActive})};')(
   1,['1.0.0'],kind,oversize,'sha512-'+Buffer.alloc(64,7).toString('base64'),
   '2001-01-01T00:00:00.000Z','2026-11-03T00:00:00.000Z',once,handler=>handler,'http://fixture.invalid/');
}
class FixtureResponse extends EventEmitter{
 constructor(){super();this.status=null;this.headers={};this.bytes=0;this.parts=[];this.ended=false;}
 writeHead(status,headers={}){this.status=status;this.headers=headers;return this;}
 write(chunk){this.bytes+=Buffer.byteLength(chunk);if(this.bytes<=16384)this.parts.push(chunk);return true;}
 end(chunk=''){this.write(chunk);this.ended=true;this.emit('close');return this;}
}
async function fixtureResponse(fixture,accept){
 const response=new FixtureResponse();
 await fixture.handler({method:'GET',url:'/native-cache-fixture-0',headers:{accept}},response);
 assert.equal(response.ended,true);assert.equal(fixture.activity().active,0);
 return response;
}
test('NVP-7 exact native fixture distinguishes abbreviated Accept from full JSON fallback',async()=>{
 for(const [accept,full] of [[abbreviatedAccept,false],['application/vnd.npm.install-v1+json',false],
  ['application/json; q=0.8, application/vnd.npm.install-v1+json; q=1.0, */*',false],
  [fullAccept,true],['application/json',true],[undefined,false]]){
  const fixture=nativeFixtureHandler(),response=await fixtureResponse(fixture,accept);
  assert.equal(response.status,200);assert.equal(response.headers['content-type'],'application/json');
  const body=JSON.parse(response.parts.join(''));
  assert.equal(Object.hasOwn(body,'time'),full,'only the full route returns publication-time metadata');
  if(full)assert.equal(body.time['1.0.0'],'2001-01-01T00:00:00.000Z');
  assert.equal(body.versions['1.0.0'].name,'native-cache-fixture-0');
  assert.equal(fixture.calls.get('native-cache-fixture-0 '+(full?'full':'abbreviated')),1);
 }
});
test('NVP-7 oversized native fixture never returns the full-metadata payload for abbreviated Accept',async()=>{
 const fixture=nativeFixtureHandler({oversize:true});
 const abbreviated=await fixtureResponse(fixture,abbreviatedAccept);
 assert.equal(abbreviated.status,200);assert.ok(abbreviated.bytes<4096,'abbreviated response must stay small');
 assert.equal(Object.hasOwn(JSON.parse(abbreviated.parts.join('')),'time'),false);
 const full=await fixtureResponse(fixture,fullAccept);
 assert.equal(full.status,200);assert.ok(full.bytes>8388608,'original oversized full response must remain oversized');
 assert.equal(fixture.calls.get('native-cache-fixture-0 abbreviated'),1);
 assert.equal(fixture.calls.get('native-cache-fixture-0 full'),1);
});
test('NVP-7 transport-refusal fixture preserves the first full failure after abbreviated requests',async()=>{
 const fixture=nativeFixtureHandler({kind:'transport'});
 const abbreviated=await fixtureResponse(fixture,abbreviatedAccept);
 assert.equal(abbreviated.status,200);assert.equal(Object.hasOwn(JSON.parse(abbreviated.parts.join('')),'time'),false);
 const failed=await fixtureResponse(fixture,fullAccept);
 assert.equal(failed.status,500);assert.deepEqual(JSON.parse(failed.parts.join('')),{error:'original fixture transport failure'});
 const recovered=await fixtureResponse(fixture,fullAccept);
 assert.equal(recovered.status,200);assert.ok(Object.hasOwn(JSON.parse(recovered.parts.join('')),'time'));
 assert.equal(fixture.calls.get('native-cache-fixture-0 abbreviated'),1);
 assert.equal(fixture.calls.get('native-cache-fixture-0 full'),2);
});

// Synthetic low-entropy content is deliberately guessable. Hashing it is not
// permission to publish it. These are confidentiality controls, not credentials.
test('public diagnostics never publish low-entropy raw-content or bounded-prefix fingerprints',t=>{
 const {state,fixture}=ownedDiagnosticFixture(t);
 const sha=text=>createHash('sha256').update(text).digest('hex');
 for(const oversized of [false,true]){
  const secret='0042',outerOut=oversized?secret.repeat(70000):secret,outerErr='pin='+outerOut;
  const values=new Map([
   [join(fixture,'native.stdout'),outerOut],
   [join(fixture,'native.stderr'),outerErr],
   [join(state,'native-receiving.json'),JSON.stringify({received:[],privatePin:oversized?secret.repeat(140000):secret})]
  ]);
  for(const [path,value] of values)writeFileSync(path,value);
  const emitted=[];
  const result=emitNativeFailureDiagnostics(state,{stdout:outerOut,stderr:outerErr,
   terminal:{status:1,signal:null,error:null}},value=>emitted.push(value));
  const published=JSON.stringify(emitted);
  for(const value of [...values.values(),outerOut,outerErr]){
   const bytes=Buffer.from(value);
   for(const length of [bytes.length,262144,524288])assert.ok(!published.includes(sha(bytes.subarray(0,length))),
    'public diagnostics must not fingerprint arbitrary raw content');
  }
  assert.ok(!published.includes(secret));
  assert.doesNotMatch(published,/"(?:evidenceSHA256|hashScope|rawSHA256|stdoutSHA256|stderrSHA256)"/);
  assert.equal(result.state,'diagnostics-only');assert.equal(result.outer.terminal.exitCode,1);
  assert.ok(Buffer.byteLength(published)<=32768);
  if(oversized)assert.equal(result.truncated,true);
  for(const [path,value] of values)assert.equal(readFileSync(path,'utf8'),value,'private original evidence remains unchanged');
 }
});
test('actual final CI summary excludes raw TAP fingerprints while retaining them privately',()=>{
 const ci=readOwner('scripts/receive-native-ci.mjs');
 const start=ci.lastIndexOf('\nconsole.log(');assert.ok(start>=0,'actual final CI summary required');
 const sha=text=>createHash('sha256').update(text).digest('hex');
 const nativeHash=sha('pin=0042'),sourceHash=sha('pin=0123'),installedHash=sha('pin=9876'),archiveHash=sha('public package artifact');
 const receipt={state:'received',nativeProductSource:{state:'received',tests:10,passed:10,outputSHA256:nativeHash},
  source:{tests:3,passed:3,skipped:[],outputSHA256:sourceHash},installed:{tests:3,passed:3,skipped:[],outputSHA256:installedHash},
  archive:{sha256:archiveHash},outsideThisReceiving:['separate native profile']};
 const before=JSON.stringify(receipt),emitted=[];
 new Function('console','receipt','join','stage',ci.slice(start))({log:value=>emitted.push(value)},receipt,join,'/synthetic-private-stage');
 assert.equal(emitted.length,1);
 const published=emitted[0];for(const value of [nativeHash,sourceHash,installedHash])assert.ok(!published.includes(value));
 const summary=JSON.parse(published);
 for(const value of [summary.nativeProductSource,summary.source,summary.installed])assert.equal(Object.hasOwn(value,'outputSHA256'),false);
 assert.equal(summary.nativeProductSource.passed,10);assert.equal(summary.source.passed,3);assert.equal(summary.installed.passed,3);
 assert.equal(summary.archiveSHA256,archiveHash,'public package identity is not a raw-log fingerprint');
 assert.equal(JSON.stringify(receipt),before,'private receiving receipt retains its original output identities');
});

// Real local child failures exercise the exact command body for every remaining
// stage. They are not registry, supplier, archive or installed-consumer runs.
const remainingCIStages=['receiving-contract-tests','source-tests','native-pack','archive-members','consumer-lock','consumer-install','installed-tests'];
function isolatedCICommand(state,publicLines,receipt){
 const ci=readOwner('scripts/receive-native-ci.mjs'),start=ci.indexOf('function command('),end=ci.indexOf('\nfunction suite(',start);
 assert.ok(start>=0&&end>start);
 const digest=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
 const capture=value=>publicLines.push(typeof value==='string'?value:JSON.stringify(value));
 return new Function('spawnSync','writeFileSync','join','digest','receiveProcess','emitNativeFailureDiagnostics','emitCIFailureDiagnostics','receipt','stage','env','console','process','product',
  ci.slice(start,end)+'\nreturn command;')(spawnSync,writeFileSync,join,digest,receiveProcess,
  (directory,outer)=>emitNativeFailureDiagnostics(directory,outer,capture),
  (name,outer)=>diagnostics.emitCIFailureDiagnostics(name,outer,capture),receipt,state,{},
  {error:capture},{stdout:{write:capture},stderr:{write:capture}},
  {directory:secretCanary,distributionSHA256:secretCanary,inventorySHA256:secretCanary});
}
for(const name of remainingCIStages)test('actual '+name+' failures retain raw evidence privately without public disclosure',t=>{
 const root=mkdtempSync(join(tmpdir(),'ci-stage-diagnostics-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const text='Authorization: Bearer '+secretCanary+'; pin=0042';
 for(const mode of ['nonzero','receiving-refusal']){
  const state=join(root,mode);mkdirSync(state);const publicLines=[],receipt={commands:[]};
  const command=isolatedCICommand(state,publicLines,receipt);
  const stdout='TAP version 13\nnot ok 1 - '+text+'\n# tests 1\n# fail 1\n# pass 0\n',stderr='https://user:'+text+'@fixture.invalid/';
  const script='process.stdout.write('+JSON.stringify(stdout)+');process.stderr.write('+JSON.stringify(stderr)+');process.exitCode='+(mode==='nonzero'?1:0)+';';
  let refused;try{command(process.execPath,['-e',script],state,name,()=>{const error=new Error(text,{cause:new Error(text)});error.name=text;throw error;});}catch(error){refused=error;}
  assert.ok(refused);assert.match(refused.message,/CI command refused/);assert.equal(refused.cause,undefined);
  assert.ok(!refused.stack.includes(secretCanary));assert.ok(!refused.stack.includes('0042'));
  const published=publicLines.join('\n');assert.ok(!published.includes(secretCanary));assert.ok(!published.includes('0042'));assert.ok(!published.includes('fixture.invalid'));
  assert.equal(publicLines.length,1);assert.ok(Buffer.byteLength(published)<=32768);
  const view=JSON.parse(publicLines[0]);assert.equal(view.state,'diagnostics-only');assert.equal(view.outer.stage,name);
  assert.equal(view.outer.refusalClass,mode==='nonzero'?'nonzero-exit':'receiving-refused');assert.equal(view.outer.terminal.exitCode,mode==='nonzero'?1:0);
  assert.equal(view.outer.stdout.tap.counters.fail,1);
  assert.equal(readFileSync(join(state,name+'.stdout'),'utf8'),stdout);assert.equal(readFileSync(join(state,name+'.stderr'),'utf8'),stderr);
  const retained=receipt.commands[0];
  for(const [field,raw] of [['stdoutSHA256',stdout],['stderrSHA256',stderr]]){
   assert.equal(retained[field],createHash('sha256').update(raw).digest('hex'));assert.ok(!published.includes(retained[field]));
  }
  if(mode==='receiving-refusal')assert.ok(retained.refusal.message.includes(secretCanary));
  assert.equal(receipt.state,undefined,'command failure cannot promote receiving');
 }
});
test('general CI failure projection bounds output and never echoes unknown stage or terminal data',()=>{
 assert.equal(typeof diagnostics.emitCIFailureDiagnostics,'function');
 for(const [errorCode,signal,expected] of [['ETIMEDOUT',null,'timeout'],['ENOBUFS',null,'output-limit'],['ENOENT',null,'command-error'],[secretCanary,secretCanary,'command-error'],[undefined,'SIGTERM','signalled']]){
  const emitted=[],raw='0042'+secretCanary+'x'.repeat(300000);
  const terminal={status:null,signal,error:errorCode?{name:secretCanary,code:errorCode,message:secretCanary}:null};
  const view=diagnostics.emitCIFailureDiagnostics(secretCanary,{stdout:raw,stderr:raw,terminal},value=>emitted.push(value));
  assert.equal(emitted.length,1);const output=JSON.stringify(emitted[0]);
  assert.equal(view.outer.stage,'unknown-ci-stage');assert.equal(view.outer.refusalClass,expected);
  assert.ok(!output.includes(secretCanary));assert.ok(!output.includes('0042'));
  assert.ok(!output.includes(createHash('sha256').update(raw).digest('hex')));
  assert.ok(Buffer.byteLength(output)<=32768);assert.equal(view.truncated,true);
  assert.equal(view.state,'diagnostics-only');assert.equal(view.outer.stdout.evidence.readBytes,262144);
 }
});
test('outer CI receiving refusal keeps original error in private receipt and throws only a fixed public error',t=>{
 const stage=mkdtempSync(join(tmpdir(),'ci-final-refusal-'));t.after(()=>rmSync(stage,{recursive:true,force:true}));
 const ci=readOwner('scripts/receive-native-ci.mjs'),start=ci.indexOf('}catch(error){receipt.state='),end=ci.indexOf('\n// TAP fingerprints',start);
 assert.ok(start>=0&&end>start);
 const receipt={nativeProductSource:{state:'running'}},original=new Error(secretCanary,{cause:new Error('pin=0042')});original.name=secretCanary;
 let refused;try{new Function('original','receipt','writeFileSync','join','stage','try{throw original;'+ci.slice(start,end))(original,receipt,writeFileSync,join,stage);}catch(error){refused=error;}
 assert.ok(refused);assert.match(refused.message,/CI receiving refused/);assert.equal(refused.cause,undefined);assert.ok(!refused.stack.includes(secretCanary));
 const retained=JSON.parse(readFileSync(join(stage,'receipt.json'),'utf8'));
 assert.equal(retained.state,'refused');assert.equal(retained.nativeProductSource.state,'refused');
 assert.equal(retained.failure.message,secretCanary);assert.equal(retained.failure.name,secretCanary);
});

// Public diagnostics allocation follows the original source confidentiality contract.
test('public CI requirements preserve private raw evidence without claiming hosted durability',()=>{
 const ci=readOwner('native-ci-receiving.spec.md');
 const native=readOwner('native-store-assembly.spec.md');
 const source=readOwner('native-metadata-session.spec.md');
 const requirement=JSON.parse(readOwner('data/records/requirements-records/finish-native-pnpm-verification-receiving.json'));
 const diagnostic=requirement['met-when'].find(row=>row.cell.endsWith(':bounded-diagnostics')).says;
 assert.match(source,/secret-derived fingerprints/);
 assert.match(source,/Raw executor receipts stay private/);
 assert.match(ci,/private local evidence/);assert.match(ci,/only allowlisted/);
 assert.match(ci,/raw-output fingerprints/);assert.match(ci,/durable hosted retention/);
 assert.match(native,/private local evidence/);assert.match(native,/secret-derived fingerprints/);
 assert.match(native,/durable hosted-retention/);
 assert.match(diagnostic,/stdout\/stderr and original refusal privately/);
 assert.match(diagnostic,/durable hosted retention/);
 assert.doesNotMatch(ci,/emits its already bounded stdout\/stderr/);
 assert.doesNotMatch(native,/failed process output in the\noriginal CI job log/);
});
