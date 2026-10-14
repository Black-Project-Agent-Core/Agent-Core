import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { NativeAgentController } from '../src/agent-controller.js';
import { AgentRuntimeService } from '../src/agent-runtime.js';
import { LearningService } from '../src/learning/service.js';
import { MemoryService } from '../src/memory/service.js';
import type { AgentRuntimeConfig } from '../src/agent-provider.js';

const roots: string[] = [];
const servers: ReturnType<typeof createServer>[] = [];

afterEach(async () => {
  for (const server of servers.splice(0)) {
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
  for (const root of roots.splice(0)) {
    await rm(root, { recursive: true, force: true });
  }
});

async function services() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-shared-knowledge-'));
  roots.push(root);
  const memoryDir = path.join(root, 'runtime', 'memory');
  await mkdir(path.join(memoryDir, 'notes'), { recursive: true });
  await writeFile(
    path.join(memoryDir, '00-agent-core-memory.md'),
    '# Agent Core Foundational Memory\n\nShared knowledge parity fixture.\n',
  );
  const memory = await MemoryService.initialize(root, memoryDir);
  const learning = await LearningService.initialize({
    enabled: true,
    stateDir: path.join(root, 'runtime', 'learning'),
    reviewInterval: 10,
    curatorIntervalHours: 168,
  }, memory);
  return { root, memory, learning };
}
async function provider(messages: any[]) {
  let index = 0;
  const server = createServer(async (request, response) => {
    for await (const _chunk of request) { /* drain */ }
    const message = messages[index++];
    if (!message) {
      response.writeHead(500, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: { message: 'unexpected provider call' } }));
      return;
    }
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({
      choices: [{ finish_reason: 'tool_calls', message }],
    }));
  });
  servers.push(server);
  return new Promise<string>(resolve => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('provider unavailable');
      resolve('http://127.0.0.1:' + address.port + '/v1');
    });
  });
}

function config(baseUrl: string): AgentRuntimeConfig {
  return {
    enabled: true,
    baseUrl,
    model: 'shared-knowledge-model',
    apiKey: null,
    requestTimeoutMs: 5_000,
    maxToolIterations: 4,
    allowedTools: [],
  };
}

function strategy(memoryId: string) {
  return {
    content: null,
    tool_calls: [{
      id: 'strategy',
      type: 'function',
      function: {
        name: 'agent_core_strategy',
        arguments: JSON.stringify({
          strategy: 'Reuse the canonical prior lesson for this matched task.',
          hypothesis: 'The retrieved canonical Memory item is applicable.',
          expectedObservation: 'The task can finalize with the prior lesson recorded as applied.',
          knowledgeUse: [{
            memoryId,
            applicability: 'applied',
            reasonCode: 'matched-task',
            summary: 'Reused the external-controller lesson.',
          }],
        }),
      },
    }],
  };
}
function finalizeWithNoCapture(response: string) {
  return {
    content: null,
    tool_calls: [{
      id: 'finalize',
      type: 'function',
      function: {
        name: 'agent_core_finalize',
        arguments: JSON.stringify({
          outcome: 'verified',
          reason: 'verified-recovery',
          verificationRef: 'verification:external-to-native',
          finalResponse: response,
          nothingWorthSaving: true,
        }),
      },
    }],
  };
}

