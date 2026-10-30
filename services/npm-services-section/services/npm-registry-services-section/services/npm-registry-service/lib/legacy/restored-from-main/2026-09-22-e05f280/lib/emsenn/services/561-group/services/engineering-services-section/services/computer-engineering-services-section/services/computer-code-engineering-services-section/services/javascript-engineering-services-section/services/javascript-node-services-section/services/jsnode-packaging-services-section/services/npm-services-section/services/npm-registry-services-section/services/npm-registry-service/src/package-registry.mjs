// Compatibility facade. buildPackageRegistry itself is gone (superseded by
// npm-registry-snapshot-publication-service's immutable snapshot construction
// and pointer activation); nothing calls it any more, so it is not kept here
// even as a throwing stub.
export { recoverPackageRegistryReceipt } from "@red-cup-engineering/semiotic-npm-registry-services-section/recover-package-registry-receipt";
export { assemblePackageRegistrySnapshot } from "@red-cup-engineering/npm-registry-snapshot-services-section/assemble-package-registry-snapshot";
export { verifyPackageRegistrySnapshot } from "@red-cup-engineering/npm-registry-snapshot-services-section/verify-package-registry-snapshot";
export { createPackageRegistryServer, resolvePackageRegistryRequest, rewriteMetadataTarballOrigins } from "@red-cup-engineering/npm-registry-read-service";
