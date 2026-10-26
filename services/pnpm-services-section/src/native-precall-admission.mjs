// PNPM-owned closed publisher admission. This module never launches a process.
import { access, lstat, realpath } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, isAbsolute, join, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { inspectHookFreeYaml } from './native-hook-profile.mjs';
import { hash, regular, provider } from './native-provider.mjs';
import { receiveNativeTransportEnvironment } from './native-transport-environment.mjs';
import { boundedClone } from './native-metadata-data.mjs';
import { receiveNativeOfflineVerification, receiveNativeCachedVerification } from './native-observation.mjs';

const capabilities = new WeakMap();
const offlineMode = 'offline-frozen';
const onlineMode = 'online-frozen';
const preparedOfflineMode = 'prepared-offline-frozen';
const preparedOnlineMode = 'prepared-online-frozen';
const lockRefresh = 'lockfile-refresh';
const offlineLockRefresh = 'offline-lockfile-refresh';
const inheritedTransport = 'inherited-native-transport';
const noManagerPin = 'root-package-no-manager-pin';
const registryConsumer = 'registry-consumer';
const own = (value, key) => Object.hasOwn(value, key);
const refusal = reason => { throw new TypeError(`native pre-call profile: ${reason}`); };
const shimHash = '67b035e322203961795e8e34ca63a08c37a4386eda94107fb3d28f3246d882ad';
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const ownRecord = value => plain(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value))
  && Reflect.ownKeys(value).every(key => typeof key === 'string' && Object.getOwnPropertyDescriptor(value,key).enumerable && Object.hasOwn(Object.getOwnPropertyDescriptor(value,key),'value')); 
