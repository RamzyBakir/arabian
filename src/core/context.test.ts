import { rmSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { explainFiles, formatFileContext, parseFileRef } from "./context.js";
import { makeTempProject } from "./testing.js";

const cleanup: string[] = [];
afterEach(() => {
  while (cleanup.length) rmSync(cleanup.pop()!, { recursive: true, force: true });
});

function sampleProject() {
  const { root, store } = makeTempProject();
  cleanup.push(root);
  const q = store.createNode({ type: "question", title: "Where do sessions live?" });
  const inMem = store.createNode({ type: "alternative", title: "In-memory map" });
  const redis = store.createNode({ type: "alternative", title: "Redis" });
  store.createEdge({ from: q.id, to: inMem.id, type: "considers" });
  store.createEdge({ from: q.id, to: redis.id, type: "considers" });
  const d = store.createNode({
    type: "decision",
    title: "Use Redis for sessions",
    description: "Single-node memory is insufficient.",
    fileRefs: ["src/auth/session.ts"],
    status: "accepted",
  });
  store.createEdge({ from: q.id, to: d.id, type: "led_to" });
  store.createEdge({ from: d.id, to: redis.id, type: "chooses" });
  store.createEdge({ from: d.id, to: inMem.id, type: "rejects", note: "no retry story" });
  const impl = store.createNode({
    type: "implementation",
    title: "Redis session store",
    fileRefs: ["src/auth/session.ts", "src/auth/middleware.ts"],
  });
  store.createEdge({ from: impl.id, to: d.id, type: "implements" });
  return { store, q, d, impl };
}

describe("parseFileRef", () => {
  it("strips line suffixes and ./ prefixes", () => {
    expect(parseFileRef("src/a.ts")).toEqual({ path: "src/a.ts" });
    expect(parseFileRef("./src/a.ts:12")).toEqual({ path: "src/a.ts", startLine: 12, endLine: 12 });
    expect(parseFileRef("src/a.ts:12-15")).toEqual({ path: "src/a.ts", startLine: 12, endLine: 15 });
    expect(parseFileRef("src/a.ts#L3-L9")).toEqual({ path: "src/a.ts", startLine: 3, endLine: 9 });
    expect(parseFileRef("src/a.ts#L3")).toEqual({ path: "src/a.ts", startLine: 3, endLine: 3 });
  });
});

describe("explainFiles", () => {
  it("finds exact and directory-prefix matches", () => {
    const { store, d, impl } = sampleProject();
    const byFile = explainFiles(store, ["src/auth/session.ts"]);
    expect(byFile).toHaveLength(1);
    expect(byFile[0]!.totalMatches).toBe(2);

    const byDir = explainFiles(store, ["src/auth/"]);
    expect(byDir[0]!.entries.map((e) => e.node.id).sort()).toEqual([d.id, impl.id].sort());
  });

  it("matches even when the request carries a line suffix", () => {
    const { store, d } = sampleProject();
    const [ctx] = explainFiles(store, ["src/auth/session.ts:42-87"]);
    expect(ctx!.entries[0]!.node.id).toBe(d.id); // exact + decision beats the implementation
  });

  it("assembles relations: led_to_by, alternatives, implementations", () => {
    const { store, d } = sampleProject();
    const [ctx] = explainFiles(store, ["src/auth/session.ts"]);
    const decisionEntry = ctx!.entries.find((e) => e.node.id === d.id)!;
    expect(decisionEntry.ledToBy.map((r) => r.type)).toContain("led_to");
    expect(decisionEntry.leadsTo.map((r) => r.type)).toEqual(
      expect.arrayContaining(["chooses", "rejects"]),
    );
    expect(decisionEntry.considered.map((n) => n.title)).toEqual(
      expect.arrayContaining(["Redis", "In-memory map"]),
    );
  });

  it("respects the per-file limit", () => {
    const { store } = sampleProject();
    const [ctx] = explainFiles(store, ["src/auth"], { limit: 1 });
    expect(ctx!.entries).toHaveLength(1);
    expect(ctx!.totalMatches).toBe(2);
  });

  it("returns empty entries for unknown files", () => {
    const { store } = sampleProject();
    const [ctx] = explainFiles(store, ["src/unknown.ts"]);
    expect(ctx!.entries).toEqual([]);
    expect(formatFileContext(ctx!)).toMatch(/No recorded lineage/);
  });
});

describe("formatFileContext", () => {
  it("renders readable text for agents", () => {
    const { store } = sampleProject();
    const [ctx] = explainFiles(store, ["src/auth/session.ts:1"]);
    const text = formatFileContext(ctx!);
    expect(text).toMatch(/Relevant engineering context for src\/auth\/session\.ts/);
    expect(text).toMatch(/DECISION/);
    expect(text).toMatch(/Use Redis for sessions/);
    expect(text).toMatch(/Alternatives considered: In-memory map, Redis/);
    expect(text).toMatch(/led_to/);
  });
});
