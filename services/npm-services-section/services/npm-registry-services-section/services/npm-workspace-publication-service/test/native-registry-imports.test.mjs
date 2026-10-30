import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {promisify} from 'node:util';
import {test} from 'node:test';
import {pathToFileURL} from 'node:url';

const execute=promisify(execFile);
const reader=new URL('../src/native-registry-imports.mjs',import.meta.url).href;
async function fixture(t,source,manifest={}){
 const root=await mkdtemp(join(tmpdir(),'native-import-syntax-'));
 t.after(()=>rm(root,{recursive:true,force:true}));
 await mkdir(join(root,'node_modules'));
 await writeFile(join(root,'package.json'),JSON.stringify(manifest));
 await writeFile(join(root,'main.js'),source);
 return root;
}
async function inspect(root){
 const program=`import {readNativeRegistryImports} from ${JSON.stringify(reader)};
 console.log(JSON.stringify(await readNativeRegistryImports({root:process.argv[1],entrances:['main.js']})));`;
 const result=await execute(process.execPath,['--experimental-vm-modules',
  '--experimental-import-meta-resolve','--input-type=module','-e',program,root]);
 return JSON.parse(result.stdout);
}

test('untyped static ESM follows missing imports as native Node does',async t=>{
 const root=await fixture(t,"import './missing.mjs';\nthrow new Error('must not evaluate');\n");
 const reading=await inspect(root);
 assert.equal(reading.modules,1);
 assert.equal(reading.opaqueCommonJs,0);
 assert.equal(reading.findings.length,1);
 assert.equal(reading.findings[0].source,'./missing.mjs');
 // The oracle executes only this controlled fixture. Missing linkage prevents
 // evaluation, and distinguishes native ESM detection from CommonJS rejection.
 await assert.rejects(execute(process.execPath,[join(root,'main.js')]),error=>
  error.stderr.includes('ERR_MODULE_NOT_FOUND')&&!error.stderr.includes('must not evaluate'));
});

test('untyped ESM re-exports traverse actual files without evaluation',async t=>{
 const root=await fixture(t,"export * from './child.js';\nthrow new Error('must not evaluate');\n");
 await writeFile(join(root,'child.js'),"import './absent.mjs';\n");
 const reading=await inspect(root);
 assert.equal(reading.modules,2);
 assert.equal(reading.findings.length,1);
 assert.equal(reading.findings[0].source,'./absent.mjs');
});

test('all native ambiguous ESM syntax is parsed without running it',async t=>{
 for(const source of ['export const value=1;', 'void import.meta.url;',
  'await Promise.resolve();', 'const require=1;', 'const module=1;',
  'const exports=1;', 'const __dirname=1;', 'const __filename=1;']){
  const root=await fixture(t,source+"\nthrow new Error('must not evaluate');\n");
  const reading=await inspect(root);
  assert.equal(reading.modules,1,source);
  assert.equal(reading.opaqueCommonJs,0,source);
  assert.deepEqual(reading.findings,[],source);
 }
});

test('real CommonJS, wrapper return and hashbangs stay opaque',async t=>{
 for(const source of ["module.exports=require('./uninspected.cjs');",
  "return; module.exports=1;", "#!/usr/bin/env node\nmodule.exports=1;",
  "void import('./dynamic.mjs');"]){
  const root=await fixture(t,source+"\nthrow new Error('must not evaluate');\n");
  const reading=await inspect(root);
  assert.equal(reading.modules,0,source);
  assert.equal(reading.opaqueCommonJs,1,source);
  assert.deepEqual(reading.findings,[],source);
 }
});

test('explicit CommonJS remains opaque and invalid ambiguous source refuses',async t=>{
 const explicit=await fixture(t,"import './not-inspected.mjs';",{type:'commonjs'});
 const common=await inspect(explicit);
 assert.equal(common.opaqueCommonJs,1);
 assert.deepEqual(common.findings,[]);
 const invalid=await fixture(t,'export const = ;');
 const refused=await inspect(invalid);
 assert.equal(refused.findings.length,1);
 assert.equal(refused.findings[0].code,'MODULE_SOURCE_REFUSED');
});

