import { createHash } from "node:crypto";
import { planLandedPackageRelease } from "./release-wave.mjs";
const hash = text => createHash("sha256").update(text).digest("hex");
function repositoryValue(value) {
  const text = value => typeof value === "string" && value.length > 0 && Buffer.byteLength(value) <= 4096 && !/[\x00-\x1f\x7f]/u.test(value);
  if (text(value)) return structuredClone(value);
  if (!value || Object.getPrototypeOf(value) !== Object.prototype
    || Object.keys(value).some(key => !["type", "url", "directory"].includes(key))
    || !text(value.type) || !text(value.url) || value.directory !== undefined && !text(value.directory))
    throw new TypeError("repositoryFallback requires a finite npm repository value");
  return structuredClone(value);
}
/** A deterministic carrier producer, distinct from unchanged original Git bytes.
 * The original caller acquires occupied versions; source alone declares the version.
 */
export function preparePublicationCarrierManifest({ repository, commit, manifestText, published, repositoryFallback }) {
  if (typeof repository !== "string" || !repository || Buffer.byteLength(repository) > 4096
    || !/^[a-f0-9]{40}$/u.test(commit) || typeof manifestText !== "string" || Buffer.byteLength(manifestText) > 1024 * 1024)
    throw new TypeError("exact bounded original source coordinates and manifest required");
  const original = JSON.parse(manifestText);
  if (!original || Object.getPrototypeOf(original) !== Object.prototype || typeof original.name !== "string" || !original.name)
    throw new TypeError("original npm package manifest required");
  const selection = planLandedPackageRelease({ declared: original.version, published });
  const fallback = repositoryFallback === undefined ? undefined : repositoryValue(repositoryFallback);
  const applied = !Object.hasOwn(original, "repository") && fallback !== undefined;
  const prepared = { ...original, ...(applied ? { repository: fallback } : {}), version: selection.version };
  const preparedManifestText = `${JSON.stringify(prepared, null, 2)}\n`;
  return {
    kind: "npm.publication-carrier.manifest-projection", version: 1,
    source: { repository, commit, manifestSHA256: hash(manifestText) },
    allocation: { declared: original.version, published: [...published] },
    selection, repositoryFallback: fallback === undefined ? null : { value: fallback, applied },
    preparedManifestText, preparedManifestSHA256: hash(preparedManifestText),
    publisher: { gitHead: commit, format: "json-2-newline" },
  };
}
