import assert from "node:assert/strict";
import { test } from "node:test";
import { publishBody, registryFixture } from "./support/registry.mjs";
import { packagedVersion } from "./support/tarball.mjs";

const name = "@registry-fixture/capability";

test("a publish over the byte cap is refused 413 and stores nothing, whether or not it declares its length", async (t) => {
  const f = await registryFixture(t, { maxPublishBytes: 128 });
  const body = publishBody(packagedVersion(name, "1.0.0"), { origin: f.origin });
  assert.equal((await f.put(name, body)).status, 413);
  const chunked = await f.request(`/${encodeURIComponent(name)}`, { method: "PUT", headers: { "content-type": "application/json", authorization: (await import("./support/registry.mjs")).authorization }, body: new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(JSON.stringify(body))); c.close(); } }), duplex: "half" });
  assert.equal(chunked.status, 413, "a stream with no length is counted as it is read");
  assert.equal((await f.request(`/${encodeURIComponent(name)}`)).status, 404);
});

test("while the heap is near its limit a publish waits with 503 and Retry-After, and succeeds when it is not", async (t) => {
  let pressure = true;
  const f = await registryFixture(t, { heapPressure: () => pressure });
  const response = await f.publish(packagedVersion(name, "1.0.0"));
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("retry-after"), "30");
  pressure = false;
  assert.equal((await f.publish(packagedVersion(name, "1.0.0"))).status, 201);
});

test("a stored tarball is streamed from disk with its length, and its bytes are those published", async (t) => {
  const f = await registryFixture(t);
  const bytes = packagedVersion(name, "1.0.0");
  assert.equal((await f.publish(bytes)).status, 201);
  const response = await f.request(`/${encodeURIComponent(name)}/-/capability-1.0.0.tgz`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-length"), String(bytes.length));
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
  assert.equal((await f.request(`/${encodeURIComponent(name)}/-/capability-9.9.9.tgz`)).status, 404);
});

test("publishes are taken one at a time, so only one body is in memory", async (t) => {
  const f = await registryFixture(t);
  const [a, b] = await Promise.all([f.publish(packagedVersion(name, "1.0.0")), f.publish(packagedVersion(name, "1.1.0"))]);
  assert.deepEqual([a.status, b.status], [201, 201]);
  const packument = await (await f.request(`/${encodeURIComponent(name)}`)).json();
  assert.deepEqual(Object.keys(packument.versions).sort(), ["1.0.0", "1.1.0"]);
});
