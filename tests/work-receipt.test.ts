import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

// UP-13 / OFB-25: the work receipt reports counts and says plainly what it does not know.
const script = fileURLToPath(new URL('../scripts/inspect/work-receipt.mjs', import.meta.url));
const { buildReceipt } = await import(script.startsWith('/') ? script : `file:///${script.replaceAll('\\', '/')}`);

const folder = mkdtempSync(path.join(os.tmpdir(), 'work-receipt-'));
afterAll(() => rmSync(folder, { recursive: true, force: true }));

const now = new Date(2026, 9, 28, 12, 0, 0);
const at = (daysAgo: number) => new Date(2026, 9, 28 - daysAgo, 9, 0, 0).toISOString();
const record = (timestamp: string, kind: string, level: string, tool?: string) =>
  JSON.stringify({ id: `${kind}-${timestamp}`, timestamp, module: 'MCP', level, message: kind, kind, ...(tool ? { context: { tool } } : {}) });

const journal = path.join(folder, 'activity.jsonl');
writeFileSync(journal, [
  record(at(0), 'tool-call', 'success', 'read_file'),
  record(at(0), 'tool-call', 'success', 'read_file'),
  record(at(1), 'tool-call', 'error', 'write_file'),
  record(at(1), 'learning-checkpoint', 'info'),
  record(at(2), 'learning-review', 'info'),
  record(at(2), 'memory-tool', 'success'),
  record(at(1), 'handled-tool-failure', 'error'),
  record(at(30), 'tool-call', 'success', 'old_tool'),
  'not json at all',
  JSON.stringify({ kind: 'tool-call', timestamp: 'not a date' }),
  '',
].join('\n'));

describe('work receipt', () => {
  it('counts only the window, separates failures, and reports unreadable lines', async () => {
    const text: string = await buildReceipt({ journal, days: 7, now });
    expect(text).toMatch(/\| Tool calls \| 3 \|/);
    expect(text).toMatch(/\| Tool calls that ended in an error \| 1 \|/);
    expect(text).toMatch(/\| Tool failure events, a separate record stream \(footnote 3\) \| 1 \|/);
    expect(text).toMatch(/\| Learning checkpoints \| 1 \|/);
    expect(text).toMatch(/\| Learning reviews \| 1 \|/);
    expect(text).toMatch(/\| Memory tool calls \| 1 \|/);
    expect(text).toMatch(/\| Active days \(footnote 1\) \| 3 \|/);
    expect(text).toContain('unreadable lines: 2');
    expect(text).toContain('`read_file` (0 failed) | 2');
    expect(text).not.toContain('old_tool');
  });

  it('shows ? instead of 0 when the journal or a repository cannot be read', async () => {
    const missing: string = await buildReceipt({ journal: path.join(folder, 'missing.jsonl'), days: 7, now, repos: [path.join(folder, 'no-such-folder')] });
    expect(missing).toMatch(/\| Tool calls \| \? \|/);
    expect(missing).toMatch(/\| `no-such-folder` \| \? \| \? \(footnote 2\) \|/);
  });

  it('counts commits and distinct files from a real repository', async () => {
    const repo = path.join(folder, 'repo');
    const git = (...args: string[]) => execFileSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@example.invalid', ...args], { stdio: 'ignore' });
    execFileSync('git', ['init', '-q', repo], { stdio: 'ignore' });
    writeFileSync(path.join(repo, 'a.txt'), 'a');
    writeFileSync(path.join(repo, 'b.txt'), 'b');
    git('add', '.');
    git('commit', '-q', '-m', 'one');
    writeFileSync(path.join(repo, 'a.txt'), 'a2');
    git('commit', '-q', '-am', 'two');
    const text: string = await buildReceipt({ journal, days: 7, now: new Date(), repos: [repo] });
    expect(text).toMatch(/\| `repo` \| 2 \| 2 \(footnote 2\) \|/);
  }, 60_000);

  it('never invents money, hours or per-project figures, and says so', async () => {
    const text: string = await buildReceipt({ journal, days: 7, now });
    expect(text).not.toMatch(/\$\s?\d|hours? saved:|\bUSD\b/i);
    expect(text).toContain('Not reported, on purpose');
    expect(text).toContain('not hours worked');
  });

  it('writes a file only under runtime/tmp', () => {
    const refused = spawnSync(process.execPath, [script, '--journal', journal, '--out', path.join(folder, 'receipt.md')], { encoding: 'utf8' });
    expect(refused.status).toBe(1);
    expect(refused.stderr).toContain('runtime/tmp');
  }, 30_000);
});
