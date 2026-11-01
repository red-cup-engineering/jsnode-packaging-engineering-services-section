# Repository-aware source members: specification candidate v2

Status: proposed contract with a local source implementation candidate. Not yet adopted or released. Package version, caller permissions and release authorization are unchanged.

## Owner and three separate boundaries

Current owner: `red-cup-engineering/npm-workspace-publication-service`, at its existing source-member boundary. The Engineering repository/path cited below is historical source provenance, not the current package owner.

1. Caller permissions/resource boundaries remain external and current. The caller must already be allowed to read the explicit bounded local root and relevant descendants. This design creates no grant, office token, owner registry, or mandatory approval receipt
2. The resolver verifies mechanical provenance: tracked membership, immutable Git paths/pins, actual local child commits, regular manifest blobs, byte identity, and package uniqueness. A URL, `.gitmodules`, local remote setting, or synthetic fixture does not create permission or organizational authority
3. Proper-owner verification remains our source-contribution/review obligation. Normal integration and Operations release authorization are separate later actions

Native Versioning revision `sha256:daab0a2790ef76e40178d13a8e362f7fd6b88eefe10c867a0af2c7fd87ab9730` assigns scientific meaning to Science, enforcement to this publication service, and compatibility review/releases/receipts to Operations. It does not itself grant access or authorize publication.

## Existing mechanisms and actual caller

The actual caller is `scripts/assay-npm-package-publication.mjs`:

`withExactWorktree -> readExactManifest(primary) -> preparePublishedManifest -> readDependencyArtifacts -> installation/lifecycle/packing/registry -> plan`

The original native PNPM controls exposed a caller mismatch: the source migration
producer still passed a retired version resolver into the now-strict
`publicationManifest`. Keep that final gate strict. Only the explicit original
`preparePublishedManifest` producer transforms legacy `workspace:*` source edges,
using the actual unique pinned members already received by this procedure. It
rechecks the primary input against its exact source bytes, clones it, replaces
only those edges with received exact versions, and submits that canonical result
to the unchanged final gate. Every other dependency and class survives. Unknown
or ambiguous members, invalid versions and forged source values refuse; no
caller-supplied map, dependency erasure or canonical protocol exception is added.
The resulting source/member evidence and original/projected manifest digests
remain separate from publication authorization and registry receiving.

Repository-aware traversal concerns dependency members only. The CLI also propagates opt-in immutable Git controls through primary reading and managed checkout. Exact-source reads in both modes reject replacement-object and inherited repository-selector substitution; legitimate ordinary outputs are retained.

Reused original mechanisms, inspected at Engineering `d7672ef592b3dbe5cef791151e71d87d90c4fabe`:

- `readExactSourceFile`, `readExactManifest`, actual member enumeration and uniqueness: `workspace-publication.mjs` blob `a1f4d1543430ba9da59aa7860bc7502b3c64fbf9`
- Exact source/publication policy: `dependency-policy.mjs` blob `76c4315c730ab086aa63a3a24bcc8f4ad01c7b2e`
- Original/projected manifest identities and digest binding: `publication.mjs` blob `38392ad2026774723ca41aeb442e8fbee239603b`

Engineering PR47/main `5106c4bd2ce0c3f3bd18435641303a0428e43f03` only changes the Computer pointer; publisher bytes are unchanged. Recheck current proper-owner main before any eventual proposal.

The original scanner consumes an already formed pnpm workspace. One narrow native gitlink/manifest/workspace search returned no matching mechanism; this is a bounded negative, not global absence. The customer fabricator deliberately emits `workspace:<version>` customer manifests and does not establish provider membership. The recursive fabricator is an observation/equivalence conductor. Neither is repurposed here.

## Concrete optional interface

Proposed library signature:

`preparePublishedManifest({root, packageDirectory, sourceCommit, source, sourceMemberMode = "same-checkout"})`

