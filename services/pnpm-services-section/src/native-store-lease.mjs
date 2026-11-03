/** PNPM-owned native v11 store read under SQLite's original exclusive connection lock. */
import {lstat,realpath} from 'node:fs/promises';
import {isAbsolute,join,resolve} from 'node:path';

const directory=async path=>{
 if(typeof path!=='string'||!isAbsolute(path)||resolve(path)!==path)throw new TypeError('canonical native store directory required');
 const s=await lstat(path);
 if(!s.isDirectory()||await realpath(path)!==path||s.uid!==process.getuid()||(s.mode&0o022))
  throw new TypeError('native store must be an owned unredirected directory without other writers');
 return s;
};
const identity=s=>({device:String(s.dev),inode:String(s.ino),bytes:String(s.size),mtimeNs:String(s.mtimeNs),ctimeNs:String(s.ctimeNs)});
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

/**
 * The caller supplies the native manager's ACTUAL store-path result.
 * No store is initialized or copied. No package row, policy or journal mode changes.
 * The callback must use qualified PNPM --frozen-store --offline --frozen-lockfile
 * with isolated hardlink import. SQLite admission is immediate; a busy cache refuses.
 */
export async function withFrozenPnpmStore({storeDirectory,installationDirectory},work){
 if(process.platform!=='linux'||Number(process.versions.node.split('.')[0])<24)
  throw new TypeError('frozen native store requires qualified Linux Node24 or later');
 if(typeof work!=='function')throw new TypeError('native frozen receiving callback required');
 const store=await directory(storeDirectory),destination=await directory(installationDirectory);
 if(store.dev!==destination.dev)throw new TypeError('hardlink receiving requires the SAME filesystem as the native store');
 const file=join(storeDirectory,'index.db');
 const held=await lstat(file,{bigint:true});
 if(!held.isFile()||held.size<100n||held.size>268435456n||await realpath(file)!==file||held.uid!==BigInt(process.getuid()))
  throw new TypeError('bounded existing native PNPM index required');
 const {DatabaseSync}=await import('node:sqlite');
 const db=new DatabaseSync(file,{timeout:0,readBigInts:true});
 let transaction=false;
 try{
  const mode=db.prepare('PRAGMA locking_mode=EXCLUSIVE').get();
  if(mode.locking_mode!=='exclusive')throw new Error('native store exclusive locking mode was not received');
  db.exec('BEGIN EXCLUSIVE');transaction=true;
  // EXCLUSIVE connection mode also excludes native checkpoints. BEGIN IMMEDIATE
  // alone in WAL mode would NOT make an immutable reader safe.
  const before=identity(await lstat(file,{bigint:true}));
  if(before.device!==String(held.dev)||before.inode!==String(held.ino)||await realpath(file)!==file)
   throw new Error('native store index changed before exclusive receiving');
  const result=await work();
  if(!same(before,identity(await lstat(file,{bigint:true})))||await realpath(file)!==file)
   throw new Error('native store index changed during immutable receiving');
  return {result,receipt:{kind:'pnpm.native-frozen-store-read',storeDirectory,installationDirectory,
   index:before,writerExclusion:'sqlite-exclusive-connection',storeRowsWritten:false}};
 }finally{
  try{if(transaction)db.exec('ROLLBACK');}finally{db.close();}
 }
}
