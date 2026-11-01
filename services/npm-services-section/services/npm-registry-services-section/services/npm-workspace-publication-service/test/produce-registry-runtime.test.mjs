import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { produceRegistryRuntime } from "../src/produce-registry-runtime.mjs";

const digest = bytes => createHash("sha256").update(bytes).digest("hex");

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "portable-registry-runtime-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = join(root, "received");
  const destination = join(root, "portable");
  await mkdir(join(source, "node_modules"), { recursive: true });
  const manifest = Buffer.from(JSON.stringify({
    name: "@fixture/consumer", version: "0.1.0",
    publishConfig: { registry: "https://registry.561.group/" },
  }) + "\n");
  const lock = Buffer.from("lockfileVersion: '9.0'\n");
  await writeFile(join(source, "package.json"), manifest);
  await writeFile(join(source, "pnpm-lock.yaml"), lock);
  const receiving = {
    kind: "npm.source-registry-closure.consumers", refusals: [],
    packages: [{
      path: join(source, "package.json"), name: "@fixture/consumer", version: "0.1.0",
      frozenInstall: true, manifestDigest: digest(manifest), lockDigest: digest(lock),
    }],
  };
  return { source, destination, receiving };
}

test("a released consumer cannot be represented by a mismatched frozen receipt", async t => {
  const { source, destination, receiving } = await fixture(t);
  const wrong = { ...receiving, packages: [{ ...receiving.packages[0], lockDigest: "incorrect" }] };
  await assert.rejects(
    produceRegistryRuntime({transferInstallation:true, consumerPath: source, receiving: wrong, destination }),
    /received consumer declarations changed/,
  );
  await assert.rejects(stat(destination), { code: "ENOENT" });
  assert.equal((await stat(join(source, "node_modules"))).isDirectory(), true);
});

test("a caller's occupied runtime destination survives a refused attempt", async t => {
  const { source, destination, receiving } = await fixture(t);
  await mkdir(destination);
  const marker = join(destination, "do-not-overwrite.txt");
  await writeFile(marker, "previous independently received runtime\n");
  await assert.rejects(
    produceRegistryRuntime({transferInstallation:true, consumerPath: source, receiving, destination }),
    { code: "EEXIST" },
  );
  assert.equal(await readFile(marker, "utf8"), "previous independently received runtime\n");
  assert.equal((await stat(join(source, "node_modules"))).isDirectory(), true);
});

