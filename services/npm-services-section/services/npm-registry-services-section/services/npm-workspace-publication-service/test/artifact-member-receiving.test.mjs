import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { admitArtifactRelease } from "../src/artifact-release.mjs";

const digest = value => createHash("sha256").update(value).digest("hex");
const commit = "a".repeat(40);
const integrity = "sha512-" + Buffer.alloc(64, 1).toString("base64");
const manifest = { name: "@example/member-receiving", version: "1.0.0", bin: { receive: "bin/receive.mjs" } };
const text = value => JSON.stringify(value, null, 2) + "\n";
const row = (path, contents, mode = 0o644) => ({ path, kind: "file", bytes: Buffer.byteLength(contents), sha256: digest(contents), mode });
function sourceInput() {
  const sourceText = text(manifest), archiveText = text({ ...manifest, gitHead: commit });
  return { stage: "source-archive", registry: "https://registry.example/", limits: { members: 10, bytes: 10000 },
    source: { repository: "https://github.com/example/member-receiving.git", commit, manifestText: sourceText,
      members: [row("package.json", sourceText), row("bin/receive.mjs", "#!/usr/bin/env node\n")] },
    archive: { integrity, manifestText: archiveText,
      members: [row("package.json", archiveText, 0o600), row("bin/receive.mjs", "#!/usr/bin/env node\n")] },
    publisher: { gitHead: commit, format: "json-2-newline" } };
}
function installedInput() {
  const original = sourceInput(), archive = original.archive;
  return { stage: "archive-installed", registry: original.registry, limits: original.limits, archive,
    installed: { manifestText: archive.manifestText, members: archive.members.map(entry => ({ ...entry, mode: entry.path === "package.json" ? 0o644 : 0o755 })) },
    installation: { kind: "native-package-installation", status: 0, platform: "linux",
      manager: { name: "pnpm", version: "11.19.0", entrySHA256: digest("qualified native manager entry") },
      receipt: "fixture://native-installation", receiptSHA256: digest("retained successful native receipt"),
      requestSHA256: digest("actual native operation request"),
      manifestSHA256: digest("private native consumer descriptor"), lockSHA256: digest("unchanged native frozen lock"),
      installedManifestSHA256: digest(archive.manifestText), artifactIntegrity: integrity,
      package: manifest.name, version: manifest.version, normalization: "posix-package-files-0644-0755",
      bins: [{ name: "receive", target: "bin/receive.mjs", registered: true, targetSHA256: archive.members[1].sha256 }] } };
}
const codes = result => result.refusal.findings.map(finding => finding.code);

test("source/archive accepts a nonexecutable declared bin without claiming installation", () => {
  const input = sourceInput(), result = admitArtifactRelease(input);
  assert.equal(result.ok, true);
  assert.equal(result.value.installationClaimed, false);
  assert.deepEqual(result, admitArtifactRelease(input));
  input.archive.members[1].mode = 0o755;
  assert.equal(result.value.archive.find(entry => entry.path === "bin/receive.mjs").mode, 0o644);
  assert.throws(() => { result.value.archive[0].mode = 0; }, TypeError);
});

test("archive stage cannot promote a declared bin or lose source executable intent", () => {
  for (const direction of ["promoted", "lost"]) {
    const input = sourceInput();
    (direction === "promoted" ? input.archive : input.source).members[1].mode = 0o755;
    assert(codes(admitArtifactRelease(input)).includes("source-executable-intent-mismatch"));
  }
});

test("one immutable SHA512 identity rejects pad-bit aliases and wrong digest lengths", () => {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const alias = integrity.slice(0, -3) + alphabet[alphabet.indexOf(integrity.at(-3)) + 1] + "==";
  assert(Buffer.from(alias.slice(7), "base64").equals(Buffer.from(integrity.slice(7), "base64")), "the alias decodes to the same bytes");
  for (const invalid of [alias, "sha512-" + Buffer.alloc(63).toString("base64"), "sha512-" + Buffer.alloc(65).toString("base64"), integrity + "\n"]) {
    const input = sourceInput(); input.archive.integrity = invalid;
    assert.throws(() => admitArtifactRelease(input), /canonical SHA512/u);
  }
  assert.equal(admitArtifactRelease(sourceInput()).ok, true);
});

