import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Hearth, initVault, isVault, writeAgentsInstructions } from 'hearth-core';

export const SETUP_CLIENTS = ['codex', 'cursor', 'claude-desktop', 'claude-code'] as const;
export type SetupClient = (typeof SETUP_CLIENTS)[number];

export interface SetupOptions {
  vault: string;
  clients: SetupClient[];
  agents: boolean;
  dryRun: boolean;
  cwd: string;
}

export interface SetupAction {
  label: string;
  status: 'ok' | 'changed' | 'present' | 'skipped' | 'would-change' | 'failed';
  detail?: string;
}

type JsonRecord = Record<string, unknown>;

function homePath(...parts: string[]): string {
  return path.join(os.homedir(), ...parts);
}

function configPaths() {
  const claudeDesktop =
    process.platform === 'darwin'
      ? homePath('Library', 'Application Support', 'Claude', 'claude_desktop_config.json')
      : process.platform === 'win32'
        ? path.join(process.env.APPDATA ?? homePath('AppData', 'Roaming'), 'Claude', 'claude_desktop_config.json')
        : homePath('.config', 'Claude', 'claude_desktop_config.json');

  return {
    codex: homePath('.codex', 'config.toml'),
    cursor: homePath('.cursor', 'mcp.json'),
    claudeDesktop,
  };
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readJson(file: string): JsonRecord {
  if (!fs.existsSync(file)) return {};
  const raw = fs.readFileSync(file, 'utf8').trim();
  if (!raw) return {};
  const parsed = JSON.parse(raw) as unknown;
  if (!isRecord(parsed)) {
    throw new Error(`${file} must contain a JSON object.`);
  }
  return parsed;
}

function writeFileIfChanged(file: string, next: string, dryRun: boolean): SetupAction['status'] {
  const exists = fs.existsSync(file);
  const current = exists ? fs.readFileSync(file, 'utf8') : '';
  if (current === next) return 'present';
  if (dryRun) return 'would-change';
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, next);
  return 'changed';
}

function mcpServerConfig(vault: string): JsonRecord {
  return {
    command: 'npx',
    args: ['-y', 'hearth-mcp'],
    env: { HEARTH_VAULT: vault },
  };
}

function installJsonMcp(file: string, vault: string, dryRun: boolean): SetupAction {
  const root = readJson(file);
  const existingServers = isRecord(root.mcpServers) ? root.mcpServers : {};
  const next = {
    ...root,
    mcpServers: {
      ...existingServers,
      hearth: mcpServerConfig(vault),
    },
  };
  const status = writeFileIfChanged(file, `${JSON.stringify(next, null, 2)}\n`, dryRun);
  return { label: file, status };
}

function tomlString(value: string): string {
  return JSON.stringify(value);
}

function codexTomlBlock(vault: string): string {
  return [
    '[mcp_servers.hearth]',
    'command = "npx"',
    'args = ["-y", "hearth-mcp"]',
    `env = { HEARTH_VAULT = ${tomlString(vault)} }`,
  ].join('\n');
}

function upsertTomlTable(content: string, tableName: string, block: string): string {
  const lines = content.length ? content.split(/\r?\n/) : [];
  const tableHeader = `[${tableName}]`;
  const start = lines.findIndex((line) => line.trim() === tableHeader);

  if (start === -1) {
    const prefix = content.trimEnd();
    return `${prefix ? `${prefix}\n\n` : ''}${block}\n`;
  }

  let end = start + 1;
  while (end < lines.length && !/^\s*\[.+\]\s*$/.test(lines[end])) {
    end++;
  }

  const nextLines = [...lines.slice(0, start), ...block.split('\n'), ...lines.slice(end)];
  return `${nextLines.join('\n').trimEnd()}\n`;
}

function installCodex(vault: string, dryRun: boolean): SetupAction {
  const file = configPaths().codex;
  const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const next = upsertTomlTable(current, 'mcp_servers.hearth', codexTomlBlock(vault));
  const status = writeFileIfChanged(file, next, dryRun);
  return { label: file, status };
}

function commandExists(command: string): boolean {
  const bin = process.platform === 'win32' ? 'where' : 'which';
  return spawnSync(bin, [command], { stdio: 'ignore' }).status === 0;
}

function installClaudeCode(vault: string, dryRun: boolean): SetupAction {
  const command = `claude mcp add hearth -s user -e HEARTH_VAULT=${vault} -- npx -y hearth-mcp`;
  if (!commandExists('claude')) {
    return { label: 'Claude Code', status: 'skipped', detail: '`claude` command not found.' };
  }
  if (dryRun) {
    return { label: 'Claude Code', status: 'would-change', detail: command };
  }

  const result = spawnSync(
    'claude',
    ['mcp', 'add', 'hearth', '-s', 'user', '-e', `HEARTH_VAULT=${vault}`, '--', 'npx', '-y', 'hearth-mcp'],
    { encoding: 'utf8' },
  );

  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || 'claude mcp add failed').trim();
    return { label: 'Claude Code', status: 'failed', detail };
  }
  return { label: 'Claude Code', status: 'changed' };
}

