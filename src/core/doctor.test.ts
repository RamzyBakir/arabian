import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runDoctor } from "./doctor.js";
import { makeTempProject } from "./testing.js";

const cleanup: string[] = [];
afterEach(() => {
  while (cleanup.length) rmSync(cleanup.pop()!, { recursive: true, force: true });
});

function healthy() {
  const { root, store } = makeTempProject();
  cleanup.push(root);
  const q = store.createNode({ type: "question", title: "Q" });
  const d = store.createNode({ type: "decision", title: "D" });
  store.createEdge({ from: q.id, to: d.id, type: "led_to" });
  return { root, store, q, d };
}

describe("runDoctor", () => {
  it("reports a healthy store", () => {
    const { store } = healthy();
    const report = runDoctor(store);
    expect(report.nodeCount).toBe(2);
    expect(report.edgeCount).toBe(1);
    expect(report.errors).toEqual([]);
    expect(report.warnings).toEqual([]);
  });

  it("flags malformed and schema-invalid node files", () => {
    const { store } = healthy();
    writeFileSync(join(store.paths.nodesDir, "01AAAAAAAAAAAAAAAAAAAAAAAA.question.json"), "{not json");
    writeFileSync(
      join(store.paths.nodesDir, "01BBBBBBBBBBBBBBBBBBBBBBBB.decision.json"),
      JSON.stringify({ id: "01BBBBBBBBBBBBBBBBBBBBBBBB", type: "decision", title: "Bad status", status: "nope" }),
    );
    const report = runDoctor(store);
    expect(report.errors.some((e) => e.message.includes("malformed JSON"))).toBe(true);
    expect(report.errors.some((e) => e.message.startsWith("invalid node in"))).toBe(true);
  });

  it("flags dangling, duplicate, and self-loop edges", () => {
    const { store, q, d } = healthy();
    const ghost = "01AAAAAAAAAAAAAAAAAAAAAAAA";
    const actor = { kind: "human" as const, name: "x" };
    const original = store.listEdges()[0]!;
    const dup = { id: "01BBBBBBBBBBBBBBBBBBBBBBBB", from: q.id, to: d.id, type: "led_to" as const, createdAt: "2026-01-01T00:00:00.000Z", createdBy: actor };
    const loop = { id: "01CCCCCCCCCCCCCCCCCCCCCCCC", from: q.id, to: q.id, type: "references" as const, createdAt: "2026-01-01T00:00:00.000Z", createdBy: actor };
    const dangling = { id: "01DDDDDDDDDDDDDDDDDDDDDDDD", from: ghost, to: d.id, type: "references" as const, createdAt: "2026-01-01T00:00:00.000Z", createdBy: actor };
    writeFileSync(store.paths.edgesFile, JSON.stringify([original, dup, loop, dangling]));

    const report = runDoctor(store);
    expect(report.edgeCount).toBe(4);
    expect(report.errors.some((e) => e.message.includes("duplicate edge"))).toBe(true);
    expect(report.errors.some((e) => e.message.includes("loops"))).toBe(true);
    expect(report.errors.some((e) => e.message.includes("dangling edge") && e.message.includes(ghost))).toBe(true);
  });

  it("warns about orphaned nodes and missing file refs", () => {
    const { store } = healthy();
    const orphan = store.createNode({ type: "experiment", title: "Spike", fileRefs: ["missing/dir.ts"] });
    const report = runDoctor(store, { checkFiles: true });
    expect(report.warnings.some((w) => w.message.includes(orphan.id))).toBe(true);
    expect(report.warnings.some((w) => w.message.includes("missing/dir.ts"))).toBe(true);
  });
});
