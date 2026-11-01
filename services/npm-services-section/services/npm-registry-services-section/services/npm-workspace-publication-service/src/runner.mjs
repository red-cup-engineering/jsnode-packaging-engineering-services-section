import { execFile as nodeExecFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { CANONICAL_NPM_REGISTRY, NpmPublicationError, canonicalRegistry } from "./publication.mjs";

const defaultExec = promisify(nodeExecFile);

// Ask the installed Git for repository-local variable names only. This metadata
// command performs no repository/object read. Cache names, never caller values.
let localEnvironmentNames;
async function sourceEnvironment(environment) {
  localEnvironmentNames ??= runCommand("git", ["--no-replace-objects", "rev-parse", "--local-env-vars"], {
    env: { ...process.env, GIT_NO_LAZY_FETCH: "1", GIT_NO_REPLACE_OBJECTS: "1" },
  }).then(({ stdout }) => {
    const names = stdout.trim().split(/\r?\n/u);
    if (!names.length || names.some(name => !/^GIT_[A-Z0-9_]+$/u.test(name))) {
      throw new NpmPublicationError("source-git-environment-invalid", "Git did not report repository-local environment names");
    }
    return names;
  });
  const env = { ...environment };
  for (const name of await localEnvironmentNames) delete env[name];
  return env;
}

/** An exact supplied commit means original objects in the selected repository,
 * not replacement refs or inherited repository/object environment selectors. */
export async function exactSourceGitOptions(environment = process.env) {
  return { env: { ...await sourceEnvironment(environment), GIT_NO_REPLACE_OBJECTS: "1" } };
}

/** Opt-in exact-source reads: never lazy-fetch or interpret replacement refs or
 * pathspec magic. Copy per command; do not mutate the caller process/config. */
export async function immutableSourceGitOptions(environment = process.env) {
  const env = { ...await sourceEnvironment(environment),
    GIT_NO_LAZY_FETCH: "1", GIT_NO_REPLACE_OBJECTS: "1", GIT_LITERAL_PATHSPECS: "1" };
  delete env.GIT_GLOB_PATHSPECS;
  delete env.GIT_NOGLOB_PATHSPECS;
  delete env.GIT_ICASE_PATHSPECS;
  return { env };
}

/** Explicit switches also make unsupported Git runtimes fail before reading
 * objects, instead of silently ignoring an unfamiliar environment variable. */
export function sourceGitArguments(args, immutableGit = false) {
  return immutableGit ? ["--no-lazy-fetch", "--no-replace-objects", "--literal-pathspecs", ...args]
    : ["--no-replace-objects", ...args];
}

function commandError(error) {
  return [error?.stderr, error?.stdout, error?.message]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .join(" | ")
    .slice(-8000);
}

export async function runCommand(command, args, options = {}, execFileImpl = defaultExec) {
  return execFileImpl(command, args, {
    maxBuffer: 32 * 1024 * 1024,
    ...options,
  });
}

export async function resolveCommit(repository, commit, execFileImpl = defaultExec, { immutableGit = false } = {}) {
  const result = await runCommand(
    "git",
    sourceGitArguments(["-C", repository, "rev-parse", `${commit}^{commit}`], immutableGit),
    immutableGit ? await immutableSourceGitOptions() : await exactSourceGitOptions(),
    execFileImpl,
  );
  return result.stdout.trim();
}

export async function withExactWorktree({
  repository,
  commit,
  work,
  execFileImpl = defaultExec,
  immutableGit = false,
} = {}) {
  const resolved = await resolveCommit(repository, commit, execFileImpl, { immutableGit });
  const root = await mkdtemp(join(tmpdir(), "npm-publication-worktree-"));
  try {
    await runCommand(
      "git",
      sourceGitArguments(["-C", repository, "worktree", "add", "--detach", "--force", root, resolved], immutableGit),
      immutableGit ? await immutableSourceGitOptions() : await exactSourceGitOptions(),
      execFileImpl,
    );
    return await work({ root, commit: resolved });
  } finally {
    try {
      await runCommand(
        "git",
        sourceGitArguments(["-C", repository, "worktree", "remove", "--force", root], immutableGit),
        immutableGit ? await immutableSourceGitOptions() : await exactSourceGitOptions(),
        execFileImpl,
      );
    } catch {
      await rm(root, { recursive: true, force: true });
    }
  }
}

export async function readRegistryVersion({
  name,
  version,
  registry = CANONICAL_NPM_REGISTRY,
  execFileImpl = defaultExec,
} = {}) {
  const admittedRegistry = canonicalRegistry(registry);
  try {
    const result = await runCommand(
      "npm",
      [
        "view",
        `${name}@${version}`,
        "--json",
        "--fetch-retries=0",
        "--fetch-timeout=5000",
        "--registry",
        admittedRegistry,
      ],
      {},
      execFileImpl,
    );
    const manifest = JSON.parse(result.stdout);
    return Object.freeze({ found: true, reachable: true, manifest });
  } catch (error) {
    const evidence = commandError(error);
    if (/E404|404 Not Found/u.test(evidence)) {
      return Object.freeze({ found: false, reachable: true, manifest: null });
    }
    if (/E401|E403|authorization|required authentication|forbidden/iu.test(evidence)) {
      throw new NpmPublicationError("registry-authorization", "canonical registry refused the configured npm identity");
    }
    throw new NpmPublicationError("registry-unreachable", "canonical registry read failed");
  }
}

export async function readManifest(path) {
  const bytes = await readFile(path);
  return Object.freeze({ bytes, value: JSON.parse(bytes.toString("utf8")) });
}
