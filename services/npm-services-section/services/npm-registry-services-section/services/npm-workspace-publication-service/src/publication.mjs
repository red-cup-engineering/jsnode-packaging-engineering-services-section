import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dependencySpecificationViolations, isExactSemver } from "./dependency-policy.mjs";

export const CANONICAL_NPM_REGISTRY = "https://registry.561.group/";

const COMMIT = /^[0-9a-f]{40}$/u;
const LOCAL_PROTOCOL = /^(?:workspace|file|link):/u;
const DEPENDENCY_FIELDS = Object.freeze(["dependencies", "optionalDependencies", "peerDependencies"]);

export class NpmPublicationError extends Error {
  constructor(code, message, evidence = undefined) {
    super(message);
    this.name = "NpmPublicationError";
    this.code = code;
    if (evidence !== undefined) this.evidence = evidence;
  }
}

function object(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new NpmPublicationError("malformed", `${label} must be an object`);
  }
  return value;
}

function nonempty(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new NpmPublicationError("malformed", `${label} must be non-empty text`);
  }
  return value.trim();
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, stable(value[key])]),
    );
  }
  return value;
}

export function stableJson(value) {
  return JSON.stringify(stable(value));
}

export function sha256Ni(value) {
  const bytes = typeof value === "string" ? Buffer.from(value, "utf8") : Buffer.from(value);
  return `ni:///sha-256;${createHash("sha256").update(bytes).digest("base64url")}`;
}

export function canonicalRegistry(value = CANONICAL_NPM_REGISTRY) {
  const url = new URL(nonempty(value, "registry"));
  if (url.href !== CANONICAL_NPM_REGISTRY) {
    throw new NpmPublicationError(
      "foreign-registry",
      `publication registry must be ${CANONICAL_NPM_REGISTRY}`,
      { observed: url.href },
    );
  }
  return url.href;
}

export function publicationTag(version) {
  const source = nonempty(version, "package version");
  if (!isExactSemver(source)) throw new NpmPublicationError("malformed-version", "package version must be SemVer MAJOR.MINOR.PATCH[-PRERELEASE][+BUILD]");
  // Build metadata is valid SemVer, but npm publish normalizes it away. Do not
  // form an exact-version plan whose registry readback cannot retain that identity.
  if (source.includes("+")) throw new NpmPublicationError("unsupported-publication-version", "npm publication cannot preserve SemVer build metadata in the registry version");
  const prereleaseAt = source.indexOf("-");
  if (prereleaseAt === -1) return "latest";
  return source.slice(prereleaseAt + 1).split(".")[0];
}

export function dependencyProtocolViolations(manifest) {
  object(manifest, "manifest");
  const violations = [];
  for (const field of DEPENDENCY_FIELDS) {
    const dependencies = manifest[field];
    if (dependencies === undefined) continue;
    object(dependencies, `manifest.${field}`);
    for (const [name, specification] of Object.entries(dependencies)) {
      if (typeof specification === "string" && LOCAL_PROTOCOL.test(specification)) {
        violations.push(Object.freeze({ field, name, specification }));
      }
    }
  }
  return Object.freeze(violations);
}

export function packageIdentity(manifest, { expectedName, expectedVersion } = {}) {
  const source = object(manifest, "manifest");
  const name = nonempty(source.name, "manifest.name");
  const version = nonempty(source.version, "manifest.version");
  publicationTag(version);
  if (expectedName !== undefined && name !== expectedName) {
    throw new NpmPublicationError("package-name-mismatch", `expected ${expectedName}, observed ${name}`);
  }
  if (expectedVersion !== undefined && version !== expectedVersion) {
    throw new NpmPublicationError("package-version-mismatch", `expected ${expectedVersion}, observed ${version}`);
  }
  const violations = dependencyProtocolViolations(source);
  if (violations.length > 0) {
    throw new NpmPublicationError(
      "local-dependency-protocol",
      "publishable runtime dependencies must not use workspace:, file:, or link: specifications",
      violations,
    );
  }
  const contract = dependencySpecificationViolations(source, { published: true });
  if (contract.length > 0) throw new NpmPublicationError("published-dependency-contract", "published dependencies must name exact versions", contract);
  return Object.freeze({ name, version, tag: publicationTag(version) });
}

