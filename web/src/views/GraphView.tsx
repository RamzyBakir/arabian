import { useEffect, useMemo, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { Button, Card, Chip } from "@heroui/react";
import dagre from "@dagrejs/dagre";
import type { Graph, LineageEdge, LineageNode, NodeType } from "@core/types";
import { api } from "../api";
import { Orb } from "../components/Orb";
import { EyeIcon, EyeOffIcon } from "../components/icons";
import { ErrorState, LoadingOrb, StatusChip, TypeChip, relTime, shortId } from "../components/bits";
import { EDGE_STYLE, NODE_TYPES, TYPE_COLORS } from "../theme";
import { useTheme } from "../ThemeContext";

const NODE_W = 280;
const NODE_H = 76;

type FlowData = { lineage: LineageNode; dim: boolean; focused: boolean };
type FlowNode = Node<FlowData, "lineage">;

function LineageFlowNode({ data, selected }: NodeProps<FlowNode>) {
  const n = data.lineage;
  const color = TYPE_COLORS[n.type].hex;
  const active = data.focused || selected;
  return (
    <div
      className="rounded-xl border bg-surface px-4 py-3"
      style={{
        borderColor: `color-mix(in oklab, ${color} 55%, transparent)`,
        boxShadow: active ? `0 0 0 2px color-mix(in oklab, ${color} 40%, transparent), var(--surface-shadow, 0 8px 24px rgb(0 0 0 / 0.35))` : "var(--surface-shadow, 0 4px 14px rgb(0 0 0 / 0.25))",
        width: NODE_W,
      }}
    >
      <div className="absolute inset-y-0 left-0 w-1.5 rounded-l-xl" style={{ backgroundColor: color }} />
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
        <span className="text-xs font-semibold uppercase tracking-wide" style={{ color }}>
          {TYPE_COLORS[n.type].label}
        </span>
        <span className="text-xs text-muted">· {n.status}</span>
      </div>
      <div className="mt-1.5 line-clamp-2 text-sm font-medium leading-snug text-foreground">{n.title}</div>
    </div>
  );
}

const nodeTypes = { lineage: LineageFlowNode };

/** Undirected reachability from `root` across the node graph. */
function reachable(from: string, edges: LineageEdge[]): Set<string> {
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    (adj.get(e.from) ?? adj.set(e.from, []).get(e.from)!).push(e.to);
    (adj.get(e.to) ?? adj.set(e.to, []).get(e.to)!).push(e.from);
  }
  const seen = new Set([from]);
  const queue = [from];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const next of adj.get(cur) ?? []) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return seen;
}

function layout(nodes: LineageNode[], edges: LineageEdge[]): Map<string, { x: number; y: number }> {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "LR", nodesep: 40, ranksep: 100, marginx: 24, marginy: 24 });
  g.setDefaultEdgeLabel(() => ({}));
  const ids = new Set(nodes.map((n) => n.id));
  for (const n of nodes) g.setNode(n.id, { width: NODE_W, height: NODE_H });
  for (const e of edges) if (ids.has(e.from) && ids.has(e.to)) g.setEdge(e.from, e.to);
  dagre.layout(g);
  const pos = new Map<string, { x: number; y: number }>();
  for (const n of nodes) {
    const laid = g.node(n.id) as { x: number; y: number } | undefined;
    if (laid) pos.set(n.id, { x: laid.x - NODE_W / 2, y: laid.y - NODE_H / 2 });
  }
  return pos;
}

