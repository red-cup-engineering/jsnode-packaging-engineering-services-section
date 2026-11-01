import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync, symlinkSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

// The package's ordinary test command has no experimental global flags.
// Give only the actual native audit its documented parent-resolution mode.
const auditModule = new URL("../src/installed-carrier-bindings.mjs", import.meta.url).href;
function auditInstalledCarrierBindings(options) {
  const source = `import { auditInstalledCarrierBindings } from ${JSON.stringify(auditModule)}; console.log(JSON.stringify(auditInstalledCarrierBindings(JSON.parse(process.argv[1]))));`;
  return JSON.parse(execFileSync(process.execPath, ["--experimental-import-meta-resolve", "--input-type=module", "-e", source, JSON.stringify(options)],
    { encoding: "utf8", timeout: 5000, maxBuffer: 8 * 1024 * 1024 }));
}

// Own the native resolver fixtures; no installer, module evaluation or network.
const fixtureParent = process.env.TMPDIR ?? fileURLToPath(new URL("../data/logs/test-logs/installed-carrier-bindings/", import.meta.url));
function write(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, typeof value === "string" ? value : JSON.stringify(value));
}
function link(target, path) { mkdirSync(dirname(path), { recursive: true }); symlinkSync(target, path, "dir"); }
function fixture(run) {
  mkdirSync(fixtureParent, { recursive: true });
  const root = mkdtempSync(join(fixtureParent, "installed-peer-"));
  write(join(root, "package.json"), { name: "@red-cup-engineering/resolver-fixture", version: "0.0.0", type: "module" });
  try { run(root); } finally { rmSync(root, { recursive: true, force: true }); }
}
function supplier(root, version, text = "export const value = 1;\n") {
  const dir = join(root, "node_modules", ".pnpm", `peer@${version}`, "node_modules", "@red-cup-engineering", "peer");
  write(join(dir, "package.json"), { name: "@red-cup-engineering/peer", version, type: "module", exports: "./index.mjs" });
  write(join(dir, "index.mjs"), text);
  return dir;
}
function consumer(root, name, peer, expected, declaration = "peerDependencies") {
  const dir = join(root, "node_modules", ".pnpm", `${name}@1.0.0`, "node_modules", "@red-cup-engineering", name);
  write(join(dir, "package.json"), { name: `@red-cup-engineering/${name}`, version: "1.0.0", type: "module", exports: "./index.mjs",
    ...(expected === undefined ? {} : { [declaration]: { "@red-cup-engineering/peer": expected } }) });
  write(join(dir, "index.mjs"), 'import { value } from "@red-cup-engineering/peer";\nexport { value };\nthrow new Error("an observer must never execute a carrier");\n');
  link(peer, join(dirname(dir), "peer"));
  link(dir, join(root, "node_modules", "@red-cup-engineering", name));
  return dir;
}
function observe(root, names) {
  write(join(root, "entry.mjs"), names.map(name => `import "@red-cup-engineering/${name}";`).join("\n"));
  return auditInstalledCarrierBindings({ root, entrypoints: ["entry.mjs"], maxModules: 16, maxFileBytes: 8192 });
}

test("exact peer version is received at the native resolved module edge without executing it", () => fixture(root => {
  consumer(root, "consumer", supplier(root, "1.0.0"), "1.0.0");
  const result = observe(root, ["consumer"]);
  assert.equal(result.complete, true);
  assert.equal(result.ready, true);
  assert.deepEqual(result.findings, []);
  assert.ok(result.modules.some(row => row.name === "@red-cup-engineering/peer" && row.version === "1.0.0"));
}));

test("an export-compatible wrong exact peer is a binding failure", () => fixture(root => {
  consumer(root, "consumer", supplier(root, "2.0.0"), "1.0.0");
  const result = observe(root, ["consumer"]);
  assert.equal(result.complete, true);
  assert.equal(result.ready, false);
  const mismatch = result.findings.filter(row => row.kind === "installed-exact-peer-version-mismatch");
  assert.equal(mismatch.length, 1, "multiple reads of the same edge do not duplicate findings");
  assert.equal(mismatch[0].consumer, "@red-cup-engineering/consumer");
  assert.equal(mismatch[0].provider, "@red-cup-engineering/peer");
  assert.equal(mismatch[0].expected, "1.0.0");
  assert.equal(mismatch[0].installed, "2.0.0");
}));

test("two PNPM-like provider slots are judged at each consumer rather than a root version list", () => fixture(root => {
  const first = supplier(root, "1.0.0"), second = supplier(root, "2.0.0");
  consumer(root, "first", first, "1.0.0");
  consumer(root, "second", second, "2.0.0");
  link(supplier(root, "3.0.0"), join(root, "node_modules", "@red-cup-engineering", "peer"));
  const result = observe(root, ["first", "second"]);
  assert.equal(result.ready, true);
  assert.deepEqual(result.modules.filter(row => row.name === "@red-cup-engineering/peer").map(row => row.version).sort(), ["1.0.0", "2.0.0"]);
}));

