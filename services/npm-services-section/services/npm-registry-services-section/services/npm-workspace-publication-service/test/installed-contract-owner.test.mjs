import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createInstalledContractReader } from "../src/installed-contract-owner.mjs";

function write(path, value) { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, typeof value === "string" ? value : JSON.stringify(value)); }
function fixture(t, manifest = { name: "consumer", version: "1.0.0", type: "module", dependencies: { supplier: "1.0.0" } }) {
  const root = mkdtempSync(join(tmpdir(), "installed-contract-owner-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  write(join(root, "package.json"), manifest); write(join(root, "index.mjs"), "");
  return { root, reader: createInstalledContractReader({ root }) };
}
function nativeFile(specifier, importer) {
  return fileURLToPath(execFileSync(process.execPath, ["--experimental-import-meta-resolve", "--input-type=module", "-e",
    "console.log(import.meta.resolve(process.argv[1], process.argv[2]));", specifier, pathToFileURL(importer).href],
    { encoding: "utf8", timeout: 5000, maxBuffer: 1024 * 1024 }).trim());
}
const refused = { code: "ERR_INSTALLED_DECLARATION_OWNER_UNRECEIVED" };

test("type-only scopes retain independently selected root declarations, including unnamed roots", t => {
  for (const manifest of [{ name: "consumer", dependencies: { supplier: "1.0.0" } }, { dependencies: { supplier: "1.0.0" } }]) {
    const { root, reader } = fixture(t, manifest);
    write(join(root, "dist/package.json"), { type: "module" }); write(join(root, "dist/index.mjs"), "");
    const owner = reader.owner(join(root, "dist/index.mjs"));
    assert.equal(owner.directory, root); assert.deepEqual(owner.dependencies, { supplier: "1.0.0" });
    assert.equal(owner.name, manifest.name);
  }
});

test("a nested native self-reference establishes declaration scope, not an invented distribution receipt", t => {
  const { root, reader } = fixture(t), embedded = join(root, "embedded");
  write(join(embedded, "package.json"), { name: "embedded", version: "2.0.0", exports: "./dist/index.mjs", dependencies: { supplier: "2.0.0" } });
  write(join(embedded, "dist/package.json"), { type: "module" }); write(join(embedded, "dist/index.mjs"), "");
  const owner = reader.owner(join(embedded, "dist/index.mjs"));
  assert.equal(owner.directory, embedded); assert.deepEqual(owner.dependencies, { supplier: "2.0.0" });
  assert.equal(Object.hasOwn(owner, "receivedDistribution"), false);
});

test("names, versions and other nested metadata cannot substitute for ownership authority", t => {
  for (const metadata of [{ name: "embedded", version: "2.0.0" }, {}, { type: "module", private: true }, { type: "module", directory: "ignored" }]) {
    const { root, reader } = fixture(t);
    write(join(root, "nested/package.json"), metadata); write(join(root, "nested/index.mjs"), "");
    assert.throws(() => reader.owner(join(root, "nested/index.mjs")), refused);
  }
});

test("a real nested installation retains its own contract even without a name or version", t => {
  const { root, reader } = fixture(t), slot = join(root, "node_modules", "supplier");
  write(join(slot, "package.json"), { dependencies: { other: "2.0.0" } }); write(join(slot, "index.mjs"), "");
  const owner = reader.owner(join(slot, "index.mjs"));
  assert.equal(owner.directory, slot); assert.equal(owner.name, undefined); assert.equal(owner.version, undefined);
  assert.deepEqual(owner.dependencies, { other: "2.0.0" });
});

test("missing, malformed or redirected installed root manifests never inherit outer identity", t => {
  for (const metadata of [undefined, [], "{", "x".repeat(64 * 1024 + 1)]) {
    const { root, reader } = fixture(t), slot = join(root, "node_modules", "supplier");
    write(join(slot, "index.mjs"), "");
    if (metadata !== undefined) write(join(slot, "package.json"), metadata);
    write(join(slot, "dist/package.json"), { name: "consumer", version: "1.0.0", exports: "./index.mjs" });
    write(join(slot, "dist/index.mjs"), "");
    assert.throws(() => reader.owner(join(slot, "dist/index.mjs")), refused);
  }
  const { root, reader } = fixture(t), slot = join(root, "node_modules", "supplier");
  write(join(slot, "index.mjs"), ""); symlinkSync(join(root, "package.json"), join(slot, "package.json"));
  assert.throws(() => reader.owner(join(slot, "index.mjs")), refused);
});

test("native provider metadata and PNPM slots stay paired with the actual resolved module", t => {
  const { root, reader } = fixture(t), slot = join(root, "node_modules/.pnpm/supplier@1.0.0/node_modules/supplier");
  write(join(slot, "package.json"), { name: "supplier", version: "1.0.0", exports: { ".": "./dist/index.mjs", "./part": "./dist/index.mjs" } });
  write(join(slot, "dist/package.json"), { type: "module" }); write(join(slot, "dist/index.mjs"), "");
  symlinkSync(slot, join(root, "node_modules/supplier"));
  for (const specifier of ["supplier", "supplier/part"]) {
    const file = nativeFile(specifier, join(root, "index.mjs"));
    assert.equal(reader.provider(specifier, join(root, "index.mjs"), file).directory, slot);
    assert.equal(reader.owner(file).directory, slot);
  }
});

test("an exported symlink cannot lend one package version to another package's code", t => {
  const { root, reader } = fixture(t), provider = join(root, "node_modules/supplier"), other = join(root, "node_modules/other");
  write(join(provider, "package.json"), { name: "supplier", version: "1.0.0", exports: "./index.mjs" });
  write(join(other, "package.json"), { name: "other", version: "9.0.0" }); write(join(other, "index.mjs"), "");
  symlinkSync(join(other, "index.mjs"), join(provider, "index.mjs"));
  const file = nativeFile("supplier", join(root, "index.mjs"));
  assert.throws(() => reader.provider("supplier", join(root, "index.mjs"), file), refused);
});


test("ownership admission classifies missing native-selected subpath manifests", t => {
 const { root, reader } = fixture(t), file = join(root, "node_modules/supplier/index.mjs");
 write(file, "export const value = 1;");
 assert.throws(() => reader.provider("supplier/index.mjs", join(root, "index.mjs"), file), refused);
});
