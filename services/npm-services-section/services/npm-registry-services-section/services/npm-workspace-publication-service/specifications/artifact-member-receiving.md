# Artifact member receiving

`admitArtifactRelease` keeps its existing inventory-release input and result unchanged. Two
explicit stages compare native observations about one immutable release:
`source-archive` and `archive-installed`. These are partial receiving stages.
An archive result never claims that a package was installed. The original
no-stage version-1 interface compares supplied manifest/path-inventory/import-row
observations; it is retained for compatibility, not upgraded to byte, native
installation, complete import execution or publication proof.

The model performs no Git, TAR, registry, filesystem or package-manager effects.
The original native readers and installers own those effects and their source,
artifact, credential, capacity, timeout and provider admission. The model does
not authenticate a caller's observations or confer publication authority.
Keep their actual raw receipts and bind the facts supplied here to them.

Both stages require `registry`, `limits: {members, bytes}` and
`archive: {integrity, manifestText, members}`. Integrity is exact SHA512;
the 64-byte digest must decode and re-encode to the exact canonical padded Base64,
so pad-bit aliases and wrong lengths refuse. manifestText is the actual UTF8
package.json representation, bound by its exact UTF8 byte length and digest.
The native reader must decode original bytes losslessly; replacement decoding
cannot stand in for those bytes. Each member is
`{path, kind: "file", bytes, sha256, mode}`, with a literal package-relative
POSIX path, byte length, SHA256 hex digest and numeric permission bits.
The member carrying package.json must match manifestText's actual digest and
length. Duplicate, escaping, absolute, nonregular/link, excess-count, excess-byte
and special-permission members refuse. Control characters in paths, unknown
fields, wrong-stage evidence and mixed raw-Git/native mode fields refuse in the
new partial-stage contract. Adapters retain original Git mode/blob evidence
before projecting executable intent into the numeric source-member mode.
Legacy no-stage inputs retain their original contract. A real directory named `package/`
is not stripped as though it were the TAR container.

For `source-archive`, add `source: {repository, commit, manifestText, members}`
from the exact received source and the selected source members. Git adapters
retain the original Git modes/blob IDs and project regular-file permissions
to numeric mode values. Every selected source member must be present once in
the archive; payload and executable intent must match. Declaring a bin does
not permit changing executable intent at this stage.

An explicitly received publisher stamp may be supplied as
`publisher: {gitHead, format: "json-2-newline"}`. The head must equal the
source commit and archived gitHead. This projection is exactly
`JSON.stringify({...sourceManifest, gitHead}, null, 2) + "\n"`.
Only that exact representation is admitted; wrong stamp, changed version,
extra field or another serialization refuses. Original source and projected
manifest digests are retained separately.

For `archive-installed`, add `installed: {manifestText, members}` and an
actual `installation` context:

- `kind: "native-package-installation"`, status 0, platform `linux`;
- manager name `npm` or `pnpm`, exact version and entrySHA256;
- actual native operation requestSHA256, retained receipt locator and receiptSHA256;
- original consumer manifestSHA256 and frozen lockSHA256;
- installedManifestSHA256 for the released package, separate from its consumer;
- exact artifactIntegrity, package and version;
- actual registered bins as `{name, target, registered: true, targetSHA256}`;
  the received target bytes must equal the installed member's digest. Duplicate
  or foreign registered-bin observations refuse.

A native PNPM manager may be received under the finite
`normalization: "posix-package-files-0644-0755"` context. This records the
observed full modes while admitting only the witnessed regular-file 0644 and
executable-file 0755 projection. It cannot authorize a per-member chmod map.
It permits new executable intent only for a manifest-declared target whose
actual native registered bin is received. Payload changes, undeclared
execute changes, lost executable intent, other normalization, absent/failed/
foreign native evidence and another platform refuse. Existing identical modes
do not require normalization but still require the native installation context.

This read/write distinction follows the actual PNPM 11 CAFS behavior and
received Code 0.14.21 installation: 59 non-bin0600→0644,6 declared-bin0600→0755,
20 declared-bin0755→0755 and 1 non-bin0755→0755, with all 86 payloads equal.
The CAFS reader separates executable intent; new regular files use native
creation permissions, while an existing same-integrity store member may retain
its original mode. A current process umask does not reconstruct that history.
For actual native NPM file-directory consumers, the distinct
`normalization: "npm-file-directory-bin-umask"` context requires manager `npm`,
`operation: "npm-ci-file-directory"`, the actual numeric `umask` (0–0777),
and `normalizationProvider: {path: "bin-links/lib/fix-bin.js", sha256}` from
that manager's received source closure. Its original native receipt binds those
facts. NPM's bin-links primitive chmods registered targets to `0777 & ~umask`;
under a private 0077 umask the result is 0700. Only declared, actually registered
bin targets may receive that exact mode. Non-bin modes must remain equal;
this context cannot normalize all files, invent a chmod map, or permit lost
executable intent or changed payload. The model receives these native facts;
it does not authenticate the manager source or manufacture an installation.
Other native contexts require their own receiving rather than an assumed
cross-platform permission rule.

The existing registered CLI adds
`receive-packed-registry-artifact compare INPUT [OUTPUT]`.
It reads at most 8 MiB of primitive observations with fatal native UTF8 decoding
(no replacement-character equivalence), calls this shared model,
prints the typed result and exits 0/1 for admitted/refused. An optional result
path is written exclusively and never replaced. It does not read registry
credentials, download, extract, install or publish in compare mode.
The original before/after/publish environment-based contract is unchanged.

Native adapters must retain all archive headers and reject unsafe members
before extracting. They must bind installed observations to the actual native
operation, provider, original consumer input projection and registered-bin
target. A declaration, hand chmod or successful extraction is not that effect.
Code, Git and GitHub receiving callers must use the same model/CLI for these
comparisons while preserving their distinct native reader and execution
contracts. Model fixtures alone do not establish migration or actual use.

Original PR24 at ad08ad8ceb3aec4247a760feee848f259eac437e supplies additional
strict-stage/byte-decoding counterexamples. This coherent path preserves those
controls without adopting its compatibility-impacting replacement of the legacy
interface or its narrower644→755-only installation rule. Full version-2 release
refinement/caller migration, SHA256-repository producer inputs and a separately
qualified alternate publisher serialization remain distinct obligations on that
PR and issue22. The native adapters below address the reader/installation gap for
their finite supported contexts; publication and actual caller receiving remain
separate completion conditions. Supplied selection/receipt addresses alone cannot authenticate native
selection or effects. Adapters must bind original independently selected source
members; deriving that set only from output archive names proves correspondence
and can conceal omissions.


## Original native member receiving and prepared carriers

The native source/archive entrance MUST select exact original Git inputs before
reading archive names. Its original Git reader MUST refuse selected nonregular
entries and decode native paths fatally. The native NPM dry-run pack operation,
with lifecycle scripts disabled and bounded output, owns npm selection and ignore
precedence; carrierSourceIncludes is an acquisition allowance, not an exact pack
list. Every independently selected native pack path MUST bind to an exact Git
observation or an actual successful Code build product. Unknown paths refuse.
The original bounded package acquisition allowance MUST include its relevant
native ignore inputs without entering unrelated package/gitlink owners. The source
directory MUST contain only those verified original/prepared inputs and qualified
products; archive-derived membership cannot define completeness.

The Code caller MUST obtain Git reading and command codecs from the existing
dependency-free git-source-reading-service primitive. The Git networking umbrella
may re-export those same implementations, but MUST NOT enter Code's dependency
closure. Source qualification against an umbrella fixture does not establish the
released primitive's identity or the installed Code dependency graph.

The receive CLI MUST supply the primitive's original child-repository resolver.
It may receive only uniquely declared composed Gitlinks beneath the independently
selected package allowance, at their exact recorded commits. Its finite native
context accepts credential-free absolute HTTPS declarations. Absolute native
paths and local file URLs are supported only beneath an acquiring native/file
repository, preserving real local source fixtures without allowing a remote
declaration to select local custody. Relative, SSH and other opaque child locators
remain explicitly unread; Code MUST NOT invent Git-relative or GitHub resolution
rules. The primitive retains the original child repository, commit, raw source
path and blob identity. An unselected or uncomposed Gitlink MUST NOT be acquired.

The original maintained-parser ownership is superseded in the source candidate by
the explicitly reviewed first-party migration below. Native receiving MUST verify the
canonical SHA512, stable descriptor and named-path identity, compressed/expanded
bounds, every interpreted member and diagnostic, one npm package container and
end-of-archive padding before extraction. A per-member PAX header carrying only
`path`, `size` and timestamps is received, its blocks accounted and its `path` the
member's name; any other key, global headers and GNU long names, ambiguous
replacement-character names, links, special entries, duplicates and path aliases
are explicitly unread/refused. This finite context does not change the pure
model's wider supplied-fact interfaces. Native archive observation alone MUST NOT
claim installation, approval, publication or activation.

### First-party framing-owner migration (implemented source candidate)

