# hearth-cli

Command-line interface for [Hearth](https://github.com/Tushar4059x/Hearth) — local-first shared memory for AI agents, and your second brain.

```bash
npm install -g hearth-cli

hearth init ~/hearth        # create a vault (also an Obsidian vault)
hearth --vault ~/hearth save "Postgres is the datastore" -c "..." -t decision
hearth --vault ~/hearth search postgres
```

Commands: `init`, `save`, `search`, `list`, `reindex`, `doctor`. The vault is plain markdown — open it in Obsidian, or connect AI agents to it with [`hearth-mcp`](https://www.npmjs.com/package/hearth-mcp). See the [main repo](https://github.com/Tushar4059x/Hearth).

MIT