test('nearest explicit package type remains authoritative',async t=>{
 const root=await fixture(t,"import './nested/main.js';",{type:'module'});
 await mkdir(join(root,'nested'));
 await writeFile(join(root,'nested','package.json'),JSON.stringify({type:'commonjs'}));
 await writeFile(join(root,'nested','main.js'),"require('./opaque.cjs');");
 const reading=await inspect(root);
 assert.equal(reading.modules,1);
 assert.equal(reading.opaqueCommonJs,1);
 assert.deepEqual(reading.findings,[]);
 assert.equal(await readFile(join(root,'nested','main.js'),'utf8'),"require('./opaque.cjs');");
});


/** Original Group failure: a frozen composition declared the ordinary adapter
 * dependency at 0.1.7 but loaded 0.1.8. The native composer, not merely an
 * optional offline observer, must reject the actual resolved imported carrier.
 * All modules are inert fixtures and are NEVER evaluated by the reader. */
async function versionBindingFixture(t, {declared, installed, declaration = "dependencies"} = {}) {
 const packageName="@red-cup-engineering/pluggable-venue-adapter-service";
 const declarationFields=declared===undefined?{}:{[declaration]:{[packageName]:declared}};
 const root=await fixture(t,
   "import { createBaseSpotAdapter } from '@red-cup-engineering/pluggable-venue-adapter-service';\n" +
   "void createBaseSpotAdapter;\nthrow new Error('must not execute composition');\n",
   {name:"@561-group/group-operations",version:"0.1.0",type:"module",...declarationFields});
 const provider=join(root,"node_modules","@red-cup-engineering","pluggable-venue-adapter-service");
 await mkdir(provider,{recursive:true});
 await writeFile(join(provider,"package.json"),JSON.stringify({name:packageName,version:installed,type:"module",exports:"./index.mjs"}));
 await writeFile(join(provider,"index.mjs"),
   "export function createBaseSpotAdapter(){ return { readAccount(){ return null; } }; }\n" +
   "throw new Error('must not evaluate provider');\n");
 return root;
}

test("native composer refuses wrong installed ordinary dependency despite compatible named export",async t=>{
 const root=await versionBindingFixture(t,{declared:"0.1.7",installed:"0.1.8"});
 const reading=await inspect(root);
 assert.equal(reading.modules,2);
 const mismatch=reading.findings.filter(row=>row.code==="INSTALLED_EXACT_DEPENDENCY_VERSION_MISMATCH");
 assert.equal(mismatch.length,1,JSON.stringify(reading.findings));
 assert.equal(mismatch[0].consumer,"@561-group/group-operations");
 assert.equal(mismatch[0].provider,"@red-cup-engineering/pluggable-venue-adapter-service");
 assert.equal(mismatch[0].declaration,"dependencies");
 assert.equal(mismatch[0].expected,"0.1.7");
 assert.equal(mismatch[0].installed,"0.1.8");
});

test("native composer accepts correct pinned original dependency version",async t=>{
 const root=await versionBindingFixture(t,{declared:"0.1.7",installed:"0.1.7"});
 const reading=await inspect(root);
 assert.equal(reading.modules,2);
 assert.deepEqual(reading.findings,[]);
});

test("native composer rejects wrong exact peer, optional and dev importer edges",async t=>{
 for(const declaration of ["peerDependencies","optionalDependencies","devDependencies"]){
  const root=await versionBindingFixture(t,{declaration,declared:"0.1.7",installed:"0.1.8"});
  const reading=await inspect(root);
  assert.equal(reading.modules,2,declaration);
  const mismatch=reading.findings.filter(row=>row.code==="INSTALLED_EXACT_DEPENDENCY_VERSION_MISMATCH");
  assert.equal(mismatch.length,1,declaration+": "+JSON.stringify(reading.findings));
  assert.equal(mismatch[0].declaration,declaration);
 }
});

