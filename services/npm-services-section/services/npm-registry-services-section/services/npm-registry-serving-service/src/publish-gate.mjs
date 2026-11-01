import { posix } from "node:path";
import { lineColumnOf, parseJavaScript, walkJavaScript } from "@red-cup-engineering/javascript-parser-service";
import semver from "semver";
import { binTargets, exportTargets, resolveExport } from "./package-exports.mjs";
import { readTarball, TarballError } from "./tarball-reader.mjs";

/**
 * The publish gate: what a registry can say about a package version from its bytes and its own shelf, without
 * running any of it. A version is refused when what it ships does not hold together:
 *
 *   - `export-target`   an `exports` target (any condition Node resolves) that is not in the tarball, or a pattern
 *                       target no file of the tarball matches
 *   - `bin-target`      a `bin` target that is not in the tarball
 *   - `undeclared-import`  a JS module imports a house-scoped package that is neither this package nor declared in
 *                       dependencies, peerDependencies or optionalDependencies
 *   - `self-import`     a JS module imports this package by name through an `exports` entry that does not exist
 *   - `dependency`      a declared house dependency whose version or range no published version satisfies
 *   - `dependency-subpath`  an import of `<house package>/<subpath>` that the highest published version satisfying
 *                       the declared range does not export (exports patterns and "./package.json" included)
 *   - `source`          a house-scoped module that the house parser cannot read
 *   - `tarball`         the tarball or its package.json cannot be read, or names another package or version
 *
 * Imports of other packages, of node: builtins and of relative paths are not this gate's business.
 */

export const DEFAULT_HOUSE_SCOPES = Object.freeze(["@red-cup-engineering", "@lenticule-science", "@561-group", "@coesite-operations", "@causeway-services", "@emsenn"]);

const record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const SCRIPT_EXTENSIONS = /\.(?:mjs|cjs|js)$/u;
const escapesAt = /\\(?:u0040|u\{0*40\}|x40)/iu;

/** A specifier as { name, subpath } when it names a package of a house scope, else null. */
export function houseSpecifier(specifier, houseScopes) {
  const match = /^(@[^/]+)\/([^/]+)(\/.*)?$/u.exec(specifier);
  if (!match || !houseScopes.includes(match[1])) return null;
  return { name: `${match[1]}/${match[2]}`, subpath: match[3] === undefined ? "." : `.${match[3]}` };
}

/** Where a module names a dependency: every static import/export-from and every dynamic import of a string literal. */
function moduleSpecifiers(source, { module }) {
  const program = parseJavaScript(source, { sourceType: module ? "module" : "script" });
  const found = [];
  walkJavaScript(program, (node) => {
    let specifier = node.source;
    if (node.type !== "ImportDeclaration" && node.type !== "ExportAllDeclaration" && node.type !== "ExportNamedDeclaration" && node.type !== "ImportExpression") return;
    if (specifier?.type === "TemplateLiteral" && node.type === "ImportExpression" && specifier.expressions.length === 0) specifier = { type: "Literal", value: specifier.quasis[0].value.cooked };
    if (specifier?.type === "Literal" && typeof specifier.value === "string") found.push({ specifier: specifier.value, at: lineColumnOf(source, node.start).line });
  });
  return found;
}

function parseModule(path, source, packageIsModule) {
  const extension = path.slice(path.lastIndexOf("."));
  if (extension === ".mjs") return moduleSpecifiers(source, { module: true });
  if (extension === ".cjs") return moduleSpecifiers(source, { module: false });
  if (packageIsModule) return moduleSpecifiers(source, { module: true });
  // Node reads a .js file of an untyped package as CommonJS, and as an ES module when it cannot be CommonJS.
  try { return moduleSpecifiers(source, { module: false }); }
  catch (scriptError) {
    try { return moduleSpecifiers(source, { module: true }); }
    catch { throw scriptError; }
  }
}

const packageRelative = (target) => {
  if (typeof target !== "string") return null;
  const normal = posix.normalize(target);
  return normal === "." || normal.startsWith("../") || normal.startsWith("/") ? null : normal;
};
const patternOf = (target) => new RegExp(`^${target.split("*").map((part) => part.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")).join(".+")}$`, "u");

