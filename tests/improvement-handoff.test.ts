import { afterEach, describe, expect, it, vi } from 'vitest';
import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LearningService } from '../src/learning/service.js';
import { ExternalControllerLearningService } from '../src/learning/external-controller.js';
import { MemoryService } from '../src/memory/service.js';
import { IMPROVEMENT_HANDOFF_CONTRACT } from '../src/learning/improvement-handoff.js';

vi.mock('../src/tracker/activity-tracker.js', () => ({
  activityTracker: { record: vi.fn(), recordOutcome: vi.fn(), captureFailure: vi.fn(), readFeatureOutcomes: () => [] },
}));
const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });

async function fixture() {
  const parent = fileURLToPath(new URL('../runtime/tmp/', import.meta.url));
  await mkdir(parent, { recursive: true });
  const root = await mkdtemp(path.join(parent, 'improvement-handoff-'));
  roots.push(root);
  const memoryRoot = path.join(root, 'runtime/memory');
  await mkdir(path.join(memoryRoot, 'notes'), { recursive: true });
  await writeFile(path.join(memoryRoot, '00-agent-core-memory.md'), '# Agent Core Foundational Memory\n\nIsolated fixture foundation.\n');
  const memory = await MemoryService.initialize(root, memoryRoot);
  const learning = await LearningService.initialize({ enabled: true,
    stateDir: path.join(root, 'runtime/learning'), reviewInterval: 10, curatorIntervalHours: 168 }, memory);
  return { root, memory, learning };
}

describe('proactive improvement handoff through existing Learning', () => {
  it('delivers bounded task evidence once without inventing a proposal or executing work', async () => {
    const f = await fixture();
    const input = { idempotencyKey: 'observed-task', taskId: 'task-a', workspace: 'agent-core',
      evidenceRefs: ['source:src/observed.ts', 'untrusted-value'] };
    const result: any = await f.learning.checkpoint(input);
    expect(result.improvementHandoff).toMatchObject({ status: 'assess-observed-evidence',
      taskId: 'task-a', evidenceRefs: ['source:src/observed.ts'], maxProposals: 1,
      proposalRequired: false, executionAuthority: false, instructions: IMPROVEMENT_HANDOFF_CONTRACT });
    expect((await f.learning.checkpoint(input) as any).improvementHandoff).toBeUndefined();
    expect((await f.learning.checkpoint({ idempotencyKey: 'status', reason: 'status' }) as any).improvementHandoff).toBeUndefined();
    await expect(access(path.join(f.root, 'docs/proposals'))).rejects.toThrow();
    expect((await f.memory.list()).filter(item => !item.pinned)).toEqual([]);
  });

  it('reports absent evidence and sends the same contract to a fresh external controller', async () => {
    const f = await fixture();
    expect((await f.learning.checkpoint({ idempotencyKey: 'no-evidence' }) as any).improvementHandoff.status)
      .toBe('insufficient-evidence');
    const external = await ExternalControllerLearningService.initialize({
      stateDir: path.join(f.root, 'runtime/learning'), memory: f.memory, learning: f.learning,
    });
    const bootstrap = await external.bootstrapInstructions('external-handoff');
    expect(bootstrap).toContain(IMPROVEMENT_HANDOFF_CONTRACT);
    expect(bootstrap).toContain('Preserve HOLD and REJECT decisions');
    expect(bootstrap).toContain('deferred Invocate');
    expect(bootstrap).toContain('This limit applies to unprompted completion reviews only');
    expect(bootstrap).toContain('including one derived from a study');
  });
});
