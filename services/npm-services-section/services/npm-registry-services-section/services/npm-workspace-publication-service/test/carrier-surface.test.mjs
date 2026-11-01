import assert from "node:assert/strict";
import { test } from "node:test";
import { carrierSourceIncludes, carrierSurfaceViolations, packageExportSurfacePaths } from "../src/carrier-surface.mjs";

test("receiving declarations require exact carried files without becoming exports", () => {
  const manifest = { exports: "./index.mjs", receivingTests: ["test/one.mjs", "test/two.mjs"] };
  assert.deepEqual(carrierSurfaceViolations(manifest, ["index.mjs", "test/one.mjs"]), [
    { kind: "missing-receiving-test", field: "receivingTests", target: "test/two.mjs" },
  ]);
  assert.deepEqual(carrierSurfaceViolations(manifest, ["package/index.mjs", "package/test/one.mjs", "test/two.mjs"]), []);
  assert.deepEqual(packageExportSurfacePaths(manifest), ["index.mjs"]);
  assert.deepEqual(carrierSurfaceViolations({ exports: "./index.mjs" }, ["index.mjs"]), []);
});

test("explicit receiving declarations preserve the receiver's nonempty unique file grammar", () => {
  const invalid = [undefined, null, "node --test", {}, [], ["test/a.mjs", "test/a.mjs"], [42], [""],
    ["/tmp/a.mjs"], ["../a.mjs"], ["test/./a.mjs"], ["test//a.mjs"], ["test/"], ["C:/a.mjs"],
    ["test\\a.mjs"], ["test/*.mjs"], ["test/?.mjs"], ["test/[ab].mjs"], ["test/{a,b}.mjs"],
    ["test/a\nmjs"], ["test/a\0mjs"], [{ command: "node" }]];
  for (const receivingTests of invalid) assert.deepEqual(carrierSurfaceViolations({ receivingTests }, []), [
    { kind: "invalid-receiving-tests", field: "receivingTests" },
  ]);
});

test("relative carriers preserve a literal package directory without an archive-prefix ambiguity", () => {
  const options = { pathFormat: "package-relative" };
  assert.deepEqual(carrierSurfaceViolations({ receivingTests: ["package/test.mjs"] }, ["package/test.mjs"], options), []);
  assert.deepEqual(carrierSurfaceViolations({ receivingTests: ["package/test.mjs"] }, ["test.mjs"], options), [
    { kind: "missing-receiving-test", field: "receivingTests", target: "package/test.mjs" },
  ]);
  assert.deepEqual(carrierSurfaceViolations({ receivingTests: ["test.mjs"] }, ["package/test.mjs"], options), [
    { kind: "missing-receiving-test", field: "receivingTests", target: "test.mjs" },
  ]);
  assert.deepEqual(carrierSurfaceViolations({ main: "package/index.mjs", bin: "package/cli.mjs" }, ["package/index.mjs", "package/cli.mjs"], options), []);
  assert.deepEqual(packageExportSurfacePaths({ main: "package/index.mjs", bin: "package/cli.mjs" }), ["package/cli.mjs", "package/index.mjs"]);
  assert.throws(() => carrierSurfaceViolations({}, [], { pathFormat: "relative" }), /unknown packed path format/u);
});

test("packageExportSurfacePaths lists every condition's concrete target, bin entries, and skips wildcards", () => {
  const manifest = {
    main: "./dist/index.mjs",
    exports: {
      ".": { types: "./dist/index.d.mts", import: "./dist/index.mjs" },
      "./cli": "./dist/cli.mjs",
      "./features/*": { import: "./dist/features/*.mjs" },
      "./package.json": "./package.json",
    },
    bin: { farolfi: "./dist/bin/farolfi.mjs" },
  };
  assert.deepEqual(packageExportSurfacePaths(manifest), [
    "dist/bin/farolfi.mjs",
    "dist/cli.mjs",
    "dist/index.d.mts",
    "dist/index.mjs",
    "package.json",
  ]);
});

test("packageExportSurfacePaths falls back to main when there is no root export", () => {
  assert.deepEqual(packageExportSurfacePaths({ main: "index.js" }), ["index.js"]);
});

