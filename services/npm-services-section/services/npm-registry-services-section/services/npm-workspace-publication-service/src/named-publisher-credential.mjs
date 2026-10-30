import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { isDeepStrictEqual, promisify } from "node:util";

const nativeExecFile = promisify(execFileCallback);
const nonempty = value => typeof value === "string" && value.length > 0 && value.length <= 512 && !/[\u0000-\u001f\u007f]/u.test(value);
const refused = () => Object.assign(new Error("named npm publisher custody or registry identity is unavailable"), { code: "NPM_PUBLISHER_CUSTODY_UNAVAILABLE" });

function registryAuthority(value) {
  let url;
  try { url = new URL(value); } catch { throw refused(); }
  // HTTP is only for disposable loopback receiving tests. Installed registries use HTTPS.
  if (!(url.protocol === "https:" || (url.protocol === "http:" && ["127.0.0.1", "[::1]"].includes(url.hostname)))
    || url.username || url.password || url.search || url.hash || url.pathname !== "/") throw refused();
  return url.href;
}

function commandFailure(error, privateValues = []) {
  // npm failures can include private paths or configuration. Retain only the
  // recognized protocol classification, never arbitrary subprocess diagnostics.
  const detail = [error?.code, error?.stdout, error?.stderr, error?.message].filter(value => typeof value === "string").join("\n");
  const code = /\b(E[45][0-9]{2}|ENEEDAUTH|EPUBLISHCONFLICT|EUSAGE|EPROVENANCE|EOTP|EBADENGINE|EINTEGRITY|EINVALIDTAGNAME|EUNSCOPED|EPRIVATE|ERR_PNPM_FETCH_404|ERR_PNPM_PACKAGE_NOT_FOUND|ECONNREFUSED|ETIMEDOUT|ENOTFOUND)\b/u.exec(detail)?.[1] ?? "NPM_CONFIGURED_COMMAND_FAILED";
  const systemCodes = ["ENOENT", "EACCES", "ENOSPC", "EMFILE", "ENFILE", "EAGAIN", "E2BIG", "ENOMEM", "ETIMEDOUT"];
  const signals = ["SIGTERM", "SIGKILL", "SIGABRT", "SIGINT", "SIGHUP", "SIGQUIT", "SIGPIPE", "SIGSEGV", "SIGBUS", "SIGILL", "SIGFPE", "SIGXCPU", "SIGXFSZ"];
  let reportedCode = null;
  try {
    const candidate = JSON.parse(error.stdout)?.error?.code;
    if (typeof candidate === "string" && /^[A-Za-z][A-Za-z0-9_-]{0,63}$/u.test(candidate)
      && !privateValues.some(value => typeof value === "string" && value.length > 0 && candidate.toLowerCase().includes(value.toLowerCase()))) reportedCode = candidate;
  } catch { /* Native stdout need not be structured JSON. */ }
  return Object.assign(new Error(`configured npm command failed: ${code}`), {
    code, stderr: code, stdout: JSON.stringify({ error: { code } }),
    reportedCode,
    exitCode: Number.isSafeInteger(error?.code) ? error.code : null,
    systemCode: systemCodes.includes(error?.code) ? error.code : null,
    signal: signals.includes(error?.signal) ? error.signal : null,
    killed: error?.killed === true,
  });
}

/** Host-only adapter for already-admitted publication. Constructing this object
 * does not read custody or grant authority. The caller must finish policy
 * admission before invoking it. No RPC input may supply this configuration.
 *
 * The existing password record must name this registry as provider, this Basic
 * account as owner, and one exact host/service environment consumer. A legacy
 * house-env or unrelated application's consumer is not publisher authority.
 * Credential bytes remain in the closure and ephemeral npm child environment.
 */
