# Proposed native consumer preparation refinement

Status: implemented source candidate; no connected native receiving or issued capability claimed.
Owner: @red-cup-engineering/pnpm-engineering-services-section, physical
services/pnpm-services-section of jsnode-packaging-engineering-services-section.
Base: ea2265f19ac3650ffc0dfff33ca93076616c2332. This refines the existing
native-metadata and native-precall contracts; it introduces no resolver,
transport, process controller, store writer or per-release policy exception.

## Drivers and responsibilities

| Existing obligation | Preserved responsibility | New bounded refinement |
|---|---|---|
| Batch1–4 and NMW1–12 | PNPM owns exact query/session/category semantics; npm owns original worker process and retained execution | Explicit raw abbreviated acquisition, paired with existing full acquisition |
| PPA17–22 | PNPM derives and receives exact offline lock-only command/custody, without install claim | Original npm fixed lock operation consumes this API |
| PPA10–16 | Fresh-only offline frozen receiving must stay fresh-only | Separately evaluate native-policy frozen receiving with truthful cached status |
| NRA1–11 | Archive reuse/installed bytes are not metadata or policy proof | Explicit original archive-reader and installed-member receiving after materialization |

Canonical source is not a generated metadata query. Raw registry manifests are
not an installed graph. Native cache observations are not first-party artifact
qualification. A successful lock writer is not frozen installation. No new
profile changes consumer release-age/trust values or turns a scope pattern into
source ownership proof.

## A. Explicit abbreviated raw-read purpose

A1. Add a separately named projection/session surface, or an explicitly named
closed refinement of the existing batch surface, for
`raw-registry-metadata-acquisition` with category `abbreviated`. Do not silently
reinterpret the existing unchanged-policy/full query. Unknown categories,
caller-supplied argv, arbitrary zero-age policy requests and mixed-profile data
refuse. At most four exact names and the complete canonical selection inventory
remain bound once. Existing one-name and full-batch behavior remains compatible.

A2. Keep canonical consumer policy as supplied, including its positive external
age, source-authored exclusions and exact actual policy-file SHA256. Generated
query workspace is a separate source-derived read context: root-only packages,
query-only minimumReleaseAge0, existing strict/control fields, fetchRetries0,
fetchTimeout15000 and networkConcurrency1. The command remains original native
outdated --compatible with exact names; --long is absent. Never write the
consumer workspace from this service or report the generated query's age as the
consumer's policy. Initial downstream composition refuses no-downgrade trust or
other full-filtered resolver policies rather than inferring coverage.

A3. Projection identity includes purpose/category, canonical identities, complete
original policy, generated query files and full selection context. Expected file
category is source-derived: abbreviated→v12/metadata; existing full→v12/metadata-full.
The service does not accept a free mirror path/category alias. Both are below the
same original derived cacheRoot/pnpm-metadata allocation. Preserve all prior
qualification files and claims; no cross-category rewriting, copying or relabeling.

A4. For raw abbreviated producer and offline reader, accept only the exact output
name matrix with latest==wanted==each selected representative and original native
status0/1 semantics. Preserve duplicate-key/malformed-output refusal. The full
nonzero-age operation retains its weaker wanted-only semantics where latest is
legitimately absent. Both phases receive stable exact mirrors; post-settlement
hashes must match. Every selected version's raw name/version/manifest/SRI coverage
is diagnostic input; only the representative passed through this native command.
No fabricated all-version native parsing claim.

A5. Abbreviated time may be absent, so raw acquisition does not require timestamps
in that category. Report actual selected time and modified-field observations
without copying from full metadata. A pair is not age-readiness: later offline
resolution can refuse missing time and cannot upgrade from the separate full
mirror. Original source policy determines exclusions/old-modified handling.
The full mirror retains its own selected timestamp diagnostics. No eligibility,
maturity, trust, artifact or installation receipt is issued by either category.

A6. Compose categories as two independently supervised existing tickets, each
with original45-second native phases and a140-second outer envelope, under a
finite aggregate caller allowance. Four worst-case45-second phases do not fit
one140-second envelope. One failure/refusal/unknown stops dependent tickets;
partial native cache writes remain owned, never transactional rollback. Four
names bound top-level resolution chains, not response bytes or request count.
No new full-graph or memory-cap guarantee is introduced.

## B. Lock refresh and semantic receiving

B1. Keep PPA's current exact cacheRoot/pnpm-metadata/pnpm-store layout and exact
update-lock→lockfile-only→ignore-scripts→offline→NDJSON derivation. Caller must
have actual authored source policy and exact registry-only inventory, no manager
activation, no unsupported hooks/config/aliases/exotics. Standalone source uses
the existing explicit no-manager-pin profile; do not add a fictitious pin.