/** The manifest of the highest published version of `entry.packument` satisfying `range`, or a reason there is none. */
function resolveVersion(packument, range) {
  const versions = Object.keys(packument.versions ?? {});
  let version;
  if (semver.validRange(range) !== null) version = semver.maxSatisfying(versions, range);
  else if (Object.hasOwn(packument["dist-tags"] ?? {}, range)) version = packument["dist-tags"][range];
  else return { reason: `${JSON.stringify(range)} is neither a semver range nor a dist-tag it publishes` };
  if (version === null || version === undefined || !Object.hasOwn(packument.versions ?? {}, version)) {
    const newest = versions.filter((v) => semver.valid(v)).sort(semver.rcompare).slice(0, 5);
    return { reason: `no published version satisfies ${JSON.stringify(range)} (newest published: ${newest.join(", ") || "none"})` };
  }
  return { version, manifest: packument.versions[version] };
}

const exportedKeys = (exports) => {
  if (!record(exports)) return exports === undefined ? [] : ["."];
  const keys = Object.keys(exports).filter((key) => key.startsWith("."));
  return keys.length > 0 ? keys : ["."];
};

/**
 * Check one version's tarball. `publishedPackument(name)` answers a package's full packument as this registry
 * would serve it (or null if it has none). Returns the violations: [{ kind, message }], empty when the version holds together.
 */