test("range peer declarations stay outside this exact-version check", () => fixture(root => {
  consumer(root, "consumer", supplier(root, "2.0.0"), "^1.0.0");
  const result = observe(root, ["consumer"]);
  assert.equal(result.complete, true);
  assert.ok(!result.findings.some(row => row.kind === "installed-exact-peer-version-mismatch"));
  // This is not a claim that 2.0.0 satisfies ^1.0.0 or a registry peer closure.
}));

test("a consumer without a peer declaration does not acquire one from the observer", () => fixture(root => {
  consumer(root, "consumer", supplier(root, "2.0.0"));
  const result = observe(root, ["consumer"]);
  assert.equal(result.ready, true);
  assert.deepEqual(result.findings, []);
}));

test("a matching exact peer still refuses the original missing export binding", () => fixture(root => {
  consumer(root, "consumer", supplier(root, "1.0.0", "export const different = 1;\n"), "1.0.0");
  const result = observe(root, ["consumer"]);
  assert.equal(result.complete, true);
  assert.equal(result.ready, false);
  assert.ok(result.findings.some(row => row.kind === "missing-export-binding" && row.name === "value"));
  assert.ok(!result.findings.some(row => row.kind === "installed-exact-peer-version-mismatch"));
}));

 
// Regression for npm-workspace-publication-service #41: the live Group
// composition declared the adapter in "dependencies", NOT "peerDependencies".
// A peer-only guard passes the exact real-world failure through as ready.
test("an ordinary exact dependency refuses a different installed provider version", () => fixture(root => {
  consumer(root, "group-operations", supplier(root, "0.1.8"), "0.1.7", "dependencies");
  const result = observe(root, ["group-operations"]);
  assert.equal(result.complete, true);
  assert.equal(result.ready, false);
  const mismatch = result.findings.filter(row => row.kind === "installed-exact-dependency-version-mismatch");
  assert.equal(mismatch.length, 1);
  assert.equal(mismatch[0].consumer, "@red-cup-engineering/group-operations");
  assert.equal(mismatch[0].provider, "@red-cup-engineering/peer");
  assert.equal(mismatch[0].declaration, "dependencies");
  assert.equal(mismatch[0].expected, "0.1.7");
  assert.equal(mismatch[0].installed, "0.1.8");
}));

test("correct exact dependency remains acceptable independently of a different root copy", () => fixture(root => {
  consumer(root, "group-operations", supplier(root, "0.1.7"), "0.1.7", "dependencies");
  link(supplier(root, "0.1.8"), join(root, "node_modules", "@red-cup-engineering", "peer"));
  const result = observe(root, ["group-operations"]);
  assert.equal(result.complete, true);
  assert.equal(result.ready, true);
  assert.deepEqual(result.findings, []);
}));

test("optional and development dependency edges also honor their exact installed contract", () => {
  for (const declaration of ["optionalDependencies", "devDependencies"]) fixture(root => {
    consumer(root, "consumer", supplier(root, "0.1.8"), "0.1.7", declaration);
    const result = observe(root, ["consumer"]);
    assert.equal(result.complete, true);
    assert.equal(result.ready, false);
    const mismatch = result.findings.filter(row => row.kind === "installed-exact-dependency-version-mismatch");
    assert.equal(mismatch.length, 1);
    assert.equal(mismatch[0].declaration, declaration);
  });
});

test("a non-exact ordinary dependency does not claim an invented exact-version proof", () => fixture(root => {
  consumer(root, "consumer", supplier(root, "0.1.8"), "^0.1.7", "dependencies");
  const result = observe(root, ["consumer"]);
  assert.equal(result.complete, true);
  assert.equal(result.ready, true);
  assert.ok(!result.findings.some(row => row.kind === "installed-exact-dependency-version-mismatch"));
}));


