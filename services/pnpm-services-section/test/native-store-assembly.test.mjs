import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,lstat,symlink,chmod,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import {createStrictStoreImporter} from '../src/native-strict-store-importer.mjs';
import {withFrozenPnpmStore} from '../src/native-store-lease.mjs';

async function fixture(t){
 const root=await mkdtemp(join(tmpdir(),'pnpm-store-assembly-control-'));
 t.after(()=>rm(root,{recursive:true,force:true}));
 const store=join(root,'store'),stage=join(root,'stage');
 await mkdir(join(store,'files'),{recursive:true,mode:0o755});await mkdir(stage,{mode:0o755});
 const source=join(store,'files','payload');await writeFile(source,'original payload',{mode:0o644});
 return{root,store,stage,source};
}
test('the original import map produces exact payload hardlinks without copying',async t=>{
 const f=await fixture(t),p=await createStrictStoreImporter({storeDirectory:f.store,installationDirectory:f.stage});
 assert.equal(await p.importPackage(join(f.stage,'pkg'),{filesMap:new Map([['lib/source.js',f.source]])}),'hardlink');
 const a=await lstat(f.source),b=await lstat(join(f.stage,'pkg/lib/source.js'));
 assert.equal(a.dev,b.dev);assert.equal(a.ino,b.ino);assert.ok(a.nlink>=2);
 assert.deepEqual(p.read(),{kind:'pnpm.strict-native-store-import',imports:1,links:1,logicalBytes:16,copiedPayloadBytes:0});
});
test('a native file-mode normalization need refuses before creating a package',async t=>{
 const f=await fixture(t),p=await createStrictStoreImporter({storeDirectory:f.store,installationDirectory:f.stage});
 await chmod(f.source,0o600);
 await assert.rejects(p.importPackage(join(f.stage,'pkg'),{filesMap:new Map([['source.js',f.source]])}),/copying or normalization/);
 await assert.rejects(lstat(join(f.stage,'pkg')),{code:'ENOENT'});
});
test('unrelated existing targets refuse intact rather than being replaced',async t=>{
 const f=await fixture(t),p=await createStrictStoreImporter({storeDirectory:f.store,installationDirectory:f.stage});
 await mkdir(join(f.stage,'pkg'));await writeFile(join(f.stage,'pkg/source.js'),'retained target');
 await assert.rejects(p.importPackage(join(f.stage,'pkg'),{filesMap:new Map([['source.js',f.source]])}),/not the exact original/);
 assert.equal(await readFile(join(f.stage,'pkg/source.js'),'utf8'),'retained target');
});
test('escaped, redirected and unsupported native carriers refuse without an outside write',async t=>{
 const f=await fixture(t),p=await createStrictStoreImporter({storeDirectory:f.store,installationDirectory:f.stage});
 await symlink(f.source,join(f.store,'files/link'));
 for(const options of[
  {filesMap:new Map([['../outside',f.source]])},
  {filesMap:new Map([['file',join(f.store,'files/link')]])},
  {filesMap:{file:f.source}},
  {filesMap:new Map([['file',f.source]]),symlinks:new Map([['x','y']])}
 ])await assert.rejects(p.importPackage(join(f.stage,'pkg'),options));
 await assert.rejects(lstat(join(f.root,'outside')),{code:'ENOENT'});
 await assert.rejects(lstat(join(f.stage,'pkg')),{code:'ENOENT'});
});
function index(f){
 const file=join(f.store,'index.db'),db=new DatabaseSync(file);
 db.exec("PRAGMA journal_mode=WAL; CREATE TABLE fixture(value TEXT); INSERT INTO fixture VALUES('received value')");
 db.close();return file;
}
function child(file,source){
 const r=spawnSync(process.execPath,['--input-type=module','-e',source,file],{encoding:'utf8',timeout:10000});
 assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout);
}
test('exclusive native custody allows immutable reading while excluding writers AND checkpoints',async t=>{
 const f=await fixture(t),file=index(f);
 const result=await withFrozenPnpmStore({storeDirectory:f.store,installationDirectory:f.stage},async()=>{
  const read=child(file,"import{DatabaseSync}from'node:sqlite';const db=new DatabaseSync('file:'+process.argv[1]+'?immutable=1');console.log(JSON.stringify(db.prepare('SELECT value FROM fixture').get()));db.close()");
  assert.equal(read.value,'received value');
  const write=child(file,"import{DatabaseSync}from'node:sqlite';const db=new DatabaseSync(process.argv[1],{timeout:0});try{db.exec(\"INSERT INTO fixture VALUES('forbidden')\");console.log(JSON.stringify({written:true}));}catch(e){console.log(JSON.stringify({written:false,message:e.message}));}finally{db.close();}");
  assert.equal(write.written,false);assert.match(write.message,/locked|busy/iu);
  const checkpoint=child(file,"import{DatabaseSync}from'node:sqlite';const db=new DatabaseSync(process.argv[1],{timeout:0});try{console.log(JSON.stringify({row:db.prepare('PRAGMA wal_checkpoint(TRUNCATE)').get()}));}catch(e){console.log(JSON.stringify({blocked:/locked|busy/i.test(e.message)}));}finally{db.close();}");
  assert.ok(checkpoint.blocked||checkpoint.row?.busy===1,JSON.stringify(checkpoint));
  return 'native read';
 });
 assert.equal(result.result,'native read');assert.equal(result.receipt.writerExclusion,'sqlite-exclusive-connection');
 const db=new DatabaseSync(file);assert.equal(db.prepare('SELECT count(*) AS n FROM fixture').get().n,1);db.exec("INSERT INTO fixture VALUES('after release')");db.close();
});
test('busy native custody refuses without invoking dependent work',async t=>{
 const f=await fixture(t),file=index(f),other=new DatabaseSync(file);let called=false;
 other.exec('BEGIN IMMEDIATE');
 try{await assert.rejects(withFrozenPnpmStore({storeDirectory:f.store,installationDirectory:f.stage},()=>{called=true;}),/locked|busy/iu);}
 finally{other.exec('ROLLBACK');other.close();}
 assert.equal(called,false);
});
test('a failed native read releases original store custody',async t=>{
 const f=await fixture(t),file=index(f),sentinel=new Error('native receiving failed');
 await assert.rejects(withFrozenPnpmStore({storeDirectory:f.store,installationDirectory:f.stage},()=>{throw sentinel;}),e=>e===sentinel);
 const db=new DatabaseSync(file);db.exec("INSERT INTO fixture VALUES('release received')");db.close();
});
test('missing or redirected indices refuse before any callback or initialization',async t=>{
 const f=await fixture(t);let called=0;
 await assert.rejects(withFrozenPnpmStore({storeDirectory:f.store,installationDirectory:f.stage},()=>{called++;}));
 await assert.rejects(lstat(join(f.store,'index.db')),{code:'ENOENT'});
 const real=join(f.root,'other.db'),db=new DatabaseSync(real);db.exec('CREATE TABLE fixture(value)');db.close();
 await symlink(real,join(f.store,'index.db'));
 await assert.rejects(withFrozenPnpmStore({storeDirectory:f.store,installationDirectory:f.stage},()=>{called++;}));
 assert.equal(called,0);
});
test('a redirected package ancestor refuses before linking outside staging',async t=>{
 const f=await fixture(t),outside=join(f.root,'outside');await mkdir(outside);await symlink(outside,join(f.stage,'pkg'));
 const p=await createStrictStoreImporter({storeDirectory:f.store,installationDirectory:f.stage});
 await assert.rejects(p.importPackage(join(f.stage,'pkg'),{filesMap:new Map([['file',f.source]])}),/redirected/);
 await assert.rejects(lstat(join(outside,'file')),{code:'ENOENT'});
});
