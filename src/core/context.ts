import type { Store } from "./store.js";
import type { EdgeType, LineageNode, NodeType } from "./types.js";

// ---- file ref parsing ----

export interface ParsedFileRef {
  path: string; // normalized repo-relative path
  startLine?: number;
  endLine?: number;
}

const LINE_SUFFIX = /(?::(\d+)(?:-(\d+))?|#L(\d+)(?:-L(\d+))?)$/;

/** Strip `./` prefixes and `:42` / `:42-87` / `#L42` / `#L42-L87` suffixes. */
export function parseFileRef(ref: string): ParsedFileRef {
  const cleaned = ref.trim().replace(/^\.\//, "").replace(/\/+$/, "");
  const m = LINE_SUFFIX.exec(cleaned);
  if (!m || m.index === 0) return { path: cleaned };
  const path = cleaned.slice(0, m.index);
  const start = Number(m[1] ?? m[3]);
  const end = Number(m[2] ?? m[4] ?? m[1] ?? m[3]);
  return { path, startLine: start, endLine: end };
}

function depth(path: string): number {
  return path.split("/").length;
}

/** "exact" when both paths are identical, "prefix" when one is a directory of the other. */
function relation(requested: string, ref: string): "exact" | "prefix" | null {
  if (requested === ref) return "exact";
  if (requested.startsWith(ref + "/") || ref.startsWith(requested + "/")) return "prefix";
  return null;
}

const TYPE_WEIGHT: Record<NodeType, number> = {
  decision: 6,
  question: 5,
  constraint: 4,
  experiment: 3,
  implementation: 3,
  outcome: 2,
  alternative: 1,
};

// ---- context assembly ----

export interface ContextRelation {
  type: EdgeType;
  node: LineageNode;
  note?: string;
}

export interface ContextEntry {
  node: LineageNode;
  kind: "exact" | "prefix";
  matchedRefs: string[];
  /** Incoming edges: what led to this node. */
  ledToBy: ContextRelation[];
  /** Outgoing edges: what came from this node. */
  leadsTo: ContextRelation[];
  /** Old decision, when this node supersedes one. */
  supersedes?: LineageNode;
  /** Alternatives weighed by the question(s) that led to a decision. */
  considered: LineageNode[];
}

export interface FileContext {
  /** The requested ref, normalized. */
  file: string;
  entries: ContextEntry[];
  /** Number of matching nodes before the per-file cap. */
  totalMatches: number;
}

/**
 * Find the lineage recorded for the given files: nodes whose fileRefs match
 * exactly (line suffixes ignored) or sit on the same directory path, ranked
 * exact-first then by type relevance, each with its immediate relations.
 */
export function explainFiles(
  store: Store,
  files: string[],
  opts: { limit?: number } = {},
): FileContext[] {
  const limit = Math.max(1, opts.limit ?? 8);
  const nodes = store.listNodes();
  const byId = new Map(nodes.map((n) => [n.id, n]));

  return files.map((file) => {
    const req = parseFileRef(file).path;
    if (!req) return { file, entries: [], totalMatches: 0 };

    const scored = new Map<string, { kind: "exact" | "prefix"; refs: string[]; score: number }>();
    for (const node of nodes) {
      for (const raw of node.fileRefs ?? []) {
        const ref = parseFileRef(raw).path;
        const rel = relation(req, ref);
        if (!rel) continue;
        const score =
          (rel === "exact" ? 100 : 50 - Math.abs(depth(req) - depth(ref))) + TYPE_WEIGHT[node.type];
        const prev = scored.get(node.id);
        if (prev) {
          if (!prev.refs.includes(raw)) prev.refs.push(raw);
          if (rel === "exact") prev.kind = "exact";
          prev.score = Math.max(prev.score, score);
        } else {
          scored.set(node.id, { kind: rel, refs: [raw], score });
        }
      }
    }

    const ranked = [...scored.entries()].sort(
      (a, b) => b[1].score - a[1].score || (a[0] < b[0] ? -1 : 1),
    );

    const entries: ContextEntry[] = ranked.slice(0, limit).map(([id, meta]) => {
      const node = byId.get(id)!;
      const { incoming, outgoing } = store.edgesFor(id);
      const rel = (e: (typeof incoming)[number], other: LineageNode): ContextRelation => ({
        type: e.type,
        node: other,
        ...(e.note !== undefined ? { note: e.note } : {}),
      });
      const ledToBy = incoming.flatMap((e) => {
        const other = byId.get(e.from);
        return other ? [rel(e, other)] : [];
      });
      const leadsTo = outgoing.flatMap((e) => {
        const other = byId.get(e.to);
        return other ? [rel(e, other)] : [];
      });
      const supersedesEdge = outgoing.find((e) => e.type === "supersedes");
      const supersedes = supersedesEdge ? byId.get(supersedesEdge.to) : undefined;

      // Alternatives weighed by the question(s) upstream of a decision.
      const considered: LineageNode[] = [];
      if (node.type === "decision") {
        for (const e of incoming) {
          if (e.type !== "led_to") continue;
          const question = byId.get(e.from);
          if (question?.type !== "question") continue;
          for (const qe of store.edgesFor(question.id).outgoing) {
            if (qe.type !== "considers") continue;
            const alt = byId.get(qe.to);
            if (alt && !considered.some((n) => n.id === alt.id)) considered.push(alt);
          }
        }
      }

      return {
        node,
        kind: meta.kind,
        matchedRefs: meta.refs,
        ledToBy,
        leadsTo,
        ...(supersedes ? { supersedes } : {}),
        considered,
      };
    });

    return { file: req, entries, totalMatches: ranked.length };
  });
}

// ---- plain-text rendering (shared shape with the CLI's colored version) ----

const TYPE_LABEL: Record<NodeType, string> = {
  question: "QUESTION",
  alternative: "ALTERNATIVE",
  decision: "DECISION",
  experiment: "EXPERIMENT",
  implementation: "IMPLEMENTATION",
  outcome: "OUTCOME",
  constraint: "CONSTRAINT",
};

/** Short display id: first 10 + last 4 chars, as shown by the CLI/UI. */
export function displayId(id: string): string {
  return `${id.slice(0, 10)}${id.slice(-4)}`;
}

/** Render one FileContext as readable text for agents and terminals. */
export function formatFileContext(ctx: FileContext): string {
  if (ctx.entries.length === 0) {
    return `No recorded lineage for ${ctx.file}. If a decision shapes this file, record it (arabian add / arabian_create_node) so future work can find it.`;
  }
  const lines: string[] = [`Relevant engineering context for ${ctx.file}:`, ""];
  for (const entry of ctx.entries) {
    const n = entry.node;
    lines.push(`${TYPE_LABEL[n.type]} ${displayId(n.id)} — ${n.title}  [${n.status}]`);
    if (n.description) {
      const why = n.description.length > 400 ? n.description.slice(0, 397) + "..." : n.description;
      for (const l of why.split("\n")) lines.push(`  ${l}`);
    }
    if (n.fileRefs?.length) lines.push(`  Files: ${n.fileRefs.join(", ")}`);
    for (const r of entry.ledToBy) {
      lines.push(`  Led to by: ${r.type} ← ${TYPE_LABEL[r.node.type]} ${r.node.title}${r.note ? ` (${r.note})` : ""}`);
    }
    for (const r of entry.leadsTo) {
      lines.push(`  Leads to: ${r.type} → ${TYPE_LABEL[r.node.type]} ${r.node.title}${r.note ? ` (${r.note})` : ""}`);
    }
    if (entry.considered.length) {
      lines.push(`  Alternatives considered: ${entry.considered.map((a) => a.title).join(", ")}`);
    }
    if (entry.supersedes) {
      lines.push(`  Supersedes: ${TYPE_LABEL[entry.supersedes.type]} ${displayId(entry.supersedes.id)} — ${entry.supersedes.title}`);
    }
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}
