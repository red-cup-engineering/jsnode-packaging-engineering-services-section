# Group npm registry serving

This package is the Group npm registry (registry.561.group): the npm registry
protocol as npm and pnpm speak it, served from the Group's package facts. It
runs as a MetroPlat hosted application on an instance's own listener, or as a
standalone process; both are the same registry over the same store.

## Data: facts, blobs, and what is projected from them

What the registry knows about a Group package is what has happened to it, kept
as EAVT rows (`{e, a, v, t}`, the shape `eavt-services-section` reads) in an
append-only journal per package, and its tarballs, each kept once under its
RFC 6920 SHA-256 NI address:

```
<storage>/<name>/facts.jsonl           publications, dist-tag moves, deprecations, readme
<storage>/-/blobs/sha-256/<d0d1>/<d>   tarball bytes, located by the shared ni-path formula
```

A row's entity is the package's Package URL (`pkg:npm/%40scope/name`, or
`…@1.0.0` for one version), so facts do not change when the registry's origin
does. The vocabulary is in [`src/facts.mjs`](src/facts.mjs). A version's first
publication is its publication: a later one is a contradiction, kept as
evidence and kept out of every document. Tarball URLs, `time`, `_rev`,
maintainers, and the top-level `description`/`repository`/`license`/…
(presented from latest, as npm's registry presents them) are derived, never
stored.

Every document served for a Group package is a pure projection of its rows
([`src/projection.mjs`](src/projection.mjs)): the full packument, the
abbreviated install document, a version manifest, dist-tags, a search entry.
Each is rendered once per journal state and cached until the journal changes.

The store keeps one more projection on disk: `<name>/package.json` and
`<name>/<file>.tgz` (hard links to the blobs), the layout the earlier
Verdaccio-shaped store used. An earlier registry release, or Verdaccio, still
serves this store after a rollback; nothing reads that layout as truth while a
journal exists.

## Reception of the earlier layout

A package the earlier store wrote (`package.json`, no journal) is served by
reading its packument as the facts it records, in memory, before anything is
written. Reception ([`src/reception.mjs`](src/reception.mjs)) writes those
facts down: it adopts each tarball into the blob store by hard link, checks it
against its advertised integrity, and writes the facts only if their projection
serves every field the earlier store served, unchanged. A package that would
not be served the same is left exactly as it was and reported. Tarballs are
measured as streams, so a store is received without holding any of them. A
scoped version the retired publisher left under npm's attachment key
(`@scope/name/@scope/name-1.0.0.tgz`) is recovered from there and linked at its
leaf, only when its bytes are the advertised ones. A journaled
package is reconciled with its `package.json`: a version found only there (an
earlier release published it after a rollback) is received, never lost.

The registry receives its store once at start, in the background, while it
already answers (`receiveAtStart: false` turns that off), and reports one JSON
line on stderr. `receive-registry-store CONFIGURATION [--dry-run]` does the
same on demand; `--dry-run` writes nothing at all. Against the 1,422 house
packages registry.561.group served on 2026-10-21, every package's full and
abbreviated documents were identical before reception, after it, and on a
second (no-op) run.

## Hosting

**MetroPlat.** Declare the registry among a MetroPlat instance's
`applications`:

```json
{ "module": "@red-cup-engineering/npm-registry-serving-service/application",
  "export": "npmRegistryHostedApplication",
  "configuration": { "hosts": ["registry.561.group"], "origin": "https://registry.561.group",
                     "storage": ".local/state/561-group/registry/storage",
                     "htpasswd": ".local/state/561-group/registry/htpasswd",
                     "privateScopes": ["@red-cup-engineering", "…"] } }
```

The instance's entrance answers every request whose Host is one of `hosts`
with the registry, ahead of the instance's own sign-in and routes; the registry
authenticates its own state changes. The native listener negotiates
compression. A host may build its entrance more than once; every build gets the
same registry, so one store has one writer queue in a process. The
configuration is exact: an unknown key, or an origin that is not one of the
hosts, is refused.

**Standalone.** `serve-house-registry CONFIGURATION` (or
`NPM_REGISTRY_CONFIGURATION`) listens on `127.0.0.1:$NPM_REGISTRY_PORT` (18821),
gzips JSON for clients that ask, and with `NPM_REGISTRY_ACCESS_LOG=1` writes one
JSON line per answered request to stderr.

Writers serialize per package within a process and across processes: a lock
file beside the journal, taken over when its holder has exited. The standalone
face may serve the same store as a MetroPlat instance, for example as a
recovery face.

## Protocol

- **Metadata** (`GET`/`HEAD /<name>`): npm's abbreviated
  `application/vnd.npm.install-v1+json` when the client prefers it at least as
  much as JSON, else the full document; `Vary: Accept` either way. Unknown
  timestamps and shrinkwrap status are not invented.
  Reference: https://github.com/npm/registry/blob/main/docs/responses/package-metadata.md
- **Revalidation**: every packument carries a strong `ETag` per
  representation and a `Last-Modified`. `If-None-Match` (or, without it,
  `If-Modified-Since`) is answered 304 until something happens to the package.
  pnpm and npm send both; a Group packument is `Cache-Control: no-cache`, so a
  publish is seen at once and an unchanged package costs a 304. A public
  packument is `public, max-age=300`, as npm's registry sends it. A tarball is
  `public, max-age=31536000, immutable` with its shasum as its ETag.
- **Public names** are the uplink's (registry.npmjs.org), never written to
  storage: held in memory, at most `publicMetadataBytes`, least recently used
  first out, fresh for `uplinkMaxAgeMs`, answered stale only while the uplink
  fails. Overlapping reads for one name share one fetch. Client credentials
  never reach the uplink.
- **Signing in**: publishers are the htpasswd file's (bcrypt; re-read when it
  changes, so the operator adds one without a restart). npm's Basic credential
  (`username`/`_password`) works as before. `npm login` (npm falls back from
  web login, which is not offered) signs in with the publisher's password at
  `PUT /-/user/org.couchdb.user:<name>` and receives an `hnr_` token for
  `_authToken`. Only its SHA-256 is kept, in `tokens.jsonl` beside htpasswd
  (`tokens` to place it elsewhere). `npm logout` revokes it. Signing in never
  creates an account.
