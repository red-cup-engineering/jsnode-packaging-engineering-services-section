# Complete root dependency lock delta — diagnostic contract

Status: pure semantic comparison only. This module does not parse YAML, run PNPM,
write a lock, receive source provenance, qualify an artifact, enforce registry
policy or attest an installed consumer. The composer binds the original YAML
2.9.1 diagnostic parser, duplicate-key handling, exact before/after bytes,
independently received package manifests/SRI and real native execution separately.

DELTA-1. `compareNativeRootDependencyLockDelta(input)` accepts exactly
beforeLock, afterLock, beforeManifest, afterManifest and change. `change` has
kind ('add' or 'replace'), name and next {manifest,integrity}; replace additionally
requires prior {manifest,integrity}. Selected names/versions are exact native npm
identities and selected integrity is one canonical sha512 SRI. Inputs must be
finite JSON own-data trees: no getters, inherited objects, sparse arrays, cycles,
symbols, nonfinite numbers, toJSON execution or unbounded structures. Limits are
32MiB conservative serialized data, 262144 nodes, depth24, 8192 keys/items per
collection and16384 characters per string/key. Unsupported input throws; a
well-shaped but unsupported or unintended delta returns an explicit refusal.

DELTA-2. Only lockfile9.0, root importer '.', and an exact root dependencies edge
are supported. Other importers may exist but remain exactly unchanged. The root
manifest may change only that exact dependencies property; its own identity,
other declarations and all other fields remain unchanged. The selected alias
must not also occur in another root dependency category. Registry integrity-only
selected package resolutions are required; no selected tarball/revision/patch,
local/alias resolution or new key already present is admitted.

DELTA-3. Addition requires no prior selected package/version anywhere in the
before lock and no prior root edge. The independently received new manifest must
have no runtime dependencies, optional dependencies, peers, peer metadata,
bundled dependencies or runtime activation. The after root edge is exactly
{specifier:next.version,version:next.version}. The new snapshot is exactly {}.
The package record is derived from the original writer: resolution.integrity;
non-'*' string engines; cpu/os/libc arrays; truthy string deprecated; hasBin=true
for a nonempty bin string/map; directories.bin is the nullish fallback only when
bin is absent, not when an explicitly empty bin suppresses it. No assumption that resolution
is the only permissible field is made. Extra fields or omitted derived fields
refuse. Native basis: toLockfileDependency/addPlatformRequirements/addEngines
226302–226403, hasBin226330, and splitPackageSnapshots199250–199280 of the received
PNPM11.28.5 distribution. This is a comparison expectation, never a cache/lock
writer or replacement native parser.

DELTA-4. Replacement requires a unique existing root edge, one old package key
and one old snapshot key. The root's existing version reference is old.version
plus an optional bounded balanced parenthesized suffix. Preserve that exact
suffix byte-for-byte and preserve the complete snapshot body. Parenthesized
contents are opaque: this comparator does not recompute or interpret peers.
Multiple old contexts, inherited old-version references, changed suffixes or
new-key collisions refuse. Only root specifier/version, package key/integrity,
and snapshot key may change. Prior/new name must match and versions must differ.

DELTA-5. Replacement prior/new manifest contracts must be deeply identical for
dependencies, devDependencies, optionalDependencies, peerDependencies,
peerDependenciesMeta, dependenciesMeta, exports, imports, engines, devEngines,
type, main, module, browser, bin, directories, cpu, os, libc, bundledDependencies
and bundleDependencies. Runtime activation and bundled payloads are unsupported.
Prior selected package resolution must exactly match prior SRI. Preserve all
other prior package fields; deriving new metadata or changing deprecation/peer
fields is outside this intended replacement. Contract equality is diagnostic,
not verification that either manifest belongs to an archive. The composer owns
that evidence. The actual Koios dev.946→dev.955 long suffix is a required fixture
shape; it is not an exception built into implementation.

