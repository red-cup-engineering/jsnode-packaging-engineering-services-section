# Code-owned native PNPM policy context for Guix paired receiving

This separate existing-owner design answers Guix149's complete effective
dependency-age policy prerequisite. It does not amend the qualified PR24
full-v2 candidate, allocate a release, install a graph or authorize fabrication.
The original native supplier and consumer remain Code's
receiveSourceRegistryConsumers / produceRegistryRuntime and Guix's exact paired
receiver. No policy framework, alternate resolver or new receipt registry is added.

## Received facts and actual gap

The actual installed Code0.14.24 full receiveSourceRegistryConsumers implementation
was read, not inferred from a projection. It preflights the whole selected consumer
set, exact declarations and committed native locks, then uses fresh staging. It
copies the consumer manifest, lock, local pnpm-workspace.yaml when present, and
.npmrc. The actual child inherits process.env, adding CI and PNPM_MAX_WORKERS.
It does not replace HOME or CODEX_HOME. Therefore it is incorrect to claim that
it universally drops inherited global/environment configuration. No actual live
policy weakening or wrongly accepted installation was demonstrated by this intake.

It always supplies native minimumReleaseAgeStrict=true. Without a local workspace
policy it supplies exclusions only for the genuinely received releases. With one,
it preserves that policy's exception array rather than replacing it from the
current batch. A declared registryConsumption.minimumReleaseAge becomes an explicit
CLI setting; this is the source-owned higher-priority declaration, not intrinsically
an inheritance defect. No new global zero-age exception is proposed.

The received gap is narrower: its receipt binds only manifest/lock/local workspace
digests and a declared/default age label. It does not bind the actual effective
age tuple, .npmrc identity, inherited policy inputs, executable hooks/config
dependencies or a source-versus-staging context equivalence. Staging can also change
relative policy/hook paths. Guix149 explicitly requires those original operation
facts; supplied JSON and a matching node_modules tree cannot supply them.

Primary native PNPM11.28.5 source is retained by file hash and exact line ranges.
getConfig loads global YAML, native INI/auth sources, local settings, environment
and CLI settings using PNPM's own semantics. PNPM_CONFIG_* / pnpm_config_* matter;
ordinary npm_config_* is not a general PNPM11 policy channel (userconfig remains
an explicitly handled compatibility case). Source comments/docs from another
PNPM major are not an input contract for this provider.

Critically, readCommandConfig calls installConfigDepsAndLoadHooks even for config
get/list. That routine may install configDependencies, load configured/default or
global pnpmfiles and apply updateConfig hooks. A config-get child is not
automatically a read-only observation. No such child was launched during intake.

## Supported first native context

Support Linux, exact received PNPM11.28.5 distribution/entry and GNU Node24 with
the existing frozen consumer operation. Preserve its native installation and
receipt/normalization/bin boundaries. The consumer is its committed root package
and native lock, with optional local pnpm-workspace.yaml and .npmrc; an inventory
repository without that consumer needs none of those files. Do not make a
workspace or lock a universal repository requirement.

The initial qualified context is a source-owned standalone registry consumer:
its own workspace policy is used if present; otherwise the existing explicit
ignore-workspace behavior is bound on both source and staging observations.
An enclosing workspace cannot silently become a different source of authority.
If the requested consumer actually depends on an enclosing workspace, different
lock root, PNPM hooks/plugins or undeclared relative configuration inputs, return
an explicit unsupported-context refusal before installation. Do not flatten that
workspace, copy unrelated owners or erase its existing requirements.

Retain actual HOME and CODEX_HOME in the child. Take the caller's original
credential environment through the existing private native invocation; neither
copy account credentials into source nor print environment/auth configuration.
Choose cache/store/state/scratch and durable receipt resources from the actual
operational data owner, not an installed package. Directory overrides are explicit
native resource settings and are present identically in the source/staging
observations and actual install. No account configuration is edited.

## Preflight before any configuration command

All selected consumers and contexts must pass before the first child. Receive
literal paths, regular unredirected bounded files, content hashes and absence
facts for each selected local configuration, the native global YAML location and
applicable native auth-file identity privately. Native Linux global location is
an explicit supplied resource matched to PNPM11.28.5's XDG_CONFIG_HOME/HOME
locator contract; it is not discovered by running unsafe config code. Snapshot
the relevant nonsecret policy environment in memory, retain only finite public
policy values/presence and a private context identity, and preserve actual caller
credentials outside the receipt.

Before PNPM can load anything, reject unsupported executable configuration:
configDependencies, configured pnpmfile/globalPnpmfile, default .pnpmfile.cjs or
.pnpmfile.mjs, legacy default hook names accepted by the actual selected supplier,
and environment/CLI settings that introduce those features. A configured empty
or disabled hook form may conservatively remain unsupported in this first context;
do not claim hook execution was received. Reject package-manager/runtime download
selection; a literal manifest PNPM pin may match the exact selected native supplier.
Unsupported devEngines/runtime/configuration-relative inputs refuse explicitly.

Do not implement INI/YAML precedence or a PNPM configuration parser. Use one
maintained YAML syntax parser only for bounded structural admission of the
actual YAML files before they can activate config dependencies or hooks. Reject
custom tags, duplicate keys, unsafe expansion and unsupported executable settings,
including their appearance through package-specific config. This parser does not
compute effective settings. The present Code14.24 direct graph and the actual
JavascriptNode3.2 public exports contain no suitable YAML parser interface; do not
import PNPM's private bundle functions or an undeclared transitive parser. Before
implementation, source-qualify either an existing public primitive or a normal
declared maintained YAML dependency/API and submit its exact release-plan/closure
delta for independent admission. No supplier has been acquired or invented here.

