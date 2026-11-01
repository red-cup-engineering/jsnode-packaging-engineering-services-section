# Native package programmes with reused provider contexts

A code-only change with the same exact runtime dependency declarations must not
trigger another dependency installation or copy of an existing provider graph.
Code receives the changed registry archive with its original bounded TAR/SRI
reader, checks package and source identity, preserves each direct importer's
existing native provider context, and carries only the changed package bytes.

`produceNativePackageProgramme` and its CLI
`produce-native-package-programme input.json receiving.json` take an exact
archive/selection, a previously qualified runtime/package context, one literal
programme entry and an independent absent output directory. Every required
provider's actual manifest must match its exact declaration and remain within
the selected input root. Optional/peer absences remain explicit. Different
nested provider versions retain their original contexts.

The constructor neither installs dependencies nor executes application or
lifecycle code. The original archive reader rejects links, ambiguous paths and
unbounded framing before extraction. Dependency payloads in the archive are
refused before reserving output. The same SRI-verified buffer reaches native
TAR. Carried bytes and executable bits, programme membership and provider
manifest identities are checked before returning a product. Failure retires
only the newly owned output.

This is one selected programme, not a copied complete host release or a
portable/frozen PNPM closure. Its ordinary private root manifest declares the
retained direct bindings and selected programme. No old frozen-lock export is
copied. The returned `providerInputs` remain part of the product's machine
inputs. LAGOON must independently receive their immutability and retain them
through its native input roots before activating the programme; the constructor
does not claim Guix realization, deployment, publication or installation.
Changed dependency declarations still require the normal frozen native
receiving path.

The native receiving cases cover different nested provider versions, exact
prereleases, changed/missing/outside providers, source/SRI mismatch, archive
links and dependency payloads, existing destinations, overlaps and missing
entries. Original provider data is read rather than copied or mutated.

# Native provider declaration and programme scopes

`produceNativePackageProgramme` preserves strict unchanged dependency declarations and root bindings by default. These defaults remain the compatibility contract.

An explicit `dependencyPolicy: "received"` selects providers against the incoming archive's exact declarations. Every provider still must have the exact declared name and version, resolve within the received immutable runtime, and retain its original nested context. This receives a changed bill against actual existing suppliers; it neither follows an ambient override nor installs a missing supplier. A mismatch refuses before output reservation.

An explicit `programmeScope: "package"` carries only the selected package at the private root. The package retains all its received direct providers. Unrelated root providers are not examined, linked or inherited as root optional/peer dependencies. The root scope continues to preserve all original bindings. Both policy choices are in the native programme metadata and receipt.

These policies let the original machine owner deploy a source repair without reproducing a whole host dependency tree or accepting stale declared pins merely because a global override once selected another version. The programme remains specific to its received machine inputs. All `providerInputs` must be retained through the original native root receiver; no portable closure or frozen-lock claim follows.

Receiving retains the original twelve archive/custody/context cases and adds actual changed-pin import, exclusion of poisoned unrelated metadata, missing and wildcard pin refusal, external-provider confinement and unknown-policy refusal. No dependency installation or payload copy is part of this operation.

## Native closed-store programmes

The optional native-only profile is `node-guarded/v1`. The original strict archive producer, root/package scopes, and portable runtime contracts remain available. A native bill is separate from authored source and a portable lock: it binds exact physical provider directories, manifest identities and actual versions, including explicit authored-to-native differences. No manifest pin is rewritten to hide an override.

The source identity is a union. A registry archive retains its real SRI/gitHead identity. A Git SourceSnapshot retains its independently selected repository, commit, tree and complete member-content identity; its authored manifest and all assets remain exact, and new Git bytes are not represented as an already published npm artifact. The initial native Scheme receiving path supports the Git SourceSnapshot case. The existing archive/portable paths remain unchanged.

`produceNativePackageProgramme` may take a complete `sourceSnapshot` instead of an archive, and a `nativeResolution` selection with the guarded profile, optional expected comparison digest and exact provider bindings. It verifies source members, real provider manifests and physical dependency/peer contexts. It produces only `npm.native-store-programme.candidate/v1` observations, never native store authority. Ordinary defaults keep their original strict dependency policy.

