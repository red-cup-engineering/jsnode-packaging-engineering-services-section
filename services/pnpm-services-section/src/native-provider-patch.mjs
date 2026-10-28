// Original PNPM owner: fixed reproducible Code-product transform, never a live patch.
import {createHash} from 'node:crypto';
export const UPSTREAM_DISTRIBUTION_SHA256 = 'e3738fda08262f74611d7a1ffc11b3e87fa52b466c07eb73211d179ebcb98810';
export const UPSTREAM_INVENTORY_SHA256 = '86d641a60ea0b5e9e317e3bf76888f80ec663ca57c8572b1d29ff093d46fb0b7';
export const PATCHED_DISTRIBUTION_SHA256 = 'fe6a7f99a5598fb3886b225de4471d704b35097147a1b6e81f34c270d9d686b8';
export const PATCHED_INVENTORY_SHA256 = 'de775b2bb6f53e861ffea7e6b2257f2d12792d9441fa22b1d2e40b768e08c6ef';
export const METADATA_CACHE_BYTES = 8 * 1024 * 1024;
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

export function createNativeMetadataCacheGroup(byteLimit, ttl, scope, options = {}) {
  const clock = options.clock ?? (() => performance.now());
  const report = options.report ?? (value => logger("metadata-cache-retention").debug(value));
  const settled = new Map();
  let retainedBytes = 0, peakRetainedBytes = 0, pendingEntries = 0, peakPendingEntries = 0;
  let evictions = 0, oversizedEntries = 0, rejectedEntries = 0;
  const stats = () => ({ scope, byteLimit, retainedBytes, peakRetainedBytes, pendingEntries,
    peakPendingEntries, settledEntries: settled.size, evictions, oversizedEntries, rejectedEntries });
  const emit = () => { try { report(stats()); } catch { /* Diagnostics never change a policy result. */ } };
  const costOf = (value, key) => {
    let bytes = Buffer.byteLength(key, "utf8") + 64, visited = 0;
    const seen = new Set(), stack = [[value, 0]];
    while (stack.length && bytes <= byteLimit) {
      const [next, depth] = stack.pop();
      if (++visited > 262144 || depth > 64) return byteLimit + 1;
      if (next === null || next === undefined) { bytes += 8; continue; }
      if (typeof next === "string") { bytes += Buffer.byteLength(next, "utf8") + 8; continue; }
      if (typeof next === "number" || typeof next === "boolean") { bytes += 16; continue; }
      if (typeof next !== "object") return byteLimit + 1;
      if (seen.has(next)) continue;
      seen.add(next); bytes += 48;
      if (next instanceof Map) {
        for (const [k, v] of next) { bytes += 32; if (bytes > byteLimit || visited + stack.length + 2 > 262144) return byteLimit + 1; stack.push([k, depth + 1], [v, depth + 1]); }
      } else if (next instanceof Set) {
        for (const v of next) { bytes += 16; if (bytes > byteLimit || visited + stack.length + 1 > 262144) return byteLimit + 1; stack.push([v, depth + 1]); }
      } else {
        const prototype = Object.getPrototypeOf(next);
        if (!Array.isArray(next) && prototype !== Object.prototype && prototype !== null) return byteLimit + 1;
        for (const k of Reflect.ownKeys(next)) {
          const descriptor = Object.getOwnPropertyDescriptor(next, k);
          if (typeof k !== "string" || !Object.hasOwn(descriptor, "value")) return byteLimit + 1;
          bytes += Buffer.byteLength(k, "utf8") + 24;
          if (bytes > byteLimit || visited + stack.length + 1 > 262144) return byteLimit + 1;
          stack.push([descriptor.value, depth + 1]);
        }
      }
    }
    return bytes;
  };
  const release = entry => {
    if (!settled.delete(entry)) return;
    retainedBytes -= entry.bytes;
    if (entry.owner.settled.get(entry.key) === entry) entry.owner.settled.delete(entry.key);
  };
  const retain = (owner, key, value, observed) => {
    let bytes;
    try { bytes = costOf(observed, key); } catch { bytes = byteLimit + 1; }
    if (bytes > byteLimit) { oversizedEntries++; emit(); return; }
    while (retainedBytes + bytes > byteLimit || settled.size >= 10000) {
      const oldest = settled.keys().next().value;
      if (!oldest) break;
      release(oldest); evictions++;
    }
    const entry = { owner, key, value, bytes, expiresAt: ttl ? clock() + ttl : Infinity };
    owner.settled.set(key, entry); settled.set(entry, true); retainedBytes += bytes;
    peakRetainedBytes = Math.max(peakRetainedBytes, retainedBytes); emit();
  };
  return {
    stats,
    createMap() {
      const owner = { pending: new Map(), settled: new Map() };
      const remove = key => {
        const pending = owner.pending.get(key);
        if (pending) { owner.pending.delete(key); pendingEntries--; }
        const cached = owner.settled.get(key);
        if (cached) release(cached);
        return Boolean(pending || cached);
      };
      const api = {
        get(key) {
          const pending = owner.pending.get(key);
          if (pending) return pending.value;
          const entry = owner.settled.get(key);
          if (!entry) return undefined;
          if (entry.expiresAt <= clock()) { release(entry); emit(); return undefined; }
          settled.delete(entry); settled.set(entry, true);
          return entry.value;
        },
        set(key, value) {
          remove(key);
          if (typeof key !== "string") { oversizedEntries++; emit(); return api; }
          if (value && typeof value.then === "function") {
            const entry = { value };
            owner.pending.set(key, entry); pendingEntries++;
            peakPendingEntries = Math.max(peakPendingEntries, pendingEntries); emit();
            Promise.resolve(value).then(observed => {
              if (owner.pending.get(key) !== entry) return;
              owner.pending.delete(key); pendingEntries--;
              retain(owner, key, value, observed);
            }, () => {
              if (owner.pending.get(key) !== entry) return;
              owner.pending.delete(key); pendingEntries--; rejectedEntries++; emit();
            });
          } else retain(owner, key, value, value);
          return api;
        },
        has(key) { return api.get(key) !== undefined; },
        delete(key) { const removed = remove(key); emit(); return removed; },
        clear() {
          pendingEntries -= owner.pending.size; owner.pending.clear();
          for (const entry of owner.settled.values()) release(entry);
          emit();
        },
        get size() { return owner.pending.size + owner.settled.size; },
        *keys() { yield* owner.pending.keys(); yield* owner.settled.keys(); },
        *values() { for (const key of api.keys()) yield api.get(key); },
        *entries() { for (const key of api.keys()) yield [key, api.get(key)]; },
        forEach(callback, receiver) { for (const [key, value] of api.entries()) callback.call(receiver, value, key, api); },
        [Symbol.iterator]() { return api.entries(); },
        nativeMetadataCacheStats: stats,
      };
      return api;
    },
  };
}

