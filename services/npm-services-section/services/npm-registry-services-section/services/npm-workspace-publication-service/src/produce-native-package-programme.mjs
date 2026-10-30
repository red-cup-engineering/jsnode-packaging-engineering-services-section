import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";
import {createHash} from "node:crypto";
import {spawnSync} from "node:child_process";
import {isDeepStrictEqual} from "node:util";
import {isExactSemver} from "./dependency-policy.mjs";

const namePattern=/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
const within=(root,file)=>{const part=path.relative(root,file);return part===""||(!path.isAbsolute(part)&&part!==".."&&!part.startsWith(".."+path.sep));};
const hash=bytes=>createHash("sha256").update(bytes).digest("hex");
const limits={members:10000,bytes:67108864,archiveBytes:16777216,tarBytes:67108864,metadataBytes:1048576,sourcePaths:100000,sourceRepositories:64};
function requireThat(condition,message){if(!condition)throw new TypeError(message);}
function directory(value){
 requireThat(typeof value==="string"&&path.isAbsolute(value)&&fs.realpathSync(value)===value&&fs.lstatSync(value).isDirectory(),"canonical native context directory required");
 return value;
}
function mapOf(manifest,field){
 const entries=manifest[field]??{};
 requireThat(entries!==null&&typeof entries==="object"&&!Array.isArray(entries),"invalid "+field);
 requireThat(Object.keys(entries).length<=512,"native direct provider bound exceeded");
 for(const [name,version]of Object.entries(entries))
  requireThat(namePattern.test(name)&&name.length<=214&&isExactSemver(version),"exact native dependency required: "+name);
 return entries;
}
function literal(value){
 return typeof value==="string"&&value.length>0&&!path.isAbsolute(value)&&!/[\\\x00-\x1f\x7f]/u.test(value)
  &&value.split("/").every(part=>part&&part!=="."&&part!=="..");
}
/** Only manifests are reobserved here. Machine receiving separately owns
 * immutability of the complete referenced native provider inputs.
 */