function installClient(client: SetupClient, vault: string, dryRun: boolean): SetupAction {
  if (client === 'codex') return installCodex(vault, dryRun);
  if (client === 'cursor') return installJsonMcp(configPaths().cursor, vault, dryRun);
  if (client === 'claude-desktop') return installJsonMcp(configPaths().claudeDesktop, vault, dryRun);
  return installClaudeCode(vault, dryRun);
}

export function parseSetupClients(input: string | undefined): SetupClient[] | null {
  if (!input || input === 'detected') return null;
  const requested = input.split(',').map((part) => part.trim()).filter(Boolean);
  if (requested.includes('all')) return [...SETUP_CLIENTS];

  const invalid = requested.filter((client) => !SETUP_CLIENTS.includes(client as SetupClient));
  if (invalid.length) {
    throw new Error(`invalid client: ${invalid.join(', ')}. Expected one of: ${SETUP_CLIENTS.join(', ')}, all`);
  }
  return [...new Set(requested)] as SetupClient[];
}

export function detectSetupClients(): SetupClient[] {
  const paths = configPaths();
  const clients: SetupClient[] = [];
  if (fs.existsSync(path.dirname(paths.codex)) || fs.existsSync(paths.codex)) clients.push('codex');
  if (fs.existsSync(path.dirname(paths.cursor)) || fs.existsSync(paths.cursor)) clients.push('cursor');
  if (fs.existsSync(path.dirname(paths.claudeDesktop)) || fs.existsSync(paths.claudeDesktop)) {
    clients.push('claude-desktop');
  }
  return clients;
}

export function clientConfigurationStatus(client: SetupClient): 'configured' | 'missing' | 'unknown' {
  const paths = configPaths();
  try {
    if (client === 'codex') {
      const raw = fs.existsSync(paths.codex) ? fs.readFileSync(paths.codex, 'utf8') : '';
      return raw.includes('[mcp_servers.hearth]') && raw.includes('hearth-mcp') ? 'configured' : 'missing';
    }
    if (client === 'cursor' || client === 'claude-desktop') {
      const file = client === 'cursor' ? paths.cursor : paths.claudeDesktop;
      const root = readJson(file);
      return isRecord(root.mcpServers) && isRecord(root.mcpServers.hearth) ? 'configured' : 'missing';
    }
    return commandExists('claude') ? 'unknown' : 'missing';
  } catch {
    return 'missing';
  }
}

function setupVault(vault: string, dryRun: boolean): SetupAction {
  const existed = isVault(vault);
  if (!existed && dryRun) {
    return { label: vault, status: 'would-change', detail: 'create Hearth vault' };
  }
  initVault(vault);
  return { label: vault, status: existed ? 'present' : 'changed' };
}

function setupAgents(cwd: string, dryRun: boolean): SetupAction {
  const file = path.join(path.resolve(cwd), 'AGENTS.md');
  if (dryRun) {
    const status = fs.existsSync(file) && fs.readFileSync(file, 'utf8').includes('<!-- hearth:begin -->')
      ? 'present'
      : 'would-change';
    return { label: file, status };
  }
  const result = writeAgentsInstructions(cwd).result;
  return { label: file, status: result === 'present' ? 'present' : 'changed' };
}

function runSetupCheck(vault: string, dryRun: boolean): SetupAction {
  if (dryRun) {
    return { label: 'save/search setup memory', status: 'would-change' };
  }
  const h = new Hearth(vault);
  try {
    const existing = h.get('Hearth setup check');
    h.save({
      id: existing?.id,
      title: 'Hearth setup check',
      content: 'Hearth setup saved and searched this memory successfully.',
      type: 'fact',
      scope: 'global',
      tags: ['setup'],
      source: 'hearth-setup',
      confidence: 'high',
    });
    const found = h.search('hearth setup check', { limit: 1 }).length > 0;
    return found
      ? { label: 'save/search setup memory', status: 'ok' }
      : { label: 'save/search setup memory', status: 'failed', detail: 'search did not return the setup note' };
  } finally {
    h.close();
  }
}

export function runSetup(options: SetupOptions): SetupAction[] {
  const actions: SetupAction[] = [setupVault(options.vault, options.dryRun)];

  if (options.agents) {
    actions.push(setupAgents(options.cwd, options.dryRun));
  }

  for (const client of options.clients) {
    actions.push({ label: client, status: 'ok', detail: 'configure client' });
    actions.push(installClient(client, options.vault, options.dryRun));
  }

  actions.push(runSetupCheck(options.vault, options.dryRun));
  return actions;
}
