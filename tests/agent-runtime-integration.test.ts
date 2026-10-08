import { createServer } from 'node:http';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { NativeAgentController } from '../src/agent-controller.js';
import { AgentRuntimeService } from '../src/agent-runtime.js';
import { LearningService } from '../src/learning/service.js';
import { MemoryService } from '../src/memory/service.js';

const roots: string[] = [];
const servers: ReturnType<typeof createServer>[] = [];

afterEach(async () => {
  for (const server of servers.splice(0)) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

async function fixtureRoot() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-runtime-integration-'));
  roots.push(root);
  const memoryDir = path.join(root, 'runtime', 'memory');
  await mkdir(path.join(memoryDir, 'notes'), { recursive: true });
  await writeFile(path.join(memoryDir, '00-agent-core-memory.md'), '# Agent Core Foundational Memory\n\nIntegration fixture foundation.\n');
  return { root, memoryDir };
}

function startProvider(requests: any[]) {
  let turn = 0;
  const server = createServer(async (request, response) => {
    const body: Buffer[] = [];
    for await (const chunk of request) body.push(Buffer.from(chunk));
    const payload = JSON.parse(Buffer.concat(body).toString('utf8'));
    requests.push(payload);
    turn += 1;
    const message = turn === 1
      ? {
          content: null,
          tool_calls: [{
            id: 'tool-strategy',
            type: 'function',
            function: {
              name: 'agent_core_strategy',
              arguments: JSON.stringify({
                strategy: 'Inspect configuration before finalization',
                hypothesis: 'Configuration evidence will establish the runtime state.',
                expectedObservation: 'get_config returns an inspectable configuration payload.',
              }),
            },
          }],
        }
      : turn === 2
        ? {
            content: null,
            tool_calls: [{
              id: 'tool-config',
              type: 'function',
              function: { name: 'get_config', arguments: '{}' },
            }],
          }
        : {
          content: null,
          tool_calls: [{
            id: 'tool-finalize',
            type: 'function',
            function: {
              name: 'agent_core_finalize',
              arguments: JSON.stringify({
                outcome: 'verified',
                reason: 'verified-recovery',
                verificationRef: 'verification:integration-pass',
                finalResponse: 'integration complete',
                nothingWorthSaving: true,
              }),
            },
          }],
        };
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({
      choices: [{ finish_reason: 'tool_calls', message }],
    }));
  });
  servers.push(server);
  return new Promise<{ baseUrl: string }>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('provider address unavailable');
      resolve({ baseUrl: `http://127.0.0.1:${address.port}/v1` });
    });
  });
}

describe('native Agent Runtime integrated provider loop', () => {
  it('runs Memory-first -> existing MCP tool -> mandatory Learning finalization over real loopback HTTP', async () => {
    const { root, memoryDir } = await fixtureRoot();
    const memory = await MemoryService.initialize(root, memoryDir);
    await memory.remember({
      title: 'Integration prior lesson',
      content: 'Inspect configuration before declaring the integration complete.',
      provenance: { workspace: 'fixture', repo: 'fixture', files: [] },
    });
    const learning = await LearningService.initialize({
      enabled: true,
      stateDir: path.join(root, 'runtime', 'learning'),
      reviewInterval: 10,
      curatorIntervalHours: 168,
    }, memory);
    const requests: any[] = [];
    const provider = await startProvider(requests);
    const config = {
      enabled: true,
      baseUrl: provider.baseUrl,
      model: 'integration-model',
      apiKey: null,
      requestTimeoutMs: 5_000,
      maxToolIterations: 4,
      allowedTools: ['get_config'],
    };
    const runtime = await AgentRuntimeService.initialize(root, learning, config, memory);
    const controller = new NativeAgentController(runtime, {
      memoryService: memory,
      learningService: learning,
    }, config);

    const result = await controller.runTask({
      prompt: 'Repair the integration fixture and inspect config before finalizing.',
      workspace: 'fixture',
      taskId: 'integration-task',
    });

    expect(result.status).toBe('finalized');
    expect(result.response).toBe('integration complete');
    expect(result.iterations).toBe(3);
    expect(result.retrievalAttemptIds.length).toBeGreaterThan(0);
    expect(requests).toHaveLength(3);
    expect(JSON.stringify(requests[0].messages)).toContain('LOCAL MEMORY CONTEXT');
    expect(JSON.stringify(requests[0].messages)).toContain('Agent Core Foundational Memory');
    expect(JSON.stringify(requests[0].messages)).toContain(
      "Act as the creator's senior technical peer",
    );
    expect(JSON.stringify(requests[0].messages)).toContain(
      'do not behave as a yes-only assistant',
    );
    expect(JSON.stringify(requests[0].messages)).toContain(
      'privacy concerns are not a reason to self-block inside the approved scope',
    );
    expect(JSON.stringify(requests[0].messages)).toContain(
      'At final response disclose material actions',
    );
    expect(JSON.stringify(requests[2].messages)).toContain('allowedDirectories');
    const task = await runtime.getTask('integration-task');
    expect(task).toEqual(expect.objectContaining({
      status: 'finalized',
      terminalOutcome: 'verified',
      verificationRef: 'verification:integration-pass',
      finalization: expect.objectContaining({
        status: 'complete',
        reason: 'verified-recovery',
        reviewDue: true,
      }),
    }));

    const learningStatus: any = await learning.status();
    expect(learningStatus.pendingReviewCount).toBe(0);
    expect(learningStatus.reviewDue).toBe(false);
    expect(learningStatus.state.lastReviewAt).toBeTruthy();

    const reopened = await AgentRuntimeService.initialize(root, learning, config, memory);
    expect(await reopened.getTask('integration-task')).toEqual(expect.objectContaining({
      status: 'finalized',
      terminalOutcome: 'verified',
    }));
    expect((await reopened.health()).pendingFinalizationCount).toBe(0);
  });
});
