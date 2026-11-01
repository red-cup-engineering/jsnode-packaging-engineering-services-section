#!/usr/bin/env node
import { access, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { tmpdir } from "node:os";

import {
  CANONICAL_NPM_REGISTRY,
  canonicalRegistry,
  NpmPublicationError,
  formPublicationPlan,
  lifecycleScripts,
  measureArtifact,
  packageIdentity,
} from "../src/publication.mjs";
import {
  readRegistryVersion,
  runCommand,
  withExactWorktree,
} from "../src/runner.mjs";

import { packedFiles, SECRET_PATH, secretBearingContentPaths } from "../src/tarball-guard.mjs";
import { carrierSurfaceViolations } from "../src/carrier-surface.mjs";
import { readExactManifest, preparePublishedManifest, readDependencyArtifacts, installationManifest } from "../src/workspace-publication.mjs";
import { validateSourceMemberMode } from "../src/source-member-binding.mjs";

function argumentsOf(values) {
  const out = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith("--")) throw new Error(`unexpected argument ${value}`);
    const name = value.slice(2);
    const next = values[index + 1];
    if (next === undefined || next.startsWith("--")) throw new Error(`--${name} requires a value`);
    out[name] = next;
    index += 1;
  }
  return out;
}

function required(args, name) {
  const value = args[name];
  if (typeof value !== "string" || value.trim() === "") throw new Error(`--${name} is required`);
  return value.trim();
}

function within(root, path) {
  const rel = relative(root, path);
  return rel === "" || (rel !== ".." && !rel.startsWith("../") && !rel.startsWith("..\\") && !isAbsolute(rel));
}

async function exists(path) {
  try { await access(path, constants.F_OK); return true; } catch { return false; }
}

