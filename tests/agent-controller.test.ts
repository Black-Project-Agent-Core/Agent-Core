import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NativeAgentController } from '../src/agent-controller.js';
import { AgentRuntimeService } from '../src/agent-runtime.js';
import type { AgentRuntimeConfig } from '../src/agent-provider.js';
import { parseAgentTurnCheckpoint, serializeAgentTurnCheckpoint } from '../src/agent-turn-checkpoint.js';

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

function toolboxChoice(names: string[]) {
  return {
    finish_reason: 'tool_calls',
    message: {
      content: null,
      tool_calls: [{
        id: 'toolbox-1',
        type: 'function',
        function: {
          name: 'agent_core_toolbox',
          arguments: JSON.stringify({ action: 'load', names }),
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
  it.each([
    ['delivers', { finish_reason: 'stop', message: { content: 'Observed: config read. Inferred: nothing else. Not checked: tests.' } }],
    ['keeps the old failure when the report call fails', undefined],
  ])('%s a no-tool report on turn.failed at the tool-iteration limit', async (_name, reportChoice) => {
    const responses: any[] = [strategyChoice(), toolboxChoice(['get_config'])];
    if (reportChoice) responses.push(reportChoice);
    const { controller, runtime, fetchMock } = await fixture(responses, [], undefined, { maxToolIterations: 2 });
    const session = await runtime.startSession({ sessionId: 'limit-session', provider: 'openai-compatible', model: 'fixture-model' });
    const events: any[] = [];
    await expect(controller.runConversationTurn({ sessionId: session.id, prompt: 'investigate', eventSink: event => { events.push(event); } }))
      .rejects.toThrow('AGENT_RUNTIME_MAX_TOOL_ITERATIONS_EXCEEDED');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const reportRequest = JSON.parse((fetchMock.mock.calls[2] as any)[1].body);
    expect(reportRequest.tools).toBeUndefined();
    const failed = events.filter(event => event.type === 'turn.failed');
    expect(failed).toHaveLength(1);
    expect(failed[0].code).toBe('AGENT_RUNTIME_MAX_TOOL_ITERATIONS_EXCEEDED');
    if (reportChoice) expect(failed[0].response).toBe(reportChoice.message.content);
    else expect(failed[0].response).toBeUndefined();
  });

  it('never redispatches a report after recovery past its durable attempt and response', async () => {
    const { controller, runtime, fetchMock } = await fixture([strategyChoice(), toolboxChoice([]),
      { finish_reason: 'stop', message: { content: 'Observed: bounded work. Unchecked: validation.' } }], [], undefined, { maxToolIterations: 2 });
    const session = await runtime.startSession({ sessionId: 'report-recovery' });
    let saved: any;
    const save = async (state: any) => { const record = serializeAgentTurnCheckpoint(state);
      saved = parseAgentTurnCheckpoint(record.json, record.digest); };
    vi.spyOn(runtime, 'markTerminal').mockRejectedValueOnce(new Error('AGENT_RUNTIME_CONTINUATION_SIMULATED_CRASH'));
    const input = { sessionId: session.id, taskId: 'report-recovery-task', prompt: 'Investigate',
      continuation: { conversationId: 'recovery-chat', turnId: 'recovery-turn', save } };
    await expect(controller.runConversationTurn(input)).rejects.toThrow('AGENT_RUNTIME_CONTINUATION_SIMULATED_CRASH');
    expect(saved.iterationLimitReport).toEqual({ attempted: true, response: 'Observed: bounded work. Unchecked: validation.' });
    expect(saved.providerAttemptsConsumed).toBe(3);
    const events: any[] = [];
    await expect(controller.runConversationTurn({ ...input, continuation: { ...input.continuation, state: saved },
      eventSink: event => { events.push(event); } })).rejects.toThrow('AGENT_RUNTIME_MAX_TOOL_ITERATIONS_EXCEEDED');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(events.find(event => event.type === 'turn.failed')?.response).toContain('Observed: bounded work');
  });

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

  function conversationFinalize(extra: Record<string, unknown> = {}) {
    return { finish_reason: 'tool_calls', message: { content: null, tool_calls: [{
      id: 'finalize-conversation', type: 'function', function: { name: 'agent_core_finalize', arguments: JSON.stringify({
        outcome: 'verified', finalResponse: 'Halo!', learningDecision: 'no-new-knowledge', ...extra }) } }] } };
  }

  it.each([
    ['no evidence reference', {}],
    ['an evidence reference the runtime rejects', { evidenceRefs: ['conversation:halo'] }],
  ])('completes a conversation-only turn with %s instead of failing the task', async (_name, extra) => {
    const { controller, runtime, fetchMock } = await fixture([conversationFinalize(extra)]);
    const result = await controller.runTask({ prompt: 'halo' });
    expect(result.status).toBe('finalized');
    expect(result.response).toContain('Halo!');
    expect(result.jobVerification).toBe('unavailable');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const task = await runtime.getTask(result.taskId);
    expect(task).toEqual(expect.objectContaining({ status: 'finalized', terminalOutcome: 'verified',
      evidenceRefs: [`activity:native-turn:${result.taskId}`] }));
    expect(task!.episodes.some(episode => /Conversation-only turn/.test(episode.summary))).toBe(true);
  });

  it('returns a verified claim after tool work without usable evidence to the model for correction', async () => {
    const toolChoice = { finish_reason: 'tool_calls', message: { content: null,
      tool_calls: [{ id: 'tool-1', type: 'function', function: { name: 'get_config', arguments: '{}' } }] } };
    const unproven = conversationFinalize({ evidenceRefs: ['conversation:halo'], finalResponse: 'claimed' });
    const { controller, fetchMock } = await fixture([strategyChoice(), toolChoice, unproven, finalizeChoice('corrected')], ['get_config']);
    const result = await controller.runTask({ prompt: 'inspect config then finish' });
    expect(result.status).toBe('finalized');
    expect(result.response).toBe('corrected');
    expect(fetchMock).toHaveBeenCalledTimes(4);
    const fourth = JSON.parse(String((fetchMock.mock.calls[3] as any)[1]?.body ?? '{}'));
    const blocked = fourth.messages.find((message: any) => message.role === 'tool' && message.name === 'agent_core_finalize');
    expect(blocked.content).toContain('FINALIZATION_BLOCKED');
    expect(blocked.content).toContain('tool:');
  });

  it('does not let a conversation-only turn carry a lesson without evidence', async () => {
    const withLesson = conversationFinalize({ learningDecision: undefined,
      candidates: [{ kind: 'durable-fact', content: 'A claim nobody checked', verified: true }] });
    const { controller, fetchMock } = await fixture([withLesson, finalizeChoice('corrected')]);
    const result = await controller.runTask({ prompt: 'halo' });
    expect(result.response).toBe('corrected');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('tells the model to stay concise, to separate depth from plain language, and not to force Skills on a simple turn', async () => {
    const { controller, fetchMock } = await fixture([conversationFinalize()]);
    await controller.runTask({ prompt: 'halo' });
    const request = JSON.parse(String((fetchMock.mock.calls[0] as any)[1]?.body ?? '{}'));
    const system = request.messages.filter((message: any) => message.role === 'system').map((message: any) => message.content).join('\n');
    expect(system).toContain('RESPONSE STYLE (default: concise');
    for (const word of ['jelaskan', 'perinci', 'rinci', 'detail', 'sederhana', 'simple', 'singkat']) expect(system).toContain(word);
    expect(system).toContain('about easy language, not length');
    expect(system).toContain('Length changes ONLY on explicit words');
    expect(system).toContain('Without such a word stay short');
    expect(system).toContain('PROPORTIONALITY');
    expect(system).toContain('MEMORY ACCESS: you do have persistent Memory');
    expect(system).toContain('Never say you have no memory');
    expect(system).toContain('never force them on a simple turn');
    const guidance = request.messages.find((message: any) => message.content?.startsWith('NATIVE SKILL GUIDANCE'))?.content ?? '';
    expect(guidance).toContain('Simple conversation');
    expect(guidance).toContain('Skipping is correct there, never a violation');
    expect(guidance).not.toContain('At each task and material change');
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

  it('loads a granted dynamic tool schema on demand in the same turn before ordinary tool use', async () => {
    const { controller, fetchMock, runtime } = await fixture([
      toolboxChoice(['get_usage_stats']),
      strategyChoice('Inspect local usage statistics after loading the tool schema'),
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
    // Dynamic mode grants the registered surface immediately and never presents the capability-request tool.
    expect(firstTools).not.toContain('agent_core_request_capabilities');
    expect(firstTools).toContain('agent_core_toolbox');
    expect(firstTools).not.toContain('get_usage_stats');
    expect(secondTools).toContain('get_usage_stats');
    const toolboxResult = secondRequest.messages.find((message: any) =>
      message.role === 'tool' && message.name === 'agent_core_toolbox');
    expect(String(toolboxResult?.content ?? '')).toMatch(/^TOOLBOX_LOADED: get_usage_stats/);

    const task = await runtime.getTask(result.taskId);
    expect(task?.episodes.some(episode =>
      episode.summary.includes('Native MCP tool authority=')
      && episode.summary.includes('schema loading=on-demand'))).toBe(true);
  });

  it('does not run a tool call that the output token limit cut off, and says why', async () => {
    const cutOff = {
      finish_reason: 'length',
      message: { content: null, tool_calls: [{ id: 'tool-cut', type: 'function', function: { name: 'get_config', arguments: '{}' } }] },
    };
    const { controller, fetchMock, runtime } = await fixture([strategyChoice(), cutOff, finalizeChoice('after the cut')], ['get_config']);
    const result = await controller.runTask({ prompt: 'inspect config then finish' });
    expect(result.status).toBe('finalized');
    const thirdRequest = JSON.parse(String((fetchMock.mock.calls[2] as any)[1]?.body ?? '{}'));
    const toolMessage = thirdRequest.messages.find((message: any) => message.role === 'tool' && message.name === 'get_config');
    expect(toolMessage.content).toContain('FINISH_TRUNCATED_BY_LIMIT');
    expect(JSON.stringify(thirdRequest.messages)).not.toContain('allowedDirectories');
    const task = await runtime.getTask(result.taskId);
    expect(task?.episodes.some(episode => episode.kind === 'failure' && episode.summary.includes('get_config'))).toBe(false);
    expect(task?.episodes.some(episode => episode.kind === 'observation' && episode.summary.includes('output token limit'))).toBe(true);
  });

  it('names a tool call to an ungranted tool as denied by policy', async () => {
    const denied = {
      finish_reason: 'tool_calls',
      message: { content: null, tool_calls: [{ id: 'tool-denied', type: 'function', function: { name: 'get_usage_stats', arguments: '{}' } }] },
    };
    const { controller, fetchMock } = await fixture([
      strategyChoice(), denied, strategyChoice('Choose another route after the denial'), finalizeChoice('after the denial'),
    ], ['get_config']);
    const result = await controller.runTask({ prompt: 'inspect usage then finish' });
    expect(result.status).toBe('finalized');
    const thirdRequest = JSON.parse(String((fetchMock.mock.calls[2] as any)[1]?.body ?? '{}'));
    const toolMessage = thirdRequest.messages.find((message: any) => message.role === 'tool' && message.name === 'get_usage_stats');
    expect(toolMessage.content).toContain('TOOL_ERROR');
    expect(toolMessage.content).toContain('TOOL_OUTCOME: denied-by-policy');
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
