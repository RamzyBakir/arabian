import type {
  EdgeType,
  LineageEdge,
  LineageNode,
  NodeStatus,
  NodeType,
  ProjectMeta,
  ProjectStats,
  Actor,
} from "@core/types";

async function toJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

const get = <T,>(url: string) => fetch(url).then((r) => toJson<T>(r));
const send = <T,>(method: string, url: string, body?: unknown) =>
  fetch(url, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  }).then((r) => toJson<T>(r));

export interface DecoratedEdge extends LineageEdge {
  fromTitle?: string;
  toTitle?: string;
}

export interface ProjectInfo extends ProjectMeta {
  stats: ProjectStats;
}

export interface NodeDetailPayload {
  node: LineageNode;
  incoming: DecoratedEdge[];
  outgoing: DecoratedEdge[];
}

export interface NodeInputPayload {
  type: NodeType;
  title: string;
  description?: string;
  tags?: string[];
  fileRefs?: string[];
  status?: NodeStatus;
  createdBy?: Actor;
}

export const api = {
  project: () => get<ProjectInfo>("/api/project"),
  nodes: () => get<{ nodes: LineageNode[] }>("/api/nodes"),
  node: (id: string) => get<NodeDetailPayload>(`/api/nodes/${id}`),
  edges: () => get<{ edges: DecoratedEdge[] }>("/api/edges"),
  graph: () => get<import("@core/types").Graph>("/api/graph"),
  createNode: (input: NodeInputPayload) => send<LineageNode>("POST", "/api/nodes", input),
  updateNode: (id: string, patch: Record<string, unknown>) => send<LineageNode>("PATCH", `/api/nodes/${id}`, patch),
  supersede: (id: string, body: { title: string; description?: string; note?: string }) =>
    send<{ newNode: LineageNode; superseded: string }>("POST", `/api/nodes/${id}/supersede`, body),
  createEdge: (input: { from: string; to: string; type: EdgeType; note?: string }) =>
    send<LineageEdge>("POST", "/api/edges", input),
  deleteEdge: (id: string) => send<{ ok: true }>("DELETE", `/api/edges/${id}`),
};
