import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {isBuiltin,stripTypeScriptTypes,createRequire} from 'node:module';
import {readFile,realpath,stat} from 'node:fs/promises';
import {dirname,extname,isAbsolute,join,relative,resolve,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {isExactSemver} from './dependency-policy.mjs';
import {createInstalledContractReader} from './installed-contract-owner.mjs';

const within=(root,file)=>{const p=relative(root,file);return !isAbsolute(p)&&p!=='..'&&!p.startsWith('..'+sep);};
const bareName=specifier=>{
 if(specifier.startsWith('.')||specifier.startsWith('/')||specifier.startsWith('#')||/^[a-z][a-z0-9+.-]*:/iu.test(specifier))return null;
 const pieces=specifier.split('/');
 return pieces[0].startsWith('@')?(pieces.length>1?pieces.slice(0,2).join('/'):null):pieces[0];
};


const PACKAGE_NAME=/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/u;
/** Mandatory root pin receiving for portable consumers, INCLUDING consumers
 * that do not declare optional graph-inspection entrances. This runs before
 * a portable destination is reserved or any installation is transferred.
 * Only exact declarations are provable; absent optional/peer/dev carriers
 * remain explicit uninstalled counts rather than invented version matches.
 */
export async function assertRootInstalledDependencyPins({root,manifest,maxDependencies=512}={}){
 if(typeof root!=='string'||!root||!manifest||typeof manifest!=='object'
  ||!Number.isSafeInteger(maxDependencies)||maxDependencies<1||maxDependencies>4096)
  throw new TypeError('received root, source manifest and bounded direct dependency count required');
 const modules=await realpath(join(resolve(root),'node_modules'));
 let checked=0,optionalUninstalled=0,examined=0;
 for(const declaration of ['dependencies','optionalDependencies','devDependencies','peerDependencies']){
  const selected=manifest[declaration]??{};
  if(typeof selected!=='object'||Array.isArray(selected))throw new TypeError('malformed '+declaration);
  for(const [name,expected] of Object.entries(selected)){
   if(!PACKAGE_NAME.test(name))throw new TypeError('invalid declared npm dependency '+name);
   if(!isExactSemver(expected))continue;
   if(++examined>maxDependencies)throw new RangeError('direct dependency pin bound exceeded');
   const path=join(modules,...name.split('/'),'package.json');
   let original;
   try{original=await realpath(path);}
   catch(error){
    if(error.code==='ENOENT'&&declaration!=='dependencies'){optionalUninstalled++;continue;}
    throw new Error('missing exact '+declaration+' '+name+' declared '+expected,{cause:error});
   }
   if(!within(modules,original))throw new Error('installed dependency escapes native received closure: '+name);
   let record;
   try{
    const info=await stat(original);
    if(!info.isFile()||info.size>64*1024)throw new Error('invalid installed package manifest size');
    record=JSON.parse(await readFile(original,'utf8'));
   }catch(error){throw new Error('unreadable installed dependency '+name+' declared '+expected,{cause:error});}
   if(record.name!==name||record.version!==expected)
    throw new Error('installed dependency '+name+' declared '+expected+' resolved '+(record.name??'unknown')+'@'+(record.version??'unknown'));
   checked++;
  }
 }
 return Object.freeze({kind:'npm.runtime-root-exact-dependency-pins',checked,optionalUninstalled,complete:true});
}

/** Read the declared program's static ESM links using Node's own import
 * resolver. Never import or evaluate application code. The temporary native
 * installation link is supplied by the owning producer, before transfer. */
export async function readNativeRegistryImports({root,entrances,maxModules=10000,nativeProfile}){
 if(typeof vm.SourceTextModule!=='function'||!process.execArgv.includes('--experimental-import-meta-resolve'))
  throw new Error('native import reading requires VM modules and import.meta.resolve parentURL support');
 if(!Array.isArray(entrances)||!entrances.length||entrances.length>64||new Set(entrances).size!==entrances.length)
  throw new TypeError('one through 64 distinct declared Node entrances required');
 if(!Number.isSafeInteger(maxModules)||maxModules<1||maxModules>10000)throw new TypeError('bounded native module population required');
 root=await realpath(resolve(root));
 const installation=await realpath(join(root,'node_modules'));
 const pending=entrances.map(path=>{
  if(typeof path!=='string'||isAbsolute(path)||path.includes('\0')||!within(root,resolve(root,path)))throw new TypeError('Node entrance must stay within its carrier');
  return {file:resolve(root,path)};
 });
 const seen=new Set(),packageTypes=new Map();
 const providerRoots=nativeProfile?.providerRoots??[];
 if(nativeProfile && (!Array.isArray(providerRoots)||typeof nativeProfile.requests!=='function'||typeof nativeProfile.replacedPackageRoot!=='string')) throw new TypeError('explicit native module profile required');
 const admitted=file=>within(root,file)||within(installation,file)||providerRoots.some(p=>within(p,file));
 const contracts=createInstalledContractReader({root,installation,providerRoots});
 const nativeModules=[],nativeEdges=[];
 const nativeCoordinate=file=>within(root,file)?'$root/'+relative(root,file).split(sep).join('/'):file;
 const reading={kind:'npm.native-registry-static-imports',entrances:[...entrances],modules:0,bytesRead:0,opaqueCommonJs:0,dynamicImports:'not-inspected',findings:[]};
 async function moduleType(file){
  for(let dir=dirname(file);;dir=dirname(dir)){
   if(packageTypes.has(dir))return packageTypes.get(dir);
   try{const p=JSON.parse(await readFile(join(dir,'package.json'),'utf8'));packageTypes.set(dir,p.type);return p.type;}
   catch(error){if(error.code!=='ENOENT')throw error;}
   if(dir===root||dir===installation||dirname(dir)===dir)return undefined;
  }
 }
 while(pending.length){
  const request=pending.pop();let file;
  try{
   file=await realpath(request.file);
   if(!admitted(file))throw new Error('module leaves its received carrier and installation');
   if(nativeProfile&&within(nativeProfile.replacedPackageRoot,file)&&!nativeProfile.retainedEdge?.(request.from,file,request.from?contracts.owner(request.from):undefined))throw new Error('module edge enters replaced package');
   if(seen.has(file))continue;
   if(seen.size>=maxModules){pending.length=0;throw new Error('declared native module population exceeds its bound');}
   seen.add(file);
   const info=await stat(file);if(!info.isFile()||info.size>16*1024*1024)throw new Error('module must be a bounded regular file');
   const importer=contracts.owner(file);
   const extension=extname(file);
   const type=extension==='.js'?await moduleType(file):undefined;
   if(extension==='.node'){if(nativeProfile)throw new Error('native binary module coupling is unsupported');reading.opaqueCommonJs++;continue;}
   let commonjs=extension==='.cjs'||(extension==='.js'&&type==='commonjs');
   if(commonjs&&!nativeProfile){reading.opaqueCommonJs++;continue;}
   if(!['.mjs','.js','.ts','.mts','.json',...(nativeProfile?['.cjs']:[])].includes(extension))throw new Error('unsupported static Node module format');
   const text=await readFile(file,'utf8');reading.bytesRead+=Buffer.byteLength(text);
   if(reading.bytesRead>256*1024*1024){pending.length=0;throw new Error('declared native source bytes exceed their bound');}
   if(nativeProfile)nativeModules.push({file:nativeCoordinate(file),sha256:createHash('sha256').update(text).digest('hex'),bytes:Buffer.byteLength(text),format:extension==='.json'?'json':commonjs?'commonjs':'module'});
   if(extension==='.json'){JSON.parse(text);continue;}
   if(extension==='.js'&&type!=='module'&&!nativeProfile){
    try{
     // Compile only: Node's wrapper bindings distinguish ambiguous ESM syntax
     // without evaluating application code or treating real CommonJS as ESM.
     vm.compileFunction(text,['exports','require','module','__filename','__dirname'],{filename:file});
     reading.opaqueCommonJs++;continue;
    }catch(error){if(!(error instanceof SyntaxError))throw error;}
   }
   if(nativeProfile&&extension==='.js'&&type!=='module'&&type!=='commonjs'){
    try{vm.compileFunction(text,['exports','require','module','__filename','__dirname'],{filename:file});commonjs=true;}
    catch(error){if(!(error instanceof SyntaxError))throw error;commonjs=false;}
    nativeModules[nativeModules.length-1].format=commonjs?'commonjs':'module';
   }
   const source=['.ts','.mts'].includes(extension)?stripTypeScriptTypes(text,{mode:'strip',sourceUrl:file}):text;
   let requests;
   if(nativeProfile){
    if(['.ts','.mts'].includes(extension))throw new Error('native TypeScript transform profile is unsupported');
    requests=nativeProfile.requests(source,commonjs?'commonjs':'module');
   }else requests=new vm.SourceTextModule(source,{identifier:file}).dependencySpecifiers.map(specifier=>({specifier,mode:'import'}));
   reading.modules++;
   for(const {specifier,mode} of requests){
    if(isBuiltin(specifier))continue;
    try{
     const target=new URL(mode==='require'?pathToFileURL(createRequire(file).resolve(specifier)).href:import.meta.resolve(specifier,pathToFileURL(file).href));
     if(target.protocol!=='file:')throw new Error('static module URL is outside the received filesystem');
     const providerPath=fileURLToPath(target);
     const physical=await realpath(providerPath);
     if(nativeProfile&&within(nativeProfile.replacedPackageRoot,physical)&&!nativeProfile.retainedEdge?.(file,physical,importer))throw new Error('module edge enters replaced package');
     if(!admitted(physical))throw new Error('module edge leaves received inputs');
     if(nativeProfile)nativeEdges.push({from:nativeCoordinate(file),specifier,mode,to:nativeCoordinate(physical)});
     const requested=bareName(specifier);
     {
      const provider=requested?contracts.provider(specifier,file,providerPath):contracts.owner(providerPath);
      const name=requested??provider.name;
      if(importer.directory!==provider.directory){
       for(const declaration of ['dependencies','optionalDependencies','devDependencies','peerDependencies']){
        const expected=importer[declaration]?.[name];
        if(!isExactSemver(expected))continue;
        if((requested&&provider.name!==requested)||provider.version!==expected){
         reading.findings.push({
          file,source:specifier,code:'INSTALLED_EXACT_DEPENDENCY_VERSION_MISMATCH',
          consumer:importer.name??null,provider:name,
          actualProvider:provider.name??null,declaration,expected,installed:provider.version??null
         });
        }
       }
      }
     }
     pending.push({file:providerPath,from:file,specifier});
    }catch(error){reading.findings.push({file,source:specifier,code:error.code??'MODULE_RESOLUTION_REFUSED',message:error.message,...(nativeProfile?{profileReason:error.nativeProfileReason??null}:{})});}
   }
  }catch(error){reading.findings.push({file:request.from??request.file,source:request.specifier??request.file,code:error.code??'MODULE_SOURCE_REFUSED',message:error.message,...(nativeProfile?{profileReason:error.nativeProfileReason??null}:{})});}
 }
 if(nativeProfile){reading.dynamicImports='literal-native-profile';reading.nativeGraph={modules:nativeModules.sort((a,b)=>a.file<b.file?-1:a.file>b.file?1:0),edges:nativeEdges.sort((a,b)=>JSON.stringify(a)<JSON.stringify(b)?-1:JSON.stringify(a)>JSON.stringify(b)?1:0)};}
 return reading;
}
