import assert from "node:assert/strict";
import test from "node:test";

import { projectPnpmWorkspace } from "../src/fabricate-pnpm-workspace.mjs";

const provider = { path: "packages/provider", manifest: { name: "@customer/provider", version: "2.0.0" } };
const customer = (fields) => ({
  root: { name: "customer-product", version: "1.0.0" },
  pnpmVersion: "12.9.1",
  packages: [
    provider,
    { path: "packages/consumer", manifest: {
      name: "@customer/consumer", version: "1.0.0", ...fields,
    } },
  ],
});

// CF-PNPM-014: the factory must not silently weaken a customer's requested
// version constraints merely because it has an incompatible local provider.
test("retains every original internal dependency range for pnpm's own resolver", () => {
  const projection = projectPnpmWorkspace(customer({
    dependencies: { "@customer/provider": "^3.0.0", external: "~5.0.0" },
    devDependencies: { "@customer/provider": "~2.0.0" },
    optionalDependencies: { "@customer/provider": ">=2.0.0 <3.0.0" },
    peerDependencies: { "@customer/provider": "workspace:^2.0.0" },
  }));
  const manifest = JSON.parse(projection.files.get("packages/consumer/package.json"));
  assert.equal(manifest.dependencies["@customer/provider"], "workspace:^3.0.0");
  assert.equal(manifest.devDependencies["@customer/provider"], "workspace:~2.0.0");
  assert.equal(manifest.optionalDependencies["@customer/provider"], "workspace:>=2.0.0 <3.0.0");
  assert.equal(manifest.peerDependencies["@customer/provider"], "workspace:^2.0.0");
  assert.equal(manifest.dependencies.external, "~5.0.0");
});

// CF-PNPM-015: malformed dependency tables/specifiers must fail during
// pure admission, not become an apparently complete installable workspace.
test("refuses malformed dependency tables and non-string specifiers", () => {
  for (const dependencies of [null, [], "2.0.0", { "@customer/provider": 2 }, { external: false }, { "@customer/provider": " " }]) {
    assert.throws(() => projectPnpmWorkspace(customer({ dependencies })),
      /dependenc|specifier/u, JSON.stringify(dependencies));
  }
});

// CF-PNPM-016: a registry or file-source spec is not a PNPM local version
// requirement; do not overwrite a source choice with a workspace provider.
test("refuses source-protocol substitution for an internal package name", () => {
  for (const requested of ["npm:foreign-provider@1.0.0", "file:../other", "git+https://example.invalid/repo"]) {
    assert.throws(() => projectPnpmWorkspace(customer({
      dependencies: { "@customer/provider": requested },
    })), /internal|protocol|source/u, requested);
  }
});
