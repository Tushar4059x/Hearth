import fs from 'node:fs';
import path from 'node:path';

export const AGENTS_FILE = 'AGENTS.md';
const BEGIN = '<!-- hearth:begin -->';
const END = '<!-- hearth:end -->';

/** The proactive-usage instructions Hearth writes into a project's AGENTS.md. */
export const HEARTH_INSTRUCTIONS = `${BEGIN}
## Hearth — shared memory

This project uses [Hearth](https://github.com/Tushar4059x/Hearth) for shared, persistent
memory across AI agents, via the MCP tools \`memory_context\`, \`memory_search\`, \`memory_save\`,
\`memory_get\`, and \`memory_list\`.

- **Start of a task:** call \`memory_context\` (with the relevant project name) to load what's
  already known — decisions, preferences, conventions — before asking the user.
- **Before asking** something that may already be settled: \`memory_search\` first.
- **When a durable decision, preference, convention, or fact is established:** \`memory_save\` it
  so other agents inherit it. Use \`scope: "project"\` (with the project name) for project-specific
  things, or \`scope: "global"\` for things true everywhere. One atomic idea per note.
${END}`;

export type AgentsWriteResult = 'created' | 'appended' | 'present';

/**
 * Write Hearth's usage instructions into `<dir>/AGENTS.md`:
 * creates the file if missing, appends the block if the file exists without it,
 * and is a no-op if the block is already present (idempotent across re-runs).
 */
export function writeAgentsInstructions(dir: string): { result: AgentsWriteResult; file: string } {
  const file = path.join(path.resolve(dir), AGENTS_FILE);
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, `${HEARTH_INSTRUCTIONS}\n`);
    return { result: 'created', file };
  }
  const existing = fs.readFileSync(file, 'utf8');
  if (existing.includes(BEGIN)) {
    return { result: 'present', file };
  }
  const lead = existing.endsWith('\n') ? '\n' : '\n\n';
  fs.appendFileSync(file, `${lead}${HEARTH_INSTRUCTIONS}\n`);
  return { result: 'appended', file };
}