INI auth/registry interpretation remains PNPM's. Bind file identity privately,
not secret values in public observations. A secret-bearing registry URL or any
value outside the finite nonsecret observation surface refuses public projection;
it must not be sanitized into an alleged equivalent registry. Unknown provenance,
redirected files or an unbounded/unsupported context refuses, not an empty policy.

## Proposed detailed owner interface

Amend the existing receiver with an optional nativePolicyContext selection;
legacy callers retain their existing result and do not acquire a false qualified
policy claim. The selection supplies only version1 supported-context identity,
explicit real owner resource directories, selected native provider and the
input-policy resource locators/bounds. It supplies no expected settings, hook
receipt, process-success assertion, executable, arbitrary command or credential
value. The receiver obtains observations in process from its actual fixed native
operation, before it can replace any previous installation.

For qualified receiving, the operation itself:

1. Receives all source/configuration/environment/provider identities and the
   non-executable-context preflight above. Bind the exact original source path,
   manifest, lock, local/global input presence and source role. Require bounded
   literal configuration paths and finite per-file/aggregate bytes.
2. Computes the original existing settings once: strictness, qualified release
   exclusions where applicable, and an authored minimum age when supplied. These
   exact settings and private caller environment govern both observations and
   the actual native frozen install. No exclusion merge codec is implemented.
3. Uses the selected PNPM public config-get command with JSON output for a fixed
   owner-defined allowlist, never arbitrary caller keys or config list. The exact
   native source proves project/global flag behavior; no guessed --location or
   --global substitution may omit project settings or trigger runtime downloads.
   Observe the original source and staged context with the same relevant flags.
   Each command has a finite timeout and output bound, exclusive retained native
   status/stream custody, and zero hooks/config dependencies by prior admission.
4. The first eligibility observation surface is PNPM's actual
   minimumReleaseAge, minimumReleaseAgeExclude,
   minimumReleaseAgeIgnoreMissingTime, minimumReleaseAgeStrict,
   trustPolicy, trustPolicyExclude, trustPolicyIgnoreAfter,
   blockExoticSubdeps and resolutionMode. Preserve native types/array order;
   do not reimplement their matching or eligibility algorithm. Retain any native
   absence/default distinctly. Workspace/lock/global-resource locations are
   separate source/stage role facts, not falsely equal physical paths.
5. Requires equal effective eligibility observations and corresponding immutable
   input/provider/context bindings before launching install. Config parsing,
   command error/signal/timeout/non-JSON/unknown type or changed input is unread,
   never a received policy. Keep exact source and stage identities separately.
6. Invokes the original frozen install, receives its actual result, then repeats
   source/stage/config/environment/provider integrity and the finite effective
   policy observations before promoting the disposable installation. A mismatch
   invalidates that installation's qualification and preserves prior custody.

Retain the private raw invocation/result material as existing native operation
evidence. Add a versioned nativePolicy observation and digest to the corresponding
existing frozenInstall row, binding original/staged policy identity, the fixed
native command results and actual install request. It is output of this invocation,
not a reusable caller-authored admission certificate. Bind .npmrc identity and
presence distinctly from workspacePolicyDigest. Authentication values are never
receipt fields, CLI arguments or public logs. Unsupported private output remains
private; public result reports only the typed refusal and safe cause coordinate.

produceRegistryRuntime retains that actual receiver result and checks its consumer
configuration identities alongside existing manifest/lock/workspace checks before
packing. It must not manufacture policy qualification from a supplied digest or
re-run an unrelated context. Guix receives the actual invoked operation, selected
source/supplier and logs, requiring matching qualified policy rows for both sides.
It adds no age overrides or policy exceptions of its own.

## Detailed V-model and admission obligations

Before construction, independently receive this supported context, parser/provider
API and complete fixed command signatures. Then exercise native controls at the
original owner, under a fresh unchanged resource admission rather than a new graph:

* Source global/local/environment/CLI precedence is measured by actual PNPM11.28.5,
  including camel/uppercase native environment forms and exact array replacement;
  the implementation compares native observations instead of reproducing precedence.
* Local workspace presence and absence work; the admitted standalone context cannot
  silently inherit an unrelated parent workspace or require one for every repo.
* Authenticated existing credentials remain usable with unchanged HOME/CODEX_HOME;
  canaries prove secrets do not enter result bodies, command arguments or logs.
* Local/global/default pnpmfiles and configDependencies/plugin cases refuse before
  any PNPM config child, file write, network acquisition or hook canary execution.
  Native config-get is tested as potentially effectful until that preflight holds.
* Exact original consumer age law genuinely refuses an ineligible dependency;
  later eligibility under unchanged policy receives. Source-owned exact received
  house exclusions are handled by the original native rule, preserving committed
  previous exceptions; no broad external-policy bypass is introduced.
* Provider/lock/manifest/.npmrc/YAML/environment change, late mutation, unsupported
  settings, symlink redirects, excess bounds, invalid native JSON/status/signal,
  fabricated receipt and cross-consumer/stage bindings refuse without replacing
  a prior installation. Existing artifact preflight, payload/bin normalization,
  source mutation and all original receiver callers retain their laws.
* A real selected current consumer receives through the original frozen operation
  and runtime producer. Its actual private operation and safe policy projection
  must be independently received before Guix uses the feature for both products.

The final Guix pair still needs its original engineering obligations, actual
registered products, qualified target reader and source participation. Policy
receiving alone does not enable no-regression or discharge CDE13. The fixed checker
role is judged by original product-or-qualified-tool participation law at the
existing owner, not referred to the user or converted into a new institutional hold.

This is a ready design proposal. No implementation, dependency addition, version
allocation, test, installation, publication or host effect was performed. PR24's
independently qualified full-v2 source is unchanged, and its breaking publication
continues to wait for the actual operating GHS guard.
