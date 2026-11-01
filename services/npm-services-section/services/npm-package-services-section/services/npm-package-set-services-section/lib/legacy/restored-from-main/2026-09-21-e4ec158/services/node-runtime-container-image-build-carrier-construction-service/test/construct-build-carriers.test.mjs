import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { verifyOciImageObservationRecord } from "@red-cup-engineering/oci-image-observation-service";
import {
  admitNodeRuntimeContainerImageBuildCarrierSet,
  admitNodeRuntimeContainerImageConstructionAuthority,
  formNodeRuntimeContainerImageBuildCarrierSet,
  formNodeRuntimeContainerImageConstructionAuthority,
} from "../src/construct-build-carriers.mjs";

const hex = (character) => character.repeat(64);
function contentId(value) {
  function canonical(member) {
    if (member === null || typeof member === "boolean" || typeof member === "string" || typeof member === "number") return JSON.stringify(member);
    if (Array.isArray(member)) return `[${member.map(canonical).join(",")}]`;
    return `{${Object.keys(member).sort().map((key) => `${JSON.stringify(key)}:${canonical(member[key])}`).join(",")}}`;
  }
  return `ni:///sha-256;${createHash("sha256").update(canonical(value)).digest("base64url")}`;
}

function requirement(overrides = {}) {
  const body = {
    type: "NotebookLmCloudRunRuntimeImageRequirement", version: 1, status: "required", effects: [],
    entry: { catalogEntryId: "provider", package: { name: "@example/provider", version: "1.2.3" }, runtimeReleaseCatalog: { artifactDigest: hex("a") } },
    providerContract: { package: { name: "@example/provider", version: "1.2.3" }, bin: "serve-provider", entrypoint: "src/serve.mjs", nodeEngine: ">=24", requirementsLock: { path: "requirements.lock", sha256: `sha256:${hex("b")}`, installation: "require-hashes" } },
    runtime: {
      process: { command: "serve-provider", nodeEngine: ">=24", pythonImport: "notebooklm", requirementsInstallation: "require-hashes" },
      listener: { count: 1, hostBinding: "HOST", portBinding: "PORT" },
      environment: ["HOST", "PORT", "PROVIDER_STATE", "EXTERNAL_ORIGIN"],
      secrets: [{ name: "PROVIDER_AUTH", delivery: "environment" }, { name: "SIGNING_KEY_PATH", delivery: "read-only-file" }],
      evidenceAlternatives: [{ mode: "journal", environment: ["JOURNAL_AGENT"], secrets: [{ name: "JOURNAL_KEY_PATH", delivery: "read-only-file" }] }],
      writableState: { binding: "PROVIDER_STATE", temporaryStorage: "required" }, shutdown: { boundedTimeout: "required-from-runtime-operator" },
      imageCapabilities: { aptPackages: ["python3-venv", "python3", "ca-certificates", "python3-pip"] },
    },
    containerOwnerHandoff: { catalogEntry: { id: "provider", entryPackage: "@example/provider", entryVersion: "1.2.3", artifactDigest: hex("a") }, requiredChoices: [] },
    ...overrides,
  };
  return { id: contentId(body), ...body };
}

const LIVE_NODE_OBSERVATION = Object.freeze({
  observationId: "ni:///sha-256;UUy0SgQldHddFwJztmh-gCnivU631j19PVXWU_H6yPQ",
  requestedDigest: "sha256:934240a162082fd8b8a2f90cd5114446443f1eba1c5378f6687167ca405e6584",
  manifestDigest: "sha256:f6d02cf1353049cf3658e6ce9ec03c6877a6479495f122062d195e2279d01055",
  configDigest: "sha256:2ff56a1e437102232fc4f3923138b9513f0d2e36bc0e57f39c3054a86c884e27",
});