export function GraphView({ onOpenNode }: { onOpenNode: (id: string) => void }) {
  const [graph, setGraph] = useState<Graph | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Set<NodeType>>(new Set());
  const [focusId, setFocusId] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const { theme } = useTheme();

  useEffect(() => {
    api.graph().then(setGraph).catch((err) => setError((err as Error).message));
  }, []);

  const visible = useMemo(() => {
    if (!graph) return { nodes: [], edges: [] } as { nodes: LineageNode[]; edges: LineageEdge[] };
    const nodes = graph.nodes.filter((n) => !hidden.has(n.type));
    const ids = new Set(nodes.map((n) => n.id));
    return { nodes, edges: graph.edges.filter((e) => ids.has(e.from) && ids.has(e.to)) };
  }, [graph, hidden]);

  const flow = useMemo(() => {
    const pos = layout(visible.nodes, visible.edges);
    const reach = focusId ? reachable(focusId, visible.edges) : null;

    const nodes: FlowNode[] = visible.nodes.map((n) => ({
      id: n.id,
      type: "lineage",
      position: pos.get(n.id) ?? { x: 0, y: 0 },
      data: { lineage: n, dim: reach ? !reach.has(n.id) : false, focused: focusId === n.id },
      style: { opacity: reach && !reach.has(n.id) ? 0.14 : 1 },
    }));

    const edges: Edge[] = visible.edges.map((e) => {
      const style = EDGE_STYLE[e.type];
      const dim = reach ? !(reach.has(e.from) && reach.has(e.to)) : false;
      return {
        id: e.id,
        source: e.from,
        target: e.to,
        animated: style.animate && !dim,
        style: {
          stroke: style.color,
          strokeWidth: style.width,
          strokeDasharray: style.dash,
          opacity: dim ? 0.06 : 0.85,
        },
      };
    });

    return { nodes, edges };
  }, [visible, focusId]);

  if (error) return <div className="p-8"><ErrorState message={error} /></div>;
  if (!graph) return <LoadingOrb label="Laying out the graph…" />;

  const focusedNode = focusId ? graph.nodes.find((n) => n.id === focusId) : null;

  return (
    <div className="relative h-full w-full">
      <ReactFlow
        nodes={flow.nodes}
        edges={flow.edges}
        nodeTypes={nodeTypes}
        colorMode={theme}
        minZoom={0.1}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        proOptions={{ hideAttribution: false }}
        onNodeClick={(_, node) => setFocusId(node.id)}
        onPaneClick={() => setFocusId(null)}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1.4} color={theme === "dark" ? "#2e2e36" : "#d4d4dc"} />
        <Controls showInteractive={false} position="bottom-right" />
      </ReactFlow>

      {/* type filters — collapsed behind an eye toggle by default */}
      {filtersOpen ? (
        <Card.Root variant="secondary" className="absolute left-5 top-5 z-10 shadow-lg">
          <Card.Content className="flex max-w-[calc(100vw-4rem)] flex-col gap-2.5 p-4">
            <div className="flex items-center justify-between gap-6">
              <span className="text-[13px] font-semibold uppercase tracking-wider text-muted">Show node types</span>
              <Button
                variant="ghost"
                size="sm"
                isIconOnly
                onPress={() => setFiltersOpen(false)}
                aria-label="Hide filters"
              >
                <EyeOffIcon />
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {NODE_TYPES.map((t) => {
                const c = TYPE_COLORS[t];
                const on = !hidden.has(t);
                const count = graph.nodes.filter((n) => n.type === t).length;
                return (
                  <button
                    key={t}
                    onClick={() =>
                      setHidden((prev) => {
                        const next = new Set(prev);
                        if (next.has(t)) next.delete(t);
                        else next.add(t);
                        return next;
                      })
                    }
                    title={on ? `Hide ${c.label}s` : `Show ${c.label}s`}
                  >
                    <Chip
                      size="md"
                      style={{
                        backgroundColor: on ? `color-mix(in oklab, ${c.hex} 14%, transparent)` : "var(--surface-secondary)",
                        color: on ? c.hex : "var(--muted)",
                        border: `1px solid ${on ? `color-mix(in oklab, ${c.hex} 45%, transparent)` : "var(--border)"}`,
                        cursor: "pointer",
                      }}
                    >
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: on ? c.hex : "var(--muted)" }} />
                        {c.label}
                        <span className="opacity-60">{count}</span>
                      </span>
                    </Chip>
                  </button>
                );
              })}
            </div>
            <span className="text-xs text-muted">
              {visible.nodes.length} of {graph.nodes.length} shown · click a node to trace its lineage
            </span>
          </Card.Content>
        </Card.Root>
      ) : (
        <Button
          variant="outline"
          isIconOnly
          className="absolute left-5 top-5 z-10 shadow-lg"
          onPress={() => setFiltersOpen(true)}
          aria-label="Show node type filters"
        >
          <EyeIcon />
        </Button>
      )}

      {/* focused node panel */}
      {focusedNode && (
        <Card.Root
          variant="secondary"
          className="absolute right-5 top-5 z-10 w-96 shadow-2xl"
        >
          <Card.Content className="p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TypeChip type={focusedNode.type} small />
                <StatusChip status={focusedNode.status} small />
              </div>
              <Button variant="ghost" size="sm" isIconOnly onPress={() => setFocusId(null)} aria-label="Clear focus">
                ×
              </Button>
            </div>
            <h3 className="mt-3 text-base font-semibold leading-snug text-foreground">{focusedNode.title}</h3>
            {focusedNode.description && (
              <p className="mt-2 line-clamp-4 text-sm leading-relaxed text-muted">{focusedNode.description}</p>
            )}
            <p className="mt-2 text-xs text-muted">
              {shortId(focusedNode.id)} · updated {relTime(focusedNode.updatedAt)}
            </p>
            <div className="mt-4 flex gap-2">
              <Button variant="primary" size="sm" onPress={() => onOpenNode(focusedNode.id)}>
                Open full page
              </Button>
              <Button variant="outline" size="sm" onPress={() => setFocusId(null)}>
                Clear focus
              </Button>
            </div>
          </Card.Content>
        </Card.Root>
      )}

      {/* empty graph */}
      {graph.nodes.length === 0 && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <Card.Root variant="secondary" className="pointer-events-auto bg-background/80 backdrop-blur">
            <Card.Content className="px-12 py-10 text-center">
              <div className="flex justify-center">
                <Orb size={72} float mood="question" />
              </div>
              <p className="mt-3 text-base font-medium text-foreground">Nothing to trace yet</p>
              <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-muted">
                Record questions, decisions, and outcomes — then watch the lineage graph grow.
              </p>
            </Card.Content>
          </Card.Root>
        </div>
      )}
    </div>
  );
}
