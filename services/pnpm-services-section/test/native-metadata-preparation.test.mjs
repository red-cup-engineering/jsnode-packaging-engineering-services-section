import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { projectNativeMetadataQuery, inspectRawNativeMetadata, receiveNativeMetadataFile } from '@red-cup-engineering/pnpm-engineering-services-section/native-metadata-preparation';
const canonical = { sourceHead: 'a'.repeat(40), ...Object.fromEntries(['manifestSHA256', 'lockSHA256', 'workspaceSHA256', 'registryConfigurationSHA256', 'selectionSHA256'].map(key => [key, 'b'.repeat(64)])) };
const integrity = 'sha512-' + Buffer.alloc(64, 7).toString('base64');
const registry = 'https://registry.561.group/';
function input() { return { name: '@fixture/metadata', selections: [
  { name: '@fixture/metadata', version: '1.0.0', integrity, registry },
  { name: '@fixture/metadata', version: '2.0.0', integrity, registry },
  { name: 'other-selected', version: '3.0.0', integrity, registry }],
  policy: { minimumReleaseAge: 1440, minimumReleaseAgeStrict: true, minimumReleaseAgeExclude: ['other-selected'] },
  canonical, registry, directory: '/tmp/query-only', cacheDirectory: '/tmp/query-cache' }; }

test('one-name query preserves every original selection and exact nonzero policy without becoming an installation graph', () => {
  const source = input(), before = structuredClone(source), query = projectNativeMetadataQuery(source);
  assert.deepEqual(source, before);
  assert.deepEqual(query.originalSelections, source.selections);
  assert.deepEqual(query.selectedVersions, ['1.0.0', '2.0.0']);
  assert.equal(query.representative, '1.0.0');
  assert.equal(query.installableGraph, false);
  assert.deepEqual(JSON.parse(query.files['pnpm-workspace.yaml']), { packages: [], ...source.policy, fetchRetries: 0, fetchTimeout: 15000, networkConcurrency: 1 });
  const lock = JSON.parse(query.files['pnpm-lock.yaml']);
  assert.equal(lock.packages, undefined); assert.equal(lock.snapshots, undefined);
  assert.deepEqual(Object.keys(JSON.parse(query.files['package.json']).dependencies), [source.name]);
  assert.ok(query.arguments.includes('--config.cache-dir=/tmp/query-cache'));
  assert.ok(query.arguments.includes('--include-github-actions=false'));
  assert.ok(query.arguments.includes('--use-stderr=true'), 'supported reporter stream separation, not arbitrary prefix stripping');
  assert.ok(!query.arguments.some(argument => argument.startsWith('--cache-dir')));
  assert.equal(query.arguments.at(-1), source.name);
  assert.equal(query.expectedMirrorPath, '/tmp/query-cache/v12/metadata-full/https%3A+registry.561.group/@fixture/metadata.jsonl');
  source.selections[0].version = '4.0.0'; assert.equal(query.representative, '1.0.0');
  assert.ok(Object.isFrozen(query.originalSelections[0]));
});

test('operational controls use typed workspace numbers without becoming policy or unsupported outdated CLI options', () => {
  const source = input(), query = projectNativeMetadataQuery(source);
  const { packages, fetchRetries, fetchTimeout, networkConcurrency, ...retainedPolicy } = JSON.parse(query.files['pnpm-workspace.yaml']);
  assert.deepEqual(packages, []);
  assert.deepEqual([fetchRetries, fetchTimeout, networkConcurrency], [0, 15000, 1]);
  assert.ok([fetchRetries, fetchTimeout, networkConcurrency].every(Number.isSafeInteger));
  assert.deepEqual(retainedPolicy, source.policy); assert.deepEqual(query.policy, source.policy);
  assert.deepEqual(query.arguments, ['outdated', '--compatible', '--format=json', '--use-stderr=true', '--recursive=false', '--global=false',
    '--include-github-actions=false', '--dir=/tmp/query-only', '--config.cache-dir=/tmp/query-cache', source.name]);
  for (const key of ['fetchRetries', 'fetchTimeout', 'networkConcurrency']) {
    const injected = input(); injected.policy[key] = '1'; assert.throws(() => projectNativeMetadataQuery(injected));
  }
});

test('projection refuses widened selectors, artifact revisions, policy exemptions, and alternate selected origins', () => {
  for (const mutate of [x => x.name = '*', x => x.name = '../escape', x => x.name += '@1.0.0',
    x => x.selections[0].version = '^1.0.0', x => x.selections[0].registry = 'https://other.example/',
    x => x.selections[0].explicitTarball = 'https://example/a.tgz', x => x.selections[0].revision = 'new',
    x => x.policy.minimumReleaseAge = 0, x => x.policy.minimumReleaseAgeStrict = false,
    x => x.policy.overrides = {}, x => x.canonical = {}, x => x.registry = 'https://u:p@registry.561.group/',
    x => x.selections.push(x.selections[0]), x => x.directory = '/tmp/../escape']) {
    const value = input(); mutate(value); assert.throws(() => projectNativeMetadataQuery(value));
  }
});