- `same-checkout`: existing membership behavior, legitimate success records and plan bytes retained; exact-object/repository substitution defects are corrected
- `pinned-gitlinks`: path-directed construction below
- Unknown value: `source-member-mode-invalid`, before member reads

Proposed CLI option: `--source-member-mode same-checkout|pinned-gitlinks`, default `same-checkout`. It selects member resolution in `preparePublishedManifest` and propagates immutable Git controls to primary/workspace/final-manifest reading and managed-root operations.

No root list, version map, owner mapping, authority receipt, registry query, initialization or fetch is added. Omission never opts in. The existing regular tracked-blob, confinement and byte-equality checks are retained; their Git context controls are corrected as specified below.

## Domain and admissibility

Input is the existing exact publication context under existing caller permissions, with:

1. Caller-selected exact top-level root checkout and original primary-manifest reading; sanitized Git `--show-toplevel` must equal the canonical explicit root
2. Nearest `pnpm-workspace.yaml` a regular tracked file at that exact root commit, verified by the exact reader
3. Members from the existing actual pnpm enumeration. `.gitmodules` is repository ancestry, not package workspace membership
4. Canonical member/manifest paths confined inside the explicit root and declared workspace; normalized root-relative POSIX paths cannot escape
5. Cross-repository members reachable only through `160000` gitlinks along ancestors of those selected member paths, starting from the exact root tree
6. Every encountered child already initialized at its real local worktree root. It cannot be a symlink alias or a directory for which Git silently resolves an enclosing repository
7. Child `HEAD^{commit}` exactly equal to the parent gitlink commit, with needed objects locally available. No mutable branch selection, initialization, checkout, fetch or pin repair
8. Final manifest a regular blob at the final child commit, read under that actual child root by `readExactManifest`; actual bytes must match
9. Exactly one member for each required dependency name across the complete selected member set, including root and child members

A gitlink supplies the immutable content ancestry edge. This minimal reader does not consult remote URLs or `.gitmodules` URLs to choose a child: it follows only an exact committed path to an already-present bounded local root. Those declarations may inform ordinary source review, but they are not a new runtime permission gate. Organizational ownership is not inferred from the reader's content proof.

Missing authored tracked workspace membership still yields `workspace-source-missing`, even when a correct child and `.gitmodules` already exist.

## Chosen construction

For each actual member, walk its root-relative path in the exact root Git tree:

- Ordinary tree: advance in the same repository context
- Regular final manifest: call `readExactManifest`
- Gitlink: verify exact local child root and `HEAD^{commit}` against the immutable parent entry, record that transition, then continue the remaining path in the child tree
- Missing/nonregular route, physical escape, unavailable object, uninitialized/wrong child root, or pin mismatch: refuse

Use local filesystem reads and read-only Git operations (`ls-tree`, `cat-file`, `rev-parse`). No `fetch`, `clone`, `submodule update`, `checkout`, `worktree add`, configuration write, credential lookup or network operation belongs to member resolution.

The walk consumes components of one finite selected path. It does not populate or crawl a source estate. Nested gitlinks repeat the same checks. Finally, apply the existing exactly-one-name rule and unchanged source-version projection. Newer versions or duplicate identical bytes do not win an ambiguous identity.

## Concrete codomain

Outer result remains `{manifest, bytes, sources}`. Source files stay unchanged, and required names retain current sorting.

Same-checkout members, including opt-in reads crossing no gitlink, return exactly the old record with no extra fields:

`{name, version, source: {commit, packagePath, manifestNi}}`

A child member adds this proposed evidence:

