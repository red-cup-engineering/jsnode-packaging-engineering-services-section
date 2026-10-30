import assert from "node:assert/strict";
import { access, lstat, lutimes, mkdir, mkdtemp, readdir, rm, symlink, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { classifyInstallTree, findTopLevelNodeModulesTrees, hasLockfile, nestedWorkspaceOwner } from "../src/stale-install-trees.mjs";

const old = new Date("2020-01-01T00:00:00Z");
async function age(path) {
  const info = await lstat(path);
  if (info.isSymbolicLink()) { await lutimes(path, old, old); return; }
  if (info.isDirectory()) for (const name of await readdir(path)) await age(join(path, name));
  await utimes(path, old, old);
}

async function fixture(t, name = "standalone") {
  const root = await mkdtemp(join(tmpdir(), "install-lifecycle-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const packageDir = join(root, name), nodeModulesDir = join(packageDir, "node_modules");
  await mkdir(join(nodeModulesDir, "dependency"), { recursive: true });
  await writeFile(join(nodeModulesDir, "dependency", "index.mjs"), "export const value = true;\n");
  await writeFile(join(packageDir, "package.json"), JSON.stringify({ name: "@fixture/standalone", version: "1.0.0" }));
  await writeFile(join(packageDir, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\nimporters:\n  .: {}\n");
  await age(packageDir);
  return { root, packageDir, nodeModulesDir, days: 30, unitsDir: join(root, "units"), mcpConfigPath: join(root, "absent-mcp.json") };
}

test("old standalone PNPM source lock is supported maintenance evidence", async t => {
  const input = await fixture(t);
  assert.equal(await hasLockfile(input.packageDir), true);
  const result = await classifyInstallTree(input);
  assert.equal(result.decision, "prune");
  assert.match(result.reason, /caller must receive maintenance custody/);
  await access(input.nodeModulesDir);
});

for (const kind of ["directory", "symlink"]) test(`${kind} named as a source lock cannot admit maintenance`, async t => {
  const input = await fixture(t), lock = join(input.packageDir, "pnpm-lock.yaml");
  await rm(lock);
  if (kind === "directory") await mkdir(lock);
  else {
    const foreign = join(input.root, "foreign-lock.yaml");
    await writeFile(foreign, "lockfileVersion: '9.0'\n");
    await symlink(foreign, lock);
  }
  await age(input.packageDir);
  assert.equal(await hasLockfile(input.packageDir), false);
  const result = await classifyInstallTree(input);
  assert.equal(result.decision, "keep");
  assert.match(result.reason, /regular package-owned lock/);
});

test("nearest ancestor PNPM policy keeps a member even with its own lock", async t => {
  const input = await fixture(t);
  await writeFile(join(input.root, "pnpm-workspace.yaml"), "packages:\n  - '*'\n");
  assert.deepEqual(await nestedWorkspaceOwner(input.packageDir, input.root), { ancestor: input.root });
  const result = await classifyInstallTree(input);
  assert.equal(result.decision, "keep");
  assert.match(result.reason, /nested workspace member/);
});

test("package-local PNPM policy does not turn a standalone package into a nested member", async t => {
  const input = await fixture(t);
  await writeFile(join(input.packageDir, "pnpm-workspace.yaml"), "minimumReleaseAge: 1440\n");
  await age(input.packageDir);
  assert.equal(await nestedWorkspaceOwner(input.packageDir, input.root), null);
  assert.equal((await classifyInstallTree(input)).decision, "prune");
});

test("own scan root ends ancestor lookup before a parent workspace", async t => {
  const input = await fixture(t);
  await writeFile(join(input.root, "package.json"), JSON.stringify({ workspaces: ["*"] }));
  await writeFile(join(input.root, "pnpm-workspace.yaml"), "packages:\n  - '*'\n");
  assert.equal(await nestedWorkspaceOwner(input.packageDir, input.packageDir), null);
  await assert.rejects(nestedWorkspaceOwner(input.root, input.packageDir), /inside the scan root/);
});

test("a fresh filesystem install is kept even without Git history", async t => {
  const input = await fixture(t);
  await utimes(input.nodeModulesDir, new Date(), new Date());
  const result = await classifyInstallTree(input);
  assert.equal(result.decision, "keep");
  assert.match(result.reason, /filesystem modification/);
});

test("a newly modified nested installed file keeps an otherwise old tree", async t => {
  const input = await fixture(t);
  await writeFile(join(input.nodeModulesDir, "dependency", "index.mjs"), "export const value = false;\n");
  assert.equal((await lstat(input.nodeModulesDir)).mtime.getTime(), old.getTime());
  const result = await classifyInstallTree(input);
  assert.equal(result.decision, "keep");
  assert.match(result.reason, /filesystem modification/);
});

test("editing existing nested source keeps an old non-Git snapshot", async t => {
  const input = await fixture(t), source = join(input.packageDir, "src", "nested", "module.mjs");
  await mkdir(join(input.packageDir, "src", "nested"), { recursive: true });
  await writeFile(source, "export const version = 1;\n");
  await age(input.packageDir);
  await writeFile(source, "export const version = 2;\n");
  assert.equal((await lstat(input.packageDir)).mtime.getTime(), old.getTime());
  const result = await classifyInstallTree(input);
  assert.equal(result.decision, "keep");
  assert.match(result.reason, /filesystem modification/);
});

test("an invalid ancestor manifest keeps unknown workspace ownership", async t => {
  const input = await fixture(t);
  for (const text of ["invalid json\n", "null", "[]", "false", "42", '"not a manifest"']) {
    await writeFile(join(input.root, "package.json"), text);
    assert.deepEqual(await nestedWorkspaceOwner(input.packageDir, input.root), { ancestor: input.root }, text);
    assert.equal((await classifyInstallTree(input)).decision, "keep", text);
  }
});

test("activity observation does not follow an old dependency link to foreign recent data", async t => {
  const input = await fixture(t), foreign = join(input.root, "foreign.mjs");
  await writeFile(foreign, "recent foreign input\n");
  await symlink(foreign, join(input.nodeModulesDir, "foreign.mjs"));
  await age(input.packageDir);
  assert.equal((await classifyInstallTree(input)).decision, "prune");
  assert.ok((await lstat(foreign)).mtime.getTime() > old.getTime());
});

for (const family of [".registry-install-retained", ".source-bindings-retained"]) test(`${family} remains with its execution owner despite old timestamps and a lock`, async t => {
  const input = await fixture(t, join(family, "package"));
  const result = await classifyInstallTree(input);
  assert.equal(result.decision, "keep");
  assert.match(result.reason, /retained execution custody/);
});

test("unknown or redirected installation custody is kept", async t => {
  const input = await fixture(t);
  await rm(input.nodeModulesDir, { recursive: true });
  assert.equal((await classifyInstallTree(input)).decision, "keep");
  const foreign = join(input.root, "foreign-modules");
  await mkdir(foreign); await symlink(foreign, input.nodeModulesDir);
  assert.equal((await classifyInstallTree(input)).decision, "keep");
});

test("scanning rejects redirected roots and roots within an installed tree", async t => {
  const input = await fixture(t);
  const redirected = join(input.root, "redirected");
  await symlink(input.packageDir, redirected);
  await assert.rejects(findTopLevelNodeModulesTrees(redirected), /unredirected directory/);
  await assert.rejects(findTopLevelNodeModulesTrees(input.nodeModulesDir), /within an installation tree/);
  const found = await findTopLevelNodeModulesTrees(input.packageDir);
  assert.deepEqual(found, [{ nodeModulesDir: input.nodeModulesDir, packageDir: input.packageDir }]);
});

test("direct classifier keeps dependency trees belonging to an installed package", async t => {
  const input = await fixture(t, join("node_modules", "installed-package"));
  const result = await classifyInstallTree(input);
  assert.equal(result.decision, "keep");
  assert.match(result.reason, /nested installed package/);
});
