import { isExactSemver } from "./dependency-policy.mjs";
const DEPENDENCY_FIELDS = Object.freeze([
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
]);

const CORE_SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u;
const DEVELOPMENT_SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)-([A-Za-z][0-9A-Za-z-]*)\.(0|[1-9]\d*)$/u;

export function classifyReleaseVersion(version) {
  let match = CORE_SEMVER.exec(version);
  if (match) return Object.freeze({ version, kind: "stable", base: version, major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]), channel: "latest", sequence: null });
  match = DEVELOPMENT_SEMVER.exec(version);
  if (!match) throw new Error(`version must be stable X.Y.Z or development X.Y.Z-tag.N: ${version}`);
  return Object.freeze({
    version, kind: "prerelease", base: `${match[1]}.${match[2]}.${match[3]}`,
    major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]),
    channel: match[4], sequence: Number(match[5]),
  });
}

export function incrementReleaseBase(version, bump = "patch") {
  const parsed = classifyReleaseVersion(version);
  if (!["major", "minor", "patch"].includes(bump)) throw new Error(`release bump must be major, minor, or patch: ${bump}`);
  // The house is deliberately pre-1.0. A breaking release advances the
  // minor coordinate under SemVer's 0.x rules; no routine command may cross
  // that boundary by accident.
  if (bump === "major") return parsed.major === 0 ? `0.${parsed.minor + 1}.0` : `${parsed.major + 1}.0.0`;
  if (bump === "minor") return `${parsed.major}.${parsed.minor + 1}.0`;
  return `${parsed.major}.${parsed.minor}.${parsed.patch + 1}`;
}

/**
 * Decide whether a declared release bump can carry the classified change.
 * SemVer treats 0.x minor releases as the breaking boundary; after 1.0 that
 * boundary is major.  House publication policy may impose stricter limits
 * separately through `assertHousePublicationVersion`.
 */
export function releaseBumpAllowsChange(version, bump, change) {
  const parsed = classifyReleaseVersion(version);
  if (change !== "breaking") return bump === "patch" || bump === "minor" || bump === "major";
  return parsed.major === 0 ? bump === "minor" : bump === "major";
}

export function publicationTagForVersion(version, requestedTag) {
  const parsed = classifyReleaseVersion(version);
  return requestedTag ?? parsed.channel;
}

const HOUSE_SCOPES = new Set(["@561-group", "@causeway-services", "@coesite-operations", "@emsenn", "@emsweb", "@harmonious-union", "@koios-news", "@lenticule-science", "@red-cup-engineering", "@red-cup-science", "@rsc-quiescent", "@turntide-islands", "@union-officer-academy"]);

/** Refuse the house's accidental stable-1.0 boundary without regulating upstream npm packages. */
export function assertHousePublicationVersion(name, version) {
  const scope = typeof name === "string" && name.startsWith("@") ? name.slice(0, name.indexOf("/")) : null;
  if (HOUSE_SCOPES.has(scope) && classifyReleaseVersion(version).major >= 1) throw new Error(`house publication version must remain below 1.0.0: ${name}@${version}`);
}

export function nextPrereleaseVersion(version, channel, occupied = new Set(), bump = "patch") {
  if (!/^[A-Za-z][0-9A-Za-z-]*$/u.test(channel ?? "")) throw new Error(`development channel must be one nonnumeric SemVer identifier: ${channel}`);
  const parsed = classifyReleaseVersion(version);
  if (parsed.kind === "prerelease" && !occupied.has(version) && parsed.channel === channel) return version;
  const base = parsed.kind === "stable" ? nextUnoccupiedReleaseBase(parsed.base, occupied, bump) : parsed.base;
  let sequence = 0;
  for (const candidate of occupied) {
    const match = DEVELOPMENT_SEMVER.exec(candidate);
    if (match && `${match[1]}.${match[2]}.${match[3]}` === base && match[4] === channel) sequence = Math.max(sequence, Number(match[5]) + 1);
  }
  return `${base}-${channel}.${sequence}`;
}

