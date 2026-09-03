import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { main } from "./index.js";
import { Store } from "../core/index.js";

let root = "";

function sh(cmd: string, cwd = root): void {
  execSync(cmd, { cwd, stdio: "ignore" });
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "arabian-cli-"));
  const prev = process.cwd();
  process.chdir(root);
  return () => process.chdir(prev);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  process.exitCode = 0;
});

describe("arabian CLI", () => {
  it("init → add → link → explain → inspect → doctor", () => {
    main(["init", "--name", "cli-test"]);
    expect(existsSync(join(root, ".arabian"))).toBe(true);

    main(["add", "question", "Which DB?", "-f", "src/db.ts", "--tag", "db"]);
    main(["add", "decision", "SQLite for v1", "-d", "zero ops"]);
    const store = Store.discover(root);
    expect(store.listNodes()).toHaveLength(2);
    const [q, d] = store.listNodes();

    main(["link", "led_to", q!.id, d!.id]);
    expect(store.listEdges()).toHaveLength(1);

    main(["explain", "src/db.ts:10-20"]);
    main(["list"]);
    main(["show", d!.id.slice(0, 12)]);
    main(["search", "sqlite"]);
    main(["stats"]);
    main(["doctor"]);
    expect(process.exitCode ?? 0).toBe(0);
  });

  it("doctor exits non-zero on a broken store", () => {
    main(["init", "--name", "broken"]);
    writeFileSync(join(root, ".arabian", "nodes", "01AAAAAAAAAAAAAAAAAAAAAAAA.question.json"), "{broken");
    main(["doctor"]);
    expect(process.exitCode).toBe(1);
  });

  it("diff reports uncommitted lineage changes", () => {
    sh("git init");
    sh("git config user.email t@t.co");
    sh("git config user.name T");
    main(["init", "--name", "diffy"]);
    main(["add", "decision", "Committed decision"]);
    sh("git add -A");
    sh("git commit -m init");
    main(["add", "question", "Uncommitted question"]);
    main(["diff"]);
    main(["diff", "HEAD"]);
  });

  it("link commit attaches a git commit as implementation", () => {
    sh("git init");
    sh("git config user.email t@t.co");
    sh("git config user.name T");
    main(["init", "--name", "commits"]);
    writeFileSync(join(root, "f.txt"), "x");
    sh("git add -A");
    sh("git commit -m 'Add session store'");
    const sha = execSync("git rev-parse HEAD", { cwd: root, encoding: "utf8" }).trim();

    main(["add", "decision", "Use Redis"]);
    const store = Store.discover(root);
    const d = store.listNodes().find((n) => n.type === "decision")!;
    main(["link", "commit", d.id, sha]);

    const impl = store.listNodes().find((n) => n.type === "implementation");
    expect(impl?.metadata).toMatchObject({ commit: sha });
    expect(impl?.title).toBe("Add session store");
    expect(store.listEdges().map((e) => e.type)).toContain("implements");

    // linking the same commit again must not duplicate the node or edge
    main(["link", "commit", d.id, sha]);
    expect(store.listNodes().filter((n) => n.type === "implementation")).toHaveLength(1);
  });

  it("init auto-detects the git origin for file links", () => {
    sh("git init");
    sh("git config user.email t@t.co");
    sh("git config user.name T");
    sh("git remote add origin https://github.com/acme/widget.git");
    main(["init"]);
    expect(Store.discover(root).getProject().repository).toBe("https://github.com/acme/widget.git");
  });

  it("rejects unknown commands with exit code 1", () => {
    main(["bogus"]);
    expect(process.exitCode).toBe(1);
  });
});
