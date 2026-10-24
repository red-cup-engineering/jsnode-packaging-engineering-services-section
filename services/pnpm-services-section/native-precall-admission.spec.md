# Native publisher pre-call admission

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
