import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AuditJournal, verifyAuditJournal } from '../src/observability/audit-journal.js';

const roots: string[] = [];
async function tempRoot() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'agent-core-audit-rotation-'));
  roots.push(dir);
  return dir;
}
afterEach(async () => {
  await Promise.all(roots.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function journalFiles(root: string) {
  return (await readdir(root)).filter((name) => name.endsWith('.jsonl')).sort();
}

describe('audit rotation, retention anchor, and verifier', () => {
  it('rotates only between whole records and verifies one chain across immutable segments + current', async () => {
    const root = await tempRoot();
    let now = Date.parse('2026-08-31T08:00:00.000Z');
    const journal = new AuditJournal(root, {
      maxFileBytes: 700,
      maxRotatedFiles: 20,
      retentionMs: 30 * 24 * 60 * 60 * 1000,
      now: () => now,
    });
    for (let i = 0; i < 10; i += 1) {
      journal.enqueue({ category: 'fixture', event: 'record', data: { index: i, payload: 'x'.repeat(220) } });
      now += 1_000;
    }
    await journal.drain();
    const files = await journalFiles(journal.auditRoot);
    expect(files.filter((name) => name.startsWith('audit.') && name !== 'audit.current.jsonl').length).toBeGreaterThan(1);
    expect(files).toContain('audit.current.jsonl');
    const verified = await verifyAuditJournal(journal.auditRoot);
    expect(verified).toMatchObject({ ok: true, firstSequence: 1, lastSequence: 10, records: 10 });
    expect((verified as any).headHash).toMatch(/^[a-f0-9]{64}$/);
    expect(journal.status().rotatedFiles).toBeGreaterThan(1);
  });

  it('advances a retention anchor before pruning old whole segments and keeps the retained suffix verifiable', async () => {
    const root = await tempRoot();
    let now = Date.parse('2026-08-01T00:00:00.000Z');
    const journal = new AuditJournal(root, {
      maxFileBytes: 620,
      maxRotatedFiles: 2,
      retentionMs: 365 * 24 * 60 * 60 * 1000,
      now: () => now,
    });
    for (let i = 0; i < 14; i += 1) {
      journal.enqueue({ category: 'fixture', event: 'retained', data: { index: i, payload: 'y'.repeat(220) } });
      now += 1_000;
    }
    await journal.drain();
    const anchor = JSON.parse(await readFile(path.join(journal.auditRoot, 'audit-anchor.json'), 'utf8'));
    expect(anchor.sequence).toBeGreaterThan(0);
    expect(anchor.hash).toMatch(/^[a-f0-9]{64}$/);
    const files = await journalFiles(journal.auditRoot);
    expect(files.filter((name) => /^audit\.\d+-\d+\./.test(name))).toHaveLength(2);
    const verified = await verifyAuditJournal(journal.auditRoot);
    expect(verified.ok).toBe(true);
    if (verified.ok) {
      expect(verified.anchorSequence).toBe(anchor.sequence);
      expect(verified.firstSequence).toBe(anchor.sequence + 1);
      expect(verified.lastSequence).toBe(14);
      expect(verified.records).toBe(14 - anchor.sequence);
    }
  });

  it('detects a mutated retained record by its SHA-256 hash', async () => {
    const root = await tempRoot();
    const journal = new AuditJournal(root);
    journal.enqueue({ category: 'fixture', event: 'tamper', data: { status: 'ok' } });
    await journal.drain();
    const original = await readFile(journal.filePath, 'utf8');
    await writeFile(journal.filePath, original.replace('"status":"ok"', '"status":"tampered"'), 'utf8');
    expect(await verifyAuditJournal(journal.auditRoot)).toMatchObject({ ok: false, code: 'AUDIT_RECORD_HASH_MISMATCH' });
  });

  it('detects a deleted middle record from strict sequence continuity', async () => {
    const root = await tempRoot();
    const journal = new AuditJournal(root, { maxFileBytes: 10_000_000 });
    for (let i = 0; i < 4; i += 1) journal.enqueue({ category: 'fixture', event: 'gap', data: { index: i } });
    await journal.drain();
    const lines = (await readFile(journal.filePath, 'utf8')).trim().split('\n');
    lines.splice(1, 1);
    await writeFile(journal.filePath, `${lines.join('\n')}\n`, 'utf8');
    expect(await verifyAuditJournal(journal.auditRoot)).toMatchObject({ ok: false, code: 'AUDIT_SEQUENCE_GAP' });
  });
});
