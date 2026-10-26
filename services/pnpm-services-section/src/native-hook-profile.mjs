// A deliberately closed absence profile, not a second PNPM configuration loader.
import { lstat, realpath } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { hash, regular } from './native-provider.mjs';

const settingKey = key => key.toLowerCase().replace(/[_.-]/gu, '');
const environmentSetting = name => {
  const match = /^(?:npm|pnpm)[_.-]config[_.-](.+)$/iu.exec(name);
  return match ? settingKey(match[1]) : null;
};
const blocked = new Set(['pnpmfile', 'globalpnpmfile', 'ignorepnpmfile', 'configdependencies', 'lockfiledir', 'workspacedir', 'workspace', 'global', 'globaldir', 'prefix', 'dir', 'ignoreworkspace', 'recursive', 'workspaceroot', 'filter', 'filterprod']);
export function inspectHookFreeYaml(text) {
  if (typeof text !== 'string' || Buffer.byteLength(text) > 1048576 || /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u2028\u2029\ufeff\t]/u.test(text.replaceAll('\r\n', '\n')))
    throw new TypeError('unsupported hook-free YAML syntax');
  let root = false;
  for (const line of text.replaceAll('\r\n', '\n').split('\n')) {
    if (!line.trim() || /^\s*#/u.test(line)) continue;
    if (/^\s*(?:---|\.\.\.|%)(?:\s|$)/u.test(line)) throw new TypeError('multiple or directed YAML documents are outside the hook-free profile');
    if (/^ /u.test(line)) { if (!root) throw new TypeError('ambiguous YAML root indentation'); continue; }
    const match = /^([A-Za-z][A-Za-z0-9_-]*):(?:\s|$)/u.exec(line);
    if (!match || /[&*!]/u.test(line.slice(match?.[0].length ?? 0))) throw new TypeError('unsupported YAML root form');
    root = true;
    if (blocked.has(settingKey(match[1]))) throw new TypeError('existing native hook or configuration discovery is not composable');
  }
  return true;
}
// Exact canonical spelling only. Native nopt abbreviations/shorthands are
// deliberately unsupported rather than emulated by a second option parser.
function selectors(args) {
  if (!Array.isArray(args) || typeof args[0] !== 'string' || !isAbsolute(args[0])) throw new TypeError('unsupported native context grammar');
  const result = {}, seen = new Set(); let installs = 0;
  const flags = new Set(['--ignore-scripts', '--frozen-lockfile', '--offline', '--prefer-offline', '--reporter=append-only', '--config.minimumReleaseAgeStrict=true']);
  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (typeof arg !== 'string') throw new TypeError('unsupported native context grammar');
    if (arg === 'install') { if (++installs !== 1) throw new TypeError('duplicate native command'); continue; }
    const key = arg.split('=', 1)[0];
    if (seen.has(key)) throw new TypeError('duplicate native option'); seen.add(key);
    if (arg === '--dir') { result.dir = args[++i]; if (typeof result.dir !== 'string' || !isAbsolute(result.dir)) throw new TypeError('unsupported staging selector'); continue; }
    if (flags.has(arg)) continue;
    const path = /^(--store-dir|--config\.cache-dir)=(.+)$/u.exec(arg);
    if (path && isAbsolute(path[2])) continue;
    if (/^--package-import-method=(?:hardlink|copy|clone|auto)$/u.test(arg)) continue;
    const numeric = /^(--network-concurrency|--child-concurrency|--fetch-timeout|--fetch-retries|--config\.minimumReleaseAge)=(0|[1-9][0-9]*)$/u.exec(arg);
    // These remain original native arguments, not a second value coercer.
    if (numeric && Number.isSafeInteger(Number(numeric[2]))
      && (numeric[1] === '--fetch-retries' || numeric[1] === '--config.minimumReleaseAge' || Number(numeric[2]) > 0)) continue;
    throw new TypeError('unsupported native context grammar');
  }
  if (installs !== 1 || result.dir === undefined) throw new TypeError('native install and staging required');
  return result;
}
async function optional(path) {
  try { const bytes = await regular(path, 1048576); return { path, exists: true, sha256: hash(bytes), bytes: bytes.length, text: bytes.toString('utf8') }; }
  catch (error) { if (error.code === 'ENOENT') return { path, exists: false }; throw error; }
}
export async function receiveHookFreeProfile(cwd, args) {
  if (process.platform !== 'linux' || !isAbsolute(cwd) || await realpath(cwd) !== cwd) throw new TypeError('qualified real Linux staging required');
  const chosen = selectors(args);
  if (chosen.dir !== cwd) throw new TypeError('native staging selector differs');
  const environment = {};
  for (const name of Object.keys(process.env).sort()) {
    if (blocked.has(environmentSetting(name)) || environmentSetting(name) === 'noignorepnpmfile') throw new TypeError('ambient native context or hooks are outside the profile');
    if (['XDG_CONFIG_HOME', 'HOME'].includes(name)) environment[name] = hash(process.env[name]);
  }
  const xdg = process.env.XDG_CONFIG_HOME;
  if (xdg && !isAbsolute(xdg)) throw new TypeError('relative native configuration home is unsupported');
  const configDir = xdg ? join(xdg, 'pnpm') : join(homedir(), '.config', 'pnpm');
  const workspace = await optional(join(cwd, 'pnpm-workspace.yaml'));
  if (!workspace.exists) throw new TypeError('native ancestor workspace discovery is outside the profile');
  const global = await optional(join(configDir, 'config.yaml'));
  for (const entry of [workspace, global]) if (entry.exists) inspectHookFreeYaml(entry.text);
  const absent = [];
  for (const name of ['.pnpmfile.mjs', '.pnpmfile.cjs']) {
    const path = join(cwd, name);
    try { await lstat(path); throw new TypeError('default native pnpmfile is already present'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    absent.push(path);
  }
  return { kind: 'pnpm.closed-hook-free-profile.v1', cwd: resolve(cwd), environment,
    files: [workspace, global].map(({text, ...identity}) => identity), absent, ignoreWorkspace: false };
}

// Outdated uses an exact owner-generated query, not the install option grammar.
// This deliberately narrower config profile admits no user/global config files.
export async function receiveMetadataConfigurationProfile(query, environment) {
  const cwd = query.directory;
  if (process.platform !== 'linux' || !isAbsolute(cwd) || await realpath(cwd) !== cwd)
    throw new TypeError('real Linux metadata directory required');
  for (const [name, text] of Object.entries(query.files)) {
    if ((await regular(join(cwd, name), 1048576)).toString('utf8') !== text) throw new TypeError('metadata projection changed');
  }
  const home = environment.HOME, xdg = environment.XDG_CONFIG_HOME;
  if (!isAbsolute(home ?? '') || (xdg !== undefined && !isAbsolute(xdg))) throw new TypeError('explicit configuration home required');
  const configDir = join(xdg ?? join(home, '.config'), 'pnpm');
  const paths = [join(home, '.npmrc'), ...['config.yaml', 'auth.ini', 'rc'].map(name => join(configDir, name)),
    '/etc/npmrc', resolve(process.execPath, '../../etc/npmrc'), ...['.pnpmfile.mjs', '.pnpmfile.cjs'].map(name => join(cwd, name))];
  for (const path of paths) {
    try { await lstat(path); throw new TypeError('metadata configuration source outside closed profile'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return { kind: 'pnpm.closed-metadata-profile.v1', cwd, absent: paths,
    files: Object.entries(query.files).map(([name, text]) => ({ path: join(cwd, name), sha256: hash(text) })) };
}

// A separate owned-hook profile for strict cached assembly. Existing hook-free
// profiles and their Node24.19.0 provider remain unchanged.
export async function receiveOwnedHookProfile(cwd) {
 if(process.platform!=='linux'||!isAbsolute(cwd)||resolve(cwd)!==cwd||await realpath(cwd)!==cwd)throw new TypeError('real Linux assembly staging required');
 const environment={};
 for(const name of Object.keys(process.env).sort()){
  const key=environmentSetting(name);
  if(key||name==='NODE_OPTIONS'||name==='PNPM_NATIVE_OBSERVATION_CONFIG')throw new TypeError('ambient native configuration is outside the assembly profile');
  if(['HOME','XDG_CONFIG_HOME'].includes(name))environment[name]=hash(process.env[name]);
 }
 const xdg=process.env.XDG_CONFIG_HOME;
 if(xdg&&!isAbsolute(xdg))throw new TypeError('relative native configuration home is unsupported');
 const configDir=xdg?join(xdg,'pnpm'):join(homedir(),'.config','pnpm');
 const files=[];
 for(const path of[join(cwd,'pnpm-workspace.yaml'),join(configDir,'config.yaml')]){
  const entry=await optional(path);if(path===join(cwd,'pnpm-workspace.yaml')&&!entry.exists)throw new TypeError('owned native workspace policy required');
  if(entry.exists)inspectHookFreeYaml(entry.text);
  const {text,...identity}=entry;files.push(identity);
 }
 // Native registry routing is retained and bound; a second config parser or
 // unqualified settings override is outside this deliberately closed profile.
 for(const path of[join(cwd,'.npmrc'),join(homedir(),'.npmrc'),join(configDir,'rc'),'/etc/npmrc',resolve(process.execPath,'../../etc/npmrc')]){
  const entry=await optional(path);
  if(entry.exists)for(const line of entry.text.split(/\r?\n/u)){
   if(!line.trim()||/^\s*[#;]/u.test(line))continue;
   if(!/^(?:@[a-z0-9._-]+:)?registry=https:\/\/[^ \t\r\n]+\/\s*$/u.test(line)&&!/^\/\/[^ \t\r\n:]+\/(?:[A-Za-z0-9._~-]+\/)*:(?:username|_password|_authToken|_auth)=[^\r\n]+$/u.test(line))throw new TypeError('unqualified native rc setting outside registry-routing and credential profile');
  }
  const {text,...identity}=entry;files.push(identity);
 }
 const local=await optional(join(cwd,'.pnpmfile.cjs'));
 const redirected=await optional(join(cwd,'.pnpmfile.mjs'));
 if(redirected.exists)throw new TypeError('assembly profile admits only the owned canonical CJS hook');
 const {text,...hook}=local;files.push(hook,redirected);
 return{kind:'pnpm.closed-owned-hook-profile.v1',cwd,environment,files};
}
