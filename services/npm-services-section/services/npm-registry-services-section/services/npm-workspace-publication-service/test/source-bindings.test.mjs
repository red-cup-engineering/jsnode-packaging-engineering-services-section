import assert from "node:assert/strict";
import { lstat, mkdir, mkdtemp, readFile, writeFile, rm, symlink, readlink, unlink, readdir, rename, chmod } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import test from "node:test";
import {spawn,spawnSync} from "node:child_process";
import { withSourceBindings, recoverSourceBindings } from "../src/source-bindings.mjs";

async function packageAt(root, name, version, source) {
  await writeFile(join(root, "package.json"), JSON.stringify({ name, version, type: "module", main: "./index.mjs", scripts: { test: "node --test" } }));
  await writeFile(join(root, "index.mjs"), source);
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "source-bindings-"));
  const provider = join(root, "provider"), consumer = join(root, "consumer"), installed = join(consumer, "node_modules", "@scope", "provider");
  await mkdir(installed, { recursive: true });
  await mkdir(provider, { recursive: true });
  await mkdir(consumer, { recursive: true });
  await packageAt(provider, "@scope/provider", "1.2.3", "export const value = 'source';\n");
  await packageAt(installed, "@scope/provider", "1.2.3", "export const value = 'installed';\n");
  await packageAt(consumer, "@scope/consumer", "1.0.0", "import { value } from '@scope/provider'; export { value };\n");
  const providerPkg = { name: "@scope/provider", version: "1.2.3", dir: provider, lifecycle: ["test"] };
  const consumerPkg = { name: "@scope/consumer", version: "1.0.0", dir: consumer, lifecycle: ["test"] };
  return { root, consumer, installed, plan: { packages: [providerPkg, consumerPkg], dependencies: { "@scope/provider": [], "@scope/consumer": ["@scope/provider"] } } };
}

test("source bindings make a selected exact provider win over a stale installation and restore it", async () => {
  const { consumer, installed, plan } = await fixture();
  const observed = await withSourceBindings(plan, async () => (await import(`${pathToFileURL(join(consumer, "index.mjs")).href}?bound=1`)).value);
  assert.equal(observed, "source");
  assert.equal((await lstat(installed)).isSymbolicLink(), false);
  assert.match(await readFile(join(installed, "index.mjs"), "utf8"), /installed/);
});

test("source bindings restore stale installations after a failed verification command", async () => {
  const { installed, plan } = await fixture();
  await assert.rejects(withSourceBindings(plan, async () => { throw new Error("expected failure"); }), /expected failure/);
  assert.equal((await lstat(installed)).isSymbolicLink(), false);
  assert.match(await readFile(join(installed, "index.mjs"), "utf8"), /installed/);
});

test("source-bound verification refuses lifecycle installation before changing a target", async () => {
  const { consumer, installed, plan } = await fixture();
  await writeFile(join(consumer, "package.json"), JSON.stringify({ name: "@scope/consumer", version: "1.0.0", type: "module", scripts: { test: "npm install" } }));
  await assert.rejects(withSourceBindings(plan, async () => assert.fail("verification must not run")), /npm installation is not permitted/);
  assert.equal((await lstat(installed)).isSymbolicLink(), false);
  assert.match(await readFile(join(installed, "index.mjs"), "utf8"), /installed/);
});

