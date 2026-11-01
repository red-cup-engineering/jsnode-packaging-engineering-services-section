import assert from "node:assert/strict";
import test from "node:test";
import { verificationCopyFilter, verificationSourceFilter } from "../src/verification-copy.mjs";
import { cp, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

test("unrooted copy callers refuse before any traversal", () => {
  assert.throws(() => verificationCopyFilter("/source", "/destination"), /unrooted verification copying is forbidden/);
});

test("verification does not recopy previous runs, runtime data or nested installations", async t => {
  const work = await mkdtemp(join(tmpdir(), "verification-source-lifetime-"));
  t.after(() => rm(work, { recursive: true, force: true }));
  const source = join(work, "data/logs/earlier/source"), destination = join(work, "verified");
  const inputs = {
    "package.json": "{}",
    "src/index.mjs": "export const source = true;",
    "data/records/requirements-records/source.json": "{}",
    "data/logs/previous/source/src/repeated.mjs": "previous run",
    "data/state/current.json": "live state",
    "data/cache/package.bin": "cache",
    "nested/data/logs/another/source/repeated.mjs": "nested previous run",
    "nested/node_modules/provider/index.mjs": "installed dependency",
    ".codex/session.json": "agent state",
    ".cache/package.bin": "cache",
  };
  for (const [path, body] of Object.entries(inputs)) {
    await mkdir(dirname(join(source, path)), { recursive: true });
    await writeFile(join(source, path), body);
  }
  await cp(source, destination, { recursive: true, filter: verificationSourceFilter(source) });
  for (const path of ["package.json", "src/index.mjs", "data/records/requirements-records/source.json"])
    assert.equal(await readFile(join(destination, path), "utf8"), inputs[path]);
  for (const path of ["data/logs", "data/state", "data/cache", "nested/data/logs", "nested/node_modules", ".codex", ".cache"])
    await assert.rejects(stat(join(destination, path)), { code: "ENOENT" });
  assert.equal(verificationSourceFilter(source)(join(source, "..", "unrelated")), false);
});

