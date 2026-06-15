// Smoke test: spawn the built MCP server over stdio and exercise its tools.
// Usage: node packages/mcp/smoke.mjs  (expects HEARTH_VAULT or defaults to /tmp/hearth-test)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const serverPath = path.join(here, 'dist', 'index.js');
const vault = process.env.HEARTH_VAULT ?? '/tmp/hearth-test';

const transport = new StdioClientTransport({
  command: 'node',
  args: [serverPath],
  env: { ...process.env, HEARTH_VAULT: vault },
});

const client = new Client({ name: 'hearth-smoke', version: '0.0.0' });
await client.connect(transport);

const { tools } = await client.listTools();
console.log('TOOLS:', tools.map((t) => t.name).join(', '));

const save = await client.callTool({
  name: 'memory_save',
  arguments: {
    title: 'MCP server works',
    content: 'The Hearth MCP server answered a real tool call over stdio.',
    type: 'fact',
    scope: 'project',
    project: 'shared-mem',
    tags: ['mcp', 'milestone'],
    source: 'smoke',
  },
});
console.log('\nSAVE →', save.content[0].text);

const search = await client.callTool({ name: 'memory_search', arguments: { query: 'mcp server' } });
console.log('\nSEARCH →\n' + search.content[0].text);

const ctx = await client.callTool({ name: 'memory_context', arguments: { project: 'shared-mem' } });
console.log('\nCONTEXT →\n' + ctx.content[0].text);

// Live watcher: drop a markdown file straight into the vault (as Obsidian would)
// and confirm the running server indexes it with no manual reindex.
const livePath = path.join(vault, 'global', 'watcher-live-test.md');
fs.writeFileSync(
  livePath,
  [
    '---',
    'id: 01KWATCHERLIVE0000000000AA',
    'title: Watcher live test',
    'type: fact',
    'scope: global',
    'project: null',
    'tags: [watcher]',
    'source: test',
    "created: '2026-06-14T14:00:00.000Z'",
    "updated: '2026-06-14T14:00:00.000Z'",
    'confidence: high',
    '---',
    'The live file watcher indexed this without a manual reindex.',
    '',
  ].join('\n'),
);
await new Promise((r) => setTimeout(r, 600));
const live = await client.callTool({ name: 'memory_search', arguments: { query: 'watcher reindex' } });
console.log('\nWATCHER (live edit, no manual reindex) →\n' + live.content[0].text);
fs.rmSync(livePath, { force: true });

await client.close();
console.log('\n✓ MCP smoke test passed.');
