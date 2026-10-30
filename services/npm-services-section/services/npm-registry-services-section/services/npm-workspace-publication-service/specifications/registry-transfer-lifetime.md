# Exact advertised registry transfer lifetime

## Requirement and existing alternatives

The original receiveRegistryTarball owner must receive a selected same-authority
HTTPS archive without replacing the host's configured global agent, credentials,
SRI admission, 64 MiB bound or exclusive destination write. CSE0.1.2 attempts at
21:59 and22:01 on2026-10-25 failed proxy CONNECT at5000ms; metadata succeeded.
The retained aff14fb49b4f3f56117dce532fd43cc44ad065a1 owner constructs HTTPS
requests without timeout options, then sets socket timeout too late for CONNECT.
Installed Node24.19 Agent.createSocket honors req.timeout before tunnel setup.

Configured npm pack is a supported different operation: exact identity lookup,
npm configuration/cache and its own command deadlines. It cannot replace this
advertised URL transfer. A new agent, downloader, credential path or global
timeout mutation is excluded. Extending only setTimeout or passing only an
AbortSignal fails respectively CONNECT configuration and signal-ignoring ports.

## Contract and refinement

receiveRegistryTarball additionally accepts timeoutMs and inactivityTimeoutMs,
each an integer1..120000, default5000, and optional native AbortSignal signal.
Validate before any transport effect. timeoutMs bounds the complete network
transfer (connection, headers, body); inactivityTimeoutMs bounds initial wait
and gaps between headers/nonempty body chunks. Empty chunks do not reset it.
HTTPS receives inactivityTimeoutMs in its initial request timeout option as well
as its socket timer; no agent is supplied/replaced. Both transports also have
owner timers and monotonic checks so active chunking cannot extend total time.
These are cooperative event-loop deadlines, not preemption of blocking JS.
Numeric defaults remain5000; the new absolute deadline deliberately refuses a
formerly potentially indefinite active HTTPS stream.

One terminal transition wins. Timeout/abort/failure clears owner timers and the
caller's abort listener, destroys the HTTPS request/response or aborts the fetch
signal and cancels its current reader. Cancellation promises are observed but
never awaited without a bound. A late fetch response after terminal failure is
canceled and cannot reach digest admission or destination creation. Stream locks
are released. A signal-ignoring port cannot hold the caller open or write late.
An arbitrary fetch port may continue internal work or ignore cancellation:
timeout/abort diagnostics report transportCleanup=requested-unconfirmed, not
quiescence. Caller must reconcile that port before retrying; this API never retries.
No source test or timer promises network quiescence of arbitrary supplied code.

Timeout rejects with ERR_REGISTRY_TRANSFER_TIMEOUT and phase total/inactivity.
Caller cancellation rejects with ABORT_ERR and original reason as cause.
Original native transport/HTTP/stream/SRI/filesystem failures remain failures.
Already-aborted input causes no request. HTTP failures terminate rather than
draining unbounded bodies. SRI and exclusive write occur only after complete
admitted transfer; filesystem operations are not covered by network deadlines.
No partial network archive is written; existing destinations are not replaced.

## Verification and receiving

Derive tests for delayed successful headers/chunks, inactivity/no response,
active trickle total expiry, ignored signal, never-settling read/cancel, late
response cancellation, pre/mid-transfer abort, malformed deadlines, native
request timeout projection, configured-agent failure, HTTP/stream truncation,
size/SRI failure and destination exclusivity. Preserve the existing registry
regressions. Then attempt the exact original CSE archive with explicit60s total
and30s inactivity through original HTTPS source, retaining both prior failures.
Qualification executed 36 new lifetime cases plus 33 existing registry-related
regressions, all passing with no skips. The selected CSE0.1.2, Harness103 and
AOE944 advertised archives were each subsequently received through original
HTTPS with the explicit bounds above and independently read-back SRI. These
are source-qualified archive acquisitions, not whole-package qualification,
source integration, publication, package installation or native Work. The CSE
transfer completed below five seconds; its success alone does not prove the
old deadline would have failed on that particular attempt.


## Local transport observation receiving (RTL-1 through RTL-7)

### SRS
RTL-1. Transfer failure and local resource closure are different observations.
The original transfer deadline and immediate error must remain unchanged;
request.destroy(), response.destroy() and cancellation requests are not closure
receipts. Remote completion and replay authority are outside this API.
RTL-2. An actual original failure occurrence may be read in its living process
through receiveRegistryTransferSettlement(error,{timeoutMs}), with integer
0..5000 milliseconds (default1000). Zero is observation without waiting. Invalid
options/accessors refuse before subscribing. Copied/serialized/forged errors,
primitive rejection values, and an error reused across occurrences cannot name
one original occurrence. Later SRI/destination errors are not transfer failures.
RTL-3. Observe the original request, every assigned socket and every response
separately, enrolling close listeners before the original cancellation path.
Late assignments remain counted; request/message closure never substitutes for
socket closure. A reading is an immutable snapshot, not a promise about hidden
or subsequently assigned resources. Original configured agent is unchanged.
RTL-4. Opaque fetch activity remains unknown. Missing native socket, constructor
failure or unobserved close remains unknown. Only original pre-aborted input
proves no invocation; no missing object is interpreted as that proof.
RTL-5. Waiting receivers issue no transport request, destroy, abort or cancel.
Concurrent/repeated readings are independent, bounded and remove their own wait
subscription/timer. Late response cannot reach a destination after transfer failure.
RTL-6. A receipt binds an original generated occurrence ID, exact safe registry,
URL and integrity, with resource kinds/indices/observed-close flags. It explicitly
states remoteSettlement:false and replayAuthority:false. No token, environment,
credential or opaque object is serialized. Actual error fields are not trusted.
RTL-7. This is future in-process observation, not durable caller-loss recovery.
It cannot settle the earlier dev227 GET, its requested-unconfirmed cleanup, any
other historical request, or a server mutation. A serialized observation is not
a capability to invoke or re-run a request.