test('exact selected build metadata is retained, not semver-normalized away', () => {
  const source = input(); source.selections[0].version = '1.0.0+build.7';
  assert.equal(projectNativeMetadataQuery(source).representative, '1.0.0+build.7');
});

test('raw structural inspection never accepts malformed or arbitrary bytes', () => {
  for (const bytes of [Buffer.alloc(0), Buffer.from('{}\n{}'), Buffer.from('pnpm-meta-v1 1 999999999999999999\n{}')]) {
    const result = inspectRawNativeMetadata(bytes, { name: '@fixture/metadata', selectedVersions: ['1.0.0'] });
    assert.equal(result.complete, false); assert.equal(result.kind, 'raw-coverage-only');
  }
});

test('custody receiver is bounded, rejects symlinks, and never upgrades raw files to native verification', async t => {
  const root = await mkdtemp(join(tmpdir(), 'metadata-pure-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = { ...input(), directory: join(root, 'query'), cacheDirectory: join(root, 'cache') };
  const query = projectNativeMetadataQuery(source);
  assert.equal((await receiveNativeMetadataFile(query)).reason, 'missing-native-file');
  await mkdir(dirname(query.expectedMirrorPath), { recursive: true });
  // Deliberately NOT a native-format mirror. No manually manufactured positive cache evidence.
  await writeFile(query.expectedMirrorPath, 'not native metadata');
  const received = await receiveNativeMetadataFile(query);
  assert.equal(received.fileObserved, true); assert.equal(received.rawCoverage.complete, false);
  assert.equal(received.nativeReaderConsumed, false); assert.equal(received.strictPolicyVerified, false);
  assert.equal(received.installationReceived, false);
  assert.equal((await receiveNativeMetadataFile(query, { maximumBytes: 1 })).fileObserved, false);
  await rm(query.expectedMirrorPath); const target = join(root, 'other'); await writeFile(target, 'not metadata');
  await symlink(target, query.expectedMirrorPath);
  assert.equal((await receiveNativeMetadataFile(query)).fileObserved, false);
  await assert.rejects(receiveNativeMetadataFile({ ...query, expectedMirrorPath: target }), /custody changed/);
});

test('policy values, collections and serialization are finite without normalizing authored values', () => {
  const value = input(); value.policy = { ...value.policy, trustPolicy: 'no-downgrade', trustPolicyExclude: '@fixture/*', trustPolicyIgnoreAfter: 120, blockExoticSubdeps: true };
  assert.deepEqual(projectNativeMetadataQuery(value).policy, value.policy);
  for (const mutate of [x => x.policy.trustPolicy = {}, x => x.policy.trustPolicy = 'unrecognized',
    x => x.policy.trustPolicyIgnoreAfter = Infinity, x => x.policy.trustPolicyIgnoreAfter = '120',
    x => x.policy.blockExoticSubdeps = 'true', x => x.policy.minimumReleaseAgeExclude = [null],
    x => x.policy.minimumReleaseAgeExclude = ['a'.repeat(513)],
    x => x.policy.minimumReleaseAgeExclude = Array(4097).fill('a'),
    x => x.policy.minimumReleaseAgeExclude = Array(100).fill('a'.repeat(512)),
    x => x.policy.toJSON = () => ({}), x => x.selections[0].extra = 'x'.repeat(8193),
    x => x.selections[0].extra = x.selections, x => x.selections[0].integrity = 'arbitrary-string',
    x => x.selections[0].integrity = 'sha512-short', x => x.selections[0].integrity = 'sha512-' + 'A'.repeat(88),
    x => x.selections[0].version = '1.0.0+' + 'x'.repeat(129)]) {
    const source = input(); mutate(source); assert.throws(() => projectNativeMetadataQuery(source));
  }
  const source = input(); let accessed = false;
  Object.defineProperty(source.policy, 'trustPolicy', { enumerable: true, get() { accessed = true; return 'off'; } });
  assert.throws(() => projectNativeMetadataQuery(source)); assert.equal(accessed, false);
});

test('supported integrity syntax is checked but exact original strings stay unchanged', () => {
  for (const [algorithm, bytes] of [['sha1', 20], ['sha256', 32], ['sha384', 48], ['sha512', 64]]) {
    const source = input(); source.selections[0].integrity = algorithm + '-' + Buffer.alloc(bytes, 1).toString('base64');
    assert.equal(projectNativeMetadataQuery(source).originalSelections[0].integrity, source.selections[0].integrity);
  }
});

test('raw output selection rejects duplicates, sparse or oversized identities before parsing', () => {
  for (const selectedVersions of [['1.0.0', '1.0.0'], Array(1), ['x'.repeat(129)], Array(4097).fill('1.0.0')]) {
    assert.equal(inspectRawNativeMetadata(Buffer.alloc(0), { name: '@fixture/metadata', selectedVersions }).reason, 'bounded-input-required');
  }
});
