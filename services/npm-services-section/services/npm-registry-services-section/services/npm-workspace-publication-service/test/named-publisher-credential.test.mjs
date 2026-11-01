import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import test from "node:test";
import { createNamedPublisherCredentialProvider } from "../src/named-publisher-credential.mjs";

const registry = "https://registry.example.test/";
const password = "disposable-fixture-password";
function fixture(extra = {}) {
  const host = "fixture-host", service = "npm-publication", publisher = "fixture-publisher";
  const records = [
    { id: "npm.fixture-password", provider: registry, owner: publisher, kind: "password", holders: [host], consumers: [{ host, service, variable: "NPM_PUBLISHER_PASSWORD" }], fingerprint: "fixture-password" },
  ];
  const reads = [], commands = [], requests = [];
  const store = { records: () => records, get: async (id, selectedHost) => { reads.push([id, selectedHost]); return password; } };
  const configuration = { store, host, service, registry, publisher, passwordCredentialId: records[0].id,
    execFileImpl: async (command, args, options) => { commands.push({ command, args, options }); return { stdout: JSON.stringify(publisher) }; },
    fetchImpl: async (url, options) => { requests.push({ url, options }); return Response.json({ username: publisher }); }, ...extra };
  return { configuration, records, reads, commands, requests, provider: createNamedPublisherCredentialProvider(configuration) };
}

test("registry and account binding reject unsafe or ambiguous host configuration", () => {
  const f = fixture();
  for (const registry of ["http://registry.example.test/", "https://user:pass@registry.example.test/", "https://registry.example.test/path/", "https://registry.example.test/?query=1", "https://registry.example.test/#fragment", "not-a-url"]) {
    assert.throws(() => createNamedPublisherCredentialProvider({ ...f.configuration, registry }), { code: "NPM_PUBLISHER_CUSTODY_UNAVAILABLE" });
  }
  assert.throws(() => createNamedPublisherCredentialProvider({ ...f.configuration, publisher: "account:other" }), { code: "NPM_PUBLISHER_CUSTODY_UNAVAILABLE" });
});

test("construction grants and reads nothing; named custody and actual identity precede callback", async () => {
  const f = fixture();
  assert.deepEqual(f.reads, []); assert.deepEqual(f.commands, []);
  let root;
  const result = await f.provider.withConfiguredEnvironment(async ({ npmEnvironment, binding, execFileImpl }) => {
    assert.equal(f.reads.length, 1); assert.equal(f.requests.length, 1); assert.equal(f.commands.length, 0);
    assert.equal(f.requests[0].url, `${registry}-/whoami`);
    assert.equal(f.requests[0].options.redirect, "error");
    assert.equal(binding.publisher, f.configuration.publisher);
    assert.ok(Object.isFrozen(binding));
    root = dirname(npmEnvironment.NPM_CONFIG_USERCONFIG);
    const config = await readFile(npmEnvironment.NPM_CONFIG_USERCONFIG, "utf8");
    assert.match(config, /\/\/registry\.example\.test\/:username=\$\{NPM_PUBLISHER_USERNAME\}/u);
    assert.match(config, /_password=\$\{NPM_PUBLISHER_PASSWORD_BASE64\}/u);
    assert.ok(!config.includes(password));
    assert.ok(!config.includes(Buffer.from(password).toString("base64")));
    assert.equal(await readFile(npmEnvironment.NPM_CONFIG_GLOBALCONFIG, "utf8"), "");
    await execFileImpl("npm", ["publish", "/tmp/fixture.tgz", `--registry=${registry}`, `--@fixture:registry=${registry}`]);
    return { received: true };
  });
  assert.deepEqual(result, { received: true });
  await assert.rejects(access(root), { code: "ENOENT" });
});