### SAS and alternatives
The existing registry owner retains a private WeakMap from the actual error to
its original occurrence. The original transfer alone requests cancellation; the
new public function only receives existing lifecycle observations. The existing
registry export exposes this function without a new controller/downloader/store.
Reject delaying the original transfer failure for cleanup (changes its deadline),
replacing the global agent (changes authority), treating destroyed as closed, or
using request close as socket proof. The original caller can serialize this
bounded observation with its existing supervisor evidence. No independent durable
receipt store or process supervisor is introduced.

### HLD and LLD
Validate original transfer input, create an occurrence, enroll native resources,
then let the unchanged transfer state machine run. On its first failure bind only
that actual error to the occurrence before requesting original cleanup. Preserve
primitive thrown values unchanged. A later receiver validates one live occurrence,
reads already observed events, and optionally awaits changes for its own bounded
interval. All observed native resources plus at least one request and socket must
have emitted close for observed-local-resources-closed. That label still excludes
agent-hidden resources and remote work; it is not universal transport quiescence.
Reused errors are checked again when asynchronous receiving finishes. Immutable
snapshots do not change if a later agent resource is enrolled.

Node24 lifecycle source: https://nodejs.org/api/http.html#event-close_3 describes
IncomingMessage close as message completion, not underlying socket close;
https://nodejs.org/api/net.html#event-close_1 describes Socket close. These distinct
contracts are the reason for separate event witnesses, not a new network policy.

### Acceptance and migration
Run original lifetime/registry/configured/storage/publication-command cases plus
new late-close/never-close/no-socket/late-response/extra-socket/preabort/opaque-port,
forged-error/reused-error and independent-reader cases. An actual private raw
loopback socket case exercises local close through the existing test global-agent
port; it does not qualify TLS/proxy or production transport. No held request is
retried. Preserve all current SRI,64MiB,exclusive-write,timeout and original errors.
A consumer may explicitly receive the original live error before serializing its
failure. It must retain unknown and remote/effect uncertainty; no automatic retry
or legacy custody retirement follows. Installed consumer adoption and actual
provider network receiving remain separate gates.

Boundedness refinement: retain at most64 distinct local resource records per
occurrence. Overflow permanently marks that observation unknown; it must not
infer closure by dropping unobserved objects. Reusing an error stores only an
ambiguous sentinel, not an unbounded history; outstanding receivers reject that
ambiguity. The actual transfer continues its original cancellation/error policy.


## Original reviewed-selection consumer (RS1–RS5)

The existing `pinExactDependencies` apply path owns immutable artifact receiving before any consumer manifest/native-lock change. Its previous catch discarded the original error and removed failed staging, losing the only live observation and potentially deleting a path reachable by an unresolved custom receiver. This caller now receives the original registry observation before serializing refusal; it does not introduce another transfer or settlement authority.

RS1: On the first artifact failure, call the original live-error receiver once with a fixed 1000ms wait, retaining its local-only receipt. Unsupported, ambiguous, copied, primitive, post-transfer digest/file and custom-port errors produce an explicit receiving-unavailable record; never copy arbitrary error text or infer unknown transport from an unrelated validation failure. Secondary receiving failure cannot erase the original selection refusal.

RS2: Preserve all failed staging and its selected failed artifact identity as `retainedArtifactCustody` with state `retained-unqualified`. Clear the candidate `receivedArtifacts` list, including earlier successfully received members. A failed selection is never selected/applied, and consumer manifest/lock bytes remain untouched. Local observed close does not authorize cleanup, retry, remote settlement or selection acceptance; an opaque port may still write after rejecting.

RS3: Successful immutable-byte receiving remains unchanged. Plan/pre-artifact refusal returns no retained custody. Native lock regeneration remains with its original owner; no generated lock is fabricated by this change.

RS4: Verify original complete pinning and reviewed-selection suites plus actual caller cases for original native error observation, opaque late write, forged/primitive failure, earlier success followed by failure, unavailable digest observation, and unchanged manifest/lock. Distinguish configured event fixtures from actual installed registry receiving.

RS5: This is process-local observation before result serialization, not durable lost-caller recovery. Serialized observations are historical evidence, not reusable capabilities. A retained directory names unqualified state, not retry or deletion permission. No old interrupted request is settled retroactively.