function registry(value) {
  let url; try { url = new URL(value); } catch { refusal('invalid registry'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || (url.href !== value && url.href !== value + '/') || url.pathname !== '/') refusal('unsupported registry');
}
function originalInstall(args, operation) {
  if (!Array.isArray(args) || args.some(arg => typeof arg !== 'string')) refusal('invalid command arguments');
  if (args.length !== 9 || args[0] !== 'install' || args[1] !== (operation === lockRefresh ? '--no-frozen-lockfile' : '--frozen-lockfile') || args[2] !== '--registry'
      || args[4] !== '--cache-dir' || args[6] !== '--store-dir' || args[8] !== '--config.prefer-offline=false') refusal('unsupported original install grammar');
  registry(args[3]);
  for (const index of [5, 7]) if (!isAbsolute(args[index]) || resolve(args[index]) !== args[index]) refusal('cache and store must be normalized absolute paths');
  return args.slice();
}
/** Explicit owner transformation for the native-module publication recipe. Source policy is untouched. */
export function deriveNativeLifecycleDisabledInstallArguments(originalArguments) {
  const alreadyDisabled = Array.isArray(originalArguments) && originalArguments.length === 10 && originalArguments[9] === '--ignore-scripts';
  return Object.freeze([...originalInstall(alreadyDisabled ? originalArguments.slice(0, -1) : originalArguments), '--ignore-scripts']);
}
/** No linking or lifecycles requested; native resolution may still fetch archives. */
export function deriveNativeLockfileRefreshArguments(originalArguments) {
  const derived = Array.isArray(originalArguments) && originalArguments.length === 11
    && originalArguments[9] === '--lockfile-only' && originalArguments[10] === '--ignore-scripts';
  return Object.freeze([...originalInstall(derived ? originalArguments.slice(0, 9) : originalArguments, lockRefresh),
    '--lockfile-only', '--ignore-scripts']);
}
/** Explicit native offline resolution over the caller's admitted cache closure. */
export function deriveNativeOfflineLockfileRefreshArguments(originalArguments) {
  const derived = Array.isArray(originalArguments) && originalArguments.length === 13
    && originalArguments[11] === '--offline' && originalArguments[12] === '--reporter=ndjson';
  return Object.freeze([...deriveNativeLockfileRefreshArguments(derived ? originalArguments.slice(0, 11) : originalArguments),
    '--offline', '--reporter=ndjson']);
}
/** Separately selected initial online frozen receiving; never offline fallback. */
export function deriveNativeOnlineFrozenInstallArguments(originalArguments) {
  const derived = Array.isArray(originalArguments) && originalArguments.length === 12
    && originalArguments[10] === '--config.update-notifier=false' && originalArguments[11] === '--reporter=ndjson';
  return Object.freeze([...deriveNativeLifecycleDisabledInstallArguments(derived ? originalArguments.slice(0, 10) : originalArguments),
    '--config.update-notifier=false', '--reporter=ndjson']);
}
/** Explicit offline qualification, never automatic fallback or policy rewriting. */
export function deriveNativeOfflineFrozenInstallArguments(originalArguments) {
  const alreadyOffline = Array.isArray(originalArguments) && originalArguments.length === 12
    && originalArguments[10] === '--offline' && originalArguments[11] === '--reporter=ndjson';
  const base = alreadyOffline ? originalArguments.slice(0, 10) : originalArguments;
  return Object.freeze([...deriveNativeLifecycleDisabledInstallArguments(base), '--offline', '--reporter=ndjson']);
}
/** Explicitly request the original verifier path instead of workspace-state
 * optimistic reuse. No policy, history, source timestamp or legacy mode changes. */
export function deriveNativePreparedOfflineInstallArguments(originalArguments) {
  const alreadyPrepared = Array.isArray(originalArguments) && originalArguments.length === 13
    && originalArguments[12] === '--no-optimistic-repeat-install';
  return Object.freeze([...deriveNativeOfflineFrozenInstallArguments(alreadyPrepared ? originalArguments.slice(0, 12) : originalArguments),
    '--no-optimistic-repeat-install']);
}
/** Suppress only the native install's unrelated package-manager update lookup.
 * Ordinary lifecycle-disabled callers and consumer policy remain unchanged. */
export function deriveNativePreparedOnlineInstallArguments(originalArguments) {
  const alreadyPrepared = Array.isArray(originalArguments) && originalArguments.length === 11
    && originalArguments[10] === '--config.update-notifier=false';
  return Object.freeze([...deriveNativeLifecycleDisabledInstallArguments(alreadyPrepared ? originalArguments.slice(0, 10) : originalArguments),
    '--config.update-notifier=false']);
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
function commands(args, mode, operation) {
  if (operation === lockRefresh) {
    const derived = mode === offlineLockRefresh ? deriveNativeOfflineLockfileRefreshArguments(args) : deriveNativeLockfileRefreshArguments(args);
    if (!isDeepStrictEqual(args, derived)) refusal('explicit lockfile-only lifecycle suppression required');
    return [args.slice()];
  }
  if (mode === preparedOfflineMode) {
    if (!isDeepStrictEqual(args, deriveNativePreparedOfflineInstallArguments(args))) refusal('explicit prepared offline verifier grammar required');
    return [args.slice(), ['--version']];
  }
  if (mode === preparedOnlineMode) {
    if (!isDeepStrictEqual(args, deriveNativePreparedOnlineInstallArguments(args))) refusal('explicit prepared online grammar required');
    return [args.slice(), ['--version']];
  }
  if (mode === onlineMode) {
    if (!isDeepStrictEqual(args, deriveNativeOnlineFrozenInstallArguments(args))) refusal('explicit online frozen reporter grammar required');
    return [args.slice(), ['--version']];
  }
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
async function executable(name, env = process.env) {
  if (name.includes('/')) {
    if (!isAbsolute(name)) refusal('relative executable');
    await access(name, constants.X_OK);
    return realpath(name);
  }
  for (const part of (env.PATH ?? '').split(':')) {
    if (!isAbsolute(part)) refusal('PATH must contain only absolute directories');
    const path = join(part, name);
    try { const stat = await lstat(path); if (stat.isFile() || stat.isSymbolicLink()) { await access(path, constants.X_OK); return await realpath(path); } }
    catch (error) { if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR' && error.code !== 'EACCES') throw error; }
  }
  refusal('executable not found');
}
const workerKeys = new Set(['PATH','LANG','LC_ALL','TZ','SystemRoot','WINDIR','HOME','TMPDIR','TEMP','TMP',
  'npm_config_userconfig','npm_config_globalconfig','npm_config_ignore_scripts','npm_config_update_notifier','npm_config_audit','npm_config_fund']);
function environment(input) {
  const explicit = input.environmentProfile === inheritedTransport;
  const values = explicit ? input.environment : process.env;
  // Only this already qualified transport grammar may widen the worker grammar.
  // PATH/HOME are shared stable inputs; all other worker fields stay worker-owned.
  const transport = explicit ? Object.fromEntries(Object.entries(values).filter(([key]) => !workerKeys.has(key) || ['PATH','HOME'].includes(key))) : null;
  if (explicit) {
    if (Object.hasOwn(values, 'NPM_CONFIG_PREFIX')) refusal('unsupported inherited prefix configuration');
    receiveNativeTransportEnvironment(transport, input.environmentPolicy);
  } else for (const key of Object.keys(values)) if (!workerKeys.has(key)) refusal('unsupported launch environment field ' + key);
  for (const value of Object.values(values)) if (typeof value !== 'string' || value.length > 8192 || /[\0\r\n]/u.test(value)) refusal('bounded own-data environment required');
  for (const key of ['HOME','TMPDIR','TEMP','TMP','npm_config_userconfig','npm_config_globalconfig'])
    if (!isAbsolute(values[key] ?? '') || resolve(values[key]) !== values[key]) refusal('missing or non-normalized environment path ' + key);
  if (values.npm_config_ignore_scripts !== 'true') refusal('original worker npm control required');
  for (const key of ['npm_config_update_notifier','npm_config_audit','npm_config_fund']) if (values[key] !== 'false') refusal('original worker control required: ' + key);
  if (values.XDG_CONFIG_HOME !== undefined && (!isAbsolute(values.XDG_CONFIG_HOME) || resolve(values.XDG_CONFIG_HOME) !== values.XDG_CONFIG_HOME)) refusal('non-normalized configuration home');
  return {values, sha256: hash(JSON.stringify(Object.keys(values).sort().map(key => [key, values[key]])))};
}
function workspace(text, registry = false) {
  inspectHookFreeYaml(text);
  if (text.includes('${')) refusal('configuration interpolation unsupported');
  if (registry) return registryWorkspace(text);
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
function registryWorkspace(text) {
  const seen=new Set(),overrides=new Set();let parent;
  const name=/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/u;
  const version=/^(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?(?:\+[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?$/u;
  for(const line of text.split(/\r?\n/u)){
    if(!line.trim()||/^\s*#/u.test(line))continue;
    if(!line.startsWith(' ')){
      const root=/^([A-Za-z][A-Za-z0-9]*): *(.*?) *(?:#.*)?$/u.exec(line);
      if(!root||seen.has(root[1])||!['packages','minimumReleaseAge','minimumReleaseAgeStrict','minimumReleaseAgeExclude','overrides'].includes(root[1]))refusal('unsupported registry workspace setting');
      seen.add(parent=root[1]);const value=root[2];
      if(parent==='packages'&&value!=='[]'||parent==='minimumReleaseAge'&&!/^(?:0|[1-9][0-9]*)$/u.test(value)
        ||parent==='minimumReleaseAgeStrict'&&!['true','false'].includes(value)
        ||['minimumReleaseAgeExclude','overrides'].includes(parent)&&value!=='')refusal('unsupported registry workspace value');
    }else if(parent==='overrides'){
      const entry=/^  (?:'([^']+)'|"([^"]+)"|([^:\s]+)): +(?:'([^']+)'|"([^"]+)"|([^\s]+)) *(?:#.*)?$/u.exec(line);
      const key=entry&&(entry[1]??entry[2]??entry[3]),value=entry&&(entry[4]??entry[5]??entry[6]);
      if(!entry||!name.test(key)||!version.test(value)||overrides.has(key))refusal('registry overrides require unique exact package versions');
      overrides.add(key);
    }else if(parent==='minimumReleaseAgeExclude'){
      const entry=/^  - (?:'([^']+)'|"([^"]+)"|([^\s]+)) *(?:#.*)?$/u.exec(line);
      if(!entry||!/^[@a-z0-9*][@a-zA-Z0-9._/*+-]*$/u.test(entry[1]??entry[2]??entry[3]))refusal('unsupported literal registry age exemption');
    }else refusal('unsupported nested registry workspace value');
  }
}
function npmrc(text) {
  for (const line of text.split(/\r?\n/u)) {
    if (!line.trim() || /^\s*[#;]/u.test(line)) continue;
    const match = /^(?:registry|@[a-z0-9][a-z0-9._-]*:registry)=(https:\/\/[^\s]+)$/u.exec(line);
    if (!match) refusal('unsupported project registry configuration');
    registry(match[1]);
  }
}
// The qualified native root finder searches these names upwards before
// deciding membership. An absent local workspace is not absence of policy.
const workspaceNames = ['pnpm-workspace.yaml','pnpm-workspaces.yaml','pnpm-workspaces.yml',
  'pnpm-workspace.yml','.pnpm-workspace.yaml','.pnpm-workspace.yml','.pnpm-workspaces.yaml','.pnpm-workspaces.yml'];
async function registryWorkspaceCustody(cwd, local) {
  const files = [];
  for (const name of workspaceNames.slice(1)) files.push(await absent(join(cwd,name)));
  if (!local.exists) {
    for (let parent = dirname(cwd); ; parent = dirname(parent)) {
      for (const name of [...workspaceNames,'.npmrc']) files.push(await absent(join(parent,name)));
      if (dirname(parent) === parent) break;
    }
  }
  return files;
}
async function snapshot(input) {
  const launch = environment(input), env = launch.values;
  if (process.platform !== 'linux' || !isAbsolute(input.cwd) || await realpath(input.cwd) !== input.cwd) refusal('real Linux root required');
  const allowedCommands = commands(input.installArguments, input.qualificationMode, input.operation);
  const offline = [offlineMode, offlineLockRefresh, preparedOfflineMode].includes(input.qualificationMode);
  const refreshing = input.operation === lockRefresh;
  const derived = refreshing ? (offline ? deriveNativeOfflineLockfileRefreshArguments : deriveNativeLockfileRefreshArguments)(input.originalInstallArguments)
    : input.qualificationMode === preparedOfflineMode ? deriveNativePreparedOfflineInstallArguments(input.originalInstallArguments)
    : input.qualificationMode === preparedOnlineMode ? deriveNativePreparedOnlineInstallArguments(input.originalInstallArguments)
    : input.qualificationMode === onlineMode ? deriveNativeOnlineFrozenInstallArguments(input.originalInstallArguments)
    : offline ? deriveNativeOfflineFrozenInstallArguments(input.originalInstallArguments)
    : deriveNativeLifecycleDisabledInstallArguments(input.originalInstallArguments);
  if (!isDeepStrictEqual(derived, input.installArguments)) refusal('original and derived command differ');
  const transformation = {kind: refreshing ? (offline ? 'pnpm.publisher-offline-lockfile-refresh.v1' : 'pnpm.publisher-lockfile-refresh.v1')
    : input.qualificationMode === preparedOfflineMode ? 'pnpm.prepared-offline-frozen.v1'
    : input.qualificationMode === preparedOnlineMode ? 'pnpm.prepared-online-frozen.v1'
    : input.qualificationMode === onlineMode ? 'pnpm.publisher-online-frozen.v1'
    : offline ? 'pnpm.publisher-offline-frozen.v1' : 'pnpm.publisher-lifecycle-disabled.v1', originalArguments: input.originalInstallArguments.slice(), derivedArguments: derived};
  transformation.identity = hash(JSON.stringify(transformation));
  const selected = await executable(input.pnpm, env);
  if (await executable('node', env) !== await realpath(process.execPath)) refusal('PATH Node differs from receiving runtime');
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
  if (!plain(pkg) || (input.sourceProfile === noManagerPin ? own(pkg, 'packageManager')
    : input.sourceProfile === registryConsumer ? own(pkg,'packageManager') && pkg.packageManager !== 'pnpm@11.28.5'
    : pkg.packageManager !== 'pnpm@11.28.5'))
    refusal(input.sourceProfile === noManagerPin ? 'no manager declaration permitted in explicit no-pin profile' : 'exact legacy manager pin required');
  for (const field of ['engines','devEngines']) if (own(pkg, field)) {
    if (!plain(pkg[field]) || own(pkg[field], 'runtime') || own(pkg[field], 'packageManager')) refusal('manager/runtime activation declaration unsupported');
  }
  const ws = await identity(join(input.cwd, 'pnpm-workspace.yaml'), input.sourceProfile !== registryConsumer);
  if (ws.exists) workspace(ws.text,input.sourceProfile === registryConsumer);
  if (input.sourceProfile === registryConsumer) files.push(...await registryWorkspaceCustody(input.cwd,ws));
  const rc = await identity(join(input.cwd, '.npmrc')); if (rc.exists) npmrc(rc.text);
  files.push(manifest, ws, rc, await identity(join(input.cwd, 'pnpm-lock.yaml'), true));
  for (const key of ['npm_config_userconfig','npm_config_globalconfig']) {
    const file = await identity(env[key], true); if (file.bytes !== 0) refusal('original empty worker config required'); files.push(file);
  }
  const home = env.HOME, configHome = env.XDG_CONFIG_HOME ?? join(home, '.config');
  for (const key of ['NODE_EXTRA_CA_CERTS','SSL_CERT_FILE']) if (env[key]) {
    if (!isAbsolute(env[key]) || resolve(env[key]) !== env[key]) refusal('non-normalized CA input');
    files.push(await identity(env[key], true, 1048576));
  }
  for (const path of [join(home,'.npmrc'), join(configHome,'pnpm','config.yaml'), join(configHome,'pnpm','auth.ini'),
    ...(input.environmentProfile === inheritedTransport ? [join(configHome,'pnpm','rc')] : []),
    ...['package.json5','package.yaml','.pnpmfile.cjs','.pnpmfile.mjs'].map(name => join(input.cwd,name))]) files.push(await absent(path));
  for (const name of ['native-precall-admission.mjs','native-hook-profile.mjs','native-provider.mjs','native-transport-environment.mjs','native-metadata-data.mjs']) files.push(await identity(fileURLToPath(new URL(name, import.meta.url)), true));
  files.push(await identity(fileURLToPath(new URL('../package.json', import.meta.url)), true));
  files.push(await identity(fileURLToPath(new URL('native-observation.mjs', import.meta.url)), true));
  return {kind: refreshing ? 'pnpm.publisher-lockfile-refresh-precall-profile.v1'
    : input.qualificationMode === preparedOfflineMode ? 'pnpm.prepared-offline-precall-profile.v1'
    : input.qualificationMode === preparedOnlineMode ? 'pnpm.prepared-online-precall-profile.v1'
    : input.qualificationMode === onlineMode ? 'pnpm.publisher-online-precall-profile.v1'
    : offline ? 'pnpm.publisher-offline-precall-profile.v1' : 'pnpm.publisher-precall-profile.v1',
    sourceProfile: input.sourceProfile ?? 'root-package-legacy-manager-pin',
    ...(offline || [preparedOnlineMode,onlineMode].includes(input.qualificationMode) || input.preparedCache ? {cache: await cacheCustody(input)} : {}), cwd: input.cwd, selected, environmentSHA256: launch.sha256, ...(input.environmentProfile ? {environmentProfile: input.environmentProfile} : {}), supplier, allowedCommands, transformation,
    files: files.map(({text,...file}) => file)};
}
/** Static admission of the actual original publisher child. No process is run. */
export async function receiveNativePrecallAdmission(input) {
  if (!ownRecord(input) || Object.keys(input).some(key => !['cwd','pnpm','installArguments','originalInstallArguments','qualificationMode','cacheRoot','operation','sourceProfile','environmentProfile','environment','environmentPolicy'].includes(key)) || typeof input.pnpm !== 'string') refusal('invalid admission request');
  if (input.environmentProfile !== undefined && input.environmentProfile !== inheritedTransport) refusal('unsupported environment profile');
  if ((input.environmentProfile === inheritedTransport) !== (input.environment !== undefined && input.environmentPolicy !== undefined)
    || (input.environmentProfile === undefined && (input.environment !== undefined || input.environmentPolicy !== undefined))) refusal('explicit environment and transport policy must be paired');
  if (input.operation !== undefined && input.operation !== lockRefresh) refusal('unsupported operation');
  if (input.sourceProfile !== undefined && ![noManagerPin,registryConsumer].includes(input.sourceProfile)) refusal('unsupported source profile');
  if (input.sourceProfile === registryConsumer && input.operation !== undefined) refusal('registry consumer profile admits frozen operations only');
  if (input.qualificationMode !== undefined && ![offlineMode, onlineMode, offlineLockRefresh, preparedOfflineMode, preparedOnlineMode].includes(input.qualificationMode)) refusal('unsupported qualification mode');
  if (input.operation === lockRefresh && [preparedOnlineMode,onlineMode].includes(input.qualificationMode)) refusal('prepared qualification does not match operation');
  if (input.operation === lockRefresh && [offlineMode, preparedOfflineMode].includes(input.qualificationMode)
    || input.operation !== lockRefresh && input.qualificationMode === offlineLockRefresh) refusal('offline qualification does not match operation');
  if (input.qualificationMode === undefined && input.cacheRoot !== undefined) refusal('cache admission requires explicit offline mode');
  const frozen = {cwd: input.cwd, pnpm: input.pnpm,
    ...(input.environmentProfile ? {environmentProfile: input.environmentProfile,
      environment: Object.freeze(boundedClone(input.environment, 262144)),
      environmentPolicy: boundedClone(input.environmentPolicy, 65536)} : {}),
    ...(input.operation === undefined ? {} : {operation: input.operation}),
    ...(input.sourceProfile === undefined ? {} : {sourceProfile: input.sourceProfile}),
    ...(input.qualificationMode === undefined ? {} : {qualificationMode: input.qualificationMode, cacheRoot: input.cacheRoot}), installArguments: input.installArguments?.slice(), originalInstallArguments: input.originalInstallArguments?.slice()};
  const received = await snapshot(frozen);
  const transformation = Object.freeze({...received.transformation, originalArguments: Object.freeze(received.transformation.originalArguments.slice()), derivedArguments: Object.freeze(received.transformation.derivedArguments.slice())});
  const capability = Object.freeze({kind: received.kind, identity: hash(JSON.stringify(received)), transformation});
  capabilities.set(capability, {input: frozen, received, offlineReceived: false});
  return capability;
}
/** Call before each native operation or original producer entry. Caller retains sole-writer custody. */
export async function assertNativePrecallAdmission(capability, command) {
  const state = capabilities.get(capability); if (!state) refusal('unrecognized process-local capability');
  if (command !== undefined && !ownRecord(command)) refusal('own-data command required');
  if (state.lockRefreshClosed) refusal('lock refresh receiving consumed the capability');
  if (state.preparedClosed) refusal('prepared installation capability is closed');
  if (state.input.qualificationMode === preparedOfflineMode && command === undefined) refusal('prepared offline profile permits exact commands only, not producer entry');
  if (state.input.qualificationMode === preparedOnlineMode && command === undefined) refusal('prepared online profile permits exact commands only, not producer entry');
  if (state.input.environmentProfile === inheritedTransport && command === undefined) refusal('explicit launch environment requires an exact command; producer entry is not admitted');
  if (state.input.operation === lockRefresh && command === undefined) refusal('lock refresh permits only its exact command, not producer entry');
  if (state.offlineFailed) refusal('offline receiving failed; capability is closed');
  if (state.offlineReceived && command !== undefined && isDeepStrictEqual(command.arguments, state.input.installArguments)) refusal('offline installation capability is single-use');
  if ([offlineMode,onlineMode].includes(state.input.qualificationMode) && !state.offlineReceived
    && (command === undefined || !isDeepStrictEqual(command.arguments, state.input.installArguments))) refusal('offline installation must be received before producer entry');
  const current = await snapshot(state.input);
  if (!isDeepStrictEqual(current,state.received)) refusal('admitted source, provider or context changed');
  if (command !== undefined) {
    if (command.environment !== undefined) boundedClone(command.environment, 262144);
    if (state.input.environmentProfile === inheritedTransport && !isDeepStrictEqual(command.environment, state.input.environment)) refusal('command environment differs from admitted launch');
    if (state.input.environmentProfile === undefined && command.environment !== undefined) refusal('explicit command environment requires inherited transport profile');
    if (!plain(command) || Object.keys(command).some(key => !['cwd','program','arguments','environment'].includes(key)) || command.cwd !== current.cwd
      || typeof command.program !== 'string' || await executable(command.program, state.input.environment ?? process.env) !== current.selected
      || !current.allowedCommands.some(args => isDeepStrictEqual(args, command.arguments))) refusal('command outside admitted set');
  }
  return capability.identity;
}

/** Lock preparation is not native frozen verification or installed receiving. */
export async function receiveNativeLockfileRefresh(capability, result) {
  const state = capabilities.get(capability);
  if (!state || state.input.operation !== lockRefresh || state.lockRefreshClosed)
    refusal('unrecognized or already received lock refresh');
  state.lockRefreshClosed = true;
  const path = join(state.input.cwd, 'pnpm-lock.yaml');
  const lockOf = value => value?.files.find(file => file.path === path) ?? null;
  const beforeLock = lockOf(state.received);
  const publicHistory = value => value ? (({text, ...identity}) => Object.freeze(identity))(value) : null;
  let current;
  try {
    current = await snapshot(state.input);
    // The original native lock writer can append verification history while
    // resolving. Retain that transition; it is NOT fresh frozen verification.
    const withoutLock = value => ({...value, files: value.files.filter(file => file.path !== path),
      ...(value.cache ? {cache: {...value.cache, verdict: undefined}} : {})});
    if (!isDeepStrictEqual(withoutLock(current), withoutLock(state.received))) {
      const changed = Object.keys(current).filter(key => !isDeepStrictEqual(withoutLock(current)[key], withoutLock(state.received)[key]));
      refusal('admitted source, policy, provider or context changed during lock refresh: ' + changed.join(', '));
    }
    const terminal = result?.terminal, observation = result?.observation;
    if (terminal?.invoked !== true || terminal.code !== 0 || terminal.signal !== null
      || terminal.timedOut !== false || terminal.truncated !== false || terminal.failedToStart !== false
      || observation?.complete !== true || !Number.isSafeInteger(observation.startedAt)
      || !Number.isSafeInteger(observation.endedAt) || observation.startedAt < 0
      || observation.endedAt < observation.startedAt)
      refusal('complete successful original lock-refresh execution required');
    state.refreshed = {snapshot: current, interval: {...observation}};
    return Object.freeze({kind: 'pnpm.publisher-lockfile-refresh.v1', admissionIdentity: capability.identity,
      sourceProfile: current.sourceProfile, offline: state.input.qualificationMode === offlineLockRefresh,
      beforeLock: Object.freeze({...beforeLock}), afterLock: Object.freeze({...lockOf(current)}),
      priorNativeHistory: publicHistory(state.received.cache?.verdict),
      nativeHistory: publicHistory(current.cache?.verdict),
      terminal: Object.freeze({invoked: true, code: 0, signal: null,
        timedOut: false, truncated: false, failedToStart: false}),
      observation: Object.freeze({startedAt: observation.startedAt, endedAt: observation.endedAt, complete: true}),
      lockSemanticsReceived: false, nativeFrozenVerificationReceived: false, installationReceived: false});
  } catch (error) {
    error.nativeLockRefreshEvidence = Object.freeze({kind: 'pnpm.publisher-lockfile-refresh-refusal.v1',
      admissionIdentity: capability.identity, beforeLock: Object.freeze({...beforeLock}),
      afterLock: lockOf(current) ? Object.freeze({...lockOf(current)}) : null,
      priorNativeHistory: publicHistory(state.received.cache?.verdict),
      nativeHistory: publicHistory(current?.cache?.verdict),
      localChangesMayExist: true, capabilityClosed: true});
    throw error;
  }
}

/** Receive only the original install's fresh-native result. Local installation may
 * exist after refusal; it is not qualified for product generation/publication. */
export async function receiveNativeOfflineInstall(capability, result) {
  return receiveInitialFrozenInstall(capability,result,offlineMode);
}
export async function receiveNativeOnlineInstall(capability, result) {
  return receiveInitialFrozenInstall(capability,result,onlineMode);
}
async function receiveInitialFrozenInstall(capability,result,mode) {
  const state = capabilities.get(capability);
  if (!state || state.input.qualificationMode !== mode || state.offlineReceived || state.offlineFailed) refusal('unrecognized or already received offline installation');
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
  return Object.freeze({kind: mode === offlineMode ? 'pnpm.publisher-offline-installation.v1' : 'pnpm.publisher-online-installation.v1', admissionIdentity: capability.identity,
    nativeProvider: Object.freeze(boundedClone(current.supplier, 65536)),
    policyVerification: 'fresh-native', verification,
    persistedVerification: Object.freeze({verifiedAt: emitted.record.verifiedAt, lockfilePath: result.lockfilePath, recordSHA256: hash(emitted.line)}),
    priorVerdict: Object.freeze(priorVerdict), verdict: Object.freeze(verdict)});
  } catch (error) {
    const publicIdentity = value => value ? (({text, ...identity}) => identity)(value) : null;
    error[mode === offlineMode ? 'nativeOfflineEvidence' : 'nativeOnlineEvidence'] = Object.freeze({kind: mode === offlineMode ? 'pnpm.publisher-offline-refusal.v1' : 'pnpm.publisher-online-refusal.v1',
      admissionIdentity: capability.identity, policyVerification: verification?.reason ?? 'context-or-persistence-unreceived',
      verification: verification ?? null, priorVerdict: publicIdentity(state.received.cache.verdict),
      postVerdict: publicIdentity(current?.cache.verdict), localInstallationMayExist: true, capabilityClosed: true});
    throw error;
  }
}


function sharedPreparedCustody(value) {
  return {...value, kind: undefined, allowedCommands: undefined, transformation: undefined};
}
async function preparedHistory(snapshot, interval) {
  const path = join(snapshot.cwd, 'pnpm-lock.yaml'), history = snapshot.cache?.verdict;
  if (!history?.exists || !history.text.endsWith('\n')) refusal('prepared native history is absent or partial');
  let selected;
  for (const line of history.text.split('\n')) {
    if (!line) continue;
    let row; try { row = JSON.parse(line); } catch { continue; }
    // Match the original native byPath index's valid-key selection, then apply
    // the narrower received grammar. Never skip a later malformed matching row.
    if (typeof row?.lockfile?.hash === 'string' && row.lockfile.path === path) selected = {line, row};
  }
  const row = selected?.row, at = Date.parse(row?.verifiedAt);
  const stat = await lstat(path, {bigint: true});
  if (!stat.isFile() || !row || !Number.isFinite(at) || typeof row.verifiedAt !== 'string'
    || !row.lockfile.hash || row.lockfile.size !== Number(stat.size)
    || row.lockfile.mtimeNs !== String(stat.mtimeNs) || row.lockfile.inode !== String(stat.ino)
    || !ownRecord(row.policy) || (interval && (at < interval.startedAt || at > interval.endedAt)))
    refusal('prepared same-path native history/stat causality is unreceived');
  return {lineSHA256: hash(selected.line), row: boundedClone(row, 1048576),
    stat: {size: Number(stat.size), mtimeNs: String(stat.mtimeNs), inode: String(stat.ino)}};
}
function preparedTerminal(result) {
  const terminal = result?.terminal, observation = result?.observation;
  if (terminal?.invoked !== true || terminal.code !== 0 || terminal.signal !== null
    || terminal.timedOut !== false || terminal.truncated !== false || terminal.failedToStart !== false
    || observation?.complete !== true || !Number.isSafeInteger(observation.startedAt)
    || !Number.isSafeInteger(observation.endedAt) || observation.startedAt < 0
    || observation.endedAt < observation.startedAt) refusal('successful complete original prepared execution required');
}
/** Original process-local predecessor only; not a serialized receiving receipt.
 * Semantic lock delta and complete artifact-effect admission remain at composer. */
export async function receiveNativePreparedInstallAdmission(predecessor, options = {}) {
  if (!ownRecord(options) || Object.keys(options).some(key => key !== 'offline')) refusal('own-data prepared options required');
  const offline = own(options, 'offline') ? options.offline : false;
  const previous = capabilities.get(predecessor);
  if (typeof offline !== 'boolean' || !previous || previous.preparedNextConsumed
    || !(previous.refreshed || previous.preparedReceived)) refusal('original received process-local preparation required');
  previous.preparedNextConsumed = true;
  const checkpoint = previous.preparedReceived ?? previous.refreshed;
  const priorNow = await snapshot(previous.input);
  if (!isDeepStrictEqual(priorNow, checkpoint.snapshot)) refusal('prepared predecessor source or history changed');
  const history = await preparedHistory(priorNow, previous.refreshed?.interval);
  const originalInstallArguments = previous.input.originalInstallArguments.slice(0,9);
  originalInstallArguments[1] = '--frozen-lockfile';
  const installArguments = (offline ? deriveNativePreparedOfflineInstallArguments : deriveNativePreparedOnlineInstallArguments)(originalInstallArguments);
  const input = {...previous.input, operation: undefined, qualificationMode: offline ? preparedOfflineMode : preparedOnlineMode,
    cacheRoot: previous.input.cacheRoot, originalInstallArguments, installArguments, preparedCache: true};
  const current = await snapshot(input);
  if (!isDeepStrictEqual(sharedPreparedCustody(current), sharedPreparedCustody(priorNow))) refusal('prepared operation changes original custody');
  const capability = Object.freeze({kind: 'pnpm.prepared-native-installation-precall.v1',
    identity: hash(JSON.stringify(current)), offline, predecessorIdentity: predecessor.identity,
    transformation: Object.freeze({...current.transformation})});
  capabilities.set(capability, {input, received: current, preparedHistory: history, offlineReceived: false});
  return capability;
}
/** Online materialization has no reporter claim; optional offline receiving
 * binds the native cached decision to the actual held original refresh history. */
export async function receiveNativePreparedInstall(capability, result) {
  const state = capabilities.get(capability);
  if (!state?.preparedHistory || state.preparedClosed) refusal('unrecognized or closed prepared installation');
  state.preparedClosed = true;
  let current, verification;
  try {
    preparedTerminal(result);
    current = await snapshot(state.input);
    if (!isDeepStrictEqual(current, state.received)) refusal('prepared source, lock, provider or native history changed');
    const history = await preparedHistory(current);
    if (!isDeepStrictEqual(history, state.preparedHistory)) refusal('prepared native history/stat changed');
    if (capability.offline) {
      if (result.lockfilePath !== join(state.input.cwd, 'pnpm-lock.yaml')) refusal('another prepared source lock');
      verification = receiveNativeCachedVerification({stdout: result.stdout, lockfilePath: result.lockfilePath,
        terminal: {invoked: true, code: 0, signal: null}, observation: result.observation}, history.row.verifiedAt);
      if (!verification.accepted) refusal('prepared cached native verification unreceived: ' + verification.reason);
    }
    state.preparedReceived = {snapshot: current};
    return Object.freeze({kind: 'pnpm.prepared-native-installation.v1', admissionIdentity: capability.identity,
      predecessorIdentity: capability.predecessorIdentity, offline: capability.offline,
      nativeProvider: Object.freeze(boundedClone(current.supplier, 65536)),
      nativeExecutionReceived: true, policyVerification: capability.offline ? 'cached-native' : 'not-observed',
      freshPolicyRecomputationReceived: false, verification: verification ?? null,
      persistedVerification: Object.freeze({verifiedAt: history.row.verifiedAt,
        lockfilePath: history.row.lockfile.path, opaqueSemanticHash: history.row.lockfile.hash,
        policy: Object.freeze(history.row.policy), recordSHA256: history.lineSHA256}),
      lockSemanticsReceived: false, installedArtifactMembersReceived: false});
  } catch (error) {
    const publicHistory = value => value ? (({text, ...identity}) => Object.freeze(identity))(value) : null;
    error.nativePreparedEvidence = Object.freeze({kind: 'pnpm.prepared-native-installation-refusal.v1',
      admissionIdentity: capability.identity, verification: verification ?? null,
      priorNativeHistory: publicHistory(state.received.cache?.verdict),
      postNativeHistory: publicHistory(current?.cache?.verdict), postCustodyReadFailed: !current,
      localChangesMayExist: true, capabilityClosed: true});
    throw error;
  }
}
