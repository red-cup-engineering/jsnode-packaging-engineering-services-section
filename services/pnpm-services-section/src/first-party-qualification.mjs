/** Deterministic policy over records resolved by the original receiving owner.
 * This pure function does not authenticate caller-supplied JSON. Only the
 * original receiver may bind its result to an effective native policy. */
import { isDeepStrictEqual } from 'node:util';
import semver from 'semver';
import { createHash } from 'node:crypto';

/** Exact registry selections, independent of enumeration/object key order. */
export function dependencyClosureDigest(closure) {
  if (!Array.isArray(closure)) throw new TypeError('declared closure required');
  const tuples = closure.map(value => [value.name, value.version, value.registry, value.integrity, value.tarball ?? null]);
  tuples.sort((a, b) => {
    const left = JSON.stringify(a), right = JSON.stringify(b);
    return left < right ? -1 : left > right ? 1 : 0;
  });
  return createHash('sha256').update(JSON.stringify(tuples)).digest('hex');
}

const sha = value => typeof value === 'string' && /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u.test(value);
const integrity = value => typeof value === 'string' && /^sha512-[A-Za-z0-9+/]{86}==$/u.test(value);
const exact = value => typeof value === 'string' && semver.valid(value) === value;
const text = value => typeof value === 'string' && value.length > 0;
const no = reason => Object.freeze({ eligible: false, reason });

/**
 * sourceReceiving is an original github.branch-receiving.disposition.v1 record;
 * verification is the original publisher's retained artifact verification.
 * No review state or prose is interpreted as authority here.
 */
export function assessArtifactVerification({ release, verification } = {}) {
  if (!release || !text(release.name) || !exact(release.version) || !integrity(release.integrity)
    || !text(release.registry) || !sha(release.sourceRevision) || !Number.isSafeInteger(release.repositoryId))
    return no('INVALID_EXACT_RELEASE');
  if (verification?.kind !== 'npm.artifact-verification.v1' || !text(verification.ref)
    ) return no('VERIFICATION_NOT_RECEIVED');
  if (!isDeepStrictEqual(verification.release, release)) return no('ARTIFACT_IDENTITY_MISMATCH');
  if (!sha(verification.sourceDigest) || !sha(verification.closureDigest)
    || !Array.isArray(verification.closure) || verification.closure.length === 0
    || dependencyClosureDigest(verification.closure) !== verification.closureDigest
    || !Array.isArray(verification.suites) || verification.suites.length === 0)
    return no('INCOMPLETE_VERIFICATION');
  const names = new Set();
  const phases = new Set(verification.suites.map(suite => suite.phase));
  if (!phases.has('source') || !phases.has('packed') || [...phases].some(phase => !['source','packed'].includes(phase)))
    return no('SOURCE_AND_PACKED_SUITES_REQUIRED');
  for (const suite of verification.suites) {
    if (!Array.isArray(suite.requiredFiles) || suite.requiredFiles.length === 0 || !suite.requiredFiles.every(text)
      || new Set(suite.requiredFiles).size !== suite.requiredFiles.length || !Array.isArray(suite.testedFiles)
      || !isDeepStrictEqual([...suite.requiredFiles].sort(), [...suite.testedFiles].sort()))
      return no('REQUIRED_FILE_UNCOVERED');
    if (!text(suite.id) || names.has(suite.id) || !text(suite.command)
      || !Array.isArray(suite.args) || !suite.args.every(text)) return no('INVALID_SUITE_ENROLLMENT');
    names.add(suite.id);
    const result = suite.result;
    if (!result || result.code !== 0 || result.signal != null || result.timedOut !== false
      || result.truncated !== false || result.failedToStart !== false
      || !sha(result.stdoutDigest) || !sha(result.stderrDigest)) return no('SUITE_PROCESS_REFUSED');
    const count = suite.counts;
    if (!count || !['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo'].every(k => Number.isSafeInteger(count[k]) && count[k] >= 0)
      || count.tests === 0 || count.fail !== 0 || count.cancelled !== 0 || count.todo !== 0
      || count.tests !== count.pass + count.skipped) return no('SUITE_TESTS_REFUSED');
    // Optional skips are source-enrolled, individually identified and retained
    // by the producer. They cannot cover a required case or an unknown skip.
    if (!Array.isArray(suite.requiredCases) || suite.requiredCases.length === 0
      || !suite.requiredCases.every(text) || new Set(suite.requiredCases).size !== suite.requiredCases.length
      || !Array.isArray(suite.passedCases) || !suite.passedCases.every(text)
      || suite.passedCases.length !== count.pass || new Set(suite.passedCases).size !== suite.passedCases.length
      || !suite.requiredCases.every(name => suite.passedCases.includes(name))
      || !Array.isArray(suite.optionalSkippedCases) || suite.optionalSkippedCases.length !== count.skipped
      || !suite.optionalSkippedCases.every(text) || new Set(suite.optionalSkippedCases).size !== suite.optionalSkippedCases.length
      || suite.optionalSkippedCases.some(name => suite.requiredCases.includes(name) || suite.passedCases.includes(name))) return no('REQUIRED_CASE_UNCOVERED');
  }
  for (const field of ['requiredFiles', 'requiredCases']) {
    const population = phase => verification.suites.filter(suite => suite.phase === phase).flatMap(suite => suite[field]).sort();
    if (!isDeepStrictEqual(population('source'), population('packed'))) return no('SOURCE_PACKED_ENROLLMENT_MISMATCH');
  }
  return Object.freeze({ eligible: true, selection: `${release.name}@${release.version}`,
    release: Object.freeze({ ...release }), verificationRef: verification.ref,
    closureDigest: verification.closureDigest,
    verifiedClosure: Object.freeze(verification.closure.map(value => Object.freeze({ ...value }))) });
}

export function assessFirstPartyEligibility({ release, verification, sourceReceiving } = {}) {
  if (sourceReceiving?.kind !== 'github.branch-receiving.disposition.v1'
    || sourceReceiving.state !== 'received' || !text(sourceReceiving.receivedBy)
    || !text(sourceReceiving.workRef)) return no('SOURCE_NOT_RECEIVED');
  const sourceRevision = sourceReceiving.artifactVerificationRef === verification?.ref
    ? sourceReceiving.artifactSourceRevision : sourceReceiving.headSha;
  if (sourceReceiving.repositoryId !== release?.repositoryId || sourceRevision !== release?.sourceRevision)
    return no('SOURCE_IDENTITY_MISMATCH');
  if (!sourceReceiving.consumerEvidence?.includes(verification?.ref)) return no('VERIFICATION_NOT_RECEIVED');
  const result = assessArtifactVerification({ release, verification });
  return result.eligible ? Object.freeze({ ...result, receivingRef: sourceReceiving.workRef }) : result;
}
