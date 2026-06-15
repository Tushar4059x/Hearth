#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { Command } from 'commander';
import {
  Hearth,
  defaultVaultPath,
  hearthPaths,
  initVault,
  isVault,
  walkNotes,
  writeAgentsInstructions,
  NOTE_TYPES,
  SCOPES,
  type NoteType,
  type Scope,
} from 'hearth-core';

const program = new Command();

program
  .name('hearth')
  .description('Hearth — local-first shared memory for AI agents (and your second brain)')
  .version('0.1.0')
  .option('--vault <path>', 'path to the Hearth vault (else $HEARTH_VAULT or nearest vault)');

function vaultOption(): string | undefined {
  return program.opts<{ vault?: string }>().vault;
}

function openVault(): Hearth {
  return new Hearth(vaultOption());
}

function readStdin(): string | null {
  if (process.stdin.isTTY) return null;
  try {
    const text = readFileSync(0, 'utf8').trim();
    return text.length ? text : null;
  } catch {
    return null;
  }
}

function splitTags(csv?: string): string[] {
  if (!csv) return [];
  return csv
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

program
  .command('init')
  .description('Create a new Hearth vault (also an Obsidian vault)')
  .argument('[dir]', 'directory for the vault', defaultVaultPath())
  .option('--no-agents', 'skip writing Hearth usage instructions to ./AGENTS.md')
  .action((dir: string, o: { agents?: boolean }) => {
    const vault = initVault(dir);
    const p = hearthPaths(vault);
    console.log(`✓ Hearth vault ready at ${vault}`);
    console.log('  • open this folder in Obsidian to browse it as a vault');
    console.log(`  • global notes:  ${p.global}`);
    console.log(`  • project notes: ${p.projects}/<project>`);

    if (o.agents !== false) {
      const { result, file } = writeAgentsInstructions(process.cwd());
      const verb =
        result === 'created' ? 'wrote' : result === 'appended' ? 'appended instructions to' : 'already in';
      console.log(`\n✓ agent instructions ${verb} ${file}`);
      console.log('  → so agents proactively use this memory. Run `hearth rules` in other projects too.');
    }

    console.log(`\nTry:  hearth --vault ${vault} save "My first note" -c "hello, brain"`);
  });

program
  .command('save')
  .description('Save a memory note (body via -c/--content or piped stdin)')
  .argument('<title>', 'note title')
  .option('-c, --content <text>', 'note body')
  .option('-t, --type <type>', `type: ${NOTE_TYPES.join(' | ')}`, 'fact')
  .option('-s, --scope <scope>', `scope: ${SCOPES.join(' | ')}`, 'global')
  .option('-p, --project <name>', 'project name (required when scope=project)')
  .option('--tags <csv>', 'comma-separated tags')
  .option('--source <name>', 'who created this note', 'cli')
  .option('--confidence <level>', 'low | medium | high', 'medium')
  .action((title: string, o: Record<string, string | undefined>) => {
    const content = o.content ?? readStdin();
    if (!content) {
      throw new Error('provide a body with --content "..." or pipe it via stdin');
    }
    const h = openVault();
    try {
      const note = h.save({
        title,
        content,
        type: o.type as NoteType,
        scope: o.scope as Scope,
        project: o.project ?? null,
        tags: splitTags(o.tags),
        source: o.source,
        confidence: o.confidence as 'low' | 'medium' | 'high' | undefined,
      });
      console.log(`✓ saved  [${note.type}/${note.scope}${note.project ? '/' + note.project : ''}]  ${note.title}`);
      console.log(`  file: ${note.path}`);
      console.log(`  id:   ${note.id}`);
    } finally {
      h.close();
    }
  });

program
  .command('search')
  .description('Search memory (keyword / FTS5)')
  .argument('<query...>', 'search terms')
  .option('-s, --scope <scope>', 'filter by scope')
  .option('-p, --project <name>', 'filter by project')
  .option('-t, --type <type>', 'filter by type')
  .option('-l, --limit <n>', 'max results', '20')
  .action((query: string[], o: Record<string, string | undefined>) => {
    const h = openVault();
    try {
      const results = h.search(query.join(' '), {
        scope: o.scope as Scope | undefined,
        project: o.project,
        type: o.type as NoteType | undefined,
        limit: Number(o.limit ?? 20),
      });
      if (results.length === 0) {
        console.log('no matches.');
        return;
      }
      for (const r of results) {
        const n = r.note;
        console.log(`\n● ${n.title}  [${n.type}/${n.scope}${n.project ? '/' + n.project : ''}]`);
        if (r.snippet) console.log(`  ${r.snippet.replace(/\s+/g, ' ').trim()}`);
        console.log(`  ${n.path}`);
      }
      console.log(`\n${results.length} result(s).`);
    } finally {
      h.close();
    }
  });

program
  .command('list')
  .description('List recent notes')
  .option('-s, --scope <scope>', 'filter by scope')
  .option('-p, --project <name>', 'filter by project')
  .option('-t, --type <type>', 'filter by type')
  .option('-l, --limit <n>', 'max results', '50')
  .action((o: Record<string, string | undefined>) => {
    const h = openVault();
    try {
      const notes = h.list({
        scope: o.scope as Scope | undefined,
        project: o.project,
        type: o.type as NoteType | undefined,
        limit: Number(o.limit ?? 50),
      });
      for (const n of notes) {
        console.log(`${n.updated.slice(0, 10)}  [${n.type}/${n.scope}]  ${n.title}`);
      }
      console.log(`\n${notes.length} note(s).`);
    } finally {
      h.close();
    }
  });

program
  .command('reindex')
  .description('Rebuild the search index from the markdown files')
  .action(() => {
    const h = openVault();
    try {
      const n = h.reindex();
      console.log(`✓ reindexed ${n} note(s).`);
    } finally {
      h.close();
    }
  });

program
  .command('doctor')
  .description('Check vault health')
  .action(() => {
    const h = openVault();
    try {
      const vault = h.vault;
      const p = hearthPaths(vault);
      console.log(`vault:   ${vault}`);
      console.log(`config:  ${isVault(vault) ? 'ok' : 'MISSING'}`);
      console.log(`db:      ${p.db}`);

      let onDisk = 0;
      for (const _note of walkNotes(vault)) onDisk++;
      const indexed = h.count();

      console.log(`notes on disk:  ${onDisk}`);
      console.log(`notes indexed:  ${indexed}`);
      if (onDisk !== indexed) {
        console.log('⚠ index drift — run `hearth reindex`');
      } else {
        console.log('✓ index in sync');
      }
    } finally {
      h.close();
    }
  });

program
  .command('rules')
  .description('Write/append Hearth usage instructions to AGENTS.md (run in a project dir)')
  .argument('[dir]', 'project directory', '.')
  .action((dir: string) => {
    const { result, file } = writeAgentsInstructions(dir);
    const verb =
      result === 'created' ? 'wrote' : result === 'appended' ? 'appended instructions to' : 'already present in';
    console.log(`✓ Hearth instructions ${verb} ${file}`);
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(`error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