The physical context graph includes dependencies, optional overrides, peers and absences, preserving nested contexts and original package boundaries. By default a peer/dependency resolving into the replaced package refuses. An explicitly selected separate frozen dependency role may retain the old package context after original Code independently receives its parent/declaration, Node-selected target and native store identities. The original installed-contract/import reader is reused; the original JavaScript parser/binder plus native Node syntax validation refines static ESM, CJS and createRequire observations one source at a time. Opaque or unresolved source coupling is explicitly retained as partial observation. An empty observed edge set is never a completeness proof.

The Code-owned Node24 synchronous resolve/load guard is part of the immutable programme launcher. Standard ESM, CJS and createRequire resolutions must remain within the changed source or received physical package scopes and must not enter the replaced package outside an independently received retained context. Self exports, imports maps, native package format and relative assets retain Node semantics. The launcher rejects conflicting preload/resolution environment before starting Node. This profile is a standard module-resolution boundary, not an arbitrary JavaScript or process sandbox; replacement resolver hooks and unreceived independent child programmes are outside its contract. General Node and portable capabilities are not withdrawn.

### Native constructor and receiving

`(native-code-programme)` owns private construction/product record types. `native-code-construction` takes a source candidate and literal entry, plus operating-selected existing immutable Node, parser and policy suppliers, a canonical bill Data file and exact incumbent package scope. Product JSON cannot replace these inputs or choose an observer script. The original Code source files form a small hash-bound observer worker; this is source-caller receiving, not a claim of a fully installed Code package.

Before source import, the constructor uses its own original Guix store connection to receive registered roots, native NAR hashes and reference edges, and runs the selected Code observer. Provider subpaths remain confined subpaths of their actual registered store roots. Existing provider trees are explicit gexp inputs and are never passed through recursive local-file. Only the changed source and small metadata are imported/copied. The resulting product includes the original guarded launcher and source/bill provenance; its native references retain the exact provider and observer closures.

The caller uses original Guix build, root and terminal-outcome custody. The constructor does not activate a profile or service. `receive-native-code-output` requires the original private construction, exact derivation output, actual registered output, independently received reference closure and fresh original observer receiving before issuing the private native Code product.

LAGOON accepts that product only through an explicit `native-code-receiver` procedure selected by the trusted operating Scheme declaration. A callback boolean, manifest tag, arbitrary file-like or product-supplied checker cannot mint it. The received private record fixes the programme runtime and entry. Without this explicit selection the original portable branch is unchanged. Generic Node remains available separately; the native programme launcher is not relabeled as a general-purpose Node CLI.

Native tests must receive actual Node24 ESM/self/imports/CJS/createRequire/asset behavior and root-peer refusal, actual Guix registered references/requisites and small NAR size, changed source and provider tamper, unknown/missing roots, and typed CDE acceptance/refusal. Source tests, native fixture results, publication and actual operating adoption remain separate. No whole dependency graph is installed, no compaction occurs, and no physical reserve or release admission is waived.

The programme Node mode pins `--no-global-search-paths`; ambient HOME aliases cannot turn a declared absence into a supplier. Original Worker/fork wrappers preserve standard caller arguments/options while carrying the pinned guard even for `execArgv: []`, including CJS/builtin aliases. Unreceived alternate Node, preload, conditions and global-search modes refuse. Independent external CLI tools keep their own contracts. The original CDE consumer uses the guarded runtime for every declared programme-owned Node entrance, including auxiliary checks and stop carriers.

The observer uses the package-relative entry; the private product exposes its actual canonical tree coordinate `node_modules/<package>/<entry>`. CDE must bind both source selection and this tree entrance to the private product. Registered roots are represented by the original Code-owned Guix input type: lowering rechecks registration and expansion retains the exact root plus confined subpath without importing provider contents. Source caller files are regular members of one small immutable Code layout so relative Scheme/module paths retain meaning.

