import { lstat, realpath } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { NpmPublicationError } from "./publication.mjs";
import { immutableSourceGitOptions, runCommand, sourceGitArguments } from "./runner.mjs";

const COMMIT = /^[0-9a-f]{40}$/u;
const inside = (root, path) => {
  const part = relative(root, path);
  return part === "" || (part !== ".." && !part.startsWith("../") && !part.startsWith("..\\") && !isAbsolute(part));
};
const posix = path => path.split("\\").join("/");
const failure = (code, message) => new NpmPublicationError(code, message);
const missingPath = error => error?.code === "ENOENT" || error?.code === "ENOTDIR";
const accessFailure = error => ["EACCES", "EPERM"].includes(error?.code)
  || /permission denied|access denied|operation not permitted|dubious ownership|unsafe repository/iu.test(String(error?.stderr ?? ""));

export function validateSourceMemberMode(mode) {
  if (mode !== "same-checkout" && mode !== "pinned-gitlinks") {
    throw failure("source-member-mode-invalid", "sourceMemberMode must be same-checkout or pinned-gitlinks");
  }
}

async function treeEntry(root, commit, path) {
  const listed = await runCommand("git", sourceGitArguments(["-C", root, "ls-tree", "-z", commit, "--", path], true), await immutableSourceGitOptions());
  const entry = /^([0-7]{6}) (blob|tree|commit) ([0-9a-f]{40})\t([^\0]+)\0$/u.exec(listed.stdout);
  if (entry === null || entry[4] !== path) {
    throw failure("source-not-regular-tracked-file", "member route must exist in its exact source tree");
  }
  return { mode: entry[1], type: entry[2], sha: entry[3] };
}

async function initializedChild(publicationRoot, childPath, expectedCommit) {
  let stats;
  try { stats = await lstat(childPath); }
  catch (error) {
    if (!missingPath(error)) throw error;
    throw failure("source-gitlink-uninitialized", "gitlink child is not initialized locally");
  }
  if (stats.isSymbolicLink() || !stats.isDirectory()) {
    throw failure("source-gitlink-root-mismatch", "gitlink child must be its actual local worktree directory");
  }
  const child = await realpath(childPath);
  if (!inside(publicationRoot, child)) throw failure("source-path-escape", "gitlink child escapes the publication root");
  if (child !== resolve(childPath)) throw failure("source-gitlink-root-mismatch", "gitlink child path is an alias");
  try { await lstat(join(child, ".git")); }
  catch (error) {
    if (!missingPath(error)) throw error;
    throw failure("source-gitlink-uninitialized", "gitlink child has no initialized local Git worktree");
  }
  const top = await runCommand("git", sourceGitArguments(["-C", child, "rev-parse", "--show-toplevel"], true), await immutableSourceGitOptions());
  if (await realpath(top.stdout.trim()) !== child) {
    throw failure("source-gitlink-root-mismatch", "gitlink child resolves to a different Git worktree root");
  }
  let actual;
  try {
    actual = (await runCommand("git", sourceGitArguments(["-C", child, "rev-parse", "--verify", "--quiet", "HEAD^{commit}"], true), await immutableSourceGitOptions())).stdout.trim();
  } catch (error) {
    if (accessFailure(error)) throw error;
    if (error?.code !== 1 || String(error?.stderr ?? "").trim() !== "") throw error;
    throw failure("source-gitlink-object-unavailable", "child HEAD commit is not locally available");
  }
  if (!COMMIT.test(actual)) throw failure("source-gitlink-object-unavailable", "child HEAD did not resolve to a full commit");
  if (actual !== expectedCommit) {
    throw failure("source-gitlink-commit-mismatch", "actual child commit differs from the exact parent gitlink");
  }
  try { await runCommand("git", sourceGitArguments(["-C", child, "cat-file", "-e", `${expectedCommit}^{tree}`], true), await immutableSourceGitOptions()); }
  catch (error) {
    if (accessFailure(error)) throw error;
    if (!/not a valid object|could not get object info|unable to read|bad object|invalid object|not a tree|missing/iu.test(String(error?.stderr ?? ""))) throw error;
    throw failure("source-gitlink-object-unavailable", "pinned child tree is not locally available");
  }
  return child;
}

/** Read-only path-directed context selection. No root/owner/version map, remote
 * lookup, initialization, checkout or fallback to an enclosing repository. */
export async function resolveWorkspaceMemberSource({ root, sourceCommit, memberDirectory }) {
  if (!COMMIT.test(sourceCommit)) throw failure("source-commit-invalid", "source reading requires an exact commit");
  const lexicalRoot = resolve(root), publicationRoot = await realpath(root);
  const top = await runCommand("git", sourceGitArguments(["-C", publicationRoot, "rev-parse", "--show-toplevel"], true), await immutableSourceGitOptions());
  if (await realpath(top.stdout.trim()) !== publicationRoot) {
    throw failure("source-root-mismatch", "publication root must be its actual Git worktree top level");
  }
  const member = resolve(memberDirectory);
  if (!inside(lexicalRoot, member)) throw failure("source-path-escape", "member path escapes the publication root");
  const memberPath = posix(relative(lexicalRoot, member)) || ".";
  const segments = memberPath === "." ? [] : memberPath.split("/");
  let ownerRoot = publicationRoot, commit = sourceCommit, local = [];
  const gitlinks = [];
  for (const segment of segments) {
    local.push(segment);
    const path = local.join("/");
    const entry = await treeEntry(ownerRoot, commit, path);
    if (entry.mode === "040000" && entry.type === "tree") continue;
    if (entry.mode !== "160000" || entry.type !== "commit") {
      throw failure("source-not-regular-tracked-file", "member directory route must consist of Git trees and exact gitlinks");
    }
    const child = await initializedChild(publicationRoot, resolve(ownerRoot, path), entry.sha);
    gitlinks.push({ parentCommit: commit, path, childCommit: entry.sha });
    ownerRoot = child;
    commit = entry.sha;
    local = [];
  }
  const directory = resolve(ownerRoot, ...local);
  const physicalDirectory = await realpath(directory);
  if (!inside(publicationRoot, physicalDirectory) || !inside(ownerRoot, physicalDirectory)) {
    throw failure("source-path-escape", "member directory escapes its source owner root");
  }
  return { root: ownerRoot, commit, packagePath: local.join("/") || ".", memberPath, gitlinks };
}
