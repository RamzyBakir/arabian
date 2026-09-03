import { useEffect, useMemo, useState } from "react";
import { Button, Card } from "@heroui/react";
import type { LineageNode, NodeStatus, NodeType } from "@core/types";
import { api, type ProjectInfo } from "../api";
import { EmptyState, ErrorState, LoadingOrb, NodeRow, StatusChip, TypeChip, relTime } from "../components/bits";
import { HeroSelect } from "../components/HeroSelect";
import { NODE_STATUSES, NODE_TYPES, STATUS_STYLES, TYPE_COLORS } from "../theme";

type TypeFilter = NodeType | "all";
type StatusFilter = NodeStatus | "all";

export function Overview({
  onOpenNode,
  onCreate,
}: {
  onOpenNode: (id: string) => void;
  onCreate: (type?: NodeType) => void;
}) {
  const [project, setProject] = useState<ProjectInfo | null>(null);
  const [nodes, setNodes] = useState<LineageNode[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  useEffect(() => {
    Promise.all([api.project(), api.nodes()])
      .then(([p, n]) => {
        setProject(p);
        setNodes([...n.nodes].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)));
      })
      .catch((err) => setError((err as Error).message));
  }, []);

  const filtered = useMemo(() => {
    if (!nodes) return [];
    const q = query.trim().toLowerCase();
    return nodes.filter(
      (n) =>
        (typeFilter === "all" || n.type === typeFilter) &&
        (statusFilter === "all" || n.status === statusFilter) &&
        (!q ||
          n.title.toLowerCase().includes(q) ||
          n.description?.toLowerCase().includes(q) ||
          n.tags?.some((t) => t.toLowerCase().includes(q))),
    );
  }, [nodes, query, typeFilter, statusFilter]);

  const grouped = useMemo(() => {
    const map = new Map<NodeType, LineageNode[]>();
    for (const n of filtered) {
      const list = map.get(n.type) ?? [];
      list.push(n);
      map.set(n.type, list);
    }
    return [...map.entries()];
  }, [filtered]);

  if (error) return <div className="mx-auto max-w-6xl px-6 py-8"><ErrorState message={error} /></div>;
  if (!project || !nodes) return <LoadingOrb />;

  const stats = project.stats;

  return (
    <div className="mx-auto w-full max-w-7xl px-8 py-10">
      {/* header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{project.name}</h1>
          <p className="mt-1 text-sm text-muted">
            {project.description ?? "Engineering lineage"} · {stats.totalNodes} nodes · {stats.totalEdges} edges
          </p>
        </div>
        <div className="flex gap-2.5">
          <Button variant="outline" onPress={() => onCreate()}>
            New node
          </Button>
          <Button
            variant="primary"
            onPress={() => onCreate("question")}
            style={{ backgroundColor: "#F59E0B", color: "#1c1400" }}
          >
            + New question
          </Button>
        </div>
      </div>

      {/* stats */}
      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Decisions" value={stats.totalDecisions} color="#3B82F6" />
        <StatCard label="Open questions" value={stats.openQuestions} color="#F59E0B" />
        <StatCard label="Active experiments" value={stats.activeExperiments} color="#EC4899" />
        <StatCard label="Relationships" value={stats.totalEdges} color="#10B981" />
      </div>

      <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_320px]">
        {/* list column */}
        <div>
          {/* filters */}
          <div className="flex flex-wrap items-center gap-3">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search lineage…"
              className="h-10 w-64 rounded-lg border border-field bg-field px-3.5 text-sm text-foreground placeholder:text-field-placeholder outline-none focus:border-accent"
            />
            <HeroSelect<TypeFilter>
              label="Filter by type"
              value={typeFilter}
              onChange={(v) => setTypeFilter(v ?? "all")}
              className="w-44"
              items={[
                { id: "all" as TypeFilter, label: "All types" },
                ...NODE_TYPES.map((t) => ({ id: t as TypeFilter, label: TYPE_COLORS[t].label })),
              ]}
            />
            <HeroSelect<StatusFilter>
              label="Filter by status"
              value={statusFilter}
              onChange={(v) => setStatusFilter(v ?? "all")}
              className="w-44"
              items={[
                { id: "all" as StatusFilter, label: "All statuses" },
                ...NODE_STATUSES.map((s) => ({ id: s as StatusFilter, label: STATUS_STYLES[s].label })),
              ]}
            />
            <span className="text-sm text-muted">{filtered.length} node(s)</span>
          </div>

          {/* grouped list */}
          <div className="mt-6 space-y-8">
            {grouped.map(([type, list]) => (
              <section key={type}>
                <div className="mb-2 flex items-center gap-2.5">
                  <TypeChip type={type} />
                  <span className="text-sm text-muted">{list.length}</span>
                </div>
                <Card.Root variant="secondary" className="overflow-hidden">
                  <div className="divide-y divide-border">
                    {list.map((n) => (
                      <NodeRow key={n.id} node={n} onOpen={onOpenNode} />
                    ))}
                  </div>
                </Card.Root>
              </section>
            ))}
            {nodes.length === 0 && (
              <EmptyState
                title="No lineage recorded yet"
                hint="Every codebase has a history of questions, decisions, and outcomes — Arabian just makes it visible. Start with a question."
                action={
                  <Button
                    className="mt-2"
                    variant="primary"
                    onPress={() => onCreate("question")}
                    style={{ backgroundColor: "#F59E0B", color: "#1c1400" }}
                  >
                    + New question
                  </Button>
                }
              />
            )}
            {nodes.length > 0 && filtered.length === 0 && (
              <p className="py-10 text-center text-sm text-muted">Nothing matches the current filters.</p>
            )}
          </div>
        </div>

        {/* sidebar: recent activity */}
        <aside>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">Recent activity</h2>
          <Card.Root variant="secondary" className="mt-3">
            <div className="space-y-0.5 p-2">
              {nodes.slice(0, 20).map((n) => (
                <button
                  key={n.id}
                  onClick={() => onOpenNode(n.id)}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-surface-hover"
                >
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: TYPE_COLORS[n.type].hex }} />
                  <span className="min-w-0 flex-1 truncate text-sm text-foreground-500">{n.title}</span>
                  <span className="shrink-0 text-xs text-muted">{relTime(n.updatedAt)}</span>
                </button>
              ))}
              {nodes.length === 0 && <p className="px-2 py-1 text-sm text-muted">Nothing yet.</p>}
            </div>
          </Card.Root>

          <h2 className="mt-8 text-xs font-semibold uppercase tracking-wider text-muted">Status mix</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {NODE_STATUSES.filter((s) => (stats.byStatus[s] ?? 0) > 0).map((s) => (
              <span key={s} className="inline-flex items-center gap-1.5">
                <StatusChip status={s} small />
                <span className="text-sm text-muted">{stats.byStatus[s]}</span>
              </span>
            ))}
            {Object.keys(stats.byStatus).length === 0 && <p className="text-sm text-muted">—</p>}
          </div>
        </aside>
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <Card.Root variant="secondary">
      <Card.Content className="p-5">
        <div className="flex items-center gap-2.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
          <span className="text-xs uppercase tracking-wide text-muted">{label}</span>
        </div>
        <div className="mt-2 text-3xl font-semibold text-foreground">{value}</div>
      </Card.Content>
    </Card.Root>
  );
}
