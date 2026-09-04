#!/usr/bin/env node
/**
 * End-to-end MCP verification: spawns the Arabian MCP server over stdio,
 * performs the JSON-RPC handshake, and exercises every tool the way a real
 * client (Claude Desktop, Cursor, Codex...) would.
 *
 * Usage: node scripts/mcp-check.mjs
 */
import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(fileURLToPath(new URL("..", import.meta.url)));
const SERVER = join(REPO, "dist", "mcp", "main.js");

let passed = 0;
let failed = 0;
function check(name, ok, detail = "") {
  if (ok) {
    passed++;
    console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

class McpClient {
  constructor(root) {
    this.proc = spawn("node", [SERVER], {
      env: { ...process.env, ARABIAN_ROOT: root },
      stdio: ["pipe", "pipe", "inherit"],
    });
    this.nextId = 1;
    this.buffer = "";
    this.waiters = [];
    this.proc.stdout.setEncoding("utf8");
    this.proc.stdout.on("data", (chunk) => {
      this.buffer += chunk;
      let idx;
      while ((idx = this.buffer.indexOf("\n")) !== -1) {
        const line = this.buffer.slice(0, idx).trim();
        this.buffer = this.buffer.slice(idx + 1);
        if (!line) continue;
        const msg = JSON.parse(line);
        const waiter = this.waiters.find((w) => w.id === msg.id);
        if (waiter) {
          this.waiters = this.waiters.filter((w) => w !== waiter);
          waiter.resolve(msg);
        }
      }
    });
  }

  request(method, params) {
    const id = this.nextId++;
    return new Promise((res, rej) => {
      this.waiters.push({ id, resolve: res, reject: rej });
      this.proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
      setTimeout(() => rej(new Error(`timeout waiting for ${method} (id ${id})`)), 8000);
    });
  }

  async init() {
    await this.request("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "mcp-check", version: "0.0.1" },
    });
    this.proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
  }

  async tool(name, args = {}) {
    const res = await this.request("tools/call", { name, arguments: args });
    if (res.result?.isError) throw new Error(`tool ${name} errored: ${res.result.content?.[0]?.text}`);
    return JSON.parse(res.result.content[0].text);
  }

  close() {
    this.proc.kill();
  }
}

// ---- Phase 1: read-only tools against this repo's dogfooded lineage ----
console.log("\nPhase 1 — read-only tools against the real .arabian/");
{
  const client = new McpClient(REPO);
  await client.init();

  const tools = await client.request("tools/list", {});
  const names = tools.result.tools.map((t) => t.name).sort();
  check("tools/list", names.length === 10, `${names.length} tools: ${names.join(", ")}`);

  const listed = await client.tool("arabian_list_nodes", {});
  const expectedNodes = readdirSync(join(REPO, ".arabian", "nodes")).filter((f) => f.endsWith(".json")).length;
  check("arabian_list_nodes", listed.count === expectedNodes, `${listed.count} nodes on disk`);

  const hits = await client.tool("arabian_search", { query: "graph over tree" });
  check(
    "arabian_search",
    hits.hits.some((h) => h.title === "Graph over tree"),
    `top hit: ${hits.hits[0]?.title}`,
  );

  const decision = listed.nodes.find((n) => n.title === "Graph over tree");
  const displayId = `${decision.id.slice(0, 10)}${decision.id.slice(-4)}`;
  const node = await client.tool("arabian_get_node", { id: displayId });
  check(
    "arabian_get_node (display id)",
    node.node.title === "Graph over tree" && node.incoming.length > 0,
    `${node.incoming.length} incoming / ${node.outgoing.length} outgoing`,
  );

  // 14-char prefixes of same-millisecond nodes are genuinely ambiguous → clean error
  const amb = await client.request("tools/call", { name: "arabian_get_node", arguments: { id: decision.id.slice(0, 14) } });
  check(
    "ambiguous prefix → clean error",
    amb.result.isError === true && /ambiguous/.test(amb.result.content?.[0]?.text ?? ""),
    amb.result.content?.[0]?.text?.slice(0, 60),
  );

  const lineage = await client.tool("arabian_get_lineage", { id: decision.id, hops: 2 });
  check("arabian_get_lineage", lineage.nodes.length >= 5, `${lineage.nodes.length} nodes within 2 hops`);

  const graph = await client.tool("arabian_get_graph", {});
  check(
    "arabian_get_graph",
    graph.nodes.length === listed.count && graph.edges.length > 0,
    `${graph.nodes.length} nodes / ${graph.edges.length} edges`,
  );

  client.close();
}

// ---- Phase 2: write tools against a throwaway project ----
console.log("\nPhase 2 — write tools against a temp project");
const tmp = mkdtempSync(join(tmpdir(), "arabian-mcp-check-"));
execFileSync("node", [join(REPO, "dist", "cli", "index.js"), "init", "--name", "mcp-check"], { cwd: tmp });
{
  const client = new McpClient(tmp);
  await client.init();

  const q = await client.tool("arabian_create_node", {
    type: "question",
    title: "MCP write check?",
    createdBy: { kind: "agent", name: "mcp-check" },
  });
  check("arabian_create_node (question)", !!q.id, q.id);

  const a = await client.tool("arabian_create_node", { type: "alternative", title: "Option A" });
  const edge = await client.tool("arabian_create_edge", { from: q.id, to: a.id, type: "considers" });
  check("arabian_create_edge", edge.type === "considers", `${edge.from.slice(0, 10)}… → ${edge.to.slice(0, 10)}…`);

  const d = await client.tool("arabian_create_node", {
    type: "decision",
    title: "Pick A",
    fileRefs: ["src/store.ts"],
  });
  await client.tool("arabian_create_edge", { from: q.id, to: d.id, type: "led_to" });

  const updated = await client.tool("arabian_update_node", { id: d.id, status: "accepted" });
  check("arabian_update_node", updated.status === "accepted", updated.status);

  const sup = await client.tool("arabian_supersede", {
    oldId: d.id,
    title: "Pick B instead",
    description: "New info",
  });
  check(
    "arabian_supersede",
    sup.newNode.status === "accepted" && sup.edge.type === "supersedes",
    `new: ${sup.newNode.title}`,
  );
  const oldAfter = await client.tool("arabian_get_node", { id: d.id });
  check("  old decision marked superseded", oldAfter.node.status === "superseded", oldAfter.node.status);

  // get_context returns readable text (not JSON) — use the raw response
  const ctx = await client.request("tools/call", {
    name: "arabian_get_context",
    arguments: { files: ["src/store.ts:10-20"] },
  });
  const ctxText = ctx.result?.content?.[0]?.text ?? "";
  check(
    "arabian_get_context",
    !ctx.result.isError && ctxText.includes("Relevant engineering context") && ctxText.includes("Pick B instead"),
    ctxText.split("\n").slice(0, 2).join(" / ").slice(0, 70),
  );

  const miss = await client.request("tools/call", {
    name: "arabian_get_context",
    arguments: { files: ["src/unknown.ts"] },
  });
  check(
    "arabian_get_context (miss) → recording nudge",
    !miss.result.isError && /No recorded lineage/.test(miss.result.content?.[0]?.text ?? ""),
    miss.result.content?.[0]?.text?.slice(0, 60),
  );

  const lineage = await client.tool("arabian_get_lineage", { id: q.id, hops: 3 });
  check("arabian_get_lineage after writes", lineage.nodes.length === 4 && lineage.edges.length === 3, `${lineage.nodes.length} nodes / ${lineage.edges.length} edges`);

  // error path: unknown id returns a clean tool error, not a crash
  const res = await client.request("tools/call", { name: "arabian_get_node", arguments: { id: "ZZZZZZZZZZZZ" } });
  check("unknown id → clean error", res.result.isError === true, res.result.content?.[0]?.text?.slice(0, 60));

  // files actually landed on disk in the expected layout
  const files = readdirSync(join(tmp, ".arabian", "nodes"));
  check("storage layout", files.length === 4 && files.every((f) => /^[0-9A-HJKMNP-TV-Z]{26}\.\w+\.json$/.test(f)), `${files.length} node files`);

  client.close();
}
rmSync(tmp, { recursive: true, force: true });

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