test("absent, unrelated, ambiguous, revoked and incorrectly typed bindings refuse before value reads", async t => {
  const cases = [
    ["absent", f => f.records.splice(0)],
    ["legacy application", f => { f.records[0].consumers[0].service = "koios-news"; }],
    ["wrong host", f => { f.records[0].consumers[0].host = "other-host"; }],
    ["wrong variable", f => { f.records[0].consumers[0].variable = "NODE_AUTH_TOKEN"; }],
    ["wrong registry", f => { f.records[0].provider = "https://unrelated.example/"; }],
    ["unattributed legacy record", f => { f.records[0].owner = null; f.records[0].provider = null; }],
    ["wrong publisher", f => { f.records[0].owner = "someone-else"; }],
    ["wrong kind", f => { f.records[0].kind = "token"; }],
    ["revoked host", f => { f.records[0].holders = []; }],
    ["file consumer", f => { f.records[0].consumers[0].file = "secret"; }],
    ["placed consumer", f => { f.records[0].consumers[0].path = "secret"; }],
    ["duplicate consumer", f => f.records[0].consumers.push({ ...f.records[0].consumers[0] })],
    ["duplicate record", f => f.records.push(structuredClone(f.records[0]))],
  ];
  for (const [label, change] of cases) await t.test(label, async () => {
    const f = fixture(); change(f); let entered = false;
    await assert.rejects(f.provider.withConfiguredEnvironment(() => { entered = true; }), { code: "NPM_PUBLISHER_CUSTODY_UNAVAILABLE" });
    assert.equal(entered, false); assert.deepEqual(f.reads, []); assert.deepEqual(f.commands, []);
  });
});

test("metadata drift during value read refuses before identity command or durable effect", async () => {
  const f = fixture(); let entered = false;
  f.configuration.store.get = async () => { f.records[0].fingerprint = "rotated"; return password; };
  await assert.rejects(f.provider.withConfiguredEnvironment(() => { entered = true; }), { code: "NPM_PUBLISHER_CUSTODY_UNAVAILABLE" });
  assert.equal(entered, false); assert.deepEqual(f.commands, []); assert.deepEqual(f.requests, []);
});

test("empty password and private custody exceptions never escape", async t => {
  for (const mode of ["empty-password", "throw"]) await t.test(mode, async () => {
    const f = fixture();
    f.configuration.store.get = async () => {
      if (mode === "throw") throw new Error(`private path and ${password}`);
      return "";
    };
    await assert.rejects(f.provider.withConfiguredEnvironment(() => assert.fail("must not claim")), error => error.code === "NPM_PUBLISHER_CUSTODY_UNAVAILABLE" && !String(error).includes(password));
    assert.deepEqual(f.commands, []); assert.deepEqual(f.requests, []);
  });
});

test("registry denial, another account and metadata drift during identity read refuse before callback", async t => {
  for (const mode of ["denied", "other-account", "metadata-drift", "oversized", "invalid-json", "redirect"]) await t.test(mode, async () => {
    let f;
    f = fixture({ fetchImpl: async (_url, options) => {
      assert.equal(options.redirect, "error");
      if (mode === "denied") return new Response("private denial", { status: 401 });
      if (mode === "redirect") throw new Error(`redirect private ${password}`);
      if (mode === "oversized") return new Response("x".repeat(4097));
      if (mode === "invalid-json") return new Response("private invalid content");
      if (mode === "metadata-drift") f.records[0].fingerprint = "changed";
      return Response.json({ username: mode === "other-account" ? "other" : f.configuration.publisher });
    } });
    await assert.rejects(f.provider.withConfiguredEnvironment(() => assert.fail("must not claim")), { code: "NPM_PUBLISHER_CUSTODY_UNAVAILABLE" });
    assert.deepEqual(f.commands, []);
  });
});