const bindingModule=new URL('../src/source-bindings.mjs',import.meta.url).href;
async function durableFixture(){
  const f=await fixture();await rm(f.installed,{recursive:true,force:true});
  f.directory=join(f.root,'state');await mkdir(f.directory,{mode:0o700});return f;
}
const missing=async path=>{try{await lstat(path);return false;}catch(error){if(error.code==='ENOENT')return true;throw error;}};
for(const level of ['node_modules','scope'])test('all target ancestors refuse a foreign '+level+' symlink before any binding effect',async()=>{
  const f=await durableFixture(),foreign=join(f.root,'foreign');await mkdir(foreign);
  const target=level==='node_modules'?join(f.consumer,'node_modules'):join(f.consumer,'node_modules','@scope');
  await rm(target,{recursive:true,force:true});await symlink(foreign,target,'dir');
  await assert.rejects(withSourceBindings(f.plan,()=>assert.fail('must not run')),/redirected/);
  assert.deepEqual(await readdir(foreign),[]);assert.deepEqual(await readdir(f.directory),[]);
  assert.equal(await readlink(target),foreign);
});
test('ordinary API preserves a diverged alias and its original installed backup',async()=>{
  const f=await fixture(),foreign=join(f.root,'foreign');await mkdir(foreign);
  await assert.rejects(withSourceBindings(f.plan,async()=>{await unlink(f.installed);await symlink(foreign,f.installed,'dir');}),/ownership diverged/);
  assert.equal(await readlink(f.installed),foreign);
  const names=await readdir(join(f.consumer,'node_modules','@scope'));
  const backup=names.find(x=>x.startsWith('provider.source-binding-backup-'));assert.ok(backup);
  assert.match(await readFile(join(f.consumer,'node_modules','@scope',backup,'index.mjs'),'utf8'),/installed/);
});
test('durable binding publishes only an already journaled staged inode and restores after callback failure',async()=>{
  const f=await durableFixture();let ran=0;
  await assert.rejects(withSourceBindings(f.plan,async()=>{
    ran++;const journal=JSON.parse(await readFile(join(f.directory,'source-bindings.intent.json'),'utf8'));
    const entry=journal.entries[0],alias=await lstat(f.installed),stage=await lstat(entry.stage);
    assert.equal(alias.ino,entry.link.ino);assert.equal(stage.ino,alias.ino);assert.equal(alias.dev,stage.dev);
    assert.equal(await readlink(f.installed),entry.provider);assert.ok(alias.nlink>=2);
    throw new Error('actual callback refusal');
  },{durability:{directory:f.directory}}),/actual callback refusal/);
  assert.equal(ran,1);assert.equal(await missing(f.installed),true);assert.deepEqual(await readdir(f.directory),[]);
});
const childSource=String.raw`
import {promises as fs} from 'node:fs';import {syncBuiltinESMExports} from 'node:module';import {join} from 'node:path';
const [module,encoded,directory,stopAt]=process.argv.slice(1),plan=JSON.parse(encoded);
// A pending Promise alone does not keep Node alive at the received stop point.
const keepAlive=setInterval(()=>{},1000);
const nativeLink=fs.link;
if(stopAt)fs.link=async(from,to)=>{
  if(stopAt==='before-intent'&&to===join(directory,'source-bindings.intent.json')){process.stdout.write('READY\n');await new Promise(()=>{});}
  const value=await nativeLink(from,to);
  if(to===stopAt){process.stdout.write('READY\n');await new Promise(()=>{});}
  return value;
};
syncBuiltinESMExports();const {withSourceBindings}=await import(module);
await withSourceBindings(plan,async()=>{await fs.appendFile(join(directory,'effect.log'),'ran\n');process.stdout.write('READY\n');await new Promise(()=>{});},{durability:{directory}});
`;
async function interrupt(f,{signal='SIGKILL',stopAt=''}={}){
  const child=spawn(process.execPath,['--input-type=module','-e',childSource,bindingModule,JSON.stringify(f.plan),f.directory,stopAt],{env:process.env,stdio:['ignore','pipe','pipe']});
  let stderr='',stdout='';child.stderr.setEncoding('utf8');child.stderr.on('data',x=>stderr+=x);child.stdout.setEncoding('utf8');
  const exit=new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',(code,signal)=>resolve({code,signal}));});
  try{
    await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{child.kill('SIGKILL');reject(new Error('bounded native child readiness timeout '+stderr));},2000);
      child.stdout.on('data',chunk=>{stdout+=chunk;if(stdout.includes('READY\n')){clearTimeout(timer);resolve();}});
      child.once('close',(code,signal)=>{clearTimeout(timer);if(!stdout.includes('READY\n'))reject(new Error('native child ended before readiness '+code+'/'+signal+' '+stderr));});
      child.once('error',error=>{clearTimeout(timer);reject(error);});
    });
    child.kill(signal);const terminal=await exit;assert.equal(terminal.signal,signal);assert.equal(stderr,'');return terminal;
  }finally{if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');await exit;}
}
for(const signal of ['SIGTERM','SIGKILL'])test('actual '+signal+' interruption recovers exact owned aliases without replaying the callback',async()=>{
  const f=await durableFixture();await interrupt(f,{signal});
  assert.equal(await readFile(join(f.directory,'effect.log'),'utf8'),'ran\n');
  assert.equal((await recoverSourceBindings(f.plan,{directory:f.directory})).state,'RESTORED');
  assert.equal(await missing(f.installed),true);assert.equal(await readFile(join(f.directory,'effect.log'),'utf8'),'ran\n');
  let next=0;await withSourceBindings(f.plan,async()=>{next++;},{durability:{directory:f.directory}});assert.equal(next,1);
  assert.equal((await recoverSourceBindings(f.plan,{directory:f.directory})).state,'NOT_RECORDED');
});
test('interruption between first and second native no-replace links recovers only effects that occurred',async()=>{
  const f=await durableFixture(),other=join(f.root,'consumer2');await mkdir(other);
  await packageAt(other,'@scope/consumer2','1.0.0',"export {};\n");
  f.plan.packages.push({name:'@scope/consumer2',version:'1.0.0',dir:other,lifecycle:[]});
  f.plan.dependencies['@scope/consumer2']=['@scope/provider'];
  const otherAlias=join(other,'node_modules','@scope','provider');await interrupt(f,{stopAt:f.installed});
  assert.equal(await missing(f.installed),false);assert.equal(await missing(otherAlias),true);
  assert.equal((await recoverSourceBindings(f.plan,{directory:f.directory})).restored,1);
  assert.equal(await missing(f.installed),true);assert.equal(await missing(otherAlias),true);
  assert.equal(await missing(join(f.directory,'effect.log')),true);
});
test('pre-intent interruption leaves inactive staging but never an unjournaled active alias or permanent stall',async()=>{
  const f=await durableFixture();await interrupt(f,{stopAt:'before-intent'});
  assert.equal(await missing(f.installed),true);assert.equal(await missing(join(f.directory,'source-bindings.intent.json')),true);
  const staged=(await readdir(f.directory)).sort();assert.equal(staged.length,1);
  assert.equal((await recoverSourceBindings(f.plan,{directory:f.directory})).state,'NOT_RECORDED');
  await withSourceBindings(f.plan,async()=>{}, {durability:{directory:f.directory}});
  assert.deepEqual((await readdir(f.directory)).sort(),staged); // Original inactive preparation is preserved, not guessed away.
});
test('post-interruption foreign alias is preserved with its original recovery intent',async()=>{
  const f=await durableFixture();await interrupt(f);const journal=await readFile(join(f.directory,'source-bindings.intent.json'));
  await unlink(f.installed);const foreign=join(f.root,'foreign');await mkdir(foreign);await symlink(foreign,f.installed,'dir');
  const before=await lstat(f.installed);await assert.rejects(recoverSourceBindings(f.plan,{directory:f.directory}),/ownership diverged/);
  assert.equal((await lstat(f.installed)).ino,before.ino);assert.equal(await readlink(f.installed),foreign);
  assert.ok((await readFile(join(f.directory,'source-bindings.intent.json'))).equals(journal));
});
test('durable mode preserves an occupied target rather than replacing an installed provider',async()=>{
  const f=await fixture();f.directory=join(f.root,'state');await mkdir(f.directory,{mode:0o700});
  await assert.rejects(withSourceBindings(f.plan,()=>assert.fail('must not run'),{durability:{directory:f.directory}}),/must be absent/);
  assert.match(await readFile(join(f.installed,'index.mjs'),'utf8'),/installed/);assert.deepEqual(await readdir(f.directory),[]);
});
test('foreign journal symlink refuses before reading or changing its destination',async()=>{
  const f=await durableFixture(),foreign=join(f.root,'foreign.json');await writeFile(foreign,'unchanged');
  await symlink(foreign,join(f.directory,'source-bindings.intent.json'));
  await assert.rejects(recoverSourceBindings(f.plan,{directory:f.directory}),/journal identity is foreign/);
  assert.equal(await readFile(foreign,'utf8'),'unchanged');assert.equal(await readlink(join(f.directory,'source-bindings.intent.json')),foreign);
});

