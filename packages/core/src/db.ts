import Database from 'better-sqlite3';
import { hearthPaths } from './vault.js';
import { walkNotes } from './store.js';
import type { Note, SearchOptions, SearchResult } from './types.js';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS notes (
  rowid      INTEGER PRIMARY KEY,
  id         TEXT UNIQUE NOT NULL,
  title      TEXT NOT NULL,
  type       TEXT NOT NULL,
  scope      TEXT NOT NULL,
  project    TEXT,
  tags       TEXT NOT NULL DEFAULT '[]',
  source     TEXT,
  created    TEXT,
  updated    TEXT,
  confidence TEXT,
  path       TEXT NOT NULL,
  body       TEXT NOT NULL
);

CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
  title, body, tags,
  content='notes',
  content_rowid='rowid',
  tokenize='porter unicode61'
);

CREATE TRIGGER IF NOT EXISTS notes_ai AFTER INSERT ON notes BEGIN
  INSERT INTO notes_fts(rowid, title, body, tags)
  VALUES (new.rowid, new.title, new.body, new.tags);
END;

CREATE TRIGGER IF NOT EXISTS notes_ad AFTER DELETE ON notes BEGIN
  INSERT INTO notes_fts(notes_fts, rowid, title, body, tags)
  VALUES ('delete', old.rowid, old.title, old.body, old.tags);
END;

CREATE TRIGGER IF NOT EXISTS notes_au AFTER UPDATE ON notes BEGIN
  INSERT INTO notes_fts(notes_fts, rowid, title, body, tags)
  VALUES ('delete', old.rowid, old.title, old.body, old.tags);
  INSERT INTO notes_fts(rowid, title, body, tags)
  VALUES (new.rowid, new.title, new.body, new.tags);
END;
`;

const UPSERT_SQL = `
INSERT INTO notes (id, title, type, scope, project, tags, source, created, updated, confidence, path, body)
VALUES (@id, @title, @type, @scope, @project, @tags, @source, @created, @updated, @confidence, @path, @body)
ON CONFLICT(id) DO UPDATE SET
  title=excluded.title, type=excluded.type, scope=excluded.scope, project=excluded.project,
  tags=excluded.tags, source=excluded.source, created=excluded.created, updated=excluded.updated,
  confidence=excluded.confidence, path=excluded.path, body=excluded.body
`;

type Row = {
  id: string;
  title: string;
  type: string;
  scope: string;
  project: string | null;
  tags: string;
  source: string;
  created: string;
  updated: string;
  confidence: string;
  path: string;
  body: string;
  rank?: number;
  snip?: string;
};

function rowToNote(r: Row): Note {
  return {
    id: r.id,
    title: r.title,
    type: r.type as Note['type'],
    scope: r.scope as Note['scope'],
    project: r.project ?? null,
    tags: parseTags(r.tags),
    source: r.source,
    created: r.created,
    updated: r.updated,
    confidence: r.confidence as Note['confidence'],
    body: r.body,
    path: r.path,
  };
}

function parseTags(raw: string): string[] {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

function noteParams(note: Note) {
  return {
    id: note.id,
    title: note.title,
    type: note.type,
    scope: note.scope,
    project: note.project,
    tags: JSON.stringify(note.tags),
    source: note.source,
    created: note.created,
    updated: note.updated,
    confidence: note.confidence,
    path: note.path,
    body: note.body,
  };
}

/** Build a safe FTS5 MATCH query from free-form user input (prefix-AND). */
function toMatchQuery(input: string): string | null {
  const tokens = input.toLowerCase().match(/[\p{L}\p{N}]+/gu);
  if (!tokens || tokens.length === 0) return null;
  return tokens.map((t) => `${t}*`).join(' ');
}

/** The keyword search index over the vault's notes. */
export class HearthDb {
  private db: InstanceType<typeof Database>;

  constructor(vault: string) {
    this.db = new Database(hearthPaths(vault).db);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(SCHEMA);
  }

  close(): void {
    this.db.close();
  }

  upsert(note: Note): void {
    this.db.prepare(UPSERT_SQL).run(noteParams(note));
  }

  remove(id: string): void {
    this.db.prepare('DELETE FROM notes WHERE id = ?').run(id);
  }

  removeByPath(filePath: string): void {
    this.db.prepare('DELETE FROM notes WHERE path = ?').run(filePath);
  }

  count(): number {
    const row = this.db.prepare('SELECT COUNT(*) AS c FROM notes').get() as { c: number };
    return row.c;
  }

  /** Rebuild the whole index from the markdown files on disk. */
  reindex(vault: string): number {
    const insert = this.db.prepare(UPSERT_SQL);
    const run = this.db.transaction(() => {
      this.db.exec('DELETE FROM notes');
      let n = 0;
      for (const note of walkNotes(vault)) {
        insert.run(noteParams(note));
        n++;
      }
      return n;
    });
    return run();
  }

  get(idOrTitle: string): Note | null {
    let row = this.db.prepare('SELECT * FROM notes WHERE id = ?').get(idOrTitle) as Row | undefined;
    if (!row) {
      row = this.db
        .prepare('SELECT * FROM notes WHERE title = ? COLLATE NOCASE LIMIT 1')
        .get(idOrTitle) as Row | undefined;
    }
    return row ? rowToNote(row) : null;
  }

  list(opts: SearchOptions = {}): Note[] {
    const where: string[] = [];
    const params: Record<string, unknown> = { limit: opts.limit ?? 50 };
    if (opts.scope) {
      where.push('scope = @scope');
      params.scope = opts.scope;
    }
    if (opts.project) {
      where.push('project = @project');
      params.project = opts.project;
    }
    if (opts.type) {
      where.push('type = @type');
      params.type = opts.type;
    }
    const sql = `SELECT * FROM notes ${
      where.length ? `WHERE ${where.join(' AND ')}` : ''
    } ORDER BY updated DESC LIMIT @limit`;
    return (this.db.prepare(sql).all(params) as Row[]).map(rowToNote);
  }

  search(query: string, opts: SearchOptions = {}): SearchResult[] {
    const match = toMatchQuery(query);
    if (!match) return [];

    const where: string[] = ['notes_fts MATCH @match'];
    const params: Record<string, unknown> = { match, limit: opts.limit ?? 20 };
    if (opts.scope) {
      where.push('n.scope = @scope');
      params.scope = opts.scope;
    }
    if (opts.project) {
      where.push('n.project = @project');
      params.project = opts.project;
    }
    if (opts.type) {
      where.push('n.type = @type');
      params.type = opts.type;
    }

    const sql = `
      SELECT n.*, bm25(notes_fts) AS rank,
             snippet(notes_fts, 1, '[', ']', ' … ', 12) AS snip
      FROM notes_fts
      JOIN notes n ON n.rowid = notes_fts.rowid
      WHERE ${where.join(' AND ')}
      ORDER BY rank
      LIMIT @limit`;

    const rows = this.db.prepare(sql).all(params) as Row[];
    return rows.map((r) => ({
      note: rowToNote(r),
      rank: r.rank ?? 0,
      snippet: r.snip,
    }));
  }
}