async function main() {
  const args = argumentsOf(process.argv.slice(2));
  const repository = resolve(required(args, "repository"));
  const commit = required(args, "commit");
  const packagePath = args["package-path"] ?? ".";
  const expectedName = required(args, "name");
  const expectedVersion = required(args, "version");
  const sourceMemberMode = args["source-member-mode"] ?? "same-checkout";
  validateSourceMemberMode(sourceMemberMode);
  const immutableGit = sourceMemberMode === "pinned-gitlinks";
  // Validate before any dependency, lifecycle, or registry action.
  const registry = canonicalRegistry(args.registry ?? CANONICAL_NPM_REGISTRY);
  const dependencyInputs = args["dependency-artifacts"] === undefined ? undefined : resolve(args["dependency-artifacts"]);
  const planOut = resolve(required(args, "plan-out"));
  const artifactOut = resolve(required(args, "artifact-out"));

  if (await exists(planOut)) throw new Error(`refusing to overwrite existing plan: ${planOut}`);
  if (await exists(artifactOut)) throw new Error(`refusing to overwrite existing artifact: ${artifactOut}`);
  await mkdir(dirname(planOut), { recursive: true });
  await mkdir(dirname(artifactOut), { recursive: true });

  // Keep dependency tarballs outside the source package so npm pack cannot include them.
  const dependencyRoot = dependencyInputs === undefined ? undefined : await mkdtemp(join(tmpdir(), "npm-publication-dependencies-"));
  try {
  const plan = await withExactWorktree({
    repository,
    commit,
    immutableGit,
    work: async ({ root, commit: resolvedCommit }) => {
      const packageDirectory = resolve(root, packagePath);
      if (!within(root, packageDirectory)) throw new Error("package path escapes exact source worktree");
      const manifestReading = await readExactManifest({ root, sourceCommit: resolvedCommit,
        path: resolve(packageDirectory, "package.json"), immutableGit });
      const published = await preparePublishedManifest({ root, packageDirectory, sourceCommit: resolvedCommit,
        source: manifestReading, sourceMemberMode });
      const identity = packageIdentity(published.manifest, { expectedName, expectedVersion });
      const dependencyArtifacts = await readDependencyArtifacts(dependencyInputs, dependencyRoot);
      const manifestPath = resolve(packageDirectory, "package.json");
      await writeFile(manifestPath, `${JSON.stringify(installationManifest(published.manifest, dependencyArtifacts), null, 2)}\n`);

      const lock = resolve(packageDirectory, "package-lock.json");
      if (dependencyArtifacts.length === 0 && await exists(lock)) {
        await runCommand("npm", [
          "ci", "--ignore-scripts", "--no-audit", "--no-fund", "--registry", registry,
        ], { cwd: packageDirectory });
      } else {
        await runCommand("npm", [
          "install", "--ignore-scripts", "--no-audit", "--no-fund", "--package-lock=false",
          "--registry", registry,
        ], { cwd: packageDirectory });
      }

      // Local artifact URLs are installation-only. Assay and pack the exact
      // projected publication bytes, never the temporary resolver manifest.
      await writeFile(manifestPath, published.bytes);
      const lifecycle = [];
      for (const script of lifecycleScripts(published.manifest)) {
        await runCommand("npm", ["run", script.name], { cwd: packageDirectory });
        lifecycle.push(Object.freeze({ name: script.name, outcome: "passed" }));
      }

      if (!(await readFile(manifestPath)).equals(published.bytes)) throw new NpmPublicationError("publication-manifest-drift", "lifecycle changed the projected publication manifest");
      const packedPaths = await packedFiles(packageDirectory);
      const unsafePaths = packedPaths.filter(path => SECRET_PATH.test(path));
      if (unsafePaths.length) throw new NpmPublicationError("secret-bearing-carrier-path", "final package contains forbidden paths", unsafePaths);
      const unsafeContent = await secretBearingContentPaths(packageDirectory, packedPaths);
      if (unsafeContent.length) throw new NpmPublicationError("secret-bearing-carrier-content", "final package contains forbidden content", unsafeContent);
      const surface = carrierSurfaceViolations(published.manifest, packedPaths, { pathFormat: "package-relative" });
      if (surface.length) throw new NpmPublicationError("carrier-surface-refused", "final package does not carry its declared export surface", surface);
      const packingDirectory = resolve(root, ".publication-artifacts");
      await mkdir(packingDirectory, { recursive: true });
      const packed = await runCommand("npm", [
        "pack", "--json", "--ignore-scripts", "--pack-destination", packingDirectory,
      ], { cwd: packageDirectory });
      const report = JSON.parse(packed.stdout);
      if (!Array.isArray(report) || report.length !== 1 || typeof report[0]?.filename !== "string") {
        throw new Error("npm pack did not return exactly one artifact");
      }
      const generated = resolve(packingDirectory, report[0].filename);
      await copyFile(generated, artifactOut, constants.COPYFILE_EXCL);
      const artifact = await measureArtifact(artifactOut);
      if (typeof report[0].integrity === "string" && report[0].integrity !== artifact.integrity) {
        throw new NpmPublicationError("pack-integrity-mismatch", "npm pack integrity disagrees with measured artifact");
      }
      if (typeof report[0].shasum === "string" && report[0].shasum !== artifact.shasum) {
        throw new NpmPublicationError("pack-shasum-mismatch", "npm pack shasum disagrees with measured artifact");
      }

      const registryObservation = await readRegistryVersion({
        name: identity.name,
        version: identity.version,
        registry,
      });

      return formPublicationPlan({
        sourceCommit: resolvedCommit,
        packagePath,
        manifest: published.manifest,
        manifestBytes: manifestReading.bytes,
        publishedManifestBytes: published.bytes,
        workspaceDependencies: published.sources,
        dependencyArtifacts: dependencyArtifacts.map(({ path: _path, ...identity }) => identity),
        artifact,
        registry,
        registryObservation,
        assurance: {
          dependencyInstall: "passed",
          lifecycle: Object.freeze(lifecycle),
          pack: "passed",
          secretPaths: "passed",
          secretContent: "passed",
          exportSurface: "passed",
          moduleGraph: { outcome: "unverified", reason: "the original assay requires javascript-node-services-section/syntax, absent from its published 0.3.0 export map" },
        },
        expectedName,
        expectedVersion,
      });
    },
  });

  await writeFile(planOut, `${JSON.stringify(plan, null, 2)}\n`, { flag: "wx" });
  process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
  } finally {
    if (dependencyRoot !== undefined) await rm(dependencyRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  process.stderr.write(`${error.code ?? error.name ?? "ERROR"}: ${error.message}\n`);
  process.exitCode = 1;
});
