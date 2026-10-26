import { boundedClone } from './native-metadata-data.mjs';
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import semver from 'semver';

const sha = value => createHash('sha256').update(value).digest('hex');
const namePattern = /^(?:@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*|[a-z0-9][a-z0-9._-]*)$/u;
const json = value => JSON.stringify(value, null, 2) + '\n';
const policyKeys = new Set(['minimumReleaseAge', 'minimumReleaseAgeStrict', 'minimumReleaseAgeExclude',
  'trustPolicy', 'trustPolicyExclude', 'trustPolicyIgnoreAfter', 'blockExoticSubdeps']);
const freeze = value => { if (value && typeof value === 'object') { for (const child of Object.values(value)) freeze(child); Object.freeze(value); } return value; };
function clone(value) { return boundedClone(value, 4 * 1024 * 1024); }
function boundedPolicy(input) {
  const policy = boundedClone(input, 65536);
  if (!policy || Array.isArray(policy) || typeof policy !== 'object' || Object.keys(policy).some(key => !policyKeys.has(key))
    || !Number.isSafeInteger(policy.minimumReleaseAge) || policy.minimumReleaseAge <= 0 || policy.minimumReleaseAgeStrict !== true)
    throw new TypeError('explicit unchanged nonzero strict acceptance policy required');
  for (const key of ['minimumReleaseAgeExclude', 'trustPolicyExclude']) if (Object.hasOwn(policy, key)) {
    const values = typeof policy[key] === 'string' ? [policy[key]] : policy[key];
    if (!Array.isArray(values) || values.length > 4096 || values.some(value => typeof value !== 'string' || value.length > 512))
      throw new TypeError('bounded native exclusion strings required');
  }
  if (Object.hasOwn(policy, 'trustPolicy') && !['off', 'no-downgrade'].includes(policy.trustPolicy)) throw new TypeError('native trust policy value required');
  if (Object.hasOwn(policy, 'trustPolicyIgnoreAfter') && (!Number.isSafeInteger(policy.trustPolicyIgnoreAfter) || policy.trustPolicyIgnoreAfter < 0)) throw new TypeError('bounded native trust age required');
  if (Object.hasOwn(policy, 'blockExoticSubdeps') && typeof policy.blockExoticSubdeps !== 'boolean') throw new TypeError('native boolean policy required');
  return policy;
}
function supportedIntegrity(value) {
  if (typeof value !== 'string' || value.length > 4096) return false;
  const tokens = value.split(/\s+/u), lengths = { sha1: 20, sha256: 32, sha384: 48, sha512: 64 };
  if (!tokens.length || tokens.length > 4) return false;
  return tokens.every(token => {
    const match = /^(sha1|sha256|sha384|sha512)-([A-Za-z0-9+/]+={0,2})$/u.exec(token);
    if (!match) return false;
    const bytes = Buffer.from(match[2], 'base64');
    return bytes.length === lengths[match[1]] && bytes.toString('base64') === match[2];
  });
}
function digest(value) { if (typeof value !== 'string' || !/^[a-f0-9]{64}$/u.test(value)) throw new TypeError('canonical SHA256 required'); return value; }
function absolute(path) { if (typeof path !== 'string' || path.length > 4096 || !isAbsolute(path) || resolve(path) !== path || /[\r\n\0]/u.test(path)) throw new TypeError('normalized absolute private path required'); return path; }
function registryURL(registry) {
  if (typeof registry !== 'string' || registry.length > 2048) throw new TypeError('bounded registry required');
  const url = new URL(registry);
  // Deliberately narrow source-derived encoding. Other path/profile shapes need owner reconciliation.
  if (url.href !== registry || url.pathname !== '/' || url.search || url.hash || url.username || url.password
    || !(url.protocol === 'https:' || (url.protocol === 'http:' && url.hostname === '127.0.0.1'))
    || !/^[a-z0-9.-]+$/u.test(url.hostname)) throw new TypeError('credential-free root registry required');
  return url;
}
function nativeMirrorPath(cacheDirectory, url, name, category) {
  const registryKey = `${url.protocol.slice(0, -1)}%3A+${url.hostname}${url.port ? '+' + url.port : ''}`;
  return join(cacheDirectory, 'v12', category, registryKey, name + '.jsonl');
}

/** Pure query projection ONLY. The original owner supplies parsed policy and complete
 * selected records with canonical byte digests. No IO, resolution, or installer graph. */
