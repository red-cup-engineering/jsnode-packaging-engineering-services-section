#!/usr/bin/env node
// Explicit native integration test. Never substitutes a Node-only pass or fetches inputs.
import fs from'node:fs';
import path from'node:path';
import os from'node:os';
import assert from'node:assert/strict';
import{createHash}from'node:crypto';
import{spawnSync}from'node:child_process';
import{pathToFileURL}from'node:url';
import{isDeepStrictEqual}from'node:util';
const providerFixture={"package.json":"{\"name\":\"@fixture/runtime\",\"version\":\"1.0.0\",\"dependencies\":{\"@fixture/main\":\"1.0.0\"}}","node_modules/@fixture/main/package.json":"{\"name\":\"@fixture/main\",\"version\":\"1.0.0\",\"type\":\"module\",\"exports\":{\".\":{\"import\":\"./old.mjs\",\"require\":\"./old.cjs\"},\"./identity\":{\"import\":\"./identity.mjs\",\"require\":\"./identity.cjs\"}},\"imports\":{\"#inside\":{\"import\":\"./inside.mjs\",\"require\":\"./inside.cjs\"}}}","node_modules/@fixture/main/old.mjs":"import a from\"./child.mjs\";import b from\"#inside\";import c from\"@fixture/main/identity\";export default a+b+c;\n","node_modules/peer/package.json":"{\"name\":\"peer\",\"version\":\"1.0.0\",\"type\":\"module\",\"exports\":{\"import\":\"./esm.mjs\",\"require\":\"./cjs.cjs\"},\"dependencies\":{\"optional\":\"1.0.0\",\"@fixture/main\":\"1.0.0\"},\"optionalDependencies\":{\"optional\":\"1.0.0\"}}","node_modules/peer/esm.mjs":"import old from\"@fixture/main\";if(old!==11)throw Error(\"old native ESM context changed\");export default 5;\n","node_modules/peer/cjs.cjs":"if(require(\"@fixture/main\")!==11)throw Error(\"old native CJS context changed\");module.exports=7;\n","node_modules/peer/asset.txt":"unchanged provider asset\n","node_modules/@fixture/main/old.cjs":"module.exports=require(\"./child.cjs\")+require(\"#inside\")+require(\"@fixture/main/identity\");\n","node_modules/@fixture/main/child.mjs":"export default 1;\n","node_modules/@fixture/main/inside.mjs":"export default 3;\n","node_modules/@fixture/main/identity.mjs":"export default 7;\n","node_modules/@fixture/main/child.cjs":"module.exports=1;\n","node_modules/@fixture/main/inside.cjs":"module.exports=3;\n","node_modules/@fixture/main/identity.cjs":"module.exports=7;\n"};
const providerScript="(use-modules (guix store) (guix gexp) (guix monads) (guix derivations) (json) (srfi srfi-1))\n(define input (json->scm (current-input-port)))\n(define files (assoc-ref input \"fixture\"))\n(define provider (computed-file \"native-code-provider-fixture\"\n (with-imported-modules '((guix build utils))\n #~(begin (use-modules (guix build utils))\n   (for-each (lambda (pair)\n     (let ((file (string-append #$output \"/\" (car pair))))\n       (mkdir-p (dirname file))\n       (call-with-output-file file (lambda (port) (display (cdr pair) port)))))\n    '#$files)))))\n\n(with-store store\n (set-build-options store #:use-substitutes? #f #:use-build-hook? #f)\n (for-each (lambda(path) (unless (valid-path? store path) (error \"UNRECEIVED native test input\" path)))\n  (vector->list (assoc-ref input \"roots\")))\n (let* ((d (run-with-store store (lower-object provider))) (out (derivation->output-path d))\n        (prior (valid-path? store out))\n        (missing (derivation-prerequisites d (lambda(i)(every (lambda(p)(valid-path? store p)) (derivation-input-output-paths i))))))\n  (unless (null? missing) (error \"UNRECEIVED: native provider fixture would build missing prerequisites\"))\n  (display(scm->json-string `((kind . \"native-test-provider-plan\")(path . ,out)(derivation . ,(derivation-file-name d))(preexisting . ,prior))))(newline)(force-output)\n  (display(scm->json-string '((kind . \"native-test-build-started\")(phase . \"provider\"))))(newline)(force-output)\n  (build-derivations store (list d))\n  (display(scm->json-string '((kind . \"native-test-build-terminal\")(phase . \"provider\"))))(newline)(force-output)\n  (let ((link (string-append (assoc-ref input \"root\") \"/provider-gcroot\"))) (symlink out link) (add-indirect-root store link))\n  (let ((link (string-append (assoc-ref input \"root\") \"/caller-gcroot\"))) (symlink (assoc-ref input \"sourceCaller\") link) (add-indirect-root store link))\n  (display (scm->json-string `((kind . \"native-test-provider\") (path . ,out) (derivation . ,(derivation-file-name d)) (preexisting . ,prior)))) (newline)))\n";
const constructionScript="\n(use-modules (native-code-programme) (guix store) (guix gexp) (guix monads) (guix derivations) (json) (srfi srfi-1))\n(define i (json->scm (current-input-port)))\n(define root (assoc-ref i \"root\"))\n(define provider (assoc-ref i \"provider\"))\n(define (construct name reuse)\n (native-code-construction (string-append root \"/\" name) \"scripts/run.mjs\"\n #:node-program (assoc-ref i \"node\") #:parser-module (assoc-ref i \"parser\")\n #:policy-module (assoc-ref i \"policy\") #:bill-file (string-append root \"/provider-bill.json\")\n #:incumbent-package (string-append provider \"/node_modules/@fixture/main\")\n #:reuse-product reuse))\n(with-store store\n (set-build-options store #:use-substitutes? #f #:use-build-hook? #f)\n (define c (construct \"candidate-one\" #f))\n (define d (run-with-store store (lower-object (native-code-construction-input c))))\n (define output (derivation->output-path d))\n (define previous (valid-path? store output))\n (define missing (derivation-prerequisites d (lambda(x)(every (lambda(p)(valid-path? store p)) (derivation-input-output-paths x)))))\n (unless (null? missing) (error \"UNRECEIVED: native fixture refuses cold prerequisites\"))\n (display (scm->json-string `((kind . \"native-test-plan\") (output . ,output) (derivation . ,(derivation-file-name d)) (preexisting . ,previous)))) (newline)\n (force-output)\n (display(scm->json-string '((kind . \"native-test-build-started\")(phase . \"programme\"))))(newline)(force-output)\n (build-derivations store (list d))\n (display(scm->json-string '((kind . \"native-test-build-terminal\")(phase . \"programme\"))))(newline)(force-output)\n (display(scm->json-string `((kind . \"native-test-built\")(output . ,output)(source . ,(readlink(string-append output \"/.native-code/source\"))))))(newline)(force-output)\n (define p (receive-native-code-output c output))\n (define source (native-code-product-source p))\n (define c2 (construct \"candidate-two\" p))\n (define d2 (run-with-store store (lower-object (native-code-construction-input c2))))\n (unless (equal? output (derivation->output-path d2)) (error \"two source directories changed identity\"))\n (unless (equal? (native-code-product-entry p) \"node_modules/@fixture/main/scripts/run.mjs\") (error \"tree coordinate changed\"))\n (for-each (lambda(pair)\n  (let ((file (string-append root \"/\" (car pair))))\n   (symlink (cdr pair) file) (add-indirect-root store file)))\n  (list (cons \"programme-gcroot\" output) (cons \"source-gcroot\" source)))\n (display (scm->json-string `((kind . \"native-test-received\") (output . ,output) (source . ,source)\n  (entry . ,(native-code-product-entry p)) (narBytes . ,(path-info-nar-size (query-path-info store output)))\n  (sourceNarBytes . ,(path-info-nar-size (query-path-info store source)))\n  (references . ,(list->vector (references store output))) (twoDirectoriesSameProduct . #t) (sameSourceInputReused . #t)))) (newline))\n";
function run(input,source,body={},extra=[]){
 const argv=['--no-auto-compile','-L',input.guixModules,'-C',input.guixCompiled,'-L',input.sourceCaller+'/src',...extra,'-c',source];
 const r=spawnSync(input.guile,argv,{input:JSON.stringify(body),encoding:'utf8'});
 const rows=String(r.stdout??'').split('\n').flatMap(line=>{try{const x=JSON.parse(line);return x.kind?.startsWith('native-test-')?[x]:[]}catch{return[]}});
 if(r.status!==0){const error=new Error('UNRECEIVED native fixture: '+String(r.stderr??r.error?.message??'').slice(-1200));error.nativeRows=rows;error.nativeUnknown=r.status===null||(source.includes('(build-derivations')&&!rows.some(x=>x.kind==='native-test-build-terminal'));throw error;}
 return rows;
}
async function form(input,provider,root){
const url=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64'),read=p=>fs.readFileSync(input.sourceCaller+'/'+p,'utf8');
const policy=pathToFileURL(input.policy).href;
const parser=pathToFileURL(input.parser).href;
let reader=read('src/native-registry-imports.mjs').replace("'./dependency-policy.mjs'",JSON.stringify(policy)).replace("'./installed-contract-owner.mjs'",JSON.stringify(url(read('src/installed-contract-owner.mjs'))));
const nativeBillURL=url(read('src/native-provider-bill.mjs').replace("'./dependency-policy.mjs'",JSON.stringify(policy)));
let graph=read('src/native-provider-graph.mjs').replace("'./native-registry-imports.mjs'",JSON.stringify(url(reader))).replace("'@red-cup-engineering/javascript-parser-service'",JSON.stringify(parser)).replace("'./native-provider-bill.mjs'",JSON.stringify(nativeBillURL));
let producer=read('src/produce-native-package-programme.mjs').replace('"./native-provider-graph.mjs"',JSON.stringify(url(graph))).replace('"./dependency-policy.mjs"',JSON.stringify(policy)).replace('"./artifact-member-receiving.mjs"',JSON.stringify(pathToFileURL(input.archiveReader).href));
const{produceNativePackageProgramme}=await import(url(producer));
const hash=b=>createHash('sha256').update(b).digest('hex');
const files={
 'package.json':JSON.stringify({name:'@fixture/main',version:'1.0.1',type:'module',dependencies:{peer:'1.0.0'},optionalDependencies:{'declared-absent':'1.0.0'},exports:{import:'./self.mjs',require:'./self.cjs'},imports:{'#inside':'./inside.mjs'}}),
 'self.mjs':'export default 2;\n','self.cjs':'module.exports=2;\n','inside.mjs':'export default 3;\n','asset.txt':'own complete asset\n',
 'scripts/worker.mjs':`import{parentPort,workerData}from'node:worker_threads';import{createRequire}from'node:module';const r=createRequire(import.meta.url);let refused=false,absent=false;try{await import(workerData.old)}catch(e){refused=e.code==='NATIVE_CODE_RESOLUTION_REFUSED'}try{r('declared-absent')}catch(e){absent=e.code==='MODULE_NOT_FOUND'}parentPort.postMessage({peer:r('peer'),refused,absent});`,
 'scripts/child.cjs':`const r=require;let refused=false,absent=false;try{r(process.argv[2])}catch(e){refused=e.code==='NATIVE_CODE_RESOLUTION_REFUSED'}try{r('declared-absent')}catch(e){absent=e.code==='MODULE_NOT_FOUND'}process.send({peer:r('peer'),refused,absent},()=>process.disconnect());`,
 'scripts/run.mjs':`import self from'@fixture/main';import inside from'#inside';import peer from'peer';import fs from'node:fs';import{createRequire}from'node:module';import{Worker}from'node:worker_threads';import{fork}from'node:child_process';const r=createRequire(import.meta.url);const selected=process.getBuiltinModule('module').createRequire(r.resolve('peer'));const explicitOld=selected('@fixture/main');const opaqueSelected=Reflect.get(process,'getBuiltinModule')('module').createRequire(r.resolve('peer'));const opaqueOld=opaqueSelected('@fixture/main');const old=process.argv[2];let absent=false;try{r('declared-absent')}catch(e){absent=e.code==='MODULE_NOT_FOUND'}async function worker(Ctor){const w=new Ctor(new URL('./worker.mjs',import.meta.url),{execArgv:[],workerData:{old:new URL('file:'+old).href}});let data;w.on('message',m=>data=m);await new Promise((ok,no)=>{w.on('error',no);w.on('exit',c=>c===0?ok():no(Error('worker exit'+c)))});return data}async function child(fn){const c=fn(new URL('./child.cjs',import.meta.url),[old],{execArgv:[],stdio:['ignore','pipe','pipe','ipc']});let data;c.on('message',m=>data=m);await new Promise((ok,no)=>{c.on('error',no);c.on('exit',n=>n===0?ok():no(Error('fork exit'+n)))});return data}console.log(JSON.stringify({self,inside,peer,explicitOld,opaqueOld,cjs:r('peer'),asset:fs.readFileSync(new URL('../asset.txt',import.meta.url),'utf8'),absent,worker:await worker(Worker),opaqueWorker:await worker(process.getBuiltinModule('worker_threads').Worker),fork:await child(fork),opaqueFork:await child(process.getBuiltinModule('child_process').fork)}));`
};
if(input.failAfterFixture===true)files['self.mjs']+='// terminal failure lifecycle fixture\n';
const members=Object.entries(files).map(([name,body])=>({path:name,bytes:Buffer.byteLength(body),mode:420,sha256:hash(body)})).sort((a,b)=>a.path<b.path?-1:1),contentSHA256=hash(JSON.stringify(members));
const retained={parentDirectory:provider+'/node_modules/peer',parentName:'peer',parentVersion:'1.0.0',parentManifestSHA256:hash(fs.readFileSync(provider+'/node_modules/peer/package.json')),field:'dependencies',name:'@fixture/main',declared:'1.0.0',directory:provider+'/node_modules/@fixture/main',version:'1.0.0',manifestSHA256:hash(fs.readFileSync(provider+'/node_modules/@fixture/main/package.json'))};
const graphAPI=await import(url(graph));
assert.throws(()=>graphAPI.observeNativePackageContexts({directProviders:[retained.parentDirectory],providerRoots:[provider],replacedPackageRoot:retained.directory}),/replaced package/);
for(const changed of[{...retained,parentManifestSHA256:'0'.repeat(64)},{...retained,manifestSHA256:'0'.repeat(64)},{...retained,declared:'9.9.9'}])
 assert.throws(()=>graphAPI.observeNativePackageContexts({directProviders:[retained.parentDirectory],providerRoots:[provider],replacedPackageRoot:retained.directory,retainedContextEdges:[changed]}));
const bill={kind:'npm.native-provider-bill/v1',sourceIdentity:{kind:'git-source-snapshot',repository:'fixture/source',commit:'a'.repeat(40),tree:'b'.repeat(40),contentSHA256,name:'@fixture/main',version:'1.0.1'},retainedContextEdges:[retained],bindings:[{name:'peer',version:'1.0.0',directory:provider+'/node_modules/peer',manifestSHA256:hash(fs.readFileSync(provider+'/node_modules/peer/package.json'))},{name:'declared-absent',absent:true}]};
const billFile=root+'/provider-bill.json';fs.writeFileSync(billFile,JSON.stringify(bill),{mode:384});
const candidates=[];
try{
 for(const label of ['one','two']){
  const source=root+'/source-'+label,destination=root+'/candidate-'+label;
  for(const [name,body]of Object.entries(files)){const file=path.join(source,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,body,{mode:420});}
  const receiving=await produceNativePackageProgramme({selection:{name:'@fixture/main',version:'1.0.1',sourceCommit:'a'.repeat(40)},sourceSnapshot:{kind:'git-source-snapshot/v1',root:source,repository:'fixture/source',commit:'a'.repeat(40),tree:'b'.repeat(40),contentSHA256,members},incumbent:{runtimeRoot:provider,packageRoot:provider+'/node_modules/@fixture/main'},destination,entry:'scripts/run.mjs',programmeScope:'package',dependencyPolicy:'received',nativeResolution:{profile:'node-guarded/v1',bindings:bill.bindings,retainedContextEdges:bill.retainedContextEdges}});
  candidates.push({label,path:destination,sha256:receiving.nativeObservation.sha256});
 }
 return {candidates,billFile};
}catch(e){throw e;}

}
function receiveNativeProcess(result){
 if(result.status===null||result.signal||result.error){
  const error=new Error('UNRECEIVED native child outcome: '+String(result.error?.message??result.signal??'no exit receiving'));
  error.nativeUnknown=true;throw error;
 }
}
function canonical(file,directory=false){
 assert.equal(typeof file,'string','selected existing native input required');
 assert(path.isAbsolute(file)&&fs.realpathSync(file)===file,'canonical existing input required');
 assert.equal(fs.statSync(file).isDirectory(),directory);
 return file;
}
const rootOf=file=>{const m=/^(\/gnu\/store\/[a-z0-9]{32}-[^/]+)(?:\/|$)/.exec(file);assert(m,'registered native supplier path required');return m[1];};
async function main(){
 const raw=process.argv[2];if(!raw)throw Error('UNRECEIVED: pass one credential-free native input JSON object');
 const input=JSON.parse(raw);
 for(const flag of['--no-global-search-paths','--experimental-vm-modules','--experimental-import-meta-resolve'])
  if(!process.execArgv.includes(flag))throw Error('UNRECEIVED: native test requires '+flag+' before fixture creation');
 for(const key of['node','guile','parser','policy','archiveReader'])canonical(input[key]);
 for(const key of['guixModules','guixCompiled','sourceCaller'])canonical(input[key],true);
 assert.equal(fs.realpathSync(process.execPath),input.node,'run the selected existing Node supplier');
 const cdeKeys=['cdeTest','cdeSource','cdeModules'],selected=cdeKeys.filter(k=>input[k]!==undefined);
 assert(selected.length===0||selected.length===3,'select all original CDE fixture inputs together');
 if(selected.length){canonical(input.cdeTest);canonical(input.cdeSource);canonical(input.cdeModules,true);}
 const roots=[...new Set(['node','guile','parser','policy','archiveReader','guixModules','guixCompiled','sourceCaller'].map(k=>rootOf(input[k])))];
 const members=['src/native-code-programme.scm','scripts/native-code-observer.mjs','src/native-provider-graph.mjs','src/native-registry-imports.mjs','src/installed-contract-owner.mjs','src/native-provider-bill.mjs','src/native-store-resolution-guard.mjs','src/produce-native-package-programme.mjs'];
 for(const member of members){const file=path.join(input.sourceCaller,member);assert(fs.lstatSync(file).isFile()&&fs.realpathSync(file)===file,'received regular Code source member required: '+member);}
 canonical(input.ownerRecord);
 assert(Array.isArray(input.ownerField)&&input.ownerField.length&&input.ownerField.every(k=>typeof k==='string'&&!['__proto__','prototype','constructor'].includes(k)),'original owner custody field required');
 let custody=JSON.parse(fs.readFileSync(input.ownerRecord,'utf8'));
 for(const key of input.ownerField){assert(Object.hasOwn(custody,key),'prepared original owner field absent');custody=custody[key];}
 const {ownerRecord,ownerField,...selection}=input;
 assert(custody.kind==='native-code-guix-test-custody/v1'&&isDeepStrictEqual(custody.inputs,selection),'prepared original owner input differs');
 const root=canonical(custody.root,true),owner=fs.lstatSync(root);
 assert(owner.uid===process.getuid()&&(owner.mode&0o077)===0&&fs.readdirSync(root).length===0,'empty private owner-prepared fixture root required');
 console.log(JSON.stringify({kind:'native-code-guix-test-started',root,sourceCaller:input.sourceCaller}));
 const points=[];let terminal=false,unknown=false,passed=false;
 try{
  const providerRows=run(input,providerScript,{fixture:providerFixture,roots,root,sourceCaller:input.sourceCaller});points.push(...providerRows);const provider=providerRows.find(x=>x.kind==='native-test-provider');
  const formed=await form(input,provider.path,root);
  assert.notEqual(formed.candidates[0].path,formed.candidates[1].path);
  assert.equal(formed.candidates[0].sha256,formed.candidates[1].sha256);
  points.push(...run(input,constructionScript,{...input,root,provider:provider.path}));
  if(input.failAfterFixture===true)assert.fail('forced terminal assertion after native fixture creation');
  const received=points.find(x=>x.kind==='native-test-received');
  assert(received?.twoDirectoriesSameProduct&&received.sameSourceInputReused);
  assert(received.references.includes(provider.path),'provider payload must remain a native reference');
  const home=path.join(root,'home');fs.mkdirSync(home+'/.node_modules',{recursive:true});
  fs.symlinkSync(provider.path+'/node_modules/peer',home+'/.node_modules/declared-absent');
  const old=provider.path+'/node_modules/@fixture/main/old.mjs',runtime=received.output+'/.native-code/run';
  for(const options of['','--enable-source-maps']){
   const r=spawnSync(runtime,[received.output+'/'+received.entry,old],{encoding:'utf8',env:{...process.env,HOME:home,NODE_OPTIONS:options}});
   receiveNativeProcess(r);assert.equal(r.status,0,r.stderr);const x=JSON.parse(r.stdout);
   assert.deepEqual([x.self,x.inside,x.peer,x.cjs,x.asset,x.absent,x.explicitOld,x.opaqueOld],[2,3,5,7,'own complete asset\n',true,11,11]);
   for(const name of['worker','opaqueWorker','fork','opaqueFork'])assert.deepEqual(x[name],{peer:7,refused:true,absent:true});
  }
  const negative="import{Worker}from'node:worker_threads';import{fork}from'node:child_process';let n=0;for(const f of[()=>new Worker(new URL(process.argv[1]),{execArgv:['--global-search-paths']}),()=>fork(new URL(process.argv[1]),[],{execArgv:['--global-search-paths=true']})]){try{f();throw Error('mode accepted')}catch(e){if(e.code!=='NATIVE_CODE_RESOLUTION_REFUSED')throw e;n++}}console.log(n)";
  const denied=spawnSync(runtime,['--input-type=module','-e',negative,'file:'+received.output+'/'+received.entry],{encoding:'utf8'});
  receiveNativeProcess(denied);assert.equal(denied.status,0,denied.stderr);assert.equal(denied.stdout.trim(),'2');
  if(selected.length){
   canonical(input.cdeTest);canonical(input.cdeSource);canonical(input.cdeModules,true);
   const cde=run(input,fs.readFileSync(input.cdeTest,'utf8'),{...input,root,provider:provider.path,output:received.output},['-L',input.cdeModules]);
   assert(cde.some(x=>x.kind==='native-test-cde'&&x.wrongSourceRefused&&x.booleanRefused&&x.wrongEntryRefused));
   points.push(...cde);
  }
  terminal=true;passed=true;
  console.log(JSON.stringify({kind:'native-code-guix-test-passed',points,childrenTerminal:true,cde:selected.length===3,sourceOrigin:'synthetic Git selection; actual members/store received',operatingAdoption:false}));
 }catch(error){
  points.push(...(error.nativeRows??[]));unknown=error.nativeUnknown===true;terminal=!unknown;
  console.error(JSON.stringify({kind:'native-code-guix-test-unreceived',message:String(error.message).replace(/data:text[^ ]*/g,'[source-bound module]').slice(0,1500),root,points,nativeRows:error.nativeRows??[],effectsTerminal:terminal,durableOwnerRecord:input.ownerRecord,ownerField:input.ownerField}));
  error.nativeReported=true;throw error;
 }finally{
  if(terminal){
   for(const name of['provider-gcroot','caller-gcroot','programme-gcroot','source-gcroot'])fs.rmSync(path.join(root,name),{force:true});
   const owned=points.filter(x=>x.preexisting===false).flatMap(x=>[x.derivation,x.path??x.output]);
   // This is exclusively the synthetic fixture source, not a source checkout.
   // Borrowed products keep their source; native delete-specific enforces roots/referrers.
   if(points.some(x=>x.kind==='native-test-plan'&&x.preexisting===false))
    {const source=points.find(x=>x.kind==='native-test-received'||x.kind==='native-test-built')?.source;if(source)owned.push(source);}
   const retire="(use-modules(guix store)(json))(define i(json->scm(current-input-port)))(with-store s(call-with-values(lambda()(delete-paths s(vector->list(assoc-ref i \"paths\"))))(lambda(paths bytes)(display(scm->json-string `((kind . \"native-test-retired\")(paths . ,(list->vector paths))(guestStoreBytes . ,bytes))))(newline))))";
   const result=owned.length?run(input,retire,{paths:[...new Set(owned)]}):[{kind:'native-test-retired',paths:[],borrowedExistingProductsPreserved:true}];
   fs.rmSync(root,{recursive:true,force:true});assert.equal(fs.existsSync(root),false);
   console.log(JSON.stringify({kind:'native-code-guix-test-terminal',ramRetired:true,passed,retirement:result}));
  }
 }
}
main().catch(error=>{if(!error.nativeReported)console.error(JSON.stringify({kind:'native-code-guix-test-unreceived',message:String(error.message).slice(0,1500)}));process.exitCode=1;});
