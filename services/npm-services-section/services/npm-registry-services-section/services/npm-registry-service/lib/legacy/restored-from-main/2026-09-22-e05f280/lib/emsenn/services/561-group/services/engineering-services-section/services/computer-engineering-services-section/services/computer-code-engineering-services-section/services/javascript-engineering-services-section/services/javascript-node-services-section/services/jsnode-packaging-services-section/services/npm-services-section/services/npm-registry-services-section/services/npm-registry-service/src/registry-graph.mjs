// Compatibility facade: graph derivation and rendering now belong to the
// narrow graph service. Keep this path while callers migrate.
export {
  deriveRegistryGraph,
  groupRegistryGraphDefects,
  renderRegistryGraphDot,
} from "@red-cup-engineering/npm-registry-graph-services-section";
