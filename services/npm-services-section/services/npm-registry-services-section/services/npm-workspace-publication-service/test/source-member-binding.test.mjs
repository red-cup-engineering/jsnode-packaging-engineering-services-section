import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rename, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { preparePublishedManifest, readExactManifest } from "../src/workspace-publication.mjs";
import { resolveWorkspaceMemberSource } from "../src/source-member-binding.mjs";
import { admitOperationsAuthorization, formPublicationPlan, publicationWitness, sha256Ni } from "../src/publication.mjs";
import { exactSourceGitOptions, immutableSourceGitOptions, withExactWorktree } from "../src/runner.mjs";

// Fixture-only per-command settings. No global process/config mutation.
const fixtureEnvironment = { ...process.env,
  GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", GIT_TERMINAL_PROMPT: "0",
  GIT_AUTHOR_DATE: "2026-10-07T00:00:00Z", GIT_COMMITTER_DATE: "2026-10-07T00:00:00Z",
  COREPACK_ENABLE_NETWORK: "0", COREPACK_ENABLE_DOWNLOAD_PROMPT: "0",
  npm_config_offline: "true", npm_config_update_notifier: "false",
  PNPM_DISABLE_SELF_UPDATE_CHECK: "1",
};
const json = value => `${JSON.stringify(value, null, 2)}\n`;
function git(root, ...args) {
  return execFileSync("git", ["-C", root, ...args], { encoding: "utf8", env: fixtureEnvironment, stdio: ["ignore", "pipe", "pipe"] }).trim();
}
function commit(root) {
  git(root, "-c", "user.name=Source Fixture", "-c", "user.email=source-fixture@example.invalid", "-c", "commit.gpgsign=false", "commit", "-qm", "Exact member fixture");
  return git(root, "rev-parse", "HEAD");
}
async function repository(root) {
  await mkdir(root, { recursive: true });
  git(root, "init", "-q", "--initial-branch=main");
}
async function tracked(root, path, content) {
  const target = join(root, path);
  await mkdir(join(target, ".."), { recursive: true });
  await writeFile(target, content);
  git(root, "add", "--", path);
}
function pin(root, path, childCommit) {
  git(root, "update-index", "--add", "--cacheinfo", `160000,${childCommit},${path}`);
}
async function fixture(t, { child = false, nested = false, duplicate = false, workspace = true, symlinkManifest = false,
  dependencyName = "@fixture/provider", providerVersion = "2.0.0", dependencyFields = ["dependencies"] } = {}) {
  const root = await mkdtemp(join(tmpdir(), "npm-member-source-"));
  t.after(async () => {
    if (process.env.RETAIN_SOURCE_BINDING_FIXTURES === "1") t.diagnostic(`retained synthetic fixture: ${root}`);
    else await rm(root, { recursive: true, force: true });
  });
  await repository(root);
  const packagePath = nested ? "packages/parent/deps/provider" : "packages/provider";
  const provider = join(root, packagePath);
  const manifest = { name: "@fixture/consumer", version: "1.0.0", private: true,
    ...Object.fromEntries(dependencyFields.map(field => [field, { [dependencyName]: "workspace:*" }])) };
  const providerManifest = { name: "@fixture/provider", version: providerVersion };
  await tracked(root, "package.json", json(manifest));
  await tracked(root, ".npmrc", "offline=true\nupdate-notifier=false\nmanage-package-manager-versions=false\n");
  const paths = [packagePath, ...(duplicate ? ["packages/duplicate"] : [])];
  if (workspace) await tracked(root, "pnpm-workspace.yaml", `packages:\n${paths.map(p => `  - ${JSON.stringify(p)}`).join("\n")}\n`);
  let childCommit, parent, parentCommit;
  if (child || nested) {
    if (nested) { parent = join(root, "packages/parent"); await repository(parent); }
    await repository(provider);
    if (symlinkManifest) {
      await tracked(provider, "source-manifest.json", json(providerManifest));
      await symlink("source-manifest.json", join(provider, "package.json"));
      git(provider, "add", "package.json");
    } else await tracked(provider, "package.json", json(providerManifest));
    childCommit = commit(provider);
    if (nested) {
      await tracked(parent, "README.md", "Synthetic intermediate source owner\n");
      pin(parent, "deps/provider", childCommit);
      parentCommit = commit(parent);
      pin(root, "packages/parent", parentCommit);
    } else pin(root, packagePath, childCommit);
  } else await tracked(root, `${packagePath}/package.json`, json(providerManifest));
  if (duplicate) await tracked(root, "packages/duplicate/package.json", json(providerManifest));
  const sourceCommit = commit(root);
  const source = await readExactManifest({ root, sourceCommit, path: join(root, "package.json") });
  return { root, sourceCommit, source, packageDirectory: root, provider, packagePath,
    manifest, providerManifest, childCommit, parent, parentCommit };
}
const prepare = (f, sourceMemberMode) => preparePublishedManifest({
  root: f.root, packageDirectory: f.packageDirectory, sourceCommit: f.sourceCommit,
  source: f.source, ...(sourceMemberMode === undefined ? {} : { sourceMemberMode }),
});
const code = expected => error => error?.code === expected;
const context = f => resolveWorkspaceMemberSource({ root: f.root, sourceCommit: f.sourceCommit, memberDirectory: f.provider });