Construction metadata binds stable source members, canonical bill, immutable provider roots/NAR observations and selected Node/observer/guard code. It excludes process IDs, time, temporary source addresses and operation receipts. An already received private product may supply the exact source input on a repeated construction with the same independently received code/bill/store observations. Two distinct source directories with identical bytes must select the same output and avoid a second source import. Portable locks and manifests keep their authored identities; native resolution facts do not relabel them.

### Replay the native store regression

`test/native-code-programme.guix.mjs` is an explicitly native integration test, separate from the ordinary Node suites. Run it with the selected existing Node and `--no-global-search-paths --experimental-vm-modules --experimental-import-meta-resolve`, followed by one credential-free JSON argument. The argument selects canonical existing `node`, `guile`, `guixModules`, `guixCompiled`, `sourceCaller` (the received regular-file Code source caller), `parser`, `policy`, and `archiveReader` paths. It never launches Corepack, installs packages, fetches source or builds missing native prerequisites. Missing inputs/mode are explicitly UNRECEIVED before fixture creation.

The test recreates the exercised few-file synthetic source and provider fixture, builds/receives the original typed Code product, runs the actual store entry and guarded children, and verifies two distinct source directories reuse one product/source input. The optional `cdeTest`, `cdeSource`, `cdeModules` trio selects the original CDE-owned native Scheme regression and source/helper context; either select all three or none. Its constructor receives the actual tree entry and rejects boolean, wrong-entry and other-source products without building or activating a Systems generation.

Live test inputs/products have temporary original Guix roots. Successful terminal tests retire owned RAM/roots and only newly owned synthetic products through native delete-specific; pre-existing borrowed products remain. An unread/failed effect is explicitly retained with its exact fixture identity for the invoking original owner to reconcile; it is never claimed as successful cleanup. This test grants no release, profile, service, physical-capacity or resume authority. The first native Scheme profile receives independently selected Git SourceSnapshot members; the existing archive/portable producer capability remains unchanged.

The invoking original owner prepares one empty private RAM root and binds it plus the exact native input object in its existing canonical record before native effects. Select that record with `ownerRecord` and the field path array `ownerField`; the selected Data is `{kind:"native-code-guix-test-custody/v1",root,inputs}`, where `inputs` is the argument object without those two custody locator fields. The test only receives this existing ownership Data; it does not create a new audit service or journal. Ordinary terminal FAIL retires its known owned fixtures just like PASS. Genuine unknown native outcomes retain the original prepared owner custody and RAM/roots. `failAfterFixture:true` is the declared negative testcase: a fixed source comment makes a small distinct synthetic product, then an assertion verifies terminal-failure retirement without changing live source or borrowed products. Root/PID/time are never product identity inputs.

### Separate retained dependency contexts

A new programme's own source need not erase an unchanged provider's older dependency. The optional bill field `retainedContextEdges` selects closed records with `parentDirectory,parentName,parentVersion,parentManifestSHA256,field,name,declared,directory,version,manifestSHA256`. Every selected edge must actually be reached in the original physical provider graph, and Code independently reobserves both manifests, the authored field/declaration and Node's actual target. Authored and actual versions remain distinct facts. Missing, altered or unused selections refuse. No selection preserves the original old-context refusal.

The original reader and programme resolve hook distinguish the default own entry/self/imports context from the selected frozen dependency context. Old-context relative imports, self exports and private imports retain standard Node behavior. Explicit `createRequire(receivedProviderURL)`, including builtin aliases, is standard context selection and may use the received older dependency. It is not an unforgeable JavaScript initiator or security principal. Normal own-context direct old references and unreceived/outside contexts refuse; this is a standard resolution profile rather than a JavaScript/OS sandbox. Load-hook receiving never creates a parent role. No provider partition is copied or retargeted.

The focused native regression keeps both versions under an independently received ordinary dependency role, tests ESM/CJS self/private/relative paths, normal direct-old refusals, explicit ordinary/opaque received-context selection, unqualified/outside negatives and identity tamper. Existing strict/default, Worker/fork, owner-custody and terminal cleanup tests remain. Retained-context secondary child entries are explicitly unselected in this bounded profile; incoming programme Worker/fork use their original guarded launch path.


