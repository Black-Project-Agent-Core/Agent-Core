import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NativeAgentController } from '../src/agent-controller.js';
import { AgentRuntimeService } from '../src/agent-runtime.js';
import type { AgentRuntimeConfig } from '../src/agent-provider.js';

const roots: string[] = [];
afterEach(async () => {
  vi.unstubAllGlobals();
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

async function fixture(
  responses: any[],
  allowedTools: string[] = [],
  learningOverride?: any,
  runtimeOverride: Partial<AgentRuntimeConfig> = {},
) {
  const parent = fileURLToPath(new URL('../runtime/tmp', import.meta.url));
  await mkdir(parent, { recursive: true });
  const root = await mkdtemp(path.join(parent, 'native-controller-'));
  roots.push(root);
  const learning = learningOverride ?? {
    checkpoint: vi.fn(async () => ({ reviewDue: true, reviewReason: 'verified-recovery' })),
    review: vi.fn(async () => ({ summary: { status: 'no-new-knowledge', complete: true }, nothingWorthSaving: true })),
  };
  const memory = { search: vi.fn(async () => []) };
  Object.assign(learning, { procedures: async () => [], materializeProcedure: async () => {} });
  const config: AgentRuntimeConfig = {
    enabled: true,
    baseUrl: 'http://127.0.0.1:9999/v1',
    model: 'fixture-model',
    apiKey: null,
    requestTimeoutMs: 5_000,
    maxToolIterations: 4,
    allowedTools,
    ...runtimeOverride,
  };
  const fetchMock = vi.fn(async () => {
    const next = responses.shift();
    if (!next) throw new Error('unexpected provider call');
    return new Response(JSON.stringify({ choices: [next] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  const runtime = await AgentRuntimeService.initialize(root, learning as any, config, memory as any);
  const controller = new NativeAgentController(runtime, {}, config);
  return { runtime, controller, learning, memory, fetchMock };
}

function strategyChoice(strategy = 'Inspect the granted configuration surface first') {
  return {
    finish_reason: 'tool_calls',
    message: {
      content: null,
      tool_calls: [{
        id: 'strategy-1',
        type: 'function',
        function: {
          name: 'agent_core_strategy',
          arguments: JSON.stringify({
            strategy,
            hypothesis: 'The configuration read will provide inspectable evidence for the next decision.',
            expectedObservation: 'The granted get_config tool returns the runtime configuration.',
          }),
        },
      }],
    },
  };
}

function finalizeChoice(finalResponse = 'done') {
  return {
    finish_reason: 'tool_calls',
    message: {
      content: null,
      tool_calls: [{
        id: 'finalize-1',
        type: 'function',
        function: {
          name: 'agent_core_finalize',
          arguments: JSON.stringify({
            outcome: 'verified',
            reason: 'verified-recovery',
            verificationRef: 'verification:fixture-pass',
            finalResponse,
            nothingWorthSaving: true,
          }),
        },
      }],
    },
  };
}

function capabilityChoice() {
  return {
    finish_reason: 'tool_calls',
    message: {
      content: null,
      tool_calls: [{
        id: 'capability-1',
        type: 'function',
        function: {
          name: 'agent_core_request_capabilities',
          arguments: JSON.stringify({
            families: ['observe.local'],
            reason: 'Inspect local runtime usage for the user-requested analysis.',
            expectedActions: ['get_usage_stats'],
          }),
        },
      }],
    },
  };
}

function usageChoice() {
  return {
    finish_reason: 'tool_calls',
    message: {
      content: null,
      tool_calls: [{
        id: 'usage-1',
        type: 'function',
        function: {
          name: 'get_usage_stats',
          arguments: '{}',
        },
      }],
    },
  };
}

describe('native Agent Core controller lifecycle', () => {
  it('returns invalid finalization arguments to the model for bounded correction', async () => {
    const invalid = finalizeChoice();
    const call = invalid.message.tool_calls[0].function;
    call.arguments = JSON.stringify({ ...JSON.parse(call.arguments), learningDecision: 'captured' });
    const { controller, learning, fetchMock } = await fixture([invalid, finalizeChoice('corrected finalization')]);
    const result = await controller.runTask({ prompt: 'Complete the verified task' });
    expect(result.response).toBe('corrected finalization');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(learning.checkpoint).toHaveBeenCalledTimes(1);
  });
  it('uses finalization evidence for candidates that omit it without replacing explicit candidate evidence', async () => {
    const choice = finalizeChoice();
    const call = choice.message.tool_calls[0].function;
    const args = JSON.parse(call.arguments);
    delete args.nothingWorthSaving;
    args.candidates = [
      { kind: 'durable-fact', content: 'Scoped lesson', verified: true },
      { kind: 'durable-fact', content: 'Separately evidenced lesson', verified: true, evidenceRefs: ['file:own-evidence'] },
    ];
    call.arguments = JSON.stringify(args);
    const { controller, learning } = await fixture([choice]);
    await controller.runTask({ prompt: 'Finalize the verified task', workspace: 'workspace-a' });
    expect(learning.review.mock.calls[0][0]).toEqual([
      expect.objectContaining({ evidenceRefs: ['verification:fixture-pass'], workspace: 'workspace-a' }),
      expect.objectContaining({ evidenceRefs: ['file:own-evidence'], workspace: 'workspace-a' }),
    ]);
  });
  it('cannot complete a verified recovery without Learning checkpoint and semantic review', async () => {
    const { controller, runtime, learning, memory } = await fixture([finalizeChoice('verified result')]);
    const result = await controller.runTask({ prompt: 'repair fixture', workspace: 'fixture' });
    expect(result.status).toBe('finalized');
    expect(result.response).toBe('verified result');
    expect(result.iterations).toBe(1);
    expect(memory.search).toHaveBeenCalledBefore(learning.checkpoint);
    expect(learning.checkpoint).toHaveBeenCalledWith(expect.objectContaining({
      reason: 'verified-recovery',
      workspace: 'fixture',
      evidenceRefs: ['verification:fixture-pass'],
    }));
    expect(learning.review).toHaveBeenCalledWith([], false, { checkpointKeys: [`agent-runtime:${result.taskId}:finalization`], taskId: result.taskId, disposition: 'no-new-knowledge' });
    const task = await runtime.getTask(result.taskId);
    expect(task).toEqual(expect.objectContaining({
      status: 'finalized',
      finalization: expect.objectContaining({ status: 'complete', reviewDue: true }),
    }));
    expect((await runtime.health()).runningSessionCount).toBe(0);
  });

  it('rejects a plain assistant answer as terminal and forces the synthetic finalization tool', async () => {
    const first = {
      finish_reason: 'stop',
      message: { content: 'I think this is done.' },
    };
    const { controller, fetchMock } = await fixture([first, finalizeChoice('final answer')]);
    const result = await controller.runTask({ prompt: 'ordinary task' });
    expect(result.status).toBe('finalized');
    expect(result.response).toBe('final answer');
    expect(result.iterations).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondRequest = JSON.parse(String((fetchMock.mock.calls[1] as any)[1]?.body ?? '{}'));
    expect(JSON.stringify(secondRequest.messages)).toContain('The turn is not complete');
  });

  it('executes an explicitly granted existing MCP tool before mandatory finalization', async () => {
    const toolChoice = {
      finish_reason: 'tool_calls',
      message: {
        content: null,
        tool_calls: [{ id: 'tool-1', type: 'function', function: { name: 'get_config', arguments: '{}' } }],
      },
    };
    const { controller, fetchMock } = await fixture([
      strategyChoice(), toolChoice, finalizeChoice('tool-backed result'),
    ], ['get_config']);
    const result = await controller.runTask({ prompt: 'inspect config then finish' });
    expect(result.status).toBe('finalized');
    expect(result.response).toBe('tool-backed result');
    expect(result.iterations).toBe(3);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const thirdRequest = JSON.parse(String((fetchMock.mock.calls[2] as any)[1]?.body ?? '{}'));
    expect(JSON.stringify(thirdRequest.messages)).toContain('allowedDirectories');
    const localToolMessage = thirdRequest.messages.find((message: any) =>
      message.role === 'tool' && message.name === 'get_config');
    expect(localToolMessage.content).toContain(
      `AGENT_CORE_EVIDENCE_REF=tool:dtc:${result.taskId}:tool-1`);
    // Availability of a receipt must not silently choose it as the task verdict.
    expect(localToolMessage.content).toContain('when this result supports the claim');
  });

  it('expands a dynamic task-scoped grant in the same turn before ordinary tool use', async () => {
    const { controller, fetchMock, runtime } = await fixture([
      capabilityChoice(),
      strategyChoice('Inspect local usage statistics after capability approval'),
      usageChoice(),
      finalizeChoice('dynamic-tool-result'),
    ], [], undefined, {
      capabilityPolicy: 'dynamic',
      allowedCapabilities: ['observe.local'],
      maxToolIterations: 5,
    });
    const result = await controller.runTask({
      prompt: 'inspect local runtime usage statistics and report the result',
    });
    expect(result.status).toBe('finalized');
    expect(result.response).toBe('dynamic-tool-result');
    expect(result.iterations).toBe(4);

    const firstRequest = JSON.parse(String((fetchMock.mock.calls[0] as any)[1]?.body ?? '{}'));
    const secondRequest = JSON.parse(String((fetchMock.mock.calls[1] as any)[1]?.body ?? '{}'));
    const firstTools = firstRequest.tools.map((tool: any) => tool.function?.name);
    const secondTools = secondRequest.tools.map((tool: any) => tool.function?.name);
    expect(firstTools).not.toContain('get_usage_stats');
    expect(firstTools).toContain('agent_core_request_capabilities');
    expect(secondTools).toContain('get_usage_stats');

    const task = await runtime.getTask(result.taskId);
    expect(task?.episodes.some(episode =>
      episode.summary.includes('Capability request approved=[observe.local]')
      && episode.summary.includes('grantedTools='))).toBe(true);
  });

  it('preserves the work response and reports Learning failure separately', async () => {
    const learning = {
      checkpoint: vi.fn(async () => { throw new Error('LEARNING_TEMPORARY_FAILURE'); }),
      review: vi.fn(),
    };
    const { controller, runtime } = await fixture([finalizeChoice('must-not-return')], [], learning);
    const result = await controller.runTask({ prompt: 'verified recovery' });
    expect(result.learningStatus).toBe('failed');
    expect(result.response).toContain('LEARNING_TEMPORARY_FAILURE');
    expect(learning.checkpoint).toHaveBeenCalledTimes(1);
    expect((await runtime.health()).runningSessionCount).toBe(0);
    expect((await runtime.health()).pendingFinalizationCount).toBe(1);
  });

  it('preserves verified work when procedure materialization fails', async () => {
    const choice = finalizeChoice('verified work survives');
    const call = choice.message.tool_calls[0].function;
    call.arguments = JSON.stringify({ ...JSON.parse(call.arguments), procedure: {
      name: 'verified-procedure', description: 'Repeatable work', steps: ['Check the result'], reuseCondition: 'Related work',
    } });
    const { controller, runtime, learning } = await fixture([choice]);
    learning.supportProcedure = vi.fn(async () => { throw new Error('SKILL_STORAGE_FAILED'); });
    const result = await controller.runTask({ prompt: 'Verified task with a procedure' });
    expect(result.response).toContain('verified work survives');
    expect(result.learningStatus).toBe('failed');
    expect(result.response).toContain('SKILL_STORAGE_FAILED');
    expect((await runtime.getTask(result.taskId))?.terminalOutcome).toBe('verified');
    expect(learning.checkpoint).toHaveBeenCalledTimes(1);
    expect(learning.review).not.toHaveBeenCalled();
  });
});