test("packageExportSurfacePaths returns an empty surface for a non-object manifest", () => {
  assert.deepEqual(packageExportSurfacePaths(null), []);
  assert.deepEqual(packageExportSurfacePaths([]), []);
});

test("carrier surface admits post-build main, conditional exports, bins, and matched wildcard targets", () => {
  const manifest = {
    main: "./dist/index.mjs",
    exports: {
      ".": { types: "./dist/index.d.mts", import: "./dist/index.mjs" },
      "./features/*": { import: "./dist/features/*.mjs" },
      "./package.json": "./package.json",
    },
    bin: { example: "./scripts/example.mjs" },
  };
  assert.deepEqual(carrierSurfaceViolations(manifest, [
    "package/dist/index.mjs",
    "dist/index.d.mts",
    "dist/features/one.mjs",
    "scripts/example.mjs",
    "package.json",
  ]), []);
});

test("carrier surface reports every dead concrete promise and unmatched wildcard", () => {
  const violations = carrierSurfaceViolations({
    main: "index.js",
    exports: { "./index": "./src/index.mjs", "./features/*": "./dist/features/*.mjs" },
    bin: "./scripts/run.mjs",
  }, ["package.json", "src/index.mjs"]);
  assert.deepEqual(violations, [
    { kind: "missing-carrier-target", field: "main", target: "index.js" },
    { kind: "unmatched-carrier-pattern", field: "exports../features/*", target: "./dist/features/*.mjs" },
    { kind: "missing-carrier-target", field: "bin", target: "./scripts/run.mjs" },
  ]);
});

test("a valid root export supersedes an inert legacy main declaration", () => {
  assert.deepEqual(carrierSurfaceViolations({ main: "index.js", exports: { ".": "./src/index.mjs" } }, ["src/index.mjs"]), []);
});

test("carrier surface rejects external, traversing, empty, and malformed targets", () => {
  assert.deepEqual([
    ...carrierSurfaceViolations({ main: "../index.js" }, []),
    ...carrierSurfaceViolations({
    exports: { ".": "dependency", "./empty": "" },
    bin: { bad: "/bin/run" },
    }, []),
  ], [
    { kind: "invalid-carrier-target", field: "main", target: "../index.js" },
    { kind: "invalid-carrier-target", field: "exports..", target: "dependency" },
    { kind: "invalid-carrier-target", field: "exports../empty", target: "" },
    { kind: "invalid-carrier-target", field: "bin.bad", target: "/bin/run" },
  ]);
});

test("repeated wildcards use one Node package-export substitution", () => {
  assert.deepEqual(carrierSurfaceViolations({ exports: { "./pair/*": "./dist/*/copy-*.mjs" } }, ["dist/one/copy-two.mjs"]), [
    { kind: "unmatched-carrier-pattern", field: "exports../pair/*", target: "./dist/*/copy-*.mjs" },
  ]);
  assert.deepEqual(carrierSurfaceViolations({ exports: { "./pair/*": "./dist/*/copy-*.mjs" } }, ["dist/one/copy-one.mjs"]), []);
});


test("shared carrier allowance includes only relevant native ignore inputs without widening gitlink entry", () => {
  const manifest = { files: ["lib/foo/src"] };
  for (const path of [".npmignore", ".gitignore", "lib/.npmignore", "lib/foo/.gitignore", "lib/foo/src/.npmignore"])
    assert.equal(carrierSourceIncludes(manifest, path), true, path);
  for (const path of ["docs/.npmignore", "lib/other/.gitignore", "lib/foo/other/.npmignore"])
    assert.equal(carrierSourceIncludes(manifest, path), false, path);
  assert.equal(carrierSourceIncludes(manifest, "lib", { directory: true }), true);
  assert.equal(carrierSourceIncludes(manifest, "docs", { directory: true }), false);
  assert.equal(carrierSourceIncludes({ files: ["src"], exports: { ".": "./services/library/index.mjs" } }, "services/library/.npmignore"), true);
  assert.equal(carrierSourceIncludes({ files: ["src"] }, "services/unrelated", { directory: true }), false);
});
