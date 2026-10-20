import { isDeepStrictEqual } from 'node:util';
import { assessFirstPartyEligibility, dependencyClosureDigest } from './first-party-qualification.mjs';

const dependencyFields = ['dependencies', 'devDependencies', 'optionalDependencies'];
const withoutPeers = version => String(version).split('(')[0];

/** Check the complete parsed single-importer registry closure. Parsing remains
 * with the native PNPM owner; unknown lock layouts fail rather than being
 * approximated with regular-expression YAML reading. */
function checkNativeClosure({ lock, manifest, closure, registry, registryConfiguration }) {
  if (!manifest || !Array.isArray(closure) || !registryConfiguration || registryConfiguration.registry !== registry)
    throw new Error('complete manifest, closure and effective registry configuration required');
  for (const [key, value] of Object.entries(registryConfiguration)) {
    if (key.endsWith(':registry') && value !== registry) throw new Error('scoped registry changes selected origin');
    if (['overrides', 'packageExtensions', 'catalog', 'catalogs'].includes(key))
      throw new Error('unreconciled native dependency rewriting refused');
  }
  if (!lock.importers || Object.keys(lock.importers).length !== 1 || !lock.importers['.'] || !lock.snapshots)
    throw new Error('single-consumer complete native lock required');
  const selected = new Map();
  for (const release of closure) {
    const key = `${release.name}@${release.version}`;
    if (selected.has(key)) throw new Error('duplicate closure selection');
    if (release.registry !== registry || !release.integrity) throw new Error('closure registry identity missing');
    selected.set(key, release);
  }
  if (!isDeepStrictEqual([...selected.keys()].sort(), Object.keys(lock.packages).sort()))
    throw new Error('native package inventory differs from declared closure');
  for (const [key, entry] of Object.entries(lock.packages)) {
    const release = selected.get(key), resolution = entry.resolution;
    if (!resolution || resolution.integrity !== release.integrity
      || (resolution.tarball !== undefined && resolution.tarball !== release.tarball)
      || ['type', 'directory', 'repo', 'commit'].some(field => field in resolution))
      throw new Error('native closure integrity or origin differs');
  }
  const importer = lock.importers['.'];
  const assertSnapshot = key => {
    if (!Object.hasOwn(lock.snapshots, key)) throw new Error('native dependency snapshot missing');
    let depth = 0;
    for (const character of key) {
      if (character === '(') depth++;
      if (character === ')' && --depth < 0) throw new Error('malformed native peer selection');
    }
    if (depth !== 0 || key.split(/[()]/u).filter(Boolean).some(selection => !selected.has(selection)))
      throw new Error('native peer selection leaves declared closure');
  };
  for (const field of dependencyFields) {
    const expected = manifest[field] ?? {}, actual = importer[field] ?? {};
    if (!isDeepStrictEqual(Object.keys(expected).sort(), Object.keys(actual).sort())) throw new Error('native importer dependency population differs');
    for (const [name, specifier] of Object.entries(expected)) {
      const entry = actual[name];
      if (entry.specifier !== specifier || /^(?:npm:|file:|link:|workspace:|git|https?:)/u.test(String(entry.version)))
        throw new Error('native importer specifier or alias differs');
      if (!selected.has(`${name}@${withoutPeers(entry.version)}`)) throw new Error('native importer leaves declared closure');
      assertSnapshot(`${name}@${entry.version}`);
    }
  }
  for (const [key, snapshot] of Object.entries(lock.snapshots)) {
    if (!selected.has(withoutPeers(key))) throw new Error('native peer snapshot leaves declared closure');
    assertSnapshot(key);
    for (const field of ['dependencies', 'optionalDependencies']) for (const [name, version] of Object.entries(snapshot[field] ?? {})) {
      if (!selected.has(`${name}@${withoutPeers(version)}`)) throw new Error('native dependency edge leaves declared closure');
      assertSnapshot(`${name}@${version}`);
    }
  }
  if (!isDeepStrictEqual([...new Set(Object.keys(lock.snapshots).map(withoutPeers))].sort(), [...selected.keys()].sort()))
    throw new Error('native snapshot inventory differs from declared closure');
}

