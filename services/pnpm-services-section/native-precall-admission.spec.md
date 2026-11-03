# Native publisher pre-call admission

## Registry-consumer frozen source composition

PPA-27. Guix's existing registry comparison must receive a committed standalone
consumer without inventing an administrative workspace or a lock-refresh
predecessor. `sourceProfile: "registry-consumer"` is an explicit frozen-only
extension of the original pre-call owner. The package may omit packageManager
or retain precisely pnpm@11.28.5. Existing activation, provider, hook, command,
environment, registry and source-custody restrictions remain unchanged. It does
not admit lock refresh, arbitrary source policy, registry resolution or runtime
acceptance. The original no-manager-pin and default profiles remain unchanged.

PPA-28. Preserve local workspace presence and bytes. The registry profile admits
an explicit packages:[] or the native implicit root when packages is absent,
literal age controls/exemption list and unique package-name→exact-version
overrides. No aliases, interpolations, selectors, local protocols, nested
configuration or broader workspace patterns are admitted. This admits original
MetroPlat77a179 policy blob86dd7e9f unchanged, including all eight overrides and
its authored wildcard exemptions; it neither creates nor widens exemptions.
Other source profiles retain their old explicit-root contract. An absent workspace stays
absent: no generated packages:[] file, ignore-workspace option or rewritten
policy is supplied. The qualified native distribution's root finder searches
upwards for pnpm-workspace.yaml and seven invalid spellings before evaluating
membership (distribution lines303427–303498). Reject those alternative local
spellings and, when local workspace is absent, all eight spellings plus .npmrc
at every ancestor through filesystem root. This conservative absence proof
refuses ambient discovery instead of reproducing native pattern membership.
Bind every absence in the original pre-call snapshot; appearance, disappearance
or policy mutation invalidates the held capability before the next operation.
Existing closed environment also excludes all workspace-dir selectors. The
exact native global/selected-user configuration checks remain authoritative.

PPA-29. The chosen composition uses original offline-frozen initial receiving,
not prepared-online/offline history fabricated from a refresh. Its fresh native
verifier and persisted-history requirements remain unchanged; missing cached
content or an unsupported cached policy decision refuses without online fallback.
The original npm supervisor owns execution, complete bounded artifact inputs and
installed-member comparisons. Pre-call admission alone is not a completed
installation or Guix machine verdict. Existing prepared-history predecessor
semantics are not widened by this source profile.

PPA-30. Receive absent/present workspace with actual original PNPM, unchanged
manifest/lock/policy, absent and exact manager pins, inherited/misspelled workspace
refusal, appeared/disappeared configuration, forbidden activation and existing
frozen process/partial/refusal controls. Native consumer tests remain separate
from these source-profile tests; no unrelated passing test establishes requested
change participation, a product or a target result.

PPA-31. A separately selected `online-frozen` initial mode supports bounded
procurement when strict native-store assembly's already-complete store does not
exist. It is never selected after offline refusal. Derive the unchanged original
frozen vector plus ignore-scripts, config.update-notifier=false and reporter=ndjson;
retain authored policy and command registry/cache selection. Only exact install
is admitted until receiving, then original read-only version probing. The new
receiveNativeOnlineInstall consumes the actual finite original result through
the same strict fresh-verifier and persisted-history receiver. Its receipt kind
is distinct from offline. Cached/partial/missing verification closes capability
without publication, rollback, history deletion or retry. Original offline and
prepared-history contracts remain separate and unchanged. Include the actually
revalidated native provider identity in initial installed receipts so the original
composer can bind installed artifact comparison without a caller assertion.

## Explicit single-package lock refresh refinement

