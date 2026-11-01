# npm package packing service

`@red-cup-engineering/npm-package-packing-service` packs one **already
projected** carrier directory into an explicit destination. It runs `npm pack`
with lifecycle scripts disabled, uses a per-call cache outside both caller
directories, accepts exactly one tarball from npm's JSON report, and verifies
that the named result is a regular `.tgz` file contained by that destination.

```js
import { packNpmPackage } from "@red-cup-engineering/npm-package-packing-service";

const artifact = await packNpmPackage({
  carrierDirectory: "/work/projected-carrier",
  destinationDirectory: "/work/artifacts",
});
// { artifactPath: "/work/artifacts/customer-package-1.0.0.tgz", filename: "customer-package-1.0.0.tgz" }
```

The service deliberately does not project source files or manifests, choose
release candidates, measure artifacts, or create registry metadata. Callers
must perform those separate responsibilities before or after this boundary.
For tests, pass an `execute(command, args, options)` function; failures use
`NpmPackagePackingError` with stable `code` values.
