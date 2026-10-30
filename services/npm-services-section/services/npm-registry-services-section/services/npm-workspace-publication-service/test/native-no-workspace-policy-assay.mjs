// Explicit native diagnostic: node --test test/native-no-workspace-policy-assay.mjs
// This checks PNPM 11.25's absent-policy behavior against a loopback fixture,
// not the Group's intentionally authored house-scope receiving policy.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';
import * as tar from 'tar';

const execute = promisify(execFile);
test('native PNPM 11.25 exit-zero policy creation is refused by original consumer refresh', async t => {
  const native = await execute('pnpm', ['--version']);
  assert.equal(native.stdout.trim(), '11.25.0', 'this historical native counterexample requires its exact toolchain');
  const root = await mkdtemp(join(tmpdir(), 'native-policy-custody-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const provider = join(root, 'provider'), directory = join(root, 'consumer');
  await mkdir(join(provider, 'package'), { recursive: true }); await mkdir(directory);
  const name = 'native-policy-custody-fixture', version = '1.0.0';
  await writeFile(join(provider, 'package/package.json'), JSON.stringify({ name, version }));
  const archive = join(root, 'provider.tgz');
  await tar.c({ file: archive, cwd: provider, gzip: true }, ['package']);
  const bytes = await readFile(archive), integrity = 'sha512-' + createHash('sha512').update(bytes).digest('base64');
  // Publication time is an explicit fixture input, not a changed system clock.
  const publishedAt = new Date().toISOString(); let registry;
  const server = createServer((request, response) => {
    if (request.url === '/provider.tgz') { response.writeHead(200); response.end(bytes); return; }
    if (request.url !== '/' + name) { response.writeHead(404); response.end(); return; }
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ name, 'dist-tags': { latest: version },
      time: { created: publishedAt, modified: publishedAt, [version]: publishedAt },
      versions: { [version]: { name, version, dist: { integrity, tarball: registry + 'provider.tgz' } } } }));
  });
  await new Promise(accept => server.listen(0, '127.0.0.1', accept));
  t.after(() => new Promise(accept => server.close(accept)));
  registry = `http://127.0.0.1:${server.address().port}/`;
  const manifest = { name: 'native-policy-consumer', version: '1.0.0', private: true,
    packageManager: 'pnpm@11.25.0', dependencies: { [name]: version } };
  const manifestBytes = JSON.stringify(manifest);
  await writeFile(join(directory, 'package.json'), manifestBytes);
  await writeFile(join(directory, '.npmrc'), 'registry=' + registry + '\n');
  const publisher = new URL('../scripts/publish-package.mjs', import.meta.url).href;
  const program = `import {refreshConsumerInstall} from ${JSON.stringify(publisher)};
  try {await refreshConsumerInstall(${JSON.stringify({ packageDir: directory, manifest, registry, scratchRoot: join(root, 'cache') })});throw Error('native drift was admitted');}
  catch(error){if(error.code!=='INSTALL_INPUT_CUSTODY_CHANGED')throw error;console.log(JSON.stringify(error.evidence));}`;
  const env = { ...process.env, npm_config_ignore_scripts: 'true', CI: 'true' };
  delete env.NODE_TEST_CONTEXT; delete env.NODE_TEST_WORKER_ID;
  const result = await execute(process.execPath, ['--input-type=module', '-e', program], { env, timeout: 60000 });
  const evidence = JSON.parse(result.stdout);
  assert.equal(evidence.nativeOutcome.status, 0);
  assert.deepEqual(evidence.paths, ['pnpm-workspace.yaml']);
  assert.equal(await readFile(join(directory, 'package.json'), 'utf8'), manifestBytes);
  const policy = await readFile(join(directory, 'pnpm-workspace.yaml'), 'utf8');
  assert.match(policy, /minimumReleaseAgeExclude/u);
  assert(policy.includes(name + '@' + version));
  t.diagnostic(JSON.stringify({ nativeVersion: native.stdout.trim(), publishedAt, integrity, evidence, retainedPolicy: policy }));
});