test("actual installed pnpm enumeration: default and no-child opt-in preserve exact source records", async t => {
  const f = await fixture(t);
  const ordinary = await prepare(f);
  const opted = await prepare(f, "pinned-gitlinks");
  assert.deepEqual(opted, ordinary);
  assert.equal(ordinary.manifest.dependencies["@fixture/provider"], "2.0.0");
  assert.equal(ordinary.sources.length, 1);
  assert.deepEqual(Object.keys(ordinary.sources[0].source).sort(), ["commit", "manifestNi", "packagePath"]);
  assert.equal(f.source.value.dependencies["@fixture/provider"], "workspace:*");
  assert.equal(await readFile(join(f.root, "package.json"), "utf8"), json(f.manifest));
});

test("actual pnpm: migration preserves every dependency class and existing exact edges", async t => {
  const fields = ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"];
  const f = await fixture(t, { dependencyFields: fields });
  for (const field of fields) f.manifest[field][`@fixture/external-${field.toLowerCase()}`] = "3.0.0";
  await tracked(f.root, "package.json", json(f.manifest));f.sourceCommit = commit(f.root);
  f.source = await readExactManifest({ root: f.root, sourceCommit: f.sourceCommit, path: join(f.root, "package.json") });
  const before = Buffer.from(f.source.bytes), result = await prepare(f);
  for (const field of fields) {
    assert.deepEqual(result.manifest[field], { "@fixture/provider": "2.0.0", [`@fixture/external-${field.toLowerCase()}`]: "3.0.0" });
    assert.equal(f.source.value[field]["@fixture/provider"], "workspace:*");
  }
  assert.equal(result.sources.length, 1);assert.deepEqual(await readFile(join(f.root, "package.json")), before);
});

test("actual pnpm: an unknown declared workspace member refuses instead of erasing the edge", async t => {
  const f = await fixture(t, { dependencyName: "@fixture/unknown" });
  await assert.rejects(() => prepare(f), code("workspace-source-ambiguous"));
  assert.equal(JSON.parse(await readFile(join(f.root, "package.json"))).dependencies["@fixture/unknown"], "workspace:*");
});

test("actual received source bytes cannot be replaced by a forged caller projection", async t => {
  const f = await fixture(t);f.source.value.dependencies = {};
  await assert.rejects(() => prepare(f), code("source-content-drift"));
  assert.equal(JSON.parse(await readFile(join(f.root, "package.json"))).dependencies["@fixture/provider"], "workspace:*");
});

test("actual pnpm: default mode retains pinned-child refusal", async t => {
  const f = await fixture(t, { child: true });
  await assert.rejects(() => prepare(f), code("source-not-regular-tracked-file"));
});

