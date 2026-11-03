import {test} from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,lstat,chmod,symlink,rm,link} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';import {DatabaseSync} from 'node:sqlite';
import {receiveExistingNativeStoreOwnerPermissions as receive} from '../src/native-store-custody.mjs';
async function fixture(t){
 const root=await mkdtemp(join(tmpdir(),'pnpm-store-owner-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const storeBase=join(root,'store'),storeDirectory=join(storeBase,'v11');await mkdir(storeDirectory,{recursive:true});
 const db=new DatabaseSync(join(storeDirectory,'index.db'));db.exec('CREATE TABLE packages (name TEXT PRIMARY KEY)');db.close();
 await chmod(storeBase,0o775);await chmod(storeDirectory,0o775);return{root,storeBase,storeDirectory};
}
test('explicit owner receiving restricts original directories, preserving native index and hardlinked payload',async t=>{
 const p=await fixture(t),index=join(p.storeDirectory,'index.db'),bytes=await readFile(index),before=await lstat(index);
 const payload=join(p.storeDirectory,'payload');await writeFile(payload,'held payload',{mode:0o644});const alias=join(p.root,'alias');await link(payload,alias);const payloadBefore=await lstat(payload);
 const receipt=await receive(p);assert.equal(receipt.state,'received');assert.equal(receipt.contentsTraversed,false);assert.equal(receipt.payloadModesChanged,false);
 for(const path of[p.storeBase,p.storeDirectory])assert.equal((await lstat(path)).mode&0o777,0o700);
 assert.deepEqual(await readFile(index),bytes);assert.equal((await lstat(index)).ino,before.ino);
 const after=await lstat(payload);assert.equal(after.ino,payloadBefore.ino);assert.equal(after.mode,payloadBefore.mode);assert.equal(after.nlink,2);
 assert.equal((await receive(p)).state,'received');
});
test('missing native index refuses before changing either legacy directory',async t=>{
 const p=await fixture(t);await rm(join(p.storeDirectory,'index.db'));
 await assert.rejects(receive(p),e=>e.code==='ENOENT'&&e.nativeStoreOwnerPermissions.state==='refused');
 for(const path of[p.storeBase,p.storeDirectory])assert.equal((await lstat(path)).mode&0o777,0o775);
});
test('world writable and redirected stores refuse without changing existing custody',async t=>{
 const p=await fixture(t);await chmod(p.storeDirectory,0o777);
 await assert.rejects(receive(p),/not world writable/);assert.equal((await lstat(p.storeBase)).mode&0o777,0o775);
 await chmod(p.storeDirectory,0o775);const alias=join(p.root,'redirect');await symlink(p.storeBase,alias);
 await assert.rejects(receive({storeBase:alias,storeDirectory:join(alias,'v11')}),/unredirected/);
 assert.equal((await lstat(p.storeBase)).mode&0o777,0o775);
});
