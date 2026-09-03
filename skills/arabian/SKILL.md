---
name: arabian
description: Record and explore engineering lineage with Arabian — the local-first decision graph in .arabian/. Use when the user asks to record a decision, question, alternative, experiment, implementation, outcome, or constraint; capture "why" context about the codebase; link lineage nodes; supersede a decision; or explore/summarize project lineage via the `arabian` CLI or Arabian MCP tools.
---

# Arabian: engineering lineage

Arabian is a local-first lineage layer that answers *"why does this codebase look like this, and how did we get here?"*. It stores a directed graph of typed nodes in `.arabian/` (plain JSON, git-friendly). Arabian is a **passive recorder**: you decide what to log, it just stores and connects.

## When to record

Create nodes proactively (but sparingly — record signal, not noise) when work involves:

- A **question** worth answering ("Should we use X or Y?") and its **alternatives**
- A **decision** and the reasoning/evidence behind it
- An **experiment** (spike, benchmark) and its **outcome**
- The **implementation** that landed a decision (PR, module, script)
- A hard **constraint** that shaped choices ("must run offline")
- An **outcome** that raises the next question — wire it with a `triggers` edge; the cycle is the whole point

Do not record routine steps (typical refactors, dependency bumps) unless the user asks why/whether questions about them.

## Storage & IDs

- Project root = the directory containing `.arabian/` (CLI discovers it by walking up).
- One JSON file per node: `.arabian/nodes/<ulid>.<type>.json`; all edges in `.arabian/edges.json`.
- Node ids are ULIDs. Short display ids (first 10 + last 4 chars, e.g. `01M1HFKJK6J2YJ`) are accepted anywhere a full id is expected.

## CLI

```bash
arabian init                                   # only if .arabian/ doesn't exist
arabian add <type> "<title>" [-d "markdown"] [--tag a,b] [-f src/x.ts] [--status s] [--actor agent:Codex:claude]
arabian link <edge-type> <from-id> <to-id> [--note "..."]
arabian list [type] [--status s] [--tag t]     # ids in col 1
arabian show <id> [--hops n] [--direction up|down|both]
arabian search "<query>"
arabian stats
arabian serve [--port 7424]                    # web UI (overview + graph)
```

Types: `question alternative decision experiment implementation outcome constraint`
Statuses: `draft proposed accepted rejected superseded abandoned completed` (transitions are NOT enforced)

## MCP tools (when the arabian MCP server is configured)

`arabian_create_node`, `arabian_update_node`, `arabian_create_edge`, `arabian_get_node`,
`arabian_list_nodes`, `arabian_get_lineage`, `arabian_search`, `arabian_get_graph`, `arabian_supersede`.
Prefer these over shelling out to the CLI when available. `arabian_supersede` replaces a decision in
one step (new decision + `supersedes` edge + old marked superseded).

## Edge types — pick by meaning

| Edge | Reads as | Typical use |
|---|---|---|
| `led_to` | question → decision | the answer chain |
| `considers` | question → alternative | options on the table |
| `chooses` / `rejects` | decision → alternative | what won / what lost, and why (use `--note`) |
| `implements` | implementation → decision | code that landed a decision |
| `produces` | experiment → outcome | benchmarks → results |
| `constrains` | constraint → question or decision | hard limits shaping choices |
| `triggers` | outcome → question | the lineage cycle — always close the loop |
| `supersedes` | new decision → old decision | reversals (or just use `arabian_supersede`) |
| `references` | anything → anything | escape hatch |

## Workflow example

```bash
Q=$(arabian add question "Use cron or a queue for reports?" | awk '{print $1}')
A1=$(arabian add alternative "Cron + files" | awk '{print $1}')
A2=$(arabian add alternative "Job queue" | awk '{print $1}')
arabian link considers $Q $A1 && arabian link considers $Q $A2
# ... after investigating ...
D=$(arabian add decision "Job queue" -d "Needs retries and visibility" --actor agent:ZCode | awk '{print $1}')
arabian link led_to $Q $D && arabian link chooses $D $A2 && arabian link rejects $D $A1 --note "no retry story"
```

Then tell the user what you recorded (titles + the id prefix) so they can review with
`arabian show` or `arabian serve`.
