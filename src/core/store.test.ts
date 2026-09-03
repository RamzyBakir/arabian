import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { Store, StoreError, findStoreRoot, initProject, isSafeRef } from "./index.js";
import { makeTempProject } from "./testing.js";

const cleanup: string[] = [];
function project(meta = {}) {
  const p = makeTempProject(meta);
  cleanup.push(p.root);
  return p;
}
afterEach(() => {
  while (cleanup.length) rmSync(cleanup.pop()!, { recursive: true, force: true });
});

describe("project lifecycle", () => {
  it("creates .arabian/ with project.json and empty edges", () => {
    const { root, store } = project({ name: "demo", description: "d" });
    expect(existsSync(join(root, ".arabian", "project.json"))).toBe(true);
    expect(store.getProject()).toMatchObject({ name: "demo", description: "d" });
    expect(store.listEdges()).toEqual([]);
  });

  it("refuses to init twice and to open a non-project dir", () => {
    const { root } = project();
    expect(() => initProject(root, { name: "again" })).toThrow(StoreError);
    expect(() => Store.at(join(root, "nope"))).toThrow(StoreError);
  });

  it("findStoreRoot walks up", () => {
    const { root } = project();
    expect(findStoreRoot(join(root, "deep", "deeper"))).toBe(root);
  });

  it("keeps repository metadata for file links", () => {
    const { store } = project({ repository: "https://github.com/acme/widget" });
    expect(store.getProject().repository).toBe("https://github.com/acme/widget");
  });
});

describe("nodes", () => {
  it("creates with defaults, dedupes tags and fileRefs", () => {
    const { store } = project();
    const n = store.createNode({
      type: "question",
      title: "Postgres or SQLite?",
      tags: ["db", "db", " "],
      fileRefs: ["src/db.ts", "src/db.ts"],
    });
    expect(n.status).toBe("proposed");
    expect(n.tags).toEqual(["db"]);
    expect(n.fileRefs).toEqual(["src/db.ts"]);
    expect(isUlidLike(n.id)).toBe(true);
  });

  it("round-trips a node through disk", () => {
    const { store } = project();
    const n = store.createNode({ type: "decision", title: "D", description: "**why**" });
    const reread = Store.at(projectRootOf(store)).getNode(n.id);
    expect(reread).toEqual(n);
  });

  it("rejects invalid input", () => {
    const { store } = project();
    expect(() => store.createNode({ type: "nope" as never, title: "x" })).toThrow(StoreError);
    expect(() => store.createNode({ type: "decision", title: "" })).toThrow(StoreError);
    expect(() => store.getNode("01FFFFFFFFFFFFFFFFFFFFFFFF")).toThrow(StoreError);
  });

  it("patches fields and clears them with null", () => {
    const { store } = project();
    const n = store.createNode({ type: "decision", title: "D", tags: ["a"], fileRefs: ["f.ts"] });
    const up = store.updateNode(n.id, { title: "D2", status: "accepted", tags: null });
    expect(up).toMatchObject({ title: "D2", status: "accepted" });
    expect(up.tags).toBeUndefined();
    expect(up.updatedAt >= n.updatedAt).toBe(true);
  });

  it("deleteNode removes touching edges", () => {
    const { store } = project();
    const a = store.createNode({ type: "question", title: "Q" });
    const b = store.createNode({ type: "decision", title: "D" });
    store.createEdge({ from: a.id, to: b.id, type: "led_to" });
    expect(store.deleteNode(a.id)).toBe(1);
    expect(store.listEdges()).toEqual([]);
  });
});

describe("edges", () => {
  it("rejects self loops, unknown endpoints, duplicates", () => {
    const { store } = project();
    const a = store.createNode({ type: "question", title: "Q" });
    const b = store.createNode({ type: "decision", title: "D" });
    expect(() => store.createEdge({ from: a.id, to: a.id, type: "considers" })).toThrow(StoreError);
    expect(() => store.createEdge({ from: a.id, to: "01AAAAAAAAAAAAAAAAAAAAAAAA", type: "led_to" })).toThrow(StoreError);
    store.createEdge({ from: a.id, to: b.id, type: "led_to" });
    expect(() => store.createEdge({ from: a.id, to: b.id, type: "led_to" })).toThrow(StoreError);
    expect(store.edgesFor(b.id).incoming).toHaveLength(1);
  });
});

describe("isSafeRef", () => {
  it("rejects absolute and parent-escaping refs", () => {
    expect(isSafeRef("src/a.ts")).toBe(true);
    expect(isSafeRef("/etc/passwd")).toBe(false);
    expect(isSafeRef("../secrets")).toBe(false);
    expect(isSafeRef("src/../../x")).toBe(false);
  });
});

function isUlidLike(id: string): boolean {
  return /^[0-9A-HJKMNP-TV-Z]{26}$/.test(id);
}

function projectRootOf(store: Store): string {
  return store.paths.root;
}
