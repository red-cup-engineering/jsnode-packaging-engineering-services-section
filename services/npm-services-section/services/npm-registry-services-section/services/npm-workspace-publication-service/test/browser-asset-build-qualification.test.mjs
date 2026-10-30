import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { sourcePublicationBuildRecipe, qualifySourcePublicationBuild, receiveQualifiedPublicationBuildProducts } from "../src/source-build-qualification.mjs";
import { receiveInstalledBrowserAssetTreeProvider } from "../src/browser-asset-build-recipe.mjs";

const sha256 = text => createHash("sha256").update(text).digest("hex");
const provider = "@red-cup-engineering/project-browser-asset-tree-service";
const manifest = { name: "browser-receiving-fixture", version: "0.1.0", type: "module",
  dependencies: { [provider]: "0.4.2" }, files: ["src", "web", "dist"],
  scripts: { build: "node scripts/build-browser-assets.mjs", prepack: "npm run build", test: 'node --test "src/tests/**/*.test.mjs"' } };
const integrity = "sha512-" + createHash("sha512").update("component fixture only").digest("base64");
const nativeLock = `lockfileVersion: '9.0'
settings:
  autoInstallPeers: true
  excludeLinksFromLockfile: false
importers:
  .:
    dependencies:
      '${provider}':
        specifier: 0.4.2
        version: 0.4.2
packages:
  '${provider}@0.4.2':
    resolution: {integrity: ${integrity}}
snapshots:
  '${provider}@0.4.2': {}
`;
const adapter = assets => `import { fileURLToPath } from "node:url";
import { buildCloudflareStaticAssetTree } from "@red-cup-engineering/project-browser-asset-tree-service";
const ROOT = fileURLToPath(new URL("../", import.meta.url));
export async function buildAssets() {
  return buildCloudflareStaticAssetTree({ rootDirectory: ROOT, assets: ${JSON.stringify(assets)} });
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await buildAssets();
`;

// These synthetic reports exercise the public source/product receiving contract.
// They do not claim a native installation, producer run, or registry release.
async function fixture(changes = {}) {
  const root = await mkdtemp(join(tmpdir(), "browser-publication-contract-")), directory = join(root, "package");
  const assets = ["world/level.json"], files = {
    "package.json": JSON.stringify(manifest),
    "pnpm-lock.yaml": nativeLock, ".npmrc": "registry=https://registry.561.group/\n",
    "scripts/build-browser-assets.mjs": adapter(assets),
    "src/tests/play.test.mjs": "import test from 'node:test'; test('play', () => {});\n",
    "web/index.html": '<!doctype html><script type="module" src="./main.mjs"></script>\n',
    "web/main.mjs": "export const play = true;\n", "world/level.json": '{"rooms":3}\n', ...changes };
  const entries = [];
  for (const [path, text] of Object.entries(files)) {
    if (text === null) continue;
    const file = join(directory, path);
    await mkdir(dirname(file), { recursive: true }); await writeFile(file, text, { mode: 0o644 });
    entries.push({ path, bytes: Buffer.from(text), mode: "100644" });
  }
  const browserAssetTree = { kind: "npm.browser-asset-tree-build", entrypoint: "scripts/build-browser-assets.mjs", provider,
    providerVersion: "0.4.2", output: "dist", assets, adapterSHA256: sha256(files["scripts/build-browser-assets.mjs"]),
    lockSHA256: sha256(files["pnpm-lock.yaml"] ?? ""), lockRouting: { kind: "pnpm.native-integrity-resolution-form", integrityResolutions: 1 },
    workspacePolicySHA256: files["pnpm-workspace.yaml"] ? sha256(files["pnpm-workspace.yaml"]) : null };
  return { directory, entries, scratch: root, manifest: JSON.parse(files["package.json"]), registry: "https://registry.561.group/", browserAssetTree,
    cleanup: () => rm(root, { recursive: true, force: true }) };
}
const report = f => ({ package: f.manifest.name, kind: "npm.source-build-qualification", outcome: "source-build-qualified",
  state: { sourceVersion: f.manifest.version }, steps: [
    { step: 1, ok: true, evidence: { packageManager: "pnpm", installMode: "verify" } },
    { step: 2, ok: true, evidence: { browserAssetTree: f.browserAssetTree,
      installedBrowserProvider: { name: provider, version: "0.4.2", manifestSHA256: "a".repeat(64), entrypointSHA256: "b".repeat(64) },
      testCount: { tests: 1, pass: 1, fail: 0 } } } ] });
