import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { selectNpmPackageManifestPaths } from "../scripts/select-npm-package-manifest-paths.mjs";

const request = {
  type: "NpmPackageManifestPathSelectionRequest",
  version: 1,
  paths: ["/a/package.json", "/a/readme.md", "/b/package.json"],
};

test("selects only package.json paths without reading them", () => {
  assert.deepEqual(selectNpmPackageManifestPaths(request), {
    type: "NpmPackageManifestPathSelection",
    version: 1,
    paths: ["/a/package.json", "/b/package.json"],
  });
});

test("the command maps the same selection over NDJSON", () => {
  const script = fileURLToPath(new URL("../scripts/select-npm-package-manifest-paths.mjs", import.meta.url));
  const result = spawnSync(process.execPath, [script], {
    input: `${JSON.stringify(request)}\n`,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), selectNpmPackageManifestPaths(request));
});