function readContextManifest(file,runtimeRoot,witnesses){
 const real=fs.realpathSync(file);
 requireThat(within(runtimeRoot,real),"provider manifest escapes received context");
 const info=fs.lstatSync(real);
 requireThat(info.isFile()&&info.size<=1048576,"bounded native package manifest required");
 const bytes=fs.readFileSync(real);
 witnesses.set(real,hash(bytes));
 return JSON.parse(bytes);
}
function providersFor(packageRoot,manifest,runtimeRoot,witnesses){
 const required=mapOf(manifest,"dependencies"),optional=mapOf(manifest,"optionalDependencies"),peers=mapOf(manifest,"peerDependencies");
 const names=new Set([...Object.keys(required),...Object.keys(optional),...Object.keys(peers)]);
 requireThat(names.size<=512,"native direct provider bound exceeded");
 const lookup=createRequire(path.join(packageRoot,"package.json"));
 const providers=new Map(),absent=[];
 for(const name of names){
  const versions=new Set([required[name],optional[name],peers[name]].filter(v=>v!==undefined));
  requireThat(versions.size===1,"incompatible direct provider declarations: "+name);
  let found=false;
  for(const base of lookup.resolve.paths(name)??[]){
   const candidate=path.join(base,name,"package.json");
   try{fs.lstatSync(candidate);}catch(error){if(error.code==="ENOENT"||error.code==="ENOTDIR")continue;throw error;}
   const actual=readContextManifest(candidate,runtimeRoot,witnesses),root=fs.realpathSync(path.dirname(candidate));
   requireThat(within(runtimeRoot,root),"provider escapes received context: "+name);
   requireThat(actual.name===name&&actual.version===[...versions][0],"native provider identity mismatch: "+name);
   providers.set(name,root);found=true;break;
  }
  if(!found){
   requireThat(!Object.hasOwn(required,name)||Object.hasOwn(optional,name),"required dependency unavailable: "+name);
   absent.push(name);
  }
 }
 return {providers,absent};
}
function receiveGitSnapshot(snapshot){
 requireThat(snapshot&&Object.getPrototypeOf(snapshot)===Object.prototype&&Object.keys(snapshot).every(k=>['kind','root','repository','commit','tree','contentSHA256','members'].includes(k))&&snapshot.kind==='git-source-snapshot/v1',"explicit Git source snapshot required");
 const root=directory(snapshot.root);
 requireThat(/^[A-Za-z0-9_.-]+[/][A-Za-z0-9_.-]+$/.test(snapshot.repository)&&/^[a-f0-9]{40}$/.test(snapshot.commit)&&/^[a-f0-9]{40}$/.test(snapshot.tree),"Git source selection identity required");
 requireThat(Array.isArray(snapshot.members)&&snapshot.members.length<=limits.members,"bounded complete source members required");
 requireThat(snapshot.members.every(m=>m&&Object.getPrototypeOf(m)===Object.prototype&&Object.keys(m).every(k=>['path','bytes','mode','sha256'].includes(k))),"closed Git source members required");
 const members=snapshot.members.map(({path,bytes,mode,sha256})=>({path,bytes,mode,sha256})).sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0),names=new Set();let total=0;
 for(const m of members){
  requireThat(m&&Object.getPrototypeOf(m)===Object.prototype&&Object.keys(m).every(k=>['path','bytes','mode','sha256'].includes(k))&&literal(m.path)&&!m.path.split('/').includes('node_modules')&&!names.has(m.path),"confined regular Git source member required");
  names.add(m.path);requireThat(Number.isSafeInteger(m.bytes)&&m.bytes>=0&&Number.isSafeInteger(m.mode)&&m.mode>=0&&m.mode<=511&&/^[a-f0-9]{64}$/.test(m.sha256),"Git member identity required");
  total+=m.bytes;requireThat(total<=limits.bytes,"Git source byte bound exceeded");
  const file=path.join(root,m.path),s=fs.lstatSync(file);
  requireThat(s.isFile()&&fs.realpathSync(file)===file&&s.size===m.bytes&&hash(fs.readFileSync(file))===m.sha256,"Git source member differs");
 }
 const directoryNames=new Set(['']);for(const name of names){let parent=path.posix.dirname(name);while(parent!=='.'){directoryNames.add(parent);parent=path.posix.dirname(parent);}}
 const pending=[root],actual=[];
 while(pending.length){
  for(const entry of fs.readdirSync(pending.pop(),{withFileTypes:true})){
   const file=path.join(entry.parentPath,entry.name);
   if(entry.isDirectory()){requireThat(directoryNames.has(path.relative(root,file).split(path.sep).join('/')),'Git source snapshot has undeclared directory');pending.push(file);}
   else{requireThat(entry.isFile(),"Git source snapshot has nonregular member");actual.push(path.relative(root,file).split(path.sep).join('/'));}
  }
 }
 requireThat(isDeepStrictEqual(actual.sort(),[...names].sort()),"Git source members are incomplete");
 requireThat(hash(JSON.stringify(members))===snapshot.contentSHA256,"Git source content identity differs");
 requireThat(names.has('package.json'),"Git source package manifest absent");
 return {archive:{members:members.map(m=>({...m,kind:'file'})),manifestText:fs.readFileSync(path.join(root,'package.json'),'utf8')},
  observation:{kind:'git-source-snapshot/v1',contentSHA256:snapshot.contentSHA256},snapshot:{...snapshot,root}};
}
function nativeProvidersFor(manifest,bindings,witnesses){
 const declared=new Map();
 for(const field of ['dependencies','optionalDependencies','peerDependencies'])
  for(const [name,version]of Object.entries(manifest[field]??{})){
   requireThat(namePattern.test(name)&&typeof version==='string'&&version.length>0,'authored native dependency declaration required');
   declared.set(name,{...(declared.get(name)??{}),[field]:version});
  }
 requireThat(Array.isArray(bindings)&&bindings.length===declared.size,"one explicit native binding per authored dependency required");
 const providers=new Map(),absent=[],facts=[],storeRoots=new Set();
 for(const binding of bindings){
  requireThat(binding&&Object.getPrototypeOf(binding)===Object.prototype&&Object.keys(binding).every(k=>['name','version','directory','manifestSHA256','contextRoot','absent'].includes(k))&&declared.has(binding.name)&&!facts.some(f=>f.name===binding.name),"closed unique native provider binding required");
  if(binding.absent===true){
   requireThat((!Object.hasOwn(manifest.dependencies??{},binding.name)||Object.hasOwn(manifest.optionalDependencies??{},binding.name))&&(!Object.hasOwn(manifest.peerDependencies??{},binding.name)||manifest.peerDependenciesMeta?.[binding.name]?.optional===true),"required native dependency or peer cannot be absent");
   requireThat(Object.keys(binding).every(k=>['name','absent'].includes(k)),"absent native binding has live supplier fields");
   absent.push(binding.name);facts.push({name:binding.name,declared:declared.get(binding.name),absent:true});continue;
  }
  const dir=directory(binding.directory),store=/^[/]gnu[/]store[/][a-z0-9]{32}-[^/]+/u.exec(dir)?.[0];
  requireThat(store&&typeof binding.manifestSHA256==='string'&&/^[a-f0-9]{64}$/.test(binding.manifestSHA256),"explicit immutable native supplier identity required");
  const actual=readContextManifest(path.join(dir,'package.json'),store,witnesses);
  requireThat(actual.name===binding.name&&actual.version===binding.version&&witnesses.get(path.join(dir,'package.json'))===binding.manifestSHA256,"native provider binding changed");
  providers.set(binding.name,dir);storeRoots.add(binding.contextRoot??store);
  facts.push({name:binding.name,declared:declared.get(binding.name),version:binding.version,directory:dir,manifestSHA256:binding.manifestSHA256,...(binding.contextRoot?{contextRoot:binding.contextRoot}:{})});
 }
 return {providers,absent,facts,storeRoots:[...storeRoots].sort()};
}
function linkProvider(modules,name,provider){
 const target=path.join(modules,...name.split("/"));
 fs.mkdirSync(path.dirname(target),{recursive:true,mode:0o700});
 fs.symlinkSync(provider,target,"dir");
}