PPA-17. The standalone registry consumer needs a source-owned native policy and
lock refresh without performing the original npm `update-lock` full install.
`operation: "lockfile-refresh"` is a separately selected refinement, not a change
to the original frozen profiles. `deriveNativeLockfileRefreshArguments` accepts
only the original nine-token publisher update vector (`install
--no-frozen-lockfile --registry URL --cache-dir ABS --store-dir ABS
--config.prefer-offline=false`) and appends `--lockfile-only --ignore-scripts`.
The exact derived vector is idempotent. Aliases, extra flags, offline-frozen composition
and contradictory arguments refuse. No release-age, trust or registry setting is
injected. The source policy must already be explicitly authored and received.

PPA-18. `sourceProfile: "root-package-no-manager-pin"` explicitly permits an
absent manifest packageManager, while continuing to refuse all manager/runtime
activation declarations. It retains the original real local root-only
`packages: []` policy file, exact registry configuration, provider bytes,
closed worker environment and absent hooks/global configuration. This is one
standalone package, not workspace dependency resolution. It does not admit
absent-policy or ancestor-workspace discovery. The original legacy-pin profile
remains the default. The new source profile is also usable for separately
admitted ordinary frozen installation; no frozen receipt is implied by refresh.

PPA-19. A refresh capability admits only its exact refresh command, never a
producer entry, version probe or inventory operation. The original caller owns
the bounded runner, complete registry-only closure, actual artifact/cache/store
effects, exclusive custody and available capacity. Native lockfile-only sets
skipFetch, but the qualified PNPM distribution can still fetch an archive when
its manifest is missing, integrity changed or the fetcher requires it. Therefore
this contract does not promise metadata-only execution or zero archive/store
writes. It introduces no alternate resolver, fetcher, executor or cache writer.
Frozen plus lockfile-only also does not execute the native frozen installation
verification path; it must not be used as an age/trust/install receipt.

PPA-20. `receiveNativeLockfileRefresh(capability, result)` consumes any receiving
attempt. It requires the original runner's complete finite operation interval
and terminal invoked=true/code=0/signal=null/timedOut=false/truncated=false/
failedToStart=false. It re-reads the entire pre-call snapshot and permits only
the intended root pnpm-lock.yaml byte change and original native verification-
history transition. Before/after history identities are retained, not treated
as fresh frozen verification. Manifest, policy presence/bytes,
registry inputs, provider, environment and implementation changes refuse. The
returned lock identities are execution/custody evidence, not semantic lock,
artifact, age, trust or installation qualification. Failure/uncertain execution
closes the capability and retains available changed-input evidence; no rollback,
cleanup, retry or newly created exclusion is accepted. The original publisher
must independently receive the complete native lock and perform its separately
admitted frozen installation before tests/publication/consumer acceptance.

PPA-21. Verify exact derivation, explicit no-pin admission, default-profile and
runtime refusals, forged/stale capability, command isolation, one-shot terminal
receiving and policy/manifest/provider drift after both successful and failed
execution. Native synthetic receiving must separately show lifecycle refusal,
no consumer linking, truthful possible archive fetching and unchanged authored
policy. It is not actual Flow installation or first-party artifact qualification.

PPA-22. Explicit `qualificationMode: "offline-lockfile-refresh"` adds only native
`--offline --reporter=ndjson` through `deriveNativeOfflineLockfileRefreshArguments`.
It requires the existing private owned cacheRoot/pnpm-metadata/pnpm-store custody
and exact command-path binding, without introducing a nonnative cache writer. The caller
must receive the complete registry-only metadata/available archive closure and
exclude exotic resolutions before invocation. Original native missing metadata
or archives refuse; there is no online fallback. The original snapshot retains
verification history rather than treating it as fresh policy evidence. This
does not reuse offline-frozen receiving, because lock refresh is not frozen
installation or fresh age/trust verification. Offline registry transport and
possible native archive/store effects remain separately qualified observations.

## Requirements

PPA-1. PNPM Engineering owns admission of executable configuration before the first native package-manager call. The publisher needs lifecycle-disabled frozen installation followed by Code's original version and root workspace inventory. Calling the manager to discover configuration is not admission: PNPM 11.28.5 handles manager/runtime declarations, configuration dependencies and hooks before returning from common command startup, including version and list. No parser is copied into the publisher.

