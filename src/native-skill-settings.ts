import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const SETTINGS_FILE_NAME = 'native-skill-settings.json';
const SETTINGS_VERSION = 1;
const NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/;

/**
 * Skills the owner switched off for Native (default: every Skill is on). A small synchronous file read on purpose:
 * the hard block must hold on the very first tool call after a restart, so no async warm-up may be required.
 * The file is re-read only when its mtime or size changes, so a toggle made in the UI applies to the next call.
 */
export class NativeSkillSettings {
  private readonly filePath: string;
  private cache?: { mtimeMs: number; size: number; disabled: Set<string> };

  constructor(dataDir: string) {
    this.filePath = path.join(dataDir, SETTINGS_FILE_NAME);
  }

  /** A missing or unreadable file means nothing is switched off; it is not overwritten until the next setEnabled. */
  private load(): Set<string> {
    try {
      const stat = statSync(this.filePath);
      if (this.cache && this.cache.mtimeMs === stat.mtimeMs && this.cache.size === stat.size) return this.cache.disabled;
      const parsed = JSON.parse(readFileSync(this.filePath, 'utf8')) as { version?: unknown; disabled?: unknown };
      if (!parsed || parsed.version !== SETTINGS_VERSION || !Array.isArray(parsed.disabled)) throw new Error('invalid format');
      const disabled = new Set(parsed.disabled.filter((name): name is string => typeof name === 'string' && NAME_PATTERN.test(name)));
      this.cache = { mtimeMs: stat.mtimeMs, size: stat.size, disabled };
      return disabled;
    } catch {
      this.cache = undefined;
      return new Set();
    }
  }

  isDisabled(name: string): boolean {
    return this.load().has(name);
  }

  listDisabled(): string[] {
    return [...this.load()].sort();
  }

  setEnabled(name: string, enabled: boolean): void {
    if (!NAME_PATTERN.test(name)) throw new Error('INVALID_SKILL_NAME');
    const disabled = new Set(this.load());
    if (enabled) disabled.delete(name);
    else disabled.add(name);
    mkdirSync(path.dirname(this.filePath), { recursive: true });
    const tmpPath = `${this.filePath}.tmp.${process.pid}.${Date.now()}`;
    writeFileSync(tmpPath, JSON.stringify({ version: SETTINGS_VERSION, disabled: [...disabled].sort(), updatedAtMs: Date.now() }), 'utf8');
    renameSync(tmpPath, this.filePath);
    this.cache = undefined;
  }
}

export function skillDisabledMessage(name: string): string {
  return 'SKILL_DISABLED_BY_USER: Skill "' + name + '" is switched off by the user for Native. It is hard-blocked: do not read, inspect or apply it. If it is needed for this task, tell the user in your reply which Skill you need and why, and ask them to switch it on in the Skill panel. Without an explicit yes your request is declined, not forever: you may ask again later with the purpose and reason.';
}