test("actual pnpm: opt-in binds an exact child with no remote URL or authority-token gate", async t => {
  const f = await fixture(t, { child: true });
  const result = await prepare(f, "pinned-gitlinks");
  const item = result.sources[0];
  assert.equal(item.name, "@fixture/provider");
  assert.equal(item.version, "2.0.0");
  assert.deepEqual(item.source, {
    commit: f.childCommit, packagePath: ".", manifestNi: sha256Ni(json(f.providerManifest)),
    binding: { mode: "pinned-gitlinks", rootCommit: f.sourceCommit,
      workspaceFile: "pnpm-workspace.yaml", workspaceFileNi: sha256Ni(await readFile(join(f.root, "pnpm-workspace.yaml"))),
      memberPath: f.packagePath, gitlinks: [{ parentCommit: f.sourceCommit, path: f.packagePath, childCommit: f.childCommit }] },
  });
  assert.equal(JSON.stringify(result.sources).includes(f.root), false);
  assert.equal(await readFile(join(f.root, "package.json"), "utf8"), json(f.manifest));
});

test("actual pnpm: two-hop ancestry retains each pin and final owner-relative path", async t => {
  const f = await fixture(t, { nested: true });
  const result = await prepare(f, "pinned-gitlinks");
  assert.equal(result.sources[0].source.commit, f.childCommit);
  assert.equal(result.sources[0].source.packagePath, ".");
  assert.deepEqual(result.sources[0].source.binding.gitlinks, [
    { parentCommit: f.sourceCommit, path: "packages/parent", childCommit: f.parentCommit },
    { parentCommit: f.parentCommit, path: "deps/provider", childCommit: f.childCommit },
  ]);
});

test("missing authored tracked workspace refuses despite initialized pinned child", async t => {
  const f = await fixture(t, { child: true, workspace: false });
  await assert.rejects(() => prepare(f, "pinned-gitlinks"), code("workspace-source-missing"));
});

test("unknown mode refuses before filesystem or member enumeration", async () => {
  await assert.rejects(() => preparePublishedManifest({ root: "/does-not-exist", packageDirectory: "/does-not-exist",
    sourceCommit: "0".repeat(40), source: { value: {} }, sourceMemberMode: "discover-everywhere" }), code("source-member-mode-invalid"));
});

test("actual pnpm: duplicate names across parent and child refuse even with equal versions", async t => {
  const f = await fixture(t, { child: true, duplicate: true });
  await assert.rejects(() => prepare(f, "pinned-gitlinks"), code("workspace-source-ambiguous"));
});

test("actual pnpm: ordinary manifest byte drift retains original refusal", async t => {
  const f = await fixture(t);
  await writeFile(join(f.provider, "package.json"), json(f.providerManifest) + "\n");
  await assert.rejects(() => prepare(f, "pinned-gitlinks"), code("source-content-drift"));
});

test("actual pnpm: child manifest byte drift refuses with package identity unchanged", async t => {
  const f = await fixture(t, { child: true });
  await writeFile(join(f.provider, "package.json"), json(f.providerManifest) + "\n");
  await assert.rejects(() => prepare(f, "pinned-gitlinks"), code("source-content-drift"));
});

test("actual pnpm: uninitialized child is not an enclosing-repository fallback", async t => {
  const f = await fixture(t, { child: true });
  await rename(join(f.provider, ".git"), join(f.root, "retained-child-git"));
  await assert.rejects(() => prepare(f, "pinned-gitlinks"), code("source-gitlink-uninitialized"));
});

test("actual pnpm: wrong child HEAD refuses even when original manifest is unchanged", async t => {
  const f = await fixture(t, { child: true });
  await tracked(f.provider, "later.txt", "Synthetic changed child commit\n");
  assert.notEqual(commit(f.provider), f.childCommit);
  await assert.rejects(() => prepare(f, "pinned-gitlinks"), code("source-gitlink-commit-mismatch"));
});

test("actual pnpm: child Git root mismatch is refused", async t => {
  const f = await fixture(t, { child: true });
  git(f.provider, "config", "core.worktree", f.root);
  await assert.rejects(() => prepare(f, "pinned-gitlinks"), code("source-gitlink-root-mismatch"));
});