test("bound runner ignores ambient and callback-supplied credentials and project cwd", async t => {
  const original = process.env.NODE_AUTH_TOKEN;
  process.env.NODE_AUTH_TOKEN = "ambient-token-must-not-flow";
  t.after(() => { if (original === undefined) delete process.env.NODE_AUTH_TOKEN; else process.env.NODE_AUTH_TOKEN = original; });
  const f = fixture();
  await f.provider.withConfiguredEnvironment(async ({ execFileImpl }) => {
    await execFileImpl("npm", ["pack", "@fixture/a@0.1.0", "--json", "--registry", registry], { cwd: "/tmp/pack-output", env: { NODE_AUTH_TOKEN: "caller-token", NPM_CONFIG_USERCONFIG: "/tmp/wrong" } });
    const call = f.commands.at(-1);
    assert.equal(call.options.env.NODE_AUTH_TOKEN, undefined);
    assert.notEqual(call.options.env.NPM_CONFIG_USERCONFIG, "/tmp/wrong");
    assert.notEqual(call.options.cwd, "/tmp/pack-output");
    assert.equal(call.options.env.NPM_CONFIG_FETCH_RETRIES, "0");
    assert.deepEqual(call.args.slice(-2), ["--pack-destination", "/tmp/pack-output"]);
    await execFileImpl("tar", ["-xOf", "/tmp/fixture.tgz", "package/package.json"]);
    assert.equal(f.commands.at(-1).options.env.NPM_PUBLISHER_PASSWORD_BASE64, undefined);
    for (const args of [["whoami", "--registry", "https://other.example/"], ["whoami", "--registry", registry, "--userconfig=/tmp/wrong"]]) {
      await assert.rejects(execFileImpl("npm", args), { code: "NPM_PUBLISHER_CUSTODY_UNAVAILABLE" });
    }
  });
});

test("private subprocess errors retain only protocol failure codes", async () => {
  const f = fixture({ execFileImpl: async () => {
    throw Object.assign(new Error(`E403 private ${password}`), { stdout: `secret ${password}`, stderr: `E403 ${Buffer.from(password).toString("base64")}` });
  } });
  await f.provider.withConfiguredEnvironment(async ({ execFileImpl }) => {
    await assert.rejects(execFileImpl("npm", ["publish", "/tmp/fixture.tgz", "--registry", registry]), error => {
      assert.equal(error.code, "E403"); assert.equal(error.stderr, "E403");
      assert.equal(error.stdout, '{"error":{"code":"E403"}}');
      assert.ok(!JSON.stringify(error).includes(password)); return true;
    });
  });
});

test("every receiving pack has a fresh empty private cache, isolated from publication and caller state", async () => {
  const observed = [];
  const f = fixture({ execFileImpl: async (_command, args, options) => {
    const { readdir } = await import("node:fs/promises");
    observed.push({ verb: args[0], cache: options.env.NPM_CONFIG_CACHE });
    if (args[0] === "pack") assert.deepEqual(await readdir(options.env.NPM_CONFIG_CACHE), []);
    return { stdout: "[]" };
  } });
  await f.provider.withConfiguredEnvironment(async ({ npmEnvironment, execFileImpl }) => {
    await execFileImpl("npm", ["publish", "/tmp/fixture.tgz", "--registry", registry]);
    for (let n = 0; n < 2; n += 1) {
      await execFileImpl("npm", ["pack", "@fixture/a@0.1.0", "--registry", registry], { cwd: "/tmp/pack-output", env: { npm_config_cache: "/tmp/caller-cache" } });
      assert.notEqual(observed.at(-1).cache, npmEnvironment.NPM_CONFIG_CACHE);
      assert.notEqual(observed.at(-1).cache, "/tmp/caller-cache");
      await assert.rejects(access(observed.at(-1).cache), { code: "ENOENT" });
    }
    assert.equal(new Set(observed.map(entry => entry.cache)).size, 3);
  });
});

test("cleanup follows callback failure and an escaped scoped runner expires", async () => {
  const f = fixture(); let root, escaped;
  await assert.rejects(f.provider.withConfiguredEnvironment(async ({ npmEnvironment, execFileImpl }) => {
    root = dirname(npmEnvironment.NPM_CONFIG_USERCONFIG); escaped = execFileImpl;
    throw new Error("simulated uncertain publication");
  }), /simulated uncertain publication/u);
  await assert.rejects(access(root), { code: "ENOENT" });
  await assert.rejects(escaped("npm", ["whoami", "--registry", registry]), { code: "NPM_PUBLISHER_CUSTODY_UNAVAILABLE" });
});