function finalizeWithNativeKnowledge(ref = 'verification:native-to-external') {
  return {
    content: null,
    tool_calls: [{
      id: 'finalize-native',
      type: 'function',
      function: {
        name: 'agent_core_finalize',
        arguments: JSON.stringify({
          outcome: 'verified',
          reason: 'verified-recovery',
          verificationRef: ref,
          finalResponse: 'native knowledge captured',
          candidates: [{
            kind: 'durable-fact',
            title: 'Native parity durable lesson',
            content: 'NACP native-to-external marker ORCHID-7421 is reusable durable knowledge.',
            evidenceRefs: [ref],
            verified: true,
            workspace: 'fixture',
            tags: ['nacp', 'shared-knowledge'],
          }],
        }),
      },
    }],
  };
}
describe('Native Agent shared canonical knowledge parity', () => {
  it('reuses external-controller canonical Memory and records a Native knowledge-use receipt', async () => {
    const { root, memory, learning } = await services();
    const prior = await memory.remember({
      title: 'External controller parity lesson',
      content: 'Use SHARED-PARITY-LESSON-991 when the matched parity task asks for it.',
      provenance: { workspace: 'fixture', repo: 'fixture', files: [] },
    });
    const preflight = await memory.search('SHARED-PARITY-LESSON-991', {
      workspace: 'fixture',
      rankingProfile: 'fusion',
      limit: 5,
    });
    expect(preflight.some(item => item.record.id === prior.id)).toBe(true);
    const baseUrl = await provider([
      strategy(prior.id),
      finalizeWithNoCapture('external lesson reused'),
    ]);
    const runtimeConfig = config(baseUrl);
    const runtime = await AgentRuntimeService.initialize(root, learning, runtimeConfig, memory);
    const controller = new NativeAgentController(runtime, {
      memoryService: memory,
      learningService: learning,
    }, runtimeConfig);

    const session = await runtime.startSession({
      sessionId: 'external-to-native-session',
      provider: 'openai-compatible',
      model: 'shared-knowledge-model',
    });
    const result = await controller.runConversationTurn({
      sessionId: session.id,
      prompt: 'Use the prior canonical parity lesson for this matched task.',
      memoryQuery: 'SHARED-PARITY-LESSON-991',
      workspace: 'fixture',
      taskId: 'external-to-native-task',
    });
    expect(result.status).toBe('finalized');
    const task = await runtime.getTask('external-to-native-task');
    expect(task?.knowledgeUse).toContainEqual(expect.objectContaining({
      memoryId: prior.id,
      applicability: 'applied',
      reasonCode: 'matched-task',
    }));
    expect(task?.metrics.knowledgeUseReceipts).toBeGreaterThan(0);
  });

  it('promotes Native verified knowledge into canonical Memory for a fresh external search', async () => {
    const { root, memory, learning } = await services();
    const evidence = 'NACP native-to-external marker ORCHID-7421 is reusable durable knowledge.';
    const evidenceFile = path.join(root, 'verified-source.txt'); await writeFile(evidenceFile, evidence);
    const ref = 'file:' + evidenceFile + '#sha256:' + createHash('sha256').update(evidence).digest('hex');
    const baseUrl = await provider([finalizeWithNativeKnowledge(ref)]);
    const runtimeConfig = config(baseUrl);
    const runtime = await AgentRuntimeService.initialize(root, learning, runtimeConfig, memory);
    const controller = new NativeAgentController(runtime, {
      memoryService: memory,
      learningService: learning,
    }, runtimeConfig);

    const result = await controller.runTask({
      prompt: 'Verify and retain the reusable ORCHID-7421 parity lesson.',
      workspace: 'fixture',
      taskId: 'native-to-external-task',
    });
    expect(result.status).toBe('finalized');

    const freshExternalView = await MemoryService.initialize(
      root,
      path.join(root, 'runtime', 'memory'),
    );
    const found = await freshExternalView.search('ORCHID-7421', {
      workspace: 'fixture',
      rankingProfile: 'fusion',
      limit: 5,
    });
    expect(found.some(item =>
      item.record.title === 'Native parity durable lesson'
      && item.record.content.includes('ORCHID-7421'))).toBe(true);
  });

  it('records knowledge-use receipts for canonical Memory found through granted memory_search', async () => {
    const { root, memory, learning } = await services();
    const prior = await memory.remember({
      title: 'Direct search parity lesson',
      content: 'DIRECT-SEARCH-RECEIPT-441 is the receipted shared lesson.',
      provenance: { workspace: 'fixture', repo: 'fixture', files: [] },
    });
    const capability = {
      content: null,
      tool_calls: [{
        id: 'capability',
        type: 'function',
        function: {
          name: 'agent_core_request_capabilities',
          arguments: JSON.stringify({
            families: ['memory.read'],
            reason: 'Search canonical Memory for the matched shared lesson.',
            expectedActions: ['memory_search'],
          }),
        },
      }],
    };
    const initialStrategy = {
      content: null,
      tool_calls: [{
        id: 'strategy-before-search',
        type: 'function',
        function: {
          name: 'agent_core_strategy',
          arguments: JSON.stringify({
            strategy: 'Search canonical Memory for the exact shared marker.',
            hypothesis: 'The marker is stored in canonical Memory.',
            expectedObservation: 'memory_search returns the matching canonical item with retrieval evidence.',
          }),
        },
      }],
    };
    const search = {
      content: null,
      tool_calls: [{
        id: 'search',
        type: 'function',
        function: {
          name: 'memory_search',
          arguments: JSON.stringify({
            query: 'DIRECT-SEARCH-RECEIPT-441',
            workspace: 'fixture',
            rankingProfile: 'fusion',
            limit: 5,
            maxNeighbors: 0,
            budgetChars: 5_000,
          }),
        },
      }],
    };
    const useStrategy = strategy(prior.id);
    const baseUrl = await provider([
      capability,
      initialStrategy,
      search,
      useStrategy,
      finalizeWithNoCapture('direct search lesson reused'),
    ]);
    const runtimeConfig: AgentRuntimeConfig = {
      ...config(baseUrl),
      maxToolIterations: 6,
      capabilityPolicy: 'dynamic',
      allowedCapabilities: ['memory.read'],
    };
    const runtime = await AgentRuntimeService.initialize(root, learning, runtimeConfig, memory);
    const controller = new NativeAgentController(runtime, {
      memoryService: memory,
      learningService: learning,
    }, runtimeConfig);

    const result = await controller.runTask({
      prompt: 'Search canonical Memory and reuse DIRECT-SEARCH-RECEIPT-441.',
      workspace: 'fixture',
      taskId: 'direct-search-receipt-task',
    });
    expect(result.status).toBe('finalized');
    const task = await runtime.getTask('direct-search-receipt-task');
    expect(task?.knowledgeUse).toContainEqual(expect.objectContaining({
      memoryId: prior.id,
      applicability: 'applied',
      reasonCode: 'matched-task',
    }));
    expect(task?.metrics.knowledgeUseReceipts).toBeGreaterThan(0);
    expect(task?.retrievalAttemptIds.length).toBeGreaterThan(0);
  });
});
