import { access, copyFile, readFile, realpath, mkdir } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { publicationManifest, dependencySpecificationViolations, isExactSemver, WORKSPACE_SPECIFICATION } from "./dependency-policy.mjs";
import { NpmPublicationError, measureArtifact, sha256Ni } from "./publication.mjs";
import { exactSourceGitOptions, immutableSourceGitOptions, runCommand, sourceGitArguments } from "./runner.mjs";
import { resolveWorkspaceMemberSource, validateSourceMemberMode } from "./source-member-binding.mjs";

const FIELDS = ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"];
const inside = (root, path) => { const part = relative(root, path); return part === "" || (part !== ".." && !part.startsWith("../") && !part.startsWith("..\\") && !isAbsolute(part)); };
const manifestPath = path => path === "." ? "package.json" : `${path}/package.json`;

/** Require a regular tracked blob, owner-confined working bytes and exact byte
 * equality. An in-owner working symlink to the same bytes is harmless. */
export async function readExactSourceFile({ root, sourceCommit, path, immutableGit = false }) {
  if (!/^[0-9a-f]{40}$/u.test(sourceCommit)) throw new NpmPublicationError("source-commit-invalid", "source reading requires an exact commit");
  const canonicalRoot = await realpath(root);
  const canonicalPath = await realpath(path);
  if (!inside(canonicalRoot, canonicalPath)) throw new NpmPublicationError("source-path-escape", "source file resolves outside the exact checkout");
  const gitPath = relative(root, path).split("\\").join("/");
  if (!inside(root, path)) throw new NpmPublicationError("source-path-escape", "source path escapes the exact checkout");
  const listed = await runCommand("git", sourceGitArguments(["-C", root, "ls-tree", "-z", sourceCommit, "--", gitPath], immutableGit),
    immutableGit ? await immutableSourceGitOptions() : await exactSourceGitOptions());
  const entry = /^(100644|100755) blob ([0-9a-f]{40})\t([^\0]+)\0$/u.exec(listed.stdout);
  if (entry === null || entry[3] !== gitPath) throw new NpmPublicationError("source-not-regular-tracked-file", "source must be one regular file at the exact commit");
  const expected = await runCommand("git", sourceGitArguments(["-C", root, "cat-file", "blob", entry[2]], immutableGit),
    immutableGit ? await immutableSourceGitOptions() : await exactSourceGitOptions());
  const bytes = await readFile(path);
  if (!bytes.equals(Buffer.from(expected.stdout, "utf8"))) throw new NpmPublicationError("source-content-drift", "source bytes differ from the exact commit");
  return bytes;
}

export async function readExactManifest(options) {
  const bytes = await readExactSourceFile(options);
  return { bytes, value: JSON.parse(bytes.toString("utf8")) };
}

/** Transform legacy source through actual received pnpm membership. The final
 * publicationManifest boundary remains strict; no caller version map is admitted. */