function replaceOnce(source, prior, next) {
  if (!source.includes(prior) || source.indexOf(prior) !== source.lastIndexOf(prior))
    throw new TypeError('original PNPM source transform site is not unique');
  return source.replace(prior, () => next);
}
function originalFunction(source, name) {
  const start = source.indexOf('function ' + name + '(');
  if (start < 0) throw new TypeError('original PNPM function is absent: ' + name);
  const end = source.indexOf('\n}\n', start);
  if (end < 0) throw new TypeError('original PNPM function boundary is absent');
  return source.slice(start, end + 2);
}
export function patchNativeDistribution(input) {
  if (!Buffer.isBuffer(input) || digest(input) !== UPSTREAM_DISTRIBUTION_SHA256)
    throw new TypeError('only the exact original PNPM distribution may be constructed');
  let source = input.toString('utf8');
  source = replaceOnce(source,
    '    lockfilePath: wantedLockfilePath,\n    isReplaced: matchUpdateTargetsReplacedEverywhere(projects, ctx, opts3.depth)',
    '    lockfilePath: wantedLockfilePath,\n    concurrency: opts3.networkConcurrency,\n    isReplaced: matchUpdateTargetsReplacedEverywhere(projects, ctx, opts3.depth)');
  const context = originalFunction(source, 'createPublishedAtLookupContext');
  let bounded = replaceOnce(context, '  return {', '  nativeVerifierMetadataCaches ??= createNativeMetadataCacheGroup(8 * 1024 * 1024, 0, "verifier");\n  const nativeCaches = nativeVerifierMetadataCaches;\n  return {');
  for (const name of ['abbreviatedMetaCache','publishedAtCache','localMetaCache','fullMetaCache','fullMetaForTrustCache'])
    bounded = replaceOnce(bounded, name + ': /* @__PURE__ */ new Map()', name + ': nativeCaches.createMap()');
  source = replaceOnce(source, context, bounded);
  const shared = originalFunction(source, 'createDefaultPackageMetaCache');
  source = replaceOnce(source, shared, createNativeMetadataCacheGroup.toString() + '\nvar nativeSharedMetadataCaches, nativeVerifierMetadataCaches;\nfunction createDefaultPackageMetaCache() {\n  nativeSharedMetadataCaches ??= createNativeMetadataCacheGroup(8 * 1024 * 1024, 120 * 1e3, "shared");\n  return nativeSharedMetadataCaches.createMap();\n}');
  const iteration = originalFunction(source, 'iterateLockfileViolations');
  let admitted = replaceOnce(iteration, '  const limit = pLimit(concurrency ?? DEFAULT_CONCURRENCY);',
    '  const selectedConcurrency = concurrency ?? DEFAULT_CONCURRENCY;\n  const limit = pLimit(selectedConcurrency);\n  let active = 0, maximumActive = 0, checked = 0;');
  admitted = replaceOnce(admitted, '  const verifyCandidate = async (candidate) => {\n    try {',
    '  const verifyCandidate = async (candidate) => {\n    active++; maximumActive = Math.max(maximumActive, active);\n    try {');
  admitted = replaceOnce(admitted, '      fetchError ??= err2;\n    }\n  };',
    '      fetchError ??= err2;\n    } finally { active--; checked++; }\n  };');
  admitted = replaceOnce(admitted, '  if (fetchError != null)\n    throw fetchError;',
    '  logger("lockfile-verification-admission").debug({ selectedConcurrency, maximumActive, checked });\n  if (fetchError != null)\n    throw fetchError;');
  source = replaceOnce(source, iteration, admitted);
  return Buffer.from(source, 'utf8');
}
