import { createHash, randomUUID } from 'node:crypto';
import { copyFile, mkdir, open, readFile, readdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';

export interface MemoryTransactionMutation {
  targetPath: string;
  content: string | null;
  expectedFingerprint: string | null;
}

interface JournalEntry {
  targetPath: string;
  stagedPath: string | null;
  backupPath: string | null;
  existed: boolean;
}

interface TransactionJournal {
  version: 1;
  id: string;
  phase: 'prepared' | 'applying' | 'committed';
  entries: JournalEntry[];
}

async function exists(filePath: string): Promise<boolean> {
  try { await readFile(filePath); return true; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

export function fingerprintText(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export async function fingerprintFile(filePath: string): Promise<string | null> {
  try { return fingerprintText(await readFile(filePath, 'utf8')); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

async function durableWrite(filePath: string, content: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  const handle = await open(temporary, 'wx', 0o600);
  try {
    await handle.writeFile(content, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temporary, filePath);
}

export class MemoryTransactionCoordinator {
  readonly root: string;

  constructor(stateDir: string) {
    this.root = path.join(stateDir, 'transactions');
  }

  async initialize(): Promise<void> {
    await mkdir(this.root, { recursive: true });
    await this.recover();
  }

  async recover(): Promise<number> {
    await mkdir(this.root, { recursive: true });
    let names: string[] = [];
    try { names = await readdir(this.root); } catch { return 0; }
    let recovered = 0;
    for (const name of names) {
      const dir = path.join(this.root, name);
      const journalPath = path.join(dir, 'journal.json');
      try {
        const journal = JSON.parse(await readFile(journalPath, 'utf8')) as TransactionJournal;
        if (journal.phase !== 'committed') await this.rollback(journal);
        await rm(dir, { recursive: true, force: true });
        recovered += 1;
      } catch {
        // Keep unreadable transaction evidence for manual inspection.
      }
    }
    return recovered;
  }

  async commit(mutations: MemoryTransactionMutation[]): Promise<void> {
    if (!mutations.length) return;
    await mkdir(this.root, { recursive: true });

    const preflight: Array<string | null> = [];
    for (const mutation of mutations) {
      const actual = await fingerprintFile(mutation.targetPath);
      if (actual !== mutation.expectedFingerprint) {
        throw new Error(`MEMORY_CANONICAL_DRIFT: ${mutation.targetPath}`);
      }
      preflight.push(actual);
    }

    const id = randomUUID();
    const dir = path.join(this.root, id);
    const stageDir = path.join(dir, 'stage');
    const backupDir = path.join(dir, 'backup');
    await Promise.all([mkdir(stageDir, { recursive: true }), mkdir(backupDir, { recursive: true })]);

    const entries: JournalEntry[] = [];
    for (let index = 0; index < mutations.length; index += 1) {
      const mutation = mutations[index]!;
      const actual = preflight[index] ?? null;
      const existed = actual !== null;
      const stagedPath = mutation.content === null ? null : path.join(stageDir, `${index}.md`);
      const backupPath = existed ? path.join(backupDir, `${index}.md`) : null;
      if (stagedPath) await durableWrite(stagedPath, mutation.content!);
      if (backupPath) await copyFile(mutation.targetPath, backupPath);
      entries.push({ targetPath: mutation.targetPath, stagedPath, backupPath, existed });
    }

    const journal: TransactionJournal = { version: 1, id, phase: 'prepared', entries };
    const journalPath = path.join(dir, 'journal.json');
    await durableWrite(journalPath, JSON.stringify(journal, null, 2));

    try {
      journal.phase = 'applying';
      await durableWrite(journalPath, JSON.stringify(journal, null, 2));
      for (const entry of entries) {
        if (entry.stagedPath) {
          await mkdir(path.dirname(entry.targetPath), { recursive: true });
          await rename(entry.stagedPath, entry.targetPath);
        } else {
          await rm(entry.targetPath, { force: true });
        }
      }
      journal.phase = 'committed';
      await durableWrite(journalPath, JSON.stringify(journal, null, 2));
      await rm(dir, { recursive: true, force: true });
    } catch (error) {
      await this.rollback(journal).catch(() => undefined);
      throw error;
    }
  }

  private async rollback(journal: TransactionJournal): Promise<void> {
    for (const entry of [...journal.entries].reverse()) {
      if (entry.existed && entry.backupPath && await exists(entry.backupPath)) {
        await copyFile(entry.backupPath, entry.targetPath);
      } else if (!entry.existed) {
        await rm(entry.targetPath, { force: true });
      }
    }
  }
}
