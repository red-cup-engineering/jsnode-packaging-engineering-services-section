import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { isExactSemver, dependencySpecificationViolations, publicationManifest } from "../src/dependency-policy.mjs";

import {
  CANONICAL_NPM_REGISTRY,
  admitOperationsAuthorization,
  dependencyProtocolViolations,
  formPublicationPlan,
  measureArtifact,
  packageIdentity,
  publicationTag,
  publicationWitness,
} from "../src/publication.mjs";

const commit = "a".repeat(40);
const manifest = {
  name: "@red-cup-engineering/example",
  version: "1.2.3",
  dependencies: { "@red-cup-engineering/provider": "1.0.0" },
  scripts: { test: "node --test", prepack: "npm test" },
};

test("shared exact SemVer predicate accepts canonical prerelease and build identifiers", () => {
  for (const version of [
    "0.0.0", "1.2.3", "0.15.0-quiet-reef", "0.15.0-quiet-reef.2",
    "1.2.3-0", "1.2.3-alpha.0", "1.2.3-0.1", "1.2.3-01a",
    "1.2.3-01-foo", "1.2.3-x-y-z.--", "1.2.3+001",
    "1.2.3+build.01", "1.2.3-quiet-reef.2+build.01",
  ]) assert.equal(isExactSemver(version), true, version);
});

test("shared exact SemVer predicate refuses malformed core, numeric prerelease and identifiers", () => {
  for (const version of [
    undefined, null, 123, {}, "", "01.2.3", "1.02.3", "1.2.03",
    "1.2.3-01", "1.2.3-alpha.01", "1.2.3-0.01", "1.2.3-00",
    "v1.2.3", "=1.2.3", "1.2", "1.2.3.4", "1.2.3-",
    "1.2.3-alpha..1", "1.2.3-alpha.", "1.2.3+", "1.2.3+build..1",
    "1.2.3+build.", "1.2.3++build", "1.2.3-alpha_beta", "1.2.3-β",
    "1.2.3\n", "1.2.3\r\n", "1.2.3\u2028", " 1.2.3", "1.2.3 ",
  ]) assert.equal(isExactSemver(version), false, String(version));
});

test("publication reuses exact grammar and refuses invalid core or numeric prerelease", () => {
  for (const version of ["01.2.3", "1.02.3", "1.2.03", "1.2.3-01", "1.2.3-alpha.01", "1.2.3-0.01"]) {
    assert.throws(() => publicationTag(version), error => error.code === "malformed-version", version);
    assert.throws(() => packageIdentity({ ...manifest, version }), error => error.code === "malformed-version", version);
    assert.throws(() => formPublicationPlan({ sourceCommit: commit, manifest: { ...manifest, version } }),
      error => error.code === "malformed-version", version);
  }
});

test("publication retains stable and named prerelease tags and its existing text trimming", () => {
  for (const [version, tag] of [
    ["0.0.0", "latest"], ["1.2.3", "latest"],
    ["0.15.0-quiet-reef", "quiet-reef"], ["0.15.0-quiet-reef.2", "quiet-reef"],
    ["1.2.3-01a", "01a"], ["1.2.3-vnext", "vnext"],
  ]) {
    assert.equal(publicationTag(version), tag);
    assert.deepEqual(packageIdentity({ ...manifest, version }), { name: manifest.name, version, tag });
  }
  assert.equal(isExactSemver(" 1.2.3\n"), false);
  assert.equal(publicationTag(" 1.2.3\n"), "latest");
  assert.deepEqual(packageIdentity({ ...manifest, version: " 1.2.3\n" }),
    { name: manifest.name, version: "1.2.3", tag: "latest" });
});

test("build metadata is valid SemVer but explicitly unsupported by exact-version npm publication", () => {
  for (const version of ["1.2.3+001", "1.2.3+build.01", "1.2.3-quiet-reef.2+build.01"]) {
    assert.equal(isExactSemver(version), true);
    for (const operation of [
      () => publicationTag(version),
      () => packageIdentity({ ...manifest, version }),
      () => formPublicationPlan({ sourceCommit: commit, manifest: { ...manifest, version } }),
    ]) assert.throws(operation, error => error.code === "unsupported-publication-version", version);
  }
  for (const version of ["1.2.3+", "1.2.3+build..1", "1.2.3-alpha.01+build"])
    assert.throws(() => publicationTag(version), error => error.code === "malformed-version", version);
});

