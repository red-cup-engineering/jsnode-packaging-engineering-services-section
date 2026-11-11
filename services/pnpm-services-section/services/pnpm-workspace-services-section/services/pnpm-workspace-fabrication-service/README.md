# pnpm-workspace-fabrication-service

<!-- 561-group-standards:badges:start -->
[![Red Cup Engineering](https://img.shields.io/badge/561%20Group-Red%20Cup%20Engineering-c0392b)](https://github.com/red-cup-engineering)
[![License: MIT](https://img.shields.io/badge/license-MIT-c0392b)](LICENSE)
[![Indigenous data: CARE](https://img.shields.io/badge/Indigenous%20data-CARE-4b6f44)](https://github.com/red-cup-engineering/.github/blob/main/GOVERNANCE.md)
[![Tips welcome](https://img.shields.io/badge/tips-welcome-d4a017)](https://github.com/561-group/.github/blob/main/TIPS.md)
<!-- 561-group-standards:badges:end -->

Fabricates an explicitly ordered pnpm workspace as a customer artifact without granting workspace authority over the provider organism.

## Source-bound policy admission

Build decisions are part of the input contract, not an informal post-generation
suggestion. When buildPolicy has entries, every matcher must have an explicit
boolean true (permit) or false (deny) decision. Policy-bearing workspaces must
pin pnpm 10.26.0 or later: earlier pnpm releases do not implement allowBuilds
and cannot be trusted to enforce a generated map. This package writes
strictDepBuilds: true alongside allowBuilds so unexpected build scripts are
installation failures rather than silently unreviewed execution. No build is
implicitly approved. Versionless or malformed decisions fail before output
creation; an absent/empty policy means this factory supplies no reviewed
package-specific decisions. pnpm itself and the real installed dependencies
remain independent qualification subjects.

The package paths are canonical customer-relative directories, not aliases of
root manifests, parent paths or symlinked output roots. Project before making
filesystem effects, and require an empty ordinary output directory. The
returned SHA-256 digest represents the projected files; it is **not** a
pnpm install attestation, package-integrity verification or customer acceptance.

## Dependency-contract fidelity

For dependencies whose names match packages in the same fabricated workspace,
the projector prefixes the **original declared range** with `workspace:`,
rather than replacing it with the provider package's current version. It
preserves an existing `workspace:` specifier unchanged, and leaves unrelated
external package dependencies unchanged. All four dependency tables
(`dependencies`, `devDependencies`, `optionalDependencies`,
`peerDependencies`) require string-valued, nonblank specifiers. A source
protocol such as `npm:`, `file:` or `git+` for an internal package cannot be
quietly redirected to a different local source.

This fabricator does **not** implement or claim its own SemVer solver. The real
pinned PNPM installer must independently accept a compatible internal range
and refuse an incompatible one. The package qualification uses both cases:
`workspace:^1.2.0` accepts provider `1.2.3`;
`workspace:^2.0.0` refuses the same source. A generated manifest is only
an admitted candidate; it is not evidence that the customer's install works.

**Migration:** earlier versions of the generator could replace a consumer's
declared range with the current local provider version. Regenerate workspaces
from the original, independently approved specification, inspect changed
manifests and dependency lockfiles, and rerun pinned PNPM receiving before
admitting an update. Never infer that an old passing install satisfied the
original requirement if the generated version was silently substituted.

## Verify and consume

Run npm run verify with Node 22 or newer. It runs source checks, Node native
unit/negative tests, an npm-packed CLI consumer test that reads real generated
files, and an npm pack dry run. The native packed-CLI consumer checks two explicit denied build-script
settings but does not run pnpm or prove a downstream application boots.

The CLI accepts --specification path/to/specification.json and --output an
empty directory path. A specification includes root.name, root.version,
pnpmVersion, an explicit packages list of relative path and manifest entries,
and optionally buildPolicy as package matcher to boolean. See the native tests
for an executable specification and output assay.

Requirement identifiers and qualification limits are recorded in
[docs/qualification/2026-10-27-build-policy-assay.md](docs/qualification/2026-10-27-build-policy-assay.md).

## Deterministic projection and controlled receiving

The source specification is a JSON value tree. The engine rejects accessors,
non-JSON values and PNPM glob selectors in package paths before any materialization.
Equivalent source trees produce byte-identical manifests and a stable digest
regardless of property insertion order or source package order. A projection's
file view supports read-only Map-style operations (`get`, `has`, iteration,
`keys`, `values`, `entries`, `forEach`); its file map and package identities
cannot be changed after its digest is calculated. These are compatibility
constraints on the public projection interface.

The materializer refuses symlinks in any *existing ancestor* of the output
path, not only at the output itself. This is an alias check, **not** confinement
against concurrently hostile filesystem reparenting; a production host must
supply the appropriate OS isolation and immutable parent custody. A factory
receipt attests only to source-created files and their digest; a PNPM install
may subsequently create additional files without changing that receipt.

`npm run verify` performs local source and packed-CLI tests. The independent
`npm run verify:pnpm` requires **real PNPM 12.9.1**, creates an external package
with a harmless sentinel lifecycle script, consumes the npm-packed factory,
installs a generated workspace of *local* fixture tarballs and workspace
links, replays its frozen lockfile offline, reads the exact eight observed
Bare Cedar Fog registry-version denials, and refuses unreviewed build scripts.
The first installation may access the trusted npm registry to resolve PNPM 12's
package-manager bootstrap metadata, even though the **exact native PNPM
12.9.1 executable** has already been installed by npm. The independent frozen
replay and unreviewed-script negative installation are offline.

The GitHub qualification workflow runs native and PNPM tests independently.
Only after both pass does it double-pack the library, check byte-identical
archives and SHA-256, install the packed candidate into a fresh npm consumer,
and retain the unpromoted archive under the workflow run's Actions artifacts
for 30 days. That artifact is not an npm publication, SLSA attestation, or
production customer release. The original Bare Cedar Fog eight dependency
installations, WSL capacity receiver, production boot, and customer acceptance
remain separately qualified work.

See [the source qualification record](docs/qualification/2026-10-27-build-policy-assay.md)
for requirement IDs, source comparisons and current execution limits.

## Acceptance

Run `npm test` for the source suite. The [API reference](docs/API.md) links the source refusal and [runnable consumer example](examples/quickstart.test.mjs).
