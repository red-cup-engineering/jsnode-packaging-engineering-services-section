#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdtemp, open, readFile, rm, writeFile, realpath, lstat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, isAbsolute } from "node:path";
import { downloadConfiguredNpmRegistryTarball, publishConfiguredNpmRegistryArtifact, readConfiguredNpmRegistryPackageVersion } from "../src/registry.mjs";
import { admitArtifactRelease } from "../src/artifact-release.mjs";

// The primitive owns declared Gitlink/path/pin admission. This caller's finite
// locator context deliberately does not implement Git-relative URL resolution.
function localRepository(value) {
  if (typeof value !== "string" || /[\x00-\x1f\x7f]/u.test(value)) return false;
  if (isAbsolute(value)) return true;
  try {
    const url = new URL(value);
    return url.href === value && url.protocol === "file:" && !url.hostname
      && !url.username && !url.password && !url.search && !url.hash;
  } catch { return false; }
}
function childRepository(repository, declared) {
  if (typeof declared === "string" && !/[\x00-\x1f\x7f]/u.test(declared)) {
    try {
      const url = new URL(declared);
      if (url.href === declared && url.protocol === "https:" && !url.username
        && !url.password && !url.search && !url.hash) return declared;
    } catch { /* Absolute native paths are the other supported context. */ }
    if (localRepository(repository) && localRepository(declared)) return declared;
  }
  throw new TypeError("selected child repository locator is outside the native CLI context");
}

// Source receiving and publication are separate: this command reads the exact
// identity and compares its advertised digests with the one packed artifact.
const mode = process.argv[2];
if (mode === "compare" || mode === "receive") {
  const [input, output, ...extra] = process.argv.slice(3);
  if (!input || extra.length) throw new Error(`${mode} requires INPUT [exclusive OUTPUT]`);
  const handle = await open(input, "r");
  let request;
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > 8 * 1024 * 1024) throw new Error("comparison input must be a regular file of at most 8 MiB");
    const bounded = Buffer.alloc(8 * 1024 * 1024 + 1);
    let length = 0;
    while (length < bounded.length) {
      const { bytesRead } = await handle.read(bounded, length, bounded.length - length, null);
      if (!bytesRead) break;
      length += bytesRead;
    }
    if (length > 8 * 1024 * 1024) throw new Error("comparison input exceeded 8 MiB while reading");
    request = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bounded.subarray(0, length)));
  } finally { await handle.close(); }
  let result;
  if (mode === "compare") {
    if (!["source-archive", "archive-installed"].includes(request.stage)) throw new Error("compare requires an explicit artifact-member stage");
    result = admitArtifactRelease(request);
  } else {
    if (!request || typeof request !== "object" || Array.isArray(request)
      || Object.keys(request).some(key => !["registry", "source", "archive", "limits", "publisher", "sourceDirectory", "scratchDirectory"].includes(key)))
      throw new TypeError("receive requires only exact native source/archive locators and bounds");
    const { sourceDirectory, scratchDirectory, ...selection } = request;
    if (typeof scratchDirectory !== "string" || !isAbsolute(scratchDirectory) || await realpath(scratchDirectory) !== scratchDirectory
      || !(await lstat(scratchDirectory)).isDirectory()) throw new TypeError("receive requires an explicit real caller-owned scratchDirectory");
    let scratch, completed = false;
    try {
      const { createPinnedSourceReader } = await import("@red-cup-engineering/git-source-reading-service/pinned-source-files");
      const { receiveSourceArchiveMembers } = await import("../src/artifact-member-receiving.mjs");
      let reader;
      const readSource = async input => {
        if (!reader) {
          scratch = await mkdtemp(join(scratchDirectory, "git-source-"));
          reader = createPinnedSourceReader({ scratch, rejectSelectedNonRegular: true,
            resolveSubmodule: ({ repository, declaration }) => childRepository(repository, declaration.url),
            maxRepositories: selection.limits.sourceRepositories, maxPaths: selection.limits.sourcePaths, maxBytes: selection.limits.bytes });
        }
        return reader(input);
      };
      result = await receiveSourceArchiveMembers(selection, { readSource, sourceDirectory, scratchDirectory });
      completed = true;
    } finally { if (completed && scratch) await rm(scratch, { recursive: true, force: true }); }
  }
  const bytes = `${JSON.stringify(result, null, 2)}\n`;
  if (output) await writeFile(output, bytes, { flag: "wx", mode: 0o600 });
  console.log(bytes.trimEnd());
  process.exitCode = result.ok ? 0 : 1;
} else {
  await receiveRegistryObservation();
}

async function receiveRegistryObservation() {
if (!["before", "after", "publish"].includes(mode)) throw new Error("expected before, after or publish");
const { PACKAGE: name, VERSION: version, PACKAGE_ARCHIVE: archive, REGISTRY: address } = process.env;
if (!name || !version || !archive || !address) throw new Error("exact package, version, archive and registry authority required");
const registry = new URL(address);
if (registry.protocol !== "https:" || registry.username || registry.password || registry.search || registry.hash) throw new Error("registry requires credential-free HTTPS addressing");
const bytes = await readFile(archive);
const integrity = `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
const shasum = createHash("sha1").update(bytes).digest("hex");
let result = await readConfiguredNpmRegistryPackageVersion(registry.href, name, version);
if (result.authorizationFailed) throw new Error("registry receiving refused: authentication or authorization failed");
if (!result.reachable) throw new Error("registry metadata is unread; absence is not established");
if (!result.found && mode === "publish") {
  await publishConfiguredNpmRegistryArtifact({ registry: registry.href, name, version, artifact: archive });
  result = await readConfiguredNpmRegistryPackageVersion(registry.href, name, version);
  if (!result.reachable || result.authorizationFailed) throw new Error("published registry metadata is unread");
}
if (!result.found && mode === "before") {
  console.log(JSON.stringify({ state: "absent", name, version, integrity }));
} else {
  if (!result.found) throw new Error("published artifact is absent after publication");
  const published = result.manifest;
  if (published.name !== name || published.version !== version) throw new Error("registry returned another package or version");
  const digests = new Set((published.dist?.integrity ?? "").split(/\s+/));
  if (!(digests.has(integrity) || (!published.dist?.integrity && published.dist?.shasum === shasum))) throw new Error("published version differs from the packed source; preserve it and qualify a new declared version");
  const receiving = await mkdtemp(join(tmpdir(), "npm-artifact-receiving-"));
  try {
    await downloadConfiguredNpmRegistryTarball({ registry: registry.href, name, version, integrity, destination: join(receiving, "package.tgz"), npmEnvironment: { npm_config_cache: join(receiving, "cache") } });
    console.log(JSON.stringify({ state: "received", name, version, integrity, artifactDownloaded: true, source: process.env.GITHUB_SHA }));
  } finally { await rm(receiving, { recursive: true, force: true }); }
}
}
