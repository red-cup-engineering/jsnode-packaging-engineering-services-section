# Original source-worker execution evidence

Design baseline: 2026-10-26, npm-workspace-publication-service main
`de93b9fc8e8bfe704d5667654a42356b746d5f90`, supervisor blob
`c41933824824fe261903e5f79873965cd449d482`. Authored bounded correction;
source qualification is not native admission, installation or deployment.

## Need and actual prior contract

A consumer who loses its outer platform handle must be able to read the original
worker's request, observed launch and eventual terminal evidence without rerunning
work or treating a reused PID as original authority. NMW-6/8/9 allocate retained
input/group/output/terminal evidence to npm's existing private supervisor and
fixed metadata composer. Native-package-preparation allocates exclusive intent,
original execution and preservation on unknown to the same owner. The current
supervisor discloses PID/group only after close; parent composers write
outer-result.json only after their await. Native synchronous phase receipts are
written only after execution returns. Original input.json is already exclusive.
This leaves a genuine loss-of-observability window, not proof of failed native
work or a reason to replay an existing unknown attempt.

The observed Flow40871 and Fabrication85831 scopes stay UNKNOWN and untouched.
This change has no access to, and cannot repair, their lost platform handles.

## Allocation and choice

Keep runSourceWorkerProcess as the only process/group/deadline/cancellation owner.
Add an evidence-only private filesystem helper, not another executor, controller,
watcher or runtime inference dependency. Wire the existing metadata and package
fixed composers to a derived `worker-evidence` child of their admitted private
attempt. No public operation field selects a program, recovery path or executor.
Legacy source-build and registry consumers retain their unchanged options/results.
Do not change their launch or existing in-process signal/settlement behavior.

Alternatives rejected: stdout-only final receipt (lost handle still loses it);
a separately surviving supervisor daemon (new lifecycle/authority); callbacks
(caller-selected effects); restoring tickets or sending signals from saved PIDs
(reused IDs and absent original authority); leaking store/DB handles forever
(neither bounded nor a settlement proof).

## Preconditions and environmental expectations

SWE-1. Evidence-enabled invocation shall require a normalized absolute absent
child directory of a real private caller-owned parent, exact existing input
path/byte-count/SHA256 and finite existing timeout/combined-output bounds. The
supervisor shall verify the original input and retain its own source identities.
The fixed callers derive these values from their original input.json; request
identity includes program, argv, cwd, limits and a digest of the explicit launch
environment, never environment values. No secrets or credential inventory is
added. Directory/source/input ownership remains the existing trusted exclusive
same-user operating assumption, not adversarial filesystem isolation.

SWE-2. Before spawn the owner shall exclusively create its evidence directory,
raw stream files and durable request.json. If any prerequisite persistence fails,
no child is invoked. Existing paths are never overwritten, deleted or resumed.
The already-written original intent still consumes that attempt. Pre-aborted or
malformed cancellation retains legacy no-spawn refusal and need not create files.

SWE-3. Immediately after spawn returns, before yielding control, the owner shall
retain start.json with observed child PID/group, original startedAt, boot ID,
PID-namespace identifier, and /proc start ticks/group/session when available.
Request evidence retains the original parent identity as well. A fast-exited child
or unavailable /proc evidence is explicitly unavailable, never invented. This
observes the inherited namespace; it does not create a private namespace or prove
containment. Start.json is observation, not success or restart authority.

SWE-4. Each bounded chunk retained by the original combined-output policy shall
also be written to its original stdout/stderr file before the next event turn.
The two files together never exceed the original maxBuffer. Original capture
semantics and raw bytes remain unchanged; no replay or truncation-as-success.
Kernel writes retain a recoverable prefix across ordinary owner-process loss.
The files are synced at terminal, not on every chunk; unsynced prefixes have no
power-loss guarantee. Storage latency is an explicit filesystem assumption, not
a hard wall-clock enforcement guarantee. Finite two descriptors close on all
known prelaunch/terminal paths; abrupt process loss relies on OS descriptor close.

SWE-5. After the original close/stop/quiescence procedure, before resolving or
rejecting the caller's promise, the owner shall sync raw files and retain an
exclusive terminal.json binding request/start identities, process observation,
raw byte identities, original failure code and persistence failures. Accepted
supervisor output requires successful terminal persistence; terminal is still
only supervisor settlement, not package/metadata receiving acceptance. Existing
outer-result and native phase outcomes retain their own separate meaning.

