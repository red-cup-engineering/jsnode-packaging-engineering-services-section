# Native JavaScript source qualification

Status: engineering design for implementation and independent review. No source
QA execution, registry issuance, installed runtime or CI acceptance is asserted.

Original customer Work: `ni:///sha-256;ylvMNgq1vmF8vC0VCLir3C4XOKesE_9ztrVbXC5ggWQ`.
Task: `task:receive-scoped-estate-operation`.
Work item: `work-item:receive-scoped-estate-operation-receiving`.
Source baseline: npm-workspace-publication-service
`f36aac6d06d11838862439452076053c3896633b`.

## Scientific and customer premises

The actual triggering FeltOS source is
`d0181a8077eb109ec6b144b633262cb3eb3dcb3f`. Its package manifest declares no
`build` script and no `registryConsumption.sourceQualification` metadata. Its
required native `test` script is:

```text
node --test test/*.test.mjs examples/head-to-head/test/*.test.mjs
```

Its authored `prepack` is:

```text
npm run assess:carrier-bindings && node --test test/development-office-contract.test.mjs && npm run test:service-telemetry && npm run test:token-usage-identity
```

These are original source facts, not hypothetical metadata. The assessor and
both test aliases are declared in the actual manifest. The original manifest
blob is `e8febfc127e017c52668fdb8590750bc0b2058a4`, SHA256
`b064a686846b349568f5fce9b8d218b268384482df8cbe7e6009838c3169a00a`.

The existing Code owner recognizes TypeScript/npm, browser asset-tree and
explicit development-root-self recipes. A manifest without build or explicit
root-self metadata currently returns no build recipe. The existing root-self
class requires an authored exact development-only test library, selector and
peer frontier. It cannot apply automatically to this consumer. Adding its
metadata, inventing a test-library peer, or permitting only `npm run build`
would preserve the wrong contract.

The reusable missing capability is ordinary native JavaScript source QA without
compilation. This is a new case in the existing publication owner, rather than
a new lifecycle framework, executor, service, repository queue or deployment
system. Exact-source maintenance is the construction class; it does not claim
independent source-free derivation.

The customer additionally requires agents to receive rich context packets and
the relevant tools without arbitrary time, token, request-count or tool-call
ceilings. Actual source authority, zero-additional-cash admission, endpoint
capabilities, cancellation, and the original machine/worker resource contracts
remain explicit. Poor provider output must inform context/tool engineering and
native procurement history rather than trigger clock-based retries or hidden
premium implementation.

## Requirements and invariants

- **R1 — applicable generic case.** An unchanged JavaScript owner with no build
  and a valid declared native Node test script can obtain source QA through the
  existing recipe classifier. Neither a package name/version exception nor
  root-self metadata may select this new case. Existing recipe classes retain
  their own applicability and behavior.
- **R2 — actual authored QA.** Run the original required `test` script and, when
  present, the original `prepack` script, including its referenced assessor and
  aliases. Use the existing isolated gate and native command executor. Never
  split or reinterpret arbitrary shell into a new command language, fabricate a
  build, remove a script, replace subject QA with Code tests, or infer execution
  from a saved flag. An actual failed required command refuses qualification.
- **R3 — frozen suppliers.** Reuse `receiveSourceRegistryConsumers` for the
  owner's native frozen installation and canonical registry-body receiving.
  Preserve exact authored dependency specifications, locks and policy, supplier
  integrity and original peer admission. The root-self missing-peer frontier
  stays exclusive to its explicitly authored class. Real supplier or peer gaps
  remain dependencies/refusals; they are never silently waived.
- **R4 — source-only result.** Bind the exact committed source entries, modes,
  manifest bytes and actual native installation to the worker invocation. After
  all required QA, independently receive every authored entry again and refuse
  changed bytes/modes, undeclared products or redirected paths. Source QA does
  not create a fabricated dist directory or replace source files with copies.
- **R5 — original worker proof.** Retain the original immutable admission,
  invocation, raw report, process/terminal and semantic-result chain. A worker
  execution or report reference must remain bound to its exact original owner
  files, source identity, manifest, native graph, commands and occurrence. Do not
  admit an injected successful result or caller-provided qualification digest.