```json
{
  "name": "@example/provider",
  "version": "2.0.0",
  "source": {
    "commit": "<actual-final-child-commit>",
    "packagePath": "<package-directory-relative-to-final-child>",
    "manifestNi": "<verified-original-manifest-NI>",
    "binding": {
      "mode": "pinned-gitlinks",
      "rootCommit": "<publication-root-commit>",
      "workspaceFile": "<tracked-workspace-yaml-path-relative-to-root>",
      "workspaceFileNi": "<verified-workspace-yaml-NI>",
      "memberPath": "<package-directory-relative-to-root>",
      "gitlinks": [
        {
          "parentCommit": "<exact-parent-commit>",
          "path": "<gitlink-path-relative-to-this-parent>",
          "childCommit": "<gitlink-target-and-actual-child-HEAD>"
        }
      ]
    }
  }
}
```

Commit fields are full lowercase Git SHA-1s. Paths are normalized relative POSIX paths; `packagePath` is `.` when the package is the final repository root. No physical temporary path, mutable branch, asserted remote URL, office token or credential appears.

Required consistency:

- `rootCommit` equals the function's `sourceCommit`
- `workspaceFile` is the actual nearest tracked descriptor; its NI comes from its exact verified bytes
- `memberPath` is the actual selected root-relative package path
- `gitlinks` is nonempty and ordered root-to-leaf
- First `parentCommit` equals `rootCommit`; each next `parentCommit` equals the preceding `childCommit`
- Every hop is the exact `160000` entry at its parent commit/path and matches the initialized child's actual commit
- Concatenated hop paths plus final owner-relative package path identify the original member path
- Final `childCommit` equals `source.commit`; final `packagePath`/`manifestNi` identify its verified regular manifest

These are verified content/membership facts, not access grants or organizational admission.

Propose keeping `engineering.npm-publication-plan` version 1 with this additive per-member evidence: the current constructor already clones and digest-binds `workspaceDependencies`. Default plan bytes remain unchanged. This is a concrete compatibility proposal for normal review before adoption, not proof that arbitrary extra JSON is valid. The new source producer must enforce these consistency rules; the current plan constructor does not. Operations still authorizes the exact eventual plan digest.

## Deterministic refusals

Retain `NpmPublicationError` and existing meanings:

- `workspace-source-missing`: missing authored tracked workspace descriptor
- `workspace-source-ambiguous`: zero or multiple matches for a required name
- Existing `source-path-escape` / `workspace-source-escape`: confinement failures
- `source-not-regular-tracked-file`: invalid/nonregular route or manifest
- `source-content-drift`: bytes differ from the exact blob
- Existing invalid-version/publication-contract refusals

Add only for the new option:

- `source-member-mode-invalid`: unknown option value
- `source-gitlink-uninitialized`: no initialized local child worktree
- `source-root-mismatch`: explicit publication root is below or outside its actual Git worktree top level
- `source-gitlink-root-mismatch`: enclosing/different worktree or child-root alias/symlink
- `source-gitlink-commit-mismatch`: actual child commit differs from pin
- `source-gitlink-object-unavailable`: pinned child commit/tree cannot be read locally

Never recover by changing pins, fetching, selecting another root/version, or inventing a global map. Current resource/access denials remain denials; do not relabel them as initialization failure or retry elsewhere.

## Minimal positive/adversarial cases

Source-resolution fixtures only; no install, lifecycle, registry, artifact, publication or provider effect:

1. No tracked workspace membership refuses despite correct child plus `.gitmodules`
2. Default same-checkout output/plan bytes remain identical; default gitlink refusal remains
3. Opt-in without a gitlink returns the exact old source record
4. One exact initialized child returns the proposed evidence; no remote URL or approval-receipt field becomes a gate
5. Two-hop ancestry verifies both transitions and final owner-relative path
6. Missing child, enclosing-root fallback, wrong root, symlink alias, missing local object and wrong HEAD refuse without repair
7. Changed pin/child commit refuses even when name/version match a previously observed manifest
8. Duplicate names across roots/children refuse, including equal versions and identical bytes
9. Dirty manifest bytes, nonregular blobs and physical escapes preserve existing refusals
10. Equivalent immutable inputs at a different temporary location produce identical ordered evidence/publication identity

