import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ZodType } from "zod";
import { z } from "zod";
import {
  Store,
  StoreError,
  edgeInputSchema,
  getStats,
  matchNodeId,
  nodeInputSchema,
  nodePatchSchema,
  actorSchema,
  searchNodes,
  type LineageEdge,
  type NodeType,
} from "../core/index.js";

export interface ServeOptions {
  port: number;
  host: string;
  webDir?: string;
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".map": "application/json",
};

function defaultWebDir(): string {
  // dist/server/http.js -> <root>/web/dist
  return fileURLToPath(new URL("../../web/dist", import.meta.url));
}

function jsonRes(res: ServerResponse, status: number, data: unknown): void {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
  });
  res.end(body);
}

/** Validate a request body against a core schema, mapping failures to 400s. */
function parseWith<T>(schema: ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue?.path.length ? issue.path.join(".") : "body";
    throw new StoreError("invalid", `invalid request: ${where}: ${issue?.message ?? "schema mismatch"}`);
  }
  return parsed.data;
}

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

const supersedeBodySchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  note: z.string().optional(),
  createdBy: actorSchema.optional(),
});

/** Is the Host header a loopback address on the expected port? */
function isLoopbackHost(hostHeader: string, port: number): boolean {
  const bracket = /^\[(.+)\](?::(\d+))?$/.exec(hostHeader);
  const hostname = bracket ? bracket[1]! : hostHeader.includes(":") ? hostHeader.slice(0, hostHeader.lastIndexOf(":")) : hostHeader;
  const portPart = bracket ? bracket[2] : hostHeader.includes(":") ? hostHeader.slice(hostHeader.lastIndexOf(":") + 1) : undefined;
  if (portPart !== undefined && portPart !== "" && portPart !== String(port)) return false;
  return LOOPBACK_HOSTS.has(hostname);
}

function errorRes(res: ServerResponse, err: unknown): void {
  if (err instanceof StoreError) {
    const status = err.code === "not_found" ? 404 : err.code === "already_exists" ? 409 : 400;
    jsonRes(res, status, { error: err.message });
    return;
  }
  jsonRes(res, 500, { error: (err as Error).message ?? "internal error" });
}

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolvePromise, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > 1_000_000) {
        reject(new StoreError("invalid", "request body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (chunks.length === 0) return resolvePromise(undefined);
      try {
        resolvePromise(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(new StoreError("invalid", "request body is not valid JSON"));
      }
    });
    req.on("error", reject);
  });
}

/** Attach resolved titles to edges so the UI doesn't need a second lookup. */
function decorateEdges(store: Store, edges: LineageEdge[]): (LineageEdge & { fromTitle?: string; toTitle?: string })[] {
  const titles = new Map(store.listNodes().map((n) => [n.id, n.title]));
  return edges.map((e) => ({
    ...e,
    fromTitle: titles.get(e.from),
    toTitle: titles.get(e.to),
  }));
}

export function serve(store: Store, opts: ServeOptions): void {
  const webDir = resolve(opts.webDir ?? defaultWebDir());
  // Only enforce loopback Host checks when we're actually bound to loopback —
  // a user who deliberately serves on 0.0.0.0 opts out of the protection.
  const boundLoopback = LOOPBACK_HOSTS.has(opts.host.replace(/^\[|\]$/g, ""));

  const server = createServer(async (req, res) => {
    if (boundLoopback) {
      const host = req.headers.host;
      if (!host || !isLoopbackHost(host, opts.port)) {
        res.writeHead(403, { "Content-Type": "text/plain" });
        res.end("forbidden: arabian only accepts loopback requests");
        return;
      }
    }

    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const path = url.pathname;

    if (path === "/api" || path.startsWith("/api/")) {
      try {
        await handleApi(req, res, store, path, url);
      } catch (err) {
        errorRes(res, err);
      }
      return;
    }

    try {
      await serveStatic(res, webDir, path);
    } catch {
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("internal error");
    }
  });

  server.on("error", (err) => {
    console.error(`arabian serve: ${(err as Error).message}`);
    process.exit(1);
  });

  server.listen(opts.port, opts.host, () => {
    const project = store.getProject();
    console.log(`Arabian — ${project.name}`);
    console.log(`  lineage UI:  http://${opts.host}:${opts.port}`);
    console.log(`  api:         http://${opts.host}:${opts.port}/api/graph`);
    console.log(`  web assets:  ${webDir}`);
  });
}

