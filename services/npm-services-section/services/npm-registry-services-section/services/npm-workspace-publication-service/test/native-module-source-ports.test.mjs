import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {receiveNativeModuleRevision,nativeModuleRevisionHooks} from '../src/native-module-revision.mjs';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function fixture(t){
 const root=fs.mkdtempSync(path.join(tmpdir(),'code-native-source-port-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const write=(name,bytes)=>{const p=path.join(root,name);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,bytes);return p;};
 const source={repository:'fixture/supplier',commit:'a'.repeat(40)};
 const originalManifest={name:'supply',version:'1.0.0',type:'module',exports:{'./package.json':'./package.json','./old':'./src/old.mjs','./cells/*':'./src/cells/*.mjs'}};
 const manifest=write('supplier/package.json',JSON.stringify(originalManifest));
 write('supplier/src/native.mjs','export const native=2;');write('supplier/src/old.mjs','export const old=1;');
 const target=path.join(root,'supplier/src/new.mjs');
 const importer=write('consumer/entry.mjs','export const original=1;');
 const revised="import{answer}from'supply/new';console.log(answer);";
 const other=write('consumer/other.mjs',revised);
 fs.mkdirSync(path.join(root,'consumer/node_modules'),{recursive:true});fs.symlinkSync(path.join(root,'supplier'),path.join(root,'consumer/node_modules/supply'),'dir');
 const declaration=write('source-package.json',JSON.stringify({name:'supply',version:'2.0.0',type:'module',exports:{'./new':'./src/new.mjs'}}));
 const identity=p=>({path:p,sha256:hash(fs.readFileSync(p))});
 const files=[{target:importer,before:hash(fs.readFileSync(importer)),replacement:write('entry-source.mjs',revised),after:hash(revised),sourcePath:'consumer/entry.mjs'},
 {target,before:{kind:'absent'},replacement:write('new-source.mjs',"import{native}from'./native.mjs';export const answer=40+native;"),after:hash("import{native}from'./native.mjs';export const answer=40+native;"),sourcePath:'lib/package/src/new.mjs',source}];
 const binding={kind:'absent-public-export',specifier:'supply/new',importer:identity(importer),original:{kind:'absent'},selected:{path:target,sha256:files[1].after},supplier:{manifest,sha256:hash(fs.readFileSync(manifest)),name:'supply',version:'1.0.0'},sourceExport:{source,manifest:identity(declaration),sourcePath:'lib/package/package.json',key:'./new',target:'./src/new.mjs'}};
 const revision={kind:'code.native-module-source-revision/v5',runtimeRoot:root,source,files,bindings:[binding]};
 const record=write('revision.json',JSON.stringify(revision));
 const operation=new URL('../src/native-module-revision.mjs',import.meta.url).href;
 const bootstrap=write('bootstrap.mjs',"import fs from'node:fs';import{registerHooks}from'node:module';import{receiveNativeModuleRevision,nativeModuleRevisionHooks}from"+JSON.stringify(operation)+";registerHooks(nativeModuleRevisionHooks(receiveNativeModuleRevision(JSON.parse(fs.readFileSync("+JSON.stringify(record)+")),{immutable:false})));");
 const run=(entry=importer)=>execFileSync(process.execPath,['--import',bootstrap,entry],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
 const receive=(r=revision)=>receiveNativeModuleRevision(r,{immutable:false});
 const changed=(b)=>({...revision,bindings:[b]});
 return{root,write,source,manifest,originalManifest,declaration,importer,other,target,binding,revision,record,run,receive,changed};
}
test('actual native missing public export resolves only the received importer and retains original supplier imports',t=>{
 const f=fixture(t);assert.equal(f.run().trim(),'42');
 assert.equal(fs.existsSync(f.target),false);assert.deepEqual(JSON.parse(fs.readFileSync(f.manifest)),f.originalManifest);
 assert.throws(()=>f.run(f.other),e=>e.stderr?.includes('ERR_PACKAGE_PATH_NOT_EXPORTED'));
});
test('source export binds exact Git identity, declaration path, public key, target and selected absence',t=>{
 const f=fixture(t),b=f.binding;
 for(const sourceExport of [{...b.sourceExport,source:{...f.source,commit:'b'.repeat(40)}},{...b.sourceExport,sourcePath:'other/package.json'},{...b.sourceExport,key:'./other'},{...b.sourceExport,target:'./src/other.mjs'},{...b.sourceExport,manifest:{...b.sourceExport.manifest,sha256:'0'.repeat(64)}}])
  assert.throws(()=>f.receive(f.changed({...b,sourceExport})));
 assert.throws(()=>f.receive(f.changed({...b,original:{kind:'absent',ignored:true}})));
 assert.throws(()=>f.receive({...f.revision,files:[f.revision.files[1]]}),/revised original importer/);
 assert.throws(()=>f.receive({...f.revision,bindings:[b,b]}),/competing/);
 f.write('supplier/src/new.mjs','existing');assert.throws(()=>f.receive(),/already exists/);
});
test('false original absence, matching wildcards and ambiguous manifest export refuse',t=>{
 const f=fixture(t);
 for(const extra of [{'./new':'./src/new.mjs'},{'./new*':'./src/new*.mjs'},{'./package.json':{import:'./package.json'}}]){
  fs.writeFileSync(f.manifest,JSON.stringify({...f.originalManifest,exports:{...f.originalManifest.exports,...extra}}));
  f.binding.supplier.sha256=hash(fs.readFileSync(f.manifest));assert.throws(()=>f.receive(),/absent public|wildcard/);
 }
});
test('native package identity and precise missing-port failure are mandatory',t=>{
 const f=fixture(t),hooks=nativeModuleRevisionHooks(f.receive());const context={parentURL:pathToFileURL(f.importer).href};
 assert.throws(()=>hooks.resolve('supply/new',context,()=>({url:'file:///wrong/package.json'})),/supplier manifest resolution differs/);
 assert.throws(()=>hooks.resolve('supply/new',context,(s)=>({url:pathToFileURL(s.endsWith('package.json')?f.manifest:f.importer).href})),/not actually absent/);
 const failure=Object.assign(new Error('ordinary native missing module'),{code:'ERR_MODULE_NOT_FOUND'});
 assert.throws(()=>hooks.resolve('supply/new',context,s=>{if(s.endsWith('package.json'))return{url:pathToFileURL(f.manifest).href};throw failure;}),e=>e===failure);
});
test('original/source manifest and importer drift refuse at resolve and selected load',t=>{
 for(const field of ['manifest','declaration','importer']){
  const f=fixture(t),hooks=nativeModuleRevisionHooks(f.receive()),context={parentURL:pathToFileURL(f.importer).href};
  fs.appendFileSync(f[field],' ');
  assert.throws(()=>hooks.resolve('supply/new',context,()=>assert.fail()));
  assert.throws(()=>hooks.load(pathToFileURL(f.target).href,{},()=>assert.fail()));
 }
});
