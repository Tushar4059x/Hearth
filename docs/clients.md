# Connecting AI Clients to Hearth

The Hearth MCP server speaks the Model Context Protocol over stdio, so **any
MCP-capable client** can use the same shared memory.

## Fast Setup

```bash
npx hearth-cli setup
```

Setup creates the vault, configures detected clients, writes the `AGENTS.md`
instructions for the current repo, and runs a save/search check.

Target a specific client:

```bash
npx hearth-cli setup --client codex
npx hearth-cli setup --client cursor
npx hearth-cli setup --client claude-desktop
npx hearth-cli setup --client claude-code
```

Inspect or repair later:

```bash
hearth doctor
hearth doctor --fix
```

## Manual Setup

If you prefer to edit config files yourself, create a vault first:

```bash
npm install -g hearth-cli
hearth init ~/hearth
```

> The server picks its vault from the `HEARTH_VAULT` env var.

---

## Claude Code

One command:

```bash
claude mcp add hearth -s user \
  -e HEARTH_VAULT=/Users/tushar/hearth \
  -- npx -y hearth-mcp
```

…or drop a `.mcp.json` in a project root:

```json
{
  "mcpServers": {
    "hearth": {
      "command": "npx",
      "args": ["-y", "hearth-mcp"],
      "env": { "HEARTH_VAULT": "/Users/tushar/hearth" }
    }
  }
}
```

## Claude Desktop

Settings → Developer → **Edit Config**, then merge:

```json
{
  "mcpServers": {
    "hearth": {
      "command": "npx",
      "args": ["-y", "hearth-mcp"],
      "env": { "HEARTH_VAULT": "/Users/tushar/hearth" }
    }
  }
}
```

Restart Claude Desktop.

## Cursor / Windsurf

Global config at `~/.cursor/mcp.json` (or `.cursor/mcp.json` per-project) — same
shape as above:

```json
{
  "mcpServers": {
    "hearth": {
      "command": "npx",
      "args": ["-y", "hearth-mcp"],
      "env": { "HEARTH_VAULT": "/Users/tushar/hearth" }
    }
  }
}
```

## Antigravity

Open **Settings → MCP servers → Add**, and paste the same `mcpServers` JSON
block as Cursor. (Antigravity stores it in its own MCP config file; the panel is
the reliable way to add it across versions.)

## Codex CLI

Codex uses TOML at `~/.codex/config.toml`:

```toml
[mcp_servers.hearth]
command = "npx"
args = ["-y", "hearth-mcp"]
env = { HEARTH_VAULT = "/Users/tushar/hearth" }
```

## The tools your agents get

| Tool | What it does |
| --- | --- |
| `memory_search` | Keyword search across all memories (FTS5, ranked) |
| `memory_save` | Save a fact / decision / preference / note |
| `memory_get` | Fetch one memory in full by id or title |
| `memory_list` | List recent memories, filterable |
| `memory_context` | "Catch me up" digest: preferences + global decisions + a project's notes |

A good habit: have the agent call `memory_context` at the start of a session,
and `memory_save` whenever a durable decision or preference is established.

You don't have to remember to ask, though — `hearth init` (and `hearth rules`)
writes these instructions into your project's `AGENTS.md`, which agents read
automatically, so they pick up the habit on their own.
