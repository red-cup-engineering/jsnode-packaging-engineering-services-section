// Private original-provider qualification shared by PNPM-owned capabilities.
import { lstat, readFile, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify, isDeepStrictEqual } from 'node:util';
import { dirname, isAbsolute, join } from 'node:path';
export const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const run = promisify(execFile);
const distributionSHA256 = 'e3738fda08262f74611d7a1ffc11b3e87fa52b466c07eb73211d179ebcb98810';
const variable = 'PNPM_NATIVE_OBSERVATION_CONFIG';
export async function regular(path, limit) {
  const stat = await lstat(path);
  if (!stat.isFile() || stat.size > limit || await realpath(path) !== path) throw new TypeError('observation supplier must be a bounded unredirected file');
  return readFile(path);
}
async function qualifiedProvider(program, args, cwd, expected, probeVersion, nodeVersion) {
  if (!(Array.isArray(nodeVersion) ? nodeVersion.includes(process.version) : process.version === nodeVersion) || program !== process.execPath || !isAbsolute(args[0] ?? '')) throw new TypeError('capability requires its qualified Node version and explicit original PNPM entry');
  if (process.env.NODE_OPTIONS !== undefined || process.env[variable] !== undefined) throw new TypeError('observation refuses conflicting ambient preload configuration');
  const entry = await realpath(args[0]), bytes = await regular(entry, 1048576);
  const root = dirname(dirname(entry)), manifestPath = join(root, 'package.json');
  const manifestBytes = await regular(manifestPath, 1048576), manifest = JSON.parse(manifestBytes);
  if (manifest.name !== 'pnpm' || manifest.version !== '11.28.5' || typeof manifest.bin?.pnpm !== 'string'
    || await realpath(join(root, manifest.bin.pnpm)) !== entry) throw new TypeError('observation requires original PNPM11.28.5');
  const distPath = join(root, 'dist', 'pnpm.mjs'), dist = await regular(distPath, 67108864);
  if (hash(dist) !== distributionSHA256) throw new TypeError('unqualified PNPM observation distribution');
  const selected = { manager: { name: 'pnpm', version: manifest.version, entrySHA256: hash(bytes) }, provider: {
    entry, entrySHA256: hash(bytes), manifestPath, manifestSHA256: hash(manifestBytes), distPath,
    distSHA256: hash(dist), shimTargetFormat: 'pnpm11-cmd-shim-target' } };
  if (expected && !isDeepStrictEqual(selected, expected)) throw new TypeError('native provider custody changed');
  if (probeVersion) {
    const version = (await run(program, [...args, '--version'], { cwd, timeout: 10000, maxBuffer: 65536 })).stdout.trim();
    if (version !== manifest.version) throw new TypeError('native provider version changed');
  }
  return selected;
}

export const provider = (program, args, cwd, expected, probeVersion = true) => qualifiedProvider(program,args,cwd,expected,probeVersion,'v24.19.0');
export const storeAssemblyProvider = (program,args,cwd,expected,probeVersion = true) => qualifiedProvider(program,args,cwd,expected,probeVersion,'v24.18.0');

// Metadata has a separate native qualification from installation/observation.
export const metadataProvider = (program,args,cwd,expected,probeVersion = false) => qualifiedProvider(program,args,cwd,expected,probeVersion,['v24.18.0','v24.19.0']);

