#!/usr/bin/env node
import path from 'node:path';
import chokidar from 'chokidar';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  Hearth,
  NOTE_TYPES,
  SCOPES,
  CONFIDENCE_LEVELS,
  type Note,
  type NoteType,
  type Scope,
  type Confidence,
} from 'hearth-core';

const noteType = z.enum([...NOTE_TYPES] as [NoteType, ...NoteType[]]);
const scopeEnum = z.enum([...SCOPES] as [Scope, ...Scope[]]);
const confidenceEnum = z.enum([...CONFIDENCE_LEVELS] as [Confidence, ...Confidence[]]);

function text(s: string) {
  return { content: [{ type: 'text' as const, text: s }] };
}

function meta(n: Note): string {
  return `${n.type} · ${n.scope}${n.project ? '/' + n.project : ''}`;
}

function block(n: Note, idx?: number): string {
  const head = `${idx ? `[${idx}] ` : ''}${n.title}  (${meta(n)})  id:${n.id}`;
  const tags = n.tags.length ? `\ntags: ${n.tags.join(', ')}` : '';
  return `${head}${tags}\n${n.body}`;
}

function bullet(n: Note): string {
  const body = n.body.replace(/\s+/g, ' ').trim();
  const clipped = body.length > 240 ? `${body.slice(0, 240)}…` : body;
  return `- **${n.title}** (${n.type}): ${clipped}  _(id:${n.id})_`;
}

async function main(): Promise<void> {
  let hearth: Hearth;
  try {
    hearth = new Hearth(process.env.HEARTH_VAULT);
  } catch (err) {
    console.error(`[hearth-mcp] ${err instanceof Error ? err.message : String(err)}`);
    console.error('[hearth-mcp] Set HEARTH_VAULT to your vault path, or run `hearth init` first.');
    process.exit(1);
    return;
  }

  // Build a fresh index on boot, then keep it live as files change
  // (edits from Obsidian, other agents, git pulls, etc.).
  hearth.reindex();
  const watcher = chokidar.watch('**/*.md', {
    cwd: hearth.vault,
    ignoreInitial: true,
    ignored: ['**/node_modules/**', '**/.git/**'],
  });
  const onUpsert = (rel: string): void => {
    try {
      hearth.indexFile(path.resolve(hearth.vault, rel));
    } catch {
      /* a half-written or malformed file — ignore until the next write */
    }
  };
  watcher.on('add', onUpsert);
  watcher.on('change', onUpsert);
  watcher.on('unlink', (rel) => hearth.removeFile(path.resolve(hearth.vault, rel)));

  const server = new McpServer({ name: 'hearth', version: '0.1.0' });

  server.registerTool(
    'memory_search',
    {
      title: 'Search shared memory',
      description:
        'Search shared memory for relevant notes by keyword. Call this at the start of a task to recall what is already known about a project, decision, or preference before asking the user.',
      inputSchema: {
        query: z.string().describe('Keywords to search for.'),
        scope: scopeEnum.optional().describe('Limit to a scope: global, project, or session.'),
        project: z.string().optional().describe('Limit to a specific project.'),
        type: noteType.optional().describe('Limit to a note type.'),
        limit: z.number().int().min(1).max(50).optional().describe('Max results (default 20).'),
      },
    },
    async (args) => {
      const results = hearth.search(args.query, {
        scope: args.scope,
        project: args.project,
        type: args.type,
        limit: args.limit,
      });
      if (results.length === 0) return text(`No memories matched "${args.query}".`);
      return text(results.map((r, i) => block(r.note, i + 1)).join('\n\n'));
    },
  );

  server.registerTool(
    'memory_save',
    {
      title: 'Save to shared memory',
      description:
        'Save a fact, decision, preference, or note to shared memory so any agent can recall it later. Use scope "project" (with a project name) for project-specific context, or "global" for things true everywhere such as user preferences. Keep each note to a single atomic idea.',
      inputSchema: {
        title: z.string().describe('Short, specific title.'),
        content: z.string().describe('The note body in markdown — one atomic fact or idea.'),
        type: noteType.optional().describe('Defaults to "fact".'),
        scope: scopeEnum.optional().describe('Defaults to "global".'),
        project: z.string().optional().describe('Required when scope is "project".'),
        tags: z.array(z.string()).optional(),
        source: z.string().optional().describe('Identifier of the saving agent, e.g. "claude-code".'),
        confidence: confidenceEnum.optional(),
        id: z.string().optional().describe('Provide to update an existing note in place.'),
      },
    },
    async (args) => {
      const note = hearth.save({
        title: args.title,
        content: args.content,
        type: args.type,
        scope: args.scope,
        project: args.project ?? null,
        tags: args.tags,
        source: args.source ?? 'mcp',
        confidence: args.confidence,
        id: args.id,
      });
      return text(`Saved "${note.title}" [${meta(note)}] (id: ${note.id}).`);
    },
  );

  server.registerTool(
    'memory_get',
    {
      title: 'Get a memory',
      description: 'Fetch a single memory in full by its id (ULID) or exact title.',
      inputSchema: {
        id_or_title: z.string().describe('The note id (ULID) or its exact title.'),
      },
    },
    async (args) => {
      const note = hearth.get(args.id_or_title);
      if (!note) return text(`No memory found for "${args.id_or_title}".`);
      return text(`${block(note)}\n\n(created ${note.created}, updated ${note.updated}, source ${note.source})`);
    },
  );

  server.registerTool(
    'memory_list',
    {
      title: 'List recent memories',
      description: 'List recent memories, optionally filtered by scope, project, or type.',
      inputSchema: {
        scope: scopeEnum.optional(),
        project: z.string().optional(),
        type: noteType.optional(),
        limit: z.number().int().min(1).max(100).optional(),
      },
    },
    async (args) => {
      const notes = hearth.list({
        scope: args.scope,
        project: args.project,
        type: args.type,
        limit: args.limit,
      });
      if (notes.length === 0) return text('No memories yet.');
      return text(notes.map((n) => `- ${n.title}  (${meta(n)})  id:${n.id}`).join('\n'));
    },
  );

  server.registerTool(
    'memory_context',
    {
      title: 'Load project context',
      description:
        'Get a "catch me up" digest of shared memory: the user\'s global preferences and decisions, plus everything known about a given project. Call this once at the start of a session to load relevant context.',
      inputSchema: {
        project: z.string().optional().describe('Project to include context for.'),
      },
    },
    async (args) => {
      const sections: string[] = [];
      const prefs = hearth.list({ scope: 'global', type: 'preference', limit: 25 });
      if (prefs.length) {
        sections.push('## Preferences (how the user likes to work)\n' + prefs.map(bullet).join('\n'));
      }
      const decisions = hearth.list({ scope: 'global', type: 'decision', limit: 25 });
      if (decisions.length) {
        sections.push('## Global decisions\n' + decisions.map(bullet).join('\n'));
      }
      if (args.project) {
        const projectNotes = hearth.list({ scope: 'project', project: args.project, limit: 80 });
        sections.push(
          `## Project: ${args.project}\n` +
            (projectNotes.length ? projectNotes.map(bullet).join('\n') : '(no memories yet)'),
        );
      }
      if (sections.length === 0) {
        return text('Shared memory is empty. Use memory_save to start capturing context.');
      }
      return text(sections.join('\n\n'));
    },
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stdout is reserved for the MCP protocol — all logging goes to stderr.
  console.error(`[hearth-mcp] ready · vault: ${hearth.vault}`);
}

main().catch((err: unknown) => {
  console.error(`[hearth-mcp] fatal: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
