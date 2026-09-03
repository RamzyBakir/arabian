import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ReactNode } from "react";
import type { LineageNode, NodeStatus, NodeType } from "@core/types";
import { Button, Chip, EmptyState as HeroEmptyState, Spinner } from "@heroui/react";
import { STATUS_STYLES, TYPE_COLORS } from "../theme";
import { Orb } from "./Orb";

/* ---- Chips: HeroUI shape, exact design-system colors ---- */

export function TypeChip({ type, small = false }: { type: NodeType; small?: boolean }) {
  const t = TYPE_COLORS[type];
  return (
    <Chip
      size={small ? "sm" : "md"}
      style={{
        backgroundColor: `color-mix(in oklab, ${t.hex} 14%, transparent)`,
        color: t.hex,
        border: `1px solid color-mix(in oklab, ${t.hex} 45%, transparent)`,
      }}
    >
      <span className="inline-flex items-center gap-1.5 font-medium">
        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: t.hex }} />
        {t.label}
      </span>
    </Chip>
  );
}

export function StatusChip({ status, small = false }: { status: NodeStatus; small?: boolean }) {
  const s = STATUS_STYLES[status];
  return (
    <Chip
      size={small ? "sm" : "md"}
      style={{
        backgroundColor: `color-mix(in oklab, ${s.hex} 12%, transparent)`,
        color: s.hex,
        border: `1px solid color-mix(in oklab, ${s.hex} 40%, transparent)`,
      }}
    >
      {s.label}
    </Chip>
  );
}

export function TagChip({ tag }: { tag: string }) {
  return <Chip size="sm">#{tag}</Chip>;
}

/* ---- Node row: a real button that opens the node ---- */

export function NodeRow({
  node,
  onOpen,
}: {
  node: LineageNode;
  onOpen: (id: string) => void;
}) {
  return (
    <button
      onClick={() => onOpen(node.id)}
      className="group flex w-full items-center gap-3 rounded-lg px-3.5 py-3 text-left transition-colors hover:bg-surface-hover"
    >
      <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: TYPE_COLORS[node.type].hex }} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] text-foreground">{node.title}</span>
        <span className="text-xs text-muted">
          {TYPE_COLORS[node.type].label} · {STATUS_STYLES[node.status].label} · updated {relTime(node.updatedAt)}
        </span>
      </span>
      {node.tags?.slice(0, 3).map((tag) => <TagChip key={tag} tag={tag} />)}
    </button>
  );
}

export function MarkdownView({ children }: { children: string }) {
  return (
    <div className="markdown">
      <Markdown remarkPlugins={[remarkGfm]}>{children}</Markdown>
    </div>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <HeroEmptyState className="rounded-2xl border border-dashed border-border px-6 py-16">
      <div className="flex flex-col items-center gap-3 text-center">
        <Orb size={80} float />
        <div className="text-base font-medium text-foreground">{title}</div>
        {hint && <div className="max-w-sm text-sm leading-relaxed text-muted">{hint}</div>}
        {action}
      </div>
    </HeroEmptyState>
  );
}

export function LoadingOrb({ label = "Loading lineage…" }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
      <Orb size={60} float />
      <div className="flex items-center gap-2 text-sm text-muted">
        <Spinner size="sm" />
        {label}
      </div>
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
      {message}
    </div>
  );
}

export function relTime(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function shortId(id: string): string {
  // time prefix + random suffix: same-ms monotonic ids only differ at the end
  return `${id.slice(0, 10)}${id.slice(-4)}`;
}