async function handleApi(
  req: IncomingMessage,
  res: ServerResponse,
  store: Store,
  path: string,
  url: URL,
): Promise<void> {
  const segments = path.split("/").filter(Boolean); // ["api", ...]
  const method = req.method ?? "GET";

  // GET /api/project
  if (method === "GET" && path === "/api/project") {
    return void jsonRes(res, 200, { ...store.getProject(), stats: getStats(store) });
  }

  // GET /api/graph
  if (method === "GET" && path === "/api/graph") {
    return void jsonRes(res, 200, store.getGraph());
  }

  // GET /api/mcp-config — ready-to-paste MCP configs with the real server path
  if (method === "GET" && path === "/api/mcp-config") {
    const serverPath = fileURLToPath(new URL("../mcp/server.js", import.meta.url));
    return void jsonRes(res, 200, {
      serverPath,
      json: JSON.stringify(
        { mcpServers: { arabian: { command: "node", args: [serverPath] } } },
        null,
        2,
      ),
      toml: `[mcp_servers.arabian]\ncommand = "node"\nargs = ["${serverPath}"]\n`,
    });
  }

  // GET /api/search?q=
  if (method === "GET" && path === "/api/search") {
    const q = url.searchParams.get("q") ?? "";
    return void jsonRes(res, 200, { hits: searchNodes(store, q) });
  }

  // /api/nodes
  if (segments[1] === "nodes") {
    const id = segments[2];
    const action = segments[3];

    if (method === "GET" && !id) {
      const nodes = store.listNodes().filter((n) =>
        (!url.searchParams.get("type") || n.type === url.searchParams.get("type")) &&
        (!url.searchParams.get("status") || n.status === url.searchParams.get("status")) &&
        (!url.searchParams.get("tag") || n.tags?.includes(url.searchParams.get("tag")!)),
      );
      return void jsonRes(res, 200, { nodes });
    }

    if (method === "POST" && !id) {
      const body = await readBody(req);
      if (!body) throw new StoreError("invalid", "request body required");
      const input = parseWith(nodeInputSchema, body);
      const node = store.createNode({
        ...input,
        createdBy: input.createdBy ?? { kind: "human", name: "local" },
      });
      return void jsonRes(res, 201, node);
    }

    if (id) {
      const nodeId = resolvePrefix(store, id);

      if (method === "GET" && !action) {
        const { node, incoming, outgoing } = store.getNodeWithContext(nodeId);
        return void jsonRes(res, 200, {
          node,
          incoming: decorateEdges(store, incoming),
          outgoing: decorateEdges(store, outgoing),
        });
      }

      if (method === "PATCH" && !action) {
        const body = await readBody(req);
        return void jsonRes(res, 200, store.updateNode(nodeId, parseWith(nodePatchSchema, body ?? {})));
      }

      if (method === "POST" && action === "supersede") {
        const parsed = parseWith(supersedeBodySchema, await readBody(req));
        const old = store.getNode(nodeId);
        if (old.type !== ("decision" satisfies NodeType)) {
          throw new StoreError("invalid", "only decisions can be superseded");
        }
        const by = parsed.createdBy ?? { kind: "human", name: "local" };
        const newNode = store.createNode({
          type: "decision",
          title: parsed.title,
          description: parsed.description,
          status: "accepted",
          fileRefs: old.fileRefs,
          tags: old.tags,
          createdBy: by,
        });
        const edge = store.createEdge({
          from: newNode.id,
          to: old.id,
          type: "supersedes",
          note: parsed.note,
          createdBy: by,
        });
        store.updateNode(old.id, { status: "superseded" });
        return void jsonRes(res, 201, { newNode, superseded: old.id, edge });
      }
    }
  }

  // /api/edges
  if (segments[1] === "edges") {
    const id = segments[2];

    if (method === "GET" && !id) {
      return void jsonRes(res, 200, { edges: decorateEdges(store, store.listEdges()) });
    }

    if (method === "POST" && !id) {
      const body = await readBody(req);
      const edge = store.createEdge(parseWith(edgeInputSchema, body ?? {}));
      return void jsonRes(res, 201, edge);
    }

    if (method === "DELETE" && id) {
      store.deleteEdge(id);
      return void jsonRes(res, 200, { ok: true });
    }
  }

  jsonRes(res, 404, { error: `no route: ${method} ${path}` });
}

function resolvePrefix(store: Store, idOrPrefix: string): string {
  return matchNodeId(store, idOrPrefix);
}

async function serveStatic(res: ServerResponse, webDir: string, path: string): Promise<void> {
  let filePath = normalize(join(webDir, path === "/" ? "index.html" : path));
  if (!filePath.startsWith(webDir)) {
    res.writeHead(403).end("forbidden");
    return;
  }

  let data: Buffer | null = null;
  try {
    const s = await stat(filePath);
    if (s.isDirectory()) filePath = join(filePath, "index.html");
    data = await readFile(filePath);
  } catch {
    // SPA fallback: extension-less routes get index.html
    if (extname(path)) {
      res.writeHead(404, { "Content-Type": "text/plain" }).end("not found");
      return;
    }
    data = await readFile(join(webDir, "index.html"));
  }

  res.writeHead(200, {
    "Content-Type": MIME[extname(filePath)] ?? "application/octet-stream",
    "Cache-Control": "no-cache",
  });
  res.end(data);
}