function ociImageObservation({ nodeVersion = "24.19.0", architecture = "amd64", suite = "bookworm" } = {}) {
  const occupied = {
    accounts: { uids: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 13, 33, 34, 38, 39, 42, 1000, 65534], gids: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 13, 15, 20, 21, 22, 24, 25, 26, 27, 29, 30, 33, 34, 37, 38, 39, 40, 42, 43, 44, 45, 46, 50, 60, 100, 101, 1000, 65534] },
    filesystemOwners: { uids: [0, 42, 503, 1000], gids: [0, 4, 8, 42, 43, 50, 101, 1000] },
    union: { uids: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 13, 33, 34, 38, 39, 42, 503, 1000, 65534], gids: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 13, 15, 20, 21, 22, 24, 25, 26, 27, 29, 30, 33, 34, 37, 38, 39, 40, 42, 43, 44, 45, 46, 50, 60, 100, 101, 1000, 65534] },
    configUser: { raw: null, uid: null, gid: null, unresolved: [] }, unresolved: ["dynamic-nss-identities"],
  };
  const rootBody = { type: "OciFinalRootfsObservation", version: 1, files: [{ path: "/", kind: "directory", mode: 493, uid: 0, gid: 0, bytes: 0, contentDigest: null, link: null, deviceMajor: null, deviceMinor: null }], occupied, accountEvidence: { passwd: `sha256:${hex("d")}`, group: `sha256:${hex("e")}` } };
  const finalRootfs = { id: contentId(rootBody), ...rootBody };
  const body = {
    type: "OciImageObservation", version: 1, status: "observed", effects: [],
    reference: `registry-1.docker.io/library/node@${LIVE_NODE_OBSERVATION.requestedDigest}`, requestedDigest: LIVE_NODE_OBSERVATION.requestedDigest,
    index: { digest: LIVE_NODE_OBSERVATION.requestedDigest, mediaType: "application/vnd.oci.image.index.v1+json", bytes: 3881 },
    manifest: { digest: LIVE_NODE_OBSERVATION.manifestDigest, mediaType: "application/vnd.oci.image.manifest.v1+json", bytes: 2493 },
    config: { mediaType: "application/vnd.oci.image.config.v1+json", digest: LIVE_NODE_OBSERVATION.configDigest, size: 6718, os: "linux", architecture, variant: null, user: null },
    platform: { os: "linux", architecture }, layers: [], finalRootfs,
    node: { status: "observed", version: nodeVersion, evidence: { configEnvironment: "NODE_VERSION", headerPath: "/usr/local/include/node/node_version.h", headerDigest: `sha256:${hex("f")}` } },
    debian: { status: "observed", suite, evidence: { osReleaseDigest: `sha256:${hex("1")}`, debianVersionDigest: `sha256:${hex("2")}` } },
    unresolved: ["dynamic-nss-identities"], readAuthority: { id: `ni:///sha-256;${"A".repeat(43)}` },
    limits: { manifestBytes: 4194304, configBytes: 4194304, compressedLayerBytes: 268435456, totalCompressedBytes: 1073741824, uncompressedLayerBytes: 1073741824, totalUncompressedBytes: 4294967296, entries: 2000000, evidenceFileBytes: 16777216, totalEvidenceBytes: 67108864, maxPlatformDescriptors: 64 },
  };
  return { id: contentId(body), ...body };
}

function selections() {
  return {
    ociImageObservation: ociImageObservation(),
    node: { version: "24.19.0", baseImage: `node:24.19.0-bookworm@${LIVE_NODE_OBSERVATION.requestedDigest}` },
    debian: { suite: "bookworm", snapshot: "20260805T032029Z", architecture: "amd64", packageRequests: [
      { name: "python3-venv", version: "3.11.2-1+b1" }, { name: "ca-certificates", version: "20230311+deb12u1" },
      { name: "python3-pip", version: "23.0.1+dfsg-1" }, { name: "python3", version: "3.11.2-1+b1" },
    ] },
    python: { version: "3.11.2", venv: "/app/provider/.venv" }, identity: { uid: 10001, gid: 10001 },
    paths: { app: "/app/provider", writable: "/var/lib/provider", temporary: "/tmp/provider" },
    network: { port: 8080 }, shutdown: { timeoutSeconds: 10 },
  };
}

test("forms and independently admits one canonical immutable construction authority", () => {
  const left = selections(), right = structuredClone(left); right.debian.packageRequests.reverse();
  assert.deepEqual(verifyOciImageObservationRecord(left.ociImageObservation), left.ociImageObservation);
  const formed = formNodeRuntimeContainerImageConstructionAuthority(left);
  assert.deepEqual(formed, formNodeRuntimeContainerImageConstructionAuthority(right));
  assert.match(formed.id, /^ni:\/\/\/sha-256;/u);
  assert.equal(LIVE_NODE_OBSERVATION.observationId, "ni:///sha-256;UUy0SgQldHddFwJztmh-gCnivU631j19PVXWU_H6yPQ");
  assert.equal(formed.ociImageObservation.reference, `registry-1.docker.io/library/node@${LIVE_NODE_OBSERVATION.requestedDigest}`);
  assert.deepEqual(formed.ociImageObservation.index, left.ociImageObservation.index);
  assert.deepEqual(formed.ociImageObservation.manifest, left.ociImageObservation.manifest);
  assert.deepEqual(formed.ociImageObservation.config, left.ociImageObservation.config);
  assert.deepEqual(formed.baseImageSource, { observationId: left.ociImageObservation.id, reference: left.ociImageObservation.reference, index: left.ociImageObservation.index, manifest: left.ociImageObservation.manifest, config: left.ociImageObservation.config });
  assert.deepEqual(admitNodeRuntimeContainerImageConstructionAuthority(formed), formed);
});

