import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const source = fileURLToPath(new URL("../", import.meta.url));

/** The directories of the installed dependency closure, each package found the way Node finds it from its dependent. */
function installedClosure(directory, found = new Set()) {
  const manifest = JSON.parse(readFileSync(join(directory, "package.json"), "utf8"));
  for (const dependency of Object.keys(manifest.dependencies ?? {})) {
    const lookup = createRequire(join(directory, "package.json")).resolve.paths(dependency) ?? [];
    const located = lookup.map((modules) => join(modules, dependency)).find((candidate) => existsSync(join(candidate, "package.json")));
    if (located === undefined) throw new Error(`${dependency} of ${manifest.name} is not installed`);
    const real = realpathSync(located);
    if (!found.has(real)) { found.add(real); installedClosure(real, found); }
  }
  return found;
}

test("installed package retains the registry-uplink-prune job's script", { timeout: 45_000 }, async (t) => {
  const root = await mkdtemp(join(tmpdir(), "registry-packed-maintenance-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const consumer = join(root, "consumer"), artifacts = join(root, "artifacts");
  await mkdir(consumer); await mkdir(artifacts);
  const userconfig = join(root, "npmrc"), globalconfig = join(root, "global-npmrc");
  await writeFile(userconfig, ""); await writeFile(globalconfig, "");
  const env = { ...process.env, npm_config_userconfig: userconfig, npm_config_globalconfig: globalconfig, npm_config_cache: join(root, "npm-cache") };
  const pack = async (directory) => {
    const { stdout } = await run("npm", ["pack", directory, "--json", "--ignore-scripts", "--pack-destination", artifacts], { cwd: root, env });
    return join(artifacts, JSON.parse(stdout)[0].filename);
  };
  // Supply the already installed exact dependencies as tarballs so the empty
  // consumer is installed offline, with no registry or real credentials.
  const dependencies = [];
  for (const directory of installedClosure(source)) dependencies.push(await pack(directory));
  const artifact = await pack(source);
  await writeFile(join(consumer, "package.json"), JSON.stringify({ private: true }));
  await run("npm", ["install", artifact, ...dependencies, "--offline", "--ignore-scripts", "--package-lock=false", "--no-audit", "--no-fund"], { cwd: consumer, env });
  const packageDirectory = join(consumer, "node_modules", "@red-cup-engineering", "npm-registry-serving-service");
  const manifest = JSON.parse(await readFile(join(packageDirectory, "package.json"), "utf8"));
  for (const entry of manifest.receivingTests) {
    assert.deepEqual(await readFile(join(packageDirectory, entry)), await readFile(join(source, entry)), `the installed package must retain enrolled receiving test ${entry}`);
  }
  const installed = join(packageDirectory, "scripts", "prune-uplink-cache.mjs");
  assert.deepEqual(await readFile(installed), await readFile(join(source, "scripts", "prune-uplink-cache.mjs")), "the installed job entry must retain the authored script bytes");
  // Parse only. Never import or execute pruning, even against fixture storage.
  await run(process.execPath, ["--check", installed], { cwd: consumer, env });
});
