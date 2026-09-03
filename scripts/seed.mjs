#!/usr/bin/env node
/**
 * Seeds this repo's .arabian/ with Arabian's own design lineage — the
 * meta-decisions from README §"Key Design Decisions", dogfooded.
 * Idempotent: skips if .arabian/ already exists.
 */
import { existsSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { initProject, Store } from "../dist/core/index.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

if (existsSync(`${ROOT}/.arabian`)) {
  console.log(".arabian/ already exists — skipping seed (delete it to reseed)");
  process.exit(0);
}

const RAMZY = { kind: "human", name: "Ramzy" };
const AGENT = { kind: "agent", name: "arabian-seed", model: "seed-script" };

initProject(ROOT, {
  name: "Arabian",
  description: "Local-first engineering lineage — dogfooded: this is Arabian's own lineage.",
});

const store = Store.at(ROOT);

const N = {};
function node(key, input) {
  N[key] = store.createNode(input, { at: new Date() });
  return N[key];
}

// ---- questions ----
node("qStructure", {
  type: "question",
  title: "How should lineage records be structured?",
  description: "A lineage can branch (alternatives), merge, and cycle (an outcome raises the next question). Whatever structure we pick has to survive all three.",
  status: "completed",
  tags: ["data-model"],
  createdBy: RAMZY,
});
node("qStorage", {
  type: "question",
  title: "Where should lineage live on disk?",
  description: "The storage must be inspectable by humans, diffable by git, and readable by any agent with filesystem access.",
  status: "completed",
  tags: ["storage"],
  createdBy: RAMZY,
});
node("qStatus", {
  type: "question",
  title: "Should status transitions be enforced?",
  description: "ADR tools enforce draft → accepted → superseded. Does that friction earn its keep in v1?",
  status: "completed",
  tags: ["data-model"],
  createdBy: RAMZY,
});
node("qSurface", {
  type: "question",
  title: "Who is the primary consumer — humans or agents?",
  description: "If agents are the primary writers, the tool surface must be MCP-first and the web UI is for exploring what was recorded.",
  status: "completed",
  tags: ["product"],
  createdBy: RAMZY,
});
node("qEvidence", {
  type: "question",
  title: "Should evidence be re-split out of experiment?",
  description: "v1 merged evidence into experiment. If benchmarks and user feedback start crowding experiments, re-split them.",
  status: "proposed",
  tags: ["data-model"],
  createdBy: RAMZY,
});

// ---- alternatives ----
node("aTree", {
  type: "alternative",
  title: "A tree of ADR documents",
  description: "Classic architecture-decision-records: numbered markdown files, parent/child references. Familiar and simple.",
  status: "rejected",
  tags: ["data-model"],
  createdBy: RAMZY,
});
node("aGraph", {
  type: "alternative",
  title: "A directed graph of typed nodes",
  description: "Typed nodes + explicit typed edges. Branches, merges, supersession chains and the outcome→question cycle are all first-class.",
  status: "accepted",
  tags: ["data-model"],
  createdBy: RAMZY,
});

// ---- decisions ----
node("dGraphOverTree", {
  type: "decision",
  title: "Graph over tree",
  description: "Decisions branch, merge, and cycle. A tree cannot represent an outcome raising the next question, or one decision superseding another while keeping both visible. We chose the directed graph of typed nodes.",
  status: "accepted",
  tags: ["data-model"],
  createdBy: RAMZY,
});
node("dJsonFiles", {
  type: "decision",
  title: "JSON files over SQLite",
  description: "Plain JSON in `.arabian/`: git-native, diffable in PRs, zero dependencies, directly readable by agents. Trade-off: no transactions or complex queries — acceptable at v1 scale.",
  status: "accepted",
  tags: ["storage"],
  createdBy: RAMZY,
});
node("dNoEnforcement", {
  type: "decision",
  title: "No status enforcement in v1",
  description: "Any status may transition to any other. Validation adds friction without proportional value this early; the schema still constrains what a status *is*.",
  status: "accepted",
  tags: ["data-model"],
  createdBy: RAMZY,
});
node("dEdgesFirstClass", {
  type: "decision",
  title: "Edges are first-class",
  description: "The `triggers` edge (outcome → question) is the whole point: without explicit typed edges, the lineage cycle is invisible. Ten edge types cover question→decision, decision→alternative, implementation→decision, and the cycle.",
  status: "accepted",
  tags: ["data-model"],
  createdBy: RAMZY,
});
node("dMcpFirst", {
  type: "decision",
  title: "MCP-first, UI-second",
  description: "The primary consumer is the coding agent: it records lineage as it works. Nine MCP tools cover CRUD, traversal, search, graph, and supersede. The web UI exists for humans to explore what the agent recorded.",
  status: "accepted",
  tags: ["product", "mcp"],
  createdBy: RAMZY,
});

// ---- constraint ----
node("cGitFriendly", {
  type: "constraint",
  title: "Storage must be git-friendly and zero-dependency",
  description: "Lineage files live in the repo they describe. They must diff cleanly, review cleanly in PRs, and require nothing beyond Node itself to read.",
  status: "accepted",
  tags: ["storage"],
  createdBy: RAMZY,
});

// ---- experiment ----
node("eDogfood", {
  type: "experiment",
  title: "Dogfood: record Arabian's own design lineage",
  description: "Before shipping, use Arabian to record Arabian's own decisions. If the model can't represent its own design history convincingly, the model is wrong.",
  status: "completed",
  tags: ["meta"],
  createdBy: AGENT,
});

// ---- implementations ----
node("iCore", {
  type: "implementation",
  title: "Core: store, ULID ids, zod schemas, CLI",
  description: "Flat-file store (one `id.type.json` per node, single `edges.json`), monotonic ULIDs, zod-validated writes, and the `arabian` CLI (init/add/link/list/show/search/serve/mcp).",
  status: "completed",
  fileRefs: ["src/core/store.ts", "src/core/ulid.ts", "src/core/schema.ts", "src/cli/index.ts"],
  createdBy: RAMZY,
});
node("iMcp", {
  type: "implementation",
  title: "MCP server with 9 agent tools",
  description: "stdio server on @modelcontextprotocol/sdk: create/update nodes, create edges, get/list, lineage traversal, search, full graph, and the supersede convenience tool.",
  status: "completed",
  fileRefs: ["src/mcp/server.ts"],
  createdBy: RAMZY,
});
node("iWeb", {
  type: "implementation",
  title: "Lineage explorer web UI",
  description: "React + Vite + Tailwind v4. Overview with stats and filters, node detail with markdown + lineage panel + supersede, and a React Flow graph with dagre layout, type filters, and focus-dimming.",
  status: "completed",
  fileRefs: ["web/src/App.tsx", "web/src/views/GraphView.tsx", "web/src/views/Overview.tsx", "web/src/views/NodeDetail.tsx"],
  createdBy: RAMZY,
});

// ---- outcome ----
node("oV1Works", {
  type: "outcome",
  title: "v1 lineage loop verified end-to-end",
  description: "CLI writes valid JSON, MCP tools round-trip over stdio, the graph renders with the triggers-cycle visible, and supersede preserves history. The data model survived dogfooding its own design decisions.",
  status: "completed",
  createdBy: AGENT,
});

// ---- edges ----
const E = (type, from, to, note) => store.createEdge({ type, from: N[from].id, to: N[to].id, createdBy: RAMZY, note });
E("considers", "qStructure", "aTree");
E("considers", "qStructure", "aGraph");
E("led_to", "qStructure", "dGraphOverTree");
E("chooses", "dGraphOverTree", "aGraph");
E("rejects", "dGraphOverTree", "aTree", "trees can't express the cycle or supersession chains");

E("led_to", "qStorage", "dJsonFiles");
E("constrains", "cGitFriendly", "dJsonFiles", "sqlite blobs don't diff; JSON does");

E("led_to", "qStatus", "dNoEnforcement");
E("led_to", "qSurface", "dMcpFirst");
E("references", "dMcpFirst", "dEdgesFirstClass", "agent tools expose edges directly");

E("implements", "iCore", "dGraphOverTree");
E("implements", "iCore", "dJsonFiles");
E("implements", "iCore", "dNoEnforcement");
E("implements", "iCore", "dEdgesFirstClass");
E("implements", "iMcp", "dMcpFirst");
E("references", "iWeb", "dGraphOverTree", "the graph view is the payoff of graph-over-tree");

E("produces", "eDogfood", "oV1Works");
E("triggers", "oV1Works", "qEvidence", "if evidence needs re-splitting, the cycle starts again");

console.log(`Seeded ${store.listNodes().length} nodes and ${store.listEdges().length} edges into ${ROOT}/.arabian`);
