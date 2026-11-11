import assert from "node:assert/strict";
import test from "node:test";
import { projectPnpmWorkspace } from "@red-cup-engineering/pnpm-workspace-fabrication-service";

test("PNPM-WORKSPACE-QUICKSTART", () => {
  const result = projectPnpmWorkspace({
    root: { name: "customer-product", version: "1.0.0" },
    pnpmVersion: "10.26.0",
    buildPolicy: { esbuild: false },
    packages: [{ path: "packages/widget", manifest: { name: "widget", version: "1.0.0" } }],
  });
  assert.equal(JSON.parse(result.files.get("package.json")).packageManager, "pnpm@10.26.0");
  assert.match(result.files.get("pnpm-workspace.yaml"), /^  "esbuild": false$/mu);
});
