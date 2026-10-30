import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {createRequire,isBuiltin,findPackageJSON} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {normalizeNativeRetainedContextEdges} from './native-provider-bill.mjs';
import {readNativeRegistryImports} from './native-registry-imports.mjs';
import {parseJavaScript,walkJavaScript,bindJavaScript} from '@red-cup-engineering/javascript-parser-service';

const inside=(root,file)=>{const p=path.relative(root,file);return p===''||(!path.isAbsolute(p)&&p!=='..'&&!p.startsWith('..'+path.sep));};
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const refuse=message=>{const error=new TypeError('native module-resolution profile: '+message);error.code='NATIVE_MODULE_PROFILE_UNSUPPORTED';error.nativeProfileReason=message;throw error;};
const literal=node=>node?.type==='Literal'&&typeof node.value==='string'?node.value:null;
const property=node=>node?.type==='MemberExpression'&&!node.computed&&node.property.type==='Identifier'?node.property.name:null;
const identifier=(node,name)=>node?.type==='Identifier'&&node.name===name;
const metaUrl=node=>node?.type==='MemberExpression'&&property(node)==='url'&&node.object?.type==='MetaProperty'&&identifier(node.object.meta,'import')&&identifier(node.object.property,'meta');

/** Original parser/binder handles syntax and lexical identity. Native Node
 * separately compiles every source. Returned edges do not retain source/AST.
 * Unsupported loader capabilities refuse; this is not a filesystem sandbox. */
export function nativeModuleRequests(source,format='module'){
 if(!['module','commonjs'].includes(format))refuse('unsupported module format');
 if(format==='module'){
  if(typeof vm.SourceTextModule!=='function')refuse('native VM module parsing flag required');
  new vm.SourceTextModule(source);
 }else vm.compileFunction(source,['exports','require','module','__filename','__dirname']);
 const wrapped=format==='commonjs'?'function __native_module__(exports,require,module,__filename,__dirname){\n'+source+'\n}':source;
 const ast=parseJavaScript(wrapped,{sourceType:format==='module'?'module':'script'});
 const bound=bindJavaScript(ast),creators=new Set(),requires=new Set(),permitted=new Set(),requests=[],moduleSources=new Set(),processSources=new Set();
 let moduleBinding;
 const binding=node=>bound.references.get(node);
 const wrapper=format==='commonjs'?ast.body[0]:null;
 if(wrapper){requires.add(binding(wrapper.params[1]));moduleBinding=binding(wrapper.params[2]);}
 walkJavaScript(ast,node=>{
  if(node.type==='ImportDeclaration'&&['node:child_process','child_process'].includes(literal(node.source))){
   if(node.specifiers.some(x=>x.type!=='ImportSpecifier'||identifier(x.imported,'fork')))refuse('unreceived child-process module loader');
   processSources.add(node.source);
  }
  if(node.type==='ImportDeclaration'&&['node:module','module'].includes(literal(node.source))){
   for(const item of node.specifiers){
    if(item.type!=='ImportSpecifier'||!identifier(item.imported,'createRequire'))refuse('unsupported node:module capability');
    creators.add(binding(item.local));
    moduleSources.add(node.source);
   }
  }
 });
 walkJavaScript(ast,node=>{
  if(node.type==='VariableDeclarator'&&node.id.type==='Identifier'&&node.init?.type==='CallExpression'&&creators.has(binding(node.init.callee))){
   if(node.init.arguments.length!==1||!metaUrl(node.init.arguments[0]))refuse('createRequire must bind the actual module URL');
   requires.add(binding(node.id));permitted.add(node.init.callee);
  }
 });
 const request=(node,mode)=>{
  const specifier=literal(node);
  if(specifier===null)refuse('nonliteral module request');
  if(['node:module','module'].includes(specifier)&&!moduleSources.has(node))refuse('unsupported module loader acquisition');
  if(['node:worker_threads','worker_threads','node:cluster','cluster','node:inspector','inspector'].includes(specifier))refuse('unreceived secondary module loader');
  if(['node:child_process','child_process'].includes(specifier)&&!processSources.has(node))refuse('unreceived child-process module loader');
  if(['node:process','process'].includes(specifier))refuse('imported process loader capability is unsupported');
  if(['node:vm','vm'].includes(specifier))refuse('dynamic code loader is unsupported');
  requests.push({specifier,mode});
 };
 walkJavaScript(ast,(node,parent)=>{
  if(node.type==='MetaProperty'&&identifier(node.meta,'import')&&identifier(node.property,'meta')){
   if(parent?.type!=='MemberExpression'||parent.computed||!['url','resolve'].includes(property(parent)))refuse('import.meta loader context escapes');
  }
  if(node.type==='MemberExpression'&&node.object?.type==='MetaProperty'&&identifier(node.object.meta,'import')&&property(node)==='resolve'){
   if(parent?.type!=='CallExpression'||parent.callee!==node)refuse('import.meta.resolve binding escapes');
  }
  if(node.type==='Identifier'&&binding(node)===null&&['process','global','globalThis'].includes(node.name)){
   if(parent?.type!=='MemberExpression'||parent.object!==node||parent.computed)refuse('global loader context escapes');
   const key=property(parent);
   if(node.name==='process'&&['getBuiltinModule','binding','_linkedBinding','mainModule'].includes(key))refuse('process builtin loader capability is unsupported');
   if(node.name!=='process'&&!['TextEncoder','TextDecoder','crypto','fetch','performance','structuredClone','AbortController','AbortSignal','URL','URLSearchParams','Buffer','console','setTimeout','clearTimeout','setInterval','clearInterval'].includes(key))refuse('unsupported global loader context');
  }
  if(['ImportDeclaration','ExportNamedDeclaration','ExportAllDeclaration'].includes(node.type)&&node.source)request(node.source,'import');
  if(node.type==='ImportExpression')request(node.source,'import');
  if(node.type==='CallExpression'){
   const callee=node.callee;
   if(moduleBinding&&property(callee)==='require'&&callee.object.type==='Identifier'&&binding(callee.object)===moduleBinding){
    if(node.arguments.length!==1)refuse('module.require arguments must be one literal request');
    request(node.arguments[0],'require');permitted.add(callee.object);
   }else if(callee.type==='Identifier'&&requires.has(binding(callee))){
    if(node.arguments.length!==1)refuse('require arguments must be one literal request');
    request(node.arguments[0],'require');permitted.add(callee);
   }else if(property(callee)==='resolve'&&callee.object.type==='Identifier'&&requires.has(binding(callee.object))){
    if(node.arguments.length!==1)refuse('require.resolve overrides are unsupported');
    request(node.arguments[0],'require');permitted.add(callee.object);
   }else if(property(callee)==='resolve'&&callee.object?.type==='MetaProperty'&&identifier(callee.object.meta,'import')){
    if(node.arguments.length!==1)refuse('import.meta.resolve overrides are unsupported');
    request(node.arguments[0],'import');
   }
  }
  if(node.type==='Identifier'&&bound.references.has(node)){
   if(moduleBinding&&binding(node)===moduleBinding&&moduleBinding.identifier!==node&&!permitted.has(node)
    &&!(parent?.type==='MemberExpression'&&parent.object===node&&property(parent)==='exports'))refuse('module object escapes supported native exports');
   const b=binding(node);
   if((creators.has(b)||requires.has(b))&&!permitted.has(node)&&b?.identifier!==node
    &&!(parent?.type==='ImportSpecifier'&&parent.local===node))refuse('module loader binding escapes its supported call');
   if(b===null&&['eval','Function'].includes(node.name))refuse('dynamic code evaluation is unsupported');
   if(b===null&&['require','module'].includes(node.name)&&format!=='commonjs')refuse('unbound module loader');
  }
 });
 return requests;
}

