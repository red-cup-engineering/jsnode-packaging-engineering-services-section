import test from "node:test";
import { receiveSourcePublicationBuildWorker } from "../src/source-build-worker-receiving.mjs";
import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { sourcePublicationBuildRecipe, qualifySourcePublicationBuild, runSourceBuildWorker, validateSourceBuildCacheRoot } from "../src/source-build-qualification.mjs";

const manifest = { name: "@red-cup-engineering/typed-fixture", version: "0.1.0", type: "module",
  scripts: { build: "tsc -p tsconfig.build.json", test: "npm run build && node --test --test-concurrency=1 test/*.test.mjs" },
  devDependencies: { typescript: "5.9.3" }, files: ["dist"], exports: "./dist/index.mjs" };
const lock = { name: manifest.name, version: manifest.version, lockfileVersion: 3, packages: {
  "": { name: manifest.name, version: manifest.version, devDependencies: manifest.devDependencies },
  "node_modules/typescript": { version: "5.9.3", integrity: "sha512-YQ==" },
} };
const configuration = { compilerOptions: { rootDir: "src", outDir: "dist" }, include: ["src/**/*.mts"] };
const planned = () => ({ package: manifest.name, kind: "npm.source-build-qualification", outcome: "source-build-qualified", state: { sourceVersion: manifest.version }, steps: [1, 2].map(step => ({ step, ok: true, ...(step === 2 ? { evidence: { testCount: { tests: 1, pass: 1, fail: 0 } } } : {}) })) });

async function fixture(files = {}) {
  const root = await mkdtemp(join(tmpdir(), "landing-build-contract-")), directory = join(root, "package");
  const source = { "package.json": JSON.stringify(manifest), "package-lock.json": JSON.stringify(lock),
    "tsconfig.build.json": JSON.stringify(configuration), "src/index.mts": "export const value: number = 7;\n", "test/index.test.mjs": "import test from 'node:test'; test('actual', () => {});\n", ...files };
  const entries = [];
  for (const [path, text] of Object.entries(source)) {
    if (text === null) continue;
    await mkdir(dirname(join(directory, path)), { recursive: true }); await writeFile(join(directory, path), text, { mode: 0o644 });
    entries.push({ path, bytes: Buffer.from(text), mode: "100644" });
  }
  return { directory, entries, scratch: root, manifest: JSON.parse(source["package.json"]), registry: "https://registry.561.group/", cleanup: () => rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }) };
}

test("only direct typed builds with confined native test targets are selected", () => {
  assert.equal(sourcePublicationBuildRecipe({ scripts: { test: "node --test" } }), null);
  assert.equal(sourcePublicationBuildRecipe({ scripts: { build: "go build ./..." } }), null);
  assert.deepEqual(sourcePublicationBuildRecipe(manifest), { configuration: "tsconfig.build.json" });
  for (const target of ["../test/*.test.mjs", "/tmp/*.test.mjs", "test/$(touch x).test.mjs", "test/*.test.mjs;true", "test/*.test.mjs && true"])
    assert.throws(() => sourcePublicationBuildRecipe({ ...manifest, scripts: { ...manifest.scripts, test: "node --test " + target } }), /confined/u);
  assert.throws(() => sourcePublicationBuildRecipe({ ...manifest, packageManager: "pnpm@11.28.5" }), /npm lock/u);
  assert.throws(() => sourcePublicationBuildRecipe({ ...manifest, dependencies: { local: "file:../local" } }), /exact registry/u);
});

test("Code plan qualification admits new dist while retaining all authored inputs", async () => {
  const f = await fixture();
  try {
    const result = await qualifySourcePublicationBuild({ ...f, codeGate: async input => {
      assert.equal(input.registry, f.registry); await mkdir(join(f.directory, "dist"));
      await writeFile(join(f.directory, "dist/index.mjs"), "export const value = 7;\n"); return planned();
    } });
    assert.equal(result.apply, false); assert.equal(result.authoredFiles, 5); assert.equal(result.paths, 9);
  } finally {
    await f.cleanup();
  }
});

