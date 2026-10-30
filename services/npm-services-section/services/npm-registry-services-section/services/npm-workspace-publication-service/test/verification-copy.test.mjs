import assert from "node:assert/strict";
import test from "node:test";
import { verificationCopyFilter } from "../src/verification-copy.mjs";
import { publicationTemporaryRoot } from "../src/isolated-carrier-verification.mjs";

test("the unrooted legacy copy predicate cannot authorize repository copying", () => {
  assert.throws(() => verificationCopyFilter("/workspace/package.json"), /unrooted verification copying is forbidden/);
  assert.throws(() => verificationCopyFilter("/workspace/src/index.mjs"), /unrooted verification copying is forbidden/);
  for (const name of ["node_modules", ".git", "dist", "package-lock.json", ".npmrc"]) {
    assert.throws(() => verificationCopyFilter(`/workspace/${name}`), /unrooted verification copying is forbidden/, name);
    assert.throws(() => verificationCopyFilter(`/workspace/nested/${name}`), /unrooted verification copying is forbidden/, `nested ${name}`);
  }
});

test("Linux carrier verification does not inherit a Windows-mounted TEMP substrate", () => {
  assert.equal(publicationTemporaryRoot({ TEMP: "/mnt/c/Users/example/Temp" }, "linux"), "/tmp");
  assert.equal(publicationTemporaryRoot({ NPM_PUBLICATION_TEMP_ROOT: "/var/tmp/npm-publication" }, "linux"), "/var/tmp/npm-publication");
  assert.throws(() => publicationTemporaryRoot({ NPM_PUBLICATION_TEMP_ROOT: "relative" }, "linux"), /must be absolute/u);
});