B2. The original npm composing operation owns the process, not this module.
It must bind the actual executable launch (including the PNPM entry's Node/env
launcher semantics if executed directly), current qualified executor source,
original ps error path, whole package/import closure and one inherited transport
snapshot. The command asserted by PPA must be the command actually executed;
logical-equivalent argv or an unasserted Node-prefix adaptation is not evidence.

B3. Full registry resolution can still occur with an inherited lock and empty
modules/store. Lockfile-only avoids fetching only under the original native
manifest/integrity/fetcher predicate. Missing inputs must refuse offline with
original terminal/raw data; no network fallback or interpretation of a loose tgz
as native store state. Derive per-operation output/deadline/resource limits from
lock behavior, not the metadata worker's smaller constants.

B4. Receive original runner terminal and complete interval, source/helper/
provider/environment/cache custody, native lock/history transition and no
consumer linking/lifecycle. Then independently compare the complete native lock
against intended source change, retaining every package and peer-context snapshot
rather than only the importer or SRI list. Unsupported native peer deduplication
or other extra changes are a refusal of the intended delta, not a reason to
hand-edit native output. Native parser/execution remains authoritative; diagnostic
parsing must identify its actual provider and cannot impersonate native evidence.

## C. Frozen materialization and verification status

C1. Native refresh records the newly written semantic lock as verified. A later
same-cache frozen operation may legitimately report cached; changing lock paths,
mtime or formatting cannot establish freshness. Retain history untouched.

C2. Preserve receiveNativeOfflineInstall's existing fresh-only contract and every
replay/refusal rule. Do not relax it in place or reinterpret its receipt.

C3. Proposed alternative for routine native-policy receiving: an explicitly
separate offline-frozen profile may receive native fresh or native cached status
as distinct outcomes, after exact successful original execution, complete bounded
NDJSON, post-custody and original persisted-history identity. A cached outcome must
retain its actual verifiedAt/history record and explicitly state that fresh
metadata/policy recomputation was not received. Native policy, integrity and source
settings remain unchanged. This is not a first-party artifact ticket or a claim
that current registry contents were consulted. The design and receiving linkage
must be reviewed before implementation.

C4. Alternative fresh-only composition requires a separately native-populated
history-free metadata namespace. Sharing the original native store across such a
namespace is not currently admitted by PPA's fixed layout and would require a
separate source refinement. Do not copy cache/history or broaden paths silently.

C5. Either final route is a real materialization boundary: the full required
platform-applicable package-content closure, finite resources and original
native store/archive acquisition must be received first. Metadata mirrors and
raw archives are insufficient. Existing NRA selected-archive hooks cannot be
injected into hook-free PPA without explicit source composition. After native
materialization, original installed-artifact/member receiving and real consumer
imports/tests remain required; ignore-scripts does not prove build/runtime needs.

## D. Required falsification tests

- Existing one-name/full-batch API and ordinary build callers unchanged.
- Exact category/purpose/source-policy separation and refusal before effects.
- Actual native two-category producer→offline-reader with absent time, old/recent/
  missing modified, multiple versions and no archive calls; no consumer policy edit.
- Exact-category empty-store lock success for complete integrity-bearing registry
  manifests; missing-category, missing/changed SRI, missing manifest/exotic cases.
- Root-only/no-pin policy, no lifecycles/linking, complete intended semantic delta.
- Original outer timeout/cancellation/output overflow, direct-child and descendant
  settlement, receipt loss, post-source drift and single-use/refusal behavior.
- Tiny offline frozen missing-store refusal; separately admitted original store
  acquisition; actual fresh versus cached verification with history retained;
  installed archive-member and consumer import receiving.
- Actual Flow/Koios remain later separately bounded consumers, not fixture claims.

## E. Selected implementable interface and proof boundary

E1. Select a closed refinement of the existing **batch** API, not another query
implementation. Existing seven-field batch inputs and projections remain byte-
compatible. The additional supported input has exactly the existing fields plus
`purpose: 'raw-registry-metadata-acquisition'` and `category: 'abbreviated'`.
Both fields must occur together. Output retains the existing batch kind and adds
these two fields plus `queryPolicy` (derived age-zero policy); `policy` always
remains the canonical nonzero consumer policy. Projection hash includes both.
The existing batch session selects the refinement from those closed fields and
keeps its private WeakMap state; no old/full ticket can change category. Producer/
reader phase receipts identify the category via the bound full projection.

