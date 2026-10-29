# Concrete native PNPM policy receiving: Data syntax owner and Code operation

This completes the prerequisite design intake for the separate Guix149 policy
requirement. It supersedes the preliminary design's unqualified parser allocation
and its claim that config-get directly exposes implicit defaults. It is a source
contract proposal for independent receiving, not construction admission. PR24's
qualified full-v2 candidate remains unchanged and held before breaking allocation
and publication until the actual GHS guard is operating.

## Source and architecture allocation

The actual installed Code0.14.24 source-registry receiver inherits process.env and
preserves HOME/CODEX_HOME. It copies selected manifest/lock/local policy/.npmrc into
fresh staging, supplies strict age admission, preserves an authored workspace
exclusion array, and uses exact received-release exclusions only without a local
workspace policy. No live policy-loss defect was demonstrated. The missing result
is authenticated effective-context preservation and actual native admission evidence.

Current accepted Code main is 29bd16f1394553afb075f6951d9779503e0432e7, not
the historical qualified PR24 base24bb6ced. PR28's five current paths are preserved:
README, pnpm-workspace.yaml, scripts/publish-package.mjs, and its two custody/native
assays. Its installationCustody checks manifest/policy presence and bytes after
every native outcome, additionally checks the selected lock in verify mode, and
prevents a custody failure being converted into successful offline fallback.
Its native no-workspace diagnostic used PNPM11.25.0; it is not evidence for the
11.28.5 context below. The current house-scope native age exclusions remain intact;
external minimum age1440 and strictness are not weakened. The receiver and runtime
producer functions relevant here are unchanged by PR28. Future source proposals
must reconcile onto current main and keep these checks, not overwrite them from
the historical PR24 candidate.

Data already owns the maintained YAML parser. yaml-file-codec-service0.1.1 is a
frontmatter-subset string/value codec with no AST and is unsuitable for screening
native configuration. yaml-services-section declares yaml-frontmatter-codec-service,
whose actual current main5d6b5b63dd4bae79894e6c980f1f7e26e8e1c642 manifest0.1.8
declares yaml2.9.0 and json-services-section0.4.0. Its public decodeYamlDocument
returns a native document plus a projected record, but projection/alias expansion
occurs before the caller can inspect syntax, and its default projection limits
are unbounded. Its ./convert-yaml validation is bounded but returns diagnostics,
not the syntax facts needed to screen expanded keys, aliases and executable fields.
The internal ./document.mjs is not a public export and must not be imported by Code.

The minimal supplier change belongs at that existing Data owner: add a public
./syntax entrance using its already declared maintained yaml parser. Preserve
existing mapping, edit, conversion and validation APIs and their callers. Do not
replace the handwritten legacy family or migrate unrelated consumers in this lot.
The proposed pure interface is:
  parseYamlSyntax({text, limits?}) -> {document, yamlVersion, nodeCount,
                                    aliasCount, errors, warnings}
plus the actual maintained isMap/isScalar/isSeq/isAlias/visit functions, exported
from that public entrance. document is the actual native AST, not a second codec.
No JSON value projection, alias expansion, filesystem or configuration evaluation
occurs. Diagnostics expose bounded code/offset coordinates; Code never publishes
raw diagnostic messages or source text. No caller-supplied tags, schema, executable
callbacks or parser options are accepted.

Default Data limits retain the existing64KiB/depth64/8192-node syntax envelope.
A separately explicit larger bounded envelope for native lock screening may admit
at most1MiB source/65536nodes/depth64; this is a proposed Data contract extension
requiring independent resource/compatibility review, not an already received API.
Code uses the small envelope for policy and the larger one only for selected locks.
Oversize/unsupported consumers refuse this opt-in qualification; the ordinary
receiver does not gain a universal new repository input requirement.

The implementation uses actual yaml.parseAllDocuments with fixed YAML1.2/core,
strict/stringKeys/uniqueKeys, no customTags/known-tag resolving/merge, silent
diagnostics and no pretty source excerpts. Require exactly one document.
This matters: an initial supplier-only assay retained a failed expectation that
parseDocument(...,{logLevel:'silent'}) would report a second document; the real
supplier intentionally omits that diagnostic in silent mode. The corrected public
parseAllDocuments assay received seven real vectors. The Data entrance will
add its actual source-owned resource and AST tests; those have not yet run.

