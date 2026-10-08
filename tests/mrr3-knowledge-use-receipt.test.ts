import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LearningService } from '../src/learning/service.js';
import { memoryFeedbackContentDigest } from '../src/memory/feedback-target.js';
import { MemoryService } from '../src/memory/service.js';
import { learning } from '../src/mcp/learning-schemas.js';
import { activityTracker } from '../src/tracker/activity-tracker.js';

const roots: string[] = [];
beforeEach(() => {
  vi.spyOn(activityTracker, 'record').mockImplementation(() => ({} as any));
  vi.spyOn(activityTracker, 'recordOutcome').mockImplementation(() => ({} as any));
  vi.spyOn(activityTracker, 'captureFailure').mockImplementation(() => ({} as any));
});
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

async function fixture(prefix = 'agent-core-mrr3-') {
  const project = await mkdtemp(path.join(os.tmpdir(), prefix));
  roots.push(project);
  const memoryRoot = path.join(project, 'memory');
  await mkdir(memoryRoot, { recursive: true });
  await writeFile(path.join(memoryRoot, '00-agent-core-memory.md'), '# Agent Core MRR3 isolated foundation\n', 'utf8');
  const memory = await MemoryService.initialize(project, memoryRoot);
  const learningService = await LearningService.initialize({
    enabled: true, stateDir: path.join(project, 'learning'), reviewInterval: 10, curatorIntervalHours: 168,
  }, memory);
  return { project, memoryRoot, memory, learningService };
}
async function seeded() {
  const env = await fixture();
  const record = await env.memory.remember({
    content: 'Use the verified fixture procedure when the schema matches.',
    category: 'procedure',
    provenance: { workspace: 'agent-core', files: [] },
  });
  const results: any[] = await env.memory.search('verified fixture procedure schema', {
    workspace: 'agent-core', rankingProfile: 'fusion', limit: 3, maxNeighbors: 0,
  });
  const hit = results.find(row => row.record.id === record.id);
  if (!hit) throw new Error('fixture retrieval missing');
  return { ...env, record, hit };
}

function receipt(hit: any, patch: Record<string, unknown> = {}) {
  return {
    useId: 'use-fixture-1',
    retrievalAttemptId: hit.retrievalEvidence.attemptId,
    memoryId: hit.record.id,
    contentDigest: hit.retrievalEvidence.contentDigest,
    workspace: 'agent-core',
    applicability: 'applied',
    result: 'success',
    reasonCode: 'procedure-matched',
    evidenceRefs: ['tool:fixture-action'],
    verificationRef: 'verification:fixture-pass',
    summary: 'Procedure matched the observed fixture.',
    ...patch,
  };
}

describe('MRR3-P1 retrieval identity', () => {
  it('returns attempt/body identity and persists the same digest on exposure', async () => {
    const { memoryRoot, record, hit } = await seeded();
    expect(hit.retrievalEvidence.attemptId).toMatch(/^[a-f0-9]{32}$/);
    expect(hit.retrievalEvidence.contentDigest).toBe(memoryFeedbackContentDigest(record));
    expect(hit.retrievalEvidence.recordFingerprint).toMatch(/^sha256:[a-f0-9]{64}$/);

    const ledger = await readFile(path.join(memoryRoot, 'state', 'retrieval-ledger.jsonl'), 'utf8');
    expect(ledger).toContain(hit.retrievalEvidence.attemptId);
    expect(ledger).toContain(hit.retrievalEvidence.contentDigest);
  });

  it('does not make dropped or deduped exposure eligible for use receipt', async () => {
    const { memory, learningService, hit } = await seeded();
    const raw = await readFile(path.join((memory as any).store.paths.state, 'retrieval-ledger.jsonl'), 'utf8');
    const row = JSON.parse(raw.trim().split('\n').at(-1)!);
    row.exposures[0].disposition = 'dropped';
    row.exposures[0].handoffStatus = 'not-attempted';
    await writeFile(path.join((memory as any).store.paths.state, 'retrieval-ledger.jsonl'), JSON.stringify(row) + '\n');
    await expect((learningService as any).receipt(receipt(hit))).rejects.toThrow(/EXPOSURE_NOT_ELIGIBLE/);
  });
});