test("unsupported or unpinned compiler configurations refuse before invoking Code", async () => {
  const cases = [
    { "package-lock.json": null },
    { "package-lock.json": JSON.stringify({ ...lock, version: "0.2.0" }) },
    { "package-lock.json": JSON.stringify({ ...lock, packages: { ...lock.packages, "node_modules/@red-cup-engineering/foreign": { resolved: "https://foreign.invalid/foreign.tgz" } } }) },
    { "package-lock.json": JSON.stringify({ ...lock, packages: { ...lock.packages, "node_modules/foreign": { resolved: "file:../foreign", link: true } } }) },
    { "package-lock.json": JSON.stringify({ ...lock, packages: { ...lock.packages, "node_modules/typescript": { version: "5.8.0", integrity: "sha512-YQ==" } } }) },
    { "tsconfig.build.json": JSON.stringify({ ...configuration, extends: "../foreign.json" }) },
    { "tsconfig.build.json": JSON.stringify({ ...configuration, compilerOptions: { rootDir: "src", outDir: "../foreign" } }) },
    { "tsconfig.build.json": JSON.stringify({ ...configuration, compilerOptions: { rootDir: "src", outDir: "node_modules" } }) },
    { "tsconfig.build.json": JSON.stringify({ ...configuration, include: ["../private/**/*.mts"] }) },
    { "tsconfig.build.json": JSON.stringify({ ...configuration, files: ["/tmp/private.mts"] }) },
    { "tsconfig.build.json": JSON.stringify({ ...configuration, files: ["../private.mts"] }) },
    { ".npmrc": "registry=https://foreign.example/\n" },
    { ".pnpmfile.cjs": "throw Error('must not load')" },
    { "dist/index.mjs": "old committed product\n" },
  ];
  for (const source of cases) {
    const f = await fixture(source); let calls = 0;
    try { await assert.rejects(qualifySourcePublicationBuild({ ...f, codeGate: async () => { calls++; return planned(); } })); assert.equal(calls, 0); }
    finally { await f.cleanup(); }
  }
});

test("source entry confinement, uniqueness and actual initial bytes hold before the worker", async () => {
  for (const alter of [
    f => f.entries.push({ path: "../foreign", bytes: Buffer.from("x"), mode: "100644" }),
    f => f.entries.push(f.entries[0]),
    f => { f.entries[0].mode = "120000"; },
    f => { f.entries.find(row => row.path === "src/index.mts").bytes = Buffer.from("changed before worker"); },
  ]) {
    const f = await fixture(); let calls = 0;
    try {
      alter(f);
      await assert.rejects(qualifySourcePublicationBuild({ ...f, codeGate: async () => { calls++; return planned(); } }));
      assert.equal(calls, 0);
    } finally { await f.cleanup(); }
  }
});

test("failed, applying, mismatched and incomplete Code outcomes cannot authorize packing", async () => {
  for (const outcome of [ { ...planned(), outcome: "refused" }, { ...planned(), package: "other" },
    { ...planned(), steps: [...planned().steps, { step: 6, ok: true }] }, { ...planned(), steps: [] }, null ]) {
    const f = await fixture();
    try { await assert.rejects(qualifySourcePublicationBuild({ ...f, codeGate: async () => outcome }), /did not qualify|refused/u); }
    finally { await f.cleanup(); }
  }
  const f = await fixture();
  try { await assert.rejects(qualifySourcePublicationBuild({ ...f, codeGate: async () => { throw Error("native build failed"); } }), /native build failed/u); }
  finally { await f.cleanup(); }
});

test("source and lock mutation, unplanned source and redirected products refuse", async () => {
  const changes = [
    f => writeFile(join(f.directory, "src/index.mts"), "export const changed = true;"),
    f => writeFile(join(f.directory, "package-lock.json"), "{}"),
    f => writeFile(join(f.directory, "src/unreviewed.mjs"), "export const changed = true;"),
    async f => { await mkdir(join(f.directory, "dist")); await symlink("../src/index.mts", join(f.directory, "dist/index.mjs")); },
  ];
  for (const change of changes) {
    const f = await fixture();
    try { await assert.rejects(qualifySourcePublicationBuild({ ...f, codeGate: async () => { await change(f); return planned(); } })); }
    finally { await f.cleanup(); }
  }
});

