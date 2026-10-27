import { createHash } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AgentChatService } from '../src/agent-chat-service.js';
import { NativeAgentController } from '../src/agent-controller.js';
import { AgentRuntimeService } from '../src/agent-runtime.js';
import { LearningService } from '../src/learning/service.js';
import { MemoryService } from '../src/memory/service.js';
import { AgentRuntimeToolSession } from '../src/agent-tool-session.js';
import {
  registerWorkflowVerification, recheckWorkflowReport, verifyWorkflowAnswer,
  WORKFLOW_VERIFIER_REVISION,
} from '../src/memory/workflow-verifier.js';
import { browserControlService } from '../src/rdc/browser-control/service.js';
import { configManager } from '../src/rdc/config-manager.js';
import { usageTracker } from '../src/rdc/utils/usageTracker.js';

const roots: string[] = [];
const servers: Server[] = [];
const browserSessions: string[] = [];

afterEach(async () => {
  for (const id of browserSessions.splice(0)) await browserControlService.close(id).catch(() => undefined);
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) {
    const resolved = path.resolve(root);
    expect(path.dirname(resolved)).toBe(path.resolve(os.tmpdir()));
    expect(path.basename(resolved)).toMatch(/^native-donor-workflows-/);
    await rm(resolved, { recursive: true, force: true });
  }
});

function choice(name: string, args: Record<string, unknown>, id = name) {
  return { choices: [{ finish_reason: 'tool_calls', message: { content: null,
    tool_calls: [{ id, type: 'function', function: { name, arguments: JSON.stringify(args) } }],
  } }] };
}

function strategy(text: string, knowledgeUse: unknown[] = []) {
  return choice('agent_core_strategy', {
    strategy: text,
    hypothesis: 'The granted local action provides inspectable evidence for this fixture.',
    expectedObservation: 'The artifact or observed page satisfies the sealed acceptance case.',
    knowledgeUse,
  });
}

function lastTool(request: any, name: string) {
  const message = request.messages.findLast((item: any) => item.role === 'tool' && item.name === name);
  expect(message, `missing ${name} result`).toBeTruthy();
  expect(message.content).not.toContain('TOOL_ERROR');
  return message.content as string;
}

function browserResult(request: any) {
  return JSON.parse(lastTool(request, 'browser_control').split('\n\nAGENT_CORE_EVIDENCE_REF=')[0]!);
}

const digest = (text: string) => 'sha256:' + createHash('sha256').update(text).digest('hex');

async function listen(server: Server) {
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('fixture server unavailable');
  return 'http://127.0.0.1:' + address.port;
}

async function fixture(steps: Array<(request: any) => any>, allowedTools: string[], capabilityPolicy?: 'dynamic' | 'read-only') {
  const root = await mkdtemp(path.join(os.tmpdir(), 'native-donor-workflows-'));
  roots.push(root);
  const memoryDir = path.join(root, 'runtime', 'memory');
  await mkdir(path.join(memoryDir, 'notes'), { recursive: true });
  await writeFile(path.join(memoryDir, '00-agent-core-memory.md'),
    '# Agent Core Foundational Memory\n\nIsolated workflow contract fixture.\n');
  // Keep filesystem policy scoped to this fixture; do not update the user's RDC usage/config.
  vi.spyOn(configManager, 'getConfig').mockResolvedValue({ allowedDirectories: [root], telemetryEnabled: false });
  vi.spyOn(usageTracker, 'trackSuccess').mockResolvedValue({} as any);
  vi.spyOn(usageTracker, 'trackFailure').mockResolvedValue({} as any);
  const memory = await MemoryService.initialize(root, memoryDir);
  await memory.registerWorkspaceAliases([{ name: 'fixture', repos: [{ path: root }] }]);
  const learning = await LearningService.initialize({
    enabled: true, stateDir: path.join(root, 'runtime', 'learning'),
    reviewInterval: 10, curatorIntervalHours: 168,
  }, memory);
  const requests: any[] = [];
  const providerErrors: unknown[] = [];
  const baseUrl = await listen(createServer(async (request, response) => {
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      requests.push(payload);
      expect(request.url).toBe('/v1/chat/completions');
      expect(payload.stream).toBe(false);
      const next = steps.shift();
      if (!next) throw new Error('unexpected fixture model call: ' + JSON.stringify(payload.messages.slice(-2)));
      const result = await next(payload);
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify(result));
    } catch (error) {
      providerErrors.push(error);
      response.writeHead(500, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: { message: String(error) } }));
    }
  }));
  const config = { enabled: true, baseUrl: baseUrl + '/v1', model: 'deterministic-workflow-fixture',
    apiKey: null, requestTimeoutMs: 5_000, maxToolIterations: 10, allowedTools, capabilityPolicy };
  const runtime = await AgentRuntimeService.initialize(root, learning, config, memory);
  const controller = new NativeAgentController(runtime, { memoryService: memory, learningService: learning }, config);
  const chat = await AgentChatService.initialize(root, runtime, controller);
  return { root, memory, learning, runtime, chat, requests, providerErrors };
}

