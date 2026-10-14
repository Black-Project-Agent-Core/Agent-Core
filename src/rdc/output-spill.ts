import { appendFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { resolveModuleProjectRoot } from '../portability/paths.js';
import type { TerminalOutputSpillInfo } from './types.js';

const PROJECT_ROOT = resolveModuleProjectRoot(import.meta.url);
const DEFAULT_ROOT = path.join(PROJECT_ROOT, 'runtime', 'terminal-output');
const MAX_SPILL_BYTES = 256 * 1024 * 1024;
const MAX_SPILL_FILES = 32;
const MAX_SPILL_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export type SpillChunk = { source: 'stdout' | 'stderr'; text: string };

export function pruneTerminalOutputSpills(root = DEFAULT_ROOT): void {
  try {
    mkdirSync(root, { recursive: true });
    const now = Date.now();
    const entries = readdirSync(root)
      .filter((name) => name.endsWith('.jsonl'))
      .map((name) => ({ name, file: path.join(root, name), stat: statSync(path.join(root, name)) }))
      .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
    for (let index = 0; index < entries.length; index += 1) {
      const item = entries[index];
      if (index < MAX_SPILL_FILES && now - item.stat.mtimeMs <= MAX_SPILL_AGE_MS) continue;
      try { unlinkSync(item.file); } catch {}
      try { unlinkSync(`${item.file}.meta.json`); } catch {}
    }
  } catch { /* cleanup is best-effort */ }
}

export class TerminalOutputSpill {
  readonly filePath: string;
  private bytes = 0;
  private sequence = 0;
  private issue: string | undefined;
  private finalized = false;
  private readonly hash = createHash('sha256');

  constructor(readonly pid: number, root = DEFAULT_ROOT) {
    mkdirSync(root, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    this.filePath = path.join(root, `${stamp}-${pid}.jsonl`);
    writeFileSync(this.filePath, '', { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  }

  append(chunks: SpillChunk[]): void {
    if (this.finalized || this.issue) return;
    try {
      for (const chunk of chunks) {
        const line = `${JSON.stringify({ seq: this.sequence++, source: chunk.source, text: chunk.text })}\n`;
        const size = Buffer.byteLength(line, 'utf8');
        if (this.bytes + size > MAX_SPILL_BYTES) {
          this.issue = `spill exceeded ${MAX_SPILL_BYTES} bytes`;
          return;
        }
        appendFileSync(this.filePath, line, { encoding: 'utf8', flush: true });
        this.hash.update(line);
        this.bytes += size;
      }
    } catch (error) {
      this.issue = error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500);
    }
  }

  finalize(): TerminalOutputSpillInfo {
    if (!this.finalized) {
      this.finalized = true;
      const info = this.info();
      try {
        writeFileSync(`${this.filePath}.meta.json`, `${JSON.stringify(info, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
      } catch { /* metadata is advisory */ }
    }
    return this.info();
  }

  info(): TerminalOutputSpillInfo {
    return {
      path: this.filePath,
      bytes: this.bytes,
      complete: this.finalized && !this.issue,
      ...(this.issue ? { issue: this.issue } : {}),
      ...(this.finalized && !this.issue ? { digest: `sha256:${this.hash.copy().digest('hex')}` } : {}),
    };
  }

  static exists(info: TerminalOutputSpillInfo | undefined): boolean {
    return Boolean(info?.path && existsSync(info.path));
  }
}