test("the isolated source worker times out its own descendant writers and refuses invalid bounds", async () => {
  for (const timeoutMilliseconds of [0, -1, NaN, Infinity, 0.1, "5", 300001])
    await assert.rejects(runSourceBuildWorker({ timeoutMilliseconds }), /timeout/u);
  const f = await fixture();
  const names = ["GITHUB_TOKEN", "NPM_REGISTRY_PUBLISHER_PASSWORD", "CREDENTIALS_STORE"], previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  try {
    for (const name of names) process.env[name] = "qualification-sentinel-must-not-reach-worker";
    const source = { name: "bounded-build-worker", version: "0.1.0", private: true, scripts: { build: "node build.cjs", test: "node --test" } };
    await writeFile(join(f.directory, "package.json"), JSON.stringify(source));
    await writeFile(join(f.directory, "package-lock.json"), JSON.stringify({ name: source.name, version: source.version, lockfileVersion: 3, packages: { "": { name: source.name, version: source.version } } }));
    const heartbeat = join(f.directory, "descendant-heartbeat");
    await writeFile(join(f.directory, "build.cjs"), `const {spawn}=require('node:child_process');const fs=require('node:fs');if(process.env.GITHUB_TOKEN||process.env.NPM_REGISTRY_PUBLISHER_PASSWORD||process.env.CREDENTIALS_STORE)throw Error('credential escaped');fs.writeFileSync(${JSON.stringify(heartbeat)},'started');spawn(process.execPath,['-e',${JSON.stringify(`const fs=require('node:fs');setInterval(()=>fs.appendFileSync(${JSON.stringify(heartbeat)},'.'),10)`)}],{stdio:'ignore'});setInterval(()=>{},1000);`);
    const failure = await runSourceBuildWorker({ directory: f.directory, registry: f.registry, scratch: f.scratch, timeoutMilliseconds: 5000 }).catch(error => error);
    assert.ok(failure instanceof Error, JSON.stringify(failure));
    assert.equal(receiveSourcePublicationBuildWorker(failure.workerReceiving).state, "settled-refused");
    assert.equal(failure.processObservation.quiescent, true);
    const ended = await readFile(heartbeat, "utf8").catch(() => { throw new Error("worker never reached the descendant assay: " + String(failure.stdout) + String(failure.stderr) + failure.message); });
    assert.match(ended, /^started\.+$/u);
    await new Promise(accept => setTimeout(accept, 100));
    assert.equal(await readFile(heartbeat, "utf8"), ended, "the timed-out worker's descendant must stop writing before staging can retire");
  } finally {
    for (const name of names) { if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name]; }
    await f.cleanup();
  }
});

test("required native test counts cannot qualify an empty or entirely skipped suite", async () => {
  for (const count of [{ tests: 0, pass: 0, fail: 0 }, { tests: 1, pass: 0, fail: 0 }, null]) {
    const f = await fixture();
    try {
      const report = planned();
      report.steps[1].evidence.testCount = count;
      await assert.rejects(qualifySourcePublicationBuild({ ...f, codeGate: async () => report }),
        /execute passing required tests/u);
    } finally { await f.cleanup(); }
  }
});

test("each declared native test target needs a received file, including a missing secondary glob", async () => {
  const selected = { ...manifest, scripts: { ...manifest.scripts,
    test: "node --test test/*.test.mjs services/missing/*.test.mjs" } };
  const f = await fixture({ "package.json": JSON.stringify(selected) });
  try {
    await assert.rejects(qualifySourcePublicationBuild({ ...f, codeGate: async () => planned() }),
      /declared test target has no received file: services\/missing/u);
  } finally { await f.cleanup(); }
});

test("a generated native test target and mixed skips with an executed pass remain qualified", async () => {
  const selected = { ...manifest, scripts: { ...manifest.scripts,
    test: "node --test dist/**/*.test.mjs" } };
  const f = await fixture({ "package.json": JSON.stringify(selected) });
  try {
    const result = await qualifySourcePublicationBuild({ ...f, codeGate: async () => {
      await mkdir(join(f.directory, "dist", "test"), { recursive: true });
      await writeFile(join(f.directory, "dist", "test", "generated.test.mjs"), "export const received = true;\n");
      const report = planned();
      report.steps[1].evidence.testCount = { tests: 2, pass: 1, fail: 0 };
      return report;
    } });
    assert.deepEqual(result.testTargets, [{ pattern: "dist/**/*.test.mjs", files: ["dist/test/generated.test.mjs"] }]);
  } finally { await f.cleanup(); }
});

