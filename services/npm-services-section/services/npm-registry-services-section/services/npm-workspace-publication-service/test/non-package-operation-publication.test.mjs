import assert from "node:assert/strict";
import test from "node:test";
import { nonPackageOperationPublicationReason } from "../scripts/publish-package.mjs";

test("publication refuses Node operating-system operation names instead of versioning them", () => {
  for (const name of ["@red-cup-engineering/fern", "@red-cup-engineering/frog"]) {
    assert.match(nonPackageOperationPublicationReason(name), /not a publishable package/u);
  }
});

test("publication leaves actual package identities eligible for normal release checks", () => {
  // AOE declares an independent metadata package, not a root executable.
  assert.equal(nonPackageOperationPublicationReason("@red-cup-engineering/agent-organization-engine"), null);
  assert.equal(nonPackageOperationPublicationReason("@red-cup-engineering/feltos"), null);
  assert.equal(nonPackageOperationPublicationReason("@red-cup-engineering/metroplat"), null);
});
