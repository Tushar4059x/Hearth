export const NOTE_TYPES = [
  'fact',
  'decision',
  'preference',
  'reference',
  'task',
  'snippet',
] as const;
export type NoteType = (typeof NOTE_TYPES)[number];

export const SCOPES = ['global', 'project', 'session'] as const;
export type Scope = (typeof SCOPES)[number];

export const CONFIDENCE_LEVELS = ['low', 'medium', 'high'] as const;
export type Confidence = (typeof CONFIDENCE_LEVELS)[number];

/** The frontmatter stored at the top of every note's markdown file. */
export interface NoteFrontmatter {
  /** Stable ULID. Survives file renames; the key for future team sync. */
  id: string;
  title: string;
  type: NoteType;
  scope: Scope;
  /** Project (scope=project) or session id (scope=session); null for global. */
  project: string | null;
  tags: string[];
  /** Which agent or human created the note (e.g. "claude-code", "cli"). */
  source: string;
  /** ISO-8601 timestamps. */
  created: string;
  updated: string;
  confidence: Confidence;
}

/** A fully-resolved note: frontmatter + body + its file location. */
export interface Note extends NoteFrontmatter {
  body: string;
  /** Absolute path to the backing .md file. */
  path: string;
}

/** Input for creating or updating a note. */
export interface SaveInput {
  title: string;
  content: string;
  type?: NoteType;
  scope?: Scope;
  project?: string | null;
  tags?: string[];
  source?: string;
  confidence?: Confidence;
  /** Provide to update an existing note instead of creating a new one. */
  id?: string;
}

export interface SearchOptions {
  scope?: Scope;
  project?: string | null;
  type?: NoteType;
  limit?: number;
}

export interface SearchResult {
  note: Note;
  /** SQLite bm25 score — lower (more negative) is a better match. */
  rank: number;
  /** Highlighted excerpt around the match. */
  snippet?: string;
}
