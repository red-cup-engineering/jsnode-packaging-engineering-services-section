import test from 'node:test';
import assert from 'node:assert/strict';
import { assessFirstPartyEligibility, dependencyClosureDigest } from '@red-cup-engineering/pnpm-engineering-services-section/first-party-qualification';
import { createNativePolicyReceiver } from '@red-cup-engineering/pnpm-engineering-services-section/native-policy';

const digest = 'a'.repeat(64);
function fixture() {
  const release = { name: '@example/provider', version: '1.2.3-dev.4', repositoryId: 123,
    sourceRevision: 'b'.repeat(40), registry: 'https://registry.example/',
    tarball: 'https://registry.example/provider.tgz', integrity: 'sha512-' + 'A'.repeat(86) + '==' };
  const verification = { kind: 'npm.artifact-verification.v1', ref: 'retained:verification', release,
    sourceDigest: digest, closure: [release], closureDigest: dependencyClosureDigest([release]), suites: [{ id: 'source-tests', phase: 'source', command: 'node', args: ['--test'],
      result: { code: 0, signal: null, timedOut: false, truncated: false, failedToStart: false,
        stdoutDigest: digest, stderrDigest: digest },
      counts: { tests: 1, pass: 1, fail: 0, cancelled: 0, skipped: 0, todo: 0 },
      requiredFiles: ['test.mjs'], testedFiles: ['test.mjs'],
      requiredCases: ['required case'], passedCases: ['required case'], optionalSkippedCases: [] }] };
  verification.suites.push({ ...structuredClone(verification.suites[0]), id: 'packed-tests', phase: 'packed' });
  const sourceReceiving = { kind: 'github.branch-receiving.disposition.v1', state: 'received',
    repositoryId: 123, headSha: release.sourceRevision, receivedBy: 'authenticated-receiver',
    workRef: 'retained:subject', consumerEvidence: [verification.ref] };
  return { release, verification, sourceReceiving };
}

test('exact retained source and verification evidence qualifies deterministically', () => {
  const value = fixture();
  assert.deepEqual(assessFirstPartyEligibility(value), assessFirstPartyEligibility(structuredClone(value)));
  assert.equal(assessFirstPartyEligibility(value).eligible, true);
});

for (const [name, mutate, reason] of [
  ['approval flag is not source receiving', x => { x.sourceReceiving = { approved: true }; }, 'SOURCE_NOT_RECEIVED'],
  ['different repository', x => { x.sourceReceiving.repositoryId++; }, 'SOURCE_IDENTITY_MISMATCH'],
  ['different source', x => { x.sourceReceiving.headSha = 'c'.repeat(40); }, 'SOURCE_IDENTITY_MISMATCH'],
  ['unreceived verification', x => { x.sourceReceiving.consumerEvidence = []; }, 'VERIFICATION_NOT_RECEIVED'],
  ['changed integrity', x => { x.verification.release = { ...x.release, integrity: 'sha512-' + 'B'.repeat(86) + '==' }; }, 'ARTIFACT_IDENTITY_MISMATCH'],
  ['empty execution', x => { x.verification.suites = []; }, 'INCOMPLETE_VERIFICATION'],
  ['timeout', x => { x.verification.suites[0].result.timedOut = true; }, 'SUITE_PROCESS_REFUSED'],
  ['signal', x => { x.verification.suites[0].result.signal = 'SIGTERM'; }, 'SUITE_PROCESS_REFUSED'],
  ['truncated output', x => { x.verification.suites[0].result.truncated = true; }, 'SUITE_PROCESS_REFUSED'],
  ['zero tests', x => { x.verification.suites[0].counts.tests = 0; }, 'SUITE_TESTS_REFUSED'],
  ['cancelled tests', x => { x.verification.suites[0].counts.cancelled = 1; }, 'SUITE_TESTS_REFUSED'],
  ['required case missing', x => { x.verification.suites[0].passedCases = []; }, 'REQUIRED_CASE_UNCOVERED'],
]) test(name, () => { const value = fixture(); mutate(value); assert.deepEqual(assessFirstPartyEligibility(value), { eligible: false, reason }); });

test('source-enrolled optional skip does not cover a required case', () => {
  const value = fixture(), suite = value.verification.suites[0];
  suite.counts.tests = 2; suite.counts.skipped = 1;
  suite.optionalSkippedCases = ['optional environment assay'];
  assert.equal(assessFirstPartyEligibility(value).eligible, true);
  suite.optionalSkippedCases = ['required case'];
  assert.equal(assessFirstPartyEligibility(value).reason, 'REQUIRED_CASE_UNCOVERED');
});

