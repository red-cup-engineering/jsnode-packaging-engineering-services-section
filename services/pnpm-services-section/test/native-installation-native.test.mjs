// Original PNPM loopback qualification. No public registry, store alias writer,
// lifecycle execution, or production consumer is selected by this fixture.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp, mkdir, writeFile, readFile, readdir, lstat, statfs, realpath} from 'node:fs/promises';
import {join, dirname, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {DatabaseSync} from 'node:sqlite';
import {createNativeInstallationService} from '@red-cup-engineering/pnpm-engineering-services-section/native-installation';
import {projectNativeMetadataQuery, receiveNativeMetadataFile} from '@red-cup-engineering/pnpm-engineering-services-section/native-metadata-preparation';
const execute = promisify(execFile), sha = bytes => createHash('sha256').update(bytes).digest('hex');
const pnpmEntry = process.env.QUALIFIED_PNPM_ENTRY, publicationModule = process.env.PUBLICATION_RECEIVER_MODULE;
const fixtureRoot = process.env.NATIVE_REUSE_FIXTURE_ROOT;
const enabled = Boolean(pnpmEntry && publicationModule && fixtureRoot);
const version = '1.0.0', name = '@fixture/received-native-provider', fallbackName = '@fixture/unselected-native-provider';
const limits = {members: 100, bytes: 1048576, archiveBytes: 1048576, tarBytes: 1048576, metadataBytes: 65536, sourcePaths: 100, sourceRepositories: 1};
const encode = value => JSON.stringify(value, null, 2) + '\n';
const absence = async path => { try { await lstat(path); return false; } catch (error) { if (error.code === 'ENOENT') return true; throw error; } };

async function indexReceipt(store, integrity, packageName) {
  const path = join(store, 'v11', 'index.db');
  if (await absence(path)) return {present: false, databaseAbsent: true};
  // Original read-only WAL-aware connection. No immutable URI/checkpoint/write.
  const db = new DatabaseSync(path, {readOnly: true});
  try {
    db.exec('PRAGMA busy_timeout=1000'); db.exec('BEGIN');
    const key = integrity + '\t' + packageName + '@' + version;
    const row = db.prepare('SELECT data FROM package_index WHERE key = ?').get(key);
    const keys = db.prepare('SELECT key FROM package_index').all().map(row => row.key);
    assert.ok(keys.length <= 4); assert.equal(keys.some(value => value.includes('file:')), false);
    db.exec('COMMIT');
    return {present: Boolean(row), key, dataSHA256: row ? sha(Buffer.from(row.data)) : null, keys};
  } finally { db.close(); }
}

test('received registry archive composes with original native store, policy and installed comparison', {skip: !enabled, timeout: 840000}, async t => {
  assert.equal(process.version, 'v24.19.0');
  assert.equal(Object.hasOwn(process.env, 'NODE_AUTH_TOKEN'), false, 'credential-bearing fixture refused');
  assert.equal(Object.hasOwn(process.env, 'NODE_OPTIONS'), false, 'ambient Node options refused');
  assert.equal(sha(await readFile(resolve(pnpmEntry, '../../dist/pnpm.mjs'))), 'e3738fda08262f74611d7a1ffc11b3e87fa52b466c07eb73211d179ebcb98810');
  const available = await statfs(fixtureRoot); assert.ok(available.bavail * available.bsize >= 256 * 1024 * 1024 && available.ffree >= 2000);
  const root = await mkdtemp(join(fixtureRoot, 'native-reuse-'));
  const configHome = join(root, 'config'), authFile = join(root, 'empty-auth');
  await mkdir(join(configHome, 'pnpm'), {recursive: true}); await writeFile(join(configHome, 'pnpm', 'config.yaml'), '# deliberately empty native globals\n'); await writeFile(authFile, '');
  const environment = {XDG_CONFIG_HOME: configHome, XDG_CACHE_HOME: join(root, 'xdg-cache'), PNPM_CONFIG_NPMRC_AUTH_FILE: authFile, pnpm_config_npmrc_auth_file: authFile};
  // Synthetic context isolation only; preserve every transport, registry and TLS input.
  const contextNames = Object.keys(process.env).filter(name => /^(?:npm|pnpm)[_.-]config[_.-](?:prefix|global|global[_.-]?dir|dir|workspace[_.-]?dir|workspace[_.-]?root|workspace|ignore[_.-]?workspace|lockfile[_.-]?dir|pnpmfile|global[_.-]?pnpmfile|(?:no[_.-]?)?ignore[_.-]?pnpmfile|config[_.-]?dependencies|recursive|filter(?:[_.-]?prod)?)$/iu.test(name));
  const savedContext = new Map(contextNames.map(name => [name, process.env[name]]));
  for (const name of contextNames) delete process.env[name];
  t.after(() => { for (const [name, value] of savedContext) process.env[name] = value; });
  const oldEnvironment = Object.fromEntries(Object.keys(environment).map(key => [key, process.env[key]])); Object.assign(process.env, environment);
  t.after(() => { for (const [key, value] of Object.entries(oldEnvironment)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });
  const runtimePath = process.env.NATIVE_READER_CLOSURE;
  assert.ok(runtimePath, 'explicit independently received reader runtime custody required');
  const runtimeBytes = await readFile(runtimePath);
  assert.equal(sha(runtimeBytes), 'f21e8c24d9bbc690022d2ad9fb9725fd2a5df7ff129cbf2403ce99a048a0e792');
  const runtime = JSON.parse(runtimeBytes);
  assert.equal(runtime.packages.length, 94); assert.equal(runtime.files.length, 2398);
  assert.equal(runtime.bytes, 12289361); assert.equal(runtime.bindings.length, 320);
  for (const binding of runtime.bindings) assert.equal(await realpath(binding.path), binding.target);
  for (const file of runtime.files) {
    assert.equal(await realpath(file.path), file.path);
    assert.equal(sha(await readFile(file.path)), file.sha256);
  }
  // Receive existing supplier bytes and native path bindings BEFORE import.
  const publication = await import(pathToFileURL(publicationModule).href);
  const publisherRoot = resolve(dirname(publicationModule), '..'), publisherManifest = JSON.parse(await readFile(join(publisherRoot, 'package.json')));
  const readerFiles = [join(publisherRoot, 'package.json'), ...(await readdir(dirname(publicationModule))).filter(file => file.endsWith('.mjs')).map(file => join(dirname(publicationModule), file))].sort();
  const readerClosure = [...await Promise.all(readerFiles.map(async path => ({path, sha256: sha(await readFile(path))}))), ...runtime.files.map(({path, sha256}) => ({path, sha256}))];
  const archiveReader = {read: publication.readRegistryArchiveMembers, supplier: {name: publisherManifest.name, version: publisherManifest.version,
    publicExport: './source-registry-closure', member: 'readRegistryArchiveMembers', closure: readerClosure, bindings: runtime.bindings}};
  const artifacts = new Map();
  for (const packageName of [name, fallbackName]) {
    const base = join(root, packageName.split('/')[1]), producer = join(base, 'package'); await mkdir(producer, {recursive: true});
    const manifest = {name: packageName, version, type: 'module', exports: './index.js'};
    await writeFile(join(producer, 'package.json'), encode(manifest)); await writeFile(join(producer, 'index.js'), 'export const received = true;\n');
    const path = join(base, 'producer.tgz'); await execute('/usr/bin/tar', ['-czf', path, '-C', base, 'package'], {timeout: 5000, maxBuffer: 65536});
    const bytes = await readFile(path); artifacts.set(packageName, {path, bytes, integrity: 'sha512-' + createHash('sha512').update(bytes).digest('base64'), manifest});
  }
  const selected = artifacts.get(name);
  let mode = 'online', counters = {metadata: 0, attestation: 0, selectedArchive: 0, fallbackArchive: 0, unexpected: 0, forbidden: 0};
  const unexpectedRequests = [];
  const sockets = new Set();
  const server = createServer((request, response) => {
    let path; try { path = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname); } catch { counters.unexpected++; response.writeHead(400).end(); return; }
    if (mode === 'offline') { counters.forbidden++; response.writeHead(503).end(); return; }
    for (const [packageName, artifact] of artifacts) {
      if (path === '/' + packageName) {
        counters.metadata++; if (mode === 'policy-wait') return;
        const dist = {integrity: artifact.integrity, tarball: registry + packageName + '/-/' + packageName.split('/')[1] + '-' + version + '.tgz'};
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify({name: packageName, 'dist-tags': {latest: '2.0.0'},
          time: {created: '2020-01-01T00:00:00.000Z', modified: '2020-01-01T00:00:00.000Z', [version]: '2020-01-01T00:00:00.000Z', '2.0.0': '2020-01-01T00:00:00.000Z'},
          versions: {[version]: {...artifact.manifest, dist}, '2.0.0': {...artifact.manifest, version: '2.0.0', dist}}})); return;
      }
      if (path === '/-/npm/v1/attestations/' + packageName + '@' + version) { counters.attestation++; response.writeHead(404).end(); return; }
      if (path === '/' + packageName + '/-/' + packageName.split('/')[1] + '-' + version + '.tgz') {
        counters[packageName === name ? 'selectedArchive' : 'fallbackArchive']++;
        // Every selected archive request is a qualification failure, even though
        // fallback delivery remains available to the ORIGINAL unselected path.
        if (packageName === name) { response.writeHead(503).end(); return; }
        response.setHeader('content-length', artifact.bytes.length); response.end(artifact.bytes); return;
      }
    }
    if (unexpectedRequests.length < 32) unexpectedRequests.push({method: /^[A-Z]{1,16}$/u.test(request.method ?? '') ? request.method : 'unclassified', path: /^[A-Za-z0-9_@./%+-]{1,256}$/u.test(path) ? path : 'unclassified-path'});
    counters.unexpected++; response.writeHead(404).end();
  });
  t.after(async () => writeFile(join(root, 'unexpected-requests.json'), encode({limit: 32, requests: unexpectedRequests, total: counters.unexpected, scope: 'synthetic loopback path only; no query, headers or body'})));
  server.on('connection', socket => {sockets.add(socket); socket.on('close', () => sockets.delete(socket));});
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { for (const socket of sockets) socket.destroy(); await new Promise(resolve => server.close(resolve)); });
  const registry = `http://127.0.0.1:${server.address().port}/`, tarball = registry + name + '/-/' + name.split('/')[1] + '-' + version + '.tgz';
  const baseService = createNativeInstallationService({qualificationRoot: root, archiveReader});
  const targets = [...artifacts.keys()].map(packageName => ({name: packageName, version, registry,
    tarball: registry + packageName + '/-/' + packageName.split('/')[1] + '-' + version + '.tgz'}));
  const policy = {minimumReleaseAge: 1440, minimumReleaseAgeStrict: true};
  const workspace = 'packages: []\nminimumReleaseAge: 1440\nminimumReleaseAgeStrict: true\n';
  const selection = [...artifacts].map(([packageName, artifact]) => ({name: packageName, version, registry, integrity: artifact.integrity}));
  async function fixture(label, {store, cache, mismatch, both = false} = {}) {
    const area = join(root, label), consumer = join(area, 'consumer'), logs = join(area, 'logs'), receipts = join(area, 'receipts');
    for (const dir of [consumer, logs, receipts]) await mkdir(dir, {recursive: true});
    const packages = both ? [name, fallbackName] : [name];
    const manifest = encode({name: 'fixture-' + label.toLowerCase(), version: '0.0.0', dependencies: Object.fromEntries(packages.map(key => [key, version]))});
    const lock = "lockfileVersion: '9.0'\nsettings:\n  autoInstallPeers: true\n  excludeLinksFromLockfile: false\nimporters:\n  .:\n    dependencies:\n"
      + packages.map(key => `      '${key}':\n        specifier: ${version}\n        version: ${version}\n`).join('') + 'packages:\n'
      + packages.map(key => `  '${key}@${version}':\n    resolution: {integrity: '${key === name && mismatch === 'integrity' ? 'sha512-' + createHash('sha512').update('wrong locked bytes').digest('base64') : artifacts.get(key).integrity}'${key === name && mismatch === 'url' ? `, tarball: '${registry}wrong-locked-archive.tgz'` : ''}}\n`).join('')
      + 'snapshots:\n' + packages.map(key => `  '${key}@${version}': {}\n`).join('');
    const npmrc = `registry=${registry}\nupdate-notifier=false\n`;
    const inputs = {'package.json': manifest, 'pnpm-lock.yaml': lock, 'pnpm-workspace.yaml': workspace, '.npmrc': npmrc};
    for (const [file, text] of Object.entries(inputs)) await writeFile(join(consumer, file), text);
    return {area, consumer, logs, receipts, store: store ?? join(area, 'store'), cache: cache ?? join(area, 'cache'), inputs};
  }
  async function receive(f, {reuse = true, offline = false, timeout = 20000, service = baseService, maximumEvents = 512, compare = false, observe = true} = {}) {
    const beforeCounters = {...counters};
    const request = {...(observe ? {observation: {receiptDirectory: f.receipts, targets, maximumEvents, maximumBytes: 262144}} : {}),
      ...(reuse ? {artifactReuse: {receiptDirectory: f.receipts, entries: [{name, version, registry, tarball, integrity: selected.integrity, archivePath: selected.path, limits}]}} : {})};
    const result = await publication.receiveSourceRegistryConsumers({consumerPaths: [join(f.consumer, 'package.json')], releases: compare ? [{name, version, integrity: selected.integrity, artifactDownloaded: true}] : [], logDirectory: f.logs,
      pnpm: process.execPath, pnpmArguments: [resolve(pnpmEntry), `--store-dir=${f.store}`, `--config.cache-dir=${f.cache}`,
        '--network-concurrency=1', '--fetch-retries=0', '--fetch-timeout=5000', ...(offline ? ['--offline'] : [])],
      installationTimeout: timeout, readMemoryPressure: async () => 0, nativeExecution: {service, request},
      artifactReceiptDirectory: f.receipts, artifactReceiving: compare ? [{consumer: JSON.parse(f.inputs['package.json']).name,
        name, version, registry, archive: {path: selected.path, integrity: selected.integrity}, limits}] : []});
    await writeFile(join(f.receipts, 'result.json'), encode(result));
    for (const [file, text] of Object.entries(f.inputs)) assert.equal(await readFile(join(f.consumer, file), 'utf8'), text);
    const received = result.packages[0] ?? result.refusals[0];
    const evidence = received?.execution?.path ? JSON.parse(await readFile(received.execution.path)) : null;
    assert.equal(counters.unexpected, beforeCounters.unexpected); assert.equal(counters.selectedArchive, beforeCounters.selectedArchive);
    return {result, evidence};
  }
  let first, firstAccepted = false;
  await t.test('A native intake persists the ORIGINAL registry key, while unselected fetching and strict policy remain native', async () => {
    first = await fixture('A', {both: true}); assert.equal((await indexReceipt(first.store, selected.integrity, name)).present, false);
    const {result, evidence} = await receive(first, {compare: true});
    assert.equal(result.refusals.length, 0, JSON.stringify(result)); assert.equal(result.packages.length, 1);
    assert.equal(evidence.admission.accepted, true);
    assert.equal(evidence.archiveReuse.entries[0].state, 'native-returned');
    assert.equal(evidence.archiveReuse.persistence, 'not-established-by-hook-return');
    assert.ok(counters.fallbackArchive > 0); assert.ok(counters.metadata > 0);
    assert.equal(result.packages[0].artifactReceiving.length, 1);
    const index = await indexReceipt(first.store, selected.integrity, name); assert.equal(index.present, true);
    await writeFile(join(first.receipts, 'native-index.json'), encode(index));
    // Bind actual native metadata production, not merely HTTP success or npm cache.
    for (const packageName of [name, fallbackName]) {
      const query = projectNativeMetadataQuery({name: packageName, selections: selection, policy, registry, directory: first.consumer, cacheDirectory: first.cache,
        canonical: {sourceHead: '1'.repeat(40), manifestSHA256: sha(first.inputs['package.json']), lockSHA256: sha(first.inputs['pnpm-lock.yaml']),
          workspaceSHA256: sha(workspace), registryConfigurationSHA256: sha(first.inputs['.npmrc']), selectionSHA256: sha(encode(selection))}});
      const file = await receiveNativeMetadataFile(query); assert.equal(file.fileObserved, true); assert.equal(file.rawCoverage.complete, true);
      await writeFile(join(first.receipts, packageName.split('/')[1] + '-metadata.json'), encode(file));
      // B's original strict offline installer is the native reader. Do not add
      // a second metadata-producing/outdated operation to this archive assay.
    }
    firstAccepted = true;
  });
  mode = 'online';
  await t.test('B later native offline reuse works WITHOUT the archive hook and receives installed bytes', {skip: !firstAccepted}, async () => {
    assert.ok(first); mode = 'offline';
    const f = await fixture('B', {both: true, store: first.store, cache: first.cache});
    const {result, evidence} = await receive(f, {reuse: false, offline: true, compare: true});
    assert.equal(result.refusals.length, 0, JSON.stringify(result)); assert.equal(result.packages.length, 1);
    assert.equal(evidence.admission.requiredArchiveReuse, false); assert.equal(Object.hasOwn(evidence, 'archiveReuse'), false);
    assert.equal(result.packages[0].artifactReceiving.length, 1); assert.equal(counters.forbidden, 0);
    assert.equal((await indexReceipt(first.store, selected.integrity, name)).present, true); mode = 'online';
  });
  mode = 'online';
  await t.test('existing native store can skip a selected hook without claiming archive consumption', {skip: !firstAccepted}, async () => {
    mode = 'offline';
    const f = await fixture('cached-with-hook', {both: true, store: first.store, cache: first.cache});
    const {result, evidence} = await receive(f, {offline: true, compare: true});
    assert.equal(result.refusals.length, 0, JSON.stringify(result));
    assert.equal(evidence.admission.accepted, true);
    assert.ok(['not-invoked', 'selected-not-delegated'].includes(evidence.archiveReuse.entries[0].state));
    assert.equal(evidence.archiveReuse.events.some(event => event.event === 'delegated'), false);
    assert.equal(result.packages[0].artifactReceiving.length, 1);
    assert.equal(counters.forbidden, 0); mode = 'online';
  });
  mode = 'online';
  for (const mismatch of ['integrity', 'url']) await t.test('wrong native locked ' + mismatch + ' refuses without archive fallback', async () => {
    const f = await fixture('wrong-' + mismatch, {mismatch});
    const {result, evidence} = await receive(f);
    assert.equal(result.packages.length, 0); assert.equal(evidence.admission.accepted, false);
    assert.ok(evidence.archiveReuse.events.some(event => event.event === 'refused' && event.code === 'native-selection-mismatch'));
    assert.equal(await absence(join(f.consumer, 'node_modules')), true);
  });
  await t.test('original frozen PNPM refuses a graph-affecting hooks object absent from lock checksum', async () => {
    const f = await fixture('checksum-hook'), hook = join(f.area, 'negative-hooks.mjs');
    await writeFile(hook, 'export const hooks = {readPackage(pkg) {return {...pkg, fixtureChanged: true};}};\n');
    const before = {...counters}; let outcome;
    try { outcome = await execute(process.execPath, [resolve(pnpmEntry), '--dir', f.consumer,
      `--store-dir=${f.store}`, `--config.cache-dir=${f.cache}`, 'install', '--ignore-scripts', '--frozen-lockfile',
      '--network-concurrency=1', '--fetch-retries=0', '--fetch-timeout=5000', `--pnpmfile=${hook}`],
      {cwd: f.consumer, env: {...process.env}, timeout: 10000, maxBuffer: 1048576}); }
    catch (error) { outcome = error; }
    await writeFile(join(f.receipts, 'original-frozen-checksum.json'), encode({code: outcome.code ?? 0, signal: outcome.signal ?? null, stdout: outcome.stdout, stderr: outcome.stderr, hookSHA256: sha(await readFile(hook))}));
    assert.equal(outcome.code, 1); assert.match(outcome.stdout + outcome.stderr, /ERR_PNPM_LOCKFILE_CONFIG_MISMATCH/u);
    assert.match(outcome.stdout + outcome.stderr, /pnpmfileChecksum/u);
    assert.equal(counters.selectedArchive, before.selectedArchive);
    assert.equal(await readFile(join(f.consumer, 'pnpm-lock.yaml'), 'utf8'), f.inputs['pnpm-lock.yaml']);
    assert.equal(await absence(join(f.consumer, 'node_modules')), true);
  });
  await t.test('snapshot mutation between preparation and invocation refuses without replacing the previous consumer', async () => {
    const f = await fixture('tamper'); await mkdir(join(f.consumer, 'node_modules')); await writeFile(join(f.consumer, 'node_modules', 'previous'), 'unchanged');
    let prepared;
    const service = {kind: baseService.kind, prepare: async input => prepared = await baseService.prepare(input),
      revalidate: async ticket => { const config = JSON.parse(await readFile(join(prepared.receiptDirectory, 'config.json'))); await writeFile(config.entries[0].snapshotPath, 'tampered'); return baseService.revalidate(ticket); },
      receive: (ticket, outcome) => baseService.receive(ticket, outcome)};
    const {result, evidence} = await receive(f, {service});
    assert.equal(result.packages.length, 0); assert.equal(evidence.native.invoked, false); assert.equal(evidence.admission.accepted, false);
    assert.equal(await readFile(join(f.consumer, 'node_modules', 'previous'), 'utf8'), 'unchanged');
  });
  await t.test('required archive evidence loss blocks replacement even after native success', async () => {
    const f = await fixture('required-loss'); await mkdir(join(f.consumer, 'node_modules')); await writeFile(join(f.consumer, 'node_modules', 'previous'), 'unchanged');
    let prepared;
    const service = {kind: baseService.kind, prepare: async input => prepared = await baseService.prepare(input), revalidate: ticket => baseService.revalidate(ticket),
      receive: async (ticket, outcome) => { await writeFile(join(prepared.receiptDirectory, 'events.ndjson'), '{partial'); return baseService.receive(ticket, outcome); }};
    const {result, evidence} = await receive(f, {service});
    assert.equal(evidence.native.code, 0); assert.equal(evidence.admission.accepted, false); assert.equal(result.packages.length, 0);
    assert.equal(await readFile(join(f.consumer, 'node_modules', 'previous'), 'utf8'), 'unchanged');
  });
  await t.test('archive reuse without observation uses the same original process and artifact receiving', async () => {
    const f = await fixture('reuse-only'); const {result, evidence} = await receive(f, {observe: false, compare: true});
    assert.equal(result.refusals.length, 0, JSON.stringify(result));
    assert.equal(evidence.admission.accepted, true); assert.equal(Object.hasOwn(evidence, 'observation'), false);
    assert.equal(evidence.archiveReuse.entries[0].state, 'native-returned');
    assert.equal(result.packages[0].artifactReceiving.length, 1);
  });
  await t.test('diagnostic observation loss remains nonfatal to required archive receiving', async () => {
    const f = await fixture('observation-loss'); const {result, evidence} = await receive(f, {maximumEvents: 1, compare: true});
    assert.equal(result.refusals.length, 0, JSON.stringify(result)); assert.equal(evidence.admission.accepted, true);
    assert.equal(evidence.observation.coverage.status, 'partial'); assert.equal(evidence.archiveReuse.entries[0].state, 'native-returned');
  });
  await t.test('interrupted policy wait retains private evidence and native store, not a completed installation', async () => {
    const f = await fixture('interrupted'); mode = 'policy-wait';
    const {result, evidence} = await receive(f, {timeout: 6000});
    assert.equal(result.packages.length, 0); assert.equal(evidence.native.signal, 'SIGTERM');
    assert.equal(evidence.admission.accepted, false); assert.equal(await absence(join(f.consumer, 'node_modules')), true);
    assert.ok(evidence.archiveReuse.events?.some(event => event.event === 'native-returned'));
    assert.equal((await readdir(f.logs)).some(path => path.startsWith('.registry-install-')), false, 'original receiver cleans its disposable staging');
    const retained = await readdir(f.receipts); assert.ok(retained.some(path => path.startsWith('.pnpm-archive-reuse-')));
    await writeFile(join(f.receipts, 'settled-index.json'), encode(await indexReceipt(f.store, selected.integrity, name)));
    mode = 'online';
  });
  t.diagnostic(JSON.stringify({fixtureRoot: root, counters, provider: 'original-pnpm-11.28.5', sourceCompositionOnly: true}));
});
