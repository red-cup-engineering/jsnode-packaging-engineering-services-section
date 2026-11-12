// Structural read-only observation; native installation and archive authority stay
// with the original Code receiver. Never imports or executes installed packages.
import {lstat,realpath,opendir,open,readlink} from 'node:fs/promises';
import {constants} from 'node:fs';
import {join,resolve,relative,isAbsolute,dirname,sep} from 'node:path';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
const bounds=Object.freeze({paths:65536,depth:128,fileBytes:67108864,bytes:1073741824,manifestBytes:1048576,pathBytes:4096});
const sha=b=>createHash('sha256').update(b).digest('hex');
const inside=(r,p)=>{const v=relative(r,p);return !isAbsolute(v)&&v!=='..'&&!v.startsWith('..'+sep);};
const stable=(a,b)=>['dev','ino','size','mode','mtimeMs','ctimeMs'].every(k=>a[k]===b[k]);
const ownRecord=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&[Object.prototype,null].includes(Object.getPrototypeOf(v));
const packageName=/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/u;
const fields=['dependencies','devDependencies','optionalDependencies','peerDependencies'];
async function readBounded(path,max){
 const before=await lstat(path);if(!before.isFile()||before.size>max)throw new RangeError('bounded installed file required');
 const handle=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{
  if(!stable(before,await handle.stat()))throw new TypeError('installed file changed before opening');
  const body=Buffer.alloc(before.size);let offset=0;
  while(offset<body.length){const {bytesRead}=await handle.read(body,offset,body.length-offset,offset);if(!bytesRead)throw new TypeError('installed file shrank');offset+=bytesRead;}
  if((await handle.read(Buffer.alloc(1),0,1,offset)).bytesRead||!stable(before,await handle.stat())||!stable(before,await lstat(path)))throw new TypeError('installed file changed');
  return body;
 }finally{await handle.close();}
}

