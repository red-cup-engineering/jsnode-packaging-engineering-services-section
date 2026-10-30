import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { lstat, realpath } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

/** Carry the parent's selected immutable native module registration explicitly.
 * Raw NODE_OPTIONS, credentials, and opaque private Code capabilities do not
 * cross this boundary. The registration still receives its own source guards.
 */
export async function sourceWorkerModuleArguments({ environment = process.env, arguments: args = process.execArgv } = {}) {
  const selected = new Set();
  const options = environment.NODE_OPTIONS ?? "";
  if (typeof options !== "string" || options.length > 16384 || !Array.isArray(args))
    throw new TypeError("bounded original source worker launch arguments required");
  for (const words of [args, options.trim().split(/\s+/u)]) {
    for (let index = 0; index < words.length; index++) {
      const word = words[index];
      if (typeof word !== "string") throw new TypeError("original worker argument must be text");
      const reference = word === "--import" ? words[++index] : word.startsWith("--import=") ? word.slice(9) : undefined;
      if (typeof reference !== "string" || !reference.includes(".native-module-revision")) continue;
      const file = reference.startsWith("file:") ? fileURLToPath(reference) : reference;
      if (!/^\/gnu\/store\/[a-z0-9]{32}-[^/\s]+\/\.native-module-revision\/register\.mjs$/u.test(file)
        || resolve(file) !== file || await realpath(file) !== file)
        throw new TypeError("source worker registration must be its immutable canonical native input");
      const info = await lstat(file);
      if (!info.isFile() || (info.mode & 0o222) !== 0 || info.size < 1 || info.size > 1048576)
        throw new TypeError("source worker registration must be a bounded immutable file");
      selected.add(pathToFileURL(file).href);
    }
  }
  if (selected.size > 1) throw new TypeError("competing original source worker module contexts");
  return Object.freeze([...selected].map(value => "--import=" + value));
}

/** Keep native cache locations when isolating HOME; carry no user config. */
export function sourceWorkerCaches(environment, nativeHome, excludedRoots = []) {
  const cache = {
    XDG_DATA_HOME: environment.XDG_DATA_HOME ?? join(nativeHome, ".local", "share"),
    XDG_CACHE_HOME: environment.XDG_CACHE_HOME ?? join(nativeHome, ".cache"),
    npm_config_cache: environment.npm_config_cache ?? environment.NPM_CONFIG_CACHE ?? join(nativeHome, ".npm"),
    ...Object.fromEntries(["PNPM_HOME", "YARN_CACHE_FOLDER"].filter(key => environment[key] !== undefined).map(key => [key, environment[key]])),
  };
  for (const path of Object.values(cache)) {
    if (typeof path !== "string" || !isAbsolute(path) || resolve(path) !== path || /[\0\r\n]/u.test(path))
      throw new TypeError("native worker cache paths must be normalized absolute directories");
    for (const root of excludedRoots) {
      const child = relative(resolve(root), path);
      if (child === "" || (!isAbsolute(child) && child !== ".." && !child.startsWith(".." + sep)))
        throw new TypeError("native worker caches must not be inside disposable source or scratch");
    }
  }
  return Object.freeze(cache);
}

/** Retain one launch-local transport snapshot, without npm or service credentials.
 * Proxy endpoints and CA paths are supplied by the invoking execution provider;
 * they are neither source configuration nor a persisted release identity.
 */
export function sourceWorkerTransport(environment) {
  const transport = {};
  for (const key of ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy"]) {
    const value = environment[key];
    if (value === undefined) continue;
    if (typeof value !== "string") throw new TypeError("source worker proxy must be a credential-free HTTP endpoint");
    // Native clients use an explicit empty value to disable that proxy alias.
    if (value === "") { transport[key] = value; continue; }
    let url;
    try { url = new URL(value); } catch { throw new TypeError("source worker proxy must be a credential-free HTTP endpoint"); }
    if (!["http:", "https:"].includes(url.protocol) || !url.hostname
      || url.username || url.password || url.pathname !== "/" || url.search || url.hash || /[\0\r\n]/u.test(value))
      throw new TypeError("source worker proxy must be a credential-free HTTP endpoint");
    transport[key] = value;
  }
  for (const key of ["NO_PROXY", "no_proxy"]) {
    const value = environment[key];
    if (value === undefined) continue;
    if (typeof value !== "string" || value.length > 16 * 1024 || !/^[A-Za-z0-9*.,:_\-\[\] \t]*$/u.test(value))
      throw new TypeError("source worker proxy exclusions must be a bounded host list");
    transport[key] = value;
  }
  for (const key of ["NODE_EXTRA_CA_CERTS", "SSL_CERT_FILE", "SSL_CERT_DIR"]) {
    const value = environment[key];
    if (value === undefined) continue;
    if (typeof value !== "string" || !isAbsolute(value) || /[\0\r\n]/u.test(value))
      throw new TypeError("source worker trust-store paths must be absolute");
    transport[key] = value;
  }
  return Object.freeze(transport);
}
