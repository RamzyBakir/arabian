import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Card, Input, TextArea } from "@heroui/react";
import type { EdgeType, LineageNode, NodeStatus } from "@core/types";
import { parseFileRef } from "@core/context";
import { api, type DecoratedEdge } from "../api";
import { EmptyState, ErrorState, LoadingOrb, MarkdownView, StatusChip, TagChip, TypeChip, relTime, shortId } from "../components/bits";
import { ChevronLeftIcon } from "../components/icons";
import { HeroSelect } from "../components/HeroSelect";
import { EDGE_LABELS, EDGE_TYPES, NODE_STATUSES, STATUS_STYLES, TYPE_COLORS } from "../theme";

/** GitHub repo base URL from the project's `repository` field (https or ssh). */
function githubBase(repository: string | null): string | null {
  if (!repository) return null;
  const m = /github\.com[/:]([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/.exec(repository);
  return m ? `https://github.com/${m[1]}/${m[2]}` : null;
}

export function NodeDetail({
  id,
  onOpenNode,
  onGoBack,
}: {
  id: string;
  onOpenNode: (id: string) => void;
  onGoBack: () => void;
}) {
  const [data, setData] = useState<{ node: LineageNode; incoming: DecoratedEdge[]; outgoing: DecoratedEdge[] } | null>(null);
  const [allNodes, setAllNodes] = useState<LineageNode[]>([]);
  const [repository, setRepository] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    api.node(id).then(setData).catch((err) => setError((err as Error).message));
    api.nodes().then((r) => setAllNodes(r.nodes)).catch(() => {});
    api.project().then((p) => setRepository(p.repository ?? null)).catch(() => {});
  }, [id]);

  useEffect(reload, [reload]);

  if (error) return <div className="mx-auto max-w-6xl px-6 py-8"><ErrorState message={error} /></div>;
  if (!data) return <LoadingOrb label="Loading node…" />;

  const { node, incoming, outgoing } = data;

  return (
    <div className="mx-auto w-full max-w-6xl px-8 py-8">
      <div className="flex items-center gap-3">
        <Button variant="outline" onPress={onGoBack}>
          <span className="inline-flex items-center gap-1.5">
            <ChevronLeftIcon />
            Back
          </span>
        </Button>
        <span className="font-mono text-sm text-muted">{shortId(node.id)}</span>
      </div>

      <div className="mt-5 space-y-7">
        <HeaderBlock node={node} repository={repository} onChanged={reload} />
        <div className="grid gap-7 lg:grid-cols-[1fr_360px]">
          <div className="space-y-7">
            <DescriptionBlock node={node} onChanged={reload} />
            <FileRefsBlock node={node} repository={repository} onChanged={reload} />
            <LineageBlock
              node={node}
              incoming={incoming}
              outgoing={outgoing}
              allNodes={allNodes}
              onChanged={reload}
              onOpenNode={onOpenNode}
            />
          </div>
          <aside className="space-y-7">
            <StatusBlock node={node} onChanged={reload} />
            <TagsBlock node={node} onChanged={reload} />
            <SupersedeBlock node={node} onChanged={reload} onOpenNode={onOpenNode} />
          </aside>
        </div>
      </div>
    </div>
  );
}

// ---- header: type, title (editable), meta ----

