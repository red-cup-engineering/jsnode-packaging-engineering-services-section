import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,mkdir,writeFile,readFile,lstat,symlink,rm,rename,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {withDevelopmentRootSelfContext,developmentRootSelfRecipe,receiveDevelopmentRootSelfPeerReport} from '../src/source-bindings.mjs';
import {publicationManifest} from '../src/dependency-policy.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
async function fixture(t){
 const root=await mkdtemp(join(tmpdir(),'root-self-qa-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const directory=join(root,'driver'),library=join(directory,'node_modules/@scope/library');
 await mkdir(library,{recursive:true});
 const manifest={name:'@scope/driver',version:'1.0.0',type:'module',exports:{'./package.json':'./package.json','./engine':'./engine.mjs'},devDependencies:{'@scope/library':'1.0.0'},scripts:{test:'node --test test/*.test.mjs'},registryConsumption:{sourceQualification:{kind:'development-root-self',testLibrary:{name:'@scope/library',version:'1.0.0',peerVersion:'0.9.0'},selector:{variable:'DRIVER_LIBRARY',value:'@scope/library'}}}};
 const lib={name:'@scope/library',version:'1.0.0',type:'module',main:'./index.mjs',peerDependencies:{'@scope/driver':'0.9.0'}};
 await writeFile(join(directory,'package.json'),JSON.stringify(manifest));await writeFile(join(directory,'engine.mjs'),"export const source='current-root';\n");
 await writeFile(join(directory,'pnpm-lock.yaml'),"lockfileVersion: '9.0'\n");await writeFile(join(directory,'node_modules/.modules.yaml'),'layoutVersion: 5\n');
 await writeFile(join(library,'package.json'),JSON.stringify(lib));await writeFile(join(library,'index.mjs'),"export {source} from '@scope/driver/engine';\n");
 const options=()=>({directory,manifest,manifestDigest:hash(JSON.stringify(manifest))});
 const save=async()=>writeFile(join(directory,'package.json'),JSON.stringify(manifest));
 const absent=async path=>assert.rejects(lstat(path),{code:'ENOENT'});
 return {root,directory,library,manifest,lib,options,save,absent};
}
test('development QA binds the actual test library to current root and restores source, native graph and peer absence',async t=>{
 const f=await fixture(t),before=await readFile(join(f.directory,'pnpm-lock.yaml'));
 const receipt=await withDevelopmentRootSelfContext(f.options(),async context=>{
  assert.equal(context.provider.sourceRoot,f.directory);assert.deepEqual(context.environment,{DRIVER_LIBRARY:'@scope/library'});
  const value=await import(pathToFileURL(join(f.library,'index.mjs')).href);assert.equal(value.source,'current-root');return {tests:1,pass:1,fail:0};
 });
 assert.equal(receipt.kind,'npm.development-root-self.source-qa');assert.equal(receipt.authoredPeer,'0.9.0');assert.equal(receipt.source.version,'1.0.0');assert.equal(receipt.bindingsRestored,true);assert.equal(receipt.canonicalInputsUnchanged,true);
 assert.equal(receipt.authoredPeerSatisfied,false);assert.equal(receipt.registryPeerClosureReceived,false);
 assert.deepEqual(await readFile(join(f.directory,'pnpm-lock.yaml')),before);await f.absent(join(f.directory,'node_modules/@scope/driver'));await f.absent(join(f.library,'node_modules'));
 assert.deepEqual(publicationManifest(f.manifest),f.manifest);
});
test('failed native verification restores both missing targets and reports no successful QA',async t=>{
 const f=await fixture(t);await assert.rejects(withDevelopmentRootSelfContext(f.options(),()=>{throw Error('actual native failure');}),/actual native failure/);await f.absent(join(f.directory,'node_modules/@scope/driver'));await f.absent(join(f.library,'node_modules'));
});
test('root-self QA rejects a redirected root before native bindings',async t=>{
 const f=await fixture(t),alias=join(f.root,'alias');await symlink(f.directory,alias,'dir');await assert.rejects(withDevelopmentRootSelfContext({...f.options(),directory:alias},()=>assert.fail('no callback')),/redirected/);await f.absent(join(f.directory,'node_modules/@scope/driver'));
});
test('foreign test-library name cannot select a new source provider',async t=>{
 const f=await fixture(t);f.manifest.registryConsumption.sourceQualification.testLibrary.name='@scope/foreign';await f.save();await assert.rejects(withDevelopmentRootSelfContext(f.options(),()=>assert.fail('no callback')),/development-only/);
});
test('canonical runtime-self dependencies remain forbidden by development context',async t=>{
 const f=await fixture(t);f.manifest.dependencies={'@scope/driver':'1.0.0'};await f.save();await assert.rejects(withDevelopmentRootSelfContext(f.options(),()=>assert.fail('no callback')),/not a canonical dependency edge/);
});
for(const protocol of ['link:.','file:.','workspace:*'])test(`canonical ${protocol} is not a development context or publication exception`,async t=>{
 const f=await fixture(t);f.manifest.devDependencies['@scope/driver']=protocol;await f.save();await assert.rejects(withDevelopmentRootSelfContext(f.options(),()=>assert.fail('no callback')),/exact canonical dependency contract/);assert.throws(()=>publicationManifest(f.manifest),/exact registry dependency/);
});
test('wrong expected root version refuses without source or supplier mutation',async t=>{
 const f=await fixture(t),wrong=structuredClone(f.manifest);wrong.version='1.0.1';await assert.rejects(withDevelopmentRootSelfContext({...f.options(),manifest:wrong},()=>assert.fail('no callback')),/identity changed/);
});
test('wrong actual library version refuses before source bindings',async t=>{
 const f=await fixture(t);f.lib.version='1.0.1';await writeFile(join(f.library,'package.json'),JSON.stringify(f.lib));await assert.rejects(withDevelopmentRootSelfContext(f.options(),()=>assert.fail('no callback')),/identity or authored peer differs/);
});
test('an already installed old driver is not replaced or hidden',async t=>{
 const f=await fixture(t),old=join(f.library,'node_modules/@scope/driver');await mkdir(old,{recursive:true});await writeFile(join(old,'package.json'),JSON.stringify({name:'@scope/driver',version:'0.9.0',exports:{'./package.json':'./package.json'}}));await assert.rejects(withDevelopmentRootSelfContext(f.options(),()=>assert.fail('no callback')),/only fills an absent/);assert.equal(JSON.parse(await readFile(join(old,'package.json'))).version,'0.9.0');
});
test('a test library source escaping the actual native installation is refused',async t=>{
 const f=await fixture(t),outside=join(f.root,'outside.mjs');await writeFile(outside,'export const source="foreign"');await rm(join(f.library,'index.mjs'));await symlink(outside,join(f.library,'index.mjs'));await assert.rejects(withDevelopmentRootSelfContext(f.options(),()=>assert.fail('no callback')),/escapes the native installation/);
});
test('source mutation after the callback is a custody failure, with bindings restored',async t=>{
 const f=await fixture(t);await assert.rejects(withDevelopmentRootSelfContext(f.options(),async()=>writeFile(join(f.directory,'.npmrc'),'registry=https://unreceived.example/\n')),/changed canonical input/);await f.absent(join(f.directory,'node_modules/@scope/driver'));await f.absent(join(f.library,'node_modules/@scope/driver'));
});
test('an already active root cannot be entered by a second callback',async t=>{
 const f=await fixture(t);await withDevelopmentRootSelfContext(f.options(),async()=>assert.rejects(withDevelopmentRootSelfContext(f.options(),()=>assert.fail('nested callback')),/already active/));
});
test('development selectors cannot change native tooling or registry transport',async t=>{
 const f=await fixture(t);for(const variable of ['NODE_OPTIONS','PATH','NPM_CONFIG_REGISTRY','HTTP_PROXY']){f.manifest.registryConsumption.sourceQualification.selector.variable=variable;assert.throws(()=>developmentRootSelfRecipe(f.manifest),/selector/);}
});

function nativePeers(manifest){const host=manifest.registryConsumption.sourceQualification.testLibrary;return {'.':{bad:{},missing:{[manifest.name]:[{parents:[{name:host.name,version:host.version}],optional:false,wantedRange:host.peerVersion}]},conflicts:[],intersections:{[manifest.name]:host.peerVersion}}};}
test('native exactly-one declared peer frontier remains explicitly unsatisfied',async t=>{
 const f=await fixture(t),report=nativePeers(f.manifest),receipt=receiveDevelopmentRootSelfPeerReport(f.manifest,report);
 assert.equal(receipt.authoredPeerSatisfied,false);assert.equal(receipt.registryPeerClosureReceived,false);assert.equal(receipt.nativeReport,report);assert.deepEqual(receipt.selection.provider,{name:f.manifest.name,version:f.manifest.version});
});
test('another missing required peer is refused rather than hidden by current-root QA',async t=>{
 const f=await fixture(t),report=nativePeers(f.manifest);report['.'].missing.typescript=[{parents:[{name:'external',version:'1.0.0'}],optional:false,wantedRange:'>=5.0.4'}];assert.throws(()=>receiveDevelopmentRootSelfPeerReport(f.manifest,report),/additional native peer/);
});
test('wrong consumer, wanted range, existing bad provider or incomplete native report cannot qualify',async t=>{
 const f=await fixture(t);for(const change of [r=>{r['.'].missing[f.manifest.name][0].parents[0].name='foreign';},r=>{r['.'].missing[f.manifest.name][0].wantedRange='1.0.0';},r=>{r['.'].bad.external=[{}];},r=>{r['.'].conflicts.push('external');},r=>{delete r['.'].intersections;},r=>{r.other=r['.'];}]){const report=nativePeers(f.manifest);change(report);assert.throws(()=>receiveDevelopmentRootSelfPeerReport(f.manifest,report),/native.*peer|additional native peer/);}
});

async function fallbackFixture(t,{version='0.8.0',name='@scope/driver'}={}){
 const f=await fixture(t),library=join(f.directory,'node_modules/.pnpm/library@1.0.0/node_modules/@scope/library');
 await mkdir(join(library,'..'),{recursive:true});await rename(f.library,library);await symlink(library,f.library,'dir');f.library=library;
 const fallback=join(f.directory,'node_modules/.pnpm/driver@'+version+'/node_modules/@scope/driver');
 await mkdir(fallback,{recursive:true});await writeFile(join(fallback,'package.json'),JSON.stringify({name,version,type:'module',gitHead:'a'.repeat(40),exports:{'./package.json':'./package.json','./engine':'./engine.mjs'}}));
 await writeFile(join(fallback,'engine.mjs'),"export const source='legacy-fallback';\n");
 const shared=join(f.directory,'node_modules/.pnpm/node_modules/@scope/driver');await mkdir(join(shared,'..'),{recursive:true});await symlink(fallback,shared,'dir');
 return {...f,fallback,shared};
}
test('an unbound wrong-version native shared fallback is preserved while fresh processes resolve actual current runtime',async t=>{
 const f=await fallbackFixture(t),request=createRequire(join(f.library,'package.json'));
 assert.equal(request.resolve('@scope/driver/engine'),join(f.fallback,'engine.mjs'),'warm the old caller cache before qualification');
 const receipt=await withDevelopmentRootSelfContext(f.options(),async context=>{
  assert.equal(context.provider.publicResolution.find(r=>r.specifier==='@scope/driver/engine').path,join(f.directory,'engine.mjs'));
  const value=await import(pathToFileURL(join(f.library,'index.mjs')).href);assert.equal(value.source,'current-root');return {pass:1};
 });
 assert.equal(receipt.source.legacyFallback.version,'0.8.0');assert.equal(receipt.source.legacyFallback.sourceCommit,'a'.repeat(40));
 assert.equal(receipt.source.previousResolution.find(r=>r.specifier==='@scope/driver/engine').path,join(f.fallback,'engine.mjs'));
 assert.equal(await realpath(f.shared),f.fallback);await f.absent(join(f.directory,'node_modules/@scope/driver'));await f.absent(join(f.library,'node_modules'));
});
test('a failing callback restores the exact legacy provider without asserting successful QA',async t=>{
 const f=await fallbackFixture(t);await assert.rejects(withDevelopmentRootSelfContext(f.options(),()=>{throw Error('native runtime failure');}),/native runtime failure/);
 assert.equal(await realpath(f.shared),f.fallback);await f.absent(join(f.directory,'node_modules/@scope/driver'));await f.absent(join(f.library,'node_modules'));
});
test('a compatible shared fallback is not replaced by source QA',async t=>{
 const f=await fallbackFixture(t,{version:'0.9.0'});await assert.rejects(withDevelopmentRootSelfContext(f.options(),()=>assert.fail('no callback')),/compatible or conflicting/);
});
test('a direct native virtual-store peer is not mistaken for the shared missing-peer fallback',async t=>{
 const f=await fallbackFixture(t),direct=join(f.library,'../driver');await symlink(f.fallback,direct,'dir');await assert.rejects(withDevelopmentRootSelfContext(f.options(),()=>assert.fail('no callback')),/direct provider/);
});
test('a foreign package at the shared driver fallback is refused',async t=>{
 const f=await fallbackFixture(t,{name:'@scope/foreign'});await assert.rejects(withDevelopmentRootSelfContext(f.options(),()=>assert.fail('no callback')),/compatible or conflicting/);
});
test('an escaping or redirected shared fallback is refused',async t=>{
 const f=await fallbackFixture(t),outside=join(f.root,'outside');await rename(f.fallback,outside);await rm(f.shared);await symlink(outside,f.shared,'dir');await assert.rejects(withDevelopmentRootSelfContext(f.options(),()=>assert.fail('no callback')),/direct, redirected or foreign/);
});
test('a legacy manifest changed during source QA is a custody failure after restoration',async t=>{
 const f=await fallbackFixture(t);await assert.rejects(withDevelopmentRootSelfContext(f.options(),async()=>writeFile(join(f.fallback,'package.json'),JSON.stringify({name:'@scope/driver',version:'0.8.1',exports:{'./package.json':'./package.json','./engine':'./engine.mjs'}}))),/legacy fallback identity/);await f.absent(join(f.directory,'node_modules/@scope/driver'));assert.equal(await realpath(f.shared),f.fallback);
});
test('current root identity cannot mask a runtime export redirected into its legacy supplier',async t=>{
 const f=await fallbackFixture(t);await rm(join(f.directory,'engine.mjs'));await symlink(join(f.fallback,'engine.mjs'),join(f.directory,'engine.mjs'));await assert.rejects(withDevelopmentRootSelfContext(f.options(),()=>assert.fail('no callback')),/runtime subpath/);await f.absent(join(f.directory,'node_modules/@scope/driver'));
});
test('an import-only development library is discovered by its actual native ESM caller conditions',async t=>{
 const f=await fixture(t);delete f.lib.main;f.lib.exports={'.':{import:'./index.mjs'}};await writeFile(join(f.library,'package.json'),JSON.stringify(f.lib));
 const receipt=await withDevelopmentRootSelfContext(f.options(),async context=>{
  assert.equal(context.provider.manifestPath,join(f.directory,'package.json'));return {pass:1};
 });assert.equal(receipt.bindingsRestored,true);
});
test('runtime identity follows native import conditions including the public root, rather than require conditions',async t=>{
 const f=await fixture(t);f.manifest.exports['.']={import:'./index.mjs',require:'./require.cjs'};f.manifest.exports['./engine']={import:'./engine.mjs',require:'./require.cjs'};
 await f.save();await writeFile(join(f.directory,'index.mjs'),"export const source='actual-esm-root';\n");await writeFile(join(f.directory,'require.cjs'),"module.exports={source:'different-require-entry'};\n");
 await withDevelopmentRootSelfContext(f.options(),async context=>{
  assert.equal(context.provider.publicResolution.find(r=>r.specifier==='@scope/driver').path,join(f.directory,'index.mjs'));
  assert.equal(context.provider.publicResolution.find(r=>r.specifier==='@scope/driver/engine').path,join(f.directory,'engine.mjs'));
  assert.equal(createRequire(join(f.library,'package.json')).resolve('@scope/driver'),join(f.directory,'require.cjs'));
 });
});
test('a public root export escaping the current source is refused even when named subpaths are correct',async t=>{
 const f=await fixture(t);f.manifest.exports['.']='./index.mjs';await f.save();const outside=join(f.root,'outside-root.mjs');await writeFile(outside,'export const source="outside";\n');await symlink(outside,join(f.directory,'index.mjs'));
 await assert.rejects(withDevelopmentRootSelfContext(f.options(),()=>assert.fail('no callback')),/runtime subpath/);await f.absent(join(f.directory,'node_modules/@scope/driver'));
});
