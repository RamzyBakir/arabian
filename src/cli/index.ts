#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  Store,
  StoreError,
  findStoreRoot,
  getStats,
  initProject,
  matchNodeId,
  searchNodes,
  getLineage,
  NODE_STATUSES,
  NODE_TYPES,
  EDGE_TYPES,
  type Actor,
  type EdgeType,
  type LineageEdge,
  type LineageNode,
  type NodeType,
} from "../core/index.js";
import { serve } from "../server/http.js";

// ---- tiny ANSI helpers (disabled when not a TTY or NO_COLOR is set) ----

const USE_COLOR = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;

const c = {
  reset: "\x1b[0m",
  bold: (s: string) => (USE_COLOR ? `\x1b[1m${s}\x1b[0m` : s),
  dim: (s: string) => (USE_COLOR ? `\x1b[2m${s}\x1b[0m` : s),
  red: (s: string) => (USE_COLOR ? `\x1b[31m${s}\x1b[0m` : s),
  green: (s: string) => (USE_COLOR ? `\x1b[32m${s}\x1b[0m` : s),
  amber: (s: string) => (USE_COLOR ? `\x1b[33m${s}\x1b[0m` : s),
  blue: (s: string) => (USE_COLOR ? `\x1b[34m${s}\x1b[0m` : s),
  magenta: (s: string) => (USE_COLOR ? `\x1b[35m${s}\x1b[0m` : s),
  cyan: (s: string) => (USE_COLOR ? `\x1b[36m${s}\x1b[0m` : s),
};

const TYPE_COLORS: Record<NodeType, (s: string) => string> = {
  question: c.amber,
  alternative: c.magenta,
  decision: c.blue,
  experiment: c.magenta,
  implementation: c.green,
  outcome: c.cyan,
  constraint: c.red,
};

const EDGE_HINTS: Record<EdgeType, string> = {
  led_to: "question → decision",
  considers: "question → alternative",
  chooses: "decision → alternative",
  rejects: "decision → alternative",
  supersedes: "decision → decision (new → old)",
  implements: "implementation → decision",
  produces: "experiment → outcome",
  constrains: "constraint → question|decision",
  triggers: "outcome → question (the cycle)",
  references: "any → any",
};

const USAGE = `arabian — local-first engineering lineage

Usage:
  arabian init [--name <name>] [--description <text>]     Create .arabian/ in this directory
  arabian add <type> <title> [options]                    Create a node
      -d, --description <text>   Markdown description
      -s, --status <status>      Default depends on type
      -t, --tag <tag>            Repeatable
      -f, --file <path>          Link a file (repeatable)
      --actor <kind:name[:model]>  e.g. human:Ramzy or agent:Codex:gpt-5
  arabian link <edge-type> <from-id> <to-id> [--note <text>] [--actor ...]
  arabian list [type] [--status <status>] [--tag <tag>]
  arabian show <id> [--hops <n>] [--direction up|down|both]
  arabian search <query>
  arabian stats
  arabian skill [--dir <path>] [--force]          Install the agent skill (SKILL.md)
  arabian serve [--port <n>] [--host <addr>] [--web-dir <path>]   Web UI + API
  arabian mcp                                                      MCP server (stdio)

Node types:   ${NODE_TYPES.join(", ")}
Statuses:     ${NODE_STATUSES.join(", ")}
Edge types:   ${EDGE_TYPES.map((t) => `${t} (${EDGE_HINTS[t]})`).join("\n              ")}
`;

// ---- arg parsing ----

interface Parsed {
  flags: Map<string, string[]>;
  args: string[];
}

