import { isAbsolute, relative, resolve, sep } from "node:path";

const EXCLUDED = new Set(["node_modules", ".git", "dist", "package-lock.json", ".npmrc"]);
const GENERATED_DIRECTORIES = new Set([".cache", ".codex", ".claude", ".local", ".state"]);
const GENERATED_DATA = new Set(["logs", "state", "cache", "caches", "tmp", "temp"]);

export function verificationCopyFilter() {
  throw new TypeError("unrooted verification copying is forbidden; use verificationSourceFilter(sourceRoot)");
}

/** A source copy never recursively includes previous runs or live service data.
 * Anchor at this source, rather than its ancestors: the source itself may have
 * been received below an older operation's data/logs directory. */
export function verificationSourceFilter(sourceRoot) {
  const root = resolve(sourceRoot);
  return (path) => {
    const child = relative(root, resolve(path));
    if (isAbsolute(child) || child === ".." || child.startsWith(`..${sep}`)) return false;
    if (child === "") return true;
    const parts = child.split(sep);
    return parts.every((part, index) => !EXCLUDED.has(part)
      && !GENERATED_DIRECTORIES.has(part)
      && !(index > 0 && parts[index - 1] === "data" && GENERATED_DATA.has(part)));
  };
}
