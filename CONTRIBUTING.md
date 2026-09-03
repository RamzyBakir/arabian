# Contributing to Arabian

Thanks for helping! Arabian is small on purpose — a local-first lineage
recorder, not a platform. Keep that in mind when proposing features.

## Setup

```bash
git clone https://github.com/RamzyBakir/arabian.git
cd arabian
npm install        # node >= 18 (20+ recommended; the web build needs vite 7)
npm run build
npm test
```

## Scripts

| Script | What it does |
|---|---|
| `npm run build` | Core + CLI + MCP server (tsup) and the web UI (vite) |
| `npm run dev:web` | Vite dev server for the UI (proxies `/api` to :7424) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` / `npm run test:watch` | Vitest |
| `npm run check:mcp` | End-to-end MCP verification against `dist/` (build first) |
| `npm run seed` | Generate an example lineage in `.arabian/` |

## Project layout

```
src/core/     domain: store (JSON files), lineage, context, diff, doctor, schema, types
src/cli/      the `arabian` CLI
src/mcp/      the stdio MCP server
src/server/   zero-dependency HTTP server (API + static web/dist)
web/          React 19 + Vite + React Flow UI (workspace)
skills/       SKILL.md bundled and installed by `arabian skill`
scripts/      seed + MCP end-to-end check
```

## Conventions

- **Core stays dependency-free**: `src/core/` may use node built-ins only.
  Runtime deps live at the edges (MCP SDK, zod, the web app).
- **Zod validates every write** — through the CLI, MCP server, and HTTP API
  alike. New fields belong in `schema.ts` + `types.ts` first.
- **Tests are colocated** as `*.test.ts` (vitest). Behavior changes need
  tests; bug fixes need a regression test.
- **Dogfood**: if you make a notable design decision, record it —
  `arabian add decision "..." -d "why"` and link it. This repo's `.arabian/`
  is its own history.
- **Commits**: conventional-ish prefixes (`feat:`, `fix:`, `docs:`,
  `chore:`, `test:`).
- Node 18 is the minimum supported runtime — avoid newer APIs in `src/`.

## Pull requests

1. Fork/branch from `main`.
2. Keep PRs small and focused; one behavior per PR.
3. `npm run typecheck && npm test` must pass (CI also runs the MCP check).
4. Describe the *why*, not just the what — it's a lineage tool, after all.

## Releasing (maintainers)

1. Update `CHANGELOG.md` and bump `version` in `package.json`.
2. Tag `vX.Y.Z` and push — `.github/workflows/publish.yml` builds, tests,
   and runs `npm publish --provenance`.
3. Requires the `NPM_TOKEN` secret configured on the repo.