This amendment is a deliberate same-owner parser-ownership change implemented
in this source candidate, not an exception to the preceding custody/receiving
requirements. Its finite dialect policy remains proposed until reviewed source
acceptance; local qualification does not publish or activate it. Preserve the
[previous owner specification](https://github.com/red-cup-engineering/npm-workspace-publication-service/blob/b420700810e17ce745fa12da9999203544627a1c/specifications/artifact-member-receiving.md)
and [original PR24 design/history](https://github.com/red-cup-engineering/npm-workspace-publication-service/pull/24).
The frozen reviewed design snapshot SHA256 is
`0d46636c45c7b79e2a0113ef05df44680faee1d8e9e8b830cb1efc99ab1e3617`.
Its recipients are the five already-constructed candidate archives, now observed
through the original strict archive API with this first-party framing candidate. Issue22's completed
historical receiving is not reopened. No typed Task/Procedure/Endeavor admission
has been established for this recovery; software lineage does not invent one.

Recover the original scanner from PR24 at
`a40a8655d656c2ffa8d75d90bdf99f700e1a90c3`, retaining its original history,
authorship and counterexamples, and evolve that same scanner in
`src/packed-carrier-archive.mjs`. Do not create a second parser or adopt PR24's
obsolete model/CLI/producer replacement. Its extraction helper and PR36's
separate native-execution/transport work remain outside this amendment.

#### Boundary and outward compatibility

`readRegistryArchiveMembers({path, integrity, limits})` remains the sole public
archive entrance and remains asynchronous. It owns absolute pathname admission,
canonical SHA512, direct regular-file lstat, O_NOFOLLOW, stable descriptor and
named-path device/inode/size/mtimeNs/ctimeNs checks, bounded compressed capture
including growth detection, and SRI over those exact held bytes. Native bounded
gunzip still receives those bytes once. The recovered scanner receives only the
already-held expanded bytes and the existing validated limits: it MUST NOT
reopen a pathname, decompress again, extract, invoke a command, select original
source or authenticate installation. Its module MUST have no extraction-helper
import or effect. Keep one framing implementation; any future legacy inspector
projection must use that same implementation rather than fork it.

The internal byte scanner returns only after full admission:
file members, losslessly decoded manifestText, interpreted header observations,
end offset and complete accounting. The native entrance retains ownership of
the existing archive/observation envelope and compressed/expanded SHA256 values.
Preserve member order, numeric modes, original path fields, file/directory type
labels, `parserEndOffset`, `accountedEndOffset`, `extracted:false` and
`installationClaimed:false`. EOF offsets count through the second 512-byte zero
end block; trailing zero blocks contribute to expandedBytes, not that offset.
Headers retain each admitted filesystem entry; PAX header/body/padding enters
accounting even though it is not a file member. No partial result may escape.

`observation.parser.name` MUST honestly identify the recovered first-party
scanner, `npm-workspace-publication-service/packed-carrier-archive`.
Its context MUST carry a versioned finite wire-profile identity
`npm-gzip-tar-v1`; extensions remain `pax-path` and ambiguousNames remain
`unreceived`. This is an intentional observation-value change, not an external
Parser event claim. Audit real consumers of those values before activation.
Do not alter the pure model's legacy no-stage interface or either partial stage.
Keep the demand-loaded facade introduced by PR40.

#### Required finite admission laws

- Whole 512-byte TAR blocks; verified unsigned checksum with the checksum field
  treated as spaces; exactly accounted header, payload and padding lengths; two
  zero end blocks followed only by zero blocks. Nonzero tails or missing EOF
  refuse. Do not silently require zero inter-member payload padding unless its
  compatibility impact is separately resolved.
- Admit regular files and directories only. A single `package/` container
  directory is allowed, never a root file. Strip exactly that envelope; a
  literal nested `package/` directory is real content. Preserve literal names,
  not normalized names. Reject absolute/traversal/backslash/control/empty
  segments, malformed UTF8 and literal U+FFFD, duplicates/aliases, links and
  special entries. File-versus-parent conflicts must refuse in either order.
  Retain PR24's sorted-prefix/binary-search conflict strategy. Do not import its
  extraction-only 4095-byte pathname limit into non-extracting receiving.
- Preserve exact regular permission bits 0000 through0777. Special and unknown
  upper bits MUST NOT be silently erased in the proposed profile. Raw-mode
  exposure restores this specification's permission requirement where the
  supplier masks bits; it is not automatically a regression to imitate away.
  Record any changed observed behavior and qualify its refusal controls.
- One local PAX extension may describe only the immediately following normal
  member. It must contain one nonempty `path`; optional `size`, `mtime`,
  `atime`, `ctime` occur at most once. Reject unknown/duplicate keys, empty,
  stacked, orphan, global and GNU long-name/link extensions. Lengths count
  original bytes including decimal length, separator and newline. Decode the
  original payload losslessly, not through replacement decoding.
- PAX path replaces both raw name and prefix. Optional decimal nonnegative safe
  integer size determines the following normal member's effective framing;
  it need not equal the raw size. Never apply pending fields to an intervening
  extension. Timestamps are inert uninterpreted values as in the owner contract,
  not source or installation authority; retain their bytes in archive identity.
- Require exactly one losslessly decoded package.json file and its exact member
  digest/length. Retain the current separation: the low-level archive reader
  captures text; its existing source/model/consumer callers own JSON/package
  identity admission. Do not insert a new JSON normalization step.
- Current mandatory positive finite ceilings remain unchanged:
  members100000 (files and directories), bytes256MiB (file payload),
  archiveBytes64MiB, tarBytes256MiB (all expanded bytes), metadataBytes1MiB
  (each extension), sourcePaths1000000, sourceRepositories4096.
  Count extension work within expanded-byte custody; no ignored blocks or
  extension can grant an unbounded scan. Do not copy PR24's larger defaults.

#### Chosen finite wire profile: npm-gzip-tar-v1

This is a concrete proposed grammar, not a promise to emulate every permissive
normalization of tar7.5.22. Its original POSIX layout evidence is GNU tar's
`src/tar.h` (blob54cd31f814fa1d80e08a77bc7caaa2b9018d202c), which identifies
POSIX1003.1-2024, and the exact supplier sources at
`isaacs/node-tar@2a22bfc5d3a432a606d9da0e2d87ba634aa3b1cb`.
The finite decisions below supersede the earlier unresolved matrix.

- **Magic and prefix:** require bytes257..264 exactly `ustar\0` + `00`.
  Interpret bytes345..499 solely as the POSIX155-byte prefix, joined with `/`
  only when nonempty. Accept a full-width non-NUL string. For a shorter string,
  all bytes after its first NUL must be zero. Do not use the supplier's byte475
  heuristic to reinterpret bytes476..499 as atime/ctime. Thus canonical long
  prefixes are supported, while a short prefix followed by star timestamp
  fields refuses under the NUL-tail rule. Require reserved bytes500..511 zero.
  Blank-magic V7, old GNU `ustar  `, star and unknown magic/version layouts
  refuse explicitly. This is an intentional bounded dialect restriction, not
  a claim that the former supplier rejected them. None occurs in the retained
  five candidates. PAX path overrides the assembled prefix/name completely.
- **Numbers:** mode, size, uid, gid, mtime and device fields admit complete
  ASCII octal digits with optional leading spaces and trailing spaces/NULs;
  no digit or other data may resume after a terminator. Blank ancillary fields
  mean absent; blank mode/size/checksum refuse. All parsed numbers must be safe
  integers. Preserve positive base256 with leading byte0x80 and remaining bytes
  an unsigned big-endian magnitude; do not silently regress to PR24 octal-only.
  For mode/size/uid/gid/device fields reject negatives. Ancillary mtime may also
  use the supplier's safe negative0xff base256 form; it confers no authority.
  Reject other base256 lead bytes, overflow and partial parseInt spellings.
  Checksum is octal only, computed unsigned with exactly bytes148..155 as spaces.
  Check bounds before number conversion/allocation/addition, including PAX
  decimal size and every padded offset; unsafe intermediate arithmetic refuses.
- **Modes:** require `Number.isSafeInteger(mode) && mode >= 0 && mode <= 511`.
  Never use a bitwise mask as the range check: JavaScript bitwise operations
  truncate high bits. No masking/normalization is permitted. Refusing raw upper
  bits restores the existing permission requirement, whereas the old supplier's
  ReadEntry could erase them. This is distinct from the explicit new dialect
  restrictions above.
- **Types and directory sizes:** admit raw `0` or NUL regular-file flags and
  `5` directory flags. Expose regular headers as `File` (the exact supplier
  Header normalizes NUL to0), not an invented raw-type label. Preserve its
  historical trailing-slash recognition only when a regular entry's effective
  path ends `/`: expose `Directory`. Every directory must have raw size0 and
  effective size0, including any PAX size. Never erase a nonzero raw directory
  size as the supplier did. Directory header paths retain their slash; the
  existing path law strips one trailing slash only for comparison. Root
  `package/` is a directory, never an empty file. A type5 path need not end `/`.
  Reject all link/special/contiguous/sparse types and require the complete
  linkname field to be zero for every admitted header, including extensions.
- **Local PAX:** admit both POSIX `x` and supplier-supported Solaris `X` using
  the identical finite path/size/mtime/atime/ctime grammar above. This does not
  admit other Solaris extensions. Header mode/numeric/string/checksum rules
  also apply to extension headers. An extension's raw size alone frames its
  payload; pending values never govern another extension. One extension must
  be followed by one normal filesystem header. All duplicate/unknown/global/
  GNU/stacked/orphan forms refuse. PAX path is the effective member path;
  its size, if present, frames the following file even when raw size differs.
- **Strings and ancillary fields:** decode name, prefix, uname and gname as
  fatal UTF8 with BOM preservation, e.g. `TextDecoder('utf-8', {fatal:true,
  ignoreBOM:true})`. Apply the same lossless decoding to PAX payload/values and
  package.json, and compare re-encoded bytes with original meaningful bytes.
  Never silently strip U+FEFF or replace malformed bytes. String NUL tails
  must be zero; PAX paths forbid NUL. A BOM is a literal character, not a flag
  to drop: existing envelope/path/JSON laws decide its admissibility. Literal
  U+FFFD remains refused for names. Validate raw header string encoding even
  when PAX replaces a name; only the effective member name undergoes package
  envelope and member conflict admission. Extension header names are metadata,
  not filesystem members. Nonempty uname/gname and valid uid/gid/mtime/device
  numbers are inert provenance bytes, never ownership/chown/device effects;
  blank ancillary numbers are allowed because npm emits blank uid/gid.
  PAX timestamps retain the current finite key contract without inventing a
  timestamp grammar. Their bytes do not affect framing or source authority.
- **Padding:** preserve acceptance of arbitrary inter-member body padding;
  its exact bytes remain digest-bound. End markers must be two whole zero
  blocks and remaining bytes whole zero blocks. Do not confuse reserved header
  bytes or string NUL tails with the separately permitted payload padding.

These are deliberate supported/refused choices. The former supplier accepted
some noncanonical magic, partial octal spellings, post-NUL garbage, nonzero raw
directory sizes, and star timestamp layouts. Their refusal is documented policy
narrowing rather than a claimed equivalence result. BOM preservation and raw-mode
range enforcement restore existing lossless/mode requirements. No new source,
installation, public synchronous/async or package identity authority is created.

#### Five retained candidate wire observations

Read-only gzip/byte inspection on2026-10-23 verified each retained archive's
SHA256 and SHA512 against its construction receipt, stable local stat before/
after, unsigned checksums, raw header fields and exact EOF accounting. No
archive was repacked, extracted, installed or passed through a replacement
runtime reader. The inspection was a one-off observation of known octal/type0
records, not production parsing or strict receiving qualification.

- SignGraph:38 headers, expanded461312 bytes; archive SHA256
  `f3d5e5fdbe2e82f57c15c7b7cc7e40f3e91ef6a471dbfc4457c9926cb6e22f96`.
- CAIRN historical source0c4fad59:52 headers, expanded716800 bytes; SHA256
  `4d7f1e710a7a9b6bbd10743d6e75d565199c311db59d70ba14af0938e42c2eed`.
- CBOR:5 headers, expanded29184 bytes; SHA256
  `2437b0fed6e177718b903159ad455d11991d99eff72b16f5b90394735945c6f3`.
- MIME:61 headers, expanded252928 bytes; SHA256
  `6e0a0cc710dd3afe35a195553b5c0e2aec9aa5ff9cf27c8fc156e764610f4ed1`.
- Relating:43 headers, expanded246272 bytes; SHA256
  `bf6d46432d6ce8f16c643a7c4c52a8c32f4924c5cbe4f6047c0c0384da59450e`.

All199 headers use canonical USTAR magic/version, regular type0 and octal
numbers; modes0644 except CBOR also0755. No PAX, base256, directories, legacy
magic or link entries occur. Only CAIRN uses a nonempty prefix, the canonical
`package/data/records/requirements-records`; its remaining prefix bytes are
zero. All have blank uid/gid/uname/gname, zero device numbers/reserved bytes,
zero payload padding and exactly two terminal zero blocks, with no further
tail. Per-header original field hex, offsets, sizes, expanded digests and
candidate identities are retained in the independent review observation.
These observations settle actual wire dialect, not future scanner correctness,
source completeness, strict receiving or installed receiving.

#### Failure, migration and acceptance obligations

Preserve refusal rather than fallback. The framing owner emits TypeError with
code `artifact-member-receiving-refused` for invalid checksum, unsupported
magic/type/layout/numeric syntax, unsafe mode/size, missing manifest/EOF,
truncation, bounds, unsafe paths, duplicate/conflicting members and nonzero tail.
Existing extension grammar/stack/orphan/global/GNU-extension failures retain
`unread-archive-extension` (extension classification takes precedence over the
generic unsupported-type refusal); malformed UTF8 or literal U+FFFD in names retains
`unread-archive-name-encoding`; arithmetic/accounting disagreement between
validated records and the terminator retains `unread-archive-header-accounting`.
Malformed package.json UTF8 retains the native fatal decoder TypeError
`ERR_ENCODING_INVALID_ENCODED_DATA`; no JSON parse is added here. Native
filesystem, descriptor custody and gzip errors continue their existing path.
Malformed UTF8 in PAX is classified as unread-archive-name-encoding before
record interpretation; other PAX syntax errors use unread-archive-extension.

This deliberately replaces supplier `TAR_ENTRY_INVALID` (checksum/header/link
warnings) and `TAR_BAD_ARCHIVE` (unrecognized/truncated stream) with the owner
refusal above, rather than fabricating legacy Parser events. Refusals MUST expose
bounded diagnostic metadata `reason` from a fixed enumeration (checksum,
wire-profile, number, mode, type, path, conflict, limit, truncated, eof, tail,
manifest, extension, encoding, accounting) and `offset` when a validated byte
position is known; do not attach payloads, archive contents or native credentials.
This framing diagnostic metadata requirement does not wrap or alter propagated
native filesystem/gzip/fatal-manifest-decoder errors. Keep errors as failures,
without fallback or partial observations. For overlapping
failures, use fixed scan order: structural availability, checksum, dialect and
field decoding, type/extension, effective member/path admission, limits/body,
then EOF/accounting. Existing supplier diagnostic message identity is not promised.
Consumer review must verify no caller depends on removed TAR_* codes or the old
parser observation identity before activation; any such dependency is updated
explicitly rather than a silent alias. This is a bounded migration audit, not
an undecided wire-profile choice.

Preserve original source selection, Git blob/mode custody, native npm dry-run
ignore precedence, before/after source verification, build/preparation/publisher
projections, private scratch ownership and source/archive comparison unchanged.
Preserve actual in-process successful PNPM11.28.5 evidence, frozen inputs,
provider/request/receipt/bin custody and comparison-before-replacement unchanged.
An extracted tree or saved receipt cannot replace those effects.

Acceptance must recover PR24's independently authored raw-byte fixtures, not
use the production scanner as its own oracle. Cover successful plain/nested/
Unicode/long-PAX members, exact modes/digests/headers/offsets; effective PAX size
different from raw size; all permitted timestamp keys; every extension refusal;
links/special entries, duplicate/alias/parent conflict, malformed names/manifest
bytes, checksums, truncation and tails; each limit and limit-plus-one; unchanged
descriptor/path mutation controls; agreed wire-profile cases; existing model
and native source/install comparison controls. Tests must generate no fixtures
with an excluded tar package. Strict-reader execution must load no external tar,
invoke no GNU tar and perform no extraction. Qualification on2026-10-23 received
114 pure raw-byte scanner cases, then25 explicitly selected original-model/native
wrapper regression cases (23 retained plus2 added custody negatives), all passing
with zero failures/skips. Nine separately selected facade/construction regression
cases also passed after correcting the obsolete missing-tar expectation to the
genuine absent first-party content-address supplier. They constructed nine fresh
dependency-free artificial fixture archives using installed npm with scripts
disabled/offline and original GNU tar inspection of only those new outputs; no
retained candidate was repacked/extracted and no install case ran. All callback,
installer-marker and prior-input refusal controls remain. The excluded isolated
carrier-verification case was not run. An earlier110-case scanner run is retained as a subset
at its original test hash, not counted as additional coverage. The8 excluded
original CLI/npm/Git/source/consumer callbacks were not executed. The installed
outside-bin negative test uses explicitly supplied fixture facts, not authentic
historical native installation evidence. Descriptor race behavior remains
preserved by unchanged code/source review; this result does not claim a newly
executed concurrent-mutation test.

Actual archive-member observation first received the retained SignGraph archive
from source `3e6b247ae9338f3bffc0fd36737a3eb3ea0ea21d`, then the unchanged
CAIRN/CBOR/MIME/Relating archives through original readRegistryArchiveMembers.
All five exact retained SRI/archive identities, source hashes and temporary
source aliases were checked; archive stat/digests were unchanged before/after.
Counts were38/52/5/61/43 respectively. These are source-composed observations,
not satisfaction of differing declared installed registry pins. Original
source/archive receiving still requires the real independently selected pinned
Git reader and its admitted native dry-run effects; none was invoked here. Do not repack to fit the new scanner, derive
completeness from output names or label historical CAIRN source0c4fad59 as its
newer dea1fdf descendant. Actual installed and broader consumer receiving remain
separate obligations and preserve all current denied-effect holds.

The implementation footprint is the recovered scanner, existing receiver,
its original tests plus recovered counterexamples, and this specification.
Do not remove tar from package.json or edit pnpm-lock.yaml in this design or
framing change by assertion. Dependency removal is a separately admitted real
supported lock operation after all usages are reconciled. No whole-package
independence claim follows: semver and other supplier edges remain, and original
construction still uses the installed GNU tar toolchain.

The existing release-wave owner owns planLandedPackageRelease. Its only selected
publication version SHALL be the exact intended version declared in the original
source manifest. An occupied declaration SHALL remain that occupied identity;
it SHALL NOT allocate another patch, development sequence or Git-history-derived
version. The existing explicit CLI --bump operation remains a source-authoring
operation: it writes the requested version before the final carrier is received.
Ordinary CLI publication, source-closure planning, GHS automatic publication and
carrier preparation SHALL consume this one declared-version selection rule.
Source-closure planning SHALL NOT promote a development declaration or increment
an occupied stable version. Its dependency projections reference the provider's
authored version. The explicit prepare-release-wave command remains a proposed
source-authoring operation, separate from publication, like explicit CLI --bump.
Neither an occupied version nor a changed source commit authorizes a release.

The Code carrier producer preparePublicationCarrierManifest binds the exact
original Git manifest to that selection. It SHALL NOT rewrite the declared
version. Its only prepared manifest addition is, solely when repository is
absent, a supplied finite npm repositoryFallback value. The fallback
is the networking caller's already-qualified repository value; Code MUST NOT
derive a GitHub address from a Git acquisition locator. Original acquisition
repository/commit and original/prepared manifest digests remain separate evidence.
Native receiving MUST recompute this projection from original source and the
original occupied-version observations, including quarantined occupied identities.
The existing GHS pure conflict-occupancy validator belongs with this shared Code
selection and SHALL supply the same observation to its CLI and networking
consumers; moving it does not weaken its original evidence or name/origin checks.
Git history count is neither a release input nor a version authority. A
caller-supplied prepared manifest is not
source evidence. The pure comparison still permits only its separate exact
gitHead/json-2-newline publisher projection. The original clean publisher may explicitly omit only its project .npmrc in a
retained finite publisherConfiguration declaration; native NPM selection and actual
packing MUST use the same empty user/global configuration and no inherited
credentials. This is a carrier-input preparation, not an archive membership or
manifest exception. Original build qualification, credential, occupied-set and publication authority gates remain in force.

At an occupied declared version, automatic publication SHALL make no PUT. It may
report unchanged content only after receiving the comparison against that exact
declared version. Changed or unread carrier content SHALL NOT be reported as
published/current: changed content requires the source owner's explicit intended
version; unread comparison remains unread. Documentation, tests, gitlink movement
and other source changes SHALL NOT synthesize versions. Actual changed packed
members remain observable; no documentation/test filter may erase a real carrier
difference to manufacture an unchanged result. Quarantined identities remain
occupied and refused. No compatibility flag, legacy allocator or second policy
is retained.

This corrects original migration/version-allocation damage under
561-group/561-group-bare-cedar-fog-services-section#599 and
red-cup-engineering/npm-registry-serving-service#17. The 2026-10-28 independently
received original catalog contains 7,192 total name/version entries across 1,595
packages, not 7,192 versions of one package. Of those entries, 2,195 use dev.N;
151 repeat a recorded contentDigest, including 126 with different gitHead values.
These observations do not authorize deleting artifacts selected by real consumers.

Leader, 2026-10-28 (message address unavailable), unabridged:

> I don't understand how we ahve 7k "native package versions" what "native package verisons" are you talking about like do you mean we have 7k versiosn of a software in our npm registry?
>
> That's fucked up and we should not have that.

Prior unabridged correction:

> STOP PRESERVING BACKCOMPAT AND SHIMS
>
> THIS IS EARLY ALPHA CODE
>
> FIND WORK THAT IS UNFINISHED AND FINISH IT, NOT BY RECONCILING BOTH DIRECTIONS BUT BY FINISHING THE WORK

Prior unabridged correction:

> STOP ROUTING AROUND DAMAGE YOU (or other agents, it does not matter who) CAUSED AND ABANDONED: it just causes more damage.
> FIX THE DAMAGE

Before implementation, independent receiving SHALL assess this corrected behavior
and the following original consumer assays: free stable/development declarations
retain exact versions; occupied stable/development declarations never advance;
source-closure stable/development plans preserve declared versions;
carrier preparation and native archive receiving preserve the authored version;
ordinary CLI explicit bump writes its intended source version before final
selection; GHS unchanged carriers make no PUT; changed runtime/docs/tests at an
occupied declaration make no PUT and are not reported current; unselected gitlink
movement with unchanged carrier makes no PUT; an explicit source version advance
publishes that exact intended version; unread comparison remains unread; and
quarantined occupancy refuses before publication. Original authority, source,
archive, static/dependency, custody, CAS and failure controls remain required.

Native installed receiving MUST originate in the actual successful original
package-manager operation after its complete frozen input/graph checks and before
prior-installation replacement. A JSON status, extracted tree or hash collection
cannot authenticate historical installation. These package-specific contracts do
not require a workspace, lockfile or package manifest in every repository.


The original frozen consumer receiver's optional artifactReceiving selection
MUST identify a unique exact independently received direct dependency per
consumer. It MUST admit every selected archive's limits, integrity and manifest
before launching any native installation. Only the actual successful child and
unchanged full frozen inputs may supply the in-process nativeInstallation port.
The complete native request/result and actual manager entry/manifest/distribution
hashes MUST be retained in an exclusive private receipt before comparison.
Comparison MUST precede replacement of any prior installation.

The initial installed context is Linux PNPM11.28.5. Its original native
`dist/pnpm.mjs` cmd-shim supplier emits `# cmd-shim-target=`; its own readShimTarget
consumes that metadata. Receiving MUST bind that single native registration to
the exact confined executable package target and retain the shim digest. A
native direct symlink MUST resolve to that same target. No package or shell
program is evaluated to inspect registration. Missing, foreign, ambiguous or
unsupported registration refuses. Another manager/shim context remains unread
until separately qualified; this adds no global shim/filename policy. The
existing pure model's PNPM mode normalization remains unchanged. A retained JSON
receipt alone cannot reopen a historical installation as a fresh native claim.
The actual bin directory MUST resolve to a directory inside the original native
installation before its registrations are read. A lexically contained path that
redirects to outside custody does not establish confined registration.


New native source/archive receiving requires an explicit real private
scratchDirectory supplied by its original operational owner, separate from source
inputs. It MUST NOT derive an operational data owner from the installed package
or silently use an account/system temp default. The ordinary receive CLI selects
this resource explicitly in its input; preparation/build evidence remains excluded
from that JSON entrance. An unsuccessful Git read retains its bounded scratch for
the original owner's disposition. Native installed receiving separately requires
an explicit artifactReceiptDirectory; logs, durable operation records and disposable
staging remain distinct resources chosen by the original receiving owner.


## Proposed explicit legacy registry profile — design only, not admitted runtime

Status: source-owner proposal derived from actual MetroPlat77a179 lock and the
complete17 immutable archive observations. No implementation or new admission.
The strict default npm-gzip-tar-v1 remains unchanged (apart from the separately
reviewed exact type5 envelope correction). Intentional unsupported domains may
be qualified explicitly; they are not permission denials or intrinsically unsafe.

### Responsibility, alternatives and interface

Keep src/packed-carrier-archive.mjs as the only framing implementation and
src/artifact-member-receiving.mjs as the only pathname/SRI/decompression owner.
Do not replace either with PNPM CAFS or create a second TAR parser. Proposed
explicit profile selection belongs in the original public reader request and
versioned observation, carried unchanged through source-registry-closure and
native-package-preparation's actual caller contract. Existing omitted selection
means strict profile. An unsupported profile refuses, not fallback. Legacy use
must be an explicit owner-qualified consumer choice, not inferred from filename,
registry hostname or a first failed strict parse. All callsites need review before
source implementation. The same scanner receives policy, not another decoder.

Alternative A (strict only) preserves current domain but cannot receive11
otherwise recognized historical inputs. Alternative B (replace with maintained
tar7.5.22 or native PNPM decoder) is rejected: the former drops NODETAR fields,
coerces raw directory sizes and accepts permissive header spellings; the latter
normalizes traversal/dot aliases, trims root components, ignores non-path/size
PAX and does not prove strict complete framing. Both read abitype's two colliding
members without a warning. Their success is not unique installed-byte custody.
Alternative C (preferred subject to review) adds finite explicit compatibility
policy at the existing scanner, retaining original field validation and every
safety invariant below. Alternative D (dependency/source correction) remains
necessary for abitype and is potentially preferable for other unsupported inputs
if their original consumer can migrate coherently without greater regression.

### Actual complete input domain

- @types/connect3.4.38, node22.7.5, uuid10.0.0 and ws8.18.2: single roots
  connect/node/uuid/ws; USTAR magic with node-tar timestamp layout. All entries
  regular/directory, mode0644/0755, no links or PAX.
- @types/node12.20.55 and ws7.4.7: safe single roots `node v12.20` and `ws`,
  standard USTAR, regular modes0777. Do not erase executable bits.
- buffers0.1.1 and chainsaw0.1.0: oldGNU magic `ustar  NUL`; all13header
  suffixes345..511 are zero. Six/seven regular entries, no GNU extensions.
- brorand1.1.0, hmac-drbg1.0.1, minimalistic-crypto-utils1.0.1:18localPAX
  records paired with18regular files. Complete original metadata payloads are
  retained in maintained-observations.json, not truncated first-block samples.
  Keys include path,size,uid,gid,SCHILY.dev/ino/nlink,NODETAR provenance and
  flattened package metadata; no global extension, links or sparse entries.
- abitype0.8.11:244regular entries, two literal paths `package/./dist/cjs/index.js`
  and `package/dist/cjs/index.js` normalize to the same target. At offsets305664
  and311808 both contain5508identical bytes(SHA2566e8d2423213a5887b581e3dcc0bbe3cba5a9860ec105721647b7306e767bc907),
  mode0644,uid/gid0,mtime1985-10-26T08:15Z,empty links/owner names,zero devices,
  noPAX. Raw headers differ only names/checksums. This profile MUST still refuse
  dot aliases and collisions even when payloads are identical; no deduplication.

### Proposed finite laws, not broad emulation

1. Preserve strict descriptor custody, canonicalSRI, bounded decompression,
   checksum over all512bytes, complete safe numeric decoding, exact permission
   range, literal UTF8/BOM handling, member/byte/metadata bounds and completeEOF.
   No archive byte, hash, declared identity or historical receipt is rewritten.
2. Envelope: select exactly one nonempty literal safe first component from the
   first normal member; all subsequent normal members share it. Root may include
   ordinary spaces but never controls, backslashes, absolute prefixes, empty,
   `.` or `..` components. Strip exactly once for package-relative observations;
   retain original full paths and selected envelope. Root-only entries require
   explicit directory type and raw/effective zero size; duplicate root spellings
   collide. Root file, mixed roots, aliases and file/parent conflicts refuse.
3. USTAR layouts: normal155-byte prefix remains valid. A node-tar timestamp
   layout must have byte475NUL, a fully validated130-byte prefix, well-formed
   ancillary numeric timestamp fields476..487/488..499 and zero500..511. Full
   POSIX prefixes versus timestamp layout must have unambiguous interpretation:
   if multiple valid layouts disagree on effective path or framing, refuse.
   Do not accept arbitrary data afterNUL or apply a byte475heuristic alone.
   Timestamp bytes are retained provenance, never ownership/filetime effects.
4. OldGNU subset: exact magic `ustar  NUL`, regular/directory only, and entire
   suffix345..511zero. Do not interpret that suffix as a POSIXprefix. Nonzero
   GNU atime/ctime, multivolume offset, sparse maps,isextended,realsize or other
   unsupported suffix refuses. GNU longname/longlink/sparse/global extensions
   stay refused. This handles the actual13headers, not all oldGNU archives.
5. LocalPAX uses the original length-framing/UTF8 parser: unique keys, exactbyte
   lengths, newline termination, at most one pending extension for the next
   normal member, no global/stacked/orphan/intervening extension. path and size
   keep their operative semantics and original validation. Unknown keys refuse.
   Explicit newly classified provenance keys: unsigned safe-decimal uid/gid,
   SCHILY.dev/ino/nlink (nlink1 for this finite profile); NODETAR.depth/blksize/
   blocks safe-decimal; NODETAR.follow exactlyfalse; NODETAR.type exactlyFile
   agreeing with following admitted header; NODETAR.ignoreFiles numeric-index
   literals; NODETAR.package flattened fields restricted to the following key grammar:
   scalar name/version/description/main/author/license/homepage;
   repository.type/repository.url/bugs.url; scripts.test;
   keywords.<canonical-safe-nonnegative-decimal-index>;
   dependencies.<valid-npm-package-name> and
   devDependencies.<valid-npm-package-name>;
   browser.<nonempty-UTF8-key-without-controls-or-NUL>.
   The npm-package-name grammar is the original owner's qualified package-name
   grammar, not a new partial regex; no metadata dependency creates an executable
   dependency edge. These remain flattened strings, not expanded objects.
   Values are bounded losslessUTF8 withoutNUL, retained exactly; descriptions
   or script strings are never executed. No other package-field spelling is
   accepted, including __proto__/constructor/prototype path segments. Preserve their exact bounded bytes/digests and classify
   them inert rather than silently discard. No recursive object assignment or
   prototype interpretation. None may override path,size,type,mode,links or
   ownership. `SCHILY.realsize`, `SCHILY.filetype`, `GNU.sparse.*`, `linkpath`,
   mode overrides, charset/binary encoding, xattrs/ACLs and unqualified keys
   refuse. The explicit package-metadata grammar and provenance-value validation require
   independent review before implementation; a broad NODETAR.* ignore rule is not this design.
6. Retain raw/effective member identities and every header, plus finite profile
   and classified metadata receipt. All observed entries participate in duplicate
   accounting before any admission result. Existing model package identity
   checks remain with the caller. Native receiving separately compares actual
   selected installed bytes; parser qualification is not install acceptance.

### Required qualification matrix and migration

Before implementation, independently review the proposed frozen metadata-key
grammar and specify the source-owned interface/caller migration exactly. Retain114strict tests and9root tests unchanged.
For each supported layout, add positive exact-boundary fixtures and negatives:
malformed numeric/UTF8/NUL tails; ambiguous155vs130prefix; nonzero oldGNU reserved,
sparse/multivolume fields; checksum/tail/truncated/endblock failures; duplicated
PAX keys, fake/incomplete lengths, unknown/vendor override/sparse/link metadata,
stacked/global/orphan/interleaved records; raw/effective size disagreement on
normal files per original supported rule and forbidden nonzero directory sizes;
resource-limit and limit+1 for metadata, expanded bytes, payload and members;
mixed envelopes/rootfiles/traversal/dot/backslash, duplicate/nested-parent paths,
including different raw names with equal bytes. Test strict default still refuses
all legacy examples. Test profile mismatch/unknown selection and receipt identity.
Use all11immutableactualinputs after synthetic controls; compare complete expected
members/headers/metadata and manifests against independent maintained observations
without treating that permissive decoder as safety oracle. Include actualabitype
negative unchanged. Then source-compose original public reader and exact original
consumer caller; preserve raw receipts. Full891dependency closure, installed
receiving, source integration and live delivery remain separate.

### Actual dependency correction alternative for abitype

The exact frozen lock chooses abitype0.8.11 via @aa-sdk/core4.88.5, itself via
@account-kit/infra4.84.1 and the Group's virtuals-brokerage-products-border0.1.7.
A shortest runtime path is MetroPlat → computer-inference-engine0.1.2 →
x402-services-section0.10.8 → alpaca-services-section0.1.3 → virtuals border →
account-kit infra → aa-sdk core → abitype. FeltOS0.21.9-dev.1014 has the same
x402 chain. Exact peer-qualified snapshot paths and all32reachable root entries
are retained in abitype-shortest-root-paths.json;1162reverse edges include genuine
cycles, not1162independent required packages. No top-level override of0.8to1.2
is justified. Original upstream dependency/API requirements and Group border
receiving must qualify an upstream release or remove an unneeded dependency at
its real owner; do not repack the immutable archive or normalize duplicate bytes.

Primary sources: GNU tar Basic Tar Format and Old GNU Format manuals; exact
node-tar7.5.22 Header/Pax/Parser sources in retained supplier closure; actual
PNPM distribution SHA256e3738fda08262f74611d7a1ffc11b3e87fa52b466c07eb73211d179ebcb98810,
CAFS parseTarball lines192550–192930. Standards establish format meaning, not
permission to relax the receiver's domain or to perform extraction.

### Proposed interface and ambiguity freeze for review

- Public reader optional field: `wireProfile`, exact enumeration
  `npm-gzip-tar-v1` (default) or `npm-registry-legacy-v1`. No boolean permissive
  flag. The existing facade forwards it unchanged. The sole internal scanner
  receives a third options object `{wireProfile}` with the same default and
  rejects unknown keys/values before any header interpretation. The native
  package factory's original contribution options must explicitly retain this
  selection, bind it into its observation/input identity, and recheck it during
  receiving; never choose a profile from a parsing error. Exact original factory
  option schema/callsite migration remains a required implementation design step
  shared with its owner, not an implied global legacy switch.
- Strict observations remain byte-for-byte interface compatible. Legacy parser
  `context` is `npm-registry-legacy-v1`, `extensions` is
  `pax-path-and-classified-provenance-v1`, `ambiguousNames` stays `unreceived`.
  Legacy adds explicit envelope and per-extension offset/size/SHA256/key-class
  observations; original compressed/expanded identities still bind every byte.
  Never claim a decoder name that did not run. Failure categories/offset ordering
  remain original; unsupported profile/layout/key is a refusal, not fallback.
- Envelope selection and all member collisions use the EFFECTIVE normal-member
  name (localPAX.path when present, otherwise decoded raw prefix+name). Raw
  names/prefixes still undergo complete header encoding/NUL-tail/checksum/numeric
  and link-field validation even when overridden, but a harmless raw placeholder
  need not share the effective envelope—matching the existing supported PAX law.
  Metadata header names never select the envelope or enter file membership.
  Preserve raw name/prefix separately in legacy observations. A malicious PAX
  effective escape/mixed-root/duplicate refuses even if the raw name is safe;
  an invalid raw field refuses even if effective path is safe. Do not normalize
  either representation or reject legitimate placeholder overrides by accident.
- Every new timestamp-layout branch runs the SAME complete existing numeric,
  type, mode, uname/gname, link and checksum validation as the POSIX branch.
  Candidate layouts may differ only in their declared prefix/timestamp fields.
  The scanner must explicitly evaluate admissible interpretations and refuse
  differing effective paths or framing; zero timestamps do not license an
  unconstrained postNUL tail. Full-width POSIX prefixes remain supported.
- Frozen provenance bounds: each key and value consumes its original localPAX
  metadataBytes budget, all records remain within tarBytes, and legacy counts
  extension headers as well as normal headers against members. No second larger
  bound. Numeric indices use canonical unsigned decimal safeintegers; no leading
  zeros except0. Empty/duplicate key, embeddedNUL, malformedUTF8, numeric overflow
  or repeated index key refuses. Store flattened key/value observations in Map
  or null-prototype records, never object-path expansion or assignment to a
  decoder/header. Preserve exact bytes; typed numeric validation does not rewrite.
  NODETAR.ignoreFiles.<index> values are nonempty losslessUTF8 withoutNUL or
  controls; they describe producer provenance only, not extraction ignore rules.
  `browser.<key>` forbids __proto__/constructor/prototype segments; package names
  under dependencies/devDependencies are parsed by the existing owner grammar.
  All unknown top-level or metadata key families still refuse, even if a permissive
  maintained decoder ignores them. Tests must cover misleading sparse/link/type/
  mode names inside and outside qualified namespaces and prove no effect.

### Alternative E: versioned idempotent regular-file occurrence projection

This is a separately proposed `npm-registry-legacy-idempotent-files-v1`, NOT a
change to strict-v1 or permission to bypass its refusal. It extends alternativeC
only after source-owned consumer projection qualification. Current code still
refuses abitype. Matching SHA alone is insufficient. This alternative may avoid
an otherwise broader dependency upgrade, but must preserve distinct occurrences.

Actual native ordered behavior: exact PNPM worker.jsSHA256
5878ae8493ead2e083a4fbf33844d2d463ecebb1a1cd3fc86c04be16721bf156,
lines13238–13360 and17693, selects boundedbuffer or tarballFile routes. The
buffer route holds an in-memory Map keyed by normalized relative path, replacing
an earlier entry before CAFS effects; abitype's1,337,344expanded bytes fit its
64MiB bound. File/stream route visits occurrences in order, writes CAFS through
addBufferToCafs, then replaces filesIndex at the same normalized key. Identical
payload and execute intent select the same SHA512 content-store key; original
writeBufferToCafs's CAFS-instance locker returns the first checkedAt/filePath
without another write for the repeated key. Same rawmode also preserves the same
filesIndex mode/size. This is source evidence of a possible idempotent projection,
not newly received native effects or proof for other managers/versions/platforms.

Required laws before admitting a group:
- Complete the entire archive scan before any external materialization; build
  the full raw occurrence inventory and namespace/parent conflict map. Preserve
  original ordinal, byteoffset, rawname/prefix, effective name, exact type/mode,
  payload digest/length, all ancillary metadata and original archiveSRI. Do not
  erase two occurrences because their payloads match.
- Projection permits ONLY removal of literal `.` components beneath the one
  already qualified envelope. No `..`, backslash, empty/repeated separator,
  absolute name, case-folding, Unicode normalization or Windows drive handling.
  Profile is bound to qualified Linux/POSIX native manager semantics, not an
  assertion that every filesystem behaves identically.
- Each multi-occurrence target must contain only identical raw regular-file
  types, exact held payload byte equality (Buffer.equals, not hash alone), byte
  length, full permitted mode and all operative decoded metadata. Initially
  require the complete ancillary metadata equal too; retain differing path and
  checksum provenance. No local/globalPAX on a colliding occurrence, no linkname,
  special/sparse/contiguous/directory entry. The finite actualabitype group meets
  these observed conditions; other groups must be checked independently.
- Require unique package.json occurrence and refuse aliases of manifest or
  manifest-declared bins in this initial profile. These require separate native
  manifest/registration semantics and are unnecessary for the actual collision.
  Any parent/child file conflict, file/directory collision, intervening namespace
  mutation or conflicting bytes/mode/metadata anywhere in the group refuses.
- Count EVERY occurrence and EVERY payload against limits even if projection
  writes one target. Bind the original order and target→occurrence ordinals into
  a raw inventory identity and a SEPARATE derived-materialization identity.
  Return neither partial admission nor a single deduplicated inventory pretending
  to be the archive. Last-occurrence selection may describe nativeMap behavior
  but may never conceal an unequal earlier occurrence.
- Native manager entry+worker distribution, original operation, Linux platform,
  no lifecycle/hooks, effective normalized-path ignore policy and receiving
  context must all be qualified. A native buffer/file route difference is explicit
  replay input. Streamed repeated CAFS writes require original same-operation
  locker semantics, stable mode/content-key identity and result-index equality.
  Concurrent operations, existing-store repair and alternate native versions need
  original owner guarantees; do not infer them solely from fresh Map semantics.

API/model consequence: the current pure archive model requires literal unique
members and cannot silently receive deduplicated archive.members. Design must
introduce an explicitly versioned archive-to-installed projection context at the
EXISTING artifact receiving owner, retaining raw occurrences plus qualified
projected members and their binding. Source-archive publication comparison must
not inherit this installed-consumer normalization. The existing strict model and
legacy-v1 context remain unchanged. Until that exact interface and private
in-process qualification binding are specified/reviewed, alternativeE is NOT
implementation-ready. Merely attaching callerJSON profile labels grants nothing.

Negative cases: samehash but unequal heldbytes; equalbytes/differentmode/rawtype/
uid/gid/mtime/owner/device fields; repeatedmanifest/bin; linked/sparse/directory
alias; parent before/after child; third conflicting occurrence; mixed envelopes;
case/Unicode or traversal aliases; localPAX overriding to collision; limits that
would pass only afterdedup; truncatedlateroccurrence; unknownnative version/route;
changedignorepolicy or scripts/hooks; poisoned existingstore/concurrent writer;
missing raw occurrence receipt or changed ordering/projection identity. Positive
fixture must preserve alloccurrences and demonstrate both bufferMap and file/
stream CAFS ownership semantics through the original native provider, not a
copied parser or a handbuilt Map simulation. Native effects are outside this
current source/TAR-only assignment; no such receiving claim is made.

Tradeoff: dependency correction changes actual aa-sdk/account-kit API and Group
border requirements; it cannot be justified by a top-level0.8→1.2override. E avoids
that dependency change but adds a narrowly qualified occurrence-projection
contract and native semantics obligation. Choose only after comparing full
receiving cost and original consumer compatibility. Unsupported is not a permanent
prohibition; conflicting duplicates remain a hard refusal under every alternative.

Independent review of AlternativeE: coherent source-only alternative, not
implementation approval. Remaining explicit gates are (1) exact raw-occurrence
versus projected-member data model/equality law at the original receiver;
(2) singleton dot-alias policy—no singleton may bypass namespace/bin checks;
(3) manifest/bin exclusions evaluated against the COMPLETE final normalized
namespace after unique manifest parsing; (4) private original-operation binding
of exact native normalization, ignore policy and buffer/file route. A narrower
buffer-only contract is possible, but must refuse file/stream routes BEFORE
effects; qualify both routes only if both are actually supported. Neither route
was executed in this assignment. Default duplicate refusal remains in force.

Fresh original public-reader observations of cached dependency manifests confirm:
aa-sdk/core4.88.5 declares abitype `^0.8.3`; account-kit/infra4.84.1 declares
`@aa-sdk/core:^4.84.1`; virtuals-brokerage-products-border0.1.7 declares exact
`@account-kit/infra:4.84.1`. Thus replacing abitype0.8.11 with1.2.3 violates the
actual declared range, not merely an assumed compatibility preference. A possible
qualified0.8.x archive or upstream owner correction needs its own original
artifact/API evidence; none was acquired or asserted here.

## Frozen local interface refinement (2026-10-26)

This section supersedes tentative interfaces above, not canonical publication.
One existing scanner receives optional third argument `{profile}` with exactly
`npm-gzip-tar-v1` (default), `npm-registry-legacy-v1`, or
`npm-registry-legacy-idempotent-files-v1`. Unknown options/profiles refuse. The
original public `readRegistryArchiveMembers` stays strict and its return shape
unchanged. New same-owner `readRegistryArchiveProjection({path,integrity,limits,
profile})` shares its original descriptor/SRI/decompression implementation, but
returns `{sourceArchive, projection, observation}`, NEVER `archive`. It does not
call admitArtifactRelease and confers no installation or publication capability.
Thus no caller can select normalization on the source/publication reader.

`sourceArchive` version1 has integrity, expandedSHA256, profile, manifestText,
ordered `occurrences`, ordered `extensions`, and rawInventorySHA256. Every normal
occurrence records ordinal, headerOffset, rawHeaderHex (all512bytes), rawName,
effectiveName, rawType, interpretedKind, mode, rawSize, effectiveSize, localPath,
projectedPath, payloadSHA256 (null directory), and extensionOrdinal (null or one).
Every extension records ordinal, headerOffset, rawHeaderHex, payloadOffset,
payloadBytes, payloadSHA256, and ordered flat key/value records. Wire bytes are
never rewritten. Raw inventory identity is SHA256(UTF8(JSON.stringify([version,
profile,expandedSHA256,occurrences,extensions]))), with explicit fixed-field
construction order; rawHeaderHex retains even unmodeled padding/provenance.

`projection` version1 has profile, rawInventorySHA256, manifestText, `members`
(unique target file metadata in first-target appearance order), `targets`
([{path,occurrenceOrdinals,selectedOrdinal}]), and projectionSHA256. Selected
ordinal is last occurrence, matching native Map, but all predecessors must first
pass exact equality. Identity is SHA256(UTF8(JSON.stringify([version,profile,
rawInventorySHA256,manifestText,members,targets]))). It is a read-only prediction,
not a native capability, installed inventory, or source publication inventory.
All returned data are detached from held bytes; byte equality happens while held.

Legacy PAX grammar: existing byte-count framing/UTF8/duplicate rules apply.
Keys length1..256 UTF8 bytes; each value <=65536 UTF8 bytes and no NUL, CR, LF,
DEL or other C0 controls. Entire metadata obeys original1MiB bound, with total
extension payload additionally <=limits.metadataBytes for the legacy contexts.
`path,size,mtime,atime,ctime` retain existing semantics; timestamp lexemes must
match `^-?(0|[1-9][0-9]*)(\.[0-9]{1,9})?$` and finite safe integer part.
Additional exact unsigned-safe-decimal keys: uid,gid,SCHILY.dev,SCHILY.ino,
NODETAR.depth,NODETAR.blksize,NODETAR.blocks. SCHILY.nlink must equal `1`;
NODETAR.follow `false`; NODETAR.type `File` and raw type0/NUL (no directory).
NODETAR.ignoreFiles.N and NODETAR.package.keywords.N: N canonical decimal0..4095,
indices per family contiguous0..max; values inert strings, not ignore authority.
Exact inert string keys NODETAR.package.{name,version,description,main,author,
license,homepage,repository.type,repository.url,bugs.url,scripts.test}.
NODETAR.package.browser.crypto exactly `false`. Dependencies/devDependencies
suffix is one unscoped lowercase npm name `[a-z0-9][a-z0-9._-]{0,213}` or scoped
`@[a-z0-9][a-z0-9._-]{0,212}/[a-z0-9][a-z0-9._-]{0,212}`, total<=214bytes.
Reject segments `__proto__`, `prototype`, `constructor`; never expand dotted keys
into objects. No prefix wildcard, unknown keys, ACL/xattr/sparse/link/mode or
charset fields. Retain all provenance; only path/size alter framing/target.

Raw/effective law: validate checksum, numeric/owner/link fields and complete raw
name encoding/layout on ALL headers, including extensions. PAX path may replace
a raw placeholder (which remains a confined literal relative path, no dot,
dotdot,backslash,empty component/control); it cannot alter raw type. A normal
member's effective path determines one envelope and namespace. First normal
member establishes envelope; every following effective member shares it. An
extension's own confined literal name does not establish another envelope.
Directory recognition remains raw type5 OR effective trailing slash with both
raw and effective sizes0. E forbids aliases for either directory interpretation.
OldGNU restricted layout has exact magic plus all bytes345..511 zero. USTAR
ordinary layout must validate full155prefix; node-tar layout requires zero byte475,
valid130prefix, at least one populated valid octal timestamp476..499, and strict
failure of ordinary layout. If both interpretations validate with differing
names/metadata, refuse ambiguity; no heuristic fallback on a malformed number.

Complete namespace law: remove exactly one safe envelope. Legacy-v1 forbids dot
components. E removes only literal interior `.` for regular files; all other
path constraints persist. Build groups over EVERY normal occurrence and target,
including singleton aliases and directories. Refuse file/directory groups,
repeated directories, any file parent of any target, links/sparse/special types,
empty projected file name and mixed envelopes. Require exactly one manifest at
literal local `package.json` (no alias even singleton), parse after complete scan.
Manifest must be an object; bin absent/string/plain-object with string targets.
Normalize declared bin targets under same confined dot rule, reject malformed
names/targets, and exclude every bin target from aliasing OR multiple occurrences.
Check exclusions against final projected namespace, not raw spelling or early
manifest assumptions. `directories.bin` is unsupported in E, not silently ignored.

E equality: colliding normal occurrences must both have raw type0 or NUL AND
exactly equal raw type, fullmode, raw/effective sizes, and held Buffer.equals.
No PAX on any collision. Raw512headers, with ONLY name[0..99], prefix[345..499]
and checksum[148..155] masked, must be byte-for-byte identical. Additionally
layout must be ordinary USTAR; this prevents masking node-tar operative time
fields. All unmasked owner/device/time/padding bytes participate, stricter than
semantic equality. Singleton dot aliases also exclude PAX and nonordinarylayout.
Every occurrence contributes payload/member bounds; every extension contributes
header count; total complete framing/two-zero-tail proof precedes any result.

Native binding contract: read-only projection is necessary, never sufficient.
Original factory must retain privately the exact SRI/expandedSHA256/projection
identity and qualified manager entry+worker hashes, original operation identity,
Linux platform, lifecycle/hooks-disabled state, normalization implementation and
effective ignore behavior. Unforgeable in-process ownership, not callerJSON,
selects that binding before installer invocation. Both original PNPM routes
have the same complete target relation for admitted E inputs: bounded-buffer
Map chooses last prior-to-CAFS, file/stream selects last filesIndex while same
CAFS-instance locker reuses identical content+execute key. Native comparison
must additionally prove actual ignore policy omits none of projection targets
(or explicitly derive a separate omission projection; this initial E refuses).
Unknown route/provider/hash, unknown ignore predicate, unsupported hooks, or
unavailable pre-effect binding must refuse before native effects. Exact original
factory preflight integration is coordinated with its sole writer; no copied
worker, extractor, Map simulator, or public label substitutes for that capability.

Native lifecycle correction: worker getCafs(storeDir) caches createCafs(storeDir),
whose default locker is per CAFS instance, potentially spanning jobs in that
worker/store. It is NOT inherently a new per-operation locker. File/stream
qualification therefore requires actual retained instance/store lifecycle and
exclusive unchanged content custody, or an original fresh isolated worker/store.
A repeated key is not independent integrity revalidation. Both routes retain
original existing-store integrity/recovery obligations; buffer target collapse
alone does not prove an existing CAFS key remains valid.


Pure implementation resource contract: legacy normal and extension raw-header
records are incrementally charged by UTF8 serialized byte length, with16MiB
maximum retained evidence. Complete scanner and public projection result each
also must serialize within16MiB. Existing strict limits/return shape unchanged.
SourceArchive integrity is attached only by original public descriptor/SRI
custody after successful SHA512 verification; pure scanner binds expandedSHA256.
Private native binding must bind BOTH compressed SRI and projection identity.
Actual profile qualification (read-only): strict5/17, legacy16/17, E17/17.
Abitype244rawoccurrences/243projectedtargets, collisionordinals25,26; selected26.
Native effects remain NOT qualified by these pure/public-reader results.
Independent review found and corrected three implementation boundary gaps before
acceptance: oldGNU+x was outside its regular/directory subset; blank timestamp
fields did not establish node-tar layout; raw dot-placeholder under localPAX
must not inherit nonPAX alias allowance. Focused negative tests now cover all3.

## Projection-installed consumer contract (local refinement)

`admitArtifactRelease` gains only explicit stage `projection-installed` with
fields stage,registry,sourceArchive,projection,limits,installed,installation,
projectionBinding. No `archive`, source or publisher field is allowed. Existing
source-archive/archive-installed inputs and outputs remain unchanged. Refactor
only the common unique-member/payload/bin/native-mode comparison, retaining
its strict default contracts. New successful type is
`RegistryProjectionInstalledAdmission`, with sourceArchive identity summary,
projectedMembers, compared and evidence; never an archive inventory. Identity
binds compressed integrity, expandedSHA256, rawInventorySHA256,
projectionSHA256, original native operation/provider/context and full comparison.

Held-byte proof: the existing pure scanner retains a WeakMap keyed by each
projection object it produces, with detached immutable snapshots of sourceArchive
and projection. A read-only exported accessor verifies both supplied structures
against those exact snapshots (sourceArchive may add only its independently
verified integrity). It cannot register caller data. Serialized/deserialized,
cloned, mutated, or recomputed DTOs are not retained held-byte equality proofs.
This brand proves only original scanner qualification, not compressed custody
or native execution; those remain the original reader/factory responsibilities.
The public projection reader preserves the branded projection object and adds
SRI only after original stable-descriptor SHA512 checking. Evidence is bounded
by the established16MiB retained profile; map entries disappear with their keys.

`receiveInstalledRegistryProjection` at the existing member receiver uses the
same original filesystem/bin/mode observation implementation, not a copy. It
accepts the original installed selection plus explicit profile and invokes the
original injected nativeInstallation port. It freshly reads the immutable
archive through readRegistryArchiveProjection, verifies package/version, then
requires that operation's private registryProjectionBinding matches the exact
fresh proof BEFORE filesystem receiving. It invokes projection-installed, never
archive-installed. A callback/DTO supplied by a test is synthetic evidence only;
production ownership is the existing factory's retained private operation.

Binding version1 exact fields: version,profile,integrity,expandedSHA256,
rawInventorySHA256,projectionSHA256,managerEntrySHA256,managerDistributionSHA256,workerSHA256,
requestSHA256,receiptSHA256,platform,normalization,ignorePolicy,lifecycleScripts,
hooks,route,storeRoot,storeAllocationSHA256,cafsLifetime. All hashes canonical
lowercaseSHA256; integrity canonicalSHA512. Manager/worker hashes must equal
qualified PNPM11.28.5 distribution identities already retained by original
factory; request/receipt equal successful original installation. Platform linux;
normalization `pnpm11-posix-registry-files-v1`; ignorePolicy `none`;
lifecycleScripts false; hooks false. Route is `buffer-map` or `file-stream` and
must originate from original provider qualification, not inferred from an
archive.pathname. storeRoot absolute and identical to privately allocated
original store; storeAllocationSHA256 its original allocation proof. cafsLifetime
`fresh-cli-private-store` or `qualified-retained-instance` names an established
original custody profile, not caller permission. Actual factory integration
MUST establish these values from owned configuration/source/operation evidence
before native effects. Unknown/incomplete binding refuses, not a permissive
fallback. Pure comparison cannot authenticate these external facts by itself.

Source/native pins for this qualified interface: PNPM bin/pnpm.mjs entry
 ff3224d46b47fbb24a7e9fe15fededef7e00892d07d4e376b6762d4899906bfd,
PNPM dist/pnpm.mjs distribution
 e3738fda08262f74611d7a1ffc11b3e87fa52b466c07eb73211d179ebcb98810
and worker
 5878ae8493ead2e083a4fbf33844d2d463ecebb1a1cd3fc86c04be16721bf156.
No worker/extractor changes. Native operation provisioning, route/ignore proof,
store allocation and runtime custody remain owned by original factory/provider.

Tests must distinguish pure/synthetic facts from real native receiving: reject
unbranded/cloned/mutated/rehashed projection, mismatched SRI/profile/raw identity,
worker/provider/request/receipt/route/ignore/store/lifecycle binding; preserve
original tests; compare missing/extra/changed payload/mode/bin/manifest cases.
Native abitype install is NOT authorized by a passing synthetic comparison.

Independent review clarified entry versus distribution identity: they are
separate fields; bin/pnpm.cjs is NOT silently interchangeable with qualified
bin/pnpm.mjs. Match manager.entrySHA256 to the actual original provider field.
No standalone public callback authenticates private factory origin. This stage
is a pure comparison of retained scanner facts plus supplied external facts;
only production factory qualification can establish the latter. Synthetic test
success is explicitly not real native-installed receiving.

Installed-profile domain is intentionally narrower than wire projection: original
bin receiving accepts a literal package-relative target after removing at most
one leading `./`. Interior or repeated dot components in a manifest bin target
remain `bin target is not package-relative` refusals at projection-installed,
even though scanner exclusion checks normalize them to prevent bypass. This
is no waiver and no claim that every scanner-admitted projection is natively
installable. No actual17 archive requires widening original bin semantics.
Both positive single-leading-dot and precise interior-dot refusal are tested.

## Version 2 closed-route-set comparison binding

Local design lineage: factory-binding-design/README.md SHA256
`aa6ce4843c12e719b36855147a9b11f1aff90b7c480b1e3c57bc479d82c95f7e`.
V1 remains unchanged. V2 is a pure supplied-context contract, not a native
capability or proof that supplied hashes describe real configuration or custody.
The existing factory/private PNPM capability must derive and retain facts before
effects, then provide actual operation/receipt and original selected-instance
receiving. A callback-shaped DTO is not that capability.

V2 keeps v1 exact archive/profile/provider/worker/request/receipt/allocation hashes,
platform, normalization, ignorePolicy, lifecycleScripts and hooks. It excludes v1
`route` and `storeRoot`. Required replacement/additional fields are:
- routeSet=`pnpm11-registry-cafs-and-link-v1`;
  routeEvidence=`source-qualified-closed-set`; observedRoute=null. This version
  has NO runtime branch observation producer: even a plausible branch refuses.
- allocatedStoreRoot (original cache allocation), allocatedStoreBase exactly
  root+'/pnpm-store', effectiveStoreRoot exactly base+'/v11'; all literal absolute
  paths. storeBeforeSHA256 and storeAfterSHA256 hash original custody observations,
  including legitimate absent-before/present-after. They do not assert emptiness.
- cafsLifetime=`fresh-cli-worker-pool/private-allocation`: new CLI worker Maps,
  possibly existing disk history/store. Neither reuse nor locker proves rehash.
- configSHA256, lockSHA256 (the latter equals installation.lockSHA256).
- sideEffectsCacheRead=false, remoteSideEffects=false, patches=false,
  alternateManifestTransforms=false. Original producer derives effective settings;
  ignore-scripts alone, absent patchedDependencies or these caller labels do not.

Closed set: buffer-map; buffer-stream including original large-entry writer;
verified store reuse; existing linked-tree reuse. Equal raw aliases have the same
held bytes and operative metadata, hence the same final namespace/payload under
these routes. Every raw occurrence stays retained. Current 64MiB compressed
composition excludes tarballFile transport spill. No ignore/custom transform,
link, sparse, special or conflicting namespace is added. Postcondition remains
fresh original full selected-instance payload/mode/bin/manifest comparison.
Do not identify actual transitive abitype0.8.11 by root-visible package name:
original installed-contract owner must bind the aa-sdk importer/peer instance.

V2 comparison ceilings are 65536 raw headers (occurrences PLUS extensions), 1GiB
raw regular payload and installed payload. Existing caller limits can be lower;
all occurrences count, not just unique targets. Original archive reader retains
its own compressed/expanded/metadata ceilings and 16MiB result bound. Private
scanner snapshot is a separate <=16MiB allocation. Result + snapshot + detached
comparison copies + serialization + retained receipt + compressed/TAR buffers
coexist: these caps are NOT a total memory estimate. Original resource owner must
account them and original 16MiB individual/64MiB aggregate receipt caps, release
preflight brands after full source-owned receipt custody, then reread one archive
per installed comparison. This pure binding does not observe filesystem redirects,
resource availability, private allocation or source drift; factory must refuse
those before effects and preserve original revalidation/failure evidence.

Acceptance here is pure/synthetic only. Actual original native fixture, >64MiB
expanded/large-entry paths, subsequent same-store fresh CLI reuse, interrupted
writer/restart/corruption/stale-source checks and actual MetroPlat importer
receiving remain distinct unperformed native qualifications. Strict publication
and ordinary archive-installed APIs are unchanged.

Composition limit clarification: the unchanged public member reader accepts at
most 64MiB compressed, 256MiB expanded TAR and 256MiB regular payload per archive,
1MiB metadata, and caller member bounds no greater than 100000. V2 further caps
raw headers at 65536. The pure comparator's 1GiB ceiling does not raise these
narrower reader ceilings; the complete composition must satisfy both. Unsupported
larger input refuses before effects, not by widening or falling back to a parser.
