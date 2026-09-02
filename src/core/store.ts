import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { ulid } from "./ulid.js";
import {
  DEFAULT_STATUS_BY_TYPE,
  type Actor,
  type EdgeType,
  type Graph,
  type LineageEdge,
  type LineageNode,
  type NodeWithContext,
  type ProjectMeta,
} from "./types.js";
import {
  edgeInputSchema,
  lineageEdgeSchema,
  lineageNodeSchema,
  nodeInputSchema,
  nodePatchSchema,
  projectMetaSchema,
  type EdgeInput,
  type NodeInput,
  type NodePatch,
} from "./schema.js";

const ARABIAN_DIR = ".arabian";

export class StoreError extends Error {
  constructor(
    public code:
      | "no_project"
      | "not_found"
      | "already_exists"
      | "invalid"
      | "io",
    message: string,
  ) {
    super(message);
    this.name = "StoreError";
  }
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function defaultActor(): Actor {
  return { kind: "human", name: "local" };
}

/**
 * Walk up from `startDir` looking for a `.arabian/` directory.
 * Returns the directory *containing* `.arabian/`, or null.
 */
export function findStoreRoot(startDir: string = process.cwd()): string | null {
  let dir = resolve(startDir);
  for (;;) {
    if (existsSync(join(dir, ARABIAN_DIR))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export interface ProjectPaths {
  root: string;
  arabian: string;
  nodesDir: string;
  edgesFile: string;
  projectFile: string;
}

function pathsFor(root: string): ProjectPaths {
  const arabian = join(root, ARABIAN_DIR);
  return {
    root,
    arabian,
    nodesDir: join(arabian, "nodes"),
    edgesFile: join(arabian, "edges.json"),
    projectFile: join(arabian, "project.json"),
  };
}

/** Create a fresh `.arabian/` project at `root`. Throws if one already exists. */
export function initProject(
  root: string,
  meta: { name: string; description?: string },
): ProjectMeta {
  const p = pathsFor(root);
  if (existsSync(p.arabian)) {
    throw new StoreError("already_exists", `.arabian/ already exists at ${root}`);
  }
  mkdirSync(p.nodesDir, { recursive: true });
  const metaJson: ProjectMeta = {
    name: meta.name,
    ...(meta.description ? { description: meta.description } : {}),
    createdAt: nowIso(),
  };
  projectMetaSchema.parse(metaJson);
  writeJson(p.projectFile, metaJson);
  writeJson(p.edgesFile, []);
  return metaJson;
}

export class Store {
  readonly paths: ProjectPaths;

  private constructor(root: string) {
    this.paths = pathsFor(root);
  }

  /** Open the store rooted at an explicit directory containing `.arabian/`. */
  static at(root: string): Store {
    const p = pathsFor(resolve(root));
    if (!existsSync(p.arabian)) {
      throw new StoreError("no_project", `no ${ARABIAN_DIR}/ found at ${root} (run \`arabian init\`)`);
    }
    return new Store(resolve(root));
  }

  /** Open the store found by walking up from `startDir`. */
  static discover(startDir: string = process.cwd()): Store {
    const root = findStoreRoot(startDir);
    if (!root) {
      throw new StoreError("no_project", `no ${ARABIAN_DIR}/ found in or above ${startDir} (run \`arabian init\`)`);
    }
    return new Store(root);
  }

  getProject(): ProjectMeta {
    return projectMetaSchema.parse(readJson(this.paths.projectFile));
  }

  // ---- nodes ----

  private nodeFile(id: string, type: string): string {
    return join(this.paths.nodesDir, `${id}.${type}.json`);
  }

  private findNodeFile(id: string): string | null {
    const prefix = `${id}.`;
    for (const f of readdirSync(this.paths.nodesDir)) {
      if (f.startsWith(prefix) && f.endsWith(".json")) {
        return join(this.paths.nodesDir, f);
      }
    }
    return null;
  }

  listNodes(): LineageNode[] {
    let files: string[];
    try {
      files = readdirSync(this.paths.nodesDir);
    } catch {
      return [];
    }
    const nodes: LineageNode[] = [];
    for (const f of files) {
      if (!f.endsWith(".json")) continue;
      const file = join(this.paths.nodesDir, f);
      const parsed = lineageNodeSchema.safeParse(readJson(file));
      if (!parsed.success) {
        throw new StoreError("invalid", `invalid node file ${f}: ${parsed.error.message}`);
      }
      nodes.push(parsed.data);
    }
    nodes.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    return nodes;
  }

  getNode(id: string): LineageNode {
    const file = this.findNodeFile(id);
    if (!file) throw new StoreError("not_found", `no node with id ${id}`);
    const parsed = lineageNodeSchema.safeParse(readJson(file));
    if (!parsed.success) {
      throw new StoreError("invalid", `invalid node file ${file}: ${parsed.error.message}`);
    }
    return parsed.data;
  }

  hasNode(id: string): boolean {
    return this.findNodeFile(id) !== null;
  }

  createNode(input: NodeInput, opts: { id?: string; at?: Date } = {}): LineageNode {
    const data = nodeInputSchema.parse(input);
    const at = (opts.at ?? new Date()).toISOString();
    const node: LineageNode = {
      id: opts.id ?? ulid(opts.at?.getTime()),
      type: data.type,
      title: data.title,
      status: data.status ?? DEFAULT_STATUS_BY_TYPE[data.type],
      createdAt: at,
      updatedAt: at,
      createdBy: data.createdBy ?? defaultActor(),
      ...(data.description !== undefined ? { description: data.description } : {}),
      ...(data.tags?.length ? { tags: dedupe(data.tags) } : {}),
      ...(data.fileRefs?.length ? { fileRefs: dedupe(data.fileRefs) } : {}),
      ...(data.metadata !== undefined ? { metadata: data.metadata } : {}),
    };
    lineageNodeSchema.parse(node);
    const file = this.nodeFile(node.id, node.type);
    if (existsSync(file)) {
      throw new StoreError("already_exists", `node ${node.id} already exists`);
    }
    writeJson(file, node);
    return node;
  }

  updateNode(id: string, patch: NodePatch): LineageNode {
    const data = nodePatchSchema.parse(patch);
    const node = this.getNode(id);
    const next: LineageNode = { ...node };
    if (data.title !== undefined) next.title = data.title;
    if (data.description !== undefined) {
      if (data.description === null) delete next.description;
      else next.description = data.description;
    }
    if (data.status !== undefined) next.status = data.status;
    if (data.tags !== undefined) {
      if (data.tags === null || data.tags.length === 0) delete next.tags;
      else next.tags = dedupe(data.tags);
    }
    if (data.fileRefs !== undefined) {
      if (data.fileRefs === null || data.fileRefs.length === 0) delete next.fileRefs;
      else next.fileRefs = dedupe(data.fileRefs);
    }
    if (data.metadata !== undefined) {
      if (data.metadata === null) delete next.metadata;
      else next.metadata = data.metadata;
    }
    next.updatedAt = nowIso();
    lineageNodeSchema.parse(next);
    const oldFile = this.nodeFile(node.id, node.type);
    const newFile = this.nodeFile(next.id, next.type);
    if (oldFile !== newFile) {
      rmSync(oldFile);
    }
    writeJson(newFile, next);
    return next;
  }

  /** Delete a node and any edges touching it. Returns number of edges removed. */
  deleteNode(id: string): number {
    const node = this.getNode(id);
    rmSync(this.nodeFile(node.id, node.type));
    const edges = this.listEdges();
    const kept = edges.filter((e) => e.from !== id && e.to !== id);
    const removed = edges.length - kept.length;
    if (removed > 0) writeJson(this.paths.edgesFile, kept);
    return removed;
  }

  // ---- edges ----

  listEdges(): LineageEdge[] {
    const raw = readJson(this.paths.edgesFile);
    if (!Array.isArray(raw)) {
      throw new StoreError("invalid", `${this.paths.edgesFile} must contain a JSON array`);
    }
    const edges: LineageEdge[] = [];
    for (let i = 0; i < raw.length; i++) {
      const parsed = lineageEdgeSchema.safeParse(raw[i]);
      if (!parsed.success) {
        throw new StoreError("invalid", `invalid edge at index ${i} in edges.json: ${parsed.error.message}`);
      }
      edges.push(parsed.data);
    }
    edges.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    return edges;
  }

  private saveEdges(edges: LineageEdge[]): void {
    writeJson(this.paths.edgesFile, edges);
  }

  createEdge(input: EdgeInput): LineageEdge {
    const data = edgeInputSchema.parse(input);
    if (data.from === data.to) {
      throw new StoreError("invalid", "edge endpoints must be two different nodes");
    }
    const from = this.getNode(data.from); // throws not_found
    this.getNode(data.to);
    const edges = this.listEdges();
    if (edges.some((e) => e.from === data.from && e.to === data.to && e.type === data.type)) {
      throw new StoreError(
        "already_exists",
        `edge ${data.type} already exists from ${from.id} to ${data.to}`,
      );
    }
    const edge: LineageEdge = {
      id: ulid(),
      from: data.from,
      to: data.to,
      type: data.type,
      createdAt: nowIso(),
      createdBy: data.createdBy ?? defaultActor(),
      ...(data.note !== undefined ? { note: data.note } : {}),
    };
    lineageEdgeSchema.parse(edge);
    edges.push(edge);
    this.saveEdges(edges);
    return edge;
  }

  deleteEdge(id: string): void {
    const edges = this.listEdges();
    const kept = edges.filter((e) => e.id !== id);
    if (kept.length === edges.length) {
      throw new StoreError("not_found", `no edge with id ${id}`);
    }
    this.saveEdges(kept);
  }

  edgesFor(id: string): { incoming: LineageEdge[]; outgoing: LineageEdge[] } {
    const edges = this.listEdges();
    return {
      incoming: edges.filter((e) => e.to === id),
      outgoing: edges.filter((e) => e.from === id),
    };
  }

  getNodeWithContext(id: string): NodeWithContext {
    const node = this.getNode(id);
    const { incoming, outgoing } = this.edgesFor(id);
    return { node, incoming, outgoing };
  }

  getGraph(): Graph {
    return {
      project: this.getProject(),
      nodes: this.listNodes(),
      edges: this.listEdges(),
    };
  }
}

// ---- helpers ----

function readJson(file: string): unknown {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (err) {
    throw new StoreError("io", `failed to read ${file}: ${(err as Error).message}`);
  }
}

function writeJson(file: string, data: unknown): void {
  try {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
  } catch (err) {
    throw new StoreError("io", `failed to write ${file}: ${(err as Error).message}`);
  }
}

function dedupe(xs: string[]): string[] {
  return [...new Set(xs.map((x) => x.trim()).filter(Boolean))];
}

/** Reject absolute or parent-escaping file refs; callers use this for UI links. */
export function isSafeRef(ref: string): boolean {
  if (isAbsolute(ref)) return false;
  return !ref.split(/[\\/]/).includes("..");
}
