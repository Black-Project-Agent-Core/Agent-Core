import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AgentRuntimeService, normalizeState, taskNormalizationStats } from '../src/agent-runtime.js';
import { LearningService } from '../src/learning/service.js';
import { MemoryService } from '../src/memory/service.js';

const STAMP = '2026-10-31T10:00:00.000Z';
const roots: string[] = [];
afterEach(async () => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

function syntheticTask(index: number, status: 'running' | 'finalized' = 'finalized') {
  return {
    id: `task-${index}`, sessionId: 'session-1', workspace: 'fixture', goal: `Goal ${index}`,
    createdAt: STAMP, updatedAt: STAMP, status, verificationStatus: 'unavailable', evidenceRefs: [`tool:fixture-${index}`],
    episodes: Array.from({ length: 12 }, (_, step) => ({
      id: `episode-${index}-${step}`, kind: step % 3 ? 'observation' : 'action', at: STAMP,
      summary: `Step ${step} of task ${index}`, evidenceRefs: [], toolName: 'read_file',
    })),
    retrievalAttemptIds: [], knowledgeUse: [], artifactUse: [],
    metrics: { startedAt: STAMP, toolCalls: step(index), toolFailures: 0, adaptiveRecalls: 0, strategyChanges: 0,
      blockedEquivalentRetries: 0, hypotheses: 0, verifications: 0, knowledgeUseReceipts: 0, artifactUseOutcomes: 0, modelMs: 1_000 + index },
    modelIdentity: { observedCalls: 1, identities: [{ providerId: 'anthropic', model: 'fixture-model' }] },
    finalization: { status: status === 'finalized' ? 'complete' : 'not-started', reviewReason: null },
  };
}
function step(index: number) { return index % 5; }
function syntheticState(tasks = 6) {
  return {
    version: 1, workflowVersion: 2,
    sessions: [{ id: 'session-1', createdAt: STAMP, updatedAt: STAMP, status: 'active' }],
    tasks: Array.from({ length: tasks }, (_, index) => syntheticTask(index)), procedures: [],
  };
}

describe('task normalization cache', () => {
  it('returns exactly what uncached normalization returns, on a miss and on a reuse', () => {
    const input = syntheticState();
    vi.stubEnv('AGENT_CORE_RUNTIME_NORMALIZE_CACHE', 'off');
    const uncached = normalizeState(structuredClone(input));
    vi.unstubAllEnvs();
    const first = normalizeState(structuredClone(input));
    const second = normalizeState(structuredClone(input));
    expect(first).toStrictEqual(uncached);
    expect(second).toStrictEqual(uncached);
  });

  it('reuses unchanged tasks and recomputes only the one that changed', () => {
    const input = syntheticState(8);
    normalizeState(structuredClone(input));
    let before = taskNormalizationStats();
    normalizeState(structuredClone(input));
    let after = taskNormalizationStats();
    expect(after.reused - before.reused).toBe(8);
    expect(after.computed - before.computed).toBe(0);
    const changed = structuredClone(input);
    changed.tasks[3]!.episodes.push({ id: 'episode-3-new', kind: 'observation', at: STAMP, summary: 'New', evidenceRefs: [], toolName: 'get_config' });
    before = taskNormalizationStats();
    const result = normalizeState(changed);
    after = taskNormalizationStats();
    expect(after.computed - before.computed).toBe(1);
    expect(after.reused - before.reused).toBe(7);
    expect(result.tasks[3]!.episodes.at(-1)!.id).toBe('episode-3-new');
  });

  it('never lets an in-place edit of a returned task leak into a later call', () => {
    const input = syntheticState(2);
    const first = normalizeState(structuredClone(input));
    first.tasks[0]!.episodes.push({ id: 'leak', kind: 'observation', at: STAMP, summary: 'Edited in place', evidenceRefs: [] });
    first.tasks[0]!.metrics.toolCalls = 999;
    const again = normalizeState(structuredClone(input));
    expect(again.tasks[0]!.episodes.some(episode => episode.id === 'leak')).toBe(false);
    expect(again.tasks[0]!.metrics.toolCalls).toBe(step(0));
  });

  it('still validates session membership and status when the task text is cached', () => {
    const input = syntheticState(2);
    normalizeState(structuredClone(input));
    const orphaned = structuredClone(input);
    orphaned.sessions = [];
    expect(() => normalizeState(orphaned)).toThrow('AGENT_RUNTIME_TASK_ID_INVALID');
    const badStatus = structuredClone(input);
    (badStatus.tasks[0] as { status: string }).status = 'exploded';
    expect(() => normalizeState(badStatus)).toThrow('AGENT_RUNTIME_TASK_STATUS_INVALID');
  });
});

describe('service state file with the cache on and off', () => {
  async function fixture(seed: unknown) {
    const root = await mkdtemp(path.join(os.tmpdir(), 'agent-runtime-cache-'));
    roots.push(root);
    const memoryDir = path.join(root, 'runtime', 'memory');
    await mkdir(path.join(memoryDir, 'notes'), { recursive: true });
    await writeFile(path.join(memoryDir, '00-agent-core-memory.md'), '# Agent Core Foundational Memory\n\nCache fixture.\n');
    await mkdir(path.join(root, 'runtime', 'agent-runtime'), { recursive: true });
    const statePath = path.join(root, 'runtime', 'agent-runtime', 'state.json');
    await writeFile(statePath, JSON.stringify(normalizeState(seed), null, 2) + '\n');
    const memory = await MemoryService.initialize(root, memoryDir);
    const learning = await LearningService.initialize({ enabled: true, stateDir: path.join(root, 'runtime', 'learning'), reviewInterval: 10, curatorIntervalHours: 168 }, memory);
    const config = { enabled: false, baseUrl: null, model: null, apiKey: null, requestTimeoutMs: 5_000, maxToolIterations: 4, allowedTools: [] };
    return { runtime: await AgentRuntimeService.initialize(root, learning, config, memory), statePath };
  }

  async function bumpedState(cache: 'on' | 'off') {
    vi.stubEnv('AGENT_CORE_RUNTIME_NORMALIZE_CACHE', cache);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-31T12:00:00.000Z'));
    const seed = syntheticState(5);
    seed.tasks.push(syntheticTask(99, 'running'));
    const { runtime, statePath } = await fixture(seed);
    for (let round = 0; round < 3; round += 1) {
      await runtime.bumpMetrics('task-99', { toolMs: 5, modelMs: 7, modelCalls: 1, toolCalls: 1 });
    }
    const text = await readFile(statePath, 'utf8');
    vi.useRealTimers();
    return text;
  }

  it('writes a byte-identical state file whether or not the cache is used', async () => {
    const withoutCache = await bumpedState('off');
    const withCache = await bumpedState('on');
    expect(withCache).toBe(withoutCache);
    expect(JSON.parse(withCache).tasks.find((task: { id: string }) => task.id === 'task-99').metrics.toolCalls).toBe(step(99) + 3);
  }, 60_000);
});