PPA-2. This is a separately named `pnpm.publisher-precall-profile.v1` capability. Existing native installation, observation and closed-hook-free-profile.v1 contracts remain unchanged. It requires neither fabricated observation nor artifact-reuse requests. It depends on the original private hook-profile inspector and provider reader, not any subsequent metadata-preparation or transport repair.

## Supported profile and authority

PPA-3. The authoritative parser remains the qualified original PNPM distribution. Admission is a restricted absence proof, not general YAML or option equivalence. A local real Linux root must have package.json, pnpm-workspace.yaml with exactly the root-only `packages: []` selection, and its existing lock. The manifest must name precisely legacy `pnpm@11.28.5`; devEngines.packageManager, engines/devEngines runtime declarations, alternate manifests and default hooks refuse. For this exact legacy major-11 pin, native shouldPersistLockfile is false and switchCliVersion returns on the matching pin before resolver/store work. Broader pin forms are not admitted.

PPA-4. Workspace YAML reuses the existing closed syntax check, adds duplicate-root and interpolation refusals, and admits only packages and minimumReleaseAge/minimumReleaseAgeStrict/minimumReleaseAgeExclude. Source values are never changed. Project npmrc admits literal credential-free HTTPS root registry declarations only. Global YAML and auth.ini must be absent; default user npmrc is conservatively required absent although the explicit selected userconfig supersedes it; the publisher's explicitly selected user/global npmrc files must exist empty. Empty globalconfig is retained original-worker custody, not credited as a PNPM global-config selector. Legacy rc/system npmrc paths are not loaded by this exact native reader and are not speculatively claimed as input sources. Builtin provider npmrc must contain comments/blank lines only. Renamed hooks, configDependencies, token helpers, selectors, aliases, extra settings and unsupported discovery are refused rather than neutralized.

PPA-5. Receive the exact actual publisher child environment, without filtering or rewriting it. It contains PATH, locale/time fields, system directory fields, HOME/temp paths and the existing explicit empty npmrc selectors, lifecycle suppression and disabled notifier/audit/fund controls. `npm_config_ignore_scripts=true` is preserved as an original worker input, not credited as native PNPM lifecycle suppression: this distribution reads generic pnpm_config variables, not that npm compatibility variable. The explicit named owner transformation derives native --ignore-scripts and the publisher must deliberately execute that returned vector. Any other environment field refuses. No credential or transport scope is inferred. This deliberately bounded profile does not admit ordinary interactive shells or unrelated publisher recipes.

PPA-6. Qualify original Node 24.19.0, manifest-selected PNPM 11.28.5 entry and distribution without launching a version probe. Bind the actual PATH-resolved node and pnpm. An original byte-qualified compatibility pnpm.cjs launcher is supported separately from its manifest-selected pnpm.mjs target; unrelated wrappers and another installed PNPM refuse. Bind source configuration/lock/manifest bytes and absences, complete launch environment digest, original supplier files, Node binary, and the admission implementation dependencies. Public receipts contain identities only, never raw environment or file contents.

## Interface and composition

PPA-7. `./native-precall-admission` exports `deriveNativeLifecycleDisabledInstallArguments(originalArguments)`, `receiveNativePrecallAdmission({cwd,pnpm,originalInstallArguments,installArguments})` and `assertNativePrecallAdmission(capability,command?)`. `receiveNativePrecallAdmission` is static/read-only and returns a process-local WeakMap-branded immutable capability with kind, snapshot identity and an immutable transformation record containing exact original/derived argv, named transformation kind and identity. Admission verifies the derivation rather than trusting a supplied receipt. `assertNativePrecallAdmission` re-reads the whole admission snapshot and rejects changes. A fabricated or deserialized capability is not usable. Optional command is exactly `{cwd,program,arguments}` and must resolve to the admitted supplier and one admitted argument sequence.

