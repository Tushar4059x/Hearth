import { HearthDb } from './db.js';
import { resolveVault } from './vault.js';
import { parseNote, writeNote } from './store.js';
import type { Note, SaveInput, SearchOptions, SearchResult } from './types.js';

/**
 * High-level facade over a single vault: writes notes to markdown and keeps the
 * search index in sync. Hold one instance for the life of a process and call
 * {@link close} when done.
 */
export class Hearth {
  readonly vault: string;
  private readonly db: HearthDb;

  constructor(vault?: string) {
    this.vault = resolveVault(vault);
    this.db = new HearthDb(this.vault);
  }

  /** Create or update a note (markdown file + index). */
  save(input: SaveInput): Note {
    const note = writeNote(this.vault, input);
    this.db.upsert(note);
    return note;
  }

  search(query: string, opts?: SearchOptions): SearchResult[] {
    return this.db.search(query, opts);
  }

  get(idOrTitle: string): Note | null {
    return this.db.get(idOrTitle);
  }

  list(opts?: SearchOptions): Note[] {
    return this.db.list(opts);
  }

  /** Rebuild the index from the markdown files (e.g. after editing in Obsidian). */
  reindex(): number {
    return this.db.reindex(this.vault);
  }

  /** Index a single markdown file by absolute path (used by the live watcher). */
  indexFile(absPath: string): Note | null {
    const note = parseNote(absPath);
    if (note) this.db.upsert(note);
    return note;
  }

  /** Drop a single file from the index by absolute path (on delete). */
  removeFile(absPath: string): void {
    this.db.removeByPath(absPath);
  }

  count(): number {
    return this.db.count();
  }

  close(): void {
    this.db.close();
  }
}
