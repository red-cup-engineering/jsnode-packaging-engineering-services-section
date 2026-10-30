import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import {
  dependencySpecificationViolations,
  isExactSemver,
  packageLockRootDependencyViolations,
  resolvePackageLockDependency,
} from "./dependency-policy.mjs";

async function readRegistryPackage(registry, name) {
  const reader = await import("./registry.mjs");
  return reader.readRegistryPackage(registry, name);
}

async function readRegistryPackageVersion(registry, name, version) {
  const reader = await import("./registry.mjs");
  return reader.readRegistryPackageVersion(registry, name, version);
}

const DEPENDENCY_FIELDS = Object.freeze(["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]);

/**
 * House scopes routed to the canonical registry, mirroring `~/.npmrc`'s
 * per-scope `registry=` lines. Any other scope, or no scope at all, is
 * third-party and resolves against the public npm registry.
 */
const HOUSE_SCOPE_REGISTRY = Object.freeze({
  "@561-group": "https://registry.561.group/",
  "@causeway-services": "https://registry.561.group/",
  "@coesite-operations": "https://registry.561.group/",
  "@emsenn": "https://registry.561.group/",
  "@lenticule-science": "https://registry.561.group/",
  "@red-cup-engineering": "https://registry.561.group/",
});
const THIRD_PARTY_REGISTRY = "https://registry.npmjs.org/";

const NON_REGISTRY_SPECIFIER = /^(?:workspace:|file:|link:|git\+|git:|github:|gitlab:|bitbucket:|https?:\/\/)/u;

/**
 * @param {string} name a dependency package name
 * @returns {string} the registry base URL that owns `name`'s scope
 */
export function registryForPackageName(name, effectiveNpmConfig) {
  const scope = name.startsWith("@") ? name.slice(0, name.indexOf("/")) : null;
  // Native npm configuration, when supplied, is the authoritative deployed
  // scope-routing policy. Never silently replace an observed scope route
  // with the source owner's incomplete historical hardcoded scope roster.
  if (effectiveNpmConfig !== undefined) {
    if (!effectiveNpmConfig || typeof effectiveNpmConfig !== "object" ||
      Array.isArray(effectiveNpmConfig)) throw new TypeError("native npm configuration required");
    const value = (scope && effectiveNpmConfig[`${scope}:registry`]) ??
      effectiveNpmConfig.registry ?? THIRD_PARTY_REGISTRY;
    if (typeof value !== "string") throw new TypeError("invalid npm registry URL");
    const url = new URL(value);
    if (url.username || url.password || url.search || url.hash ||
      (url.protocol !== "https:" &&
        !(url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname))))
      throw new TypeError("native registry authority must be HTTPS or loopback");
    return url.href;
  }
  return (scope && HOUSE_SCOPE_REGISTRY[scope]) || THIRD_PARTY_REGISTRY;
}

/**
 * @param {string} specification a manifest dependency specification
 * @returns {boolean} true for workspace:/file:/link:/git/URL specs, which are
 *   never rewritten by a registry-version lookup
 */
export function isNonRegistrySpecifier(specification) {
  return typeof specification === "string" && NON_REGISTRY_SPECIFIER.test(specification.trim());
}

function hasNpmPackagesGraph(packageLock) {
  return Boolean(packageLock)
    && Object.getPrototypeOf(packageLock) === Object.prototype
    && Number.isInteger(packageLock.lockfileVersion)
    && packageLock.lockfileVersion >= 2
    && packageLock.packages
    && Object.getPrototypeOf(packageLock.packages) === Object.prototype;
}

/**
 * Plan the rewrites that would make one manifest's dependency
 * specifications pass `dependencySpecificationViolations`, without
 * mutating anything. Resolution order per entry: the package's own
 * package-lock.json root resolution, then the highest registry-published
 * version satisfying the range; a workspace/file/link/git/URL specifier or
 * an otherwise-unresolvable one is refused, never rewritten.
 *
 * @param {object} manifest a parsed package.json
 * @param {{packageLock?: object|null, readRegistryPackageImpl?: Function}} [options]
 * @returns {Promise<{rewrites: Array<{field: string, name: string, from: string, to: string, source: string}>, refusals: Array<{name: string, spec: string, reason: string}>, removeFields: string[]}>}
 */
export async function planExactDependencyPins(manifest, { packageLock = null, readRegistryPackageImpl = readRegistryPackage, readRegistryPackageVersionImpl = readRegistryPackageVersion, migrateWorkspace = false, registryForName = registryForPackageName, selectedReleases } = {}) {
  const rewrites = [];
  const refusals = [];
  const removeFields = [];
  const selectedArtifacts = [];
  for (const authored of ["workspaces", "overrides"]) {
    if (!Object.hasOwn(manifest, authored)) continue;
    if (selectedReleases !== undefined)
      refusals.push({ name: manifest.name, spec: authored,
        reason: "reviewed independent selection cannot discard authored workspace or override semantics" });
    else removeFields.push(authored);
  }

  const lockUsable = hasNpmPackagesGraph(packageLock);

  for (const field of DEPENDENCY_FIELDS) {
    const dependencies = manifest[field];
    if (!dependencies || Object.getPrototypeOf(dependencies) !== Object.prototype) continue;
    for (const [name, specification] of Object.entries(dependencies)) {
      if (selectedReleases?.has(name)) {
        const release = selectedReleases.get(name), registry = registryForName(name);
        if (release.registry !== registry) {
          refusals.push({ name, spec: specification, reason: "reviewed release registry differs from effective npm authority" });
          continue;
        }
        if (specification !== release.version) {
          if (specification === "workspace:*") {
            if (!migrateWorkspace) {
              refusals.push({ name, spec: specification, reason: "reviewed workspace migration requires --migrate-workspace" });
              continue;
            }
          } else if (isNonRegistrySpecifier(specification)) {
            refusals.push({ name, spec: specification, reason: "reviewed selection cannot rewrite non-registry references" });
            continue;
          } else {
            const { default: semver } = await import("semver");
            if (!semver.validRange(specification) || !semver.satisfies(release.version, specification)) {
              refusals.push({ name, spec: specification, reason: "reviewed release does not satisfy the consumer range" });
              continue;
            }
          }
        }
        let result;
        try {
          // The selected identity is immutable and complete: fetch only that
          // version, not the full mutable tag/index namespace. This reuses
          // the registry owner's original exact-version reader.
          result = await readRegistryPackageVersionImpl(registry, name, release.version);
        } catch {
          refusals.push({ name, spec: specification, reason: "reviewed immutable registry metadata unreadable" });
          continue;
        }
        const current = result?.manifest;
        if (!result?.reachable || !result.found || current?.name !== name ||
            current.version !== release.version ||
            current.dist?.integrity !== release.integrity ||
            current.dist?.tarball !== release.tarball) {
          refusals.push({ name, spec: specification, reason: "reviewed immutable release is absent, unreadable or differs from registry metadata" });
          continue;
        }
        selectedArtifacts.push(Object.freeze({ ...release, field }));
        if (specification !== release.version) rewrites.push({
          field, name, from: specification, to: release.version,
          source: "reviewed-registry:" + registry, integrity: release.integrity, tarball: release.tarball,
        });
        continue;
      }
      if (selectedReleases !== undefined && !isExactSemver(specification)) {
        refusals.push({ name, spec: specification, reason: "missing reviewed immutable release selection" });
        continue;
      }
      if (isExactSemver(specification)) continue;
      if (migrateWorkspace && specification === "workspace:*") {
        const registry = registryForName(name);
        const result = await readRegistryPackageImpl(registry, name);
        const version = result.packument?.["dist-tags"]?.latest;
        const release = result.packument?.versions?.[version];
        if (!result.reachable || !result.found || !isExactSemver(version) || release?.name !== name || release?.version !== version || typeof release.dist?.integrity !== "string" || typeof release.dist?.tarball !== "string") {
          refusals.push({ name, spec: specification, reason: result.reachable ? "registry has no exact latest release with artifact integrity" : "registry metadata is unread" });
          continue;
        }
        rewrites.push({ field, name, from: specification, to: version, source: `registry:${registry}`, integrity: release.dist.integrity, tarball: release.dist.tarball });
        continue;
      }
      if (isNonRegistrySpecifier(specification)) {
        refusals.push({ name, spec: specification, reason: "non-registry specifier (workspace/file/link/git/URL) is never rewritten" });
        continue;
      }

      const locked = lockUsable ? resolvePackageLockDependency(packageLock, "", name) : null;
      if (typeof locked?.entry?.version === "string") {
        rewrites.push({ field, name, from: specification, to: locked.entry.version, source: "lockfile" });
        continue;
      }

      const { default: semver } = await import("semver");
      const range = semver.validRange(specification);
      if (range === null) {
        refusals.push({ name, spec: specification, reason: "specification is not a resolvable semver range" });
        continue;
      }
      const registry = registryForName(name);
      const result = await readRegistryPackageImpl(registry, name);
      const versions = result.found && result.packument?.versions ? Object.keys(result.packument.versions) : null;
      if (versions === null) {
        refusals.push({ name, spec: specification, reason: result.reachable ? `package not found on registry ${registry}` : `registry unreachable: ${registry}` });
        continue;
      }
      const best = semver.maxSatisfying(versions, range);
      if (best === null) {
        refusals.push({ name, spec: specification, reason: `no version published on ${registry} satisfies the range` });
        continue;
      }
      rewrites.push({ field, name, from: specification, to: best, source: `registry:${registry}` });
    }
  }
  return { rewrites: Object.freeze(rewrites), refusals: Object.freeze(refusals), removeFields: Object.freeze(removeFields), selectedArtifacts: Object.freeze(selectedArtifacts) };
}

/**
 * Apply a plan from `planExactDependencyPins` to a manifest, returning a new
 * object. Only rewritten values and removed fields change; every other
 * key's position and value are preserved.
 *
 * @param {object} manifest a parsed package.json
 * @param {{rewrites: Array<{field: string, name: string, to: string}>, removeFields: string[]}} plan
 * @returns {object} the rewritten manifest
 */
export function applyExactDependencyPinPlan(manifest, plan) {
  const next = structuredClone(manifest);
  for (const field of plan.removeFields) delete next[field];
  for (const { field, name, to } of plan.rewrites) next[field][name] = to;
  return next;
}

function synchronizePackageLockRootDependencies(manifest, packageLock) {
  if (!hasNpmPackagesGraph(packageLock)) return { packageLock, rewrites: Object.freeze([]) };
  const rewrites = packageLockRootDependencyViolations(manifest, packageLock);
  if (rewrites.length === 0) return { packageLock, rewrites };
  const next = structuredClone(packageLock);
  const root = next.packages[""];
  for (const field of DEPENDENCY_FIELDS) {
    if (manifest[field] === undefined) delete root[field];
    else root[field] = structuredClone(manifest[field]);
  }
  return { packageLock: next, rewrites };
}

/**
 * Deterministically repair every `dependencySpecificationViolations` finding
 * across one or more package sites: plan an exact-pin rewrite for each
 * non-exact dependency specification, and in `apply` mode write it and
 * re-run the checker as a gate. Never touches `node_modules` or runs
 * `npm install`.
 *
 * @param {{sites: Array<{path: string, dir: string, manifest: object}>, apply?: boolean, readFileImpl?: Function, writeFileImpl?: Function, readRegistryPackageImpl?: Function}} options
 * @returns {Promise<{kind: string, packages: Array<{path: string, rewrites: Array, refusals: Array, violationsAfter: number}>, ok: boolean}>}
 */
export async function pinExactDependencies({
  sites,
  apply = false,
  readFileImpl = readFile,
  writeFileImpl = writeFile,
  readRegistryPackageImpl = readRegistryPackage,
  readRegistryPackageVersionImpl = readRegistryPackageVersion,
  migrateWorkspace = false,
  registryForSite = undefined,
  selection = undefined,
  artifactDirectory = undefined,
  receiveRegistryArtifactImpl = async input => (await import("./registry.mjs")).receiveRegistryTarball(input),
}) {
  if (selection !== undefined && sites.length !== 1)
    throw new TypeError("reviewed release selection requires one exact consumer");
  if (selection !== undefined && apply &&
      (typeof artifactDirectory !== "string" || !artifactDirectory.length))
    throw new TypeError("reviewed apply needs an explicit artifact custody directory");
  const packages = [];
  for (const site of sites) {
    let selectedReleases;
    if (selection !== undefined) {
      const original = await readFileImpl(site.path, "utf8");
      const manifestSha256 = createHash("sha256").update(original).digest("hex");
      if (JSON.stringify(JSON.parse(original)) !== JSON.stringify(site.manifest))
        throw new TypeError("reviewed selection caller supplied a stale or different consumer object");
      if (selection?.kind !== "npm-workspace-publication.reviewed-selection.v1" ||
          selection.consumer?.name !== site.manifest.name ||
          selection.consumer?.version !== site.manifest.version ||
          selection.consumer?.manifestSha256 !== manifestSha256 ||
          !Array.isArray(selection.releases) || selection.releases.length === 0)
        throw new TypeError("reviewed selection does not bind the current consumer manifest");
      selectedReleases = new Map();
      for (const item of selection.releases) {
        const present = DEPENDENCY_FIELDS.some(field => Object.hasOwn(site.manifest[field] ?? {}, item?.name));
        if (!present || typeof item?.name !== "string" || selectedReleases.has(item.name) ||
            !isExactSemver(item.version) || typeof item.registry !== "string" ||
            typeof item.tarball !== "string" ||
            !/^sha512-[A-Za-z0-9+/]+={0,2}$/u.test(item.integrity ?? "") ||
            !Array.isArray(item.evidence) || item.evidence.length === 0 ||
            item.evidence.some(evidence => typeof evidence !== "string" || !evidence.trim()))
          throw new TypeError("reviewed release must uniquely bind one admitted dependency and evidence");
        const registry = new URL(item.registry), artifact = new URL(item.tarball);
        if ((registry.protocol !== "https:" &&
            !(registry.protocol === "http:" && ["127.0.0.1", "localhost"].includes(registry.hostname))) ||
            artifact.origin !== registry.origin || artifact.protocol !== registry.protocol ||
            registry.username || registry.password || registry.search || registry.hash ||
            artifact.username || artifact.password || artifact.hash)
          throw new TypeError("reviewed artifact must share the trusted registry authority");
        selectedReleases.set(item.name, Object.freeze({ ...item }));
      }
      const allDirect = DEPENDENCY_FIELDS.flatMap(field => Object.keys(site.manifest[field] ?? {}));
      if (allDirect.some(name => !selectedReleases.has(name)))
        throw new TypeError("reviewed selection must bind every direct consumer dependency");
    }
    let packageLock = null, observedLockBytes = null;
    try {
      observedLockBytes = await readFileImpl(join(site.dir, "package-lock.json"), "utf8");
      packageLock = JSON.parse(observedLockBytes);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }

    const registryForName = registryForSite === undefined
      ? registryForPackageName
      : (name => registryForPackageName(name, registryForSite(site)));
    const plan = await planExactDependencyPins(site.manifest, { packageLock, readRegistryPackageImpl, readRegistryPackageVersionImpl, migrateWorkspace, registryForName, selectedReleases });
    const simulated = applyExactDependencyPinPlan(site.manifest, plan);

    const synchronized = synchronizePackageLockRootDependencies(simulated, packageLock);
    const refusals = [...plan.refusals];
    let selectedReceived = false, retainedArtifactCustody = null;
    const receivedArtifacts = [];
    if (apply && selectedReleases !== undefined && refusals.length === 0 &&
        observedLockBytes !== null && synchronized.packageLock !== packageLock) {
      refusals.push({ name: site.manifest.name, spec: site.manifest.version,
        reason: "reviewed selection must not rewrite a native lock; use its original lock fabrication owner" });
    }
    if (apply && selectedReleases !== undefined && refusals.length === 0) {
      // A lock's root manifest is not its resolved dependency graph. Never
      // hand-edit a lock into claiming a different immutable artifact.
      if (packageLock && plan.selectedArtifacts.some(entry => {
        const installed = packageLock.packages?.["node_modules/" + entry.name];
        // A version alone is not an immutable source binding. Missing SHA512
        // or a different resolved artifact URL means the lock must be
        // fabricated again by its native owner, never patched by this planner.
        return !installed || installed.version !== entry.version ||
          installed.integrity !== entry.integrity || installed.resolved !== entry.tarball;
      })) {
        refusals.push({ name: site.manifest.name, spec: site.manifest.version,
          reason: "existing lock requires native regeneration for the reviewed release" });
      } else {
        await mkdir(artifactDirectory, { recursive: true });
        const staging = await mkdtemp(join(artifactDirectory, "reviewed-registry-selection-"));
        try {
          for (const [index, entry] of plan.selectedArtifacts.entries()) {
            try {
              const artifactPath = join(staging, String(index) + ".tgz");
              const received = await receiveRegistryArtifactImpl({
                registry: entry.registry, tarball: entry.tarball, integrity: entry.integrity,
                destination: artifactPath,
              });
              if (received?.artifactDownloaded !== true || received.integrity !== entry.integrity)
                throw new TypeError("artifact not received");
              // The selected receiver must leave actual immutable bytes,
              // rather than only return a plausible success-shaped receipt.
              const actualBytes = await readFile(artifactPath);
              const actualIntegrity = "sha512-" + createHash("sha512").update(actualBytes).digest("base64");
              if (actualIntegrity !== entry.integrity)
                throw new TypeError("received artifact bytes differ from reviewed SHA512");
              receivedArtifacts.push(Object.freeze({
                name: entry.name, version: entry.version, artifactPath,
                integrity: entry.integrity, artifactDownloaded: true,
              }));
            } catch (error) {
              // Receive the live original occurrence before converting failure
              // into serializable refusal. A custom port, validation or file
              // error does not carry the registry owner's private capability.
              let transportReceiving;
              try {
                const { receiveRegistryTransferSettlement } = await import("./registry.mjs");
                transportReceiving = await receiveRegistryTransferSettlement(error, { timeoutMs: 1000 });
                if (transportReceiving.occurrence.registry !== new URL(entry.registry).href.replace(/\/?$/u, "/") ||
                    transportReceiving.occurrence.tarball !== new URL(entry.tarball).href ||
                    transportReceiving.occurrence.integrity !== entry.integrity)
                  throw new TypeError("transfer occurrence does not match selected artifact");
              } catch {
                transportReceiving = Object.freeze({
                  kind: "npm.registry-transfer.receiving-unavailable.v1",
                  reason: "no unambiguous original live transfer observation received",
                  remoteSettlement: false, replayAuthority: false,
                });
              }
              retainedArtifactCustody = Object.freeze({
                directory: staging, state: "retained-unqualified",
                failedArtifact: Object.freeze({ name: entry.name, version: entry.version,
                  registry: entry.registry, tarball: entry.tarball, integrity: entry.integrity }),
                transportReceiving,
              });
              refusals.push({ name: entry.name, spec: entry.version,
                reason: "immutable registry artifact missing or SHA512 receiving failed",
                transportReceiving });
              break;
            }
          }
          selectedReceived = refusals.length === 0;
        } finally {
          // Failed bytes are not a candidate closure. Keep their original
          // custody: even locally observed close is not authority to remove
          // a path still reachable by hidden/late custom-port activity.
          if (!selectedReceived) receivedArtifacts.length = 0;
        }
      }
    }
    let violationsAfter;
    if (apply && refusals.length === 0) {
      if (selection !== undefined) {
        const still = await readFileImpl(site.path, "utf8");
        if (createHash("sha256").update(still).digest("hex") !== selection.consumer.manifestSha256)
          throw new TypeError("reviewed consumer changed after registry receiving");
        let currentLockBytes = null;
        try { currentLockBytes = await readFileImpl(join(site.dir, "package-lock.json"), "utf8"); }
        catch (error) { if (error?.code !== "ENOENT") throw error; }
        if (currentLockBytes !== observedLockBytes)
          throw new TypeError("reviewed consumer lock changed after registry receiving");
      }
      if (JSON.stringify(site.manifest) !== JSON.stringify(simulated)) {
        await writeFileImpl(site.path, `${JSON.stringify(simulated, null, 2)}\n`, "utf8");
      }
      if (synchronized.packageLock !== packageLock) {
        await writeFileImpl(join(site.dir, "package-lock.json"), `${JSON.stringify(synchronized.packageLock, null, 2)}\n`, "utf8");
      }
      const written = JSON.parse(await readFileImpl(site.path, "utf8"));
      const writtenLock = synchronized.packageLock === packageLock
        ? packageLock
        : JSON.parse(await readFileImpl(join(site.dir, "package-lock.json"), "utf8"));
      violationsAfter = dependencySpecificationViolations(written).length
        + (writtenLock === null ? 0 : packageLockRootDependencyViolations(written, writtenLock).length);
    } else {
      violationsAfter = dependencySpecificationViolations(simulated).length
        + (synchronized.packageLock === null ? 0 : packageLockRootDependencyViolations(simulated, synchronized.packageLock).length);
    }

    packages.push({
      path: site.path,
      rewrites: plan.rewrites,
      lockRootRewrites: synchronized.rewrites,
      refusals: Object.freeze(refusals),
      selectedArtifacts: plan.selectedArtifacts,
      receivedArtifacts: Object.freeze(receivedArtifacts),
      selectedReceived,
      retainedArtifactCustody,
      violationsAfter,
      applied: apply && refusals.length === 0,
    });
  }

  const ok = packages.every((entry) => entry.violationsAfter === 0 && entry.refusals.length === 0);
  return {
    kind: "npm-workspace-publication.exact-pin-repair",
    packages,
    ok,
  };
}

