// PNPM-owned native importPackage extension. No resolver, fetcher, extraction or copy.
import {lstat,realpath,mkdir,link} from 'node:fs/promises';
import {isAbsolute,join,relative,resolve,sep} from 'node:path';

const below=(root,path)=>{const p=relative(root,path);return p!==''&&!isAbsolute(p)&&p!=='..'&&!p.startsWith('..'+sep);};
async function canonicalDirectory(path){
 const s=await lstat(path);
 if(!s.isDirectory()||await realpath(path)!==path)throw new TypeError('native hardlink directory is redirected');
 return s;
}
async function directories(root,target){
 if(target!==root&&!below(root,target))throw new TypeError('native import target escapes staging');
 let at=root;await canonicalDirectory(at);
 for(const part of relative(root,target).split(sep).filter(Boolean)){
  at=join(at,part);try{await mkdir(at,{mode:0o755});}catch(error){if(error.code!=='EEXIST')throw error;}
  await canonicalDirectory(at);
 }
}
export async function createStrictStoreImporter({storeDirectory,installationDirectory}){
 if(process.platform!=='linux'||typeof storeDirectory!=='string'||typeof installationDirectory!=='string'
  ||!isAbsolute(storeDirectory)||resolve(storeDirectory)!==storeDirectory
  ||!isAbsolute(installationDirectory)||resolve(installationDirectory)!==installationDirectory)
  throw new TypeError('real Linux native store and installation required');
 const files=join(storeDirectory,'files');
 const [source,destination]=await Promise.all([canonicalDirectory(files),canonicalDirectory(installationDirectory)]);
 if(source.dev!==destination.dev)throw new TypeError('native hardlinks require the same filesystem');
 let imports=0,links=0,bytes=0;
 const importPackage=async(to,options)=>{
  if(typeof to!=='string'||!isAbsolute(to)||resolve(to)!==to||!below(installationDirectory,to))
   throw new TypeError('native package import escapes its installation');
  if(!(options?.filesMap instanceof Map)||options.filesMap.size>100000
   ||(options.symlinks!==undefined&&(!(options.symlinks instanceof Map)||options.symlinks.size)))
   throw new TypeError('bounded native regular-file import map required');
  const selected=[];
  for(const[name,from]of options.filesMap){
   if(typeof name!=='string'||name===''||isAbsolute(name)||name.includes('\\')
    ||name.split('/').some(p=>p===''||p==='.'||p==='..')
    ||typeof from!=='string'||!isAbsolute(from)||!below(files,from))
    throw new TypeError('native package file escapes its original store or package');
   const s=await lstat(from,{bigint:true});
   if(!s.isFile()||await realpath(from)!==from||s.dev!==BigInt(source.dev)
    ||![0o644n,0o755n].includes(s.mode&0o777n))
    throw new TypeError('native store file requires copying or normalization; strict assembly refuses');
   selected.push({name,from,device:s.dev,inode:s.ino,bytes:s.size});
  }
  await directories(installationDirectory,to);
  for(const file of selected){
   const target=join(to,file.name);await directories(installationDirectory,resolve(target,'..'));
   try{await link(file.from,target);}catch(error){
    if(error.code!=='EEXIST')throw error;
   }
   const actual=await lstat(target,{bigint:true});
   if(!actual.isFile()||actual.dev!==file.device||actual.ino!==file.inode)
    throw new Error('native import is not the exact original payload hardlink');
   links++;bytes+=Number(file.bytes);
  }
  imports++;
  return 'hardlink';
 };
 return Object.freeze({importPackage,read:()=>({kind:'pnpm.strict-native-store-import',imports,links,logicalBytes:bytes,copiedPayloadBytes:0})});
}
