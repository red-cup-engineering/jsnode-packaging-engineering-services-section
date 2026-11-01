#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { publishSourceRegistryClosure } from "../src/source-registry-closure.mjs";

const [input, destination, output, tag] = process.argv.slice(2);
if (!input || !destination || !output) throw new Error("expected fixed artifact receipt, receiving directory, output receipt and optional npm tag");
const packed = JSON.parse(await readFile(input, "utf8"));
await publishSourceRegistryClosure(packed, { receivingDirectory: destination, tag, onProgress: async (receipt, name) => {
  await writeFile(output, `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(JSON.stringify({ received: receipt.packages.length, name }));
} });
