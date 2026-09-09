import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { atomicReplaceValidated, sha256Text, type ContentValidator } from './atomic-writer.js';
import type { FileNativeMemoryPaths } from './paths.js';

export interface VaultTransactionMutation {
  path: string;
  beforeContent?: string;
  afterContent: string;
}
interface PersistedMutation extends VaultTransactionMutation {
  beforeHash?: string;
  afterHash: string;
}
interface PersistedJournal {
  schemaVersion: 1;
  transactionId: string;
  state: 'pending';
  createdAt: number;
  mutations: PersistedMutation[];
}

export class VaultTransactionJournal {
  constructor(readonly transactionRoot: string) {}

  async begin(mutations: VaultTransactionMutation[]): Promise<string> {
    if (!mutations.length) throw new Error('MEMORY_TRANSACTION_EMPTY');
    await mkdir(this.transactionRoot, { recursive: true });
    const transactionId = randomUUID();
    const record: PersistedJournal = {
      schemaVersion: 1,
      transactionId,
      state: 'pending',
      createdAt: Date.now(),
      mutations: mutations.map((m) => ({
        path: path.resolve(m.path),
        ...(m.beforeContent === undefined ? {} : { beforeContent: m.beforeContent, beforeHash: sha256Text(m.beforeContent) }),
        afterContent: m.afterContent,
        afterHash: sha256Text(m.afterContent),
      })),
    };
    const target = path.join(this.transactionRoot, `${transactionId}.json`);
    await atomicReplaceValidated(target, JSON.stringify(record, null, 2) + '\n', (content) => {
      const parsed = JSON.parse(content) as PersistedJournal;
      if (parsed.schemaVersion !== 1 || parsed.transactionId !== transactionId || parsed.state !== 'pending') throw new Error('MEMORY_TRANSACTION_INVALID');
    });
    return target;
  }
}

async function currentText(file: string): Promise<string | undefined> {
  try { return await readFile(file, 'utf8'); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

export async function recoverPendingVaultTransactions(
  paths: FileNativeMemoryPaths,
  validator: ContentValidator,
): Promise<{ recovered: number }> {
  await mkdir(paths.transactionRoot, { recursive: true });
  const names = (await readdir(paths.transactionRoot)).filter((name) => name.endsWith('.json')).sort();
  let recovered = 0;
  for (const name of names) {
    const journalPath = path.join(paths.transactionRoot, name);
    const record = JSON.parse(await readFile(journalPath, 'utf8')) as PersistedJournal;
    if (record.schemaVersion !== 1 || record.state !== 'pending' || !Array.isArray(record.mutations)) throw new Error('MEMORY_TRANSACTION_INVALID');
    for (const mutation of record.mutations) {
      const relative = path.relative(paths.projectRoot, mutation.path);
      if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('MEMORY_TRANSACTION_PATH_ESCAPE');
      const current = await currentText(mutation.path);
      const currentHash = current === undefined ? undefined : sha256Text(current);
      if (currentHash === mutation.afterHash) continue;
      if (currentHash !== mutation.beforeHash && !(current === undefined && mutation.beforeContent === undefined)) {
        throw new Error('MEMORY_TRANSACTION_DIVERGED');
      }
      await atomicReplaceValidated(mutation.path, mutation.afterContent, validator);
    }
    await rm(journalPath, { force: true });
    recovered += 1;
  }
  return { recovered };
}
