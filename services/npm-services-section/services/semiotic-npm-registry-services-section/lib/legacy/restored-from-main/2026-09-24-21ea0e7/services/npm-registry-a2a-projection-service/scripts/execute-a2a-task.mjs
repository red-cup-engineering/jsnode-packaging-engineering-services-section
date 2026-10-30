#!/usr/bin/env node
import { executeRelationalOperationMessage } from "@red-cup-engineering/a2a-services-section/sovereign-operation-boundary";
import { registrySnapshotProtocol } from "../src/protocol.mjs";
import { obtainRegistrySnapshot } from "../src/snapshot.mjs";
import { runJavascriptNodeOperation } from "../../../../../../../../../src/operation.mjs";

const operations = Object.freeze({ "obtain-package-registry-snapshot": obtainRegistrySnapshot });

// This package translates messages; it does not know where a registry lives
// or how one is served. Whoever runs an A2A face for a registry supplies both.
export function executeA2aMessage(source, environment = process.env) {
  const registryRoot = environment.REGISTRY_ROOT;
  const registryUrl = environment.REGISTRY_URL;
  if (!registryRoot || !registryUrl) throw new Error("REGISTRY_ROOT and REGISTRY_URL are required");
  return executeRelationalOperationMessage(source, {
    protocol: registrySnapshotProtocol,
    operations,
    runtimeLoader: async () => Object.freeze({ registryRoot, registryUrl }),
    responseFilename: "package-registry-snapshot.rmn.cbor",
    unknownOperationMessage: "unknown package registry operation",
  });
}

if (import.meta.main) {
  const result = await runJavascriptNodeOperation({ name: "execute-a2a-task", description: "executeA2aMessage — the execute-a2a-task operation.", operation: executeA2aMessage }, { arguments: process.argv.slice(2), standardInput: process.stdin, standardOutput: process.stdout });
  process.exitCode = result.exitCode;
}