async function policyFixture() {
  const value = fixture();
  const closure = [value.release, { name: 'ordinary', version: '2.0.0', integrity: 'unqualified', registry: value.release.registry }];
  const receiver = createNativePolicyReceiver({ verificationResultOf: async () => value.verification,
    receivingDispositionOf: async () => value.sourceReceiving });
  const qualification = await receiver.qualify({ release: value.release,
    verificationRef: value.verification.ref, receivingRef: value.sourceReceiving.workRef });
  return { receiver, input: { policy: { minimumReleaseAge: 1440 }, registry: value.release.registry,
    registryConfiguration: { registry: value.release.registry },
    manifest: { dependencies: { '@example/provider': value.release.version } },
    closure,
    qualifications: [qualification], lock: { lockfileVersion: '9.0', packages: {
      [qualification.selection]: { resolution: { integrity: value.release.integrity } },
      'ordinary@2.0.0': { resolution: { integrity: 'unqualified' } },
    }, importers: { '.': { dependencies: { '@example/provider': { specifier: value.release.version, version: value.release.version } } } },
    snapshots: { [qualification.selection]: { dependencies: { ordinary: '2.0.0' } }, 'ordinary@2.0.0': {} } } } };
}
test('native projection preserves threshold and only emits exact qualified selections', async () => {
  const { receiver, input } = await policyFixture(), before = structuredClone(input);
  assert.deepEqual(receiver.project(input), { minimumReleaseAge: 1440,
    minimumReleaseAgeStrict: true, minimumReleaseAgeExclude: ['@example/provider@1.2.3-dev.4'] });
  assert.deepEqual(input, before);
});
test('unqualified entries receive no exemption', async () => {
  const { receiver, input } = await policyFixture(); input.qualifications = [{ eligible: false, reason: 'SOURCE_NOT_RECEIVED' }];
  assert.deepEqual(receiver.project(input).minimumReleaseAgeExclude, []);
});
test('changed lock integrity refuses', async () => {
  const { receiver, input } = await policyFixture(); input.lock.packages[input.qualifications[0].selection].resolution.integrity = 'changed';
  assert.throws(() => receiver.project(input), /integrity/);
});
test('changed registry origin refuses', async () => {
  const { receiver, input } = await policyFixture(); input.lock.packages[input.qualifications[0].selection].resolution.tarball = 'https://other.example/p.tgz';
  assert.throws(() => receiver.project(input), /origin/);
});
test('preexisting wildcard and explicit nonstrict policy refuse', async () => {
  const { receiver, input } = await policyFixture(); input.policy.minimumReleaseAgeExclude = ['@example/*'];
  assert.throws(() => receiver.project(input), /exclusions/);
  delete input.policy.minimumReleaseAgeExclude; input.policy.minimumReleaseAgeStrict = false;
  assert.throws(() => receiver.project(input), /strict/);
});

test('forged, serialized and other-instance tickets cannot authorize a policy', async () => {
  const first = await policyFixture(), other = await policyFixture();
  for (const qualification of [structuredClone(first.input.qualifications[0]), other.input.qualifications[0], { eligible: true }]) {
    assert.throws(() => first.receiver.project({ ...first.input, qualifications: [qualification] }), /did not issue/);
  }
});
for (const version of ['01.2.3', '1.2.3-.', '1.2.3-a..b']) test(`invalid exact SemVer ${version}`, () => {
  const value = fixture(); value.release.version = version;
  assert.equal(assessFirstPartyEligibility(value).reason, 'INVALID_EXACT_RELEASE');
});
test('duplicate passed cases and fake count refuse', () => {
  const value = fixture(), suite = value.verification.suites[0];
  suite.passedCases.push('required case'); suite.counts.tests = 2; suite.counts.pass = 2;
  assert.equal(assessFirstPartyEligibility(value).reason, 'REQUIRED_CASE_UNCOVERED');
  suite.passedCases = ['required case'];
  assert.equal(assessFirstPartyEligibility(value).reason, 'REQUIRED_CASE_UNCOVERED');
});

for (const [name, mutate] of [
  ['extra lock package', x => { x.lock.packages['hidden@1.0.0'] = { resolution: { integrity: 'hidden' } }; }],
  ['scoped registry override', x => { x.registryConfiguration['@example:registry'] = 'https://other.example/'; }],
  ['unreceived transitive edge', x => { x.lock.snapshots['ordinary@2.0.0'].dependencies = { hidden: '1.0.0' }; }],
  ['importer alias', x => { x.lock.importers['.'].dependencies['@example/provider'].version = 'npm:other@1.0.0'; }],
  ['peer snapshot substitution', x => { x.lock.snapshots['missing@1.0.0(peer@1.0.0)'] = {}; }],
  ['missing dependency snapshot', x => { delete x.lock.snapshots['ordinary@2.0.0']; }],
  ['unreceived peer suffix', x => { x.lock.snapshots['ordinary@2.0.0(hidden@1.0.0)'] = {}; }],
  ['missing exact peer snapshot', x => { x.lock.importers['.'].dependencies['@example/provider'].version += '(ordinary@2.0.0)'; }],
  ['different consumer specifier', x => { x.manifest.dependencies['@example/provider'] = '9.0.0'; }],
]) test(name, async () => { const { receiver, input } = await policyFixture(); mutate(input); assert.throws(() => receiver.project(input)); });

test('missing or duplicate required file coverage refuses', () => {
  const value = fixture(), suite = value.verification.suites[0];
  suite.requiredFiles.push('missing.test.mjs');
  assert.equal(assessFirstPartyEligibility(value).reason, 'REQUIRED_FILE_UNCOVERED');
  suite.testedFiles.push('test.mjs');
  assert.equal(assessFirstPartyEligibility(value).reason, 'REQUIRED_FILE_UNCOVERED');
});

for (const field of ['requiredFiles', 'requiredCases']) test(`disjoint source and packed ${field} refuse`, () => {
  const value = fixture(), packed = value.verification.suites[1];
  packed[field] = ['different population'];
  packed[field === 'requiredFiles' ? 'testedFiles' : 'passedCases'] = ['different population'];
  assert.equal(assessFirstPartyEligibility(value).reason, 'SOURCE_PACKED_ENROLLMENT_MISMATCH');
});
