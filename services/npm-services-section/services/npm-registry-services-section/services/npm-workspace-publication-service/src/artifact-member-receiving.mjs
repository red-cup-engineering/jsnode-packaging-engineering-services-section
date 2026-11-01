/** Native observations for the existing pure artifact-release comparison.
 * Reading an archive neither extracts it nor claims native installation.
 */
import { constants } from 'node:fs';
import { open, lstat, readFile, readdir, realpath, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { isAbsolute, join, relative } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { gunzipSync } from 'node:zlib';
import { inspectPackedCarrierArchive } from './packed-carrier-archive.mjs';
import { admitArtifactRelease, receiveRegistryProjectionComparisonContext } from './artifact-release.mjs';
import { carrierSourceIncludes } from './carrier-surface.mjs';
import { npmPackResult } from './npm-pack-result.mjs';
import { preparePublicationCarrierManifest } from './publication-carrier-manifest.mjs';
import { receiveQualifiedPublicationBuildProducts } from './source-build-qualification.mjs';
const run = promisify(execFile);

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const decode = bytes => new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
const fail = (message, code = 'artifact-member-receiving-refused') => Object.assign(new TypeError(message), { code });
function fields(value, names, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !names.includes(key)))
    throw fail(label + ' requires its exact native receiving fields');
}
function bounds(value) {
  const ceilings = { members: 100000, bytes: 256 * 1024 * 1024, archiveBytes: 64 * 1024 * 1024,
    tarBytes: 256 * 1024 * 1024, metadataBytes: 1024 * 1024, sourcePaths: 1000000, sourceRepositories: 4096 };
  fields(value, Object.keys(ceilings), 'limits');
  for (const [name, ceiling] of Object.entries(ceilings)) if (!Number.isSafeInteger(value[name]) || value[name] < 1 || value[name] > ceiling)
    throw fail('finite native receiving bound required: ' + name);
  return value;
}
function literal(path) {
  return typeof path === 'string' && path.length > 0 && !path.startsWith('/') && !/[\\\x00-\x1f\x7f]/u.test(path)
    && !path.split('/').some(part => !part || part === '.' || part === '..');
}
const member = (path, bytes, mode) => ({ path, kind: 'file', bytes: bytes.length, sha256: sha256(bytes), mode });
const statIdentity = value => [value.dev, value.ino, value.size, value.mtimeNs, value.ctimeNs].map(String);

/** The recovered first-party scanner owns the finite TAR framing profile.
 * This original reader retains stable descriptor/SRI/decompression custody.
 */
