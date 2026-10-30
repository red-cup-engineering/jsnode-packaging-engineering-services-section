#!/usr/bin/env node
/**
 * Calls one tool on a remote MCP server reached through a local stdio
 * bridge process (e.g. the ops.561.group gateway's serve-ops-gateway-stdio.mjs),
 * tolerant of the tool not existing on the remote's current tool list --
 * a headless, one-shot counterpart to the harness's own `.mcp.json`
 * stdio wiring, for admitting findings from a non-interactive job.
 *
 * Plain newline-delimited JSON-RPC over the child's stdio, no MCP SDK.
 */
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const opt = (name) => {
  const at = args.indexOf(name);
  return at >= 0 && args[at + 1] !== undefined ? args[at + 1] : undefined;
};

const bridgeScript = opt("--bridge-script");
const bridgeCwd = opt("--bridge-cwd");
// Named --client-env-file because Node 24 consumes a script's own --env-file before argv reaches it.
const envFile = opt("--client-env-file");
const timeoutMs = Number(opt("--timeout-ms") ?? 300000);
const toolName = opt("--tool");
const inputFile = opt("--input-file");

if (!bridgeScript || !bridgeCwd || !toolName) {
  process.stderr.write(
    "usage: call-ops-gateway-tool.mjs --bridge-script <path> --bridge-cwd <dir> [--client-env-file <path>] --tool <name> [--input-file <path>] [--timeout-ms <n>]\n",
  );
  process.exit(2);
}

/** One JSON-RPC session over a spawned child's stdio: request/response correlated by id. */
function openStdioSession({ command, args: spawnArgs, cwd, env }) {
  const child = spawn(command, spawnArgs, { cwd, env, stdio: ["pipe", "pipe", "pipe"] });
  const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
  const pending = new Map();
  let nextId = 1;
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  lines.on("line", (line) => {
    if (!line.trim()) return;
    let message;
    try { message = JSON.parse(line); } catch { return; }
    if (message.id === undefined) return;
    const resolver = pending.get(message.id);
    if (resolver === undefined) return;
    pending.delete(message.id);
    resolver(message);
  });
  const failAllPending = (error) => {
    for (const [id, resolver] of pending) { pending.delete(id); resolver({ error: { message: error.message } }); }
  };
  child.once("error", failAllPending);
  child.once("exit", (code) => { if (code !== 0) failAllPending(new Error(`bridge exited ${code}: ${stderr}`)); });

  function request(method, params, timeout) {
    const id = nextId++;
    return new Promise((resolvePromise, rejectPromise) => {
      const timer = timeout ? setTimeout(() => { pending.delete(id); rejectPromise(new Error(`${method} timed out after ${timeout}ms`)); }, timeout) : undefined;
      pending.set(id, (message) => {
        clearTimeout(timer);
        if (message.error !== undefined) rejectPromise(Object.assign(new Error(message.error.message ?? "remote error"), { data: message.error }));
        else resolvePromise(message.result);
      });
      child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, ...(params === undefined ? {} : { params }) })}\n`);
    });
  }
  function notify(method, params) {
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method, ...(params === undefined ? {} : { params }) })}\n`);
  }
  async function close() {
    lines.close();
    child.stdin.end();
    child.kill();
  }
  return { request, notify, close, stderr: () => stderr };
}

/**
 * @param {{bridgeScript: string, bridgeCwd: string, envFile?: string, toolName: string, input: unknown, timeoutMs?: number}} options
 * @returns {Promise<Readonly<Record<string, unknown>>>} a report describing
 *   whether the tool call succeeded, was refused (not on the remote's tool
 *   list), or the bridge connection itself failed -- never throws.
 */
export async function callOpsGatewayTool({ bridgeScript, bridgeCwd, envFile, toolName, input, timeoutMs = 300000 }) {
  const nodeArgs = [];
  if (envFile) nodeArgs.push(`--env-file=${resolve(envFile)}`);
  nodeArgs.push(resolve(bridgeScript));

  const session = openStdioSession({ command: process.execPath, args: nodeArgs, cwd: resolve(bridgeCwd), env: { ...process.env } });

  let report;
  try {
    await session.request("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "checkout-repair-admission", version: "1.0.0" } }, timeoutMs);
    session.notify("notifications/initialized");
    const listed = await session.request("tools/list", {}, timeoutMs);
    const available = (listed.tools ?? []).map((tool) => tool.name);
    if (!available.includes(toolName)) {
      report = { ok: false, reason: "tool-not-listed", tool: toolName, available };
    } else {
      try {
        const result = await session.request("tools/call", { name: toolName, arguments: input }, timeoutMs);
        report = { ok: result.isError !== true, reason: result.isError === true ? "tool-error" : "tool-called", tool: toolName, result };
      } catch (error) {
        report = { ok: false, reason: "tool-call-threw", tool: toolName, error: error.message };
      }
    }
  } catch (error) {
    report = { ok: false, reason: "bridge-connect-failed", tool: toolName, error: error.message };
  } finally {
    await session.close().catch(() => {});
  }
  return report;
}

let report;
try {
  const input = inputFile ? JSON.parse(await readFile(resolve(inputFile), "utf8")) : {};
  report = await callOpsGatewayTool({ bridgeScript, bridgeCwd, envFile, toolName, input, timeoutMs });
} catch (error) {
  report = { ok: false, reason: "input-unreadable", tool: toolName, error: error instanceof Error ? error.message : String(error) };
}
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
process.exitCode = report.ok ? 0 : 1;
