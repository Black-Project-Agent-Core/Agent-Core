import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { applyResultBudget } from '../src/mcp/result-budget.js';
import { MemoryService } from '../src/memory/service.js';
import {
  reconcileInterruptedToolInvocations,
  type InvocationReconciliationTracker,
} from '../src/tracker/tool-invocation.js';
import type { TrackerEvent } from '../src/tracker/activity-tracker.js';

const roots: string[] = [];

async function createMemory(): Promise<MemoryService> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-core-memory-wave-'));
  roots.push(root);
  await mkdir(path.join(root, 'notes'), { recursive: true });
  await writeFile(
    path.join(root, '00-agent-core-memory.md'),
    '# Agent Core Wave Foundation\n',
    'utf8',
  );
  return MemoryService.initialize(process.cwd(), root);
}
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

describe('memory reference wave 16-21 adoption', () => {
  it('keeps expired Memory canonical/readable while excluding it from active recall', async () => {
    const memory = await createMemory();
    const record = await memory.remember({
      content: 'expiry-contract durable fact',
      keywords: ['expiry-contract'],
      expiresAt: '2020-01-01T00:00:00.000Z',
    });

    expect((await memory.read(record.id, false))?.id).toBe(record.id);
    expect((await memory.list()).some(item => item.id === record.id)).toBe(true);
    const visibility = await memory.visibilitySnapshot([record.id]);
    expect(visibility[record.id]?.expired).toBe(true);

    const results = await memory.search('expiry-contract', { maxNeighbors: 0 });
    expect(results.some(item => item.record.id === record.id)).toBe(false);
  });

  it('soft-forgets and restores Memory without deleting canonical history', async () => {
    const memory = await createMemory();
    const record = await memory.remember({
      content: 'soft-forget-contract durable fact',
      keywords: ['soft-forget-contract'],
    });
    const forgotten = await memory.lifecycle(
      record.id,
      'evt-forget-1',
      'forget',
      'user correction',
    );
    expect(forgotten).toMatchObject({ forgotten: true, duplicate: false });
    expect((await memory.read(record.id, false))?.content).toContain('soft-forget-contract');
    expect((await memory.search('soft-forget-contract', { maxNeighbors: 0 }))
      .some(item => item.record.id === record.id)).toBe(false);

    const restored = await memory.lifecycle(record.id, 'evt-restore-1', 'restore');
    expect(restored).toMatchObject({ forgotten: false, duplicate: false });
    expect((await memory.search('soft-forget-contract', { maxNeighbors: 0 }))
      .some(item => item.record.id === record.id)).toBe(true);

    const lifecycle = await memory.lifecycleState(record.id);
    expect(lifecycle.events.map(event => event.action)).toEqual(['forget', 'restore']);
  });

  it('uses explicit feedback only as a bounded fusion tie-breaker among eligible results', async () => {
    const memory = await createMemory();
    const first = await memory.remember({
      content: 'feedback fusion candidate alpha red',
    });
    const second = await memory.remember({
      content: 'feedback fusion candidate alpha blue',
    });

    await memory.feedback(second.id, 'evt-helpful-1', 'helpful');
    const results = await memory.search('feedback fusion candidate alpha', {
      rankingProfile: 'fusion',
      limit: 2,
      maxNeighbors: 0,
    });
    expect(results).toHaveLength(2);
    expect(results[0]?.record.id).toBe(second.id);
    expect(results[0]?.components.feedbackInfluence).toBeGreaterThan(0);
    expect(results.every(item => item.components.feedbackInfluence <= 0.08)).toBe(true);

    const unrelated = await memory.remember({
      content: 'completely unrelated zebra quartz',
    });
    await memory.feedback(unrelated.id, 'evt-helpful-2', 'helpful');
    const bounded = await memory.search('feedback fusion candidate alpha', {
      rankingProfile: 'fusion',
      limit: 5,
      maxNeighbors: 0,
    });
    expect(bounded.some(item => item.record.id === unrelated.id)).toBe(false);
  });

  it('evaluates temporal links at an explicit asOf time without mutating canonical records', async () => {
    const memory = await createMemory();
    const parent = await memory.remember({ content: 'temporal-parent-marker' });
    const child = await memory.remember({ content: 'temporal-child-marker' });

    await memory.batch([{
      op: 'link',
      id: parent.id,
      link: {
        targetId: child.id,
        type: 'related',
        strength: 0.9,
        validFrom: '2024-01-01T00:00:00.000Z',
        validTo: '2024-12-31T23:59:59.000Z',
        referenceTime: '2024-06-01T00:00:00.000Z',
        evidenceRefs: ['test:temporal-window'],
      },
    }]);

    const active = await memory.search('temporal-parent-marker', {
      limit: 1,
      maxNeighbors: 1,
      asOf: '2024-06-15T00:00:00.000Z',
    });
    expect(active.some(item => item.record.id === child.id && item.matchType === 'linked')).toBe(true);

    const inactive = await memory.search('temporal-parent-marker', {
      limit: 1,
      maxNeighbors: 1,
      asOf: '2025-06-15T00:00:00.000Z',
    });
    expect(inactive.some(item => item.record.id === child.id)).toBe(false);
    expect((await memory.read(parent.id, false))?.links.some(link => link.targetId === child.id)).toBe(true);
  });

  it('reconciles prior-process orphan invocations once and never authorizes a blind retry', () => {
    const events: TrackerEvent[] = [{
      id: 'start-event-1',
      timestamp: '2026-09-27T00:00:00.000Z',
      time: '00:00:00',
      module: 'MCP',
      level: 'info',
      message: 'memory_update started',
      source: 'node',
      kind: 'tool-invocation-start',
      context: {
        tool: 'memory_update',
        invocationId: 'invocation-old-1',
        processSessionId: 'prior-process-session',
      },
    }];
    const recorded: TrackerEvent[] = [];
    const tracker: InvocationReconciliationTracker = {
      readToolInvocationEvents: () => [...events, ...recorded],
      record: (module, level, message, kind = 'event', context) => {
        const event: TrackerEvent = {
          id: `recorded-${recorded.length + 1}`,
          timestamp: '2026-09-27T00:01:00.000Z',
          time: '00:01:00',
          module,
          level,
          message,
          source: 'node',
          kind,
          context,
        };
        recorded.push(event);
        return event;
      },
    };

    const first = reconcileInterruptedToolInvocations(tracker);
    expect(first).toMatchObject({ orphanStarts: 1, reconciled: 1 });
    expect(recorded[0]?.kind).toBe('tool-invocation-interrupted');
    expect(recorded[0]?.context).toMatchObject({
      outcome: 'outcome-unknown',
      retryDirective: 'never-blind-retry',
    });

    const second = reconcileInterruptedToolInvocations(tracker);
    expect(second.reconciled).toBe(0);
    expect(recorded).toHaveLength(1);
  });

  it('keeps UTF-8 oversized sensitive-capable output byte-bounded with head and tail evidence', async () => {
    const text = `HEAD-${'😀'.repeat(8_000)}-TAIL`;
    const result = { content: [{ type: 'text', text }] };
    const bounded = await applyResultBudget('read_file', result, {
      budgetChars: 16 * 1024,
      previewChars: 2048,
    });

    const output = String(bounded.content[0]?.text ?? '');
    expect(Buffer.byteLength(output, 'utf8')).toBeLessThanOrEqual(16 * 1024);
    expect(output).toContain('HEAD-');
    expect(output).toContain('-TAIL');
    expect(output).not.toContain('�');
    expect((bounded._meta as any).resultBudget).toMatchObject({
      spilled: false,
      reason: 'non-persistable-tool',
    });
  });
});
