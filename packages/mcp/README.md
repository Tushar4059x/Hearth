# hearth-mcp

[MCP](https://modelcontextprotocol.io) server for [Hearth](https://github.com/Tushar4059x/Hearth) — gives any MCP-capable AI agent (Claude, Cursor, Antigravity, Codex…) shared, local-first memory.

Add it to your client's MCP config:

```json
{
  "mcpServers": {
    "hearth": {
      "command": "npx",
      "args": ["-y", "hearth-mcp"],
      "env": { "HEARTH_VAULT": "/absolute/path/to/your/vault" }
    }
  }
}
```

Point `HEARTH_VAULT` at a folder created with `hearth init` (see [`hearth-cli`](https://www.npmjs.com/package/hearth-cli)).

**Tools:** `memory_search`, `memory_save`, `memory_get`, `memory_list`, `memory_context`.

Full per-client setup (Claude, Cursor, Antigravity, Codex) is in [docs/clients.md](https://github.com/Tushar4059x/Hearth/blob/main/docs/clients.md).

MIT
