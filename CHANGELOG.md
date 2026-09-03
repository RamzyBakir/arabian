# Changelog

## 0.1.0 — first public release

- **Core lineage store** — typed nodes (question, alternative, decision,
  experiment, implementation, outcome, constraint) and typed edges, ULID
  ids, Zod-validated writes, one JSON file per node under `.arabian/`.
- **CLI** — `init`, `add`, `link`, `link commit` (attach a git commit as the
  implementation of a node), `list`, `show`, `search`, `stats`, `skill`,
  `serve`, `mcp`.
- **`arabian explain <file>`** — the lineage recorded for one or more files:
  decisions, alternatives considered, implementations, supersedes.
- **`arabian diff [ref]`** — lineage changes since a git ref, including
  uncommitted work.
- **`arabian doctor`** — structural integrity check: malformed JSON, invalid
  schemas, dangling/duplicate edges, self-loops, orphaned nodes.
- **MCP server** — 10 tools including `arabian_get_context` (fetch the
  engineering context for files before touching them) and `arabian_supersede`.
- **Web UI** — overview with stats and search, node detail with editable
  lineage and supersede flow, React Flow lineage graph, clickable file
  references with GitHub line anchors.
- **Agent skill** — `arabian skill` installs a SKILL.md teaching coding
  assistants when to consult and when to record lineage.
- **Packaging** — MIT license, npm metadata, `prepublishOnly` gate, version
  injected at build time.
- **Security** — the local API server rejects non-loopback Host headers and
  no longer sends wildcard CORS headers; all write routes validate input
  with Zod.
- **CI** — GitHub Actions: typecheck + tests on node 18/22, build + MCP
  end-to-end check, tag-triggered publish with provenance.
