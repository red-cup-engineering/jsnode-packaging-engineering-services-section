import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {registerHooks,createRequire,syncBuiltinESMExports,findPackageJSON} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
const inside=(root,file)=>{const relative=path.relative(root,file);return relative===''||(!path.isAbsolute(relative)&&relative!=='..'&&!relative.startsWith('..'+path.sep));};
const fail=message=>{const error=new Error('native Code resolution refused: '+message);error.code='NATIVE_CODE_RESOLUTION_REFUSED';throw error;};
function environment(env){
 if(env.NODE_PATH)fail('NODE_PATH is outside the received mode');
 if(env.NODE_PRESERVE_SYMLINKS&&env.NODE_PRESERVE_SYMLINKS!=='0')fail('preserve-symlinks differs');
 const options=env.NODE_OPTIONS??'';
 if(options&&!options.split(/\s+/).filter(Boolean).every(x=>/^--max-old-space-size=\d+$/.test(x)||['--disable-sigusr1','--enable-source-maps'].includes(x)))fail('unreceived Node environment options');
}
/** Standard Node resolution and package-owned child Node boundary, not an OS
 * or arbitrary JavaScript sandbox. Independent native CLI tools keep their
 * original execution/resource contracts. */
export function installNativeStoreResolutionGuard({root,packageScopes,replacedPackageRoot,nodeVersion,bootstrapPath,retainedContextEdges=[]}){
 if(process.version!==nodeVersion)fail('Node supplier changed');
 if(!process.execArgv.includes('--no-global-search-paths')||process.execArgv.some(option=>/^--global-search-paths(?:=|$)|^--no-global-search-paths=/.test(option)))fail('global CJS search paths are not frozen');
 environment(process.env);
 if(!Array.isArray(packageScopes))fail('physical package scopes required');
 root=fs.realpathSync(root);replacedPackageRoot=fs.realpathSync(replacedPackageRoot);
 const scopes=packageScopes.map(p=>fs.realpathSync(p));
 const hash=b=>createHash('sha256').update(b).digest('hex');
 if(!Array.isArray(retainedContextEdges))fail('retained context edge array required');
 const roles=retainedContextEdges.map(e=>{
  if(!e||!['dependencies','optionalDependencies','peerDependencies'].includes(e.field)||e.directory!==replacedPackageRoot||fs.realpathSync(e.parentDirectory)!==e.parentDirectory||!scopes.includes(e.parentDirectory)||inside(replacedPackageRoot,e.parentDirectory))fail('unreceived retained parent context');
  const parentFile=path.join(e.parentDirectory,'package.json'),pb=fs.readFileSync(parentFile),p=JSON.parse(pb),tb=fs.readFileSync(path.join(e.directory,'package.json')),t=JSON.parse(tb);
  if(p.name!==e.parentName||p.version!==e.parentVersion||hash(pb)!==e.parentManifestSHA256||p[e.field]?.[e.name]!==e.declared||t.name!==e.name||t.version!==e.version||hash(tb)!==e.manifestSHA256)fail('retained context identity changed');
  const selected=findPackageJSON(e.name,pathToFileURL(parentFile));
  if(selected===undefined||fs.realpathSync(path.dirname(selected))!==e.directory)fail('retained native dependency selection changed');
  return Object.freeze({...e});
 });
 // Load lacks parentURL. This records only prior resolve receiving; every
 // resolution, including a cache hit, still checks its actual parent role.
 const receivedOldFiles=new Set();
 const receive=(url,parentURL,loading=false)=>{
  if(typeof url!=='string')fail('module URL absent');
  if(url.startsWith('node:'))return;
  let parsed;try{parsed=new URL(url);}catch{fail('invalid module URL');}
  if(parsed.protocol!=='file:')fail('module URL is outside immutable filesystem');
  const file=fs.realpathSync(fileURLToPath(parsed));
  if(inside(replacedPackageRoot,file)){
   if(loading){if(!receivedOldFiles.has(file))fail('old module load lacks received resolution');}
   else{
    let from;try{if(parentURL?.startsWith('file:'))from=fs.realpathSync(fileURLToPath(parentURL));}catch{}
    const parent=from?scopes.filter(scope=>inside(scope,from)).sort((a,b)=>b.length-a.length)[0]:undefined;
    if(!from||(!(roles.length&&inside(replacedPackageRoot,from))&&!roles.some(e=>parent===e.parentDirectory&&inside(e.directory,file))))fail('module enters replaced source outside retained dependency role');
    receivedOldFiles.add(file);
   }
  }
  if(!inside(root,file)&&!scopes.some(scope=>inside(scope,file)))fail('module leaves received package contexts');
 };
 registerHooks({
  resolve(specifier,context,nextResolve){const received=nextResolve(specifier,context);receive(received.url,context.parentURL);return received;},
  load(url,context,nextLoad){receive(url,undefined,true);return nextLoad(url,context);}
 });
 const req=createRequire(import.meta.url),threads=req('node:worker_threads'),processes=req('node:child_process');
 const OriginalWorker=threads.Worker,originalFork=processes.fork,originalNode=fs.realpathSync(process.execPath);
 const bootstrap=bootstrapPath===undefined?null:fs.realpathSync(bootstrapPath);
 function childArguments(input){
  if(!bootstrap)fail('original immutable child bootstrap absent');
  if(!Array.isArray(input)||input.some(x=>typeof x!=='string'))fail('child execArgv must be native strings');
  const remaining=[];
  for(let i=0;i<input.length;i++){
   const option=input[i];
   if(option==='--no-global-search-paths')continue;
   if(/^--(?:no-)?global-search-paths(?:=|$)/.test(option))fail('global CJS search paths differ');
   if(option==='--import'){
    const selected=input[++i];if(selected!==bootstrap)fail('alternate child preload');
    continue;
   }
   if(option.startsWith('--import=')){if(option.slice(9)!==bootstrap)fail('alternate child preload');continue;}
   if(/^(?:--(?:require|loader|experimental-loader|experimental-config-file|experimental-default-config-file|env-file|experimental-policy|policy-integrity|experimental-default-type|conditions|preserve-symlinks(?:-main)?)(?:=|$)|-[rC])/.test(option))fail('alternate child loader or conditions');
   remaining.push(option);
  }
  return ['--no-global-search-paths','--import',bootstrap,...remaining];
 }
 function childOptions(options,fork=false){
  if(options===undefined)options={};
  if(options===null||typeof options!=='object'||Array.isArray(options))fail('native child options required');
  if(options.execPath!==undefined&&fs.realpathSync(options.execPath)!==originalNode)fail('unreceived child Node supplier');
  const env=options.env===undefined||options.env===threads.SHARE_ENV?process.env:options.env;
  if(!env||typeof env!=='object')fail('native child environment required');
  environment(env);
  return {...options,...(fork?{execPath:originalNode}:{}),execArgv:childArguments(options.execArgv??process.execArgv)};
 }
 threads.Worker=class NativeCodeWorker extends OriginalWorker{
  constructor(filename,options){
   const received=childOptions(options);
   if(received.eval!==true){
    const url=filename instanceof URL?filename.href:new URL('file:'+path.resolve(filename)).href;
    receive(url);
   }
   super(filename,received);
  }
 };
 processes.fork=function nativeCodeFork(modulePath,args,options){
  let argv=args,selected=options;
  if(!Array.isArray(args)){selected=args===undefined?options:args;argv=undefined;}
  receive(modulePath instanceof URL?modulePath.href:new URL('file:'+path.resolve(modulePath)).href);
  const received=childOptions(selected,true);
  return argv===undefined?originalFork(modulePath,received):originalFork(modulePath,argv,received);
 };
 syncBuiltinESMExports();
 return Object.freeze({kind:'npm.native-store-resolution-guard.installed/v1',node:process.version,root,packageScopes:scopes,replacedPackageRoot,
  mode:'node-default-no-global/v1',children:'original guarded incoming Worker/fork; retained-context child entries unselected; independent CLI contracts separate'});
}
