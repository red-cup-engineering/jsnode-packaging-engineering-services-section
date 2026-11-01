# Source closure application preserves installation policy

## Original Work and problem

This source change serves original MetroPlat engineering-delivery Work
`ni:///sha-256;ylvMNgq1vmF8vC0VCLir3C4XOKesE_9ztrVbXC5ggWQ`,
`task:receive-canonical-registry-public-metadata`, upstream of original native
JavaScript source QA and estate operation. It does not create a new queue.

At source `0e58303675c7eabc37cc01f48f12b78edb5daac6`,
`applySourceRegistryClosure` preserves an explicit .npmrc default, but writes
`registry=plan.registry` when no default exists. The plan registry identifies
publication, not the installation policy of every consumer. This hidden source
effect routes unrelated public dependencies to a house-only registry. Code's
own tracked .npmrc currently has that global house default. Native frozen
receiving failed on public content-type metadata there; public npm returns it.
The inference owner instead uses public default plus authored house scopes and
has just installed its frozen graph successfully. Peer Work in BCF issue599
explicitly preserves intentional R2 house-package serving; no server mutation is
necessary to establish proper client scope routing.

## Requirements

R1. Applying an admitted source closure shall write the selected manifest
transformations only. It shall not create, rewrite or initialize any .npmrc,
regardless of the publication registry or whether an explicit default exists.
Existing config bytes, comments, source/auth placeholders, defaults and scope
routing stay unchanged. An absent .npmrc stays absent. Do not parse, copy or
return credential material in the transformation receipt.

R2. Preserve existing full-selection preflight: incomplete selection, missing
carrier targets, invalid dependency specifications and a manifest sourceDigest
mismatch refuse before any selected manifest or config mutation. The returned
changed list contains exactly the selected manifest paths actually written.
No change to source digest authority, package identity or release selection.

R3. Code's own installation policy shall explicitly select public npm as its
default and registry.561.group for its house scope. Derive required house scopes
from the actual selected Code manifest rather than a new guessed organization
catalog. Its current root and all house direct dependencies belong to
@red-cup-engineering. Preserve exact manifest, lock, workspace release-age and
supplier identity. A verified frozen native install must receive public and
house artifacts under that policy before claiming dependency acquisition.

R4. Keep publication authority, tarball retrieval, lock resolution, frozen
installation, Code capability-bearing receiving, isolated source QA and actual
CI distinct. No scope mapping grants publication or authorizes a public proxy.
No version alias, lock rewrite, policy waiver, timed retry or larger agent
budget is part of this repair.

## High-level design

Remove installation configuration creation from the existing closure-application
cell. Its already complete preflight and manifest mutation are the one shared
implementation. Keep source-level installation policy with each consumer owner;
this change explicitly corrects Code's tracked .npmrc through ordinary reviewed
source custody. No second registry-policy generator, service or queue is needed.
Other consumers' authored .npmrc files remain untouched by the generic operation.
Existing source/frozen/packed receivers continue to consume their original
policy and independently assess the supplier graph.

## Low-level design

In applySourceRegistryClosure, retain all current admission/preimage checks and
the write of entry.manifest JSON. Remove the read/conditional write of .npmrc.
For each selected entry append only entry.path to changed. Preserve the existing
return kind and manifests count. No caller option or implicit global default.

Code's own .npmrc becomes these explicit routing declarations:
registry=https://registry.npmjs.org/
@red-cup-engineering:registry=https://registry.561.group/

Independent receiving constructs real temporary selected manifests with source
SHA-256 preimages, invokes the original exported operation, and inspects actual
file bytes/existence and its changed receipt. Test absent config, a scope-only
config lacking a default, an explicit default/scoped config with comments and
an auth placeholder, multiple consumers, and a late invalid preimage that must
not mutate earlier selections. No install or network is needed for these source
effect controls. The actual Code frozen install is a separate native check.

## Native construction and receiving

Non-Claude/non-Codex construction receives this governing design, exact source,
read-only independent tests, preimage-checked source edit tools and actual native
check tools through the repaired inference context path. No customer-imposed
time, token, request or tool-call ceiling. Pure model output does not deliver
construction; independent receiving checks real source and effects.

The consumer source receiver currently imposes admission/install deadlines and
a clock memory-wait loop; its lifecycle needs separate original-owner
engineering before using it under the current no-artificial-limits direction.
For this source-maintenance check, native PNPM frozen acquisition has no caller
command deadline and cannot claim the stronger Code capability-bearing closure.
Preserve manifest/lock/workspace hashes and the reviewed .npmrc policy. Avoid
running the known failing unchanged registry selection again.

## Primary contract references

npm project and scoped registry configuration:
https://docs.npmjs.com/cli/v11/configuring-npm/npmrc/
https://docs.npmjs.com/cli/v11/using-npm/scope/
These describe scope routing; neither makes a publication target the default
installation registry for all unrelated packages.

## Independent native receiving

The corrected Code policy received all 107 entries through actual PNPM frozen
installation with the manifest, lock, workspace policy and reviewed npmrc hashes
unchanged. Every one of the 15 actual direct installed supplier manifests
matches its exact source declaration. Twenty-nine independent source/closure/
pinning controls pass. The provider hit an input-quota refusal after source
effects; its completed edits and native acquisition are retained independently
of that refusal. The admitted source fragment is provider-authored; unrelated
worker bytes from its whole-module rewrite were restored by exact original Git
receiving. No complete model delivery or CI/operating result is inferred.
