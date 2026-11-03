# PNPM native metadata ticket service: requirements and design

Status: proposed source contract, no implementation or batch execution.
Source base: PNPM owner branch c40a91842a3d525f624889631660f1a9a0166afb; current main/merge base f726991e93e1fd132249df25e573cead7ee84bac, ahead3/behind0. No two-parent merge is needed at these identities.

## Purpose and owners
MT-1. Turn the received one-name native metadata producer→offline-reader composition into a bounded reusable source component without introducing a downloader, cache serializer, installer or process controller. Preserve canonical selection, original release-age policy, exact native provider and native cache format.
MT-2. The existing PNPM metadata owner owns projection, supported outdated configuration/profile admission, provider/source custody and producer/reader evidence interpretation. The existing publisher/CI caller owns its finite work selection, resource admission, raw private receipts and invocation of the existing public asynchronous JavaScript-node command executor. That executor alone owns spawn, timeout, output tails and process-group termination.
MT-3. One real name has producer and offline-reader evidence. That does not admit every selected name, native strict lock verification, archive reuse, frozen installation, three-artifact comparison or original MetroPlat application tests.

## Reused components and exact scope
Reuse projectNativeMetadataQuery, receiveNativeMetadataFile, existing provider identity helper, original JavascriptNodeCommandExecutionRequest contract, and execute-javascript-node-command-service/asynchronously. The service itself never imports/invokes an executor. Existing APIs remain unchanged.
Add a public source-only createNativeMetadataPreparationService export in the existing metadata component, or a cohesive sibling module exported at the existing metadata subpath if closure size warrants it. Do not add archive/observer flags. No issued version/pin is fabricated.
Initial profile remains exact Node24.19.0/PNPM11.28.5 distribution. Only the qualified outdated command and its offline variant are supported. No arbitrary argv, registry override, local archive dependency, hooks, configDependencies, lifecycle, shell command or user-selected executable callback is accepted.

## Typed preparation inputs
prepare receives:
- exact program/base PNPM entry selection;
- canonical source/manifest/lock/workspace/registry/selection identities and complete selected records;
- exactly one name from that inventory, not a free-form package request;
- original policy, explicit native registry and supported serverType profile;
- task-owned exclusive query and receipt directories plus explicit shared native cache directory;
- an admitted configuration/profile description with its actual file sources and expected absence boundaries;
- explicit child environment object and role constraints, safe to retain in private executor receipts;
- finite original executor limits, initially45000ms and1048576 characters per tail.

Preparation validates data before filesystem effects, binds source/importer/provider bytes read-only before any provider execution, invokes the existing public projection and creates its exact query files exclusively. It checks the selected native configuration readers rather than trusting a caller hash as authority. It does not run --version or any native command. Initial fresh-production mode requires the selected name's expected mirror absent at preparation and again immediately before producer request issuance; other names may already exist in the shared cache. An existing selected mirror refuses this mode without deletion or refresh. Reuse of separately received native-origin evidence is a distinct future contract, not inferred from a hash or structural parsing. It returns an opaque per-instance ticket and a safe prepared summary, NOT a launchable request yet.

The shared provider helper remains the only provider implementation. Factor configuration-source admission from the existing hook-profile module only where genuinely common; keep separate exact grammars for install and outdated. Do not feed outdated through the install-only grammar or copy its validator. Global/default hook and configDependencies checks precede every native command. Exact projection files and relevant configuration bytes/absence are checked again for reused directories.

## Input lifetime and environment
Immutable canonical registry, policy, source, provider and configuration identities remain exact across phases. Invocation-local transport inputs have fixed role-specific protocol/host/credential-free shape constraints derived from actual native reader precedence. Capture one environment object per launch, validate it, and pass that same object unchanged. Do not require ALL_PROXY and HTTP/HTTPS roles to equal one another; preserve their distinct admitted values. Do not replay old dynamic ports or remove/rewrite transport inputs.

The caller must not pass arbitrary process.env into a receipt-echoing executor. The supported profile selects explicit known inputs and binds CA/source files and config discovery without exposing raw values in safe summaries. The caller launcher refuses NODE_OPTIONS before starting Node; the already-running service also refuses unsupported runtime inputs but cannot retroactively prevent a preload. Credential-bearing values are refused before the dependent command request is issued. Stable nonsecret fingerprints are allowed; secret-derived fingerprints are not. Raw executor receipts stay private and are not sanitized publication data.

## State machine and methods
The service returns prepare, revalidate and receive. Tickets are opaque WeakMap-owned objects, not serializable authority. Every transition writes a bounded private phase receipt before returning success; receipt failure blocks dependent advancement.

