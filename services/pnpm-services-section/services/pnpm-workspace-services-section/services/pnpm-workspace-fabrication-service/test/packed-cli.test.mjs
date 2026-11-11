import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ownerRoot = fileURLToPath(new URL("..", import.meta.url));
function execute(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", timeout: 30_000 });
  if (result.error) throw result.error;
  return result;
}

// CF-PNPM-006: independently consume the packed (not checkout) CLI and inspect
// the actual filesystem artifact, not the in-memory projection or receipt alone.
test("packed CLI fabricates a policy-valid customer workspace and refuses unsupported versions", async () => {
  const root = await mkdtemp(join(tmpdir(), "pnpm-packed-consumer-"));
  try {
    const packed = execute(process.platform === "win32" ? "npm.cmd" : "npm", ["pack", "--ignore-scripts", "--pack-destination", root], ownerRoot);
    assert.equal(packed.status, 0, packed.stderr);
    const archives = (await readdir(root)).filter(name => name.endsWith(".tgz"));
    assert.equal(archives.length, 1);
    const installRoot = join(root, "unpacked");
    await mkdir(installRoot);
    const extracted = execute("tar", ["-xzf", join(root, archives[0]), "-C", installRoot], root);
    assert.equal(extracted.status, 0, extracted.stderr);
    const packedEntry = join(installRoot, "package", "scripts", "fabricate-pnpm-workspace.mjs");
    const specPath = join(root, "specification.json");
    const productionSpec = {
      root: { name: "customer-computation", version: "1.0.0" },
      pnpmVersion: "12.9.1",
      buildPolicy: { "esbuild@0.28.1": false, "@contentauth/c2pa-node@0.6.3": false },
      packages: [
        { path: "packages/core", manifest: { name: "@customer/core", version: "1.2.3" } },
        { path: "packages/app", manifest: { name: "@customer/app", version: "2.0.0", dependencies: { "@customer/core": "1.2.3" } } },
      ],
    };
    await writeFile(specPath, JSON.stringify(productionSpec));
    const output = join(root, "product");
    const accepted = execute(process.execPath, [packedEntry, "--specification", specPath, "--output", output], root);
    assert.equal(accepted.status, 0, accepted.stderr);
    const receipt = JSON.parse(accepted.stdout);
    assert.equal(receipt.type, "PnpmWorkspaceFabricationReceipt");
    assert.match(receipt.digest, /^[a-f0-9]{64}$/u);
    const rootManifest = JSON.parse(await readFile(join(output, "package.json"), "utf8"));
    assert.equal(rootManifest.packageManager, "pnpm@12.9.1");
    assert.equal(rootManifest.private, true);
    const workspace = await readFile(join(output, "pnpm-workspace.yaml"), "utf8");
    assert.match(workspace, /strictDepBuilds: true/u);
    assert.match(workspace, /"@contentauth\/c2pa-node@0\.6\.3": false/u);
    assert.match(workspace, /"esbuild@0\.28\.1": false/u);
    assert.doesNotMatch(workspace, /allowBuilds:[\s\S]*?: true/u);
    const app = JSON.parse(await readFile(join(output, "packages", "app", "package.json"), "utf8"));
    assert.equal(app.dependencies["@customer/core"], "workspace:1.2.3");

    await writeFile(specPath, JSON.stringify({ ...productionSpec, pnpmVersion: "10.15.0" }));
    const unsupportedOutput = join(root, "unsupported");
    const rejected = execute(process.execPath, [packedEntry, "--specification", specPath, "--output", unsupportedOutput], root);
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stderr, /pnpm 10\.26\.0/u);
    await assert.rejects(readFile(join(unsupportedOutput, "package.json")), { code: "ENOENT" });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