E2. Frozen support is an explicit **prepared native-policy** refinement, not a
relaxation of fresh-only offline receiving. Its causal input is the original
process-local successful lock-refresh capability, held by the composing parent
from actual pre-call admission through real post-settlement refresh receiving.
A serialized refresh receipt/capability is refused. The PNPM module retains the
received after-lock/source/cache/history identity privately on that capability.
The initial supported sequence is same original source path, unchanged lock bytes
and same native cache allocation. Native content-hash fallback from a different
source path/stat and arbitrary prior global cache evidence are outside this first
profile. After actual materialization, a new process-local installation capability
may be the causal predecessor for the optional offline check. Capabilities are
one-use per transition; a failed/refused receiving closes the dependent sequence.
No durable or cross-process resume is promised by these local capabilities.

E3. The parent owns the PNPM capability and calls its receiver only after the
original outer group is quiescent. The fixed child independently repeats static
admission/assertion before executing its exact command. It cannot serialize the
parent capability or substitute a claimed success. The parent receives the exact
original executor request/result, source identities and original terminal group
observation before supplying the bounded execution observation to PNPM.

E4. Verification grammar for prepared native-policy receiving:

- Successful complete original execution and unchanged authored lock/policy/
  provider/transport are prerequisites in both cases.
- Fresh is exactly the existing valid started→done sequence and original changed
  persisted native record. Use the existing receiver semantics without weakening.
- Cached is exactly one valid `pnpm:lockfile-verification` debug event with status
  cached, positive native PID, exact lock path and event time inside the actual
  original operation interval. Mixed/duplicate/failed/malformed/partial sequences
  refuse. verifiedAt must be a finite original timestamp no later than the event.
- Before invocation, retain the exact regular raw history file and last native
  row for this same lock path, including its opaque semantic hash, policy object,
  verifiedAt and native size/mtimeNs/inode. Bind that row to the privately retained
  preceding original refresh/materialization history and unchanged lock bytes.
  The current lock stat must match that row. The event must match its verifiedAt.
- For this deliberately narrow by-stat cached branch, require unchanged raw
  history bytes after the operation. A native append/compaction/hash-fallback
  transition is retained but refused, not repaired or replayed. This does not
  claim native history can never compact: native writes may legitimately compact
  above1,536,000 bytes; those transitions remain supported by appropriate fresh
  receiving or a future separately qualified refinement, not by this first cache
  reuse branch.
- Do not calculate PNPM's semantic lock hash or duplicate its cache-policy
  eligibility algorithm. The actual native cached decision remains authoritative;
  the receiver binds its causal original evidence and labels it non-fresh.

E5. Exact initial operational bounds, owned by npm composition, are:

| Operation | Original sync deadline | Output stop threshold | Outer deadline | Raw receipt ceiling |
|---|---:|---:|---:|---:|
| Offline lock refresh |120000ms|4194304 bytes|180000ms|33554432 bytes|
| Online frozen materialization |240000ms|4194304 bytes|300000ms|33554432 bytes|
| Optional offline frozen check |120000ms|4194304 bytes|180000ms|33554432 bytes|

Outer output remains a1MiB bounded summary. Raw original executor evidence is
saved before any narrower parser refuses. The sync byte option is a stop threshold
with observed chunk overshoot, not a hard retained/network byte quota. The existing
8MiB reporter receiver remains its own ceiling. Serialization and truncation
failures refuse while retaining all successfully written original evidence.
These finite assay/operation limits do not admit an arbitrarily large graph.

E6. Store population uses the **existing native frozen install**, derived
by the original npm verify command and separately named PNPM prepared-online
transformation below, under separately admitted complete artifact/content
resources. Ordinary lifecycle-disabled callers are unchanged. It is online and
materializes node_modules/native store. It is not advertised as metadata-only or
used as a fallback from failed offline preparation. Do not add a prefetcher or
experimental fetch controller. A preceding offline missing-store failure does
not automatically trigger this operation; it needs its independently admitted
stage/input/effects. The actual first real Flow full-content stage remains held.

E7. Complete qualification uses one owned **HTTPS loopback** registry origin for
all full/abbreviated/lock/archive stages, with actual bounded local fixture CA
bytes and explicit worker CA custody. Synthetic fixture transport is labeled as
such; it does not replace the already received real inherited-transport claim.
No HTTP mirror is renamed into HTTPS identity and no production TLS control is
weakened. The same policy/source files remain unchanged through the whole chain.

## Initial implemented transition surface