/** Construct one programme from a verified changed package and unchanged
 * qualified native provider contexts. No dependency payload is installed,
 * copied, resolved afresh, or claimed to be a portable/frozen PNPM closure.
 * The original machine owner must receive and root providerInputs before use.
 */
export async function produceNativePackageProgramme({archivePath,integrity,selection,incumbent,destination,entry,dependencyPolicy="unchanged",programmeScope="root",nativeResolution,sourceSnapshot}={}){
 requireThat(selection&&typeof selection.name==="string"&&namePattern.test(selection.name)&&selection.name.length<=214&&isExactSemver(selection.version)
  &&typeof selection.sourceCommit==="string"&&/^[a-f0-9]{40}$/.test(selection.sourceCommit),"exact native package/source selection required");
 requireThat(dependencyPolicy==="unchanged"||dependencyPolicy==="received","dependencyPolicy must be unchanged or received");
 requireThat(programmeScope==="root"||programmeScope==="package","programmeScope must be root or package");
 requireThat(literal(entry),"confined programme entry required");
 requireThat(typeof destination==="string"&&path.isAbsolute(destination)&&path.normalize(destination)===destination,"canonical absolute destination required");
 let nativeStoreRoot,observeNativeModuleGraph,observeNativePackageContexts,encodeNativeContextGraph;
 if(nativeResolution!==undefined){
  ({observeNativeModuleGraph,observeNativePackageContexts}=await import("./native-provider-graph.mjs"));
  ({encodeNativeContextGraph}=await import("./native-context-encoding.mjs"));
  requireThat(nativeResolution&&Object.getPrototypeOf(nativeResolution)===Object.prototype&&Object.keys(nativeResolution).every(k=>['profile','expectedSHA256','bindings','retainedContextEdges','providerRoots','contextEncoding'].includes(k))&&nativeResolution.profile==='node-guarded/v1',"explicit native module-resolution profile required");
  requireThat(nativeResolution.contextEncoding===undefined||['gzip','identity'].includes(nativeResolution.contextEncoding),'unknown native context encoding');
  requireThat(nativeResolution.expectedSHA256===undefined||/^[a-f0-9]{64}$/.test(nativeResolution.expectedSHA256),"native expected identity must be SHA256");
 }
 const runtimeRoot=directory(incumbent?.runtimeRoot),packageRoot=directory(incumbent?.packageRoot);
 if(nativeResolution!==undefined){
  nativeStoreRoot=/^(\/gnu\/store\/[a-z0-9]{32}-[^/]+)(?:\/|$)/.exec(runtimeRoot)?.[1];
  requireThat(nativeStoreRoot!==undefined,"native context must be within an original immutable store item");
 }
 requireThat(within(runtimeRoot,packageRoot),"package context outside native input");
 requireThat(!within(runtimeRoot,destination)&&!within(destination,runtimeRoot),"destination overlaps provider context");
 requireThat(sourceSnapshot===undefined?(typeof archivePath==="string"&&path.isAbsolute(archivePath)&&!within(destination,archivePath)):(archivePath===undefined&&integrity===undefined&&!within(destination,sourceSnapshot.root)&&!within(sourceSnapshot.root,destination)),"exactly one independent source archive or Git snapshot required");
 directory(path.dirname(destination));
 try{fs.lstatSync(destination);throw new TypeError("destination already exists");}catch(error){if(error.code!=="ENOENT")throw error;}
 const witnesses=new Map();
 const current=readContextManifest(path.join(packageRoot,"package.json"),runtimeRoot,witnesses);
 const rootManifest=readContextManifest(path.join(runtimeRoot,"package.json"),runtimeRoot,witnesses);
 requireThat(current.name===selection.name,"incumbent package name differs");
 requireThat(mapOf(rootManifest,"dependencies")[selection.name]===current.version,"selected package is not the native root's direct dependency");
 const received=sourceSnapshot===undefined?await(await import('./artifact-member-receiving.mjs')).readRegistryArchiveMembers({path:archivePath,integrity,limits}):receiveGitSnapshot(sourceSnapshot);
 requireThat(!received.archive.members.some(member=>member.path.split("/").includes("node_modules")),"archive carries a dependency installation");
 const incoming=JSON.parse(received.archive.manifestText);
 requireThat(incoming.name===selection.name&&incoming.version===selection.version&&(sourceSnapshot===undefined?incoming.gitHead===selection.sourceCommit:sourceSnapshot.commit===selection.sourceCommit),"archive package/source identity differs");
 if(dependencyPolicy==="unchanged"){
  for(const field of ["dependencies","optionalDependencies","peerDependencies"])
   requireThat(isDeepStrictEqual(mapOf(current,field),mapOf(incoming,field)),"dependency context changed: "+field);
 }
 const selected=nativeResolution?.bindings!==undefined?nativeProvidersFor(incoming,nativeResolution.bindings,witnesses):providersFor(packageRoot,dependencyPolicy==="unchanged"?current:incoming,runtimeRoot,witnesses);
 const rootProviders=programmeScope==="root"?providersFor(runtimeRoot,rootManifest,runtimeRoot,witnesses):{providers:new Map(),absent:[]};
 requireThat(nativeResolution?.bindings===undefined||programmeScope==='package','explicit native bill requires selected package scope');
 const nativeProviderRoots=nativeResolution===undefined?[runtimeRoot]:[...new Set(nativeResolution.providerRoots??[nativeStoreRoot,...(selected.storeRoots??[])])].sort();
 if(nativeResolution?.providerRoots!==undefined)requireThat(Array.isArray(nativeResolution.providerRoots)&&nativeResolution.providerRoots.length===nativeProviderRoots.length&&nativeProviderRoots.every(p=>typeof p==='string'&&/^[/]gnu[/]store[/][0123456789abcdfghijklmnpqrsvwxyz]{32}-[^/]+$/.test(p)&&fs.realpathSync(p)===p),'advisory native closure must contain distinct canonical store roots');
 const nativeContexts=nativeResolution===undefined?null:observeNativePackageContexts({directProviders:[...selected.providers.values(),...rootProviders.providers.values()].filter(p=>p!==packageRoot),providerRoots:nativeProviderRoots,replacedPackageRoot:packageRoot,retainedContextEdges:nativeResolution.retainedContextEdges});
 if(programmeScope==="package"){
  const rootDeps=mapOf(rootManifest,"dependencies");
  requireThat(rootDeps[selection.name]===current.version,"selected package is not the native root's direct dependency");
 }
 requireThat(received.archive.members.some(member=>member.path===entry&&member.kind==="file"),"programme entry is not a carried regular file");
 const archiveBytes=sourceSnapshot===undefined?fs.readFileSync(archivePath):null;
 if(archiveBytes)requireThat(archiveBytes.length<=limits.archiveBytes&&"sha512-"+createHash("sha512").update(archiveBytes).digest("base64")===integrity,"archive integrity changed before extraction");
 let created=false;
 try{
  fs.mkdirSync(destination,{mode:0o700});created=true;
  const modules=path.join(destination,"node_modules"),newPackageRoot=path.join(modules,...selection.name.split("/"));
  fs.mkdirSync(newPackageRoot,{recursive:true,mode:0o700});
  if(sourceSnapshot!==undefined){
   for(const member of received.archive.members){const file=path.join(newPackageRoot,member.path);fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});fs.copyFileSync(path.join(received.snapshot.root,member.path),file,fs.constants.COPYFILE_EXCL);fs.chmodSync(file,member.mode);}
  }else{
  const extracted=spawnSync("tar",["-xzf","-","--strip-components=1","--no-same-owner","--no-same-permissions","-C",newPackageRoot],
   {input:archiveBytes,encoding:"utf8",timeout:30000,maxBuffer:65536});
  requireThat(extracted.status===0,"verified native archive extraction failed");
  }
  for(const member of received.archive.members){
   const file=path.join(newPackageRoot,member.path),info=fs.lstatSync(file);
   requireThat(info.isFile()&&fs.realpathSync(file)===file&&info.size===member.bytes&&Boolean(info.mode&0o111)===Boolean(member.mode&0o111)&&hash(fs.readFileSync(file))===member.sha256,"carried package bytes differ: "+member.path);
  }
  requireThat(!fs.existsSync(path.join(newPackageRoot,"node_modules")),"archive must not carry an installed dependency tree");
  for(const [name,provider]of selected.providers)linkProvider(path.join(newPackageRoot,"node_modules"),name,provider);
  for(const [name,provider]of rootProviders.providers)if(name!==selection.name)linkProvider(modules,name,provider);
  const dependencies=programmeScope==="root"?{...mapOf(rootManifest,"dependencies"),[selection.name]:selection.version}:{[selection.name]:selection.version};
  const productManifest={name:rootManifest.name,version:selection.version,private:true,type:"module",dependencies,
   ...(programmeScope==="root"&&rootManifest.optionalDependencies?{optionalDependencies:rootManifest.optionalDependencies}:{}),
   ...(programmeScope==="root"&&rootManifest.peerDependencies?{peerDependencies:rootManifest.peerDependencies}:{}),
   nativeProgramme:{kind:"native-provider-context-reuse/v1",package:selection.name,entry,sourceCommit:selection.sourceCommit,integrity,providerInputs:[runtimeRoot],dependencyPolicy,programmeScope}};
  fs.writeFileSync(path.join(destination,"package.json"),JSON.stringify(productManifest,null,2)+"\n",{flag:"wx",mode:0o600});
  let nativeObservation,nativeProcessObservation,nativeReceivingObservation;
  if(nativeResolution!==undefined){
   const moduleGraph=await observeNativeModuleGraph({root:destination,entrances:[path.relative(destination,path.join(newPackageRoot,entry)).split(path.sep).join('/')],providerRoots:nativeProviderRoots,replacedPackageRoot:packageRoot,profile:'guarded-default',retainedContextEdges:nativeContexts.retainedContextEdges});
   const {processObservation,...moduleIdentity}=moduleGraph;nativeProcessObservation=processObservation;
   const sourceIdentity=sourceSnapshot===undefined?{kind:"registry-archive",name:selection.name,version:selection.version,gitHead:selection.sourceCommit,integrity}:{kind:"git-source-snapshot",repository:sourceSnapshot.repository,commit:sourceSnapshot.commit,tree:sourceSnapshot.tree,contentSHA256:sourceSnapshot.contentSHA256,name:selection.name,version:selection.version};
   const compact=nativeResolution.contextEncoding!=='identity';
   const identity={profile:nativeResolution.profile,source:sourceIdentity,...(compact?{contextsSHA256:nativeContexts.sha256}:{contexts:nativeContexts}),moduleGraph:moduleIdentity,providerScope:runtimeRoot,bindings:selected.facts??null,storeRoots:[...new Set([nativeStoreRoot,...nativeProviderRoots])].sort()};
   const sha256=hash(JSON.stringify(identity));
   requireThat(nativeResolution.expectedSHA256===undefined||nativeResolution.expectedSHA256===sha256,"selected native physical resolution identity changed");
   nativeObservation={kind:compact?"npm.native-store-programme.candidate/v2":"npm.native-store-programme.candidate/v1",...identity,...(compact?{contexts:encodeNativeContextGraph(nativeContexts)}:{}),sha256,archiveMembers:received.archive.members.map(({path,bytes,mode,sha256})=>({path,bytes,mode,sha256})),entry};
   productManifest.nativeProgramme.nativeResolution=nativeObservation;
   nativeReceivingObservation={contexts:nativeContexts,moduleGraph};
   fs.writeFileSync(path.join(destination,"package.json"),JSON.stringify(productManifest,null,2)+"\n",{mode:0o600});
  }
  for(const [file,before]of witnesses)
   requireThat(fs.realpathSync(file)===file&&hash(fs.readFileSync(file))===before,"native provider manifest changed during construction");
  return {kind:"npm.native-package-programme.produced/v1",destination,programme:path.join(newPackageRoot,entry),...selection,integrity,dependencyPolicy,programmeScope,
   providerInputs:[runtimeRoot],dependencyPayloadCopied:false,portableClosureClaimed:false,machineReceivingRequired:true,...(nativeObservation?{nativeObservation,nativeProcessObservation,nativeReceivingObservation}:{}),
   ...(sourceSnapshot===undefined?{archive:{sha256:received.observation.archiveSHA256,expandedSHA256:received.observation.expandedSHA256,files:received.archive.members.length}}:{sourceSnapshot:{repository:sourceSnapshot.repository,commit:sourceSnapshot.commit,tree:sourceSnapshot.tree,contentSHA256:sourceSnapshot.contentSHA256,files:received.archive.members.length}}),
   providerContext:{selected:[...selected.providers].map(([name,root])=>({name,root})),absent:selected.absent,rootAbsent:rootProviders.absent}};
 }catch(error){if(created)fs.rmSync(destination,{recursive:true,force:true});throw error;}
}
