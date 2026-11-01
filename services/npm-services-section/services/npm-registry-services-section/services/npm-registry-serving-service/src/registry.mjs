import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { getHeapStatistics } from "node:v8";
import { gunzipSync } from "node:zlib";
import { isDeepStrictEqual } from "node:util";
import semver from "semver";
import { createCredentials } from "./credentials.mjs";
import { DEPRECATION, DIST_TAG, PUBLICATION, README, packageEntity, versionEntity } from "./facts.mjs";
import { distTags, foldPackage, installManifest, renderAbbreviated, renderFull, renderStoreLayout, renderVersion, searchEntry, selectVersion } from "./projection.mjs";
import { checkPublication, DEFAULT_HOUSE_SCOPES } from "./publish-gate.mjs";
import { receiveHeld } from "./reception.mjs";
import { createPackageStore } from "./store.mjs";
import { readTarball } from "./tarball-reader.mjs";

/**
 * The 561 Group's npm registry as a request handler: the npm registry protocol (packuments, tarballs, publish,
 * dist-tags, deprecation, search, login, whoami, ping, audit) as npm and pnpm speak it.
 *
 * - A house name (one of `privateScopes`, or listed in `privateNames`) is held only here and never fetched from the
 *   uplink. What the registry knows about it is its facts (facts.mjs): an append-only journal per package and its
 *   tarballs by NI address (store.mjs). Every document served for it is a projection of those facts
 *   (projection.mjs), cached until the journal changes, with a strong ETag: a client revalidating with If-None-Match
 *   or If-Modified-Since is answered 304 until something happens to the package.
 * - Any other name is the uplink's (registry.npmjs.org). Its metadata can always be fetched again, so it is never
 *   written to storage: it is held in memory, at most `publicMetadataBytes` of it (least recently used first out),
 *   fresh for `uplinkMaxAgeMs` and answered stale only while the uplink fails, for at most `uplinkStaleMs`. A
 *   packument request is fetched in the representation it accepts (npm's abbreviated install metadata is a
 *   fraction of the full document); a request any representation answers (a version, its dist-tags, a tarball)
 *   takes what is held or already being fetched, so overlapping requests for one name share one fetch. A public
 *   tarball is fetched from the uplink, checked against its shasum, and kept only if `cachePublicTarballs`.
 * - Changing anything takes a publisher (credentials.mjs): Basic against htpasswd, or a Bearer token `npm login`
 *   obtained. A version, once published, is never replaced: its tarball, integrity and manifest are fixed. Only
 *   facts about versions are added: deprecations (`npm deprecate` is a GET then a PUT of the whole packument, with
 *   no attachments) and dist-tags (set and removed at /-/package/<name>/dist-tags/<tag>).
 * - A new version is read before it is stored, statically (see publish-gate.mjs): its tarball is opened in memory and
 *   nothing in it runs. A version whose `exports` or `bin` name files it does not ship, or whose modules import a
 *   house package it does not declare, at a version or subpath the registry cannot resolve, is refused with a 400
 *   listing every problem. `houseScopes` names the scopes whose imports are checked.
 * - `npm audit` is forwarded to the uplink with house names taken out: the uplink has no advisories for them, and
 *   the house's dependency inventory is not the uplink's to read.
 *
 * Every tarball URL is answered on `origin`, so clients only ever fetch from this registry.
 */
/** True when the V8 heap is within a fifth of its limit: the process is about to abort, so work that grows it waits. */
export function heapNearLimit() {
  const { used_heap_size: used, heap_size_limit: limit } = getHeapStatistics();
  return used > limit * 0.8;
}

