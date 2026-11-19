# PNPM workspace fabrication: source-to-receiving qualification (2026-10-27)

Original source: red-cup-engineering/pnpm-workspace-fabrication-service.
Customer dependency context: 561-group/561-group-bare-cedar-fog-services-section#595
has independently observed PNPM 12.9.1 ERR_PNPM_IGNORED_BUILDS for eight
packages; this qualification does not close that customer's release work.

External specification: pnpm build-policy documentation at
https://pnpm.io/settings#allowbuilds and https://pnpm.io/cli/approve-builds.
allowBuilds was introduced in pnpm 10.26.0. The historical factory test supplied
pnpm 10.15.0 with allowBuilds false, making its policy appearance misleading.

| ID | Requirement | Executable acceptance |
| --- | --- | --- |
| CF-PNPM-001 | Never emit enforceability claims for pnpm releases without allowBuilds | Reject policy-bearing 9.x, 10.15 and 10.25; accept 10.26, 11 and 12; emit strictDepBuilds true |
| CF-PNPM-002 | Preserve explicit true/false decisions, never coerce malformed values | Reject null, numeric, string, array, object, missing/whitespace matchers |
| CF-PNPM-003 | Paths stay canonical and cannot collide with generated workspace manifests | Reject blank, dot, parent, double separator, absolute drive and reserved manifest paths |
| CF-PNPM-004 | Pure admission precedes filesystem effects | Invalid policy must not create the named output directory |
| CF-PNPM-005 | Output territory must not be a symlink alias | Reject a symlink-to-empty-directory without creating files in its target |
| CF-PNPM-006 | Qualify the distributable CLI, not just an in-process projector | npm-pack artifact executes from extracted package, materializes consumer/provider manifests with pinned PNPM 12 and exact denies, rejects 10.15 before writing |

2026-10-27 source witness: GitHub baseline blobs
64935ca283e604b6be8085035b9821ada5e40f3a (generator),
077451f7da3299d7166caf450673f9ba09cb29fb (original tests),
and 7315978285f7998928b32b44fcb7d1203addfa22 (manifest)
were reconstructed byte-for-byte locally before the changes.
Baseline 3/3 passed. Added acceptance tests first: 3 passed and 5 failed
before code repair. After code repair: native Node 22.16.0 tests 8/8 passed;
with the packed CLI receiver 9/9 passed (no network install).

Limits: no actual pinned PNPM 10.26/12 dependency install or original Bare
Cedar Fog customer build was run here; no private release runner, deployment,
SLSA attestation, signed artifact, or independent revenue/customer acceptance
was observed. The CLI consumer's test source is distinct from the projection
logic, but it is not a separate organization or production receiving office.
Do not merge as a production-release qualification without original owning
runner and consumer validation.

## Second PACE-S/MAPE-K bounded correction (2026-10-27)

Followed the exact open draft source and its original BCF customer hold.
Original source reading: PR #1, main and repair branches, current issue/PR list,
GitHub Actions run inventory (no runs), PR review threads (none), and BCF PR #595.
Original RN verification recovered the packed CLI, which the earlier ZIP evidence
bundle omitted. Restored original blob b5f1825c8e5dc37dc1ca0e857c603806b3578dca,
then independently re-ran `npm run verify` on Node 22.16.0: **9/9 pass**.

New independently authored negative tests were executed **before changing the
factory**: **0/5 pass, five observed failures**. None of these new tests simply
asserts the generator's existing behavior.

| Requirement | Independent falsifier and corrected boundary |
| --- | --- |
| CF-PNPM-007 | A literal workspace path such as `packages/*` changes PNPM membership; refuse selectors, shell-like negation and glob metacharacters rather than writing a misleading explicit package list |
| CF-PNPM-008 | An output under an existing parent symlink wrote into an unrelated empty directory; inspect every existing ancestor before and after creating the output path |
| CF-PNPM-009 | Equivalent requirement JSON with reversed key orders produced different artifact bytes and digests; stable sorted key/codomain admission rejects non-finite, accessor-backed and non-JSON values, and explicit empty `packages: []` |
| CF-PNPM-010 | The projected `Map` could be mutated after the digest was issued despite `Object.freeze` on the projection; replace it with a read-only Map-style view, deeply freeze package identities and receipt file names |
| CF-PNPM-011 | Independent digest recomputation on actual output files disagreed with the receipt because locale-aware sorting differs from byte-stable path ordering; use one deterministic code-unit order |
| CF-PNPM-012 | A native Node suite cannot establish PNPM 12 policy enforcement or script denial; add a separate real PNPM 12.9.1 consumer using the npm-packed CLI, offline local fixture tarball, exact eight-name BCF denial map, internal workspace linking, frozen replay and a deliberately unreviewed postinstall script refusal |

