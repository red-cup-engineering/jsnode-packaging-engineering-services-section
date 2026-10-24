// Original supplier assay only. Never enrolled in ordinary pure receiving tests.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parse as parseFixtureYAML } from 'yaml';
import { createNativeObservationService } from '@red-cup-engineering/pnpm-engineering-services-section/native-observation';
import { projectNativeMetadataQuery, receiveNativeMetadataFile } from '@red-cup-engineering/pnpm-engineering-services-section/native-metadata-preparation';
const execute = promisify(execFile), sha = bytes => createHash('sha256').update(bytes).digest('hex');
const entry = process.env.QUALIFIED_PNPM_ENTRY, fixtureRoot = process.env.NATIVE_METADATA_FIXTURE_ROOT;
const name = '@fixture/native-metadata', versions = ['1.0.0', '1.1.0'];
const integrity = 'sha512-' + Buffer.alloc(64, 7).toString('base64');
const encode = value => JSON.stringify(value, null, 2) + '\n';
const policy = { minimumReleaseAge: 1440, minimumReleaseAgeStrict: true };
// Canonical policy leaves PNPM11.28.5's ignore-missing-time default unchanged.
const missingTimeWarning = `The metadata of ${name} is missing the "time" field; skipping the minimumReleaseAge check for this package.`;
const canonical = { sourceHead: 'a'.repeat(40), ...Object.fromEntries(['manifestSHA256', 'lockSHA256', 'workspaceSHA256', 'registryConfigurationSHA256', 'selectionSHA256'].map(key => [key, 'b'.repeat(64)])) };
async function run(args, cwd, env, timeout = 20000) {
  try { const result = await execute(process.execPath, [resolve(entry), ...args], { cwd, env, timeout, killSignal: 'SIGKILL', maxBuffer: 1048576, encoding: 'buffer' }); return { ...result, code: 0, signal: null }; }
  catch (error) { if (error.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') throw error;
    if (error.killed && error.signal === 'SIGKILL') return { stdout: error.stdout, stderr: error.stderr, code: null, signal: error.signal, timedOut: true };
    if (!Number.isInteger(error.code) || error.signal) throw error; return { stdout: error.stdout, stderr: error.stderr, code: error.code, signal: null }; }
}
async function filesUnder(root) { const out = []; for (const ent of await readdir(root, { withFileTypes: true }).catch(error => { if (error.code === 'ENOENT') return []; throw error; })) {
  if (ent.isSymbolicLink()) throw new Error('fixture unexpectedly contains symlink');
  const path = join(root, ent.name); if (ent.isDirectory()) out.push(...await filesUnder(path)); else out.push(path);
} return out; }

test('native outdated prepares full metadata; separate original strict verifier covers every selected version',
  { skip: !(entry && fixtureRoot), timeout: 540000 }, async t => {
    assert.equal(process.version, 'v24.19.0');
    assert.equal(process.env.NODE_AUTH_TOKEN === undefined, true, 'native fixture requires token absence');
    assert.equal(process.env.NODE_OPTIONS === undefined, true, 'native fixture requires explicit preload composition');
    const root = await mkdtemp(join(resolve(fixtureRoot), 'native-metadata-'));
    t.diagnostic(JSON.stringify({ retainedFixtureRoot: root, productionInstallationReceived: false }));
    const config = join(root, 'configuration'); await mkdir(join(config, 'pnpm'), { recursive: true });
    await writeFile(join(config, 'pnpm', 'config.yaml'), '{}\n');
    const auth = join(config, 'empty-auth'); await writeFile(auth, '');
    const isolation = { XDG_CONFIG_HOME: config, XDG_CACHE_HOME: join(root, 'xdg-cache'),
      PNPM_CONFIG_NPMRC_AUTH_FILE: auth, pnpm_config_npmrc_auth_file: auth };
    // Existing provider API reads its invocation environment. Restore exactly after this serial assay.
    const previous = Object.fromEntries(Object.keys(isolation).map(key => [key, process.env[key]]));
    Object.assign(process.env, isolation);
    t.after(() => { for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });
    const environment = { ...process.env }; // Preserve the same invocation-scoped transport bindings, unmodified.
    for (const scenario of ['old', 'recent-second', 'missing-time', 'invalid-time', 'missing-mirror', 'failed-producer', 'timeout-producer']) await t.test(scenario, async () => {
      const area = join(root, scenario), queryDir = join(area, 'query'), cache = join(area, 'cache'), verifierDir = join(area, 'verifier'), receipts = join(area, 'receipts');
      for (const dir of [queryDir, verifierDir, receipts]) await mkdir(dir, { recursive: true });
      const requests = [], sockets = new Set(); let offline = false;
      const stages = { current: 'setup', completed: false, providerPrepared: false, providerRevalidated: false, nativeVerificationStarted: null, nativeVerificationLifecycle: null, phases: {} };
      let producer = null, file = null, readerConsumed = false;
      let producerClassification = 'not-invoked', readerClassification = 'not-invoked';
      const server = createServer((request, response) => {
        let path; try { path = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname); } catch { path = 'invalid'; }
        requests.push({ path, offline });
        if (scenario === 'timeout-producer' && !offline) return;
        if (scenario === 'failed-producer' || offline || path !== '/' + name) { response.writeHead(500).end(); return; }
        const time = { created: '2020-01-01T00:00:00.000Z', modified: new Date().toISOString(), [versions[0]]: '2020-01-01T00:00:00.000Z' };
        if (scenario !== 'missing-time') time[versions[1]] = scenario === 'recent-second' ? new Date().toISOString() : scenario === 'invalid-time' ? 'not-a-date' : '2020-01-01T00:00:00.000Z';
        response.setHeader('content-type', 'application/json');
        response.end(encode({ name, time, 'dist-tags': { latest: versions[1] }, versions: Object.fromEntries(versions.map(version => [version,
          { name, version, ...(version === versions[0] ? { dependencies: { [name]: versions[1] } } : {}),
            dist: { integrity, tarball: `http://fixture-secret@127.0.0.1:${server.address().port}/forbidden-${version}.tgz?token=fixture-secret` } }])) }));
      });
      server.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
      await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
      try {
        const registry = `http://127.0.0.1:${server.address().port}/`;
        const selections = versions.map(version => ({ name, version, registry, integrity }));
        const query = projectNativeMetadataQuery({ name, selections, policy, canonical, registry, directory: queryDir, cacheDirectory: cache });
        for (const [file, bytes] of Object.entries(query.files)) await writeFile(join(queryDir, file), bytes, { flag: 'wx' });
        const observer = createNativeObservationService({ qualificationRoot: root });
        stages.current = 'provider-prepare';
        const plan = await observer.prepare({ program: process.execPath, arguments: [resolve(entry)], cwd: queryDir,
          request: { receiptDirectory: receipts, targets: selections.map(record => ({ name, version: record.version, registry, tarball: `${registry}forbidden-${record.version}.tgz` })) } });
        stages.providerPrepared = true; stages.current = 'provider-revalidate';
        await observer.revalidate(plan.session); stages.providerRevalidated = true;
        assert.equal(plan.provider.manager.version, '11.28.5');
        // Provider custody is reused, not its installation-specific output projection.
        const noMirror = ['missing-mirror', 'failed-producer', 'timeout-producer'].includes(scenario);
        const combined = outcome => outcome.stdout.toString('utf8') + outcome.stderr.toString('utf8');
        const rowOf = outcome => { try { return JSON.parse(outcome.stdout.toString('utf8'))?.[name]; } catch { return undefined; } };
        const preserve = async (label, outcome) => {
          const terminal = { code: outcome.code, signal: outcome.signal, timedOut: outcome.timedOut ?? false };
          stages.phases[label].terminal = terminal;
          await writeFile(join(receipts, label + '-terminal.json'), encode(terminal));
          await writeFile(join(receipts, label + '-stdout'), outcome.stdout);
          await writeFile(join(receipts, label + '-stderr'), outcome.stderr);
        };
        const recordedRun = async (label, args, cwd, timeout = 20000) => {
          stages.current = label;
          const command = { program: process.execPath, arguments: [resolve(entry), ...args], cwd, timeoutMs: timeout, maximumOutputBytesPerStream: 1048576 };
          stages.phases[label] = { invoked: false, command, terminal: null };
          await writeFile(join(receipts, label + '-command.json'), encode(command));
          stages.phases[label].invoked = true;
          if (label === 'producer') producerClassification = 'invoked-outcome-pending';
          if (label === 'offline-reader') readerClassification = 'invoked-outcome-pending';
          let outcome;
          try { outcome = await run(args, cwd, environment, timeout); }
          catch (error) {
            // Preserve bounded available data without serializing an Error, its message,
            // environment, or unbounded properties. Abnormal execution remains failure.
            const overflow = error.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER';
            const spawnCode = ['ENOENT', 'EACCES', 'ENOMEM', 'EAGAIN'].includes(error.code) ? error.code : null;
            const signals = ['SIGTERM', 'SIGKILL', 'SIGINT', 'SIGHUP', 'SIGABRT', 'SIGSEGV', 'SIGBUS', 'SIGPIPE',
              'SIGILL', 'SIGTRAP', 'SIGFPE', 'SIGQUIT', 'SIGXCPU', 'SIGXFSZ', 'SIGSYS'];
            const knownSignal = signals.includes(error.signal) ? error.signal : null;
            const terminal = { abnormal: true, code: Number.isInteger(error.code) ? error.code : null,
              codeAvailable: Number.isInteger(error.code), signal: knownSignal,
              signalAvailable: knownSignal !== null || error.signal === null, timedOut: null,
              category: overflow ? 'output-limit' : spawnCode ? 'spawn-failure' : knownSignal ? 'unexpected-signal' : 'unclassified-execution-error',
              spawnCode, output: {} };
            for (const stream of ['stdout', 'stderr']) {
              const value = error[stream], available = Buffer.isBuffer(value) || typeof value === 'string';
              const retained = Buffer.isBuffer(value) ? value.subarray(0, 1048576)
                : typeof value === 'string' ? Buffer.from(value.slice(0, 1048576)).subarray(0, 1048576) : null;
              terminal.output[stream] = { available, retainedBytes: retained?.length ?? null,
                possiblyTruncated: !available ? null : overflow || (Buffer.isBuffer(value) ? value.length : Buffer.byteLength(value)) > 1048576 };
              if (available) await writeFile(join(receipts, label + '-' + stream), retained);
            }
            stages.phases[label].terminal = terminal;
            if (label === 'producer') producerClassification = 'abnormal-' + terminal.category;
            if (label === 'offline-reader') readerClassification = 'abnormal-' + terminal.category;
            await writeFile(join(receipts, label + '-terminal.json'), encode(terminal));
            // A raw execFile error includes stdout/stderr and command properties in
            // Node's test diagnostics. Throw only this fixed, non-secret failure.
            throw new Error(`native ${label} execution failed abnormally (${terminal.category}); bounded terminal retained`);
          }
          await preserve(label, outcome);
          return outcome;
        };
        if (scenario !== 'missing-mirror') {
          producer = await recordedRun('producer', query.arguments, queryDir, scenario === 'timeout-producer' ? 1000 : 20000);
          producerClassification = producer.timedOut ? 'settled-timeout' : /ERR_PNPM_META_FETCH_FAIL/u.test(combined(producer))
            ? 'native-metadata-fetch-failure' : /ERR_PNPM_MISSING_TIME/u.test(combined(producer))
              ? 'native-missing-time' : /ERR_PNPM_FETCH_500|500[^\n]*Internal Server Error/u.test(combined(producer))
                ? 'native-fetch-500' : 'unclassified-native-outcome';
          if (scenario === 'timeout-producer') {
            assert.equal(producer.timedOut, true); producerClassification = 'settled-timeout';
          } else {
            assert.equal(producer.signal, null);
            if (scenario === 'missing-time') {
              assert.equal(producer.code, 1);
              assert.equal(rowOf(producer)?.wanted, query.representative);
              assert.equal(rowOf(producer)?.latest, query.representative);
              assert.ok(producer.stderr.toString('utf8').includes(missingTimeWarning), 'native missing-time warning retained on stderr');
              producerClassification = 'native-outdated-row-with-missing-time-warning-not-maturity-evidence';
            } else if (scenario === 'failed-producer') {
              assert.notEqual(producer.code, 0);
              assert.match(combined(producer), /ERR_PNPM_FETCH_500|500[^\n]*Internal Server Error/u);
              producerClassification = 'native-fetch-500';
            } else {
              assert.equal(producer.code, 1, 'outdated result is expected exit1, not policy acceptance');
              assert.equal(rowOf(producer)?.latest, query.representative);
              producerClassification = 'native-outdated-row-not-policy-acceptance';
            }
          }
        }
        stages.current = 'file-custody';
        file = await receiveNativeMetadataFile(query);
        await writeFile(join(receipts, 'file-custody.json'), encode(file));
        if (noMirror) assert.equal(file.fileObserved, false);
        else if (scenario === 'missing-time') {
          assert.equal(file.fileObserved, true);
          assert.equal(file.rawCoverage.complete, false, 'missing native time evidence remains incomplete, not a new admission gate');
          assert.deepEqual(file.rawCoverage.versions.map(item => item.version), versions);
          assert.ok(file.rawCoverage.versions.every(item => item.manifestPresent && !item.validTimestamp && item.timestamp === null));
        } else {
          assert.equal(file.fileObserved, true);
          assert.equal(file.rawCoverage.complete, scenario !== 'invalid-time');
        }
        assert.equal(file.strictPolicyVerified, false);
        assert.doesNotMatch(JSON.stringify(file), /fixture-secret|"artifact"|"tarball"|"integrity"/u, 'remote artifact fields are not projected');
        offline = true;
        if (!noMirror) {
          const reader = await recordedRun('offline-reader', [...query.arguments, '--config.offline=true'], queryDir);
          readerClassification = /ERR_PNPM_META_FETCH_FAIL/u.test(combined(reader)) ? 'native-metadata-fetch-failure' : 'unclassified-native-outcome';
          assert.equal(reader.signal, null);
          if (scenario === 'missing-time') {
            assert.equal(reader.code, 1);
            assert.equal(rowOf(reader)?.wanted, query.representative);
            assert.equal(rowOf(reader)?.latest, query.representative);
            assert.ok(reader.stderr.toString('utf8').includes(missingTimeWarning), 'offline native warning preserved without suppressing diagnostics');
            assert.equal(file.fileObserved, true); readerConsumed = true;
            readerClassification = 'native-selected-manifest-read-without-publish-time-evidence';
          } else {
            assert.equal(reader.code, 1); assert.equal(rowOf(reader)?.latest, query.representative);
            assert.equal(file.fileObserved, true); readerConsumed = true; readerClassification = 'native-selected-manifest-read';
          }
        }
        await writeFile(join(receipts, 'pre-verifier-classification.json'), encode({ producerClassification, readerClassification, readerConsumed }));
        const manifest = { private: true, dependencies: { [name]: versions[0] } };
        const lock = { lockfileVersion: '9.0', settings: { autoInstallPeers: true, excludeLinksFromLockfile: false },
          importers: { '.': { dependencies: { [name]: { specifier: versions[0], version: versions[0] } } } },
          packages: Object.fromEntries(versions.map(version => [`${name}@${version}`, { resolution: { integrity } }])),
          snapshots: { [`${name}@${versions[0]}`]: { dependencies: { [name]: versions[1] } }, [`${name}@${versions[1]}`]: {} } };
        const inputFiles = { 'package.json': encode(manifest), 'pnpm-lock.yaml': encode(lock), 'pnpm-workspace.yaml': query.files['pnpm-workspace.yaml'], '.npmrc': query.files['.npmrc'] };
        // Immutable source fixture retained separately; only disposable verifier copy may be rewritten natively.
        await writeFile(join(receipts, 'verifier-original-inputs.json'), encode(inputFiles));
        for (const [file, bytes] of Object.entries(inputFiles)) await writeFile(join(verifierDir, file), bytes);
        assert.equal((await filesUnder(cache)).some(path => path.endsWith('lockfile-verified.jsonl')), false);
        const verified = await recordedRun('verifier', ['install', '--offline', '--frozen-lockfile', '--ignore-scripts', '--lockfile-only', '--reporter=ndjson',
          `--dir=${verifierDir}`, `--config.cache-dir=${cache}`, `--store-dir=${join(area, 'store')}`], verifierDir);
        stages.current = 'verifier-receiving';
        const custody = await observer.receive(plan.session, { ...verified, invoked: true });
        await writeFile(join(receipts, 'provider-custody.json'), encode(custody.evidence.custody));
        assert.equal(custody.evidence.custody.afterSettlement, 'unchanged');
        assert.equal(verified.signal, null, 'verifier must settle normally, not time out');
        const events = verified.stdout.toString('utf8').split('\n').filter(Boolean).map(line => JSON.parse(line));
        const lifecycle = events.filter(event => event.name === 'pnpm:lockfile-verification').map(event => event.status);
        stages.nativeVerificationStarted = lifecycle.includes('started'); stages.nativeVerificationLifecycle = lifecycle;
        assert.ok(lifecycle.includes('started'), 'actual original strict verification starts');
        assert.ok(events.some(event => event.name === 'pnpm:lockfile-verification' && event.status === 'started' && event.entries === 2));
        if (scenario === 'old' || scenario === 'missing-time') {
          assert.equal(verified.code, 0); assert.ok(lifecycle.includes('done'));
          if (scenario === 'missing-time') {
            assert.ok(events.some(event => event.name === 'pnpm:global' && event.level === 'warn' && event.message === missingTimeWarning));
            assert.equal(file.rawCoverage.complete, false, 'native default acceptance does not establish mature timestamps');
          }
        }
        else { assert.notEqual(verified.code, 0); assert.ok(!lifecycle.includes('done')); assert.ok(lifecycle.includes('failed'));
          assert.match(verified.stdout.toString('utf8') + verified.stderr.toString('utf8'), noMirror ? /ERR_PNPM_NO_OFFLINE_META/ : /ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION/); }
        assert.ok(requests.every(request => request.path === '/' + name && !request.offline), 'no archive, attestation, unrelated-name, or offline network request');
        for (const [file, bytes] of Object.entries(query.files)) assert.equal(await readFile(join(queryDir, file), 'utf8'), bytes);
        const afterLock = await readFile(join(verifierDir, 'pnpm-lock.yaml'));
        await writeFile(join(receipts, 'verifier-after-lock.yaml'), afterLock);
        // Independent declared yaml2.9.1 parser of this tiny JSON-shaped fixture,
        // NOT PNPM's @zkochan/js-yaml0.0.11 native parser or converted-cache identity.
        const afterSemantics = parseFixtureYAML(afterLock.toString('utf8'));
        assert.deepEqual(afterSemantics, lock, 'disposable native writer preserves exact fixture lock semantics');
        await writeFile(join(receipts, 'verifier-lock-semantics.json'), encode({ before: lock, after: afterSemantics, parser: 'independent-yaml-2.9.1' }));
        await writeFile(join(receipts, 'receipt.json'), encode({ scenario, producerInvoked: producer !== null, queried: requests.some(request => request.path === '/' + name && !request.offline), producerClassification, readerClassification, nativeProducerExited: producer !== null && !producer.signal, producerSignal: producer?.signal ?? null,
          producerExit: producer?.code ?? null, file, nativeOfflineReaderConsumed: readerConsumed,
          strictVerifierAccepted: verified.code === 0 && lifecycle.includes('done'),
          missingTimeSemantics: scenario === 'missing-time' ? { nativeDefaultIgnoreMissingTime: true, rawCoverageComplete: false, nativeAcceptanceProvesMatureTimestamps: false } : null,
          installationReceived: false, lifecycle, requests,
          verifierBeforeSemanticSHA256: sha(encode(lock)), verifierAfterSemanticSHA256: sha(encode(afterSemantics)),
          verifierBeforeLockSHA256: sha(inputFiles['pnpm-lock.yaml']), verifierAfterLockSHA256: sha(afterLock),
          provider: plan.provider, projectionSHA256: query.projectionSHA256 }));
        stages.completed = true; stages.current = 'complete';
      } finally {
        try {
          await writeFile(join(receipts, 'requests.json'), encode(requests));
          await writeFile(join(receipts, 'stages.json'), encode({ ...stages, scenario, producerClassification, readerClassification,
            producerInvoked: stages.phases.producer?.invoked === true, queried: requests.some(request => request.path === '/' + name && !request.offline),
            file, nativeOfflineReaderConsumed: readerConsumed, installationReceived: false }));
        } finally { for (const socket of sockets) socket.destroy(); await new Promise(resolve => server.close(resolve)); }
      }
    });
  });