function nextUnoccupiedReleaseBase(version, occupied, bump) {
  let candidate = incrementReleaseBase(version, bump);
  while (occupied.has(candidate)) candidate = incrementReleaseBase(candidate, bump);
  return candidate;
}

export function nextPatchVersion(version, occupied = new Set()) {
  const parsed = classifyReleaseVersion(version);
  if (parsed.kind !== "stable") throw new Error(`cannot patch-bump non-core semver: ${version}`);
  let candidate = incrementReleaseBase(version, "patch");
  while (occupied.has(candidate)) candidate = incrementReleaseBase(candidate, "patch");
  return candidate;
}

export function nextStableVersion(version, occupied = new Set(), bump = "patch") {
  const parsed = classifyReleaseVersion(version);
  if (parsed.kind !== "stable") throw new Error(`cannot bump non-stable version: ${version}`);
  let candidate = incrementReleaseBase(version, bump);
  while (occupied.has(candidate)) candidate = incrementReleaseBase(candidate, bump);
  return candidate;
}
/** Compute the fixed point of an immutable-registry release. */
export function planReleaseWave(packages, changedNames, occupiedByName, { releaseKind = "stable", channel: requestedChannel, bump = "patch", promotionAdmissions = new Map() } = {}) {
  if (!["stable", "prerelease"].includes(releaseKind)) throw new Error(`release kind must be stable or prerelease: ${releaseKind}`);
  const channel = releaseKind === "prerelease" ? requestedChannel ?? "dev" : requestedChannel;
  if (releaseKind === "stable" && channel !== undefined) throw new Error("stable waves do not take a development channel");
  const byName = new Map();
  for (const entry of packages) {
    if (byName.has(entry.name)) throw new Error(`active package identity is duplicated: ${entry.name}`);
    byName.set(entry.name, entry);
  }

  const targets = new Map();
  const changed = new Set(changedNames);
  const assignTarget = (name) => {
    if (targets.has(name)) return;
    const entry = byName.get(name);
    if (!entry || entry.private) return;
    const occupied = occupiedByName.get(name) ?? new Set();
    let target;
    if (releaseKind === "prerelease") target = nextPrereleaseVersion(entry.version, channel, occupied, bump);
    else {
      const parsed = classifyReleaseVersion(entry.version);
      if (parsed.kind === "prerelease") {
        if (!occupied.has(entry.version)) throw new Error(`cannot promote ${entry.name}@${entry.version}: exact prerelease is absent from the authoritative registry`);
        if (occupied.has(parsed.base)) throw new Error(`cannot promote ${entry.name}@${entry.version}: stable target ${parsed.base} is already occupied`);
        const admission = promotionAdmissions.get(entry.name);
        if (admission?.prerelease !== entry.version || admission?.outcome !== "carrier-verified" || typeof admission?.receipt !== "string" || admission.receipt === "") {
          throw new Error(`cannot promote ${entry.name}@${entry.version}: matching carrier-verified promotion admission is required`);
        }
        target = parsed.base;
      } else target = occupied.has(entry.version) ? nextStableVersion(entry.version, occupied, bump) : entry.version;
    }
    targets.set(name, target);
  };
  for (const name of changed) assignTarget(name);

  const edits = new Map();
  let advanced = true;
  while (advanced) {
    advanced = false;
    for (const entry of packages) {
      for (const field of DEPENDENCY_FIELDS) {
        for (const [dependency, specification] of Object.entries(entry.manifest[field] ?? {})) {
          const target = targets.get(dependency);
          if (target === undefined || target === specification) continue;
          const key = `${entry.name}\u0000${field}\u0000${dependency}`;
          if (edits.has(key)) continue;
          edits.set(key, Object.freeze({ consumer: entry.name, field, dependency, from: specification, to: target }));
          changed.add(entry.name);
          const before = targets.size;
          assignTarget(entry.name);
          if (targets.size !== before) advanced = true;
        }
      }
    }
  }

  return Object.freeze({
    releaseKind,
    channel: releaseKind === "prerelease" ? channel : "latest",
    bump,
    targets: Object.freeze([...targets].map(([name, version]) => Object.freeze({
      name,
      from: byName.get(name).version,
      to: version,
      bumped: byName.get(name).version !== version,
    }))),
    dependencyEdits: Object.freeze([...edits.values()]),
    changedNames: Object.freeze([...changed].sort()),
  });
}