SWE-6. A start/stream/terminal write failure after spawn shall never become success.
While running it requests stop only through the original in-process owner. The
original BUILD_WORKER_CUSTODY_UNCERTAIN code, group, raw capture and observation
win over every secondary evidence error. A settled original failure keeps its
original code, with additive evidence-failure detail. A settled otherwise-successful
child with lost evidence refuses with WORKER_EVIDENCE_UNRECEIVED. No receipt-write
failure implies quiescence. Evidence references/failures remain available on the
original error/result observation even if the final receipt cannot be written.
The observation itself shall carry evidence-failure details so both fixed composers
retain them after catching the supervisor error. If their outer-result save fails,
they shall preserve the original execution error (when present), attach the original
typed operation evidence with accepted=false and receivingEvidenceLost=true, and
retain the secondary persistence failure separately. No later write error may erase
an original uncertain operation. This is fixed error transport, not a new executor.

SWE-7. The fixed worker shall retain a bounded phase request before invoking each
original synchronous native phase. It binds input digest, phase, actual admitted
request fields and environment digest, limits, worker identity and observation
time. No native PID is fabricated: the existing synchronous executor does not
expose a start handle before return. Existing original phase result receipts remain
authoritative for their own request/result and are not replaced by this intent.
Failure to retain phase intent stops before that phase; no later phase follows.

## Durable points, crash states and legal next acts

JSON publication uses exclusive temporary creation, complete write, fsync, exclusive
link to final name, then parent-directory fsync. Raw files are exclusive 0600,
evidence root 0700. A partially written temporary file is never a final receipt.
Successful fsync is a local filesystem durability request, not evidence surviving
VM/storage destruction or dishonest hardware. Existing native input/result files
keep their existing contract; no global crash-atomic transaction is claimed.

| Last available evidence | Meaning after owner/handle loss | Legal continuation |
| --- | --- | --- |
| Original input only | Prepared; actual launch unknown | Retain; no replay |
| request.json, no start | Request prepared; spawn may or may not have happened | UNKNOWN; no replay |
| start plus raw prefix, no terminal | Launch observed; native work/settlement unknown | Read original receipts only |
| native phase request, no original phase result | Phase may or may not have run/completed | UNKNOWN; no replay |
| terminal with quiescent false | Supervisor settlement unknown | Retain scope; no dependent work |
| settled terminal, no outer receiving | Supervisor settled; semantic receiving absent | Original read-only receiving may inspect; no ticket resurrection |
| successful outer receiving | Only original declared receiving accepted | Existing admitted next transition |

Saved numeric PID/group, boot ID, namespace and start ticks are **not cancellation
capabilities**. This patch exposes no recovery signal, PID lookup or resume API.
A later receiver must not signal from these observations even if current proc
fields match: equality is not race-free authority, the leader can exit and IDs
can be reused. Original live-parent signal behavior is unchanged and remains
bounded by its existing same-invocation process-group assumption, not a claimed
PID-reuse-proof restart protocol. Restart-safe containment/cancellation would need
its own provider and architectural contract; that is not smuggled into this patch.

## Verification specified before implementation

1. Real harmless child: request/start exist before terminal, actual live /proc
   identity matches recorded observation, raw stdout/stderr bytes and digests match,
   terminal precedes promise success and legacy result shape remains unchanged.
2. Discard only the caller promise/outer observation while the original owner
   survives: read the independently retained terminal without launching again.
   This is a local lifetime test, not emulation of platform production recovery.
3. Controlled owner-process exit after start, with harmless independently
   self-terminating short-lived child: retained start/raw prefix but no terminal
   means unknown. No test signals unknown/production jobs.
4. Existing path, changed input, invalid bounds, prelaunch write failure: zero
   child effects and retained prior files; no reset or overwrite.
5. Start/stream/terminal persistence failures: refusal and bounded descriptor
   lifecycle; settled original nonzero status is not masked.
6. Synthetic settlement refusal only after an already-exited harmless child plus
   secondary receipt failure: original uncertain code/group/raw survive.
7. Failed spawn: terminal invoked=false/group=null; no invented quiescence.
8. Timeout, output overflow and cancellation keep original settlement and bounded
   capture. Run original nine supervisor tests in separate test-runner processes
   from global monkeypatch tests and queue-fix tests.