async function produce(f) {
  await mkdir(join(f.directory, "dist/web"), { recursive: true });
  await mkdir(join(f.directory, "dist/world"), { recursive: true });
  await writeFile(join(f.directory, "dist/web/index.html"), '<!doctype html><script type="module" src="/web/main.mjs"></script>\n');
  await writeFile(join(f.directory, "dist/web/main.mjs"), "export const play = true;\n");
  await writeFile(join(f.directory, "dist/world/level.json"), '{"rooms":3}\n');
  return report(f);
}

test("the existing exact browser provider and literal entrypoint select a PNPM recipe", () => {
  assert.equal(sourcePublicationBuildRecipe(manifest).browserAssetTree.providerVersion, "0.4.2");
  assert.equal(sourcePublicationBuildRecipe({ ...manifest, scripts: { ...manifest.scripts, build: "node scripts/other.mjs" } }), null);
  for (const changed of [
    { dependencies: { [provider]: "0.4.1" } }, { dependencies: { [provider]: "^0.4.2" } },
    { packageManager: "npm@11.0.0" }, { files: ["src"] }, { pnpm: { overrides: { [provider]: "0.4.1" } } },
    { scripts: { ...manifest.scripts, prepack: "node other.mjs" } },
    { scripts: { ...manifest.scripts, test: "npm run build && node --test src/*.test.mjs" } },
  ]) assert.throws(() => sourcePublicationBuildRecipe({ ...manifest, ...changed }));
});

test("balanced quotes preserve native glob identity without admitting shell syntax", () => {
  for (const target of ['"src/tests/**/*.test.mjs"', "'src/tests/**/*.test.mjs'", "src/tests/**/*.test.mjs"])
    assert.ok(sourcePublicationBuildRecipe({ ...manifest, scripts: { ...manifest.scripts, test: "node --test " + target } }));
  for (const target of ['"src/tests/**/*.test.mjs', "'src/tests/**/*.test.mjs\"", '"../*.test.mjs"', '"src/$(id).test.mjs"', '"src/*.test.mjs";true'])
    assert.throws(() => sourcePublicationBuildRecipe({ ...manifest, scripts: { ...manifest.scripts, test: "node --test " + target } }), /confined/u);
});

test("complete browser products retain original frozen source and in-process packing custody", async () => {
  const f = await fixture({ "pnpm-workspace.yaml": "minimumReleaseAgeExclude:\n  - '@red-cup-engineering/abrash@0.2.0'\n" });
  try {
    const qualification = await qualifySourcePublicationBuild({ ...f, codeGate: () => produce(f) });
    assert.equal(qualification.apply, false);
    assert.deepEqual(qualification.testTargets, [{ pattern: "src/tests/**/*.test.mjs", files: ["src/tests/play.test.mjs"] }]);
    assert.equal(qualification.browserAssetTree.lockSHA256, sha256(await readFile(join(f.directory, "pnpm-lock.yaml"))));
    const products = await receiveQualifiedPublicationBuildProducts(qualification, { directory: f.directory });
    assert.deepEqual(products.map(row => row.path).sort(), ["dist/web/index.html", "dist/web/main.mjs", "dist/world/level.json"]);
    await assert.rejects(receiveQualifiedPublicationBuildProducts(structuredClone(qualification), { directory: f.directory }), /original in-process/u);
    await writeFile(join(f.directory, "dist/web/main.mjs"), "changed after receiving\n");
    await assert.rejects(receiveQualifiedPublicationBuildProducts(qualification, { directory: f.directory }), /changed/u);
  } finally { await f.cleanup(); }
});