export function createNamedPublisherCredentialProvider({
  store, host, service, registry, publisher, passwordCredentialId,
  execFileImpl = nativeExecFile, fetchImpl = globalThis.fetch, requestTimeoutMs = 10_000,
} = {}) {
  if (typeof store?.records !== "function" || typeof store?.get !== "function" || typeof execFileImpl !== "function" || typeof fetchImpl !== "function"
    || !Number.isSafeInteger(requestTimeoutMs) || requestTimeoutMs <= 0 || requestTimeoutMs > 60_000
    || ![host, service, publisher, passwordCredentialId].every(nonempty)
    || publisher.includes(":")) throw refused();
  const authority = registryAuthority(registry);
  const binding = Object.freeze({ host, service, registry: authority, publisher, passwordCredentialId });

  function current() {
    const records = store.records();
    if (!Array.isArray(records)) throw refused();
    const matches = records.flatMap(record => (Array.isArray(record?.consumers) ? record.consumers : [])
      .filter(consumer => consumer?.host === host && consumer.service === service && consumer.variable === "NPM_PUBLISHER_PASSWORD")
      .map(consumer => ({ record, consumer })));
    if (matches.length !== 1) throw refused();
    const { record, consumer } = matches[0];
    if (records.filter(entry => entry?.id === passwordCredentialId).length !== 1
      || record.id !== passwordCredentialId || record.provider !== authority || record.owner !== publisher
      || record.kind !== "password" || !Array.isArray(record.holders) || !record.holders.includes(host)
      || consumer.file !== undefined || consumer.path !== undefined) throw refused();
    // Snapshot all selected metadata, including rotation/revocation witnesses.
    return structuredClone(record);
  }

  async function withConfiguredEnvironment(operation) {
    if (typeof operation !== "function") throw refused();
    let before, username, password;
    try {
      before = current();
      username = publisher;
      password = await store.get(passwordCredentialId, host);
      if (typeof password !== "string" || password.length === 0 || password.length > 65_536 || password.includes("\u0000")
        || !isDeepStrictEqual(current(), before)) throw refused();
    } catch { throw refused(); }

    let root, active = true;
    const lifetime = new AbortController();
    try {
      try {
        // npm whoami returns a configured Basic username without contacting the
        // server. Observe the serving owner's actual implemented endpoint instead.
        const endpoint = new URL("-/whoami", authority).href;
        const response = await fetchImpl(endpoint, { method: "GET", redirect: "error", signal: AbortSignal.timeout(requestTimeoutMs),
          headers: { accept: "application/json", authorization: `Basic ${Buffer.from(`${username}:${password}`, "utf8").toString("base64")}` } });
        if (response.status !== 200 || (response.url && response.url !== endpoint) || !response.body) {
          await response.body?.cancel(); throw refused();
        }
        const reader = response.body.getReader(), chunks = []; let size = 0;
        try {
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > 4096) { await reader.cancel(); throw refused(); }
            chunks.push(value);
          }
        } finally { reader.releaseLock(); }
        if (JSON.parse(Buffer.concat(chunks).toString("utf8"))?.username !== publisher || !isDeepStrictEqual(current(), before)) throw refused();
      } catch { throw refused(); }
      root = await mkdtemp(join(tmpdir(), "npm-named-publisher-"));
      const client = join(root, "client"), npmrc = join(root, "npmrc"), globalConfig = join(root, "global-npmrc");
      await mkdir(client, { mode: 0o700 });
      const scope = `//${new URL(authority).host}/`;
      await writeFile(npmrc, `registry=${authority}\n${scope}:username=\${NPM_PUBLISHER_USERNAME}\n${scope}:_password=\${NPM_PUBLISHER_PASSWORD_BASE64}\n`, { mode: 0o600, flag: "wx" });
      await writeFile(globalConfig, "", { mode: 0o600, flag: "wx" });
      const npmEnvironment = Object.freeze({
        HOME: root, NPM_CONFIG_USERCONFIG: npmrc, NPM_CONFIG_GLOBALCONFIG: globalConfig,
        NPM_CONFIG_CACHE: join(root, "cache"), NPM_CONFIG_IGNORE_SCRIPTS: "true",
        NPM_CONFIG_FETCH_RETRIES: "0", NPM_CONFIG_FETCH_TIMEOUT: String(requestTimeoutMs),
        NPM_CONFIG_UPDATE_NOTIFIER: "false", NPM_CONFIG_AUDIT: "false", NPM_CONFIG_FUND: "false",
        NPM_PUBLISHER_USERNAME: username, NPM_PUBLISHER_PASSWORD_BASE64: Buffer.from(password, "utf8").toString("base64"),
      });
      const privateValues = Object.freeze([password, npmEnvironment.NPM_PUBLISHER_PASSWORD_BASE64,
        Buffer.from(`${username}:${password}`, "utf8").toString("base64")]);
      const baseEnvironment = Object.fromEntries(["PATH", "SystemRoot", "WINDIR", "LANG", "LC_ALL", "TZ"].filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]));
      const scopedFetch = async target => {
        let url, response;
        try {
          if (!active || typeof target !== "string") throw refused();
          url = new URL(target);
          // The selected metadata URL is the actual request. Never re-resolve
          // metadata, forward credentials to another origin/protocol, or follow
          // a redirect. Caller headers, methods and transport options are not
          // authority and deliberately are not accepted by this port.
          if (url.href !== target || url.origin !== new URL(authority).origin
            || url.username || url.password || url.search || url.hash
            || !url.pathname.startsWith(new URL(authority).pathname)) throw refused();
          response = await fetchImpl(url.href, { method: "GET", redirect: "error",
            signal: AbortSignal.any([lifetime.signal, AbortSignal.timeout(requestTimeoutMs)]),
            headers: { accept: "application/octet-stream", authorization: `Basic ${Buffer.from(`${username}:${password}`, "utf8").toString("base64")}` } });
          if (!active || response.redirected || (response.url && response.url !== url.href)
            || (response.status >= 300 && response.status < 400)) throw refused();
          // Do not let transport exceptions carry private request diagnostics
          // through a later body read. The existing receiver owns byte bounds
          // and digest verification; this wrapper only bounds authority/lifetime.
          if (!response.body) return response;
          const reader = response.body.getReader();
          const body = new ReadableStream({
            async pull(controller) {
              try {
                if (!active) throw refused();
                const { value, done } = await reader.read();
                if (!active) throw refused();
                if (done) { reader.releaseLock(); controller.close(); }
                else controller.enqueue(value);
              } catch {
                try { await reader.cancel(); reader.releaseLock(); } catch {}
                controller.error(refused());
              }
            },
            async cancel() { try { await reader.cancel(); reader.releaseLock(); } catch {} },
          });
          return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
        } catch {
          try { await response?.body?.cancel(); } catch {}
          throw refused();
        }
      };
      const scopedExecFile = async (command, arguments_, options = {}) => {
        if (!active || !Array.isArray(arguments_) || !["npm", "pnpm", "tar"].includes(command)) throw refused();
        const args = [...arguments_];
        if (command !== "tar") {
          const registries = args.flatMap((arg, index) => arg === "--registry" ? [args[index + 1]] : /^--(?:@[^:]+:)?registry=/u.test(arg) ? [arg.slice(arg.indexOf("=") + 1)] : []);
          if (registries.length === 0 || registries.some(value => value !== authority)
            || !["whoami", "view", "pack", "publish"].includes(args[0])
            || args.some(arg => /^--(?:userconfig|globalconfig|cache|prefix|location|_auth|node-options|script-shell)(?:=|$)/iu.test(arg))) throw refused();
          // npm pack's output belongs in the receiver's staging directory, but
          // its config lookup must still start in our empty client directory.
          if (args[0] === "pack" && options.cwd !== undefined) {
            if (!isAbsolute(options.cwd) || args.some(arg => arg.startsWith("--pack-destination"))) throw refused();
            args.push("--pack-destination", options.cwd);
          }
        }
        let receivingCache;
        try {
          // Publishing can populate npm's cache with the very bytes awaiting
          // independent receiving. A pack must start with its own empty cache,
          // forcing this invocation to observe the registry's actual artifact.
          if (command === "npm" && args[0] === "pack") receivingCache = await mkdtemp(join(root, "receiving-cache-"));
          return await execFileImpl(command, args, { ...options, cwd: client,
            env: command === "tar" ? { ...baseEnvironment, HOME: root } : { ...baseEnvironment, ...npmEnvironment,
              ...(receivingCache ? { NPM_CONFIG_CACHE: receivingCache } : {}) } });
        } catch (error) { throw commandFailure(error, privateValues); }
        finally { if (receivingCache) await rm(receivingCache, { recursive: true, force: true }); }
      };
      // Recheck after asynchronous filesystem preparation, immediately before
      // handing control to the admitted effect/claim owner.
      try { if (!isDeepStrictEqual(current(), before)) throw refused(); } catch { throw refused(); }
      return await operation({ npmEnvironment, binding, execFileImpl: scopedExecFile, fetchImpl: scopedFetch });
    } finally {
      active = false;
      lifetime.abort();
      username = undefined; password = undefined;
      if (root) await rm(root, { recursive: true, force: true });
    }
  }
  return Object.freeze({ withConfiguredEnvironment });
}