export async function readRegistryArchiveMembers(selection) {
  return readRegistryArchive(selection);
}
/** Explicit read-only wire-to-materialization prediction, never a publication inventory. */
export async function readRegistryArchiveProjection(selection) {
  fields(selection, ['path', 'integrity', 'limits', 'profile'], 'registry projection selection');
  if (!['npm-registry-legacy-v1', 'npm-registry-legacy-idempotent-files-v1'].includes(selection.profile)) throw fail('explicit registry projection profile required');
  return readRegistryArchive(selection, selection.profile);
}
async function readRegistryArchive({ path, integrity, limits }, profile) {
  bounds(limits);
  if (typeof path !== 'string' || !isAbsolute(path)) throw fail('exact absolute archive path required');
  if (typeof integrity !== 'string' || !/^sha512-[A-Za-z0-9+/]{86}==$/u.test(integrity)
    || Buffer.from(integrity.slice(7), 'base64').length !== 64
    || Buffer.from(integrity.slice(7), 'base64').toString('base64') !== integrity.slice(7)) throw fail('canonical SHA512 archive identity required');
  const namedBefore = await lstat(path, { bigint: true });
  if (!namedBefore.isFile()) throw fail('archive pathname must name a regular file directly');
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  let bytes, before;
  try {
    before = await file.stat({ bigint: true });
    if (JSON.stringify(statIdentity(before)) !== JSON.stringify(statIdentity(namedBefore))) throw fail('archive pathname changed before opening');
    if (!before.isFile() || before.size > BigInt(limits.archiveBytes)) throw fail('archive must be a bounded regular file');
    const buffer = Buffer.alloc(limits.archiveBytes + 1);
    let length = 0;
    while (length < buffer.length) {
      const next = await file.read(buffer, length, buffer.length - length, null);
      if (!next.bytesRead) break;
      length += next.bytesRead;
    }
    if (length > limits.archiveBytes) throw fail('archive exceeded its bound during reading');
    bytes = buffer.subarray(0, length);
    if (JSON.stringify(statIdentity(await file.stat({ bigint: true }))) !== JSON.stringify(statIdentity(before))) throw fail('archive changed while reading');
    const namedAfter = await lstat(path, { bigint: true });
    if (!namedAfter.isFile() || JSON.stringify(statIdentity(namedAfter)) !== JSON.stringify(statIdentity(before))) throw fail('archive pathname changed while reading');
  } finally { await file.close(); }
  if ('sha512-' + createHash('sha512').update(bytes).digest('base64') !== integrity) throw fail('archive differs from its received SHA512 identity');
  // Native bounded decompression precedes parsing; ignored/empty metadata cannot
  // turn compressed size or payload-only accounting into an expansion allowance.
  const tar = gunzipSync(bytes, { maxOutputLength: limits.tarBytes });
  const scanned = inspectPackedCarrierArchive(tar, limits, profile === undefined ? {} : {profile});
  const { members, manifestText, headers, parserEndOffset: eofOffset, accountedEndOffset } = scanned;
  if (profile !== undefined) {
    const result = {sourceArchive:{...scanned.sourceArchive, integrity}, projection:scanned.projection,
      observation:{kind:'npm.native-registry-archive-projection', version:1, path, integrity, archiveSHA256:sha256(bytes), compressedBytes:bytes.length,
        expandedSHA256:sha256(tar), expandedBytes:tar.length, parserEndOffset:eofOffset, accountedEndOffset, headers,
        parser:{name:'npm-workspace-publication-service/packed-carrier-archive', context:profile},
        rawInventorySHA256:scanned.sourceArchive.rawInventorySHA256, projectionSHA256:scanned.projection.projectionSHA256,
        extracted:false, installationClaimed:false, publicationClaimed:false}};
    if (Buffer.byteLength(JSON.stringify(result)) > 16 * 1024 * 1024) throw fail('retained projection result bound exceeded');
    return result;
  }
  return { archive: { integrity, manifestText, members }, observation: {
    kind: 'npm.native-archive-members', path, integrity, archiveSHA256: sha256(bytes), compressedBytes: bytes.length,
    expandedSHA256: sha256(tar), expandedBytes: tar.length, parserEndOffset: eofOffset, accountedEndOffset, headers,
    parser: { name: 'npm-workspace-publication-service/packed-carrier-archive', context: 'npm-gzip-tar-v1', extensions: 'pax-path', ambiguousNames: 'unreceived' },
    extracted: false, installationClaimed: false,
  } };
}

/** Native NPM owns its packlist and ignore/config precedence. No lifecycle,
 * inherited credentials or user/global npm config enters this bounded observer.
 */
async function nativePackSelection(directory, manifest, scratchDirectory) {
  const scratch = await mkdtemp(join(scratchDirectory, 'code-native-packlist-'));
  try {
    const userconfig = join(scratch, 'npmrc'), globalconfig = join(scratch, 'global-npmrc');
    await writeFile(userconfig, '', { flag: 'wx', mode: 0o600 });
    await writeFile(globalconfig, '', { flag: 'wx', mode: 0o600 });
    const env = Object.fromEntries(['PATH', 'LANG', 'LC_ALL', 'TZ', 'SystemRoot', 'WINDIR'].filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]));
    Object.assign(env, { HOME: scratch, TMPDIR: scratch, TEMP: scratch, TMP: scratch,
      npm_config_userconfig: userconfig, npm_config_globalconfig: globalconfig, npm_config_cache: join(scratch, 'cache'),
      npm_config_ignore_scripts: 'true', npm_config_update_notifier: 'false', npm_config_audit: 'false', npm_config_fund: 'false' });
    const version = (await run('npm', ['--version'], { cwd: directory, env, timeout: 10000, maxBuffer: 65536 })).stdout.trim();
    if (!/^\d+\.\d+\.\d+$/u.test(version)) throw fail('native npm version was not received');
    const args = ['pack', '--dry-run', '--json', '--ignore-scripts', '--workspaces=false'];
    const { stdout } = await run('npm', args, { cwd: directory, env, timeout: 60000, maxBuffer: 16 * 1024 * 1024 });
    const packed = npmPackResult(stdout, manifest);
    if (!Array.isArray(packed.files)) throw fail('native npm did not return its independently selected files');
    return { files: packed.files, observation: { manager: 'npm', version, arguments: args,
      stdoutSHA256: sha256(stdout), lifecycleScripts: false, userConfiguration: 'empty', globalConfiguration: 'empty' } };
  } finally { await rm(scratch, { recursive: true, force: true }); }
}