9. Native-phase intent serialization retains no environment values, is exclusive,
   and precedes the original executor by exact source contract. Full original-native
   PNPM suites require fresh qualified supplier bindings and are a separate gate.

Exact candidate, hashes, intended/enrolled/executed tests and exclusions shall be
handed for independent review before integration. No original unknown job is
polled, signalled, cleaned up or replayed as part of qualification.

## Independent-review refinement

Revision2 carries SWE-6 through the original fixed composer error transport. The
first review established that supervisor-only error.evidenceFailures was discarded
by callers, and package outer-result persistence could erase uncertainty. A shared
private pure error transformation now retains both original and secondary failure;
its contract is executed directly, and the two fixed catch sites are source-bound
in tests. Complete original-native composer execution remains a separate gate.

## Restart observation and execution-mode admission refinement (2026-10-27)

### SRS: receiving requirement

SWE-8. A restarted consumer shall receive a settled original attempt through an
owner-supplied read-only operation, rather than hand-interpreting JSON or starting
the command again. `receiveSourceWorkerEvidence({directory, request})` requires
the original request's exact path, bytes and SHA256. It returns unknown,
settled-refused or settled-success; none confers semantic receiving, replay or
signal authority. Missing terminal remains unknown even after elapsed deadline.
Copied, truncated, changed or cross-attempt evidence refuses. Duplicate reads
are idempotent and do not allocate an attempt. This corrects the missing machine
reconciliation interface; it does not retroactively settle lost executions.

SWE-9. `runSourceWorkerProcess` supports only `custodyMode: 'live-parent'`, also
the legacy omitted default. Any other explicitly requested mode refuses before
evidence allocation or spawn with WORKER_CUSTODY_MODE_UNSUPPORTED. In particular,
a caller's restart-recoverable label cannot upgrade an ephemeral process owner.
This admission correction preserves every existing bounded parent-liveness path.

### SAS: responsibilities and alternatives

The npm evidence owner receives exact receipt chains. The existing npm process
owner alone launches, bounds and settles its live child group. A persistent
execution provider must own lifecycle beyond caller loss before a future durable
profile is admitted; a provider name, saved PID, worker-written exit file or
unchecked success flag cannot establish that guarantee. The previously rejected
bespoke surviving daemon remains rejected. Reusing an existing durable job owner
is a separate composition requiring its actual request and settlement contract,
not permission to implement another task-local supervisor.

The observed executor interruption loses more than a final callback: it can lose
timeout and output enforcement while a detached target continues. A new detached
custodian would address caller death only, not whole namespace/storage loss.
Read-only recovery is therefore deliberately separated from durable execution.

### HLD: transitions and migration

Existing v1 writer receipts remain unchanged. A receiver binds request identity,
optional start, terminal and original raw byte identities without following file
paths supplied by the JSON. No terminal yields unknown. A bound terminal with
quiescent=false yields unknown. Only an invoked, quiescent original observation
with matching capture can yield a settled state; original failure, evidence
failure, nonzero exit, signal, cancellation, timeout or truncation yields refusal.
Consumers may use settled-success to enter their existing semantic receiver,
never to infer package qualification or native Work completion. Existing unknown
attempts remain owned and unreplayed. No file is removed or rewritten.

Migration order: qualify the owner receiver and explicit mode guard; integrate
under normal review; bind fixed composers' subsequent semantic receiving to this
contract where that composition has complete custody; separately qualify a real
persistent execution provider for future attempts. The old frontier3 attempt is
not migrated by changing its evidence or inferring that its owner has vanished.

### LLD: exact checks and failure semantics

The receiver requires a real, private, current-user-owned directory. Request,
start and terminal JSON each have a 64KiB ceiling and stable file identity checks.
Only fixed local basenames are opened; persisted path fields are compared, never
used to choose input files. Raw streams retain the original combined maxBuffer
bound (at most 16MiB). All final receipt references are rechecked before settled
classification. Same-user exclusive custody remains the writer's trust model;
this is not a cryptographic attestation against a malicious filesystem owner.
I/O, parse, reference, identity or capture discrepancies throw refusal rather than
returning a trustworthy unknown or success. A valid absent terminal returns
unknown without reading /proc, launching, signalling or probing a provider.

