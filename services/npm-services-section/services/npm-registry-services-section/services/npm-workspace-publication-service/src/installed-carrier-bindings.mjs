import { createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readJsnodeAst, readJsnodeModuleExports, readJsnodeRuntimeModuleRequests } from "@red-cup-engineering/javascript-node-services-section/syntax";
import { isExactSemver } from "./dependency-policy.mjs";
import { createInstalledContractReader } from "./installed-contract-owner.mjs";

const inside = (root, file) => { const p = relative(root, file); return !isAbsolute(p) && p !== ".." && !p.startsWith(`..${sep}`); };
const named = node => node?.name ?? node?.value;

/** Static interface conformance over an installed, explicitly selected carrier.
 * Native ESM resolution preserves each consumer's actual provider binding.
 * Parsing never evaluates a module or calls an application operation. Public
 * suppliers, CJS and computed requests remain explicit coverage boundaries. */
export function auditInstalledCarrierBindings({ root, entrypoints, scopes = ["@red-cup-engineering", "@lenticule-science"], maxModules = 2000, maxFileBytes = 2 * 1024 * 1024 } = {}) {
  if (typeof root !== "string" || !isAbsolute(root) || !Array.isArray(entrypoints) || entrypoints.length === 0
      || entrypoints.some(p => typeof p !== "string" || isAbsolute(p) || !p)
      || !Array.isArray(scopes) || scopes.some(s => typeof s !== "string" || !/^@[a-z0-9-]+$/u.test(s))
      || !Number.isSafeInteger(maxModules) || maxModules < 1 || maxModules > 5000
      || !Number.isSafeInteger(maxFileBytes) || maxFileBytes < 1 || maxFileBytes > 8 * 1024 * 1024) {
    throw new TypeError("explicit absolute root, relative entrances and bounded module/file limits required");
  }
  root = realpathSync(root);
  const probe = pathToFileURL(join(root, "resolution-probe.mjs")).href;
  if (import.meta.resolve("./resolution-target.mjs", probe) !== pathToFileURL(join(root, "resolution-target.mjs")).href) {
    throw new TypeError("native parent-bound ESM resolution requires --experimental-import-meta-resolve");
  }
  const receipt = { type: "InstalledCarrierBindingObservation", version: 1, root, entrypoints, scopes, maxModules, maxFileBytes, complete: true, modules: [], findings: [], boundaries: [] };
  const modules = new Map(), owners = new Map();
  const contracts = createInstalledContractReader({ root });
  function owner(file) {
    let directory = dirname(file);
    const traversed = [];
    while (inside(root, directory)) {
      if (owners.has(directory)) break;
      traversed.push(directory);
      const manifest = join(directory, "package.json");
      if (existsSync(manifest)) { owners.set(directory, { ...JSON.parse(readFileSync(manifest)), directory }); break; }
      if (directory === root) break;
      directory = dirname(directory);
    }
    const value = owners.get(directory) ?? { directory: root };
    for (const d of traversed) owners.set(d, value);
    return value;
  }
  function locate(specifier, importer) {
    try {
      const url = import.meta.resolve(specifier, pathToFileURL(importer).href);
      if (url.startsWith("node:")) return null;
      if (!url.startsWith("file:")) { receipt.boundaries.push({ importer: relative(root, importer), specifier, kind: "non-file-provider" }); return null; }
      const file = realpathSync(fileURLToPath(url));
      if (!inside(root, file)) throw new TypeError("provider escapes selected installed root");
      const supplier = owner(file);
      // Keep original Node scope observations separate from exact package
      // identity. A type-only exported scope must not hide an owned pin.
      const requested = /^(?:@[a-z0-9._-]+\/[a-z0-9._-]+|[a-z0-9][a-z0-9._-]*)(?:\/|$)/u.exec(specifier)?.[0].replace(/\/$/u, "");
      const scoped = name => scopes.some(scope => name?.startsWith(`${scope}/`));
      if (supplier.directory !== root && ((requested && !scoped(requested) && !scoped(supplier.name))
          || (!requested && typeof supplier.name === "string" && !scoped(supplier.name)))) {
        receipt.boundaries.push({ importer: relative(root, importer), specifier, kind: "external-supplier", supplier: supplier.name, version: supplier.version });
        return null;
      }
      const distribution = contracts.distribution(file);
      if (distribution.directory !== root && !scoped(distribution.name) && !scoped(requested)) {
        receipt.boundaries.push({ importer: relative(root, importer), specifier, kind: "external-supplier", supplier: supplier.name, version: supplier.version });
        return null;
      }
      const provider = requested ? contracts.provider(specifier, importer, file) : contracts.owner(file);
      const name = requested ?? provider.name;
      if (provider.directory === root || scopes.some(scope => name?.startsWith(`${scope}/`))) {
        const consuming = contracts.owner(importer);
        if (consuming.directory !== provider.directory) {
          for (const declaration of ["dependencies", "optionalDependencies", "devDependencies", "peerDependencies"]) {
            const expected = consuming[declaration]?.[name];
            if (!isExactSemver(expected) || (expected === provider.version && (!requested || provider.name === requested))) continue;
            receipt.findings.push({
              kind: declaration === "peerDependencies"
                ? "installed-exact-peer-version-mismatch"
                : "installed-exact-dependency-version-mismatch",
              declaration,
              importer: relative(root, importer), consumer: consuming.name,
              provider: name, expected, installed: provider.version ?? null,
              ...(requested && provider.name !== requested ? { actualProvider: provider.name ?? null } : {}),
            });
          }
        }
      }
      const declared = contracts.owner(file);
      if (declared.directory !== root && !scoped(declared.name)) {
        receipt.boundaries.push({ importer: relative(root, importer), specifier, kind: "external-supplier", supplier: supplier.name, version: supplier.version });
        return null;
      }
      return file;
    } catch (error) {
      if (error.code === "ERR_INSTALLED_DECLARATION_OWNER_UNRECEIVED") receipt.complete = false;
      receipt.findings.push({ importer: relative(root, importer), specifier, kind: "unresolved-module", message: error.message }); return null; }
  }
  function load(file) {
    if (modules.has(file)) return modules.get(file);
    if (modules.size >= maxModules) { receipt.complete = false; throw new RangeError("selected module bound reached"); }
    const record = { file, names: new Set(), stars: [], requests: [], bindings: [] };
    modules.set(file, record);
    const supplier = owner(file);
    contracts.owner(file);
    if (extname(file) === ".json") { record.names.add("default"); return record; }
    if (extname(file) !== ".mjs" && !(extname(file) === ".js" && supplier.type === "module")) {
      record.unknown = true; receipt.boundaries.push({ file: relative(root, file), kind: "non-esm-provider" }); return record;
    }
    if (statSync(file).size > maxFileBytes) { receipt.complete = false; throw new RangeError("selected module byte bound reached: " + relative(root, file)); }
    const bytes = readFileSync(file), text = bytes.toString("utf8");
    const program = readJsnodeAst(text, file), surface = readJsnodeModuleExports(text, file);
    record.names = new Set(surface.names);
    for (const statement of program.body) {
      if (!statement.source) continue;
      const specifier = statement.source.value;
      if (statement.type === "ImportDeclaration") for (const binding of statement.specifiers) {
        if (binding.type !== "ImportNamespaceSpecifier") record.bindings.push({ specifier, name: binding.type === "ImportDefaultSpecifier" ? "default" : named(binding.imported) });
      }
      if (statement.type === "ExportNamedDeclaration") for (const binding of statement.specifiers) {
        if (binding.type === "ExportSpecifier") record.bindings.push({ specifier, name: named(binding.local) });
      }
      if (statement.type === "ExportAllDeclaration" && !statement.exported) record.stars.push(specifier);
    }
    record.requests = readJsnodeRuntimeModuleRequests(text, file);
    receipt.modules.push({ file: relative(root, file), name: supplier.name, version: supplier.version, sha256: createHash("sha256").update(bytes).digest("hex") });
    return record;
  }
  function exported(file, name, seen = new Set()) {
    if (seen.has(file)) return false;
    seen.add(file);
    const record = load(file);
    if (record.unknown) return null;
    if (record.names.has(name)) return true;
    let unknown = false;
    if (name !== "default") for (const specifier of record.stars) {
      const target = locate(specifier, file);
      if (target === null) { unknown = true; continue; }
      const found = exported(target, name, new Set(seen));
      if (found === true) return true;
      if (found === null) unknown = true;
    }
    return unknown ? null : false;
  }
  try {
    const pending = entrypoints.map(p => { const f = realpathSync(resolve(root, p)); if (!inside(root, f)) throw new TypeError("entrance escapes selected root"); return f; });
    const visited = new Set();
    while (pending.length) {
      const file = pending.pop();
      if (visited.has(file)) continue;
      visited.add(file);
      const record = load(file);
      for (const request of record.requests) {
        if (request.specifier === null) { receipt.boundaries.push({ file: relative(root, file), kind: "computed-module-request" }); continue; }
        const target = locate(request.specifier, file);
        if (target !== null) pending.push(target);
      }
    }
    for (const [file, record] of modules) for (const binding of record.bindings) {
      const target = locate(binding.specifier, file);
      if (target !== null && exported(target, binding.name) === false) receipt.findings.push({ importer: relative(root, file), specifier: binding.specifier, name: binding.name, provider: relative(root, target), kind: "missing-export-binding" });
    }
  } catch (error) { receipt.complete = false; receipt.findings.push({ kind: "incomplete-observation", message: error.message }); }
  receipt.findings = [...new Map(receipt.findings.map(f => [JSON.stringify(f), f])).values()];
  receipt.boundaries = [...new Map(receipt.boundaries.map(f => [JSON.stringify(f), f])).values()];
  receipt.ready = receipt.complete && receipt.findings.length === 0;
  return receipt;
}
