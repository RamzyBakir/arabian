#!/usr/bin/env node
/**
 * Entry for the `arabian-mcp` bin: always starts the MCP stdio server.
 * (The server module itself never auto-runs so it can be bundled safely.)
 */
import { startMcp } from "./server.js";

startMcp().catch((err) => {
  console.error("arabian-mcp failed to start:", err);
  process.exit(1);
});
