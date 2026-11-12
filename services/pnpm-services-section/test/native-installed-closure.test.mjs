import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,symlink,rm,readFile,chmod} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {observeInstalledClosure} from '../src/native-installed-closure.mjs';
async function fixture(t){const root=await mkdtemp(join(tmpdir(),'installed-inventory-'));t.after(()=>rm(root,{recursive:true,force:true}));await mkdir(join(root,'node_modules'));return root;}
async function pkg(root,coordinate,manifest={name:'a',version:'1.0.0'},files={}){const path=join(root,'node_modules',coordinate);await mkdir(path,{recursive:true});await writeFile(join(path,'package.json'),JSON.stringify(manifest));for(const [name,body]of Object.entries(files)){await mkdir(join(path,name,'..'),{recursive:true});await writeFile(join(path,name),body);}return path;}
const observe=root=>observeInstalledClosure({installationRoot:root});
test('IC1/IC6 empty actual tree is observed without receipt authority',async t=>{const r=await observe(await fixture(t));assert.deepEqual(r.packages,[]);for(const key of ['runtimeAcceptance','nativeExecutionReceived','archiveVerificationReceived','lockCorrespondenceReceived'])assert.equal(r[key],false);});
test('IC2/IC4 complete physical packages, aliases, distinct peer instances and test identities',async t=>{
 const root=await fixture(t);const one='.pnpm/a@1.0.0(peer@1)/node_modules/a',two='.pnpm/a@1.0.0(peer@2)/node_modules/a';
 await pkg(root,one,{name:'a',version:'1.0.0',receivingTests:['test/a.mjs']},{'test/a.mjs':'throw new Error("must not execute");'});await pkg(root,two);
 await symlink(one,join(root,'node_modules','a'));const r=await observe(root);
 assert.equal(r.packages.length,2);assert.equal(r.aliases.length,1);assert.equal(r.aliases[0].target,one);assert.equal(r.packages[0].receivingTests.tests[0].path,'test/a.mjs');assert.equal(r.packages[1].receivingTests.status,'unavailable');
 assert.equal((await observe(root)).observationSHA256,r.observationSHA256);
});
test('IC3 records nearest dependency edges and missing optional and development selections',async t=>{
 const root=await fixture(t);await pkg(root,'a',{name:'a',version:'1',dependencies:{b:'1'},optionalDependencies:{missing:'1'},devDependencies:{dev:'1'}});
 await pkg(root,'b',{name:'b',version:'2'});await pkg(root,'a/node_modules/b',{name:'b',version:'1'});
 const a=(await observe(root)).packages.find(p=>p.coordinate==='a');assert.equal(a.dependencies.find(e=>e.name==='b').target,'a/node_modules/b');assert.equal(a.dependencies.find(e=>e.name==='missing').target,null);assert.equal(a.dependencies.find(e=>e.name==='dev').target,null);
});
test('IC2 scoped package and aliased name retain physical package identity',async t=>{
 const root=await fixture(t);await pkg(root,'.pnpm/p/node_modules/@s/p',{name:'@s/p',version:'1'});await symlink('.pnpm/p/node_modules/@s/p',join(root,'node_modules','alias'));const r=await observe(root);assert.equal(r.packages.length,1);assert.equal(r.packages[0].name,'@s/p');assert.equal(r.aliases[0].path,'alias');
});
test('IC2 extraneous package retained, not pruned by root selection',async t=>{const root=await fixture(t);await pkg(root,'extra');assert.equal((await observe(root)).packages[0].coordinate,'extra');});
test('IC4 absent declaration differs from explicit empty list',async t=>{const root=await fixture(t);await pkg(root,'a');await pkg(root,'b',{name:'b',version:'1',receivingTests:[]});const r=await observe(root);assert.equal(r.packages[0].receivingTests.status,'unavailable');assert.equal(r.packages[1].receivingTests.status,'declared');});
for(const value of ['../outside','/outside','test/../x','test//x','test\\x','./test'])test('IC4 refuses unsafe test '+value,async t=>{const root=await fixture(t);await pkg(root,'a',{name:'a',version:'1',receivingTests:[value]});await assert.rejects(observe(root),/safe package-relative/);});
test('IC4 missing declared test refuses',async t=>{const root=await fixture(t);await pkg(root,'a',{name:'a',version:'1',receivingTests:['missing']});await assert.rejects(observe(root),/declared installed receiving test unavailable/);});
test('IC4 redirected test refuses even inside tree',async t=>{const root=await fixture(t);const a=await pkg(root,'a',{name:'a',version:'1',receivingTests:['test']},{real:'x'});await symlink('real',join(a,'test'));await assert.rejects(observe(root),/declared installed receiving test unavailable/);});
test('IC2 missing physical manifest refuses',async t=>{const root=await fixture(t);await mkdir(join(root,'node_modules','a'));await assert.rejects(observe(root),/manifest required/);});
test('IC2 malformed manifest refuses',async t=>{const root=await fixture(t);const a=await pkg(root,'a');await writeFile(join(a,'package.json'),'{');await assert.rejects(observe(root),SyntaxError);});
test('IC1 escaping symlink refuses',async t=>{const root=await fixture(t);await symlink(tmpdir(),join(root,'node_modules','a'));await assert.rejects(observe(root),/leaves tree/);});
test('IC1 broken symlink refuses',async t=>{const root=await fixture(t);await symlink('absent',join(root,'node_modules','a'));await assert.rejects(observe(root));});
test('IC1 redirected installation root refuses',async t=>{const root=await fixture(t);await mkdir(join(root,'other'));await symlink('../node_modules',join(root,'other','node_modules'));await assert.rejects(observe(join(root,'other')),/real installed root/);});
test('IC5 bytes and executable mode affect identity',async t=>{const root=await fixture(t);const a=await pkg(root,'a',undefined,{x:'old'});const before=await observe(root);await writeFile(join(a,'x'),'new');const changed=await observe(root);assert.notEqual(before.treeSHA256,changed.treeSHA256);await chmod(join(a,'x'),0o755);assert.notEqual(changed.treeSHA256,(await observe(root)).treeSHA256);});
test('IC1 observer preserves every source byte',async t=>{const root=await fixture(t);const a=await pkg(root,'a');const b=await readFile(join(a,'package.json'));await observe(root);assert.deepEqual(await readFile(join(a,'package.json')),b);});
test('IC3 malformed dependency declaration refuses',async t=>{const root=await fixture(t);await pkg(root,'a',{name:'a',version:'1',dependencies:{b:42}});await assert.rejects(observe(root),/dependency declaration/);});
test('IC4 duplicate declaration refuses',async t=>{const root=await fixture(t);await pkg(root,'a',{name:'a',version:'1',receivingTests:['x','x']},{x:''});await assert.rejects(observe(root),/unique receiving/);});
test('IC2 redirected scope cannot silently hide packages',async t=>{const root=await fixture(t);await pkg(root,'.hidden/@s/b',{name:'@s/b',version:'1'});await symlink('.hidden/@s',join(root,'node_modules','@s'));await assert.rejects(observe(root),/redirected installed scope/);});
test('IC3 malformed nearer scope cannot fall through to root supplier',async t=>{const root=await fixture(t);const a=await pkg(root,'a',{name:'a',version:'1',dependencies:{'@s/b':'1'}});await pkg(root,'@s/b',{name:'@s/b',version:'1'});await mkdir(join(a,'node_modules'));await writeFile(join(a,'node_modules','@s'),'not a directory');await assert.rejects(observe(root),e=>e.code==='ENOTDIR');});
test('IC1 input getters are not executed',async()=>{let called=false;await assert.rejects(observeInstalledClosure({get installationRoot(){called=true;return '/tmp';}}));assert.equal(called,false);});
test('IC2 redirected node_modules container cannot hide packages',async t=>{const root=await fixture(t);const a=await pkg(root,'a');await pkg(root,'.hidden/deps/b',{name:'b',version:'1'});await symlink('../.hidden/deps',join(a,'node_modules'));await assert.rejects(observe(root),/redirected installed package container/);});
test('IC2 physical alias basename is not mistaken for logical scope',async t=>{const root=await fixture(t);await pkg(root,'.hidden/@physical');await symlink('.hidden/@physical',join(root,'node_modules','a'));const r=await observe(root);assert.equal(r.packages.length,1);assert.equal(r.packages[0].coordinate,'.hidden/@physical');});
