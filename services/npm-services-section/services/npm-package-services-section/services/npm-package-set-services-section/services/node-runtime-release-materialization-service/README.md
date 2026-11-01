# Node runtime release materialization service

This service converts one independently owned Node carrier plus explicitly admitted providers into an isolated release directory.
The directory name is the SHA-256 digest of the runtime files, and `release-receipt.json` identifies every included package and exact version.

It deliberately does not run a package manager or discover neighboring packages.
A release therefore cannot silently repair an undeclared import by consulting ambient workspace links.
Materialization and verification also resolve every observed bare runtime import through the packaged manifest and refuse an absent or unexported runtime carrier.

Providers are either an explicitly admitted source directory or an immutable npm tarball admission.
The service never calls npm, consults a registry, walks a workspace, or follows a tar member link.
It verifies the tarball's SHA-512 integrity, extracts only regular files and directories below `package/`, and checks the contained package identity and exact version before dependency traversal.

The provider file is a typed JSON object:

```json
{
  "type": "NodeRuntimeProviderAdmission",
  "version": 1,
  "sources": {
    "@red-cup-engineering/source-provider": "/materialized/sources/source-provider"
  },
  "tarballs": {
    "third-party-provider": {
      "name": "third-party-provider",
      "version": "2.3.4",
      "integrity": "sha512-BASE64_SHA512_DIGEST",
      "tarballPath": "/admission/tarballs/third-party-provider-2.3.4.tgz"
    }
  }
}
```

```bash
materialize-node-runtime-release \
  --entry /materialized/sources/example-application \
  --providers /admission/provider-sources.json \
  --output /path/to/releases
```

The returned JSON names the release directory and executable entry carrier;
promotion and verification are separate operations.

For several independently executable roots, pass an entry catalog rather than constructing one synthetic application:

```json
[
  { "id": "channel-a-daily", "entryPackageDirectory": "/sources/channel-a-daily" },
  { "id": "channel-b-hourly", "entryPackageDirectory": "/sources/channel-b-hourly" }
]
```

```bash
materialize-node-runtime-release \
  --entries /admission/runtime-entries.json \
  --providers /admission/providers.json \
  --output /path/to/composition
```

Entries are ordered by `id` and materialized as independent content-addressed releases, so incompatible roots are not forced into one dependency singleton.
The resulting `catalogs/<digest>/runtime-release-catalog.json` uses only digest-bound relative release references and is stable across host paths and input order.
`verify-node-runtime-release` accepts either a release directory or that catalog directory and verifies every release after materialization.

The legacy flat source-provider object remains accepted by the CLI for existing callers.
A `NodeRuntimeProviderCatalog` produced by the npm workspace publication service
is also accepted directly as `--providers`; its declared entries become the
multi-entry release catalog without an additional translation step. Its
per-edge lock selection evidence is copied into each release receipt. This is
the sole authority for normalizing a ranged runtime dependency to an exact
admitted provider, and verification rechecks the selected package version and
tarball integrity after materialization without making a registry choice.
