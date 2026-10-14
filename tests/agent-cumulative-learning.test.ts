import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NativeAgentController } from '../src/agent-controller.js';
import { AgentRuntimeService } from '../src/agent-runtime.js';
import { LearningService } from '../src/learning/service.js';
import { MemoryService } from '../src/memory/service.js';
import { SkillService } from '../src/skills/service.js';
import type { AgentRuntimeConfig } from '../src/agent-provider.js';

const roots: string[] = [];
afterEach(async () => {
  vi.unstubAllGlobals();
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

async function rootFixture() {
  const parent = fileURLToPath(new URL('../runtime/tmp/', import.meta.url));
  await mkdir(parent, { recursive: true });
  const root = await mkdtemp(path.join(parent, 'cumulative-learning-'));
  roots.push(root);
  const memoryDir = path.join(root, 'runtime', 'memory');
  await mkdir(path.join(memoryDir, 'notes'), { recursive: true });
  await writeFile(path.join(memoryDir, '00-agent-core-memory.md'), '# Agent Core Foundational Memory\n\nCumulative-learning fixture foundation.\n');
  const memory = await MemoryService.initialize(root, memoryDir);
  const learning = await LearningService.initialize({
    enabled: true, stateDir: path.join(root, 'runtime', 'learning'),
    reviewInterval: 10, curatorIntervalHours: 168,
  }, memory);
  return { root, memory, learning };
}
function choice(name: string, args: Record<string, unknown>, id = name + '-call') {
  return {
    finish_reason: 'tool_calls',
    message: {
      content: null,
      tool_calls: [{ id, type: 'function', function: { name, arguments: JSON.stringify(args) } }],
    },
  };
}

function strategy(strategyText: string, knowledgeUse: any[] = []) {
  return choice('agent_core_strategy', {
    strategy: strategyText,
    hypothesis: 'The next bounded action will produce evidence that changes or confirms the diagnosis.',
    expectedObservation: 'The granted tool returns an inspectable result.',
    knowledgeUse,
  }, 'strategy-' + Math.random().toString(16).slice(2));
}

function finalize(ref: string, procedure?: Record<string, unknown>) {
  return choice('agent_core_finalize', {
    outcome: 'verified',
    reason: 'task-complete',
    verificationRef: ref,
    finalResponse: 'verified complete',
    nothingWorthSaving: !procedure,
    ...(procedure ? { procedure } : {}),
  }, 'finalize-' + ref.replace(/[^a-z0-9]/gi, '-'));
}

async function controllerFixture(responses: any[], allowedTools: string[], extras: any = {}) {
  const { root, memory, learning } = await rootFixture();
  const config: AgentRuntimeConfig = {
    enabled: true, baseUrl: 'http://127.0.0.1:9999/v1', model: 'fixture-model', apiKey: null,
    requestTimeoutMs: 5_000, maxToolIterations: 10, allowedTools,
  };
  const requests: any[] = [];
  const fetchMock = vi.fn(async (_url: unknown, init: any) => {
    requests.push(JSON.parse(String(init?.body ?? '{}')));
    const next = responses.shift();
    if (!next) throw new Error('unexpected provider call');
    return new Response(JSON.stringify({ choices: [next] }), {
      status: 200, headers: { 'content-type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  const runtime = await AgentRuntimeService.initialize(root, learning, config, memory);
  const controller = new NativeAgentController(runtime, {
    memoryService: memory, learningService: learning, ...extras,
  }, config);
  return { root, memory, learning, runtime, controller, requests, config };
}

describe('native cumulative-learning loop', () => {
  it('re-retrieves after failure and blocks ordinary actions until strategy materially changes', async () => {
    const missing = path.join(fileURLToPath(new URL('../runtime/tmp/', import.meta.url)), 'definitely-missing-cumulative.txt');
    const responses = [
      strategy('Read the suspected file directly'),
      choice('read_file', { path: missing }, 'read-missing'),
      choice('get_config', {}, 'premature-tool'),
      strategy('Switch diagnostic method and inspect runtime configuration instead'),
      choice('get_config', {}, 'config-after-change'),
      finalize('verification:adaptive-retry-pass'),
    ];
    const fx = await controllerFixture(responses, ['read_file', 'get_config']);
    await fx.memory.remember({
      title: 'Missing file recovery lesson',
      content: 'When a direct file read fails, switch diagnostic method instead of repeating the same read.',
      provenance: { workspace: 'fixture', repo: 'fixture', files: [] },
    });
    const searchSpy = vi.spyOn(fx.memory, 'search');
    const result = await fx.controller.runTask({
      prompt: 'Diagnose a missing cumulative-learning fixture, then verify by inspecting config.',
      workspace: 'fixture', taskId: 'adaptive-task',
    });
    expect(result.status).toBe('finalized');
    expect(searchSpy.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(fx.requests).toHaveLength(6);
    expect(JSON.stringify(fx.requests[2].messages)).toContain('ADAPTIVE_MEMORY_CONTEXT');
    expect(JSON.stringify(fx.requests[3].messages)).toContain('STRATEGY_REQUIRED_AFTER_FAILURE');
    const task = await fx.runtime.getTask('adaptive-task');
    expect(task?.metrics).toEqual(expect.objectContaining({
      toolFailures: 1, adaptiveRecalls: 1, strategyChanges: 1, blockedEquivalentRetries: 1,
    }));
    expect(task?.episodes.map(event => event.kind)).toEqual(expect.arrayContaining([
      'failure', 'diagnosis', 'recall', 'strategy-change', 'verification', 'finalization',
    ]));
  });

  it('records verified Memory-use attribution rather than treating retrieval as use', async () => {
    const fxBase = await rootFixture();
    const remembered = await fxBase.memory.remember({
      title: 'receiptneedle config lesson',
      content: 'receiptneedle says inspect configuration before verified completion.',
      provenance: { workspace: 'fixture', repo: 'fixture', files: [] },
    });
    const config: AgentRuntimeConfig = {
      enabled: true, baseUrl: 'http://127.0.0.1:9999/v1', model: 'fixture-model', apiKey: null,
      requestTimeoutMs: 5_000, maxToolIterations: 6, allowedTools: ['get_config'],
    };
    const responses = [
      strategy('Apply the recalled config lesson', [{
        memoryId: remembered.id, applicability: 'applied', reasonCode: 'config-guidance',
        summary: 'The prior lesson determines the verification action.',
      }]),
      choice('get_config', {}, 'receipt-config'),
      finalize('verification:receipt-pass'),
    ];
    const requests: any[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: unknown, init: any) => {
      requests.push(JSON.parse(String(init?.body ?? '{}')));
      const next = responses.shift();
      if (!next) throw new Error('unexpected provider call');
      return new Response(JSON.stringify({ choices: [next] }), { status: 200, headers: { 'content-type': 'application/json' } });
    }));
    const runtime = await AgentRuntimeService.initialize(fxBase.root, fxBase.learning, config, fxBase.memory);
    const controller = new NativeAgentController(runtime, { memoryService: fxBase.memory, learningService: fxBase.learning }, config);
    await controller.runTask({ prompt: 'Use the receiptneedle lesson and inspect config.', workspace: 'fixture', taskId: 'receipt-task' });
    const ledger = fxBase.memory.retrievalLedgerStatus();
    expect(ledger.receiptCount).toBe(1);
    const task = await runtime.getTask('receipt-task');
    expect(task?.metrics.knowledgeUseReceipts).toBe(1);
    expect(task?.knowledgeUse).toHaveLength(1);
  });
  it('does not promote repeated controller claims with unresolved verification references', async () => {
    const { root, memory, learning } = await rootFixture();
    const skills = await SkillService.initialize(root);
    const procedure = {
      name: 'inspect-config-safely',
      description: 'Inspect configuration before claiming runtime readiness.',
      steps: ['Declare the configuration hypothesis.', 'Call get_config.', 'Verify the returned configuration evidence.'],
      allowedTools: ['get_config'],
      reuseCondition: 'Use when runtime readiness depends on current Agent Core configuration.',
    };
    const responses = [
      strategy('Inspect config for first independent verification'),
      choice('get_config', {}, 'config-one'),
      finalize('verification:procedure-one', procedure),
      strategy('Inspect config for second independent verification'),
      choice('get_config', {}, 'config-two'),
      finalize('verification:procedure-two', procedure),
    ];
    vi.stubGlobal('fetch', vi.fn(async () => {
      const next = responses.shift();
      if (!next) throw new Error('unexpected provider call');
      return new Response(JSON.stringify({ choices: [next] }), { status: 200, headers: { 'content-type': 'application/json' } });
    }));
    const config: AgentRuntimeConfig = {
      enabled: true, baseUrl: 'http://127.0.0.1:9999/v1', model: 'fixture-model', apiKey: null,
      requestTimeoutMs: 5_000, maxToolIterations: 6, allowedTools: ['get_config'],
    };
    const runtime = await AgentRuntimeService.initialize(root, learning, config, memory);
    const controller = new NativeAgentController(runtime, {
      memoryService: memory, learningService: learning, skillsService: skills,
    }, config);
    await controller.runTask({ prompt: 'First independent config procedure proof.', workspace: 'fixture', taskId: 'procedure-task-one' });
    expect(await skills.list()).toHaveLength(0);
    await controller.runTask({ prompt: 'Second independent config procedure proof.', workspace: 'fixture', taskId: 'procedure-task-two' });
    const catalog = await skills.list();
    expect(catalog).toHaveLength(0);
    const candidates = await learning.procedures('fixture');
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.supportTaskIds).toHaveLength(0);
    expect(candidates[0]?.historicalTaskIds).toHaveLength(2);
  });

  it('compares explicit baseline and cumulative task ids without inventing an improvement claim', async () => {
    const { root, memory, learning } = await rootFixture();
    const config: AgentRuntimeConfig = {
      enabled: false, baseUrl: null, model: null, apiKey: null,
      requestTimeoutMs: 5_000, maxToolIterations: 6, allowedTools: [],
    };
    const runtime = await AgentRuntimeService.initialize(root, learning, config, memory);
    for (const spec of [
      { sessionId: 'baseline-session', taskId: 'baseline-task', toolCalls: 5, toolFailures: 2, blocked: 1 },
      { sessionId: 'candidate-session', taskId: 'candidate-task', toolCalls: 3, toolFailures: 0, blocked: 0 },
    ]) {
      await runtime.startSession({ sessionId: spec.sessionId });
      await runtime.beginTask({ sessionId: spec.sessionId, taskId: spec.taskId, goal: 'controlled evaluation task' });
      await runtime.bumpMetrics(spec.taskId, {
        toolCalls: spec.toolCalls, toolFailures: spec.toolFailures, blockedEquivalentRetries: spec.blocked,
      });
      await runtime.markTerminal({
        taskId: spec.taskId, outcome: 'verified', verificationRef: 'verification:' + spec.taskId,
      });
      await runtime.finalizeTask({ taskId: spec.taskId, nothingWorthSaving: true });
      await runtime.closeSession(spec.sessionId);
    }
    const evaluated = await runtime.evaluateCumulativeLearning({
      baselineTaskIds: ['baseline-task'], candidateTaskIds: ['candidate-task'],
    });
    expect(evaluated.correctnessPreserved).toBe(true);
    expect(evaluated.measurableEfficiencyImprovement).toBe(true);
    expect(evaluated.deltas.averageToolCalls).toBe(-2);
    expect(evaluated.deltas.averageToolFailures).toBe(-2);
  });
});
