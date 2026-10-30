import { posix } from "node:path";

function normalizePackedPath(value) {
  return typeof value === "string" ? value.replace(/^package\//u, "").replace(/^\.\//u, "") : null;
}

function declaredTargetPath(target, field) {
  if (typeof target !== "string" || target.length === 0) return null;
  // Manifest targets are package-relative, never archive-entry coordinates.
  const stripped = target.replace(/^\.\//u, "");
  if (field === "exports" && !target.startsWith("./")) return null;
  if (stripped === null || stripped === "" || posix.isAbsolute(stripped) || stripped.split("/").includes("..") || stripped.includes("\\")) return null;
  return stripped;
}

function exportTargets(value, field = "exports") {
  if (typeof value === "string") return [{ field, target: value }];
  if (value === null || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap((entry, index) => exportTargets(entry, `${field}[${index}]`));
  return Object.entries(value).flatMap(([key, entry]) => exportTargets(entry, `${field}.${key}`));
}

function wildcardPattern(target) {
  const pieces = target.split("*").map((piece) => piece.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"));
  if (pieces.length === 1) return null;
  let expression = `^${pieces[0]}(.+)`;
  for (let index = 1; index < pieces.length; index += 1) {
    expression += index === 1 ? pieces[index] : `\\1${pieces[index]}`;
  }
  return new RegExp(`${expression}$`, "u");
}

function surfaceDeclarations(manifest) {
  const declarations = [];
  const rootExport = typeof manifest?.exports === "string"
    || Array.isArray(manifest?.exports)
    || (manifest?.exports !== null && typeof manifest?.exports === "object"
      && (Object.hasOwn(manifest.exports, ".") || Object.keys(manifest.exports).every((key) => !key.startsWith("."))));
  if (!rootExport && manifest?.main !== undefined) declarations.push({ field: "main", target: manifest.main });
  declarations.push(...exportTargets(manifest?.exports));
  if (typeof manifest?.bin === "string") declarations.push({ field: "bin", target: manifest.bin });
  else if (manifest?.bin !== null && typeof manifest?.bin === "object" && !Array.isArray(manifest.bin)) {
    for (const [name, target] of Object.entries(manifest.bin)) declarations.push({ field: `bin.${name}`, target });
  }
  return declarations;
}

/** All source targets named by main, bin and exports, including wildcard targets. */
export function packageExportTargets(manifest) {
  return [...new Set([
    ...(typeof manifest?.main === "string" ? [manifest.main] : []),
    ...exportTargets(manifest?.bin, "bin").map(entry => entry.target),
    ...exportTargets(manifest?.exports).map(entry => entry.target),
  ])];
}

/**
 * Select source conservatively before npm computes its final packlist. A file
 * selection may be wider than npm's; a directory in another source repository
 * must be reached by explicit files, main, bin or exports declarations. This
 * permits an owned export below a pinned library without traversing every
 * repository composed by the same source. Negated patterns remain npm's work.
 */
export function carrierSourceIncludes(manifest, path, { directory = false } = {}) {
  if (typeof path !== "string" || !path || posix.isAbsolute(path) || path.includes("\\")
    || path.split("/").some(part => ["", ".", "..", ".git", "node_modules"].includes(part))) return false;
  if (!directory && !Array.isArray(manifest.files)) return true;
  if (!directory && [".npmignore", ".gitignore"].includes(posix.basename(path))) {
    const parent = posix.dirname(path);
    return parent === "." || carrierSourceIncludes(manifest, parent, { directory: true });
  }
  if (!directory && /^(?:package\.json|(?:README|LICEN[CS]E|NOTICE)(?:\.[^/]*)?)$/iu.test(path)) return true;
  const targets = directory ? packageExportTargets(manifest) : packageExportTargets({ main: manifest.main, bin: manifest.bin });
  const named = [...(manifest.files ?? []), ...targets];
  return named.some(value => {
    if (typeof value !== "string" || value.startsWith("!")) return false;
    const pattern = value.replace(/^\.\//u, "").replace(/\/+$/u, "");
    if (posix.isAbsolute(pattern) || pattern.includes("\\") || pattern.split("/").includes("..")) return false;
    const glob = pattern.search(/[*?[{]/u);
    const literal = glob < 0 ? pattern : pattern.slice(0, glob);
    const prefix = glob < 0 ? "" : literal.replace(/[^/]*$/u, "");
    if (directory) {
      if (pattern === ".") return true;
      if (prefix && path.startsWith(prefix)) return true;
      const parts = pattern.split("/");
      return posix.matchesGlob(path, pattern + "/**")
        || parts.some((_, index) => posix.matchesGlob(path, parts.slice(0, index + 1).join("/")));
    }
    if (pattern === ".") return true;
    if (glob < 0) return path === pattern || path.startsWith(pattern + "/");
    // npm's packlist includes dot names that the platform glob excludes.
    // Conservatism stays beneath an explicitly named source directory; a
    // basename glob must never widen into unrelated directory populations.
    if (prefix) return path.startsWith(prefix);
    return posix.matchesGlob(path, pattern) || posix.matchesGlob(path, pattern + "/**")
      || (!path.includes("/") && path.startsWith(".") && path.startsWith(literal));
  });
}

/**
 * List the concrete (non-wildcard) file paths a manifest's `exports` map (every
 * condition, not just the first import/node/default hit), `bin` entries, and
 * `main` fallback promise to a consumer — the package's actual export surface.
 * A file the tarball ships outside this surface (a stray build artifact, a
 * dropped internal module) is never reachable through the manifest's own
 * public contract, so its removal cannot break a consumer that only imports
 * declared subpaths.
 * @param {object} manifest A parsed package.json document.
 * @returns {readonly string[]} Normalized reachable file paths, deduplicated and sorted.
 */
export function packageExportSurfacePaths(manifest) {
  if (manifest === null || typeof manifest !== "object" || Array.isArray(manifest)) return Object.freeze([]);
  const paths = new Set();
  for (const declaration of surfaceDeclarations(manifest)) {
    const kind = declaration.field.startsWith("bin") ? "bin" : declaration.field === "main" ? "main" : "export";
    const target = declaredTargetPath(declaration.target, kind === "export" ? "exports" : kind);
    if (target === null || wildcardPattern(target) !== null) continue;
    paths.add(target);
  }
  return Object.freeze([...paths].sort());
}

/**
 * Compare an npm manifest's executable/import promises with the final files npm
 * measured for its tarball. This deliberately accepts the post-lifecycle packlist:
 * generated entrypoints are promises about the carrier, not the source checkout.
 */
export function carrierSurfaceViolations(manifest, packedPaths, { pathFormat = "legacy" } = {}) {
  if (manifest === null || typeof manifest !== "object" || Array.isArray(manifest)) throw new TypeError("manifest must be an object");
  if (!packedPaths || typeof packedPaths[Symbol.iterator] !== "function") throw new TypeError("packedPaths must be iterable");
  if (!["legacy", "package-relative"].includes(pathFormat)) throw new TypeError("unknown packed path format");
  // Preserve the old prefixed/mixed API for existing callers. Native producers
  // explicitly select literal relative paths, so a real `package/` directory
  // cannot be confused with the tar archive's one outer `package/` container.
  const carried = new Set(pathFormat === "package-relative"
    ? [...packedPaths].filter(path => typeof path === "string")
    : [...packedPaths].map(normalizePackedPath).filter(path => path !== null));
  const violations = [];
  // Receiving programs are carrier obligations, not public module exports.
  // Match the receiver's explicit-file contract; absence does not enroll a
  // package, whereas an authored but invalid declaration cannot disappear.
  if (Object.hasOwn(manifest, "receivingTests")) {
    const paths = manifest.receivingTests;
    if (!Array.isArray(paths) || !paths.length || new Set(paths).size !== paths.length
      || paths.some(path => typeof path !== "string" || !path
        || !path.split("/").every(part => /^[a-zA-Z0-9._-]+$/u.test(part) && part !== "." && part !== ".."))) {
      violations.push(Object.freeze({ kind: "invalid-receiving-tests", field: "receivingTests" }));
    } else {
      for (const target of paths) if (!carried.has(target)) {
        violations.push(Object.freeze({ kind: "missing-receiving-test", field: "receivingTests", target }));
      }
    }
  }
  for (const declaration of surfaceDeclarations(manifest)) {
    const kind = declaration.field.startsWith("bin") ? "bin" : declaration.field === "main" ? "main" : "export";
    const target = declaredTargetPath(declaration.target, kind === "export" ? "exports" : kind);
    if (target === null) {
      violations.push(Object.freeze({ kind: "invalid-carrier-target", field: declaration.field, target: declaration.target ?? null }));
      continue;
    }
    const pattern = wildcardPattern(target);
    if (pattern === null ? !carried.has(target) : ![...carried].some((path) => pattern.test(path))) {
      violations.push(Object.freeze({
        kind: pattern === null ? "missing-carrier-target" : "unmatched-carrier-pattern",
        field: declaration.field,
        target: declaration.target,
      }));
    }
  }
  return Object.freeze(violations);
}
