# Connecting AI clients to Hearth

The Hearth MCP server speaks the Model Context Protocol over stdio, so **any
MCP-capable client** can use the same shared memory. Below are copy-paste
recipes for Claude, Cursor, Antigravity, and Codex.

## 1. One-time setup

```bash
# build the packages
cd /Users/tushar/Documents/code/shared-mem
pnpm install && pnpm build

# create your vault (also an Obsidian vault) — pick any path you like
node packages/cli/dist/index.js init ~/hearth
```

Two values are reused in every recipe below:

| Placeholder | Value on this machine |
| --- | --- |
| **server** | `/Users/tushar/Documents/code/shared-mem/packages/mcp/dist/index.js` |
| **vault** | `/Users/tushar/hearth` (or wherever you ran `init`) |

> The server picks its vault from the `HEARTH_VAULT` env var.

---

## 2. Claude Code (CLI)

One command:

```bash
claude mcp add hearth -s user \
  -e HEARTH_VAULT=/Users/tushar/hearth \
  -- node /Users/tushar/Documents/code/shared-mem/packages/mcp/dist/index.js
```

…or drop a `.mcp.json` in a project root:

```json
{
  "mcpServers": {
    "hearth": {
      "command": "node",
      "args": ["/Users/tushar/Documents/code/shared-mem/packages/mcp/dist/index.js"],
      "env": { "HEARTH_VAULT": "/Users/tushar/hearth" }
    }
  }
}
```

## 3. Claude Desktop

Settings → Developer → **Edit Config**, then merge:

```json
{
  "mcpServers": {
    "hearth": {
      "command": "node",
      "args": ["/Users/tushar/Documents/code/shared-mem/packages/mcp/dist/index.js"],
      "env": { "HEARTH_VAULT": "/Users/tushar/hearth" }
    }
  }
}
```

Restart Claude Desktop. You should see the `hearth` tools (a hammer icon).

## 4. Cursor / Windsurf

Global config at `~/.cursor/mcp.json` (or `.cursor/mcp.json` per-project) — same
shape as above:

```json
{
  "mcpServers": {
    "hearth": {
      "command": "node",
      "args": ["/Users/tushar/Documents/code/shared-mem/packages/mcp/dist/index.js"],
      "env": { "HEARTH_VAULT": "/Users/tushar/hearth" }
    }
  }
}
```

## 5. Antigravity

Open **Settings → MCP servers → Add**, and paste the same `mcpServers` JSON
block as Cursor. (Antigravity stores it in its own MCP config file; the panel is
the reliable way to add it across versions.)

## 6. Codex CLI

Codex uses TOML at `~/.codex/config.toml`:

```toml
[mcp_servers.hearth]
command = "node"
args = ["/Users/tushar/Documents/code/shared-mem/packages/mcp/dist/index.js"]
env = { HEARTH_VAULT = "/Users/tushar/hearth" }
```

---

## After publishing to npm

Once `@hearth/mcp` is published, every recipe above simplifies to no absolute
paths — just `npx`:

```json
{
  "mcpServers": {
    "hearth": {
      "command": "npx",
      "args": ["-y", "@hearth/mcp"],
      "env": { "HEARTH_VAULT": "/Users/tushar/hearth" }
    }
  }
}
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