States:
1. prepared-producer: validated projection/query/cache/source profile; no native effect begun.
2. producer-in-flight: revalidate(ticket,{phase:'producer',environment}) has completed current custody/profile/resource-independent checks, durably recorded launch intent and returned ONE immutable original command request. A second launch-request issue is refused. This is one-time request issuance, not technical prevention of a trusted caller executing the returned request twice; the existing caller owns that no-replay obligation.
3. producer-received: receive(ticket,{phase:'producer',executionReceipt}) accepted exact request binding, native terminal result, complete structured output/selected wanted identity and original mirror file observation. Raw timestamp coverage remains a separate field; missing-time native behavior is not silently tightened.
4. reader-in-flight: revalidate(ticket,{phase:'reader',environment}) is allowed only from producer-received. It binds the received mirror bytes, same query/cache/source and current admitted environment, records one launch intent, and returns the same native query argv plus --config.offline=true.
5. complete: receive reader accepted original native result and unchanged mirror bytes/query/source/config. This means native offline metadata readability only.
6. failed or unknown: terminal failure, truncated output, missing evidence, changed custody, invalid state, or caller-reported uncertain process outcome cannot advance or issue a replay. Retain the exact phase and observed prefix. No implicit retries or fallback. No automatic fresh ticket for the same operation is a caller recovery rule, not a demand for a new persistent cross-process deduplication ledger. A wrong or copied ticket refuses without mutating unrelated valid ticket state.

The caller owns the interval between launch-intent issuance and actual executor invocation. If it never invokes, or loses the result, the ticket remains in-flight/unknown, not magically successful or safely repeatable. A new process cannot resurrect a serialized ticket. Recovery requires reading original process/custody evidence and an explicit new operation decision, not a service retry branch.

receive checks the existing executor receipt type/version and exact request equality, not merely exit0. The established native outdated statuses0/1 are admissible only with no error/signal, output below both tail limits, complete JSON object and exact selected wanted identity. Other statuses and JSON failures remain native/receiving failure. A caller-supplied receipt is trusted source composition, not cryptographic process authenticity.

Producer file observation requires the existing native mirror reader's no-follow/stable-file/size checks after the absent-selected-mirror preparation. Its schema and timestamp coverage are diagnostic; rawCoverage.complete is not added as a policy gate. Reader acceptance compares the same mirror identity before and after; no hand-built cache file is admitted. Source revalidation after terminal outcome cannot replace native exit or convert failure into success. If custody also fails, preserve the original native error/result alongside the separate custody refusal instead of overwriting it.

## Request and receiving invariants
- Query and reader share ONE explicit native cache path; later original install must use that same supported --config.cache-dir value.
- Producer and reader use the same canonical projection files and registry/policy. Only the qualified offline switch differs.
- Repeated revalidate/receive, wrong phase, foreign/copied ticket, receipt with wrong request/env/cwd/argv, changed mirror and replayed producer receipt all refuse without another native invocation.
- A native metadata writer can perform internal work; networkConcurrency1 is not a universal scheduler claim. No transport replacement is introduced.
- No batch execution, installation or strict verifier runs in the service.

## Caller composition and finite tranche

The additive four-name batch service is specified separately in
`native-metadata-batch.spec.md`. It uses this same session/custody implementation
with a fixed source-selected batch profile, distinct kinds and complete matrix/
mirror receiving. Existing one-name inputs, states and meanings remain unchanged;
the single-name absence and receiving rules below do not implicitly widen argv.
An existing publisher/CI caller may supply an explicitly reviewed finite list and drive each ticket serially: prepare→issue producer request→existing executor→receive producer→issue offline reader request→existing executor→receive reader. Stop on first failed/unknown state. Persist original receipts and safe progress without inventing a new process runtime.

The proposed four-name list remains unexecuted. Its authority is separate from the fulfilled one-query approval. Each command retains the original45s child-group deadline. Eight commands would provide360s of subprocess allowances, not a whole-job guarantee. Parent interruption does not establish detached child settlement.

Plan512MiB overlay allowance and at least1GiB overlay/150MiB tmp headroom checked before each new command; actual native writer growth is not hard-capped by the64MiB post-write receipt limit. Record real cache/receipt allocation and stop before another name if reserve is insufficient. One measured526996-byte mirror cannot justify all493 names.

## Acceptance and qualification
Pure/local tests must establish exact transitions and unchanged legacy APIs, request contract, finite bounds, canonical name selection/dedup, foreign/copied/replayed tickets, wrong request/env/phase, receipt loss, parse/error/truncation, changed source/query/mirror, hook/configDependencies refusal before native work, per-role input preservation/non-disclosure, and no executable callback/JSON command injection.

Native synthetic assay reuses the existing loopback metadata fixture and existing async executor. It must receive producer→offline reader with exact request binding and unchanged mirror, preserve missing-time warning/default behavior, refuse missing mirror/offline miss and wrong identity, stop on timeout/error/unknown without another request, and prove no archive/install/lifecycle calls. It is not enough to substitute a fake executor for the entire composition. No real canonical tranche runs until the frozen source and finite runner are independently reviewed and received.

