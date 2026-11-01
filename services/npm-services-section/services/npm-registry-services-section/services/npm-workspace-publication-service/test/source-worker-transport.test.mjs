import test from "node:test";
import assert from "node:assert/strict";
import { sourceWorkerTransport } from "../src/source-worker-transport.mjs";

test("launch transport preserves native endpoint values while excluding service and npm credentials", () => {
  const transport = { HTTP_PROXY: "http://proxy.example:8889", HTTPS_PROXY: "http://proxy.example:8889",
    http_proxy: "http://proxy.example:8889", NO_PROXY: "localhost,127.0.0.1,.example,[::1]",
    NODE_EXTRA_CA_CERTS: "/runtime/cert.pem", SSL_CERT_FILE: "/runtime/cert.pem" };
  const original = { ...transport, GITHUB_TOKEN: "not-forwarded", NPM_TOKEN: "not-forwarded", CREDENTIALS_STORE: "not-forwarded",
    npm_config_registry: "https://unselected.invalid", NODE_OPTIONS: "--import=/unselected.mjs" };
  const received = sourceWorkerTransport(original);
  assert.deepEqual(received, transport);
  original.HTTPS_PROXY = "http://other.example:9000";
  assert.equal(received.HTTPS_PROXY, transport.HTTPS_PROXY);
  assert.ok(Object.isFrozen(received));
});

test("a new invocation can receive a different native endpoint without rewriting it", () => {
  for (const HTTPS_PROXY of ["http://127.0.0.1:19001", "http://127.0.0.1:19002/"])
    assert.equal(sourceWorkerTransport({ HTTPS_PROXY }).HTTPS_PROXY, HTTPS_PROXY);
  assert.deepEqual(sourceWorkerTransport({}), {});
  assert.deepEqual(sourceWorkerTransport({ HTTP_PROXY: "", HTTPS_PROXY: "", ALL_PROXY: "", http_proxy: "", https_proxy: "", all_proxy: "" }),
    { HTTP_PROXY: "", HTTPS_PROXY: "", ALL_PROXY: "", http_proxy: "", https_proxy: "", all_proxy: "" });
});

test("credentialed or malformed transport refuses without disclosing its value", () => {
  for (const value of ["http://secret-user:secret-password@proxy.example", "https://proxy.example/path", "https://proxy.example?secret-query", "file:///secret-path", "not-a-url", "http://proxy.example\n"]) {
    assert.throws(() => sourceWorkerTransport({ HTTPS_PROXY: value }), error => {
      assert.doesNotMatch(error.message, /secret-|not-a-url|proxy\.example/u);
      return true;
    });
  }
  assert.throws(() => sourceWorkerTransport({ NO_PROXY: "host\ncredential" }), /bounded host list/u);
  assert.throws(() => sourceWorkerTransport({ NODE_EXTRA_CA_CERTS: "relative.pem" }), /absolute/u);
  let coerced = false;
  assert.throws(() => sourceWorkerTransport({ HTTPS_PROXY: { toString() { coerced = true; return "http://proxy.example"; } } }), /credential-free/u);
  assert.equal(coerced, false, "transport validation must not invoke an object's coercion hook");
});
