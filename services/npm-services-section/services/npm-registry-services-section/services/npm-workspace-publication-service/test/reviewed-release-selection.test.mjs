import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { pinExactDependencies, planExactDependencyPins } from "../src/pin-exact-dependencies.mjs";

const name = "@red-cup-engineering/signcraft";
const registry = "https://registry.561.group/";
const version = "0.1.4";
const artifactBytes = Buffer.from("reviewed fixture artifact 0.1.4");
const integrity = "sha512-" + createHash("sha512").update(artifactBytes).digest("base64");
const tarball = registry + "@red-cup-engineering/signcraft/-/signcraft-0.1.4.tgz";
const record = { name, version, registry, integrity, tarball,
  evidence: ["review:https://github.com/red-cup-engineering/signcraft/commit/observed"] };
const exactRelease = async (url, key, selectedVersion) => {
  assert.equal(url, registry);
  assert.equal(key, name);
  assert.equal(selectedVersion, version, "reviewed selection must read exact metadata, not a packument");
  return { reachable: true, found: true,
    manifest: { name: key, version: selectedVersion, dist: { integrity, tarball } } };
};
async function fixture(t, deps = { [name]: "workspace:*" }) {
  const root = await mkdtemp(join(tmpdir(), "release-selection-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const dir = join(root, "consumer");
  await mkdir(dir);
  const path = join(dir, "package.json");
  const manifest = { name: "@red-cup-engineering/consumer", version: "1.0.0",
    dependencies: deps };
  const bytes = JSON.stringify(manifest, null, 2) + "\n";
  await writeFile(path, bytes);
  const selection = { kind: "npm-workspace-publication.reviewed-selection.v1",
    consumer: { name: manifest.name, version: manifest.version,
      manifestSha256: createHash("sha256").update(bytes).digest("hex") },
    releases: [record] };
  return { path, dir, manifest, bytes, selection };
}
const configured = () => ({ registry: "https://registry.npmjs.org/",
  "@red-cup-engineering:registry": registry });

test("candidate-only immutable version is selectable with no latest dist-tag", async () => {
  const input = { name: "consumer", version: "1.0.0", dependencies: { [name]: "workspace:*" } };
  const plan = await planExactDependencyPins(input, {
    migrateWorkspace: true,
    selectedReleases: new Map([[name, record]]),
    readRegistryPackageVersionImpl: exactRelease,
  });
  assert.deepEqual(plan.refusals, []);
  assert.equal(plan.rewrites.length, 1);
  assert.equal(plan.rewrites[0].to, version);
  assert.equal(plan.rewrites[0].integrity, integrity);
  assert.equal(plan.selectedArtifacts[0].tarball, tarball);
});

test("native plan is read-only; apply receives SHA512 artifact before writing", async t => {
  const site = await fixture(t);
  let attempts = 0;
  const options = { sites: [site], migrateWorkspace: true,
    artifactDirectory: join(site.dir, "received-artifacts"),
    registryForSite: configured, readRegistryPackageVersionImpl: exactRelease,
    selection: site.selection,
    receiveRegistryArtifactImpl: async entry => {
      attempts++;
      assert.equal(entry.registry, registry);
      assert.equal(entry.tarball, tarball);
      assert.equal(entry.integrity, integrity);
      assert.match(entry.destination, /reviewed-registry-selection-/);
      await writeFile(entry.destination, artifactBytes);
      return { artifactDownloaded: true, integrity };
    } };
  const plan = await pinExactDependencies({ ...options, apply: false });
  assert.equal(plan.ok, true);
  assert.equal(plan.packages[0].applied, false);
  assert.equal(plan.packages[0].selectedReceived, false);
  assert.equal(attempts, 0);
  assert.equal(await readFile(site.path, "utf8"), site.bytes);
  const applied = await pinExactDependencies({ ...options, apply: true });
  assert.equal(applied.packages[0].receivedArtifacts.length, 1);
  assert.equal(applied.packages[0].receivedArtifacts[0].artifactDownloaded, true);
  assert.match(applied.packages[0].receivedArtifacts[0].artifactPath, /reviewed-registry-selection-/);
  assert.deepEqual(await readFile(applied.packages[0].receivedArtifacts[0].artifactPath), artifactBytes,
    "candidate tarball remains available for downstream native lock preparation");
  assert.equal(applied.ok, true);
  assert.equal(applied.packages[0].selectedReceived, true);
  assert.equal(applied.packages[0].applied, true);
  assert.equal(attempts, 1);
  assert.equal(JSON.parse(await readFile(site.path, "utf8")).dependencies[name], version);
});

test("missing actual artifact refuses the entire consumer and leaves its manifest intact", async t => {
  const site = await fixture(t);
  const result = await pinExactDependencies({ sites: [site], migrateWorkspace: true,
    apply: true, selection: site.selection, artifactDirectory: join(site.dir, "received-artifacts"), registryForSite: configured,
    readRegistryPackageVersionImpl: exactRelease,
    receiveRegistryArtifactImpl: async () => { throw new Error("offline"); } });
  assert.equal(result.ok, false);
  assert.equal(result.packages[0].applied, false);
  assert.match(result.packages[0].refusals[0].reason, /SHA512 receiving failed/);
  assert.equal(await readFile(site.path, "utf8"), site.bytes);
});

test("source drift, missing direct selection, duplicate identity and wrong authority refuse", async t => {
  const site = await fixture(t);
  const common = { sites: [site], migrateWorkspace: true, apply: true,
    artifactDirectory: join(site.dir, "received-artifacts"),
    registryForSite: configured, readRegistryPackageVersionImpl: exactRelease };
  await assert.rejects(() => pinExactDependencies({ ...common,
    selection: { ...site.selection, consumer: { ...site.selection.consumer,
      manifestSha256: "0".repeat(64) } } }), /exact|bind/);
  await assert.rejects(() => pinExactDependencies({ ...common,
    selection: { ...site.selection, releases: [record, record] } }), /uniquely bind/);
  const wrongRegistry = await pinExactDependencies({ ...common,
    selection: { ...site.selection, releases: [{ ...record,
      registry: "https://untrusted.invalid/",
      tarball: "https://untrusted.invalid/reviewed.tgz" }] } });
  assert.equal(wrongRegistry.ok, false);
  assert.match(wrongRegistry.packages[0].refusals[0].reason, /effective npm authority/);
  await assert.rejects(() => pinExactDependencies({ ...common,
    selection: { ...site.selection, releases: [{ ...record,
      tarball: "https://elsewhere.invalid/forged.tgz" }] } }), /same|authority/);
  assert.equal(await readFile(site.path, "utf8"), site.bytes);
});

test("a partial selection cannot bypass the rest of a consumer's direct dependencies", async t => {
  const site = await fixture(t, { [name]: "workspace:*", "other": "^2.0.0" });
  await assert.rejects(() => pinExactDependencies({ sites: [site],
    migrateWorkspace: true, selection: site.selection,
    registryForSite: configured, readRegistryPackageVersionImpl: exactRelease }),
    /every direct consumer dependency/);
});

test("stale native lock never gets relabeled as another immutable artifact", async t => {
  const site = await fixture(t);
  await writeFile(join(site.dir, "package-lock.json"), JSON.stringify({
    lockfileVersion: 3, packages: {
      "": { dependencies: { [name]: "workspace:*" } },
      ["node_modules/" + name]: { version: "0.1.3" },
    },
  }));
  let receives = 0;
  const result = await pinExactDependencies({ sites: [site], migrateWorkspace: true,
    apply: true, selection: site.selection, artifactDirectory: join(site.dir, "received-artifacts"), registryForSite: configured,
    readRegistryPackageVersionImpl: exactRelease,
    receiveRegistryArtifactImpl: async () => {
      receives++;
      return { artifactDownloaded: true, integrity };
    } });
  assert.equal(result.ok, false);
  assert.equal(result.packages[0].applied, false);
  assert.match(result.packages[0].refusals[0].reason, /native lock|native regeneration/);
  assert.equal(receives, 0);
  assert.equal(await readFile(site.path, "utf8"), site.bytes);
});

test("reviewed selection preserves authored overrides instead of deleting policy", async t => {
  const site = await fixture(t);
  site.manifest.overrides = { [name]: "0.1.3" };
  const original = JSON.stringify(site.manifest, null, 2) + "\n";
  await writeFile(site.path, original);
  site.selection.consumer.manifestSha256 = createHash("sha256").update(original).digest("hex");
  const result = await pinExactDependencies({
    sites: [site], selection: site.selection, migrateWorkspace: true, apply: true,
    artifactDirectory: join(site.dir, "received-artifacts"),
    registryForSite: configured, readRegistryPackageVersionImpl: exactRelease,
    receiveRegistryArtifactImpl: async () => {
      throw new Error("artifact cannot be touched before policy admission");
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.packages[0].applied, false);
  assert.deepEqual(result.packages[0].lockRootRewrites, []);
  assert.match(result.packages[0].refusals[0].reason, /cannot discard authored workspace or override/);
  assert.equal(await readFile(site.path, "utf8"), original);
});
