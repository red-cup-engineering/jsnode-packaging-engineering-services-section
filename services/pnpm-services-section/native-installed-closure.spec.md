# Read-only installed package inventory

The PNPM owner supplies structural observation to the existing Code frozen-installation receiver. Code retains installation provenance, archive receiving, the private actual result object, and custody transfer; Guix retains machine receiving. This observer grants none of those authorities.

IC1. `observeInstalledClosure({installationRoot})` shall read every actual entry below the real `node_modules` directory with finite path, depth, file and total-byte bounds, hash file contents and literal symlink topology, and reject escaping/broken links, special entries, redirected roots and observed mutations. It performs no execution or writes. This retains extraneous packages rather than selecting only declared roots.

IC2. Each physical package directory at an actual `node_modules/name` or `node_modules/@scope/name` coordinate shall be identified by its bounded manifest bytes and physical coordinate. Distinct PNPM peer instances shall remain distinct even when name/version match. Aliases shall retain their literal path and actual target. Redirected scope and node_modules containers shall refuse; this version does not traverse them. Logical scope classification shall not discard an alias whose physical target basename begins with @. Missing or malformed package manifests shall refuse rather than become an empty inventory.

IC3. Each manifest dependency, development dependency, optional dependency and peer declaration shall retain its category and declared selection. Actual nearest installed package lookup shall record its target or explicit absence without importing code. An existing malformed nearest candidate shall refuse rather than fall through. No missing edge becomes successful receiving. Development edges of dependency packages may be absent in a normal install; this observation does not declare them installation failures.

IC4. `receivingTests` shall be observed without executing tests. An absent declaration is `unavailable`; an explicit empty array is `declared` with zero tests. Declared tests require safe package-relative file paths and present unredirected regular files within that package, preserving byte digest and mode. Malformed or missing declared files refuse. Working installed bytes do not establish committed-source obligations.

IC5. Return a deterministic observation digest over the complete retained topology and package observations; repeat the tree and manifest observations before return and refuse changes. This is bounded best-effort race detection, not an atomic filesystem snapshot or protection against hostile concurrent writers.

IC6. Every result shall explicitly retain `runtimeAcceptance:false`, `nativeExecutionReceived:false`, `archiveVerificationReceived:false`, and `lockCorrespondenceReceived:false`. Full actual package observation is not proof that packages correspond to the native lock. Code must compare this reading within its authentic initial-frozen receipt and reobserve after moving its installation. No version, host, policy, release-age or gate exemption is introduced.

Qualification requires synthetic adverse fixtures independently testing IC1–IC6 and, separately, observation of an actual qualified PNPM-installed closure. Fixture tests alone cannot establish the latter or machine acceptance.