test("resolver-only actual Git: symlink child-root alias is refused", async t => {
  const f = await fixture(t, { child: true });
  const retained = join(f.root, "unlisted-child");
  await rename(f.provider, retained);
  await symlink(retained, f.provider);
  await assert.rejects(() => context(f), code("source-gitlink-root-mismatch"));
});

test("resolver-only actual Git: missing selected child is refused without initialization", async t => {
  const f = await fixture(t, { child: true });
  await rename(f.provider, join(f.root, "unlisted-child"));
  await assert.rejects(() => context(f), code("source-gitlink-uninitialized"));
});

test("resolver-only: selected path cannot escape explicit root", async t => {
  const f = await fixture(t);
  await assert.rejects(() => resolveWorkspaceMemberSource({ root: f.root, sourceCommit: f.sourceCommit,
    memberDirectory: join(f.root, "..") }), code("source-path-escape"));
});

test("actual pnpm: tracked symlink manifest remains nonregular source", async t => {
  const f = await fixture(t, { child: true, symlinkManifest: true });
  await assert.rejects(() => prepare(f, "pinned-gitlinks"), code("source-not-regular-tracked-file"));
});

test("resolver-only actual Git: missing pinned child object never triggers a fetch", async t => {
  const f = await fixture(t, { child: true });
  const object = join(f.provider, ".git/objects", f.childCommit.slice(0, 2), f.childCommit.slice(2));
  await rename(object, join(f.root, "retained-commit-object"));
  await assert.rejects(() => context(f), code("source-gitlink-object-unavailable"));
});

test("actual pnpm: replay at different temporary locations produces identical evidence", async t => {
  const a = await fixture(t, { nested: true }), b = await fixture(t, { nested: true });
  assert.notEqual(a.root, b.root);
  assert.equal(a.sourceCommit, b.sourceCommit);
  assert.deepEqual(await prepare(a, "pinned-gitlinks"), await prepare(b, "pinned-gitlinks"));
});

test("unit-only current plan/authorization/witness consumers bind additive child evidence", async t => {
  const f = await fixture(t, { child: true });
  const prepared = await prepare(f, "pinned-gitlinks");
  // Structural consumer test only: these bytes are not a package tarball and
  // this synthetic observation/authorization is never sent to a real receiver.
  const bytes = Buffer.from("unit-only artifact shape");
  const artifact = { bytes: bytes.length, shasum: createHash("sha1").update(bytes).digest("hex"),
    integrity: `sha512-${createHash("sha512").update(bytes).digest("base64")}`, ni: sha256Ni(bytes) };
  const input = { sourceCommit: f.sourceCommit, manifest: prepared.manifest, manifestBytes: f.source.bytes,
    publishedManifestBytes: prepared.bytes, workspaceDependencies: prepared.sources, artifact,
    registryObservation: { found: false, reachable: true } };
  const plan = formPublicationPlan(input);
  assert.equal(plan.version, 1);
  assert.deepEqual(plan.publication.workspaceDependencies, prepared.sources);
  const authorization = { kind: "operations.npm-publication-authorization", version: 1, decision: "authorize",
    planDigest: plan.planDigest, package: plan.package.name, packageVersion: plan.package.version, registry: plan.registry,
    authorizedBy: "fixture-only", authorizationRef: "fixture-only", authorizedAt: "2026-10-07T00:00:00Z" };
  assert.doesNotThrow(() => admitOperationsAuthorization(authorization, plan));
  const witness = publicationWitness({ plan, authorization, artifact,
    registryManifest: { name: plan.package.name, version: plan.package.version, dist: { integrity: artifact.integrity } } });
  assert.equal(witness.planDigest, plan.planDigest);
  await t.test("received child binding with stale digest refuses before authorization or witness", () => {
    const received = JSON.parse(JSON.stringify(plan));
    received.publication.workspaceDependencies[0].source.binding.gitlinks[0].childCommit = "4".repeat(40);
    assert.equal(received.planDigest, plan.planDigest);
    assert.throws(() => admitOperationsAuthorization(authorization, received), code("plan-digest-mismatch"));
    assert.throws(() => publicationWitness({ plan: received, authorization, artifact,
      registryManifest: { name: plan.package.name, version: plan.package.version, dist: { integrity: artifact.integrity } } }),
    code("plan-digest-mismatch"));
  });
  for (const mutate of [
    b => b.rootCommit = "1".repeat(40), b => b.workspaceFile += ".changed", b => b.workspaceFileNi += "changed",
    b => b.memberPath += "/changed", b => b.gitlinks[0].parentCommit = "2".repeat(40),
    b => b.gitlinks[0].path += "/changed", b => b.gitlinks[0].childCommit = "3".repeat(40),
  ]) {
    const altered = structuredClone(prepared.sources);
    mutate(altered[0].source.binding);
    const changed = formPublicationPlan({ ...input, workspaceDependencies: altered });
    assert.notEqual(changed.planDigest, plan.planDigest);
    assert.throws(() => admitOperationsAuthorization(authorization, changed), code("authorization-mismatch"));
  }
});

