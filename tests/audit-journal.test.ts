import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AuditJournal, computeAuditRecordHash } from '../src/observability/audit-journal.js';
import { createRequestCorrelation, runWithCorrelation, withCorrelation } from '../src/observability/correlation.js';

const roots: string[] = [];

async function tempRoot() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'agent-core-audit-journal-'));
  roots.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('asynchronous bounded audit journal', () => {
  it('enqueues without waiting for delayed file I/O and drain waits for persistence', async () => {
    const root = await tempRoot();
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    let writes = 0;
    let markStarted!: () => void;
    const started = new Promise<void>((resolve) => { markStarted = resolve; });
    const journal = new AuditJournal(root, {
      appendLine: async () => { writes += 1; markStarted(); await blocked; },
    });

    expect(journal.enqueue({ category: 'http', event: 'request.completed', data: { status: 200 } })).toBe(true);
    await started;
    expect(writes).toBe(1);
    expect(journal.status().written).toBe(0);
    const draining = journal.drain();
    let drained = false;
    void draining.then(() => { drained = true; });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(drained).toBe(false);
    release();
    await draining;
    expect(journal.status()).toMatchObject({ written: 1, queueDepth: 0, writeErrors: 0 });
  });

  it('bounds outstanding work and records dropped events instead of growing without limit', async () => {
    const root = await tempRoot();
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    const journal = new AuditJournal(root, { queueCapacity: 2, appendLine: async () => blocked });
    expect(journal.enqueue({ category: 'test', event: 'one' })).toBe(true);
    expect(journal.enqueue({ category: 'test', event: 'two' })).toBe(true);
    expect(journal.enqueue({ category: 'test', event: 'three' })).toBe(false);
    expect(journal.status()).toMatchObject({ queueCapacity: 2, dropped: 1 });
    release();
    await journal.drain();
    expect(journal.status()).toMatchObject({ written: 2, dropped: 1 });
  });

  it('writes a deterministic sequence-linked SHA-256 chain', async () => {
    const root = await tempRoot();
    const journal = new AuditJournal(root, { now: () => Date.parse('2026-08-31T08:00:00.000Z') });
    journal.enqueue({ category: 'http', event: 'request.completed', data: { status: 200 } });
    journal.enqueue({ category: 'routing', event: 'route.created', data: { routeContextId: 'route-1' } });
    await journal.drain();

    const records = (await readFile(journal.filePath, 'utf8')).trim().split('\n').map((line) => JSON.parse(line));
    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({ schemaVersion: 1, sequence: 1, previousHash: null });
    expect(records[1]).toMatchObject({ schemaVersion: 1, sequence: 2, previousHash: records[0].hash });
    for (const record of records) {
      expect(record.hash).toMatch(/^[a-f0-9]{64}$/);
      expect(computeAuditRecordHash(record)).toBe(record.hash);
    }
    expect(journal.status().headHash).toBe(records[1].hash);
    expect(createHash('sha256').update('not-the-record').digest('hex')).not.toBe(records[1].hash);
  });

  it('enriches records from active correlation without requiring callers to pass identifiers manually', async () => {
    const root = await tempRoot();
    const journal = new AuditJournal(root);
    const request = createRequestCorrelation({});
    await runWithCorrelation(request, async () => withCorrelation({ routeContextId: 'route-a', toolName: 'execution_create' }, async () => {
      journal.enqueue({ category: 'tool', event: 'tool.completed', data: { status: 'ok' } });
      await journal.drain();
    }));
    const record = JSON.parse((await readFile(journal.filePath, 'utf8')).trim());
    expect(record).toMatchObject({
      requestId: request.requestId,
      trace_id: request.traceId,
      trace_flags: request.traceFlags,
      routeContextId: 'route-a',
      toolName: 'execution_create',
    });
  });

  it('recursively bounds/redacts credential-shaped values and never writes authorization/cookie secrets', async () => {
    const root = await tempRoot();
    const journal = new AuditJournal(root);
    const rawBearer = 'Bearer abcdefghijklmnopqrstuvwxyz123456';
    const rawApiKey = 'agent_core_live_super_secret_material';
    const rawCookie = 'session=private-cookie-value';
    journal.enqueue({
      category: 'security',
      event: 'fixture',
      data: {
        authorization: rawBearer,
        cookie: rawCookie,
        apiKey: rawApiKey,
        nested: {
          message: `Authorization: ${rawBearer}`,
          password: 'hunter2',
          normal: 'safe-value',
        },
        huge: 'x'.repeat(10_000),
      },
    });
    await journal.drain();
    const text = await readFile(journal.filePath, 'utf8');
    expect(text).not.toContain(rawBearer);
    expect(text).not.toContain(rawApiKey);
    expect(text).not.toContain(rawCookie);
    expect(text).not.toContain('hunter2');
    expect(text).toContain('safe-value');
    const record = JSON.parse(text.trim());
    expect(record.data.authorization).toBe('[REDACTED]');
    expect(record.data.cookie).toBe('[REDACTED]');
    expect(record.data.apiKey).toBe('[REDACTED]');
    expect(record.data.huge.length).toBeLessThanOrEqual(2001);
  });
});