test("native composer does not invent exact contracts for range or undeclared edges",async t=>{
 for(const declared of ["^0.1.7",undefined]){
  const root=await versionBindingFixture(t,{declared,installed:"0.1.8"});
  const reading=await inspect(root);
  assert.equal(reading.modules,2);
  assert.deepEqual(reading.findings,[]);
 }
});


// The portable runtime producer must check manifest pins even when a consumer
// has NO registryConsumption.nodeEntrances opt-in: the real Group manifest does
// not declare those entrances. Only the installed root closure is examined.
const checkPinned = async (root,manifest)=>(await import(reader)).assertRootInstalledDependencyPins({root,manifest});
test("native received consumer root pins refuse installed 0.1.8 for declared 0.1.7 without entrances",async t=>{
 const root=await versionBindingFixture(t,{declared:"0.1.7",installed:"0.1.8"});
 const manifest=JSON.parse(await readFile(join(root,"package.json"),"utf8"));
 await assert.rejects(checkPinned(root,manifest),/pluggable-venue-adapter-service.*0[.]1[.]7.*0[.]1[.]8/u);
});
test("native root pins admit correct declared version without evaluating modules",async t=>{
 const root=await versionBindingFixture(t,{declared:"0.1.7",installed:"0.1.7"});
 const manifest=JSON.parse(await readFile(join(root,"package.json"),"utf8"));
 const result=await checkPinned(root,manifest);
 assert.equal(result.checked,1);
 assert.equal(result.optionalUninstalled,0);
});
test("absent optional and dev packages do not become mandatory runtime edges",async t=>{
 const root=await fixture(t,"export const value=1;\n",{name:"@561-group/group-operations",version:"0.1.0",type:"module",
   optionalDependencies:{"@red-cup-engineering/optional-uninstalled":"0.1.7"},
   devDependencies:{"@red-cup-engineering/dev-uninstalled":"0.1.7"}});
 const manifest=JSON.parse(await readFile(join(root,"package.json"),"utf8"));
 const result=await checkPinned(root,manifest);
 assert.equal(result.checked,0);
 assert.equal(result.optionalUninstalled,2);
});
test("an installed optional dependency with a wrong version refuses",async t=>{
 const root=await versionBindingFixture(t,{declared:"0.1.7",installed:"0.1.8",declaration:"optionalDependencies"});
 const manifest=JSON.parse(await readFile(join(root,"package.json"),"utf8"));
 await assert.rejects(checkPinned(root,manifest),/pluggable-venue-adapter-service.*0[.]1[.]7.*0[.]1[.]8/u);
});
test("a missing mandatory exact dependency refuses before a plausible empty portable output",async t=>{
 const root=await fixture(t,"export const value=1;\n",{name:"@561-group/group-operations",version:"0.1.0",type:"module",
   dependencies:{"@red-cup-engineering/pluggable-venue-adapter-service":"0.1.7"}});
 const manifest=JSON.parse(await readFile(join(root,"package.json"),"utf8"));
 await assert.rejects(checkPinned(root,manifest),/missing.*pluggable-venue-adapter-service/u);
});


test("type-only provider scope retains its enclosing installed package identity", async t => {
 const root = await versionBindingFixture(t, { declared: "0.1.7", installed: "0.1.7" });
 const provider = join(root, "node_modules", "@red-cup-engineering", "pluggable-venue-adapter-service");
 const manifest = JSON.parse(await readFile(join(provider, "package.json"), "utf8"));
 manifest.exports = "./dist/index.mjs";
 await writeFile(join(provider, "package.json"), JSON.stringify(manifest));
 await mkdir(join(provider, "dist"));
 await writeFile(join(provider, "dist", "package.json"), JSON.stringify({ type: "module" }));
 await writeFile(join(provider, "dist", "index.mjs"), "export function createBaseSpotAdapter() {}\nthrow new Error('must not execute');\n");
 const result = await inspect(root);
 assert.equal(result.modules, 2);
 assert.deepEqual(result.findings, []);
});