// A quarantined immutable name is occupied, never an admissible supplier.
// Receive only the registry owner's package-bound conflict extension; do not
// turn malformed/foreign evidence into an apparently free version namespace.
export function occupiedVersionNames(name, packument, origin) {
  if (packument === null) return [];
  const record = value => value !== null && typeof value === "object" && !Array.isArray(value);
  const exact = (value, keys) => record(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
  const refuse = () => { throw new Error("registry conflict occupancy is not qualified for " + name); };
  if (!record(packument) || packument.name !== name || !record(packument.versions)) refuse();
  const published = new Set(Object.keys(packument.versions));
  if (!Object.hasOwn(packument, "x-561-registry-conflicts")) return [...published];
  const conflicts = packument["x-561-registry-conflicts"];
  if (!Array.isArray(conflicts)) refuse();
  const held = new Set();
  for (const conflict of conflicts) {
    if (!exact(conflict, ["version", "evidence", "identities"]) || typeof conflict.version !== "string" || !isExactSemver(conflict.version)
        || held.has(conflict.version) || published.has(conflict.version)
        || !exact(conflict.evidence, ["recordSha256", "work"]) || typeof conflict.evidence.recordSha256 !== "string"
        || !/^[a-f0-9]{64}$/u.test(conflict.evidence.recordSha256)
        || typeof conflict.evidence.work !== "string" || !conflict.evidence.work.startsWith("https://github.com/")
        || !Array.isArray(conflict.identities) || conflict.identities.length !== 2) refuse();
    const authorities = new Set();
    for (const identity of conflict.identities) {
      if (!exact(identity, ["authority", "manifestSha256", "integrity", "gitHead", "tarball"])
          || !["native", "canonical-r2"].includes(identity.authority) || authorities.has(identity.authority)
          || typeof identity.manifestSha256 !== "string" || !/^[a-f0-9]{64}$/u.test(identity.manifestSha256)
          || !(identity.gitHead === null || (typeof identity.gitHead === "string" && /^[a-f0-9]{40}$/u.test(identity.gitHead)))
          || typeof identity.tarball !== "string"
          || typeof identity.integrity !== "string" || !identity.integrity.startsWith("sha512-")) refuse();
      const encoded = identity.integrity.slice(7), bytes = Buffer.from(encoded, "base64");
      if (bytes.length !== 64 || bytes.toString("base64") !== encoded) refuse();
      let url;
      try { url = new URL(identity.tarball); } catch { refuse(); }
      if (url.origin !== origin || url.username || url.password || url.search || url.hash
          || decodeURIComponent(url.pathname) !== "/" + name + "/-/" + name.split("/").pop() + "-" + conflict.version + ".tgz") refuse();
      authorities.add(identity.authority);
    }
    const [a, b] = conflict.identities;
    if (a.manifestSha256 === b.manifestSha256 && a.integrity === b.integrity && a.gitHead === b.gitHead) refuse();
    held.add(conflict.version);
  }
  return [...published, ...held];
}

/** Select only the source owner's declared version; this plan grants no PUT. */
export function planLandedPackageRelease({ declared, published }) {
  if (!isExactSemver(declared)) throw new TypeError("landed publication source is not a SemVer version or supported development version");
  if (!Array.isArray(published) || published.length > 100000 || published.some(version => !isExactSemver(version)))
    throw new TypeError("landed publication requires a bounded exact occupied-version set");
  const release = classifyReleaseVersion(declared.replace(/\+.*$/u, ""));
  return Object.freeze({ version: declared, tag: release.channel,
    kind: published.includes(declared) ? "occupied" : "release" });
}
