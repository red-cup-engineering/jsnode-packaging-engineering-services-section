import { constants } from 'node:fs';
import { lstat, realpath, open, mkdtemp, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { isAbsolute, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { hash, regular, provider } from './native-provider.mjs';
import { receiveHookFreeProfile } from './native-hook-profile.mjs';
import { createNativeObservationService } from './native-observation.mjs';

const limitsCeilings = { members: 100000, bytes: 268435456, archiveBytes: 67108864, tarBytes: 268435456, metadataBytes: 1048576, sourcePaths: 1000000, sourceRepositories: 4096 };
const closureNames = ['native-installation.mjs', 'native-provider.mjs', 'native-hook-profile.mjs', 'native-archive-fetcher.mjs', 'native-observation.mjs', 'native-observation-preload.mjs'];
const runtimePath = fileURLToPath(new URL('./native-archive-fetcher.mjs', import.meta.url));
function record(value, allowed, required = []) {
  if (!value || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new TypeError('native composition requires an own-data record');
  for (const key of Reflect.ownKeys(value)) if (typeof key !== 'string' || !allowed.includes(key) || !('value' in Object.getOwnPropertyDescriptor(value, key))) throw new TypeError('unsupported native composition field');
  for (const key of required) if (!Object.hasOwn(value, key)) throw new TypeError('missing native composition field');
}
function dense(value, maximum) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || !value.length || value.length > maximum
    || Reflect.ownKeys(value).some(key => key !== 'length' && (typeof key !== 'string' || !/^(0|[1-9][0-9]*)$/u.test(key) || !('value' in Object.getOwnPropertyDescriptor(value, key))))
    || Array.from({length: value.length}, (_, i) => i).some(i => !Object.hasOwn(value, i))) throw new TypeError('bounded dense own-data array required');
}
function absolute(value) { return typeof value === 'string' && value.length <= 4096 && isAbsolute(value) && !/[\x00-\x1f\x7f]/u.test(value); }
const below = (root, path) => { const rel = relative(root, path); return rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith('../')); };
function validateReuse(value, context) {
  record(value, ['receiptDirectory', 'entries'], ['receiptDirectory', 'entries']); dense(value.entries, 64);
  if (!absolute(value.receiptDirectory)) throw new TypeError('real absolute reuse receipt directory required');
  const identities = new Set(), urls = new Set(); let expanded = 0, members = 0, metadata = 0;
  const entries = value.entries.map(entry => {
    record(entry, ['name', 'version', 'registry', 'tarball', 'integrity', 'archivePath', 'limits'], ['name', 'version', 'registry', 'tarball', 'integrity', 'archivePath', 'limits']);
    if (typeof entry.name !== 'string' || entry.name.length > 214 || !/^(?:@[a-z0-9._-]+\/[a-z0-9._-]+|[a-z0-9._-]+)$/u.test(entry.name)
      || typeof entry.version !== 'string' || entry.version.length > 128 || !/^(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)(?:-(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u.test(entry.version)
      || !absolute(entry.archivePath) || typeof entry.integrity !== 'string' || !/^sha512-[A-Za-z0-9+/]{86}==$/u.test(entry.integrity)
      || Buffer.from(entry.integrity.slice(7), 'base64').toString('base64') !== entry.integrity.slice(7)) throw new TypeError('exact received archive identity required');
    for (const key of ['registry', 'tarball']) if (typeof entry[key] !== 'string' || entry[key].length > 2048) throw new TypeError('bounded archive endpoint required');
    const registry = new URL(entry.registry), tarball = new URL(entry.tarball);
    const safe = url => (url.protocol === 'https:' || (context.qualificationRoot && url.protocol === 'http:' && url.hostname === '127.0.0.1')) && !url.username && !url.password && !url.search && !url.hash;
    if (!safe(registry) || !safe(tarball) || registry.origin !== tarball.origin || !registry.pathname.endsWith('/')) throw new TypeError('same-authority archive selection required');
    const id = entry.name + '@' + entry.version;
    if (identities.has(id) || urls.has(tarball.href)) throw new TypeError('duplicate archive selection'); identities.add(id); urls.add(tarball.href);
    record(entry.limits, Object.keys(limitsCeilings), Object.keys(limitsCeilings));
    for (const [key, ceiling] of Object.entries(limitsCeilings)) if (!Number.isSafeInteger(entry.limits[key]) || entry.limits[key] < 1 || entry.limits[key] > ceiling) throw new TypeError('finite original archive reader bounds required');
    expanded += entry.limits.tarBytes; members += entry.limits.members; metadata += entry.limits.metadataBytes;
    return {...entry, registry: registry.href, tarball: tarball.href, limits: {...entry.limits}};
  });
  if (expanded > 268435456 || members > 65536 || metadata > 4194304) throw new TypeError('aggregate expanded archive bounds exceeded');
  return { receiptDirectory: value.receiptDirectory, entries, allocationLimits: { expanded, members, metadata, compressed: 134217728, copyChunk: 65536 } };
}
async function sourceIdentity() {
  const path = fileURLToPath(new URL('../package.json', import.meta.url)), bytes = await regular(path, 1048576), manifest = JSON.parse(bytes);
  if (manifest.name !== '@red-cup-engineering/pnpm-engineering-services-section' || manifest.exports?.['./native-installation'] !== './src/native-installation.mjs') throw new TypeError('native composition public supplier differs');
  const closure = [];
  for (const name of closureNames) { const path = fileURLToPath(new URL(name, import.meta.url)); closure.push({path, sha256: hash(await regular(path, 1048576))}); }
  return {name: manifest.name, version: manifest.version, publicExport: './native-installation', manifestPath: path, manifestSHA256: hash(bytes), closure, externalImports: 'node-builtins-only'};
}
async function readerIdentity(port) {
  record(port, ['read', 'supplier'], ['read', 'supplier']); if (typeof port.read !== 'function') throw new TypeError('original archive reader port required');
  const owner = port.supplier; record(owner, ['name', 'version', 'publicExport', 'member', 'closure', 'bindings'], ['name', 'version', 'publicExport', 'member', 'closure', 'bindings']); dense(owner.closure, 4096); dense(owner.bindings, 1024);
  if (owner.name !== '@red-cup-engineering/npm-workspace-publication-service' || (typeof owner.version !== 'string' || owner.version.length > 128) || owner.publicExport !== './source-registry-closure' || owner.member !== 'readRegistryArchiveMembers') throw new TypeError('original archive reader supplier required');
  const bindings = [], bindingPaths = new Set();
  for (const binding of owner.bindings) {
    record(binding, ['path', 'target'], ['path', 'target']);
    if (!absolute(binding.path) || !absolute(binding.target) || bindingPaths.has(binding.path)
      || await realpath(binding.path) !== binding.target) throw new TypeError('archive reader import binding changed');
    bindingPaths.add(binding.path); bindings.push({...binding});
  }
  const closure = [], seen = new Set(); let sourceBytes = 0;
  for (const item of owner.closure) {
    record(item, ['path', 'sha256'], ['path', 'sha256']);
    if (!absolute(item.path) || !/^[a-f0-9]{64}$/u.test(item.sha256) || seen.has(item.path)) throw new TypeError('archive reader source custody differs');
    const bytes = await regular(item.path, 4194304); sourceBytes += bytes.length;
    if (sourceBytes > 16777216 || hash(bytes) !== item.sha256) throw new TypeError('archive reader source custody differs');
    seen.add(item.path); closure.push({...item});
  }
  return {...owner, closure, bindings};
}
function statIdentity(stat) { return [stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs].map(String).join(':'); }
async function stableDigest(path, expected, destination) {
  const beforePath = await lstat(path, {bigint: true});
  if (!beforePath.isFile() || beforePath.size > 67108864n) throw new TypeError('bounded direct archive file required');
  const input = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW); let output;
  try {
    const before = await input.stat({bigint: true}); if (statIdentity(before) !== statIdentity(beforePath)) throw new TypeError('archive changed before opening');
    if (destination) output = await open(destination, 'wx', 0o600);
    const sha256 = createHash('sha256'), sha512 = createHash('sha512'), buffer = Buffer.alloc(65536); let bytes = 0;
    for (;;) {
      const {bytesRead} = await input.read(buffer, 0, buffer.length, null); if (!bytesRead) break; bytes += bytesRead;
      if (bytes > Number(before.size)) throw new TypeError('archive grew while reading');
      const chunk = buffer.subarray(0, bytesRead); sha256.update(chunk); sha512.update(chunk);
      if (output) { let offset = 0; while (offset < chunk.length) { const written = await output.write(chunk, offset, chunk.length - offset, null); if (!written.bytesWritten) throw new Error('archive snapshot write stalled'); offset += written.bytesWritten; } }
    }
    const result = {bytes, sha256: sha256.digest('hex'), integrity: 'sha512-' + sha512.digest('base64')};
    if (statIdentity(before) !== statIdentity(await input.stat({bigint: true})) || statIdentity(before) !== statIdentity(await lstat(path, {bigint: true}))
      || bytes !== Number(before.size) || (expected && !Object.entries(expected).every(([key, value]) => result[key] === value))) throw new TypeError('archive identity changed');
    return result;
  } finally { await output?.close(); await input.close(); }
}
async function originalInputs(cwd) {
  const result = [];
  for (const name of ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', '.npmrc']) {
    const path = join(cwd, name); try { const bytes = await regular(path, 16777216); result.push({path, sha256: hash(bytes), bytes: bytes.length}); }
    catch (error) { if (error.code !== 'ENOENT' || ['package.json', 'pnpm-lock.yaml'].includes(name)) throw error; result.push({path, absent: true}); }
  }
  return result;
}
export function receiveArchiveReuseEvents(text, entries) {
  const states = new Map(entries.map(e => [e.name + '@' + e.version, {selected: false, pending: false, returned: 0, refused: false}])), events = []; let ready = false, final = false, refused = false, sequence = 0;
  for (const line of text.split('\n')) {
    if (!line) continue;
    const value = JSON.parse(line);
    if (++sequence > 1024 || value.v !== 1 || value.seq !== sequence || final) throw new TypeError('reuse evidence sequence invalid');
    record(value, ['v', 'seq', 'event', 'name', 'version', 'code'], ['v', 'seq', 'event']);
    if (['ready', 'final', 'final-refused'].includes(value.event) && Object.keys(value).some(key => !['v', 'seq', 'event'].includes(key))) throw new TypeError('reuse lifecycle event invalid');
    if (value.event === 'ready') { if (ready || sequence !== 1) throw new TypeError('duplicate reuse startup'); ready = true; }
    else if (['final', 'final-refused'].includes(value.event)) { if (!ready) throw new TypeError('reuse startup missing'); final = true; refused ||= value.event === 'final-refused'; }
    else {
      if (typeof value.name !== 'string' || typeof value.version !== 'string') throw new TypeError('reuse event identity invalid');
      if (Object.hasOwn(value, 'code') && !['native-selection-mismatch', 'snapshot-changed', 'missing-native-identity', 'native-fetcher-unavailable'].includes(value.code)) throw new TypeError('reuse failure classification invalid');
      const id = value.name + '@' + value.version, old = states.get(id);
      if (!ready || !states.has(id) || !['selected', 'delegated', 'native-returned', 'refused'].includes(value.event)) throw new TypeError('reuse event identity invalid');
      if (value.event === 'selected') old.selected = true;
      if (value.event === 'delegated') { if (!old.selected || old.pending) throw new TypeError('reuse transition invalid'); old.pending = true; }
      if (value.event === 'native-returned') { if (!old.pending) throw new TypeError('reuse transition invalid'); old.pending = false; old.returned++; }
      if (value.event === 'refused') { refused = true; old.refused = true; }
    }
    events.push(value);
  }
  const incomplete = [...states.values()].some(state => state.pending);
  return {accepted: ready && final && !refused && !incomplete, ready, final, refused, events,
    entries: entries.map(entry => { const state = states.get(entry.name + '@' + entry.version); return {
      name: entry.name, version: entry.version, state: state.refused ? 'refused' : state.pending ? 'delegated' : state.returned ? 'native-returned' : state.selected ? 'selected-not-delegated' : 'not-invoked',
      completedDelegations: state.returned, pendingDelegation: state.pending}; }),
    persistence: 'not-established-by-hook-return'};
}

/** Explicit source/service composition; not an issued provider or JSON locator. */
export function createNativeInstallationService(options = {}) {
  record(options, ['archiveReader', 'qualificationRoot']);
  options = Object.freeze({...options});
  if (options.qualificationRoot !== undefined && !absolute(options.qualificationRoot)) throw new TypeError('absolute qualification root required');
  const observation = createNativeObservationService(options.qualificationRoot ? {qualificationRoot: options.qualificationRoot} : {}), sessions = new WeakMap();
  const state = ticket => { const result = sessions.get(ticket); if (!result) throw new TypeError('foreign native composition session'); return result; };
  async function custody(s, probe) {
    await provider(s.program, s.args, s.cwd, s.native, false);
    if (!isDeepStrictEqual(s.owner, await sourceIdentity()) || !isDeepStrictEqual(s.inputs, await originalInputs(s.cwd))) throw new TypeError('native composition source or inputs changed');
    if (!isDeepStrictEqual(s.profile, await receiveHookFreeProfile(s.cwd, s.command))) throw new TypeError('native configuration profile changed');
    if (s.reuse) {
      if (!isDeepStrictEqual(s.reader, await readerIdentity(options.archiveReader)) || options.archiveReader.read !== s.readerRead) throw new TypeError('reuse reader changed');
      if (hash(await regular(s.configPath, 1048576)) !== s.configSHA256 || hash(await regular(s.hookPath, 1048576)) !== s.hookSHA256) throw new TypeError('reuse invocation custody changed');
      for (const entry of s.entries) await stableDigest(entry.snapshotPath, {bytes: entry.bytes, sha256: entry.sha256, integrity: entry.integrity});
    }
    if (probe) { if (s.observed) await observation.revalidate(s.observed.session); else await provider(s.program, s.args, s.cwd, s.native); }
  }
  return Object.freeze({
    kind: 'pnpm.native-installation-composition.service.v1',
    async prepare(input) {
      record(input, ['program', 'arguments', 'commandArguments', 'cwd', 'request'], ['program', 'arguments', 'commandArguments', 'cwd', 'request']);
      record(input.request, ['observation', 'artifactReuse']);
      if (!Object.hasOwn(input.request, 'observation') && !Object.hasOwn(input.request, 'artifactReuse')) throw new TypeError('an explicit native capability is required');
      dense(input.arguments, 256); dense(input.commandArguments, 1024);
      if (![...input.arguments, ...input.commandArguments].every(arg => typeof arg === 'string') || !absolute(input.cwd)) throw new TypeError('explicit native command required');
      const reuse = Object.hasOwn(input.request, 'artifactReuse') ? validateReuse(input.request.artifactReuse, options) : null;
      if (options.qualificationRoot && !below(await realpath(options.qualificationRoot), await realpath(input.cwd))) throw new TypeError('qualification escaped its root');
      const owner = await sourceIdentity(), inputs = await originalInputs(input.cwd);
      if (input.arguments.length < 1 || input.arguments.some((arg, i) => input.commandArguments[i] !== arg)
        || input.arguments.slice(1).some(arg => arg === 'install' || arg === '--dir' || !arg.startsWith('--')))
        throw new TypeError('base provider arguments are not the admitted command prefix');
      const profile = await receiveHookFreeProfile(input.cwd, input.commandArguments);
      const reader = reuse ? await readerIdentity(options.archiveReader) : null;
      const observed = Object.hasOwn(input.request, 'observation') ? await observation.prepare({program: input.program, arguments: input.arguments, cwd: input.cwd, request: input.request.observation}) : null;
      const native = observed?.provider ?? await provider(input.program, input.arguments, input.cwd);
      const s = {program: input.program, args: [...input.arguments], command: [...input.commandArguments], cwd: input.cwd, reuse, owner, inputs, profile, reader, readerRead: reuse ? options.archiveReader.read : null, observed, native, entries: []};
      const delta = {prefix: observed?.commandDelta.prefix ?? [], reporter: observed?.commandDelta.reporter ?? null, environment: observed?.commandDelta.environment ?? {}, pnpmfile: null};
      if (reuse) {
        if (await realpath(reuse.receiptDirectory) !== reuse.receiptDirectory || !(await lstat(reuse.receiptDirectory)).isDirectory()) throw new TypeError('real private reuse directory required');
        const stats = [];
        for (const entry of reuse.entries) { const stat = await lstat(entry.archivePath); if (!stat.isFile() || stat.size < 1 || stat.size > entry.limits.archiveBytes) throw new TypeError('selected archive exceeds bound'); stats.push(stat); }
        if (stats.reduce((sum, stat) => sum + stat.size, 0) > 134217728) throw new TypeError('aggregate compressed archive bound exceeded');
        s.directory = await mkdtemp(join(reuse.receiptDirectory, '.pnpm-archive-reuse-'));
        for (let i = 0; i < reuse.entries.length; i++) {
          const entry = reuse.entries[i], snapshotPath = join(s.directory, 'archive-' + i + '.tgz');
          const packed = await s.readerRead({path: entry.archivePath, integrity: entry.integrity, limits: {...entry.limits, archiveBytes: stats[i].size}});
          const manifest = JSON.parse(packed.archive.manifestText);
          if (manifest.name !== entry.name || manifest.version !== entry.version) throw new TypeError('archive packed identity differs');
          const identity = await stableDigest(entry.archivePath, {bytes: packed.observation.compressedBytes, sha256: packed.observation.archiveSHA256, integrity: entry.integrity}, snapshotPath);
          await stableDigest(snapshotPath, identity);
          s.entries.push({name: entry.name, version: entry.version, registry: entry.registry, tarball: entry.tarball, integrity: entry.integrity, snapshotPath, ...identity,
            expandedBytes: packed.observation.expandedBytes, manifestSHA256: hash(packed.archive.manifestText)});
        }
        s.eventsPath = join(s.directory, 'events.ndjson'); s.configPath = join(s.directory, 'config.json'); s.hookPath = join(s.directory, 'pnpmfile.mjs');
        const config = {kind: 'pnpm.received-archive.config.v1', entry: native.provider.entry, entries: s.entries, eventsPath: s.eventsPath};
        const configText = JSON.stringify(config) + '\n'; s.configSHA256 = hash(configText); s.configBytes = Buffer.byteLength(configText);
        const hookText = `import { createReceivedArchiveFetchers } from ${JSON.stringify(pathToFileURL(runtimePath).href)};\nexport const fetchers = await createReceivedArchiveFetchers(${JSON.stringify(s.configPath)}, ${JSON.stringify(s.configSHA256)});\n`;
        s.hookSHA256 = hash(hookText);
        await writeFile(s.eventsPath, '', {flag: 'wx', mode: 0o600}); await writeFile(s.configPath, configText, {flag: 'wx', mode: 0o600}); await writeFile(s.hookPath, hookText, {flag: 'wx', mode: 0o600});
        delta.pnpmfile = s.hookPath;
      }
      const ticket = Object.freeze({kind: 'pnpm.native-installation.session.v1'}); sessions.set(ticket, s);
      return Object.freeze({session: ticket, provider: native, supplier: owner, commandDelta: delta,
        receiptDirectory: s.directory ?? observed.receiptDirectory, context: {kind: options.qualificationRoot ? 'source-loopback-qualification' : 'explicit-source-composition'},
        preparedConfiguration: reuse ? {sha256: s.configSHA256, bytes: s.configBytes, hookSHA256: s.hookSHA256, allocationLimits: reuse.allocationLimits} : null,
        observation: observed ? {supplier: observed.supplier, receiptDirectory: observed.receiptDirectory} : null});
    },
    async revalidate(ticket) { await custody(state(ticket), true); return true; },
    async receive(ticket, outcome) {
      const s = state(ticket); let custodyStatus = 'unchanged', reuseEvidence = null;
      try { await custody(s, false); } catch { custodyStatus = 'changed-or-unread'; }
      if (s.reuse) {
        try { const bytes = await regular(s.eventsPath, 262144); reuseEvidence = {...receiveArchiveReuseEvents(bytes.toString('utf8'), s.entries), stream: {bytes: bytes.length, sha256: hash(bytes)}}; }
        catch { reuseEvidence = {accepted: false, status: 'unread-or-malformed', entries: s.entries.map(e => ({name: e.name, version: e.version, state: 'unknown'}))}; }
      }
      let observed;
      if (s.observed) { try { observed = await observation.receive(s.observed.session, outcome); } catch { observed = {stdout: '', stderr: '', safeFailure: 'observation-unavailable', evidence: {coverage: {status: 'unavailable'}}}; } }
      const accepted = custodyStatus === 'unchanged' && (!s.reuse || reuseEvidence.accepted === true);
      const stdout = Buffer.isBuffer(outcome.stdout) ? outcome.stdout : Buffer.from(outcome.stdout ?? ''), stderr = Buffer.isBuffer(outcome.stderr) ? outcome.stderr : Buffer.from(outcome.stderr ?? '');
      const evidence = {kind: 'pnpm.native-installation-composition.receipt.v1', provider: s.native, supplier: s.owner, inputs: s.inputs,
        custody: custodyStatus, hookProfile: s.profile, admission: {accepted, requiredArchiveReuse: Boolean(s.reuse)},
        ...(s.reuse ? {reader: s.reader, preparedConfiguration: {sha256: s.configSHA256, bytes: s.configBytes, hookSHA256: s.hookSHA256}, archiveReuse: reuseEvidence} : {}),
        ...(observed ? {observation: observed.evidence} : {}),
        native: {invoked: outcome.invoked === true, code: Number.isSafeInteger(outcome.code) ? outcome.code : null, signal: ['SIGTERM', 'SIGKILL', 'SIGINT'].includes(outcome.signal) ? outcome.signal : null},
        streams: {stdout: {bytes: stdout.length, sha256: hash(stdout)}, stderr: {bytes: stderr.length, sha256: hash(stderr)}}};
      return {evidence, accepted, stdout: observed?.stdout ?? '', stderr: observed?.stderr ?? '', safeFailure: accepted ? observed?.safeFailure ?? 'native-command-failed' : 'native-capability-receiving-refused'};
    }
  });
}