PPA-8. The named transformation accepts only the exact original publisher frozen-install vector, preserves its tokens and appends --ignore-scripts. The exact already-disabled vector is idempotent; aliases, contradictory false controls and duplicates refuse. Admission refuses the untransformed vector. The only admitted argument sequences are the original frozen publisher install (`install --frozen-lockfile --registry URL --cache-dir ABS --store-dir ABS --config.prefer-offline=false --ignore-scripts`), `--version`, and unfiltered `list --recursive --depth=-1 --json`. Recursive list is bounded by the admitted root-only workspace. Aliases, extra selectors/options and update-lock are unsupported. This service performs no spawn, process wrapping, installation, mutation or recovery. The publisher checks the capability before its first mutation/manager call and again before each original producer entry; direct native callers can check the exact command. Existing source-owner custody verifies all authored inputs before/after execution. This pre-call proof is not an OS sandbox or a guarantee against an adversarial concurrent writer.

## Receiving and failure semantics

PPA-9. Tests must cover unchanged real consumer configuration, original provider version/inventory and frozen fixture installation; pre-call refusals for default/renamed/global hooks, configuration dependencies, alternate manifests, token-helper inputs, manager/runtime activation, lifecycle absence, wrong provider, unsupported command, changed sources/environment and forged capability. No refused input launches PNPM. Actual application installation, source generation, published dependency integration and receiving are separate obligations. Qualification against candidate owner source must not be reported as installed/published owner capability.

## Explicit offline frozen publisher qualification

PPA-10. `qualificationMode: "offline-frozen"` is an explicit additional profile,
not a fallback or a new default. The separately named owner transformation
`deriveNativeOfflineFrozenInstallArguments` retains the original frozen vector,
adds native lifecycle suppression, `--offline` and `--reporter=ndjson`, and is
idempotent on that exact derived vector. Contradictory aliases and extra flags
refuse. Original PNPM 11.28.5 declares offline as Boolean; no config-string
coercion is substituted. Online profile v1 semantics are unchanged.

PPA-11. Offline admission requires `cacheRoot`, a caller-exclusively allocated,
private, owned, real absolute directory disjoint from source. Its existing
`pnpm-metadata` and `pnpm-store` children must be owned and unredirected, and match
the exact command paths. Bind their physical identities together with unchanged
source manifest/lock/policy/registry and provider identities. Existing native
verification history is retained as input, not removed or treated as a fresh
verdict. The caller retains sole-writer allocation custody from acquisition
through terminal receiving; this is not an adversarial same-UID writer sandbox.
No global-cache hash, metadata relabeling, synthetic index or cache controller is
introduced. Nested native cache state must originate in the original native
acquisition route and remain within that allocation.

PPA-12. `receiveNativeOfflineInstall(capability,result)` receives the actual
original runner's bounded complete stdout, terminal result and observed operation
interval through the original observation reporter receiver. Only a fresh
native started→done verification may advance this profile. Native cached success,
failed/partial/ambiguous output or unsuccessful process termination refuses.
Native 11.28.5 may trust a prior lock-content-hash/policy verdict without reading
current metadata: cached is not fresh sufficiency. Refusal can follow a completed
local install, which remains owned but must not enter Code generation or package
publication. There is no online retry, policy change or rollback deleting cache
history. Caller cancellation/uncertain runners preserve original work custody.

PPA-13. Receiving revalidates every authored/provider/context/cache-allocation
identity and permits only the native verification-history transition. It records
both prior and post-install verdict identities, then binds the post-install state
for later producer assertions. Before receiving, only the exact install vector
is admissible; producer entry/version/inventory cannot bypass this gate. This
process-local transition is not a serialized authorization or a cross-worker
replay contract. A subsequent routine job must independently receive its own
fresh-native result; an unsupported cached result remains refused and owned.

