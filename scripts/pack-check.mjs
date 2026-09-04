#!/usr/bin/env node
/**
 * Package smoke test — installs the real npm tarball into a temp project and
 * exercises every bin entry the way a user would. This is the check that
 * catches "works via node dist/... but silently dead through npm .bin
 * symlinks" (the 0.1.0 launch bug).
 *
 * Usage: node scripts/pack-check.mjs   (build first)
 */
import { spawn, execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(fileURLToPath(new URL("..", import.meta.url)));
const require = createRequire(import.meta.url);
const { version, name } = require(join(REPO, "package.json"));

let passed = 0;
let failed = 0;
function check(name, ok, detail = "") {
  if (ok) {
    passed++;
    console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const tmp = mkdtempSync(join(tmpdir(), "arabian-pack-check-"));
const proj = join(tmp, "proj");
execFileSync("mkdir", ["-p", proj]);

function cleanup(exitCode) {
  rmSync(tmp, { recursive: true, force: true });
  process.exit(exitCode);
}

// ---- pack + install like a user ----
console.log("\nPhase 1 — npm pack + install");
let tarball;
try {
  execFileSync("npm", ["pack", "--pack-destination", tmp], { cwd: REPO, stdio: "ignore" });
  tarball = join(tmp, `${name}-${version}.tgz`);
  if (!existsSync(tarball)) throw new Error(`expected tarball missing: ${tarball}`);
  check("npm pack", true, tarball);
} catch (err) {
  check("npm pack", false, err.message);
  cleanup(1);
}
try {
  execFileSync("npm", ["init", "-y"], { cwd: proj, stdio: "ignore" });
  execFileSync("npm", ["i", tarball], { cwd: proj, stdio: "ignore" });
  check("npm i <tarball>", existsSync(join(proj, "node_modules", ".bin", "arabian")), "bin linked");
} catch (err) {
  check("npm i <tarball>", false, err.message);
  cleanup(1);
}

const BIN = join(proj, "node_modules", ".bin", "arabian");
const BIN_MCP = join(proj, "node_modules", ".bin", "arabian-mcp");

// ---- CLI through the .bin shim ----
console.log("\nPhase 2 — CLI via the npm bin shim");
{
  let out = "";
  try {
    out = execFileSync(BIN, ["--help"], { encoding: "utf8" });
  } catch (err) {
    out = err.stdout ?? "";
  }
  check("arabian --help", out.includes("local-first engineering lineage"), out.split("\n")[0]?.slice(0, 60));
}
{
  execFileSync(BIN, ["init", "--name", "pack-check"], { cwd: proj, stdio: "ignore" });
  check("arabian init", existsSync(join(proj, ".arabian", "project.json")));
  execFileSync(BIN, ["add", "question", "Does the packaged CLI work?"], { cwd: proj, stdio: "ignore" });
  const nodes = join(proj, ".arabian", "nodes");
  const count = existsSync(nodes) ? readdirSync(nodes).filter((f) => f.endsWith(".json")).length : 0;
  check("arabian add", count > 0, `${count} node file(s)`);
}

// ---- MCP server through both entry points ----
console.log("\nPhase 3 — MCP via shims");

function mcpHandshake(cmd, args) {
  return new Promise((resolvePromise) => {
    const child = spawn(cmd, args, { cwd: proj, stdio: ["pipe", "pipe", "ignore"] });
    let out = "";
    const timer = setTimeout(() => {
      child.kill();
      resolvePromise(out);
    }, 8000);
    child.stdout.on("data", (chunk) => {
      out += chunk;
      if (out.includes('"result"')) {
        clearTimeout(timer);
        child.kill();
        resolvePromise(out);
      }
    });
    child.stdin.write(
      JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "pack-check", version: "0" } },
      }) + "\n",
    );
  });
}

{
  const out = await mcpHandshake(BIN_MCP, []);
  check("arabian-mcp handshake", out.includes('"result"'), out.split("\n")[0]?.slice(0, 70));
}
{
  const out = await mcpHandshake(BIN, ["mcp"]);
  check("arabian mcp handshake", out.includes('"result"'), out.split("\n")[0]?.slice(0, 70));
}

// ---- serve through the shim ----
console.log("\nPhase 4 — web UI via the shim");
{
  const port = 7791;
  const child = spawn(BIN, ["serve", "--port", String(port)], { cwd: proj, stdio: "ignore" });
  let ok = false;
  for (let i = 0; i < 20 && !ok; i++) {
    await new Promise((r) => setTimeout(r, 250));
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/project`);
      const body = await res.json();
      ok = body.name === "pack-check";
    } catch {
      /* not up yet */
    }
  }
  child.kill();
  check("arabian serve", ok, `http://127.0.0.1:${port} responded`);
}

cleanup(failed ? 1 : 0);