export function projectNativeMetadataQuery({ name, selections, policy, canonical, registry, directory, cacheDirectory }) {
  if (typeof name !== 'string' || name.length > 214 || !namePattern.test(name)) throw new TypeError('one exact package name required');
  if (!Array.isArray(selections) || !selections.length || selections.length > 4096) throw new TypeError('complete bounded selection inventory required');
  const url = registryURL(registry); absolute(directory); absolute(cacheDirectory);
  const retained = clone(selections), seen = new Set();
  for (const record of retained) {
    if (!record || typeof record.name !== 'string' || record.name.length > 214 || !namePattern.test(record.name) || typeof record.version !== 'string' || record.version.length > 128 || semver.valid(record.version) === null || !/^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u.test(record.version)
      || record.registry !== registry || !supportedIntegrity(record.integrity)
      || record.explicitTarball !== undefined || record.revision !== undefined || record.resolution?.tarball !== undefined || record.resolution?.revision !== undefined)
      throw new TypeError('exact integrity-only canonical selections required; changed artifact fields need re-derivation');
    const key = record.name + '@' + record.version;
    if (seen.has(key)) throw new TypeError('duplicate selected version'); seen.add(key);
  }
  const selected = retained.filter(record => record.name === name);
  if (!selected.length) throw new TypeError('query name absent from original inventory');
  policy = boundedPolicy(policy);
  canonical = boundedClone(canonical, 4096);
  const identity = { sourceHead: canonical?.sourceHead, manifestSHA256: digest(canonical?.manifestSHA256),
    lockSHA256: digest(canonical?.lockSHA256), workspaceSHA256: digest(canonical?.workspaceSHA256),
    registryConfigurationSHA256: digest(canonical?.registryConfigurationSHA256), selectionSHA256: digest(canonical?.selectionSHA256) };
  if (!/^[a-f0-9]{40}$/u.test(identity.sourceHead ?? '')) throw new TypeError('canonical source revision required');
  const representative = selected[0].version;
  const files = {
    'package.json': json({ private: true, dependencies: { [name]: representative } }),
    'pnpm-lock.yaml': json({ lockfileVersion: '9.0', importers: { '.': { dependencies: { [name]: { specifier: representative, version: representative } } } } }),
    // Operational controls are typed YAML numbers, not generic config.* CLI strings.
    'pnpm-workspace.yaml': json({ packages: [], ...clone(policy), fetchRetries: 0, fetchTimeout: 15000, networkConcurrency: 1 }),
    '.npmrc': `registry=${registry}\nupdate-notifier=false\n`,
  };
  const expectedMirrorPath = nativeMirrorPath(cacheDirectory, url, name, 'metadata-full');
  const args = ['outdated', '--compatible', '--format=json', '--use-stderr=true', '--recursive=false', '--global=false', '--include-github-actions=false',
    `--dir=${directory}`, `--config.cache-dir=${cacheDirectory}`, name];
  const projectionBytes = json({ files, identity, retained, directory, cacheDirectory });
  if (Buffer.byteLength(projectionBytes) > 8 * 1024 * 1024) throw new TypeError('projection serialization exceeds bound');
  return freeze({ kind: 'pnpm.native-metadata-query.v1', installableGraph: false, name, registry, representative,
    selectedVersions: selected.map(record => record.version), originalSelections: retained, canonical: identity, policy: clone(policy),
    directory, cacheDirectory, expectedMirrorPath, files, arguments: args,
    projectionSHA256: sha(projectionBytes),
    requiredProvider: { node: '24.19.0', pnpm: '11.28.5', distributionSHA256: 'e3738fda08262f74611d7a1ffc11b3e87fa52b466c07eb73211d179ebcb98810' } });
}

/** At most four exact native aliases; concurrency is bounded by this name count,
 * NOT by networkConcurrency. Full original selection context is retained once. */