export function createNpmRegistry({
  storage, htpasswd, tokens = htpasswd === undefined ? undefined : join(dirname(htpasswd), "tokens.jsonl"),
  origin, privateScopes = [], privateNames = [],
  uplink = "https://registry.npmjs.org", uplinkMaxAgeMs = 10 * 60_000, uplinkStaleMs = 86_400_000,
  publicMetadataBytes = 32 * 1024 * 1024, houseMetadataBytes = 32 * 1024 * 1024, cachePublicTarballs = false,
  houseScopes = [...new Set([...DEFAULT_HOUSE_SCOPES, ...privateScopes])], publishGate = true,
  maxPublishBytes = 64 * 1024 * 1024, maxUplinkTarballBytes = 64 * 1024 * 1024, heapPressure = heapNearLimit,
  fetch: fetchImpl = fetch, now = () => new Date(),
}) {
  if (typeof storage !== "string" || !storage) throw new TypeError("the registry needs its package storage directory");
  if (typeof origin !== "string" || !/^https?:\/\/[^/]+$/u.test(origin)) throw new TypeError("the registry's origin is a scheme and host, with no path");
  const upstream = uplink.replace(/\/+$/u, "");
  const store = createPackageStore({ storage });
  const credentials = createCredentials({ htpasswd, tokens, now });
  const isPrivate = (name) => privateNames.includes(name) || privateScopes.some((scope) => name.startsWith(`${scope}/`));
  // Every metadata route names the same bounded package path. Keep the
  // existing no-dot-segment/no-leading-dash admission, including on tag URLs.
  const admittedName = (name) => typeof name === "string" && name !== "" && !name.startsWith("-")
    && !name.includes("..") && !/[\\\u0000-\u001f\u007f]/u.test(name)
    && (name.startsWith("@") ? /^@[^/]+\/[^/]+$/u.test(name) : !name.includes("/"));
  const houseName = (name) => {
    if (!admittedName(name)) throw new TypeError("metadata requires one bounded package name");
    return name;
  };

  const record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
  const json = (value, status = 200, headers = {}) => Response.json(value, { status, headers });
  const refusal = (status, error) => json({ error }, status);
  const etagOf = (body) => `"${createHash("sha256").update(body).digest("base64url").slice(0, 32)}"`;
  const revisionOf = (read) => `${read.rows.length}-${read.digest.slice(0, 32)}`;

  /** A least-recently-used map bounded by the bytes its entries weigh. */
  function boundedMap(limit) {
    const entries = new Map(); // key -> {value, bytes}
    let held = 0;
    const forget = (key) => { const entry = entries.get(key); if (entry) { held -= entry.bytes; entries.delete(key); } };
    return {
      get(key) { const entry = entries.get(key); if (!entry) return undefined; entries.delete(key); entries.set(key, entry); return entry.value; },
      set(key, value, bytes) {
        forget(key); entries.set(key, { value, bytes }); held += bytes;
        for (const other of entries.keys()) { if (held <= limit) break; if (other !== key) forget(other); }
      },
      weigh(key, bytes) { const entry = entries.get(key); if (entry) { entry.bytes += bytes; held += bytes; } },
      forget,
    };
  }

  // House packages: their facts folded once per journal state, and each representation rendered once from that.
  const houseViews = boundedMap(houseMetadataBytes);
  async function houseView(name) {
    const source = await store.sourceOf(houseName(name));
    if (source === undefined) { houseViews.forget(name); return undefined; }
    const held = houseViews.get(name);
    if (held?.key === source.key) return held;
    const read = await store.read(name);
    if (read === undefined) return undefined;
    const view = { key: read.key, kind: read.kind, state: foldPackage(name, read.rows), revision: revisionOf(read), rendered: {} };
    houseViews.set(name, view, read.rows.length * 512);
    return view;
  }
  /** A view's representation as served bytes with their ETag, rendered on first use. */
  function rendered(name, view, kind, render) {
    if (view.rendered[kind] === undefined) {
      const body = JSON.stringify(render());
      view.rendered[kind] = { body, etag: etagOf(body) };
      houseViews.weigh(name, body.length);
    }
    return view.rendered[kind];
  }

  const installType = "application/vnd.npm.install-v1+json";
  function wantsAbbreviated(accept = "") {
    // Quoted media parameters are outside these parameterless representations.
    // Keep the full-document fallback rather than split a quoted comma into a
    // false install-v1 range.
    if (accept.includes('"')) return false;
    const ranges = accept.toLowerCase().split(",").map(entry => {
      const [type, ...parameters] = entry.trim().split(";").map(value => value.trim());
      // Both offered media types are parameterless. A range requiring another
      // parameter does not match either representation (RFC 9110, 12.5.1).
      if (parameters.some(value => value && !/^q\s*=/u.test(value))) return null;
      const q = parameters.find(value => /^q\s*=/u.test(value));
      const weight = q === undefined ? "1" : q.slice(q.indexOf("=") + 1).trim();
      const quality = /^(?:0(?:\.[0-9]{0,3})?|1(?:\.0{0,3})?)$/u.test(weight) ? Number(weight) : 0;
      return { type, quality };
    }).filter(Boolean);
    // Wildcards alone preserve the historical full-document default. For each
    // representation a specific media range takes precedence over a wildcard.
    if (!ranges.some(range => range.type === installType)) return false;
    const qualityOf = type => {
      let specificity = -1, quality = 0;
      for (const range of ranges) {
        const rank = range.type === type ? 2 : range.type === "application/*" ? 1 : range.type === "*/*" ? 0 : -1;
        if (rank > specificity) { specificity = rank; quality = range.quality; }
        else if (rank >= 0 && rank === specificity) quality = Math.max(quality, range.quality);
      }
      return quality;
    };
    const quality = qualityOf(installType);
    return quality > 0 && quality >= qualityOf("application/json");
  }

  /** Whether the client already holds this representation (RFC 9110 13.1.2, 13.1.3): If-None-Match decides when
   *  sent, else If-Modified-Since. That date has whole seconds and the package's modified time has milliseconds;
   *  they are compared exactly, so a change later in the same second is never answered 304. */
  function unchangedFor(request, etag, modified) {
    const match = request.headers.get("if-none-match");
    if (match !== null) {
      const opaque = (tag) => tag.trim().replace(/^W\//u, "");
      return match.trim() === "*" || match.split(",").map(opaque).includes(opaque(etag));
    }
    const since = Date.parse(request.headers.get("if-modified-since") ?? "");
    const at = Date.parse(modified ?? "");
    return !Number.isNaN(since) && !Number.isNaN(at) && at <= since;
  }
  /** A representation, or 304 to a client that holds it. */
  function representation(request, { body, etag }, { type, modified, cacheControl, vary }) {
    const headers = { "content-type": type, etag, "cache-control": cacheControl, ...(vary ? { vary } : {}), ...(Number.isNaN(Date.parse(modified ?? "")) ? {} : { "last-modified": new Date(modified).toUTCString() }) };
    if (unchangedFor(request, etag, modified)) { const { "content-type": _type, ...validators } = headers; return new Response(null, { status: 304, headers: validators }); }
    return new Response(request.method === "HEAD" ? null : body, { headers });
  }

  const tarballName = (url) => decodeURIComponent(new URL(url).pathname.split("/").pop());
  // Public packuments: as the uplink wrote them, with every tarball on this origin.
  function presentedManifest(name, version, manifest) {
    const file = manifest.dist?.tarball ? tarballName(manifest.dist.tarball) : `${name.split("/").pop()}-${version}.tgz`;
    return { ...manifest, dist: { ...manifest.dist, tarball: `${origin}/${name}/-/${file}` } };
  }
  function presented(name, packument) {
    const { _uplinks, _distfiles, _attachments, _rev, ...shown } = packument;
    const versions = {};
    for (const [version, manifest] of Object.entries(packument.versions ?? {})) versions[version] = presentedManifest(name, version, manifest);
    return { ...shown, versions };
  }
  function abbreviated(name, packument) {
    const versions = {};
    for (const [version, manifest] of Object.entries(packument.versions ?? {})) versions[version] = presentedManifest(name, version, installManifest(manifest));
    return { name: packument.name, modified: packument.time?.modified ?? packument.modified, "dist-tags": packument["dist-tags"], versions };
  }
  // A held public document's representations, rendered once per document the uplink sent.
  const publicRendered = new WeakMap();
  function publicRepresentation(name, packument, install) {
    const kinds = publicRendered.get(packument) ?? {};
    publicRendered.set(packument, kinds);
    const kind = install ? "abbreviated" : "full";
    if (kinds[kind] === undefined) { const body = JSON.stringify(install ? abbreviated(name, packument) : presented(name, packument)); kinds[kind] = { body, etag: etagOf(body) }; }
    return kinds[kind];
  }

  async function uplinkPackument(name, full) {
    const response = await fetchImpl(`${upstream}/${name.replace("/", "%2f")}`, { headers: { accept: full ? "application/json" : installType } });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`uplink answered ${response.status} for ${name}`);
    const text = await response.text();
    return { packument: JSON.parse(text), bytes: Buffer.byteLength(text, "utf8") };
  }

  const publicMetadata = boundedMap(publicMetadataBytes); // name -> {at, full, packument}
  const serves = (held, full) => held.full || !full;
  const inflightPackuments = new Map(); // name -> {full, promise}
  /** A public name's packument: from memory or the uplink. `full` asks for the full document; otherwise the
   *  abbreviated install metadata serves. */
  function publicPackument(name, { full = true } = {}) {
    const held = publicMetadata.get(name), at = now().getTime();
    if (held && serves(held, full) && at - held.at < uplinkMaxAgeMs) return Promise.resolve(held.packument);
    const running = inflightPackuments.get(name);
    if (running && serves(running, full)) return running.promise;
    const promise = (async () => {
      try {
        const fetched = await uplinkPackument(name, full);
        if (fetched === null) { publicMetadata.forget(name); return null; }
        publicMetadata.set(name, { at: now().getTime(), full, packument: fetched.packument }, fetched.bytes);
        return fetched.packument;
      } catch (error) {
        const stale = publicMetadata.get(name);
        if (stale && serves(stale, full) && now().getTime() - stale.at < uplinkStaleMs) return stale.packument;
        throw error;
      }
    })();
    const fetching = { full, promise };
    inflightPackuments.set(name, fetching);
    const settled = () => { if (inflightPackuments.get(name) === fetching) inflightPackuments.delete(name); };
    promise.then(settled, settled);
    return promise;
  }
  /** A package's full packument as a document: a house package's projection, or the uplink's. */
  async function fullPackument(name) {
    if (!isPrivate(name)) return publicPackument(name, { full: true });
    const view = await houseView(name);
    return view === undefined ? undefined : renderFull(view.state, { origin, revision: view.revision });
  }

  const immutable = "public, max-age=31536000, immutable";
  /** A public tarball: from the uplink, checked against its shasum. */
  async function uplinkTarball(name, file) {
    const path = join(storage, name, file);
    const cached = await store.readLeaf(name, file).catch(() => undefined);
    if (cached !== undefined) return cached;
    const packument = await publicPackument(name, { full: false });
    let source = null;
    for (const manifest of Object.values(packument?.versions ?? {})) if (manifest.dist?.tarball && tarballName(manifest.dist.tarball) === file) source = { url: manifest.dist.tarball, sha: manifest.dist.shasum };
    if (!source) return null;
    const response = await fetchImpl(source.url);
    if (!response.ok) throw new Error(`uplink answered ${response.status} for ${file}`);
    if (Number(response.headers.get("content-length")) > maxUplinkTarballBytes) throw new Error(`${file} from the uplink is larger than the ${maxUplinkTarballBytes} bytes this registry holds in memory`);
    if (heapPressure()) throw new Error("the registry is short of memory; retry");
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > maxUplinkTarballBytes) throw new Error(`${file} from the uplink is larger than the ${maxUplinkTarballBytes} bytes this registry holds in memory`);
    if (source.sha && createHash("sha1").update(bytes).digest("hex") !== source.sha) throw new Error(`${file} from the uplink does not match its shasum`);
    if (cachePublicTarballs) await store.writeAtomic(path, bytes);
    return bytes;
  }
  /** A tarball response: a house version's bytes streamed from the store with their length, or a public one's. */
  async function tarballResponse(request, name, file) {
    if (!isPrivate(name)) {
      const bytes = await uplinkTarball(name, file);
      return bytes ? new Response(request.method === "HEAD" ? null : bytes, { headers: { "content-type": "application/octet-stream", "content-length": String(bytes.length), "cache-control": immutable } }) : undefined;
    }
    const view = await houseView(name);
    if (view === undefined) return undefined;
    const entry = [...view.state.versions.values()].find((candidate) => candidate.artifact?.file === file);
    if (entry === undefined) return undefined;
    const located = await store.artifactPath(name, entry.artifact);
    if (located === undefined) return undefined;
    const etag = `"${entry.manifest.dist?.shasum ?? entry.artifact.ni ?? file}"`;
    const headers = { "content-type": "application/octet-stream", "content-length": String(located.size), "cache-control": immutable, etag };
    if (unchangedFor(request, etag, undefined)) return new Response(null, { status: 304, headers: { etag, "cache-control": immutable } });
    return new Response(request.method === "HEAD" ? null : Readable.toWeb(createReadStream(located.path)), { headers });
  }

  const versionIdentity = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u;
  const measured = (algorithm, bytes, encoding) => createHash(algorithm).update(bytes).digest(encoding);

  /** A package.json `repository` (any npm form: a URL, {url}, github:owner/name, owner/name) as owner/name, or null. */
  function repositoryOf(reference) {
    const value = typeof reference === "string" ? reference : reference?.url;
    if (typeof value !== "string") return null;
    const match = /^(?:git\+)?(?:(?:https?|ssh|git):\/\/(?:[^@/]+@)?github\.com[/:]|git@github\.com:|github:)?([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/u.exec(value.trim());
    return match ? `${match[1]}/${match[2]}` : null;
  }

  // npm's publish wire format names scoped attachments with the full package
  // name; the store's leaf uses a filename. Normalize that representation once
  // here, before any write, and bind every manifest to it.
  function admittedPublication(name, body, state) {
    if (body?.name !== name || !record(body.versions) || Object.keys(body.versions).length === 0 || !record(body._attachments)) throw new TypeError("a publish names its package, versions, and attached artifacts");
    if (body["dist-tags"] !== undefined && !record(body["dist-tags"])) throw new TypeError("dist-tags must map tags to published versions");
    const artifacts = new Map(), manifests = new Map(), used = new Set();
    for (const [version, manifest] of Object.entries(body.versions)) {
      if (!versionIdentity.test(version) || !record(manifest) || manifest.name !== name || manifest.version !== version || !record(manifest.dist)) throw new TypeError("each version manifest must carry its exact package and version identity");
      // Section, package and repository are one unit: a house package names the repository that is its source.
      if (!repositoryOf(manifest.repository)) throw new TypeError(`${name}@${version} must declare its repository: package.json "repository": {"type": "git", "url": "https://github.com/<organization>/<repository>.git"}`);
      const file = `${name.split("/").pop()}-${version}.tgz`;
      let advertised;
      try { advertised = tarballName(manifest.dist.tarball); }
      catch { throw new TypeError("each version must name its attached tarball"); }
      if (advertised !== file) throw new TypeError("version tarball path does not identify its canonical artifact");
      const keys = [...new Set([file, `${name}-${version}.tgz`])].filter(key => Object.hasOwn(body._attachments, key));
      if (keys.length !== 1) throw new TypeError("each version must identify exactly one attached artifact");
      const key = keys[0], attachment = body._attachments[key];
      if (!record(attachment) || typeof attachment.data !== "string" || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(attachment.data)) throw new TypeError("artifact data must be canonical base64");
      const bytes = Buffer.from(attachment.data, "base64");
      if (bytes.toString("base64") !== attachment.data) throw new TypeError("artifact data must be canonical base64");
      if (!Number.isSafeInteger(attachment.length) || attachment.length !== bytes.length) throw new TypeError("artifact length does not match its bytes");
      const shasum = measured("sha1", bytes, "hex"), integrity = `sha512-${measured("sha512", bytes, "base64")}`;
      if (manifest.dist.shasum !== undefined && manifest.dist.shasum !== shasum) throw new TypeError("artifact shasum does not match its bytes");
      if (manifest.dist.integrity !== undefined && manifest.dist.integrity !== integrity) throw new TypeError("artifact integrity does not match its bytes");
      if (manifest.dist.shasum === undefined && manifest.dist.integrity === undefined) throw new TypeError("artifact needs a declared integrity measurement");
      used.add(key); artifacts.set(file, bytes);
      const { tarball, ...dist } = manifest.dist;
      manifests.set(version, { ...manifest, dist: { ...dist, shasum, integrity } });
    }
    if (Object.keys(body._attachments).some(key => !used.has(key))) throw new TypeError("publication contains an artifact not bound to a version");
    for (const [tag, version] of Object.entries(body["dist-tags"] ?? {})) {
      if (!tag || tag.includes("/") || typeof version !== "string" || (!manifests.has(version) && !state.versions.has(version))) throw new TypeError("dist-tag must identify a published version");
    }
    return { artifacts, manifests };
  }

  /** The publish gate over every version of an admitted publication: a 400 naming every violation, or undefined. */
  async function gate(name, admitted) {
    const problems = [];
    for (const [version] of admitted.manifests) {
      const bytes = admitted.artifacts.get(`${name.split("/").pop()}-${version}.tgz`);
      const violations = await checkPublication({ name, version, bytes, houseScopes, publishedPackument: fullPackument });
      for (const { kind, message } of violations) problems.push({ version, kind, message });
    }
    if (problems.length === 0) return undefined;
    const lines = problems.map(({ version, kind, message }) => `  - [${kind}] ${name}@${version}: ${message}`);
    return Response.json({
      error: `${name} was not published: the publish gate found ${problems.length} problem${problems.length === 1 ? "" : "s"} in what it ships (nothing was run; the tarball was only read):\n${lines.join("\n")}`,
      violations: problems,
    }, { status: 400 });
  }

  /** The readme a tarball ships at its root (README, README.md, …), as npm's registry takes it; or undefined. */
  function shippedReadme(bytes) {
    try {
      for (const [path, content] of readTarball(bytes)) {
        if (/^readme(?:\.(?:md|markdown|mkd|txt|rst))?$/iu.test(path) && content.length <= 1024 * 1024) return content.toString("utf8");
      }
    } catch { /* the gate reports what is wrong with the tarball; a readme is not read from it */ }
    return undefined;
  }

  /** Under the package's lock: its facts as they stand, received first if the earlier layout still holds them. */
  async function heldFacts(name) {
    let read = await store.read(name);
    if (read?.kind === "layout") {
      const outcome = await receiveHeld(store, name, { origin, now });
      if (outcome.status === "refused") {
        throw Object.assign(new Error(`${name} is stored in the earlier layout in a form its facts would not serve the same (${outcome.disagreements.join(", ")}); nothing was changed`), { code: "UNRECEIVED" });
      }
      read = await store.read(name);
    }
    return read;
  }
  /** Append facts to a package under its lock and rewrite its earlier-layout projection to match. */
  async function appendFacts(name, rows) {
    await store.append(name, rows);
    const read = await store.read(name);
    await store.materialize(name, renderStoreLayout(foldPackage(name, read.rows), { origin, revision: revisionOf(read) }));
  }
  const unreceived = (error) => {
    if (error.code === "UNRECEIVED") return refusal(500, error.message);
    throw error;
  };

  /** A packument PUT with no attachments: `npm deprecate`. Everything about a published version is fixed but `deprecated`. */
  async function updateMetadata(name, body) {
    return store.lock(name, async () => {
      const read = await heldFacts(name);
      if (read === undefined) return refusal(400, `${name} is not published; a package is first published with its tarball`);
      const state = foldPackage(name, read.rows);
      const published = [...state.versions.keys()], offered = Object.keys(body.versions);
      const unattached = offered.filter(version => !state.versions.has(version));
      if (unattached.length > 0) return refusal(400, `${name}@${unattached.join(", ")} would be new, and a new version is published with its attached tarball`);
      const removed = published.filter(version => !offered.includes(version));
      if (removed.length > 0) return refusal(409, `${name}@${removed.join(", ")} is published; a version is never removed`);
      const full = renderFull(state, { origin });
      if (body["dist-tags"] !== undefined && !isDeepStrictEqual(body["dist-tags"], full["dist-tags"])) {
        return refusal(409, "dist-tags are changed at /-/package/<name>/dist-tags/<tag>, not through the packument");
      }
      if (body.maintainers !== undefined && !isDeepStrictEqual(body.maintainers, full.maintainers ?? [])) {
        return refusal(409, `${name}'s maintainers are its publishers of record; they are not changed here`);
      }
      const rows = [], at = now().toISOString();
      for (const version of published) {
        if (!record(body.versions[version])) return refusal(400, `${name}@${version} must be a manifest`);
        const { deprecated: was, ...fixed } = renderVersion(state, version, { origin });
        const { deprecated: offeredMessage, ...offeredManifest } = body.versions[version];
        if (offeredMessage !== undefined && typeof offeredMessage !== "string") return refusal(400, `${name}@${version}: deprecated is a message`);
        const changed = [...new Set([...Object.keys(fixed), ...Object.keys(offeredManifest)])].filter(key => !isDeepStrictEqual(fixed[key], offeredManifest[key]));
        if (changed.length > 0) return refusal(409, `${name}@${version} is already published; a version is never replaced, and only its "deprecated" message may change here (differs in: ${changed.join(", ")})`);
        if ((offeredMessage || undefined) !== (was || undefined)) rows.push({ e: versionEntity(name, version), a: DEPRECATION, v: offeredMessage || null, t: at });
      }
      if (rows.length > 0) await appendFacts(name, rows);
      return json({ ok: "updated", success: true });
    }).catch(unreceived);
  }

  async function publish(name, body, user) {
    if (record(body) && body.name === name && record(body.versions) && (body._attachments === undefined || (record(body._attachments) && Object.keys(body._attachments).length === 0))) {
      return updateMetadata(name, body);
    }
    return store.lock(name, async () => {
      const read = await heldFacts(name);
      const state = read === undefined ? foldPackage(name, []) : foldPackage(name, read.rows);
      if (record(body?.versions)) for (const version of Object.keys(body.versions)) {
        if (state.versions.has(version)) return refusal(409, `${name}@${version} is already published; a version is never replaced`);
      }
      let admitted;
      try { admitted = admittedPublication(name, body, state); }
      catch (error) { if (error instanceof TypeError) return refusal(400, error.message); throw error; }
      const refused = publishGate ? await gate(name, admitted) : undefined;
      if (refused) return refused;
      // Validate the complete transaction against occupied artifact names before
      // writing anything. A later interrupted write may leave unadvertised bytes,
      // but never alters a prior artifact or advertises an incomplete one.
      for (const [file, bytes] of admitted.artifacts) {
        const existing = await store.readLeaf(name, file);
        if (existing !== undefined && !existing.equals(bytes)) return refusal(409, `${file} already has different bytes`);
      }
      const placed = new Map();
      try {
        for (const [file, bytes] of admitted.artifacts) {
          const ni = await store.storeBlob(bytes);
          await store.placeLeaf(name, file, ni, bytes);
          placed.set(file, { ni, size: bytes.length });
        }
      } catch (error) { if (error.code === "ARTIFACT_CONFLICT") return refusal(409, error.message); throw error; }
      const at = now().toISOString(), rows = [];
      let readme = typeof body.readme === "string" && body.readme !== "" ? body.readme : undefined;
      for (const [version, { deprecated, ...manifest }] of admitted.manifests) {
        const file = `${name.split("/").pop()}-${version}.tgz`;
        rows.push({ e: versionEntity(name, version), a: PUBLICATION, v: { manifest: { ...manifest, _npmUser: { name: user } }, artifact: { file, ...placed.get(file) } }, t: at });
        if (typeof deprecated === "string" && deprecated !== "") rows.push({ e: versionEntity(name, version), a: DEPRECATION, v: deprecated, t: at });
        if (readme === undefined && (body["dist-tags"]?.latest === version || state.readme === undefined)) readme = shippedReadme(admitted.artifacts.get(file));
      }
      for (const [tag, version] of Object.entries(body["dist-tags"] ?? {})) rows.push({ e: packageEntity(name), a: DIST_TAG, v: { tag, version }, t: at });
      if (readme !== undefined && readme !== state.readme) rows.push({ e: packageEntity(name), a: README, v: readme, t: at });
      await appendFacts(name, rows);
      return json({ ok: "created new package", success: true }, 201);
    }).catch(unreceived);
  }

  // npm's registry refuses a tag that a range could name: "1.0.0" or "^1" would shadow a version.
  const taggable = (tag) => tag !== "" && semver.validRange(tag) === null;
  async function setTag(name, tag, version) {
    if (!taggable(tag)) return refusal(400, `${JSON.stringify(tag)} cannot be a dist-tag: a tag must not be a valid semver range`);
    return store.lock(name, async () => {
      const read = await heldFacts(name);
      const state = foldPackage(name, read?.rows ?? []);
      if (!state.versions.has(version)) return refusal(404, `${name}@${version} is not published here`);
      if (state.tags.get(tag) !== version) await appendFacts(name, [{ e: packageEntity(name), a: DIST_TAG, v: { tag, version }, t: now().toISOString() }]);
      return json({ ok: "dist-tag set" }, 201);
    }).catch(unreceived);
  }

  async function removeTag(name, tag) {
    if (tag === "latest") return refusal(400, "the latest dist-tag is what an install without a version gets; move it to another version instead of removing it");
    return store.lock(name, async () => {
      const read = await heldFacts(name);
      const state = foldPackage(name, read?.rows ?? []);
      if (!state.tags.has(tag)) return refusal(404, `${name} has no dist-tag ${tag}`);
      await appendFacts(name, [{ e: packageEntity(name), a: DIST_TAG, v: { tag, version: null }, t: now().toISOString() }]);
      return json({ ok: "dist-tag removed" });
    }).catch(unreceived);
  }

  /** GET /-/v1/search, as the npm registry answers it (npm/registry docs, REGISTRY-API.md): every term of
   *  `text` must occur in a house package's name, description or keywords; `scope:` and `keywords:`
   *  qualifiers narrow by scope and keyword. A name match ranks above a description match. */
  async function search(url) {
    const size = Math.min(Math.max(Number.parseInt(url.searchParams.get("size") ?? "20", 10) || 20, 1), 250);
    const from = Math.max(Number.parseInt(url.searchParams.get("from") ?? "0", 10) || 0, 0);
    const terms = (url.searchParams.get("text") ?? "").toLowerCase().split(/\s+/u).filter(Boolean);
    const scopes = terms.filter((term) => term.startsWith("scope:")).map((term) => `@${term.slice(6).replace(/^@/u, "")}/`);
    const keywords = terms.filter((term) => term.startsWith("keywords:")).flatMap((term) => term.slice(9).split(","));
    const words = terms.filter((term) => !/^[a-z]+:/u.test(term));
    const matches = [];
    for (const name of await store.names()) {
      if (!admittedName(name) || !isPrivate(name)) continue;
      if (scopes.length > 0 && !scopes.some((scope) => name.startsWith(scope))) continue;
      const view = await houseView(name);
      if (view === undefined) continue;
      view.search ??= searchEntry(view.state, { origin, repository: repositoryOf }) ?? null;
      const entry = view.search;
      if (!entry) continue;
      const lowered = { name: entry.name.toLowerCase(), description: entry.description.toLowerCase(), keywords: entry.keywords.map((keyword) => String(keyword).toLowerCase()) };
      if (!keywords.every((keyword) => lowered.keywords.includes(keyword))) continue;
      let score = 0;
      for (const word of words) {
        if (lowered.name === word || lowered.name.endsWith(`/${word}`)) score += 4;
        else if (lowered.name.includes(word)) score += 2;
        else if (lowered.description.includes(word) || lowered.keywords.some((keyword) => keyword.includes(word))) score += 1;
        else { score = -1; break; }
      }
      if (score >= 0) matches.push({ entry, score });
    }
    matches.sort((a, b) => b.score - a.score || a.entry.name.localeCompare(b.entry.name));
    const top = matches[0]?.score || 1;
    return json({
      objects: matches.slice(from, from + size).map(({ entry, score }) => ({
        package: entry, score: { final: score / top, detail: { quality: 1, popularity: 1, maintenance: 1 } }, searchScore: score,
      })),
      total: matches.length, time: now().toUTCString(),
    });
  }

  // "/@scope%2fname", "/@scope/name" and "/name" are one name; "/<name>/-/<file>" is one of its tarballs.
  function parse(pathname) {
    const path = decodeURIComponent(pathname).replace(/^\/+/u, "");
    const parts = path.split("/");
    const nameLength = parts[0]?.startsWith("@") ? 2 : 1;
    const name = parts.slice(0, nameLength).join("/");
    return { name, rest: parts.slice(nameLength) };
  }

  // Memory is bounded by admission, not by hoping: one publish body is in memory at a time, a body over the cap is refused
  // unread past the cap, a stored tarball is streamed from disk rather than held, and while the heap is near its limit new
  // publishes wait (503) instead of growing it until the process aborts.
  let publishing = Promise.resolve();
  const serialized = (work) => { const turn = publishing.then(work, work); publishing = turn.then(() => {}, () => {}); return turn; };
  const tooLarge = (limit) => refusal(413, `a request body is at most ${limit} bytes here`);
  async function boundedBytes(request, limit) {
    const declared = Number(request.headers.get("content-length"));
    if (declared > limit) return { refusal: tooLarge(limit) };
    const chunks = [];
    let size = 0;
    if (request.body) for await (const chunk of request.body) {
      size += chunk.length;
      if (size > limit) { try { await request.body.cancel(); } catch { /* the stream is already closed */ } return { refusal: tooLarge(limit) }; }
      chunks.push(chunk);
    }
    return { bytes: Buffer.concat(chunks) };
  }
  async function boundedJson(request, limit) {
    const read = await boundedBytes(request, limit);
    if (read.refusal) return read;
    try { return { body: JSON.parse(read.bytes.toString("utf8")) }; } catch { return { body: undefined }; }
  }

  /** npm audit, forwarded with house names taken out of the bulk advisory request. */
  async function audit(request, url, method) {
    const target = `${upstream}${url.pathname}${url.search}`;
    if (method === "POST" && url.pathname === "/-/npm/v1/security/advisories/bulk") {
      const read = await boundedBytes(request, 16 * 1024 * 1024);
      if (read.refusal) return read.refusal;
      let inventory;
      try { inventory = JSON.parse((request.headers.get("content-encoding") === "gzip" ? gunzipSync(read.bytes, { maxOutputLength: 64 * 1024 * 1024 }) : read.bytes).toString("utf8")); }
      catch { return refusal(400, "a bulk advisory request is a JSON object of package names to versions"); }
      if (!record(inventory)) return refusal(400, "a bulk advisory request is a JSON object of package names to versions");
      const publicInventory = Object.fromEntries(Object.entries(inventory).filter(([name]) => !isPrivate(name)));
      if (Object.keys(publicInventory).length === 0) return json({});
      const forwarded = await fetchImpl(target, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(publicInventory) });
      return new Response(forwarded.body, { status: forwarded.status, headers: { "content-type": forwarded.headers.get("content-type") ?? "application/json" } });
    }
    const forwarded = await fetchImpl(target, { method, headers: { "content-type": request.headers.get("content-type") ?? "application/json", ...(request.headers.get("content-encoding") ? { "content-encoding": request.headers.get("content-encoding") } : {}) }, body: method === "GET" || method === "HEAD" ? undefined : await request.arrayBuffer() });
    return new Response(forwarded.body, { status: forwarded.status, headers: { "content-type": forwarded.headers.get("content-type") ?? "application/json" } });
  }

  /** `npm login` (legacy, the form npm falls back to when web login is not offered) and `npm logout`. */
  async function account(request, url, method) {
    const login = /^\/-\/user\/org\.couchdb\.user:([^/]+)$/u.exec(url.pathname);
    if (login) {
      let user;
      try { user = decodeURIComponent(login[1]); } catch { return refusal(400, "invalid user path encoding"); }
      if (method === "GET" || method === "HEAD") {
        return (await credentials.authenticated(request)) === user ? json({ _id: `org.couchdb.user:${user}`, name: user, type: "user", roles: [] }) : refusal(401, "not signed in as that user");
      }
      if (method !== "PUT") return refusal(405, "a user document is read, or PUT to sign in");
      const read = await boundedJson(request, 64 * 1024);
      if (read.refusal) return read.refusal;
      if (!record(read.body) || read.body.name !== user || typeof read.body.password !== "string") return refusal(400, "signing in sends the user's name and password");
      if ((await credentials.verify(user, read.body.password)) !== user) return refusal(401, "incorrect username or password (publisher accounts are made by the registry's operator, not by signing in)");
      const token = await credentials.issue(user);
      return json({ ok: true, id: `org.couchdb.user:${user}`, rev: "1", token }, 201);
    }
    const logout = /^\/-\/user\/token\/([^/]+)$/u.exec(url.pathname);
    if (logout && method === "DELETE") {
      let token;
      try { token = decodeURIComponent(logout[1]); } catch { return refusal(400, "invalid token path encoding"); }
      const user = await credentials.authenticated(request);
      if (!user || (await credentials.bearer(token)) !== user) return refusal(401, "a token is revoked by its own publisher");
      await credentials.revoke(token);
      return json({ ok: true });
    }
    return undefined;
  }

  /** Answer one request; every request reaching it is the registry's. */
  async function handle(request) {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();
    if (url.pathname === "/-/ping") return json({});
    if (url.pathname === "/-/v1/search") return method === "GET" || method === "HEAD" ? search(url) : refusal(405, "search is read");
    if (url.pathname === "/-/whoami") {
      const user = await credentials.authenticated(request);
      return user ? json({ username: user }) : refusal(401, "not signed in");
    }
    if (url.pathname.startsWith("/-/user/")) return (await account(request, url, method)) ?? refusal(404, "not found");
    if (url.pathname.startsWith("/-/npm/v1/security/")) return audit(request, url, method);
    const tag = /^\/-\/package\/(.+)\/dist-tags(?:\/([^/]+))?$/u.exec(url.pathname);
    if (tag) {
      let name, selected;
      try {
        name = decodeURIComponent(tag[1]);
        selected = tag[2] === undefined ? undefined : decodeURIComponent(tag[2]);
      }
      catch { return refusal(400, "invalid package path encoding"); }
      if (!admittedName(name)) return refusal(404, "not found");
      if (method === "GET" || method === "HEAD") {
        let tags;
        if (isPrivate(name)) { const view = await houseView(name); tags = view === undefined ? {} : distTags(view.state); }
        else tags = (await publicPackument(name, { full: false }))?.["dist-tags"] ?? {};
        if (selected === undefined) return json(tags);
        return Object.hasOwn(tags, selected) ? json(tags[selected]) : refusal(404, "dist-tag not found");
      }
      if ((method !== "PUT" && method !== "DELETE") || tag[2] === undefined) return refusal(405, "dist-tags are read, set or removed");
      const user = await credentials.authenticated(request);
      if (!user) return refusal(401, "changing a dist-tag needs a publisher's credential");
      if (!isPrivate(name)) return refusal(403, `${name} is not a house package name`);
      if (method === "DELETE") return removeTag(name, selected);
      const version = await request.json().catch(() => undefined);
      if (typeof version !== "string") return refusal(400, "a dist-tag is set to a version string");
      return setTag(name, selected, version);
    }
    if (url.pathname === "/" || url.pathname === "") return json({ registry: origin, privateScopes });
    let parsed;
    try { parsed = parse(url.pathname); }
    catch { return refusal(400, "invalid package path encoding"); }
    const { name, rest } = parsed;
    if (!admittedName(name)) return refusal(404, "not found");
    // npm unpublish is a PUT to <name>/-rev/<rev> or a DELETE of a package or tarball. A version is never removed.
    if (rest.includes("-rev") || method === "DELETE") return refusal(405, "a published version is never removed; deprecate it (npm deprecate) instead of unpublishing it");
    if (rest.length === 0) {
      if (method === "GET" || method === "HEAD") {
        const install = wantsAbbreviated(request.headers.get("accept") ?? "");
        const type = install ? installType : "application/json";
        if (isPrivate(name)) {
          const view = await houseView(name);
          if (view === undefined) return refusal(404, `${name} is not in this registry`);
          const served = rendered(name, view, install ? "abbreviated" : "full", () => install ? renderAbbreviated(view.state, { origin }) : renderFull(view.state, { origin, revision: view.revision }));
          // A house package changes when it is published to; a client revalidates (cheaply: 304) every time.
          return representation(request, served, { type, modified: view.state.modified, cacheControl: "no-cache", vary: "Accept" });
        }
        const packument = await publicPackument(name, { full: !install });
        if (!packument) return refusal(404, `${name} is not in this registry`);
        return representation(request, publicRepresentation(name, packument, install), { type, modified: packument.time?.modified ?? packument.modified, cacheControl: "public, max-age=300", vary: "Accept" });
      }
      if (method === "PUT") {
        const user = await credentials.authenticated(request);
        if (!user) return refusal(401, "publishing needs a publisher's credential");
        if (!isPrivate(name)) return refusal(403, `${name} is not a house package name`);
        return serialized(async () => {
          if (heapPressure()) return Response.json({ error: "the registry is short of memory; retry the publish shortly" }, { status: 503, headers: { "retry-after": "30" } });
          const read = await boundedJson(request, maxPublishBytes);
          if (read.refusal) return read.refusal;
          if (!record(read.body)) return refusal(400, "a publish is a JSON packument");
          return publish(name, read.body, user);
        });
      }
      return refusal(405, "a package is read or published");
    }
    if (rest.length === 1 && (method === "GET" || method === "HEAD")) {
      const selector = rest[0];
      if (isPrivate(name)) {
        const view = await houseView(name);
        const version = view === undefined ? undefined : selectVersion(view.state, selector);
        return version === undefined ? refusal(404, `${name}@${selector} is not in this registry`) : json(renderVersion(view.state, version, { origin }));
      }
      const packument = await publicPackument(name, { full: false });
      const version = Object.hasOwn(packument?.versions ?? {}, selector) ? selector
        : Object.hasOwn(packument?.["dist-tags"] ?? {}, selector) ? packument["dist-tags"][selector] : undefined;
      return version !== undefined && Object.hasOwn(packument.versions ?? {}, version)
        ? json(presentedManifest(name, version, packument.versions[version])) : refusal(404, `${name}@${selector} is not in this registry`);
    }
    if (rest[0] === "-" && rest.length === 2 && (method === "GET" || method === "HEAD")) {
      const file = rest[1];
      if (!file.endsWith(".tgz") || file.includes("/") || file.startsWith(".")) return refusal(404, "not found");
      return (await tarballResponse(request, name, file)) ?? refusal(404, `${file} is not in this registry`);
    }
    return refusal(404, "not found");
  }

  return Object.freeze({ handle, store, isPrivate, origin });
}