export async function checkPublication({ name, version, bytes, houseScopes = DEFAULT_HOUSE_SCOPES, publishedPackument }) {
  const violations = [];
  const refuse = (kind, message) => violations.push({ kind, message });
  let files;
  try { files = readTarball(bytes); }
  catch (error) { if (error instanceof TarballError) return [{ kind: "tarball", message: error.message }]; throw error; }
  let manifest;
  try { manifest = JSON.parse(files.get("package.json")?.toString("utf8")); }
  catch { return [{ kind: "tarball", message: "the tarball has no readable package.json" }]; }
  if (!record(manifest)) return [{ kind: "tarball", message: "the tarball's package.json is not an object" }];
  if (manifest.name !== name || manifest.version !== version) {
    return [{ kind: "tarball", message: `the tarball's package.json is ${manifest.name}@${manifest.version}, not the ${name}@${version} being published` }];
  }

  // exports and bin targets
  const present = (target) => {
    const path = packageRelative(target);
    if (path === null) return false;
    return target.includes("*") ? [...files.keys()].some((file) => patternOf(path).test(file)) : files.has(path);
  };
  const unshipped = new Set();
  const shippedTarget = ({ where, target }, dotRequired) => {
    if (typeof target !== "string" || (dotRequired && !target.startsWith("./"))) refuse(dotRequired ? "export-target" : "bin-target", `${where} -> ${JSON.stringify(target)} is not a path inside the package${dotRequired ? ' (it must start with "./")' : ""}`);
    else if (!present(target)) { unshipped.add(target); refuse(dotRequired ? "export-target" : "bin-target", `${where} -> ${target} ${target.includes("*") ? "matches no file" : "is not"} in the tarball`); }
  };
  for (const entry of exportTargets(manifest.exports)) {
    if (entry.alternatives) {
      if (!entry.alternatives.some(present)) refuse("export-target", `${entry.where} -> none of ${entry.alternatives.join(", ")} is in the tarball`);
    } else shippedTarget(entry, true);
  }
  for (const entry of binTargets(manifest)) shippedTarget(entry, false);

  // declared house dependencies, keyed by the name a module imports them by
  const declared = new Map();
  for (const field of ["dependencies", "peerDependencies", "optionalDependencies"]) {
    if (!record(manifest[field])) continue;
    for (const [key, spec] of Object.entries(manifest[field])) {
      if (typeof spec !== "string" || declared.has(key)) continue;
      const alias = /^npm:((?:@[^/]+\/)?[^@]+)(?:@(.*))?$/u.exec(spec);
      declared.set(key, alias ? { name: alias[1], range: alias[2] || "*", field, spec } : { name: key, range: spec, field, spec });
    }
  }
  const packuments = new Map();
  const packumentOf = async (dependency) => {
    if (!packuments.has(dependency)) packuments.set(dependency, Promise.resolve(publishedPackument(dependency)));
    return packuments.get(dependency);
  };
  const resolved = new Map(); // declared key -> { version, manifest } | { reason } | null (not house)
  const resolveDeclared = async (key) => {
    if (resolved.has(key)) return resolved.get(key);
    const entry = declared.get(key);
    let outcome = null;
    if (entry && houseSpecifier(`${entry.name}/x`, houseScopes)) {
      const packument = await packumentOf(entry.name);
      if (!packument) outcome = { reason: `${entry.name} is not published in this registry` };
      else outcome = { ...resolveVersion(packument, entry.range), packument };
      if (outcome.reason) refuse("dependency", `${entry.field}["${key}"]: ${JSON.stringify(entry.spec)}: ${outcome.reason}`);
    }
    resolved.set(key, outcome);
    return outcome;
  };
  for (const key of declared.keys()) await resolveDeclared(key);

  // imports of house-scoped packages from the tarball's JS modules
  const prefixes = houseScopes.map((scope) => `${scope}/`);
  const reported = new Set();
  for (const [path, content] of files) {
    if (!SCRIPT_EXTENSIONS.test(path) || path.startsWith("node_modules/") || path.includes("/node_modules/")) continue;
    const source = content.toString("utf8");
    if (!prefixes.some((prefix) => source.includes(prefix)) && !escapesAt.test(source)) continue;
    // Parsing is synchronous and a package can be large; let other requests through between modules.
    await new Promise((resolve) => setImmediate(resolve));
    let imports;
    try { imports = parseModule(path, source, manifest.type === "module"); }
    catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
      refuse("source", `${path} names a house package but cannot be read as JavaScript: ${error.message}`);
      continue;
    }
    for (const { specifier, at } of imports) {
      const target = houseSpecifier(specifier, houseScopes);
      if (!target) continue;
      const here = `${path}:${at} imports ${JSON.stringify(specifier)}`;
      const dedupe = `${path}\0${specifier}`;
      if (reported.has(dedupe)) continue;
      reported.add(dedupe);
      if (target.name === name) {
        const exported = resolveExport(manifest.exports, target.subpath);
        if (exported.legacy) refuse("self-import", `${here}, but ${name} declares no "exports", so it cannot be imported by its own name`);
        else if (exported.target === null) refuse("self-import", `${here}, but ${name} does not export ${JSON.stringify(target.subpath)} (its exports: ${exportedKeys(manifest.exports).join(", ")})`);
        else if (!files.has(packageRelative(exported.target) ?? "") && !unshipped.has(exported.target)) refuse("self-import", `${here}, which ${name} exports as ${exported.target}, but that file is not in the tarball`);
        continue;
      }
      if (!declared.has(target.name)) {
        refuse("undeclared-import", `${here}, but ${target.name} is not in dependencies, peerDependencies or optionalDependencies`);
        continue;
      }
      const dependency = await resolveDeclared(target.name);
      if (!dependency?.manifest) continue; // already refused as unresolvable
      const exported = resolveExport(dependency.manifest.exports, target.subpath);
      if (exported.legacy || exported.target !== null) continue;
      const entry = declared.get(target.name);
      const others = Object.entries(dependency.packument.versions ?? {})
        .filter(([, other]) => resolveExport(other.exports, target.subpath).target)
        .map(([other]) => other).filter((other) => semver.valid(other)).sort(semver.rcompare).slice(0, 3);
      refuse("dependency-subpath", `${here}, but ${entry.name}@${dependency.version} (the highest published version satisfying ${JSON.stringify(entry.range)}) does not export ${JSON.stringify(target.subpath)}; it exports ${exportedKeys(dependency.manifest.exports).slice(0, 12).join(", ") || "nothing"}${exportedKeys(dependency.manifest.exports).length > 12 ? ", ..." : ""}${others.length > 0 ? `. Published versions that do export it: ${others.join(", ")}` : ""}`);
    }
  }
  return violations;
}