test("unsupported adapters, policy, absent assets and existing products refuse before the worker", async () => {
  for (const changes of [
    { "scripts/build-browser-assets.mjs": adapter([]) + "await import('./unreviewed.mjs');\n" },
    { "scripts/build-browser-assets.mjs": adapter(["../foreign"]) },
    { "scripts/build-browser-assets.mjs": adapter(["world/level.json", "world/level.json"]) },
    { "scripts/build-browser-assets.mjs": adapter(["world/missing.json"]) },
    { "scripts/build-browser-assets.mjs": adapter([]).replace("assets: []", "assets: process.argv.slice(2)") },
    { "pnpm-lock.yaml": null }, { "pnpm-lock.yaml": "lockfileVersion: '6.0'\n" },
    { "package-lock.json": "{}" }, { ".pnpmfile.cjs": "throw Error('must not execute')\n" },
    { "pnpm-workspace.yaml": "overrides:\n  package: 1.0.0\n" },
    { ".npmrc": "registry=https://foreign.invalid/\n" },
    { "web/index.html": null }, { "dist/web/index.html": "old generated source" },
  ]) {
    const f = await fixture(changes); let calls = 0;
    try {
      await assert.rejects(qualifySourcePublicationBuild({ ...f, codeGate: async () => { calls++; return produce(f); } }));
      assert.equal(calls, 0);
    } finally { await f.cleanup(); }
  }
});

test("uncommitted assets and redirected authored input refuse before native work", async () => {
  for (const change of [
    async f => { f.entries = f.entries.filter(row => row.path !== "world/level.json"); },
    async f => { await rm(join(f.directory, "web/main.mjs")); await symlink("../world/level.json", join(f.directory, "web/main.mjs")); },
    async f => { await mkdir(join(f.directory, "dist")); },
  ]) {
    const f = await fixture(); let calls = 0;
    try { await change(f); await assert.rejects(qualifySourcePublicationBuild({ ...f, codeGate: async () => { calls++; return produce(f); } })); assert.equal(calls, 0); }
    finally { await f.cleanup(); }
  }
});

test("native registry integrity form rejects alternate lock locators before installation", async () => {
  const additionalEntry = text => nativeLock.replace("snapshots:", text + "\nsnapshots:");
  for (const lock of [
    nativeLock.replace(`integrity: ${integrity}`, `integrity: ${integrity}, tarball: https://foreign.invalid/provider.tgz`),
    nativeLock.replace(`integrity: ${integrity}`, "tarball: https://registry.561.group/provider.tgz"),
    nativeLock.replace("version: 0.4.2", "version: link:../provider"),
    nativeLock.replace("version: 0.4.2", "version: file:../provider"),
    nativeLock.replace("version: 0.4.2", "version: git+ssh://foreign.invalid/provider"),
    nativeLock.replace("    resolution:", "    'resolution':"),
    nativeLock.replace("    resolution:", '    "resol\\u0075tion":'),
    nativeLock.replace("settings:", "overrides:\n  provider: 0.4.1\nsettings:"),
    nativeLock.replace(`{integrity: ${integrity}}`, "*foreign"),
    nativeLock.replace(`{integrity: ${integrity}}`, "{integrity: sha512-short}"),
    additionalEntry("  foreign@1.0.0:\n    !!str resolution: {tarball: HTTPS://foreign.invalid/provider.tgz}"),
    additionalEntry("  foreign@1.0.0:\n    ? resolution\n    : {tarball: //foreign.invalid/provider.tgz}"),
    additionalEntry("  foreign@1.0.0: {resolution: {tarball: HTTPS://foreign.invalid/provider.tgz}}"),
    additionalEntry("  foreign@1.0.0: {resolution: {tarball: //foreign.invalid/provider.tgz}}"),
    additionalEntry("  foreign@1.0.0:\n    resolution: {tarball: HTTPS://foreign.invalid/provider.tgz}"),
    additionalEntry("  foreign@1.0.0:\n    resolution: {tarball: //foreign.invalid/provider.tgz}"),
  ]) {
    const f = await fixture({ "pnpm-lock.yaml": lock }); let calls = 0;
    try {
      await assert.rejects(qualifySourcePublicationBuild({ ...f, codeGate: async () => { calls++; return produce(f); } }), /lock/u);
      assert.equal(calls, 0);
    } finally { await f.cleanup(); }
  }
  const f = await fixture({ "pnpm-lock.yaml": nativeLock.replace("snapshots:", "    deprecated: See https://www.npmjs.com/support for details.\nsnapshots:") });
  try { assert.ok(await qualifySourcePublicationBuild({ ...f, codeGate: () => produce(f) })); }
  finally { await f.cleanup(); }
});