Acceptance cases: original success and nonzero terminal; repeated read with
unchanged file set/bytes; live start without terminal; request alone; truncated
JSON; corrupted stream; stale original request; mismatched start/terminal;
cross-attempt copied terminal; invoked terminal with missing start; unreceived
quiescence; unsupported durable modes with zero child/evidence effects; explicit
live-parent success. Retain original evidence and process regression suites.
These are local original-owner cases, not installed provider or VM recovery.

### Existing provider follow-through, not a new daemon

The source comparison identifies node-job-service commit
`0180878b8c2b9bc05ffd92d26b12a4d57858e19a` as a genuine lifecycle owner:
`src/node-job.mjs` blob `faea317a432f248db398c73ab0a874f4aec06d03` starts an
original transient systemd unit whose deadlines/resources survive its initiating
Node process. Its `ExecStopPost` recorder (`4f5522bb4b349a2947faa671bf2e4035ac2730d7`)
retains manager result/exit and per-run receipt. The receipt implementation
(`07ad294a934a02398b5cb52b06957b789002f177`) supplies atomic publication, not
fsync-backed power-loss durability. Its installed runtime accepts logical
deployment/job identities, not arbitrary caller npm commands.

The next composition must therefore resolve an actual installed declaration,
authority, original request/run correlation, resource/deadline contract and
terminal-reading capability before using this provider for future npm work.
Absent those facts, npm refuses restart-recoverable mode; it does not install,
register or claim a provider through a data flag. Cross-host fencing and whole-VM
loss remain separate requirements. The current change does not claim this
provider is installed in the interrupted executor or can settle legacy attempts.

Two alternatives were examined and do not close that gap: CSE actor processing
at `ff8ac34c` retains once-only executing/results and avoids replay, but does not
settle orphan subprocesses; software-sandbox-execution-service at `b05a7a11`
dispatches correlated GitHub jobs but its original adapter keeps handles in a
WeakMap and correlation in the awaiting stack, without a durable recovery API.
Its source/patch workload and configured workflow authority are not a generic
npm command provider. Do not route the legacy unknown effect through either.


## Fixed build producer and public receiver composition

SWE-10. The source-build producer shall retain its own fixed typed input through
this evidence owner's existing exclusive fsync persistence before invoking the
same supervisor. A real private scratch/build-home owns fixed input.json and
worker-evidence names; existing paths are never adopted, overwritten or chmodded.
The input binds the source directory/manifest identity, registry, optional cache,
original Node and gate identity, timeout and output bound. No environment values,
credentials or arbitrary executable selector are accepted by the public receiver.

SWE-11. The package's public `source-build-worker-receiving` operation accepts a
versioned receiving request with scratch and exact original input/request refs.
It validates fixed input kind/profile, normalized paths, gate identity and exact
supervisor input/argv/cwd/limits binding before returning process settlement.
It delegates receipt-chain validation to the existing evidence owner. It never
launches, probes, signals, rewrites receipts, grants qualifiedProducts or receives
registry PUT. Missing terminal remains unknown. Changed operation/input/gate,
copied or malformed receipt refuses. Duplicate receiving is read-only/idempotent.

SWE-12. Original build return/report compatibility is retained with additive
input/request/worker receiving references. Nonzero report parsing and malformed
stdout must preserve original observation and evidence. GHS must preserve these
references, containing scratch lifetime and original uncertainty code; secondary
receiving failure cannot turn uncertainty into failure/success or cleanup.

Architecture: npm owns fixed producer and public typed process receiving; GHS
owns publication source/custody and retains its existing ledger hold. This is not
a new runner, controller or durable provider. Whole-parent loss before a publisher
allocation/report is correlated remains the original persistent-provider problem.
The generic private worker reader alone is insufficient: it does not establish
that a retained request was the fixed build operation. A private-path consumer
import and a second receipt parser are rejected.

Migration: publish and qualify the npm owner export/producer first; the existing
GHS supplier writer must generate its real lock selecting that artifact. Then the
reviewed caller may import the public port, allocate its own fresh private per-
package scratch and preserve uncertainty references. Do not race package/lock
writers, merge an unresolved static import or infer selection from an export's
presence in local source. Existing npm44/GHS160/161 recipe proposals remain intact.

Acceptance: fixed build operation success/refusal/unknown; wrong kind/profile,
input/request/cwd/argv/gate/limits; malformed stdout with original evidence; public
import through package exports; no signal/replay/product authority; original
worker suites; unchanged source-qualification consumer scenarios; GHS preserved
unknown/report lifetime and zero ledger release. Actual installed publisher and
persistent-provider receiving remain separately required.

