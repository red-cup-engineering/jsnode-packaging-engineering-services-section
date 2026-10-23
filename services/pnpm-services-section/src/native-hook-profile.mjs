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
