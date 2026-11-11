import assert from "node:assert/strict";
import { access, mkdtemp, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { fabricatePnpmWorkspace, projectPnpmWorkspace } from "../src/fabricate-pnpm-workspace.mjs";

const specification = {
  root: { name: "customer-product", version: "1.0.0" },
  pnpmVersion: "10.26.0",
  buildPolicy: { esbuild: false },
  packages: [
    { path: "packages/provider", manifest: { name: "@customer/provider", version: "2.0.0", type: "module" } },
    { path: "packages/consumer", manifest: { name: "@customer/consumer", version: "1.0.0", dependencies: { "@customer/provider": "2.0.0", external: "3.0.0" } } },
  ],
};

test("projects an explicit customer workspace without ambient discovery", () => {
  const projection = projectPnpmWorkspace(specification);
  const consumer = JSON.parse(projection.files.get("packages/consumer/package.json"));
  assert.equal(consumer.dependencies["@customer/provider"], "workspace:2.0.0");
  assert.equal(consumer.dependencies.external, "3.0.0");
  assert.match(projection.files.get("pnpm-workspace.yaml"), /allowBuilds:/u);
});

test("materializes only inside an empty customer territory", async () => {
  const root = await mkdtemp(join(tmpdir(), "pnpm-workspace-product-"));
  try {
    const receipt = await fabricatePnpmWorkspace({ specification, outputDirectory: join(root, "product") });
    assert.equal(receipt.packages.length, 2);
    assert.equal(JSON.parse(await readFile(join(root, "product", "package.json"), "utf8")).private, true);
    await assert.rejects(() => fabricatePnpmWorkspace({ specification, outputDirectory: join(root, "product") }), /must be empty/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("refuses path escape", () => {
  assert.throws(() => projectPnpmWorkspace({ ...specification, packages: [{ path: "../escape", manifest: { name: "escape", version: "1.0.0" } }] }), /escapes/u);
});

// CF-PNPM-001: pnpm introduced allowBuilds in 10.26.0, not 10.15.0.
// This is an external CLI contract, not a behavior inferred from this generator.
test("refuses build policy versions whose pnpm cannot enforce allowBuilds", () => {
  for (const pnpmVersion of ["9.15.0", "10.15.0", "10.25.9"]) {
    assert.throws(() => projectPnpmWorkspace({ ...specification, pnpmVersion }), /pnpm 10\.26\.0/u);
  }
  for (const pnpmVersion of ["10.26.0", "11.0.0", "12.9.1"]) {
    const projection = projectPnpmWorkspace({ ...specification, pnpmVersion });
    assert.match(projection.files.get("pnpm-workspace.yaml"), /allowBuilds:\n  "esbuild": false/u);
    assert.match(projection.files.get("pnpm-workspace.yaml"), /strictDepBuilds: true/u);
    assert.equal(JSON.parse(projection.files.get("package.json")).packageManager, `pnpm@${pnpmVersion}`);
  }
});

// CF-PNPM-002: a malformed decision must never be silently reinterpreted.
test("refuses malformed or implicit dependency build decisions", () => {
  for (const admitted of [null, 0, 1, "false", "true", [], {}]) {
    assert.throws(() => projectPnpmWorkspace({ ...specification, buildPolicy: { esbuild: admitted } }), /build policy/u);
  }
  for (const buildPolicy of [[], "esbuild", { " ": false }]) {
    assert.throws(() => projectPnpmWorkspace({ ...specification, buildPolicy }), /build policy/u);
  }
});

// CF-PNPM-003: package roots must be canonical and must not alias generated files.
test("refuses invalid and colliding package roots before any write", () => {
  for (const path of ["", ".", "./packages/a", "packages/a/", "packages//a", "packages/./a", "packages/../a", "C:/temp/a", "package.json", "pnpm-workspace.yaml", "packages/a/package.json/nested"]) {
    assert.throws(() => projectPnpmWorkspace({
      ...specification,
      packages: [{ path, manifest: { name: "test-package", version: "1.0.0" } }],
    }), /package path/u, `path should refuse: ${JSON.stringify(path)}`);
  }
});

// CF-PNPM-004: the specification must be admitted before taking effects.
test("invalid specification never creates the requested output directory", async () => {
  const root = await mkdtemp(join(tmpdir(), "pnpm-workspace-preflight-"));
  const outputDirectory = join(root, "should-not-exist");
  try {
    await assert.rejects(fabricatePnpmWorkspace({
      specification: { ...specification, pnpmVersion: "10.15.0" }, outputDirectory,
    }), /pnpm 10\.26\.0/u);
    await assert.rejects(access(outputDirectory), { code: "ENOENT" });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// CF-PNPM-005: even an empty pre-existing directory link is not owned territory.
test("rejects output-directory symlink rather than writing into its target", async () => {
  const root = await mkdtemp(join(tmpdir(), "pnpm-workspace-symlink-"));
  const outside = join(root, "unowned");
  const outputDirectory = join(root, "customer-symlink");
  try {
    const { mkdir, readdir } = await import("node:fs/promises");
    await mkdir(outside);
    await symlink(outside, outputDirectory, "dir");
    await assert.rejects(fabricatePnpmWorkspace({ specification, outputDirectory }), /symbolic link|symlink/u);
    assert.deepEqual(await readdir(outside), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
