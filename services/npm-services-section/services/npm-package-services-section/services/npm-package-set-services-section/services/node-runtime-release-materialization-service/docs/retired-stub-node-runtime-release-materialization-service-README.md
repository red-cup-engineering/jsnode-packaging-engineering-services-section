# Node runtime release materialization service

This service converts one independently owned Node carrier plus explicitly admitted provider sources into an isolated release directory.
The directory name is the SHA-256 digest of the runtime files, and `release-receipt.json` identifies every included package and exact version.

It deliberately does not run a package manager or discover neighboring packages.
A release therefore cannot silently repair an undeclared import by consulting ambient workspace links.

The provider file is a JSON object from package identity to explicitly admitted source directory:

```json
{
  "@red-cup-engineering/example-provider": "/materialized/sources/example-provider"
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
