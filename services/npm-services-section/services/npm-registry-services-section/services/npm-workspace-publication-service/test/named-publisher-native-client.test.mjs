import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import test from "node:test";
import { createNamedPublisherCredentialProvider } from "../src/named-publisher-credential.mjs";

const run = promisify(execFile);

test("the native npm client carries only the selected Basic account and retains HTTP refusal codes", async t => {
  for (const status of [201, 413, 503]) await t.test(String(status), async t => {
    const root = await mkdtemp(join(tmpdir(), "npm-named-native-fixture-"));
    t.after(() => rm(root, { recursive: true, force: true }));
    const name = "@fixture/native-publisher", version = "0.1.0-dev.0";
    await mkdir(join(root, "package"));
    await writeFile(join(root, "package", "package.json"), JSON.stringify({ name, version, files: ["index.mjs"] }));
    await writeFile(join(root, "package", "index.mjs"), "export const fixture = true;\n");
    const artifact = join(root, "fixture.tgz");
    await run("tar", ["-czf", artifact, "-C", root, "package"]);
    const expectedArchive = await readFile(artifact);
    const publisher = "fixture-publisher", password = "disposable-native-fixture-password";
    const expectedAuth = `Basic ${Buffer.from(`${publisher}:${password}`).toString("base64")}`;
    let puts = 0, identityReads = 0, receivedArchive;
    const server = createServer(async (request, response) => {
      if (request.headers.authorization !== expectedAuth) {
        response.writeHead(401, { "content-type": "application/json" }).end('{"error":"unauthorized"}');
        return;
      }
      if (request.method === "GET" && request.url === "/-/whoami") {
        identityReads++;
        response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ username: publisher }));
        return;
      }
      if (request.method !== "PUT") {
        response.writeHead(404, { "content-type": "application/json" }).end('{"error":"not found"}');
        return;
      }
      puts++;
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const document = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      receivedArchive = Buffer.from(Object.values(document._attachments)[0].data, "base64");
      response.writeHead(status, { "content-type": "application/json" })
        .end(JSON.stringify(status === 201 ? { ok: true, id: name, rev: "fixture" } : { error: "disposable fixture refusal" }));
    });
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    t.after(() => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); });
    const registry = `http://127.0.0.1:${server.address().port}/`, host = "fixture-host", service = "fixture-service", id = "fixture.password";
    const records = [{ id, provider: registry, owner: publisher, kind: "password", holders: [host], consumers: [{ host, service, variable: "NPM_PUBLISHER_PASSWORD" }] }];
    const provider = createNamedPublisherCredentialProvider({ store: { records: () => records, get: async () => password }, registry, publisher, host, service, passwordCredentialId: id, requestTimeoutMs: 30_000 });
    await provider.withConfiguredEnvironment(async ({ execFileImpl }) => {
      const publish = () => execFileImpl("npm", ["publish", artifact, "--ignore-scripts", "--provenance=false", "--tag", "preview", "--json", "--registry", registry, `--@fixture:registry=${registry}`], { timeout: 60_000, encoding: "utf8" });
      if (status === 201) await publish();
      else await assert.rejects(publish(), error => {
        assert.equal(error.code, `E${status}`);
        assert.equal(error.exitCode, 1);
        assert.equal(error.killed, false);
        assert.ok(!JSON.stringify(error).includes(password));
        return true;
      });
    });
    assert.equal(identityReads, 1);
    assert.equal(puts, 1);
    assert.deepEqual(receivedArchive, expectedArchive);
  });
});