function receiveRetainedEdges(value,roots,old){
 const edges=normalizeNativeRetainedContextEdges(value);
 const admitted=p=>roots.some(r=>inside(r,p));
 for(const e of edges){
  if(fs.realpathSync(e.parentDirectory)!==e.parentDirectory||fs.realpathSync(e.directory)!==e.directory||e.directory!==old||inside(old,e.parentDirectory)||!admitted(e.parentDirectory)||!admitted(e.directory))refuse('retained context is outside selected native inputs');
  const parentFile=path.join(e.parentDirectory,'package.json'),parentBytes=fs.readFileSync(parentFile),parent=JSON.parse(parentBytes),targetBytes=fs.readFileSync(path.join(e.directory,'package.json')),target=JSON.parse(targetBytes);
  if(parent.name!==e.parentName||parent.version!==e.parentVersion||digest(parentBytes)!==e.parentManifestSHA256||parent[e.field]?.[e.name]!==e.declared||target.name!==e.name||target.version!==e.version||digest(targetBytes)!==e.manifestSHA256)refuse('retained context manifest/declaration identity changed');
  if(e.field==='dependencies'&&Object.hasOwn(parent.optionalDependencies??{},e.name))refuse('retained role is superseded by optional declaration');
  const selected=findPackageJSON(e.name,pathToFileURL(parentFile));
  if(selected===undefined||fs.realpathSync(path.dirname(selected))!==e.directory)refuse('retained native resolution changed');
 }
 return edges;
}
function permitsRetainedModule(edges,old,from,target,owner){
 if(!from||!inside(old,target))return false;
 if(inside(old,from))return edges.length>0;
 return edges.some(e=>owner?.directory===e.parentDirectory&&inside(e.directory,target));
}
export function observeNativeResolutionMode(){
 if(process.env.NODE_PRESERVE_SYMLINKS&&process.env.NODE_PRESERVE_SYMLINKS!=='0')refuse('ambient preserve-symlinks mode');
 if(process.env.NODE_PATH)refuse('NODE_PATH is not a frozen native resolution mode');
 const options=process.env.NODE_OPTIONS??'';
 if(options&&!options.split(/\s+/).filter(Boolean).every(x=>/^--max-old-space-size=\d+$/.test(x)||['--disable-sigusr1','--enable-source-maps'].includes(x)))refuse('ambient Node loader options are unsupported');
 const allowed=x=>['--experimental-vm-modules','--experimental-import-meta-resolve','--input-type=module','--disable-sigusr1','--enable-source-maps','--no-global-search-paths'].includes(x)||/^--max-old-space-size=\d+$/.test(x);
 if(process.execArgv.some(x=>!allowed(x)))refuse('nonstandard Node resolver arguments');
 return {node:process.version,nodeOptions:options,nodePath:null,preserveSymlinks:false,resolutionProfile:'node-default',globalSearchPathsDisabled:process.execArgv.includes('--no-global-search-paths'),observedExecArgv:[...process.execArgv]};
}