export async function preparePublishedManifest({ root, packageDirectory, sourceCommit, source, sourceMemberMode = "same-checkout" }) {
  validateSourceMemberMode(sourceMemberMode);
  const received = await readExactManifest({ root, sourceCommit, path: join(packageDirectory, "package.json"),
    immutableGit: sourceMemberMode === "pinned-gitlinks" });
  if (!Buffer.isBuffer(source?.bytes) || !source.bytes.equals(received.bytes) || !isDeepStrictEqual(source.value, received.value))
    throw new NpmPublicationError("source-content-drift", "source manifest input differs from its exact received bytes");
  const names = [...new Set(FIELDS.flatMap(field => Object.entries(source.value[field] ?? {})
    .filter(([, spec]) => spec === WORKSPACE_SPECIFICATION).map(([name]) => name)))].sort();
  const sources = [];
  if (names.length > 0) {
    let workspace;
    for (let at = packageDirectory; inside(root, at); at = dirname(at)) {
      try { await access(join(at, "pnpm-workspace.yaml")); workspace = at; break; } catch {}
      if (at === root) break;
    }
    if (workspace === undefined) throw new NpmPublicationError("workspace-source-missing", "workspace:* requires a pnpm workspace in the exact source checkout");
    const workspaceBytes = await readExactSourceFile({ root, sourceCommit, path: join(workspace, "pnpm-workspace.yaml"),
      immutableGit: sourceMemberMode === "pinned-gitlinks" });
    const listed = await runCommand("pnpm", ["list", "--recursive", "--depth", "-1", "--json"], {
      cwd: workspace, ...(sourceMemberMode === "pinned-gitlinks" ? await immutableSourceGitOptions() : {}),
    });
    const members = JSON.parse(listed.stdout);
    if (!Array.isArray(members)) throw new NpmPublicationError("workspace-source-malformed", "pnpm workspace listing must be an array");
    const observed = [];
    for (const member of members) {
      if (typeof member.path !== "string") throw new NpmPublicationError("workspace-source-malformed", "workspace member needs its actual path");
      const directory = await realpath(resolve(member.path));
      if (!inside(root, directory) || !inside(workspace, directory)) throw new NpmPublicationError("workspace-source-escape", "workspace member escapes the exact source checkout");
      const path = relative(root, directory).split("\\").join("/") || ".";
      if (sourceMemberMode === "same-checkout") {
        const reading = await readExactManifest({ root, sourceCommit, path: join(root, manifestPath(path)) });
        if (names.includes(reading.value.name)) observed.push({ name: reading.value.name, version: reading.value.version,
          source: { commit: sourceCommit, packagePath: path, manifestNi: sha256Ni(reading.bytes) } });
      } else {
        const context = await resolveWorkspaceMemberSource({ root, sourceCommit, memberDirectory: resolve(member.path) });
        const reading = await readExactManifest({ root: context.root, sourceCommit: context.commit,
          path: join(context.root, manifestPath(context.packagePath)), immutableGit: true });
        if (names.includes(reading.value.name)) {
          const evidence = { commit: context.commit, packagePath: context.packagePath, manifestNi: sha256Ni(reading.bytes) };
          if (context.gitlinks.length > 0) evidence.binding = {
            mode: "pinned-gitlinks", rootCommit: sourceCommit,
            workspaceFile: relative(root, join(workspace, "pnpm-workspace.yaml")).split("\\").join("/"),
            workspaceFileNi: sha256Ni(workspaceBytes), memberPath: context.memberPath,
            gitlinks: context.gitlinks,
          };
          observed.push({ name: reading.value.name, version: reading.value.version, source: evidence });
        }
      }
    }
    for (const name of names) {
      const matches = observed.filter(entry => entry.name === name);
      if (matches.length !== 1) throw new NpmPublicationError("workspace-source-ambiguous", `workspace dependency ${name} must have one exact source member`);
      sources.push(matches[0]);
    }
  }
  const projected = structuredClone(source.value);
  for (const field of FIELDS) for (const [name, specification] of Object.entries(projected[field] ?? {})) {
    if (specification !== WORKSPACE_SPECIFICATION) continue;
    const member = sources.find(entry => entry.name === name);
    if (!member || !isExactSemver(member.version))
      throw new NpmPublicationError("workspace-source-version", `received workspace member ${name} must carry an exact version`);
    projected[field][name] = member.version;
  }
  const manifest = publicationManifest(projected);
  const violations = dependencySpecificationViolations(manifest, { published: true });
  if (violations.length) throw new NpmPublicationError("published-dependency-contract", "projected publication dependencies must name exact versions", violations);
  return { manifest, bytes: Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`), sources };
}

/** The original isolated verifier accepts pending dependency tarballs by exact
 * name/version. Copy and measure real artifacts, and verify each packed identity
 * before using that installation-only route. The plan keeps these measurements. */
export async function readDependencyArtifacts(inputPath, root) {
  if (inputPath === undefined) return [];
  const input = JSON.parse(await readFile(inputPath, "utf8"));
  if (!Array.isArray(input)) throw new NpmPublicationError("dependency-artifacts-malformed", "dependency artifacts must be an array of package, version and artifact path records");
  const result = [], names = new Set();
  const directory = root;
  await mkdir(directory, { recursive: true });
  for (const [index, item] of input.entries()) {
    if (!item || typeof item.package !== "string" || typeof item.version !== "string" || typeof item.artifact !== "string" || names.has(item.package)) throw new NpmPublicationError("dependency-artifacts-malformed", "each dependency artifact needs a unique package, version and real artifact path");
    const original = resolve(dirname(inputPath), item.artifact);
    const before = await measureArtifact(original);
    const path = join(directory, `${index}.tgz`);
    await copyFile(original, path);
    const artifact = await measureArtifact(path);
    if (artifact.ni !== before.ni || artifact.integrity !== before.integrity) throw new NpmPublicationError("dependency-artifact-drift", "dependency artifact changed during admission");
    const packed = await runCommand("tar", ["-xOzf", path, "package/package.json"]);
    const manifest = JSON.parse(packed.stdout);
    if (manifest.name !== item.package || manifest.version !== item.version) throw new NpmPublicationError("dependency-artifact-identity", "dependency tarball does not match its declared package/version");
    const violations = dependencySpecificationViolations(manifest, { published: true });
    if (violations.length) throw new NpmPublicationError("dependency-artifact-contract", "dependency tarball does not carry an exact published contract", violations);
    names.add(item.package);
    result.push({ package: item.package, version: item.version, artifact, path });
  }
  return result;
}

export function installationManifest(published, artifacts) {
  const manifest = structuredClone(published), declared = new Set();
  for (const field of FIELDS) for (const [name, version] of Object.entries(manifest[field] ?? {})) {
    declared.add(name);
    const input = artifacts.find(entry => entry.package === name);
    if (input === undefined) continue;
    if (input.version !== version) throw new NpmPublicationError("dependency-artifact-version", `artifact for ${name} does not match the projected exact version`);
    manifest[field][name] = `file:${input.path}`;
  }
  // A name-only override could violate an unobserved transitive package's
  // exact contract. This bounded restoration admits direct inputs only.
  for (const input of artifacts) if (!declared.has(input.package)) {
    throw new NpmPublicationError("unverified-transitive-artifact", `artifact ${input.package}@${input.version} is not a direct exact dependency; transitive overrides require independent closure verification`);
  }
  return manifest;
}
