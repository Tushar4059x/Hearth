import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { hearthPaths } from './vault.js';
import { newId } from './id.js';
import { slugify } from './slug.js';
import type {
  Confidence,
  Note,
  NoteFrontmatter,
  NoteType,
  SaveInput,
  Scope,
} from './types.js';

const DEFAULT_TYPE: NoteType = 'fact';
const DEFAULT_SCOPE: Scope = 'global';
const DEFAULT_CONFIDENCE: Confidence = 'medium';

/** Directory a note lives in, based on its scope and project/session. */
export function noteDir(vault: string, scope: Scope, project: string | null): string {
  const p = hearthPaths(vault);
  if (scope === 'global') return p.global;
  if (scope === 'project') {
    if (!project) throw new Error('`project` is required when scope is "project".');
    return path.join(p.projects, slugify(project));
  }
  if (!project) throw new Error('a session id (the `project` field) is required when scope is "session".');
  return path.join(p.sessions, slugify(project));
}

/** Pick a filename that does not clobber an existing note. */
function uniqueNotePath(dir: string, slug: string, id: string): string {
  const primary = path.join(dir, `${slug}.md`);
  if (!fs.existsSync(primary)) return primary;
  return path.join(dir, `${slug}-${id.slice(-6).toLowerCase()}.md`);
}

/** Render a note to markdown-with-frontmatter. */
export function serializeNote(note: Note): string {
  const frontmatter: NoteFrontmatter = {
    id: note.id,
    title: note.title,
    type: note.type,
    scope: note.scope,
    project: note.project,
    tags: note.tags,
    source: note.source,
    created: note.created,
    updated: note.updated,
    confidence: note.confidence,
  };
  return matter.stringify(`${note.body.trim()}\n`, frontmatter);
}

/** Parse a markdown file into a Note, or null if it isn't a Hearth note. */
export function parseNote(filePath: string): Note | null {
  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = matter(raw);
  const d = parsed.data as Partial<NoteFrontmatter>;
  if (!d.id || !d.title) return null;
  return {
    id: String(d.id),
    title: String(d.title),
    type: (d.type as NoteType) ?? DEFAULT_TYPE,
    scope: (d.scope as Scope) ?? DEFAULT_SCOPE,
    project: d.project != null ? String(d.project) : null,
    tags: Array.isArray(d.tags) ? d.tags.map(String) : [],
    source: d.source ? String(d.source) : 'unknown',
    created: d.created ? String(d.created) : new Date().toISOString(),
    updated: d.updated ? String(d.updated) : new Date().toISOString(),
    confidence: (d.confidence as Confidence) ?? DEFAULT_CONFIDENCE,
    body: parsed.content.trim(),
    path: path.resolve(filePath),
  };
}

/**
 * Write a note to disk. Creates a new note, or — when `input.id` is given and
 * its file is found — updates the existing one in place.
 */
export function writeNote(vault: string, input: SaveInput): Note {
  const now = new Date().toISOString();
  const scope = input.scope ?? DEFAULT_SCOPE;
  const project = input.project ?? null;

  let id = input.id ?? newId();
  let created = now;
  let filePath: string | undefined;

  if (input.id) {
    const existing = findNoteById(vault, input.id);
    if (existing) {
      id = existing.id;
      created = existing.created;
      filePath = existing.path;
    }
  }

  if (!filePath) {
    const dir = noteDir(vault, scope, project);
    fs.mkdirSync(dir, { recursive: true });
    filePath = uniqueNotePath(dir, slugify(input.title), id);
  }

  const note: Note = {
    id,
    title: input.title,
    type: input.type ?? DEFAULT_TYPE,
    scope,
    project,
    tags: input.tags ?? [],
    source: input.source ?? 'cli',
    created,
    updated: now,
    confidence: input.confidence ?? DEFAULT_CONFIDENCE,
    body: input.content,
    path: filePath,
  };

  fs.writeFileSync(filePath, serializeNote(note));
  return note;
}

/** Iterate every note in the vault. */
export function* walkNotes(vault: string): Generator<Note> {
  const p = hearthPaths(vault);
  for (const root of [p.global, p.projects, p.sessions]) {
    if (fs.existsSync(root)) yield* walkDir(root);
  }
}

function* walkDir(dir: string): Generator<Note> {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkDir(full);
    } else if (entry.name.endsWith('.md')) {
      const note = parseNote(full);
      if (note) yield note;
    }
  }
}

/** Find a note's file by scanning for its id (used for in-place updates). */
export function findNoteById(vault: string, id: string): Note | null {
  for (const note of walkNotes(vault)) {
    if (note.id === id) return note;
  }
  return null;
}