export function projectNativeMetadataBatchQuery(input) {
  const value = boundedClone(input, 4 * 1024 * 1024);
  const keys = ['names', 'selections', 'policy', 'canonical', 'registry', 'directory', 'cacheDirectory'];
  const raw = value != null && (Object.hasOwn(value, 'purpose') || Object.hasOwn(value, 'category'));
  const allowed = raw ? [...keys, 'purpose', 'category'] : keys;
  if (!value || Array.isArray(value) || Object.keys(value).length !== allowed.length
    || allowed.some(key => !Object.hasOwn(value, key)) || Object.keys(value).some(key => !allowed.includes(key))
    || !Array.isArray(value.names) || value.names.length < 1 || value.names.length > 4
    || new Set(value.names).size !== value.names.length) throw new TypeError('one to four distinct exact metadata names required');
  if (raw && (value.purpose !== 'raw-registry-metadata-acquisition' || value.category !== 'abbreviated'))
    throw new TypeError('exact paired raw abbreviated metadata purpose required');
  const queries = value.names.map(name => projectNativeMetadataQuery({ ...value, name }));
  const first = queries[0], dependencies = Object.fromEntries(queries.map(query => [query.name, query.representative]));
  if (raw && first.policy.trustPolicy === 'no-downgrade') throw new TypeError('raw abbreviated profile does not support no-downgrade trust');
  const refinement = raw ? {purpose: value.purpose, category: value.category, queryPolicy: {...first.policy, minimumReleaseAge: 0}} : {};
  const files = { ...first.files,
    'package.json': json({ private: true, dependencies }),
    'pnpm-lock.yaml': json({ lockfileVersion: '9.0', importers: { '.': { dependencies: Object.fromEntries(
      queries.map(query => [query.name, { specifier: query.representative, version: query.representative }])) } } }),
  };
  if (raw) files['pnpm-workspace.yaml'] = json({packages: [], ...refinement.queryPolicy, fetchRetries: 0, fetchTimeout: 15000, networkConcurrency: 1});
  const names = [...value.names], members = queries.map(({name, representative, selectedVersions, expectedMirrorPath}) =>
    ({name, representative, selectedVersions, expectedMirrorPath: raw
      ? nativeMirrorPath(first.cacheDirectory, registryURL(first.registry), name, 'metadata')
      : expectedMirrorPath}));
  const projectionBytes = json({ files, identity: first.canonical, retained: first.originalSelections,
    names, directory: first.directory, cacheDirectory: first.cacheDirectory,
    ...(raw ? {...refinement, policy: first.policy} : {}) });
  if (Buffer.byteLength(projectionBytes) > 8 * 1024 * 1024) throw new TypeError('projection serialization exceeds bound');
  return freeze({ kind: 'pnpm.native-metadata-batch-query.v1', installableGraph: false, names, members,
    expectedMirrorPaths: members.map(member => member.expectedMirrorPath), registry: first.registry,
    originalSelections: first.originalSelections, canonical: first.canonical, policy: first.policy,
    ...refinement,
    directory: first.directory, cacheDirectory: first.cacheDirectory, files,
    arguments: [...first.arguments.slice(0, -1), ...names], projectionSHA256: sha(projectionBytes),
    requiredProvider: first.requiredProvider });
}


function readRawMetadataIndex(bytes, name) {
  const newline = bytes.indexOf(10); if (newline < 0 || newline > 128) return { reason: 'indexed-native-format-required' };
  const match = /^pnpm-meta-v1 ([0-9]+) ([0-9]+)$/u.exec(bytes.toString('ascii', 0, newline));
  if (!match) return { reason: 'indexed-native-format-required' };
  const headersLength = Number(match[1]), indexLength = Number(match[2]), indexStart = newline + 1 + headersLength, base = indexStart + indexLength;
  if (!Number.isSafeInteger(base) || headersLength > 65536 || indexLength > 64 * 1024 * 1024 || base > bytes.length) return { reason: 'invalid-bounds' };
  const decode = data => JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(data));
  const headers = decode(bytes.subarray(newline + 1, indexStart));
  const index = decode(bytes.subarray(indexStart, base));
  if (index.name !== name || !Array.isArray(index.versions)) return { reason: 'name-or-index-mismatch' };
  const spans = new Map();
  for (const span of index.versions) {
    if (!Array.isArray(span) || span.length !== 3) return { reason: 'invalid-span' };
    const [version, offset, length] = span;
    if (typeof version !== 'string' || version.length > 128 || spans.has(version) || !Number.isSafeInteger(offset) || !Number.isSafeInteger(length)
      || offset < 0 || length < 1 || length > 16 * 1024 * 1024 || base + offset + length > bytes.length) return { reason: 'invalid-span' };
    spans.set(version, { offset, length });
  }
  return {headers, index, spans, base, decode};
}

