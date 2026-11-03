// Explicit original-provider qualification, not public-registry receiving.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, readFile, writeFile, rm, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createNativeObservationService } from '@red-cup-engineering/pnpm-engineering-services-section/native-observation';
const execute = promisify(execFile);
const pnpmEntry = process.env.QUALIFIED_PNPM_ENTRY;
const publicationModule = process.env.PUBLICATION_RECEIVER_MODULE;
const enabled = Boolean(pnpmEntry && publicationModule);
const name = '@fixture/native-phase-provider', version = '1.0.0';
const expectedDistribution = 'e3738fda08262f74611d7a1ffc11b3e87fa52b466c07eb73211d179ebcb98810';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

test('original PNPM distinguishes controlled archive and policy waits without replacing transport', { skip: !enabled, timeout: 90000 }, async t => {
  assert.equal(process.version, 'v24.19.0');
  assert.equal(process.env.NODE_AUTH_TOKEN === undefined, true, 'native fixture requires token absence');
  assert.equal(process.env.NODE_OPTIONS === undefined, true, 'native fixture requires explicit preload composition');
  assert.equal(sha(await readFile(resolve(pnpmEntry, '../../dist/pnpm.mjs'))), expectedDistribution);
  const publicationURL = pathToFileURL(resolve(publicationModule));
  const { receiveSourceRegistryConsumers } = await import(publicationURL);
  const { downloadConfiguredNpmRegistryTarball } = await import(new URL('./registry.mjs', publicationURL));
  const root = await mkdtemp(join(process.env.NATIVE_PHASE_FIXTURE_ROOT ?? tmpdir(), 'pnpm-native-phase-qualification-'));
  if (!process.env.NATIVE_PHASE_FIXTURE_ROOT) t.after(() => rm(root, { recursive: true, force: true }));
  else t.diagnostic(JSON.stringify({ retainedQualificationRoot: root, productionConsumerReceived: false }));
  // PNPM11 reads YAML globals via getConfigDir(XDG_CONFIG_HOME), not npm's globalconfig option.
  // This serial, isolated test worker supplies the existing reader's private inputs;
  // no production process, user configuration file or package-manager setting is changed.
  const configHome = join(root, 'configuration'), pnpmConfig = join(configHome, 'pnpm');
  await mkdir(pnpmConfig, { recursive: true });
  await writeFile(join(pnpmConfig, 'config.yaml'), '{}\n');
  const authFile = join(configHome, 'empty-auth-npmrc'), npmGlobal = join(configHome, 'empty-global-npmrc');
  await writeFile(authFile, ''); await writeFile(npmGlobal, '');
  const fixtureEnvironment = { XDG_CONFIG_HOME: configHome, PNPM_CONFIG_NPMRC_AUTH_FILE: authFile, pnpm_config_npmrc_auth_file: authFile };
  const previousEnvironment = Object.fromEntries(Object.keys(fixtureEnvironment).map(key => [key, process.env[key]]));
  Object.assign(process.env, fixtureEnvironment);
  t.after(() => { for (const [key, value] of Object.entries(previousEnvironment)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  } });
  const npmEnvironment = { NPM_CONFIG_USERCONFIG: authFile, NPM_CONFIG_GLOBALCONFIG: npmGlobal,
    NPM_CONFIG_CACHE: join(configHome, 'npm-cache'), NPM_CONFIG_UPDATE_NOTIFIER: 'false' };
  assert.equal((await execute('npm', ['--version'], { env: { ...process.env, ...npmEnvironment }, timeout: 5000, maxBuffer: 65536 })).stdout.trim(), '11.9.0');
  t.diagnostic(JSON.stringify({ fixtureConfiguration: { pnpmGlobalReader: 'getConfigDir/XDG_CONFIG_HOME/pnpm/config.yaml',
    pnpmAuthReader: 'getNpmrcAuthFile/PNPM_CONFIG_NPMRC_AUTH_FILE', npmGlobalReader: 'NPM_CONFIG_GLOBALCONFIG',
    npmUserReader: 'NPM_CONFIG_USERCONFIG', npmUpdateNotifier: false }, productionConfigurationChanged: false }));
  const packageRoot = join(root, 'producer', 'package'); await mkdir(packageRoot, { recursive: true });
  const fixtureManifest = { name, version, type: 'module', exports: './index.mjs', bin: { nativephase: './cli.mjs' } };
  await writeFile(join(packageRoot, 'package.json'), JSON.stringify(fixtureManifest) + '\n');
  await writeFile(join(packageRoot, 'cli.mjs'), '#!/usr/bin/env node\nconsole.log("fixture-only");\n', { mode: 0o755 });
  await writeFile(join(packageRoot, 'index.mjs'), 'export const qualifiedFixture = true;\n');
  const tarball = join(root, 'provider.tgz');
  await execute('/usr/bin/tar', ['-czf', tarball, '-C', join(root, 'producer'), 'package'], { timeout: 5000, maxBuffer: 65536 });
  const archive = await readFile(tarball), integrity = 'sha512-' + createHash('sha512').update(archive).digest('base64');

  await t.test('owned reader retains malformed, out-of-order and missing evidence as partial', async () => {
    const receipts = join(root, 'projection-receipts'); await mkdir(receipts);
    const service = createNativeObservationService();
    const plan = await service.prepare({ program: process.execPath, arguments: [resolve(pnpmEntry)], cwd: root,
      request: { receiptDirectory: receipts, targets: [{ name, version, registry: 'https://registry.example/', tarball: 'https://registry.example/provider.tgz' }] } });
    const events = join(plan.receiptDirectory, 'events.ndjson');
    const input = [
      { v: 1, seq: 1, ms: 0, event: 'ready', scope: 'main-process-undici' },
      { v: 1, seq: 2, ms: 1, event: 'response-headers', request: 1, name, version, endpoint: 'archive', status: 200, headers: 'secret-canary' },
      { v: 1, seq: 3, ms: 2, event: 'final', lost: false, fault: false, unclassified: 0 },
    ];
    await writeFile(events, input.map(x => JSON.stringify(x)).join('\n') + '\n');
    const outcome = { code: 0, signal: null, stdout: JSON.stringify({ name: 'pnpm:lockfile-verification', status: 'started', secret: 'secret-canary' }) + '\nnot-json\n', stderr: 'secret-canary' };
    const received = await service.receive(plan.session, outcome);
    assert.equal(received.evidence.coverage.status, 'partial');
    assert.equal(received.evidence.coverage.nativePartial, true);
    assert.equal(received.evidence.coverage.transportPartial, true);
    assert.doesNotMatch(JSON.stringify(received), /secret-canary|registry\.example/);
    assert.equal(received.evidence.terminal.code, 0, 'reader loss must not manufacture installer failure');
    const invalid = await service.receive(plan.session, { invoked: true, code: 0, stdout: Buffer.from([0xff, 0x0a]), stderr: Buffer.from([0x80]) });
    assert.equal(invalid.evidence.streams.stdout.bytes, 2);
    assert.equal(invalid.evidence.streams.stdout.sha256, sha(Buffer.from([0xff, 0x0a])));
    assert.equal(invalid.evidence.streams.stderr.sha256, sha(Buffer.from([0x80])));
    assert.equal(invalid.evidence.streams.stdout.representation, 'original-bytes');
    assert.equal(invalid.evidence.coverage.nativePartial, true);
    const attestation = { v: 1, ms: 0, request: 1, name, version, endpoint: 'attestation' };
    const attestationRecords = [
      { v: 1, seq: 1, ms: 0, event: 'ready', scope: 'main-process-undici' },
      { ...attestation, seq: 2, event: 'request-created' },
      { ...attestation, seq: 3, event: 'response-headers', status: 404 },
      { ...attestation, seq: 4, event: 'response-complete' },
      { v: 1, seq: 5, ms: 0, event: 'final', lost: false, fault: false, unclassified: 0 }
    ];
    await writeFile(events, attestationRecords.map(JSON.stringify).join('\n') + '\n');
    const attested = await service.receive(plan.session, outcome);
    assert.equal(attested.evidence.transport[2].endpoint, 'attestation');
    assert.equal(attested.evidence.transport[2].status, 404);
    const configBytes = await readFile(join(plan.receiptDirectory, 'config.json'));
    assert.deepEqual(attested.evidence.preparedConfiguration, { sha256: sha(configBytes), bytes: configBytes.length });
    attestationRecords[1].version = '9.9.9';
    await writeFile(events, attestationRecords.map(JSON.stringify).join('\n') + '\n');
    assert.equal((await service.receive(plan.session, outcome)).evidence.coverage.transportPartial, true);
    await writeFile(events, '{truncated');
    assert.equal((await service.receive(plan.session, outcome)).evidence.coverage.status, 'partial');
    await rm(events);
    assert.equal((await service.receive(plan.session, outcome)).evidence.coverage.readError, true);
    await assert.rejects(createNativeObservationService().receive(plan.session, outcome), /not issued/);
    await assert.rejects(service.receive(structuredClone(plan.session), outcome), /not issued/);
  });

  await t.test('prepared identity changes refuse before version execution and remain explicit after failure', async () => {
    const area = join(root, 'custody'), providerRoot = join(area, 'provider'), receipts = join(area, 'receipts');
    for (const dir of [join(providerRoot, 'bin'), join(providerRoot, 'dist'), receipts]) await mkdir(dir, { recursive: true });
    const entry = join(providerRoot, 'bin', 'pnpm.mjs'), marker = join(area, 'changed-entry-executed');
    for (const path of ['package.json', 'bin/pnpm.mjs', 'dist/pnpm.mjs'])
      await copyFile(resolve(pnpmEntry, '../../' + path), join(providerRoot, path));
    const service = createNativeObservationService();
    const plan = await service.prepare({ program: process.execPath, arguments: [entry], cwd: area,
      request: { receiptDirectory: receipts, targets: [{ name, version, registry: 'https://registry.example/', tarball: 'https://registry.example/provider.tgz' }] } });
    await writeFile(entry, `import {writeFileSync} from 'node:fs';writeFileSync(${JSON.stringify(marker)},'executed');console.log('11.28.5');`);
    await assert.rejects(service.revalidate(plan.session), /custody changed/);
    await assert.rejects(readFile(marker), { code: 'ENOENT' });
    const received = await service.receive(plan.session, { invoked: false, code: 1, signal: null, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) });
    assert.equal(received.evidence.custody.afterSettlement, 'changed-or-unavailable');
    assert.equal(received.evidence.coverage.status, 'partial');
    assert.equal(received.evidence.terminal.code, 1, 'custody failure does not replace original outcome');
    assert.equal(received.evidence.terminal.invoked, false);
    await assert.rejects(readFile(marker), { code: 'ENOENT' });
  });

  for (const scenario of ['archive-wait', 'policy-wait', 'complete', 'observer-loss', 'admission-custody-change']) await t.test(scenario, { timeout: 25000 }, async t => {
    const area = join(root, scenario), consumer = join(area, 'consumer'), logs = join(area, 'logs'), receipts = join(area, 'receipts');
    for (const dir of [consumer, logs, receipts]) await mkdir(dir, { recursive: true });
    let metadataRequests = 0, archiveRequests = 0, attestationRequests = 0, unexpectedRequests = 0;
    const connections = new Set();
    const server = createServer((request, response) => {
      let path; try { path = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname); } catch { unexpectedRequests++; response.writeHead(400).end(); return; }
      if (path === '/' + name) {
        metadataRequests++;
        if (scenario === 'policy-wait') return;
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify({ name, 'dist-tags': { latest: version },
          time: { created: '2020-01-01T00:00:00.000Z', modified: '2020-01-01T00:00:00.000Z', [version]: '2020-01-01T00:00:00.000Z' },
          versions: { [version]: { ...fixtureManifest, dist: { integrity, tarball: `http://127.0.0.1:${server.address().port}/provider.tgz` } } } }));
      } else if (path === '/-/npm/v1/attestations/' + name + '@' + version) {
        attestationRequests++; response.writeHead(404).end();
      } else if (path === '/provider.tgz') {
        archiveRequests++;
        if (scenario === 'archive-wait') return;
        response.setHeader('content-type', 'application/octet-stream'); response.setHeader('content-length', archive.length); response.end(archive);
      } else { unexpectedRequests++; response.writeHead(404).end(); }
    });
    server.on('connection', socket => { connections.add(socket); socket.on('close', () => connections.delete(socket)); });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(async () => { for (const socket of connections) socket.destroy(); await new Promise(resolve => server.close(resolve)); });
    const registry = `http://127.0.0.1:${server.address().port}/`;
    const manifest = JSON.stringify({ name: 'native-observation-' + scenario, version: '0.0.0', dependencies: { [name]: version } }) + '\n';
    const workspace = 'packages: []\nminimumReleaseAge: 1440\nminimumReleaseAgeStrict: true\n';
    const lock = `lockfileVersion: '9.0'\nsettings:\n  autoInstallPeers: true\n  excludeLinksFromLockfile: false\nimporters:\n  .:\n    dependencies:\n      '${name}':\n        specifier: ${version}\n        version: ${version}\npackages:\n  '${name}@${version}':\n    resolution: {integrity: '${integrity}', tarball: '${registry}provider.tgz'}\n    hasBin: true\nsnapshots:\n  '${name}@${version}': {}\n`;
    const npmrc = `registry=${registry}\n@fixture:registry=${registry}\nupdate-notifier=false\n`;
    await writeFile(join(consumer, 'package.json'), manifest);
    await writeFile(join(consumer, 'pnpm-workspace.yaml'), workspace);
    await writeFile(join(consumer, 'pnpm-lock.yaml'), lock);
    await writeFile(join(consumer, '.npmrc'), npmrc);
    const emptyConfig = join(area, 'empty-user-npmrc'), globalConfig = join(area, 'empty-global-npmrc');
    await writeFile(emptyConfig, ''); await writeFile(globalConfig, '');
    const artifactReceiving = [], releases = [];
    if (scenario === 'complete') {
      const destination = join(area, 'independently-received-provider.tgz');
      await downloadConfiguredNpmRegistryTarball({ registry, name, version, integrity, destination,
        npmEnvironment: { ...npmEnvironment, NPM_CONFIG_USERCONFIG: emptyConfig, NPM_CONFIG_GLOBALCONFIG: globalConfig, NPM_CONFIG_CACHE: join(area, 'npm-receiving-cache') },
        timeoutBudget: { fetchTimeoutMilliseconds: 2000, commandTimeoutMilliseconds: 10000 } });
      assert.deepEqual(await readFile(destination), archive, 'original archive receiver retains the synthetic producer bytes');
      releases.push({ name, version, integrity, artifactDownloaded: true });
      artifactReceiving.push({ consumer: 'native-observation-' + scenario, name, version, registry, archive: { path: destination, integrity },
        limits: { members: 100, bytes: 1048576, archiveBytes: 1048576, tarBytes: 1048576, metadataBytes: 1048576, sourcePaths: 100, sourceRepositories: 1 } });
    }
    const archiveRequestsBeforeNative = archiveRequests, metadataRequestsBeforeNative = metadataRequests;
    const originalService = createNativeObservationService({ qualificationRoot: root });
    let prepared, preparedConfigBytes;
    const service = { kind: originalService.kind,
      prepare: async input => { prepared = await originalService.prepare(input); preparedConfigBytes = await readFile(join(prepared.receiptDirectory, 'config.json')); return prepared; },
      revalidate: ticket => originalService.revalidate(ticket),
      receive: (ticket, outcome) => originalService.receive(ticket, outcome) };
    const result = await receiveSourceRegistryConsumers({ consumerPaths: [join(consumer, 'package.json')], releases, artifactReceiving, artifactReceiptDirectory: receipts, logDirectory: logs,
      pnpm: process.execPath, pnpmArguments: [resolve(pnpmEntry), `--store-dir=${join(area, 'store')}`, `--cache-dir=${join(area, 'cache')}`,
        '--network-concurrency=2', '--fetch-retries=0', '--fetch-timeout=20000'],
      installationTimeout: ['archive-wait', 'policy-wait'].includes(scenario) ? 6000 : 10000,
      readMemoryPressure: async () => {
        if (scenario === 'admission-custody-change') await writeFile(join(prepared.receiptDirectory, 'config.json'), '{}');
        return 0;
      },
      nativeObservationService: service,
      nativeObservation: { receiptDirectory: receipts, targets: [{ name, version, registry, tarball: registry + 'provider.tgz' }],
        maximumEvents: scenario === 'observer-loss' ? 1 : 256, maximumBytes: 65536 }
    });
    t.diagnostic(JSON.stringify({ scenario, packageCount: result.packages.length, refusals: result.refusals, metadataRequests, archiveRequests, attestationRequests, unexpectedRequests }));
    assert.equal(unexpectedRequests, 0);
    assert.equal(await readFile(join(consumer, 'package.json'), 'utf8'), manifest);
    assert.equal(await readFile(join(consumer, 'pnpm-lock.yaml'), 'utf8'), lock);
    assert.equal(await readFile(join(consumer, 'pnpm-workspace.yaml'), 'utf8'), workspace);
    assert.equal(await readFile(join(consumer, '.npmrc'), 'utf8'), npmrc);
    const received = result.packages[0] ?? result.refusals[0];
    assert.ok(received?.observation?.path, JSON.stringify(result));
    const text = await readFile(received.observation.path, 'utf8'), evidence = JSON.parse(text);
    const configBytes = await readFile(join(prepared.receiptDirectory, 'config.json'));
    assert.deepEqual(evidence.preparedConfiguration, { sha256: sha(preparedConfigBytes), bytes: preparedConfigBytes.length });
    if (scenario === 'admission-custody-change') assert.notEqual(evidence.preparedConfiguration.sha256, sha(configBytes));
    else assert.deepEqual(evidence.preparedConfiguration, { sha256: sha(configBytes), bytes: configBytes.length });
    const native = evidence.native, transport = evidence.transport;
    const policy = status => native.some(event => event.event === 'lockfile-verification' && event.status === status);
    const fetched = native.some(event => event.event === 'package-fetch' && ['fetched', 'found_in_store'].includes(event.status));
    const created = endpoint => transport.some(event => event.event === 'request-created' && event.endpoint === endpoint);
    if (scenario === 'admission-custody-change') {
      assert.equal(result.packages.length, 0);
      assert.equal(evidence.terminal.invoked, false);
      assert.equal(evidence.custody.afterSettlement, 'changed-or-unavailable');
      assert.equal(metadataRequests, 0); assert.equal(archiveRequests, 0);
      t.diagnostic(JSON.stringify({ scenario, nativeInvoked: false, custody: evidence.custody, productionConsumerReceived: false }));
      return;
    }
    assert.equal(evidence.custody.preInvocationRevalidated, true);
    assert.equal(evidence.custody.afterSettlement, 'unchanged');
    assert.equal(evidence.streams.stdout.representation, 'original-bytes');
    assert.ok(metadataRequests > metadataRequestsBeforeNative, 'fixture independently observed metadata');
    assert.ok(archiveRequests > archiveRequestsBeforeNative, 'fixture independently observed archive request');
    assert.equal(transport.filter(event => event.event === 'ready').length, 1, 'worker inheritance must not duplicate startup');
    assert.ok(transport.filter(event => event.event === 'final').length <= 1, 'worker inheritance must not duplicate finalization');
    if (scenario !== 'observer-loss' && scenario !== 'policy-wait') {
      assert.equal(attestationRequests, 1);
      assert.equal(created('attestation'), true);
      assert.equal(transport.some(event => event.endpoint === 'attestation' && event.event === 'response-headers' && event.status === 404), true);
    }
    if (scenario === 'archive-wait') {
      assert.equal(result.packages.length, 0); assert.equal(evidence.terminal.signal, 'SIGTERM');
      assert.equal(created('archive'), true); assert.equal(policy('done'), true); assert.equal(fetched, false);
      assert.equal(transport.some(event => event.endpoint === 'archive' && event.event === 'response-headers'), false);
      assert.equal(evidence.coverage.status, 'partial', 'hard stop cannot invent complete observation');
    } else if (scenario === 'policy-wait') {
      assert.equal(result.packages.length, 0); assert.equal(evidence.terminal.signal, 'SIGTERM');
      assert.equal(created('metadata'), true); assert.equal(fetched, true); assert.equal(policy('started'), true); assert.equal(policy('done'), false);
    } else {
      assert.deepEqual(result.refusals, []); assert.equal(result.packages.length, 1); assert.equal(evidence.terminal.code, 0);
      assert.equal(JSON.parse(await readFile(join(consumer, 'node_modules', name, 'package.json'), 'utf8')).version, version);
      if (scenario === 'complete') {
        assert.equal(result.packages[0].artifactReceiving.length, 1);
        assert.equal(result.packages[0].artifactReceiving[0].ok, true);
        assert.equal(result.packages[0].artifactReceiving[0].installationClaimed, true, 'actual original comparison receives only this synthetic fixture');
      }
      if (scenario === 'observer-loss') assert.equal(evidence.coverage.status, 'partial');
      else { assert.equal(fetched, true); assert.equal(policy('done'), true); assert.equal(created('archive'), true); }
    }
    assert.doesNotMatch(JSON.stringify({ native, transport }), /https?:|authorization|provider\.tgz|localhost|127\.0\.0\.1/i);
    const log = await readFile(received.log, 'utf8'); assert.doesNotMatch(log, /https?:|provider\.tgz|127\.0\.0\.1/i);
    t.diagnostic(JSON.stringify({ scenario, nativeExit: evidence.terminal, metadataRequests, archiveRequests, attestationRequests,
      fetched, policyDone: policy('done'), coverage: evidence.coverage, inputsUnchanged: true,
      independentlyReceivedArchiveRequests: archiveRequestsBeforeNative, nativeArchiveRequests: archiveRequests - archiveRequestsBeforeNative,
      artifactComparisons: result.packages[0]?.artifactReceiving?.length ?? 0,
      installedFixture: result.packages.length === 1, productionConsumerReceived: false }));
  });
});
