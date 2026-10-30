import { homedir } from "node:os";
import { isAbsolute, resolve } from "node:path";
import { Readable } from "node:stream";
import { isDeepStrictEqual } from "node:util";
import { removePublicLeftovers } from "./leftovers.mjs";
import { receiveStore } from "./reception.mjs";
import { createNpmRegistry } from "./registry.mjs";

const headerOf = (value) => (Array.isArray(value) ? value.join(",") : value);
const HOSTNAME = /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/u;

/** What a registry deployment may declare. Paths are home-relative unless absolute. */
const CONFIGURATION = new Set([
  "hosts", "origin", "storage", "htpasswd", "tokens", "privateScopes", "privateNames", "uplink", "houseScopes",
  "publishGate", "cachePublicTarballs", "maxPublishBytes", "maxUplinkTarballBytes", "receiveAtStart",
]);

/** A registry configuration as admitted: every key known, hosts named, the origin one of them. */
export function admittedConfiguration(configuration) {
  if (configuration === null || typeof configuration !== "object" || Array.isArray(configuration)) throw new TypeError("an npm registry configuration is an object");
  const unknown = Object.keys(configuration).filter((key) => !CONFIGURATION.has(key));
  if (unknown.length > 0) throw new TypeError(`an npm registry configuration does not declare ${unknown.join(", ")}`);
  const hosts = (configuration.hosts ?? []).map((host) => String(host).toLowerCase());
  if (hosts.length === 0 || hosts.some((host) => !HOSTNAME.test(host))) throw new TypeError("the npm registry application names the hosts it answers");
  if (typeof configuration.storage !== "string" || typeof configuration.htpasswd !== "string") throw new TypeError("the npm registry configuration names its storage and its htpasswd");
  return Object.freeze({ ...configuration, hosts });
}

const home = (path) => (path === undefined || isAbsolute(path) ? path : resolve(homedir(), path));

// One registry per store in a process. A host may build its entrance more than once (FeltOS does, before and after
// federation); every build gets this same registry, its caches and its writer queue, instead of a second writer.
const registries = new Map(); // storage -> {configuration, registry, ready}

/**
 * The registry over a configuration's store, created once per store in this process. On creation the store is
 * prepared once, in the background, while the registry already answers: what public names left on disk before
 * public metadata became memory-only is removed (leftovers.mjs), and, unless `receiveAtStart: false`, every package
 * still in the earlier layout is received as facts (reception.mjs). Each report is one JSON line on stderr.
 */
export function registryFor(configuration, { log = (line) => process.stderr.write(`${line}\n`) } = {}) {
  const admitted = admittedConfiguration(configuration);
  const storage = home(admitted.storage);
  const held = registries.get(storage);
  if (held !== undefined) {
    if (!isDeepStrictEqual(held.configuration, admitted)) throw new TypeError(`${storage} is already served by a registry with another configuration`);
    return held;
  }
  const registry = createNpmRegistry({
    storage, htpasswd: home(admitted.htpasswd), tokens: home(admitted.tokens), origin: admitted.origin,
    privateScopes: admitted.privateScopes, privateNames: admitted.privateNames, uplink: admitted.uplink,
    cachePublicTarballs: admitted.cachePublicTarballs, houseScopes: admitted.houseScopes, publishGate: admitted.publishGate,
    maxPublishBytes: admitted.maxPublishBytes, maxUplinkTarballBytes: admitted.maxUplinkTarballBytes,
  });
  const ready = (async () => {
    try { log(JSON.stringify(await removePublicLeftovers({ configuration: admitted, storage }))); }
    catch (error) { log(`public leftovers not removed: ${error.message}`); }
    if (admitted.receiveAtStart === false) return;
    try { log(JSON.stringify(await receiveStore(registry.store, { origin: registry.origin, admits: registry.isPrivate }))); }
    catch (error) { log(`registry store not received: ${error.message}`); }
  })();
  const entry = Object.freeze({ configuration: admitted, registry, ready });
  registries.set(storage, entry);
  return entry;
}

const answered = (registry, request) => registry.handle(request).catch((error) =>
  Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 502 }));

/**
 * The registry as an application of a host that hands every request to `onRequest`: requests whose Host is one of
 * `hosts` are the registry's, answered before the host's own routes; every other request passes through. The
 * standalone entrypoint (bin/serve.mjs) serves it this way.
 *
 * A host serves either a Fetch context (`request`, a Web Request) or the native one (`req`, Node's
 * IncomingMessage); both carry `url`. The native request becomes a Web Request only when it is the
 * registry's, its body streamed rather than read.
 */
export function npmRegistryApplication({ configuration = {} } = {}) {
  const { configuration: admitted, registry } = registryFor(configuration);
  const hosts = new Set(admitted.hosts);
  const hostOf = (context) => {
    const headers = context.request?.headers;
    const forwarded = headers ? headers.get("x-forwarded-host") ?? headers.get("host") : headerOf(context.req?.headers?.["x-forwarded-host"]) ?? context.req?.headers?.host;
    return (forwarded ?? context.url?.host ?? "").split(",")[0].trim().split(":")[0].toLowerCase();
  };
  const webRequestOf = (context) => {
    if (context.request instanceof Request) return context.request;
    const { req, url } = context;
    const headers = new Headers();
    for (const [name, value] of Object.entries(req.headers)) if (value !== undefined) headers.set(name, headerOf(value));
    const bodied = req.method !== "GET" && req.method !== "HEAD";
    return new Request(url.href, { method: req.method, headers, ...(bodied ? { body: Readable.toWeb(req), duplex: "half" } : {}) });
  };
  return Object.freeze({
    onRequest: (context) => (hosts.has(hostOf(context)) ? answered(registry, webRequestOf(context)) : undefined),
  });
}

/**
 * The registry as a MetroPlat hosted application: declared in a MetroPlat instance's `applications` with its
 * configuration (`hosts` among it), it answers every request whose Host the deployment declared for it, on the
 * instance's own listener, ahead of the instance's sign-in and routes. The registry authenticates its own state
 * changes (npm's Basic and Bearer credentials); the instance's principals are not its publishers.
 *
 *   { "module": "@red-cup-engineering/npm-registry-serving-service/application",
 *     "export": "npmRegistryHostedApplication",
 *     "configuration": { "hosts": ["registry.561.group"], "origin": "https://registry.561.group", … } }
 */
export function npmRegistryHostedApplication({ configuration } = {}) {
  const declared = admittedConfiguration(configuration);
  if (!declared.hosts.includes(new URL(declared.origin).hostname)) throw new TypeError("a hosted npm registry's origin is one of the hosts it answers");
  const { configuration: admitted, registry } = registryFor(declared);
  return Object.freeze({
    hosts: Object.freeze([...admitted.hosts]),
    authentication: Object.freeze({ scheme: "npm-registry", accepts: Object.freeze(["Basic", "Bearer"]) }),
    fetch: (request) => answered(registry, request),
  });
}
