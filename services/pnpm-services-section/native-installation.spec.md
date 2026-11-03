# Native received-registry-artifact composition

## Requirement and owner boundary

NRA-1. An independently received exact registry archive can remove a redundant
archive transport prerequisite without changing the registry package identity,
frozen graph, source bytes, release-age/trust verification or final installed
artifact comparison. Archive transport, policy metadata and consumer receiving
are separate obligations. A successful reuse hook does not complete an install.

NRA-2. PNPM Engineering owns provider qualification, effective hook-conflict
admission, the original native custom-fetcher extension and its evidence reader.
The existing publisher owns its process, exclusive/memory admission, staging,
original provider guard, frozen graph checks and installed artifact comparison.
No second installer, downloader, index serializer, command controller, global
mutation, local-file dependency alias or Systems-specific exception is admitted.

## Explicit source-service API

NRA-3. `./native-installation` exports `createNativeInstallationService`.
The factory accepts an optional explicit original archive-reader service port and
an optional source-fixture qualification root. The archive-reader port is the
original publisher's `readRegistryArchiveMembers` function, declared with its
owner/version/public export/member and a bounded, duplicate-free source-member
custody inventory. This is trusted direct JavaScript composition, not a JSON
locator or authentication of an arbitrary callback by self-declared hashes.
The caller must receive the actual supplier and its relevant external parser
bindings. Qualification records the actual imported original reader separately
from any future issued dependency. No production dependency pin is fabricated.

The immutable service has `prepare`, `revalidate` and `receive` methods and issues
opaque per-instance sessions. `prepare` receives the unmodified program/base argv,
complete original command argv, real staging directory and a request containing
`observation`, `artifactReuse`, or both. It returns only a constrained delta:
existing qualified observation preload/reporter/environment, and optionally one
private fetchers-only pnpmfile. It cannot replace the program, policy, original
arguments, process deadlines or output limits. Foreign sessions refuse.

NRA-4. Provider custody is exactly Node24.19.0 and original PNPM11.28.5, including
the qualified distribution digest. The shared private provider implementation is
factored from the existing observer, whose source closure now includes it.
Prepared byte identities are compared before any subsequent version probe.
All new composition requests, even observation-only, receive the closed effective
configuration profile before the first provider probe. Existing omitted and
legacy observer APIs retain their behavior. The new profile refuses native
configDependencies before any supplier installation could be triggered.

## Restricted effective configuration profile

NRA-5. This is an explicit absence proof, not a replacement YAML/config loader.
It supports real Linux staging selected by the original `--dir`, a local native
workspace file (standalone composition is unsupported), and native globals
read through actual XDG_CONFIG_HOME/HOME selection. It binds those files and safe
environment identities, rejects existing default pnpmfiles, and rejects CLI/env
aliases capable of changing hook, plugin, workspace or lock context.

The admitted YAML syntax is deliberately restricted to column-zero plain block
keys and their indented data. Ambiguous root indentation, quoted/flow root keys,
multi-document markers, directives, merge keys, root tags/anchors/aliases and
control characters refuse. Recognized hook/configDependencies/context keys refuse
regardless of case/separator aliases. Nested ordinary policy data remain intact.
YAML setting keys are canonicalized only by case and separator folding. Their
semantic `config` or `no` stems are never removed. Environment names use a
separate grammar: remove one explicit npm/pnpm-config namespace, then fold the
setting suffix; the explicitly unsupported no-ignore-pnpmfile alias remains a
separate refusal. CLI inputs retain the exact canonical grammar, without this
normalizer. Workspace and global configDependencies forms must refuse before
any provider probe. Synthetic fixtures isolate only the declared context-selector
environment names and restore exact prior presence/values, preserving transport,
registry, TLS and authentication inputs. This does not establish real PR140
profile admissibility. NPM_CONFIG_PREFIX is not a direct selector in this PNPM11
loader, but interpolation may consume it; the conservative profile continues to
refuse it until a separately admitted real configuration is established.

Unsupported syntax is not silently interpreted as absence. Native configuration
is parsed by @zkochan/js-yaml0.0.11, not the independently held yaml2.9.1 fixture
parser. No general parser equivalence is claimed.

