#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { packSourceRegistryClosure } from "../src/source-registry-closure.mjs";

const [input, destination, output] = process.argv.slice(2);
if (!input || !destination || !output) throw new Error("expected admitted plan, artifact directory and receipt path");
const inputText = await readFile(input, "utf8"), requestDigest = createHash("sha256").update(inputText).digest("hex");
const plan = JSON.parse(inputText);
await writeFile(`${output}.process.json`, `${JSON.stringify({ pid: process.pid, requestDigest, input })}\n`);
const receipt = await packSourceRegistryClosure(plan, { destination, onProgress: async (receipt, name) => {
  await writeFile(output, `${JSON.stringify({ ...receipt, requestDigest, phase: "packing" }, null, 2)}\n`);
  console.log(JSON.stringify({ packed: receipt.packages.length, name, refusals: receipt.refusals.length }));
} });
await writeFile(output, `${JSON.stringify({ ...receipt, requestDigest, phase: receipt.refusals.length ? "refused" : "complete" }, null, 2)}\n`);
if (receipt.refusals.length) process.exitCode = 1;
