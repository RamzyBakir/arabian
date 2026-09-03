import type { EdgeType, NodeStatus, NodeType } from "@core/types";

/** Node-type palette from the design system (README §7). */
export const TYPE_COLORS: Record<NodeType, { hex: string; label: string }> = {
  question: { hex: "#F59E0B", label: "Question" },
  alternative: { hex: "#8B5CF6", label: "Alternative" },
  decision: { hex: "#3B82F6", label: "Decision" },
  experiment: { hex: "#EC4899", label: "Experiment" },
  implementation: { hex: "#10B981", label: "Implementation" },
  outcome: { hex: "#F97316", label: "Outcome" },
  constraint: { hex: "#EF4444", label: "Constraint" },
};

export const STATUS_STYLES: Record<NodeStatus, { label: string; hex: string }> = {
  draft: { label: "Draft", hex: "#8b8b96" },
  proposed: { label: "Proposed", hex: "#EAB308" },
  accepted: { label: "Accepted", hex: "#60A5FA" },
  rejected: { label: "Rejected", hex: "#F87171" },
  superseded: { label: "Superseded", hex: "#8b8b96" },
  abandoned: { label: "Abandoned", hex: "#8b8b96" },
  completed: { label: "Completed", hex: "#34D399" },
};

export const EDGE_LABELS: Record<EdgeType, string> = {
  led_to: "led to",
  considers: "considers",
  chooses: "chooses",
  rejects: "rejects",
  supersedes: "supersedes",
  implements: "implements",
  produces: "produces",
  constrains: "constrains",
  triggers: "triggers",
  references: "references",
};

/** Visual style per edge type (README §7). */
export const EDGE_STYLE: Record<EdgeType, { color: string; dash?: string; width: number; animate?: boolean }> = {
  led_to: { color: "#3b82f6", width: 2 },
  considers: { color: "#8b5cf6", dash: "6 4", width: 1.5 },
  chooses: { color: "#3b82f6", width: 2.5 },
  rejects: { color: "#ef4444", dash: "6 4", width: 1.5 },
  supersedes: { color: "#f97316", dash: "2 4", width: 2 },
  implements: { color: "#10b981", width: 2 },
  produces: { color: "#f97316", width: 2 },
  constrains: { color: "#ef4444", width: 1.5 },
  triggers: { color: "#f59e0b", width: 2.5, animate: true },
  references: { color: "#8888a0", dash: "2 4", width: 1.5 },
};

export const NODE_TYPES = Object.keys(TYPE_COLORS) as NodeType[];
export const NODE_STATUSES = Object.keys(STATUS_STYLES) as NodeStatus[];
export const EDGE_TYPES = Object.keys(EDGE_LABELS) as EdgeType[];