test("the alternate nonbuilding carrier does not acquire a test-suite requirement", async () => {
  let calls = 0;
  const result = await qualifySourcePublicationBuild({
    manifest: { name: "plain-js", scripts: {} },
    codeGate: async () => { calls++; throw Error("must not run"); },
  });
  assert.equal(result, null);
  assert.equal(calls, 0);
});

test("separate native attempts reuse an owned cache without reusing installation or hiding a test refusal", async () => {
  const f = await fixture(), cacheRoot = join(f.scratch, "release-cache");
  const standingCache = await mkdtemp(join(tmpdir(), "standing-npm-cache-fixture-"));
  const previousCache = process.env.npm_config_cache;
  process.env.npm_config_cache = standingCache;
  await mkdir(cacheRoot, { mode: 0o700 });
  const carrier = join(f.scratch, "carrier"), packageDir = join(carrier, "package");
  await mkdir(packageDir, { recursive: true });
  await writeFile(join(packageDir, "package.json"), JSON.stringify({ name: "source-cache-provider", version: "1.0.0", type: "module", exports: "./index.mjs" }));
  await writeFile(join(packageDir, "index.mjs"), "export const value = 7;\n");
  const packed = spawnSync("tar", ["-czf", "-", "-C", carrier, "package"], { maxBuffer: 1024 * 1024 });
  assert.equal(packed.status, 0, packed.stderr.toString());
  const integrity = "sha512-" + createHash("sha512").update(packed.stdout).digest("base64");
  let requests = 0, downloads = 0;
  const server = createServer((request, response) => {
    requests++;
    if (request.url !== "/source-cache-provider.tgz") { response.writeHead(404).end(); return; }
    if (request.headers["if-none-match"] === '"native-cache-fixture"') { response.writeHead(304).end(); return; }
    downloads++;
    response.writeHead(200, { "content-type": "application/octet-stream", "cache-control": "public, max-age=31536000", etag: '"native-cache-fixture"' });
    response.end(packed.stdout);
  });
  await new Promise(accept => server.listen(0, "127.0.0.1", accept));
  const registry = `http://127.0.0.1:${server.address().port}/`;
  const source = { name: "owned-cache-fixture", version: "1.0.0", private: true, type: "module",
    scripts: { test: "node --test test/*.test.mjs" }, dependencies: { "source-cache-provider": "1.0.0" } };
  try {
    await writeFile(join(f.directory, "package.json"), JSON.stringify(source));
    await writeFile(join(f.directory, "package-lock.json"), JSON.stringify({ name: source.name, version: source.version, lockfileVersion: 3, packages: {
      "": { name: source.name, version: source.version, dependencies: source.dependencies },
      "node_modules/source-cache-provider": { version: "1.0.0", resolved: registry + "source-cache-provider.tgz", integrity },
    } }));
    const testPath = join(f.directory, "test/index.test.mjs");
    await writeFile(testPath, "import test from 'node:test'; import assert from 'node:assert/strict'; import {value} from 'source-cache-provider'; test('native cache provider',()=>assert.equal(value,7));\n");
    const invoke = name => runSourceBuildWorker({ directory: f.directory, registry, cacheRoot, scratch: join(f.scratch, name), timeoutMilliseconds: 20000 });
    const first = await invoke("first-attempt");
    assert.equal(first.outcome, "source-build-qualified");
    const firstWorker = receiveSourcePublicationBuildWorker(first.workerReceiving);
    assert.equal(firstWorker.state, "settled-success");
    assert.equal(firstWorker.semanticReceiving, false);
    assert.equal(firstWorker.qualifiedProducts, false);
    assert.equal(first.state.cacheRoot, cacheRoot);
    assert.equal(downloads, 1);
    const firstReceipt = join(first.state.qualificationScratchRoot, "retained-receiving-receipt");
    await writeFile(firstReceipt, "first attempt receipt\n");
    const marker = join(cacheRoot, "retained-attempt-evidence");
    await writeFile(marker, "first attempt retained\n");
    const oldInstall = join(f.directory, "node_modules", "old-install-marker");
    await writeFile(oldInstall, "must not survive a fresh install");
    const second = await invoke("second-attempt");
    assert.equal(second.outcome, "source-build-qualified");
    assert.notEqual(second.state.qualificationScratchRoot, first.state.qualificationScratchRoot,
      "a retained cache must not reuse the receiving attempt's scratch/receipt names");
    assert.notEqual(first.state.qualificationScratchRoot, cacheRoot);
    assert.equal(first.state.freshInstallTestCount.pass, 1, "the source qualifier retains the full original phase state");
    await assert.rejects(readFile(oldInstall), { code: "ENOENT" });
    assert.equal(downloads, 1, "native npm receives the same integrity-bound cached bytes rather than a second tar download");
    assert(requests >= 1);
    assert.equal(await readFile(marker, "utf8"), "first attempt retained\n");
    assert((await readdir(join(standingCache, "_logs"))).length >= 2);
    await writeFile(testPath, "import test from 'node:test'; import assert from 'node:assert/strict'; test('native refusal',()=>assert.fail('intentional fixture failure'));\n");
    const failed = await invoke("failed-attempt");
    assert.equal(failed.outcome, "refused");
    assert.equal(failed.refusal.step, 2);
    assert.equal(failed.refusal.evidence.fail, 1);
    assert.equal(failed.state.cacheRoot, cacheRoot);
    assert.notEqual(failed.state.qualificationScratchRoot, second.state.qualificationScratchRoot);
    assert.equal(await readFile(firstReceipt, "utf8"), "first attempt receipt\n",
      "a reused cache must not overwrite or retire an earlier attempt's receiving custody");
    assert.equal(await readFile(marker, "utf8"), "first attempt retained\n", "a failed native test cannot erase cache/attempt custody");
  } finally {
    if (previousCache === undefined) delete process.env.npm_config_cache; else process.env.npm_config_cache = previousCache;
    await rm(standingCache, { recursive: true, force: true });
    await new Promise(accept => server.close(accept));
    await f.cleanup();
  }
});

