import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {encodeNativeContextGraph} from '../src/native-context-encoding.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
const equal=isDeepStrictEqual;
const fail=m=>{throw new TypeError('native Code receiving: '+m);};
async function main(){
const [parser,policy,graphFile,readerFile,ownerFile,billFile,root,entry,billPath,...extra]=process.argv.slice(2);
const flags=new Map();for(const flag of extra){const at=flag.indexOf('=');const key=at<0?flag:flag.slice(0,at),value=at<0?true:flag.slice(at+1);if(!['--summary','--native-receipt','--form-reference','--formation-custody','--provider-roots','--incumbent-package','--incumbent-runtime'].includes(key)||flags.has(key))fail('unknown original observer option');flags.set(key,value);}
if(![parser,policy,graphFile,readerFile,ownerFile,billFile,root,entry,billPath].every(x=>typeof x==='string'))fail('fixed original source inputs required');
const encodingFile=fileURLToPath(new URL('../src/native-context-encoding.mjs',import.meta.url)),producerFile=fileURLToPath(new URL('../src/produce-native-package-programme.mjs',import.meta.url));
const sourceInputs=[parser,policy,graphFile,readerFile,ownerFile,billFile,fileURLToPath(import.meta.url),encodingFile,producerFile].map(file=>({file,sha256:hash(fs.readFileSync(file))}));
const data=source=>'data:text/javascript;base64,'+Buffer.from(source).toString('base64');
const replace=(source,from,to)=>{if(source.split(from).length!==2)fail('original module binding shape changed');return source.replace(from,JSON.stringify(to));};
const ownerURL=data(fs.readFileSync(ownerFile,'utf8'));
let reader=replace(fs.readFileSync(readerFile,'utf8'),"'./installed-contract-owner.mjs'",ownerURL);
reader=replace(reader,"'./dependency-policy.mjs'",pathToFileURL(policy).href);
let billSource=replace(fs.readFileSync(billFile,'utf8'),"'./dependency-policy.mjs'",pathToFileURL(policy).href);
let graph=replace(fs.readFileSync(graphFile,'utf8'),"'./native-registry-imports.mjs'",data(reader));
graph=replace(graph,"'@red-cup-engineering/javascript-parser-service'",pathToFileURL(parser).href);
graph=replace(graph,"'./native-provider-bill.mjs'",data(billSource));
const graphURL=data(graph);
const {observeNativeModuleGraph,observeNativePackageContexts,observeNativeResolutionMode}=await import(graphURL);
const {normalizeNativeProviderBill,nativeProviderBillIdentity}=await import(data(billSource));
const expectedBill=normalizeNativeProviderBill(JSON.parse(fs.readFileSync(billPath,'utf8')));
let formed;
if(flags.has('--form-reference')){
 if(flags.has('--native-receipt')||!flags.has('--formation-custody')||!flags.has('--provider-roots')||!flags.has('--incumbent-package')||!flags.has('--incumbent-runtime'))fail('complete original formation selection required');
 const readReference=text=>{const ref=JSON.parse(text);if(!ref||Object.keys(ref).sort().join(',')!=='field,file'||typeof ref.file!=='string'||!Array.isArray(ref.field)||ref.field.some(k=>typeof k!=='string'||!k)||fs.realpathSync(ref.file)!==ref.file)fail('canonical Data record reference required');const before=fs.lstatSync(ref.file);if(!before.isFile())fail('regular Data record required');let value=JSON.parse(fs.readFileSync(ref.file,'utf8'));const after=fs.lstatSync(ref.file);if(['dev','ino','size','mtimeMs','ctimeMs'].some(k=>before[k]!==after[k]))fail('formation Data record changed');for(const key of ref.field){if(!value||!Object.hasOwn(value,key))fail('formation Data field absent');value=value[key];}return value;};
 const snapshot=readReference(flags.get('--form-reference')),custody=readReference(flags.get('--formation-custody'));
 const selectedSource={kind:'git-source-snapshot',repository:snapshot.repository,commit:snapshot.commit,tree:snapshot.tree,contentSHA256:snapshot.contentSHA256,name:expectedBill.sourceIdentity.name,version:expectedBill.sourceIdentity.version};
 if(nativeProviderBillIdentity({kind:'npm.native-provider-bill/v1',sourceIdentity:selectedSource,bindings:expectedBill.bindings,...(expectedBill.retainedContextEdges?{retainedContextEdges:expectedBill.retainedContextEdges}:{})})!==nativeProviderBillIdentity(expectedBill))fail('formation SourceSnapshot differs from operating bill');
 if(custody?.kind!=='npm.native-source-formation-custody/v1'||custody.state!=='prepared'||custody.destination!==root||custody.sourceContentSHA256!==snapshot.contentSHA256||custody.sourceCommit!==snapshot.commit||typeof custody.owner!=='string'||!custody.owner)fail('durable original formation custody differs');
 let producer=replace(fs.readFileSync(producerFile,'utf8'),'"./dependency-policy.mjs"',pathToFileURL(policy).href);
 producer=replace(producer,'"./native-provider-graph.mjs"',graphURL);
 producer=replace(producer,'"./native-context-encoding.mjs"',pathToFileURL(encodingFile).href);
 const {produceNativePackageProgramme}=await import(data(producer));
 const result=await produceNativePackageProgramme({sourceSnapshot:snapshot,selection:{name:expectedBill.sourceIdentity.name,version:expectedBill.sourceIdentity.version,sourceCommit:snapshot.commit},incumbent:{runtimeRoot:flags.get('--incumbent-runtime'),packageRoot:flags.get('--incumbent-package')},destination:root,entry,programmeScope:'package',dependencyPolicy:'received',nativeResolution:{profile:'node-guarded/v1',bindings:expectedBill.bindings,retainedContextEdges:expectedBill.retainedContextEdges,providerRoots:JSON.parse(flags.get('--provider-roots'))}});
 formed=result.nativeReceivingObservation;
 if(!formed)fail('original producer omitted its observation');
}else if(['--formation-custody','--provider-roots','--incumbent-package','--incumbent-runtime'].some(k=>flags.has(k)))fail('formation options without original formation');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
const programme=manifest.nativeProgramme,candidate=programme?.nativeResolution;
if(!['npm.native-store-programme.candidate/v1','npm.native-store-programme.candidate/v2'].includes(candidate?.kind)||candidate.profile!=='node-guarded/v1'||candidate.entry!==entry)fail('original native programme candidate required');
if(nativeProviderBillIdentity({kind:'npm.native-provider-bill/v1',sourceIdentity:candidate.source,bindings:expectedBill.bindings,...(expectedBill.retainedContextEdges?{retainedContextEdges:expectedBill.retainedContextEdges}:{})})!==nativeProviderBillIdentity(expectedBill))fail('operating source selection differs');
if(programme.package!==expectedBill.sourceIdentity.name)fail('selected package coordinate differs');
const own=path.join(root,'node_modules',...programme.package.split('/'));
const ownManifest=JSON.parse(fs.readFileSync(path.join(own,'package.json'),'utf8'));
if(ownManifest.name!==expectedBill.sourceIdentity.name||ownManifest.version!==expectedBill.sourceIdentity.version)fail('actual source package differs');
const declarations=new Map();
for(const field of ['dependencies','optionalDependencies','peerDependencies']){
 const values=ownManifest[field]??{};
 if(!values||typeof values!=='object'||Array.isArray(values))fail('authored source declarations malformed');
 for(const [name,declared]of Object.entries(values)){if(typeof declared!=='string'||!declared)fail('authored source declaration absent');declarations.set(name,{...(declarations.get(name)??{}),[field]:declared});}
}
if(!equal([...declarations.keys()].sort(),expectedBill.bindings.map(b=>b.name).sort()))fail('operating bill differs from authored dependency names');
const bindings=[];
for(const selected of expectedBill.bindings){
 const link=path.join(own,'node_modules',...selected.name.split('/'));
 if(selected.absent===true){try{fs.lstatSync(link);fail('absent native binding is present');}catch(e){if(e.code!=='ENOENT')throw e;}bindings.push({name:selected.name,absent:true});continue;}
 const directory=fs.realpathSync(link),file=path.join(directory,'package.json'),bytes=fs.readFileSync(file),actual=JSON.parse(bytes);
 if(actual.name!==selected.name)fail('actual native provider name differs');
 bindings.push({name:actual.name,version:actual.version,directory,manifestSHA256:hash(bytes),...(selected.contextRoot?{contextRoot:selected.contextRoot}:{})});
}
const observedBill=normalizeNativeProviderBill({kind:'npm.native-provider-bill/v1',sourceIdentity:candidate.source,bindings,...(expectedBill.retainedContextEdges?{retainedContextEdges:expectedBill.retainedContextEdges}:{})});
if(nativeProviderBillIdentity(observedBill)!==nativeProviderBillIdentity(expectedBill))fail('independent native bindings differ');
if(!Array.isArray(candidate.archiveMembers)||candidate.archiveMembers.length>10000)fail('bounded source members required');
let sourceBytes=0;const memberNames=new Set();
for(const member of candidate.archiveMembers){
 if(!member||Object.keys(member).sort().join(',')!=='bytes,mode,path,sha256'||typeof member.path!=='string'||path.isAbsolute(member.path)||member.path.split('/').some(p=>!p||p==='.'||p==='..'||p==='node_modules')||memberNames.has(member.path))fail('closed confined source member required');
 if(!Number.isSafeInteger(member.bytes)||member.bytes<0||!Number.isSafeInteger(member.mode)||member.mode<0||member.mode>511||!/^[a-f0-9]{64}$/.test(member.sha256))fail('source member identity invalid');
 sourceBytes+=member.bytes;if(sourceBytes>67108864)fail('source receiving exceeds original byte bound');memberNames.add(member.path);
}
if(candidate.source.kind!=='git-source-snapshot')fail('this native receiver requires independently received Git SourceSnapshot bytes');
const snapshotMembers=candidate.archiveMembers.map(({path,bytes,mode,sha256})=>({path,bytes,mode,sha256})).sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
if(hash(JSON.stringify(snapshotMembers))!==expectedBill.sourceIdentity.contentSHA256)fail('Git SourceSnapshot content differs');
for(const member of candidate.archiveMembers){
 const file=path.join(own,member.path),s=fs.lstatSync(file);
 if(!s.isFile()||fs.realpathSync(file)!==file||s.size!==member.bytes||Boolean(s.mode&0o111)!==Boolean(member.mode&0o111)||hash(fs.readFileSync(file))!==member.sha256)fail('carried source member differs');
}

const expectedNames=new Set(candidate.archiveMembers.map(m=>m.path)),directories=new Set(),pending=[own],found=[];
for(const name of expectedNames){let dir=path.posix.dirname(name);while(dir!=='.'){directories.add(dir);dir=path.posix.dirname(dir);}}
while(pending.length){
 const directory=pending.pop();
 for(const e of fs.readdirSync(directory,{withFileTypes:true})){
  const file=path.join(directory,e.name),relative=path.relative(own,file).split(path.sep).join('/');
  if(relative==='node_modules')continue;
  if(e.isDirectory()){if(!directories.has(relative))fail('unknown source directory');pending.push(file);}
  else{if(!e.isFile()||!expectedNames.has(relative))fail('unknown source member');found.push(relative);}
 }
}
if(found.length!==expectedNames.size)fail('source member inventory differs');
const roots=[...candidate.storeRoots].sort();
const compact=candidate.kind==='npm.native-store-programme.candidate/v2';
let contexts,moduleGraph,contextsSHA256,packageScopes,retainedContextEdges,opaque;
const receiptPath=flags.get('--native-receipt');
if(receiptPath){
 const receipt=JSON.parse(fs.readFileSync(receiptPath,'utf8')),code=receipt.code;
 if(receipt.kind!=='npm.native-code-inputs/v2'||!code||code.node!==process.version||code.nodeExecutable!==fs.realpathSync(process.execPath)||!equal(code.sourceInputs,sourceInputs)||code.billSHA256!==nativeProviderBillIdentity(expectedBill)||!equal(code.storeRoots,roots)||code.candidateKind!==candidate.kind||code.candidateSHA256!==candidate.sha256||code.contextRepresentationSHA256!==hash(JSON.stringify(candidate.contexts))||code.moduleRepresentationSHA256!==hash(JSON.stringify(candidate.moduleGraph)))fail('Code-issued immutable observation receipt differs');
 const {observedExecArgv,nodeOptions,...mode}=observeNativeResolutionMode();
 if(!equal(mode,candidate.moduleGraph.mode)||!mode.globalSearchPathsDisabled)fail('cached native resolution mode differs');
 if(!Array.isArray(code.packageScopes)||!code.packageScopes.length)fail('Code-issued context scope projection absent');
 contextsSHA256=code.contextsSHA256;packageScopes=code.packageScopes;retainedContextEdges=code.retainedContextEdges??[];opaque=code.opaque;
 if(compact&&candidate.contextsSHA256!==contextsSHA256)fail('cached physical context identity differs');
}else{
 contexts=formed?.contexts??observeNativePackageContexts({directProviders:bindings.filter(b=>b.absent!==true).map(b=>b.directory),providerRoots:roots,replacedPackageRoot:candidate.moduleGraph.replacedPackageRoot,retainedContextEdges:expectedBill.retainedContextEdges});
 if(compact?candidate.contextsSHA256!==contexts.sha256||!equal(candidate.contexts,encodeNativeContextGraph(contexts)):contexts.sha256!==candidate.contexts.sha256||!equal(candidate.contexts,contexts))fail('frozen physical contexts differ');
 moduleGraph=formed?.moduleGraph??await observeNativeModuleGraph({root,entrances:[path.relative(root,path.join(own,entry)).split(path.sep).join('/')],providerRoots:roots,replacedPackageRoot:candidate.moduleGraph.replacedPackageRoot,profile:'guarded-default',retainedContextEdges:expectedBill.retainedContextEdges});
 if(moduleGraph.sha256!==candidate.moduleGraph.sha256)fail('observed module identity differs');
 contextsSHA256=contexts.sha256;packageScopes=contexts.contexts.map(c=>c.directory);retainedContextEdges=contexts.retainedContextEdges??[];opaque=moduleGraph.opaque.length;
}
if(!Array.isArray(candidate.bindings)||candidate.bindings.length!==bindings.length)fail('explicit native binding facts required');
const facts=candidate.bindings.map(f=>{
 const actual=bindings.find(b=>b.name===f.name);if(!actual)fail('native fact is not in the operating bill');
 return actual.absent?{name:actual.name,declared:declarations.get(actual.name),absent:true}:{name:actual.name,declared:declarations.get(actual.name),version:actual.version,directory:actual.directory,manifestSHA256:actual.manifestSHA256,...(actual.contextRoot?{contextRoot:actual.contextRoot}:{})};
});
if(!equal(facts,candidate.bindings))fail('native authored/actual binding facts differ');
const moduleIdentity=receiptPath?candidate.moduleGraph:(({processObservation,...value})=>value)(moduleGraph);
const identity={profile:candidate.profile,source:expectedBill.sourceIdentity,...(compact?{contextsSHA256}:{contexts:contexts??candidate.contexts}),moduleGraph:moduleIdentity,providerScope:candidate.providerScope,bindings:facts,storeRoots:roots};
if(hash(JSON.stringify(identity))!==candidate.sha256)fail('actual native programme identity differs');
if(!receiptPath)for(const module of moduleGraph.modules){if(module.file.startsWith('$root/'))continue;if(!packageScopes.some(c=>module.file===c||module.file.startsWith(c+'/')))fail('observed module leaves frozen package contexts');}
for(const input of sourceInputs)if(hash(fs.readFileSync(input.file))!==input.sha256)fail('original observer source changed');
const receiving={kind:'npm.native-store-programme.observed/v1',candidateKind:candidate.kind,candidateSHA256:candidate.sha256,billSHA256:nativeProviderBillIdentity(expectedBill),moduleGraphSHA256:candidate.moduleGraph.sha256,contextsSHA256,
 contextRepresentationSHA256:hash(JSON.stringify(candidate.contexts)),moduleRepresentationSHA256:hash(JSON.stringify(candidate.moduleGraph)),
 billJSON:JSON.stringify(expectedBill),sourceInputs,storeRoots:roots,packageScopes,retainedContextEdges,replacedPackageRoot:candidate.moduleGraph.replacedPackageRoot,node:process.version,nodeExecutable:fs.realpathSync(process.execPath),opaque,sourceBytes:candidate.archiveMembers.reduce((n,m)=>n+m.bytes,0),sourceFiles:candidate.archiveMembers.length};
console.log(JSON.stringify(flags.has('--summary')?{kind:'npm.native-store-programme.verified/v1',billSHA256:receiving.billSHA256,moduleGraphSHA256:receiving.moduleGraphSHA256,contextsSHA256}:receiving));

}
main().catch(error=>{console.error(JSON.stringify({code:'NATIVE_CODE_RECEIVING_REFUSED',reason:String(error.message).slice(0,512)}));process.exitCode=1;});