function parseArgs(argv: string[]): Parsed {
  const flags = new Map<string, string[]>();
  const args: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith("--") || (a.startsWith("-") && a.length === 2)) {
      const key = a.replace(/^--?/, "");
      const eq = key.indexOf("=");
      if (eq !== -1) {
        push(key.slice(0, eq), key.slice(eq + 1));
      } else if (i + 1 < argv.length && !argv[i + 1]!.startsWith("-")) {
        push(key, argv[++i]!);
      } else {
        push(key, "true");
      }
    } else {
      args.push(a);
    }
  }
  return { flags, args };

  function push(k: string, v: string) {
    const list = flags.get(k) ?? [];
    list.push(v);
    flags.set(k, list);
  }
}

function one(flags: Map<string, string[]>, ...names: string[]): string | undefined {
  for (const n of names) {
    const v = flags.get(n)?.[0];
    if (v !== undefined) return v;
  }
  return undefined;
}

function parseActor(spec: string | undefined): Actor | undefined {
  if (!spec) return undefined;
  const [kind, name, model] = spec.split(":");
  if ((kind !== "human" && kind !== "agent") || !name) {
    throw new StoreError("invalid", `--actor must look like human:Ramzy or agent:Codex:gpt-5 (got "${spec}")`);
  }
  return kind === "agent" ? { kind, name, model } : { kind, name };
}

/** Resolve a node id, allowing unique prefixes and display ids. */
function resolveId(store: Store, idOrPrefix: string): string {
  return matchNodeId(store, idOrPrefix);
}

function open(): Store {
  return Store.discover();
}

function fail(err: unknown): never {
  if (err instanceof StoreError) {
    console.error(c.red(`error: ${err.message}`));
  } else {
    console.error(c.red(`error: ${(err as Error).message ?? err}`));
  }
  process.exit(1);
}

// ---- output helpers ----

function short(id: string): string {
  // time prefix + random suffix: same-ms monotonic ids only differ at the end
  return `${id.slice(0, 10)}${id.slice(-4)}`;
}

function printNodeRow(n: LineageNode): void {
  const color = TYPE_COLORS[n.type];
  const title = n.title.length > 60 ? n.title.slice(0, 57) + "..." : n.title;
  console.log(
    `${c.dim(short(n.id))}  ${color(n.type.padEnd(15))} ${statusColor(n.status)(n.status.padEnd(11))} ${title}`,
  );
}

function statusColor(status: string): (s: string) => string {
  switch (status) {
    case "accepted":
    case "completed":
      return c.green;
    case "rejected":
    case "abandoned":
      return c.red;
    case "superseded":
      return c.dim;
    case "proposed":
      return c.amber;
    default:
      return (s) => s;
  }
}

function printEdge(store: Store, e: LineageEdge, arrow: "out" | "in"): void {
  const otherId = arrow === "out" ? e.to : e.from;
  let label = short(otherId);
  try {
    label += ` ${store.getNode(otherId).title}`;
  } catch {
    /* dangling edge; show id only */
  }
  console.log(`  ${arrow === "out" ? "→" : "←"} ${c.cyan(e.type)} ${label}${e.note ? c.dim(`  (${e.note})`) : ""}`);
}

// ---- commands ----

function cmdInit(parsed: Parsed): void {
  const root = process.cwd();
  if (findStoreRoot(root) && !one(parsed.flags, "force")) {
    fail(new StoreError("already_exists", `.arabian/ already exists (walk up from here); use --force to create a nested one`));
  }
  const name = one(parsed.flags, "name") ?? root.split("/").pop() ?? "project";
  const meta = initProject(root, {
    name,
    description: one(parsed.flags, "description"),
  });
  console.log(c.green(`Initialized Arabian project "${meta.name}" in ${root}/.arabian`));
}