/** In-process owning ports supply original Git/build/preparation evidence.
 * JSON cannot assert a prepared manifest, build result or selected member set.
 */
export async function receiveSourceArchiveMembers(selection, { readSource, sourceDirectory, scratchDirectory, preparation, buildQualification, selectSourceFile, enterSourceDirectory, publisherConfiguration } = {}) {
  fields(selection, ['registry', 'source', 'archive', 'limits', 'publisher'], 'source/archive selection');
  fields(selection.source, ['repository', 'commit', 'scope'], 'source');
  fields(selection.archive, ['path', 'integrity'], 'archive');
  const { source, archive, limits, registry, publisher } = selection;
  bounds(limits);
  if (typeof readSource !== 'function') throw fail('original qualified source reader required');
  if (typeof sourceDirectory !== 'string' || !isAbsolute(sourceDirectory)
    || await realpath(sourceDirectory) !== sourceDirectory || !(await lstat(sourceDirectory)).isDirectory())
    throw fail('actual unredirected source directory required');
  if (typeof scratchDirectory !== 'string' || !isAbsolute(scratchDirectory) || await realpath(scratchDirectory) !== scratchDirectory) throw fail('explicit unredirected caller-owned scratch directory required');
  const scratchStat = await lstat(scratchDirectory);
  if (!scratchStat.isDirectory() || scratchStat.uid !== process.getuid() || (scratchStat.mode & 0o077) !== 0
    || inside(sourceDirectory, scratchDirectory) || inside(scratchDirectory, sourceDirectory)) throw fail('private scratch must be separate from selected source');
  if (typeof source.repository !== 'string' || !source.repository || !/^[a-f0-9]{40}$/u.test(source.commit)
    || source.scope !== undefined && source.scope !== '' && !literal(source.scope)) throw fail('exact source repository/commit/package scope required');
  const at = { repository: source.repository, commit: source.commit, scope: source.scope ?? '' };
  const first = await readSource({ ...at, selectFile: path => path === 'package.json', enterDirectory: () => false });
  if (!Array.isArray(first) || first.length !== 1 || first[0].path !== 'package.json' || !Buffer.isBuffer(first[0].bytes)) throw fail('exact source manifest required');
  const declared = JSON.parse(decode(first[0].bytes));
  if (selectSourceFile !== undefined && typeof selectSourceFile !== 'function'
    || enterSourceDirectory !== undefined && typeof enterSourceDirectory !== 'function') throw fail('original source acquisition selectors must be functions');
  // The owner selects a conservative package allowance, including native ignore
  // inputs. Native NPM narrows it; archive names never define completeness.
  const entries = await readSource({ ...at,
    selectFile: path => selectSourceFile ? selectSourceFile(path, declared) : carrierSourceIncludes(declared, path),
    enterDirectory: path => enterSourceDirectory ? enterSourceDirectory(path, declared) : carrierSourceIncludes(declared, path, { directory: true }),
  });
  if (!Array.isArray(entries) || entries.length > limits.sourcePaths) throw fail('source path bound exceeded');
  const original = new Map(), witnesses = [], repositories = new Set();
  let sourceBytes = 0;
  for (const entry of entries) {
    if (!literal(entry.path) || original.has(entry.path) || !['100644', '100755'].includes(entry.mode)
      || !Buffer.isBuffer(entry.bytes) || !entry.source || typeof entry.source.repository !== 'string'
      || !/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u.test(entry.source.commit) || !/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u.test(entry.source.object)) throw fail('source requires unique exact regular Git observations');
    repositories.add(entry.source.repository + '\0' + entry.source.commit);
    if (repositories.size > limits.sourceRepositories) throw fail('source repository bound exceeded');
    sourceBytes += entry.bytes.length;
    if (!Number.isSafeInteger(sourceBytes) || sourceBytes > limits.bytes) throw fail('source selected byte bound exceeded');
    original.set(entry.path, { bytes: entry.bytes, mode: entry.mode === '100755' ? 0o755 : 0o644 });
    witnesses.push({ path: entry.path, gitMode: entry.mode, gitSource: { ...entry.source }, bytes: entry.bytes.length, sha256: sha256(entry.bytes) });
  }
  const manifestEntry = original.get('package.json');
  if (!manifestEntry) throw fail('exact source manifest was not received');
  if (!manifestEntry.bytes.equals(first[0].bytes)) throw fail('manifest changed between original source reads');
  const originalManifestText = decode(manifestEntry.bytes);
  let manifestText = originalManifestText, projection;
  if (preparation !== undefined) {
    fields(preparation, ['published', 'repositoryFallback'], 'original publisher preparation');
    projection = preparePublicationCarrierManifest({ ...at, manifestText, ...preparation });
    manifestText = projection.preparedManifestText;
  }
  const manifest = JSON.parse(manifestText), actual = new Map(original);
  if (publisherConfiguration !== undefined) {
    fields(publisherConfiguration, ['omitProjectNpmrc'], 'original publisher configuration');
    if (publisherConfiguration.omitProjectNpmrc !== true) throw fail('only the original clean-publisher npmrc omission is supported');
    actual.delete('.npmrc');
  }
  const directoryManifestText = publisher === undefined ? manifestText : `${JSON.stringify({ ...manifest, gitHead: publisher.gitHead }, null, 2)}\n`;
  actual.set('package.json', { ...manifestEntry, bytes: Buffer.from(directoryManifestText) });
  const generated = buildQualification === undefined ? []
    : await receiveQualifiedPublicationBuildProducts(buildQualification, { directory: sourceDirectory });
  for (const entry of generated) {
    if (!literal(entry.path) || actual.has(entry.path)) throw fail('qualified generated product replaces authored source');
    actual.set(entry.path, entry);
    witnesses.push({ path: entry.path, generatedSource: entry.source, bytes: entry.bytes.length, sha256: sha256(entry.bytes), mode: entry.mode });
  }
  if ([...actual.values()].reduce((sum, entry) => sum + entry.bytes.length, 0) > limits.bytes) throw fail('prepared source/product byte bound exceeded');
  let visited;
  async function receiveDirectory(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const file = join(directory, entry.name), path = relative(sourceDirectory, file).split('\\').join('/');
      if (path === '.git' || path === 'node_modules') continue;
      if (++visited > limits.sourcePaths) throw fail('actual source directory path bound exceeded');
      const stat = await lstat(file);
      if (await realpath(file) !== file) throw fail('source directory has a redirected input: ' + path);
      if (stat.isDirectory()) await receiveDirectory(file);
      else {
        const expected = actual.get(path);
        if (!stat.isFile() || !expected || stat.size !== expected.bytes.length || (stat.mode & 0o111) !== (expected.mode & 0o111)
          || !(await readFile(file)).equals(expected.bytes)) throw fail('source directory differs from original producer: ' + path);
        observed.add(path);
      }
    }
  }
  let observed;
  async function receiveInputs() {
    visited = 0; observed = new Set(); await receiveDirectory(sourceDirectory);
    for (const path of actual.keys()) if (!observed.has(path)) throw fail('original input absent from source directory: ' + path);
  }
  await receiveInputs();
  const packlist = await nativePackSelection(sourceDirectory, JSON.parse(directoryManifestText), scratchDirectory);
  await receiveInputs();
  if (packlist.files.length > limits.members) throw fail('native selected member bound exceeded');
  const selected = [], seen = new Set();
  for (const entry of packlist.files) {
    const expected = actual.get(entry.path);
    if (!literal(entry.path) || seen.has(entry.path) || !expected || !Number.isSafeInteger(entry.size)
      || entry.size !== expected.bytes.length) throw fail('native npm selected an unknown or ambiguous source member');
    seen.add(entry.path);
    const bytes = entry.path === 'package.json' ? Buffer.from(manifestText) : expected.bytes;
    selected.push(member(entry.path, bytes, expected.mode));
  }
  if (!seen.has('package.json')) throw fail('native npm omitted the package manifest');
  // Archive observation starts only after complete independent source selection.
  const packed = await readRegistryArchiveMembers({ ...archive, limits });
  const comparison = admitArtifactRelease({ stage: 'source-archive', registry,
    limits: { members: limits.members, bytes: limits.bytes },
    source: { repository: source.repository, commit: source.commit, manifestText, members: selected },
    archive: packed.archive, ...(publisher === undefined ? {} : { publisher }) });
  return { kind: 'npm.native-source-archive-receiving', version: 1, ok: comparison.ok,
    source: { ...at, manifestSHA256: sha256(originalManifestText), members: witnesses,
      selection: 'independent-native-npm-packlist', acquisition: selectSourceFile ? 'original-owner-selector' : 'carrier-source-allowance-with-native-ignore-inputs', publisherConfiguration: publisherConfiguration ?? null, packlist: packlist.observation,
      requiredPaths: selected.map(entry => entry.path), ...(projection === undefined ? {} : { preparation: projection }) },
    archive: packed.observation, comparison, installationClaimed: false, publicationClaimed: false };
}