function nestedScope(directory, type = "module", metadata = { type }) {
  const original = 'import { value } from "@red-cup-engineering/peer"; export { value };';
  write(join(directory, "index.mjs"), "export * from './dist/index.js';");
  write(join(directory, "dist/package.json"), metadata);
  write(join(directory, "dist/index.js"), original);
}
test("owned type-only importer scopes cannot hide a wrong exact dependency", () => fixture(root => {
  const directory = consumer(root, "consumer", supplier(root, "2.0.0"), "1.0.0", "dependencies");
  nestedScope(directory);
  const result = observe(root, ["consumer"]);
  assert.equal(result.ready, false); assert.equal(result.complete, true);
  assert.ok(result.findings.some(row => row.kind === "installed-exact-dependency-version-mismatch" && row.installed === "2.0.0"));
}));
test("correct owned provider subpaths beneath type-only scopes stay inspectable", () => fixture(root => {
  const provider = supplier(root, "1.0.0");
  write(join(provider, "package.json"), { name: "@red-cup-engineering/peer", version: "1.0.0", exports: { ".": "./dist/index.js", "./part": "./dist/index.js" } });
  write(join(provider, "dist/package.json"), { type: "module" });
  write(join(provider, "dist/index.js"), "export const value = 1;");
  consumer(root, "consumer", provider, "1.0.0");
  const result = observe(root, ["consumer"]);
  assert.equal(result.ready, true); assert.deepEqual(result.findings, []);
  assert.ok(result.modules.some(row => row.file.endsWith("peer/dist/index.js")));
  assert.equal(result.boundaries.some(row => row.kind === "external-supplier"), false);
}));
test("nested CommonJS stays opaque while nested ESM remains statically parsed", () => fixture(root => {
  const directory = consumer(root, "consumer", supplier(root, "1.0.0"), "1.0.0");
  nestedScope(directory, "commonjs");
  write(join(directory, "dist/index.js"), "module.exports = require('./uninspected.cjs');");
  const result = observe(root, ["consumer"]);
  assert.equal(result.ready, true);
  assert.ok(result.boundaries.some(row => row.kind === "non-esm-provider" && row.file.endsWith("dist/index.js")));
}));
test("ambiguous nested declaration scope is incomplete, not an empty ready audit", () => fixture(root => {
  const directory = consumer(root, "consumer", supplier(root, "1.0.0"), "1.0.0");
  nestedScope(directory, "module", { type: "module", private: true });
  const result = observe(root, ["consumer"]);
  assert.equal(result.ready, false); assert.equal(result.complete, false);
  assert.ok(result.findings.some(row => row.kind === "unresolved-module" && /ownership is unreceived/.test(row.message)));
}));
test("public supplier boundaries do not acquire owned exact-pin coverage", () => fixture(root => {
  const directory = join(root, "node_modules/public-package");
  write(join(root, "package.json"), { name: "@red-cup-engineering/root", type: "module", dependencies: { "public-package": "1.0.0" } });
  write(join(directory, "package.json"), { name: "public-package", version: "2.0.0", exports: "./index.mjs" });
  write(join(directory, "index.mjs"), "import './not-scanned.mjs';");
  write(join(root, "entry.mjs"), "import 'public-package';");
  const result = auditInstalledCarrierBindings({ root, entrypoints: ["entry.mjs"] });
  assert.equal(result.ready, true); assert.deepEqual(result.findings, []);
  assert.deepEqual(result.boundaries, [{ importer: "entry.mjs", specifier: "public-package", kind: "external-supplier", supplier: "public-package", version: "2.0.0" }]);
}));


test("ownership admission makes missing provider manifests incomplete", () => fixture(root => {
 write(join(root, "node_modules/@red-cup-engineering/peer/index.mjs"), "export const value = 1;");
 write(join(root, "entry.mjs"), "import '@red-cup-engineering/peer/index.mjs';");
 const result = auditInstalledCarrierBindings({ root, entrypoints: ["entry.mjs"] });
 assert.equal(result.ready, false); assert.equal(result.complete, false);
}));
test("ownership admission refuses ambiguous directly selected leaves", () => fixture(root => {
 write(join(root, "nested/package.json"), { type: "module", private: true });
 write(join(root, "nested/entry.mjs"), "export const value = 1;");
 const result = auditInstalledCarrierBindings({ root, entrypoints: ["nested/entry.mjs"] });
 assert.equal(result.ready, false); assert.equal(result.complete, false);
}));


test("public relative boundaries remain opaque even beneath ambiguous nested metadata", () => fixture(root => {
 const path = "./node_modules/public-package/dist/index.mjs";
 write(join(root, "node_modules/public-package/package.json"), { name: "public-package", version: "2.0.0" });
 write(join(root, "node_modules/public-package/dist/package.json"), { type: "module", private: true });
 write(join(root, "node_modules/public-package/dist/index.mjs"), "import './not-scanned.mjs';");
 write(join(root, "entry.mjs"), `import ${JSON.stringify(path)};`);
 const result = auditInstalledCarrierBindings({ root, entrypoints: ["entry.mjs"] });
 assert.equal(result.ready, true); assert.deepEqual(result.findings, []);
 assert.deepEqual(result.boundaries, [{ importer: "entry.mjs", specifier: path, kind: "external-supplier" }]);
}));
test("distinct nested declaration scopes keep their own exact contract in the audit", () => {
 for (const expected of ["1.0.0", "2.0.0"]) fixture(root => {
  const peer = supplier(root, "1.0.0");
  link(peer, join(root, "node_modules/@red-cup-engineering/peer"));
  write(join(root, "package.json"), { name: "@red-cup-engineering/root", type: "module", dependencies: { "@red-cup-engineering/peer": "9.0.0" } });
  write(join(root, "embedded/package.json"), { name: "@red-cup-engineering/embedded", version: "1.0.0", type: "module", exports: "./index.mjs", dependencies: { "@red-cup-engineering/peer": expected } });
  write(join(root, "embedded/index.mjs"), "import { value } from '@red-cup-engineering/peer'; export { value };");
  write(join(root, "entry.mjs"), "import './embedded/index.mjs';");
  const result = auditInstalledCarrierBindings({ root, entrypoints: ["entry.mjs"] });
  if (expected === "1.0.0") { assert.equal(result.ready, true); assert.deepEqual(result.findings, []); }
  else { assert.equal(result.ready, false); assert.equal(result.findings.length, 1); assert.equal(result.findings[0].consumer, "@red-cup-engineering/embedded"); assert.equal(result.findings[0].expected, "2.0.0"); }
 });
});