async function report(root: string, request: any, casePath: string, answerPath: string) {
  const evidence = lastTool(request, 'read_file');
  const taskId = /AGENT_CORE_EVIDENCE_REF=tool:dtc:([^:]+):/.exec(evidence)?.[1];
  if (!taskId) throw new Error('missing task-bound tool receipt');
  const [test, answer] = await Promise.all([readFile(casePath, 'utf8'), readFile(answerPath, 'utf8')]);
  expect(verifyWorkflowAnswer(JSON.parse(test), answer).verdict).toBe('pass');
  const value = JSON.stringify({ verifierRevision: WORKFLOW_VERIFIER_REVISION, taskId,
    case: { path: casePath, digest: digest(test) }, answer: { path: answerPath, digest: digest(answer) } });
  const reportPath = path.join(root, taskId + '-report.json');
  await writeFile(reportPath, value);
  registerWorkflowVerification({ taskId, case: { path: casePath, digest: digest(test) }, answerPath });
  const ref = 'verification:' + reportPath + '#' + digest(value);
  expect(await recheckWorkflowReport(ref, taskId)).toBe('pass');
  return { ref, actionRef: 'file:' + answerPath + '#' + digest(answer) };
}

// Scripted model responses exercise real owners and artifacts; they do not measure model intelligence or causal Memory benefit.
describe('Native donor roadmap isolated workflow contracts', () => {
  it.each(['oracle', 'memory-store', 'process'])('denies evaluated %s access before any ordinary tool dispatch', async target => {
    const steps: Array<(request: any) => any> = [];
    const fx = await fixture(steps, ['read_file', 'write_file', 'start_process']);
    const folder = path.join(fx.root, 'runtime', 'tmp', 'native-memory-reuse', 'denied-' + target);
    await mkdir(folder, { recursive: true });
    const casePath = path.join(folder, 'oracle.json'), inputPath = path.join(folder, 'document.txt');
    const answerPath = path.join(folder, 'answer.js');
    const test = JSON.stringify({ domain: 'engineering', tests: [{ input: 1, expected: 3 }] });
    await writeFile(casePath, test);
    await writeFile(inputPath, 'The isolated offset function adds two.');
    const forbiddenName = target === 'process' ? 'start_process' : 'read_file';
    const forbiddenArgs = target === 'process' ? { command: 'node -e "throw new Error()"', timeout_ms: 1000 }
      : { path: target === 'oracle' ? casePath : path.join(fx.root, 'runtime', 'memory', '00-agent-core-memory.md') };
    steps.push(request => {
      expect(request.tools.filter((item: any) => !item.function.name.startsWith('agent_core_'))
        .map((item: any) => item.function.name).sort()).toEqual(['read_file', 'write_file']);
      expect(JSON.stringify(request.messages)).not.toContain(test);
      return strategy('Inspect only the admitted fixture input.');
    }, () => choice(forbiddenName, forbiddenArgs), request => {
      const denied = request.messages.findLast((item: any) => item.role === 'tool' && item.name === forbiddenName);
      expect(denied?.content).toContain('AGENT_RUNTIME_EVALUATION_SCOPE_DENIED');
      expect(denied?.content).toContain('Additional capability requests cannot extend evaluation scope');
      return strategy('The forbidden request was refused; complete this fixture without any ordinary tool action.');
    }, () => choice('agent_core_finalize', { outcome: 'failed', learningDecision: 'no-new-knowledge', finalResponse: 'The forbidden access was refused.' }));
    // The host oracle can verify an independently supplied fixture artifact; the model never reads it.
    await writeFile(answerPath, 'n => n + 2');
    const dispatched = vi.spyOn(AgentRuntimeToolSession.prototype, 'call');
    const conversation = await fx.chat.createConversation({ workspace: 'fixture' });
    const result = await fx.chat.runTurn({ conversationId: conversation.conversation.id,
      clientRequestId: 'denied-' + target, prompt: 'Inspect only ' + inputPath + ' and use no process execution.',
      evaluation: { pairId: 'denied-' + target, arm: 'seed', lessonTitle: 'Denied fixture', inputPath,
        oracle: { casePath, caseDigest: digest(test), answerPath } } });
    expect(result.status).toBe('finalized');
    expect(dispatched).not.toHaveBeenCalled();
    expect(await readFile(casePath, 'utf8')).toBe(test);
    expect(fx.providerErrors).toEqual([]);
    expect(steps).toEqual([]);
  }, 60_000);

  it('binds a verified seed revision, omits it before disclosure, and persists checked reuse in fresh chats', async () => {
    const steps: Array<(request: any) => any> = [];
    const fx = await fixture(steps, ['read_file', 'write_file', 'memory_search']);
    const folder = path.join(fx.root, 'runtime', 'tmp', 'native-memory-reuse', 'contract');
    await mkdir(folder, { recursive: true });
    const casePath = path.join(folder, 'oracle.json');
    const caseText = JSON.stringify({ domain: 'engineering', tests: [
      { input: -3, expected: -1 }, { input: 0, expected: 2 }, { input: 10, expected: 12 },
    ] });
    await writeFile(casePath, caseText);
    const inputPath = path.join(folder, 'document.txt');
    await writeFile(inputPath, 'The isolated offset contract maps n to n + 2.');
    const lessonTitle = 'NATIVE-EVAL-CONTRACT-419 offset revision';
    const prompt = 'NATIVE-EVAL-CONTRACT-419: write the verified offset artifact to the given isolated answer path.';
    const seedAnswer = path.join(folder, 'seed.js');
    const recall = vi.spyOn(fx.runtime, 'assembleMemoryContext');
    const foreign = await fx.chat.createConversation({ workspace: 'unregistered-fixture' });
    await expect(fx.chat.runTurn({ conversationId: foreign.conversation.id, clientRequestId: 'eval-unregistered',
      prompt, evaluation: { pairId: 'unregistered', arm: 'seed', lessonTitle, inputPath,
        oracle: { casePath, caseDigest: digest(caseText), answerPath: seedAnswer } } }))
      .rejects.toThrow('WORKSPACE_IDENTITY_UNVERIFIED');
    expect(recall).not.toHaveBeenCalled();
    expect(fx.requests).toHaveLength(0);
    steps.push(() => strategy('Write the offset artifact, then let the independent host oracle check it.'),
      () => choice('write_file', { path: seedAnswer, content: 'n => n + 2', mode: 'rewrite' }),
      () => choice('read_file', { path: seedAnswer }),
      request => {
        const readback = request.messages.findLast((item: any) => item.role === 'tool' && item.name === 'read_file');
        expect(readback?.content).not.toContain('TOOL_ERROR');
        expect(readback?.content).toContain('n => n + 2');
        expect(JSON.stringify(request.messages)).not.toContain(caseText);
        return choice('agent_core_finalize', { outcome: 'verified', reason: 'explicit-learn',
        evidenceRefs: ['file:' + seedAnswer + '#' + digest('n => n + 2')], finalResponse: 'The seed artifact is ready for the host check.',
        candidates: [{ kind: 'durable-fact', title: lessonTitle,
          content: 'NATIVE-EVAL-CONTRACT-419 uses n => n + 2 in this isolated offset fixture.',
          verified: true, tags: ['fixture', 'offset'] }] });
      });
    const seedChat = await fx.chat.createConversation({ workspace: 'fixture' });
    const oracle = { casePath, caseDigest: digest(caseText), answerPath: seedAnswer };
    const seed = await fx.chat.runTurn({ conversationId: seedChat.conversation.id, clientRequestId: 'eval-seed',
      prompt: prompt + ' ' + seedAnswer, evaluation: { pairId: 'contract-seed', arm: 'seed', lessonTitle, inputPath, oracle } });
    expect(fx.providerErrors, JSON.stringify({ seed, remainingSteps: steps.length,
      turn: fx.chat.store.getTurn(seed.turnId) })).toEqual([]);
    expect(seed).toMatchObject({ status: 'finalized', learningStatus: 'complete', jobVerification: 'pass',
      learnedLesson: { title: lessonTitle, contentDigest: expect.stringMatching(/^sha256:[a-f0-9]{64}$/) },
      metrics: { modelCalls: 4, toolCalls: 2 } });
    expect(seed.metrics?.costUsd).toBeUndefined();
    const lesson = seed.learnedLesson!;
    const seedMemoryIds = (await fx.memory.list('fixture')).map(item => item.id).sort();
    const seedProcedures = await fx.learning.procedures('fixture');
    const dispatched = vi.spyOn(AgentRuntimeToolSession.prototype, 'call');
    const paired: any[] = [];
    for (const arm of ['omit', 'reuse'] as const) {
      const answerPath = path.join(folder, arm + '.js');
      steps.push(request => {
        const context = JSON.stringify(request.messages);
        expect(context.includes(lesson.memoryId), context).toBe(arm === 'reuse');
        expect(request.tools.some((tool: any) => tool.function.name === 'memory_search')).toBe(false);
        return strategy('Use the admitted context and write the current offset artifact.', arm === 'reuse' ? [{
          memoryId: lesson.memoryId, applicability: 'adapted', reasonCode: 'matched-offset-contract',
          summary: 'Reuse the verified offset contract with this task-specific answer path.',
        }] : []);
      });
      if (arm === 'omit') {
        steps.push(() => choice('memory_search', { query: 'NATIVE-EVAL-CONTRACT-419' }, 'alternate-memory-path'),
          request => {
            const denied = request.messages.findLast((item: any) => item.role === 'tool' && item.name === 'memory_search');
            expect(denied?.content).toContain('AGENT_RUNTIME_EVALUATION_SCOPE_DENIED');
            return strategy('Continue with the admitted task input after the alternate Memory path was refused.');
          });
      }
      steps.push(() => choice('write_file', { path: answerPath, content: 'n => n + 2', mode: 'rewrite' }),
        () => choice('agent_core_finalize', { outcome: 'verified', reason: 'explicit-learn',
          evidenceRefs: ['file:' + answerPath + '#' + digest('n => n + 2')],
          finalResponse: 'Attempt to capture an extra paired-run lesson.',
          candidates: [{ kind: 'durable-fact', title: 'Forbidden paired ' + arm + ' lesson',
            content: 'The paired ' + arm + ' calibration answer must be written as a raw JavaScript expression; Markdown fences are outside the admitted artifact grammar.',
            verified: true }] }),
        request => {
          expect(lastTool(request, 'agent_core_finalize')).toContain('FINALIZATION_BLOCKED: paired Memory evaluation');
          expect(lastTool(request, 'agent_core_finalize')).toContain('no-new-knowledge');
          return choice('agent_core_finalize', { outcome: 'verified', reason: 'explicit-learn',
            evidenceRefs: ['file:' + answerPath + '#' + digest('n => n + 2')],
            finalResponse: 'Attempt to capture an extra paired-run procedure.',
            procedure: { name: 'forbidden-paired-' + arm, description: 'Repeat the isolated offset calculation.',
              steps: ['Read the admitted input.', 'Write the specified offset expression.'], allowedTools: ['read_file', 'write_file'] } });
        },
        request => {
          expect(lastTool(request, 'agent_core_finalize')).toContain('FINALIZATION_BLOCKED: paired Memory evaluation');
          return choice('agent_core_finalize', { outcome: 'verified', evidenceRefs: ['file:' + answerPath + '#' + digest('n => n + 2')],
            finalResponse: 'The paired artifact is ready for the host check.' });
        });
      const conversation = await fx.chat.createConversation({ workspace: 'fixture' });
      const input = { conversationId: conversation.conversation.id, clientRequestId: 'eval-' + arm,
        prompt: prompt + ' ' + answerPath, evaluation: { pairId: 'contract-pair', arm, inputPath,
          lessonMemoryId: lesson.memoryId, lessonContentDigest: lesson.contentDigest,
          oracle: { ...oracle, answerPath } } };
      const result = await fx.chat.runTurn(input);
      expect(fx.providerErrors, JSON.stringify(result)).toEqual([]);
      expect(result).toMatchObject({ status: 'finalized', learningStatus: 'complete', jobVerification: 'pass', evaluation: input.evaluation,
        settingsDigest: seed.settingsDigest, toolContractDigest: seed.toolContractDigest });
      expect((await fx.memory.list('fixture')).map(item => item.id).sort()).toEqual(seedMemoryIds);
      expect(await fx.learning.procedures('fixture')).toEqual(seedProcedures);
      expect(verifyWorkflowAnswer(JSON.parse(caseText), await readFile(answerPath, 'utf8')).verdict).toBe('pass');
      if (arm === 'reuse') expect(result.memoryUse).toContainEqual(expect.objectContaining({
        memoryId: lesson.memoryId, applicability: 'adapted', verification: 'pass',
      }));
      else expect(result.memoryUse?.some(use => use.memoryId === lesson.memoryId) ?? false).toBe(false);
      const beforeReplay = fx.requests.length;
      const reopened = await AgentChatService.initialize(fx.root, fx.runtime, (fx.chat as any).controller);
      const replay = await reopened.runTurn(input);
      expect(replay).toMatchObject({ replayed: true, taskId: result.taskId,
        metrics: result.metrics, evaluation: input.evaluation });
      expect(replay.memoryUse ?? []).toEqual(result.memoryUse ?? []);
      expect(fx.requests).toHaveLength(beforeReplay);
      paired.push(result);
    }
    expect(dispatched.mock.calls.some(call => call[0] === 'memory_search')).toBe(false);
    expect(paired[0].taskId).not.toBe(paired[1].taskId);
    expect(fx.providerErrors).toEqual([]);
    expect(steps).toEqual([]);
  }, 60_000);

  it.each(['tool-planned', 'tool-dispatching'])('dispatches zero mutations when durable %s admission fails', async phase => {
    const steps: Array<(request: any) => any> = [];
    const fx = await fixture(steps, ['write_file']);
    const target = path.join(fx.root, 'must-not-be-written.txt');
    steps.push(() => strategy('Write the isolated fixture only after durable admission.'),
      () => choice('write_file', { path: target, content: 'forbidden-side-effect', mode: 'rewrite' }));
    const dispatched = vi.spyOn(AgentRuntimeToolSession.prototype, 'call');
    const original = fx.chat.store.saveCheckpoint.bind(fx.chat.store);
    vi.spyOn(fx.chat.store, 'saveCheckpoint').mockImplementation(input => {
      if (input.phase === phase) throw new Error('fixture durable admission failure');
      return original(input);
    });
    const conversation = await fx.chat.createConversation({ workspace: 'fixture' });
    await expect(fx.chat.runTurn({ conversationId: conversation.conversation.id,
      clientRequestId: 'failed-admission-' + phase, prompt: 'Write only the isolated target after durable admission.' }))
      .rejects.toThrow('fixture durable admission failure');
    expect(dispatched.mock.calls.filter(call => call[0] === 'write_file')).toHaveLength(0);
    await expect(readFile(target, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    expect(steps).toHaveLength(0);
    expect(fx.providerErrors).toEqual([]);
  }, 60_000);

  it('grants a dynamic controller its ceiling-limited read-file surface at task start without a capability request', async () => {
    const steps: Array<(request: any) => any> = [];
    const fx = await fixture(steps, ['get_config', 'read_file'], 'dynamic');
    const inputPath = path.join(fx.root, 'read-only-input.txt');
    await writeFile(inputPath, 'READ-FAMILY-VERIFIED');
    steps.push(
      () => strategy('Read the single user-provided file.'),
      request => {
        // The operator's tool ceiling is the boundary: write_file is outside it and never offered.
        expect(request.tools.some((tool: any) => tool.function.name === 'write_file')).toBe(false);
        return choice('read_file', { path: inputPath });
      },
      request => {
        const evidence = lastTool(request, 'read_file');
        expect(evidence).toContain('READ-FAMILY-VERIFIED');
        const ref = 'file:' + inputPath + '#' + digest('READ-FAMILY-VERIFIED');
        return choice('agent_core_finalize', { outcome: 'verified', evidenceRefs: [ref],
          finalResponse: 'READ-FAMILY-VERIFIED', learningDecision: 'no-new-knowledge' });
      },
    );
    const conversation = await fx.chat.createConversation({ workspace: 'fixture' });
    const result = await fx.chat.runTurn({ conversationId: conversation.conversation.id,
      clientRequestId: 'dynamic-read-family', prompt: 'Read only the exact input file: ' + inputPath });
    expect(result).toMatchObject({ status: 'finalized', learningStatus: 'complete', jobVerification: 'unavailable' });
    expect(fx.providerErrors).toEqual([]);
    const task = await fx.runtime.getTask(result.taskId);
    expect(task!.metrics.toolCalls).toBe(1);
    expect(task!.episodes.some(event => event.kind === 'failure' && event.toolName === 'read_file')).toBe(false);
    expect(steps).toHaveLength(0);
  });

  it('repairs a coding artifact, captures verified knowledge, and attributes same-store reuse in a fresh research task', async () => {
    const steps: Array<(request: any) => any> = [];
    const fx = await fixture(steps, ['read_file', 'read_multiple_files', 'write_file']);
    const answerPath = path.join(fx.root, 'offset.js');
    const casePath = path.join(fx.root, 'coding-case.json');
    const codingCase = { domain: 'engineering' as const, tests: [
      { input: -3, expected: -1 }, { input: 0, expected: 2 }, { input: 10, expected: 12 },
    ] };
    await writeFile(answerPath, 'n => n + 1');
    await writeFile(casePath, JSON.stringify(codingCase));
    expect(verifyWorkflowAnswer(codingCase, await readFile(answerPath, 'utf8')).verdict).toBe('fail');
    steps.push(
      () => strategy('Inspect the existing offset artifact, correct it, then read back before finalization.'),
      () => choice('read_file', { path: answerPath }, 'coding-before'),
      request => {
        expect(lastTool(request, 'read_file')).toContain('n => n + 1');
        return choice('write_file', { path: answerPath, content: 'n => n + 2', mode: 'rewrite' }, 'coding-repair');
      },
      request => {
        expect(lastTool(request, 'write_file')).toContain('Successfully wrote to');
        return choice('read_file', { path: answerPath }, 'coding-after');
      },
      async request => {
        expect(lastTool(request, 'read_file')).toContain('n => n + 2');
        const verified = await report(fx.root, request, casePath, answerPath);
        return choice('agent_core_finalize', {
          outcome: 'verified', reason: 'verified-recovery', verificationRef: verified.ref,
          evidenceRefs: [verified.actionRef], finalResponse: 'Offset repair verified for the three sealed inputs.',
          candidates: [{ kind: 'durable-fact', title: 'DONOR-FIXTURE-284 verified offset contract',
            content: 'DONOR-FIXTURE-284 uses n => n + 2. Inputs -3, 0 and 10 produce -1, 2 and 12 in this fixture only.',
            verified: true, evidenceRefs: [verified.actionRef], tags: ['fixture', 'offset'] }],
        });
      },
    );
    const firstConversation = await fx.chat.createConversation({ workspace: 'fixture' });
    const coding = await fx.chat.runTurn({ conversationId: firstConversation.conversation.id,
      clientRequestId: 'donor-coding', prompt: 'Repair the isolated offset contract using the sealed input/output cases.' });
    expect(coding).toMatchObject({ status: 'finalized', learningStatus: 'complete', jobVerification: 'pass' });
    expect(await readFile(answerPath, 'utf8')).toBe('n => n + 2');
    const hits = await fx.memory.search('DONOR-FIXTURE-284', { workspace: 'fixture', limit: 5 });
    const prior = hits.find(hit => hit.record.title === 'DONOR-FIXTURE-284 verified offset contract')?.record;
    expect(prior, 'Native Learning must persist the verified candidate in the temporary canonical store').toBeTruthy();

    const oldSource = path.join(fx.root, 'old-note.md');
    const currentSource = path.join(fx.root, 'verified-note.md');
    const researchAnswer = path.join(fx.root, 'research-answer.json');
    const researchCasePath = path.join(fx.root, 'research-case.json');
    await writeFile(oldSource, 'Historical offset: n => n + 1. Superseded by verified-note.md.');
    await writeFile(currentSource, 'DONOR-FIXTURE-284: verified offset is n => n + 2; this supersedes old-note.md.');
    const researchCase = { domain: 'research', facts: [
      { key: 'offset', value: 'n => n + 2', source: currentSource, supersedes: [oldSource] },
    ] };
    await writeFile(researchCasePath, JSON.stringify(researchCase));
    const researchText = JSON.stringify([
      { key: 'offset', value: 'n => n + 2', source: currentSource, contradictions: [oldSource] },
    ]);
    const requestBoundary = fx.requests.length;
    steps.push(
      request => {
        expect(JSON.stringify(request.messages)).toContain(prior!.id);
        return strategy('Apply the recalled fixture contract and check its current and superseded source notes.', [{
          memoryId: prior!.id, applicability: 'applied', reasonCode: 'matched-offset-contract',
          summary: 'The prior verified contract identifies which conflicting source to validate.',
        }]);
      },
      () => choice('read_multiple_files', { paths: [oldSource, currentSource] }, 'research-sources'),
      request => {
        const sources = lastTool(request, 'read_multiple_files');
        expect(sources).toContain('Superseded');
        expect(sources).toContain('n => n + 2');
        return choice('write_file', { path: researchAnswer, content: researchText, mode: 'rewrite' }, 'research-write');
      },
      () => choice('read_file', { path: researchAnswer }, 'research-readback'),
      async request => {
        const verified = await report(fx.root, request, researchCasePath, researchAnswer);
        return choice('agent_core_finalize', { outcome: 'verified', reason: 'task-complete',
          verificationRef: verified.ref, evidenceRefs: [verified.actionRef],
          finalResponse: 'Current offset documented with its source and superseded note.', nothingWorthSaving: true });
      },
    );
    const secondConversation = await fx.chat.createConversation({ workspace: 'fixture' });
    const finals: string[] = [];
    const input = { conversationId: secondConversation.conversation.id, clientRequestId: 'donor-research',
      prompt: 'Use DONOR-FIXTURE-284 to reconcile the old and current notes and write a sourced research artifact.' };
    const research = await fx.chat.runTurn({ ...input, eventSink: event => {
      if (event.type === 'assistant.final') {
        const persisted = fx.chat.getConversation(input.conversationId)!.messages.filter(message => message.role === 'assistant');
        expect(persisted.at(-1)?.content).toBe(event.response);
        finals.push(event.response);
      }
    } });
    expect(research).toMatchObject({ status: 'finalized', learningStatus: 'complete', jobVerification: 'pass' });
    expect(firstConversation.conversation.runtimeSessionId).not.toBe(secondConversation.conversation.runtimeSessionId);
    expect(await readFile(researchAnswer, 'utf8')).toBe(researchText);
    expect(finals).toEqual([research.response]);
    const task = await fx.runtime.getTask(research.taskId);
    expect(task?.knowledgeUse).toContainEqual(expect.objectContaining({ memoryId: prior!.id, applicability: 'applied' }));
    expect(task?.metrics.knowledgeUseReceipts).toBeGreaterThan(0);
    expect(fx.memory.retrievalLedgerStatus().receiptCount).toBeGreaterThan(0);
    const replay = await fx.chat.runTurn(input);
    expect(replay).toMatchObject({ replayed: true, response: research.response, taskId: research.taskId });
    expect(fx.requests).toHaveLength(requestBoundary + 5);
    expect(fx.providerErrors).toEqual([]);
    expect(steps).toEqual([]);
  }, 30_000);

  it('rejects a restricted browser action before dispatch rather than recording unknown side effects', async () => {
    const steps: Array<(request: any) => any> = [];
    // Dynamic mode grants the whole surface unrestricted; the read-only policy keeps per-action restrictions.
    const fx = await fixture(steps, ['browser_control'], 'read-only');
    const dispatched = vi.spyOn(AgentRuntimeToolSession.prototype, 'call');
    steps.push(
      () => strategy('Request only browser navigation; no act permission.'),
      () => choice('agent_core_request_capabilities', { families: ['browser.navigate'], reason: 'Inspect the fixture without acting.' }),
      () => strategy('Confirm a forbidden act is rejected locally without dispatch.'),
      () => choice('browser_control', { action: 'act', sessionId: '00000000-0000-0000-0000-000000000000' }, 'forbidden-act'),
      request => {
        const denied = request.messages.findLast((message: any) => message.role === 'tool' && message.name === 'browser_control');
        expect(denied?.content).toContain('TOOL_ERROR\nAGENT_RUNTIME_TOOL_ACTION_NOT_GRANTED');
        expect(denied?.content).toContain('No tool was dispatched.');
        return choice('agent_core_finalize', { outcome: 'failed', finalResponse: 'Restricted action was denied.', nothingWorthSaving: true });
      },
    );
    const conversation = await fx.chat.createConversation({ workspace: 'fixture' });
    const result = await fx.chat.runTurn({ conversationId: conversation.conversation.id,
      clientRequestId: 'restricted-browser-act', prompt: 'Click nothing unless specifically granted: inspect the browser and reject any unauthorized act.' });
    expect(result.status).toBe('finalized');
    expect(dispatched.mock.calls.filter(call => call[0] === 'browser_control')).toHaveLength(0);
    expect(fx.providerErrors).toEqual([]);
    expect(steps).toEqual([]);
  }, 30_000);

  it('executes an observed action in an owned Open Browser Use background tab and persists its actual final result', async () => {
    let completed = 0;
    const pageUrl = await listen(createServer((request, response) => {
      if (request.method === 'POST' && request.url === '/complete') {
        completed++;
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        response.end('<!doctype html><html><body><p>DONE</p></body></html>');
        return;
      }
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end('<!doctype html><html><body><p id="state">READY</p>'
        + '<form method="POST" action="/complete"><button type="submit">Complete fixture</button></form>'
        + '<input type="password" value="fixture-password-must-be-redacted"></body></html>');
    }));
    const steps: Array<(request: any) => any> = [];
    const fx = await fixture(steps, ['browser_control']);
    let sessionId = '';
    let observedPath = '';
    steps.push(
      () => strategy('Open only the local fixture, observe its allowed action, click it once, and verify the new page state.'),
      () => choice('browser_control', { action: 'open', url: pageUrl, headless: true, transport: 'open-browser-use' }, 'browser-open'),
      request => {
        const opened = browserResult(request);
        expect(opened).toMatchObject({ transport: 'open-browser-use', background: true, pid: null });
        sessionId = opened.sessionId;
        browserSessions.push(sessionId);
        return choice('browser_control', { action: 'observe', sessionId }, 'browser-before');
      },
      request => {
        const observed = browserResult(request);
        expect(observed.text).toContain('READY');
        expect(JSON.stringify(observed)).not.toContain('fixture-password-must-be-redacted');
        const action = observed.actions.find((item: any) => item.operation === 'CLICK' && item.label === 'Complete fixture');
        expect(action).toBeTruthy();
        return choice('browser_control', { action: 'act', sessionId,
          observationId: observed.observationId, actionId: action.id }, 'browser-click');
      },
      () => choice('browser_control', { action: 'observe', sessionId }, 'browser-after'),
      async request => {
        const observed = browserResult(request);
        expect(observed.text).toContain('DONE');
        expect(completed).toBe(1);
        observedPath = path.join(fx.root, 'browser-observed.json');
        await writeFile(observedPath, JSON.stringify({ observed, completed }));
        return choice('browser_control', { action: 'close', sessionId }, 'browser-close');
      },
      async request => {
        lastTool(request, 'browser_control');
        const evidence = await readFile(observedPath, 'utf8');
        return choice('agent_core_finalize', { outcome: 'verified', reason: 'task-complete',
          verificationRef: 'file:' + observedPath + '#' + digest(evidence),
          finalResponse: 'The local fixture reached DONE through one observed browser action.', nothingWorthSaving: true });
      },
    );
    const conversation = await fx.chat.createConversation({ workspace: 'fixture' });
    const result = await fx.chat.runTurn({ conversationId: conversation.conversation.id,
      clientRequestId: 'donor-browser', prompt: 'Complete the local fixture in an owned Browser Use background tab once and verify DONE.' });
    expect(result).toMatchObject({ status: 'finalized', learningStatus: 'complete', jobVerification: 'unavailable' });
    expect(completed).toBe(1);
    expect(JSON.parse(await readFile(observedPath, 'utf8')).observed.text).toContain('DONE');
    expect(fx.chat.getConversation(conversation.conversation.id)!.messages.at(-1)?.content).toBe(result.response);
    expect((browserControlService.status() as any).sessions.some((item: any) => item.sessionId === sessionId)).toBe(false);
    expect(fx.providerErrors).toEqual([]);
    expect(steps).toEqual([]);
  }, 30_000);
});