test("publisher projection requires exact source commit and exact representation, with no extra fields", () => {
  const wrong = sourceInput(); wrong.publisher.gitHead = "b".repeat(40);
  assert(codes(admitArtifactRelease(wrong)).includes("publisher-git-head-mismatch"));
  for (const projected of [{ ...manifest, gitHead: commit, extra: true }, { ...manifest, gitHead: "b".repeat(40) }]) {
    const input = sourceInput(); input.archive.manifestText = text(projected);
    input.archive.members[0] = row("package.json", input.archive.manifestText, 0o600);
    assert(codes(admitArtifactRelease(input)).includes("manifest-projection-mismatch"));
  }
  const serialization = sourceInput(); serialization.archive.manifestText = JSON.stringify({ ...manifest, gitHead: commit });
  serialization.archive.members[0] = row("package.json", serialization.archive.manifestText);
  assert(codes(admitArtifactRelease(serialization)).includes("manifest-projection-mismatch"));
});

test("bounded literal member identity refuses duplicates, traversal, links and special modes", () => {
  for (const mutate of [
    input => input.archive.members.push({ ...input.archive.members[1] }),
    input => { input.archive.members[1].path = "../escape"; },
    input => { input.archive.members[1].path = "/escape"; },
    input => { input.archive.members[1].kind = "symlink"; },
    input => { input.archive.members[1].kind = "hardlink"; },
    input => { input.archive.members[1].mode = 0o4755; },
    input => { input.limits.members = 1; },
    input => { input.limits.bytes = 1; },
  ]) {
    const input = sourceInput(); mutate(input); assert.throws(() => admitArtifactRelease(input), TypeError);
  }
  const literal = sourceInput();
  for (const side of [literal.source, literal.archive]) side.members[1].path = "package/actual.mjs";
  assert.equal(admitArtifactRelease(literal).ok, true, "package/ is a literal relative directory");
});

test("member omissions, extra members and changed payload cannot disappear into a set or digest", () => {
  const missing = sourceInput(); missing.archive.members.pop();
  assert(codes(admitArtifactRelease(missing)).includes("absent-from-archive"));
  const extra = sourceInput(); extra.archive.members.push(row("extra", "extra"));
  assert(codes(admitArtifactRelease(extra)).includes("extra-archive-member"));
  const changed = sourceInput(); changed.archive.members[1] = row("bin/receive.mjs", "changed bytes");
  assert(codes(admitArtifactRelease(changed)).includes("payload-mismatch"));
});

test("received native context permits finite read/write normalization and actual bin promotion", () => {
  const result = admitArtifactRelease(installedInput());
  assert.equal(result.ok, true);
  assert.equal(result.value.installationClaimed, true);
  assert.equal(result.value.evidence.modeChanges.length, 2);
  assert.equal(result.value.evidence.modeChanges.find(row => row.path === "bin/receive.mjs").executablePromotion, true);
});

test("native npm file-directory bins follow the actual manager umask primitive only", () => {
  const input = installedInput();
  input.installed.members[0].mode = input.archive.members[0].mode;
  input.installed.members[1].mode = 0o700;
  Object.assign(input.installation, { manager: { ...input.installation.manager, name: "npm", version: "11.16.0" },
    normalization: "npm-file-directory-bin-umask", operation: "npm-ci-file-directory", umask: 0o077,
    normalizationProvider: { path: "bin-links/lib/fix-bin.js", sha256: digest("actual manager bin-links primitive") } });
  const result = admitArtifactRelease(input);
  assert.equal(result.ok, true);
  assert.equal(result.value.evidence.installation.umask, 0o077);
  assert.equal(result.value.evidence.modeChanges[0].installedMode, 0o700);
  for (const mutate of [
    x => { x.installed.members[1].mode = 0o755; },
    x => { x.installed.members[0].mode = 0o644; },
    x => { x.installation.manager.name = "pnpm"; },
    x => { delete x.installation.operation; },
    x => { x.installation.umask = -1; },
    x => { x.installation.umask = 0o1000; },
    x => { x.installation.umask = "0077"; },
    x => { x.installation.normalizationProvider.path = "foreign-primitive.js"; },
    x => { delete x.installation.normalizationProvider.sha256; },
    x => { x.installation.bins[0].registered = false; },
  ]) {
    const refused = structuredClone(input); mutate(refused);
    assert.equal(admitArtifactRelease(refused).ok, false);
  }
  const foreignPnpm = installedInput(); foreignPnpm.installation.manager.name = "npm";
  assert.equal(admitArtifactRelease(foreignPnpm).ok, false, "PNPM normalization is not an NPM waiver");
});