test("published dependency contracts and migration outputs share numeric prerelease validation", () => {
  for (const version of ["1.2.3-01", "1.2.3-alpha.01", "1.2.3-0.01"]) {
    assert.equal(dependencySpecificationViolations({ ...manifest, version: "2.0.0-dev", dependencies: { provider: version } },
      { published: true }).length, 1, version);
    assert.throws(() => publicationManifest({ dependencies: { provider: version } }),
      /exact registry dependency/u, version);
  }
  for (const version of ["1.2.3+001", "1.2.3-quiet-reef.2+build.01", "1.2.3-01a"]) {
    const source = { ...manifest, version: "2.0.0-dev", dependencies: { provider: version } };
    const projected = publicationManifest(source);
    assert.equal(projected.dependencies.provider, version);
    assert.equal(source.dependencies.provider, version);
    assert.deepEqual(dependencySpecificationViolations(projected, { published: true }), []);
  }
});

test("package file contract includes the specification documents linked by its README", async () => {
  const root = new URL("../", import.meta.url);
  const packageManifest = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
  const readme = await readFile(new URL("README.md", root), "utf8");
  assert.ok(packageManifest.files.includes("specifications/"));
  for (const path of ["specifications/canonical-version-validation.md", "specifications/repository-aware-source-members.md"]) {
    assert.ok(readme.includes(path), `README must link ${path}`);
    assert.ok((await readFile(new URL(path, root), "utf8")).length > 0, `${path} must exist`);
  }
});

async function fixtureArtifact() {
  const root = await mkdtemp(join(tmpdir(), "npm-publication-test-"));
  const path = join(root, "example.tgz");
  await writeFile(path, "immutable artifact");
  return { root, path, measurement: await measureArtifact(path) };
}

function authorization(plan, overrides = {}) {
  return {
    kind: "operations.npm-publication-authorization",
    version: 1,
    decision: "authorize",
    planDigest: plan.planDigest,
    package: plan.package.name,
    packageVersion: plan.package.version,
    registry: plan.registry,
    authorizedBy: "office:release-operations",
    authorizationRef: "semioverse:release:example",
    authorizedAt: "2026-10-06T05:00:00Z",
    ...overrides,
  };
}