/** Observation only. Trusted Code Scheme receiving owns registered-store authority. */
export async function observeNativeModuleGraph({root,entrances,providerRoots,replacedPackageRoot,profile='static-only',retainedContextEdges=[]}){
 root=fs.realpathSync(root);replacedPackageRoot=fs.realpathSync(replacedPackageRoot);
 if(!Array.isArray(providerRoots)||!providerRoots.length)refuse('explicit provider roots required');
 const roots=providerRoots.map(p=>fs.realpathSync(p));
 const roles=receiveRetainedEdges(retainedContextEdges,roots,replacedPackageRoot);
 const observedMode=observeNativeResolutionMode();
 const {observedExecArgv,nodeOptions,...mode}=observedMode;
 if(profile==='guarded-default'&&!mode.globalSearchPathsDisabled)refuse('native guarded mode requires no-global-search-paths');
 if(!['static-only','guarded-default'].includes(profile))refuse('unknown native resolution profile');
 const reading=await readNativeRegistryImports({root,entrances,nativeProfile:{providerRoots:roots,replacedPackageRoot,requests:nativeModuleRequests,retainedEdge:(from,target,owner)=>permitsRetainedModule(roles,replacedPackageRoot,from,target,owner)}});
 if(profile==='static-only'&&reading.findings.length)refuse(reading.findings[0].message??reading.findings[0].code);
 if(reading.findings.some(f=>/replaced package|leaves received|leaves its received|escapes native/.test(f.message??'')))refuse('observed module edge leaves the selected native product');
 const observation={kind:'npm.native-module-resolution.observation/v1',root:'$root',replacedPackageRoot,providerRoots:roots,mode,...reading.nativeGraph,
  profile,...(roles.length?{retainedContextEdges:roles}:{}),opaque:reading.findings.map(({file,source,code,profileReason})=>({file:typeof file==='string'&&inside(root,file)?'$root/'+path.relative(root,file):file,source:typeof source==='string'&&path.isAbsolute(source)&&inside(root,source)?'$root/'+path.relative(root,source):source,code,reason:profileReason??null})),runtimeGuard:profile==='guarded-default'?'node-synchronous-resolution/v1':null,
  scope:'observed module-resolution edges; opaque entries are not closure proof; guarded-default requires original immutable launcher enforcement'};
 return {...observation,sha256:digest(JSON.stringify(observation)),processObservation:{observedExecArgv,nodeOptions}};
}

/** Frozen physical package contexts, including peers not reached by an entry.
 * This is native resolution identity, not a portable lock/policy assertion. */
