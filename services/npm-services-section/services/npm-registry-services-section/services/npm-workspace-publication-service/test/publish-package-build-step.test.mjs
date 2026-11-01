import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";

import { chmodSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { createServer as createLoopbackServer } from "node:http";

/** A loopback fixture server over the platform HTTP runtime; the code under test is its client. */
const createHttpServer = ({ handle }) => createLoopbackServer(handle);

const run = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, "..", "scripts", "publish-package.mjs");
const REAL_NPM = execFileSync("which", ["npm"], { encoding: "utf8" }).trim();

/** Fakes only `ping`/`whoami` (no real registry needed); every other npm subcommand runs for real. */
async function runGateAgainstFixture(fixtureName, gateArgs = [], denyIdentity = false, mutateFixture = () => {}, capturePublication = false, registryDocument = null) {
  const server = createHttpServer({ handle: (request, response) => {
    if (request.url === "/") { response.writeHead(200); response.end("{}"); return; }
    if (registryDocument && decodeURIComponent(request.url.split("?")[0]) === "/" + registryDocument.name) {
      response.writeHead(200, { "content-type": "application/json" }); response.end(JSON.stringify(registryDocument)); return;
    }
    response.writeHead(404); response.end("not found");
  } });
  await new Promise((accept) => server.listen(0, "127.0.0.1", accept));
  const registry = `http://127.0.0.1:${server.address().port}/`;
  if (typeof registryDocument === "function") registryDocument = registryDocument(registry);

  const root = mkdtempSync(join(tmpdir(), "publish-package-build-step-"));
  const bin = join(root, "bin");
  const packageDir = join(root, "fixture-services-section", "package");
  try {
    cpSync(join(HERE, "fixtures", fixtureName), packageDir, { recursive: true });
    if (capturePublication) mkdirSync(join(root, "fixture-services-section", "data"), { recursive: true });
    mutateFixture(packageDir);
    mkdirSync(bin, { recursive: true });
    const npmShim = join(bin, "npm");
    writeFileSync(npmShim, `#!/usr/bin/env node
const { execFileSync } = require("node:child_process");
const args = process.argv.slice(2);
if (args[0] === "ping") { process.stdout.write("PONG\\n"); process.exit(0); }
if (args[0] === "whoami") { if (${denyIdentity}) { process.stderr.write("ENEEDAUTH identity deliberately unavailable\\n"); process.exit(1); } process.stdout.write("build-step-test-user\\n"); process.exit(0); }
if (args[0] === "publish") {
  if (!${capturePublication}) throw Error("unexpected publication in fixture");
  const fs = require("node:fs"), crypto = require("node:crypto");
  const artifact = args[1];
  const bytes = fs.readFileSync(artifact);
  const manifest = JSON.parse(execFileSync("tar", ["-xOf", artifact, "package/package.json"], { encoding: "utf8" }));
  const files = execFileSync("tar", ["-tzf", artifact], { encoding: "utf8" }).trim().split("\\n");
  fs.writeFileSync(${JSON.stringify(join(root, "publication-capture.json"))}, JSON.stringify({ args, artifact, manifest, files, integrity: "sha512-" + crypto.createHash("sha512").update(bytes).digest("base64") }));
  process.stderr.write("publication deliberately captured; no network effect\\n"); process.exit(1);
}
try {
  process.stdout.write(execFileSync(${JSON.stringify(REAL_NPM)}, args, { cwd: process.cwd() }));
} catch (error) {
  if (error.stdout) process.stdout.write(error.stdout);
  if (error.stderr) process.stderr.write(error.stderr);
  process.exit(error.status ?? 1);
}
`);
    chmodSync(npmShim, 0o755);

    // This file itself runs under `node --test`, which sets NODE_TEST_CONTEXT
    // in the environment; left in place, the fixture's own `npm test` (a
    // nested `node --test`) detects the ambient context and skips itself.
    const gateEnv = { ...process.env, PATH: `${bin}:${process.env.PATH}` };
    if (gateArgs.includes("--qualify-build")) gateEnv.npm_config_ignore_scripts = "true";
    delete gateEnv.NODE_TEST_CONTEXT;
    delete gateEnv.NODE_TEST_WORKER_ID;
    const outcome = await run(process.execPath, [SCRIPT, "--package", packageDir, "--registry", registry, ...gateArgs], {
      maxBuffer: 16 * 1024 * 1024,
      env: gateEnv,
    }).catch((error) => error);
    return { outcome, packageDir, root };
  } finally {
    await new Promise((accept) => server.close(accept));
  }
}

