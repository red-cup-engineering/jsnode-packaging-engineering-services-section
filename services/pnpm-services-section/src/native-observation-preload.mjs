// Private native observer. It observes the existing Undici dispatcher; it never
// replaces transport, modifies requests, or controls the original process.
import { channel } from 'node:diagnostics_channel';
import { openSync, readFileSync, realpathSync, fstatSync, writeSync, closeSync, constants } from 'node:fs';
import { isMainThread } from 'node:worker_threads';

if (isMainThread && process.env.PNPM_NATIVE_OBSERVATION_CONFIG) {
  let fd, sequence = 0, bytes = 0, emitted = 0, lost = false, fault = false, ended = false;
  let config, start = process.hrtime.bigint();
  const subscriptions = [];
  const safeCodes = new Set(['ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'ETIMEDOUT',
    'EHOSTUNREACH', 'ENETUNREACH', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT',
    'UND_ERR_BODY_TIMEOUT', 'UND_ERR_SOCKET', 'UND_ERR_ABORTED']);
  function emit(event, fields = {}, reserved = false) {
    if (fd === undefined || fault || ended) return;
    const record = { v: 1, seq: ++sequence, ms: Number((process.hrtime.bigint() - start) / 1000000n), event, ...fields };
    const text = JSON.stringify(record) + '\n', size = Buffer.byteLength(text);
    if (!reserved && (emitted >= config.maximumEvents || bytes + size > config.maximumBytes - 2048)) { lost = true; return; }
    if (bytes + size > config.maximumBytes) { lost = true; return; }
    const data = Buffer.from(text);
    try {
      for (let offset = 0; offset < data.length;) {
        const written = writeSync(fd, data, offset, data.length - offset);
        if (!written) throw new Error('observation write stopped');
        offset += written;
      }
      bytes += size; emitted++;
    } catch { fault = true; }
  }
  try {
    const configFd = openSync(process.env.PNPM_NATIVE_OBSERVATION_CONFIG, constants.O_RDONLY | constants.O_NOFOLLOW);
    let source;
    try {
      const stat = fstatSync(configFd);
      if (!stat.isFile() || stat.size > 2 * 1024 * 1024) throw new Error('observation configuration exceeds bound');
      source = readFileSync(configFd);
    } finally { closeSync(configFd); }
    config = JSON.parse(source);
    if (config.kind !== 'pnpm.native-observation.config.v1' || process.version !== 'v24.19.0'
      || !Number.isSafeInteger(config.maximumEvents) || config.maximumEvents < 1 || config.maximumEvents > 16384
      || !Number.isSafeInteger(config.maximumBytes) || config.maximumBytes < 4096 || config.maximumBytes > 8388608
      || !Array.isArray(config.targets) || config.targets.length > 1024) throw new Error('unsupported observation configuration');
    if (!Number.isSafeInteger(config.parentPid) || process.ppid !== config.parentPid || typeof config.entry !== 'string'
      || typeof process.argv[1] !== 'string' || realpathSync(process.argv[1]) !== config.entry) throw new Error('unsupported inherited observation context');
    fd = openSync(config.eventsPath, constants.O_WRONLY | constants.O_APPEND | constants.O_NOFOLLOW);
    if (!fstatSync(fd).isFile()) throw new Error('observation output is not regular');
    const endpoints = new Map();
    for (const target of config.targets) {
      const registry = new URL(target.registry), archive = new URL(target.tarball);
      const metadataPath = decodeURIComponent(registry.pathname.replace(/\/$/u, '') + '/' + target.name);
      endpoints.set(registry.origin + metadataPath, { name: target.name, version: null, endpoint: 'metadata' });
      endpoints.set(registry.origin + metadataPath + '/' + target.version, { name: target.name, version: target.version, endpoint: 'metadata' });
      const attestationPath = decodeURIComponent(registry.pathname.replace(/\/$/u, '') + '/-/npm/v1/attestations/' + target.name + '@' + target.version);
      endpoints.set(registry.origin + attestationPath, { name: target.name, version: target.version, endpoint: 'attestation' });
      endpoints.set(archive.origin + decodeURIComponent(archive.pathname), { name: target.name, version: target.version, endpoint: 'archive' });
    }
    const requests = new WeakMap(); let nextRequest = 0, unclassified = 0;
    const classify = request => {
      if (typeof request?.origin !== 'string' || typeof request?.path !== 'string'
        || request.origin.length > 2048 || request.path.length > 4096) return null;
      const url = new URL(request.path, request.origin);
      if (url.username || url.password || url.search || url.hash) return null;
      return endpoints.get(url.origin + decodeURIComponent(url.pathname)) ?? null;
    };
    function subscribe(name, callback) {
      const handle = message => { try { callback(message); } catch { fault = true; } };
      const selected = channel(name); selected.subscribe(handle); subscriptions.push([selected, handle]);
    }
    subscribe('undici:request:create', ({ request }) => {
      if (!request || typeof request !== 'object') { fault = true; return; }
      if (requests.has(request)) return;
      const target = classify(request);
      if (!target) { unclassified = Math.min(unclassified + 1, 2147483647); return; }
      if (nextRequest >= config.maximumEvents) { lost = true; return; }
      const record = { request: ++nextRequest, ...target }; requests.set(request, record);
      emit('request-created', record);
    });
    for (const [native, event] of [['headers', 'response-headers'], ['trailers', 'response-complete'], ['error', 'request-error']]) {
      subscribe('undici:request:' + native, message => {
        const target = requests.get(message.request); if (!target) return;
        const extra = {};
        if (native === 'headers' && Number.isInteger(message.response?.statusCode)
          && message.response.statusCode >= 100 && message.response.statusCode <= 599) extra.status = message.response.statusCode;
        if (native === 'error') extra.code = safeCodes.has(message.error?.code) ? message.error.code : 'unclassified';
        emit(event, { ...target, ...extra });
      });
    }
    emit('ready', { scope: 'main-process-undici' });
    process.once('exit', () => {
      emit('final', { lost, fault, unclassified }, true); ended = true;
      for (const [selected, callback] of subscriptions) { try { selected.unsubscribe(callback); } catch {} }
      if (fd !== undefined) { try { closeSync(fd); } catch {} }
    });
  } catch {
    // Observation failure must not throw into PNPM or alter its exit status.
    fault = true;
    if (fd !== undefined) { try { closeSync(fd); } catch {} }
  }
}