test("each duplicate or restarted invocation rechecks current custody without cached authority", async () => {
  const f = fixture();
  await f.provider.withConfiguredEnvironment(async () => {});
  await f.provider.withConfiguredEnvironment(async () => {});
  const restarted = createNamedPublisherCredentialProvider(f.configuration);
  await restarted.withConfiguredEnvironment(async () => {});
  assert.equal(f.reads.length, 3); assert.equal(f.requests.length, 3);
  f.records[0].holders = [];
  await assert.rejects(f.provider.withConfiguredEnvironment(() => assert.fail("revoked")), { code: "NPM_PUBLISHER_CUSTODY_UNAVAILABLE" });
  await assert.rejects(restarted.withConfiguredEnvironment(() => assert.fail("revoked")), { code: "NPM_PUBLISHER_CUSTODY_UNAVAILABLE" });
  assert.equal(f.reads.length, 3);
});

test("scoped receiving fetch pins the exact HTTPS URL and privately owns method, headers and redirects", async () => {
  const requests = [], target = `${registry}@fixture/a/-/a-0.1.0.tgz`;
  const f = fixture({ fetchImpl: async (url, options) => {
    requests.push({ url, options });
    return url.endsWith("/-/whoami") ? Response.json({ username: "fixture-publisher" }) : new Response("exact fixture bytes");
  } });
  await f.provider.withConfiguredEnvironment(async ({ fetchImpl }) => {
    const response = await fetchImpl(target, { method: "POST", headers: { authorization: "caller-token" }, redirect: "follow", body: "caller-body", dispatcher: "caller-dispatcher" });
    assert.equal(await response.text(), "exact fixture bytes");
    const call = requests.at(-1);
    assert.equal(call.url, target); assert.equal(call.options.method, "GET");
    assert.equal(call.options.redirect, "error"); assert.equal(call.options.body, undefined); assert.equal(call.options.dispatcher, undefined);
    assert.equal(call.options.headers.authorization, `Basic ${Buffer.from(`fixture-publisher:${password}`).toString("base64")}`);
  });
});

test("scoped receiving fetch refuses downgrade, foreign and ambiguous URLs before credential transmission", async () => {
  const f = fixture();
  await f.provider.withConfiguredEnvironment(async ({ fetchImpl }) => {
    for (const target of ["http://registry.example.test/a.tgz", "https://foreign.example.test/a.tgz", "https://registry.example.test:444/a.tgz", "file:///tmp/a.tgz", "https://user:pass@registry.example.test/a.tgz", `${registry}a.tgz?q=1`, `${registry}a.tgz#fragment`, `${registry}a/../a.tgz`, new URL(`${registry}a.tgz`)]) {
      await assert.rejects(fetchImpl(target), { code: "NPM_PUBLISHER_CUSTODY_UNAVAILABLE" });
    }
    assert.equal(f.requests.length, 1);
  });
});

test("scoped receiving fetch refuses redirect responses and unexpected response origins", async t => {
  for (const mode of ["status", "redirected", "wrong-url"]) await t.test(mode, async () => {
    const requests = [];
    const f = fixture({ fetchImpl: async (url, options) => {
      requests.push({ url, options });
      if (url.endsWith("/-/whoami")) return Response.json({ username: "fixture-publisher" });
      const response = new Response("not followed", { status: mode === "status" ? 302 : 200, headers: { location: "http://registry.example.test/leak" } });
      if (mode === "redirected") Object.defineProperty(response, "redirected", { value: true });
      if (mode === "wrong-url") Object.defineProperty(response, "url", { value: "https://foreign.example.test/leak" });
      return response;
    } });
    await f.provider.withConfiguredEnvironment(async ({ fetchImpl }) => {
      await assert.rejects(fetchImpl(`${registry}a.tgz`), { code: "NPM_PUBLISHER_CUSTODY_UNAVAILABLE" });
    });
    assert.equal(requests.length, 2);
  });
});

