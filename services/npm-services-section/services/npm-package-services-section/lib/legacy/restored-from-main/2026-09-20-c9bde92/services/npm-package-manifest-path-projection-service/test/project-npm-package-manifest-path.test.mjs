import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { projectNpmPackageManifestPath } from "../scripts/project-npm-package-manifest-path.mjs";

const directory = {
  type: "NpmPackageDirectory",
  version: 1,
  path: "/workspace/example",
};

test("projects package.json under the exact directory", () => {
  assert.deepEqual(projectNpmPackageManifestPath(directory), {
    type: "NpmPackageManifestPathProjection",
    version: 1,
    directory,
    path: "/workspace/example/package.json",
  });
});

test("refuses relative and inexact directories", () => {
  assert.throws(
    () => projectNpmPackageManifestPath({ ...directory, path: "relative" }),
    TypeError,
  );
});

test("the command maps the same projection over NDJSON", () => {
  const script = fileURLToPath(new URL("../scripts/project-npm-package-manifest-path.mjs", import.meta.url));
  const result = spawnSync(process.execPath, [script], {
    input: `${JSON.stringify(directory)}\n`,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), projectNpmPackageManifestPath(directory));
});
