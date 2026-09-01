import { appendFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AuditJournal } from '../src/observability/audit-journal.js';
import { AuditRecordBroadcaster, replayAuditRecords } from '../src/observability/audit-stream.js';

const roots: string[] = [];

async function tempRoot(label: string): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), `agent-core-audit-stream-${label}-`));
  roots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('persisted audit replay and live stream', () => {
  it('replays strict sequence across rotated segments and current with category filtering', async () => {
    const root = await tempRoot('replay');
    const journal = new AuditJournal(root, { maxFileBytes: 650, maxRotatedFiles: 20 });
    for (let index = 0; index < 10; index += 1) {
      journal.enqueue({
        category: index % 2 === 0 ? 'memory' : 'tool',
        event: `event.${index}`,
        data: { index, payload: 'x'.repeat(180) },
      });
    }
    await journal.drain();

    const all = await replayAuditRecords(journal.auditRoot, { afterSequence: 2, limit: 20 });
    expect(all.ok).toBe(true);
    if (!all.ok) throw new Error(all.code);
    expect(all.earliestSequence).toBe(1);
    expect(all.latestSequence).toBe(10);
    expect(all.records.map((record) => record.sequence)).toEqual([3, 4, 5, 6, 7, 8, 9, 10]);

    const memoryOnly = await replayAuditRecords(journal.auditRoot, {
      afterSequence: 0,
      limit: 20,
      categories: ['memory'],
    });
    expect(memoryOnly.ok).toBe(true);
    if (!memoryOnly.ok) throw new Error(memoryOnly.code);
    expect(memoryOnly.records.map((record) => record.sequence)).toEqual([1, 3, 5, 7, 9]);
    expect(memoryOnly.records.every((record) => record.category === 'memory')).toBe(true);
  });

  it('returns AUDIT_HISTORY_GAP when requested history predates the retained anchor', async () => {
    const root = await tempRoot('gap');
    const journal = new AuditJournal(root, {
      maxFileBytes: 620,
      maxRotatedFiles: 2,
      retentionMs: 365 * 24 * 60 * 60 * 1000,
    });
    for (let index = 0; index < 14; index += 1) {
      journal.enqueue({ category: 'memory', event: `retained.${index}`, data: { index, payload: 'y'.repeat(220) } });
    }
    await journal.drain();

    const retained = await replayAuditRecords(journal.auditRoot, { afterSequence: 0, limit: 100 });
    expect(retained).toMatchObject({ ok: false, code: 'AUDIT_HISTORY_GAP' });
    if (retained.ok) throw new Error('expected retained history gap');
    expect(retained.earliestSequence).toBeGreaterThan(1);
    expect(retained.latestSequence).toBe(14);

    const resumed = await replayAuditRecords(journal.auditRoot, {
      afterSequence: retained.earliestSequence - 1,
      limit: 100,
    });
    expect(resumed.ok).toBe(true);
    if (!resumed.ok) throw new Error(resumed.code);
    expect(resumed.records[0]?.sequence).toBe(retained.earliestSequence);
    expect(resumed.records.at(-1)?.sequence).toBe(14);
  });

  it('publishes only successfully persisted records to live subscribers in strict sequence', async () => {
    const root = await tempRoot('live');
    const broadcaster = new AuditRecordBroadcaster();
    const journal = new AuditJournal(root, { broadcaster });
    const delivered: number[] = [];
    const subscription = broadcaster.subscribe((record) => { delivered.push(record.sequence); });

    journal.enqueue({ category: 'memory', event: 'one' });
    journal.enqueue({ category: 'memory', event: 'two' });
    journal.enqueue({ category: 'tool', event: 'three' });
    await journal.drain();
    await broadcaster.drain();

    expect(delivered).toEqual([1, 2, 3]);
    subscription.close();
    journal.enqueue({ category: 'memory', event: 'four' });
    await journal.drain();
    await broadcaster.drain();
    expect(delivered).toEqual([1, 2, 3]);
  });

  it('never lets slow or throwing subscribers delay audit persistence or create write failures', async () => {
    const root = await tempRoot('subscriber-isolation');
    const broadcaster = new AuditRecordBroadcaster();
    const journal = new AuditJournal(root, { broadcaster });
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    const received: number[] = [];

    broadcaster.subscribe(async (record) => {
      received.push(record.sequence);
      await blocked;
    });
    broadcaster.subscribe(() => { throw new Error('broken observer'); });

    journal.enqueue({ category: 'memory', event: 'persist.without.observer.wait' });
    await journal.drain();
    expect(journal.status()).toMatchObject({ written: 1, writeErrors: 0, sequence: 1 });

    release();
    await broadcaster.drain();
    expect(received).toEqual([1]);
    expect(journal.status()).toMatchObject({ written: 1, writeErrors: 0 });
  });

  it('retries a transient head mismatch while a persisted record is between append and atomic head update', async () => {
    const root = await tempRoot('concurrent-head');
    let recordAppended!: () => void;
    let releaseHead!: () => void;
    const appended = new Promise<void>((resolve) => { recordAppended = resolve; });
    const holdHead = new Promise<void>((resolve) => { releaseHead = resolve; });
    const journal = new AuditJournal(root, {
      appendLine: async (filePath, line) => {
        await mkdir(path.dirname(filePath), { recursive: true });
        await appendFile(filePath, line, 'utf8');
        recordAppended();
        await holdHead;
      },
    });

    journal.enqueue({ category: 'memory', event: 'concurrent.persist' });
    await appended;
    const replayPromise = replayAuditRecords(journal.auditRoot, { afterSequence: 0, limit: 20 });
    await new Promise((resolve) => setTimeout(resolve, 20));
    releaseHead();

    const replay = await replayPromise;
    expect(replay.ok).toBe(true);
    if (!replay.ok) throw new Error(replay.code);
    expect(replay.records.map((record) => record.event)).toEqual(['concurrent.persist']);
    await journal.drain();
  });
});