/** Diagnostic structural inventory of an ORIGINAL native indexed mirror. This is
 * not PNPM's parser, a cache writer, provenance evidence, or policy acceptance. */
export function inspectRawNativeMetadata(bytes, { name, selectedVersions }) {
  return inspectRawNativeMetadataProfile(bytes, {name, selectedVersions}, false);
}
function inspectRawNativeMetadataProfile(bytes, { name, selectedVersions }, abbreviated) {
  const incomplete = reason => ({ kind: 'raw-coverage-only', complete: false, reason, versions: [] });
  try { selectedVersions = boundedClone(selectedVersions, 4 * 1024 * 1024); } catch { return incomplete('bounded-input-required'); }
  if (!Buffer.isBuffer(bytes) || bytes.length > 64 * 1024 * 1024 || !Array.isArray(selectedVersions)
    || !selectedVersions.length || selectedVersions.length > 4096 || typeof name !== 'string' || name.length > 214 || !namePattern.test(name)
    || selectedVersions.some(version => typeof version !== 'string' || version.length > 128 || semver.valid(version) === null)
    || new Set(selectedVersions).size !== selectedVersions.length) return incomplete('bounded-input-required');
  try {
    const decoded = readRawMetadataIndex(bytes, name);
    if (decoded.reason) return incomplete(decoded.reason);
    const {headers, index, spans, base, decode} = decoded;
    const versions = selectedVersions.map(version => {
      const span = spans.get(version), timestamp = index.time?.[version];
      let fragment = null; if (span) { try { fragment = decode(bytes.subarray(base + span.offset, base + span.offset + span.length)); } catch {} }
      const manifestPresent = Boolean(fragment && typeof fragment === 'object' && !Array.isArray(fragment)
        && fragment.name === name && fragment.version === version);
      const validTimestamp = typeof timestamp === 'string' && timestamp.length <= 64 && Number.isFinite(Date.parse(timestamp));
      return { version, manifestPresent, validTimestamp, timestamp: validTimestamp ? timestamp : null,
        fragmentSHA256: span ? sha(bytes.subarray(base + span.offset, base + span.offset + span.length)) : null };
    });
    const timestampCoverageComplete = versions.every(item => item.validTimestamp);
    const modified = headers?.modified;
    const validModified = typeof modified === 'string' && modified.length <= 64 && Number.isFinite(Date.parse(modified));
    return { kind: 'raw-coverage-only', complete: versions.every(item => item.manifestPresent && (abbreviated || item.validTimestamp)), versions,
      ...(abbreviated ? {timestampCoverageComplete, modified: {present: headers != null && Object.hasOwn(headers, 'modified'),
        validTimestamp: validModified, timestamp: validModified ? modified : null}} : {}) };
  } catch { return incomplete('malformed-native-mirror'); }
}

const statReceipt = stat => Object.fromEntries(['dev', 'ino', 'mode', 'size', 'mtimeNs', 'ctimeNs'].map(key => [key, String(stat[key])]));
/** One bounded exact-path observation after the ORIGINAL producer has settled.
 * No wait, retry, file discovery, native execution, or policy-success promotion. */
export async function receiveNativeMetadataFile(query, { maximumBytes = 64 * 1024 * 1024 } = {}) {
  if (query?.kind !== 'pnpm.native-metadata-query.v1' || !Number.isSafeInteger(maximumBytes) || maximumBytes < 1 || maximumBytes > 64 * 1024 * 1024)
    throw new TypeError('bounded native query receipt required');
  const expected = projectNativeMetadataQuery({ ...query, selections: query.originalSelections });
  if (expected.projectionSHA256 !== query.projectionSHA256 || expected.expectedMirrorPath !== query.expectedMirrorPath) throw new TypeError('query custody changed');
  return observeNativeMetadataFile(expected, maximumBytes);
}

