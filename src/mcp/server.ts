#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  EDGE_TYPES,
  NODE_STATUSES,
  NODE_TYPES,
  Store,
  StoreError,
  explainFiles,
  formatFileContext,
  getLineage,
  getStats,
  matchNodeId,
  searchNodes,
  type Actor,
} from "../core/index.js";

// Injected at build time via tsup `define`; falls back when run unbundled.
declare const __VERSION__: string;
const VERSION: string = typeof __VERSION__ !== "undefined" ? __VERSION__ : "0.0.0-dev";

function openStore(): Store {
  const root = process.env.ARABIAN_ROOT ?? process.cwd();
  return Store.discover(root);
}

function actor(input: Actor | undefined): Actor {
  if (input) return input;
  const name = process.env.ARABIAN_AGENT_NAME ?? "coding-agent";
  const model = process.env.ARABIAN_AGENT_MODEL;
  return model ? { kind: "agent", name, model } : { kind: "agent", name };
}

function actorShape() {
  return {
    kind: z.enum(["human", "agent"]).describe("Who performed this action"),
    name: z.string().min(1).describe("Display name, e.g. \"Ramzy\" or \"Codex\""),
    model: z.string().optional().describe("Model name if kind=agent"),
  };
}

function json(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function toolError(err: unknown) {
  const message = err instanceof StoreError ? err.message : (err as Error).message;
  return {
    isError: true as const,
    content: [{ type: "text" as const, text: `arabian error: ${message}` }],
  };
}

const server = new McpServer({ name: "arabian", version: VERSION });

// -- arabian_get_context --
server.registerTool(
  "arabian_get_context",
  {
    title: "Get engineering context for files",
    description:
      "Fetch the recorded engineering lineage for one or more files before touching them: decisions that shape them, the questions behind those decisions, alternatives considered, constraints, implementations and supersedes. Returns readable text. Use this proactively whenever you are about to modify code that might have recorded context.",
    inputSchema: {
      files: z
        .array(z.string().min(1))
        .min(1)
        .describe("Repo-relative paths; line suffixes ok (src/auth/session.ts or src/auth/session.ts:42-87)"),
      limit: z.number().int().min(1).max(20).optional().describe("Max nodes per file, default 8"),
    },
  },
  async ({ files, limit }) => {
    try {
      const store = openStore();
      const contexts = explainFiles(store, files, { limit });
      return {
        content: [{ type: "text" as const, text: contexts.map(formatFileContext).join("\n\n") }],
      };
    } catch (err) {
      return toolError(err);
    }
  },
);

// -- arabian_create_node --
server.registerTool(
  "arabian_create_node",
  {
    title: "Create lineage node",
    description: `Create a lineage node recording a piece of engineering context. Node types: ${NODE_TYPES.join(", ")}. Pair with arabian_create_edge to link it into the graph (e.g. question --led_to--> decision, decision --chooses--> alternative). Arabian is a passive recorder: you decide what to log.`,
    inputSchema: {
      type: z.enum(NODE_TYPES).describe("question|alternative|decision|experiment|implementation|outcome|constraint"),
      title: z.string().min(1).max(300),
      description: z.string().optional().describe("Markdown"),
      status: z.enum(NODE_STATUSES).optional().describe("Defaults by type: question/alternative/decision=proposed, experiment/implementation=draft, outcome=completed, constraint=accepted"),
      tags: z.array(z.string()).optional(),
      fileRefs: z.array(z.string()).optional().describe("Repo-relative file paths this node relates to"),
      createdBy: z.object(actorShape()).optional().describe("Defaults to an agent actor"),
    },
  },
  async (input) => {
    try {
      const store = openStore();
      const node = store.createNode({ ...input, createdBy: actor(input.createdBy) });
      return json(node);
    } catch (err) {
      return toolError(err);
    }
  },
);

// -- arabian_update_node --
server.registerTool(
  "arabian_update_node",
  {
    title: "Update lineage node",
    description:
      "Update a node's title, description, status, tags, fileRefs or metadata. Statuses: " +
      NODE_STATUSES.join(", ") +
      ". Status transitions are not enforced.",
    inputSchema: {
      id: z.string().describe("Node id (unique prefix ok)"),
      title: z.string().min(1).max(300).optional(),
      description: z.string().nullable().optional(),
      status: z.enum(NODE_STATUSES).optional(),
      tags: z.array(z.string()).nullable().optional(),
      fileRefs: z.array(z.string()).nullable().optional(),
      metadata: z.record(z.unknown()).nullable().optional(),
    },
  },
  async ({ id, ...patch }) => {
    try {
      const store = openStore();
      const resolved = resolve(store, id);
      return json(store.updateNode(resolved, patch));
    } catch (err) {
      return toolError(err);
    }
  },
);

// -- arabian_create_edge --
server.registerTool(
  "arabian_create_edge",
  {
    title: "Create lineage edge",
    description: `Link two nodes with a typed directed edge. Types: ${EDGE_TYPES.map((t) => `${t}`).join(", ")}. The triggers edge (outcome → question) closes the lineage cycle — use it when a result raises a new question.`,
    inputSchema: {
      from: z.string().describe("Source node id (unique prefix ok)"),
      to: z.string().describe("Target node id (unique prefix ok)"),
      type: z.enum(EDGE_TYPES),
      note: z.string().optional(),
      createdBy: z.object(actorShape()).optional(),
    },
  },
  async (input) => {
    try {
      const store = openStore();
      const from = resolve(store, input.from);
      const to = resolve(store, input.to);
      return json(store.createEdge({ ...input, from, to, createdBy: actor(input.createdBy) }));
    } catch (err) {
      return toolError(err);
    }
  },
);

// -- arabian_get_node --
server.registerTool(
  "arabian_get_node",
  {
    title: "Get lineage node",
    description: "Fetch a single node by id, including its incoming edges (what led to this) and outgoing edges (what came from this).",
    inputSchema: { id: z.string().describe("Node id (unique prefix ok)") },
  },
  async ({ id }) => {
    try {
      const store = openStore();
      return json(store.getNodeWithContext(resolve(store, id)));
    } catch (err) {
      return toolError(err);
    }
  },
);

// -- arabian_list_nodes --
server.registerTool(
  "arabian_list_nodes",
  {
    title: "List lineage nodes",
    description: "List nodes, optionally filtered by type, status, or tag. Returns id, type, status, title and updatedAt for each.",
    inputSchema: {
      type: z.enum(NODE_TYPES).optional(),
      status: z.enum(NODE_STATUSES).optional(),
      tag: z.string().optional(),
    },
  },
  async (filter) => {
    try {
      const store = openStore();
      const nodes = store
        .listNodes()
        .filter((n) => (!filter.type || n.type === filter.type)
          && (!filter.status || n.status === filter.status)
          && (!filter.tag || n.tags?.includes(filter.tag)))
        .map((n) => ({
          id: n.id,
          type: n.type,
          status: n.status,
          title: n.title,
          updatedAt: n.updatedAt,
        }));
      return json({ count: nodes.length, nodes });
    } catch (err) {
      return toolError(err);
    }
  },
);

// -- arabian_get_lineage --
server.registerTool(
  "arabian_get_lineage",
  {
    title: "Get lineage subgraph",
    description:
      "Traverse the graph around a node: \"what led to this?\" (direction=up), \"what came from this?\" (direction=down), or both. Returns the subgraph of nodes and edges within N hops.",
    inputSchema: {
      id: z.string().describe("Node id (unique prefix ok)"),
      hops: z.number().int().min(1).max(10).optional().describe("Default 2"),
      direction: z.enum(["up", "down", "both"]).optional().describe("Default both"),
    },
  },
  async ({ id, hops, direction }) => {
    try {
      const store = openStore();
      return json(getLineage(store, resolve(store, id), { hops, direction }));
    } catch (err) {
      return toolError(err);
    }
  },
);

// -- arabian_search --
server.registerTool(
  "arabian_search",
  {
    title: "Search lineage",
    description: "Case-insensitive multi-term search across node titles, descriptions, tags and file refs. All terms must match somewhere.",
    inputSchema: {
      query: z.string().min(1),
      limit: z.number().int().min(1).max(200).optional().describe("Default 50"),
    },
  },
  async ({ query, limit }) => {
    try {
      const store = openStore();
      const hits = searchNodes(store, query, limit).map((h) => ({
        id: h.node.id,
        type: h.node.type,
        status: h.node.status,
        title: h.node.title,
        matchedIn: h.where,
      }));
      return json({ count: hits.length, hits });
    } catch (err) {
      return toolError(err);
    }
  },
);

// -- arabian_get_graph --
server.registerTool(
  "arabian_get_graph",
  {
    title: "Get full lineage graph",
    description: "Return the entire project graph (project meta, all nodes, all edges). Use for visualization or bulk analysis; prefer get_lineage for focused traversal.",
    inputSchema: {},
  },
  async () => {
    try {
      const store = openStore();
      return json(store.getGraph());
    } catch (err) {
      return toolError(err);
    }
  },
);

// -- arabian_supersede --
server.registerTool(
  "arabian_supersede",
  {
    title: "Supersede a decision",
    description:
      "Replace a decision: creates a new decision node, wires new --supersedes--> old, marks the old one superseded, and carries over its fileRefs and tags. Use when a decision changes and the history must stay intact.",
    inputSchema: {
      oldId: z.string().describe("Id of the decision being replaced (unique prefix ok)"),
      title: z.string().min(1).max(300).describe("Title of the new decision"),
      description: z.string().optional().describe("Markdown rationale for the new decision"),
      note: z.string().optional().describe("Note on the supersedes edge"),
      createdBy: z.object(actorShape()).optional(),
    },
  },
  async ({ oldId, title, description, note, createdBy }) => {
    try {
      const store = openStore();
      const by = actor(createdBy);
      const oldNode = store.getNode(resolve(store, oldId));
      if (oldNode.type !== "decision") {
        return toolError(new StoreError("invalid", `arabian_supersede applies to decisions; ${oldNode.id} is a ${oldNode.type}`));
      }
      const newNode = store.createNode({
        type: "decision",
        title,
        description,
        status: "accepted",
        fileRefs: oldNode.fileRefs,
        tags: oldNode.tags,
        createdBy: by,
      });
      const edge = store.createEdge({ from: newNode.id, to: oldNode.id, type: "supersedes", note, createdBy: by });
      store.updateNode(oldNode.id, { status: "superseded" });
      return json({ newNode, superseded: oldNode.id, edge });
    } catch (err) {
      return toolError(err);
    }
  },
);

/** Resolve a full id or unique prefix against the store. */
function resolve(store: Store, idOrPrefix: string): string {
  return matchNodeId(store, idOrPrefix);
}

export async function startMcp(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// Run when launched directly (`arabian mcp` re-exports this module).
if (process.argv[1]?.replace(/\.js$/, "").endsWith("mcp/server")) {
  startMcp().catch((err) => {
    console.error("arabian-mcp failed to start:", err);
    process.exit(1);
  });
}