PPA-14. Native timestamps, operation bounds and emitted verifiedAt are observed
replay inputs, not a supplied exact cutoff or a latest-registry claim. The
unchanged native release-age policy is authoritative. In this exact distribution,
minimumReleaseAgeStrict is not minimum-release-age-ignore-missing-time; the latter
default is true. A successful native result does not prove every package had a
publish timestamp. Never silently strengthen or weaken the original source policy.

PPA-15. Receive online regression, exact offline derivation, cache redirection and
source drift refusals, cached-success refusal, bounded reporter failure modes,
and native offline fresh verification in a network-isolated fixture. Missing or
wrong-origin metadata must refuse on the fresh native path; an existing applicable
verdict is tested separately as unsupported cached success. Actual Newsroom source,
complete native inputs, generation, packing and consumer receiving remain later
conditions and cannot be replaced by a smaller fixture.

PPA-16. Any receiving attempt consumes the installation transition. Failure
closes the capability; success permits producer reads but refuses another install.
The original native verdict writer can swallow a persistence failure, so fresh
reporter success alone is insufficient for persisted-history receiving. Require
changed history with an emitted record for this exact lock path and verifiedAt
inside the observed operation, retaining that original record's digest. Do not
recompute native private lock hashes or replay native policy. Use the statically
loaded original reporter receiver only after revalidating admitted source/context;
a changed helper must not be dynamically evaluated before custody rejection.


## Explicit inherited native transport composition

PPA-23. The original publisher worker grammar remains the default. A separately
selected `environmentProfile: 'inherited-native-transport'` accepts an explicit
own-data `environment` and the original metadata service's `environmentPolicy`
(stable exact fingerprints and role-specific relay protocol/hostname identities).
It composes the unchanged closed worker fields with that one transport grammar,
not a second transport allowlist. Every other field refuses. NPM_CONFIG_PREFIX
is refused as configuration selection rather than classified as transport.
No process environment is filtered/reset, proxy removed, runtime preload added,
CA changed, route selected, or executable launched by this component. The caller
must capture the inherited transport inputs once for this launch, preserve every
admitted role/alias value and use the resulting original worker environment.
Unrelated parent application variables are not command inputs; source composition
must not pass arbitrary process.env to a receipt-echoing executor.

PPA-24. Explicit admission resolves PNPM and Node using that environment's PATH,
checks the selected HOME/XDG_CONFIG_HOME native global absences, and binds regular
unredirected NODE_EXTRA_CA_CERTS/SSL_CERT_FILE bytes. It retains exact source,
configuration, empty worker npmrc and provider custody from the existing profile.
The private shared transport helper is factored from native-metadata-session,
without importing the metadata/semver effectful composition into precall.
Both owners bind this helper in their source identity. NODE_USE_ENV_PROXY is a
stable scalar, not a relay URL; uppercase/lowercase HTTP/HTTPS/ALL/NPM relay roles
retain their original independent values, with no invented alias equivalence.

PPA-25. Admission snapshots the complete environment and policy as own data;
caller mutation cannot replace held inputs. `assertNativePrecallAdmission` for
an explicit-profile command requires its `environment` to equal the admitted
snapshot, in addition to the exact cwd/program/arguments. The caller passes
that same launch object unchanged to its original executor. Explicit-profile
capabilities never admit an undefined-command producer entry: the producer would
need its own exact environment-bearing launch contract. Default legacy producer
entry semantics are unchanged. Ports may vary only
between separately admitted launch snapshots, not between admission, assertion
and receiving. Public capability/receiving summaries disclose identities only.
Credential-bearing relays, extra settings/preloads, missing stable fields,
changed protocol/host/alias value, redirected/changed CA and appeared global
configuration refuse before the dependent native call.

PPA-26. This source profile is static admission, not a new process controller.
It does not fix the existing async executor0.3.1 detached-group lifetime gap:
normal child close does not establish all-descendant quiescence, and native
PNPM error handling can spawn ps through pidtree. A supported original supervised
binding remains necessary before real acquisition/refresh. Metadata-native
readability, bounded receipt tails, exact lock semantics, full graph resources
and frozen installed receiving remain distinct obligations.

