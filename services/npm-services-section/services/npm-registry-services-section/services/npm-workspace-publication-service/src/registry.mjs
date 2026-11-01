import { get as httpGet } from "node:http";
import { get as httpsGet } from "node:https";
import { execFile as execFileCallback } from "node:child_process";
import { link, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { correctedTarballURL } from "./tarball-guard.mjs";
import { npmPublicationArguments } from "./npm-publication-command.mjs";

const execFile = promisify(execFileCallback);
const SHA512_INTEGRITY = /^sha512-[A-Za-z0-9+/]+={0,2}$/u;

/** Read the exact version index directly from a locally mounted Verdaccio store. */
export async function readRegistryStorageVersions(storageRoot, names) {
  const result = new Map();
  for (const name of [...new Set(names)]) {
    try {
      const path = join(resolve(storageRoot), ...name.split("/"), "package.json");
      const packument = JSON.parse(await readFile(path, "utf8"));
      if (packument?.name !== name || !packument.versions || typeof packument.versions !== "object") {
        throw new Error(`registry storage contains malformed metadata for ${name}`);
      }
      result.set(name, new Set(Object.keys(packument.versions)));
    } catch (error) {
      if (error?.code === "ENOENT") result.set(name, new Set());
      else throw error;
    }
  }
  return result;
}

export async function readRegistryStorageDistTag(storageRoot, name, tag) {
  try {
    const path = join(resolve(storageRoot), ...name.split("/"), "package.json");
    const packument = JSON.parse(await readFile(path, "utf8"));
    if (packument?.name !== name || !packument["dist-tags"] || typeof packument["dist-tags"] !== "object") throw new Error(`registry storage contains malformed dist-tags for ${name}`);
    return Object.freeze({ reachable: true, found: true, version: packument["dist-tags"][tag] ?? null });
  } catch (error) {
    if (error?.code === "ENOENT") return Object.freeze({ reachable: true, found: false, version: null });
    throw error;
  }
}

/**
 * Repair a single published version's `dist.tarball` in a locally mounted
 * Verdaccio store, in place, when it carries the npm-client tarball-URL
 * corruption described in `correctedTarballURL`. A no-op (returns
 * `{ changed: false }`) when the version is absent or already well-formed, so
 * it is safe to call unconditionally after every publish.
 */
export async function repairStorageTarballURL(storageRoot, name, version) {
  const path = join(resolve(storageRoot), ...name.split("/"), "package.json");
  const raw = await readFile(path, "utf8");
  const packument = JSON.parse(raw);
  if (packument?.name !== name) throw new Error(`registry storage contains malformed metadata for ${name}`);
  const manifest = packument.versions?.[version];
  if (!manifest) return Object.freeze({ changed: false, reason: "version-absent" });
  const corrected = correctedTarballURL(manifest.dist?.tarball, name);
  if (corrected === null) return Object.freeze({ changed: false });
  manifest.dist.tarball = corrected;
  await writeFile(path, `${JSON.stringify(packument, null, 2)}\n`, "utf8");
  return Object.freeze({ changed: true, tarball: corrected });
}

function readPackument(url) {
  return new Promise((resolve, reject) => {
    const getter = url.startsWith("https:") ? httpsGet : httpGet;
    const token = process.env.NODE_AUTH_TOKEN;
    const headers = { connection: "close", ...(token ? { authorization: `Bearer ${token}` } : {}) };
    // Retain the caller-configured global agent for required proxy/TLS transport.
    const request = getter(url, { headers }, (response) => {
      const chunks = [];
      let size = 0;
      response.on("data", (chunk) => {
        size += chunk.length;
        if (size > 64 * 1024 * 1024) request.destroy(new Error("registry response exceeds 64 MiB"));
        else chunks.push(chunk);
      });
      response.on("end", () => {
        if ((response.statusCode ?? 500) < 200 || (response.statusCode ?? 500) >= 300) {
          resolve({ ok: false, status: response.statusCode, json: async () => null });
          return;
        }
        try {
          const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          resolve({ ok: true, status: response.statusCode, json: async () => value });
        } catch (error) {
          reject(error);
        }
      });
    });
    request.setTimeout(5_000, () => request.destroy(new Error("registry request timed out")));
    request.on("error", reject);
  });
}

// Only HTTP 404 proves absence. Authentication and server failures must stop
// release planning instead of authorizing a new immutable identity.
async function readRegistryDocument(url, request = readPackument) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    let response;
    try {
      response = await request(url);
    } catch {
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)));
      continue;
    }
    if (response.status === 404) return Object.freeze({ found: false, reachable: true, value: null });
    if (!response.ok) {
      const error = new Error(`npm registry refused metadata: HTTP ${response.status}`);
      error.code = "ERR_NPM_REGISTRY_HTTP";
      error.status = response.status;
      throw error;
    }
    const value = await response.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("registry returned malformed package metadata");
    return Object.freeze({ found: true, reachable: true, value });
  }
  return Object.freeze({ found: false, reachable: false, value: null });
}

