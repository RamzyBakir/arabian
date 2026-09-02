import { defineConfig } from "tsup";

export default [
  {
    entry: { "core/index": "src/core/index.ts" },
    format: ["esm"],
    target: "node18",
    platform: "node",
    sourcemap: true,
    dts: true,
    splitting: false,
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
  },
  {
    entry: { "mcp/server": "src/mcp/server.ts" },
    format: ["esm"],
    target: "node18",
    platform: "node",
    sourcemap: true,
    dts: false,
    splitting: false,
  },
];
