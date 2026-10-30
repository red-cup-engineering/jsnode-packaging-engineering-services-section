import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { receiveSourceRegistryConsumers } from "../src/source-registry-closure.mjs";
import { pinExactDependencies } from "../src/pin-exact-dependencies.mjs";

// This fixture models only the native installation graph's presence. Actual
// package installation and module receiving remain the provider's tests.
const fakeNativeGraph = `const project = process.argv[process.argv.indexOf("--dir") + 1];
const modules = path.join(project, "node_modules");
fs.mkdirSync(modules);
fs.writeFileSync(path.join(modules, ".modules.yaml"), "layoutVersion: 5\\n");
for (const [name, version] of Object.entries(JSON.parse(fs.readFileSync(path.join(project, "package.json"))).dependencies || {})) {
  const dependency = path.join(modules, name); fs.mkdirSync(dependency, { recursive: true });
  fs.writeFileSync(path.join(dependency, "package.json"), JSON.stringify({ name, version }));
}
`;

// Stands in for a frozen PNPM install: claims an exclusive marker and holds it
// briefly, leaving the committed lock untouched.
const fakePnpm = `const fs = require("node:fs"), path = require("node:path");
const busy = path.join(process.argv[2], "busy");
fs.writeFileSync(busy, String(process.pid), { flag: "wx" });
${fakeNativeGraph}
Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 150);
fs.rmSync(busy);
`;