test("forms deterministic credential-free Dockerfile bytes and context adapter", () => {
  const authority = formNodeRuntimeContainerImageConstructionAuthority(selections());
  const first = formNodeRuntimeContainerImageBuildCarrierSet({ providerRequirement: requirement(), authority });
  const second = formNodeRuntimeContainerImageBuildCarrierSet({ providerRequirement: structuredClone(requirement()), authority: structuredClone(authority) });
  assert.deepEqual(first, second);
  assert.deepEqual(first.layoutPolicy.entries, [{ id: "provider", mount: "app/provider" }]);
  assert.deepEqual(first.staticCarriers, [{ path: "Dockerfile", mode: 0o644, utf8: first.carriers[0].utf8 }]);
  assert.equal(first.carriers[0].bytes, Buffer.byteLength(first.carriers[0].utf8));
  assert.match(first.carriers[0].utf8, /^FROM --platform=linux\/amd64 node:24\.19\.0-bookworm@sha256:[a-f0-9]{64}$/mu);
  assert.match(first.carriers[0].utf8, /snapshot\.debian\.org\/archive\/debian\/20260805T032029Z/u);
  assert.match(first.carriers[0].utf8, /--no-install-recommends ca-certificates=20230311\+deb12u1 python3=3\.11\.2-1\+b1 python3-pip=23\.0\.1\+dfsg-1 python3-venv=3\.11\.2-1\+b1/u);
  assert.match(first.carriers[0].utf8, /--require-hashes --requirement \/app\/provider\/requirements\.lock/u);
  assert.match(first.carriers[0].utf8, /printf '%s  %s\\n' b{64} \/app\/provider\/requirements\.lock \| sha256sum --check --strict -/u);
  assert.match(first.carriers[0].utf8, /TMPDIR=\/tmp\/provider/u);
  assert.match(first.carriers[0].utf8, /PROVIDER_STATE=\/var\/lib\/provider/u);
  assert.match(first.carriers[0].utf8, /USER 10001:10001/u);
  assert.doesNotMatch(first.carriers[0].utf8, /groupadd|useradd|node-runtime/u);
  assert.match(first.carriers[0].utf8, /^COPY app\/provider\/ \/app\/provider\/$/mu);
  assert.match(first.carriers[0].utf8, /chmod -R a-w \/app\/provider/u);
  assert.doesNotMatch(first.carriers[0].utf8, /COPY --chown|chown -R .*\/app\/provider|NODE_RUNTIME_SHUTDOWN/u);
  assert.match(first.carriers[0].utf8, /ENTRYPOINT \["node","\/app\/provider\/src\/serve\.mjs"\]/u);
  assert.doesNotMatch(first.carriers[0].utf8, /gcloud|cloudbuild|Artifact Registry|secret/i);
  assert.deepEqual(admitNodeRuntimeContainerImageBuildCarrierSet(first, { providerRequirement: requirement(), authority }), first);
  assert.deepEqual(first.runtimeProjection.identity, { uid: 10001, gid: 10001 });
  assert.equal(first.runtimeProjection.workdir, "/app/provider");
  assert.equal(first.runtimeProjection.stopSignal, "SIGTERM");
  assert.deepEqual(first.runtimeProjection.filesystem.application, { path: "/app/provider", owner: { uid: 0, gid: 0 }, runtimeWritable: false });
  assert.deepEqual(first.runtimeProjection.filesystem.venv, { path: "/app/provider/.venv", owner: { uid: 0, gid: 0 }, runtimeWritable: false });
  assert.deepEqual(first.runtimeProjection.environment.image, { HOST: "0.0.0.0", NODE_ENV: "production", PORT: "8080", PROVIDER_STATE: "/var/lib/provider", PYTHONDONTWRITEBYTECODE: "1", TMPDIR: "/tmp/provider" });
  assert.deepEqual(first.runtimeProjection.environment.unresolvedExternal, ["EXTERNAL_ORIGIN"]);
  assert.deepEqual(first.runtimeProjection.secrets, [{ name: "PROVIDER_AUTH", delivery: "environment" }, { name: "SIGNING_KEY_PATH", delivery: "read-only-file" }]);
  assert.deepEqual(first.runtimeProjection.evidenceAlternatives, [{ mode: "journal", environment: ["JOURNAL_AGENT"], secrets: [{ name: "JOURNAL_KEY_PATH", delivery: "read-only-file" }] }]);
  assert.deepEqual(first.runtimeProjection.unresolvedBindings, { environment: ["EXTERNAL_ORIGIN"], secrets: ["PROVIDER_AUTH", "SIGNING_KEY_PATH"], conditionalEnvironment: ["JOURNAL_AGENT"], conditionalSecrets: ["JOURNAL_KEY_PATH"], semantics: ["python-executable-environment-binding", "shutdown-timeout-environment-binding"] });
});

