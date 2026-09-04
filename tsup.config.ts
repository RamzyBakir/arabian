import { createRequire } from "node:module";
import { defineConfig } from "tsup";

const require = createRequire(import.meta.url);
const { version } = require("./package.json") as { version: string };

// Injected into bundles so the MCP server reports the real package version.
const define = { __VERSION__: JSON.stringify(version) };

export default [
  {
    entry: { "core/index": "src/core/index.ts" },
    format: ["esm"],
    target: "node18",
    platform: "node",
    sourcemap: true,
    dts: true,
    splitting: false,
    define,
  },
  {
    entry: { "cli/index": "src/cli/index.ts" },
    format: ["esm"],
    target: "node18",
    platform: "node",
    sourcemap: true,
    dts: false,
    clean: true,
    splitting: false,
    define,
  },
  {
    entry: { "mcp/server": "src/mcp/server.ts", "mcp/main": "src/mcp/main.ts" },
    format: ["esm"],
    target: "node18",
    platform: "node",
    sourcemap: true,
    dts: false,
    splitting: false,
    define,
  },
];
