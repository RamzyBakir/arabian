import { existsSync, readdirSync, readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { lineageEdgeSchema, lineageNodeSchema } from "./schema.js";
import type { Store } from "./store.js";
import type { LineageEdge, LineageNode } from "./types.js";
import { isSafeRef } from "./store.js";

export interface DoctorIssue {
  severity: "error" | "warning";
  message: string;
}

export interface DoctorReport {
  nodeCount: number;
  edgeCount: number;
  errors: DoctorIssue[];
  warnings: DoctorIssue[];
}

/**
 * Structural integrity check over the raw files. Unlike the Store (which
 * throws on the first bad file) this scans everything and reports:
 * malformed JSON, schema violations, duplicate ids, dangling/duplicate
 * edges, self loops, and (optionally) fileRefs that don't exist on disk.
 */
export function runDoctor(store: Store, opts: { checkFiles?: boolean } = {}): DoctorReport {
  const errors: DoctorIssue[] = [];
  const warnings: DoctorIssue[] = [];

  // ---- nodes: lenient per-file scan ----
  const nodes: LineageNode[] = [];
  const filesById = new Map<string, string>();
  let files: string[];
  try {
    files = readdirSync(store.paths.nodesDir);
  } catch {
    files = [];
    errors.push({ severity: "error", message: `cannot read ${store.paths.nodesDir}` });
  }
  for (const f of files) {
    if (!f.endsWith(".json")) continue;
    const file = join(store.paths.nodesDir, f);
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(file, "utf8"));
    } catch (err) {
      errors.push({ severity: "error", message: `malformed JSON in ${f}: ${(err as Error).message}` });
      continue;
    }
    const parsed = lineageNodeSchema.safeParse(raw);
    if (!parsed.success) {
      errors.push({ severity: "error", message: `invalid node in ${f}: ${parsed.error.issues[0]?.message ?? "schema mismatch"}` });
      continue;
    }
    const seenFile = filesById.get(parsed.data.id);
    if (seenFile) {
      errors.push({ severity: "error", message: `duplicate node id ${parsed.data.id} in ${f} and ${seenFile}` });
      continue;
    }
    filesById.set(parsed.data.id, f);
    nodes.push(parsed.data);
  }

  // ---- edges ----
  let edges: LineageEdge[] = [];
  let rawEdges: unknown;
  try {
    rawEdges = JSON.parse(readFileSync(store.paths.edgesFile, "utf8"));
  } catch (err) {
    errors.push({ severity: "error", message: `malformed edges.json: ${(err as Error).message}` });
    rawEdges = undefined;
  }
  if (Array.isArray(rawEdges)) {
    edges = [];
    rawEdges.forEach((entry, i) => {
      const parsed = lineageEdgeSchema.safeParse(entry);
      if (!parsed.success) {
        errors.push({ severity: "error", message: `invalid edge at index ${i} in edges.json: ${parsed.error.issues[0]?.message ?? "schema mismatch"}` });
        return;
      }
      const e = parsed.data;
      if (e.from === e.to) {
        errors.push({ severity: "error", message: `edge ${e.id} (${e.type}) loops ${e.from} → itself` });
      }
      if (!filesById.has(e.from)) {
        errors.push({ severity: "error", message: `dangling edge ${e.id}: from-node ${e.from} does not exist` });
      }
      if (!filesById.has(e.to)) {
        errors.push({ severity: "error", message: `dangling edge ${e.id}: to-node ${e.to} does not exist` });
      }
      edges.push(e);
    });
    const seen = new Set<string>();
    for (const e of edges) {
      const key = `${e.from}|${e.to}|${e.type}`;
      if (seen.has(key)) {
        errors.push({ severity: "error", message: `duplicate edge ${e.type} from ${e.from} to ${e.to}` });
      }
      seen.add(key);
    }
  } else if (rawEdges !== undefined) {
    errors.push({ severity: "error", message: "edges.json must contain a JSON array" });
  }

  // ---- warnings ----
  const linked = new Set(edges.flatMap((e) => [e.from, e.to]));
  const orphans = nodes.filter((n) => !linked.has(n.id));
  if (orphans.length > 0) {
    warnings.push({
      severity: "warning",
      message: `${orphans.length} node(s) with no edges: ${orphans.map((n) => n.id).join(", ")}`,
    });
  }

  if (opts.checkFiles) {
    for (const n of nodes) {
      for (const ref of n.fileRefs ?? []) {
        if (!isSafeRef(ref) || isAbsolute(ref)) continue;
        if (!existsSync(join(store.paths.root, ref))) {
          warnings.push({ severity: "warning", message: `node ${n.id} references missing file ${ref}` });
        }
      }
    }
  }

  return {
    nodeCount: nodes.length,
    edgeCount: edges.length,
    errors,
    warnings,
  };
}
