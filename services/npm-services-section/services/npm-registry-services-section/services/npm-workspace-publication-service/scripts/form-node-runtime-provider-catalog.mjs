#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import process from "node:process";
import { formNodeRuntimeProviderCatalog } from "../src/runtime-provider-catalog.mjs";
import { argument, requiredArgument } from "@red-cup-engineering/javascript-node-services-section/argv";

const sourceRootsFile = argument("--source-roots");
const catalog = await formNodeRuntimeProviderCatalog({
  workspaceRoot: requiredArgument("--workspace"),
  sourceRoots: sourceRootsFile === undefined || sourceRootsFile === null ? undefined : JSON.parse(await readFile(sourceRootsFile, "utf8")),
  entries: JSON.parse(await readFile(requiredArgument("--entries"), "utf8")),
  registry: requiredArgument("--registry"),
  outputDirectory: requiredArgument("--output"),
  entryProvider: argument("--entry-provider") ?? "source",
});
process.stdout.write(`${JSON.stringify(catalog)}\n`);
