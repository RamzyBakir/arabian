import { rmSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { getLineage, getStats, matchNodeId, recentNodes, searchNodes, StoreError } from "./index.js";
import { makeTempProject } from "./testing.js";
import type { LineageNode } from "./types.js";

const cleanup: string[] = [];
afterEach(() => {
  while (cleanup.length) rmSync(cleanup.pop()!, { recursive: true, force: true });
});

/** question --led_to--> decision --chooses--> alternative; outcome --triggers--> question */
function sampleGraph() {
  const { root, store } = makeTempProject();
  cleanup.push(root);
  const q = store.createNode({ type: "question", title: "Which database?" });
  const d = store.createNode({ type: "decision", title: "SQLite for v1" });
  const alt = store.createNode({ type: "alternative", title: "Postgres" });
  const old = store.createNode({ type: "decision", title: "Flat files" });
  const out = store.createNode({ type: "outcome", title: "Works fine" });
  store.createEdge({ from: q.id, to: d.id, type: "led_to" });
  store.createEdge({ from: d.id, to: alt.id, type: "chooses" });
  store.createEdge({ from: d.id, to: old.id, type: "supersedes" });
  store.createEdge({ from: out.id, to: q.id, type: "triggers" });
  return { store, q, d, alt, old, out };
}

function ids(nodes: LineageNode[]): string[] {
  return nodes.map((n) => n.id).sort();
}

describe("getLineage", () => {
  it("traverses both directions within hops", () => {
    const { store, q, d, alt, old } = sampleGraph();
    const sub = getLineage(store, d.id, { hops: 1 });
    expect(ids(sub.nodes)).toEqual(ids([q, d, alt, old]));
  });

  it("direction=up follows only incoming edges", () => {
    const { store, q, d, out } = sampleGraph();
    const sub = getLineage(store, d.id, { hops: 2, direction: "up" });
    expect(ids(sub.nodes)).toEqual(ids([q, d, out])); // d ← q ← out (via triggers)
  });

  it("direction=down follows only outgoing edges", () => {
    const { store, q, d } = sampleGraph();
    const sub = getLineage(store, q.id, { hops: 1, direction: "down" });
    expect(ids(sub.nodes)).toEqual(ids([q, d]));
    expect(sub.edges.every((e) => e.type === "led_to")).toBe(true);
  });

  it("throws for unknown roots", () => {
    const { store } = sampleGraph();
    expect(() => getLineage(store, "01AAAAAAAAAAAAAAAAAAAAAAAA")).toThrow(StoreError);
  });
});

describe("matchNodeId", () => {
  it("accepts full ids, unique prefixes, and display ids", () => {
    const { store, d } = sampleGraph();
    expect(matchNodeId(store, d.id)).toBe(d.id);
    // a node from a different millisecond: its timestamp prefix is unique
    const later = store.createNode(
      { type: "question", title: "Later" },
      { at: new Date(Date.now() + 60_000) },
    );
    expect(matchNodeId(store, later.id.slice(0, 12))).toBe(later.id);
    // display ids (first 10 + last 4) disambiguate same-millisecond nodes
    const display = `${d.id.slice(0, 10)}${d.id.slice(-4)}`;
    expect(matchNodeId(store, display)).toBe(d.id);
  });

  it("rejects unknown and ambiguous refs", () => {
    const { store } = sampleGraph();
    expect(() => matchNodeId(store, "zzz")).toThrow(StoreError);
    // ULIDs created in the same session share long time prefixes → ambiguous
    const a = store.createNode({ type: "question", title: "A" });
    const b = store.createNode({ type: "question", title: "B" });
    expect(() => matchNodeId(store, a.id.slice(0, 4))).toThrow(/ambiguous/);
    expect(a.id).not.toBe(b.id);
  });
});

describe("searchNodes", () => {
  it("requires all terms to match", () => {
    const { store, d } = sampleGraph();
    expect(searchNodes(store, "sqlite v1").map((h) => h.node.id)).toEqual([d.id]);
    expect(searchNodes(store, "sqlite nothingmatches")).toEqual([]);
  });

  it("matches file refs and titles", () => {
    const { store, q } = sampleGraph();
    store.createNode({ type: "implementation", title: "Storage layer", fileRefs: ["src/db/sqlite.ts"] });
    expect(searchNodes(store, "sqlite.ts")).toHaveLength(1);
    expect(searchNodes(store, "database").map((h) => h.node.id)).toContain(q.id);
  });
});

describe("getStats / recentNodes", () => {
  it("summarizes the project", () => {
    const { store } = sampleGraph();
    const stats = getStats(store);
    expect(stats.totalNodes).toBe(5);
    expect(stats.totalEdges).toBe(4);
    expect(stats.totalDecisions).toBe(2);
    expect(stats.openQuestions).toBe(1); // the question is proposed; the outcome counts as closed
    const recent = recentNodes(store, 3);
    expect(recent).toHaveLength(3);
    expect(recent[0]!.id).toBeTruthy();
  });
});