/** Read all versions known for one package name; only 404 means absent. */
export async function readRegistryPackage(registry, name) {
  const result = await readRegistryDocument(`${configuredRegistryAuthority(registry)}${encodeURIComponent(name)}`);
  if (result.found && (result.value.name !== name || !result.value.versions || typeof result.value.versions !== "object" || Array.isArray(result.value.versions))) {
    throw new Error("registry returned another package or malformed version index");
  }
  return Object.freeze({ found: result.found, reachable: result.reachable, packument: result.value && Object.freeze(result.value) });
}

export async function readRegistryDistTag(registry, name, tag) {
  const result = await readRegistryPackage(registry, name);
  return Object.freeze({ reachable: result.reachable, found: result.found, version: result.packument?.["dist-tags"]?.[tag] ?? null });
}

/** Read an immutable exact identity; failed HTTP reads do not prove absence. */
export async function readRegistryPackageVersion(registry, name, version) {
  exactNpmIdentity(name, version);
  const result = await readRegistryDocument(`${configuredRegistryAuthority(registry)}${encodeURIComponent(name)}/${encodeURIComponent(version)}`);
  if (result.found && (result.value.name !== name || result.value.version !== version)) throw new Error("registry returned another package or version");
  return Object.freeze({ found: result.found, reachable: result.reachable, manifest: result.value && Object.freeze(result.value) });
}

/** Receive advertised bytes directly from the same registry authority, bounded
 * and SHA512 checked. This does not invoke npm's package lifecycle or inspect
 * the calling checkout's installation. Configured-npm receiving remains the
 * entrance for registries whose authentication is carried only by npmrc. */
// Only an actual original transfer failure in this process can name these
// observations. JSON/error fields never confer local transport custody.
const registryTransferFailures = new WeakMap();
function registryTransferObservation({ registry, tarball, integrity, native }) {
  const occurrence = Object.freeze({ id: randomUUID(), registry, tarball, integrity });
  const resources = [], seen = new WeakMap(), waiters = new Set();
  let notInvoked = false, resourceOverflow = false;
  const changed = () => { for (const notify of [...waiters]) notify(); };
  const observe = (resource, kind) => {
    if (!resource || typeof resource.once !== "function") return;
    if (seen.has(resource)) return;
    if (resources.length >= 64) { resourceOverflow = true; changed(); return; }
    const record = { kind, index: resources.length, closeObserved: false };
    seen.set(resource, record); resources.push(record);
    resource.once("close", () => { record.closeObserved = true; changed(); });
    changed();
  };
  const snapshot = () => {
    const complete = native && !resourceOverflow && resources.some(x => x.kind === "request") && resources.some(x => x.kind === "socket") && resources.every(x => x.closeObserved);
    return Object.freeze({
      kind: "npm.registry-transfer.local-observation.v1", occurrence,
      state: notInvoked ? "not-invoked" : complete ? "observed-local-resources-closed" : "unknown",
      transport: native ? "original-native-https" : "opaque-fetch-port",
      resourceOverflow,
      resources: Object.freeze(resources.map(x => Object.freeze({ ...x }))),
      scope: "observed local resources at this reading only; hidden or later agent activity is not received",
      remoteSettlement: false, replayAuthority: false,
    });
  };
  return Object.freeze({ observe, snapshot, waiters,
    noInvocation() { notInvoked = true; changed(); },
    failed(error) {
      if ((typeof error !== "object" || error === null) && typeof error !== "function") return;
      const previous = registryTransferFailures.get(error);
      if (registryTransferFailures.has(error)) { registryTransferFailures.set(error, null); for (const notify of [...(previous?.waiters ?? [])]) notify(); }
      else registryTransferFailures.set(error, { snapshot, waiters });
    },
  });
}