The earlier five-case assay established primitive reading/refusal only: ordinary own-commit success, parent-view gitlink refusal, child-own-commit success and owner/child byte-drift refusal. The additional candidate source-reader suite exercises the proposed resolver using isolated synthetic Git repositories and actual installed pnpm enumeration. Neither fixture establishes real caller permissions or a release workspace.

## Real A2A source-input acceptance

Primary path: `services/computer-networking-engineering-services-section/services/a2a-services-section` in the verified Computer owner. Original manifest blob: `2bad0a1cecb33cda967844958701a9c55ba91886`.

Computer currently lacks an authored tracked `pnpm-workspace.yaml`. Repository-aware reading alone cannot unblock it. The minimum later membership evidence is an actual source-owner-authored, reviewed, tracked descriptor at a pinned Computer commit, declaring A2A and the real source members for all six unchanged names:

- `@red-cup-engineering/cryptographic-data-service`
- `@red-cup-engineering/file-services`
- `@red-cup-engineering/http-services-section`
- `@red-cup-engineering/json-services-section`
- `@red-cup-engineering/uri-services-section`
- `@red-cup-engineering/signgraph`

Use verified current provider paths and immutable ancestry. Do not infer missing JSON or other custody from a historical import/test subset. Full proper-owned source remains a prerequisite; do not fabricate replacement packages. The descriptor declares paths, not new manifests or a version map. Real manifest bytes supply versions.

`.gitmodules` is not package membership; the customer fabricator is not provider workspace authority. Proper-owner source review remains normal integration work, not a new runtime office-token mechanism.

A later separately authorized source-input case must obtain exactly these six unique bindings, preserve original A2A bytes, and project only the publication copy. Missing descriptor/member/pin/initialization still refuses. No child fetch, install, lifecycle, tarball, release plan, registry request or publication belongs to that case.

## Top-only checkout and release separation

`withExactWorktree` currently creates only the top-level checkout. This proposal does not initialize children or alter that lifecycle. The CLI option therefore cannot make a child-dependent assay succeed by itself: the already-authorized existing caller/source-preparation workflow must provide exact initialized local children, or receive an explicit refusal. No unknown office, invented receipt or new institutional process is made a prerequisite.

Dependency-first measured direct artifacts remain supported after source binding. They do not establish source versions/membership and continue to enter the exact Operations-authorized plan. No full-package qualification, A2A/FeltOS release readiness, native receiving, publication or deployment is claimed.

## Bounded Git object-provenance refinement

The opt-in implementation must suppress lazy fetching, replacement-object interpretation and pathspec magic on every Git provenance query, including reused root/workspace/final-manifest reads and the managed exact-root worktree operations. Use per-call copied environment plus explicit supported Git switches; never mutate process-global environment or host configuration. Explicit switches make unsupported Git versions fail before object reading rather than silently ignore unknown environment variables.

