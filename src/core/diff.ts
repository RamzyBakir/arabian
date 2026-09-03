import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { StoreError, type Store } from "./store.js";
import { git } from "./git.js";
import { lineageEdgeSchema, lineageNodeSchema } from "./schema.js";
import type { LineageEdge, LineageNode } from "./types.js";

export type DiffChange = "added" | "modified" | "removed";

export interface NodeDiff {
  change: DiffChange;
  node: LineageNode;
  /** Previous revision, present for "modified" and "removed". */
  old?: LineageNode;
}

export interface LinkDiff {
  change: "added" | "removed";
  edge: LineageEdge;
}

export interface LineageDiff {
  ref: string;
  nodes: NodeDiff[];
  links: LinkDiff[];
}

/** Lenient parse: corrupt files are doctor's job, not the differ's. */
function parseNode(raw: unknown): LineageNode | null {
  const parsed = lineageNodeSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

function parseEdges(raw: unknown): LineageEdge[] {
  if (!Array.isArray(raw)) return [];
  const edges: LineageEdge[] = [];
  for (const entry of raw) {
    const parsed = lineageEdgeSchema.safeParse(entry);
    if (parsed.success) edges.push(parsed.data);
  }
  return edges;
}

function readJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/**
 * Compare the working tree `.arabian/` against `ref` (default HEAD) using git.
 * Requires `.arabian/` to be tracked in the repo rooted at (or above) the store.
 */
export function diffSince(store: Store, ref = "HEAD"): LineageDiff {
  const root = store.paths.root;
  if (git(["rev-parse", "--verify", ref], root) === null) {
    throw new StoreError("invalid", `"${ref}" is not a valid git ref (or git is unavailable)`);
  }

  // Pathspec for .arabian/ relative to the repo root, in case the project
  // lives in a subdirectory of the repository.
  const toplevel = git(["rev-parse", "--show-toplevel"], root);
  const prefix = toplevel ? relative(resolve(toplevel), resolve(root)) : "";
  const arabianPath = prefix ? `${prefix.split(/[\\/]/).join("/")}/.arabian` : ".arabian";

  const nodeDiffs: NodeDiff[] = [];
  let linkDiffs: LinkDiff[] = [];
  let edgesChanged = false;

  const stripPrefix = (path: string): string =>
    prefix ? path.slice(prefix.split(/[\\/]/).join("/").length + 1) : path;

  const handlePath = (letter: string, path: string): void => {
    const relToRoot = stripPrefix(path);
    if (relToRoot.startsWith(".arabian/nodes/") && relToRoot.endsWith(".json")) {
      const file = resolve(root, relToRoot);
      if (letter === "A") {
        const node = parseNode(readJsonFile(file));
        if (node) nodeDiffs.push({ change: "added", node });
      } else if (letter === "D") {
        const oldRaw = git(["show", `${ref}:${path}`], root);
        const node = oldRaw !== null ? parseNode(readJson(oldRaw)) : null;
        if (node) nodeDiffs.push({ change: "removed", node, old: node });
      } else if (letter === "M") {
        const node = parseNode(readJsonFile(file));
        const oldRaw = git(["show", `${ref}:${path}`], root);
        const old = oldRaw !== null ? parseNode(readJson(oldRaw)) : null;
        if (node) nodeDiffs.push({ change: "modified", node, ...(old ? { old } : {}) });
      }
    } else if (relToRoot === ".arabian/edges.json") {
      edgesChanged = true;
    }
  };

  const out = git(["diff", "--name-status", "-z", ref, "--", arabianPath], root);
  if (out === null) {
    throw new StoreError("io", `git diff failed in ${root}`);
  }

  const tokens = out.length ? out.split("\0") : [];
  for (let i = 0; i < tokens.length; i++) {
    const status = tokens[i]!;
    if (!status) continue;
    const path = tokens[++i]!;
    if (!path) continue;
    const letter = status[0]!;
    if (letter === "R" || letter === "C") i++; // rename/copy carry a second path
    if (letter === "R") continue; // arabian never renames; ignore
    handlePath(letter, path);
  }

  // Untracked files are invisible to `git diff` — pick them up explicitly.
  const others = git(["ls-files", "--others", "--exclude-standard", "-z", "--", arabianPath], root);
  if (others) {
    for (const path of others.split("\0")) {
      if (path) handlePath("A", path);
    }
  }

  if (edgesChanged) {
    const newRaw = readJsonFile(resolve(root, ".arabian", "edges.json"));
    const oldRaw = git(["show", `${ref}:${arabianPath}/edges.json`], root);
    const now = parseEdges(newRaw);
    const before = oldRaw !== null ? parseEdges(readJson(oldRaw)) : [];
    const oldById = new Map(before.map((e) => [e.id, e]));
    const newById = new Map(now.map((e) => [e.id, e]));
    linkDiffs = [
      ...now.filter((e) => !oldById.has(e.id)).map((edge) => ({ change: "added" as const, edge })),
      ...before.filter((e) => !newById.has(e.id)).map((edge) => ({ change: "removed" as const, edge })),
    ];
  }

  return { ref, nodes: nodeDiffs, links: linkDiffs };
}

function readJsonFile(file: string): unknown {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return undefined;
  }
}
