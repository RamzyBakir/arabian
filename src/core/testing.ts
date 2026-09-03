import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initProject, Store } from "./index.js";

/** Create a fresh Arabian project in a temp dir for tests. */
export function makeTempProject(
  meta: { name?: string; description?: string; repository?: string } = {},
): { root: string; store: Store } {
  const root = mkdtempSync(join(tmpdir(), "arabian-test-"));
  initProject(root, { name: meta.name ?? "test-project", ...meta });
  return { root, store: Store.at(root) };
}
