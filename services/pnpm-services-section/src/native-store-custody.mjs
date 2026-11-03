/** Explicit PNPM owner migration for a legacy per-user cache, before frozen read custody. */
import {open,lstat,realpath} from 'node:fs/promises';
import {constants} from 'node:fs';
import {isAbsolute,join,resolve} from 'node:path';
const identity=s=>({device:String(s.dev),inode:String(s.ino),bytes:String(s.size),mtimeNs:String(s.mtimeNs)});
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export async function receiveExistingNativeStoreOwnerPermissions({storeBase,storeDirectory}){
 if(process.platform!=='linux'||typeof process.getuid!=='function'||typeof storeBase!=='string'||!isAbsolute(storeBase)||resolve(storeBase)!==storeBase||storeDirectory!==join(storeBase,'v11'))
  throw new TypeError('canonical existing native v11 store required');
 const held=[],receipt={kind:'pnpm.native-store-owner-permissions.v1',state:'preflight',directories:[],index:null,contentsTraversed:false,payloadModesChanged:false};
 try{
  // Open and receive BOTH existing directories and the index before changing either.
  for(const path of[storeBase,storeDirectory]){
   const before=await lstat(path,{bigint:true});
   if(!before.isDirectory()||await realpath(path)!==path||before.uid!==BigInt(process.getuid())||(before.mode&0o700n)!==0o700n||(before.mode&0o7002n)!==0n)
    throw new TypeError('existing store must be owned, unredirected and not world writable');
   const handle=await open(path,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);held.push({path,handle,before});
   const actual=await handle.stat({bigint:true});
   if(actual.dev!==before.dev||actual.ino!==before.ino)throw new Error('native store directory changed during admission');
  }
  const indexPath=join(storeDirectory,'index.db'),index=await lstat(indexPath,{bigint:true});
  if(!index.isFile()||await realpath(indexPath)!==indexPath||index.uid!==BigInt(process.getuid())||index.dev!==held[1].before.dev||index.size<100n||index.size>268435456n)
   throw new TypeError('bounded existing native PNPM index required; no store is initialized');
  receipt.index=identity(index);
  receipt.state='applying';
  for(const item of held){
   const current=await lstat(item.path,{bigint:true});
   if(current.dev!==item.before.dev||current.ino!==item.before.ino||await realpath(item.path)!==item.path)throw new Error('native store path changed before permission receiving');
   const row={path:item.path,device:String(current.dev),inode:String(current.ino),before:Number(current.mode&0o777n),after:null};receipt.directories.push(row);
   await item.handle.chmod(0o700);
   const after=await item.handle.stat({bigint:true}),named=await lstat(item.path,{bigint:true});
   row.after=Number(after.mode&0o777n);
   if(after.dev!==current.dev||after.ino!==current.ino||named.dev!==current.dev||named.ino!==current.ino||row.after!==0o700)throw new Error('native private store permission receiving changed identity');
  }
  if(!same(receipt.index,identity(await lstat(indexPath,{bigint:true})))||await realpath(indexPath)!==indexPath)throw new Error('native index changed during permission receiving');
  receipt.state='received';return receipt;
 }catch(error){receipt.state=receipt.state==='preflight'?'refused':'partial';error.nativeStoreOwnerPermissions=receipt;throw error;}
 finally{for(const item of held.reverse())await item.handle.close();}
}