### Composing registered native provider contexts

A live native provider bill binding MAY carry contextRoot, a canonical direct registered Guix store item. This anchor is distinct from the package directory: importing a small source item does not itself register outgoing provider references. The original Code native-code-provider-inputs receiver SHALL query the anchor's registered requisites and native NAR/reference identities, require the canonical package source item within that closure, and issue its private context observation. The original constructor SHALL independently re-receive the same selected anchor and compare the complete derived root set with the candidate's advisory providerRoots. A candidate array, syntax-only store path, or serialized contextRoot SHALL NOT grant native-store authority.

An omitted contextRoot preserves the original direct registered source-root selection and identity. A supplied anchor changes the pure bill identity. Unknown fields, accessors, noncanonical or nested anchor roots, and anchors on absent bindings SHALL refuse. Package name, actual version, manifest identity, source members and physical Node contexts retain their original independent receiving. Composition SHALL reference unchanged provider store items, never recursively re-import their payloads. The existing portable producer and its default dependency policy remain unchanged.

The explicit native regression test/native-provider-inputs.guix.mjs takes existing qualified inputs and an owner RAM directory. It receives a real anchor/source closure, refuses an unrelated registered anchor, an unregistered anchor, and a tampered manifest at the original constructor before product import/build. Missing inputs produce UNRECEIVED before fixture allocation. Its only allocations are owned small RAM bill fixtures, retired in finally; it neither builds nor mutates the Guix store. This is distinct from ordinary Node-only QA.


### Low-data native formation and immutable observation reuse

The native v2 candidate SHALL preserve the entire physical context graph losslessly as deterministic gzip of canonical JSON with its UTF-8 byte count and SHA256, and retain a separate logical context identity. Unknown/alternate encodings and invalid Data SHALL refuse. The original native v1 prepared-source receiver and explicit identity encoding remain supported; portable production and its strict dependency defaults remain unchanged. Compression is representation, never store or source authority.

The ORIGINAL Code source-construction procedure SHALL choose its own pinned source-bound worker, existing producer, Node/parser/policy suppliers, independently derived registered native roots and operating bill. A source reference selects an existing ordinary Data record and field containing the complete Git SourceSnapshot. Before creating a destination, an existing caller-owned formation-custody record SHALL bind that destination, source commit/content identity and owner in prepared state. The original worker SHALL perform the existing producer call itself and use that SAME actual observation. Public producer results/candidate JSON remain advisory. No caller-supplied script, serialized observation or skip flag SHALL issue the private construction/product.

The private Scheme constructor SHALL independently receive native NAR/reference identities before and after its terminal worker, bind every source/member/bill/entry/Node/parser/observer fact, and issue its OWN immutable input receipt. Only that internally selected receipt MAY be used by the original builder and final receiver. Each reuse SHALL receive the current own-source bytes, exact provider links/manifests, source-code identities and Node mode; native input identities and complete registered references remain independently checked by the original store connection. Changed facts SHALL refuse. The compact runtime scope projection SHALL come from that SAME actual graph and preserve all package/peer/retained-role contexts. Normal launches SHALL read this projection rather than inflate and re-observe the full graph. Builder diagnostics SHALL summarize identities rather than duplicate full context payloads.

Per-observation manifest, native-selection and canonical-path caches MAY avoid repeated reads of the same immutable context, with final metadata/native identity receiving preserved. Direct registered-store root admission SHOULD use exact root sets; generic preexisting path behavior remains available. No cache creates an allocation permission, hides absent suppliers, changes Node flags, drops opaque facts or turns this resolution profile into an OS/JavaScript sandbox.

The operation caller retains its existing prepared ownership record through formation/lowering/build/receiving. A terminal producer failure SHALL retire only its own newly created destination through the original producer cleanup; an unknown process/store outcome SHALL retain the exact declared candidate/custody for receiving, without replay or age cleanup. Completed temporary source/roots SHALL be retired by that original owner after useful publication and exact product/consumer receiving. Record paths, temporary source roots, clocks and actor IDs SHALL NOT enter immutable product identity.