The genuine yaml2.9.0 public primary SRI is
sha512-2AvhNX3mb8zd6Zy7INTtSpl1F15HW6Wnqj0srWlkKLcpYl/gMIMJiyuGq2KeI2YFxUPjdlB+3Lc10seMLtL4cA==,
gitHead ddb21b04cb889722cec8f89dc1b67f19d62d7f7d. It has zero dependencies.
All233 original Guix-declared payloads/685953bytes were compared to the actual
Code14.24 frozen recipient's existing yaml2.9.0 provider and matched.
That proves the held maintained parser bytes; it does not prove a future Data
syntax release. Current public Data0.1.8 and JSON0.4.0 primary metadata are reachable
with exact dependencies/SRIs retained. Data0.1.8 metadata has no gitHead; do not
infer source/archive equality from its version. Before source construction use the
existing planner and before consumption receive the genuine new Data release and
payload/source relation. Code then declares that exact Data supplier, not a direct
or undeclared yaml dependency. The exact bounded Data closure is the new Data owner -> yaml2.9.0 + JSON0.4.0;
both existing external yaml and house JSON have ZERO dependencies, optional or peer
edges in their actual primary manifests. The canonical Code14.24 frozen lock
already holds yaml2.9.0, JSON0.4.0 and Data YAML1.4/1.6/1.7; those exact earlier
consumer edges remain. A future syntax-capable Data version therefore adds ONE
new package-version node and ONE direct Code edge, ZERO newly required transitive
versions, and no Networking supplier. Its actual unoccupied version, exact release
and native lock are selected through the original planner after design admission.
The previous zero-new-packages claim for direct yaml is not asserted for this
proper Data-owned interface. No graph or dependency installation is
part of this prerequisite intake. Dependency order remains Data -> Code.

## Concrete native channel inventory

Version authority is the actual PNPM11.28.5 entry/package/dist bytes, not another
major's documentation. Retained exact source ranges are indexed in
pnpm-11.28.5-concrete-channel-source-custody.json.

1. Before PNPM entry code, inherited NODE_OPTIONS/NODE_PATH or native loader
   injection such as LD_PRELOAD/LD_AUDIT/DYLD variables may execute code. Initial
   qualification refuses nonempty unsupported injection channels rather than
   stripping them and calling the result inherited. Use the exact received Node
   and PNPM entry, never Corepack, an arbitrary executable or caller argument tail.
   Bind actual program/entry/provider bytes. Compile cache/TMP/cache/store/state
   resources are explicit owner directories in the child; HOME/CODEX_HOME remain
   the authenticated caller's actual values. Relevant Corepack/PNPM-home/provider
   routing must match this direct-entry role or refuse.

2. getConfig loads Linux XDG_CONFIG_HOME/pnpm/config.yaml, otherwise
   HOME/.config/pnpm/config.yaml, before command handling. Global YAML and the
   selected local pnpm-workspace.yaml can introduce configDependencies,
   pnpmfile/globalPnpmfile, runtime/PM handling and other settings. YAML environment
   substitution applies to KEYS as well as values (180911+). Reject any key
   containing an environment placeholder before PNPM, including nested keys;
   reject executable fields conservatively even when apparently disabled/null.
   The first supported YAML setting set is finite: the ten eligibility keys below,
   native registry/routing/auth fields, explicitly bound resource selectors, and
   root-only packages where applicable. Other settings requiring external files,
   execution, workspace composition or unsupported derivations refuse. This is
   supported-context admission, not a custom YAML precedence or PNPM settings codec.

3. The actual default hook is .pnpmfile.mjs with .pnpmfile.cjs fallback
   (241845+). Configured pnpmfile may be one path or an array; globalPnpmfile is
   separately loaded. configDependencies plugins contribute pnpmfile.mjs/cjs under
   node_modules/.pnpm-config; pacquet configDependencies can select an alternate
   native install engine. The first context supports none of these. Both default
   filenames must be absent in the admitted original/staged lock-root roles.
   There is no invented list of legacy names. Unknown provider-version behavior
   refuses rather than being attributed to these bytes.

4. PNPM environment settings use exact pnpm_config_lower_snake or
   PNPM_CONFIG_UPPER_SNAKE and the provider's typed schema. Preserve allowed
   eligibility/resource/auth context; refuse unknown execution/routing settings,
   pnpmfile/global_pnpmfile, runtime/PM switching and configuration-dependent
   paths. Do not compute values or merge arrays in house code. Workspace selection
   additionally accepts PNPM_CONFIG_WORKSPACE_DIR/pnpm_config_workspace_dir and
   NPM_CONFIG_WORKSPACE_DIR/npm_config_workspace_dir (303480+); any nonempty
   external workspace override is unsupported initially. No silent deletion.
   General npm_config_* is not PNPM11's policy namespace, but the explicit
   userconfig fallback and URL-scoped credential namespace remain real inputs.

5. Native INI sources are the provider builtin pnpmrc, selected user auth file
   (native npmrc-auth-file/userconfig priority), configDir/auth.ini, and selected
   project/workspace .npmrc. Native getNpmrcAuthFile priority is CLI
   npmrc-auth-file, CLI userconfig, PNPM environment equivalents, global YAML
   npmrcAuthFile, then npm_config_userconfig/NPM_CONFIG_USERCONFIG. Default is
   actual HOME/.npmrc. PNPM11.28.5 filters these files through isNpmrcReadableKey:
   auth/registry/scoped and network settings. Unscoped pnpmfile,
   global-pnpmfile/configDependencies/runtime/node-options entries in .npmrc do
   not become PNPM execution configuration. Do not invent an INI parser to
   reproduce this behavior or treat all .npmrc text as executable YAML.