## Archive admission and native extension

NRA-6. Each selection requires exact name/version, original registry, actual
native intended tarball URL, canonical SHA512, original received regular archive
and every existing reader bound. HTTPS endpoints must be same-origin, without
credentials/query/fragment. Explicit loopback HTTP is confined to a qualification
root. Native intended URL comes from the explicit frozen resolution or actual
native registry/name/version derivation, never acquisition metadata by assumption.

At most64 unique identities/URLs are admitted. Compressed snapshots total at most
128MiB; declared expanded TAR ceilings total at most256MiB, member ceilings65536,
and manifest-metadata ceilings4MiB. Existing per-archive reader ceilings remain.
The original reader is called serially inside the publisher's existing exclusive
memory admission, with compressed allocation tightened to actual bounded file
size. Expanded results are not retained between selections. Private snapshot
copying uses a64KiB buffer, exclusive creation, actual SHA512/SHA256, stable
no-follow file observations and post-write verification. These are application
ceilings and admission inputs, not a physical-memory or filesystem quota; caller
qualification also binds available memory, private disk space and whole-operation
supervision. Existing publisher artifactReceiving pre-reading is a separate
unchanged owner operation with its own explicit bounds.

NRA-7. The generated pnpmfile exports only `fetchers`, not readPackage hooks.
The original native loader supplies `canFetch` with original packageId/resolution,
and supplies `fetch` with original CAFS, options and integrity-bound built-ins.
Unselected packageIds return false and retain normal native behavior. Selected
wrong URL/SRI/type refuses without fallback. The adapter verifies the snapshot,
then awaits the supplied `fetchers.localTarball` with unchanged CAFS/options and a
copy of resolution differing only by the private native `file:` path. It preserves
locked integrity, filesIndexFile/pkgResolutionId and the native return value.
It does not derive or write an index key. The raw absolute file path follows the
native localTarball contract, which slices `file:` rather than decoding a URI.

Workers skip before argv/config/session validation or I/O. Main-process evidence
is finite and allowlisted: ready, selected, delegated, native-returned, refused,
final/final-refused, selected identity and bounded refusal code. It contains no
URL/header/query/path payload. An awaited native return is not a store commit.

## Required receiving versus optional observation

NRA-8. Reuse evidence is correctness-affecting. Missing/malformed/lost evidence,
selected mismatch, snapshot/source/config change or an incomplete delegated fetch
blocks successful replacement even when the native child exited zero. An entry
never invoked remains explicitly `not-invoked`; it may already exist in the native
store and is not falsely reported as having used the archive hook. Observation
loss is independently partial and nonfatal when required reuse receiving and all
original installation checks succeed. Original native exit/signal remains separate.

`receive` is read-only after process settlement. It checks prepared provider,
source/input/profile/reader/config/snapshot custody without launching a probe,
binds prepared private config and hook digests, parses finite evidence, and retains
raw stdout/stderr byte counts/digests with only safe observation projections.
Revalidation does not prevent every concurrent filesystem race or establish
provider authenticity from a caller-supplied hash.

NRA-9. Private snapshots/config/evidence live outside disposable publisher staging.
Original source inputs, prior consumer and native store/WAL are preserved on
refusal; existing publisher staging cleanup stays unchanged. Forced termination
can leave private partial evidence and partially committed native store work.
Reconcile the original process/group, exact native key and retained evidence
before another action. No final marker, cleanup, rollback, persistence or retry
is promised after a kill. A complete hook return alone never authorizes retry.

## Qualification and remaining production obligations

NRA-10. Pure tests exercise closed syntax and actual selector aliases, source-only
port validation, selected SRI/URL refusal, supplied native argument preservation,
snapshot tampering and unsupported worker early return. Publisher tests exercise
unchanged omitted behavior, typed-port rejection and archive preparation behind
original memory admission.