test("refuses floating, injectable, traversing, overlapping, or privileged selections", () => {
  const mutations = [
    (value) => { value.node.baseImage = "node:24-bookworm"; },
    (value) => { value.debian.suite = "bookworm\nRUN id"; },
    (value) => { value.debian.packageRequests[0].version = "1;curl"; },
    (value) => { value.debian.architecture = "386"; },
    (value) => { value.python.venv = "/app/provider/../escape"; },
    (value) => { value.paths.writable = "/app/provider/state"; },
    (value) => { value.paths.temporary = "/var/lib/provider/tmp"; },
    (value) => { value.paths.temporary = "/tmp"; },
    (value) => { value.identity.uid = 0; },
    (value) => { value.identity.uid = 1000; },
    (value) => { value.network.port = 0; },
    (value) => { value.shutdown.timeoutSeconds = 61; },
  ];
  for (const mutate of mutations) { const input = selections(); mutate(input); assert.throws(() => formNodeRuntimeContainerImageConstructionAuthority(input)); }
});

test("refuses Node engine mismatch and missing provider capabilities", () => {
  const tooOld = selections();
  tooOld.node.version = "23.11.0"; tooOld.node.baseImage = `node:23.11.0-bookworm@${LIVE_NODE_OBSERVATION.requestedDigest}`;
  tooOld.ociImageObservation = ociImageObservation({ nodeVersion: "23.11.0" });
  assert.throws(() => formNodeRuntimeContainerImageBuildCarrierSet({ providerRequirement: requirement(), authority: formNodeRuntimeContainerImageConstructionAuthority(tooOld) }), /does not satisfy/u);
  const absent = selections(); absent.debian.packageRequests = absent.debian.packageRequests.filter(({ name }) => name !== "python3-pip");
  assert.throws(() => formNodeRuntimeContainerImageBuildCarrierSet({ providerRequirement: requirement(), authority: formNodeRuntimeContainerImageConstructionAuthority(absent) }), /does not implement/u);
});

test("refuses provider command, entrypoint, lock, and content-identity injection", () => {
  for (const mutate of [
    (value) => { value.providerContract.entrypoint = "../serve.mjs"; },
    (value) => { value.runtime.process.command = "serve-provider;id"; },
    (value) => { value.providerContract.requirementsLock.path = "requirements.txt"; },
    (value) => { value.providerContract.requirementsLock.sha256 = "latest"; },
    (value) => { value.providerContract.package.version = "1.2.4"; },
  ]) {
    const provider = requirement(); mutate(provider);
    assert.throws(() => formNodeRuntimeContainerImageBuildCarrierSet({ providerRequirement: provider, authority: formNodeRuntimeContainerImageConstructionAuthority(selections()) }));
  }
});

test("content-addressed provider contract package must still equal entry and handoff", () => {
  const provider = requirement(); provider.providerContract.package.version = "1.2.4";
  provider.id = contentId(Object.fromEntries(Object.entries(provider).filter(([key]) => key !== "id")));
  assert.throws(
    () => formNodeRuntimeContainerImageBuildCarrierSet({ providerRequirement: provider, authority: formNodeRuntimeContainerImageConstructionAuthority(selections()) }),
    /must equal/u,
  );
});

