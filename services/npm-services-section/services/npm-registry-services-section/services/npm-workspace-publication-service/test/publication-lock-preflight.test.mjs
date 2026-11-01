import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const SERVICE = dirname(dirname(fileURLToPath(import.meta.url)));

test("publication preflight reports every stale direct lock assertion as JSON evidence", () => {
  const root = mkdtempSync(join(tmpdir(), "npm-publication-lock-preflight-"));
  const registryStorage = join(root, "registry-storage");
  const packageRoot = join(root, "consumer");
  try {
    mkdirSync(registryStorage);
    mkdirSync(packageRoot);
    writeFileSync(join(packageRoot, "index.mjs"), "export default true;\n");
    writeFileSync(join(packageRoot, "package.json"), `${JSON.stringify({
      name: "@example/consumer",
      version: "0.1.0",
      type: "module",
      exports: "./index.mjs",
      dependencies: { "@example/provider": "0.2.0" },
      devDependencies: { "@example/tool": "0.3.0" },
    }, null, 2)}\n`);
    writeFileSync(join(packageRoot, "package-lock.json"), `${JSON.stringify({
      name: "@example/consumer",
      version: "0.1.0",
      lockfileVersion: 3,
      packages: {
        "": { name: "@example/consumer", version: "0.1.0", dependencies: { "@example/provider": "0.2.0" }, devDependencies: { "@example/tool": "0.3.0" } },
        "node_modules/@example/provider": { version: "0.1.9" },
      },
    }, null, 2)}\n`);

    const result = spawnSync(process.execPath, [
      join(SERVICE, "scripts/publish-workspace-tiers.mjs"),
      "--root", packageRoot,
      "--registry-storage", registryStorage,
      "--preflight",
    ], { encoding: "utf8" });
    assert.equal(result.status, 1, result.stderr);
    const receipt = JSON.parse(result.stdout);
    assert.equal(receipt.outcome, "global-preflight-refused");
    assert.equal(receipt.failures.length, 1);
    assert.equal(receipt.failures[0].phase, "manifest");
    assert.deepEqual(receipt.failures[0].evidence.violations.map(({ name, manifestSpecification, resolvedVersion }) => ({ name, manifestSpecification, resolvedVersion })), [
      { name: "@example/provider", manifestSpecification: "0.2.0", resolvedVersion: "0.1.9" },
      { name: "@example/tool", manifestSpecification: "0.3.0", resolvedVersion: undefined },
    ]);
    assert.match(result.stderr, /manifest preflight: 0 passed, 1 refused, 0 unchecked/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("an occupied immutable package does not inherit stale current-worktree lock assertions", () => {
  const root = mkdtempSync(join(tmpdir(), "npm-publication-occupied-lock-"));
  const registryStorage = join(root, "registry-storage"), packageRoot = join(root, "occupied");
  try {
    mkdirSync(join(registryStorage, "@example", "occupied"), { recursive: true });
    mkdirSync(packageRoot);
    writeFileSync(join(packageRoot, "index.mjs"), "export default true;\n");
    writeFileSync(join(packageRoot, "package.json"), `${JSON.stringify({ name: "@example/occupied", version: "0.2.0", type: "module", exports: "./index.mjs", dependencies: { "@example/provider": "0.2.0" } }, null, 2)}\n`);
    writeFileSync(join(packageRoot, "package-lock.json"), `${JSON.stringify({ name: "@example/occupied", version: "0.1.0", lockfileVersion: 3, packages: { "": { name: "@example/occupied", version: "0.1.0", dependencies: { "@example/provider": "0.1.0" } }, "node_modules/@example/provider": { version: "0.1.0" } } }, null, 2)}\n`);
    writeFileSync(join(registryStorage, "@example", "occupied", "package.json"), JSON.stringify({ name: "@example/occupied", versions: { "0.2.0": {} } }));
    const result = spawnSync(process.execPath, [join(SERVICE, "scripts/publish-workspace-tiers.mjs"), "--root", packageRoot, "--registry-storage", registryStorage, "--preflight"], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).outcome, "global-preflight-passed");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("global publication preflight no longer refuses a stable carrier for an exact prerelease pin, and still refuses a range", () => {
  const root = mkdtempSync(join(tmpdir(), "npm-publication-stable-prerelease-"));
  const registryStorage = join(root, "registry-storage"), packageRoot = join(root, "consumer");
  const preflight = (specification) => {
    writeFileSync(join(packageRoot, "package.json"), `${JSON.stringify({ name: "@example/stable", version: "0.1.0", type: "module", exports: "./index.mjs", dependencies: { "@example/development": specification } }, null, 2)}\n`);
    const result = spawnSync(process.execPath, [join(SERVICE, "scripts/publish-workspace-tiers.mjs"), "--root", packageRoot, "--registry-storage", registryStorage, "--preflight"], { encoding: "utf8" });
    assert.equal(result.status, 1, result.stderr);
    return JSON.parse(result.stdout).failures[0];
  };
  try {
    mkdirSync(registryStorage); mkdirSync(packageRoot);
    writeFileSync(join(packageRoot, "index.mjs"), "export default true;\n");
    // The exact prerelease passes the dependency contract; this carrier stops later, at the supplier the registry lacks.
    const exact = preflight("0.2.0-dev.0");
    assert.equal(exact.phase, "manifest");
    assert.equal(exact.evidence, undefined, "no dependency contract violation");
    assert.match(exact.reason, /dependency is absent from registry and publication set: @example\/development@0\.2\.0-dev\.0/u);
    assert.equal(preflight("^0.2.0-dev.0").evidence.violations[0].reason, "dependency specification must be one exact registry semver");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("execute refuses its selected lifecycle before any registry write and ignores neighbors", () => {
  const root = mkdtempSync(join(tmpdir(), "npm-publication-lifecycle-preflight-"));
  const registryStorage = join(root, "registry-storage");
  const bin = join(root, "bin");
  const publicationLog = join(root, "publication.log");
  try {
    mkdirSync(registryStorage);
    mkdirSync(bin);
    for (const [name, failing] of [["@example/first", false], ["@example/refusing", true]]) {
      const packageRoot = join(root, name.split("/").at(-1));
      mkdirSync(packageRoot);
      writeFileSync(join(packageRoot, "index.mjs"), "export default true;\n");
      writeFileSync(join(packageRoot, "package.json"), `${JSON.stringify({
        name,
        version: "0.1.0",
        type: "module",
        exports: "./index.mjs",
        scripts: { test: failing ? "exit-refusal" : "pass" },
      }, null, 2)}\n`);
    }
    const npm = join(bin, "npm");
    writeFileSync(npm, `#!/usr/bin/env node
const { execFileSync } = require("node:child_process");
const { appendFileSync, readFileSync } = require("node:fs");
const { join } = require("node:path");
const args = process.argv.slice(2);
if (args[0] === "pack" && args.includes("--json")) process.stdout.write(JSON.stringify([{ files: [{ path: "index.mjs" }, { path: "package.json" }] }]));
else if (args[0] === "pack") { const destination = args[args.indexOf("--pack-destination") + 1], file = "fixture.tgz"; execFileSync("tar", ["-czf", join(destination, file), "--transform", "s|^|package/|", "-C", process.cwd(), "."]); process.stdout.write(file + "\\n"); }
else if (args[0] === "install") process.exit(0);
else if (args[0] === "run" && args[1] === "test") process.exit(JSON.parse(readFileSync("package.json", "utf8")).scripts.test === "exit-refusal" ? 37 : 0);
else if (args[0] === "publish") appendFileSync(process.env.PUBLICATION_LOG, process.cwd() + "\\n");
else process.exit(64);
`);
    chmodSync(npm, 0o755);

    const result = spawnSync(process.execPath, [
      join(SERVICE, "scripts/publish-workspace-tiers.mjs"),
      "--root", join(root, "refusing"),
      "--registry-storage", registryStorage,
      "--execute",
      "--verify",
    ], {
      encoding: "utf8",
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, PUBLICATION_LOG: publicationLog },
    });
    assert.equal(result.status, 1, result.stderr);
    const receipt = JSON.parse(result.stdout);
    assert.equal(receipt.outcome, "global-preflight-refused");
    assert.deepEqual(receipt.failures.map(({ name, phase }) => ({ name, phase })), [
      { name: "@example/refusing", phase: "lifecycle" },
    ], JSON.stringify(receipt));
    assert.doesNotMatch(result.stderr, /@example\/first@0\.1\.0/u);
    assert.match(result.stderr, /@example\/refusing@0\.1\.0: lifecycle-preflight-refused/u);
    assert.throws(() => readFileSync(publicationLog), { code: "ENOENT" });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("preflight refuses an absent registry dependency despite a neighboring pending carrier", () => {
  const root = mkdtempSync(join(tmpdir(), "npm-publication-pending-carrier-"));
  const registryStorage = join(root, "registry-storage");
  try {
    mkdirSync(registryStorage);
    const leaf = join(root, "leaf"), consumer = join(root, "consumer");
    mkdirSync(leaf); mkdirSync(consumer);
    writeFileSync(join(leaf, "index.mjs"), "export const value = 42;\n");
    writeFileSync(join(leaf, "package.json"), `${JSON.stringify({ name: "@example/leaf", version: "0.1.0", type: "module", exports: "./index.mjs", scripts: { test: "node --test" } }, null, 2)}\n`);
    writeFileSync(join(consumer, "consumer.test.mjs"), "import assert from 'node:assert/strict'; import test from 'node:test'; import { value } from '@example/leaf'; test('uses packed pending leaf', () => assert.equal(value, 42));\n");
    writeFileSync(join(consumer, "index.mjs"), "export default true;\n");
    writeFileSync(join(consumer, "package.json"), `${JSON.stringify({ name: "@example/consumer", version: "0.1.0", type: "module", exports: "./index.mjs", scripts: { test: "node --test" }, devDependencies: { "@example/leaf": "0.1.0" } }, null, 2)}\n`);

    const result = spawnSync(process.execPath, [
      join(SERVICE, "scripts/publish-workspace-tiers.mjs"),
      "--root", consumer,
      "--registry", "http://127.0.0.1:9/",
      "--registry-storage", registryStorage,
      "--preflight",
    ], { encoding: "utf8", timeout: 30_000 });
    assert.equal(result.status, 1, result.stderr);
    assert.equal(JSON.parse(result.stdout).outcome, "global-preflight-refused");
    assert.match(JSON.parse(result.stdout).failures[0].reason, /dependency is absent from registry and publication set: @example\/leaf@0\.1\.0/u);
    assert.doesNotMatch(result.stderr, /lifecycle-preflight-passed/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a neighboring pending carrier cannot waive a stale nested lock closure", () => {
  const root = mkdtempSync(join(tmpdir(), "npm-publication-pending-lock-closure-"));
  const registryStorage = join(root, "registry-storage");
  try {
    mkdirSync(registryStorage);
    const leaf = join(root, "leaf"), consumer = join(root, "consumer");
    mkdirSync(leaf); mkdirSync(consumer);
    writeFileSync(join(leaf, "index.mjs"), "export const value = 42;\n");
    writeFileSync(join(leaf, "package.json"), `${JSON.stringify({ name: "@example/leaf", version: "0.1.0", type: "module", exports: "./index.mjs", scripts: { test: "node --test" } }, null, 2)}\n`);
    writeFileSync(join(consumer, "consumer.test.mjs"), "import assert from 'node:assert/strict'; import test from 'node:test'; import { value } from '@example/leaf'; test('uses replacement leaf', () => assert.equal(value, 42));\n");
    writeFileSync(join(consumer, "index.mjs"), "export default true;\n");
    writeFileSync(join(consumer, "package.json"), `${JSON.stringify({ name: "@example/consumer", version: "0.1.0", type: "module", exports: "./index.mjs", scripts: { test: "node --test" }, dependencies: { "@example/leaf": "0.1.0" } }, null, 2)}\n`);
    // This is an old installed leaf.  The pending leaf's verified tarball has
    // no such transitive edge; the isolated lifecycle must be the authority.
    writeFileSync(join(consumer, "package-lock.json"), `${JSON.stringify({
      name: "@example/consumer", version: "0.1.0", lockfileVersion: 3,
      packages: {
        "": { name: "@example/consumer", version: "0.1.0", dependencies: { "@example/leaf": "0.1.0" } },
        "node_modules/@example/leaf": { version: "0.1.0", dependencies: { "@example/old-transitive": "0.2.0" } },
        "node_modules/@example/leaf/node_modules/@example/old-transitive": { version: "0.1.9" },
      },
    }, null, 2)}\n`);

    const result = spawnSync(process.execPath, [
      join(SERVICE, "scripts/publish-workspace-tiers.mjs"),
      "--root", consumer,
      "--registry", "http://127.0.0.1:9/",
      "--registry-storage", registryStorage,
      "--preflight",
    ], { encoding: "utf8", timeout: 45_000 });
    assert.equal(result.status, 1, result.stderr);
    assert.equal(JSON.parse(result.stdout).outcome, "global-preflight-refused");
    assert.ok(JSON.parse(result.stdout).failures[0].evidence.violations.some(item => item.name === "@example/old-transitive"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a neighboring transitive source closure cannot replace an absent registry supplier", () => {
  const root = mkdtempSync(join(tmpdir(), "npm-publication-transitive-carrier-"));
  const registryStorage = join(root, "registry-storage");
  try {
    mkdirSync(registryStorage);
    const leaf = join(root, "leaf"), middle = join(root, "middle"), consumer = join(root, "consumer");
    mkdirSync(leaf); mkdirSync(middle); mkdirSync(consumer);
    writeFileSync(join(leaf, "index.mjs"), "export const value = 42;\n");
    writeFileSync(join(leaf, "package.json"), `${JSON.stringify({ name: "@example/leaf", version: "0.1.0", type: "module", exports: "./index.mjs", scripts: { test: "node --test" } }, null, 2)}\n`);
    writeFileSync(join(middle, "index.mjs"), "export { value } from '@example/leaf';\n");
    writeFileSync(join(middle, "package.json"), `${JSON.stringify({ name: "@example/middle", version: "0.1.0", type: "module", exports: "./index.mjs", scripts: { test: "node --test" }, dependencies: { "@example/leaf": "0.1.0" } }, null, 2)}\n`);
    writeFileSync(join(consumer, "consumer.test.mjs"), "import assert from 'node:assert/strict'; import test from 'node:test'; import { value } from '@example/middle'; test('uses transitive retained leaf', () => assert.equal(value, 42));\n");
    writeFileSync(join(consumer, "index.mjs"), "export default true;\n");
    writeFileSync(join(consumer, "package.json"), `${JSON.stringify({ name: "@example/consumer", version: "0.1.0", type: "module", exports: "./index.mjs", scripts: { test: "node --test" }, dependencies: { "@example/middle": "0.1.0" } }, null, 2)}\n`);

    const result = spawnSync(process.execPath, [
      join(SERVICE, "scripts/publish-workspace-tiers.mjs"),
      "--root", consumer,
      "--registry", "http://127.0.0.1:9/",
      "--registry-storage", registryStorage,
      "--preflight",
    ], { encoding: "utf8", timeout: 45_000 });
    assert.equal(result.status, 1, result.stderr);
    assert.equal(JSON.parse(result.stdout).outcome, "global-preflight-refused");
    assert.match(JSON.parse(result.stdout).failures[0].reason, /dependency is absent from registry and publication set: @example\/middle@0\.1\.0/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
