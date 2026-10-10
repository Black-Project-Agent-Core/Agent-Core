import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { writeOwnedFileAtomic } from '../persistence/atomic-file.js';

export interface MemoryTransactionMutation {
  targetPath: string;
  content: string | null;
  expectedFingerprint: string | null;
}
const hash = z.string().regex(/^[a-f0-9]{64}$/).nullable();
const journalSchema = z.strictObject({version:z.literal(2),id:z.uuid(),phase:z.enum(['preparing','prepared','applying','committed']),
  entries:z.array(z.strictObject({targetPath:z.string(),before:hash,after:hash}))});
type TransactionJournal = z.infer<typeof journalSchema>;

export function fingerprintText(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
export function fingerprintBytes(value:Uint8Array):string {
  return createHash('sha256').update(value).digest('hex');
}
export async function fingerprintFile(filePath: string): Promise<string | null> {
  try { return fingerprintBytes(await readFile(filePath)); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
}

/** Reject aliases before reading or writing engine-owned paths. This is not an OS sandbox. */
export async function assertContainedPath(root: string, target: string): Promise<string> {
  const base = path.resolve(root), resolved = path.resolve(target);
  const relative = path.relative(base,resolved);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)
    || (path.sep === '/' && target.includes('\\'))) throw new Error('MEMORY_PATH_ESCAPE');
  let current = path.parse(base).root;
  const components = [...base.slice(current.length).split(path.sep).filter(Boolean),...relative.split(path.sep)];
  for (const part of components) {
    if (part) current = path.join(current,part);
    try {
      const info = await lstat(current);
      if (info.isSymbolicLink()) throw new Error('MEMORY_PATH_SYMLINK');
      if (current !== resolved && !info.isDirectory()) throw new Error('MEMORY_PATH_NOT_DIRECTORY');
      if (current === resolved && !info.isFile() && !info.isDirectory()) throw new Error('MEMORY_PATH_NOT_REGULAR');
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
  return resolved;
}

/** Caller owns the common memory lock for both recovery and commit. */
export class MemoryTransactionCoordinator {
  readonly root: string;
  readonly memoryRoot: string;
  constructor(stateDir: string) {
    this.memoryRoot = path.dirname(path.resolve(stateDir));
    this.root = path.join(stateDir,'transactions');
  }
  async initialize(): Promise<void> { await this.recover(); }

  private async target(target: string): Promise<string> {
    const resolved = await assertContainedPath(this.memoryRoot,target);
    const relative = path.relative(this.memoryRoot,resolved);
    if (relative.startsWith(`state${path.sep}transactions${path.sep}`) || relative === path.join('state','transactions')
      || relative.startsWith('.memory.lock')) throw new Error('MEMORY_PATH_ESCAPE');
    return resolved;
  }
  private artifact(dir: string, index: number, kind: 'stage' | 'backup'): string { return path.join(dir,kind,`${index}.txt`); }

  private async validate(dir: string): Promise<TransactionJournal> {
    await assertContainedPath(this.memoryRoot,dir);
    const journalPath = await assertContainedPath(this.memoryRoot,path.join(dir,'journal.json'));
    const raw = JSON.parse(await readFile(journalPath,'utf8'));
    if (raw?.version !== 2) throw new Error('MEMORY_TRANSACTION_JOURNAL_VERSION_UNSUPPORTED');
    const journal = journalSchema.parse(raw);
    if (journal.id !== path.basename(dir) || (journal.phase === 'preparing' && journal.entries.length)) throw new Error('Invalid transaction identity');
    const seen = new Set<string>();
    for (const [index,entry] of journal.entries.entries()) {
      const target = await this.target(entry.targetPath);
      if (target !== entry.targetPath) throw new Error('Noncanonical journal target');
      const key = process.platform === 'win32' ? entry.targetPath.toLowerCase() : entry.targetPath;
      if (seen.has(key)) throw new Error('Duplicate journal target'); seen.add(key);
      for (const [kind,digest] of [['backup',entry.before],['stage',entry.after]] as const) {
        if (digest === null) continue;
        const artifact = await assertContainedPath(this.memoryRoot,this.artifact(dir,index,kind));
        if (await fingerprintFile(artifact) !== digest) throw new Error('Transaction snapshot checksum mismatch');
      }
    }
    return journal;
  }

  async recover(): Promise<number> {
    await assertContainedPath(this.memoryRoot,this.root);
    await mkdir(this.root,{recursive:true});
    const pending: Array<{dir:string;journal:TransactionJournal}> = [];
    try {
      for (const name of (await readdir(this.root)).sort()) {
        const dir = path.join(this.root,name);
        pending.push({dir,journal:await this.validate(dir)});
      }
      // Validate the entire recovery set before any canonical mutation.
      for (const {dir,journal} of pending) {
        if (journal.phase !== 'committed') await this.rollback(dir,journal);
        else for (const entry of journal.entries) {
          if (await fingerprintFile(entry.targetPath) !== entry.after) throw new Error('Committed target drift');
        }
        await rm(dir,{recursive:true,force:true});
      }
    } catch (error) {
      const detail = error instanceof Error && error.message === 'MEMORY_TRANSACTION_JOURNAL_VERSION_UNSUPPORTED' ? ': MEMORY_TRANSACTION_JOURNAL_VERSION_UNSUPPORTED' : '';
      throw new Error('MEMORY_TRANSACTION_RECOVERY_BLOCKED' + detail, {cause:error});
    }
    return pending.length;
  }

  async commit(mutations: MemoryTransactionMutation[]): Promise<void> {
    if (!mutations.length) return;
    const seen = new Set<string>();
    for (const mutation of mutations) {
      mutation.targetPath = await this.target(mutation.targetPath);
      const key = process.platform === 'win32' ? mutation.targetPath.toLowerCase() : mutation.targetPath;
      if (seen.has(key)) throw new Error('MEMORY_TRANSACTION_DUPLICATE_TARGET'); seen.add(key);
      if (await fingerprintFile(mutation.targetPath) !== mutation.expectedFingerprint) throw new Error('MEMORY_CANONICAL_DRIFT');
    }
    await assertContainedPath(this.memoryRoot,this.root);
    const id = randomUUID(), dir = path.join(this.root,id), journalPath = path.join(dir,'journal.json');
    const journal: TransactionJournal = {version:2,id,phase:'preparing',entries:[]};
    await writeOwnedFileAtomic(journalPath,JSON.stringify(journal));
    try {
      for (const [index,mutation] of mutations.entries()) {
        if (mutation.content !== null) await writeOwnedFileAtomic(this.artifact(dir,index,'stage'),mutation.content);
        if (mutation.expectedFingerprint !== null) {
          const before = await readFile(mutation.targetPath,'utf8');
          if (fingerprintText(before) !== mutation.expectedFingerprint) throw new Error('MEMORY_CANONICAL_DRIFT');
          await writeOwnedFileAtomic(this.artifact(dir,index,'backup'),before);
        }
        journal.entries.push({targetPath:mutation.targetPath,before:mutation.expectedFingerprint,
          after:mutation.content === null ? null : fingerprintText(mutation.content)});
      }
      journal.phase = 'prepared'; await writeOwnedFileAtomic(journalPath,JSON.stringify(journal));
      // CAS again after durable staging. Cooperating writers remain excluded by the caller's lock.
      for (const mutation of mutations) if (await fingerprintFile(mutation.targetPath) !== mutation.expectedFingerprint) throw new Error('MEMORY_CANONICAL_DRIFT');
      journal.phase = 'applying'; await writeOwnedFileAtomic(journalPath,JSON.stringify(journal));
      for (const mutation of mutations) {
        await this.target(mutation.targetPath);
        if (mutation.content === null) await rm(mutation.targetPath,{force:true});
        else await writeOwnedFileAtomic(mutation.targetPath,mutation.content);
      }
      journal.phase = 'committed';
      await writeOwnedFileAtomic(journalPath,JSON.stringify(journal));
    } catch (error) {
      // A failed marker write may still have published. Disk, not the local phase, decides.
      const disk = await this.validate(dir).catch(() => null);
      if (disk?.phase === 'committed') return;
      if (disk?.phase === 'applying') await this.rollback(dir,disk); // failure preserves the journal as a blocker
      if (disk) await rm(dir,{recursive:true,force:true});
      throw error;
    }
    // Canonical commit is authoritative. Cleanup failure never rolls it back or reports a failed write.
    await rm(dir,{recursive:true,force:true}).catch(() => undefined);
  }

  private async rollback(dir: string, journal: TransactionJournal): Promise<void> {
    if (journal.phase !== 'applying') return;
    for (const [index,entry] of [...journal.entries.entries()].reverse()) {
      await this.target(entry.targetPath);
      const actual = await fingerprintFile(entry.targetPath);
      if (actual !== entry.before && actual !== entry.after) throw new Error('Recovery target drift');
      if (entry.before === null) await rm(entry.targetPath,{force:true});
      else await writeOwnedFileAtomic(entry.targetPath,await readFile(this.artifact(dir,index,'backup'),'utf8'));
    }
  }
}