export function lifecycleScripts(manifest) {
  const scripts = object(manifest, "manifest").scripts ?? {};
  object(scripts, "manifest.scripts");
  return Object.freeze(
    ["check", "build", "test", "prepack"]
      .filter((name) => typeof scripts[name] === "string" && scripts[name].trim() !== "")
      .map((name) => Object.freeze({ name, command: scripts[name] })),
  );
}

export async function measureArtifact(path) {
  const bytes = await readFile(nonempty(path, "artifact path"));
  return Object.freeze({
    bytes: bytes.byteLength,
    shasum: createHash("sha1").update(bytes).digest("hex"),
    integrity: `sha512-${createHash("sha512").update(bytes).digest("base64")}`,
    ni: sha256Ni(bytes),
  });
}

export function formPublicationPlan({
  sourceCommit,
  packagePath = ".",
  manifest,
  manifestBytes,
  publishedManifestBytes,
  workspaceDependencies = [],
  dependencyArtifacts = [],
  artifact,
  registry = CANONICAL_NPM_REGISTRY,
  registryObservation,
  assurance = undefined,
  expectedName,
  expectedVersion,
} = {}) {
  const commit = nonempty(sourceCommit, "sourceCommit");
  if (!COMMIT.test(commit)) {
    throw new NpmPublicationError("malformed-commit", "sourceCommit must be one full lowercase Git SHA-1");
  }
  const identity = packageIdentity(manifest, { expectedName, expectedVersion });
  const admittedRegistry = canonicalRegistry(registry);
  const measurement = object(artifact, "artifact");
  for (const field of ["bytes", "shasum", "integrity", "ni"]) {
    if (measurement[field] === undefined) throw new NpmPublicationError("malformed-artifact", `artifact.${field} is required`);
  }

  const observed = registryObservation ?? Object.freeze({ found: false, reachable: true, manifest: null });
  object(observed, "registryObservation");
  let registryState = "absent";
  let registryIntegrity = null;
  if (observed.found === true) {
    const remote = object(observed.manifest, "registryObservation.manifest");
    if (remote.name !== identity.name || remote.version !== identity.version) {
      throw new NpmPublicationError("registry-identity-mismatch", "registry observation does not match package identity");
    }
    registryIntegrity = typeof remote.dist?.integrity === "string" ? remote.dist.integrity : null;
    registryState = registryIntegrity === measurement.integrity ? "already-published" : "immutable-conflict";
  } else if (observed.reachable !== true) {
    throw new NpmPublicationError("registry-unreachable", "canonical registry must be reachable during assay");
  }

  const bytes = manifestBytes === undefined
    ? Buffer.from(stableJson(manifest), "utf8")
    : Buffer.from(manifestBytes);

  const unsigned = Object.freeze({
    kind: "engineering.npm-publication-plan",
    version: 1,
    source: Object.freeze({
      commit,
      packagePath: nonempty(packagePath, "packagePath"),
      manifestNi: sha256Ni(bytes),
    }),
    publication: Object.freeze({
      manifestNi: sha256Ni(publishedManifestBytes ?? manifestBytes ?? Buffer.from(stableJson(manifest), "utf8")),
      workspaceDependencies: Object.freeze(structuredClone(workspaceDependencies)),
      dependencyArtifacts: Object.freeze(structuredClone(dependencyArtifacts)),
    }),
    package: identity,
    registry: admittedRegistry,
    lifecycle: lifecycleScripts(manifest),
    ...(assurance === undefined ? {} : { assurance: Object.freeze({ ...object(assurance, "assurance") }) }),
    artifact: Object.freeze({
      bytes: measurement.bytes,
      shasum: nonempty(measurement.shasum, "artifact.shasum"),
      integrity: nonempty(measurement.integrity, "artifact.integrity"),
      ni: nonempty(measurement.ni, "artifact.ni"),
    }),
    registryState,
    registryIntegrity,
  });
  return Object.freeze({
    ...unsigned,
    planDigest: sha256Ni(stableJson(unsigned)),
  });
}