function HeaderBlock({ node, repository, onChanged }: { node: LineageNode; repository: string | null; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(node.title);
  const commit = typeof node.metadata?.commit === "string" ? node.metadata.commit : null;
  const commitUrl = commit && githubBase(repository) ? `${githubBase(repository)}/commit/${commit}` : null;

  async function save() {
    if (title.trim() && title !== node.title) {
      await api.updateNode(node.id, { title: title.trim() });
      onChanged();
    }
    setEditing(false);
  }

  return (
    <Card.Root>
      <Card.Content className="p-6">
        <div className="flex items-start gap-4">
          <span
            className="mt-1.5 h-4 w-4 shrink-0 rounded-full"
            style={{ backgroundColor: TYPE_COLORS[node.type].hex, boxShadow: `0 0 14px ${TYPE_COLORS[node.type].hex}66` }}
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <TypeChip type={node.type} />
              <StatusChip status={node.status} />
            </div>
            {editing ? (
              <Input
                autoFocus
                fullWidth
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={save}
                onKeyDown={(e) => e.key === "Enter" && save()}
                aria-label="Node title"
                className="mt-3"
              />
            ) : (
              <h1
                className="mt-3 cursor-text text-[1.7rem] font-semibold leading-tight tracking-tight text-foreground"
                title="Click to edit title"
                onClick={() => {
                  setTitle(node.title);
                  setEditing(true);
                }}
              >
                {node.title}
              </h1>
            )}
            <p className="mt-2 text-sm text-muted">
              created {relTime(node.createdAt)} by {labelOf(node.createdBy)} · updated {relTime(node.updatedAt)}
            </p>
            {commit && (
              <p className="mt-1 font-mono text-xs text-muted">
                commit{" "}
                {commitUrl ? (
                  <a href={commitUrl} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                    {commit.slice(0, 12)}
                  </a>
                ) : (
                  commit.slice(0, 12)
                )}
              </p>
            )}
          </div>
        </div>
      </Card.Content>
    </Card.Root>
  );
}

function labelOf(a: LineageNode["createdBy"]): string {
  return a.kind === "agent" ? `${a.name} (agent)` : a.name;
}

// ---- description ----

function DescriptionBlock({ node, onChanged }: { node: LineageNode; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(node.description ?? "");

  async function save() {
    await api.updateNode(node.id, { description: text.trim() || null });
    onChanged();
    setEditing(false);
  }

  return (
    <Card.Root>
      <Card.Header className="flex-row items-center justify-between gap-4 px-6 pt-5 pb-0">
        <Card.Title className="text-[13px] font-semibold uppercase tracking-wider text-muted">Description</Card.Title>
        <Button
          variant="outline"
          size="sm"
          onPress={() => {
            if (editing) save();
            else {
              setText(node.description ?? "");
              setEditing(true);
            }
          }}
        >
          {editing ? "Save" : "Edit"}
        </Button>
      </Card.Header>
      <Card.Content className="px-6 pb-6 pt-3">
        {editing ? (
          <div>
            <TextArea
              autoFocus
              fullWidth
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={8}
              placeholder="Markdown — the why, the trade-offs, the evidence…"
              aria-label="Node description"
            />
            <div className="mt-2 flex justify-end">
              <Button variant="ghost" size="sm" onPress={() => setEditing(false)}>Cancel</Button>
            </div>
          </div>
        ) : node.description ? (
          <MarkdownView>{node.description}</MarkdownView>
        ) : (
          <p className="text-sm italic text-muted">No description yet.</p>
        )}
      </Card.Content>
    </Card.Root>
  );
}

// ---- file refs ----

/** A file ref rendered as a GitHub link (with line anchor) when the repo is known. */
function FileRefLink({ fileRef, repository }: { fileRef: string; repository: string | null }) {
  const { path, startLine, endLine } = parseFileRef(fileRef);
  const base = githubBase(repository);
  if (base) {
    const anchor =
      startLine === undefined ? ""
      : endLine !== undefined && endLine !== startLine ? `#L${startLine}-L${endLine}`
      : `#L${startLine}`;
    return (
      <a
        href={`${base}/blob/HEAD/${path}${anchor}`}
        target="_blank"
        rel="noreferrer"
        className="block truncate font-mono text-sm text-foreground hover:text-accent hover:underline"
        title={fileRef}
      >
        {fileRef}
      </a>
    );
  }
  return (
    <span
      className="block truncate font-mono text-sm text-foreground"
      title="Set `repository` in .arabian/project.json to make file links clickable"
    >
      {fileRef}
    </span>
  );
}

function FileRefsBlock({ node, repository, onChanged }: { node: LineageNode; repository: string | null; onChanged: () => void }) {
  const [adding, setAdding] = useState(false);
  const [value, setValue] = useState("");

  async function add() {
    const p = value.trim();
    if (p) {
      await api.updateNode(node.id, { fileRefs: [...(node.fileRefs ?? []), p] });
      onChanged();
    }
    setValue("");
    setAdding(false);
  }

  async function remove(ref: string) {
    await api.updateNode(node.id, { fileRefs: (node.fileRefs ?? []).filter((f) => f !== ref) });
    onChanged();
  }

  return (
    <Card.Root>
      <Card.Header className="flex-row items-center justify-between gap-4 px-6 pt-5 pb-0">
        <Card.Title className="text-[13px] font-semibold uppercase tracking-wider text-muted">Linked files</Card.Title>
        <Button variant="outline" size="sm" onPress={() => setAdding((v) => !v)}>
          {adding ? "Cancel" : "Add file"}
        </Button>
      </Card.Header>
      <Card.Content className="px-6 pb-6 pt-3">
        {adding && (
          <div className="mt-1 flex gap-2">
            <Input
              autoFocus
              fullWidth
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && add()}
              placeholder="src/db/storage.ts"
              aria-label="File path"
              className="font-mono text-sm"
            />
            <Button variant="primary" onPress={add}>Link</Button>
          </div>
        )}
        <div className="mt-2 space-y-2.5">
          {(node.fileRefs ?? []).map((f) => (
            <div key={f} className="group flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-secondary px-4 py-3">
              <div className="min-w-0 flex-1">
                <FileRefLink fileRef={f} repository={repository} />
              </div>
              <Button variant="ghost" size="sm" onPress={() => remove(f)} className="hidden group-hover:flex">
                remove
              </Button>
            </div>
          ))}
          {!node.fileRefs?.length && !adding && <p className="text-sm italic text-muted">No files linked.</p>}
        </div>
      </Card.Content>
    </Card.Root>
  );
}

// ---- lineage: incoming / outgoing + create edge ----

function LineageBlock({
  node,
  incoming,
  outgoing,
  allNodes,
  onChanged,
  onOpenNode,
}: {
  node: LineageNode;
  incoming: DecoratedEdge[];
  outgoing: DecoratedEdge[];
  allNodes: LineageNode[];
  onChanged: () => void;
  onOpenNode: (id: string) => void;
}) {
  const [adding, setAdding] = useState(false);

  async function removeEdge(edgeId: string) {
    await api.deleteEdge(edgeId);
    onChanged();
  }

  return (
    <Card.Root>
      <Card.Header className="flex-row items-center justify-between gap-4 px-6 pt-5 pb-0">
        <Card.Title className="text-[13px] font-semibold uppercase tracking-wider text-muted">Lineage</Card.Title>
        <Button variant="outline" size="sm" onPress={() => setAdding((v) => !v)}>
          {adding ? "Cancel" : "Add relationship"}
        </Button>
      </Card.Header>
      <Card.Content className="px-6 pb-6 pt-3">
        {adding && (
          <AddEdgeForm node={node} allNodes={allNodes} onDone={() => { setAdding(false); onChanged(); }} />
        )}

        <EdgeGroup heading="What led to this" edges={incoming} direction="in" onOpenNode={onOpenNode} onRemove={removeEdge} />
        <EdgeGroup heading="What came from this" edges={outgoing} direction="out" onOpenNode={onOpenNode} onRemove={removeEdge} />

        {incoming.length === 0 && outgoing.length === 0 && !adding && (
          <p className="text-sm italic text-muted">No relationships yet — this node is an island.</p>
        )}
      </Card.Content>
    </Card.Root>
  );
}

function EdgeGroup({
  heading,
  edges,
  direction,
  onOpenNode,
  onRemove,
}: {
  heading: string;
  edges: DecoratedEdge[];
  direction: "in" | "out";
  onOpenNode: (id: string) => void;
  onRemove: (edgeId: string) => void;
}) {
  if (edges.length === 0) return null;
  return (
    <div className="mt-5 first:mt-1">
      <h3 className="text-[13px] font-semibold uppercase tracking-wider text-muted">{heading} ({edges.length})</h3>
      <div className="mt-3 space-y-2.5">
        {edges.map((e) => {
          const otherId = direction === "in" ? e.from : e.to;
          const otherTitle = direction === "in" ? e.fromTitle : e.toTitle;
          return (
            <div key={e.id} className="group flex items-start gap-3 rounded-lg border border-border bg-surface-secondary px-4 py-3">
              <span className="mt-0.5 text-lg leading-none text-muted">{direction === "in" ? "←" : "→"}</span>
              <span className="shrink-0 rounded-md bg-surface-tertiary px-2.5 py-1 text-xs font-medium text-foreground-500">
                {EDGE_LABELS[e.type]}
              </span>
              <div className="min-w-0 flex-1">
                <button
                  onClick={() => onOpenNode(otherId)}
                  className="block text-left text-[15px] leading-snug text-foreground hover:text-accent"
                >
                  {otherTitle ?? shortId(otherId)}
                </button>
                {e.note && <span className="mt-1 block text-xs italic leading-relaxed text-muted">“{e.note}”</span>}
              </div>
              <Button variant="ghost" size="sm" onPress={() => onRemove(e.id)} className="hidden shrink-0 group-hover:flex">
                remove
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AddEdgeForm({ node, allNodes, onDone }: { node: LineageNode; allNodes: LineageNode[]; onDone: () => void }) {
  const [direction, setDirection] = useState<"out" | "in">("out");
  const [type, setType] = useState<EdgeType>("led_to");
  const [target, setTarget] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const others = useMemo(() => allNodes.filter((n) => n.id !== node.id), [allNodes, node.id]);

  async function submit() {
    if (!target) return;
    setError(null);
    try {
      const payload = direction === "out" ? { from: node.id, to: target } : { from: target, to: node.id };
      await api.createEdge({ ...payload, type, note: note.trim() || undefined });
      onDone();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="mt-3 space-y-3 rounded-xl border border-border bg-surface-secondary p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex overflow-hidden rounded-lg border border-border">
          {(["out", "in"] as const).map((d) => (
            <button
              key={d}
              onClick={() => setDirection(d)}
              className={`px-3 py-1.5 text-xs ${direction === d ? "bg-surface-tertiary text-foreground" : "text-muted hover:text-foreground"}`}
            >
              {d === "out" ? `${node.title.slice(0, 24)} →` : `→ ${node.title.slice(0, 24)}`}
            </button>
          ))}
        </div>
        <HeroSelect<EdgeType>
          label="Edge type"
          value={type}
          onChange={(t) => t && setType(t)}
          className="w-44"
          items={EDGE_TYPES.map((t) => ({ id: t, label: t }))}
        />
      </div>
      <HeroSelect
        label="Target node"
        value={target || null}
        onChange={(v) => setTarget(v ?? "")}
        className="w-full"
        items={others.map((n) => ({ id: n.id, label: n.title }))}
      />
      <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" aria-label="Edge note" />
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex justify-end">
        <Button variant="primary" size="sm" onPress={submit} isDisabled={!target}>Link</Button>
      </div>
    </div>
  );
}

// ---- sidebar blocks ----

function StatusBlock({ node, onChanged }: { node: LineageNode; onChanged: () => void }) {
  const current = STATUS_STYLES[node.status];
  return (
    <Card.Root>
      <Card.Content className="p-5">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">Status</h2>
        <HeroSelect<NodeStatus>
          label="Node status"
          value={node.status}
          onChange={(s) => s && api.updateNode(node.id, { status: s }).then(onChanged)}
          className="mt-3 w-full"
          triggerStyle={{
            border: `1px solid ${current.hex}77`,
            color: current.hex,
          }}
          popoverClassName="border border-border"
          items={NODE_STATUSES.map((s) => ({
            id: s,
            label: STATUS_STYLES[s].label,
            color: STATUS_STYLES[s].hex,
          }))}
        />
        <p className="mt-2 text-xs leading-relaxed text-muted">
          Transitions are not enforced — record what happened.
        </p>
      </Card.Content>
    </Card.Root>
  );
}

function TagsBlock({ node, onChanged }: { node: LineageNode; onChanged: () => void }) {
  const [value, setValue] = useState("");

  async function add() {
    const t = value.trim();
    if (t) {
      await api.updateNode(node.id, { tags: [...(node.tags ?? []), t] });
      onChanged();
    }
    setValue("");
  }

  return (
    <Card.Root>
      <Card.Content className="p-5">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">Tags</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {(node.tags ?? []).map((t) => (
            <button
              key={t}
              title="Click to remove"
              onClick={async () => {
                await api.updateNode(node.id, { tags: (node.tags ?? []).filter((x) => x !== t) });
                onChanged();
              }}
            >
              <TagChip tag={t} />
            </button>
          ))}
          {!node.tags?.length && <p className="text-sm italic text-muted">None.</p>}
        </div>
        <div className="mt-3 flex gap-2">
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder="add tag…"
            aria-label="New tag"
          />
          <Button variant="outline" size="sm" onPress={add}>+</Button>
        </div>
      </Card.Content>
    </Card.Root>
  );
}

function SupersedeBlock({ node, onChanged, onOpenNode }: { node: LineageNode; onChanged: () => void; onOpenNode: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (node.type !== "decision") return null;

  async function submit() {
    if (!title.trim()) return;
    setError(null);
    try {
      const res = await api.supersede(node.id, { title: title.trim(), description: description.trim() || undefined });
      onChanged();
      onOpenNode(res.newNode.id);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <Card.Root style={{ borderColor: "#f9731655" }}>
      <Card.Content className="p-5">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-warning">Supersede</h2>
        <p className="mt-1.5 text-xs leading-relaxed text-muted">
          Replace this decision with a new one. History stays intact via a <span className="text-warning">supersedes</span> edge.
        </p>
        {!open ? (
          <Button variant="outline" fullWidth className="mt-3" onPress={() => setOpen(true)}>
            Supersede this decision…
          </Button>
        ) : (
          <div className="mt-3 space-y-3">
            <Input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="New decision title"
              aria-label="New decision title"
            />
            <TextArea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Why the change of heart? (Markdown)"
              aria-label="Supersede rationale"
            />
            {error && <p className="text-sm text-danger">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onPress={() => setOpen(false)}>Cancel</Button>
              <Button variant="primary" size="sm" onPress={submit} isDisabled={!title.trim()}>
                Create & supersede
              </Button>
            </div>
          </div>
        )}
      </Card.Content>
    </Card.Root>
  );
}

// Re-export for App-level usage of empty state.
export { EmptyState };