6. INI/auth still has an executable CREDENTIAL channel: trusted tokenHelper can
   run when registry authentication is requested. Native PNPM rejects a helper
   introduced only by untrusted project .npmrc; URL-scoped environment helper
   fields are ignored. Config-get itself does not perform the registry-auth lookup,
   but configDependencies could have done so before it. The admitted existing
   credential context is preserved privately for the real installation, including
   any already qualified helper role; this is not a new Code15 credential grant.
   Helper executable identity and absolute path must be bound or that context
   refuses. Secret values/helper output are never receipt/log/argument fields.
   TLS ca/cert/key files and auth routing may read additional files: bind finite
   literal credential resources through their existing private owner, refuse
   unknown/relative external resources, and do not project their contents.

7. package.json devEngines.packageManager overrides the legacy packageManager
   field. Native pmOnFail defaults to download (179423+) and can switch PNPM
   during install, even though config-get without project location skips it.
   The initial contract admits absence or an exact PNPM11.28.5 pin with consistent
   source-owned checks; it rejects other managers, switching requests or mismatched
   pins. engines.runtime and devEngines.runtime can create runtime: dependencies,
   independently of ignored lifecycle scripts. Reject runtime selectors and
   runtime: dependency/lock entries in this first context. Bind the selected lock
   structurally through the Data syntax entrance; configuration-dependency and
   runtime importer data cannot be silently treated as ordinary package payloads.
   No fetching or executing an alternate runtime is required to diagnose refusal.

8. Arbitrary CLI arguments could introduce --config.*, alternate directories,
   runtime/PM commands, filters, recursion and shell execution. Qualified mode
   accepts only the original receiver's generated finite argv; no user argument
   tail or asserted successful observation is accepted. Local scripts are not
   executed by the chosen config/install builtins; native script override is
   limited to other known command families (rebuild/setup/deploy in this provider).
   The real installation retains --ignore-scripts and frozen lock; it does not
   suppress a required feature and then pretend it received that consumer.

## Exact command and observation contract

Use program GNU Node24 and first argument the genuine PNPM11.28.5/bin/pnpm.mjs.
The receiver generates argv directly, without a shell. Resource flag spellings
are --config.cache-dir=ABS, --config.store-dir=ABS and --config.state-dir=ABS.
The native user-auth selector, where a private snapshot is needed, is
--config.npmrc-auth-file=ABS, not a guessed camelCase locator.
These config-dot arguments are a public native customization path normalized
before getConfig. The receiver's existing policy flags are retained literally:
--config.minimumReleaseAgeStrict=true;
without authored local workspace policy, each actual received release supplies
--config.minimumReleaseAgeExclude=NAME@VERSION;
an authored registryConsumption.minimumReleaseAge supplies
--config.minimumReleaseAge=NUMBER. No other house exception is invented.

For each fixed KEY:
  NODE [PNPM_ENTRY, --dir, D, ...RESOURCE_FLAGS, ...ORIGINAL_POLICY_FLAGS,
        ...(NO_LOCAL_POLICY ? [--ignore-workspace] : []),
        config, get, KEY, --json]
No --global and no --location are present. Explicit global location makes native
readCommandConfig ignore project .npmrc/workspace selection; project location
would enable package-manager handling. The no-location form loads the normal
selected context while shouldSkipPmHandling returns true for config-get.
The later config handler's default global=true affects set/delete destinations,
not the already loaded inputs used by this get.

Actual install remains the original frozen native operation:
  NODE [PNPM_ENTRY, --dir, STAGE, ...RESOURCE_FLAGS, ...ORIGINAL_POLICY_FLAGS,
        install, ...(NO_LOCAL_POLICY ? [--ignore-workspace] : []),
        --ignore-scripts, --reporter=append-only, --frozen-lockfile]
Both phases use the same private admitted environment and relative-input role.
Do not add --no-runtime or ignore a feature to manufacture equivalence.

The fixed keys are minimumReleaseAge, minimumReleaseAgeExclude,
minimumReleaseAgeIgnoreMissingTime, minimumReleaseAgeStrict, trustLockfile,
trustPolicy, trustPolicyExclude, trustPolicyIgnoreAfter, blockExoticSubdeps,
resolutionMode. The eight SECURITY_POLICY_CFG_KEYS at177965+ include trustLockfile,
which was missing from the preliminary allowlist.

