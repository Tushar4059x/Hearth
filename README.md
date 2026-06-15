# Hearth

**Local-first shared memory for AI agents, stored as plain markdown.**

[![hearth-cli](https://img.shields.io/npm/v/hearth-cli?label=hearth-cli&color=cb3837&logo=npm)](https://www.npmjs.com/package/hearth-cli)
[![hearth-mcp](https://img.shields.io/npm/v/hearth-mcp?label=hearth-mcp&color=cb3837&logo=npm)](https://www.npmjs.com/package/hearth-mcp)
[![hearth-core](https://img.shields.io/npm/v/hearth-core?label=hearth-core&color=cb3837&logo=npm)](https://www.npmjs.com/package/hearth-core)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Hearth gives Claude, Cursor, Codex, ChatGPT, Antigravity, and any other
MCP-capable agent one shared memory folder. Decisions, preferences, project
context, snippets, and notes are saved once, then recalled everywhere.

No hosted account. No proprietary database. No lock-in. The source of truth is a
folder of markdown files that you can open in Obsidian, edit by hand, back up
with Git, or move anywhere.

## Why Hearth

- **One memory across agents**: stop re-explaining the same project context in
  every tool.
- **Local-first and private**: your notes stay on your machine as markdown.
- **Obsidian-ready**: the vault is a normal folder with frontmatter,
  `[[wikilinks]]`, and readable files.
- **Fast recall**: SQLite FTS5 indexes notes for ranked keyword search.
- **Agent-friendly**: the MCP server exposes simple `memory_*` tools.
- **Proactive setup**: `hearth init` can add an `AGENTS.md` block so agents load
  context and save durable decisions automatically.

## Quick Start

Install the CLI and create a vault:

```bash
npm install -g hearth-cli
hearth init ~/hearth
```

Save and search a memory:

```bash
hearth --vault ~/hearth save "Postgres is the datastore" \
  -c "We chose Postgres because relational integrity matters here." \
  -t decision -s project -p my-app --tags architecture,db

hearth --vault ~/hearth search postgres
```

Connect an MCP client:

```json
{
  "mcpServers": {
    "hearth": {
      "command": "npx",
      "args": ["-y", "hearth-mcp"],
      "env": {
        "HEARTH_VAULT": "/absolute/path/to/your/hearth"
      }
    }
  }
}
```

Client-specific setup for Claude, Cursor, Antigravity, and Codex lives in
[docs/clients.md](docs/clients.md).

## How It Works

```text
              plain markdown files
        global/  projects/  sessions/
                    |
                    v
              hearth-core
        markdown store + SQLite FTS5
              /              \
             v                v
        hearth-cli        hearth-mcp
                          memory tools
```

Hearth writes each memory as a markdown file with YAML frontmatter. The SQLite
index is derived data and can always be rebuilt with `hearth reindex`.

The MCP server rebuilds the index on startup and watches the vault for direct
edits from Obsidian, other agents, or Git operations.

## MCP Tools

| Tool | Purpose |
| --- | --- |
| `memory_context` | Load global preferences, global decisions, and project notes |
| `memory_search` | Search memories by keyword with optional scope/type filters |
| `memory_save` | Save or update one atomic memory |
| `memory_get` | Fetch a memory by ULID or exact title |
| `memory_list` | List recent memories, optionally filtered |

## Memory Format

Each memory is just markdown:

```markdown
---
id: 01HX9K8Q...
title: Postgres is the datastore
type: decision
scope: project
project: my-app
tags: [architecture, db]
source: codex
created: 2026-06-15T10:00:00.000Z
updated: 2026-06-15T10:00:00.000Z
confidence: high
---

We chose Postgres because relational integrity matters here.
```

Supported note types:

```text
fact | decision | preference | reference | task | snippet
```

Supported scopes:

```text
global | project | session
```

## CLI

```bash
hearth init [dir]               # create or repair a vault
hearth save "<title>" -c "..."  # save a memory
hearth search <query>           # keyword search
hearth list                     # recent notes
hearth reindex                  # rebuild SQLite from markdown
hearth doctor                   # compare on-disk notes with indexed notes
hearth rules [dir]              # add Hearth instructions to AGENTS.md
```

The CLI resolves the vault in this order:

```text
--vault <path> -> HEARTH_VAULT -> nearest parent vault -> ~/hearth
```

## Packages

| Package | Description |
| --- | --- |
| [`hearth-core`](packages/core) | Core markdown store, vault helpers, and SQLite FTS index |
| [`hearth-cli`](packages/cli) | The `hearth` command |
| [`hearth-mcp`](packages/mcp) | MCP stdio server exposing shared memory tools |

## Development

```bash
git clone https://github.com/Tushar4059x/Hearth.git
cd Hearth
pnpm install
pnpm typecheck
pnpm build
node packages/mcp/smoke.mjs
```

This is a TypeScript ESM pnpm workspace. Build output goes to each package's
`dist/` directory.

## Roadmap

- Semantic search with pluggable local or hosted embeddings
- Memory consolidation, deduplication, and conflict resolution
- Optional encrypted sync
- Team/shared vault workflows

## License

MIT © Tushar