async function tree(root){
 const rows=[],files=new Map(),directories=[],links=[];let bytes=0;
 async function visit(path,key,depth){
  if(rows.length>=bounds.paths||depth>bounds.depth||Buffer.byteLength(key)>bounds.pathBytes)throw new RangeError('installed inventory path bound exceeded');
  const a=await lstat(path),mode=a.mode&0o777;
  if(a.isSymbolicLink()){
   const literal=await readlink(path),target=await realpath(path);
   if(Buffer.byteLength(literal)>bounds.pathBytes||!inside(root,target))throw new TypeError('installed link leaves tree');
   const row=['link',key,mode,literal,relative(root,target)];rows.push(row);links.push(row);
  }else if(a.isDirectory()){
   if(await realpath(path)!==path)throw new TypeError('redirected installed directory');
   rows.push(['directory',key,mode]);directories.push(key);
   const names=[];for await(const entry of await opendir(path)){if(names.length+rows.length>=bounds.paths)throw new RangeError('installed inventory path bound exceeded');names.push(entry.name);}
   for(const name of names.sort())await visit(join(path,name),key?key+'/'+name:name,depth+1);
  }else if(a.isFile()){
   if(a.size>bounds.fileBytes||a.size>bounds.bytes-bytes)throw new RangeError('installed inventory byte bound exceeded');
   const body=await readBounded(path,bounds.fileBytes);if(body.length!==a.size)throw new TypeError('installed file changed');
   bytes+=body.length;const row=['file',key,mode,body.length,sha(body)];rows.push(row);files.set(key,row);
  }else throw new TypeError('unsupported installed entry');
  if(!stable(a,await lstat(path)))throw new TypeError('installed entry changed');
 }
 await visit(root,'',0);return {rows,files,directories,links,bytes};
}
function packageCoordinate(key){
 // The observer root itself is node_modules. Inner node_modules occurrences
 // include each PNPM instance and native nested/bundled package location.
 const parts=key.split('/');let i=parts.lastIndexOf('node_modules')+1;
 if(i===0&&parts[0]==='.pnpm')return false;
 const tail=parts.slice(i);return tail.length===1&&!tail[0].startsWith('.')||tail.length===2&&tail[0].startsWith('@');
}
async function inventory(root,scan){
 const roots=new Set(scan.directories.filter(k=>k&&packageCoordinate(k)&&!k.split('/').at(-1).startsWith('@')));
 const aliases=[];
 for(const row of scan.links){if(row[1].split('/').at(-1)==='node_modules')throw new TypeError('redirected installed package container is unsupported');}
 for(const row of scan.links)if(packageCoordinate(row[1])){
  if(row[1].split('/').at(-1).startsWith('@'))throw new TypeError('redirected installed scope is unsupported');
  const target=row[4];if(!(await lstat(join(root,target))).isDirectory())throw new TypeError('installed package alias is not a directory');
  roots.add(target);aliases.push({path:row[1],target,literal:row[3]});
 }
 const manifests=new Map(),packages=[];
 for(const coordinate of [...roots].sort()){
  const key=coordinate+'/package.json',identity=scan.files.get(key);
  if(!identity||identity[3]>bounds.manifestBytes)throw new TypeError('bounded installed package manifest required');
  const body=await readBounded(join(root,key),bounds.manifestBytes);if(sha(body)!==identity[4])throw new TypeError('installed manifest changed');
  const manifest=JSON.parse(body);if(!ownRecord(manifest)||typeof manifest.name!=='string'||!packageName.test(manifest.name)||typeof manifest.version!=='string'||!manifest.version.length)throw new TypeError('installed package identity required');
  manifests.set(coordinate,manifest);
 }
 async function lookup(coordinate,name){
  let current=join(root,coordinate);
  while(inside(root,current)){
   // Node omits node_modules/node_modules during upward package search.
   if(current.split(sep).at(-1)!=='node_modules'){
    const candidate=join(current,'node_modules',name);let stat;
    try{stat=await lstat(candidate);}catch(e){if(e.code!=='ENOENT')throw e;}
    if(stat){const target=await realpath(candidate),key=relative(root,target);
     if(!inside(root,target)||!manifests.has(key))throw new TypeError('nearest installed dependency is not an inventoried package');
     return key;
    }
   }
   if(current===root)break;current=dirname(current);
  }
  // The root node_modules itself is the final search location.
  const candidate=join(root,name);let stat;
  try{stat=await lstat(candidate);}catch(e){if(e.code!=='ENOENT')throw e;}
  if(!stat)return null;
  const target=await realpath(candidate),key=relative(root,target);
  if(!inside(root,target)||!manifests.has(key))throw new TypeError('root dependency is not an inventoried package');
  return key;
 }
 for(const [coordinate,manifest]of manifests){
  const dependencies=[];
  for(const category of fields){
   if(!Object.hasOwn(manifest,category))continue;
   if(!ownRecord(manifest[category]))throw new TypeError('installed dependency map required');
   for(const name of Object.keys(manifest[category]).sort()){
    const selection=manifest[category][name];if(!packageName.test(name)||typeof selection!=='string'||!selection.length)throw new TypeError('installed dependency declaration required');
    dependencies.push({category,name,selection,target:await lookup(coordinate,name)});
   }
  }
  const receivingTests={status:'unavailable',tests:[]};
  if(Object.hasOwn(manifest,'receivingTests')){
   const tests=manifest.receivingTests;if(!Array.isArray(tests)||tests.length>4096||new Set(tests).size!==tests.length)throw new TypeError('bounded unique receiving test declaration required');
   receivingTests.status='declared';
   for(const path of tests){
    if(typeof path!=='string'||!path||isAbsolute(path)||path.includes('\\')||/[\x00-\x1f\x7f]/u.test(path)||path.split('/').some(v=>!v||v==='.'||v==='..'))throw new TypeError('safe package-relative receiving test required');
    const row=scan.files.get(coordinate+'/'+path);
    if(!row||await realpath(join(root,coordinate,path))!==join(root,coordinate,path))throw new TypeError('declared installed receiving test unavailable');
    receivingTests.tests.push({path,mode:row[2],bytes:row[3],sha256:row[4]});
   }
  }
  const row=scan.files.get(coordinate+'/package.json');
  packages.push({coordinate,name:manifest.name,version:manifest.version,manifest:{mode:row[2],bytes:row[3],sha256:row[4]},dependencies,receivingTests});
 }
 return {packages,aliases};
}
export async function observeInstalledClosure(input){
 if(!ownRecord(input)||Reflect.ownKeys(input).length!==1||!Object.hasOwn(input,'installationRoot')||!Object.hasOwn(Object.getOwnPropertyDescriptor(input,'installationRoot'),'value')||typeof input.installationRoot!=='string'||!isAbsolute(input.installationRoot)||resolve(input.installationRoot)!==input.installationRoot)throw new TypeError('exact absolute installationRoot required');
 const root=join(input.installationRoot,'node_modules');
 if(await realpath(root)!==root||!(await lstat(root)).isDirectory())throw new TypeError('real installed root required');
 const first=await tree(root),observed=await inventory(root,first),second=await tree(root),repeated=await inventory(root,second);
 if(!isDeepStrictEqual(first.rows,second.rows)||!isDeepStrictEqual(observed,repeated))throw new TypeError('installed closure changed during observation');
 const treeSHA256=sha(JSON.stringify(first.rows)),observationSHA256=sha(JSON.stringify({treeSHA256,...observed}));
 return {kind:'pnpm.installed-closure.observation.v1',root,treeSHA256,observationSHA256,paths:first.rows.length,bytes:first.bytes,bounds,...observed,
  scope:'complete actual installed package inventory; no native-lock or archive correspondence',runtimeAcceptance:false,nativeExecutionReceived:false,archiveVerificationReceived:false,lockCorrespondenceReceived:false};
}