test("scoped receiving transport and streaming errors cannot expose private diagnostics", async t => {
  for (const mode of ["request", "body"]) await t.test(mode, async () => {
    const f = fixture({ fetchImpl: async url => {
      if (url.endsWith("/-/whoami")) return Response.json({ username: "fixture-publisher" });
      if (mode === "request") throw new Error(`private ${password}`);
      return new Response(new ReadableStream({ start(controller) { controller.error(new Error(`private ${password}`)); } }));
    } });
    await f.provider.withConfiguredEnvironment(async ({ fetchImpl }) => {
      await assert.rejects(async () => { const response = await fetchImpl(`${registry}a.tgz`); await response.arrayBuffer(); }, error => {
        assert.equal(error.code, "NPM_PUBLISHER_CUSTODY_UNAVAILABLE"); assert.ok(!String(error).includes(password)); return true;
      });
    });
  });
});

test("escaped receiving fetch expires and aborts its transport when the callback closes", async () => {
  const f = fixture(); let escaped, signal;
  await f.provider.withConfiguredEnvironment(async ({ fetchImpl }) => {
    escaped = fetchImpl;
    const response = await fetchImpl(`${registry}a.tgz`);
    signal = f.requests.at(-1).options.signal;
    await response.arrayBuffer(); assert.equal(signal.aborted, false);
  });
  assert.equal(signal.aborted, true);
  await assert.rejects(escaped(`${registry}a.tgz`), { code: "NPM_PUBLISHER_CUSTODY_UNAVAILABLE" });
  assert.equal(f.requests.length, 2);
});

test("invalid host request budgets refuse before custody access", () => {
  const f = fixture();
  for (const requestTimeoutMs of [0, -1, 1.5, 60_001, Number.NaN, Infinity, "30000", null]) {
    assert.throws(() => createNamedPublisherCredentialProvider({ ...f.configuration, requestTimeoutMs }), { code: "NPM_PUBLISHER_CUSTODY_UNAVAILABLE" });
  }
  assert.deepEqual(f.reads, []); assert.deepEqual(f.requests, []); assert.deepEqual(f.commands, []);
});

test("host budgets retain the default and bound the 30-second configured caller", async () => {
  for (const requestTimeoutMs of [undefined, 30_000, 60_000]) {
    const f = fixture({ ...(requestTimeoutMs === undefined ? {} : { requestTimeoutMs }) });
    await f.provider.withConfiguredEnvironment(async ({ npmEnvironment, fetchImpl, binding }) => {
      assert.equal(npmEnvironment.NPM_CONFIG_FETCH_TIMEOUT, String(requestTimeoutMs ?? 10_000));
      assert.equal(npmEnvironment.NPM_CONFIG_FETCH_RETRIES, "0");
      assert.equal(binding.publisher, "fixture-publisher");
      await (await fetchImpl(`${registry}a.tgz`)).arrayBuffer();
      assert.equal(f.requests.length, 2);
      assert.ok(f.requests.every(request => request.options.signal instanceof AbortSignal));
    });
  }
});

test("the selected host budget actually aborts identity and receiving requests", async t => {
  for (const stage of ["identity", "receiving"]) await t.test(stage, async () => {
    let aborted = false, entered = false;
    const f = fixture({ requestTimeoutMs: 5, fetchImpl: async (url, { signal }) => {
      if (stage === "receiving" && url.endsWith("/-/whoami")) return Response.json({ username: "fixture-publisher" });
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => resolve(Response.json({ username: "fixture-publisher" })), 100);
        signal.addEventListener("abort", () => { clearTimeout(timer); aborted = true; reject(new Error(`private ${password}`)); }, { once: true });
      });
    } });
    await assert.rejects(f.provider.withConfiguredEnvironment(async ({ fetchImpl }) => {
      entered = true;
      await fetchImpl(`${registry}artifact.tgz`);
    }), error => error.code === "NPM_PUBLISHER_CUSTODY_UNAVAILABLE" && !String(error).includes(password));
    assert.equal(aborted, true); assert.equal(entered, stage === "receiving");
  });
});