/** Bounded observation of an original failure; never requests, cancels or retries.
 * Request/message close is not socket close. Opaque/global-agent hidden work and
 * the remote server are outside this receipt, even when observed objects closed.
 */
export async function receiveRegistryTransferSettlement(error, options = {}) {
  if (!options || typeof options !== "object" || Array.isArray(options)) throw new TypeError("bounded local receiving options required");
  const descriptors = Object.getOwnPropertyDescriptors(options);
  if (Reflect.ownKeys(descriptors).some(key => key !== "timeoutMs" || !("value" in descriptors[key]))) throw new TypeError("only a data timeoutMs is supported");
  const timeoutMs = Object.hasOwn(descriptors, "timeoutMs") ? descriptors.timeoutMs.value : 1000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 0 || timeoutMs > 5000) throw new TypeError("local receiving timeoutMs must be an integer 0 through 5000");
  const state = ((typeof error === "object" && error !== null) || typeof error === "function") ? registryTransferFailures.get(error) : undefined;
  if (!state) throw new TypeError("one original live transfer failure occurrence required");
  const first = state.snapshot();
  if (first.state !== "unknown" || first.transport === "opaque-fetch-port" || timeoutMs === 0) return first;
  return new Promise((resolve, reject) => {
    let settled = false, timer;
    const finish = () => {
      if (settled) return;
      settled = true; clearTimeout(timer); state.waiters.delete(changed);
      const current = registryTransferFailures.get(error);
      if (current !== state) { reject(new TypeError("one original live transfer failure occurrence required")); return; }
      resolve(state.snapshot());
    };
    const changed = () => { if (registryTransferFailures.get(error) !== state || state.snapshot().state !== "unknown") finish(); };
    state.waiters.add(changed); timer = setTimeout(finish, timeoutMs); changed();
  });
}

