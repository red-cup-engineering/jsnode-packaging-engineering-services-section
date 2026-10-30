import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pinExactDependencies } from "../src/pin-exact-dependencies.mjs";

const name = "@red-cup-engineering/candidate-provider";
const version = "0.2.4";
const registry = "https://registry.561.group/";
const tarball = "https://registry.561.group/@red-cup-engineering/candidate-provider/-/candidate-provider-0.2.4.tgz";
const bytes = Buffer.from("fixture: reviewed and content-checked candidate source", "utf8");
const integrity = "sha512-" + createHash("sha512").update(bytes).digest("base64");
const sha = data => createHash("sha256").update(data).digest("hex");

const metadata = async (authority, requested, selectedVersion) => {
  assert.equal(authority, registry);
  assert.equal(requested, name);
  assert.equal(selectedVersion, version, "selected candidates must use the exact version entrance");
  // There is intentionally no latest tag or full packument read.
  return { reachable: true, found: true,
    manifest: { name, version, dist: { integrity, tarball } } };
};

async function fixture(t, specification = "workspace:*", installed) {
  const root = await mkdtemp(join(tmpdir(), "reviewed-native-selection-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const dir = join(root, "consumer");
  await mkdir(dir);
  const manifest = { name: "@example/consumer", version: "1.0.0",
    dependencies: { [name]: specification } };
  const path = join(dir, "package.json");
  const original = JSON.stringify(manifest, null, 2) + "\n";
  await writeFile(path, original);
  let lock = null;
  if (installed !== undefined) {
    lock = { lockfileVersion: 3, packages: {
      "": { name: manifest.name, version: manifest.version,
        dependencies: { [name]: specification } },
      ["node_modules/" + name]: { version, ...installed },
    } };
    await writeFile(join(dir, "package-lock.json"), JSON.stringify(lock, null, 2) + "\n");
  }
  const selection = { kind: "npm-workspace-publication.reviewed-selection.v1",
    consumer: { name: manifest.name, version: manifest.version,
      manifestSha256: sha(original) },
    releases: [{ name, version, registry, integrity, tarball,
      evidence: ["receipt:independent-source-review"] }],
  };
  return { site: { dir, path, manifest }, manifest, original, selection,
    destination: join(root, "received"), lock };
}

const receive = async ({ destination, integrity: expected }) => {
  assert.equal(expected, integrity);
  await writeFile(destination, bytes);
  return { artifactDownloaded: true, integrity: expected };
};

test("select a candidate release without latest or changing consumer bytes in plan mode", async t => {
  const f = await fixture(t);
  let artifacts = 0;
  const report = await pinExactDependencies({
    sites: [f.site], selection: f.selection, migrateWorkspace: true,
    readRegistryPackageVersionImpl: metadata,
    receiveRegistryArtifactImpl: async () => { artifacts++; throw Error("plan made a network effect"); },
  });
  assert.equal(report.ok, true);
  assert.equal(report.packages[0].selectedReceived, false);
  assert.equal(report.packages[0].applied, false);
  assert.equal(report.packages[0].refusals.length, 0);
  assert.deepEqual(report.packages[0].rewrites.map(x => x.to), [version]);
  assert.deepEqual(report.packages[0].selectedArtifacts.map(x => x.integrity), [integrity]);
  assert.equal(artifacts, 0);
  assert.equal(await readFile(f.site.path, "utf8"), f.original);
});

test("apply a reviewed selection only after actual SHA512-matching artifact bytes exist", async t => {
  const f = await fixture(t);
  const result = await pinExactDependencies({
    sites: [f.site], selection: f.selection, migrateWorkspace: true,
    apply: true, artifactDirectory: f.destination,
    readRegistryPackageVersionImpl: metadata, receiveRegistryArtifactImpl: receive,
  });
  assert.equal(result.ok, true);
  const entry = result.packages[0];
  assert.equal(entry.selectedReceived, true);
  assert.equal(entry.applied, true);
  assert.equal(entry.receivedArtifacts.length, 1);
  assert.equal(entry.receivedArtifacts[0].artifactDownloaded, true);
  const artifact = await readFile(entry.receivedArtifacts[0].artifactPath);
  assert.equal("sha512-" + createHash("sha512").update(artifact).digest("base64"), integrity);
  assert.equal(JSON.parse(await readFile(f.site.path, "utf8")).dependencies[name], version);
  assert.equal(entry.receivedArtifacts[0].integrity, integrity);
  assert.deepEqual(await readdir(f.destination), [
    entry.receivedArtifacts[0].artifactPath.split("/").at(-2)
  ]);
});

test("matching package versions without locked integrity or original artifact URL refuse", async t => {
  for (const installed of [
    { resolved: tarball }, // no SHA512 binding
    { integrity }, // no immutable source URL
    { integrity, resolved: "https://registry.561.group/wrong-file.tgz" },
    { integrity: "sha512-" + "B".repeat(86) + "==", resolved: tarball },
  ]) {
    const f = await fixture(t, version, installed);
    let downloads = 0;
    const before = await readFile(join(f.site.dir, "package-lock.json"), "utf8");
    const report = await pinExactDependencies({
      sites: [f.site], selection: f.selection, apply: true,
      artifactDirectory: f.destination,
      readRegistryPackageVersionImpl: metadata,
      receiveRegistryArtifactImpl: async () => { downloads++; throw Error("must refuse before IO"); },
    });
    assert.equal(report.ok, false);
    assert.equal(report.packages[0].applied, false);
    assert.equal(report.packages[0].selectedReceived, false);
    assert.match(report.packages[0].refusals[0].reason, /existing lock requires native regeneration/);
    assert.equal(downloads, 0);
    assert.equal(await readFile(f.site.path, "utf8"), f.original);
    assert.equal(await readFile(join(f.site.dir, "package-lock.json"), "utf8"), before);
  }
});

test("fully immutable already-resolved lock admits unchanged consumer and real artifact receipt", async t => {
  const f = await fixture(t, version, { version, integrity, resolved: tarball });
  const before = await readFile(f.site.path, "utf8");
  const lock = await readFile(join(f.site.dir, "package-lock.json"), "utf8");
  const report = await pinExactDependencies({
    sites: [f.site], selection: f.selection, apply: true,
    artifactDirectory: f.destination, readRegistryPackageVersionImpl: metadata,
    receiveRegistryArtifactImpl: receive,
  });
  assert.equal(report.ok, true);
  assert.equal(report.packages[0].selectedReceived, true);
  assert.equal(report.packages[0].applied, true);
  assert.equal(await readFile(f.site.path, "utf8"), before);
  assert.equal(await readFile(join(f.site.dir, "package-lock.json"), "utf8"), lock);
});

test("digest mismatch retains unqualified artifact custody and never rewrites consumer", async t => {
  const f = await fixture(t);
  const report = await pinExactDependencies({
    sites: [f.site], selection: f.selection, migrateWorkspace: true,
    apply: true, artifactDirectory: f.destination,
    readRegistryPackageVersionImpl: metadata,
    receiveRegistryArtifactImpl: async ({ destination }) => {
      await writeFile(destination, Buffer.from("wrong bytes"));
      return { artifactDownloaded: true, integrity };
    },
  });
  assert.equal(report.ok, false);
  assert.equal(report.packages[0].selectedReceived, false);
  assert.equal(report.packages[0].receivedArtifacts.length, 0);
  assert.match(report.packages[0].refusals[0].reason, /SHA512 receiving failed/);
  const held = report.packages[0].retainedArtifactCustody;
  assert.equal(held.state, "retained-unqualified");
  assert.equal(held.transportReceiving.kind, "npm.registry-transfer.receiving-unavailable.v1");
  assert.deepEqual(await readFile(join(held.directory, "0.tgz")), Buffer.from("wrong bytes"));
  assert.deepEqual(await readdir(f.destination), [held.directory.split("/").at(-1)]);
  assert.equal(await readFile(f.site.path, "utf8"), f.original);
});

test("foreign, duplicate or stale reviewed selections never query registry", async t => {
  const f = await fixture(t);
  let calls = 0;
  const invalid = [
    { ...f.selection, consumer: { ...f.selection.consumer, manifestSha256: "0".repeat(64) } },
    { ...f.selection, releases: [f.selection.releases[0], f.selection.releases[0]] },
    { ...f.selection, releases: [{ ...f.selection.releases[0], name: "@example/unrelated" }] },
  ];
  for (const selection of invalid) {
    await assert.rejects(() => pinExactDependencies({
      sites: [f.site], selection, readRegistryPackageVersionImpl: async () => { calls++; return metadata(); },
    }), /reviewed selection|reviewed release/);
  }
  assert.equal(calls, 0);
  assert.equal(await readFile(f.site.path, "utf8"), f.original);
});