Trust boundary: this port receives a caller-enrolled original input and fixed argv
profile under same-user owned source custody. Its recorded gate hash identifies
what that producer enrolled; the receiver does not authenticate a canonical owner
Git revision or attest that arbitrary caller-created same-name scripts are the
canonical gate. Independent source/artifact qualification must bind that identity.
The fixture-only same-name gate cases deliberately prove process/profile receiving,
not build semantics. No independently authenticated execution provenance is claimed.

Registry input hygiene is shared by producer and receiver: only HTTP(S) URLs without userinfo, query or fragment. Producer refusal precedes all scratch/input persistence and launch; diagnostics do not echo the supplied URL.
# Fixed credential-free build handoff: original-owner design

Baseline: npm 2ccef365ed30f0b49973afa67f60f56aef32c02b, source-build-qualification blob 0f2ac98aa4444b391513a42becbbe6d553f5d311 and source-worker-evidence blob 2aa5f1173236f218d71c2dc4866b9a5ba41bd6ee. Consumer: existing GHS landing publisher LP1–LP4, pending public receiving draft182, existing repository publication claim; provider: NodeJob5091ebcc native-manual-request/1. No installed declaration, institutional Work admission or host receiving is asserted.

## SRS
FBH1. A credential-free fixed build may outlive the initiating publisher caller only inside the original admitted NodeJob program. The program invokes the original npm qualifier and its existing live-parent child supervisor. It does not introduce a supervisor, daemon, scheduler, registry publisher or caller-selected argv.
FBH2. Before requesting that job, npm shall exclusively retain an immutable admission at its caller-configured private evidence root under a SHA256-derived logical request ID. Admission binds the original repository/commit, authenticated consumer-owned source reference, exact authored regular-file path/mode/size/hash set, source manifest, original gate, source directory, registry, finite limits and expected provider declaration identity. Logical request digest is derived from exact admission bytes. Public NodeJob request contains only ID/digest. Hashes are identities, not institutional authorization or Cells.
FBH3. Lookup shall derive fixed filenames from validated logical ID, compare the expected digest, require private owned unredirected storage and verify the admitted source/gate bytes before any build. No directory scan, latest pointer, caller-chosen executable, credential, arbitrary input path or replacement of existing admission is allowed. A duplicate lookup is read-only. Duplicate execution is governed by NodeJob's original request claim; npm must additionally refuse an existing original fixed execution intent rather than re-run from a missing result.
FBH4. The fixed program shall receive the original NodeJob request correlation and retain it before execution; unsupported/missing profile, ID/digest mismatch or missing expected declaration provenance refuses before execution. It calls the unchanged original qualifier. That original qualifier alone validates recipe, authored bytes, native report, required nonempty passing tests and owner-confined products.
FBH5. Before the fixed program returns, the original evidence owner shall exclusively persist a semantic result binding admission, provider request/attempt/invocation, original nested worker input/request/terminal/report, qualification and exact generated-product path/mode/size/hash set. A durable snapshot is mandatory: current products or a saved success report alone cannot reconstruct their original qualified identity. Refusal or lost persistence retains intent and does not authorize replay.
FBH6. A restarted consumer may read this original semantic result, independently receive the nested original worker settlement, re-read the exact authored source and rerun the original semantic validators WITHOUT executing any build. It must compare the resulting product set against the original durable snapshot before exposing a new process-local qualified-products capability. Missing/corrupt/mismatched/drifted evidence refuses; absence is not permission to execute. Repeated successful receiving is read-only and produces equivalent products.
FBH7. NodeJob manager settlement and npm semantic receiving remain distinct. The npm result does not authenticate an installed NodeJob declaration or independently acquire manager/cgroup authority. The original GHS consumer must separately receive the matching original NodeJob terminal before any next effect, retain its own repository claim, and resume only an explicitly recorded pre-registry build-wait stage. Unknown registry PUT or generic publication N cannot be released by this result.

## SAS and alternatives
Use source-worker-evidence's existing exclusive save/fsync, private path and stable-byte primitives. Use source-build-qualification's original validators and WeakMap capability. Extend these original owners; no parallel validator or task-local receipt store. A small fixed script is the provider's declared program, not a controller. Existing service declaration/Work authority remains an upstream required input; the supporting module does not manufacture it.