test("unit: immutable Git controls are per-call and do not mutate shared caller environment", async () => {
  const base = { PATH: process.env.PATH, GIT_GLOB_PATHSPECS: "1", GIT_NOGLOB_PATHSPECS: "1", GIT_ICASE_PATHSPECS: "1", marker: "unchanged" };
  const before = structuredClone(base);
  const options = await immutableSourceGitOptions(base);
  assert.deepEqual(base, before);
  assert.equal(options.env.GIT_NO_LAZY_FETCH, "1");
  assert.equal(options.env.GIT_NO_REPLACE_OBJECTS, "1");
  assert.equal(options.env.GIT_LITERAL_PATHSPECS, "1");
  for (const key of ["GIT_GLOB_PATHSPECS", "GIT_NOGLOB_PATHSPECS", "GIT_ICASE_PATHSPECS"]) assert.equal(Object.hasOwn(options.env, key), false);
  assert.equal(options.env.marker, "unchanged");
  const exact = await exactSourceGitOptions(base);
  assert.deepEqual(base, before);
  assert.equal(exact.env.GIT_NO_REPLACE_OBJECTS, "1");
  assert.equal(Object.hasOwn(exact.env, "GIT_NO_LAZY_FETCH"), false);
  assert.equal(exact.env.GIT_GLOB_PATHSPECS, "1");
});

test("actual pnpm: opt-in ignores replacement refs and rejects replacement-matching dirty bytes", async t => {
  const f = await fixture(t, { child: true });
  const originalBlob = git(f.provider, "rev-parse", "HEAD:package.json");
  const alteredBytes = json({ ...f.providerManifest, version: "9.0.0" });
  const replacementBlob = execFileSync("git", ["-C", f.provider, "hash-object", "-w", "--stdin"],
    { input: alteredBytes, encoding: "utf8", env: fixtureEnvironment }).trim();
  git(f.provider, "replace", originalBlob, replacementBlob);
  assert.equal(git(f.provider, "cat-file", "blob", originalBlob), alteredBytes.trim());
  const result = await prepare(f, "pinned-gitlinks");
  assert.equal(result.sources[0].version, "2.0.0");
  assert.equal(result.sources[0].source.manifestNi, sha256Ni(json(f.providerManifest)));
  await writeFile(join(f.provider, "package.json"), alteredBytes);
  await assert.rejects(() => prepare(f, "pinned-gitlinks"), code("source-content-drift"));
});

test("default exact reader fixes replacement substitution without changing original committed bytes", async t => {
  const f = await fixture(t, { child: true });
  const originalBlob = git(f.provider, "rev-parse", "HEAD:package.json");
  const alteredBytes = json({ ...f.providerManifest, version: "9.0.0" });
  const replacementBlob = execFileSync("git", ["-C", f.provider, "hash-object", "-w", "--stdin"],
    { input: alteredBytes, encoding: "utf8", env: fixtureEnvironment }).trim();
  git(f.provider, "replace", originalBlob, replacementBlob);
  const options = { root: f.provider, sourceCommit: f.childCommit, path: join(f.provider, "package.json") };
  const reading = await readExactManifest(options);
  assert.equal(reading.value.version, "2.0.0");
  await writeFile(options.path, alteredBytes);
  await assert.rejects(() => readExactManifest(options), code("source-content-drift"));
});