receiveNativePreparedInstallAdmission(originalPredecessor, {offline}) accepts only
own-data options and an actual original received process-local refresh/prepared
capability; no JSON receipt can replace it. The new prepared receiver initially
supports unchanged same-path/stat/history cached offline decisions only. Native
fresh history transitions remain at the original unchanged receiveNativeOfflineInstall
surface; they are not accepted by pretending a changed history is cached. Refusals
retain prior/post history identities, read-failure status and possible local changes.
Online execution without a reporter explicitly reports policy not observed.

The original composer must call inspectNativeRegistryLockProfile before native
resolution and compareNativeRootDependencyLockDelta afterward. Both are pure
complete-tree diagnostics, not native parser/ownership/eligibility authority.
Their complete contract and exact addition/replacement scope are in
native-lock-delta.spec.md. A serialized diagnostic cannot mint any PNPM capability.

## Explicit prepared verifier path

The first actual repeated offline install exited through PNPM's optimistic
workspace-state shortcut, without any lockfile-verification event. The cached
receiver correctly refused. Do not reinterpret that missing event as cached or
fresh policy verification, or alter timestamps/history to provoke a different run.

`deriveNativePreparedOfflineInstallArguments(originalArguments)` derives the
original script-disabled offline frozen vector plus exactly one terminal
`--no-optimistic-repeat-install`. It is idempotent for that exact derived vector.
The separate static qualificationMode `prepared-offline-frozen` admits only this
exact install command and the exact `--version` probe. Producer entry, list,
unknown flags and the new flag in the old offline-frozen grammar refuse. The old
deriveNativeOfflineFrozenInstallArguments and fresh-only receiver remain unchanged.

Actual process-local prepared offline admission selects the new mode. Merely
admitting this static JSON command profile does not supply preparedHistory or
permit prepared receiving; the private original successful predecessor remains
mandatory. The composer repeats exact static child admission and binds the real
original executor request and terminal group. The prepared cached receiver still
requires its exact native event plus unchanged causal source/stat/history.

Original PNPM11.28.5 basis: Boolean type178901, install option whitelist245124
and cliOptionsTypes245171, nopt303795–303840 Boolean negation, and
reportAlreadyUpToDate244169. False disables only the optimization and enters the
original install/verifier path234002–234018; it does not force/update a lock or
disable age/trust. It remains a materialization-capable operation: original
complete-content/capacity admission and final installed-member receiving are
required. Native cache/fresh behavior is received, never promised from this flag.

## Explicit prepared online content path

The next actual connected assay received the cached native verifier event,
installed-member comparisons and consumer import, but correctly failed its final
request-set check: online install also requested `/pnpm` for the native update
notifier. The fixture refused that unexpected lookup. The inherited
`npm_config_update_notifier:false` string is not an effective PNPM11 setting;
retaining it in the unchanged original-worker environment does not prove update
checks are disabled. Do not whitelist the extra package or fabricate a cache hit.

`deriveNativePreparedOnlineInstallArguments(originalArguments)` derives the
original nine-token frozen vector plus `--ignore-scripts` and exactly terminal
`--config.update-notifier=false`. It is idempotent for its exact eleven-token
result and the original lifecycle-disabled vector. The static qualificationMode
`prepared-online-frozen` requires the existing explicit private cache allocation
and admits only this exact install command and `--version`. Producer entry, list,
unknown/reordered/duplicate flags and either prepared vector in another mode
refuse. No generic configuration or environment allowlist is widened.

Actual process-local prepared online admission selects this mode; the static
mode itself cannot create a successful predecessor, policy verdict or installed
artifact authority. Online receiving still reports policyVerification:not-observed.
The existing ordinary ten-token lifecycle-disabled vector, offline vector,
prepared offline verifier and fresh-only receiver remain unchanged. Source
policy, trust, minimum age, canonical files, native history and inherited
transport are not rewritten. Complete-content/capacity admission, original
supervision and post-operation installed-member receiving remain mandatory.

Original PNPM11.28.5 source basis: warnBeforeCommand369524–369527 starts the
online install/add update check; checkForUpdates151833–151865 resolves the native
package manager name at latest, with retries0, and may write pnpm-state.json.
The generic environment reader accepts only pnpm_config_/PNPM_CONFIG_ prefixes
(178729–178753,179136–179148); npm_config_ is only a separate userconfig fallback
at183115, not this setting. Direct --no-update-notifier is not in the install
245101–245168 or global368066–368087 option lists. The supported custom CLI
spelling uses nopt's false conversion303616–303642, config-prefix normalization
366595–366611 and camel-case CLI assignment183098–183105. The fixed false value
makes only the updateCheckEnabled predicate false; it does not disable package
integrity, age or trust checks, change offline behavior, force resolution, or
claim that no other network request is possible. Exact native request coverage
must still be received by the connected assay.
