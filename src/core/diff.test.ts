import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { diffSince, initProject, Store, StoreError } from "./index.js";

const cleanup: string[] = [];
afterEach(() => {
  while (cleanup.length) rmSync(cleanup.pop()!, { recursive: true, force: true });
});

function sh(cmd: string, cwd: string): void {
  execSync(cmd, { cwd, stdio: "ignore" });
}

/** Git repo + committed .arabian/ with one decision. */
function gitProject() {
  const root = mkdtempSync(join(tmpdir(), "arabian-diff-"));
  cleanup.push(root);
  sh("git init", root);
  sh("git config user.email test@example.com", root);
  sh("git config user.name Test", root);
  initProject(root, { name: "diff-fixture" });
  const store = Store.at(root);
  const d = store.createNode({ type: "decision", title: "SQLite for v1", fileRefs: ["src/db.ts"] });
  sh("git add -A", root);
  sh("git commit -m init", root);
  return { root, store, d };
}

describe("diffSince", () => {
  it("reports nothing when the lineage is committed", () => {
    const { store } = gitProject();
    const diff = diffSince(store, "HEAD");
    expect(diff.nodes).toEqual([]);
    expect(diff.links).toEqual([]);
  });

  it("detects added nodes and links and status changes", () => {
    const { store, d } = gitProject();
    const q = store.createNode({ type: "question", title: "Which DB?" });
    const edge = store.createEdge({ from: q.id, to: d.id, type: "led_to" });
    store.updateNode(d.id, { status: "accepted" });

    const diff = diffSince(store, "HEAD");
    const added = diff.nodes.find((n) => n.change === "added");
    const modified = diff.nodes.find((n) => n.change === "modified");
    expect(added?.node.id).toBe(q.id);
    expect(modified?.node.id).toBe(d.id);
    expect(modified?.old?.status).toBe("proposed");
    expect(diff.links).toEqual([{ change: "added", edge }]);
  });

  it("detects removed links", () => {
    const { store, root, d } = gitProject();
    const q = store.createNode({ type: "question", title: "Which DB?" });
    const edge = store.createEdge({ from: q.id, to: d.id, type: "led_to" });
    sh("git add -A", root);
    sh("git commit -m link", root);
    store.deleteEdge(edge.id);

    const diff = diffSince(store, "HEAD");
    expect(diff.links).toHaveLength(1);
    expect(diff.links[0]!.change).toBe("removed");
    expect(diff.links[0]!.edge.id).toBe(edge.id);
  });

  it("sees a committed change when diffing against HEAD~1", () => {
    const { store, root } = gitProject();
    const d2 = store.createNode({ type: "decision", title: "Add cache later" });
    sh("git add -A", root);
    sh("git commit -m second", root);
    const diff = diffSince(store, "HEAD~1");
    expect(diff.nodes.map((n) => n.node.id)).toEqual([d2.id]);
    expect(diff.nodes[0]!.change).toBe("added");
  });

  it("rejects invalid refs", () => {
    const { store } = gitProject();
    expect(() => diffSince(store, "not-a-ref")).toThrow(StoreError);
  });
});
