import {readFile,writeFile,lstat,realpath,mkdir,readdir,access} from 'node:fs/promises';
import {constants} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire,isBuiltin} from 'node:module';
import {dirname,isAbsolute,join,resolve,relative,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {isDeepStrictEqual} from 'node:util';

// Private shared source/custody checks; no process execution or arbitrary dispatch.
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const own=(value,keys,required=keys)=>{
  if(!value||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw new TypeError('own worker data required');
  for(const key of Reflect.ownKeys(value)){const d=Object.getOwnPropertyDescriptor(value,key);if(typeof key!=='string'||!keys.includes(key)||!d.enumerable||!('value'in d))throw new TypeError('unsupported worker field');}
  if(required.some(key=>!Object.hasOwn(value,key)))throw new TypeError('missing worker field');
};
function clone(value){let nodes=0;const seen=new Set();const visit=(v,depth)=>{
  if(++nodes>200000||depth>16)throw new TypeError('bounded worker data required');
  if(v===null||typeof v==='boolean'||typeof v==='number'&&Number.isFinite(v))return;
  if(typeof v==='string'){if(v.length>1048576)throw new TypeError('bounded worker string required');return;}
  if(!v||typeof v!=='object'||seen.has(v))throw new TypeError('worker JSON data required');
  const array=Array.isArray(v);if(array?Object.getPrototypeOf(v)!==Array.prototype:![Object.prototype,null].includes(Object.getPrototypeOf(v)))throw new TypeError('own worker JSON required');
  const keys=Reflect.ownKeys(v);if(array&&(v.length>65536||keys.length!==v.length+1))throw new TypeError('dense worker array required');seen.add(v);
  for(const k of keys){if(array&&k==='length')continue;const d=Object.getOwnPropertyDescriptor(v,k);if(typeof k!=='string'||!d.enumerable||!('value'in d))throw new TypeError('own worker field required');visit(d.value,depth+1);}seen.delete(v);
};visit(value,0);const text=JSON.stringify(value);if(Buffer.byteLength(text)>16*1024*1024)throw new TypeError('worker data budget exceeded');return JSON.parse(text);}
const absolute=p=>{if(typeof p!=='string'||!isAbsolute(p)||resolve(p)!==p||/[\0\r\n]/u.test(p))throw new TypeError('normalized worker path required');return p;};
async function bytes(path,max=16*1024*1024){absolute(path);const s=await lstat(path);if(!s.isFile()||s.size>max||await realpath(path)!==path)throw new TypeError('bounded unredirected worker file required');const b=await readFile(path),after=await lstat(path);if(s.dev!==after.dev||s.ino!==after.ino||s.size!==after.size||s.mtimeMs!==after.mtimeMs||s.ctimeMs!==after.ctimeMs||b.length!==s.size)throw new TypeError('worker file changed while reading');return b;}
async function identity(path,max){const b=await bytes(path,max);return {path,bytes:b.length,sha256:sha(b)};}
async function absent(path){try{await lstat(path);}catch(error){if(error.code==='ENOENT')return;throw error;}throw new TypeError('fresh native operation path already exists');}
async function directory(path,privateRoot=false){absolute(path);const s=await lstat(path);if(!s.isDirectory()||await realpath(path)!==path||s.uid!==process.getuid()||(privateRoot&&(s.mode&0o077)))throw new TypeError('owned real private worker directory required');return {path,dev:s.dev,ino:s.ino,uid:s.uid,mode:s.mode};}
const inside=(root,path)=>{const r=relative(root,path);return r===''||r!=='..'&&!r.startsWith('..'+sep)&&!isAbsolute(r);};
async function save(path,value){const text=JSON.stringify(value)+'\n';if(Buffer.byteLength(text)>16*1024*1024)throw new TypeError('worker evidence bound exceeded');await writeFile(path,text,{flag:'wx',mode:0o600});const held=await identity(path);if(held.sha256!==sha(text))throw new TypeError('worker evidence readback differs');return held;}

// This initial SOURCE-QUALIFIED profile deliberately refuses the old installed
// executor. Digests select semantics, not caller authorization or registry issuance.
const packageRoles={pnpmPrecallModule:'bce20e7b6778b10c5305367b38c2af1148d6a125ba5f3b06f283c23052571129',pnpmLockDeltaModule:'0216e3c06b9d1fb354518f5c6b525e571372ff927f46ca77d9f2396b7f5f541a',yamlModule:'2d58984e0ae80de4acbd8f009fab332f5ce77d9e1a5f138a3058a0ada6567fb9'};
// Retain the previously qualified metadata source cohorts; add only the exact
// b191efaa7be1d33ca8bc53462cfd76eec0d6305f metadata-only Node24.18/24.19 cohort.
// Package precall/installation source roles above remain independently exact.
const roles={pnpmModule:['aeae7cbf00535d6d2d0d1ee8a51ee6f6c2bd0cf439fc2029327d73a902170458','302658bc4a081015b2547cef65d896a84e823c61a39a56e3a8e6b21d560e9f09','c3f3a48550fc699129377d3e1ce9a805e695a7e0d3d72bf1626e0ccf3d2f2db2','8eb002f13b176f3f61de98c670b9ab0fdbcbfe193298fdc1bd2c52b2d3dc42ec'],
  executorModule:'eafb7e3eae71813d375333ad881f7f7c2bd572bc781b01f8450ac4f7c4384d62'};
async function receiveBindings(input, profile='metadata'){
  if(!['metadata','package'].includes(profile))throw new TypeError('unsupported original worker source profile');
  const packageMode=profile==='package';
  own(input,['pnpmModule','executorModule','nativeProgram','nativeEntry','ps','files','resolutions','packageBindings',...(packageMode?['pnpmPrecallModule','pnpmLockDeltaModule','yamlModule','env']:[])],['pnpmModule','executorModule','nativeProgram','nativeEntry','ps','files','resolutions',...(packageMode?['pnpmPrecallModule','pnpmLockDeltaModule','yamlModule','env']:[])]);
  if(!Array.isArray(input.files)||!input.files.length||input.files.length>65536||!Array.isArray(input.resolutions)||input.resolutions.length>4096)throw new TypeError('complete bounded qualified closure required');
  const held=clone(input),seen=new Set();let total=0;
  for(const f of held.files){own(f,['path','bytes','sha256']);if(seen.has(f.path)||!Number.isSafeInteger(f.bytes)||f.bytes<0||!/^[a-f0-9]{64}$/u.test(f.sha256))throw new TypeError('unique exact source file required');seen.add(f.path);total+=f.bytes;if(total>512*1024*1024)throw new TypeError('source closure byte bound exceeded');if(!isDeepStrictEqual(await identity(f.path,268435456),f))throw new TypeError('qualified source bytes changed');}
  for(const [role,digest]of Object.entries(roles)){if(!seen.has(held[role])||!(Array.isArray(digest)?digest:[digest]).includes(sha(await bytes(held[role]))))throw new TypeError('unsupported original source supplier: '+role);}
  if(packageMode)for(const [role,expected]of Object.entries(packageRoles)){if(!seen.has(held[role])||sha(await bytes(held[role]))!==expected)throw new TypeError('unsupported original package supplier: '+role);}
  for(const role of ['nativeProgram','nativeEntry','ps',...(packageMode?['env']:[])])if(!seen.has(held[role]))throw new TypeError('native executable missing from qualified closure');
  if(held.nativeProgram!==await realpath(process.execPath))throw new TypeError('source worker Node differs');
  for(const binding of held.resolutions){own(binding,['importer','specifier','resolved']);if(!seen.has(binding.importer)||!seen.has(binding.resolved)||await realpath(createRequire(binding.importer).resolve(binding.specifier))!==binding.resolved)throw new TypeError('source import binding changed');}
  // Receive the actual native package-search edges and conservative package-file
  // superset; do not mistake two visible executor functions for its whole closure.
  const queue=[held.pnpmModule,held.executorModule,held.nativeEntry,...(packageMode?[held.yamlModule]:[])].map(p=>join(dirname(dirname(p)),'package.json'));
  if(packageMode)queue.push(fileURLToPath(new URL('../package.json',import.meta.url)));
  const packages=new Set(),packageBindings=[];let paths=0;
  async function inventory(dir,root=dir){for(const entry of await readdir(dir,{withFileTypes:true})){
    if((entry.name==='node_modules'&&dir===root)||entry.name==='.git')continue;
    if(++paths>65536)throw new TypeError('package closure path bound exceeded');
    const path=join(dir,entry.name);if(entry.isDirectory())await inventory(path,root);
    else if(!entry.isFile()||!seen.has(path))throw new TypeError('incomplete or redirected source package closure');
  }}
  while(queue.length){const manifestPath=await realpath(queue.shift());if(packages.has(manifestPath))continue;packages.add(manifestPath);
    if(packages.size>256||!seen.has(manifestPath))throw new TypeError('complete bounded package closure required');
    await inventory(dirname(manifestPath));const manifest=JSON.parse(await bytes(manifestPath));
    for(const name of Object.keys(manifest.dependencies??{})){
      if(isBuiltin(name))continue;let selected;
      for(const path of createRequire(manifestPath).resolve.paths(name)??[]){
        const candidate=join(path,name);let stat;try{stat=await lstat(candidate);}catch(error){if(error.code==='ENOENT'||error.code==='ENOTDIR')continue;throw error;}
        if(!stat.isDirectory()&&!stat.isSymbolicLink())throw new TypeError('ambiguous nearer dependency path');
        // Nearest existing package directory wins; absence of its manifest is
        // unsupported, never permission to fall through to an ancestor package.
        const root=await realpath(candidate);if(!(await lstat(root)).isDirectory())throw new TypeError('redirected dependency package');
        selected=join(root,'package.json');await bytes(selected,1048576);break;
      }
      if(!selected)throw new TypeError('original dependency closure unavailable');
      packageBindings.push({importer:manifestPath,name,manifest:selected});queue.push(selected);
    }
  }
  packageBindings.sort((a,b)=>(a.importer+' '+a.name).localeCompare(b.importer+' '+b.name));
  if(input.packageBindings!==undefined&&!isDeepStrictEqual(input.packageBindings,packageBindings))throw new TypeError('native dependency search binding changed');
  return {...held,packageBindings};
}

export {sha,own,clone,absolute,bytes,identity,absent,directory,inside,save,receiveBindings};
