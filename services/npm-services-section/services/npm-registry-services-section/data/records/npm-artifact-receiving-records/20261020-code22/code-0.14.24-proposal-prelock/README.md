# npm workspace publication service

The retained release interfaces use the existing
[canonical version validation contract](specifications/canonical-version-validation.md).

The public `./source-build-qualification` entrance exports
`sourcePublicationBuildRecipe` and `qualifySourcePublicationBuild`. It qualifies
an existing direct TypeScript/native Node test producer from exact caller-held
Git entries and the authored npm lock, using a credential-stripped Linux worker.
It returns construction evidence and preserves source bytes; it grants no
publication authority. The existing `publish-package --qualify-build` worker
serves only the original install/build/test stages and refuses combinations with
apply, bump, pin and repin. The full gate retains its authenticated Step0.
See the [source contract](specifications/repository-aware-source-members.md#source-construction-and-publisher-identity-are-separate-boundaries)
for supported compiler/configuration inputs, bounds, adverse cases and custody.

This service prepares exact npm artifacts, publishes them to the configured
registry and receives locked installations from that registry.

`packRegistryCarrier({ directory, manifest, destination, npmEnvironment })`,
exported from `./source-registry-closure`, is the common archive maker for an
already selected carrier. The source-closure packer and GitHub's landed-package
publisher both use it. It runs npm with lifecycles disabled, stores the actual
SHA-512-addressed archive, and applies the same export and credential-content
guards to its actual files. It leaves the caller's source directory available
and returns an immutable artifact locator, integrity and any refusal. Registry
publication and credential ownership stay with the calling original service.

### Declared receiving programs are required carrier members

The motivating consumer is MetroPlat PR75 at
`c1b20624894e726d6009cbe77bbfd841eae008e8`: its manifest declared 13
`receivingTests`, but npm packed only 10. Passing source tests and carrying all
public exports did not discharge the missing installed receiving programs.

Requirement: any authored `receivingTests` declaration must be valid and every
declared file must occur in the actual package carrier before publication.
No declaration means no receiving enrollment. An explicit declaration follows
the existing receiver's nonempty, unique, explicit relative-file grammar:
[Guix receiving contract at c54c6506](https://github.com/red-cup-engineering/guix-machine-release-service/blob/c54c65064e678963c00e36edcded771ac473988c/scripts/package-receiving.mjs#L26-L33),
blob `1257b94b4b5523e02df0300129b34c174238cdfa`. Each slash-delimited segment
contains only ASCII letters, digits, dot, underscore or hyphen and is neither
`.` nor `..`. Null, command objects/strings, empty arrays, duplicate paths,
globs, absolute paths and malformed segments refuse. The publisher does not
select which packages a machine receives, interpret commands or run these
programs; that remains the receiver's responsibility.

Architectural allocation: `carrierSurfaceViolations` owns this additional
carrier obligation, separately from `surfaceDeclarations` and
`packageExportSurfacePaths`. Receiving files never become public exports or
change export-based SemVer classification. Its existing immutable result array
adds `{kind:"invalid-receiving-tests",field:"receivingTests"}` for a malformed
declaration, or `{kind:"missing-receiving-test",field:"receivingTests",target}`
for each missing literal path in declaration order. Existing export/bin/main
results remain unchanged. Npm owns file allowlists, ignore rules and negation;
an existing source file excluded from the measured carrier is still missing.
Declaration-only JSNode publication-status remains an advisory source check,
not this actual-carrier acceptance boundary.

Path representation is explicit at that boundary. The optional third
argument `{pathFormat:"package-relative"}` selects literal names, including a
real first directory named `package`. The shared archive maker removes only
the actual outer tar container; the isolated verifier and exact-source assay
already receive relative names from npm. All three callers select this mode.
Unknown formats refuse. Omitting the option preserves the legacy API's
prefix-normalizing behavior for existing prefixed/mixed callers. Manifest
main/bin/export targets are always package-relative and never lose a literal
`package/` directory. Do not union both representations: a carried `test.mjs`
cannot discharge `package/test.mjs`, nor the reverse.

The shared archive maker and isolated verifier already consume this predicate.
The direct `publish-package` gate now uses the same archive maker at Step4,
including first-publication plans, rather than only checking a previous export
diff. After the existing Step5 version operation, Step6 reads the final manifest,
checks the selected name/version, packs and qualifies it again, then supplies
that exact content-addressed archive to `npmPublicationArguments`'s existing
artifact input. This closes the gap between checking files and publishing a
different selection. Both packs disable lifecycles; they do not rerun the
already-required build/tests or introduce a new prepack hook. The original
identity/liveness, version occupancy, registry, tag, provenance, receipt and
repin gates remain in force. Source-only qualification still stops at Steps1/2.

Malformed or omitted receiving members refuse before publication. Step4 refusal
does not bump a version; a Step6 refusal after a successful Step5 retains that
already-performed version change under the original phase contract. The result
retains completed steps and any qualified publication archive's integrity,
SHA-1 and size; scratch cleanup does not imply publication or erase the phase
result. A captured publication refusal is not registry receiving.

Verification derives from the original pure carrier cases, actual offline npm
archives (excluded, negated and intact receiving files), and the original gate's
loopback fixture with real install/build/tests/pack/version and a deliberately
intercepted publication. The captured post-bump archive must match the reported
integrity and selected version. Ordinary exports, bins, no-declaration packages,
nonreceiving source qualification and retained rejected archives are controls.
These tests establish mechanical packaging only, not execution of receiving
programs, publication, installed provider compatibility or machine acceptance.

`carrierSourceIncludes` in `./carrier-surface` supplies file selection and
explicit directory reachability from npm `files`, `main`, `bin` and `exports`.
Git's pinned-source reader uses the directory selection to enter only declared
library locations at their selected commits. Npm remains the final packlist
owner; a README basename glob does not acquire unrelated source directories.

`pack-source-registry-closure` packs in a private directory, verifies the
actual SHA-512 and retains the artifact at `sha512/<digest>.tgz` without
replacing an existing artifact. Repacking a package never changes bytes named
by an earlier result. Source and package/version filenames are not immutable
artifact custody.

`publish-source-registry-closure INPUT RECEIVING OUTPUT [TAG]` publishes the
fixed artifacts and downloads each release back to check its integrity.
Use an explicit tag such as `candidate` when assembling a release or publishing
an older required dependency; this leaves `latest` alone. Install and receive
the completed exact closure before promoting its intended default versions.
These operations do not run package suites or substitute local dependencies.

`planSourceRegistryClosure` accepts an explicit `publishNames` list to make
existing providers publication roots even when their consumers already name
exact registry versions. Source locators establish authoring custody; installed
suppliers still come from the registry.

Source and released manifests require exact registry versions. Local dependency
protocols are refused before construction or publication.
An explicitly authored development root-self QA context uses the existing source
binding conductor without changing those declarations. Its typed source evidence
is separate from registry, packed, publication and runtime receiving; see
[the source QA contract](specifications/development-root-self-source-qa.md). The selected root is
one independent package; its neighbors are never implicit release inputs.
A consumer may be selected by its package directory or the explicit
`package.json` file; both resolve to the **same original source identity**.
The source-registry closure planner normalizes these coordinates *once* before
looking up consumers, rather than fabricating a missing-consumer refusal after
having read an admitted directory's manifest.
The shipped `pin-exact-dependencies` command reads each consumer's **effective
npm configuration through npm itself** before querying package metadata. This
is the native ownership of house/third-party scopes; private registrar scopes
(`@koios-news`, `@harmonious-union`, `@turntide-islands`, etc.) are
not guessed from a historical hardcoded subset. Only per-scope registry URLs
are retained in memory; credentials and other npm configuration are never
written to migration output. Registry authority is HTTPS or explicitly
configured loopback, and unavailable releases refuse an entire package.

`pin-exact-dependencies --package <dir> --migrate-workspace --plan` can propose
exact `latest` identities and artifact integrity from the canonical registry for
legacy `workspace:*` declarations. Inspect provider compatibility before applying.
An absent or unread release refuses that package's entire write; it does not
authorize a checkout fallback. This implements the Leader's 2026-10-15 correction:
"WE DO NOT WANT TO BE USING WORKSPACE SHIT LIKE THIS WE HAVE A REGISTRY!?!??".

### Consumer policy during explicit pin preparation

`publish-package --pin NAME@VERSION --pin-only --apply` refreshes the
consumer through its own package manager in its original project directory.
Its isolated metadata/store cache changes cache custody only: the command
must preserve the consumer's effective dependency-age policy. Exact pins,
first-party names and newly published artifacts do not authorize a zero-age
setting or an exclusion. Both registry and standing-cache commands leave
policy resolution to the native package manager. A policy refusal is not a
successful pin receipt; preparation may already have changed the manifest,
so inspect retained source state before continuing.

The generic install-command projection is covered in
`test/package-manager.test.mjs`. Native PNPM selection evidence is owned by
the existing PNPM section in `computer-code-engineering-services-section`,
whose controlled publication-command assay checks immature refusal, eligible
lock selection and unchanged project policy. These source checks do not
install FeltOS or admit the separate proposed first-party eligibility design.

### Exact candidate selection before consumer preparation

The existing `pin-exact-dependencies` owner now has a source-level
`--selection reviewed.json` path for one explicitly named consumer. It
prepares reviewed immutable versions **without reading or changing dist-tags**.
This is executable source, not yet a published or installed release: the native
package suite, registry custody, lock preparation and downstream receiving
remain separate. Selecting a version is not authority to declare a new
requirement, approve a release, or mark a consumer installed.

The useful requirement is to prepare one coherent independent consumer from
reviewed immutable registry releases without promoting a default channel merely
to make preparation succeed. A reachable `candidate` release with no `latest`
is not an absent artifact. A channel is a discovery/promotion policy, not an
immutable selection identity or permission to bypass release-age policy.

Before choosing an operation, bind the original consumer commit, manifest blob,
any existing lock blob, publication-owner revision, effective npm scope
authorities and retained refusal. Receive the selected artifacts and directly
used interfaces independently; a version metadata response alone is not carrier
or compatibility acceptance. Assess the complete consumer and its intended
publication entrance, not just the first refused dependency.

Existing entrances have different contracts:

| Entrance | Selection and limit |
| --- | --- |
| `pin-exact-dependencies --migrate-workspace --plan` | Without `--selection`, retains the original exact `latest`-based plan. With `--selection reviewed.json`, selects named immutable versions from a complete reviewed direct-dependency set, without requiring or modifying any tag. `--apply` requires real SHA512 artifact receiving first and refuses stale native lock resolution. |
| `publish-package --pin NAME@VERSION --pin-only --apply` | Accepts versions, but first wears the workspace publication manifest. A standalone consumer with `workspace:*` and no workspace refuses before pins. Each pin refreshes installation, followed by tests and a receipt; this is not a plan-only or all-pins admission substitute. |
| `reconcile-package-locks-from-releases` | Receives explicit `{manifest, artifactPath, integrity}` carriers for transactional npm lock reconciliation; does not select the consumer manifest or produce a PNPM lock. |
| `plan-source-registry-closure` | Plans new unoccupied publication versions; not a selector for already-received artifacts. Do not duplicate a release to evade channel selection. |
| `receive-source-registry-consumers` | Requires the exact consumer manifest and already-admitted frozen PNPM lock. It must not generate selection or locks during receiving. |

The supported new command form is
`pin-exact-dependencies --package /path/to/consumer --migrate-workspace
--selection /path/to/reviewed.json --plan`, followed by the same command with
`--apply --artifact-directory /path/to/received-artifacts` only after the complete immutable selection has been approved.
The selection input has this concrete shape (example identities and digest
are placeholders, NOT received releases):

```json
{
  "kind": "npm-workspace-publication.reviewed-selection.v1",
  "consumer": {
    "name": "@example/consumer",
    "version": "1.0.0",
    "manifestSha256": "<actual SHA256 hex of exact package.json bytes>"
  },
  "releases": [
    {
      "name": "@example/provider",
      "version": "0.1.0",
      "registry": "https://registry.example.org/",
      "tarball": "https://registry.example.org/example-provider-0.1.0.tgz",
      "integrity": "<actual npm dist.integrity sha512-...>",
      "evidence": ["<actual receiving/review locator>"]
    }
  ]
}
```

One selection must cover **every direct dependency** in the exact named consumer
manifest. Every selected name/version/integrity/tarball is checked against its
authoritative registry's version record, not a mutable dist-tag. This does
not waive semver ranges or permit unreviewed git/file/link references.
`--plan` never downloads or changes the manifest. `--apply` downloads each
selected artifact through the original registry receiving implementation,
reads back actual SHA-512-matching bytes, and retains the complete selected
artifact set in a new directory under the explicit caller-owned artifact
custody root. The JSON receipt returns their exact paths and integrities
for the original native lock/consumer receiver. Each entry in
`packages[0].receivedArtifacts` carries `artifactDownloaded: true` only
after a SHA512 readback and can be supplied unchanged as the `releases` input
to the existing `receive-source-registry-consumers` operation.
That consumer still requires its separately fabricated committed PNPM lock,
admitted release-age policy and a qualified installed runtime; this receipt
does not authorize age exceptions, package publication, or deployment.
A refusal removes partial artifacts and leaves the original consumer unchanged. It does not hand-edit a native lock
whose already-resolved version/integrity differs, and re-reads the exact
consumer manifest digest immediately before writing. A completed pin
manifest is **not** a PNPM lock, frozen installation, compatibility assay,
host deployment or consumer acceptance; those still require their owners.

Selection must reject unknown or duplicate dependency entries, conflicting
versions, wrong identities or registry authority, integrity mismatch, unread
metadata, incomplete evidence and incompatible consumer bindings. Distinguish
unread metadata, absent exact release, absent default tag, policy refusal and
source drift; none is successful receiving. Preserve the original failed plan
and actual exit/result. Do not apply successful rows from a refused package,
silently fall back to `latest`, workspace checkouts or caches, generate a new
release, or retry an unchanged refusal.

Before applying a fully admitted plan, re-read the exact consumer head and
manifest/lock bytes and verify that the reviewed owner implementation and
selection still match. Any drift returns the whole consumer to assessment,
without overwriting concurrent changes. All selected artifacts and dependency
rows must pass before any manifest write; retain before/after identities and
the exact operation result. A write failure must remain an explicit failed or
partial outcome with original custody preserved, never a successful receipt.
Review and integrate only the exact documentation or implementation head
received by the reviewer; a later head requires renewed review.

PNPM preparation remains with the existing Code work coordinated in
[the original release obligation](https://github.com/561-group/bare-cedar-fog/issues/765#issuecomment-6205988370)
and [native frozen receiving admission](https://github.com/red-cup-engineering/npm-workspace-publication-service/pull/2).
Receive that writer's actual source and completion record before dependent work;
do not launch a second lock writer. A missing current writer identity is a
coordination prerequisite, not permission to infer that none exists. An npm
lock, the site's independent build workspace, or a hand-edited lock cannot
substitute for the original consumer's registry-only PNPM lock. Current
`receiveSourceRegistryConsumers` constructs per-release
`minimumReleaseAgeExclude` arguments; when the work prohibits automatic age
exceptions, that route is not admitted unchanged. Resolve the policy through
its existing owner or receive natural eligibility through an admitted operation;
do not borrow another consumer's exception or retry the same policy failure.

#### First use: Koios candidate-only refusal, 2026-10-16

This procedure revision is grounded in the prior README blob
`8ce3733ca0260afbd136d4e39172804d9b360940`, read at owner commit
`31175f8d26049558f00faeae39e54c0057891662` (last README change
`735118dafb1479e65270866eaa4580be8a94a14c`). Its first substantive use is
assessment of the [retained Koios native plan](https://github.com/causeway-services/koios.news/issues/16#issuecomment-6225309639),
not another execution of the refused command.

Consumer `causeway-services/koios-news@730247d661e2852e17cb26b7450f0156d06f3ca3`
has manifest blob `a41d9d0bb8f33e067930befe7de284dd844b81db` and no root lock.
Installed owner 0.14.2 on native Node 24.18.0 returned exit 1, `ok=false`,
`applied=false`, two refusals and 21 unapplied proposals. Preserved plan SHA-256:
`48fb76b16f98f4ec7382b68b16bd03c54448770ffb4a67d059d5f14e7350f79f`.
Both `@causeway-services/koios-news-site@0.1.0` and
`@red-cup-engineering/content-mill-newsroom-services-section@0.1.0` exist under
`candidate`, without `latest`. Thus the observed failure is the planner's
selection-contract gap, not registry absence. The [site artifact was independently received](https://github.com/causeway-services/koios.news/issues/16#issuecomment-6225259794)
with corrected rendering bytes; newsroom remains metadata-only evidence.
The explicit-pin route's workspace precondition and the npm/PNPM distinction
above prevent substitution. The clean consumer and refused plan are preserved.

The enabling event for Koios preparation is independent receiving of this
new owner implementation, complete exact candidate artifacts (including
the newsroom's actual carrier/interfaces), followed by the existing PNPM
owner's committed lock and policy-compatible frozen receiving. The selected
consumer has **not** been prepared or installed by this source change. The eventual
consumer is Koios's self-hosted `site.yml` and `admitted-website.mjs`, which use
the sealed admitted artifact, exact owning revision and content/data inputs.
The independent site provider need not be added to the core World lock.
Qualified construction, separately authorized publication and bounded public
receiving still follow. Issue 16 remains open; mailbox delivery and editorial
acknowledgement remain not-assayed. This assessment changes no executable code,
tags, locks, runtime, host or public service.

## Release identities and npm channels

Stable carriers use `MAJOR.MINOR.PATCH` and default to the npm dist-tag
`latest`. Development carriers use `NEXT_BASE-<tag>.N`; a new channel begins at
`.0` and advances numerically as immutable identities become occupied. For
example, work toward `1.4.0` begins at `1.4.0-dev.0`, may advance through the
`dev` channel, and can move to `1.4.0-rc.0` without altering an earlier carrier.
An explicitly selected prerelease wave defaults its channel to `dev`; stable
release behavior remains unchanged and takes no development channel.

```bash
prepare-release-wave --release-kind prerelease --bump minor --apply
publish-workspace-tiers --tag dev --preflight
publish-workspace-tiers --tag dev --execute
```

Promotion is a stable wave over manifests already carrying a prerelease
identity. It requires the exact prerelease to exist in the authoritative
registry plus an `org.emsenn.npm-promotion-admissions.v1` document whose package
entry names that prerelease, an outcome of `carrier-verified`, and its retained
verification receipt. It removes the prerelease suffix only when the
corresponding stable base is unoccupied. The publisher forwards an explicit
requested npm tag; otherwise stable versions default to `latest` and
prereleases default to their named channel. Stable packages cannot pin prerelease dependencies; prerelease
consumers may pin them exactly. Major, minor, or patch selection remains an
authorized compatibility decision supplied to the planner, not a guess made
from changed filenames.

The science definition lives at
`science-services-section/.../software-services-section/services/versioning-services-section/content/text/glossary/terms/semantic-version.md`.
Operational duties live at
`operations-services-section/.../enterprise-office-services-section/content/text/documents/articles/specifications/semantic-release-operation.md`.

Prepare providers without installing local substitutes. The final packlist
must carry every effective root entrypoint, concrete export, wildcard-export
witness and bin promised by the manifest. Inspect the completed artifacts with
`audit-registry-carrier-imports` against their actual suppliers, publish the
required exact releases, then receive the consumer through the registry.
Package suites do not establish the receiving program's useful operation.

The module-graph assay parses every packed JavaScript member with exact
the JSNode engine, follows ESM, CommonJS `require`, literal dynamic imports,
package `imports`, and package self-references, and separately marks the graph
reachable from exports, effective main, bins, and literal `node <path>` package
scripts. Relative requests must remain inside the carrier, bare requests must
be declared, runtime edges may not depend only on development dependencies,
and computed runtime requests fail closed.

`receive-source-registry-consumers` performs a frozen PNPM installation from
the committed lock of each explicitly selected independent consumer. Its input
can bind an exact executable through `pnpm` and leading arguments through
`pnpmArguments`, including a pinned Node executable and PNPM module. Managed
receiving therefore uses the same supplied toolchain as the interactive caller.

Receiving installs one consumer at a time per process: concurrent calls, such
as a driver that shards consumers, queue behind each other. Before each
consumer it reads the Linux pressure-stall figure `some avg10` from the
process's own cgroup v2 `memory.pressure` (falling back to
`/proc/pressure/memory`) and waits while it is at or above
`memoryPressureCeiling` (default 10 percent). A cgroup held at `memory.high`
otherwise turns parallel installs into reclaim thrash that stalls every other
process in it, so the installation yields to the cgroup's budget instead of
raising it. If the stall does not fall below the ceiling within
`admissionTimeout` (default 30 minutes), the consumer is refused with reason
`memory-pressure` and a later run can receive it.

The global manifest preflight checks every selected package before any carrier
is published. When a selected package has a `package-lock.json`, three copies of
each direct dependency assertion must agree:

1. the exact version in `package.json`;
2. the root specification in `package-lock.json` `packages[""]`; and
3. the selected version in `packages["node_modules/<dependency>"]`.

This third comparison catches a common partial-update failure in which the
manifest and lock root both advertise a new internal version while the lock's
actual install graph still selects the old carrier. Refusals are emitted in the
publication command's JSON result under `failures[].evidence.violations`, so a
workflow can report every stale assertion in one pass without scraping prose.
An explicitly optional peer may be absent; if npm selected it, its version must
still equal the declared peer contract.

`audit-semantic-version-policy` is the bounded, JSON-emitting form of the same
front-door rule. It checks only the supplied root (and optional package names or
name prefix), exempts descriptive section metadata, and refuses carrier
manifests without a stable `X.Y.Z` or development `X.Y.Z-tag.N` identity. The
publication preflight runs that policy only over its selected root/package set;
it does not turn the repository into one implicit release workspace.

Use `--summary` for operational observation of a large package estate. The
summary retains scanned, exempt, compliant, finding, and violation counts;
groups violations by exact reason; carries only a bounded finding sample; and
commits the complete finding set by an `ni:///sha-256;...` digest. The live
workspace scan excludes retained `data/captures` and package `test/fixtures`
along with established legacy/archive boundaries. Repository-inclusive
forensics remain a separate scan and are not evidence of current package
compliance.

Callers with semantic runtime requirements can use
`dependencyContractViolations(manifest, lock, { requiredDependencies })`.
The aggregate also binds the lock root's own `name` and `version` to the
manifest, so a regenerated dependency graph cannot retain a previous carrier
identity.
`requiredDependencies` contains names, never duplicated versions: the manifest
owns each version assertion and the shared lock law proves its resolution.

The same law walks every exact runtime, optional, and peer edge in the complete
lock graph using Node's nearest-ancestor `node_modules` resolution order. A
hoisted or nested selection is admitted only at the declared version; missing
and stale transitive selections are reported together with their source and
resolved lock locations.

The semantic graph assay dereferences npm filesystem links according to their
physical target and ancestor resolution, but the publication contract then
refuses every link selection. A sovereign carrier must remain reproducible
without a neighboring checkout whose mutable bytes are outside the lock.

`verify-exact-dependencies --check-locks` applies the same invariant during a
repository assay. Packages that deliberately have no lock remain lockless; a
present lock is treated as an authoritative assertion and must be internally
coherent.

## Runtime provider catalogs

`form-node-runtime-provider-catalog` closes the reachable runtime graph for one
or more explicitly declared source entry packages. `sourceRoots` is an optional,
non-empty array of package directory paths, absolute or relative to
`workspaceRoot`. When omitted, only `workspaceRoot` is read. Each supplied root
must contain a named, versioned package; duplicate canonical directories
(including symlink aliases) refuse. No recursive discovery or neighboring
package fallback occurs. Each entry's npm v3
`package-lock.json` is its resolution authority. Exact matching workspace
identities become source providers. Every other required dependency is
resolved from its requiring package location with npm's ancestor/link law; the
selected exact version must satisfy the manifest range and carry a
integrity plus same-authority registry address. The registry's matching
`dist.integrity` and tarball are then downloaded and verified without invoking
npm or choosing a registry-latest version.
Development-only and unreachable workspace packages are not projected into the
runtime closure. Missing optional dependencies remain absent. Missing, stale,
or non-satisfying lock selections, foreign artifact authorities, identity
drift, integrity drift, duplicate workspace identities, and multiple selected
versions of one package are refused.

```bash
form-node-runtime-provider-catalog \
  --workspace /committed/source \
  --source-roots /admission/source-package-roots.json \
  --entries /admission/runtime-entry-roots.json \
  --registry https://us-central1-npm.pkg.dev/project/repository/ \
  --output /ephemeral/runtime-provider-admission
```

The optional source-roots file is an array of directory paths, for example
`["daily", "shared-provider"]`; it declares source custody and does not waive
registry, lock, integrity, lifecycle or dependency-age policy. The entry file
is an array of `{ "id": "daily", "name": "@scope/root" }`
claims. The resulting `NodeRuntimeProviderCatalog` contains one independent
admission per entry, each with source directories and immutable
`{name, version, integrity, tarballPath}` providers. It also binds each
requiring package/location, requested range, selected lock location, exact
version, integrity, and resolved registry address so the materializer can
re-attest the selection without consulting a registry. Different entries may
lawfully select different exact versions, while a single entry still has one
provider singleton per package name. The catalog can be passed directly to
`materialize-node-runtime-release --providers`. Registry
credentials are read only from the existing short-lived `NODE_AUTH_TOKEN`
authority and are never written into the catalog.

## Owner namespace debt

`audit-owner-package-namespaces --services-root <services-directory>` reads the
same live manifest graph as publication tooling and emits a deterministic JSON
ledger for the current owner law: engineering packages use
`@red-cup-engineering`, science packages use `@lenticule-science`, and
operations packages use `@coesite-operations`. The ledger names exact manifest
consumers and proposed-name collisions. It does not rename packages: changing
an npm identity also requires coordinated source imports, lockfiles, registry
publication, and consumer migration.

## Native registry consumer receipt: no install-time lock generation

The Code owner has two different lock families, and **they must not be conflated**.
`reconcile-package-locks-from-releases` reconciles npm `package-lock.json`
through the existing npm registry snapshot and source read operation. That
does **not** generate a PNPM lock or authorize a runtime install.

The existing `receive-source-registry-consumers` **admits every selected consumer and frozen lock before installing any application**: a later missing lock or wrong package refuses the whole wave without partially installing earlier members. It takes each explicitly
selected, exact-version PNPM application package with its **already admitted
`pnpm-lock.yaml`**, checks that it contains no workspace/file/link source
substitution, and invokes only the original `pnpm install --ignore-workspace
--ignore-scripts --frozen-lockfile` operation. After installation it reads
back both original package and lock bytes; a missing lock or mutation refuses
the receiver. The previous `--lockfile-only --no-frozen-lockfile` preparation
in this *receiving* operation was removed because it let the executing
machine author a different graph before returning a successful receipt.
Lock admission and version reconciliation belong in original upstream Code
procedures **before** this receiver; no LAGOON, Guix or Group-side resolver
is allowed to replace them. Successful package receiving is not a Guix
profile, installed actor or external market outcome.

## Transactional package-lock reconciliation

`reconcile-package-locks` accepts an explicit JSON array of `{id, path}`
package roots. It copies the complete declared topology into an isolated Linux
temporary workspace, pins Node 24.19.0 and npm 11.17.0, and gives npm only the
declared HTTPS registry plus the short-lived `NODE_AUTH_TOKEN`. Every root must
produce one package-lock v3, pass the shared dependency and registry-authority
policy, complete `npm ci`, and complete its declared
`verify` lifecycle before any repository lock is written. Source fingerprints
are checked at the prewrite barrier; one refusal or drift leaves all repository
locks unchanged. Successful locks are staged beside their targets and renamed
only after the all-roots barrier.

`reconcile-package-locks-from-releases` is the carrier-backed form of the same
transaction. It accepts only explicit `{manifest, artifactPath, integrity}`
release admissions, calls the snapshot assembly service, exposes that closed
snapshot through the filesystem-only registry read service on loopback, and
then calls `reconcilePackageLocks` with the durable HTTPS registry as the lock
authority. The temporary read face has no upstream fallback; generated
loopback coordinates become npm artifact coordinates before
validation, `npm ci`, or the repository write barrier.

```bash
reconcile-package-locks \
  --workspace /committed/source \
  --roots /admission/package-roots.json \
  --registry https://us-central1-npm.pkg.dev/project/repository/
```

### Receive one packed artifact

The original no-stage inventory model remains a version-1 observation contract;
its successful inventory comparison is not byte or native-installation proof.

The existing `receive-packed-registry-artifact compare INPUT [OUTPUT]` entrance
uses `admitArtifactRelease` from `./artifact-release` to distinguish exact
source/archive receiving from actual native installed-file/bin receiving.
It performs only the bounded comparison of original native observations;
the [member receiving contract](specifications/artifact-member-receiving.md)
defines byte, path, executable-intent, manifest-stamp and native-context laws.
The registered `receive-packed-registry-artifact receive INPUT [OUTPUT]` performs
native source/archive receiving. Input selects `registry`, exact Git `source`
(repository, commit and optional package scope), `sourceDirectory`, an explicit
private `scratchDirectory`, archive path/SHA512, finite `limits`, and optional
existing `publisher` gitHead stamp. It reads the source through the selected Git
provider, verifies the staged original inputs, asks native NPM for its packlist
with lifecycle scripts disabled, then reads the archive through declared `tar`.
Native ignore precedence narrows the source allowance. Unsupported TAR extensions,
ambiguous decoded names, links and incomplete parser accounting remain unread;
no extraction or package evaluation establishes membership. Output is exclusive.
This entrance cannot assert prepared manifests, build products or installation.

Networking publishers use `preparePublicationCarrierManifest` from
`./source-registry-closure` and `planLandedPackageRelease` from `./release-wave`
for their original occupied-version/history selection. The native receiver
recomputes their finite version/missing-repository preparation and retains the
original Git witness separately. The pure model's sole gitHead stamp law remains
unchanged; preparation grants no publication authority.

The original `receiveSourceRegistryConsumers` can receive selected independently
downloaded direct dependencies through `artifactReceiving`, with an explicit
`artifactReceiptDirectory`. Its actual successful frozen PNPM operation, complete
unchanged inputs and original supplier/bin observations own native installation
proof, before replacing prior node_modules. Source/archive reading alone never
claims that effect. Package-specific frozen receiving still uses its own actual
lock; repositories in general acquire no workspace or lockfile requirement.

The original registry observation/publication modes below remain unchanged.

`receive-packed-registry-artifact before|after` reads `PACKAGE`, `VERSION`,
`PACKAGE_ARCHIVE` and `REGISTRY` from the environment. pnpm receives authentication
through its configured environment or user configuration; the command carries
no credential in its arguments. The before observation permits publication only
when the exact metadata read establishes absence. An occupied identity must match
the packed SHA-512 (or its legacy SHA-1 when no integrity is advertised); the after
observation requires those same bytes. This receives registry metadata about a
packed artifact, not installed closure or machine promotion. Shared CI hires this
declared bin from the mounted publication owner.

Registry metadata readers treat only HTTP 404 as absence. Other HTTP failures
refuse the read, malformed identities are refused, and transport failure stays
unread. Recovery refuses publication when its prior observation is unread.

## Portable registry consumer production

Frozen receiving retains the original package-local `pnpm-workspace.yaml`
when present, including its dependency overrides. The isolated install reads
that same policy; its digest is retained beside the manifest and lock digests.
Portable construction requires those policy bytes in both source and packed
consumer. Omitting native workspace configuration cannot qualify a lock that
was resolved under its overrides. This boundary was exposed by the shared
runtime's GitHub 0.1.14 receiving on 2026-10-17.

`produce-registry-runtime CONSUMER RECEIVING RUNTIME RESULT` produces the runtime
that LAGOON receives. It requires this owner's successful frozen consumer receipt,
checks its manifest and lock digests before and after construction, packs the
original consumer through Code's bounded publication carrier staging and npm,
and retains the native installed PNPM topology. npm never scans the installed
dependency tree to rediscover the root package's files.
The destination must be absent and independent of the source. Links leaving the
completed runtime and nonregular carriers refuse construction. No source-provider
substitution, dependency resolution, generation or application execution occurs.
This closes the missing producer encountered by the 2026-10-16 live GitHub
Semioverse deployment; its operating requirement and ordered fabrication plan
remain at GitHub Engineering's resource-reconciliation specification.

## Static installed interface conformance

`auditInstalledCarrierBindings` reads explicit relative entrances under one absolute installed root and follows the actual native ESM provider bindings. Run Node with `--experimental-import-meta-resolve`; the operation checks that parent-bound resolution is active. It parses with the shared JSNode syntax supplier, reads named imports/re-exports and star providers without evaluating application modules, and returns source digests plus all observed missing bindings together. Explicit module and byte bounds make incomplete coverage a separate result.

The default scope covers Engineering and Science ESM providers. Public packages, CommonJS, computed imports and non-file providers remain explicit coverage boundaries. The result is source-interface evidence, preceding catalogue generation; it does not establish operational receiving or resolve arbitrary star-export ambiguity.

Owned disposable frozen installations can be transferred into a portable runtime
with `produceRegistryRuntime({..., transferInstallation: true})` or the existing
bin’s `--transfer-installation` flag. The native installation moves by an atomic
same-filesystem rename, then receives the same declaration and confinement
judgment. A refusal restores it to its source unless a concurrent replacement
prevents safe rollback. Ordinary production retains copy semantics. A successful
transfer receipt says `installationTransferred: true`; the source installation
has been consumed and must not be used for a later production.

A runnable consumer may declare `registryConsumption.nodeEntrances` as its finite
list of release-relative Node programs. The producer reads their complete
reachable static ESM imports through Node’s native resolver against the received
installation before copying or transferring it. Missing provider subpaths refuse
fabrication and retain the full findings in the unpromoted output. Application
code is never evaluated. Untyped `.js` files use Node's syntax parsers: parse
with the CommonJS wrapper parameters first, then read static ESM links when
that parse refuses. This preserves CommonJS (including top-level return and
hashbangs), while inspecting static imports, exports, `import.meta`, top-level
await and lexical redeclarations of wrapper parameters in ambiguous files.
Explicit `type: commonjs` and `.cjs` remain opaque. Invalid source refuses;
neither parser runs the application. CommonJS internals and dynamic imports
remain explicit limits; declare spawned child programs as entrances too.