A material native API limit is explicit: configGet/lookupTypedKey304858+ returns
a typed setting only if explicitlySetKeys contains it (or its native auth fallback).
Implicit defaults return undefined; with --json this is EMPTY stdout, not JSONnull.
Thus each value observation is exactly one of:
  {kind:'native-explicit', value:<validated JSON>, nativeResult:<coordinate>}
  {kind:'native-absent', nativeResult:<terminal0 empty-output coordinate>,
    implicitProvider:<exact provider bytes and default-source coordinates>}
No invented numeric defaults, precedence, matching algorithm or house resolver.
Source/stage preservation follows equal explicit observations plus equivalent
complete screened inputs and the SAME provider/default implementation, while the
actual install provides native eligibility admission. A native-absent row does
not claim to have measured a numeric default. If these premises cannot establish
a complete context, refuse the qualification. Nonzero/signal/timeout or malformed
nonempty JSON is unread. JSONnull remains different from absence.

## Custody before native configuration

installConfigDepsAndLoadHooks runs for config-get before its handler. It installs
configDependencies BEFORE checking ignorePnpmfile. Therefore ignore-pnpmfile is
not a safe substitute for screening, and no unsafe config child has been run.

Preflight plus a later hash is insufficient against a writable YAML race: new
hook configuration could execute before a mismatch is observed. The proposed
qualified path uses the existing receiver's private selected-input staging model
for both source-role observation and install-role observation. Receive bounded
stable original file bytes/presence, then screen the EXACT bytes in private
operator-owned snapshots before exposing them to PNPM. Each snapshot contains only
selected consumer manifest, selected lock, its optional local policy and .npmrc.
The source role is explicitly an original-input snapshot with original path/commit
and byte witnesses, never falsely the live original directory.

Global YAML/auth.ini are exact private byte snapshots under a task-owned
XDG_CONFIG_HOME/pnpm in the child, preserving native filenames and optional
absence. The user auth file is likewise selected through native npmrc-auth-file
when projecting private custody. HOME/CODEX_HOME and auth values are preserved;
no account configuration or user environment is rewritten. Raw private auth/config
bytes stay mode0600 in mode0700 owner staging, never repository source, public
records, logs or command arguments. If this credential projection is outside
the caller's already admitted custody, refuse it; do not invent a credential grant.

All relative config/helper/TLS/resource selectors are unsupported initially;
absolute existing credential/helper resources retain their independent original
identity checks. The snapshots and private environment are exclusive to the
invocation, bind original->snapshot file roles, and are screened as a whole before
the first native process. No other writer is admitted there. A redirected path,
unknown source, excess bytes or failed custody condition refuses without launching
PNPM. This is finite input projection for the existing native operation, not
a configuration-resolution service. Literal original files are rereceived after
native outcomes so drift cannot be promoted as the same original consumer.

Use fixed per-key30s deadlines/64KiB stdout/64KiB stderr and retained native
status/stream custody; aggregate observation budget10keys*30s at each required
phase is explicit before admission. Actual installation retains its current
bounded native timeout and original512MiB stage/capacity contract. Logs expose only
safe refusal codes/coordinates; stderr may contain auth/source diagnostics and
must remain private, never copied into public receipt text. Do not treat an
unknown timed-out child as safely stopped or replay it.

Existing PR28 checks remain after EVERY native outcome and before fallback.
The optional qualified result adds observations to the original frozenInstall
row, binding original/snapshot/install roles, provider/default bytes, inputs,
safe policy values and the actual install result. It is produced in process;
callers cannot supply it as a reusable success token. produceRegistryRuntime
carries and rechecks that actual receiver evidence before packing.

## Independent verification and next transition

This proposal requires separate Data source-contract/API admission, original
planner dependency admission and true published supplier receiving before Code
imports it. Source-only proof of yaml's public API is not that release. No new
Code version, graph or unsafe native config command is authorized by this record.

After contract receiving, original-owner native controls must establish exact
11.28.5 source/stage precedence and array behavior; explicit versus absent
observations; authored/no-workspace preservation; matching PNPM pin versus
switching/runtime refusal; all YAML/INI/environment/hook/plugin channels;
schema-expanded keys; global config/auth snapshot routing; unchanged real HOME/
CODEX_HOME/authentication; credential canary non-disclosure; mutation/redirect and
native failure/unknown outcomes; real native ineligible dependency refusal and
later admission under the SAME policy. The original receiver and runtime consumer
must actually receive the result. These are future tests, not completed claims.

The Guix149 paired consumer remains responsible for two independent native policy
rows and its original engineering/product/target obligations. In particular its
step5 requires the matching pinned driver's check-target. The separate
product-or-qualified-tool participation law does not waive that clause.
Constructor/checker/bootstrap selection and CDE13's exact-candidate machine
no-regression law require an explicit Guix source-contract reconciliation next;
no claim that the old baseline already implements check-target is made here.