export function admitOperationsAuthorization(source, plan) {
  const authorization = object(source, "authorization");
  const admittedPlan = object(plan, "plan");
  if (
    authorization.kind !== "operations.npm-publication-authorization"
    || authorization.version !== 1
    || authorization.decision !== "authorize"
  ) {
    throw new NpmPublicationError("unauthorized", "Operations authorization must explicitly authorize publication");
  }
  const { planDigest, ...unsignedPlan } = admittedPlan;
  if (planDigest !== sha256Ni(stableJson(unsignedPlan))) {
    throw new NpmPublicationError("plan-digest-mismatch", "publication plan contents do not match plan.planDigest");
  }
  const expected = {
    planDigest,
    package: admittedPlan.package.name,
    packageVersion: admittedPlan.package.version,
    registry: admittedPlan.registry,
  };
  for (const [field, value] of Object.entries(expected)) {
    if (authorization[field] !== value) {
      throw new NpmPublicationError("authorization-mismatch", `authorization.${field} does not match the publication plan`);
    }
  }
  const authorizedAt = nonempty(authorization.authorizedAt, "authorization.authorizedAt");
  if (!/(?:Z|[+-]\d\d:\d\d)$/u.test(authorizedAt) || !Number.isFinite(Date.parse(authorizedAt))) {
    throw new NpmPublicationError("malformed-authorization", "authorization.authorizedAt must be an offset-aware timestamp");
  }
  return Object.freeze({
    kind: authorization.kind,
    version: 1,
    decision: "authorize",
    planDigest: authorization.planDigest,
    package: authorization.package,
    packageVersion: authorization.packageVersion,
    registry: authorization.registry,
    authorizedBy: nonempty(authorization.authorizedBy, "authorization.authorizedBy"),
    authorizationRef: nonempty(authorization.authorizationRef, "authorization.authorizationRef"),
    authorizedAt: new Date(Date.parse(authorizedAt)).toISOString(),
  });
}

export function publicationWitness({ plan, authorization, artifact, registryManifest, effect = "published" } = {}) {
  const admittedPlan = object(plan, "plan");
  const authorized = admitOperationsAuthorization(authorization, admittedPlan);
  const measurement = object(artifact, "artifact");
  const remote = object(registryManifest, "registryManifest");
  if (
    measurement.bytes !== admittedPlan.artifact.bytes
    || measurement.shasum !== admittedPlan.artifact.shasum
    || measurement.integrity !== admittedPlan.artifact.integrity
    || measurement.ni !== admittedPlan.artifact.ni
  ) {
    throw new NpmPublicationError("artifact-plan-mismatch", "publication artifact does not match the authorized plan");
  }
  if (
    remote.name !== admittedPlan.package.name
    || remote.version !== admittedPlan.package.version
    || remote.dist?.integrity !== admittedPlan.artifact.integrity
  ) {
    throw new NpmPublicationError("readback-mismatch", "registry readback does not identify the exact authorized artifact");
  }
  const unsigned = Object.freeze({
    kind: "engineering.npm-publication-witness",
    version: 1,
    effect,
    planDigest: admittedPlan.planDigest,
    sourceCommit: admittedPlan.source.commit,
    package: admittedPlan.package.name,
    packageVersion: admittedPlan.package.version,
    registry: admittedPlan.registry,
    artifact: admittedPlan.artifact,
    authorizationRef: authorized.authorizationRef,
    authorizedBy: authorized.authorizedBy,
    registryIntegrity: remote.dist.integrity,
  });
  return Object.freeze({
    ...unsigned,
    witnessDigest: sha256Ni(stableJson(unsigned)),
  });
}