test("default managed checkout ignores replacement commits for all source files", async t => {
  const f = await fixture(t);
  await tracked(f.root, "payload.txt", "original committed source\n");
  const original = commit(f.root);
  await tracked(f.root, "payload.txt", "replacement source\n");
  const replacement = commit(f.root);
  git(f.root, "reset", "--hard", original);
  git(f.root, "replace", original, replacement);
  assert.equal(git(f.root, "show", `${original}:payload.txt`), "replacement source");
  await withExactWorktree({ repository: f.root, commit: original,
    work: async ({ root, commit: observed }) => {
      assert.equal(observed, original);
      assert.equal(await readFile(join(root, "payload.txt"), "utf8"), "original committed source\n");
    } });
});

test("reader-only actual Git: opt-in treats pathspec-magic filenames literally", async t => {
  const f = await fixture(t);
  const name = ":(glob)manifest*.json";
  const literalBytes = json({ name: "@fixture/literal", version: "1.0.0" });
  await writeFile(join(f.root, name), literalBytes);
  await writeFile(join(f.root, "manifest-decoy.json"), json({ name: "@fixture/decoy", version: "9.0.0" }));
  git(f.root, "--literal-pathspecs", "add", "--", name, "manifest-decoy.json");
  const sourceCommit = commit(f.root);
  const result = await readExactManifest({ root: f.root, sourceCommit, path: join(f.root, name), immutableGit: true });
  assert.equal(result.value.name, "@fixture/literal");
  assert.equal(result.bytes.toString(), literalBytes);
});

test("actual Git trace: every opt-in source Git read carries no-lazy-fetch, no-replacement, literal-path controls", async t => {
  const f = await fixture(t, { nested: true });
  const trace = join(f.root, "git-source-read-trace.jsonl");
  const moduleUrl = new URL("../src/workspace-publication.mjs", import.meta.url).href;
  const program = `import {readExactManifest,preparePublishedManifest} from ${JSON.stringify(moduleUrl)};\n`
    + `const root=${JSON.stringify(f.root)},sourceCommit=${JSON.stringify(f.sourceCommit)};\n`
    + `const source=await readExactManifest({root,sourceCommit,path:root+'/package.json',immutableGit:true});\n`
    + `await preparePublishedManifest({root,sourceCommit,packageDirectory:root,source,sourceMemberMode:'pinned-gitlinks'});\n`;
  execFileSync(process.execPath, ["--input-type=module", "--eval", program], {
    encoding: "utf8", env: { ...fixtureEnvironment,
      GIT_TRACE2_EVENT: trace,
      GIT_TRACE2_ENV_VARS: "GIT_NO_LAZY_FETCH,GIT_NO_REPLACE_OBJECTS,GIT_LITERAL_PATHSPECS",
    },
  });
  const events = (await readFile(trace, "utf8")).trim().split("\n").map(line => JSON.parse(line));
  const starts = events.filter(event => event.event === "start");
  assert.ok(starts.length >= 10, "trace must cover root, workspace, nested ancestry and manifest reads");
  for (const start of starts) {
    const settings = new Map(events.filter(event => event.sid === start.sid && event.event === "def_param")
      .map(event => [event.param, event.value]));
    // --local-env-vars emits metadata names only, before source/object reads.
    if (start.argv.includes("--local-env-vars")) {
      assert.equal(settings.get("GIT_NO_LAZY_FETCH"), "1");
      assert.equal(settings.get("GIT_NO_REPLACE_OBJECTS"), "1");
      continue;
    }
    for (const key of ["GIT_NO_LAZY_FETCH", "GIT_NO_REPLACE_OBJECTS", "GIT_LITERAL_PATHSPECS"]) assert.equal(settings.get(key), "1", `${key} missing for ${JSON.stringify(start.argv)}`);
    for (const flag of ["--no-lazy-fetch", "--no-replace-objects", "--literal-pathspecs"]) assert.ok(start.argv.includes(flag), `${flag} missing from source command`);
    assert.equal(start.argv.some(value => ["fetch", "clone", "submodule", "checkout", "worktree"].includes(value)), false);
  }
  t.diagnostic(`actual Git source reads inspected: ${starts.length}; no promisor endpoint or network trap created`);
});

