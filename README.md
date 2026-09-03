# Arabian

## 0. One-Liner

Arabian is a local-first lineage layer that answers: *"Why does this codebase look like this, and how did we get here?"*

## Quick Start (implemented v1)

```bash
npm install && npm run build     # core (tsup) + web UI (vite)

# in any project you want to track:
arabian init
arabian add question "Should we use Postgres or SQLite?"
arabian add alternative "Postgres" --actor human:Ramzy
arabian add decision "SQLite for v1" -d "Zero ops, single file"
arabian link considers <question-id> <postgres-id>
arabian link chooses <decision-id> <sqlite-id>
arabian list                      # browse
arabian show <id>                 # full lineage around one node
arabian serve                     # → http://127.0.0.1:7424 (overview + graph UI)
```

Storage is plain JSON in `.arabian/` — commit it. Agents get the same data through MCP:

```json
{
  "mcpServers": {
    "arabian": { "command": "node", "args": ["/path/to/arabian/dist/mcp/server.js"] }
  }
}
```

Tools: `arabian_create_node`, `arabian_update_node`, `arabian_create_edge`, `arabian_get_node`,
`arabian_list_nodes`, `arabian_get_lineage`, `arabian_search`, `arabian_get_graph`, `arabian_supersede`.

**Agent skill:** run `arabian skill` inside any project to install `SKILL.md` into its
`.zcode/skills/arabian/` — coding assistants then know when and how to record lineage.

This repo dogfoods itself: `.arabian/` here contains Arabian's own design lineage (see `scripts/seed.mjs`).

## 1. What It Is / What It Is NOT

| It IS | It is NOT |
|---|---|
| A development lineage graph | An ADR manager |
| A decision-to-code audit trail | An AI memory vector DB |
| An MCP tool for coding agents | A project management tool |
| A visual decision explorer | A chat interface |

## 2. V1 Scope

**IN:**
- Local project storage (`.arabian/` directory, JSON files)
- Lineage nodes + edges (directed graph)
- MCP server (tools for agents to read/write lineage)
- Web UI (React + React Flow)
- File linking (decisions → file paths)
- Single-user, single-project

**OUT (explicitly deferred):**
- Multi-user / collaboration
- Cloud sync
- VS Code extension (v2)
- Git integration beyond file paths
- Search / RAG over lineage

## 3. Core Domain Model

### Node

```ts
type NodeType =
  | "question"       // "Should we use X or Y?"
  | "decision"       // "We chose X because..."
  | "alternative"    // "We considered Y"
  | "experiment"     // "We tried Y for 2 days"
  | "evidence"       // "Benchmark showed Y was 3x slower"
  | "implementation" // "PR #42, commit abc123"
  | "outcome"        // "Latency dropped 40%"
  | "constraint";    // "Must run on Node 18"

type NodeStatus =
  | "draft"
  | "proposed"
  | "accepted"
  | "rejected"
  | "superseded"
  | "abandoned"
  | "completed";

type Actor = "human" | "agent" | "mixed";

interface LineageNode {
  id: string;            // ulid
  type: NodeType;
  title: string;
  description?: string;
  status: NodeStatus;
  createdAt: string;     // ISO 8601
  updatedAt: string;
  createdBy: Actor;
  files?: string[];      // relative paths linked to this node
  tags?: string[];
  metadata?: Record<string, unknown>;
}
```

### Edge (the missing piece)

Edges are what make this a graph, not a list. Define them explicitly:

```ts
type EdgeType =
  | "led_to"         // question → decision
  | "considered"     // decision → alternative
  | "supported_by"   // decision → evidence
  | "implemented_as" // decision → implementation
  | "resulted_in"    // implementation → outcome
  | "superseded_by"  // decision → decision
  | "constrained_by" // anything → constraint
  | "raised";        // outcome → question (the cycle!)

interface LineageEdge {
  id: string;
  from: string;  // node id
  to: string;    // node id
  type: EdgeType;
  createdAt: string;
  createdBy: Actor;
  note?: string;
}
```

The critical cycle: `outcome → raised → question → ...` — this is how the lineage grows organically.

### Status Transitions (keep it loose)