test("declaration, extract, failed or foreign manager evidence cannot stand for native installation", () => {
  for (const mutate of [
    input => { delete input.installation; },
    input => { input.installation.status = 1; },
    input => { input.installation.artifactIntegrity = "sha512-" + Buffer.alloc(64, 2).toString("base64"); },
    input => { input.installation.manager.entrySHA256 = ""; },
    input => { delete input.installation.requestSHA256; },
    input => { input.installation.installedManifestSHA256 = digest("another package"); },
    input => { input.installation.platform = "win32"; },
    input => { input.installation.bins[0].registered = false; },
    input => { input.installation.bins[0].target = "another-target.mjs"; },
    input => { input.installation.bins[0].targetSHA256 = digest("foreign registered target"); },
  ]) {
    const input = installedInput(); mutate(input); assert.equal(admitArtifactRelease(input).ok, false);
  }
});

test("normalization does not permit payload changes, undeclared execute, lost execute or an arbitrary chmod map", () => {
  const addedExecute = installedInput();
  addedExecute.installed.members[0].mode = 0o755;
  assert(codes(admitArtifactRelease(addedExecute)).includes("unreceived-installed-mode"));
  const lostExecute = installedInput();
  lostExecute.archive.members[1].mode = 0o755; lostExecute.installed.members[1].mode = 0o644;
  assert(codes(admitArtifactRelease(lostExecute)).includes("unreceived-installed-mode"));
  const unsafeMode = installedInput(); unsafeMode.installed.members[1].mode = 0o777;
  assert(codes(admitArtifactRelease(unsafeMode)).includes("unreceived-installed-mode"));
  const unreceived = installedInput(); delete unreceived.installation.normalization;
  assert(codes(admitArtifactRelease(unreceived)).includes("unreceived-installed-mode"));
  const changed = installedInput(); changed.installed.members[1] = row("bin/receive.mjs", "different", 0o755);
  assert(codes(admitArtifactRelease(changed)).includes("payload-mismatch"));
});

