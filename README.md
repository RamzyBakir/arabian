# Arabian

<p align="center">
  <img src="docs/screenshots/graph.png" alt="Arabian lineage graph" width="100%">
</p>

Arabian keeps track of why a codebase ended up the way it did.

It stores questions, alternatives, decisions, implementations, and outcomes
as a small graph in your repository. The data is plain JSON, so it can be
committed, reviewed in a PR, and read without needing a hosted service.

This is useful when you find yourself looking at something like
`src/db/store.ts` six months later and wondering why it was built that way.
Arabian connects the code back to the decision, the reasoning, the alternatives
that were considered, and the commit that implemented it.

## Quick example

```bash
$ arabian init                                  # creates .arabian/

$ arabian add question "Postgres or SQLite?"
01J9XQ8W5N  question   Postgres or SQLite?

$ arabian add alternative "Postgres"            # and "SQLite"
$ arabian link considers 01J9XQ8W5N <postgres-id>
$ arabian link considers 01J9XQ8W5N <sqlite-id>

$ arabian add decision "SQLite for v1" -d "Zero ops, single file"
$ arabian link led_to   01J9XQ8W5N <decision-id>
$ arabian link chooses  <decision-id> <sqlite-id>

$ arabian link commit <decision-id> HEAD
01J9XQAB12CD "Add SQLite storage layer" implements <decision-id>
```

Later, `explain` can show the context for a file:

```bash
$ arabian explain src/db/store.ts

Relevant engineering context for src/db/store.ts

[DECISION] 01J9XQ8W9K2M  SQLite for v1  accepted
  Zero ops, single file deployment.
  led to by led_to ← question Postgres or SQLite?
  leads to chooses → alternative SQLite
  alternatives considered: Postgres, SQLite
```

## For coding agents

Arabian includes an MCP server, so coding agents can query the same history
before changing a file.

```json
{
  "mcpServers": {
    "arabian": { "command": "npx", "args": ["-y", "arabian", "mcp"] }
  }
}
```

An agent can ask for the context around `src/auth/session.ts` and get back
things such as the relevant decision, rejected alternatives, the files it
affected, and whether it replaced an older decision.

Run `arabian skill` in a project to install a `SKILL.md` that tells coding
assistants to check the context before editing and record important decisions
afterwards.

Arabian does not decide what should be recorded. The agent or the developer
does that; Arabian just stores and connects it.

## What Arabian is for

- A development lineage graph
- A decision-to-code audit trail
- An MCP server for coding agents
- A web UI for browsing decisions and their relationships

It is not intended to be an ADR manager, project management tool, chat
interface, or AI memory/vector database.

## Why the name?

The Arabian horse is known for its lineage. Its pedigree has been preserved and
passed down for generations, with each horse traceable to where it came from.
That felt like a good fit for a tool that answers: “Where did this come from?”

### Orb

Orb is the small mascot used throughout the UI. The different faces correspond
to normal, thinking, question, decision, agent, warning, and success states.

## Install

```bash
npm install -g arabian     # node >= 18
```

Or run it from source:

```bash
git clone https://github.com/RamzyBakir/arabian.git
cd arabian
npm install
npm run build
```

You can then use `node dist/cli/index.js`, or run `npm link` to use the
`arabian` command directly.

## CLI

| Command | Purpose |
|---|---|
| `arabian init [--repo <url>]` | Create `.arabian/` and detect the git origin for file links |
| `arabian add <type> <title> [-d] [-f file:12-34] [-t tag] [--actor]` | Create a node |
| `arabian link <edge-type> <from> <to>` | Connect two nodes |
| `arabian link commit <node> <sha>` | Attach a git commit to a node |
| `arabian explain <file...>` | Show lineage recorded for one or more files |
| `arabian diff [ref]` | Show lineage changes since a git ref, defaulting to `HEAD` |
| `arabian doctor [--check-files]` | Check for broken JSON, dangling edges, and other problems |
| `arabian list / show / search / stats` | Browse the stored lineage |
| `arabian serve [--port 7424]` | Start the web UI and JSON API |
| `arabian skill` | Install the agent `SKILL.md` into the current project |
| `arabian mcp` | Start the MCP server over stdio |

## MCP tools

`arabian_get_context` (files → relevant lineage), `arabian_create_node`,
`arabian_update_node`, `arabian_create_edge`, `arabian_get_node`,
`arabian_list_nodes`, `arabian_get_lineage`, `arabian_search`,
`arabian_get_graph`, and `arabian_supersede`.

## Web UI

Run `arabian serve` and open `http://127.0.0.1:7424`.

- Overview with stats, search, filters, and recent activity
- Node details with markdown descriptions, status, tags, and editable lineage
- A React Flow graph with typed edges and automatic layout
- Clickable file references such as `src/auth/session.ts:42-87` when a GitHub repository is configured

<p align="center">
  <img src="docs/screenshots/overview.png" alt="Arabian overview" width="100%">
</p>

## Storage

```
.arabian/
  project.json        # { name, description?, repository?, createdAt }
  nodes/
    01J3X….json       # one file per node
  edges.json          # all edges in one array
```

The files are plain JSON and are meant to live in git. Each node gets its own
file, which keeps diffs readable. IDs are ULIDs, and writes are validated with
Zod. The `triggers` edge connects an outcome back to a question and lets the
lineage continue over time.

### Domain model

**Node types:** `question` `alternative` `decision` `experiment`
`implementation` `outcome` `constraint`

**Statuses:** `draft` `proposed` `accepted` `rejected` `superseded`
`abandoned` `completed` (transitions are recorded, not enforced)

**Edge types:** `led_to` `considers` `chooses` `rejects` `supersedes`
`implements` `produces` `constrains` `triggers` `references`

## Dogfooding

This repository has its own `.arabian/` directory. Run `arabian serve` here
to browse the decisions behind Arabian itself.

To generate a fresh example lineage, run `npm run seed`.

## Development

```bash
npm install
npm run build        # core + CLI + MCP, then the web UI
npm test             # vitest
npm run check:mcp    # end-to-end MCP check against the built server
```

See [CONTRIBUTING.md](CONTRIBUTING.md) and [CHANGELOG.md](CHANGELOG.md).

## License

[MIT](LICENSE)