function cmdAdd(parsed: Parsed): void {
  const [type, title] = parsed.args;
  if (!type || !title) fail(new StoreError("invalid", "usage: arabian add <type> <title>"));
  if (!NODE_TYPES.includes(type as NodeType)) {
    fail(new StoreError("invalid", `unknown node type "${type}". Types: ${NODE_TYPES.join(", ")}`));
  }
  const store = open();
  const node = store.createNode({
    type: type as NodeType,
    title,
    description: one(parsed.flags, "description", "d"),
    status: one(parsed.flags, "status", "s") as LineageNode["status"] | undefined,
    tags: parsed.flags.get("tag") ?? parsed.flags.get("t"),
    fileRefs: parsed.flags.get("file") ?? parsed.flags.get("f"),
    createdBy: parseActor(one(parsed.flags, "actor")),
  });
  console.log(`${c.dim(short(node.id))}  ${TYPE_COLORS[node.type](node.type)}  ${node.title}`);
  console.log(c.dim(`created ${node.id} → .arabian/nodes/${node.id}.${node.type}.json`));
}

function cmdLink(parsed: Parsed): void {
  const [type, from, to] = parsed.args;
  if (!type || !from || !to) {
    fail(new StoreError("invalid", "usage: arabian link <edge-type> <from-id> <to-id>"));
  }
  if (!EDGE_TYPES.includes(type as EdgeType)) {
    fail(new StoreError("invalid", `unknown edge type "${type}". Types: ${EDGE_TYPES.join(", ")}`));
  }
  const store = open();
  const edge = store.createEdge({
    from: resolveId(store, from),
    to: resolveId(store, to),
    type: type as EdgeType,
    note: one(parsed.flags, "note"),
    createdBy: parseActor(one(parsed.flags, "actor")),
  });
  console.log(c.green(`linked ${short(edge.from)} --${edge.type}--> ${short(edge.to)}`));
}

function cmdList(parsed: Parsed): void {
  const store = open();
  let nodes = store.listNodes();
  const [type] = parsed.args;
  if (type) nodes = nodes.filter((n) => n.type === type);
  const status = one(parsed.flags, "status", "s");
  if (status) nodes = nodes.filter((n) => n.status === status);
  const tag = one(parsed.flags, "tag", "t");
  if (tag) nodes = nodes.filter((n) => n.tags?.includes(tag));
  if (nodes.length === 0) {
    console.log(c.dim("no nodes match"));
    return;
  }
  for (const n of nodes) printNodeRow(n);
  console.log(c.dim(`\n${nodes.length} node(s)`));
}

function cmdShow(parsed: Parsed): void {
  const store = open();
  const [idOrPrefix] = parsed.args;
  if (!idOrPrefix) fail(new StoreError("invalid", "usage: arabian show <id>"));
  const id = resolveId(store, idOrPrefix);
  const sub = getLineage(store, id, {
    hops: Number(one(parsed.flags, "hops") ?? "1"),
    direction: (one(parsed.flags, "direction") as "up" | "down" | "both") ?? "both",
  });
  const { node, incoming, outgoing } = store.getNodeWithContext(id);
  const color = TYPE_COLORS[node.type];
  console.log(c.bold(color(`[${node.type.toUpperCase()}] ${node.title}`)));
  console.log(c.dim(`${node.id}`));
  console.log(`status: ${statusColor(node.status)(node.status)}  created: ${node.createdAt}  by: ${actorLabel(node.createdBy)}`);
  if (node.tags?.length) console.log(`tags: ${node.tags.join(", ")}`);
  if (node.fileRefs?.length) console.log(`files:\n${node.fileRefs.map((f) => `  - ${f}`).join("\n")}`);
  if (node.description) console.log(`\n${node.description}`);
  if (incoming.length) {
    console.log(c.bold(`\nled to by (${incoming.length}):`));
    for (const e of incoming) printEdge(store, e, "in");
  }
  if (outgoing.length) {
    console.log(c.bold(`\nled to (${outgoing.length}):`));
    for (const e of outgoing) printEdge(store, e, "out");
  }
  const extra = sub.nodes.length - 1;
  if (extra > 0) console.log(c.dim(`\nsubgraph: ${sub.nodes.length} nodes, ${sub.edges.length} edges within ${sub.hops} hop(s)`));
}