test("actual caller preparation: managed opt-in checkout stays top-only and does not initialize children", async t => {
  const f = await fixture(t, { child: true });
  await withExactWorktree({ repository: f.root, commit: f.sourceCommit, immutableGit: true,
    work: async ({ root, commit: sourceCommit }) => {
      const source = await readExactManifest({ root, sourceCommit, path: join(root, "package.json"), immutableGit: true });
      await assert.rejects(() => readFile(join(root, f.packagePath, ".git")), error => error.code === "ENOENT");
      await assert.rejects(() => preparePublishedManifest({ root, sourceCommit, packageDirectory: root, source,
        sourceMemberMode: "pinned-gitlinks" }), code("workspace-source-ambiguous"));
    } });
  assert.equal(git(f.provider, "rev-parse", "HEAD"), f.childCommit);
});

test("actual pnpm: changed parent pin refuses an unchanged child/name/version", async t => {
  const f = await fixture(t, { child: true });
  await tracked(f.provider, "later.txt", "Later synthetic child\n");
  const later = commit(f.provider);
  git(f.provider, "checkout", "--detach", f.childCommit);
  pin(f.root, f.packagePath, later);
  f.sourceCommit = commit(f.root);
  f.source = await readExactManifest({ root: f.root, sourceCommit: f.sourceCommit, path: join(f.root, "package.json"), immutableGit: true });
  await assert.rejects(() => prepare(f, "pinned-gitlinks"), code("source-gitlink-commit-mismatch"));
});

test("resolver-only actual Git: missing pinned tree is refused without a promisor/fetch experiment", async t => {
  const f = await fixture(t, { child: true });
  const tree = git(f.provider, "rev-parse", "HEAD^{tree}");
  await rename(join(f.provider, ".git/objects", tree.slice(0, 2), tree.slice(2)), join(f.root, "retained-child-tree"));
  await assert.rejects(() => context(f), code("source-gitlink-object-unavailable"));
});

test("actual pnpm: manifest symlink cannot escape its child source owner", async t => {
  const f = await fixture(t, { child: true });
  const original = join(f.provider, "package.json");
  const outsideOwner = join(f.root, "outside-child-manifest.json");
  await rename(original, outsideOwner);
  await symlink(outsideOwner, original);
  await assert.rejects(() => prepare(f, "pinned-gitlinks"), code("source-path-escape"));
});

test("CLI unknown mode refuses before checkout/output/registry effects", async t => {
  const f = await fixture(t);
  const script = new URL("../scripts/assay-npm-package-publication.mjs", import.meta.url);
  const plan = join(f.root, "never-created-plan.json"), artifact = join(f.root, "never-created-artifact.tgz");
  assert.throws(() => execFileSync(process.execPath, [script.pathname, "--repository", "/does-not-exist",
    "--commit", "0".repeat(40), "--name", "@fixture/consumer", "--version", "1.0.0",
    "--plan-out", plan, "--artifact-out", artifact, "--source-member-mode", "unknown"],
  { encoding: "utf8", env: fixtureEnvironment, stdio: ["ignore", "pipe", "pipe"] }),
  error => error.status === 1 && error.stderr.startsWith("source-member-mode-invalid:"));
  await assert.rejects(() => readFile(plan), error => error.code === "ENOENT");
  await assert.rejects(() => readFile(artifact), error => error.code === "ENOENT");
});

test("repository-local Git environment is removed per command without changing unrelated settings", async () => {
  const names = execFileSync("git", ["rev-parse", "--local-env-vars"], { encoding: "utf8", env: fixtureEnvironment }).trim().split("\n");
  const base = { PATH: process.env.PATH, LANG: "C", fixtureMarker: "preserved",
    ...Object.fromEntries(names.map(name => [name, "fixture-value"])) };
  const before = structuredClone(base);
  for (const options of [await exactSourceGitOptions(base), await immutableSourceGitOptions(base)]) {
    for (const name of names.filter(name => name !== "GIT_NO_REPLACE_OBJECTS")) assert.equal(Object.hasOwn(options.env, name), false, name);
    assert.equal(options.env.GIT_NO_REPLACE_OBJECTS, "1");
    assert.equal(options.env.fixtureMarker, "preserved");
    assert.equal(options.env.PATH, base.PATH);
    assert.equal(options.env.LANG, "C");
  }
  assert.deepEqual(base, before);
});