test("authority and carrier admission reject every post-formation mutation", () => {
  const authority = formNodeRuntimeContainerImageConstructionAuthority(selections());
  const changedAuthority = structuredClone(authority); changedAuthority.network.port = 9090;
  assert.throws(() => admitNodeRuntimeContainerImageConstructionAuthority(changedAuthority), /differs/u);
  const carriers = formNodeRuntimeContainerImageBuildCarrierSet({ providerRequirement: requirement(), authority });
  const changedCarriers = structuredClone(carriers); changedCarriers.staticCarriers[0].utf8 += "RUN id\n";
  assert.throws(() => admitNodeRuntimeContainerImageBuildCarrierSet(changedCarriers, { providerRequirement: requirement(), authority }), /differs/u);
});

test("strict records reject adjacent undeclared authority", () => {
  const input = selections(); input.builder = { image: "example" };
  assert.throws(() => formNodeRuntimeContainerImageConstructionAuthority(input), /exactly/u);
});

test("provider apt capability order cannot change the carrier identity", () => {
  const left = requirement(), right = structuredClone(left);
  right.runtime.imageCapabilities.aptPackages.reverse();
  const rightBody = Object.fromEntries(Object.entries(right).filter(([key]) => key !== "id")); right.id = contentId(rightBody);
  const authority = formNodeRuntimeContainerImageConstructionAuthority(selections());
  assert.deepEqual(
    formNodeRuntimeContainerImageBuildCarrierSet({ providerRequirement: left, authority }).carriers,
    formNodeRuntimeContainerImageBuildCarrierSet({ providerRequirement: right, authority }).carriers,
  );
});

test("constructor core package requests are always unioned with provider additions", () => {
  const provider = requirement(); provider.runtime.imageCapabilities.aptPackages = ["ffmpeg"];
  provider.id = contentId(Object.fromEntries(Object.entries(provider).filter(([key]) => key !== "id")));
  const input = selections(); input.debian.packageRequests.push({ name: "ffmpeg", version: "7:5.1.7-0+deb12u1" });
  const formed = formNodeRuntimeContainerImageBuildCarrierSet({ providerRequirement: provider, authority: formNodeRuntimeContainerImageConstructionAuthority(input) });
  assert.match(formed.carriers[0].utf8, /ca-certificates=.* ffmpeg=7:5\.1\.7-0\+deb12u1 python3=/u);
  const absent = selections(); absent.debian.packageRequests = absent.debian.packageRequests.filter(({ name }) => name !== "ca-certificates");
  assert.throws(() => formNodeRuntimeContainerImageBuildCarrierSet({ providerRequirement: provider, authority: formNodeRuntimeContainerImageConstructionAuthority(absent) }), /ca-certificates/u);
});

test("real OCI observation is bound and occupied identities cannot be guessed through", () => {
  const tampered = selections(); tampered.ociImageObservation.platform.architecture = "arm64";
  assert.throws(() => formNodeRuntimeContainerImageConstructionAuthority(tampered), /verified/u);
  const collision = selections(); collision.identity.gid = 1000;
  assert.throws(() => formNodeRuntimeContainerImageConstructionAuthority(collision), /collides/u);
  const mismatch = selections(); mismatch.ociImageObservation = ociImageObservation({ architecture: "arm64" });
  assert.throws(() => formNodeRuntimeContainerImageConstructionAuthority(mismatch), /disagree/u);
});

test("provider-declared Python and shutdown bindings close the runtime projection without invented names", () => {
  const provider = requirement();
  provider.runtime.process.pythonEnvironmentBinding = "PROVIDER_PYTHON";
  provider.runtime.shutdown.timeoutEnvironmentBinding = "PROVIDER_SHUTDOWN_MS";
  provider.runtime.environment.push("PROVIDER_PYTHON", "PROVIDER_SHUTDOWN_MS");
  provider.id = contentId(Object.fromEntries(Object.entries(provider).filter(([key]) => key !== "id")));
  const authority = formNodeRuntimeContainerImageConstructionAuthority(selections());
  const formed = formNodeRuntimeContainerImageBuildCarrierSet({ providerRequirement: provider, authority });
  assert.deepEqual(formed.runtimeProjection.unresolvedBindings.semantics, []);
  assert.equal(formed.runtimeProjection.environment.image.PROVIDER_PYTHON, "/app/provider/.venv/bin/python3");
  assert.equal(formed.runtimeProjection.environment.image.PROVIDER_SHUTDOWN_MS, "10000");
  assert.match(formed.carriers[0].utf8, /PROVIDER_PYTHON=\/app\/provider\/\.venv\/bin\/python3/u);
  assert.match(formed.carriers[0].utf8, /PROVIDER_SHUTDOWN_MS=10000/u);
});