function actorLabel(a: Actor): string {
  return a.kind === "agent" ? `${a.name}${a.model ? ` (${a.model})` : ""} [agent]` : `${a.name} [human]`;
}

function cmdSearch(parsed: Parsed): void {
  const store = open();
  const q = parsed.args.join(" ");
  if (!q) fail(new StoreError("invalid", "usage: arabian search <query>"));
  const hits = searchNodes(store, q);
  if (hits.length === 0) {
    console.log(c.dim(`no matches for "${q}"`));
    return;
  }
  for (const h of hits) printNodeRow(h.node);
  console.log(c.dim(`\n${hits.length} match(es) for "${q}"`));
}

function cmdStats(parsed: Parsed): void {
  const store = open();
  const stats = getStats(store);
  const project = store.getProject();
  console.log(c.bold(project.name) + (project.description ? c.dim(` — ${project.description}`) : ""));
  console.log(`nodes: ${stats.totalNodes}  edges: ${stats.totalEdges}`);
  console.log(`decisions: ${stats.totalDecisions}  open questions: ${stats.openQuestions}  active experiments: ${stats.activeExperiments}`);
  const byType = Object.entries(stats.byType).map(([t, n]) => `${t}: ${n}`).join("  ");
  console.log(c.dim(byType));
}

function cmdMcp(): void {
  // Delegate to the MCP entry so `arabian mcp` and `arabian-mcp` are identical.
  import("../mcp/server.js");
}

/**
 * Install the bundled agent skill into a project so coding assistants know
 * when/how to record lineage. The canonical SKILL.md ships inside the package
 * at skills/arabian/SKILL.md.
 */
function cmdSkill(parsed: Parsed): void {
  const templatePath = fileURLToPath(new URL("../../skills/arabian/SKILL.md", import.meta.url));
  if (!existsSync(templatePath)) {
    fail(new StoreError("not_found", `bundled skill template missing at ${templatePath}`));
  }
  const targetDir = resolve(
    one(parsed.flags, "dir") ?? join(process.cwd(), ".zcode", "skills", "arabian"),
  );
  const target = join(targetDir, "SKILL.md");
  if (existsSync(target) && !one(parsed.flags, "force")) {
    fail(new StoreError("already_exists", `${target} already exists (use --force to overwrite)`));
  }
  mkdirSync(targetDir, { recursive: true });
  writeFileSync(target, readFileSync(templatePath, "utf8"));
  console.log(c.green(`Installed agent skill → ${target}`));
  console.log(c.dim("Coding agents in this workspace will now know when and how to record lineage."));
}

// ---- main ----

export function main(argv: string[] = process.argv.slice(2)): void {
  const [command, ...rest] = argv;
  const parsed = parseArgs(rest);
  try {
    switch (command ?? "help") {
      case "init":
        return cmdInit(parsed);
      case "add":
        return cmdAdd(parsed);
      case "link":
        return cmdLink(parsed);
      case "list":
      case "ls":
        return cmdList(parsed);
      case "show":
        return cmdShow(parsed);
      case "search":
      case "find":
        return cmdSearch(parsed);
      case "stats":
        return cmdStats(parsed);
      case "skill":
        return cmdSkill(parsed);
      case "serve": {
        const store = Store.discover();
        return serve(store, {
          port: Number(one(parsed.flags, "port", "p") ?? process.env.ARABIAN_PORT ?? 7424),
          host: one(parsed.flags, "host") ?? "127.0.0.1",
          webDir: one(parsed.flags, "web-dir"),
        });
      }
      case "mcp":
        return cmdMcp();
      case "help":
      case "--help":
      case "-h":
        console.log(USAGE);
        return;
      default:
        console.error(c.red(`unknown command "${command}"\n`));
        console.log(USAGE);
        process.exitCode = 1;
    }
  } catch (err) {
    fail(err);
  }
}

// Only auto-run when executed directly (tests import main).
if (process.argv[1]?.replace(/\.js$/, "").endsWith("cli/index")) {
  main();
}
