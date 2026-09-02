import { StoreError, type Store } from "./store.js";
import type {
  LineageDirection,
  LineageEdge,
  LineageNode,
  LineageSubgraph,
  ProjectStats,
  SearchHit,
} from "./types.js";

/**
 * Traverse the graph outward from `rootId`, up to `hops` edges.
 * direction "up" follows edges toward their `from` side ("what led to this"),
 * "down" follows toward `to` ("what came from this").
 */
export function getLineage(
  store: Store,
  rootId: string,
  opts: { hops?: number; direction?: LineageDirection } = {},
): LineageSubgraph {
  const direction = opts.direction ?? "both";
  const maxHops = Math.max(1, Math.min(opts.hops ?? 2, 10));

  const nodes = new Map<string, LineageNode>();
  const edges = new Map<string, LineageEdge>();
  const root = store.getNode(rootId);
  nodes.set(root.id, root);

  let frontier = new Set([root.id]);
  for (let depth = 0; depth < maxHops && frontier.size > 0; depth++) {
    const next = new Set<string>();
    for (const id of frontier) {
      const { incoming, outgoing } = store.edgesFor(id);
      const candidates =
        direction === "up" ? incoming
        : direction === "down" ? outgoing
        : [...incoming, ...outgoing];
      for (const edge of candidates) {
        edges.set(edge.id, edge);
        const other = edge.from === id ? edge.to : edge.from;
        if (!nodes.has(other)) next.add(other);
      }
    }
    for (const id of next) {
      nodes.set(id, store.getNode(id));
    }
    frontier = next;
  }

  // Keep only edges whose endpoints both made the cut (they always will,
  // since every edge we touched has one endpoint visited).
  return {
    root: rootId,
    hops: maxHops,
    nodes: [...nodes.values()],
    edges: [...edges.values()],
  };
}

export { type ProjectStats, type SearchHit }; // re-exported for backend consumers

/** Case-insensitive substring search over titles, descriptions, tags, file refs. */
export function searchNodes(store: Store, query: string, limit = 50): SearchHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const terms = q.split(/\s+/).filter(Boolean);
  const hits: SearchHit[] = [];
  for (const node of store.listNodes()) {
    const where = new Set<SearchHit["where"][number]>();
    let score = 0;
    for (const term of terms) {
      let termScore = 0;
      if (node.title.toLowerCase().includes(term)) {
        where.add("title");
        termScore += node.title.toLowerCase().startsWith(term) ? 5 : 3;
      }
      if (node.description?.toLowerCase().includes(term)) {
        where.add("description");
        termScore += 2;
      }
      if (node.tags?.some((t) => t.toLowerCase().includes(term))) {
        where.add("tags");
        termScore += 2;
      }
      if (node.fileRefs?.some((f) => f.toLowerCase().includes(term))) {
        where.add("fileRefs");
        termScore += 1;
      }
      if (termScore === 0) {
        score = 0;
        break;
      }
      score += termScore;
    }
    if (score > 0) hits.push({ node, score, where: [...where] });
  }
  hits.sort((a, b) => b.score - a.score || (a.node.id < b.node.id ? -1 : 1));
  return hits.slice(0, limit);
}

const CLOSED_STATUSES = new Set(["completed", "rejected", "superseded", "abandoned"]);

function isClosed(status: LineageNode["status"]): boolean {
  return CLOSED_STATUSES.has(status);
}

export function getStats(store: Store): ProjectStats {
  const nodes = store.listNodes();
  const byType: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  for (const n of nodes) {
    byType[n.type] = (byType[n.type] ?? 0) + 1;
    byStatus[n.status] = (byStatus[n.status] ?? 0) + 1;
  }
  return {
    totalNodes: nodes.length,
    byType,
    byStatus,
    openQuestions: nodes.filter((n) => n.type === "question" && !isClosed(n.status)).length,
    totalDecisions: nodes.filter((n) => n.type === "decision").length,
    activeExperiments: nodes.filter((n) => n.type === "experiment" && !isClosed(n.status)).length,
    totalEdges: store.listEdges().length,
  };
}

/** Recent nodes by updatedAt, newest first. */
export function recentNodes(store: Store, limit = 20): LineageNode[] {
  return store
    .listNodes()
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0))
    .slice(0, limit);
}

/**
 * Resolve a full id, a unique id prefix, or a display id
 * (first 10 + last 4 chars, as shown by the CLI/UI) to a full node id.
 */
export function matchNodeId(store: Store, idOrPrefix: string): string {
  if (store.hasNode(idOrPrefix)) return idOrPrefix;
  const nodes = store.listNodes();
  let matches = nodes.filter((n) => n.id.toLowerCase().startsWith(idOrPrefix.toLowerCase()));
  if (matches.length === 1) return matches[0]!.id;
  const display = /^([0-9A-HJKMNP-TV-Z]{10})([0-9A-HJKMNP-TV-Z]{4})$/.exec(idOrPrefix.toUpperCase());
  if (display) {
    matches = nodes.filter((n) => n.id.startsWith(display[1]!) && n.id.endsWith(display[2]!));
    if (matches.length === 1) return matches[0]!.id;
  }
  if (matches.length === 0) {
    throw new StoreError("not_found", `no node matches "${idOrPrefix}"`);
  }
  throw new StoreError("invalid", `"${idOrPrefix}" is ambiguous (${matches.length} matches)`);
}