test("resolver-only actual Git: inherited repository selectors cannot conceal wrong child HEAD", async t => {
  const actual = await fixture(t, { child: true });
  const decoy = await fixture(t, { child: true });
  await tracked(actual.provider, "later.txt", "Different actual child HEAD\n");
  const changed = commit(actual.provider);
  assert.notEqual(changed, actual.childCommit);
  await assert.rejects(() => context(actual), code("source-gitlink-commit-mismatch"));
  const moduleUrl = new URL("../src/source-member-binding.mjs", import.meta.url).href;
  const input = { root: actual.root, sourceCommit: actual.sourceCommit, memberDirectory: actual.provider };
  const program = `import {resolveWorkspaceMemberSource} from ${JSON.stringify(moduleUrl)};\n`
    + `try { await resolveWorkspaceMemberSource(${JSON.stringify(input)}); console.log('accepted'); }\n`
    + `catch (error) { console.log(error.code); }\n`;
  const result = execFileSync(process.execPath, ["--input-type=module", "--eval", program], {
    encoding: "utf8", env: { ...fixtureEnvironment,
      GIT_DIR: join(decoy.provider, ".git"), GIT_WORK_TREE: actual.provider,
      GIT_ALTERNATE_OBJECT_DIRECTORIES: join(actual.root, ".git/objects"),
    },
  });
  assert.equal(result.trim(), "source-gitlink-commit-mismatch");
  assert.equal(git(actual.provider, "rev-parse", "HEAD"), changed);
});

test("resolver-only actual Git: a subdirectory cannot masquerade as the exact owner root", async t => {
  const f = await fixture(t, { child: true });
  await assert.rejects(() => resolveWorkspaceMemberSource({ root: join(f.root, "packages"),
    sourceCommit: f.sourceCommit, memberDirectory: f.provider }), code("source-root-mismatch"));
  assert.equal((await context(f)).gitlinks[0].path, "packages/provider");
});

test("actual pnpm: member below a gitlink retains its final owner-relative suffix", async t => {
  const f = await fixture(t, { child: true });
  const suffix = "apps/provider";
  await tracked(f.provider, `${suffix}/package.json`, json(f.providerManifest));
  git(f.provider, "rm", "package.json");
  f.childCommit = commit(f.provider);
  pin(f.root, f.packagePath, f.childCommit);
  await tracked(f.root, "pnpm-workspace.yaml", `packages:\n  - "${f.packagePath}/${suffix}"\n`);
  f.sourceCommit = commit(f.root);
  f.source = await readExactManifest({ root: f.root, sourceCommit: f.sourceCommit, path: join(f.root, "package.json") });
  const result = await prepare(f, "pinned-gitlinks");
  assert.equal(result.sources[0].source.packagePath, suffix);
  assert.equal(result.sources[0].source.commit, f.childCommit);
  assert.equal(result.sources[0].source.binding.memberPath, `${f.packagePath}/${suffix}`);
  assert.deepEqual(result.sources[0].source.binding.gitlinks,
    [{ parentCommit: f.sourceCommit, path: f.packagePath, childCommit: f.childCommit }]);
});

test("actual pnpm: in-owner working symlink preserves regular tracked byte identity", async t => {
  const f = await fixture(t, { child: true });
  await rename(join(f.provider, "package.json"), join(f.provider, "same-bytes.json"));
  await symlink("same-bytes.json", join(f.provider, "package.json"));
  assert.equal((await prepare(f, "pinned-gitlinks")).sources[0].source.manifestNi, sha256Ni(json(f.providerManifest)));
  await writeFile(join(f.provider, "same-bytes.json"), json(f.providerManifest) + "\n");
  await assert.rejects(() => prepare(f, "pinned-gitlinks"), code("source-content-drift"));
});