test("the build step runs a declared build script and the published tarball carries its fresh output", async () => {
  const { outcome, packageDir, root } = await runGateAgainstFixture("publish-package-build-success-fixture");
  try {
    const report = JSON.parse(outcome.stdout);
    assert.equal(report.outcome, "planned", JSON.stringify(report, null, 2));
    const buildStep = report.steps.find((step) => step.name === "build");
    assert.ok(buildStep, "expected a build step in the report");
    assert.equal(buildStep.ok, true);
    assert.equal(buildStep.evidence.ran, true);
    assert.equal(buildStep.evidence.staleness.stale, false);

    const packed = await run("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], { cwd: packageDir, maxBuffer: 8 * 1024 * 1024 });
    const files = JSON.parse(packed.stdout)[0].files.map((file) => file.path);
    assert.ok(files.includes("dist/x.mjs"), `expected dist/x.mjs among packed files: ${files.join(", ")}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("first-publication plan refuses a receiving test omitted by the actual packlist", async () => {
  const fixture = await runGateAgainstFixture("publish-package-build-success-fixture", [], false, packageDir => {
    const path = join(packageDir, "package.json"), manifest = JSON.parse(readFileSync(path, "utf8"));
    manifest.receivingTests = ["test/index.test.mjs"];
    manifest.files = ["dist"];
    writeFileSync(path, JSON.stringify(manifest) + "\n");
  });
  try {
    const report = JSON.parse(fixture.outcome.stdout);
    assert.equal(report.outcome, "refused");
    assert.equal(report.refusal.step, 4);
    assert.deepEqual(report.refusal.evidence.surface, [{ kind: "missing-receiving-test", field: "receivingTests", target: "test/index.test.mjs" }]);
    assert.ok(report.steps.find(row => row.step === 2).evidence.testCount.pass > 0);
    assert.equal(report.steps.some(row => row.step === 5 || row.step === 6), false);
    assert.equal(JSON.parse(readFileSync(join(fixture.packageDir, "package.json"), "utf8")).version, "0.1.0");
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test("apply passes the qualified post-bump archive to npm and retains the refusal phase", async () => {
  const fixture = await runGateAgainstFixture("publish-package-build-success-fixture", ["--apply", "--bump", "patch"], false, packageDir => {
    const path = join(packageDir, "package.json"), manifest = JSON.parse(readFileSync(path, "utf8"));
    manifest.receivingTests = ["test/index.test.mjs"];
    manifest.files = ["dist", "test"];
    writeFileSync(path, JSON.stringify(manifest) + "\n");
  }, true);
  try {
    const report = JSON.parse(fixture.outcome.stdout);
    assert.equal(report.outcome, "refused");
    assert.equal(report.refusal.step, 6);
    assert.match(report.refusal.reason, /publication deliberately captured/u);
    const capture = JSON.parse(readFileSync(join(fixture.root, "publication-capture.json"), "utf8"));
    assert.equal(capture.manifest.version, "0.1.1");
    assert.equal(capture.manifest.name, "publish-package-build-success-fixture");
    assert.ok(capture.files.includes("package/test/index.test.mjs"));
    assert.equal(capture.integrity, report.state.publicationArtifact.integrity);
    assert.match(capture.artifact, /\/publication-carrier\/sha512\/[a-f0-9]{128}\.tgz$/u);
    assert.ok(capture.args.includes("--ignore-scripts"));
    assert.ok(capture.args.includes("--provenance=false"));
    assert.equal(capture.args[capture.args.indexOf("--tag") + 1], "latest");
    assert.equal(JSON.parse(readFileSync(join(fixture.packageDir, "package.json"), "utf8")).version, "0.1.1");
    assert.equal(report.steps.some(row => row.step === 7), false);
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test("a build script that exits 1 refuses build-failed and never reaches a later step", async () => {
  const { outcome, root } = await runGateAgainstFixture("publish-package-build-failure-fixture");
  try {
    assert.equal(outcome.code, 2, outcome.stderr);
    const report = JSON.parse(outcome.stdout);
    assert.equal(report.outcome, "refused");
    assert.equal(report.refusal.step, 2);
    assert.match(report.refusal.reason, /^build-failed:/);
    assert.deepEqual(report.steps.map((step) => step.name), ["registry-liveness", "fresh-install", "build"]);
    assert.equal(report.refusal.evidence.ran, true);
    assert.match(report.refusal.evidence.stderrTail, /intentional build failure/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the source-only worker uses the original build without a publisher identity or publication stages", async () => {
  const { outcome, root } = await runGateAgainstFixture("publish-package-build-success-fixture", ["--qualify-build"], true);
  try {
    assert.equal(outcome.code, undefined, outcome.stderr);
    const report = JSON.parse(outcome.stdout);
    assert.equal(report.kind, "npm.source-build-qualification");
    assert.equal(report.outcome, "source-build-qualified");
    assert.deepEqual(report.steps.map(row => row.step), [1, 2]);
    assert.equal(report.steps[1].evidence.testCount.fail, 0);
    assert.equal(report.steps[1].evidence.ran, true);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("source-only build failure stays refused and the full publication gate still requires identity", async () => {
  const failure = await runGateAgainstFixture("publish-package-build-failure-fixture", ["--qualify-build"], true);
  try {
    assert.equal(failure.outcome.code, 2);
    const report = JSON.parse(failure.outcome.stdout);
    assert.equal(report.outcome, "refused"); assert.equal(report.refusal.step, 2);
    assert.deepEqual(report.steps.map(row => row.step), [1, 2]);
  } finally { rmSync(failure.root, { recursive: true, force: true }); }
  const publication = await runGateAgainstFixture("publish-package-build-success-fixture", [], true);
  try {
    assert.equal(publication.outcome.code, 2);
    const report = JSON.parse(publication.outcome.stdout);
    assert.equal(report.refusal.step, 0); assert.match(report.refusal.reason, /ENEEDAUTH/u);
    assert.deepEqual(report.steps.map(row => row.step), [0]);
  } finally { rmSync(publication.root, { recursive: true, force: true }); }
});

test("the required source gate refuses a missing native suite instead of qualifying zero tests", async () => {
  const fixture = await runGateAgainstFixture("publish-package-build-success-fixture", ["--qualify-build"], true,
    packageDir => rmSync(join(packageDir, "test"), { recursive: true }));
  try {
    assert.equal(fixture.outcome.code, 2);
    const report = JSON.parse(fixture.outcome.stdout);
    assert.equal(report.refusal.step, 2);
    assert.match(report.refusal.reason, /executed no passing cases/u);
    assert.equal(report.refusal.evidence.tests, 0);
    assert.equal(report.refusal.evidence.pass, 0);
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test("the required source gate refuses a suite containing only skipped cases", async () => {
  const fixture = await runGateAgainstFixture("publish-package-build-success-fixture", ["--qualify-build"], true,
    packageDir => writeFileSync(join(packageDir, "test/index.test.mjs"),
      "import test from 'node:test'; test.skip('not executed', () => {});\n"));
  try {
    assert.equal(fixture.outcome.code, 2);
    const report = JSON.parse(fixture.outcome.stdout);
    assert.equal(report.refusal.step, 2);
    assert.match(report.refusal.reason, /executed no passing cases/u);
    assert.equal(report.refusal.evidence.tests, 1);
    assert.equal(report.refusal.evidence.pass, 0);
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});

test("an executed passing native case with another skipped case remains qualified", async () => {
  const fixture = await runGateAgainstFixture("publish-package-build-success-fixture", ["--qualify-build"], true,
    packageDir => writeFileSync(join(packageDir, "test/index.test.mjs"),
      "import test from 'node:test'; test('executed', () => {}); test.skip('not executed', () => {});\n"));
  try {
    assert.equal(fixture.outcome.code, undefined, fixture.outcome.stderr);
    const report = JSON.parse(fixture.outcome.stdout);
    assert.equal(report.outcome, "source-build-qualified");
    assert.deepEqual(report.steps.find(row => row.step === 2).evidence.testCount,
      { tests: 2, pass: 1, fail: 0 });
  } finally { rmSync(fixture.root, { recursive: true, force: true }); }
});


const conflictView = (name = "@fixture/provider", version = "0.4.0", origin = "https://registry.invalid") => ({
  name, versions: {}, "x-561-registry-conflicts": [{
    version, evidence: { recordSha256: "a".repeat(64), work: "https://github.com/561-group/561-group-bare-cedar-fog-services-section/issues/599" },
    identities: ["native", "canonical-r2"].map((authority, index) => ({
      authority, manifestSha256: String(index + 1).repeat(64), gitHead: String(index + 1).repeat(40),
      integrity: "sha512-" + Buffer.alloc(64, index + 1).toString("base64"),
      tarball: origin + "/" + name + "/-/" + name.split("/").pop() + "-" + version + ".tgz",
    })),
  }],
});

for(const quarantined of [false,true]) test(`ordinary CLI refuses an occupied ${quarantined?"quarantined":"published"} source declaration without authoring a version`,async()=>{
  const name="publish-package-build-success-fixture",version="0.1.0";
  const doc=quarantined?(registry=>conflictView(name,version,new URL(registry).origin)):{name,versions:{[version]:{name,version}},"dist-tags":{latest:version}};
  const fixture=await runGateAgainstFixture("publish-package-build-success-fixture",["--apply"],false,()=>{},true,doc);
  try{
    const report=JSON.parse(fixture.outcome.stdout);
    assert.equal(report.outcome,"refused");
    assert.equal(report.refusal.step,3);
    assert.match(report.refusal.reason,/already published; --bump is required/);
    assert.equal(JSON.parse(readFileSync(join(fixture.packageDir,"package.json"),"utf8")).version,version);
    assert.equal(report.steps.some(step=>[5,6,7,9].includes(step.step)),false);
    assert.equal((await import("node:fs")).existsSync(join(fixture.root,"publication-capture.json")),false);
  }finally{rmSync(fixture.root,{recursive:true,force:true});}
});