```
draft → proposed → accepted → completed
                  ↘ rejected
         proposed → abandoned
         accepted → superseded (by a new decision)
```

No enforcement in v1 — just documentation.

## 4. Storage

**Format:** Flat JSON files inside `.arabian/`

```
.arabian/
  project.json          # { name, description, createdAt }
  nodes/
    01J3X...json        # one file per node
  edges/
    01J3Y...json        # one file per edge
```

**Why JSON files, not SQLite:**
- Git-friendly (diffable, reviewable)
- Zero dependencies
- Agents can read/write them directly
- Easy to inspect manually

**Why not YAML:** JSON is what every tool already speaks. Don't make agents parse YAML.

## 5. MCP Server

Expose these tools to coding agents:

| Tool | Purpose |
|---|---|
| `arabian_create_node` | Create a lineage node |
| `arabian_create_edge` | Link two nodes |
| `arabian_get_node` | Read a node |
| `arabian_list_nodes` | List/filter nodes by type, status, tag |
| `arabian_get_lineage` | Traverse: "what led to this decision?" |
| `arabian_update_status` | Change node status |
| `arabian_link_files` | Associate file paths with a node |
| `arabian_summarize` | Get a text summary of recent lineage activity |

**Key design rule:** The MCP server never decides what to log. The agent (or human) decides. Arabian is a passive recorder.

## 6. Web UI

Three views, nothing more:

### A. Project Overview
- List of all nodes, filterable by type/status
- Quick stats: total decisions, open questions, recent activity
- "Create new question" as the primary CTA

### B. Node Detail
- Full node info + linked files
- Incoming edges ("what led to this")
- Outgoing edges ("what came from this")
- Edit description, change status, add tags

### C. Lineage Graph
- React Flow / XYFlow
- Color-coded by node type (see design system below)
- Click a node to open its detail panel
- Pan, zoom, auto-layout (dagre)
- Filter: show/hide node types

## 7. Design System & Mascot

### Color Palette (node-type mapping)

| Node Type | Color | Usage |
|---|---|---|
| Question | Amber `#F59E0B` | Open, unresolved |
| Decision | Blue `#3B82F6` | The brand accent |
| Alternative | Slate `#94A3B8` | Considered but not chosen |
| Experiment | Purple `#8B5CF6` | Trials, spikes |
| Evidence | Green `#10B981` | Data, benchmarks |
| Implementation | Cyan `#06B6D4` | Code, PRs |
| Outcome | Emerald `#059669` | Results |
| Constraint | Red `#EF4444` | Limits, blockers |

### The Mascot — "Orb"

A glossy floating sphere with two pill-shaped eyes. No body, no mouth, no pupils. Friendly, neutral, abstract.

Let me generate it:


Here's the polished plan for **Arabian**:

---

## Arabian — Polished v1 Plan

### 0. Product Definition

Arabian is an open-source, local-first **engineering lineage system** for human + AI development. It captures *why* the codebase looks the way it does by preserving the full chain:

```
Intent → Question → Alternatives → Decision → Implementation → Files → Outcome → New Decision
```

It answers two questions:
- **"Why does the codebase look like this?"**
- **"How did we get here?"**

### What It Is NOT