async function consumers(count) {
  const root = await mkdtemp(join(tmpdir(), "consumer-admission-"));
  const script = join(root, "fake-pnpm.cjs");
  await writeFile(script, fakePnpm);
  const paths = [];
  for (let i = 0; i < count; i++) {
    const dir = join(root, `consumer-${i}`);
    await mkdir(dir);
    await writeFile(join(dir, "package.json"), JSON.stringify({ name: `consumer-${i}`, version: "0.1.0" }));
    await writeFile(join(dir, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
    paths.push(join(dir, "package.json"));
  }
  return { paths, options: { releases: [], logDirectory: join(root, "logs"), pnpm: process.execPath, pnpmArguments: [script, root] } };
}

test("concurrent receiving calls install one consumer at a time", async () => {
  const { paths, options } = await consumers(4);
  const receipts = await Promise.all(paths.map(path => receiveSourceRegistryConsumers({ ...options, consumerPaths: [path], readMemoryPressure: async () => 0 })));
  assert.deepEqual(receipts.flatMap(receipt => receipt.refusals), []);
  assert.equal(receipts.flatMap(receipt => receipt.packages).length, 4);
});

test("a consumer waits until its cgroup memory stall falls below the ceiling", async () => {
  const { paths, options } = await consumers(1);
  const readings = [40, 25, 3];
  const receipt = await receiveSourceRegistryConsumers({ ...options, consumerPaths: paths, readMemoryPressure: async () => readings.shift(), pause: async () => {} });
  assert.equal(receipt.packages.length, 1);
  assert.deepEqual(readings, []);
});

test("a stall that outlasts the admission timeout refuses the consumer", async () => {
  const { paths, options } = await consumers(1);
  const receipt = await receiveSourceRegistryConsumers({ ...options, consumerPaths: paths, readMemoryPressure: async () => 90, admissionTimeout: 0, pause: async () => {} });
  assert.equal(receipt.packages.length, 0);
  assert.equal(receipt.refusals[0].reason, "memory-pressure");
});

test("a successful process without PNPM's native graph preserves the prior installation", async t => {
  const { paths, options } = await consumers(1);
  const project = dirname(paths[0]), root = dirname(project);
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(project, "node_modules"));
  await writeFile(join(project, "node_modules", "prior.txt"), "received before this attempt");
  const script = join(root, "empty-install.cjs");
  await writeFile(script, 'require("node:fs").mkdirSync(require("node:path").join(process.argv[process.argv.indexOf("--dir") + 1], "node_modules"));');
  const receipt = await receiveSourceRegistryConsumers({ ...options, consumerPaths: paths,
    pnpmArguments: [script], readMemoryPressure: async () => 0 });
  assert.equal(receipt.packages.length, 0);
  assert.equal(receipt.refusals[0].reason, "ENOENT");
  assert.equal(await readFile(join(project, "node_modules", "prior.txt"), "utf8"), "received before this attempt");
});

test("the native standalone receiver selects the exact project without ancestor workspace policy", async () => {
  const { paths, options } = await consumers(1);
  const project = dirname(paths[0]);
  const recorder = join(dirname(project), "record-receiver-arguments.cjs");
  const output = join(dirname(project), "received-arguments.json");
  await writeFile(recorder, [
    'const fs = require("node:fs"), path = require("node:path");',
    'fs.writeFileSync(process.argv[2], JSON.stringify(process.argv.slice(3)));',
    fakeNativeGraph,
  ].join("\n"));
  const received = await receiveSourceRegistryConsumers({
    ...options, consumerPaths: paths,
    pnpmArguments: [recorder, output],
    readMemoryPressure: async () => 0,
  });
  assert.deepEqual(received.refusals, []);
  assert.equal(received.packages.length, 1);
  const arguments_ = JSON.parse(await readFile(output, "utf8"));
  assert.equal(arguments_[0], "--dir");
  assert.notEqual(arguments_[1], project, "frozen installation is staged before replacement");
  assert.equal(dirname(arguments_[1]), options.logDirectory);
  assert.ok(arguments_.includes("--ignore-workspace"),
    "an explicit directory alone must not import the ancestor pnpm workspace");
  assert.ok(arguments_.includes("--frozen-lockfile"));
  assert.ok(arguments_.includes("--ignore-scripts"));
});

test("byte-received reviewed candidate passes into the existing frozen consumer entrance", async t => {
  const { paths, options } = await consumers(1);
  const root = dirname(dirname(paths[0]));
  t.after(() => rm(root, { recursive: true, force: true }));
  const name = "@red-cup-engineering/candidate-provider", version = "0.2.4";
  const registry = "https://registry.561.group/";
  const tarball = registry + "@red-cup-engineering/candidate-provider/-/candidate-provider-0.2.4.tgz";
  const bytes = Buffer.from("immutable test producer artifact", "utf8");
  const integrity = "sha512-" + createHash("sha512").update(bytes).digest("base64");
  const manifest = { name: "consumer-0", version: "0.1.0",
    dependencies: { [name]: "workspace:*" } };
  const manifestBytes = JSON.stringify(manifest, null, 2) + "\n";
  await writeFile(paths[0], manifestBytes);
  const site = { path: paths[0], dir: dirname(paths[0]), manifest };
  const selection = { kind: "npm-workspace-publication.reviewed-selection.v1",
    consumer: { name: manifest.name, version: manifest.version,
      manifestSha256: createHash("sha256").update(manifestBytes).digest("hex") },
    releases: [{ name, version, registry, tarball, integrity,
      evidence: ["fixture:independent-release-receiving"] }] };
  const pinning = await pinExactDependencies({
    sites: [site], selection, apply: true, migrateWorkspace: true,
    artifactDirectory: join(root, "received-source-carriers"),
    readRegistryPackageVersionImpl: async (authority, packageName, exact) => {
      assert.equal(authority, registry);
      assert.equal(packageName, name);
      assert.equal(exact, version);
      return { found: true, reachable: true, manifest: {
        name, version, dist: { integrity, tarball },
      } };
    },
    receiveRegistryArtifactImpl: async request => {
      await writeFile(request.destination, bytes);
      return { artifactDownloaded: true, integrity };
    },
  });
  assert.equal(pinning.ok, true);
  const releases = pinning.packages[0].receivedArtifacts;
  assert.equal(releases.length, 1);
  assert.equal(releases[0].artifactDownloaded, true);
  assert.equal(releases[0].integrity, integrity);
  assert.deepEqual(await readFile(releases[0].artifactPath), bytes);
  assert.equal(JSON.parse(await readFile(paths[0], "utf8")).dependencies[name], version);

  // Uses the ORIGINAL frozen consumer function and its actual Node child
  // process seam, without a second install planner or public registry calls.
  // The fixture is not a production PNPM lock, package build, or deployment.
  const receiving = await receiveSourceRegistryConsumers({
    ...options, consumerPaths: paths, releases,
    readMemoryPressure: async () => 0,
  });
  assert.deepEqual(receiving.refusals, []);
  assert.equal(receiving.packages.length, 1);
  assert.equal(receiving.packages[0].frozenInstall, true);
  assert.equal(receiving.packages[0].name, manifest.name);
});

test("the native installer deadline is a separately validated, finite positive budget", async t => {
  const { paths, options } = await consumers(1);
  t.after(() => rm(dirname(dirname(paths[0])), { recursive: true, force: true }));
  for (const invalid of [0, -1, -Infinity, Infinity, NaN, 1.1, "300000", null, 7_200_001]) {
    await assert.rejects(
      receiveSourceRegistryConsumers({ ...options, consumerPaths: paths, installationTimeout: invalid,
        readMemoryPressure: async () => { throw Error("invalid timeout reached memory reader"); } }),
      /native frozen installation timeout must be a positive integer/,
      `invalid timeout: ${String(invalid)}`
    );
  }
});

test("a shorter native PNPM deadline fails closed without replacing the previous install; an admitted longer deadline completes", async t => {
  const shorter = await consumers(1);
  const shortProject = dirname(shorter.paths[0]), shortRoot = dirname(shortProject);
  t.after(() => rm(shortRoot, { recursive: true, force: true }));
  await mkdir(join(shortProject, "node_modules"));
  await writeFile(join(shortProject, "node_modules", "previous.txt"), "previous qualifying installation");
  const short = await receiveSourceRegistryConsumers({ ...shorter.options, consumerPaths: shorter.paths,
    installationTimeout: 15, admissionTimeout: 1_800_000, readMemoryPressure: async () => 0 });
  assert.equal(short.packages.length, 0);
  assert.equal(short.refusals.length, 1);
  assert.equal(await readFile(join(shortProject, "node_modules", "previous.txt"), "utf8"),
    "previous qualifying installation");
  assert.match(await readFile(short.refusals[0].log, "utf8"), /timed out|SIGTERM|killed|Command failed/iu);

  const longer = await consumers(1);
  t.after(() => rm(dirname(dirname(longer.paths[0])), { recursive: true, force: true }));
  const completed = await receiveSourceRegistryConsumers({ ...longer.options, consumerPaths: longer.paths,
    installationTimeout: 10_000, admissionTimeout: 1, readMemoryPressure: async () => 0 });
  assert.deepEqual(completed.refusals, []);
  assert.equal(completed.packages.length, 1);
  assert.equal(completed.packages[0].frozenInstall, true);
  assert.match(await readFile(completed.packages[0].log, "utf8"), /frozen/u);
});

test("original JSON-to-CLI receiver forwards an explicit installation deadline", async t => {
  const source = fileURLToPath(new URL("../scripts/receive-source-registry-consumers.mjs", import.meta.url));
  for (const [installationTimeout, expectedSuccess] of [[15, false], [10_000, true]]) {
    const { paths, options } = await consumers(1);
    const root = dirname(dirname(paths[0]));
    t.after(() => rm(root, { recursive: true, force: true }));
    const selection = join(root, "selection.json"), output = join(root, "receipt.json");
    await writeFile(selection, JSON.stringify({
      consumerPaths: paths, releases: [], pnpm: options.pnpm,
      pnpmArguments: options.pnpmArguments, installationTimeout,
      memoryPressureCeiling: 100
    }));
    const result = spawnSync(process.execPath,
      [source, selection, options.logDirectory, output],
      { encoding: "utf8", timeout: 20_000 });
    assert.equal(result.status, expectedSuccess ? 0 : 1, result.stderr);
    const receipt = JSON.parse(await readFile(output, "utf8"));
    assert.equal(receipt.packages.length, expectedSuccess ? 1 : 0);
    assert.equal(receipt.refusals.length, expectedSuccess ? 0 : 1);
  }
});

test("the native consumer receives exact package-hook bytes and refuses hook drift before replacement",async t=>{
 for(const changed of["source","staging"]){
  const{paths,options}=await consumers(1),project=dirname(paths[0]),root=dirname(project);
  t.after(()=>rm(root,{recursive:true,force:true}));
  const hook="module.exports={hooks:{readPackage(p){return p}}};\n";
  await writeFile(join(project,".pnpmfile.cjs"),hook);await mkdir(join(project,"node_modules"));await writeFile(join(project,"node_modules/prior"),"keep");
  const script=join(root,"hook-drift.cjs");
  await writeFile(script,[
   'const fs=require("node:fs"),path=require("node:path");',
   'const stage=process.argv[process.argv.indexOf("--dir")+1];',
   `if(fs.readFileSync(path.join(stage,".pnpmfile.cjs"),"utf8")!==${JSON.stringify(hook)})throw Error("hook was not received");`,
   `fs.writeFileSync(path.join(${JSON.stringify(changed==="source"?project:"")}||stage,".pnpmfile.cjs"),"module.exports={};");`,
   fakeNativeGraph,
  ].join("\n"));
  const received=await receiveSourceRegistryConsumers({...options,consumerPaths:paths,pnpmArguments:[script],readMemoryPressure:async()=>0});
  assert.equal(received.packages.length,0);assert.equal(received.refusals[0].reason,"command-failed");
  assert.match(await readFile(received.refusals[0].log,"utf8"),/native package hook changed during frozen receiving/u);
  assert.equal(await readFile(join(project,"node_modules/prior"),"utf8"),"keep");
 }
});
test("real frozen PNPM receives the source hook checksum and useful installed package",{skip:!process.env.NATIVE_PNPM},async t=>{
 const{execFile}=await import("node:child_process"),{promisify}=await import("node:util"),{createServer}=await import("node:http");
 const execute=promisify(execFile),root=await mkdtemp(join(tmpdir(),"native-pnpm-hook-"));t.after(()=>rm(root,{recursive:true,force:true}));
 const provider=join(root,"provider"),project=join(root,"consumer");await mkdir(provider);await mkdir(project);
 const manifest={name:"fixture-native-hook",version:"1.0.0",main:"index.cjs",files:["index.cjs"]};
 await writeFile(join(provider,"package.json"),JSON.stringify(manifest));await writeFile(join(provider,"index.cjs"),"module.exports=43;\n");
 const packed=JSON.parse((await execute("npm",["pack","--json","--ignore-scripts","--pack-destination",root],{cwd:provider,timeout:30000})).stdout)[0];
 const archive=await readFile(join(root,packed.filename)),integrity="sha512-"+createHash("sha512").update(archive).digest("base64");
 let origin;
 const server=createServer((req,res)=>{
  if(req.url==="/fixture-native-hook"){res.setHeader("content-type","application/json");res.end(JSON.stringify({name:manifest.name,"dist-tags":{latest:"1.0.0"},versions:{"1.0.0":{...manifest,dist:{integrity,tarball:origin+"/package.tgz"}}}}));}
  else if(req.url==="/package.tgz"){res.setHeader("content-type","application/octet-stream");res.end(archive);}
  else{res.statusCode=404;res.end();}
 });
 await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));origin="http://127.0.0.1:"+server.address().port;
 t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
 const hook="module.exports={hooks:{readPackage(p){return p}}};\n";
 await writeFile(join(project,"package.json"),JSON.stringify({name:"native-hook-consumer",version:"1.0.0",packageManager:"pnpm@11.28.5",dependencies:{[manifest.name]:"1.0.0"},registryConsumption:{minimumReleaseAge:0}}));
 await writeFile(join(project,".pnpmfile.cjs"),hook);await writeFile(join(project,".npmrc"),"registry="+origin+"\nminimum-release-age=0\n");
 await execute(process.env.NATIVE_PNPM,["--dir",project,"install","--ignore-scripts","--lockfile-only"],{cwd:project,timeout:60000,maxBuffer:1048576});
 const lock=await readFile(join(project,"pnpm-lock.yaml"),"utf8");assert.match(lock,/pnpmfileChecksum:/u);
 const received=await receiveSourceRegistryConsumers({consumerPaths:[project],releases:[],logDirectory:join(root,"receiving"),pnpm:process.env.NATIVE_PNPM,readMemoryPressure:async()=>0,installationTimeout:60000});
 assert.deepEqual(received.refusals,[]);assert.equal(received.packages.length,1);
 assert.equal(received.packages[0].packageHookDigest,createHash("sha256").update(hook).digest("hex"));
 assert.equal(await readFile(join(project,"pnpm-lock.yaml"),"utf8"),lock);
 const {createRequire}=await import("node:module");assert.equal(createRequire(join(project,"package.json"))("fixture-native-hook"),43);
});