export async function receiveRegistryTarball({ registry, tarball, integrity, destination, fetchImpl, timeoutMs = 5_000, inactivityTimeoutMs = 5_000, signal }) {
  const authority = new URL(configuredRegistryAuthority(registry)), url = new URL(tarball);
  if (url.origin !== authority.origin || url.protocol !== "https:" || url.username || url.password || url.search || url.hash
    || !url.pathname.startsWith(authority.pathname) || !/^sha512-[A-Za-z0-9+/]+=*$/u.test(integrity)) throw new TypeError("same-authority HTTPS artifact and SHA512 required");
  for (const duration of [timeoutMs, inactivityTimeoutMs]) {
    if (!Number.isSafeInteger(duration) || duration < 1 || duration > 120_000) throw new TypeError("registry transfer deadlines must be integer milliseconds from 1 through 120000");
  }
  if (signal !== undefined && !(signal instanceof AbortSignal)) throw new TypeError("registry transfer signal must be an AbortSignal");
  if (fetchImpl !== undefined && typeof fetchImpl !== "function") throw new TypeError("registry read port must be callable");
  const localObservation = registryTransferObservation({ registry: authority.href, tarball: url.href, integrity, native: fetchImpl === undefined });
  // These timers bound the transfer, not subsequent digest/filesystem work.
  // An arbitrary supplied port can ignore cancellation: never infer quiescence.
  const bytes = await new Promise((resolve, reject) => {
    const controller = new AbortController(), chunks = [];
    let request, response, reader, totalTimer, idleTimer, terminal = false, size = 0;
    const started = performance.now();
    let lastProgress = started;
    const cancel = target => {
      try { Promise.resolve(target?.cancel()).catch(() => {}); } catch {}
    };
    const clear = () => {
      clearTimeout(totalTimer); clearTimeout(idleTimer);
      signal?.removeEventListener("abort", onAbort);
    };
    const fail = error => {
      if (terminal) return;
      terminal = true; clear();
      localObservation.failed(error);
      controller.abort(error);
      request?.destroy(error);
      response?.destroy(error);
      cancel(reader);
      try { reader?.releaseLock(); } catch {}
      reject(error);
    };
    const timedOut = phase => fail(Object.assign(new Error(`registry artifact ${phase} deadline exceeded`), {
      code: "ERR_REGISTRY_TRANSFER_TIMEOUT", phase, transportCleanup: "requested-unconfirmed",
    }));
    const onAbort = () => fail(Object.assign(new Error("registry artifact transfer aborted", { cause: signal.reason }), {
      name: "AbortError", code: "ABORT_ERR", transportCleanup: "requested-unconfirmed",
    }));
    const checkLifetime = () => {
      if (terminal) return false;
      const now = performance.now();
      if (now - started >= timeoutMs) { timedOut("total"); return false; }
      if (now - lastProgress >= inactivityTimeoutMs) { timedOut("inactivity"); return false; }
      return true;
    };
    const progress = () => {
      lastProgress = performance.now();
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => timedOut("inactivity"), inactivityTimeoutMs);
    };
    const append = chunk => {
      if (!checkLifetime()) return false;
      size += chunk.byteLength;
      if (size > 64 * 1024 * 1024) { fail(new Error("registry artifact exceeds 64 MiB")); return false; }
      if (chunk.byteLength) { chunks.push(Buffer.from(chunk)); progress(); }
      return true;
    };
    const finish = () => {
      if (!checkLifetime()) return;
      terminal = true; clear(); resolve(Buffer.concat(chunks));
    };
    if (signal?.aborted) { localObservation.noInvocation(); onAbort(); return; }
    signal?.addEventListener("abort", onAbort, { once: true });
    totalTimer = setTimeout(() => timedOut("total"), timeoutMs);
    progress();
    if (fetchImpl === undefined) {
      const token = process.env.NODE_AUTH_TOKEN;
      try {
        // Set timeout before connection creation: native proxy CONNECT consumes
        // this option. Retain the caller-configured global HTTPS agent.
        request = httpsGet(url, { timeout: inactivityTimeoutMs, headers: { connection: "close", ...(token ? { authorization: `Bearer ${token}` } : {}) } }, incoming => {
          response = incoming;
          localObservation.observe(response, "response");
          response.on("error", fail);
          response.on("aborted", () => fail(new Error("registry artifact response aborted")));
          if (!checkLifetime()) { response.destroy(); return; }
          if (response.statusCode !== 200) { fail(new Error(`registry artifact refused: HTTP ${response.statusCode}`)); return; }
          progress();
          response.on("data", append);
          response.on("end", finish);
          response.on("close", () => { if (!response.complete) fail(new Error("registry artifact response closed before completion")); });
        });
        localObservation.observe(request, "request");
        request.on("socket", socket => localObservation.observe(socket, "socket"));
        // Some configured agents assign the socket before the returned request
        // is available. Observe that same object, never infer closure from it.
        if (request.socket) localObservation.observe(request.socket, "socket");
        request.setTimeout(inactivityTimeoutMs, () => timedOut("inactivity"));
        request.on("error", fail);
        if (terminal) request.destroy();
      } catch (error) { fail(error); }
    } else {
      // This task owns no filesystem effects. If the port ignores abort, the
      // caller still settles and any eventual body is canceled, never admitted.
      (async () => {
        try {
          const fetched = await fetchImpl(url.href, { method: "GET", redirect: "error", signal: controller.signal });
          if (!checkLifetime()) { cancel(fetched?.body); return; }
          if (fetched.status !== 200 || (fetched.url && fetched.url !== url.href) || !fetched.body) {
            cancel(fetched.body);
            throw new Error("registry artifact response does not match the selected transfer");
          }
          progress();
          reader = fetched.body.getReader();
          for (;;) {
            const { value, done } = await reader.read();
            if (!checkLifetime()) return;
            if (done) { finish(); return; }
            if (!append(value)) return;
          }
        } catch (error) { fail(error); }
        finally { try { reader?.releaseLock(); } catch {} }
      })();
    }
  });
  if (`sha512-${createHash("sha512").update(bytes).digest("base64")}` !== integrity) throw new Error("registry artifact differs from advertised SHA512");
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, bytes, { flag: "wx" });
  return { integrity, bytes: bytes.length, artifactDownloaded: true };
}

