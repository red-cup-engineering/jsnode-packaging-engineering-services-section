import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import { createRequire } from "node:module";
import { isAbsolute, join, relative, sep } from "node:path";

export const BROWSER_ASSET_BUILD_COMMAND = "node scripts/build-browser-assets.mjs";
const provider = "@red-cup-engineering/project-browser-asset-tree-service";
const entrypoint = "scripts/build-browser-assets.mjs";
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const pathLiteral = value => typeof value === "string" && /^[A-Za-z0-9_-][A-Za-z0-9_./-]*$/u.test(value)
  && value.split("/").every(part => part && part !== "." && part !== "..")
  && !["dist", "node_modules"].includes(value.split("/")[0]);

// This is the existing producer's literal adapter, not a JavaScript evaluator.
// Only its JSON array of extra, authored regular assets is variable.
const prefix = `import { fileURLToPath } from "node:url";
import { buildCloudflareStaticAssetTree } from "@red-cup-engineering/project-browser-asset-tree-service";
const ROOT = fileURLToPath(new URL("../", import.meta.url));
export async function buildAssets() {
  return buildCloudflareStaticAssetTree({ rootDirectory: ROOT, assets: `;
const suffix = ` });
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await buildAssets();
`;

/** Admit the native registry-only resolution spelling, without interpreting a graph.
 * PNPM still parses the entire lock and proves it matches the manifest at install.
 * Other native lock forms require their own supported source recipe.
 */
