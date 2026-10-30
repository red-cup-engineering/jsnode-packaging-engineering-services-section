import { readRetainedRegistryProjection } from './packed-carrier-archive.mjs';
import { semanticId } from "@red-cup-engineering/computer-content-address-engineering-services-section/semiotic-content-address";
import { sha256Hex } from "@red-cup-engineering/cryptographic-computer-data-engineering-services-section/integrity";
import { base64ToBytes, bytesToBase64 } from "@red-cup-engineering/cryptographic-computer-data-engineering-services-section/portable-bytes";

const sha256 = sha256Hex;
const HEX = /^[a-f0-9]{64}$/u;
const COMMIT = /^[a-f0-9]{40}$/u;
const exactHex = value => typeof value === "string" && HEX.test(value);
const exactSHA512 = value => {
  if (typeof value !== "string" || !value.startsWith("sha512-") || value.length !== 95) return false;
  const encoded = value.slice(7);
  try {
    const bytes = base64ToBytes(encoded);
    return bytes.length === 64 && bytesToBase64(bytes) === encoded;
  } catch { return false; }
};
const executable = (mode) => (mode & 0o111) !== 0;
const fact = value => ["string", "number", "boolean"].includes(typeof value) ? value : null;
const frozen = value => {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) frozen(child);
    Object.freeze(value);
  }
  return value;
};
const literalPath = (path) => typeof path === "string" && path.length > 0
  && !path.startsWith("/") && !/[\\\x00-\x1f\x7f]/u.test(path)
  && !path.split("/").some(part => part === "" || part === "." || part === "..");

