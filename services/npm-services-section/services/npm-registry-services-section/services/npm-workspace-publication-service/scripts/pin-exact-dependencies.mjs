#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";
import { pinExactDependencies } from "../src/pin-exact-dependencies.mjs";
import { scanRepositoryManifests } from "../src/read-workspace-manifests.mjs";

const args = process.argv.slice(2);
const opt = (name) => {
  const at = args.indexOf(name);
  return at >= 0 && args[at + 1] !== undefined ? args[at + 1] : undefined;
};
const optAll = (name) => args.flatMap((value, index) => (value === name && args[index + 1] !== undefined ? [args[index + 1]] : []));

const packageDirs = optAll("--package");
const rootArg = opt("--root");
const apply = args.includes("--apply");
const migrateWorkspace = args.includes("--migrate-workspace");
const selectionPath = opt("--selection");
const artifactDirectory = opt("--artifact-directory") === undefined ? undefined : resolve(opt("--artifact-directory"));

if (packageDirs.length === 0 && rootArg === undefined) {
  process.stderr.write("usage: pin-exact-dependencies (--package <dir>)... | --root <repoRoot> [--plan|--apply] [--migrate-workspace] [--selection reviewed.json] [--artifact-directory received-artifacts/]\n");
  process.exit(2);
}

if (artifactDirectory !== undefined && selectionPath === undefined)
  throw new TypeError("--artifact-directory requires a reviewed --selection");
if (selectionPath !== undefined && (packageDirs.length !== 1 || rootArg !== undefined)) {
  throw new TypeError("--selection requires exactly one --package consumer; no --root scan");
}
const selection = selectionPath === undefined ? undefined :
  JSON.parse(await readFile(resolve(selectionPath), "utf8"));
const sites = [];
for (const dir of packageDirs) {
  const absoluteDir = resolve(dir);
  const path = join(absoluteDir, "package.json");
  sites.push({ path, dir: absoluteDir, manifest: JSON.parse(await readFile(path, "utf8")) });
}
if (rootArg !== undefined) {
  const root = resolve(rootArg);
  for (const site of await scanRepositoryManifests(root)) {
    if (site.manifest !== null) sites.push(site);
  }
}

// Let npm itself resolve the site's effective .npmrc, including inherited
// native user/CI settings. Keep only non-secret registry URI fields: the
// source migration cannot invent house scopes or repeat credentials.
const nativeConfigurations = new Map();
for (const site of sites) {
  if (nativeConfigurations.has(site.dir)) continue;
  const output = execFileSync("npm", ["config", "list", "--json"], {
    cwd: site.dir, encoding: "utf8", timeout: 20_000, maxBuffer: 2 * 1024 * 1024,
    env: process.env,
  });
  const config = JSON.parse(output);
  const registryConfig = Object.fromEntries(Object.entries(config).filter(([key]) =>
    key === "registry" || /^@[a-z0-9._-]+:registry$/u.test(key)));
  nativeConfigurations.set(site.dir, registryConfig);
}
const report = await pinExactDependencies({
  sites, apply, migrateWorkspace, selection, artifactDirectory,
  registryForSite: site => nativeConfigurations.get(site.dir),
});
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
process.exitCode = report.ok ? 0 : 1;