test("subprocess failures preserve only bounded public execution facts", async t => {
  const cases = [
    { label: "numeric termination", native: { code: 1, signal: "SIGTERM", killed: true }, expected: { code: "NPM_CONFIGURED_COMMAND_FAILED", exitCode: 1, systemCode: null, signal: "SIGTERM", killed: true } },
    { label: "missing executable", native: { code: "ENOENT" }, expected: { code: "NPM_CONFIGURED_COMMAND_FAILED", exitCode: null, systemCode: "ENOENT", signal: null, killed: false } },
    { label: "npm usage", native: { code: 1, stderr: `npm error code EUSAGE private ${password}` }, expected: { code: "EUSAGE", exitCode: 1, systemCode: null, signal: null, killed: false } },
    { label: "HTTP body limit", native: { code: 1, stderr: `npm error code E413 private ${password}` }, expected: { code: "E413", exitCode: 1, systemCode: null, signal: null, killed: false } },
    { label: "HTTP serving refusal", native: { code: 1, stderr: `npm error code E503 private ${password}` }, expected: { code: "E503", exitCode: 1, systemCode: null, signal: null, killed: false } },
    { label: "private native fields", native: { code: password, signal: password }, expected: { code: "NPM_CONFIGURED_COMMAND_FAILED", exitCode: null, systemCode: null, signal: null, killed: false } },
  ];
  for (const { label, native, expected } of cases) await t.test(label, async () => {
    const f = fixture({ execFileImpl: async () => { throw Object.assign(new Error(`private ${password}`), { stdout: password, env: { PASSWORD: password }, ...native }); } });
    await f.provider.withConfiguredEnvironment(async ({ execFileImpl }) => {
      await assert.rejects(execFileImpl("npm", ["publish", "/tmp/fixture.tgz", "--registry", registry]), error => {
        for (const [key, value] of Object.entries(expected)) assert.equal(error[key], value);
        assert.equal(error.stderr, expected.code);
        assert.equal(error.stdout, JSON.stringify({ error: { code: expected.code } }));
        assert.ok(!JSON.stringify(error).includes(password));
        assert.equal(error.env, undefined); return true;
      });
    });
  });
});

test("structured public npm codes exclude credential bytes and arbitrary diagnostics", async t => {
  const encodedPassword = Buffer.from(password).toString("base64");
  const encodedBasic = Buffer.from(`fixture-publisher:${password}`).toString("base64");
  const cases = [
    ["PUBLISH_SOURCE_REQUIRED", "PUBLISH_SOURCE_REQUIRED"],
    ["source-evidence-required", "source-evidence-required"],
    ["A".repeat(64), "A".repeat(64)],
    ["A".repeat(65), null],
    ["1INVALID", null], ["private path /tmp/config", null],
    [password, null], [password.toUpperCase(), null],
    [encodedPassword, null], [encodedBasic, null],
    [`PREFIX_${password}_SUFFIX`, null], [null, null],
  ];
  for (const [candidate, expected] of cases) await t.test(String(candidate), async () => {
    const f = fixture({ execFileImpl: async () => { throw Object.assign(new Error(`private ${password}`), {
      code: 1, stdout: JSON.stringify({ error: { code: candidate, summary: password, detail: "/private/config" } }), stderr: password,
    }); } });
    await f.provider.withConfiguredEnvironment(async ({ execFileImpl }) => {
      await assert.rejects(execFileImpl("npm", ["publish", "/tmp/fixture.tgz", "--registry", registry]), error => {
        assert.equal(error.reportedCode, expected);
        assert.ok(!JSON.stringify(error).includes(password));
        assert.ok(!JSON.stringify(error).includes(encodedPassword));
        assert.ok(!JSON.stringify(error).includes(encodedBasic));
        assert.ok(!JSON.stringify(error).includes("/private/config"));
        return true;
      });
    });
  });
});