DELTA-6. Compare the entire expected semantic tree against afterLock, including
every other importer/package/snapshot/peer context and every top-level setting.
Do not merely compare counts, importer pins or selected SRI. An expected tree may
exist privately in memory for comparison but must never be returned or serialized
as a lock. Returns kind pnpm.native-lock-delta-diagnostic.v1, accepted, reason,
selection, bounded mismatch paths and counts; no lock payload. Mismatch paths
use arrays of exact keys, avoiding JSON-pointer ambiguity. All outcomes explicitly
retain nativeExecutionReceived=false, policyVerified=false,
artifactVerificationReceived=false and installationReceived=false.

DELTA-7. Pure tests must cover dependency-free addition with real writer fields;
unsupported runtime/peer/bundle addition; exact replacement with nested long
suffix; manifest contract changes; SRI mismatch; existing new key; multiple old
contexts; inherited/aliased/dangling old references; changed peer suffix/body;
unrelated importer/package/snapshot/settings changes; complete large synthetic
closure; prototype/accessor/sparse/cycle/limit refusal; no input mutation and no
output lock. Native-produced output and actual archive provenance remain separate
later receiving requirements. A refusal never licenses hand-editing that output.

DELTA-8. `inspectNativeRegistryLockProfile({lock,manifest})` is a separate pure
pre-effect diagnostic. The composer calls it before any native launch, using its
bound YAML parser and source bytes. It receives lock9.0 with exactly one root
importer, canonical sha512 integrity-only registry packages, and complete native
package/snapshot references. Every dependency reference is an exact semver with
an optional preserved bounded peer suffix, and must name both its package and
snapshot. Unknown/exotic/aliased/local/git/patched references, orphan records,
unsupported package/snapshot/importer fields and invalid peer maps refuse.
Permitted top-level settings are boolean autoInstallPeers and false
excludeLinksFromLockfile; optional overrides have an exact package-name or
name@exact-version selector and an exact version value. No override eligibility
or authored-workspace admission is inferred from these diagnostics.

DELTA-9. The consumer manifest's dependency categories contain only exact named
registry versions, without duplicate aliases across categories. pnpm, overrides,
resolutions, workspaces, dependenciesMeta and peerDependenciesMeta are outside
this profile. Optional packageManager is exactly pnpm@11.28.5; runtime/manager
activation and nonstring engine declarations refuse. The manifest may already
contain the intended new exact pin absent/different in the old lock: this check
does not claim lock freshness or the selected delta. That separate complete
comparison remains DELTA-1–7 after real native completion. Return a frozen
pnpm.native-registry-lock-profile-diagnostic.v1 result with counts and explicit
false native/policy/artifact/installation claims. Neither API emits lock data.

DELTA-10. The preflight optionally accepts an exact `change` field with the same
selection shape as DELTA-1. The real composer must supply it before launch.
Require the current consumer dependencies edge to name next.version. Addition
reuses the dependency/peer-free native writer profile and absence check before
effects. Replacement reuses exact prior/new identity, contract equality, one
existing context, prior SRI and no inherited reference checks. Both refuse any
new key collision. Selected runtime dependencies/optional dependencies/peer
ranges must be ordinary semver registry declarations, never aliases or local/git
protocols. This does not authenticate the supplied manifests/SRI or prove that
other cached registry manifests cannot differ from inherited snapshots. Original
metadata/archive receiving and native offline refusal retain their own boundary.

DELTA-11. Explicit `profile: 'unchanged-registry-consumer'` is a third closed
input shape, exactly {lock,manifest,profile}; it cannot be combined with change.
The existing unqualified and change profiles remain byte-semantically strict.
Only this unchanged profile permits root peerDependenciesMeta, a record whose
keys are declared peer names and whose values are exactly {optional:true}.
Only peerDependencies and devDependencies may repeat one name, and only with
the same exact version. A peer declaration describes compatibility, while its
same-version development declaration supplies this library's test/build host;
it does not require a separate peer importer entry. Other role duplication,
conflicting versions, unknown metadata/configuration and executable activation
continue to refuse. All complete registry closure, opaque peer-context and
finite-data checks remain unchanged. No lock freshness, optional-peer presence,
artifact authority or native policy result is inferred. Actual native frozen
execution owns those facts. Initial-frozen npm composition selects this profile
explicitly; refresh/add/replace do not. No package-name exceptions are allowed.
