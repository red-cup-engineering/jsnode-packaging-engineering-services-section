/** One native npm pack result: npm 11's array or npm 12's name-keyed map.
 * Neither output format is an archive index or independent artifact receipt.
 */
export function npmPackResult(stdout, { name, version }) {
  const document = JSON.parse(stdout);
  const entries = Array.isArray(document) ? document
    : document !== null && typeof document === "object"
      && Object.keys(document).length === 1 && Object.hasOwn(document, name)
      ? [document[name]] : [];
  const record = entries[0];
  if (entries.length !== 1 || record?.name !== name || record?.version !== version
    || typeof record.filename !== "string" || !record.filename.endsWith(".tgz")
    || record.filename.includes("/") || record.filename.includes("\\")
    || !/^sha512-[A-Za-z0-9+/]+=*$/u.test(record.integrity ?? "")) {
    throw new TypeError(`npm pack did not identify one exact artifact: ${name}@${version}`);
  }
  return record;
}
