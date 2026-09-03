/**
 * Arabian domain model — pure types, no runtime code.
 * The web app imports these type-only, so this file must stay import-free.
 */

export const NODE_TYPES = [
  "question",
  "alternative",
  "decision",
  "experiment",
  "implementation",
  "outcome",
  "constraint",
] as const;

export type NodeType = (typeof NODE_TYPES)[number];

export const NODE_STATUSES = [
  "draft",
  "proposed",
  "accepted",
  "rejected",
  "superseded",
  "abandoned",
  "completed",
] as const;

export type NodeStatus = (typeof NODE_STATUSES)[number];

export const EDGE_TYPES = [
  "led_to", //        question → decision
  "considers", //     question → alternative
  "chooses", //       decision → alternative
  "rejects", //       decision → alternative
  "supersedes", //    decision → decision (new → old)
  "implements", //    implementation → decision
  "produces", //      experiment → outcome
  "constrains", //    constraint → question | decision
  "triggers", //      outcome → question (the lineage cycle)
  "references", //    any → any (escape hatch)
] as const;

export type EdgeType = (typeof EDGE_TYPES)[number];

export type Actor =
  | { kind: "human"; name: string }
  | { kind: "agent"; name: string; model?: string };

export interface LineageNode {
  id: string; // ULID
  type: NodeType;
  title: string;
  description?: string; // Markdown
  status: NodeStatus;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
  createdBy: Actor;
  tags?: string[];
  fileRefs?: string[]; // repo-relative paths
  metadata?: Record<string, unknown>;
}

export interface LineageEdge {
  id: string; // ULID
  from: string; // node id
  to: string; // node id
  type: EdgeType;
  note?: string;
  createdAt: string; // ISO 8601
  createdBy: Actor;
}

export interface ProjectMeta {
  name: string;
  description?: string;
  /** Git remote or repo homepage URL — enables GitHub links for file refs. */
  repository?: string;
  createdAt: string;
}

export interface Graph {
  project: ProjectMeta;
  nodes: LineageNode[];
  edges: LineageEdge[];
}

/** A node plus its resolved incoming/outgoing edges. */
export interface NodeWithContext {
  node: LineageNode;
  incoming: LineageEdge[];
  outgoing: LineageEdge[];
}

export type LineageDirection = "up" | "down" | "both";

/** Subgraph around a node, N hops out. */
export interface LineageSubgraph {
  root: string;
  hops: number;
  nodes: LineageNode[];
  edges: LineageEdge[];
}

export const DEFAULT_STATUS_BY_TYPE: Record<NodeType, NodeStatus> = {
  question: "proposed",
  alternative: "proposed",
  decision: "proposed",
  experiment: "draft",
  implementation: "draft",
  outcome: "completed",
  constraint: "accepted",
};

export interface ProjectStats {
  totalNodes: number;
  byType: Record<string, number>;
  byStatus: Record<string, number>;
  openQuestions: number;
  totalDecisions: number;
  activeExperiments: number;
  totalEdges: number;
}

export interface SearchHit {
  node: LineageNode;
  score: number;
  where: ("title" | "description" | "tags" | "fileRefs")[];
}