function commandText(error) {
  return [error?.stdout, error?.stderr, error?.message].filter((value) => typeof value === "string").join("\n").toLowerCase();
}

function configuredRegistryAuthority(registry) {
  const url = new URL(registry);
  if (!/^https?:$/u.test(url.protocol) || url.username || url.password || url.search || url.hash) throw new TypeError("registry must be an authority-only HTTP(S) URL");
  return url.href.endsWith("/") ? url.href : `${url.href}/`;
}

function exactNpmIdentity(name, version) {
  if (typeof name !== "string" || !/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/u.test(name) || typeof version !== "string" || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u.test(version)) {
    throw new TypeError("name and version must identify one exact npm package");
  }
  return `${name}@${version}`;
}

async function configuredNpmCommand(command, arguments_, { registry, npmEnvironment, execFileImpl, options }) {
  const environment = { ...process.env, ...npmEnvironment };
  if (environment.NPM_CONFIG_USERCONFIG !== undefined || environment.NODE_AUTH_TOKEN === undefined) return execFileImpl(command, arguments_, { ...options, env: environment });
  const configuration = await mkdtemp(join(tmpdir(), "npm-configured-registry-"));
  const npmrc = join(configuration, ".npmrc");
  const url = new URL(registry);
  // npm resolves this variable itself; the protected token is never written.
  await writeFile(npmrc, `registry=${registry}\n//${url.host}${url.pathname}:_authToken=\${NODE_AUTH_TOKEN}\n`, { mode: 0o600 });
  try {
    return await execFileImpl(command, arguments_, { ...options, env: { ...environment, NPM_CONFIG_USERCONFIG: npmrc } });
  } finally {
    await rm(configuration, { recursive: true, force: true });
  }
}

/**
 * Reads exact npm package metadata through pnpm's configured authentication.
 * @param {string} registry
 * @param {string} name
 * @param {string} version
 * @param {{execFileImpl?: typeof execFile, npmEnvironment?: Record<string, string>}} [options]
 * @returns {Promise<{found: boolean, reachable: boolean, authorizationFailed?: boolean, manifest: object|null}>}
 */
export async function readConfiguredNpmRegistryPackageVersion(registry, name, version, { execFileImpl = execFile, npmEnvironment = {} } = {}) {
  const authority = configuredRegistryAuthority(registry), identity = exactNpmIdentity(name, version);
  try {
    const { stdout } = await configuredNpmCommand("pnpm", ["view", identity, "--json", "--registry", authority], { registry: authority, npmEnvironment, execFileImpl, options: { maxBuffer: 8 * 1024 * 1024, timeout: 10_000 } });
    const manifest = JSON.parse(stdout);
    if (!manifest || manifest.name !== name || manifest.version !== version) throw new Error("registry returned another package or version");
    return Object.freeze({ found: true, reachable: true, manifest: Object.freeze(manifest) });
  } catch (error) {
    const detail = commandText(error);
    if (/\b(?:e401|e403)\b|(?:authorization|authentication)\s+(?:required|failed)|(?:access|permission)\s+denied|forbidden/u.test(detail)) {
      return Object.freeze({ found: false, reachable: true, authorizationFailed: true, manifest: null });
    }
    if (/\be404\b/u.test(detail)) return Object.freeze({ found: false, reachable: true, manifest: null });
    // pnpm 11 reports an absent exact version of an existing package with a
    // structured PACKAGE_NOT_FOUND error. Read the package's actual version
    // index through the same configured client before treating that as absence.
    let failure;
    try { failure = JSON.parse(error.stdout)?.error; } catch {}
    if (failure?.code === "ERR_PNPM_FETCH_404") return Object.freeze({ found: false, reachable: true, manifest: null });
    if (failure?.code === "ERR_PNPM_PACKAGE_NOT_FOUND") {
      try {
        const { stdout } = await configuredNpmCommand("pnpm", ["view", name, "versions", "--json", "--registry", authority], { registry: authority, npmEnvironment, execFileImpl, options: { maxBuffer: 8 * 1024 * 1024, timeout: 10_000 } });
        const versions = JSON.parse(stdout);
        if (Array.isArray(versions) && versions.every((entry) => typeof entry === "string") && !versions.includes(version)) return Object.freeze({ found: false, reachable: true, manifest: null });
      } catch {}
    }
    return Object.freeze({ found: false, reachable: false, manifest: null });
  }
}