const inside = (root, path) => { const part = relative(root, path); return part === '' || !isAbsolute(part) && part !== '..' && !part.startsWith('../'); };
/** This port is called by the original successful installer before transfer.
 * A serialized status/result cannot supply the retained in-process operation.
 */
export async function receiveInstalledArtifactMembers(selection, ports = {}) {
  return receiveInstalledMembers(selection, ports, false);
}
/** Original filesystem/bin receiving against an explicitly retained registry projection. */
export async function receiveInstalledRegistryProjection(selection, ports = {}) {
  return receiveInstalledMembers(selection, ports, true);
}
async function receiveInstalledMembers(selection, { nativeInstallation } = {}, projected) {
  fields(selection, ['registry', 'archive', 'limits', 'packageRoot', 'installationRoot', 'binDirectory', 'name', 'version', ...(projected ? ['profile'] : [])], 'installed selection');
  if (projected && !['npm-registry-legacy-v1','npm-registry-legacy-idempotent-files-v1'].includes(selection.profile)) throw fail('explicit installed registry projection profile required');
  fields(selection.archive, ['path', 'integrity'], 'archive');
  bounds(selection.limits);
  if (typeof nativeInstallation !== 'function') throw fail('original native installation receiving port required');
  const operation = await nativeInstallation();
  if (!operation || operation.installation?.kind !== 'native-package-installation' || operation.installation.status !== 0
    || operation.installation.manager?.name !== 'pnpm' || operation.installation.manager.version !== '11.28.5'
    || operation.provider?.shimTargetFormat !== 'pnpm11-cmd-shim-target') throw fail('qualified original PNPM11 native operation required');
  const projectedRead = projected ? await readRegistryArchiveProjection({...selection.archive, limits:selection.limits, profile:selection.profile}) : null;
  if (projected) receiveRegistryProjectionComparisonContext(projectedRead.sourceArchive, projectedRead.projection, operation.installation, operation.registryProjectionBinding);
  const installationRoot = await realpath(selection.installationRoot), packageRoot = await realpath(selection.packageRoot),
    binDirectory = await realpath(selection.binDirectory);
  if (installationRoot !== selection.installationRoot || !inside(installationRoot, packageRoot)
    || !inside(installationRoot, selection.binDirectory) || !inside(installationRoot, binDirectory)
    || !(await lstat(packageRoot)).isDirectory() || !(await lstat(binDirectory)).isDirectory()) throw fail('installed package/bin directory leaves its original installation');
  const packed = projectedRead ?? await readRegistryArchiveMembers({ ...selection.archive, limits: selection.limits });
  const expected = projected ? packed.projection : packed.archive;
  const manifest = JSON.parse(expected.manifestText);
  if (manifest.name !== selection.name || manifest.version !== selection.version) throw fail('archive is not the exact native selected release');
  if (expected.members.some(entry => entry.path.startsWith('node_modules/'))) throw fail('bundled dependency installation is outside this native receiving context', 'unread-installed-bundle');
  const members = [];
  let visited = 0, bytes = 0, manifestText;
  async function receive(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const file = join(directory, entry.name), path = relative(packageRoot, file).split('\\').join('/');
      if (path === 'node_modules') continue; // dependency environment is not this package's payload
      if (++visited > selection.limits.sourcePaths) throw fail('installed package path bound exceeded');
      if (!literal(path) || await realpath(file) !== file) throw fail('installed member is redirected or aliased');
      const stat = await lstat(file);
      if (stat.isDirectory()) await receive(file);
      else {
        if (!stat.isFile() || stat.size > selection.limits.bytes - bytes || members.length >= selection.limits.members) throw fail('installed member kind/byte bound exceeded');
        const body = await readFile(file), after = await lstat(file);
        if (stat.dev !== after.dev || stat.ino !== after.ino || stat.size !== after.size || stat.mtimeMs !== after.mtimeMs || stat.ctimeMs !== after.ctimeMs
          || body.length !== stat.size) throw fail('installed member changed during observation');
        bytes += body.length; members.push(member(path, body, stat.mode & 0o777));
        if (path === 'package.json') manifestText = decode(body);
      }
    }
  }
  await receive(packageRoot);
  const bins = [], registrations = [];
  const declarations = typeof manifest.bin === 'string' ? [[manifest.name.split('/').at(-1), manifest.bin]] : Object.entries(manifest.bin ?? {});
  for (const [name, declaredTarget] of declarations) {
    if (!literal(name) || name.includes('/') || typeof declaredTarget !== 'string') throw fail('native bin registration requires a confined name/target');
    const target = declaredTarget.replace(/^\.\//u, '');
    if (!literal(target)) throw fail('native bin target escapes its package');
    const actualTarget = await realpath(join(packageRoot, target));
    if (!inside(packageRoot, actualTarget)) throw fail('native bin target leaves its package');
    const observed = members.find(entry => entry.path === target), shim = join(binDirectory, name), stat = await lstat(shim);
    if (!observed || !(observed.mode & 0o111)) throw fail('native declared bin target was not received executable');
    if (stat.isSymbolicLink()) {
      if (await realpath(shim) !== actualTarget) throw fail('native registered bin resolves to another target');
      registrations.push({ name, kind: 'symbolic-link', path: shim, target: actualTarget });
    } else {
      if (!stat.isFile() || !(stat.mode & 0o111) || stat.size > 256 * 1024) throw fail('native registered shim is not a bounded executable file');
      const body = await readFile(shim), after = await lstat(shim);
      if (stat.dev !== after.dev || stat.ino !== after.ino || stat.size !== after.size || stat.mtimeMs !== after.mtimeMs || stat.ctimeMs !== after.ctimeMs) throw fail('native registered shim changed');
      // PNPM11's own emitted and consumed metadata; no shell parsing/evaluation.
      const targets = [...decode(body).matchAll(/^#\s*cmd-shim-target=(.+)$/gmu)].map(match => match[1]);
      if (targets.length !== 1 || await realpath(isAbsolute(targets[0]) ? targets[0] : join(binDirectory, targets[0])) !== actualTarget)
        throw fail('native PNPM shim metadata selects another or unread target');
      registrations.push({ name, kind: 'pnpm11-cmd-shim-target', path: shim, target: actualTarget, sha256: sha256(body) });
    }
    bins.push({ name, target, registered: true, targetSHA256: observed.sha256 });
  }
  const installation = { ...operation.installation, artifactIntegrity: selection.archive.integrity,
    package: manifest.name, version: manifest.version, installedManifestSHA256: sha256(manifestText), bins };
  const comparison = admitArtifactRelease({ stage: projected ? 'projection-installed' : 'archive-installed', registry: selection.registry,
    ...(projected ? {sourceArchive:packed.sourceArchive, projection:packed.projection, projectionBinding:operation.registryProjectionBinding} : {archive:packed.archive}),
    limits: { members: selection.limits.members, bytes: selection.limits.bytes }, installed: { manifestText, members }, installation });
  return { kind: projected ? 'npm.native-installed-registry-projection-receiving' : 'npm.native-installed-artifact-receiving', version: 1, ok: comparison.ok,
    ...(projected ? {sourceArchive:packed.sourceArchive, projection:packed.projection, archiveObservation:packed.observation} : {archive:packed.observation}),
    installation: { root: installationRoot, packageRoot, provider: operation.provider, registrations,
      requestSHA256: installation.requestSHA256, receipt: installation.receipt, receiptSHA256: installation.receiptSHA256 },
    comparison, installationClaimed: comparison.ok, publicationClaimed: false };
}