test("plan binds exact source, artifact, canonical registry and declared lifecycle", async () => {
  const fixture = await fixtureArtifact();
  try {
    const plan = formPublicationPlan({
      sourceCommit: commit,
      packagePath: ".",
      manifest,
      manifestBytes: Buffer.from(JSON.stringify(manifest)),
      artifact: fixture.measurement,
      registryObservation: { found: false, reachable: true, manifest: null },
    });
    assert.equal(plan.registry, CANONICAL_NPM_REGISTRY);
    assert.equal(plan.package.name, manifest.name);
    assert.equal(plan.package.version, manifest.version);
    assert.equal(plan.package.tag, "latest");
    assert.deepEqual(plan.lifecycle.map(({ name }) => name), ["test", "prepack"]);
    assert.equal(plan.registryState, "absent");
    assert.match(plan.planDigest, /^ni:\/\/\/sha-256;[A-Za-z0-9_-]{43}$/u);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("runtime local dependency protocols are refused before publication", () => {
  const bad = {
    ...manifest,
    dependencies: { x: "workspace:*", y: "file:../y", z: "link:../z" },
  };
  assert.equal(dependencyProtocolViolations(bad).length, 3);
  assert.throws(
    () => formPublicationPlan({
      sourceCommit: commit,
      manifest: bad,
      artifact: { bytes: 1, shasum: "a", integrity: "sha512-a", ni: "ni:///sha-256;a" },
      registryObservation: { found: false, reachable: true },
    }),
    (error) => error.code === "local-dependency-protocol",
  );
});

test("foreign registries are refused", async () => {
  const fixture = await fixtureArtifact();
  try {
    assert.throws(
      () => formPublicationPlan({
        sourceCommit: commit,
        manifest,
        artifact: fixture.measurement,
        registry: "https://registry.npmjs.org/",
        registryObservation: { found: false, reachable: true },
      }),
      (error) => error.code === "foreign-registry",
    );
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("Operations authorization is bound to the exact plan digest", async () => {
  const fixture = await fixtureArtifact();
  try {
    const plan = formPublicationPlan({
      sourceCommit: commit,
      manifest,
      artifact: fixture.measurement,
      registryObservation: { found: false, reachable: true },
    });
    assert.doesNotThrow(() => admitOperationsAuthorization(authorization(plan), plan));
    assert.throws(
      () => admitOperationsAuthorization(authorization(plan, { planDigest: "ni:///sha-256;wrong" }), plan),
      (error) => error.code === "authorization-mismatch",
    );
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("unchanged serialized plans preserve canonical digest and authorization output", () => {
  const formed = formPublicationPlan({
    sourceCommit: commit,
    manifest,
    artifact: { bytes: 1, shasum: "synthetic-shasum", integrity: "sha512-synthetic", ni: "ni:///sha-256;synthetic" },
  });
  const serialized = JSON.stringify(formed);
  const plan = JSON.parse(serialized);
  const approval = authorization(plan, { authorizedAt: "2026-10-06T07:00:00+02:00" });
  const approvalBefore = JSON.stringify(approval);
  const expected = { ...approval, authorizedAt: "2026-10-06T05:00:00.000Z" };
  assert.deepEqual(admitOperationsAuthorization(approval, plan), expected);
  assert.equal(JSON.stringify(plan), serialized);
  assert.equal(JSON.stringify(approval), approvalBefore);

  // JSON key order is not part of the canonical digest contract.
  const reordered = Object.fromEntries(Object.entries(plan).reverse());
  reordered.source = Object.fromEntries(Object.entries(plan.source).reverse());
  assert.deepEqual(admitOperationsAuthorization(approval, reordered), expected);
  const args = {
    authorization: approval,
    artifact: plan.artifact,
    registryManifest: { name: manifest.name, version: manifest.version, dist: { integrity: plan.artifact.integrity } },
    effect: "synthetic-only-no-publication-performed",
  };
  assert.deepEqual(publicationWitness({ ...args, plan }), publicationWitness({ ...args, plan: reordered }));
});

test("received plan contents must match the authorized digest before admission or witnessing", async (t) => {
  const formed = formPublicationPlan({
    sourceCommit: commit,
    manifest,
    artifact: { bytes: 1, shasum: "synthetic-shasum", integrity: "sha512-synthetic", ni: "ni:///sha-256;synthetic" },
    assurance: { dependencyInstall: "passed" },
  });
  const approval = authorization(formed);
  const mutations = [
    ["source commit", (plan) => { plan.source.commit = "b".repeat(40); }],
    ["artifact", (plan) => { plan.artifact = { bytes: 2, shasum: "other", integrity: "sha512-other", ni: "ni:///sha-256;other" }; }],
    ["tag", (plan) => { plan.package.tag = "synthetic-review"; }],
    ["source, artifact and tag", (plan) => {
      plan.source.commit = "b".repeat(40);
      plan.artifact = { bytes: 2, shasum: "other", integrity: "sha512-other", ni: "ni:///sha-256;other" };
      plan.package.tag = "synthetic-review";
    }],
    ["publication manifest", (plan) => { plan.publication.manifestNi = "ni:///sha-256;other"; }],
    ["assurance", (plan) => { plan.assurance.dependencyInstall = "refused"; }],
    ["registry state", (plan) => { plan.registryState = "already-published"; }],
    ["extra unsigned field", (plan) => { plan.extra = "synthetic-only"; }],
  ];
  for (const [name, mutate] of mutations) {
    await t.test(name, () => {
      const plan = JSON.parse(JSON.stringify(formed));
      mutate(plan);
      assert.equal(plan.planDigest, formed.planDigest);
      assert.throws(
        () => admitOperationsAuthorization(approval, plan),
        (error) => error.code === "plan-digest-mismatch",
      );
      assert.throws(
        () => publicationWitness({
          plan,
          authorization: approval,
          artifact: plan.artifact,
          registryManifest: { name: manifest.name, version: manifest.version, dist: { integrity: plan.artifact.integrity } },
          effect: "synthetic-only-no-publication-performed",
        }),
        (error) => error.code === "plan-digest-mismatch",
      );
    });
  }
});

test("matching absent or invalid digest labels cannot authorize received plans", () => {
  const formed = formPublicationPlan({
    sourceCommit: commit,
    manifest,
    artifact: { bytes: 1, shasum: "synthetic-shasum", integrity: "sha512-synthetic", ni: "ni:///sha-256;synthetic" },
  });
  for (const digest of [undefined, null, "", "ni:///sha-256;wrong"]) {
    const plan = { ...formed, planDigest: digest };
    const approval = authorization(plan);
    if (digest === undefined) {
      delete plan.planDigest;
      delete approval.planDigest;
    }
    assert.throws(
      () => admitOperationsAuthorization(approval, plan),
      (error) => error.code === "plan-digest-mismatch",
    );
  }
});

test("publication witness requires registry readback of the exact artifact", async () => {
  const fixture = await fixtureArtifact();
  try {
    const plan = formPublicationPlan({
      sourceCommit: commit,
      manifest,
      artifact: fixture.measurement,
      registryObservation: { found: false, reachable: true },
    });
    const witness = publicationWitness({
      plan,
      authorization: authorization(plan),
      artifact: fixture.measurement,
      registryManifest: {
        name: manifest.name,
        version: manifest.version,
        dist: { integrity: fixture.measurement.integrity },
      },
    });
    assert.equal(witness.package, manifest.name);
    assert.equal(witness.registryIntegrity, fixture.measurement.integrity);
    assert.match(witness.witnessDigest, /^ni:\/\/\/sha-256;[A-Za-z0-9_-]{43}$/u);
    assert.equal(JSON.stringify(witness).includes("token"), false);

    assert.throws(
      () => publicationWitness({
        plan,
        authorization: authorization(plan),
        artifact: fixture.measurement,
        registryManifest: {
          name: manifest.name,
          version: manifest.version,
          dist: { integrity: "sha512-different" },
        },
      }),
      (error) => error.code === "readback-mismatch",
    );
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});


test("assurance outcome is part of the authorized plan digest", async () => {
  const fixture = await fixtureArtifact();
  try {
    const common = {
      sourceCommit: commit,
      manifest,
      artifact: fixture.measurement,
      registryObservation: { found: false, reachable: true },
    };
    const passed = formPublicationPlan({
      ...common,
      assurance: { dependencyInstall: "passed", lifecycle: [{ name: "test", outcome: "passed" }], pack: "passed" },
    });
    const changed = formPublicationPlan({
      ...common,
      assurance: { dependencyInstall: "passed", lifecycle: [{ name: "test", outcome: "refused" }], pack: "passed" },
    });
    assert.notEqual(passed.planDigest, changed.planDigest);
    assert.equal(passed.assurance.lifecycle[0].outcome, "passed");
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("publication witness refuses any artifact measurement drift, not only integrity drift", async () => {
  const fixture = await fixtureArtifact();
  try {
    const plan = formPublicationPlan({
      sourceCommit: commit,
      manifest,
      artifact: fixture.measurement,
      registryObservation: { found: false, reachable: true },
    });
    assert.throws(
      () => publicationWitness({
        plan,
        authorization: authorization(plan),
        artifact: { ...fixture.measurement, bytes: fixture.measurement.bytes + 1 },
        registryManifest: {
          name: manifest.name,
          version: manifest.version,
          dist: { integrity: fixture.measurement.integrity },
        },
      }),
      (error) => error.code === "artifact-plan-mismatch",
    );
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("publication preserves canonical source and refuses an unreceived workspace resolver", async () => {
  const { publicationManifest, dependencySpecificationViolations } = await import("../src/dependency-policy.mjs");
  const source = { name: "source", version: "1.0.0", dependencies: { provider: "2.1.0" }, devDependencies: { assay: "3.0.0" } };
  const published = publicationManifest(source);
  assert.deepEqual(published, source);
  assert.notEqual(published, source);
  assert.equal(published.dependencies.provider, "2.1.0");
  assert.equal(published.devDependencies.assay, "3.0.0");
  assert.deepEqual(dependencySpecificationViolations(published, { published: true }), []);
  // Actual PNPM/pinned-member transformation belongs to preparePublishedManifest,
  // exercised by the native source-member suite. The final gate accepts no map.
  assert.throws(() => publicationManifest({ ...source, dependencies: { provider: "workspace:*" } },
    () => assert.fail("the final gate must not consult a caller-supplied version map")), /exact registry dependency/);
});

test("plan distinguishes authored bytes, projected bytes and measured dependency inputs", async () => {
  const { publicationManifest } = await import("../src/dependency-policy.mjs");
  const { sha256Ni } = await import("../src/publication.mjs");
  const fixture = await fixtureArtifact();
  try {
    const source = { ...manifest, dependencies: { "@red-cup-engineering/provider": "workspace:*" } };
    // Structural plan test: actual migration is independently exercised through
    // preparePublishedManifest and native pinned membership in its owner suite.
    const published = publicationManifest({ ...source, dependencies: { "@red-cup-engineering/provider": "1.0.0" } });
    const sourceBytes = Buffer.from(JSON.stringify(source));
    const publishedBytes = Buffer.from(JSON.stringify(published));
    const dependencies = [{ name: "@red-cup-engineering/provider", version: "1.0.0", source: { commit, packagePath: "provider", manifestNi: "ni:///sha-256;source" } }];
    const artifacts = [{ package: "@red-cup-engineering/provider", version: "1.0.0", artifact: fixture.measurement }];
    const common = { sourceCommit: commit, manifest: published, manifestBytes: sourceBytes, publishedManifestBytes: publishedBytes,
      workspaceDependencies: dependencies, dependencyArtifacts: artifacts, artifact: fixture.measurement, registryObservation: { found: false, reachable: true } };
    const plan = formPublicationPlan(common);
    assert.equal(plan.source.manifestNi, sha256Ni(sourceBytes));
    assert.equal(plan.publication.manifestNi, sha256Ni(publishedBytes));
    assert.notEqual(plan.source.manifestNi, plan.publication.manifestNi);
    assert.deepEqual(plan.publication.workspaceDependencies, dependencies);
    assert.deepEqual(plan.publication.dependencyArtifacts, artifacts);
    assert.notEqual(plan.planDigest, formPublicationPlan({ ...common, dependencyArtifacts: [] }).planDigest);
  } finally { await rm(fixture.root, { recursive: true, force: true }); }
});