export function observeNativePackageContexts({directProviders,providerRoots,replacedPackageRoot,retainedContextEdges=[]}){
 const realPaths=new Map(),manifests=new Map(),selections=new Map();
 const real=file=>{if(!realPaths.has(file))realPaths.set(file,fs.realpathSync(file));return realPaths.get(file);};
 const roots=providerRoots.map(real),old=real(replacedPackageRoot);
 const storePattern=/^[/]gnu[/]store[/][0123456789abcdfghijklmnpqrsvwxyz]{32}-[^/]+$/u;
 const directRoots=new Set(roots.filter(p=>p.match(storePattern)?.[0]===p)),otherRoots=roots.filter(p=>!directRoots.has(p));
 const admitted=p=>directRoots.has(/^[/]gnu[/]store[/][^/]+/u.exec(p)?.[0])||otherRoots.some(r=>inside(r,p));
 const stamp=(a,b)=>['dev','ino','size','mtimeMs','ctimeMs'].some(k=>a[k]!==b[k]);
 function manifestAt(directory){
  directory=real(directory);if(manifests.has(directory))return manifests.get(directory);
  const file=path.join(directory,'package.json'),before=fs.lstatSync(file);
  if(!before.isFile()||real(file)!==file)refuse('provider manifest is not regular');
  const bytes=fs.readFileSync(file),parsed=JSON.parse(bytes);
  const manifest={name:parsed.name,version:parsed.version,...Object.fromEntries(['dependencies','optionalDependencies','peerDependencies','peerDependenciesMeta'].filter(k=>Object.hasOwn(parsed,k)).map(k=>[k,parsed[k]]))};
  if(typeof manifest.name!=='string'||typeof manifest.version!=='string')refuse('provider manifest identity absent');
  if(stamp(before,fs.lstatSync(file)))refuse('provider manifest changed');
  const value={directory,file,before,manifest,sha256:digest(bytes)};manifests.set(directory,value);return value;
 }
 function selectedPackage(name,file){
  const key=file+'\\0'+name;if(selections.has(key))return selections.get(key);
  let selected;
  try{selected=findPackageJSON(name,pathToFileURL(file));}
  catch(error){if(!['ERR_MODULE_NOT_FOUND','MODULE_NOT_FOUND'].includes(error.code))throw error;}
  selections.set(key,selected);return selected;
 }
 const roles=receiveRetainedEdges(retainedContextEdges,roots,old),used=new Set();let retainedReached=false;
 if(directProviders.some(p=>inside(old,real(p))))refuse('direct provider enters replaced package');
 const pending=[...directProviders],seen=new Set(),contexts=[];
 while(pending.length){
  const directory=real(pending.pop());
  if(inside(old,directory)&&!retainedReached)refuse('provider context enters replaced package');
  if(!admitted(directory))refuse('provider context leaves native inputs');
  if(seen.has(directory))continue;seen.add(directory);
  const {file:manifestPath,manifest,sha256}=manifestAt(directory),edges=[];
  for(const field of ['dependencies','optionalDependencies','peerDependencies']){
   const declarations=manifest[field]??{};
   if(!declarations||typeof declarations!=='object'||Array.isArray(declarations))refuse('malformed provider declarations');
   for(const [name,declared]of Object.entries(declarations)){
    if(field==='dependencies'&&Object.hasOwn(manifest.optionalDependencies??{},name))continue;
    if(typeof declared!=='string'||!name)refuse('malformed provider declaration');
    const selected=selectedPackage(name,manifestPath);
    if(selected===undefined){
     if(field==='dependencies'||(field==='peerDependencies'&&manifest.peerDependenciesMeta?.[name]?.optional!==true))refuse('required provider context absent: '+name);
     edges.push({field,name,declared,absent:true});continue;
    }
    const actual=real(path.dirname(selected));
    if(inside(old,actual)&&!inside(old,directory)){
     const selected=roles.find(e=>e.parentDirectory===directory&&e.field===field&&e.name===name&&e.declared===declared&&e.directory===actual);
     if(!selected)refuse('provider peer/dependency context enters replaced package');
     used.add(selected);retainedReached=true;
    }
    if(!admitted(actual))refuse('provider context escapes immutable scope');
    const found=manifestAt(actual).manifest;
    if(found.name!==name)refuse('provider package alias is unsupported');
    edges.push({field,name,declared,directory:actual,version:found.version});pending.push(actual);
   }
  }
  contexts.push({directory,name:manifest.name,version:manifest.version,manifestSHA256:sha256,edges});
 }
 // Caches are local to one observation. Final stamps and native Guix/NAR
 // receiving remain independent; cached paths cannot suppress a final change.
 for(const {file,before}of manifests.values())if(stamp(before,fs.lstatSync(file))||fs.realpathSync(file)!==file)refuse('provider manifest changed');
 if(roles.some(e=>!used.has(e)))refuse('selected retained context edge was not reached');
 contexts.sort((a,b)=>a.directory<b.directory?-1:a.directory>b.directory?1:0);
 return {kind:'npm.native-package-contexts.observation/v1',contexts,...(roles.length?{retainedContextEdges:roles}:{}),sha256:digest(JSON.stringify(roles.length?{contexts,retainedContextEdges:roles}:contexts)),
  scope:'actual immutable physical resolution contexts; does not assert portable lock-policy conformance'};
}
