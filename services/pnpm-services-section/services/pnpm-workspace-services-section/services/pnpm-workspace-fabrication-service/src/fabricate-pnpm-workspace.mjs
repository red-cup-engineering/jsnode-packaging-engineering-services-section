import { createHash } from "node:crypto";
import { lstat, mkdir, readdir, writeFile } from "node:fs/promises";
import { dirname, parse, relative, resolve, sep } from "node:path";

function text(value, name) {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${name} must be non-empty text`);
  return value.trim();
}

// A deterministic ordering independent of the machine's ICU locale.
function compare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

// The public API accepts JSON value trees. Copying them into canonical own-data
// carriers rejects getters, exotic objects and values JSON would silently erase.
function canonicalJSON(value) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) {
    return Array.from({ length: value.length }, (_, index) => {
      if (!Object.hasOwn(value, index)) throw new TypeError("workspace source may not contain sparse arrays");
      return canonicalJSON(value[index]);
    });
  }
  if (value && typeof value === "object" &&
      (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)) {
    const descriptors = Object.getOwnPropertyDescriptors(value);
    return Object.fromEntries(Object.keys(descriptors).sort(compare).map(key => {
      const entry = descriptors[key];
      if (!("value" in entry)) throw new TypeError("workspace source must contain inert JSON values");
      return [key, canonicalJSON(entry.value)];
    }));
  }
  throw new TypeError("workspace source must contain only finite JSON values");
}

function relativePath(value) {
  const path = text(value, "package path").replaceAll("\\", "/");
  // Canonical package roots cannot alias the root manifest, workspace policy,
  // another manifest file, or any file outside the output territory.
  const segments = path.split("/");
  if (path.startsWith("/") || /^[A-Za-z]:/u.test(path) || path.includes("\0") ||
      /[\x00-\x1f*?\[\]{}!()|]/u.test(path) ||
      segments.some(segment => !segment || segment === "." || segment === ".." ||
        segment === "package.json" || segment === "pnpm-workspace.yaml"))
    throw new TypeError(`package path escapes or aliases customer territory: ${value}`);
  return path;
}

function exactVersion(value, name) {
  const version = text(value, `${name} version`);
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u.test(version)) throw new TypeError(`${name} version must be exact semver`);
  return version;
}

function json(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function admitBuildPolicy(policy, pnpmVersion) {
  if (policy === null || policy === undefined) return [];
  if (!policy || typeof policy !== "object" || Array.isArray(policy) ||
      Object.getPrototypeOf(policy) !== Object.prototype)
    throw new TypeError("build policy must be an explicit matcher-to-boolean object");
  const entries = Object.entries(policy);
  for (const [matcher, allowed] of entries) {
    if (!matcher.trim() || matcher !== matcher.trim() || typeof allowed !== "boolean")
      throw new TypeError("build policy entries require non-empty exact matchers and boolean decisions");
  }
  // PNPM introduced allowBuilds in v10.26.0. Earlier versions can silently
  // ignore a policy that this fabricator would otherwise appear to attest.
  const [major, minor] = pnpmVersion.split(".").map(Number);
  if (entries.length && (major < 10 || (major === 10 && minor < 26)))
    throw new TypeError("build policy requires pnpm 10.26.0 or later");
  return entries.sort(([left], [right]) => compare(left, right))
    .map(([matcher, allowed]) => `  ${JSON.stringify(matcher)}: ${allowed}`);
}

export function projectPnpmWorkspace(specification) {
  if (!specification || typeof specification !== "object" || Array.isArray(specification)) throw new TypeError("workspace specification must be an object");
  const source = canonicalJSON(specification);
  if (!Array.isArray(source.packages ?? [])) throw new TypeError("workspace packages must be an array");
  const packages = (source.packages ?? []).map((item) => ({
    path: relativePath(item.path),
    manifest: { ...item.manifest, name: text(item.manifest?.name, "package name"), version: exactVersion(item.manifest?.version, item.manifest?.name ?? "package") },
  })).sort((left, right) => compare(left.path, right.path));
  const duplicatePaths = Object.entries(Object.groupBy(packages, ({ path }) => path)).filter(([, rows]) => rows.length > 1);
  const duplicateNames = Object.entries(Object.groupBy(packages, ({ manifest }) => manifest.name)).filter(([, rows]) => rows.length > 1);
  if (duplicatePaths.length || duplicateNames.length) throw new TypeError("workspace package paths and identities must be unique");
  const internal = new Map(packages.map(({ manifest }) => [manifest.name, manifest.version]));
  const files = new Map();
  const pnpmVersion = exactVersion(source.pnpmVersion, "pnpm");
  const policyLines = admitBuildPolicy(source.buildPolicy, pnpmVersion);
  const root = {
    name: text(source.root?.name, "root name"),
    version: exactVersion(source.root?.version, "root"),
    private: true,
    packageManager: `pnpm@${pnpmVersion}`,
  };
  files.set("package.json", json(root));
  files.set("pnpm-workspace.yaml", `packages:${packages.length ? `\n${packages.map(({ path }) => `  - ${JSON.stringify(path)}`).join("\n")}` : " []"}\n${policyLines.length ? `strictDepBuilds: true\nallowBuilds:\n${policyLines.join("\n")}\n` : ""}`);
  for (const item of packages) {
    const manifest = structuredClone(item.manifest);
    // A workspace provider's installed version is NOT authority to rewrite a
    // customer's requested range. Preserve its original constraint and let
    // pnpm's own workspace resolver independently accept/refuse compatibility.
    for (const field of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]) {
      if (!Object.hasOwn(manifest, field)) continue;
      const declared = manifest[field];
      if (!declared || typeof declared !== "object" || Array.isArray(declared))
        throw new TypeError(`${field} dependency table must be an object`);
      manifest[field] = Object.fromEntries(Object.entries(declared).map(([name, requested]) => {
        if (typeof requested !== "string" || !requested.trim() || requested.trim() !== requested)
          throw new TypeError(`${field} dependency specifier for ${name} must be nonempty text`);
        if (!internal.has(name)) return [name, requested];
        if (requested.startsWith("workspace:")) {
          if (!requested.slice("workspace:".length))
            throw new TypeError(`internal dependency ${name} requires a workspace range`);
          return [name, requested];
        }
        // npm:, file:, git+, HTTPS and other explicit sources are not a
        // range. Converting them to a local provider changes source identity.
        if (/^[A-Za-z][A-Za-z0-9+.-]*:/u.test(requested))
          throw new TypeError(`internal dependency ${name} declares a foreign source protocol`);
        return [name, `workspace:${requested}`];
      }));
    }
    files.set(`${item.path}/package.json`, json(manifest));
  }
  const digest = createHash("sha256");
  for (const [path, body] of [...files].sort(([left], [right]) => compare(left, right))) digest.update(path).update("\0").update(body).update("\0");
  return Object.freeze({
    type: "PnpmWorkspaceProjection", version: 1,
    files: readonlyFiles(files), digest: digest.digest("hex"),
    packages: Object.freeze(packages.map(({ path, manifest }) =>
      Object.freeze({ path, name: manifest.name, version: manifest.version }))),
  });
}

// Immutable ReadonlyMap surface: freezing a Map itself does NOT prevent .set().
// Never leak the private Map, including from forEach's third callback parameter.
function readonlyFiles(files) {
  const internal = new Map(files);
  const view = {
    get size() { return internal.size; },
    get(path) { return internal.get(path); },
    has(path) { return internal.has(path); },
    keys() { return internal.keys(); },
    values() { return internal.values(); },
    entries() { return internal.entries(); },
    [Symbol.iterator]() { return internal[Symbol.iterator](); },
    forEach(callback, thisArg) {
      for (const [path, value] of internal) callback.call(thisArg, value, path, view);
    },
  };
  return Object.freeze(view);
}

// Refuse existing symlinks at any ancestor before mkdir, and inspect again
// afterward. This closes a static alias, not a concurrently malicious rename
// race; an untrusted mutable host namespace still requires OS-level isolation.
async function assertUnaliasedAncestors(output) {
  const { root } = parse(output);
  let cursor = root;
  for (const part of output.slice(root.length).split(sep).filter(Boolean)) {
    cursor = resolve(cursor, part);
    let stats;
    try { stats = await lstat(cursor); }
    catch (error) {
      if (error?.code === "ENOENT") continue;
      throw error;
    }
    if (stats.isSymbolicLink())
      throw new Error(`customer workspace output territory has a symbolic link ancestor: ${cursor}`);
    if (!stats.isDirectory())
      throw new Error(`customer workspace output territory has a non-directory ancestor: ${cursor}`);
  }
}

export async function fabricatePnpmWorkspace({ specification, outputDirectory }) {
  // Complete all pure admission before creating even an empty output directory.
  const projection = projectPnpmWorkspace(specification);
  const output = resolve(outputDirectory);
  await assertUnaliasedAncestors(output);
  await mkdir(output, { recursive: true });
  await assertUnaliasedAncestors(output);
  if ((await readdir(output)).length) throw new Error("customer workspace output territory must be empty");
  for (const [path, body] of projection.files) {
    const target = resolve(output, path);
    const rel = relative(output, target);
    if (!rel || rel.startsWith(`..${sep}`) || rel === "..") throw new Error(`projected path escapes output territory: ${path}`);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, body, { flag: "wx" });
  }
  return Object.freeze({ type: "PnpmWorkspaceFabricationReceipt", version: 1, outputDirectory: output, digest: projection.digest, packages: projection.packages, files: Object.freeze([...projection.files.keys()].sort(compare)) });
}