## Candidate receiving scope (2026-10-26)

The source-profile suite received25 passes and4 explicit skips (two original
optional native cases and two new separately run native cases). The separate
original PNPM11.28.5/Node24.19 assay received absent workspace and local-root
ancestor-config isolation2/2. The composing original npm factory subsequently
received a nonempty standalone unchanged-lock online fixture, fresh native
verification plus persisted history, archive/selected installed members and real
module import; a separately allocated offline-empty-store fixture refused with
no registry request. No workspace or lock was synthesized by the operation.
MetroPlat77a179's exact workspace fixture is static policy admission only, not
its full native dependency closure or running product. Provider issuance, real
consumer integration and Guix target measurement remain unreceived.

The required public source/archive/installed CI suite keeps its original optional
consumer case only. Supervisor-dependent standalone assays live in the explicit
`test/native-registry-consumer-native.test.mjs` entry, named with exact required
providers in ci-native-qualification.json.outsideThisReceiving. Invoking that
entry without its original supervisor/supplier refuses, rather than skipping.
Its shared fixture preserves the original source suite's setup unchanged. The
separate source invocation receives25 passes/2 original optional skips; native
CI enables the original native case, leaving only the private-consumer skip.
No skip whitelist or required receivingTests enrollment is weakened.

## Explicit source-qualified registry projection v2

PPA-32. `registryProjectionPolicy: registry-projection-consumer-v2` refines only
registry-consumer initial offline/online-frozen admission. Omission leaves strict
original behavior unchanged. Prepared/refresh profiles refuse rather than claim
qualified reuse. Original private capability and fresh policy receiving remain
mandatory; no new process executor, cache writer, native observation, or runtime
branch inference is introduced.

PPA-33. Native PNPM defaults side-effects-cache to true (qualified distribution
line177557); resolveSideEffectsCache lines179010–179022 makes boolean false disable
reads and writes. Therefore v2 requires the actual authored local workspace literal
`sideEffectsCache: false`. It does not inject configuration, rewrite source, or
mistake ignore-scripts for cache-read suppression. Only this explicit refinement
admits that exact workspace field/value. Existing closed configuration/environment
and hook absence proofs remain. Manifest pnpm configuration and lock root fields
outside lockfileVersion/settings/overrides/importers/packages/snapshots refuse;
patch/alternate manifest transforms and remote side-effects settings are not
admitted. All source/configuration identities are retained and revalidated.

PPA-34. Bind actual original dist/worker.js SHA256
5878ae8493ead2e083a4fbf33844d2d463ecebb1a1cd3fc86c04be16721bf156
in the original snapshot, separately from launcher/entry/distribution. The
source-qualified closed route set pnpm11-registry-cafs-and-link-v1 covers buffer-map,
buffer-stream (including large entry), verified-store-reuse and linked-tree reuse
under the composing bounded registry archive domain. It never asserts observedRoute;
that field is null. Native file-stream transport-spill remains excluded by the
composing compressed64MiB limit. Selected installed member bytes/modes/bin receiving
remain required even for cache reuse; native cache verification is not represented
as a fresh hash of every CAFS byte.

PPA-35. Retain original cache allocation/base directory identities and hash their
ordered original cacheCustody.directory records as storeAllocationSHA256. Effective
store is exactly configuredBase/v11. It may be absent before native execution;
only the original one-shot successful frozen receiver may admit its transition to
an owned real unredirected directory. Existing effective store device/inode/owner/
mode must survive unchanged. Store contents/history are neither emptied nor deleted.
Before-call appearance/replacement and post-receiving replacement refuse. Physical
custody is bounded by the existing sole-writer allocation, not a hostile same-UID
sandbox. Before/after hashes identify these directory custody records, not an
assertion that every store file is unchanged or rehashed.