Original-PNPM loopback qualification uses tiny original TAR producer bytes and the
existing public archive reader. A uses frozen integrity-only registry slots,
requires zero selected archive GETs, permits an unselected normal archive GET,
retains strict policy, receives the installed artifact and reads the native
integrity-tab-name@version index through a WAL-aware read-only transaction.
Task-owned actual PNPM metadata cache is explicitly writable and selected.
The test receives native-produced full metadata before B. B supplies the original
strict offline reader and is conditional on A, uses the same native store/cache,
has no archive hook and receives the same installed bytes with network forbidden.
Any cached strict-policy judgment remains labeled native cached verification,
not a newly recomputed policy judgment.

Other native cases cover reuse without observation, cached native skipping with
the hook still installed, actual native hooks-object/checksum refusal, wrong frozen
SRI/URL, mutation between preparation and
invocation, required-evidence loss despite native exit0, nonfatal observation loss,
and interrupted strict-policy wait with retained private evidence/store but no
accepted consumer. Original disposable staging cleanup is checked without
cleaning native store/WAL. No public registry or original PR140 replay is part of
these tests. The independent metadata fixture's earlier failure is retained; its
corrected actual command/config contract must be received before combined claims.

NRA-11. Source qualification is not issuance or installed-consumer admission.
Later production composition must use actually received exact suppliers and
canonical input/effective registry/serverType/capacity custody. Sequential native
metadata preparation can use the existing public asynchronous JavaScript Node
command service, with explicit nonsecret environment, bounded output tail and
per-command deadline, no automatic retry and suspension on uncertain outcome.
That service echoes its environment; never pass all inherited environment or
change transport to sanitize a receipt. No new executor/controller is required.
This archive service does not yet implement that metadata orchestration, and
archive reuse cannot close unfinished strict metadata/policy verification.


### Closed command and probe context

The new composition admits only exact canonical original-install spellings: one
absolute provider entry, one `install`, one `--dir` pair, fixed frozen/scripts/
reporter/offline flags, and explicitly listed store/cache/import/resource/policy
options. Unknown options, nopt abbreviations, short aliases, recursive/filter/
workspace-root selectors and duplicates refuse. This deliberately narrower
profile is preferred to reproducing native normalization. Both base version
probes and install use the same real local staged workspace and native globals;
no standalone `--ignore-workspace` claim is made. Profile admission precedes ALL
new-capability provider probes, including the publisher artifact guard.

Native canFetch selection precedes native store skipping. A complete selected
record without delegation is `selected-not-delegated`: no claim of consumed
archive, persisted index or store reuse follows. It does not itself refuse an
otherwise accepted native install. Delegation without native return remains
incomplete. Original native store and installed-artifact receiving establish
those separate facts, not the hook selection record.


The current source fixture has not yet qualified interruption during the selected
native localTarball call. A policy-wait interruption is not that evidence. A
future bounded original-process milestone assay must retain whether delegation
was still pending after settlement; missing the short window is not a pass and
must not trigger automatic retries or a production pause hook.

Strict native policy is preserved, including its original default
minimumReleaseAgeIgnoreMissingTime=true where not overridden. Native acceptance
of missing timestamps must not be described as timestamp maturity evidence.


### Received reader runtime custody

The explicit reader port carries source-file identities and importer package
realpath bindings. Bounds are4096 files,1024 bindings,4MiB per file and16MiB
aggregate source bytes. This admits the measured qualification superset of94
original declared packages,2398 runtime files,12,289,361 bytes and320 binding
edges, plus55 publisher source/manifest files (2453 files/12,764,553 bytes total).
It is a conservative declared runtime superset, not a minimal import graph.
Bindings and bytes are checked before the fixture imports the publisher and at
service preparation/revalidation/receiving. No resolver, installer or supplier
execution is introduced by these checks. The explicit service callback remains
an already trusted source-composition port, not authenticated by self-asserted
hashes.

Each ordinary composed receiving case entails up to five serial reader-custody
passes (63,822,765 bytes of source reads), plus initial fixture qualification: prepare, post-prepare revalidate, prelaunch
revalidate, receive, and post-receive revalidate. These
are I/O/admission costs, not retained allocations; original archive expansions
remain separately bounded. The finite outer qualification envelope includes
these reads and every provider probe. A timed-out run is not automatically retried.