function exactFields(value, allowed, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} requires a record`);
  for (const key of Object.keys(value)) if (!allowed.includes(key)) throw new TypeError(`${label} has an unexpected evidence field: ${key}`);
}

function members(entries, limits, label) {
  exactFields(limits, ["members", "bytes"], "limits");
  if (!limits || !Number.isSafeInteger(limits.members) || limits.members < 1
    || !Number.isSafeInteger(limits.bytes) || limits.bytes < 1) throw new TypeError("finite member and byte limits are required");
  if (!Array.isArray(entries) || entries.length > limits.members) throw new TypeError(`${label} exceeds its member bound`);
  const seen = new Set();
  let bytes = 0;
  for (const entry of entries) {
    exactFields(entry, ["path", "kind", "bytes", "sha256", "mode"], label + " member");
    if (!entry || !literalPath(entry.path) || seen.has(entry.path)) throw new TypeError(`${label} has an unsafe or duplicate path`);
    seen.add(entry.path);
    if (entry.kind !== "file") throw new TypeError(`${label} requires regular files, not links or special members`);
    if (!exactHex(entry.sha256) || !Number.isSafeInteger(entry.bytes) || entry.bytes < 0
      || !Number.isSafeInteger(entry.mode) || entry.mode < 0 || entry.mode > 0o777) throw new TypeError(`${label} has an invalid file identity or mode`);
    bytes += entry.bytes;
    if (!Number.isSafeInteger(bytes) || bytes > limits.bytes) throw new TypeError(`${label} exceeds its byte bound`);
  }
  return entries.map(({ path, kind, bytes, sha256, mode }) => ({ path, kind, bytes, sha256, mode }))
    .sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
}

function manifestText(text, entries, label) {
  if (typeof text !== "string") throw new TypeError(`${label} manifestText is required`);
  const member = entries.find(entry => entry.path === "package.json");
  if (!member || text.length > member.bytes || member.bytes !== Buffer.byteLength(text)
    || member.sha256 !== sha256(text)) throw new TypeError(`${label} manifest bytes do not match its member identity`);
  const value = JSON.parse(text);
  manifestIdentity(value);
  return value;
}

function binTargets(manifest) {
  const bins = typeof manifest.bin === "string"
    ? [[manifest.name.split("/").at(-1), manifest.bin]] : Object.entries(manifest.bin ?? {});
  return bins.map(([name, path]) => {
    if (typeof name !== "string" || name === "" || typeof path !== "string") throw new TypeError("invalid bin declaration");
    const target = path.replace(/^\.\//u, "");
    if (!literalPath(target)) throw new TypeError("bin target is not package-relative");
    return { name, target };
  });
}

/** Pure validation of scanner-held equality plus supplied native context, not native authority. */
export function receiveRegistryProjectionComparisonContext(sourceArchive, projection, installation, binding) {
  const retained = readRetainedRegistryProjection(sourceArchive, projection);
  if (!exactSHA512(sourceArchive.integrity)) throw new TypeError('verified compressed integrity required');
  const v2 = binding?.version === 2;
  const common = ['version','profile','integrity','expandedSHA256','rawInventorySHA256','projectionSHA256','managerEntrySHA256','managerDistributionSHA256','workerSHA256','requestSHA256','receiptSHA256','platform','normalization','ignorePolicy','lifecycleScripts','hooks','storeAllocationSHA256','cafsLifetime'];
  const additional = v2 ? ['routeSet','routeEvidence','observedRoute','allocatedStoreRoot','allocatedStoreBase','effectiveStoreRoot','storeBeforeSHA256','storeAfterSHA256','configSHA256','lockSHA256','sideEffectsCacheRead','remoteSideEffects','patches','alternateManifestTransforms'] : ['route','storeRoot'];
  exactFields(binding, [...common, ...additional], 'registry projection binding');
  for (const key of ['expandedSHA256','rawInventorySHA256','projectionSHA256','managerEntrySHA256','managerDistributionSHA256','workerSHA256','requestSHA256','receiptSHA256','storeAllocationSHA256', ...(v2 ? ['storeBeforeSHA256','storeAfterSHA256','configSHA256','lockSHA256'] : [])]) if (!exactHex(binding[key])) throw new TypeError('exact registry projection binding hash required: ' + key);
  const absolute = path => typeof path === 'string' && path.startsWith('/') && literalPath(path.slice(1));
  const domain = v2
    ? binding.routeSet === 'pnpm11-registry-cafs-and-link-v1' && binding.routeEvidence === 'source-qualified-closed-set'
      // This version has no runtime branch-observation producer. Do not infer one.
      && binding.observedRoute === null && binding.cafsLifetime === 'fresh-cli-worker-pool/private-allocation'
      && absolute(binding.allocatedStoreRoot) && absolute(binding.allocatedStoreBase) && absolute(binding.effectiveStoreRoot)
      && binding.allocatedStoreBase === binding.allocatedStoreRoot + '/pnpm-store'
      && binding.effectiveStoreRoot === binding.allocatedStoreBase + '/v11'
      && binding.lockSHA256 === installation?.lockSHA256
      && binding.sideEffectsCacheRead === false && binding.remoteSideEffects === false
      && binding.patches === false && binding.alternateManifestTransforms === false
    : binding.version === 1 && ['buffer-map','file-stream'].includes(binding.route)
      && ['fresh-cli-private-store','qualified-retained-instance'].includes(binding.cafsLifetime) && absolute(binding.storeRoot);
  if (!domain || binding.profile !== projection.profile || binding.integrity !== sourceArchive.integrity
    || binding.expandedSHA256 !== sourceArchive.expandedSHA256 || binding.rawInventorySHA256 !== sourceArchive.rawInventorySHA256 || binding.projectionSHA256 !== projection.projectionSHA256
    || binding.managerEntrySHA256 !== 'ff3224d46b47fbb24a7e9fe15fededef7e00892d07d4e376b6762d4899906bfd'
    || binding.managerDistributionSHA256 !== 'e3738fda08262f74611d7a1ffc11b3e87fa52b466c07eb73211d179ebcb98810'
    || binding.workerSHA256 !== '5878ae8493ead2e083a4fbf33844d2d463ecebb1a1cd3fc86c04be16721bf156'
    || installation?.manager?.name !== 'pnpm' || installation.manager.version !== '11.28.5'
    || binding.managerEntrySHA256 !== installation.manager.entrySHA256 || binding.requestSHA256 !== installation.requestSHA256 || binding.receiptSHA256 !== installation.receiptSHA256
    || binding.platform !== 'linux' || installation.platform !== 'linux' || binding.normalization !== 'pnpm11-posix-registry-files-v1'
    || binding.ignorePolicy !== 'none' || binding.lifecycleScripts !== false || binding.hooks !== false) throw new TypeError('unqualified registry projection native binding');
  return {...retained, integrity:sourceArchive.integrity, binding:JSON.parse(JSON.stringify(binding))};
}

/** Pure comparisons of caller-received native facts; no acquisition or installation. */
function admitMemberStage(input) {
  const { stage, registry, limits } = input;
  const projected = stage === 'projection-installed';
  exactFields(input, ['stage','registry','limits', ...(projected ? ['sourceArchive','projection','projectionBinding','installed','installation'] : ['archive', ...(stage === 'source-archive' ? ['source','publisher'] : ['installed','installation'])])], 'partial stage');
  const retained = projected ? receiveRegistryProjectionComparisonContext(input.sourceArchive, input.projection, input.installation, input.projectionBinding) : null;
  const expected = projected ? {integrity:retained.integrity, manifestText:retained.projection.manifestText, members:retained.projection.members} : input.archive;
  if (!projected) exactFields(expected, ['integrity','manifestText','members'], 'archive');
  if (typeof registry !== "string" || registry === "" || !expected
    || !exactSHA512(expected.integrity)) throw new TypeError("registry and exact canonical SHA512 archive identity are required");
  const packed = members(expected.members, limits, projected ? "projection" : "archive");
  if (projected) {
    if (retained.binding.version === 2 && (limits.members > 65536 || limits.bytes > 1024 * 1024 * 1024)) throw new TypeError('v2 projection receiving limits exceed native composition');
    const rawCount = retained.sourceArchive.occurrences.length + retained.sourceArchive.extensions.length;
    const rawBytes = retained.sourceArchive.occurrences.reduce((sum, row) => sum + (row.interpretedKind === 'File' ? row.effectiveSize : 0), 0);
    if (rawCount > limits.members || !Number.isSafeInteger(rawBytes) || rawBytes > limits.bytes) throw new TypeError('original occurrence budget exceeds projection comparison limits');
  }
  const packedManifest = manifestText(expected.manifestText, packed, projected ? "projection" : "archive");
  const findings = [];
  const at = { registry, package: packedManifest.name, releaseVersion: packedManifest.version, integrity: expected.integrity };
  let compared, evidence;
  if (stage === "source-archive") {
    const { source, publisher } = input;
    exactFields(source, ["repository", "commit", "manifestText", "members"], "source");
    if (publisher !== undefined) exactFields(publisher, ["gitHead", "format"], "publisher");
    if (!source || typeof source.repository !== "string" || !source.repository || (typeof source.commit !== "string" || !COMMIT.test(source.commit))) throw new TypeError("immutable source repository and commit are required");
    compared = members(source.members, limits, "source");
    const sourceManifest = manifestText(source.manifestText, compared, "source");
    let expectedManifest = source.manifestText;
    if (publisher && (publisher.gitHead !== source.commit || publisher.gitHead !== packedManifest.gitHead || publisher.format !== "json-2-newline")) {
      findings.push({ code: "publisher-git-head-mismatch", path: "package.json" });
    }
    if (source.manifestText !== expected.manifestText) {
      if (!publisher || publisher.gitHead !== source.commit || publisher.format !== "json-2-newline") {
        findings.push({ code: "unreceived-manifest-projection", path: "package.json" });
      } else {
        expectedManifest = `${JSON.stringify({ ...sourceManifest, gitHead: publisher.gitHead }, null, 2)}\n`;
        if (expectedManifest !== expected.manifestText) findings.push({ code: "manifest-projection-mismatch", path: "package.json" });
      }
    }
    if (sourceManifest.name !== packedManifest.name || sourceManifest.version !== packedManifest.version) findings.push({ code: "manifest-release-mismatch", path: "package.json" });
    evidence = { source: { repository: source.repository, commit: source.commit }, publisher: publisher ? { gitHead: fact(publisher.gitHead), format: fact(publisher.format) } : null,
      sourceManifestSHA256: sha256(source.manifestText), expectedManifestSHA256: sha256(expectedManifest) };
    compared = compared.map(entry => entry.path === "package.json"
      ? { ...entry, sha256: sha256(expectedManifest), bytes: Buffer.byteLength(expectedManifest) } : entry);
  } else {
    const { installed, installation } = input;
    if (!installed) throw new TypeError("installed members are required");
    exactFields(installed, ["manifestText", "members"], "installed");
    if (installation !== undefined) {
      exactFields(installation, ["kind", "status", "platform", "manager", "requestSHA256", "receipt", "receiptSHA256", "manifestSHA256", "lockSHA256", "installedManifestSHA256", "artifactIntegrity", "package", "version", "normalization", "operation", "umask", "normalizationProvider", "bins"], "installation");
      if (installation.manager !== undefined) exactFields(installation.manager, ["name", "version", "entrySHA256"], "manager");
      if (installation.normalizationProvider !== undefined) exactFields(installation.normalizationProvider, ["path", "sha256"], "normalization provider");
      if (Array.isArray(installation.bins)) for (const bin of installation.bins) exactFields(bin, ["name", "target", "registered", "targetSHA256"], "native bin");
    }
    compared = members(installed.members, limits, "installed");
    manifestText(installed.manifestText, compared, "installed");
    if (installed.manifestText !== expected.manifestText) findings.push({ code: "installed-manifest-mismatch", path: "package.json" });
    // A declaration or extract is not a package-manager effect. The native
    // adapter owns and retains this exact operation/provider/lock receipt.
    if (!installation || installation.kind !== "native-package-installation" || installation.status !== 0
      || !["npm", "pnpm"].includes(installation.manager?.name)
      || typeof installation.manager.version !== "string" || !installation.manager.version
      || !exactHex(installation.manager.entrySHA256)
      || !exactHex(installation.requestSHA256)
      || !exactHex(installation.receiptSHA256) || typeof installation.receipt !== "string" || !installation.receipt
      || !exactHex(installation.manifestSHA256) || !exactHex(installation.lockSHA256)
      || !exactHex(installation.installedManifestSHA256)
      || installation.artifactIntegrity !== expected.integrity || installation.package !== packedManifest.name
      || installation.version !== packedManifest.version || installation.platform !== "linux") {
      findings.push({ code: "unreceived-native-installation" });
    }
    if (installation?.installedManifestSHA256 !== sha256(expected.manifestText)) findings.push({ code: "installation-manifest-mismatch" });
    const bins = binTargets(packedManifest);
    const seenBins = new Set();
    for (const bin of installation?.bins ?? []) {
      if (seenBins.has(bin.name) || !bins.some(target => target.name === bin.name && target.target === bin.target)) findings.push({ code: "unexpected-native-bin", name: fact(bin.name) });
      seenBins.add(bin.name);
    }
    for (const bin of bins) {
      const received = Array.isArray(installation?.bins)
        ? installation.bins.find(entry => entry?.name === bin.name && entry.target === bin.target && entry.registered === true) : undefined;
      const member = compared.find(entry => entry.path === bin.target);
      if (!received || !member || !executable(member.mode) || received.targetSHA256 !== member.sha256) findings.push({ code: "unreceived-installed-bin", path: bin.target, name: bin.name });
    }
    evidence = { installation: installation ? {
      kind: fact(installation.kind), status: fact(installation.status), platform: fact(installation.platform),
      manager: installation.manager ? { name: fact(installation.manager.name), version: fact(installation.manager.version), entrySHA256: fact(installation.manager.entrySHA256) } : null,
      receipt: fact(installation.receipt), receiptSHA256: fact(installation.receiptSHA256),
      requestSHA256: fact(installation.requestSHA256),
      manifestSHA256: fact(installation.manifestSHA256), lockSHA256: fact(installation.lockSHA256),
      installedManifestSHA256: fact(installation.installedManifestSHA256),
      artifactIntegrity: fact(installation.artifactIntegrity), package: fact(installation.package), version: fact(installation.version),
      normalization: fact(installation.normalization),
      operation: fact(installation.operation), umask: fact(installation.umask),
      normalizationProvider: installation.normalizationProvider ? { path: fact(installation.normalizationProvider.path), sha256: fact(installation.normalizationProvider.sha256) } : null,
      bins: Array.isArray(installation.bins) ? installation.bins.map(entry => ({ name: fact(entry?.name), target: fact(entry?.target), registered: fact(entry?.registered), targetSHA256: fact(entry?.targetSHA256) })) : [],
    } : null, modeChanges: [] };
  }
  const archiveMap = new Map(packed.map(entry => [entry.path, entry]));
  const comparedMap = new Map(compared.map(entry => [entry.path, entry]));
  for (const entry of compared) {
    const other = archiveMap.get(entry.path);
    if (!other) { findings.push({ code: stage === "source-archive" ? "absent-from-archive" : "extra-installed-member", path: entry.path }); continue; }
    if (entry.sha256 !== other.sha256 || entry.bytes !== other.bytes) findings.push({ code: "payload-mismatch", path: entry.path });
    if (stage === "source-archive") {
      if (executable(entry.mode) !== executable(other.mode)) findings.push({ code: "source-executable-intent-mismatch", path: entry.path });
    } else if (entry.mode !== other.mode) {
      const bin = binTargets(packedManifest).some(bin => bin.target === entry.path);
      const lost = executable(other.mode) && !executable(entry.mode);
      const acquired = !executable(other.mode) && executable(entry.mode);
      // One finite, witnessed POSIX projection, not an arbitrary chmod map.
      // Preserve all complete observed modes and its native context receipt.
      const native = input.installation;
      const pnpmProjection = native?.manager?.name === "pnpm"
        && native.normalization === "posix-package-files-0644-0755"
        && entry.mode === (executable(other.mode) || bin ? 0o755 : 0o644);
      // Native npm file-directory linking preserves non-bin file modes;
      // bin-links applies exactly 0777 & ~umask to its registered targets.
      // The adapter receives this primitive from the actual manager closure.
      const npmBinProjection = bin && native?.manager?.name === "npm"
        && native.normalization === "npm-file-directory-bin-umask"
        && native.operation === "npm-ci-file-directory"
        && Number.isSafeInteger(native.umask) && native.umask >= 0 && native.umask <= 0o777
        && native.normalizationProvider?.path === "bin-links/lib/fix-bin.js"
        && exactHex(native.normalizationProvider.sha256)
        && entry.mode === (0o777 & ~native.umask);
      const normalized = pnpmProjection || npmBinProjection;
      if (lost || (acquired && !bin) || !normalized) findings.push({ code: "unreceived-installed-mode", path: entry.path });
      evidence.modeChanges.push({ path: entry.path, ...(projected ? {projectedMode:other.mode} : {archiveMode:other.mode}), installedMode: entry.mode,
        executablePromotion: acquired, declaredBin: bin, normalization: normalized });
    }
  }
  for (const entry of packed) if (!comparedMap.has(entry.path)) findings.push({ code: stage === "source-archive" ? "extra-archive-member" : "absent-from-installed-package", path: entry.path });
  if (projected) evidence.registryProjection = {sourceArchive:{integrity:retained.integrity, expandedSHA256:retained.sourceArchive.expandedSHA256, rawInventorySHA256:retained.sourceArchive.rawInventorySHA256}, profile:retained.projection.profile, projectionSHA256:retained.projection.projectionSHA256, binding:retained.binding};
  const type = projected ? 'RegistryProjectionInstalledAdmission' : 'ArtifactMemberAdmission';
  const inventory = projected ? {projectedMembers:packed} : {archive:packed};
  const identity = semanticId({ type, version: 1, stage, ...at, ...inventory, compared, evidence });
  if (findings.length) return frozen({ ok: false, refusal: { code: "artifact-member-mismatch", identity, stage, findings } });
  return frozen({ ok: true, value: { type, version: 1, stage, identity,
    ...at, ...inventory, compared, evidence, installationClaimed: stage === "archive-installed" || projected } });
}

function inventory(value, name) {
  if (!Array.isArray(value) || value.some((path) => typeof path !== "string" || path === "")) {
    throw new TypeError(`${name} must be an array of nonempty paths`);
  }
  return Object.freeze([...new Set(value)].sort());
}

function difference(left, right) {
  const rightSet = new Set(right);
  return Object.freeze(left.filter((value) => !rightSet.has(value)));
}

function manifestIdentity(manifest) {
  if (manifest === null || typeof manifest !== "object" || Array.isArray(manifest)
    || typeof manifest.name !== "string" || manifest.name === ""
    || typeof manifest.version !== "string" || manifest.version === "") {
    throw new TypeError("artifact manifest must name a package and immutable version");
  }
  return semanticId(manifest);
}

/**
 * Preserve the original inventory-release comparison contract.
 *
 * With no explicit stage, matching manifests, path inventories and supplied
 * import-row structure remain version-1 observations. They do not establish
 * payload bytes, native installation effects or complete declared imports.
 * Byte/native receiving uses the explicit partial stages above. The caller
 * owns all effects and custody; neither result authenticates those facts.
 */
export function admitArtifactRelease(input = {}) {
  if (input.stage !== undefined) {
    if (!["source-archive", "archive-installed", "projection-installed"].includes(input.stage)) throw new TypeError("unknown artifact comparison stage");
    return admitMemberStage(input);
  }
  const { registry, manifest, tarballManifest, tarballInventory, installedManifest, installedInventory, imports } = input;
  if (typeof registry !== "string" || registry === "") throw new TypeError("registry is required");
  const sourceManifestIdentity = manifestIdentity(manifest);
  const tarballManifestIdentity = manifestIdentity(tarballManifest);
  const installedManifestIdentity = manifestIdentity(installedManifest);
  const packed = inventory(tarballInventory, "tarballInventory");
  const installed = inventory(installedInventory, "installedInventory");
  if (!Array.isArray(imports) || imports.some((entry) => !entry || typeof entry.specifier !== "string" || entry.specifier === "" || entry.status !== "imported" || !Array.isArray(entry.exports))) {
    throw new TypeError("imports must record each declared export as imported");
  }
  const releaseIdentity = semanticId(Object.freeze({
    type: "ArtifactRelease",
    version: 1,
    registry,
    package: manifest.name,
    releaseVersion: manifest.version,
    manifest: sourceManifestIdentity,
  }));
  const refusal = Object.freeze({
    manifestMismatch: sourceManifestIdentity !== tarballManifestIdentity || sourceManifestIdentity !== installedManifestIdentity,
    inventory: Object.freeze({
      absentFromTarball: difference(installed, packed),
      absentFromInstalledPackage: difference(packed, installed),
    }),
  });
  if (tarballManifest.name !== manifest.name || tarballManifest.version !== manifest.version
    || installedManifest.name !== manifest.name || installedManifest.version !== manifest.version
    || refusal.manifestMismatch || refusal.inventory.absentFromTarball.length > 0 || refusal.inventory.absentFromInstalledPackage.length > 0) {
    return Object.freeze({ ok: false, refusal: Object.freeze({ code: "artifact-release-mismatch", releaseIdentity, ...refusal }) });
  }
  return Object.freeze({ ok: true, value: Object.freeze({
    type: "ArtifactRelease",
    version: 1,
    identity: releaseIdentity,
    registry,
    package: manifest.name,
    releaseVersion: manifest.version,
    manifest: Object.freeze({ identity: sourceManifestIdentity, value: manifest }),
    tarball: Object.freeze({ manifestIdentity: tarballManifestIdentity, inventory: packed }),
    installed: Object.freeze({ manifestIdentity: installedManifestIdentity, inventory: installed }),
    imports: Object.freeze(imports.map((entry) => Object.freeze({ specifier: entry.specifier, status: entry.status, exports: Object.freeze([...entry.exports].sort()) }))),
  }) });
}
