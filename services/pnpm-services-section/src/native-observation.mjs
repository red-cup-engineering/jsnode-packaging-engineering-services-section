import { lstat, mkdtemp, open, readFile, realpath, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { isAbsolute, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { hash, regular, provider } from './native-provider.mjs';
const providerPath = fileURLToPath(new URL('./native-provider.mjs', import.meta.url));
const servicePath = fileURLToPath(import.meta.url);
const preloadPath = fileURLToPath(new URL('./native-observation-preload.mjs', import.meta.url));
const variable = 'PNPM_NATIVE_OBSERVATION_CONFIG';
const namePattern = /^(?:@[a-z0-9._-]+\/[a-z0-9._-]+|[a-z0-9._-]+)$/u;
const versionPattern = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u;
function exactVersion(value) {
  if (!versionPattern.test(value)) return false;
  const [head, build] = value.split('+'), dash = head.indexOf('-');
  const core = dash < 0 ? head : head.slice(0, dash), pre = dash < 0 ? null : head.slice(dash + 1);
  return !core.split('.').some(part => /^0[0-9]/u.test(part))
    && (!pre || !pre.split('.').some(part => !/^[0-9A-Za-z-]+$/u.test(part) || /^0[0-9]+$/u.test(part)))
    && (!build || !build.split('.').some(part => !/^[0-9A-Za-z-]+$/u.test(part)));
}
function record(value, keys, required = []) {
  if (!value || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new TypeError('observation requires an own-data record');
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !keys.includes(key) || !('value' in Object.getOwnPropertyDescriptor(value, key))) throw new TypeError('unsupported observation field');
  }
  for (const key of required) if (!Object.hasOwn(value, key)) throw new TypeError('missing observation field');
  return value;
}
const below = (root, path) => { const rel = relative(root, path); return rel === '' || (!rel.startsWith('../') && rel !== '..' && !isAbsolute(rel)); };
async function supplier() {
  const manifestPath = fileURLToPath(new URL('../package.json', import.meta.url));
  const [service, preload, manifestBytes, providerBytes] = await Promise.all([
    regular(servicePath, 1048576), regular(preloadPath, 1048576), regular(manifestPath, 1048576), regular(providerPath, 1048576)]);
  const manifest = JSON.parse(manifestBytes);
  if (manifest.name !== '@red-cup-engineering/pnpm-engineering-services-section'
    || manifest.exports?.['./native-observation'] !== './src/native-observation.mjs') throw new TypeError('observation public supplier identity differs');
  return { name: manifest.name, version: manifest.version, manifestPath, manifestSHA256: hash(manifestBytes),
    publicExport: './native-observation', closure: [{ path: servicePath, sha256: hash(service) }, { path: preloadPath, sha256: hash(preload) }, { path: providerPath, sha256: hash(providerBytes) }],
    externalImports: 'node-builtins-only' };
}
function validateRequest(input, context) {
  record(input, ['receiptDirectory', 'targets', 'maximumEvents', 'maximumBytes'], ['receiptDirectory', 'targets']);
  const maximumEvents = Object.hasOwn(input, 'maximumEvents') ? input.maximumEvents : 4096, maximumBytes = Object.hasOwn(input, 'maximumBytes') ? input.maximumBytes : 1048576;
  if (!Number.isSafeInteger(maximumEvents) || maximumEvents < 1 || maximumEvents > 16384
    || !Number.isSafeInteger(maximumBytes) || maximumBytes < 4096 || maximumBytes > 8388608) throw new TypeError('finite observation budgets required');
  if (typeof input.receiptDirectory !== 'string' || input.receiptDirectory.length > 4096 || !isAbsolute(input.receiptDirectory)
    || !Array.isArray(input.targets) || !input.targets.length || input.targets.length > 1024) throw new TypeError('explicit bounded observation selection required');
  if (Object.getPrototypeOf(input.targets) !== Array.prototype
    || Reflect.ownKeys(input.targets).some(key => key !== 'length' && (typeof key !== 'string' || !/^(0|[1-9][0-9]*)$/u.test(key)
      || !('value' in Object.getOwnPropertyDescriptor(input.targets, key))))
    || Array.from({ length: input.targets.length }, (_, index) => index).some(index => !Object.hasOwn(input.targets, index)))
    throw new TypeError('observation targets require a dense own-data array');
  const seen = new Set(), endpoints = new Map();
  function normalized(url) {
    try { return url.origin + decodeURIComponent(url.pathname); }
    catch { throw new TypeError('malformed normalized observation endpoint'); }
  }
  function bind(key, value) {
    const identity = JSON.stringify(value);
    if (endpoints.has(key) && endpoints.get(key) !== identity) throw new TypeError('conflicting normalized observation endpoint');
    endpoints.set(key, identity);
  }
  const targets = input.targets.map(target => {
    record(target, ['name', 'version', 'registry', 'tarball'], ['name', 'version', 'registry', 'tarball']);
    if (typeof target.name !== 'string' || target.name.length > 214 || !namePattern.test(target.name)
      || typeof target.version !== 'string' || target.version.length > 128 || !exactVersion(target.version)) throw new TypeError('exact observation package identity required');
    for (const key of ['registry', 'tarball']) if (typeof target[key] !== 'string' || target[key].length > 2048) throw new TypeError('bounded observation endpoint required');
    const registry = new URL(target.registry), archive = new URL(target.tarball);
    const allowed = url => url.protocol === 'https:' || (context.kind === 'source-loopback-qualification' && url.protocol === 'http:' && url.hostname === '127.0.0.1');
    if (![registry, archive].every(url => allowed(url) && !url.username && !url.password && !url.search && !url.hash)
      || archive.origin !== registry.origin || !registry.pathname.endsWith('/')) throw new TypeError('observation requires same-authority safe endpoints');
    const identity = target.name + '@' + target.version;
    if (seen.has(identity)) throw new TypeError('duplicate observation selection');
    seen.add(identity);
    const metadata = new URL(registry.href); metadata.pathname = registry.pathname.replace(/\/$/u, '') + '/' + target.name;
    bind(normalized(metadata), { name: target.name, version: null, endpoint: 'metadata' });
    metadata.pathname += '/' + target.version;
    bind(normalized(metadata), { name: target.name, version: target.version, endpoint: 'metadata' });
    const attestation = new URL(registry.href); attestation.pathname = registry.pathname.replace(/\/$/u, '') + '/-/npm/v1/attestations/' + target.name + '@' + target.version;
    bind(normalized(attestation), { name: target.name, version: target.version, endpoint: 'attestation' });
    bind(normalized(archive), { name: target.name, version: target.version, endpoint: 'archive' });
    return { name: target.name, version: target.version, registry: registry.href, tarball: archive.href };
  });
  if (Buffer.byteLength(JSON.stringify(targets)) > 2 * 1024 * 1024 - 16384) throw new TypeError('observation configuration exceeds bound');
  return { receiptDirectory: input.receiptDirectory, targets, maximumEvents, maximumBytes };
}
function* lines(text) { let start = 0; for (;;) { const end = text.indexOf('\n', start); if (end < 0) { if (start < text.length) yield text.slice(start); return; } yield text.slice(start, end); start = end + 1; } }
function projectNative(stdout, targets, maximumEvents, maximumBytes) {
  const selected = new Map(targets.map(target => [target.name + '@' + target.version, target]));
  const events = []; let bytes = 0, partial = false, discarded = 0;
  for (const line of lines(stdout)) {
    if (!line.trim()) continue;
    if (line.length > 65536) { partial = true; continue; }
    let value; try { value = JSON.parse(line); } catch { partial = true; continue; }
    let event;
    if (value?.name === 'pnpm:lockfile-verification' && ['started', 'done', 'failed', 'cached'].includes(value.status)) event = { event: 'lockfile-verification', status: value.status };
    if (value?.name === 'pnpm:progress' && ['fetched', 'found_in_store'].includes(value.status) && selected.has(value.packageId)) {
      const target = selected.get(value.packageId); event = { event: 'package-fetch', status: value.status, name: target.name, version: target.version };
    }
    if (!event) { discarded++; continue; }
    const size = Buffer.byteLength(JSON.stringify(event)) + 1;
    if (events.length >= maximumEvents || bytes + size > maximumBytes) { partial = true; continue; }
    bytes += size; events.push(event);
  }
  return { events, partial, discarded };
}
function projectTransport(text, targets, maximumEvents) {
  const allowed = new Map(targets.map(t => [t.name + '@' + t.version, t]));
  const names = new Set(targets.map(t => t.name)), events = [], requests = new Map(); let partial = false, sequence = 0, elapsed = 0, final = false, ready = false;
  const codes = new Set(['unclassified', 'ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'ETIMEDOUT', 'EHOSTUNREACH', 'ENETUNREACH', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT', 'UND_ERR_SOCKET', 'UND_ERR_ABORTED']);
  for (const line of lines(text)) {
    if (!line) continue;
    let value; try { value = JSON.parse(line); } catch { partial = true; break; }
    if (events.length >= maximumEvents + 2 || value?.v !== 1 || !Number.isSafeInteger(value.seq)
      || value.seq <= sequence || !Number.isSafeInteger(value.ms) || value.ms < elapsed) { partial = true; break; }
    if (value.seq !== sequence + 1) partial = true; sequence = value.seq; elapsed = value.ms;
    if (final) { partial = true; break; }
    const base = { v: 1, seq: value.seq, ms: value.ms, event: value.event };
    if (value.event === 'ready' && value.scope === 'main-process-undici') { if (ready) { partial = true; continue; } ready = true; events.push({ ...base, scope: value.scope }); continue; }
    if (!ready) { partial = true; continue; }
    if (value.event === 'final' && typeof value.lost === 'boolean' && typeof value.fault === 'boolean'
      && Number.isSafeInteger(value.unclassified) && value.unclassified >= 0) { final = true; partial ||= value.lost || value.fault; events.push({ ...base, lost: value.lost, fault: value.fault, unclassified: value.unclassified }); continue; }
    if (!['request-created', 'response-headers', 'response-complete', 'request-error'].includes(value.event)
      || !Number.isSafeInteger(value.request) || value.request < 1 || value.request > maximumEvents
      || (value.event === 'response-headers' && (!Number.isInteger(value.status) || value.status < 100 || value.status > 599))
      || !['metadata', 'archive', 'attestation'].includes(value.endpoint)
      || !(value.version === null && value.endpoint === 'metadata' ? names.has(value.name) : allowed.has(value.name + '@' + value.version))) { partial = true; continue; }
    const identity = JSON.stringify([value.name, value.version, value.endpoint]);
    if (value.event === 'request-created') {
      if (requests.has(value.request)) { partial = true; continue; }
      requests.set(value.request, { identity, phase: 'created' });
    } else {
      const previous = requests.get(value.request);
      if (!previous || previous.identity !== identity || ['response-complete', 'request-error'].includes(previous.phase)
        || (value.event === 'response-headers' && previous.phase !== 'created')
        || (value.event === 'response-complete' && previous.phase !== 'response-headers')) { partial = true; continue; }
      previous.phase = value.event;
    }
    const event = { ...base, request: value.request, name: value.name, version: value.version, endpoint: value.endpoint };
    if (value.event === 'response-headers' && Number.isInteger(value.status) && value.status >= 100 && value.status <= 599) event.status = value.status;
    if (value.event === 'request-error') event.code = codes.has(value.code) ? value.code : 'unclassified';
    events.push(event);
  }
  return { events, partial: partial || !ready || !final, ready, final };
}

/** Explicit source/service composition, never a caller JSON module locator or
 * evidence of installed issuance. The service does not execute the installer. */
export function createNativeObservationService(options = {}) {
  record(options, ['qualificationRoot']);
  const context = options.qualificationRoot === undefined ? { kind: 'explicit-provider-composition' } : { kind: 'source-loopback-qualification', root: options.qualificationRoot };
  if (context.root !== undefined && (typeof context.root !== 'string' || !isAbsolute(context.root))) throw new TypeError('absolute qualification root required');
  const sessions = new WeakMap();
  async function state(ticket) { const selected = sessions.get(ticket); if (!selected) throw new TypeError('observation session was not issued by this service'); return selected; }
  return Object.freeze({
    kind: 'pnpm.native-installation-observation.service.v1',
    async prepare(input) {
      record(input, ['program', 'arguments', 'cwd', 'request'], ['program', 'arguments', 'cwd', 'request']);
      const { program, arguments: args, cwd, request } = input;
      const selection = validateRequest(request, context);
      if (!Array.isArray(args) || args.some(arg => typeof arg !== 'string') || typeof cwd !== 'string' || !isAbsolute(cwd)) throw new TypeError('explicit native base command required');
      if (context.root !== undefined && (!below(await realpath(context.root), await realpath(cwd)))) throw new TypeError('synthetic observation must remain in its qualification root');
      const directory = selection.receiptDirectory;
      if (await realpath(directory) !== directory || !(await lstat(directory)).isDirectory()) throw new TypeError('real owner observation directory required');
      const native = await provider(program, args, cwd), owner = await supplier();
      const sessionDirectory = await mkdtemp(join(directory, '.pnpm-observation-'));
      const configPath = join(sessionDirectory, 'config.json'), eventsPath = join(sessionDirectory, 'events.ndjson');
      const config = { kind: 'pnpm.native-observation.config.v1', ...selection, eventsPath, parentPid: process.pid, entry: native.provider.entry };
      delete config.receiptDirectory;
      const configText = JSON.stringify(config) + '\n';
      if (Buffer.byteLength(configText) > 2 * 1024 * 1024) throw new TypeError('observation configuration exceeds bound');
      await writeFile(eventsPath, '', { flag: 'wx', mode: 0o600 });
      await writeFile(configPath, configText, { flag: 'wx', mode: 0o600 });
      const ticket = Object.freeze({ kind: 'pnpm.native-observation.session.v1' });
      const commandDelta = Object.freeze({ prefix: Object.freeze(['--import', preloadPath]), reporter: '--reporter=ndjson', environment: Object.freeze({ [variable]: configPath }) });
      sessions.set(ticket, { program, args: [...args], cwd, selection, native, owner, configPath, configText, eventsPath, sessionDirectory, revalidations: 0 });
      return Object.freeze({ session: ticket, provider: native, supplier: owner, commandDelta, context: Object.freeze({ ...context }), receiptDirectory: sessionDirectory });
    },
    async revalidate(ticket) {
      const s = await state(ticket);
      await provider(s.program, s.args, s.cwd, s.native, false);
      if (!isDeepStrictEqual(s.owner, await supplier()) || (await regular(s.configPath, 2 * 1024 * 1024)).toString('utf8') !== s.configText)
        throw new TypeError('observation provider or source custody changed');
      await provider(s.program, s.args, s.cwd, s.native);
      s.revalidations++;
      return true;
    },
    async receive(ticket, outcome) {
      const s = await state(ticket);
      const stdoutBytes = Buffer.isBuffer(outcome.stdout) ? outcome.stdout : Buffer.from(typeof outcome.stdout === 'string' ? outcome.stdout : '');
      const stderrBytes = Buffer.isBuffer(outcome.stderr) ? outcome.stderr : Buffer.from(typeof outcome.stderr === 'string' ? outcome.stderr : '');
      const stdout = stdoutBytes.toString('utf8');
      const custody = { preInvocationRevalidated: s.revalidations > 0, afterSettlement: 'unchanged' };
      try {
        await provider(s.program, s.args, s.cwd, s.native, false);
        if (!isDeepStrictEqual(s.owner, await supplier()) || (await regular(s.configPath, 2 * 1024 * 1024)).toString('utf8') !== s.configText) throw new Error('changed');
      } catch { custody.afterSettlement = 'changed-or-unavailable'; }
      const native = projectNative(stdout, s.selection.targets, s.selection.maximumEvents, s.selection.maximumBytes);
      native.partial ||= !stdoutBytes.equals(Buffer.from(stdout));
      let transport = { events: [], partial: true, ready: false, final: false }, readError = false;
      try {
        const handle = await open(s.eventsPath, constants.O_RDONLY | constants.O_NOFOLLOW);
        try { const stat = await handle.stat(); if (!stat.isFile() || stat.size > s.selection.maximumBytes) throw new Error('bounded observation read refused');
          transport = projectTransport(await handle.readFile('utf8'), s.selection.targets, s.selection.maximumEvents); }
        finally { await handle.close(); }
      } catch { readError = true; }
      const terminal = { invoked: typeof outcome.invoked === 'boolean' ? outcome.invoked : null, code: Number.isInteger(outcome.code) && outcome.code >= 0 && outcome.code <= 255 ? outcome.code : null,
        signal: ['SIGTERM', 'SIGKILL', 'SIGINT'].includes(outcome.signal) ? outcome.signal : null,
        errorCode: outcome.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER' ? outcome.code : null };
      const evidence = { kind: 'pnpm.native-observation.receipt.v1', context: { ...context }, provider: s.native, supplier: s.owner,
        preparedConfiguration: { sha256: hash(s.configText), bytes: Buffer.byteLength(s.configText) },
        custody, coverage: { status: native.partial || transport.partial || readError || custody.afterSettlement !== 'unchanged' ? 'partial' : 'observed-prefix',
          scope: 'selected-main-process-events', selectionComplete: false, nativePartial: native.partial,
          transportPartial: transport.partial, readError, finalMarker: transport.final, discardedNativeRecords: native.discarded },
        terminal, streams: { stdout: { representation: Buffer.isBuffer(outcome.stdout) ? 'original-bytes' : 'utf8-representation', bytes: stdoutBytes.length, sha256: hash(stdoutBytes) }, stderr: { representation: Buffer.isBuffer(outcome.stderr) ? 'original-bytes' : 'utf8-representation', bytes: stderrBytes.length, sha256: hash(stderrBytes) } },
        native: native.events, transport: transport.events };
      return { evidence, stdout: native.events.map(event => JSON.stringify(event)).join('\n'), stderr: '',
        safeFailure: terminal.errorCode ?? terminal.signal ?? (terminal.code === null ? 'native-command-failed' : 'native-exit-' + terminal.code) };
    }
  });
}

/** Receives an already-settled native NDJSON stream. This is a bounded
 * observation, not evidence issuance or a replacement for PNPM policy. The
 * invoking owner binds command/provider/source custody and complete capture. */
export function receiveNativeOfflineVerification(input) {
  record(input, ['stdout', 'terminal', 'observation', 'lockfilePath'], ['stdout', 'terminal', 'observation', 'lockfilePath']);
  record(input.terminal, ['invoked', 'code', 'signal'], ['invoked', 'code', 'signal']);
  record(input.observation, ['startedAt', 'endedAt', 'complete'], ['startedAt', 'endedAt', 'complete']);
  const { stdout, terminal, observation, lockfilePath } = input;
  const epoch = value => Number.isSafeInteger(value) && value >= 0 && value <= 8640000000000000;
  if ((!Buffer.isBuffer(stdout) && typeof stdout !== 'string')
    || typeof lockfilePath !== 'string' || lockfilePath.length > 4096 || !isAbsolute(lockfilePath) || lockfilePath.includes('\0')
    || !epoch(observation.startedAt) || !epoch(observation.endedAt) || observation.endedAt < observation.startedAt
    || observation.endedAt - observation.startedAt > 86400000 || typeof observation.complete !== 'boolean'
    || typeof terminal.invoked !== 'boolean' || !(terminal.code === null || (Number.isInteger(terminal.code) && terminal.code >= 0 && terminal.code <= 255))
    || !(terminal.signal === null || (typeof terminal.signal === 'string' && /^SIG[A-Z0-9]{1,20}$/u.test(terminal.signal))))
    throw new TypeError('bounded settled native verification observation required');
  if (stdout.length > 8388608) throw new TypeError('native verification stream exceeds eight MiB');
  const bytes = Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout);
  if (bytes.length > 8388608) throw new TypeError('native verification stream exceeds eight MiB');
  const text = bytes.toString('utf8');
  const events = []; let records = 0, discarded = 0, partial = !observation.complete || !bytes.equals(Buffer.from(text)) || (typeof stdout === 'string' && stdout !== text);
  let malformed = false;
  if (text.length && !text.endsWith('\n')) partial = true;
  for (const line of lines(text)) {
    if (!line.trim()) continue;
    if (++records > 100000 || Buffer.byteLength(line) > 65536) { partial = true; break; }
    let value; try { value = JSON.parse(line); } catch { partial = true; continue; }
    if (value === null || typeof value !== 'object' || Array.isArray(value)) { partial = true; continue; }
    if (value.name !== 'pnpm:lockfile-verification') { discarded++; continue; }
    if (events.length >= 16) { partial = true; break; }
    const event = {};
    for (const field of ['name', 'status', 'time', 'pid', 'level', 'entries', 'elapsedMs', 'lockfilePath', 'verifiedAt']) {
      if (Object.hasOwn(value, field)) event[field] = value[field];
    }
    events.push(event);
    if (!['started', 'done', 'failed', 'cached'].includes(value.status)
      || value.level !== 'debug' || !epoch(value.time) || value.time < observation.startedAt || value.time > observation.endedAt
      || !Number.isSafeInteger(value.pid) || value.pid < 1 || value.lockfilePath !== lockfilePath) malformed = true;
    if (value.status === 'cached') {
      if (Object.hasOwn(value, 'verifiedAt') && (typeof value.verifiedAt !== 'string' || value.verifiedAt.length > 64
        || !Number.isFinite(Date.parse(value.verifiedAt)))) malformed = true;
    } else if (!Number.isSafeInteger(value.entries) || value.entries < 1) malformed = true;
    if (['done', 'failed'].includes(value.status) && (!Number.isSafeInteger(value.elapsedMs) || value.elapsedMs < 0
      || value.elapsedMs > observation.endedAt - observation.startedAt)) malformed = true;
  }
  let reason;
  if (!terminal.invoked || terminal.code !== 0 || terminal.signal !== null) reason = 'native-install-not-successful';
  else if (partial) reason = 'native-reporter-partial';
  else if (malformed) reason = 'native-verification-malformed';
  else if (events.some(event => event.status === 'cached')) reason = 'native-prior-verdict-reused';
  else if (events.some(event => event.status === 'failed')) reason = 'native-verification-failed';
  else if (events.length !== 2 || events[0].status !== 'started' || events[1].status !== 'done') reason = 'native-verification-sequence-incomplete-or-ambiguous';
  else if (events[0].entries !== events[1].entries || events[0].pid !== events[1].pid
    || events[1].time < events[0].time) reason = 'native-verification-sequence-inconsistent';
  else reason = 'fresh-native-verification-observed';
  return Object.freeze({ kind: 'pnpm.native-offline-verification.observation.v1', accepted: reason === 'fresh-native-verification-observed', reason,
    terminal: Object.freeze({ ...terminal }), observation: Object.freeze({ ...observation }), lockfilePath,
    stream: Object.freeze({ bytes: bytes.length, sha256: hash(bytes), records, discarded, partial,
      representation: Buffer.isBuffer(stdout) ? 'original-bytes' : 'utf8-representation' }),
    events: Object.freeze(events.map(event => Object.freeze(event))) });
}

/** Diagnostic grammar only. Causal native history is owned by the precall
 * capability receiver; a caller-provided timestamp is not that authority. */
export function receiveNativeCachedVerification(input, verifiedAt) {
  const observed = receiveNativeOfflineVerification(input);
  const event = observed.events[0];
  const accepted = observed.reason === 'native-prior-verdict-reused'
    && observed.events.length === 1 && event.status === 'cached'
    && typeof verifiedAt === 'string' && Number.isFinite(Date.parse(verifiedAt))
    && event.verifiedAt === verifiedAt && Date.parse(verifiedAt) <= event.time;
  return Object.freeze({...observed, kind: 'pnpm.native-cached-verification.observation.v1',
    accepted, reason: accepted ? 'native-cached-verification-observed' : observed.reason === 'native-prior-verdict-reused'
      ? 'native-cached-verification-sequence-or-time-invalid' : observed.reason,
    freshPolicyRecomputationReceived: false});
}
