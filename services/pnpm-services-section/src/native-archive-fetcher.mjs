// Runs only as the original native custom-fetcher extension. No transport,
// extraction, store-key writer, policy override or installer lives here.
import { constants, lstatSync, readFileSync, realpathSync, openSync, fstatSync, writeSync, closeSync } from 'node:fs';
import { open, lstat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { isMainThread } from 'node:worker_threads';
const digest = value => createHash('sha256').update(value).digest('hex');

export async function createReceivedArchiveFetchers(configPath, expectedSHA256) {
  // Do not validate main-process argv or touch session files in inherited workers.
  if (!isMainThread) return [];
  const configStat = lstatSync(configPath);
  if (!configStat.isFile() || configStat.size > 1048576 || realpathSync(configPath) !== configPath) throw new Error('archive reuse config refused');
  const raw = readFileSync(configPath);
  if (digest(raw) !== expectedSHA256) throw new Error('archive reuse config changed');
  const config = JSON.parse(raw);
  if (config.kind !== 'pnpm.received-archive.config.v1' || process.version !== 'v24.19.0'
    || realpathSync(process.argv[1]) !== config.entry || !Array.isArray(config.entries) || config.entries.length > 64) throw new Error('archive reuse native context refused');
  const eventsFd = openSync(config.eventsPath, constants.O_WRONLY | constants.O_APPEND | constants.O_NOFOLLOW);
  if (!fstatSync(eventsFd).isFile() || fstatSync(eventsFd).size !== 0) { closeSync(eventsFd); throw new Error('archive reuse evidence custody refused'); }
  let sequence = 0, bytes = 0, failed = false;
  const entries = new Map(config.entries.map(entry => [entry.name + '@' + entry.version, entry]));
  function emit(event, entry, code) {
    const row = { v: 1, seq: ++sequence, event, ...(entry ? { name: entry.name, version: entry.version } : {}), ...(code ? { code } : {}) };
    const line = JSON.stringify(row) + '\n'; bytes += Buffer.byteLength(line);
    if (sequence > 1024 || bytes > 262144) { failed = true; throw new Error('archive reuse evidence limit'); }
    try { const buffer = Buffer.from(line); let offset = 0; while (offset < buffer.length) { const written = writeSync(eventsFd, buffer, offset, buffer.length - offset); if (!written) throw new Error('short evidence write'); offset += written; } }
    catch { failed = true; throw new Error('archive reuse evidence unavailable'); }
  }
  function refuse(entry, code) { failed = true; emit('refused', entry, code); throw new Error('selected archive reuse refused'); }
  function match(entry, resolution) {
    if (!resolution || resolution.type != null || resolution.integrity !== entry.integrity || resolution.tarball !== entry.tarball) refuse(entry, 'native-selection-mismatch');
  }
  async function snapshot(entry) {
    const handle = await open(entry.snapshotPath, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const before = await handle.stat();
      if (!before.isFile() || before.size !== entry.bytes || before.size > 67108864) refuse(entry, 'snapshot-changed');
      const sha256 = createHash('sha256'), sha512 = createHash('sha512'), buffer = Buffer.alloc(65536); let count = 0;
      for (;;) { const { bytesRead } = await handle.read(buffer, 0, buffer.length, null); if (!bytesRead) break; count += bytesRead; if (count > entry.bytes) refuse(entry, 'snapshot-changed'); sha256.update(buffer.subarray(0, bytesRead)); sha512.update(buffer.subarray(0, bytesRead)); }
      const after = await handle.stat(), pathStat = await lstat(entry.snapshotPath);
      if (count !== entry.bytes || sha256.digest('hex') !== entry.sha256 || 'sha512-' + sha512.digest('base64') !== entry.integrity
        || before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs
        || pathStat.isSymbolicLink() || pathStat.dev !== after.dev || pathStat.ino !== after.ino) refuse(entry, 'snapshot-changed');
    } finally { await handle.close(); }
  }
  emit('ready');
  process.once('exit', () => { try { emit(failed ? 'final-refused' : 'final'); } catch { /* receiver refuses missing final; never invent native status */ } finally { closeSync(eventsFd); } });
  return [{
    canFetch(packageId, resolution) {
      const entry = entries.get(packageId);
      if (!entry) return false;
      match(entry, resolution); emit('selected', entry); return true;
    },
    async fetch(cafs, resolution, options, fetchers) {
      const entry = entries.get(options?.pkgResolutionId);
      if (!entry) refuse(undefined, 'missing-native-identity');
      match(entry, resolution);
      if (typeof fetchers?.localTarball !== 'function') refuse(entry, 'native-fetcher-unavailable');
      await snapshot(entry);
      emit('delegated', entry);
      // Native supplies this integrity-bound built-in. Preserve its cafs,
      // filesIndexFile/pkgResolutionId/options and exact return value.
      const result = await fetchers.localTarball(cafs, { ...resolution, tarball: 'file:' + entry.snapshotPath }, options);
      emit('native-returned', entry);
      return result;
    }
  }];
}
