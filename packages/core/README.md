# hearth-core

The engine behind [Hearth](https://github.com/Tushar4059x/Hearth) — a local-first, markdown-native memory store with SQLite FTS5 search.

```ts
import { Hearth } from 'hearth-core';

const h = new Hearth('/path/to/vault');
h.save({
  title: 'Postgres is the datastore',
  content: 'We chose Postgres over Mongo for relational integrity.',
  type: 'decision',
  scope: 'project',
  project: 'myapp',
});
console.log(h.search('postgres'));
```

Each note is a markdown file with YAML frontmatter (Obsidian-compatible); the SQLite index is derived and rebuildable. See the [main repo](https://github.com/Tushar4059x/Hearth) for the full picture.

MIT