async function observeNativeMetadataFile(expected, maximumBytes, inspect = bytes => ({rawCoverage: inspectRawNativeMetadata(bytes, expected)})) {
  const path = expected.expectedMirrorPath;
  const result = { kind: 'pnpm.native-metadata-file.v1', projectionSHA256: expected.projectionSHA256, path,
    fileObserved: false, nativeReaderConsumed: false, strictPolicyVerified: false, installationReceived: false };
  let handle;
  try {
    const before = await lstat(path, { bigint: true });
    if (!before.isFile() || before.size > BigInt(maximumBytes) || await realpath(path) !== path) return { ...result, reason: 'not-bounded-unredirected-regular-file' };
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const opened = await handle.stat({ bigint: true });
    if (JSON.stringify(statReceipt(before)) !== JSON.stringify(statReceipt(opened))) return { ...result, reason: 'file-changed-before-read' };
    // Fixed-size positional read cannot grow without bound if a writer races this receiver.
    const bytes = Buffer.alloc(Number(opened.size)); let offset = 0;
    while (offset < bytes.length) { const read = await handle.read(bytes, offset, bytes.length - offset, offset); if (!read.bytesRead) break; offset += read.bytesRead; }
    const after = await handle.stat({ bigint: true }), named = await lstat(path, { bigint: true });
    if (offset !== bytes.length || JSON.stringify(statReceipt(opened)) !== JSON.stringify(statReceipt(after))
      || JSON.stringify(statReceipt(after)) !== JSON.stringify(statReceipt(named)) || await realpath(path) !== path)
      return { ...result, reason: 'file-changed-during-read' };
    return { ...result, fileObserved: true, regularFile: true, symlink: false, bytes: bytes.length, sha256: sha(bytes),
      before: statReceipt(before), after: statReceipt(after), ...inspect(bytes) };
  } catch (error) { return { ...result, reason: error.code === 'ENOENT' ? 'missing-native-file' : 'unavailable-native-file' }; }
  finally { await handle?.close(); }
}

function selectedIntegrityCoverage(bytes, member, selections) {
  const unknown = member.selectedVersions.map(version => ({version, integrityMatches: false}));
  try {
    const decoded = readRawMetadataIndex(bytes, member.name);
    if (decoded.reason) return unknown;
    const {spans, base, decode} = decoded;
    return member.selectedVersions.map(version => {
      const span = spans.get(version), selected = selections.find(record => record.name === member.name && record.version === version);
      let manifest; try { if (span) manifest = decode(bytes.subarray(base + span.offset, base + span.offset + span.length)); } catch {}
      return {version, integrityMatches: Boolean(manifest?.name === member.name && manifest?.version === version
        && manifest?.dist?.integrity === selected?.integrity)};
    });
  } catch { return unknown; }
}

/** Read-only complete batch observation, not an atomic snapshot or policy verdict. */
export async function receiveNativeMetadataBatchFiles(query, options = {}) {
  const held = boundedClone(query, 16 * 1024 * 1024, 1048576), bounds = boundedClone(options, 4096);
  if (!bounds || Array.isArray(bounds) || Object.keys(bounds).some(key => key !== 'maximumBytes')) throw new TypeError('bounded batch file options required');
  const maximumBytes = Object.hasOwn(bounds, 'maximumBytes') ? bounds.maximumBytes : 64 * 1024 * 1024;
  if (held?.kind !== 'pnpm.native-metadata-batch-query.v1' || !Number.isSafeInteger(maximumBytes) || maximumBytes < 1 || maximumBytes > 64 * 1024 * 1024)
    throw new TypeError('bounded native batch query receipt required');
  const expected = projectNativeMetadataBatchQuery({ names: held.names, selections: held.originalSelections,
    policy: held.policy, canonical: held.canonical, registry: held.registry, directory: held.directory, cacheDirectory: held.cacheDirectory,
    ...(Object.hasOwn(held, 'purpose') || Object.hasOwn(held, 'category') ? {purpose: held.purpose, category: held.category} : {}) });
  if (!isDeepStrictEqual(expected, held)) throw new TypeError('batch query custody changed');
  const files = [];
  for (const member of expected.members) {
    const observed = await observeNativeMetadataFile({...member, projectionSHA256:expected.projectionSHA256}, maximumBytes, bytes => ({
      rawCoverage: inspectRawNativeMetadataProfile(bytes, member, expected.category === 'abbreviated'), selectedIntegrityCoverage: selectedIntegrityCoverage(bytes, member, expected.originalSelections),
    }));
    files.push({name:member.name, ...observed});
  }
  return freeze({kind:'pnpm.native-metadata-batch-files.v1', projectionSHA256:expected.projectionSHA256, files,
    allFilesObserved:files.every(file => file.fileObserved), nativeReaderConsumed:false, strictPolicyVerified:false, installationReceived:false});
}

export { createNativeMetadataPreparationService, createNativeMetadataBatchPreparationService, receiveNativeTransportEnvironment } from './native-metadata-session.mjs';
