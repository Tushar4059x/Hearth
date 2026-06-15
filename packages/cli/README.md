# hearth-cli

Command-line interface for [Hearth](https://github.com/Tushar4059x/Hearth) — local-first shared memory for AI agents, and your second brain.

```bash
npx hearth-cli setup

# or install globally
npm install -g hearth-cli
hearth setup
```

`hearth setup` creates a vault, configures detected MCP clients, writes Hearth
instructions to `AGENTS.md`, and runs a save/search check.

Commands: `setup`, `init`, `save`, `search`, `list`, `reindex`, `doctor`,
`rules`. The vault is plain markdown — open it in Obsidian, or connect AI agents
to it with [`hearth-mcp`](https://www.npmjs.com/package/hearth-mcp). See the
[main repo](https://github.com/Tushar4059x/Hearth).

MIT
