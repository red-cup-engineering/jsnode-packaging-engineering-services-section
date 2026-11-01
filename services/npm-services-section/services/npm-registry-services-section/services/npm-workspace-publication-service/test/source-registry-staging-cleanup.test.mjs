import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { packSourceRegistryClosure } from "../src/source-registry-closure.mjs";

const run = promisify(execFile);

async function fixture(t, files) {
  const root = await mkdtemp(join(tmpdir(), "source-carrier-cleanup-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = join(root, "source"), destination = join(root, "artifacts");
  await mkdir(source); await mkdir(destination);
  await mkdir(join(destination, "caller-owned"));
  await writeFile(join(destination, "caller-owned", "keep"), "retain caller evidence\n");
  const manifest = { name: "@fixture/staging-cleanup", version: "1.0.0", type: "module", files, exports: "./index.mjs" };
  const path = join(source, "package.json");
  const manifestBytes = JSON.stringify(manifest) + "\n";
  await writeFile(path, manifestBytes);
  await writeFile(join(source, "index.mjs"), "export const received = true;\n");
  const plan = { complete: true, registry: "https://example.invalid/", packages: [{ name: manifest.name, manifest, path, publish: true, missingTargets: [] }] };
  return { root, source, destination, manifestBytes, plan };
}

test("pre-pack copy refusal retires only its owned carrier staging", { skip: process.platform === "win32" }, async t => {
  const { source, destination, manifestBytes, plan } = await fixture(t, ["index.mjs", "pipe"]);
  await run("mkfifo", [join(source, "pipe")]);
  let progressCalls = 0;
  await assert.rejects(packSourceRegistryClosure(plan, { destination, onProgress: () => { progressCalls++; } }), { code: "ERR_FS_CP_FIFO_PIPE" });
  assert.equal(progressCalls, 0, "an incomplete carrier must not be received as packed");
  assert.deepEqual(await readdir(destination), ["caller-owned"]);
  assert.equal(await readFile(join(destination, "caller-owned", "keep"), "utf8"), "retain caller evidence\n");
  assert.equal(await readFile(join(source, "package.json"), "utf8"), manifestBytes);
  await access(join(source, "pipe"));
});

test("successful closure keeps its immutable artifact and retires staging before progress receiving", async t => {
  const { source, destination, manifestBytes, plan } = await fixture(t, ["index.mjs"]);
  let received = 0;
  const result = await packSourceRegistryClosure(plan, { destination, onProgress: async receipt => {
    received++;
    assert.equal(receipt.packages.length, 1);
    await access(receipt.packages[0].artifact);
    assert.deepEqual((await readdir(destination)).sort(), ["caller-owned", "sha512"]);
  } });
  assert.equal(received, 1);
  assert.equal(result.refusals.length, 0);
  assert.equal(result.packages.length, 1);
  await access(result.packages[0].artifact);
  assert.equal(await readFile(join(source, "package.json"), "utf8"), manifestBytes);
  assert.equal(await readFile(join(destination, "caller-owned", "keep"), "utf8"), "retain caller evidence\n");
});