- Not an ADR manager (ADRs are one output, not the system)
- Not an AI memory database (it's structured lineage, not unstructured recall)
- Not a generic knowledge graph (it has a fixed, opinionated domain)
- Not a project management tool (no sprints, no tickets)
- Not an agent chat interface (it's a recording layer, not a conversation layer)

---

### 1. v1 Scope

**In scope:**
- Local project storage (`.arabian/` directory)
- Decision records with full lineage
- Relationship graph between records
- MCP server (read + write tools for agents)
- Web UI for lineage exploration
- File linking (decisions point to code paths)

**Out of scope (v2+):**
- Multi-user / sync
- Cloud hosting
- IDE extensions
- Git integration (auto-detecting decisions from commits)
- Export to other formats (Markdown ADRs, etc.)

---

### 2. Core Domain Model

Arabian is modeled as a **graph**, not a tree. This allows cross-links, supersessions, parallel experiments, and implementation references.

#### Node Types (v1 — trimmed)

```typescript
type NodeType =
  | "question"        // "Should we use Postgres or SQLite?"
  | "alternative"     // "Option A: Postgres"
  | "decision"        // "We chose SQLite because..."
  | "experiment"      // "Let's benchmark both"
  | "implementation"  // "Built the storage layer using SQLite"
  | "outcome"         // "Performance was fine, but concurrency is a pain"
  | "constraint";     // "Must run on a single VPS with <512MB RAM"
```

> `evidence` merged into `experiment` for v1. Can be re-split later.

#### Node Statuses

```typescript
type NodeStatus =
  | "draft"
  | "proposed"
  | "accepted"
  | "rejected"
  | "superseded"
  | "abandoned"
  | "completed";
```

Status transitions are **not enforced** in v1 — just stored. Validation can come later.

#### LineageNode

```typescript
interface LineageNode {
  id: string;           // ULID for sortability
  type: NodeType;
  title: string;
  description?: string; // Markdown supported
  status: NodeStatus;
  createdAt: string;    // ISO 8601
  updatedAt: string;
  createdBy: Actor;
  tags?: string[];      // Free-form, for filtering
  fileRefs?: string[];  // Relative paths: ["src/db/storage.ts"]
  metadata?: Record<string, unknown>;
}

type Actor =
  | { kind: "human"; name: string }
  | { kind: "agent"; name: string; model?: string };
```

#### Edges (explicit model — was missing)

```typescript
type EdgeType =
  | "led_to"         // question → decision
  | "considers"      // question → alternative
  | "chooses"        // decision → alternative
  | "rejects"        // decision → alternative
  | "supersedes"     // decision → decision
  | "implements"     // implementation → decision
  | "produces"       // experiment → outcome
  | "constrains"     // constraint → question | decision
  | "triggers"       // outcome → question (the cycle!)
  | "references";    // any → any (escape hatch)

interface LineageEdge {
  id: string;
  from: string;       // node id
  to: string;         // node id
  type: EdgeType;
  note?: string;
  createdAt: string;
}
```

The `triggers` edge is what closes the loop: **outcome → new question**. That's the lineage cycle.

---

### 3. Storage

Local-first. Plain files. No database in v1.

```
my-project/
├── .arabian/
│   ├── nodes/
│   │   ├── 01HXYZ...question.json
│   │   ├── 01HXYZ...decision.json
│   │   └── ...
│   ├── edges.json          # single file, array of edges
│   └── project.json        # { name, description, createdAt }
├── src/
└── ...
```

**Why JSON files?**
- Git-friendly (diff-able, reviewable in PRs)
- No dependencies
- Agents can read/write directly via filesystem
- Trivial to migrate to a DB later

**File locking:** Not needed in v1. One agent + one human at a time.

---

### 4. MCP Server

The MCP server exposes Arabian to coding agents as a set of tools:

| Tool | Description |
|---|---|
| `arabian_create_node` | Create a new node (question, decision, etc.) |
| `arabian_update_node` | Update status, description, fileRefs |
| `arabian_create_edge` | Link two nodes with a typed relationship |
| `arabian_get_node` | Fetch a single node by ID |
| `arabian_list_nodes` | List nodes, filterable by type/status/tag |
| `arabian_get_lineage` | Fetch the subgraph around a node (N hops) |
| `arabian_search` | Full-text search across titles and descriptions |
| `arabian_get_graph` | Return the full project graph (for visualization) |
| `arabian_supersede` | Convenience: create new decision + `supersedes` edge |

**Agent workflow example:**

```
1. Human: "Should we add caching?"
2. Agent calls arabian_create_node(type: "question", title: "...")
3. Agent calls arabian_create_node(type: "alternative", title: "Redis")
4. Agent calls arabian_create_node(type: "alternative", title: "In-memory LRU")
5. Agent calls arabian_create_edge(type: "considers", from: Q, to: A1)
6. Agent calls arabian_create_edge(type: "considers", from: Q, to: A2)
7. Agent calls arabian_create_node(type: "experiment", title: "Benchmark both")
8. ... later ...
9. Agent calls arabian_create_node(type: "decision", title: "In-memory LRU")
10. Agent calls arabian_create_edge(type: "chooses", from: D, to: A2)
11. Agent calls arabian_create_edge(type: "led_to", from: Q, to: D)
```

---

### 5. Web UI

React + Vite. Three views:

#### A. Project Overview

- List of all nodes, grouped by type
- Summary stats: total decisions, open questions, active experiments
- Search bar (full-text)
- Filter by status, type, tags, actor (human vs agent)
- "Recent activity" feed (last 20 nodes, sorted by `updatedAt`)

#### B. Decision Detail

- Full node detail with rendered Markdown description
- "Lineage panel" — the direct ancestors and descendants (1-2 hops)
- File references as clickable links (open in editor / GitHub)
- Edit inline (status, description, tags)
- "Supersede" button (creates a new decision + wires the edge)

#### C. Lineage Graph

- **React Flow / XYFlow** powered
- Full project graph, pan + zoom
- Node styling by type (see color system below)
- Edge styling by type (solid for `chooses`/`led_to`, dashed for `considers`, red for `rejects`)
- Click a node to focus — dims everything outside its subgraph
- "Trace path" mode: click two nodes, highlights all paths between them
- Minimap for large projects

---

### 6. Design System & Mascot

The mascot is a **glossy floating orb with two blinking eyes** — abstract, friendly, neutral.

**Color system for node types:**

| Node Type | Color | Rationale |
|---|---|---|
| Question | `#F59E0B` (amber) | Open, unresolved, warm |
| Alternative | `#8B5CF6` (violet) | Branching, possibility |
| Decision | `#3B82F6` (blue) | Stable, committed |
| Experiment | `#EC4899` (pink) | Active, exploratory |
| Implementation | `#10B981` (emerald) | Done, built |
| Outcome | `#F97316` (orange) | Result, consequence |
| Constraint | `#EF4444` (red) | Hard boundary |

**Edge styling:**
- `chooses` / `led_to` / `implements` → solid, thick
- `considers` / `references` → dashed
- `rejects` → dashed, red
- `supersedes` → dotted, orange
- `triggers` → solid, amber (the cycle edge — visually important)

---

### 7. Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Storage | JSON files in `.arabian/` | Git-friendly, zero deps |
| IDs | ULID | Sortable, no collisions |
| MCP Server | TypeScript + `@modelcontextprotocol/sdk` | First-class MCP support |
| Web UI | React 19 + Vite | Fast, modern |
| Graph | React Flow (XYFlow) | Purpose-built for this |
| Styling | Tailwind CSS v4 | Matches the mascot spec |
| Markdown | `react-markdown` + `remark-gfm` | Descriptions need formatting |
| Build | `tsup` for MCP, `vite` for web | Simple, fast |

---

### 8. Milestones

**M1 — Data Layer** (Week 1-2)
- [ ] Node + Edge CRUD (read/write JSON files)
- [ ] ULID generation
- [ ] Validation (Zod schemas)
- [ ] CLI: `arabian add`, `arabian list`, `arabian show`

**M2 — MCP Server** (Week 2-3)
- [ ] All 9 MCP tools implemented
- [ ] Tested with Claude / Cursor / Codex
- [ ] `npx arabian-mcp` launcher

**M3 — Web UI** (Week 3-5)
- [ ] Project overview page
- [ ] Decision detail page
- [ ] Lineage graph with React Flow
- [ ] Node + edge color system
- [ ] Mascot integrated into loading/empty states

**M4 — Polish & Launch** (Week 5-6)
- [ ] README with "first decision" tutorial
- [ ] Example project (the Arabian codebase itself, dogfooded)
- [ ] `npm publish` for MCP server
- [ ] GitHub repo, license (MIT), contributing guide

---

### Key Design Decisions (meta: these are Arabian's own first entries)

1. **Graph over tree** — decisions branch, merge, and cycle. A tree can't represent that.
2. **JSON files over SQLite** — git-native, agent-friendly, trivially portable. Trade-off: no transactions, no complex queries. Acceptable for v1.
3. **No status enforcement** — in v1, any status can transition to any other. Validation adds friction without proportional value early on.
4. **Edges are first-class** — the `triggers` edge (outcome → question) is the whole point. Without explicit edges, the lineage cycle is invisible.
5. **MCP-first, UI-second** — the primary consumer is the coding agent. The web UI is for humans to *explore* what the agent *recorded*.
