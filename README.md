# 🔥 Hearth

**Local-first shared memory for AI agents — and your second brain, in one folder.**

You work across Claude, Cursor, Antigravity, Codex, ChatGPT… and re-explain the
same project context to each one. Hearth fixes that. It's a single folder of
markdown files that every AI agent can read and write through one shared memory
layer — and because it's *just markdown*, [Obsidian](https://obsidian.md) opens
the same folder as a vault. Your data stays on your machine, in plain text,
yours forever.

```
            ┌──────────────────────────────────────────┐
            │            HEARTH CORE                     │
            │  • Markdown + YAML frontmatter (truth)     │
            │  • [[wikilinks]] between notes             │
            │  • SQLite FTS5 keyword search              │
            │  • Scopes: global / project / session      │
            └──────────────────────────────────────────┘
                 ▲           ▲            ▲
            ┌────┴───┐  ┌────┴────┐  ┌────┴────┐
            │  MCP   │  │   CLI   │  │ Obsidian│
            │ server │  │ (hearth)│  │ (vault) │
            └────────┘  └─────────┘  └─────────┘
        Claude · Cursor · Antigravity · Codex
```

## Status

✅ **Phase 1 (foundations)** — markdown store, FTS5 search, `hearth` CLI.
✅ **Phase 2 (MCP server)** — agents connect over MCP; live file watcher keeps
the index in sync with Obsidian edits. See [docs/clients.md](docs/clients.md) to
wire up Claude, Cursor, Antigravity, or Codex.
🔜 **Next** — pluggable semantic search, then consolidation/dedup.

## Packages

| Package | What it does |
| --- | --- |
| [`@hearth/core`](packages/core) | The engine: markdown note store + SQLite FTS5 index |
| [`@hearth/cli`](packages/cli) | `hearth init / save / search / list / reindex / doctor` |
| [`@hearth/mcp`](packages/mcp) | MCP server exposing `memory_search / save / get / list / context` |

## Quick start (dev)

```bash
git clone https://github.com/Tushar4059x/Hearth.git
cd Hearth
pnpm install
pnpm build

# create a vault (also an Obsidian vault)
node packages/cli/dist/index.js init ~/hearth

# save and search memories
node packages/cli/dist/index.js --vault ~/hearth save "Postgres is the datastore" \
  -c "We chose Postgres over Mongo for relational integrity." -t decision -s project -p shared-mem
node packages/cli/dist/index.js --vault ~/hearth search postgres
```

## A note's shape

Each memory is one markdown file. Open the vault in Obsidian and it just works:

```markdown
---
id: 01HX9K8Q...        # stable ULID — survives renames (future team-sync key)
title: Postgres is the datastore
type: decision          # fact | decision | preference | reference | task | snippet
scope: project          # global | project | session
project: shared-mem
tags: [architecture, db]
source: cli
created: 2026-06-14T...
updated: 2026-06-14T...
confidence: high
---

We chose Postgres over Mongo for relational integrity. See [[why-not-mongo]].
```

## License

MIT — open source, one-stop solution for scattered context & memory.