- **Audit**: `npm audit`'s bulk advisory request is forwarded to the uplink
  with the Group's names taken out; the uplink has no advisories for them, and
  the Group's dependency inventory is not the uplink's to read.
- **Search**: `GET /-/v1/search` over the Group packages (`scope:` and
  `keywords:` qualifiers; a name match ranks above a description match).

## Publication

The npm client publishes a manifest and attached bytes. For scoped packages npm
may name the attachment `@scope/name-version.tgz`; the registry admits either
wire name and records the canonical `name-version.tgz`. Before writing, it
validates the complete publication: exact package and version identities, one
artifact per version, its canonical filename, canonical base64 and declared
length, supplied SHA-1/SHA-512 digests, a declared repository, and each tag's
version target. Unbound attachments, missing artifacts, conflicting bytes, and
occupied versions are refused, and nothing is written. npm provenance-bundle
attachments are not supported; Group publication uses `--provenance=false`.

A publication then places each tarball in the blob store, links its leaf,
appends its facts (publication, tags, and the readme the tarball ships when it
is latest's), and rewrites the earlier-layout projection. A failure before the
append leaves at most an unadvertised complete artifact; retry can reuse those
exact bytes, but cannot replace them. A journal line cut short by an
interrupted append is not read, and is cut back before the next append.

## Publish gate

A new version is read before it is stored. The registry opens its tarball in
memory (gzip, ustar, PAX; bounded inflation; no link or device members) and
reads it; it never extracts to disk and never runs anything from it. A 400 names
every problem at once, per version, and nothing is stored. The checks, by the
kind each violation reports:

- `export-target`, `bin-target`: an `exports` target (under `import`, `require`,
  `node`, `module-sync`, `default`, or none) or a `bin` target that the tarball does
  not contain. A pattern target must match at least one shipped file.
- `undeclared-import`: a `.mjs`/`.cjs`/`.js` module (outside `node_modules`) with a
  static `import`, `export … from` or `import("literal")` of a house-scoped
  specifier whose package is not in dependencies, peerDependencies or
  optionalDependencies. The package's own name is judged by its own `exports`
  (`self-import`). Modules are read with the Group JavaScript parser
  (`@red-cup-engineering/javascript-parser-service`), so comments and strings are not
  imports; a module that names a Group scope but does not parse is a `source` violation.
- `dependency`: a declared Group dependency with no published version satisfying
  its range (npm semver; a dist-tag also resolves), or a specifier a registry
  cannot resolve (`workspace:`, `file:`, …).
- `dependency-subpath`: an import whose subpath the highest published version
  satisfying the range does not export, `*` patterns and `./package.json` included.
  The message lists the subpaths it does export and any versions that export the
  one imported. A dependency with no `exports` exposes all its files and is not judged.
- `tarball`: bytes that are not an npm tarball, no readable package.json, or a
  package.json naming another package or version.

Group scopes default to `@red-cup-engineering`, `@lenticule-science`, `@561-group`,
`@coesite-operations`, `@causeway-services`, `@emsenn` and the registry's
`privateScopes`; configure `houseScopes` to change them, `publishGate: false` to
turn the gate off. Imports of other packages, `node:` builtins and relative paths
are not checked, and `require()` is not read.

## Metadata updates

A published version is fixed: tarball, integrity and manifest. What moves is
facts about versions, all of it authenticated:

- `npm deprecate` GETs the packument and PUTs it back whole, with no attachments.
  A PUT without attachments is accepted only if every published version is present
  and identical to the served one except for `deprecated` (an empty message clears
  it), and `dist-tags` and `maintainers` are unchanged; anything else is a 409
  naming what differs. A version that would be new needs its tarball (400).
- Dist-tags: GET `/-/package/<name>/dist-tags[/<tag>]`, PUT a version string to
  `.../dist-tags/<tag>`, DELETE `.../dist-tags/<tag>`, on Group packages only. A
  tag must name a published version and must not be a valid semver range;
  `latest` is moved, not removed.
- `npm unpublish` (PUT `/-rev/`, DELETE) is a 405: versions are never removed.
- `npm owner` is a 409: maintainers are the publishers of record.

## Memory is bounded by admission

The registry runs in a small host, and its heap aborted twice on 2026-10-18 (V8
heap exhaustion) under landing publications. It bounds what it holds by
refusing, not by hoping: one publish body is in memory at a time (publishes are
taken in turn); a body over `maxPublishBytes` (64 MiB) is refused 413 and never
read past the cap; a stored tarball is streamed from disk with its length
instead of held; an uplink tarball over `maxUplinkTarballBytes` is not fetched
into memory; and while the V8 heap is within a fifth of its limit a new publish
is answered 503 with Retry-After instead of growing the heap until the process
aborts. Public metadata and Group projections each stay in a 32 MiB
least-recently-used budget (`publicMetadataBytes`, `houseMetadataBytes`).

## Receiving

`npm test` runs every test; `receivingTests` ships the enrolled set with the
package. They cover:

- **Transactions**: complete-transaction refusal, occupied-byte and version
  immutability, concurrent publications, and failed-write preservation.
- **Facts**: the facts and blobs a publication writes, the projections served
  from them, and reception of the earlier layout (including a refused packument
  and a version an earlier release published after a rollback).
- **Store integrity**: cut-short appends, contradictions, two registries
  sharing a store, and a stale lock.
- **Protocol**: revalidation and cache headers, the full document's
  npm-derived fields, sign-in tokens and htpasswd reload, audit filtering, and
  the hosted-application contract.
- **Real clients**: the installed npm client publishes, installs, deprecates,
  tags, signs in at a terminal, logs out, and is refused unpublish and
  republication. The installed pnpm client publishes and installs, and its
  cached metadata is revalidated with a 304.

The publish-gate tests cover each violation kind against real tarballs built
in the tests, and (outside the enrolled set, because they carry fixtures) the
real published tarballs of semiotic-eavt-services-section 0.1.4 and 0.1.5 and
kalshi-services-section 0.1.31. The packed-package regression installs the
actual package tarball, with its installed dependency closure, into an empty
offline consumer, and checks the shipped receiving tests and the
`registry-uplink-prune` script. Fixtures, credentials, and consumers are
disposable local data; no test publishes to an external registry.

A source test pass is not live receiving. The installed service must separately
demonstrate the same protocol and artifact/consumer conditions through the
authorized release route before a deployment change can be claimed.