test("a refusal after reserving the runtime destination removes only its own output", async t => {
  const { source, destination, receiving } = await fixture(t);
  const manifestPath = join(source, "package.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.registryConsumption = { frozenLockfile: "./unadmitted-lock.yaml" };
  const bytes = Buffer.from(JSON.stringify(manifest) + "\n");
  await writeFile(manifestPath, bytes);
  receiving.packages[0].manifestDigest = digest(bytes);
  await assert.rejects(
    produceRegistryRuntime({transferInstallation:true, consumerPath: source, receiving, destination }),
    /frozen lock product must be the declared release export/,
  );
  await assert.rejects(stat(destination), { code: "ENOENT" });
  assert.equal((await stat(join(source, "node_modules"))).isDirectory(), true);
  assert.deepEqual(await readFile(manifestPath), bytes);
});

test("source and destination cannot share custody or infer success from an absent receipt", async t => {
  const { source, destination, receiving } = await fixture(t);
  await assert.rejects(
    produceRegistryRuntime({transferInstallation:true, consumerPath: source, receiving, destination: join(source, "runtime") }),
    /independent directories/,
  );
  await assert.rejects(
    produceRegistryRuntime({transferInstallation:true, consumerPath: source, receiving: { ...receiving, refusals: ["not-admitted"] }, destination }),
    /successful native frozen consumer receiving required/,
  );
  await assert.rejects(stat(destination), { code: "ENOENT" });
});

test("runtime production refuses missing static imports in an untyped JS entrance", async t => {
  const { source, destination, receiving } = await fixture(t);
  const manifestPath = join(source, "package.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.files = ["main.js"];
  manifest.registryConsumption = { nodeEntrances: ["./main.js"] };
  const bytes = Buffer.from(JSON.stringify(manifest) + "\n");
  await writeFile(manifestPath, bytes);
  receiving.packages[0].manifestDigest = digest(bytes);
  await writeFile(join(source, "main.js"), "import './missing.mjs';\nthrow new Error('must not evaluate');\n");
  await assert.rejects(
    produceRegistryRuntime({transferInstallation:true, consumerPath: source, receiving, destination }),
    /declared Node composition has unresolved static imports/,
  );
  await assert.rejects(stat(destination), { code: "ENOENT" });
  assert.equal((await stat(join(source, "node_modules"))).isDirectory(), true);
  assert.deepEqual(await readFile(manifestPath), bytes);
});


// Integration safety: even consumers without registryConsumption.nodeEntrances
// must not become valid portable runtimes when the installed carrier silently
// disagrees with the consumer's *exact* declared dependency.
async function receivedPinFixture(t,{installed="0.1.8",populate=true}={}){
 const value=await fixture(t);
 const manifestPath=join(value.source,"package.json");
 const manifest=JSON.parse(await readFile(manifestPath,"utf8"));
 manifest.dependencies={"@red-cup-engineering/pluggable-venue-adapter-service":"0.1.7"};
 const bytes=Buffer.from(JSON.stringify(manifest)+"\n");
 await writeFile(manifestPath,bytes);
 value.receiving.packages[0].manifestDigest=digest(bytes);
 if(populate){
  const provider=join(value.source,"node_modules","@red-cup-engineering","pluggable-venue-adapter-service");
  await mkdir(provider,{recursive:true});
  await writeFile(join(provider,"package.json"),JSON.stringify({
   name:"@red-cup-engineering/pluggable-venue-adapter-service",version:installed,type:"module"}));
 }
 return {...value,manifestBytes:bytes};
}
test("portable producer refuses wrong exact installed Group adapter before reserving destination",async t=>{
 const {source,destination,receiving,manifestBytes}=await receivedPinFixture(t);
 await assert.rejects(produceRegistryRuntime({transferInstallation:true,consumerPath:source,receiving,destination}),
   /pluggable-venue-adapter-service.*declared 0[.]1[.]7.*0[.]1[.]8/u);
 await assert.rejects(stat(destination),{code:"ENOENT"});
 assert.equal((await stat(join(source,"node_modules"))).isDirectory(),true);
 assert.deepEqual(await readFile(join(source,"package.json")),manifestBytes);
});
test("portable producer refuses absent mandatory exact dependency without installing a placeholder",async t=>{
 const {source,destination,receiving}=await receivedPinFixture(t,{populate:false});
 await assert.rejects(produceRegistryRuntime({transferInstallation:true,consumerPath:source,receiving,destination}),
   /missing exact dependencies.*pluggable-venue-adapter-service/u);
 await assert.rejects(stat(destination),{code:"ENOENT"});
});


test("portable runtime refuses unpinned workspace and registry-range sources despite a held frozen receipt",async t=>{
 for(const specification of ["workspace:*","^0.1.7","latest","file:../unchecked-adapter"]){
  const {source,destination,receiving}=await fixture(t);
  const manifestPath=join(source,"package.json");
  const manifest=JSON.parse(await readFile(manifestPath,"utf8"));
  manifest.dependencies={"@red-cup-engineering/pluggable-venue-adapter-service":specification};
  const bytes=Buffer.from(JSON.stringify(manifest)+"\n");
  await writeFile(manifestPath,bytes);
  receiving.packages[0].manifestDigest=digest(bytes);
  await assert.rejects(
    produceRegistryRuntime({transferInstallation:true,consumerPath:source,receiving,destination}),
    error=>/Publication requires exact registry dependency declarations/u.test(error.message)
      && error.evidence?.some(row=>
        row.name==="@red-cup-engineering/pluggable-venue-adapter-service"
        && row.specification===specification),
    specification);
  await assert.rejects(stat(destination),{code:"ENOENT"});
  assert.deepEqual(await readFile(manifestPath),bytes,
    "refusal cannot modify consumer source when freezing an invalid dependency");
  assert.equal((await stat(join(source,"node_modules"))).isDirectory(),true);
 }
});

test("portable preflight uses exact original publication law rather than inventing a dependency exception",async t=>{
 const {source,destination,receiving}=await fixture(t);
 const path=join(source,"package.json");
 const manifest=JSON.parse(await readFile(path,"utf8"));
 manifest.dependencies={"@red-cup-engineering/pluggable-venue-adapter-service":"0.1.7"};
 manifest.devDependencies={"@external/vendor":"^2.0.0"};
 const bytes=Buffer.from(JSON.stringify(manifest)+"\n");
 await writeFile(path,bytes);
 receiving.packages[0].manifestDigest=digest(bytes);
 await assert.rejects(
  produceRegistryRuntime({transferInstallation:true,consumerPath:source,receiving,destination}),
  error=>/Publication requires exact registry dependency declarations/u.test(error.message)
   && error.evidence?.some(row=>row.field==="devDependencies"
      && row.name==="@external/vendor"),
  "authored non-exact external dependencies have not been frozen into distributable source");
 await assert.rejects(stat(destination),{code:"ENOENT"});
});


// This is a native producer fixture control, not a frozen-install receipt for
// a real Group package. It proves that the exact-pin check admits the original
// packing, static reading and portable transfer path rather than only refusing.
test("portable producer carries a matching exact provider through native packing and useful import", async t => {
  const { source, destination, receiving } = await receivedPinFixture(t, { installed: "0.1.7" });
  const manifestPath = join(source, "package.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  Object.assign(manifest, { type: "module", exports: "./index.mjs", files: ["index.mjs"],
    registryConsumption: { nodeEntrances: ["./index.mjs"] } });
  const manifestBytes = Buffer.from(JSON.stringify(manifest) + "\n");
  await writeFile(manifestPath, manifestBytes);
  receiving.packages[0].manifestDigest = digest(manifestBytes);
  const provider = join(source, "node_modules", "@red-cup-engineering", "pluggable-venue-adapter-service");
  const providerBytes = Buffer.from(JSON.stringify({ name: "@red-cup-engineering/pluggable-venue-adapter-service",
    version: "0.1.7", type: "module", exports: "./index.mjs" }) + "\n");
  const consumerCode = "export { version } from '@red-cup-engineering/pluggable-venue-adapter-service';\n";
  const providerCode = "export const version = '0.1.7';\n";
  await writeFile(join(provider, "package.json"), providerBytes);
  await writeFile(join(source, "index.mjs"), consumerCode);
  await writeFile(join(provider, "index.mjs"), providerCode);
  const lockBytes = await readFile(join(source, "pnpm-lock.yaml"));

  const originalPayload = await stat(join(provider, 'index.mjs'));
  const result = await produceRegistryRuntime({transferInstallation:true, consumerPath: source, receiving, destination });
  assert.equal(result.kind, "npm.registry-runtime.produced");
  assert.deepEqual(result.installedDependencyPins, {
    kind: "npm.runtime-root-exact-dependency-pins", checked: 1, optionalUninstalled: 0, complete: true,
  });
  assert.deepEqual(result.staticImports.findings, []);
  assert.equal(result.staticImports.modules, 2);
  assert.equal(result.installationTransferred, true);
  assert.equal(execFileSync(process.execPath, ["--input-type=module", "-e",
    `import { version } from ${JSON.stringify(pathToFileURL(join(destination, "index.mjs")).href)}; console.log(version);`],
    { encoding: "utf8", timeout: 5000 }).trim(), "0.1.7");
  assert.deepEqual(await readFile(manifestPath), manifestBytes);
  for (const base of [source, destination]) {
    assert.deepEqual(JSON.parse(await readFile(join(base, "package.json"), "utf8")), manifest);
    assert.equal(await readFile(join(base, "index.mjs"), "utf8"), consumerCode);
  }
  const movedProvider = join(destination, 'node_modules', '@red-cup-engineering', 'pluggable-venue-adapter-service');
  assert.deepEqual(await readFile(join(movedProvider,'package.json')),providerBytes);
  assert.equal(await readFile(join(movedProvider,'index.mjs'),'utf8'),providerCode);
  assert.equal((await stat(join(movedProvider,'index.mjs'))).ino,originalPayload.ino);
  await assert.rejects(stat(join(source,'node_modules')),{code:'ENOENT'});
  assert.deepEqual(await readFile(join(source, "pnpm-lock.yaml")), lockBytes);
});


test('whole native output identity includes nested bodies, peer-instance paths, modes and literal links',async t=>{
 const {observeNativeInstallation}=await import('../src/produce-registry-runtime.mjs');
 const {symlink,chmod,unlink}=await import('node:fs/promises');
 const root=await mkdtemp(join(tmpdir(),'native-tree-identity-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const modules=join(root,'node_modules');
 for(const path of ['instance-a/node_modules/provider','instance-b/node_modules/provider']){await mkdir(join(modules,path),{recursive:true});await writeFile(join(modules,path,'index.mjs'),'export const value=1;\n');}
 await symlink('instance-a/node_modules/provider',join(modules,'chosen'));
 const held=await observeNativeInstallation(root),nested=join(modules,'instance-b/node_modules/provider/index.mjs');
 await writeFile(nested,'export const value=2;\n');assert.notEqual((await observeNativeInstallation(root)).sha256,held.sha256);await writeFile(nested,'export const value=1;\n');
 const mode=(await stat(nested)).mode&0o777;await chmod(nested,mode^0o100);assert.notEqual((await observeNativeInstallation(root)).sha256,held.sha256);await chmod(nested,mode);
 await unlink(join(modules,'chosen'));await symlink('instance-b/node_modules/provider',join(modules,'chosen'));assert.notEqual((await observeNativeInstallation(root)).sha256,held.sha256);
 await unlink(join(modules,'chosen'));await symlink('instance-a/node_modules/provider',join(modules,'chosen'));assert.deepEqual(await observeNativeInstallation(root),held);
 await symlink(root,join(modules,'escape'));await assert.rejects(observeNativeInstallation(root),/link leaves/);
});

test('original producer restores installation after an observed post-transfer confinement failure',async t=>{
 const fs=await import('node:fs/promises'),{SourceTextModule,SyntheticModule}=await import('node:vm');
 const {source,destination,receiving}=await fixture(t);let transferred=false;
 const manifestPath=join(source,'package.json'),manifest=JSON.parse(await readFile(manifestPath,'utf8'));manifest.files=[];const manifestBytes=JSON.stringify(manifest)+'\n';await writeFile(manifestPath,manifestBytes);receiving.packages[0].manifestDigest=digest(manifestBytes);
 const sourceURL=new URL('../src/produce-registry-runtime.mjs',import.meta.url);
 const synthetic=values=>new SyntheticModule(Object.keys(values),function(){for(const[name,value]of Object.entries(values))this.setExport(name,value);});
 const module=new SourceTextModule(await readFile(sourceURL,'utf8'),{identifier:sourceURL.href,initializeImportMeta:meta=>{meta.url=sourceURL.href;}});
 await module.link(async specifier=>{
  if(specifier==='node:fs/promises')return synthetic({...fs,rename:async(from,to)=>{
   await fs.rename(from,to);
   if(from===join(source,'node_modules')&&to===join(destination,'node_modules')){transferred=true;await fs.symlink(source,join(to,'injected-post-transfer-escape'));}
  }});
  return synthetic(await import(specifier.startsWith('node:')?specifier:new URL(specifier,sourceURL).href));
 });await module.evaluate();
 await assert.rejects(module.namespace.produceRegistryRuntime({transferInstallation:true,consumerPath:source,receiving,destination}),/link leaves/);
 assert.equal(transferred,true);assert.equal((await stat(join(source,'node_modules'))).isDirectory(),true);await assert.rejects(stat(destination),{code:'ENOENT'});
});


test("implicit and non-transfer materialization refuse before touching any source or destination", async t => {
  const {source,destination,receiving}=await fixture(t);
  const marker=join(source,"node_modules","immutable-payload.txt");
  await writeFile(marker,"existing qualified bytes\n");
  for(const transferInstallation of [undefined,false]){
    await assert.rejects(produceRegistryRuntime({consumerPath:source,receiving,destination,transferInstallation}),/requires explicit disposable installation custody transfer/);
    await assert.rejects(stat(destination),{code:"ENOENT"});
    assert.equal(await readFile(marker,"utf8"),"existing qualified bytes\n");
  }
});
