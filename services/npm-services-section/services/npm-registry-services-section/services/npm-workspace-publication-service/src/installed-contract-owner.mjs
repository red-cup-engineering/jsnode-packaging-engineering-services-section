import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { findPackageJSON } from "node:module";
import { dirname, isAbsolute, join, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";

const inside = (root, file) => { const p = relative(root, file); return !isAbsolute(p) && p !== ".." && !p.startsWith(`..${sep}`); };
const packageName = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/u;
const record = value => value !== null && typeof value === "object" && !Array.isArray(value);

// Private exact-contract reader. Native package selection, distribution custody
// and Node format scopes are different facts; no nearest-named-manifest search.
export function createInstalledContractReader({ root, installation, providerRoots = [] }) {
  const manifests = new Map(), manifestKeys = new Map(), declarations = new Map();
  function refuse(message, cause) {
    const error = new Error(message, cause ? { cause } : undefined);
    error.code = "ERR_INSTALLED_DECLARATION_OWNER_UNRECEIVED";
    throw error;
  }
  function admitted(file) { return inside(root, file) || (installation !== undefined && inside(installation, file)) || providerRoots.some(p => inside(p, file)); }
  function manifest(directory) {
    if (manifests.has(directory)) return manifests.get(directory);
    try {
      const path = join(directory, "package.json"), actual = realpathSync(path);
      if (!admitted(actual) || !inside(directory, actual)) refuse("package manifest leaves its received root");
      const info = statSync(actual);
      if (!info.isFile() || info.size > 64 * 1024) refuse("package declaration manifest must be a bounded regular file");
      const value = JSON.parse(readFileSync(actual, "utf8"));
      if (!record(value)) refuse("package declaration manifest must be an object record");
      const held = { ...value, directory };
      manifests.set(directory, held);
      manifestKeys.set(directory, Object.keys(value));
      return held;
    } catch (error) {
      if (error.code === "ERR_INSTALLED_DECLARATION_OWNER_UNRECEIVED") throw error;
      refuse("package declaration manifest is unreceived: " + directory, error);
    }
  }
  function distribution(file) {
    if (!admitted(file)) refuse("module leaves its received carrier and installation");
    let domain = installation !== undefined && inside(installation, file) ? installation : root;
    if (!inside(root,file) && !(installation !== undefined && inside(installation,file))) {
      domain=providerRoots.filter(p=>inside(p,file)).sort((a,b)=>b.length-a.length)[0];
      if(domain===undefined)refuse('module has no received native domain');
    }
    const parts = relative(domain, file).split(sep);
    let start = domain === installation ? 0 : -1;
    for (let index = 0; index < parts.length; index++) if (parts[index] === "node_modules") start = index + 1;
    if (start === -1) return domain;
    const count = parts[start]?.startsWith("@") ? 2 : 1;
    const name = parts.slice(start, start + count).join("/");
    if (!packageName.test(name) || start + count >= parts.length) refuse("module has no admitted installed package slot");
    return join(domain, ...parts.slice(0, start + count));
  }
  function owner(file) {
    file = realpathSync(file);
    if (declarations.has(file)) return declarations.get(file);
    const boundary = distribution(file);
    let held = manifest(boundary), directory = boundary;
    const parts = relative(boundary, dirname(file)).split(sep).filter(Boolean);
    for (const part of parts) {
      directory = join(directory, part);
      if (!existsSync(join(directory, "package.json"))) continue;
      const scope = manifest(directory), keys = manifestKeys.get(directory);
      if (keys.length === 1 && keys[0] === "type" && ["module", "commonjs"].includes(scope.type)) continue;
      let native;
      if (typeof scope.name === "string" && packageName.test(scope.name)) {
        try { native = findPackageJSON(scope.name, pathToFileURL(join(directory, "declaration-owner-probe.mjs"))); }
        catch { /* A name alone cannot establish package ownership. */ }
      }
      if (native === undefined || realpathSync(native) !== realpathSync(join(directory, "package.json")))
        refuse("nested package declaration ownership is unreceived: " + directory);
      held = scope;
    }
    declarations.set(file, held);
    return held;
  }
  function provider(specifier, importer, resolved) {
    try {
      const selected = findPackageJSON(specifier, pathToFileURL(importer));
      if (selected === undefined) refuse("native provider package manifest is unreceived");
      const path = realpathSync(selected), directory = dirname(path), file = realpathSync(resolved);
      if (!admitted(path) || !admitted(file) || !inside(directory, file))
        refuse("resolved module leaves its native-selected package root");
      return manifest(directory);
    } catch (error) {
      if (error.code === "ERR_INSTALLED_DECLARATION_OWNER_UNRECEIVED") throw error;
      refuse("native provider package ownership is unreceived", error);
    }
  }
  return { owner, provider, distribution: file => manifest(distribution(realpathSync(file))) };
}