/** Publish one already-fabricated immutable tarball through the same configured authority as receiving. */
export async function publishConfiguredNpmRegistryArtifact({ registry, name, version, artifact, tag, execFileImpl = execFile, npmEnvironment = {} }) {
  const authority = configuredRegistryAuthority(registry);
  exactNpmIdentity(name, version);
  const { stdout } = await execFileImpl("tar", ["-xOf", artifact, "package/package.json"], { encoding: "utf8", maxBuffer: 1024 * 1024 });
  const manifest = JSON.parse(stdout);
  if (manifest.name !== name || manifest.version !== version) throw new Error("publication artifact identity differs from the requested release");
  return configuredNpmCommand("npm", npmPublicationArguments(manifest, authority, tag, { artifact }), {
    registry: authority, npmEnvironment, execFileImpl,
    options: { encoding: "utf8", maxBuffer: 8 * 1024 * 1024, timeout: 60_000 },
  });
}

/**
 * Downloads one exact registry tarball through npm's configured authentication
 * and verifies its advertised SHA-512 before retaining it.
 * @param {{registry: string, name: string, version: string, integrity: string, destination: string, execFileImpl?: typeof execFile, npmEnvironment?: Record<string, string>}} input
 * @returns {Promise<void>}
 */
export async function downloadConfiguredNpmRegistryTarball({ registry, name, version, integrity, destination, execFileImpl = execFile, npmEnvironment = {} }) {
  const authority = configuredRegistryAuthority(registry), identity = exactNpmIdentity(name, version);
  if (!SHA512_INTEGRITY.test(integrity)) throw new TypeError("registry tarball integrity must be sha512");
  try {
    const existing = await readFile(destination);
    if (`sha512-${createHash("sha512").update(existing).digest("base64")}` !== integrity) throw new Error(`existing registry artifact ${name}@${version} has conflicting bytes`);
    return;
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  await mkdir(dirname(destination), { recursive: true });
  const staging = `${destination}.npm-pack-${randomUUID()}`;
  await mkdir(staging, { recursive: true, mode: 0o700 });
  try {
    const { stdout } = await configuredNpmCommand("npm", ["pack", identity, "--json", "--ignore-scripts", "--fetch-retries=0", "--fetch-timeout=5000", "--registry", authority], { registry: authority, npmEnvironment, execFileImpl, options: { cwd: staging, maxBuffer: 8 * 1024 * 1024, timeout: 10_000 } });
    const record = npmPackResult(stdout, { name, version });
    if (record?.name !== name || record?.version !== version || typeof record.filename !== "string" || record.filename.includes("/") || record.filename.includes("\\") || record.filename === "." || record.filename === "..") {
      throw new Error(`npm pack did not identify ${name}@${version}`);
    }
    const bytes = await readFile(join(staging, record.filename));
    const observed = `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
    if (observed !== integrity) throw new Error(`registry artifact ${name}@${version} integrity mismatch`);
    try { await link(join(staging, record.filename), destination); }
    catch (error) {
      if (error?.code !== "EEXIST") throw error;
      const existing = await readFile(destination);
      if (`sha512-${createHash("sha512").update(existing).digest("base64")}` !== integrity) throw new Error(`existing registry artifact ${name}@${version} has conflicting bytes`);
    }
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

/** True when the registry already serves exactly this name@version. */
export async function isVersionPublished(registry, name, version, fetcher = fetch) {
  exactNpmIdentity(name, version);
  const url = `${configuredRegistryAuthority(registry)}${encodeURIComponent(name)}`;
  const result = await readRegistryDocument(url, fetcher === fetch ? readPackument : (address) => fetcher(address, { signal: AbortSignal.timeout(5_000) }));
  const packument = result.value;
  if (result.found && (packument.name !== name || !packument.versions || typeof packument.versions !== "object" || Array.isArray(packument.versions))) throw new Error("registry returned another package or malformed version index");
  return Object.freeze({ published: Boolean(packument?.versions?.[version]), reachable: result.reachable });
}
import { npmPackResult } from "./npm-pack-result.mjs";