function browserRegistryLockRouting(text) {
  const lines = text.split(/\r?\n/u);
  const roots = lines.filter(line => /^\S/u.test(line));
  if (roots.length !== 5 || !/^lockfileVersion: ['"]?9\.0['"]?$/u.test(roots[0])
    || roots.slice(1).join("\n") !== "settings:\nimporters:\npackages:\nsnapshots:")
    throw new TypeError("browser asset lock must retain the native single-project registry resolution form");
  const metadata = new Set(["resolution", "engines", "cpu", "os", "libc", "hasBin", "peerDependencies", "peerDependenciesMeta", "deprecated"]);
  let section;
  for (const line of lines) {
    if (!line) continue;
    // PNPM's admitted serializer uses these plain/single-quoted scalar keys.
    // Tagged, complex, escaped and flow-entry keys are not another way into
    // this recipe. This validates spelling, not a reconstructed dependency graph.
    const mapping = /^( *)(?:'([A-Za-z0-9@/_.+()-]+)'|([A-Za-z0-9@/_.+()-]+)):(?: (.*))?$/u.exec(line);
    if (!mapping) {
      if (section === "snapshots" && /^ {6}- (?:'[A-Za-z0-9@/_.+-]+'|[A-Za-z0-9@/_.+-]+)$/u.test(line)) continue;
      throw new TypeError("browser asset lock requires native scalar key spellings");
    }
    const indentation = mapping[1].length, key = mapping[2] ?? mapping[3], value = mapping[4];
    if (indentation % 2 || indentation > 12) throw new TypeError("browser asset lock requires native mapping indentation");
    if (!indentation) section = key;
    if ((section === "packages" && indentation === 2 && value !== undefined)
      || (section === "packages" && indentation === 4 && !metadata.has(key))
      || (section === "importers" && indentation === 2 && (key !== "." || value !== undefined))
      || (section === "snapshots" && indentation === 2 && value !== undefined && value !== "{}"))
      throw new TypeError("browser asset lock requires native registry entry and metadata forms");
  }
  // Deprecation prose is not a locator. Do not mistake its documentation URL
  // for a tarball URL; every actual resolution below must be an integrity only.
  const routing = lines.filter(line => !/^    deprecated: /u.test(line)).join("\n");
  if (/(?:workspace:|\blink:|\bfile:|\bhttps?:|\bgit(?:\+[^:\s]+)?:|\bssh:|\\)/iu.test(routing)
    || /^\s*<<\s*:/mu.test(routing) || /:\s*[&*][A-Za-z0-9_-]/u.test(routing))
    throw new TypeError("browser asset lock must not carry local, URL, aliased or alternate registry bindings");
  const resolutions = lines.filter(line => /^\s*['"]?resolution['"]?\s*:/u.test(line));
  if (!resolutions.length || resolutions.length > 100_000
    || resolutions.some(line => !/^    resolution: \{integrity: sha512-[A-Za-z0-9+/]{86}==\}$/u.test(line)))
    throw new TypeError("browser asset lock resolutions must be native inline SHA-512 registry integrities");
  return { kind: "pnpm.native-integrity-resolution-form", integrityResolutions: resolutions.length };
}

export function browserAssetTreeBuildRecipe(manifest) {
  if (manifest.scripts?.build !== BROWSER_ASSET_BUILD_COMMAND) return null;
  if (manifest.dependencies?.[provider] !== "0.4.2")
    throw new TypeError("browser asset build requires the exact declared asset-tree provider 0.4.2");
  if (manifest.packageManager !== undefined && !/^pnpm@\d+\.\d+\.\d+$/u.test(manifest.packageManager))
    throw new TypeError("browser asset build requires the owner's native PNPM lock");
  if (manifest.scripts.prepack !== undefined && manifest.scripts.prepack !== "npm run build")
    throw new TypeError("browser asset prepack must select the same admitted build");
  if (!manifest.scripts.test?.startsWith("node --test "))
    throw new TypeError("browser asset build requires direct native Node tests");
  if (["workspaces", "overrides", "resolutions", "pnpm"].some(key => manifest[key] !== undefined))
    throw new TypeError("browser asset build does not admit alternate dependency composition");
  if (!Array.isArray(manifest.files) || !manifest.files.includes("dist"))
    throw new TypeError("browser asset build requires dist in the publication surface");
  return { kind: "npm.browser-asset-tree-build", entrypoint, provider, providerVersion: "0.4.2", output: "dist" };
}

/** Receive the narrow adapter and frozen inputs before either native installation or build.
 * PNPM remains the lock parser and frozen dependency resolver; no lock refresh is admitted.
 */
export async function receiveBrowserAssetTreeBuildInputs({ directory, manifest, registry, authored }) {
  const recipe = browserAssetTreeBuildRecipe(manifest);
  if (!recipe) throw new TypeError("supported browser asset recipe required");
  const read = async (path, optional = false) => {
    let stat;
    try { stat = await lstat(join(directory, path)); }
    catch (error) { if (optional && error.code === "ENOENT") return null; throw error; }
    if (!stat.isFile() || stat.size > 16 * 1024 * 1024 || await realpath(join(directory, path)) !== join(directory, path)
      || (authored && !authored.has(path)))
      throw new TypeError("browser asset input must be a committed regular file: " + path);
    return readFile(join(directory, path));
  };
  for (const path of ["package-lock.json", "npm-shrinkwrap.json", "yarn.lock", ".pnpmfile.cjs", ".pnpmfile.mjs", ".yarnrc", ".yarnrc.yml"]) {
    if (await read(path, true) !== null) throw new TypeError("unsupported browser asset configuration: " + path);
  }
  const npmrc = await read(".npmrc", true);
  if (npmrc !== null && !["registry=" + registry.replace(/\/$/u, ""), "registry=" + registry.replace(/\/$/u, "") + "/"].includes(npmrc.toString("utf8").trim()))
    throw new TypeError("browser asset project configuration must retain the canonical registry only");
  const lock = await read("pnpm-lock.yaml");
  const lockRouting = browserRegistryLockRouting(lock.toString("utf8"));
  const policy = await read("pnpm-workspace.yaml", true);
  if (policy !== null) {
    const lines = policy.toString("utf8").split(/\r?\n/u).filter(line => line.trim() && !line.trimStart().startsWith("#"));
    if (lines[0] !== "minimumReleaseAgeExclude:" || lines.length < 2 || lines.length > 65
      || !lines.slice(1).every(line => /^  - '[A-Za-z0-9@/_.-]+@\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?'$/u.test(line)))
      throw new TypeError("browser asset workspace policy admits only authored exact release-age exceptions");
  }
  const script = await read(entrypoint), text = script.toString("utf8");
  if (script.length > 16 * 1024 || !text.startsWith(prefix) || !text.endsWith(suffix))
    throw new TypeError("browser asset build adapter differs from the supported literal recipe");
  let assets;
  try { assets = JSON.parse(text.slice(prefix.length, -suffix.length)); }
  catch { throw new TypeError("browser asset recipe requires a literal JSON asset array"); }
  if (!Array.isArray(assets) || assets.length > 64 || new Set(assets).size !== assets.length || !assets.every(pathLiteral))
    throw new TypeError("browser asset recipe requires bounded unique confined asset paths");
  await read("web/index.html");
  for (const path of assets) await read(path);
  let output;
  try { output = await lstat(join(directory, recipe.output)); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  if (output !== undefined) throw new TypeError("browser asset build cannot replace existing output");
  return { ...recipe, assets, adapterSHA256: sha256(script), lockSHA256: sha256(lock), lockRouting,
    workspacePolicySHA256: policy === null ? null : sha256(policy) };
}

/** Receive the importer's actual installed supplier, after the native frozen install. */
export async function receiveInstalledBrowserAssetTreeProvider(directory) {
  const root = await realpath(join(directory, "node_modules", provider));
  const manifestBytes = await readFile(join(root, "package.json")), manifest = JSON.parse(manifestBytes);
  const entry = await realpath(createRequire(join(directory, "package.json")).resolve(provider));
  const path = relative(root, entry);
  if (manifest.name !== provider || manifest.version !== "0.4.2" || manifest.exports?.["."] !== "./src/project-browser-asset-tree.mjs"
    || !path || isAbsolute(path)
    || path === ".." || path.startsWith(".." + sep) || !(await lstat(entry)).isFile())
    throw new TypeError("native browser asset supplier differs from the admitted provider");
  return { name: provider, version: manifest.version, manifestSHA256: sha256(manifestBytes), entrypointSHA256: sha256(await readFile(entry)) };
}

/** Receive the provider's declared web projection and each unchanged extra asset. */
export async function receiveBrowserAssetTreeProducts({ directory, authored, recipe, receivedFiles }) {
  const files = new Set(receivedFiles);
  const web = [...authored.keys()].filter(path => path.startsWith("web/")
    && !path.split("/").some(part => ["test", "tests", "node_modules"].includes(part) || part.includes(".test.")));
  for (const path of web.filter(path => !/\.(?:m?js|[mc]?ts)$/u.test(path))) {
    const output = "dist/" + path;
    if (!files.has(output) || (await lstat(join(directory, output))).size === 0)
      throw new TypeError("browser asset build omitted a declared web product: " + output);
    if (path.endsWith(".html")) {
      const html = await readFile(join(directory, output), "utf8");
      for (const match of html.matchAll(/<script type="module" src="(\/[^"<>]+)"><\/script>/gu))
        if (!files.has("dist" + match[1])) throw new TypeError("browser asset HTML references a missing product: " + match[1]);
    }
  }
  for (const path of recipe.assets) {
    if (!files.has("dist/" + path) || sha256(await readFile(join(directory, "dist", path))) !== sha256(authored.get(path).bytes))
      throw new TypeError("browser asset build omitted or changed a declared extra asset: " + path);
  }
}