test('ordinary cleanup preserves aliases when their admitted parent directory has been replaced',async()=>{
  const f=await durableFixture(),parent=join(f.consumer,'node_modules','@scope'),saved=parent+'.original',foreign=join(f.root,'foreign');
  await mkdir(foreign);
  await assert.rejects(withSourceBindings(f.plan,async()=>{await rename(parent,saved);await symlink(foreign,parent,'dir');}),/redirected|parent ownership changed/);
  assert.deepEqual(await readdir(foreign),[]);assert.equal(await readlink(parent),foreign);
  assert.equal(await readlink(join(saved,'provider')),f.plan.packages[0].dir);
});
test('durable state cannot be mixed into a source root',async()=>{
  const f=await durableFixture(),inside=join(f.consumer,'state');await mkdir(inside,{mode:0o700});
  await assert.rejects(withSourceBindings(f.plan,()=>assert.fail('must not run'),{durability:{directory:inside}}),/separate from source roots/);
  assert.equal(await missing(f.installed),true);assert.deepEqual(await readdir(inside),[]);
});

test('group or other writable mutable ancestors refuse before any binding effect',async()=>{
 for(const mode of [0o770,0o707]){
  const f=await durableFixture(),parent=join(f.consumer,'node_modules','@scope');await chmod(parent,mode);
  await assert.rejects(withSourceBindings(f.plan,()=>assert.fail('must not run')),/owned and not group\/other writable/);
  assert.equal(await missing(f.installed),true);assert.deepEqual(await readdir(f.directory),[]);
 }
});
test('new mutable parents and their parent entries are natively synced before durable intent publication',async()=>{
 const f=await durableFixture();await rm(join(f.consumer,'node_modules'),{recursive:true});
 const source=String.raw`
 import assert from 'node:assert/strict';import {promises as fs} from 'node:fs';import {syncBuiltinESMExports} from 'node:module';import {dirname,join} from 'node:path';
 const [module,encoded,directory]=process.argv.slice(1),plan=JSON.parse(encoded),events=[];
 const nativeMkdir=fs.mkdir,nativeOpen=fs.open,nativeLink=fs.link;
 fs.mkdir=async(path,...args)=>{const r=await nativeMkdir(path,...args);events.push(['mkdir',path]);return r;};
 fs.open=async(path,...args)=>{const handle=await nativeOpen(path,...args),sync=handle.sync.bind(handle);handle.sync=async()=>{await sync();events.push(['sync',path]);};return handle;};
 fs.link=async(from,to)=>{const r=await nativeLink(from,to);events.push(['link',to]);return r;};
 syncBuiltinESMExports();const {withSourceBindings}=await import(module);
 await withSourceBindings(plan,async()=>{}, {durability:{directory}});
 const journal=events.findIndex(([kind,path])=>kind==='link'&&path===join(directory,'source-bindings.intent.json'));
 const created=events.filter(([kind])=>kind==='mkdir');assert.equal(created.length,2);assert.ok(journal>0);
 for(const [,path] of created){
  const made=events.findIndex(([kind,p])=>kind==='mkdir'&&p===path);
  for(const expected of [path,dirname(path)])assert.ok(events.some(([kind,p],i)=>kind==='sync'&&p===expected&&i>made&&i<journal),expected+' not synced before intent');
 }
 console.log(JSON.stringify({created:created.length,intentAfterDirectorySync:true}));
 `;
 const result=spawnSync(process.execPath,['--input-type=module','-e',source,bindingModule,JSON.stringify(f.plan),f.directory],{env:process.env,encoding:'utf8',timeout:2000,maxBuffer:65536});
 assert.equal(result.error,undefined);assert.equal(result.status,0,result.stderr);assert.equal(result.signal,null);assert.equal(result.stderr,'');
 assert.deepEqual(JSON.parse(result.stdout),{created:2,intentAfterDirectorySync:true});assert.equal(await missing(f.installed),true);
});