test("the original receiving CLI compares both stages offline and preserves exclusive result custody", () => {
  const root = mkdtempSync(join(tmpdir(), "artifact-member-cli-"));
  const cli = fileURLToPath(new URL("../scripts/receive-packed-registry-artifact.mjs", import.meta.url));
  try {
    for (const [name, input] of [["source", sourceInput()], ["installed", installedInput()]]) {
      const request = join(root, name + ".json"), output = join(root, name + "-result.json");
      writeFileSync(request, JSON.stringify(input));
      const result = spawnSync(process.execPath, [cli, "compare", request, output], {
        encoding: "utf8", timeout: 20000, maxBuffer: 1024 * 1024,
        env: { ...process.env, PACKAGE: "", REGISTRY: "not-a-registry" },
      });
      assert.equal(result.status, 0, result.stderr);
      assert.equal(JSON.parse(readFileSync(output, "utf8")).ok, true);
      const before = readFileSync(output);
      const repeat = spawnSync(process.execPath, [cli, "compare", request, output], { encoding: "utf8", timeout: 20000 });
      assert.equal(repeat.status, 1);
      assert(readFileSync(output).equals(before));
    }
    const refused = installedInput(); refused.installed.members[1] = row("bin/receive.mjs", "drift", 0o755);
    const request = join(root, "refused.json"); writeFileSync(request, JSON.stringify(refused));
    const result = spawnSync(process.execPath, [cli, "compare", request], { encoding: "utf8", timeout: 20000 });
    assert.equal(result.status, 1);
    assert.equal(JSON.parse(result.stdout).ok, false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});


test("new partial stages refuse contradictory, unknown and mixed-unit evidence without freezing callers", () => {
  for (const mutate of [
    x => { x.installed = installedInput().installed; },
    x => { x.imports = []; },
    x => { x.archive.trusted = true; },
    x => { x.source.selectionAccepted = true; },
    x => { x.source.members[1].gitMode = "100755"; },
    x => { x.archive.members[1].gitMode = "100644"; },
    x => { x.publisher.expectedManifestBytes = "caller-waiver"; },
    x => { x.limits.unbounded = true; },
  ]) {
    const x = sourceInput(); mutate(x); assert.throws(() => admitArtifactRelease(x), TypeError);
    assert.equal(Object.isFrozen(x), false); assert.equal(Object.isFrozen(x.source), false);
  }
  for (const mutate of [
    x => { x.source = sourceInput().source; },
    x => { x.installation.manager.trusted = true; },
    x => { x.installation.bins[0].trusted = true; },
  ]) {
    const x = installedInput(); mutate(x); assert.throws(() => admitArtifactRelease(x), TypeError);
  }
  for (const stage of [null, "unknown", { unsupported: true }]) {
    if (stage && typeof stage === "object") stage.self = stage;
    assert.throws(() => admitArtifactRelease({ stage }), TypeError);
    if (stage && typeof stage === "object") { assert.equal(Object.isFrozen(stage), false); stage.mutable = true; }
  }
});

test("literal paths refuse control characters and native bin receipts cannot contain duplicate or foreign bindings", () => {
  for (const path of ["line\nheader", "control\u0001name", "delete\u007fname"]) {
    const x = sourceInput(); for (const side of [x.source, x.archive]) side.members[1].path = path;
    assert.throws(() => admitArtifactRelease(x), /unsafe or duplicate path/u);
  }
  const duplicate = installedInput(); duplicate.installation.bins.push({ ...duplicate.installation.bins[0] });
  assert(codes(admitArtifactRelease(duplicate)).includes("unexpected-native-bin"));
  const foreign = installedInput(); foreign.installation.bins.push({ ...foreign.installation.bins[0], name: "not-declared" });
  assert(codes(admitArtifactRelease(foreign)).includes("unexpected-native-bin"));
  const callerOwned = { unsupported: true }; callerOwned.self = callerOwned;
  const hostile = installedInput(); hostile.installation.bins.push({ ...hostile.installation.bins[0], name: callerOwned });
  assert(codes(admitArtifactRelease(hostile)).includes("unexpected-native-bin"));
  assert.equal(Object.isFrozen(callerOwned), false); callerOwned.mutable = true;
});

test("the bounded original CLI decodes UTF8 fatally while preserving ordinary Unicode", () => {
  const root = mkdtempSync(join(tmpdir(), "artifact-member-utf8-"));
  const cli = fileURLToPath(new URL("../scripts/receive-packed-registry-artifact.mjs", import.meta.url));
  const run = path => spawnSync(process.execPath, [cli, "compare", path], {
    encoding: "utf8", timeout: 20000, maxBuffer: 1024 * 1024,
    env: { ...process.env, PACKAGE: "", REGISTRY: "not-a-registry" },
  });
  try {
    const input = sourceInput(), described = { ...manifest, description: "Pheží Ocháǧe 🦐" };
    input.source.manifestText = text(described); input.source.members[0] = row("package.json", input.source.manifestText);
    input.archive.manifestText = text({ ...described, gitHead: commit }); input.archive.members[0] = row("package.json", input.archive.manifestText);
    const positive = join(root, "unicode.json"); writeFileSync(positive, JSON.stringify(input));
    const success = run(positive); assert.equal(success.status, 0, success.stderr); assert.equal(JSON.parse(success.stdout).ok, true);
    const malformed = join(root, "invalid-utf8.json"), bytes = Buffer.from(JSON.stringify({ ...sourceInput(), registry: "utf8-marker" }));
    const index = bytes.indexOf(Buffer.from("utf8-marker")); assert(index >= 0); bytes[index] = 0xff; writeFileSync(malformed, bytes);
    const refused = run(malformed); assert.equal(refused.status, 1); assert.match(refused.stderr, /encoded data was not valid/u);
    const excessive = join(root, "excessive.json"); writeFileSync(excessive, Buffer.alloc(8 * 1024 * 1024 + 1, 32));
    const bounded = run(excessive); assert.equal(bounded.status, 1); assert.match(bounded.stderr, /at most 8 MiB/u);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// Original PR24's shared-array counterexample applies at every identity field.
test("immutable identities are literal strings and never coercible shared objects", () => {
  assert.equal(admitArtifactRelease(sourceInput()).ok, true);
  const input = sourceInput(), shared = [input.source.members[1].sha256];
  input.source.members[1].sha256 = shared;
  input.archive.members[1].sha256 = shared;
  assert.throws(() => admitArtifactRelease(input), /invalid file identity/u);
  assert.equal(Object.isFrozen(shared), false);
  const source = sourceInput(); source.source.commit = [source.source.commit];
  assert.throws(() => admitArtifactRelease(source), /immutable source/u);
  for (const key of ["requestSHA256", "receiptSHA256", "manifestSHA256", "lockSHA256", "installedManifestSHA256"]) {
    const native = installedInput(), shared = [native.installation[key]];
    native.installation[key] = shared;
    const result = admitArtifactRelease(native);
    assert.equal(result.ok, false);
    assert(codes(result).includes("unreceived-native-installation"));
    assert.equal(Object.isFrozen(shared), false);
  }
  const native = installedInput();
  native.installation.manager.entrySHA256 = [native.installation.manager.entrySHA256];
  assert(codes(admitArtifactRelease(native)).includes("unreceived-native-installation"));
});