Changes to source/service enrollment and its tests require exact-parent custody and later publication readback. No package issuance or production CI admission is implied. Original PR140 frozen installation and installed/runtime receiving remain the final obligation after all necessary metadata and artifact inputs are actually received.

## Realized receipt storage semantics
Phase receipts use the existing Node filesystem API: exclusive open(wx,0600), awaited write and close, then bounded regular-file readback and SHA256. No fsync or parent-directory sync is performed; “durable” in the proposal means retained process-level evidence after successful readback, NOT power-loss durability, guaranteed crash cleanup, or restartable tickets. Files remain private; raw execution receipts may contain unsanitized remote error text and the admitted environment. No publication of raw values is implied.

Source-bound state tests use an explicitly supplied original PNPM distribution for read-only provider hashing, never a version probe. Synthetic receipt files are test-only state oracles, not native cache provenance. The separately enrolled original-executor loopback assay establishes actual native producer/reader behavior. Missing provider inputs cause explicit skips, which must not count as qualified receiving.

## Implementation closure and narrow profile
The existing metadata own-data parser is factored unchanged into private native-metadata-data.mjs and reused for bounded executor receipt input, with an explicit larger string bound for the already-limited output tails. The existing hook-profile owner supplies the separate metadata configuration reader, not the install CLI parser. Initial metadata profile admits only the generated query, comments-only original builtin pnpmrc, absent user/global config and default hooks, and explicit known environment fields. The source identity binds all five helper/module files plus package manifest and the exact semver7.7.2 regular JS/manifest superset (256 files,128 directories,1MiB). This is conservative source custody, not a minimal-import claim or installed release admission.

The service writes each phase receipt exclusively and reads it back before returning advancement. A collision/failed receipt leaves the ticket failed; it never requests a second command. Command return and receipt evidence remain separate from OS-level process authenticity. Loopback tests retain task-owned fixtures when a fixture root is explicitly supplied; ordinary small unit fixtures clean only their own private directories.

## Pre-test original-contract corrections
The original JavascriptNodeCommandExecutionResult@1 requires error to be a string. A successful original async executor returns the empty string, not null; null is refused as a malformed result, while nonempty error evidence blocks acceptance. Query parent, cache root and receipt root must remain unredirected real directories at request custody checks; every phase write separately checks the receipt root. These are path custody checks, not a race-proof filesystem sandbox. If evidence storage itself is unavailable, the service refuses; the trusted caller must retain its original execution receipt rather than claim service persistence succeeded.

Qualification is split precisely: 19 new local state cases cover request/identity/shape/state errors, including wrong wanted identity; six original-executor loopback cases cover normal producer/reader, offline missing file, canonical missing-time default with warning, HTTP500, native request timeout and caller-reported unknown. The unknown case deliberately withholds a retained successful executor receipt from service admission; it is not a simulated OS crash or proof of recovery. No wrong-package server response or full policy verifier is claimed by these six cases.

## Shared transport role correction and consumer composition

The existing pure transport validator now resides in the private
native-transport-environment.mjs owner module and retains its existing public
re-export. The metadata source identity includes that helper. Its relay role
predicate excludes NODE_USE_ENV_PROXY, which is a stable exact Node activation
scalar (for example '1'), not a URL; the previous suffix predicate incorrectly
refused this currently inherited input. All existing URL credential/host/protocol
rules and independent alias values remain unchanged. Original source-owned
precall admission composes this same validator with its worker-only grammar and
binds CA bytes/configuration absences; it does not import or recreate the metadata
writer. Local role/state receiving does not settle the async executor's known
normal-close descendant-custody gap or authorize a native run.

Malformed relay URLs now produce a fixed refusal without the URL parser's raw
input property. This preserves shape refusal without leaking an unadmitted value
through an exception. Credential-bearing URL refusal remains unchanged.


## Node 24.18 metadata qualification and composition
MT-24. The metadata producer/reader supports exact Node 24.18.0 in addition to
24.19.0 with the same original PNPM 11.28.5 distribution. This lets installed
CRG prepare missing policy metadata before its separately qualified 24.18
frozen store assembly. No alternate runtime installation is required.
MT-25. A metadata-specific provider binding owns that allowance. Existing
installation and observation provider contracts retain their exact 24.19
requirement; store assembly retains its existing exact 24.18 requirement.
The original projection's node field remains its default, with an additive
supportedNodeVersions inventory. The native provider still binds the running
program, original CLI, manifest, distribution bytes and source custody.
MT-26. Receive the original native producer/reader suite on 24.18, including
missing mirror, missing publication time, HTTP failure, bounded timeout and
unknown outcome. Receive ticket and batch controls with no skips. Qualification
is metadata only: no native lock policy acceptance, store fill or installed
Koios acceptance follows. Original callers own finite complete inventories,
resource admission, native execution and retained receipts. Do not retry an
uncertain producer or use a subset of mirrors as complete closure evidence.

