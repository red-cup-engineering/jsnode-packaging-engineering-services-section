import test from "node:test";
import assert from "node:assert/strict";
import { carrierSourceIncludes } from "../src/carrier-surface.mjs";

test("carrier source selection enters only explicitly reached repositories", () => {
  const manifest = { files: ["src", "README*", "LICENSE*", "lib/*/src"], exports: { "./semantic": "./lib/semantic/src/index.mjs" } };
  const enters = path => carrierSourceIncludes(manifest, path, { directory: true });
  assert.equal(enters("lib/semantic"), true);
  assert.equal(enters("lib/other"), true, "the declared library wildcard reaches this library's src");
  assert.equal(enters("lib/semantic/src/generated"), true);
  assert.equal(enters("lib/semantic/data"), true, "glob source selection remains conservative beneath its explicit lib prefix");
  assert.equal(enters("services"), false, "README* must not cross into every repository");
  assert.equal(enters("unrelated"), false);
  assert.equal(carrierSourceIncludes({ files: ["src", "README*", "LICENSE*"] }, "lib/unrelated", { directory: true }), false);
  assert.equal(carrierSourceIncludes({ exports: { ".": "./src/index.mjs" } }, "lib/unrelated", { directory: true }), false,
    "npm's default file selection is not permission to acquire composed repositories");
  assert.equal(carrierSourceIncludes(manifest, "package.json"), true);
  assert.equal(carrierSourceIncludes(manifest, "src/index.mjs"), true);
  assert.equal(carrierSourceIncludes(manifest, "README.md"), true);
  assert.equal(carrierSourceIncludes(manifest, "lib/semantic/src/index.mjs"), true);
  assert.equal(carrierSourceIncludes(manifest, "data/evidence.bin"), false, "basename globs do not acquire unrelated file populations");
  assert.equal(carrierSourceIncludes({ files: ["src/**/*.mjs"] }, "src/.entry.mjs"), true,
    "npm carries dot entries beneath a selected directory");
  assert.equal(carrierSourceIncludes({ files: ["src/**/*.mjs"] }, "src/.provider", { directory: true }), true);
  assert.equal(carrierSourceIncludes({ files: ["*.mjs"] }, ".entry.mjs"), true);
  assert.equal(carrierSourceIncludes({ files: ["*.mjs"] }, "data/evidence.bin"), false);
  assert.equal(carrierSourceIncludes(manifest, "../outside"), false);
  assert.equal(carrierSourceIncludes(manifest, "node_modules/vendor/index.mjs"), false);
});