- **R6 — capability-bearing receiving.** Both immediate qualification and the
  fixed admission/execution/receiving path must mint through the existing
  qualified-products mechanism. A JSON projection, test declaration or replayed
  status is not that capability. Original occurrence correlation and uncertain
  effect protections remain intact.
- **R7 — distinct evidence scopes.** Code regression, actual subject source QA,
  packed artifact receiving, registry readback, installed consumer receiving and
  operating CI/Work acceptance are separate obligations. A successful source QA
  receipt cannot assert satisfaction of an unmet registry/peer contract or
  completion of the engineering-delivery endeavor.
- **R8 — engineering continuity.** Preserve original Work/task/product identity,
  predecessor dependencies, failed hypotheses and independently received
  counterexamples. Required input is materialized before inference. Agents can
  inspect the exact source and perform the authorized construction/verification
  work with the native tools appropriate to that phase. Premium inference owns
  requirements, architecture, alignment and independent acceptance; non-Claude,
  non-Codex inference performs implementation, fixtures and repair work.

## Architecture and supplier/consumer contracts

The existing publication owner owns recipe admission and QA semantics. The
existing frozen registry receiver owns supplier bodies and installation
receipts. The existing source worker owns credential-free execution and raw
process evidence. The existing semantic receiver owns qualification and its
non-forgeable product binding. The existing Git/source publisher consumes that
qualified source through its normal path; no application-specific publisher
branch is introduced.

The consumer supplies its original manifest, complete committed entries and
native lock/policy. Preconditions are exact authorized source, a supported
native-JavaScript QA recipe, actual frozen supplier admission and the original
worker resource admission. The successful postcondition is independently
received source QA for that source and that graph, with unchanged authored
inputs, all required commands actually successful, and no undeclared products.
Failure or uncertainty preserves the original evidence and does not mint a
successful capability.

The new recipe must remain distinguishable from explicit development-root-self
QA. Ordinary canonical supplier receiving does not manufacture a development
peer exception. Conversely a root-self SOURCE QA receipt still cannot become
canonical registry closure or runtime compatibility.

## High-level design

1. Extend the original recipe classifier with an ordinary native-JavaScript
   source-QA case. Validate the existing literal native test contract and exact
   supplier policy. Recognize no-build as a valid source-QA case rather than a
   compilation requirement. Keep unsupported recipes on their original refusal
   or non-build path.
2. Prepare this case through the original frozen registry-consumer receiver,
   after original source/manifest custody. Do not add a PNPM launcher or run
   dependency lifecycle scripts during installation.
3. In the existing gate execute the actual owner test script and authored
   prepack in the existing isolated environment. Preserve the native test
   summary/exit evidence and the actual prepack invocation result. Prepack may
   execute ordinary owner-authored source code; this design introduces no
   general shell parser or additional host/credential authority.
4. In semantic receiving, require the original graph, manifest and actual QA
   evidence, then re-receive unchanged source and the permitted product set. A
   source-only recipe has no compiled output directory to attest.
5. Carry the same semantics through fixed-worker admission, execution and
   retained-result receiving. Keep all immutable correlation and owner-file
   bindings. Preserve separate registry and production gates.

## Low-level design

Use the existing functions and ownership boundaries; select an internal recipe
representation that cannot be confused with `developmentRootSelf` or
`browserAssetTree`.

- In `src/source-build-qualification.mjs`, extend
  `sourcePublicationBuildRecipe` for the new ordinary no-build case. Reuse native
  test-target validation and canonical dependency checks. Preserve early
  explicit root-self validation and the existing TypeScript/browser cases.
- Extend `sourceBuildContext` to receive this case's complete original entries,
  exact manifest and native frozen graph through the original receiver. Keep
  unsupported locks/configuration and peer failures explicit.
- In `scripts/publish-package.mjs`, extend `qualifyPackageSourceBuild`'s
  existing source-QA flow. Share the original native installation mechanism,
  required test execution and authored prepack execution where appropriate;
  keep root-self peer diagnostics/context exclusive to that branch. Do not
  report a build command for an owner that declares none.
