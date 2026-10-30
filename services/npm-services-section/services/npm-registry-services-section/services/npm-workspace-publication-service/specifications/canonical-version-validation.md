# Canonical version validation in the npm publisher

## Sources and receiving boundary

- Operations governing demand: https://github.com/coesite-operations/operations-services-section/issues/4
- Engineering implementation demand: https://github.com/red-cup-engineering/engineering-services-section/issues/6
- Versioning Services Section revision: `sha256:daab0a2790ef76e40178d13a8e362f7fd6b88eefe10c867a0af2c7fd87ab9730`
- SemVer 2.0.0 grammar: https://semver.org/#semantic-versioning-specification-semver
- npm tag restrictions: https://docs.npmjs.com/cli/v11/commands/npm-dist-tag/#caveats
- npm transport implementation: https://github.com/npm/cli/blob/latest/workspaces/libnpmpublish/lib/publish.js

Operations requires canonical `MAJOR.MINOR.PATCH[-PRERELEASE][+BUILD]`, including
named prereleases and non-ordering build provenance. Historical/presentation
aliases remain aliases. Science owns version meaning, this Engineering service
owns enforcement, and Operations retains compatibility review and authorization.
Grammar acceptance does not authorize publication.

## Correction and invariants

Reuse `dependency-policy.mjs`'s existing `isExactSemver` predicate. Do not introduce
a second grammar or a new dependency. Core numeric fields and numeric prerelease
identifiers must have no leading zeros except the single digit `0`. Alphanumeric
prerelease identifiers may begin with zero. Build metadata may contain numeric
identifiers with leading zeros. Identifiers contain only nonempty ASCII
alphanumeric/hyphen components. The exact predicate does not trim its input.

`publicationTag` retains its existing trimming behavior and `latest`/first
prerelease-identifier mapping, but must use the same syntax predicate. Stable and
named-prerelease plans retain their former bytes, digests and authorization shape.
Malformed versions fail with `malformed-version` before forming a plan.

Build metadata remains valid syntax. The current npm transport applies
`semver.clean` to `manifest.version`, removing build metadata before registry
submission. Local npm 11.9.0 with its existing semver 7.7.3 reproduces this behavior;
the inspected current upstream `libnpmpublish` has the same normalization step.
This service promises exact authorized version identity at registry readback.
Until that transport/identity contract is resolved, publication of a version
containing build metadata remains refused, with the distinct
`unsupported-publication-version` error. This is explicit implementation debt,
not a change to the Group's version grammar or a new Operations policy exception.
Do not strip metadata to make a publication plan pass.

## Explicitly unresolved transport cases

Legal SemVer prereleases can produce illegal npm tags under the existing mapping.
For example `1.2.3-0`, `1.2.3-v1`, and `1.2.3-x` yield `0`, `v1`, and `x`, which
npm treats as ranges rather than tags. `1.2.3-vnext` yields a valid named tag, so
blanket refusal of every `v`-prefixed identifier would also be incorrect.

This bounded grammar correction adds no alternative mapping, range parser,
publication permission, or assertion that every syntactically valid version is
publishable. Tag-policy/transport repair remains a separate owner decision and
qualification. No registry was contacted or publication performed for these checks.

## Verification obligations

- Preserve the full existing 56-test regression suite
- Demonstrate leading-zero core and numeric-prerelease refusals and ordinary controls
- Test source dependency projection and published contracts through the shared predicate
- Test metadata syntax independently from publication transport refusal
- Preserve exact-input predicate behavior and publication helper trimming behavior
- Compare legitimate stable/named-prerelease plans against the pre-correction implementation

Local passing checks establish only this candidate's behavior. They do not establish
Group-wide adoption, native admission, release approval, registry receiving, or deployment.