test("type-only importer scope cannot erase the enclosing exact dependency contract", async t => {
 const root = await versionBindingFixture(t, { declared: "0.1.7", installed: "0.1.8" });
 const code = await readFile(join(root, "main.js"), "utf8");
 await writeFile(join(root, "main.js"), "import './dist/index.mjs';\n");
 await mkdir(join(root, "dist"));
 await writeFile(join(root, "dist", "package.json"), JSON.stringify({ type: "module" }));
 await writeFile(join(root, "dist", "index.mjs"), code);
 const result = await inspect(root);
 assert.equal(result.modules, 3);
 const mismatch = result.findings.filter(row => row.code === "INSTALLED_EXACT_DEPENDENCY_VERSION_MISMATCH");
 assert.equal(mismatch.length, 1, JSON.stringify(result.findings));
 assert.equal(mismatch[0].consumer, "@561-group/group-operations");
 assert.equal(mismatch[0].expected, "0.1.7");
 assert.equal(mismatch[0].installed, "0.1.8");
});


test("ownership admission refuses an ambiguous relative-only leaf", async t => {
 const root = await fixture(t, "import './nested/leaf.mjs';", { type: "module" });
 await mkdir(join(root, "nested"));
 await writeFile(join(root, "nested/package.json"), JSON.stringify({ type: "module", private: true }));
 await writeFile(join(root, "nested/leaf.mjs"), "export const value = 1;");
 const result = await inspect(root);
 assert.ok(result.findings.some(row => row.code === "ERR_INSTALLED_DECLARATION_OWNER_UNRECEIVED"), JSON.stringify(result));
});
test("ownership admission checks exact contracts on relative cross-package edges too", async t => {
 const root = await versionBindingFixture(t, { declared: "0.1.7", installed: "0.1.8" });
 await writeFile(join(root, "main.js"), "import './node_modules/@red-cup-engineering/pluggable-venue-adapter-service/index.mjs';");
 const result = await inspect(root);
 assert.ok(result.findings.some(row => row.code === "INSTALLED_EXACT_DEPENDENCY_VERSION_MISMATCH" && row.installed === "0.1.8"), JSON.stringify(result));
});


test("file URL cross-package edges use actual ownership rather than a fabricated bare name", async t => {
 const root = await versionBindingFixture(t, { declared: "0.1.7", installed: "0.1.8" });
 const url = pathToFileURL(join(root, "node_modules/@red-cup-engineering/pluggable-venue-adapter-service/index.mjs")).href;
 await writeFile(join(root, "main.js"), `import ${JSON.stringify(url)};`);
 const result = await inspect(root);
 assert.ok(result.findings.some(row => row.code === "INSTALLED_EXACT_DEPENDENCY_VERSION_MISMATCH" && row.installed === "0.1.8"), JSON.stringify(result));
});
test("nested native declaration scopes neither inherit outer pins nor erase their own", async t => {
 for (const expected of ["0.1.8", "0.1.9"]) {
  const root = await versionBindingFixture(t, { declared: "0.1.7", installed: "0.1.8" });
  const source = await readFile(join(root, "main.js"), "utf8"), embedded = join(root, "embedded");
  await mkdir(embedded);
  await writeFile(join(embedded, "package.json"), JSON.stringify({ name: "embedded", version: "1.0.0", type: "module", exports: "./index.mjs", dependencies: { "@red-cup-engineering/pluggable-venue-adapter-service": expected } }));
  await writeFile(join(embedded, "index.mjs"), source);
  await writeFile(join(root, "main.js"), "import './embedded/index.mjs';");
  const result = await inspect(root);
  if (expected === "0.1.8") assert.deepEqual(result.findings, []);
  else {
   assert.equal(result.findings.length, 1);
   assert.equal(result.findings[0].consumer, "embedded");
   assert.equal(result.findings[0].expected, "0.1.9");
  }
 }
});
