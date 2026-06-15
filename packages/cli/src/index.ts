#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
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
  CONFIDENCE_LEVELS,
  type NoteType,
  type Scope,
  type Confidence,
} from 'hearth-core';
import {
  SETUP_CLIENTS,
  clientConfigurationStatus,
  detectSetupClients,
  parseSetupClients,
  runSetup,
  type SetupAction,
  type SetupClient,
} from './setup.js';

const program = new Command();

program
  .name('hearth')
  .description('Hearth — local-first shared memory for AI agents (and your second brain)')
  .version('0.1.2')
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

function parseChoice<const T extends readonly string[]>(
  name: string,
  value: string | undefined,
  choices: T,
  fallback: T[number],
): T[number] {
  const actual = value ?? fallback;
  if (choices.includes(actual as T[number])) return actual as T[number];
  throw new Error(`invalid ${name}: ${actual}. Expected one of: ${choices.join(', ')}`);
}

function parseLimit(value: string | undefined, fallback: number): number {
  const n = Number(value ?? fallback);
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(`invalid limit: ${value}. Expected a positive integer.`);
  }
  return n;
}

function setupVaultPath(dir: string): string {
  return path.resolve(vaultOption() ?? dir);
}

function printActions(actions: SetupAction[]): void {
  for (const action of actions) {
    const detail = action.detail ? ` (${action.detail})` : '';
    console.log(`  ${action.status.padEnd(12)} ${action.label}${detail}`);
  }
}

async function confirmSetup(yes: boolean): Promise<boolean> {
  if (yes || !process.stdin.isTTY) return true;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question('Continue? [y/N] ');
    return /^(y|yes)$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}

function selectedSetupClients(clientOpt: string | undefined, all: boolean): SetupClient[] {
  if (all) return [...SETUP_CLIENTS];
  return parseSetupClients(clientOpt) ?? detectSetupClients();
}

program
  .command('setup')
  .description('Set up a Hearth vault, MCP client config, AGENTS.md, and a smoke check')
  .argument('[dir]', 'directory for the vault', defaultVaultPath())
  .option('--client <list>', `client(s): ${SETUP_CLIENTS.join(', ')}; comma-separated; use "all" for every supported client`)
  .option('--all', 'configure every supported client')
  .option('--dry-run', 'show what would change without writing files')
  .option('-y, --yes', 'skip confirmation')
  .option('--no-agents', 'skip writing Hearth usage instructions to ./AGENTS.md')
  .action(
    async (
      dir: string,
      o: { client?: string; all?: boolean; dryRun?: boolean; yes?: boolean; agents?: boolean },
    ) => {
      const vault = setupVaultPath(dir);
      const clients = selectedSetupClients(o.client, o.all === true);
      const options = {
        vault,
        clients,
        agents: o.agents !== false,
        dryRun: o.dryRun === true,
        cwd: process.cwd(),
      };

      console.log(`Hearth setup`);
      console.log(`vault: ${vault}`);
      console.log(`clients: ${clients.length ? clients.join(', ') : 'none detected'}`);
      console.log('');

      const preview = runSetup({ ...options, dryRun: true });
      console.log(o.dryRun ? 'Dry run:' : 'Plan:');
      printActions(preview);

      if (o.dryRun) return;
      if (!(await confirmSetup(o.yes === true))) {
        console.log('setup cancelled.');
        return;
      }

      console.log('');
      console.log('Applying:');
      const actions = runSetup(options);
      printActions(actions);

      if (clients.length === 0) {
        console.log('');
        console.log(`No installed clients were detected. Run one of these when ready:`);
        console.log(`  hearth setup --client codex`);
        console.log(`  hearth setup --client cursor`);
        console.log(`  hearth setup --client claude-desktop`);
      } else {
        console.log('');
        console.log('Restart your MCP client, then ask it what it remembers from Hearth.');
      }
    },
  );

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
        type: parseChoice('type', o.type, NOTE_TYPES, 'fact') as NoteType,
        scope: parseChoice('scope', o.scope, SCOPES, 'global') as Scope,
        project: o.project ?? null,
        tags: splitTags(o.tags),
        source: o.source,
        confidence: parseChoice('confidence', o.confidence, CONFIDENCE_LEVELS, 'medium') as Confidence,
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
        scope: o.scope ? (parseChoice('scope', o.scope, SCOPES, 'global') as Scope) : undefined,
        project: o.project,
        type: o.type ? (parseChoice('type', o.type, NOTE_TYPES, 'fact') as NoteType) : undefined,
        limit: parseLimit(o.limit, 20),
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
        scope: o.scope ? (parseChoice('scope', o.scope, SCOPES, 'global') as Scope) : undefined,
        project: o.project,
        type: o.type ? (parseChoice('type', o.type, NOTE_TYPES, 'fact') as NoteType) : undefined,
        limit: parseLimit(o.limit, 50),
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
  .option('--fix', 'repair index drift, AGENTS.md, and detected MCP client config')
  .action((o: { fix?: boolean }) => {
    let h: Hearth;
    try {
      h = openVault();
    } catch (err) {
      if (!o.fix) throw err;
      const vault = initVault(path.resolve(vaultOption() ?? defaultVaultPath()));
      h = new Hearth(vault);
    }

    let vault = h.vault;
    try {
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
        if (o.fix) {
          const n = h.reindex();
          console.log(`fixed index drift: reindexed ${n} note(s).`);
        } else {
          console.log('index drift: run `hearth reindex` or `hearth doctor --fix`');
        }
      } else {
        console.log('index in sync');
      }

      console.log('');
      console.log('client config:');
      for (const client of SETUP_CLIENTS) {
        console.log(`  ${client}: ${clientConfigurationStatus(client)}`);
      }
    } finally {
      vault = h.vault;
      h.close();
    }

    if (o.fix) {
      const clients = detectSetupClients();
      const actions = runSetup({
        vault,
        clients,
        agents: true,
        dryRun: false,
        cwd: process.cwd(),
      });
      console.log('');
      console.log('fixes:');
      printActions(actions);
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
