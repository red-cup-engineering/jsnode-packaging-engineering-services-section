# Development root-self source QA

Status: source proposal. No new owner release, real FeltOS cohort or operating
acceptance is asserted by the fixture controls.

The NPM Code owner already supplies `withSourceBindings(plan, run)` for temporary
exact-source verification. Registry receiving and publication separately require
exact canonical registry dependency declarations. Keep both contracts: a driver
may need to verify a declared development library against its own current source
before that driver has a published immutable version.

## Explicit composition

An owner opts into the original source qualification gate with this manifest
metadata; it does not add a dependency, local protocol or peer waiver:

```json
{
  "registryConsumption": {
    "sourceQualification": {
      "kind": "development-root-self",
      "testLibrary": {
        "name": "@example/world-library",
        "version": "1.0.0",
        "peerVersion": "0.9.0"
      },
      "selector": {
        "variable": "DRIVER_LIBRARY",
        "value": "@example/world-library"
      }
    }
  }
}
```

The library must be one exact development-only dependency. Its actual native
installed manifest must retain the stated name, version and authored own-root
peer. The selector only names that same library; it cannot rewrite tool,
registry, credential or transport environment. The canonical root must expose
its own `./package.json`, retain exact registry dependency specifications and
contain no own-name dependency in any class. No self link is committed.

`withDevelopmentRootSelfContext({directory, manifest, manifestDigest}, run)`
validates the physical source root, its exact manifest bytes, the actual native
library and the absence of a directly installed root driver. It reuses the
original conductor to bind only the missing own-name targets under the root and
that library. Native module resolution from the library must reach this exact
current source root. It never replaces an existing driver or a registry supplier
body. The caller retains its original bounded source inventory and resource
admission. No installation runs while these bindings are active.

The actual FeltOS native acquisition exposed a distinct PNPM layout: both
explicit own-name targets and the library's native peer slot are absent, while
Node finds an older transitive driver through `.pnpm/node_modules`. Only that
shared fallback may remain during this explicit development context. It must be
a symlink to the same named package inside this owned virtual store, with an
exact version different from both the authored peer and current root. A direct,
compatible, foreign, escaping or redirected provider refuses. The fallback's
physical path, manifest digest and source identity remain unchanged; no supplier
bytes, link or lock are rewritten.

Before binding, while bound and after restoration, the original declared command
executor runs a fresh native Node resolver with a finite five-second bound. It
uses native ESM `import.meta.resolve` from the actual caller directory for both
library discovery and provider checks. It reads package identity and each concrete
public runtime subpath, including the public root when declared, without importing
their code. Import-only and conditional exports retain their actual import
conditions. The bound paths must reach this current source outside node_modules;
the restored paths must exactly equal the initial resolution. This avoids
mistaking a previously populated Node resolver cache for the provider used by
fresh native test processes. Functional tests still establish behavior separately.

On success, the result is `npm.development-root-self.source-qa`, with actual
root identity, authored library peer, native provider path, callback result and
confirmed restoration. On failure, bindings are restored and source or supplier
custody failures remain failures. A callback result is not publication or runtime
receiving. The original generic source-binding method remains available.

## Original producer and consumer path

The existing `sourcePublicationBuildRecipe` recognizes this explicit class in
addition to its existing TypeScript/npm class. The existing
`qualifySourcePublicationBuild` admits bounded exact committed regular entries
and the owner's PNPM lock/policy. Its original `--qualify-build` worker calls
`qualifyPackageSourceBuild`. Only this new class uses the original canonical
`receiveSourceRegistryConsumers` for its fresh frozen graph, avoiding another
PNPM launcher. All external pins, SRI and authored policy remain that original
receiver's responsibility; this context does not relax it.

That original receiver invokes native frozen install; it does not itself invoke
`pnpm peers check`. PNPM 11.19's default `strictPeerDependencies:false` means a
successful install must not be interpreted as a complete peer proof. This new
source-QA branch therefore runs the original native
`pnpm peers check --lockfile-only --json` and retains its actual status and full
report before creating any binding. Exactly one missing, nonoptional peer is
admitted as the declared development frontier: the selected development library,
its exact version and its unchanged authored own-root peer range. Any other
missing/bad peer, conflict or incomplete report refuses. No native warning rule,
strictness setting, dependency, lock or supplier manifest is modified.

The installation stage is typed `npm.development-root-self.installation`, retaining
the original frozen-body receipt separately. Its peer frontier records
`authoredPeerSatisfied:false` and `registryPeerClosureReceived:false`. The root's
explicit source-qualification metadata authorizes a functional assay against
this exact current source identity; it does not assert satisfaction of the old
library's peer requirement. Other required gaps, including development tools,
must be genuinely supplied before this stage can pass. Native resolution to the
current source is then proved during the temporary context and restored after it.

After the install completes, the original gate runs the owner's native test
script, a declared native `test:coordination` family when present, and authored
prepack under the shared context. The source adapter checks all authored bytes
and refuses additional undeclared products. Its result retains typed SOURCE QA
separately from the canonical frozen installation. The existing generic GHS
landed publisher already calls this recipe and adapter before packing; no
application-specific GHS branch or new executor is introduced.

`packRegistryCarrier` remains the mechanical, lifecycle-disabled artifact maker.
Actual complete declared packed receiving must use the same development context
on the direct root artifact through its original receiving caller, with source
fixtures and the qualified external native graph bound independently. A packed
root artifact is legitimate own-package receiving; substituting a different
external provider artifact is not. Full packed receiving, actual published
registry readback and an installed ordinary consumer remain separate required
evidence. Fixture tests do not establish those outcomes.

A SOURCE QA receipt cannot satisfy `produceRegistryRuntime`, whose unchanged
input requires `npm.source-registry-closure.consumers`. Publication manifest
validation, canonical dependency classes and installed runtime confinement stay
unchanged. Actual selected optional features and their full supplier topology
remain required when that feature is selected.