The controls are `--no-lazy-fetch`, `--no-replace-objects`, and `--literal-pathspecs`, with their documented per-call environment equivalents. Remove conflicting pathspec environment settings only in the copied child-command environment. Propagate the same environment through opt-in pnpm enumeration for any child Git operation. See the [official Git options](https://git-scm.com/docs/git) and [partial-clone documentation](https://git-scm.com/docs/partial-clone).

This is a bounded refinement of exact-source/no-fetch behavior. Regular-blob, physical-confinement and byte-comparison logic remains intact. The original default replacement-ref behavior has a separately demonstrated exact-commit defect. This candidate corrects it using no-replacement controls on every provenance-dependent default resolution/read and managed checkout. Legitimate ordinary default outputs are compatibility controls; adversarial object substitution is intentionally refused. No-lazy-fetch and literal-pathspec guarantees remain opt-in; ordinary publication network behavior is not changed.

Offline controls must inspect actual Git invocation settings and exercise local replacement refs, literal pathspec names and missing local objects. Do not create a network trap or contact a promisor to test the refusal. Available in-package plan/authorization/witness shape compatibility is distinct from external Operations schema acceptance. The combined candidate also corrects received-plan content validation by recomputing the existing canonical unsigned-plan digest in admission, before comparing authorization fields. Unchanged JSON plans retain their digest and output; tampered received child bindings with stale digest labels refuse. This does not prove authentic authorization custody or broaden the received-plan domain beyond ordinary JSON data.

All provenance-dependent calls also remove inherited repository-local environment selectors from a per-command copy. Query installed Git using `rev-parse --local-env-vars` (names-only metadata, no object lookup), cache names only, remove those names, then reapply the required exact/immutable controls. Preserve unrelated environment variables and do not mutate shared process state or Git configuration. This prevents `GIT_DIR`, `GIT_WORK_TREE`, object-directory and related selectors from overriding the explicit local repository. See [Git's repository-local environment contract](https://git-scm.com/docs/git-rev-parse).

Offline regressions include inherited repository selection concealing a wrong child HEAD, below-top-level root input, a package suffix beneath a Gitlink, and an in-owner working symlink to the same regular tracked bytes. The last case is admitted because confinement and exact bytes hold; tracked symlink blobs, escapes and changed bytes still refuse. These tests do not initialize a real provider, contact a promisor, or infer organizational authority from synthetic package identities.

## Source construction and publisher identity are separate boundaries

Original Leader request: “Keep going. Use-and-improve our procedures to carry
these merged changes through publication, deployment, and actual useful
operation, then continue burning down Github debt. Use-and-improve any agentic
resources that help you do this work.” The originating GitHub consumer contract
is its `specifications/github-resource-reconciliation.md`, LP1–LP4. Exact JSON
Schema release source is `bb294bfd454cb07a57989fe5b906b42041c9add2` (PR3).

Witnessed incumbent: the landing publisher's tracked-file packing refuses the
uncommitted `dist` exports. Calling Code's ordinary gate in plan mode with a
credential-stripped builder separately refuses at Step0 `ENEEDAUTH`; no PUT
occurs. Sending the publisher secret into compilation/tests would cross the
wrong boundary. The original full gate's authenticated liveness requirement
MUST remain unchanged, including in its historical plan mode.

This maintenance refinement extracts the gate's existing Step1 native own-lock
installation and Step2 build/staleness/native tests into
`qualifyPackageSourceBuild`. The full gate calls that same function after its
original Step0. The existing CLI's mutually exclusive `--qualify-build` worker
returns `npm.source-build-qualification`, `source-build-qualified` or `refused`,
and steps1/2 only. It cannot combine with apply/bump/pin/repin, choose a release,
publish, write the applying EAVT receipt, or call whoami. This is construction
qualification, not publication permission or a replacement for PR15's native
fixed-artifact admission.

Code's public `./source-build-qualification` composes that worker. Its
`qualifySourcePublicationBuild({directory,manifest,entries,registry,scratch})`
consumes the actual caller's exact committed regular-file entries. GitHub keeps
authenticated acquisition and its named publication effect; Code owns the
portable source/build/lock/output contract. Supported migration inputs are a
direct `tsc -p tsconfig.json` or `tsconfig.build.json` recipe, confined native
Node test globs, exact registry dependencies, matching native npm lock identity
and exact TypeScript integrity, direct plain-JSON configuration and uncommitted
owner-confined output. Unsupported recipe forms remain uninterpreted on the
original pack-only path; missing carrier targets still refuse there. Source
config escape, foreign routing, manager hooks, local suppliers and committed
output twins refuse before execution.

The additional [browser asset recipe](browser-asset-source-build.md) admits the
existing literal asset-tree adapter at provider `0.4.2` and the owner's unchanged
PNPM lock. It reuses the same worker and generated-product custody, with explicit
web/extra-asset completeness receiving. Other Node build scripts remain outside
this recipe.

The Linux source worker receives a small explicit environment, isolated HOME,
empty user/global npm configuration and no publisher/GitHub/custody variables.
One launch-local snapshot preserves the execution provider's credential-free
HTTP proxy endpoints, bounded proxy exclusions and absolute CA paths. Values are
validated and forwarded unchanged; they are not source-controlled configuration
or persisted artifact identity. Credential-bearing endpoints refuse without
echoing their values. Npm settings, tokens and arbitrary Node options remain absent.
Installation and implicit pre/post hooks are disabled; only the reviewed direct
build and native test targets execute. Its own process group has a finite
1..300000ms deadline (default300000) and 16MiB captured-output bound. Descendants
must quiesce before staging retirement. Uncertain quiescence returns
`BUILD_WORKER_CUSTODY_UNCERTAIN`; the GitHub caller retains that exact source
custody and reports unread, without publication or automatic replay. These are
process/credential controls, not a claim of an OS network sandbox or physical
capacity reservation; host admission remains the original resource owner's job.

An explicitly selected `runSourceBuildWorker({cacheRoot})` MAY retain the same
native release cache across separately admitted attempts. The existing
`--qualify-build --qualification-cache-root <directory>` route carries it to
the original install command's cache root; its `npm` child directory retains
native integrity checks, `--prefer-online`, and diagnostic logs. The root MUST
already be an absolute, unredirected, private directory owned by the caller,
separate from the source tree. It MUST NOT be accepted as source provenance,
an installed graph, a completed lock, or permission to replay an operation.
The caller retains it after success, refusal or interruption and owns its
resource admission and disposition. Each attempt still uses a new exclusive
worker scratch, the original finite deadline and credential controls; no
automatic retry occurs. Without this option the original temporary cache and
cleanup behavior remain unchanged. Publication/apply/pin routes reject the
cache option rather than acquiring a new authority from it.

The native installation cache and receiving attempt scratch MUST remain
separate: a retained cache does not reuse receipt names. When cacheRoot is
selected, the result preserves the complete phase state and names its retained
`qualificationScratchRoot` under the new worker scratch. Native npm cache logs
remain under cacheRoot/npm. A development source-QA caller continues to use its
original frozen receiver and its own cache/store selection; this option does
not invent PNPM cache arguments or claim that the npm cache served that route.
Its native receiving logs remain under the fresh attempt scratch, rather than
being overwritten by the next caller of the same retained cache.

After successful native qualification, all authored bytes/modes must still match
the supplied Git entries. New regular files may occur only under the configured
output root. Output receiving refuses beyond64MiB/100000paths, redirection,
unexpected added source or any changed source/lock. Only the original caller
then rewrites release metadata, packs through Code's original carrier owner and
performs its independently authorized registry effect. Source selection,
construction, publication, installation and useful consumer receipt remain
distinct.

Predeclared verification: actual schema frozen npmci23canonical entries,
TypeScript build,231native tests and packed generated-export receiving;
different nonbuilding source unchanged; build/test and malformed/applying result
refusal; source/lock/config/output adverse cases; explicit no-credential success
versus unchanged full-gate identity refusal; bounded descendant-writer timeout;
and original full gate tests. Controlled publication capture is labelled and
does not establish live registry publication.


### Required native test entrances cannot qualify vacuously

When the original gate runs a required test command, its native summary MUST carry
at least one passing executed case; an empty suite or a suite consisting only of
skips/todos refuses at that existing step. Mixed suites with a real passing case
remain eligible under the existing failure policy. This does not introduce tests
or builds into the nonbuilding pack-only carrier path.

The bounded TypeScript/native adapter receives the full authored and generated
regular-file set after the original build. Every literal native test glob already
admitted by that adapter MUST match at least one of those received files, using
the runtime's native path.matchesGlob predicate. A missing native predicate
refuses this qualification path; it does not introduce a second glob language.
Tests produced inside the admitted compiler output remain valid targets. Neither
dependency files nor an unreceived source selection can satisfy a declared test
entrance. The actual Step2 report MUST also contain nonzero executed passing
counts. No arbitrary shell command is parsed and no publication authority changes.

Motivating observation: a caller accidentally removed test directories from its
source projection; native Node returned a zero-test summary and the previous
producer qualified it. That incomplete result remains unreceived. Native controls
cover the missing and skipped suites, a missing secondary pattern, generated-test
and mixed-skip positives, the nonbuilding alternate, and original identity refusal.


## Temporary source-binding custody and interrupted recovery

The existing public `./source-bindings` conductor owns temporary package alias
custody. `withSourceBindings(plan, run, options = undefined)` keeps its original
two-argument replacement/restoration contract and arity. Before any binding
write it MUST receive every selected consumer/provider root and every existing
alias ancestor as a canonical, unredirected absolute directory. It MUST NOT
accept a `.local` path component. Missing parents are created one component at
a time after admission. Cleanup MUST preserve a diverged alias, parent, or
original installation instead of recursively removing unknown contents.

A recurring consumer MAY opt into
`withSourceBindings(plan, run, {durability: {directory}})`. The explicit state
directory MUST already be canonical, private to the current UID, outside the
selected source roots, and on the alias filesystem. This mode fills only absent
aliases; it MUST NOT replace an existing installed or foreign provider. The
caller MUST hold one native exclusive lease across both recovery and the bound
operation. GHS supplies its existing native shared-file-description advisory
lock; this Code API creates no lock service or execution/integration authority.

Before publishing any active alias, the conductor stages each symlink, receives
its device/inode/UID/target and every parent identity, writes and fsyncs a complete
immutable intent, and publishes that intent without replacement. It then uses
native no-replace hard links to publish those exact staged symlink inodes. Thus
interruption cannot create an active alias whose inode was not already recorded.
Only the selected aliases and explicit state directory are writable. No package
installation, registry call, scope widening, or source operation replay occurs.

The same public module exports `recoverSourceBindings(plan, {directory})`.
Recovery MUST match the exact plan and ownership-bound intent, validate every
recorded ancestor/stage/alias before its first unlink, and remove only matching
owned symlinks. Foreign, redirected, malformed or diverged evidence MUST remain
intact with the intent and return a refusal. Successful recovery fsyncs alias
parents and removes/fsyncs the active intent before retiring inactive staging.
It returns `code.source-bindings.recovery.v1` with `NOT_RECORDED` or `RESTORED`
and the actual restored count. It never runs the interrupted callback.

A crash before intent publication may retain an uncommitted staging directory,
but no active alias. A crash after intent removal may retain only inactive
staging. Neither is evidence of an active binding; recovery does not scan or
invent ownership of those directories. Their ordinary owner-controlled
retention is separate. The fixed active filename is
`source-bindings.intent.json`; staged names occur only during a binding or
interruption and are removed on ordinary completion. In production, the caller
MUST file the entire explicit custody directory as tracked control state,
including retained interrupted staging; it MUST NOT ignore it as raw logs.
Only reproducible fixture custody and captures belong in typed test logs. Kernel process-lease release and post-scope quiescence
remain the original caller's responsibility, including after SIGKILL/reboot.
These checks cover stable observed filesystem identities under that exclusive
lease, not malicious concurrent replacement by another same-UID process.

The generic conductor loads no native executor at module import. Only actual
advanced development-root resolution dynamically imports its already-declared
executor; all four native ESM resolution sites await that result. Public root,
import-only and distinct import/require conditions, legacy fallback identity and
post-restoration native resolution retain their original controls. This removes
the consumer's need to bootstrap an unjournaled executor alias merely to import
the generic conductor. Source QA, installed graphs, publication and operating
service activation remain distinct receiving grades.
