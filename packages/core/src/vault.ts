import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const HEARTH_DIR = '.hearth';
export const CONFIG_FILE = 'config.json';
export const DB_FILE = 'index.db';

export interface VaultConfig {
  version: number;
  createdAt: string;
}

export interface HearthPaths {
  vault: string;
  hearthDir: string;
  config: string;
  db: string;
  global: string;
  projects: string;
  sessions: string;
  memoryIndex: string;
}

/** Resolve all the well-known paths inside a vault. */
export function hearthPaths(vault: string): HearthPaths {
  const root = path.resolve(vault);
  return {
    vault: root,
    hearthDir: path.join(root, HEARTH_DIR),
    config: path.join(root, HEARTH_DIR, CONFIG_FILE),
    db: path.join(root, HEARTH_DIR, DB_FILE),
    global: path.join(root, 'global'),
    projects: path.join(root, 'projects'),
    sessions: path.join(root, 'sessions'),
    memoryIndex: path.join(root, 'MEMORY.md'),
  };
}

/** The default vault location: $HEARTH_VAULT or ~/hearth. */
export function defaultVaultPath(): string {
  return process.env.HEARTH_VAULT
    ? path.resolve(process.env.HEARTH_VAULT)
    : path.join(os.homedir(), 'hearth');
}

export function isVault(dir: string): boolean {
  return fs.existsSync(hearthPaths(dir).config);
}

/** Walk up from `start` looking for an enclosing vault. */
export function findVault(start: string = process.cwd()): string | null {
  let dir = path.resolve(start);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (isVault(dir)) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * Resolve which vault to use, in priority order:
 *   explicit arg > $HEARTH_VAULT > nearest ancestor vault > default (~/hearth)
 */
export function resolveVault(explicit?: string): string {
  if (explicit) {
    const dir = path.resolve(explicit);
    if (!isVault(dir)) {
      throw new Error(`Not a Hearth vault: ${dir}. Run \`hearth init ${explicit}\` first.`);
    }
    return dir;
  }
  if (process.env.HEARTH_VAULT) {
    const dir = path.resolve(process.env.HEARTH_VAULT);
    if (!isVault(dir)) {
      throw new Error(`HEARTH_VAULT is set to ${dir}, but that is not a Hearth vault.`);
    }
    return dir;
  }
  const found = findVault();
  if (found) return found;

  const def = defaultVaultPath();
  if (isVault(def)) return def;

  throw new Error('No Hearth vault found. Run `hearth init` to create one.');
}

/** Create (or repair) a vault directory and return its absolute path. */
export function initVault(dir: string): string {
  const p = hearthPaths(dir);
  fs.mkdirSync(p.hearthDir, { recursive: true });
  fs.mkdirSync(p.global, { recursive: true });
  fs.mkdirSync(p.projects, { recursive: true });
  fs.mkdirSync(p.sessions, { recursive: true });

  if (!fs.existsSync(p.config)) {
    const config: VaultConfig = { version: 1, createdAt: new Date().toISOString() };
    fs.writeFileSync(p.config, JSON.stringify(config, null, 2) + '\n');
  }

  if (!fs.existsSync(p.memoryIndex)) {
    fs.writeFileSync(
      p.memoryIndex,
      '# Hearth\n\nShared memory for AI agents. This folder is also an Obsidian vault.\n',
    );
  }

  // The index is derived from the markdown, so keep it out of version control.
  const gitignore = path.join(p.hearthDir, '.gitignore');
  if (!fs.existsSync(gitignore)) {
    fs.writeFileSync(gitignore, 'index.db\nindex.db-*\n');
  }

  return p.vault;
}