- Retain source identity, manifest digest, the actual native installation
  reference, original command/report references and actual successful test and
  prepack evidence in the new source-QA result. A prepack declaration without a
  successful original execution is insufficient.
- Extend `receiveSourceBuildSemantics` to verify this ordinary source-only case
  against the actual manifest/graph/report and complete post-QA inventory.
  Preserve byte, mode, path and undeclared-output refusal. Mint qualified
  products through the existing owner mechanism, never from a caller's flag.
- Reuse `admitSourcePublicationBuild`, `executeAdmittedSourcePublicationBuild`
  and `receiveAdmittedSourcePublicationBuild` unchanged where their generic
  contracts suffice. Any changed owner source needed by the fixed occurrence
  must remain in its original immutable owner-file closure and proof binding.
  No new program/argv override or trusted-report shortcut is admitted.
- Preserve public entry points. New modules, if truly needed, must be part of
  the declared packed source and original worker owner closure; a second
  implementation or lifecycle framework is not justified.

## Predesigned verification and validation

| Requirement | Required evidence |
| --- | --- |
| R1 | Different ordinary fixture package names with no build qualify through the same case; the exact unchanged FeltOS manifest selects it; root-self declaration remains absent. Existing TypeScript/browser/root-self controls remain valid. |
| R2 | An actual native fixture assessor and referenced prepack tests run through the original worker, plus the original required test script. A failed assessor, failed required test, missing alias or failed prepack refuses. Declared/saved successful flags without execution refuse. |
| R3 | Original frozen installation, registry-body integrity and authored policy are received. Changed lock/manifest/supplier and an unrelated missing/bad peer refuse; no implicit root-self frontier appears. |
| R4 | Actual QA leaves authored source bytes and modes unchanged. Mutation, mode change, escaping/redirected path and undeclared output cases refuse. No fabricated dist/build artifact is accepted. |
| R5–R6 | Actual original fixed occurrence admits, executes and independently receives the fixture. Wrong manifest, source, owner-file digest, invocation, terminal, raw report or occurrence/correlation refuses. A retained projection alone cannot mint qualification. |
| R7 | Code native regression passes separately from an actual current FeltOS source/graph/prepack/test receiving. Registry, packed/installed consumer and live estate processing remain explicitly unproven until independently observed. |
| R8 | Original native Work/product history and exact provider/source identities are retained. Rich governing context is distinguished from refused hypotheses; actual source/tool use and construction/verification outcomes are received without caller-invented generation ceilings or premium implementation fallback. |

First run focused original owner controls for source build, worker receiving and
root-self compatibility, plus the new real-worker controls. Then receive the
actual subject through its unchanged authored QA and frozen graph. Broaden
verification when changed contracts or unresolved failures justify it. A mock
success response is not an execution/receiving integration control.

## Context and tool engineering

Use source-preserving addressed context, clear governing requirements, accepted
facts, original failures and source navigation. Refused candidate prose must
remain identifiable as a refused hypothesis; it must not become governing
architecture simply by recurring in a packet. Supply the actual current
consumer and its QA programs, not only the Code owner's source. Source
exploration, editing and actual verification tools should match the phase and
its authorization. No arbitrary time/token/tool-call/request ceiling is part of
this customer contract. Actual provider/resource admission and zero-additional-
cash policy remain independently enforced by their owners.

Relevant primary sources inform this method rather than prove this product:

- [Effective context engineering for AI agents](https://www.anthropic.com/research/effective-context-engineering-for-ai-agents) treats tools, retrieval, history and external material as evolving agent context.
- [Writing effective tools for agents](https://www.anthropic.com/research/writing-tools-for-agents) emphasizes clear tool boundaries, useful returned context and evaluation on real tasks.
- [Lost in the Middle](https://arxiv.org/abs/2307.03172) reports positional sensitivity in long-context retrieval. It motivates navigable, salient evidence; it does not establish a universal token cap for this work.

The transport-byte packet and inference work-lot/SEN packet identity boundaries
are distinct. The current shared dispatcher requires its own canonical packet,
exact objective equality and exactly one of raw context or contextPacket. Keep
this boundary explicit; do not invent another packet format or silently relabel
an existing address. Packet formation/admission and tool availability do not
prove a delivered engineering claim correct.