test("strict cached assembly rejects foreign configuration before reading consumers or executing callbacks", async t => {
  const root=await mkdtemp(join(tmpdir(),"store-assembly-admission-"));
  t.after(()=>rm(root,{recursive:true,force:true}));
  let effects=0;
  const original={consumerPaths:[],releases:[],logDirectory:join(root,"must-not-create"),pnpm:process.execPath,
    pnpmArguments:["/qualified/native-entry.mjs"],readMemoryPressure:async()=>{effects++;return 0;}};
  for(const nativeStoreAssembly of[
    null,{storeBase:root,receiptDirectory:root,copyFallback:true},
    {storeBase:root,receiptDirectory:root,service:{}},
    {storeBase:"relative",receiptDirectory:root},
    {get storeBase(){effects++;throw Error("must not evaluate");},receiptDirectory:root}
  ])await assert.rejects(receiveSourceRegistryConsumers({...original,nativeStoreAssembly}),TypeError);
  await assert.rejects(receiveSourceRegistryConsumers({...original,pnpmArguments:["/qualified/native-entry.mjs","--store-dir=/foreign"],nativeStoreAssembly:{storeBase:root,receiptDirectory:root}}),TypeError);
  assert.equal(effects,0);
  await assert.rejects(readFile(join(root,"must-not-create")),{code:"ENOENT"});
});


test('initial frozen composition refuses mixed or multiple scopes before effects',async t=>{
 const root=await mkdtemp(join(tmpdir(),'initial-frozen-composition-refusal-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const options={consumerPaths:['/unread-consumer'],releases:[],logDirectory:join(root,'not-created')};
 const request={mode:'online',bindings:{},attemptDirectory:root,cacheRoot:root,registry:'https://registry.561.group/',sourceHead:'a'.repeat(40),environment:{},environmentPolicy:{},content:[],selectedArtifacts:[]};
 for(const extra of [{consumerPaths:[]},{consumerPaths:['/one','/two']},{pnpm:'/foreign'},{pnpmArguments:['foreign']},{nativeStoreAssembly:{}},{artifactReceiving:[{}]}]){
  await assert.rejects(receiveSourceRegistryConsumers({...options,...extra,nativeInitialFrozen:request}));
 }
 let reads=0;await assert.rejects(receiveSourceRegistryConsumers({...options,nativeInitialFrozen:{...request,get mode(){reads++;throw Error('not data')}}}),/unsupported worker field/);assert.equal(reads,0);
 await assert.rejects(readFile(options.logDirectory),{code:'ENOENT'});
});