test("cache selection refuses redirects, public or overlapping roots before worker staging", async () => {
  const f = await fixture(), cacheRoot = join(f.scratch, "private-cache"), redirected = join(f.scratch, "cache-link");
  await mkdir(cacheRoot, { mode: 0o700 });
  await symlink(cacheRoot, redirected);
  try {
    assert.equal(await validateSourceBuildCacheRoot(cacheRoot, f.directory), cacheRoot);
    for (const value of [null, 0, "", "relative-cache", redirected, cacheRoot + "/../private-cache", f.directory, f.scratch]) {
      const scratch = join(f.scratch, "must-not-stage");
      await assert.rejects(runSourceBuildWorker({ directory: f.directory, registry: f.registry, cacheRoot: value, scratch }), /cacheRoot/u);
      await assert.rejects(readFile(join(scratch, "build-home", "npmrc")), { code: "ENOENT" });
    }
    await symlink(f.directory, join(cacheRoot, "npm"));
    await assert.rejects(runSourceBuildWorker({ directory: f.directory, registry: f.registry, cacheRoot, scratch: join(f.scratch, "must-not-stage") }), /owned and unredirected/u);
    await rm(join(cacheRoot, "npm"));
    await chmod(cacheRoot, 0o755);
    await assert.rejects(runSourceBuildWorker({ directory: f.directory, registry: f.registry, cacheRoot, scratch: join(f.scratch, "must-not-stage") }), /private owned/u);
    const cli = new URL("../scripts/publish-package.mjs", import.meta.url);
    for (const args of [["--package", f.directory, "--qualification-cache-root", cacheRoot], ["--qualify-build", "--package", f.directory, "--qualification-cache-root"]]) {
      const result = spawnSync(process.execPath, [fileURLToPath(cli), ...args], { encoding: "utf8", timeout: 5000 });
      assert.equal(result.status, 1);
      assert.match(result.stderr, /--qualification-cache-root requires/u);
    }
  } finally { await f.cleanup(); }
});



test("credential or query registry inputs refuse before scratch, evidence or worker creation", async () => {
  for (const registry of ["https://fixture-user:fixture-secret@registry.example", "https://registry.example?token=fixture-secret", "https://registry.example/#fixture-secret", "not-a-url-fixture-secret"]) {
    const root = await mkdtemp(join(tmpdir(), "build-registry-hygiene-"));
    try {
      const scratch = join(root, "must-not-create");
      const error = await runSourceBuildWorker({ directory: join(root, "absent-source"), registry, scratch }).catch(error => error);
      assert.ok(error instanceof TypeError);assert.equal(String(error).includes("fixture-secret"), false);
      assert.deepEqual(await readdir(root), []);
    } finally { await rm(root, {recursive:true, force:true}); }
  }
});
