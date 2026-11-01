# Native module source revision

The original machine owner may receive a source transformation over its exact
immutable dependency context when replacing a complete portable installation
would duplicate that context. This does not publish a new package or assert
that its declared dependency versions were installed. Package metadata and
the received dependency graph remain the original ones.

Code receives an explicit finite map from original canonical module URL and
SHA-256 to replacement SHA-256, exact upstream repository, commit and path.
The construction receiver must independently compare replacement bytes with
that Git source, qualify the complete affected API against the original
supplier context, and pass those references to the machine owner. A hash is
byte identity, not source qualification or deployment authorization.

Node's native synchronous module load hook preserves the original URL, so
relative imports and package resolution use the original graph. Every other
load delegates unchanged. Duplicate mappings, redirected files, different
before/after identities and targets outside the original immutable runtime
refuse. Registration requires all live inputs in the immutable Guix store.
No repository or dependency payload is copied, reinstalled or re-resolved.

LAGOON must realize and root the original runtime, Code operation, replacement
files and revision record in a separately received host generation. The native
service manager owns activation and rollback. A staged operation or test pass
is not an installed effect. Child process propagation, when required, must be
an explicit property of the machine's received entry, never an ambient edit to
the user's shell or service files.


## Current source closure (v5)

The active receiver accepts `code.native-module-source-revision/v5` only.
Earlier v1–v4 records and interpreter bytes remain immutable historical
predecessors; they are not alternate active input schemas. A v5 successor
retains every previously selected mapping and named supplier binding before
adding its independently qualified source closure.

A replacement mapping carries the original target SHA-256 in `before`. An
addition instead carries exactly `before: {kind: "absent"}` and its own exact
`source: {repository, commit}`, canonical relative `.mjs` `sourcePath`, existing
immutable `replacement` path and SHA-256 `after`. This is absence evidence,
not a fabricated original hash. The construction receiver independently
compares the bytes with the committed source and path before machine admission.

Every target shall be a normalized absolute `.mjs` path within the original
runtime root. An addition shall have an existing canonical original directory;
the target leaf shall be actually absent, including absence of a dangling link.
Redirected parents, existing leaves, extra absence marker fields, duplicate
mappings, absent Git identity and byte drift refuse. Live inputs remain under
immutable Guix custody. Each body is bounded to one MiB; at most 64 mappings
and 64 MiB of aggregate original plus replacement bytes are admitted.

The native synchronous resolver may resolve an absent relative `.mjs` import
only when both its importer and its target are explicit received mappings.
It preserves the absent target's original runtime URL, so that new module's
relative and package imports retain the native dependency context. Relative
imports from revised modules may not escape the runtime. Unmapped imports
still use the original resolver, including its missing-module refusal. The
resolver and load hook recheck absence; load rechecks source bytes. No target
file or package version is written into the original runtime.

## Named native supplier ports

A v5 record may retain at most 32 explicitly named public export bindings for
exact importers. Each includes importer, original module and selected module
byte identities plus the selected supplier's actual package manifest, name
and version. The receiver requires a literal public export and confines every
input to the original immutable runtime. Empty bindings are valid.

The actual Node ESM resolver must first return the recorded original module.
Only that importer/specifier pair selects the received supplier; other imports
delegate unchanged. The selected module retains its native supplier context
and private admission state. False resolution, byte drift, competing bindings,
and incorrect supplier/export identity refuse. This operation confers no
Office, model capability, Session, quota or Work authority. Source qualification,
complete supplier-context receiving and machine activation remain mandatory.

Native tests execute an actual Node import through an absent helper, an
unselected importer and an unchanged relative supplier; retain negative
controls for false absence, source identities, hash drift, redirected inputs,
escaping or unmapped imports, duplicate mappings, supplier exports and bounds.
The active prior 38 mappings and three bindings are also received without
removing a selected predecessor. This adds source closure, not an install,
package publication, resource-limit increase or deployment authorization.


## Explicit added public source ports

An `absent-public-export` binding names one exact revised importer and bare
supplier specifier. Its `original` is exactly `{kind:"absent"}`. The original
immutable supplier manifest must have the recorded name/version/hash, an
unconditional literal `./package.json` public export, an object exports table,
no wildcard matching that key, and no entry for the selected public key. Native resolution
of the supplier package.json from this importer must return that exact original
manifest URL; resolution of the requested port must throw only
ERR_PACKAGE_PATH_NOT_EXPORTED. Other errors never authorize selection.

The selected URL must be an explicit absent module mapping from the same exact
Git source as `sourceExport.source`. `sourceExport` supplies an independently
Git-qualified immutable JSON manifest reference `{path,sha256}`, its repository
relative `sourcePath`, exact export `key` and literal relative module `target`.
That source manifest must name the same supplier and declare this exact export;
joining its source directory and export target must equal the selected module's
committed sourcePath. No installed manifest is edited or claimed upgraded.
The machine constructor receives JSON declarations separately as bounded Data,
keeps them in its native closure, and does not call them module replacements.

The receiver and resolver recheck original and source manifest hashes, importer
preimage, source identity, selected mapping and actual absence. Every unselected
importer uses native resolution, including its missing-export refusal. Drift,
false absence, ambiguous exports, changed Git/path bindings, duplicate ports and
wrong supplier resolution refuse. The 64 mapping, 32 binding and aggregate byte
bounds remain; prior source mappings and three existing binding structures are
retained in the new source record.
