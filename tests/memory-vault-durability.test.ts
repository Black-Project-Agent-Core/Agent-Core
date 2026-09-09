import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { atomicReplaceValidated, writeImmutableRevision } from '../src/memory/file-native/atomic-writer.js';
import { VaultTransactionJournal, recoverPendingVaultTransactions } from '../src/memory/file-native/transaction-journal.js';
import { resolveFileNativeMemoryPaths } from '../src/memory/file-native/paths.js';

const validator = (text: string) => { if (!text.includes('valid')) throw new Error('invalid'); };

describe('file-native vault durability', () => {
  it('validates before atomically promoting a canonical file', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'ac-atomic-'));
    const file = path.join(root, 'memory.md');
    await writeFile(file, 'old valid');
    await expect(atomicReplaceValidated(file, 'new invalid-content', (t) => { if (t.includes('invalid')) throw new Error('reject'); }))
      .rejects.toThrow('reject');
    expect(await readFile(file, 'utf8')).toBe('old valid');
    const result = await atomicReplaceValidated(file, 'new valid', validator);
    expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(await readFile(file, 'utf8')).toBe('new valid');
  });

  it('recovers an interrupted two-file continuation to the complete new state', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'ac-journal-'));
    const paths = resolveFileNativeMemoryPaths(root);
    await mkdir(paths.vaultRoot, { recursive: true });
    const a = path.join(paths.vaultRoot, 'A.md');
    const b = path.join(paths.vaultRoot, 'B.md');
    await writeFile(a, 'A old valid');
    const journal = new VaultTransactionJournal(paths.transactionRoot);
    await journal.begin([
      { path: a, beforeContent: 'A old valid', afterContent: 'A next=B valid' },
      { path: b, afterContent: 'B previous=A valid' },
    ]);
    // Simulate crash after B reached canonical storage but before A was promoted.
    await writeFile(b, 'B previous=A valid');
    await recoverPendingVaultTransactions(paths, validator);
    expect(await readFile(a, 'utf8')).toBe('A next=B valid');
    expect(await readFile(b, 'utf8')).toBe('B previous=A valid');
  });

  it('writes prior revisions once and never overwrites immutable history', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'ac-history-'));
    const historyRoot = path.join(root, '.agent-core', 'history');
    const target = await writeImmutableRevision(historyRoot, 'mem_a', 1, 'rev_a', 'prior valid');
    expect(await readFile(target, 'utf8')).toBe('prior valid');
    await expect(writeImmutableRevision(historyRoot, 'mem_a', 1, 'rev_a', 'changed valid')).rejects.toThrow('MEMORY_HISTORY_ALREADY_EXISTS');
  });
});
