import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import http from "node:http";
import https from "node:https";
import test from "node:test";
import { readRegistryPackage, receiveRegistryTarball } from "../src/registry.mjs";

// A host can configure its global agent with required proxy/TLS transport.
// Its refusal must reach these operations rather than being bypassed by a
// fresh direct-connection agent. No external network or credentials are used.
async function withRefusingGlobalAgent(transport, run) {
  const previous = transport.globalAgent;
  const agent = new transport.Agent();
  const refusal = new Error("configured registry transport refused this request");
  const requests = [];
  agent.addRequest = request => {
    requests.push({ path: request.path, connection: request.getHeader("connection") });
    queueMicrotask(() => request.emit("error", refusal));
  };
  transport.globalAgent = agent;
  try {
    await run({ requests, refusal });
  } finally {
    transport.globalAgent = previous;
    agent.destroy();
  }
}

test("registry metadata respects configured HTTP and HTTPS global transports", async () => {
  for (const [protocol, transport] of [["http", http], ["https", https]]) {
    await withRefusingGlobalAgent(transport, async ({ requests }) => {
      const observed = await readRegistryPackage(`${protocol}://127.0.0.1:1/`, "@fixture/provider");
      assert.deepEqual(observed, { found: false, reachable: false, packument: null });
      assert.ok(requests.length > 0, `${protocol} registry read bypassed the configured global agent`);
      assert.ok(requests.every(request => request.path === "/%40fixture%2Fprovider"));
      assert.ok(requests.every(request => request.connection === "close"));
    });
  }
});

test("registry tarball receiving preserves the configured HTTPS transport refusal", async () => {
  await withRefusingGlobalAgent(https, async ({ requests, refusal }) => {
    const integrity = `sha512-${createHash("sha512").update("fixture artifact").digest("base64")}`;
    await assert.rejects(receiveRegistryTarball({
      registry: "https://127.0.0.1:1/",
      tarball: "https://127.0.0.1:1/provider.tgz",
      integrity,
      destination: "/unused/configured-transport-refusal.tgz",
    }), error => error === refusal);
    assert.deepEqual(requests, [{ path: "/provider.tgz", connection: "close" }]);
  });
});