**Observed local evidence:** on Node 22.16.0, `npm run verify` now returns **16/16
passed**, no failed assertions. Syntax checks, npm package archive inspection,
real packed-CLI consumer and independent disk receipt recomputation pass.
`node --check` accepts the PNPM-specific external receiving script, and the
GitHub Actions YAML parses; neither executes the real PNPM gate on this offline
host. `pnpm` is absent and network installation is unavailable locally.

**Remaining hold:** GitHub-hosted workflow admission and the real PNPM
12.9.1 install/denial test are unobserved until the original runner receives
and executes this branch. This PR does **not** close BCF PR #595 or its source
release, its physical WSL storage shortfall, the unresolved Go/No-Go for eight
native packages, or production application boot. A failed independent assay
must remain a release hold, never be papered over with `--ignore-scripts` or
an implicit `allowBuilds: true`.

**Risk scope:** symlink tests close static redirection, not a malicious
concurrent rename race. Genuine untrusted caller filesystem confinement is an
OS-host duty. No existing PNPM dependency graph or original lockfile was changed.

## Original hosted runner receiving and artifact qualification (2026-10-27)

The original source CI runner did execute after the preceding local-only
qualification; the historical pre-run hold above is retained to show the
progression rather than retrospectively altering earlier observations.

- Corepack as bundled with Node 22.16.0 failed to invoke native PNPM 12:
  [run 40548695824](https://github.com/red-cup-engineering/pnpm-workspace-fabrication-service/actions/runs/40548695824)
  attempted a removed `bin/pnpm.cjs`. Pinned `npm install -g pnpm@12.9.1`
  repaired the original bootstrap without permitting third-party builds.
- PNPM 12's first invocation requires package-manager metadata from the
  trusted npm registry despite an exact installed binary: offline bootstrap
  was independently refused. Only first-time manager metadata may resolve
  online; local fixture tarball/workspace dependencies and frozen replay
  remain source-bound.
- Registry-version-only `@fixture/denied-install@1.0.0: false` is not a
  source-wide tarball denial, as the real PNPM runner proved. A bare
  `@fixture/denied-install: false` explicitly denies the fixture tarball;
  missing or registry-version-only rules both remain unreviewed and fail
  `ERR_PNPM_IGNORED_BUILDS`, without producing the sentinel side effect.
  Eight original BCF *registry*-version denials remain unchanged.
- [Hosted run 40550193310](https://github.com/red-cup-engineering/pnpm-workspace-fabrication-service/actions/runs/40550193310)
  accepted both genuine qualification jobs at source
  `18961bc4fb68c0a23fb9d31b2957b04ab010f493`: 16/16 native tests
  and real PNPM 12.9.1 install/link/frozen offline replay, including both
  positive and negative lifecycle-script receiving.
- **CF-PNPM-013: independently reproducible distributable qualification.**
  From source `4a25049f3dcda8bd081fe960253c04c706f58c47`,
  [run 40551150634](https://github.com/red-cup-engineering/pnpm-workspace-fabrication-service/actions/runs/40551150634)
  completed **three jobs successfully**, including two byte-identical npm
  packs, SHA-256 verification, and a fresh offline npm install with an actual
  external import of the library. The retained [artifact
  #12754713565](https://github.com/red-cup-engineering/pnpm-workspace-fabrication-service/actions/runs/40551150634/artifacts/12754713565)
  contains the unpromoted `0.0.0.tgz` candidate and `SHA256SUMS`. Its
  tarball digest is `003bd1a244ce1360850dc246f8b213b74a93d54766129f848191455aaaa987c1`.
  The ZIP was downloaded outside Actions, its checksum verified, and the
  archive installed offline into an independent npm consumer whose import
  and one verified workspace projection succeeded.

**Source revision discipline:** the recorded tarball checksum belongs ONLY to
the exact commit above. Any change to a packaged file such as README alters
the artifact identity and must receive a new run/checksum. Check the current
draft PR before treating this chronological record as its newest qualification.

**Unresolved release contracts:** the factory is not merged or published,
and original BCF PR #595 has not successfully executed a complete pinned
installation of its eight affected native dependencies, exercised the
FeltOS/MetroPlat/Web/Search Console deployment graph or received physical
WSL capacity and an actual release/customer acceptance. No signed attestation,
independent production benefit, or revenue is asserted.

## Third bounded correction: do not rewrite customer dependency contracts (2026-10-27)

**Original factory and receiving:** This remains the existing
`pnpm-workspace-fabrication-service` producer, stacked on its independently
qualified build-policy PR #1. It is **not** a replacement dependency resolver.
The original Bare Cedar Fog consumer #595, its eight source-specific policy
denials and its withheld full install/application boot remain unchanged.

**Observed flaw:** the original internal-package projector replaced every
declared consumer range with the found provider's current version. In
particular, `@customer/provider: ^3.0.0` against provider version `2.0.0`
was emitted as `workspace:2.0.0`. This changed the customer's admitted
requirement rather than permitting the real PNPM resolver to reject an
incompatible source. `workspace:^2.0.0` was double-prefixed; non-string
specifiers and null tables were silently allowed; a customer-selected
`npm:`/`file:`/`git+` source was replaced with an unrelated local provider.
These are contract/data-integrity failures, not an observed malicious exploit.

| Requirement | Original acceptance condition | Independent receiving |
| --- | --- | --- |
| CF-PNPM-014 | For internal dependencies, retain the customer's exact range (including existing `workspace:`), and never install incompatible local provider versions by substitution | `test/dependency-contract.test.mjs` original-range assertions; packed CLI against genuine PNPM 12.9.1 accepts `^1.2.0` for local 1.2.3 and rejects `^2.0.0` |
| CF-PNPM-015 | Every explicitly declared dependency table is an object, and each specifier is nonempty string data; reject rather than coerce, including in pure projection | Negative tests for null, array, text, number, boolean and blank specifiers |
| CF-PNPM-016 | An explicit foreign source protocol for an internal package may not be silently rewritten to a local workspace dependency | Negative tests for `npm:`, `file:`, and `git+https:`; external package specifiers remain unchanged |

**RED-before-repair witness:** commit
[d35afe0](https://github.com/red-cup-engineering/pnpm-workspace-fabrication-service/commit/d35afe06dade922a1814bf9f10c5a950acf7e738)
added the three requirement-derived tests first. Actual
[GitHub run 40560322880](https://github.com/red-cup-engineering/pnpm-workspace-fabrication-service/actions/runs/40560322880)
ran Node 22.16.0: **16 original tests passed, all three new tests failed**.
This is demonstrated on original source, not a hypothetical defect.

**Source corrective patch:**
[163d67f](https://github.com/red-cup-engineering/pnpm-workspace-fabrication-service/commit/163d67f1df84f01de6fd683fe20b7389da8065ce)
updates only the incumbent projector, retaining original dependency
constraints and permitting PNPM's actual version resolver to decide
compatibility. The distinct original
[342e5df](https://github.com/red-cup-engineering/pnpm-workspace-fabrication-service/commit/342e5dfa8aad73636b04533cd2590ff358391bd1)
adds packed-CLI real-PNPM compatible and incompatible range receiving.

**Qualification status:** new source-native and PNPM 12 release checks must be
read from the exact current branch head before this scope is marked accepted.
The prior PR #1 archive/sha does not attest this changed source. Release still
requires original owner's independent review, promotion of parent PR #1, and
the real Bare Cedar Fog dependency closure and application receiving. No
deployment, actual customer release, published npm package, model purchase,
signed build provenance, revenue or beneficiary acceptance is claimed.