/** One receiver instance is bound by the original host to its own custody.
 * Public requests supply references, never readers or received records. Tickets
 * cannot be serialized, copied, or transferred from another receiver instance. */
export function createNativePolicyReceiver({ verificationResultOf, receivingDispositionOf }) {
  if (typeof verificationResultOf !== 'function' || typeof receivingDispositionOf !== 'function')
    throw new TypeError('original verification and receiving custody must be bound');
  const tickets = new WeakSet();
  return Object.freeze({
    async qualify({ release, verificationRef, receivingRef }) {
      const [verification, sourceReceiving] = await Promise.all([
        verificationResultOf({ verificationRef }), receivingDispositionOf({ receivingRef }),
      ]);
      if (verification?.ref !== verificationRef || sourceReceiving?.workRef !== receivingRef)
        return Object.freeze({ eligible: false, reason: 'CUSTODY_REFERENCE_MISMATCH' });
      const result = assessFirstPartyEligibility({ release, verification, sourceReceiving });
      if (result.eligible) tickets.add(result);
      return result;
    },
    project(input) {
      if (!input || !Array.isArray(input.qualifications) || input.qualifications.some(value => value?.eligible === true && !tickets.has(value)))
        throw new Error('original receiving instance did not issue the qualification');
      return projectQualifiedNativePolicy(input);
    },
  });
}

/** Derive a strict native policy only after the original owner has parsed its
 * native lock. Caller JSON is not a receipt, and this function performs no IO.
 * The original receiver must supply authentic eligibility results and retain
 * policy/lock/manifest bytes before and after its frozen install. */
function projectQualifiedNativePolicy({ policy = {}, lock, registry, qualifications = [], manifest, closure, registryConfiguration } = {}) {
  if (!lock || String(lock.lockfileVersion) !== '9.0' || !lock.packages || typeof lock.packages !== 'object')
    throw new TypeError('qualified native policy requires a parsed PNPM v9 lock');
  if (typeof registry !== 'string' || !/^https:\/\//u.test(registry)) throw new TypeError('exact registry required');
  checkNativeClosure({ lock, manifest, closure, registry, registryConfiguration });
  if ('minimumReleaseAgeExclude' in policy) throw new Error('preexisting age exclusions require original owner reconciliation');
  if (policy.minimumReleaseAgeStrict === false) throw new Error('strict native age filtering required');
  const selections = new Map();
  for (const qualification of qualifications) {
    if (qualification?.eligible !== true) continue;
    const release = qualification.release;
    const key = `${release?.name}@${release?.version}`;
    if (key !== qualification.selection || release.registry !== registry || !qualification.verificationRef || !qualification.receivingRef)
      throw new Error('qualification identity does not match native selection');
    const installedSubset = qualification.verifiedClosure.map(expected => closure.find(actual => actual.name === expected.name && actual.version === expected.version));
    if (installedSubset.some(value => !value) || qualification.closureDigest !== dependencyClosureDigest(installedSubset))
      throw new Error('tested closure differs from native closure');
    if (selections.has(key) && !isDeepStrictEqual(selections.get(key), release)) throw new Error('conflicting qualified selection');
    const entry = lock.packages[key];
    if (!entry || entry.resolution?.integrity !== release.integrity) throw new Error('native lock integrity differs from qualified artifact');
    if (entry.resolution.tarball !== undefined && entry.resolution.tarball !== release.tarball)
      throw new Error('native lock origin differs from qualified artifact');
    if (entry.resolution.type !== undefined || entry.resolution.directory !== undefined || entry.resolution.repo !== undefined)
      throw new Error('qualified lock selection is not a registry artifact');
    selections.set(key, release);
  }
  return Object.freeze({ ...policy, minimumReleaseAgeStrict: true,
    minimumReleaseAgeExclude: Object.freeze([...selections.keys()].sort()) });
}
