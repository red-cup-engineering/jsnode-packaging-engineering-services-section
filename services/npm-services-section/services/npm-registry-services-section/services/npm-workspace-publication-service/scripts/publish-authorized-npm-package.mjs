#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  admitOperationsAuthorization,
  measureArtifact,
  publicationWitness,
} from "../src/publication.mjs";
import { readRegistryVersion, runCommand } from "../src/runner.mjs";

function argumentsOf(values) {
  const out = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith("--")) throw new Error(`unexpected argument ${value}`);
    const name = value.slice(2);
    const next = values[index + 1];
    if (next === undefined || next.startsWith("--")) throw new Error(`--${name} requires a value`);
    out[name] = next;
    index += 1;
  }
  return out;
}

function required(args, name) {
  const value = args[name];
  if (typeof value !== "string" || value.trim() === "") throw new Error(`--${name} is required`);
  return value.trim();
}

async function json(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function main() {
  const args = argumentsOf(process.argv.slice(2));
  const plan = await json(resolve(required(args, "plan")));
  const authorization = await json(resolve(required(args, "authorization")));
  const artifactPath = resolve(required(args, "artifact"));
  const artifact = await measureArtifact(artifactPath);

  admitOperationsAuthorization(authorization, plan);
  if (
    artifact.integrity !== plan.artifact?.integrity
    || artifact.shasum !== plan.artifact?.shasum
    || artifact.ni !== plan.artifact?.ni
  ) {
    throw Object.assign(new Error("artifact bytes do not match the Operations-authorized plan"), {
      code: "ARTIFACT_PLAN_MISMATCH",
    });
  }
  if (plan.registryState === "immutable-conflict") {
    throw Object.assign(new Error("the requested immutable package version already exists with different bytes"), {
      code: "IMMUTABLE_VERSION_CONFLICT",
    });
  }

  let observed = await readRegistryVersion({
    name: plan.package.name,
    version: plan.package.version,
    registry: plan.registry,
  });

  let effect = "already-published-verified";
  if (observed.found !== true) {
    await runCommand("npm", [
      "publish",
      artifactPath,
      "--ignore-scripts",
      "--tag",
      plan.package.tag,
      "--registry",
      plan.registry,
    ]);
    effect = "published";
    observed = await readRegistryVersion({
      name: plan.package.name,
      version: plan.package.version,
      registry: plan.registry,
    });
  }
  if (observed.found !== true) throw new Error("published package could not be read back from the canonical registry");

  const witness = publicationWitness({
    plan,
    authorization,
    artifact,
    registryManifest: observed.manifest,
    effect,
  });
  process.stdout.write(`${JSON.stringify(witness, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.code ?? error.name ?? "ERROR"}: ${error.message}\n`);
  process.exitCode = 1;
});
