// PNPM-owned closed publisher admission. This module never launches a process.
import { access, lstat, realpath } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, isAbsolute, join, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { inspectHookFreeYaml } from './native-hook-profile.mjs';
import { hash, regular, provider } from './native-provider.mjs';
import { receiveNativeOfflineVerification } from './native-observation.mjs';

const capabilities = new WeakMap();
const offlineMode = 'offline-frozen';
const own = (value, key) => Object.hasOwn(value, key);
const refusal = reason => { throw new TypeError(`native pre-call profile: ${reason}`); };
const shimHash = '67b035e322203961795e8e34ca63a08c37a4386eda94107fb3d28f3246d882ad';
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function registry(value) {
  let url; try { url = new URL(value); } catch { refusal('invalid registry'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || (url.href !== value && url.href !== value + '/') || url.pathname !== '/') refusal('unsupported registry');
}
function originalInstall(args) {
  if (!Array.isArray(args) || args.some(arg => typeof arg !== 'string')) refusal('invalid command arguments');
  if (args.length !== 9 || args[0] !== 'install' || args[1] !== '--frozen-lockfile' || args[2] !== '--registry'
      || args[4] !== '--cache-dir' || args[6] !== '--store-dir' || args[8] !== '--config.prefer-offline=false') refusal('unsupported frozen-install grammar');
  registry(args[3]);
  for (const index of [5, 7]) if (!isAbsolute(args[index]) || resolve(args[index]) !== args[index]) refusal('cache and store must be normalized absolute paths');
  return args.slice();
}
/** Explicit owner transformation for the native-module publication recipe. Source policy is untouched. */
export function deriveNativeLifecycleDisabledInstallArguments(originalArguments) {
  const alreadyDisabled = Array.isArray(originalArguments) && originalArguments.length === 10 && originalArguments[9] === '--ignore-scripts';
  return Object.freeze([...originalInstall(alreadyDisabled ? originalArguments.slice(0, -1) : originalArguments), '--ignore-scripts']);
}
/** Explicit offline qualification, never automatic fallback or policy rewriting. */
export function deriveNativeOfflineFrozenInstallArguments(originalArguments) {
  const alreadyOffline = Array.isArray(originalArguments) && originalArguments.length === 12
    && originalArguments[10] === '--offline' && originalArguments[11] === '--reporter=ndjson';
  const base = alreadyOffline ? originalArguments.slice(0, 10) : originalArguments;
  return Object.freeze([...deriveNativeLifecycleDisabledInstallArguments(base), '--offline', '--reporter=ndjson']);
}
async function cacheCustody(input) {
  const root = input.cacheRoot;
  if (typeof root !== 'string' || !isAbsolute(root) || resolve(root) !== root) refusal('explicit normalized cache allocation required');
  const inside = (parent, child) => { const path = relative(parent, child); return path === '' || (path !== '..' && !path.startsWith('..' + sep) && !isAbsolute(path)); };
  if (inside(root, input.cwd) || inside(input.cwd, root)) refusal('cache allocation overlaps source');
  const directories = [];
  for (const path of [root, join(root, 'pnpm-metadata'), join(root, 'pnpm-store')]) {
    const stat = await lstat(path);
    if (!stat.isDirectory() || stat.uid !== process.getuid() || await realpath(path) !== path
      || (path === root && (stat.mode & 0o077) !== 0)) refusal('cache allocation must be owned, private and unredirected');
    directories.push({path, dev: stat.dev, ino: stat.ino, uid: stat.uid, mode: stat.mode});
  }
  if (input.installArguments[5] !== directories[1].path || input.installArguments[7] !== directories[2].path) refusal('command cache paths differ from allocation');
  return {directories, verdict: await identity(join(root, 'pnpm-metadata', 'lockfile-verified.jsonl'), false, 8388608)};
}
function commands(args, mode) {
  if (mode === offlineMode) {
    if (!Array.isArray(args) || args.length !== 12 || args[10] !== '--offline' || args[11] !== '--reporter=ndjson') refusal('explicit offline reporter grammar required');
    commands(args.slice(0, 10));
    return [args.slice(), ['--version'], ['list', '--recursive', '--depth=-1', '--json']];
  }
  if (!Array.isArray(args) || args.length !== 10 || args[9] !== '--ignore-scripts') refusal('explicit native lifecycle suppression required');
  originalInstall(args.slice(0, -1));
  return [args.slice(), ['--version'], ['list', '--recursive', '--depth=-1', '--json']];
}
async function identity(path, required = false, limit = 16777216) {
  try { const bytes = await regular(path, limit); return {path, exists: true, sha256: hash(bytes), bytes: bytes.length, text: bytes.toString('utf8')}; }
  catch (error) { if (error.code === 'ENOENT' && !required) return {path, exists: false}; throw error; }
}
async function absent(path) {
  try { await lstat(path); } catch (error) { if (error.code === 'ENOENT') return {path, exists: false}; throw error; }
  refusal('unexpected configuration or alternate manifest at ' + path);
}
async function executable(name) {
  if (name.includes('/')) {
    if (!isAbsolute(name)) refusal('relative executable');
    await access(name, constants.X_OK);
    return realpath(name);
  }
  for (const part of (process.env.PATH ?? '').split(':')) {
    if (!isAbsolute(part)) refusal('PATH must contain only absolute directories');
    const path = join(part, name);
    try { const stat = await lstat(path); if (stat.isFile() || stat.isSymbolicLink()) { await access(path, constants.X_OK); return await realpath(path); } }
    catch (error) { if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR' && error.code !== 'EACCES') throw error; }
  }
  refusal('executable not found');
}
function environment() {
  const allowed = new Set(['PATH','LANG','LC_ALL','TZ','SystemRoot','WINDIR','HOME','TMPDIR','TEMP','TMP',
    'npm_config_userconfig','npm_config_globalconfig','npm_config_ignore_scripts','npm_config_update_notifier','npm_config_audit','npm_config_fund']);
  for (const key of Object.keys(process.env)) if (!allowed.has(key)) refusal('unsupported launch environment field ' + key);
  for (const key of ['HOME','TMPDIR','TEMP','TMP','npm_config_userconfig','npm_config_globalconfig'])
    if (!isAbsolute(process.env[key] ?? '') || resolve(process.env[key]) !== process.env[key]) refusal('missing or non-normalized environment path ' + key);
  if (process.env.npm_config_ignore_scripts !== 'true') refusal('original worker npm control required');
  for (const key of ['npm_config_update_notifier','npm_config_audit','npm_config_fund']) if (process.env[key] !== 'false') refusal('original worker control required: ' + key);
  return hash(JSON.stringify(Object.keys(process.env).sort().map(key => [key, process.env[key]])));
}
function workspace(text) {
  inspectHookFreeYaml(text);
  if (text.includes('${')) refusal('configuration interpolation unsupported');
  const seen = new Set();
  for (const line of text.split(/\r?\n/u)) {
    if (!line.trim() || /^\s*#/u.test(line) || /^ /u.test(line)) continue;
    const key = /^([^:]+):/u.exec(line)?.[1];
    if (!['packages','minimumReleaseAge','minimumReleaseAgeStrict','minimumReleaseAgeExclude'].includes(key) || seen.has(key)) refusal('unsupported or duplicate workspace setting');
    seen.add(key);
    if (key === 'packages' && !/^packages: *\[\] *(?:#.*)?$/u.test(line)) refusal('only the local root workspace is qualified');
  }
  if (!seen.has('packages')) refusal('explicit root-only workspace required');
}
function npmrc(text) {
  for (const line of text.split(/\r?\n/u)) {
    if (!line.trim() || /^\s*[#;]/u.test(line)) continue;
    const match = /^(?:registry|@[a-z0-9][a-z0-9._-]*:registry)=(https:\/\/[^\s]+)$/u.exec(line);
    if (!match) refusal('unsupported project registry configuration');
    registry(match[1]);
  }
}
async function snapshot(input) {
  const env = environment();
  if (process.platform !== 'linux' || !isAbsolute(input.cwd) || await realpath(input.cwd) !== input.cwd) refusal('real Linux root required');
  const allowedCommands = commands(input.installArguments, input.qualificationMode);
  const offline = input.qualificationMode === offlineMode;
  const derived = offline ? deriveNativeOfflineFrozenInstallArguments(input.originalInstallArguments)
    : deriveNativeLifecycleDisabledInstallArguments(input.originalInstallArguments);
  if (!isDeepStrictEqual(derived, input.installArguments)) refusal('original and derived command differ');
  const transformation = {kind: offline ? 'pnpm.publisher-offline-frozen.v1' : 'pnpm.publisher-lifecycle-disabled.v1', originalArguments: input.originalInstallArguments.slice(), derivedArguments: derived};
  transformation.identity = hash(JSON.stringify(transformation));
  const selected = await executable(input.pnpm);
  if (await executable('node') !== await realpath(process.execPath)) refusal('PATH Node differs from receiving runtime');
  const root = dirname(dirname(selected)), entry = join(root, 'bin', 'pnpm.mjs');
  const supplier = await provider(process.execPath, [entry], input.cwd, undefined, false);
  if (supplier.provider.entrySHA256 !== 'ff3224d46b47fbb24a7e9fe15fededef7e00892d07d4e376b6762d4899906bfd'
    || supplier.provider.manifestSHA256 !== '2dd7bab34254562873ed6a748748f7259b727b143c2f8cca9966069cfdcae800') refusal('unqualified provider entry or manifest');
  const files = [];
  if (selected !== entry) {
    if (selected !== join(root, 'bin', 'pnpm.cjs')) refusal('unsupported provider launcher');
    const shim = await identity(selected, true); if (shim.sha256 !== shimHash) refusal('provider compatibility shim changed'); files.push(shim);
  }
  const builtin = await identity(join(root, 'dist', 'pnpmrc'), true);
  if (builtin.text.split(/\r?\n/u).some(line => line.trim() && !/^\s*#/u.test(line))) refusal('provider builtin settings unsupported');
  files.push(builtin);
  const nodePath = await realpath(process.execPath), nodeBytes = await regular(nodePath, 268435456);
  files.push({path: nodePath, exists: true, sha256: hash(nodeBytes), bytes: nodeBytes.length});
  const manifest = await identity(join(input.cwd, 'package.json'), true), pkg = JSON.parse(manifest.text);
  if (!plain(pkg) || pkg.packageManager !== 'pnpm@11.28.5') refusal('exact legacy manager pin required');
  for (const field of ['engines','devEngines']) if (own(pkg, field)) {
    if (!plain(pkg[field]) || own(pkg[field], 'runtime') || own(pkg[field], 'packageManager')) refusal('manager/runtime activation declaration unsupported');
  }
  const ws = await identity(join(input.cwd, 'pnpm-workspace.yaml'), true); workspace(ws.text);
  const rc = await identity(join(input.cwd, '.npmrc')); if (rc.exists) npmrc(rc.text);
  files.push(manifest, ws, rc, await identity(join(input.cwd, 'pnpm-lock.yaml'), true));
  for (const key of ['npm_config_userconfig','npm_config_globalconfig']) {
    const file = await identity(process.env[key], true); if (file.bytes !== 0) refusal('original empty worker config required'); files.push(file);
  }
  const home = process.env.HOME;
  for (const path of [join(home,'.npmrc'), join(home,'.config','pnpm','config.yaml'), join(home,'.config','pnpm','auth.ini'),
    ...['package.json5','package.yaml','.pnpmfile.cjs','.pnpmfile.mjs'].map(name => join(input.cwd,name))]) files.push(await absent(path));
  for (const name of ['native-precall-admission.mjs','native-hook-profile.mjs','native-provider.mjs']) files.push(await identity(fileURLToPath(new URL(name, import.meta.url)), true));
  files.push(await identity(fileURLToPath(new URL('../package.json', import.meta.url)), true));
  files.push(await identity(fileURLToPath(new URL('native-observation.mjs', import.meta.url)), true));
  return {kind: offline ? 'pnpm.publisher-offline-precall-profile.v1' : 'pnpm.publisher-precall-profile.v1', ...(offline ? {cache: await cacheCustody(input)} : {}), cwd: input.cwd, selected, environmentSHA256: env, supplier, allowedCommands, transformation,
    files: files.map(({text,...file}) => file)};
}
/** Static admission of the actual original publisher child. No process is run. */
export async function receiveNativePrecallAdmission(input) {
  if (!plain(input) || Object.keys(input).some(key => !['cwd','pnpm','installArguments','originalInstallArguments','qualificationMode','cacheRoot'].includes(key)) || typeof input.pnpm !== 'string') refusal('invalid admission request');
  if (input.qualificationMode !== undefined && input.qualificationMode !== offlineMode) refusal('unsupported qualification mode');
  if (input.qualificationMode === undefined && input.cacheRoot !== undefined) refusal('cache admission requires explicit offline mode');
  const frozen = {cwd: input.cwd, pnpm: input.pnpm, ...(input.qualificationMode === undefined ? {} : {qualificationMode: input.qualificationMode, cacheRoot: input.cacheRoot}), installArguments: input.installArguments?.slice(), originalInstallArguments: input.originalInstallArguments?.slice()};
  const received = await snapshot(frozen);
  const transformation = Object.freeze({...received.transformation, originalArguments: Object.freeze(received.transformation.originalArguments.slice()), derivedArguments: Object.freeze(received.transformation.derivedArguments.slice())});
  const capability = Object.freeze({kind: received.kind, identity: hash(JSON.stringify(received)), transformation});
  capabilities.set(capability, {input: frozen, received, offlineReceived: false});
  return capability;
}
/** Call before each native operation or original producer entry. Caller retains sole-writer custody. */
export async function assertNativePrecallAdmission(capability, command) {
  const state = capabilities.get(capability); if (!state) refusal('unrecognized process-local capability');
  if (state.offlineFailed) refusal('offline receiving failed; capability is closed');
  if (state.offlineReceived && command !== undefined && isDeepStrictEqual(command.arguments, state.input.installArguments)) refusal('offline installation capability is single-use');
  if (state.input.qualificationMode === offlineMode && !state.offlineReceived
    && (command === undefined || !isDeepStrictEqual(command.arguments, state.input.installArguments))) refusal('offline installation must be received before producer entry');
  const current = await snapshot(state.input);
  if (!isDeepStrictEqual(current,state.received)) refusal('admitted source, provider or context changed');
  if (command !== undefined) {
    if (!plain(command) || Object.keys(command).some(key => !['cwd','program','arguments'].includes(key)) || command.cwd !== current.cwd
      || typeof command.program !== 'string' || await executable(command.program) !== current.selected
      || !current.allowedCommands.some(args => isDeepStrictEqual(args, command.arguments))) refusal('command outside admitted set');
  }
  return capability.identity;
}

/** Receive only the original install's fresh-native result. Local installation may
 * exist after refusal; it is not qualified for product generation/publication. */
export async function receiveNativeOfflineInstall(capability, result) {
  const state = capabilities.get(capability);
  if (!state || state.input.qualificationMode !== offlineMode || state.offlineReceived || state.offlineFailed) refusal('unrecognized or already received offline installation');
  // Any receiving attempt consumes the installation transition; a refused
  // operation cannot reuse its capability to retry or enter the producer.
  state.offlineFailed = true;
  let verification, current;
  try {
  if (result?.lockfilePath !== join(state.input.cwd, 'pnpm-lock.yaml')) refusal('verification result names another source lock');
  current = await snapshot(state.input);
  const before = {...state.received, cache: {...state.received.cache, verdict: undefined}};
  const after = {...current, cache: {...current.cache, verdict: undefined}};
  if (!isDeepStrictEqual(before, after)) refusal('admitted source, provider or cache allocation changed during installation');
  verification = receiveNativeOfflineVerification(result);
  if (!verification.accepted) refusal('fresh native verification not received: ' + verification.reason);
  if (!current.cache.verdict.exists || current.cache.verdict.sha256 === state.received.cache.verdict.sha256)
    refusal('native verification verdict persistence unestablished');
  const emitted = current.cache.verdict.text.split('\n').filter(Boolean).map(line => {
    try { return {line, record: JSON.parse(line)}; } catch { return null; }
  }).filter(row => row?.record?.lockfile?.path === result.lockfilePath
    && typeof row.record.verifiedAt === 'string'
    && Date.parse(row.record.verifiedAt) >= result.observation.startedAt
    && Date.parse(row.record.verifiedAt) <= result.observation.endedAt).at(-1);
  if (!emitted) refusal('matching native verification verdict persistence unestablished');
  const {text: priorText, ...priorVerdict} = state.received.cache.verdict;
  const {text: verdictText, ...verdict} = current.cache.verdict;
  state.received = current;
  state.offlineReceived = true;
  state.offlineFailed = false;
  return Object.freeze({kind: 'pnpm.publisher-offline-installation.v1', admissionIdentity: capability.identity,
    policyVerification: 'fresh-native', verification,
    persistedVerification: Object.freeze({verifiedAt: emitted.record.verifiedAt, lockfilePath: result.lockfilePath, recordSHA256: hash(emitted.line)}),
    priorVerdict: Object.freeze(priorVerdict), verdict: Object.freeze(verdict)});
  } catch (error) {
    const publicIdentity = value => value ? (({text, ...identity}) => identity)(value) : null;
    error.nativeOfflineEvidence = Object.freeze({kind: 'pnpm.publisher-offline-refusal.v1',
      admissionIdentity: capability.identity, policyVerification: verification?.reason ?? 'context-or-persistence-unreceived',
      verification: verification ?? null, priorVerdict: publicIdentity(state.received.cache.verdict),
      postVerdict: publicIdentity(current?.cache.verdict), localInstallationMayExist: true, capabilityClosed: true});
    throw error;
  }
}