PPA-36. `receiveNativeRegistryProjectionBinding(capability)` only accepts the
original private admission after successful original frozen receiving, re-reads
source/provider/store custody, and returns deeply immutable process-local facts.
`assertNativeRegistryProjectionBinding(binding)` rejects fabricated or serialized
copies using a private WeakMap and revalidates actual custody. The composing factory
must retain this authority privately; its artifact adapter selects only schema
fields and adds actual archive/request/receipt identities. JSON facts alone are
not an execution capability. A new fixed worker reconstructs admission from actual
inputs, never from serialized proof. V2 success is source-qualified route evidence,
not observed branch evidence, installed package equality, release, or real MetroPlat
receiving. A cached policy result still refuses under the original fresh-only
initial receiver; lawful routine reuse requires independently qualified receiving,
not removal of native history or fallback after refusal.

## Same-consumer routine verification and read-only source custody

PPA-37. Initial fresh receiving now retains its actual successful snapshot as a
private `initialReceived` checkpoint. Existing prepared admission accepts that
original checkpoint alongside refreshed/prepared predecessors; no serialized
receipt is admitted. It consumes the predecessor once, re-reads exact source,
provider, allocation and history, and reuses preparedHistory's same-path/stat
causality. Lock bytes alone do not excuse inode/mtime drift. For projection v2,
only the existing prepared-offline command/reporting contract is admitted;
prepared-online cannot prove a cached native policy event and refuses.

PPA-38. The original prepared receiver requires complete successful execution,
unchanged history/stat and the original cached event tied to held verifiedAt.
It preserves cached-native/freshPolicyRecomputationReceived:false semantics.
Projection v2 additionally requires the already-present owned effective v11
store to retain exact physical custody and derives a new private projection
binding only after successful prepared receiving. The next routine verification
uses the genuine prepared successor, never a consumed predecessor. Actual
installed-member/bin comparisons and import remain factory responsibilities.
Static prepared admission in the fixed child admits only command/configuration;
without causal private history receiving it cannot issue a received projection
binding. Fresh-only receiving is unchanged and still closes on cached output.
Cross-path cached-history admission, history deletion, forced recomputation,
post-refusal fallback and cross-process success-deserialization are not provided.

PPA-39. `receiveNativeRegistryProjectionSourceCustody(input)` receives the original
lifecycle-disabled source input with sourceProfile registry-consumer and the
explicit v2 policy, but forbids qualificationMode/cacheRoot/operation. It reuses
snapshot, actual worker/provider and closed configuration validation, including
authored sideEffectsCache:false and unsupported lock-transform refusal. Its
private capability is source observation only, has no store/installation claim,
and is always refused by assertNativePrecallAdmission. The paired
`assertNativeRegistryProjectionSourceCustody(capability)` only re-reads custody.
It cannot become an installation predecessor or native projection binding. This
supports optional original sourceDirectory without broadening strict command
admission or writing an administrative workspace. Default behavior stays intact.

PPA-40. Qualify forged/cloned/foreign predecessor, one-use success and failure,
exact source/config/history/store and same-byte lock-stat invalidation, mismatched
cached timestamp, partial output, failed terminal, unchanged fresh-only refusal,
source-only execution refusal and genuine successive routine transitions. Static
synthetic state tests never establish native runtime policy or extraction routes.
Native qualification must execute the original same-path offline command after
fresh receiving, preserve actual source/tree/cache/history and compare selected
installed members, bins and consumer import through the original factory. Retain
all failed or uncertain attempts; no old closed attempt is rehabilitated.

PPA-41. Preserve canonical main's native-store-custody source/spec/tests and
package enrollments alongside PR8's registry-consumer source/fixture enrollments.
New projection and routine tests must be included in package test,
receivingTests and files so the original source/archive/installed CI gate runs
them with its exact supplier. Direct local tests are not publication receiving.
The unrelated permission-migration operation remains separately authorized; no
routine factory or projection path invokes it. These changes introduce no new
executor, inference service, policy exemption table or alternative CI controller.