test("worker receipt must bind the admitted browser recipe and frozen PNPM operation", async () => {
  for (const change of [
    r => { r.steps[0].evidence.installMode = "update-lock"; },
    r => { r.steps[0].evidence.packageManager = "npm"; },
    r => { r.steps[1].evidence.browserAssetTree = { ...r.steps[1].evidence.browserAssetTree, providerVersion: "0.4.1" }; },
    r => { delete r.steps[1].evidence.browserAssetTree; },
    r => { r.steps[1].evidence.installedBrowserProvider.version = "0.4.1"; },
    r => { delete r.steps[1].evidence.installedBrowserProvider; },
    r => { r.steps[1].evidence.testCount = { tests: 0, pass: 0, fail: 0 }; },
  ]) {
    const f = await fixture();
    try { await assert.rejects(qualifySourcePublicationBuild({ ...f, codeGate: async () => { const r = await produce(f); change(r); return r; } })); }
    finally { await f.cleanup(); }
  }
});

test("installed supplier receiving follows the actual importer and refuses wrong versions or exports", async () => {
  const f = await fixture();
  try {
    const root = join(f.directory, "node_modules", provider);
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(join(root, "src/project-browser-asset-tree.mjs"), "export const buildCloudflareStaticAssetTree = () => {};\n");
    const selected = { name: provider, version: "0.4.2", type: "module", exports: { ".": "./src/project-browser-asset-tree.mjs" } };
    await writeFile(join(root, "package.json"), JSON.stringify(selected));
    const received = await receiveInstalledBrowserAssetTreeProvider(f.directory);
    assert.equal(received.name, provider); assert.equal(received.version, "0.4.2");
    for (const changed of [{ ...selected, version: "0.4.1" }, { ...selected, name: "different" }, { ...selected, exports: { ".": { import: "./src/project-browser-asset-tree.mjs", require: "./src/project-browser-asset-tree.mjs" } } }]) {
      await writeFile(join(root, "package.json"), JSON.stringify(changed));
      await assert.rejects(receiveInstalledBrowserAssetTreeProvider(f.directory), /differs/u);
    }
  } finally { await f.cleanup(); }
});

test("a successful process cannot substitute incomplete assets or changed authored inputs", async () => {
  for (const change of [
    f => rm(join(f.directory, "dist/web/index.html")),
    f => rm(join(f.directory, "dist/web/main.mjs")),
    f => rm(join(f.directory, "dist/world/level.json")),
    f => writeFile(join(f.directory, "dist/world/level.json"), "changed\n"),
    f => writeFile(join(f.directory, "pnpm-lock.yaml"), "changed\n"),
    f => writeFile(join(f.directory, "package.json"), "{}\n"),
    f => writeFile(join(f.directory, "unplanned.txt"), "unplanned\n"),
  ]) {
    const f = await fixture();
    try { await assert.rejects(qualifySourcePublicationBuild({ ...f, codeGate: async () => { const result = await produce(f); await change(f); return result; } })); }
    finally { await f.cleanup(); }
  }
});