describe('MRR3-P2 receipt validation', () => {
  it('accepts a matching receipt, mirrors evidence, and is idempotent', async () => {
    const { learningService, hit } = await seeded();
    const mirror = vi.mocked(activityTracker.recordOutcome);
    mirror.mockClear();
    const first = await (learningService as any).receipt(receipt(hit));
    const second = await (learningService as any).receipt(receipt(hit));
    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(first.receipt.applicability).toBe('applied');
    expect(mirror).toHaveBeenCalledTimes(1);
    expect(mirror.mock.calls[0]?.[3]).toMatchObject({ featureId: 'memory.use', outcome: 'applied' });
  });

  it('rejects conflicting reuse of useId', async () => {
    const { learningService, hit } = await seeded();
    vi.mocked(activityTracker.recordOutcome).mockClear();
    await (learningService as any).receipt(receipt(hit));
    await expect((learningService as any).receipt(receipt(hit, { result: 'failure', verificationRef: 'verification:fixture-fail' })))
      .rejects.toThrow(/RECEIPT_CONFLICT/);
  });

  it.each([
    ['attempt', { retrievalAttemptId: 'f'.repeat(32) }, /ATTEMPT_NOT_FOUND/],
    ['memory', { memoryId: 'missing-memory' }, /EXPOSURE_NOT_FOUND|MEMORY_NOT_FOUND/],
    ['workspace', { workspace: 'other-workspace' }, /WORKSPACE_MISMATCH/],
    ['digest', { contentDigest: 'sha256:' + '0'.repeat(64) }, /DIGEST_MISMATCH/],
  ])('rejects wrong %s binding', async (_label, patch, expected) => {
    const { learningService, hit } = await seeded();
    await expect((learningService as any).receipt(receipt(hit, patch))).rejects.toThrow(expected);
  });
  it('rejects applied/adapted after body change but permits explicit stale rejection', async () => {
    const { memory, learningService, record, hit } = await seeded();
    await memory.update(record.id, { content: 'Changed procedure body after retrieval.' });
    await expect((learningService as any).receipt(receipt(hit))).rejects.toThrow(/CONTENT_CHANGED/);
    const rejected = await (learningService as any).receipt(receipt(hit, {
      useId: 'use-stale-rejected',
      applicability: 'rejected',
      result: 'unavailable',
      reasonCode: 'stale-content',
      verificationRef: undefined,
      summary: 'Retrieved procedure changed before application.',
    }));
    expect(rejected.receipt).toMatchObject({ applicability: 'rejected', reasonCode: 'stale-content' });
  });

  it('requires verification for success/failure and rejects unsafe summary metadata', async () => {
    const { learningService, hit } = await seeded();
    const missing = { action: 'receipt', ...receipt(hit), verificationRef: undefined };
    expect(learning.safeParse(missing).success).toBe(false);
    await expect((learningService as any).receipt({ ...receipt(hit), verificationRef: undefined }))
      .rejects.toThrow(/VERIFICATION_REQUIRED/);
    expect(learning.safeParse({ action: 'receipt', ...receipt(hit), summary: 'password=abcdefghijklmnop' }).success).toBe(false);
  });

  it('does not mutate canonical Memory or feedback salience', async () => {
    const { memoryRoot, memory, learningService, record, hit } = await seeded();
    const note = path.join(memoryRoot, 'notes', record.id + '.md');
    const before = await readFile(note, 'utf8');
    const feedbackBefore = await memory.feedbackStatus();
    vi.mocked(activityTracker.recordOutcome).mockClear();
    await (learningService as any).receipt(receipt(hit));
    expect(await readFile(note, 'utf8')).toBe(before);
    expect(await memory.feedbackStatus()).toEqual(feedbackBefore);
  });
});
describe('MRR3-P3 diagnostics and persistence', () => {
  it('separates observed use from ordinary feedback and reports outcome classes', async () => {
    const { memory, learningService, hit } = await seeded();
    vi.mocked(activityTracker.recordOutcome).mockClear();
    await (learningService as any).receipt(receipt(hit));
    const diagnostics: any = await memory.retrievalDiagnostics({ workspace: 'agent-core', limit: 20 });
    expect(diagnostics.useEvidence).toMatchObject({
      receiptAssessedAttempts: 1,
      applied: 1,
      adapted: 0,
      rejected: 0,
      associatedSuccess: 0,
      associatedFailure: 0,
      outcomeUnavailable: 1,
    });
    expect(diagnostics.evidenceCompleteness.explicitFeedbackEvents).toBe(0);
    expect(JSON.stringify(diagnostics.limitations)).toMatch(/observed use.*not causal|missing receipt.*unknown/i);
  });

  it('persists receipts across service reinitialize', async () => {
    const { project, memoryRoot, learningService, hit } = await seeded();
    vi.mocked(activityTracker.recordOutcome).mockClear();
    await (learningService as any).receipt(receipt(hit));
    const restarted = await MemoryService.initialize(project, memoryRoot);
    const diagnostics: any = await restarted.retrievalDiagnostics({ workspace: 'agent-core', limit: 20 });
    expect(diagnostics.useEvidence.receiptAssessedAttempts).toBe(1);
  });
  it('degrades receipt diagnostics fail-soft when its evidence log is corrupt', async () => {
    const { project, memoryRoot, record } = await seeded();
    await writeFile(path.join(memoryRoot, 'state', 'retrieval-use-receipts.jsonl'), '{broken-json\n', 'utf8');
    const restarted = await MemoryService.initialize(project, memoryRoot);
    expect((await restarted.read(record.id, false))?.id).toBe(record.id);
    const status: any = restarted.retrievalLedgerStatus();
    expect(status.status).toBe('degraded');
    expect(status.receiptIssue).toMatch(/receipt/i);
    const diagnostics: any = await restarted.retrievalDiagnostics({ workspace: 'agent-core' });
    expect(diagnostics.useEvidence.status).toBe('unavailable');
  });

  it('keeps receipt schema bounded and existing learning actions valid', async () => {
    const { hit } = await seeded();
    expect(learning.safeParse({ action: 'status' }).success).toBe(true);
    expect(learning.safeParse({ action: 'journey', workspace: 'agent-core' }).success).toBe(true);
    expect(learning.safeParse({ action: 'receipt', ...receipt(hit) }).success).toBe(true);
    expect(learning.safeParse({
      action: 'receipt', ...receipt(hit),
      evidenceRefs: Array.from({ length: 17 }, (_, i) => 'tool:fixture-' + i),
    }).success).toBe(false);
  });
});