Rejected: arbitrary argv forwarding; scanning latest input; relabeling live-parent as restart-safe; treating manager exit0 as source/product acceptance; injecting old stdout into a qualifier and accepting newly modified products; replaying all publishCommit after a build completes; installing a second executor. Selected: original live-parent supervisor runs inside original long-lived provider program, followed by durable semantic snapshot and read-only requalification.

## HLD and migration
1. Admit immutable exact source/input at npm, with original consumer custody reference and expected provider selection; retain admission in GHS's existing claim before dispatch.
2. Original installed NodeJob declaration selects fixed npm program and fixed evidence root. No credential-bearing declaration or fleet bypass is added. Original start receives only logical ID/digest.
3. Fixed program receives correlation, exclusively writes intent, runs original qualifier, persists exact semantic result, then terminates. A crash before intent remains governed by NodeJob; after intent no new execution is admitted by this npm scope.
4. Original caller/restarted caller reads NodeJob by original request and npm by original admission/result, validates all cross-owner identities, requalifies products, and enters only the original pre-registry continuation. Publication uncertainty remains held.
5. Legacy direct live-parent API remains unchanged. Publish owner interfaces before consumer generated-lock migration. Installed declaration, provider storage/deadline/cgroup receiving and GHS stage-specific continuation must be qualified separately before claiming operational recovery.

## LLD boundaries and acceptance
Use fixed admission.json, execution.json and result.json names in a private request-derived directory. Existing exclusive pending/link/fsync behavior remains authoritative; no overwrite, unlink, age-based retry or lock-clearing API. Normalize IDs with the original NodeJob logical grammar; derive filenames by SHA256, never raw ID traversal. Bound admission/result bytes and original source entry totals explicitly; reject credentials in registry/provenance fields before persistence. Persist only public source references and opaque content identities, not environment values. Same-user exclusive source custody is an assumption, not adversarial attestation. The full normalized provider declaration digest must be an externally received original value; npm matching it does not authenticate deployment.

Acceptance: exact source admission and repeated lookup; conflicting ID/digest, changed gate/manifest/source, escaping paths, malformed limits, secrets in registry and missing correlation all zero-build; existing intent prevents replay; genuine original qualifier products survive caller restart and read-only receiving; generated-byte/mode/set drift, copied result, changed admission/terminal/report, malformed native report, missing snapshot and source mutation refuse; subsequent different request performs a useful original build without inference; original direct qualification cases remain unchanged. Native manager/installed provider and GHS registry-stage acceptance are explicitly additional, not represented by fixtures. No historical unknown requests are touched.

Open contract refinement before implementation: locate the exact existing NodeJob environment/receipt fields usable by the fixed program and the original GHS publication claim reference syntax. Never invent Work/Procedure/Endeavor references; unavailable institutional bindings prevent production admission, not owner component engineering.

### Implemented first handoff profile and validation boundaries

The first retained handoff admits the original direct TypeScript/npm and explicit
development-root-self recipes. It refuses browser-asset handoff before admission
because the existing browser input receiver requires an absent output tree; its
retained-output input contract has not been qualified. The unchanged legacy
browser producer remains supported. No browser guard is weakened to widen this
slice.

Fixed owner files are computed from this running owner, never caller-selected
gate paths. The admission retains the independently received owner source/closure
witness, complete selected fixed-owner file identities and Node path/version.
Matching these is source-custody consistency, not self-authentication of that
witness or full supplier closure attestation. The caller must have qualified that
source/installed composition independently. Consumer source references are
provenance only, not native Task/Work/Office admission. The expected provider
declaration digest is bound throughout, but the child environment cannot prove
that declaration was installed: the original caller must match it against the
original NodeJob request receipt and terminal before continuing.

Execution repeats the authored-only source-tree admission immediately before its
exclusive intent, including refusal of newly queued products. Retained receiving
binds the nested worker's exact source directory, registry, timeout, original gate,
Node path, manifest and supervisor source identities to the admission, rather than
accepting any independently valid process receipt. After semantic product and
receipt-chain comparison it rechecks authored inputs before capability minting.
These before/after checks retain the original exclusive same-user source-writer
assumption; they do not claim a global filesystem snapshot or hostile-writer lock.

The contemporaneous immutable product inventory is required even if the manager
reports success. Missing result or original intent without result remains
unreceived with no re-execution. Future different occurrences use a separately
admitted clean source tree; identical content alone never collapses two requests.
