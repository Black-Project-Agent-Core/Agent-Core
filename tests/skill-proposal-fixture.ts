import { afterEach, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
vi.mock('../src/tracker/activity-tracker.js', () => ({ activityTracker: {
  record: vi.fn(), recordOutcome: vi.fn(), captureFailure: vi.fn(), readFeatureOutcomes: () => [],
} }));
import { MemoryService } from '../src/memory/service.js';
import { LearningService } from '../src/learning/service.js';
import { SkillService } from '../src/skills/service.js';
import { WORKFLOW_VERIFIER_REVISION, registerWorkflowVerification } from '../src/learning/workflow-verifier.js';
const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
export async function fixture() {
  const parent = fileURLToPath(new URL('../runtime/tmp/', import.meta.url)); await mkdir(parent, { recursive: true });
  const root = await mkdtemp(path.join(parent, 'skill-proposal-test-')); roots.push(root);
  await mkdir(path.join(root, 'runtime/memory'), { recursive: true });
  await writeFile(path.join(root, 'runtime/memory/00-agent-core-memory.md'), '# Agent Core Foundational Memory\n\nIsolated test foundation.');
  const memory = await MemoryService.initialize(root);
  const config = { enabled: true, stateDir: path.join(root, 'runtime/learning'), reviewInterval: 10, curatorIntervalHours: 168 };
  const learning: any = await LearningService.initialize(config, memory);
  const skills = await SkillService.initialize(root, async file => file); learning.attachSkills(skills);
  return { root, memory, learning, skills, reopen: async () => { const next: any = await LearningService.initialize(config, memory); next.attachSkills(skills); return next; } };
}
export const proposalInput = (overrides: Record<string, unknown> = {}) => ({
  workspace: 'agent-core', name: 'code-review', taskId: 'task-one', sessionId: 'session-a',
  purpose: 'Review code changes against exact source.', triggers: ['review code'], nonTriggers: ['deploy'],
  steps: ['Read changed source', 'Trace dependencies', 'Report supported findings'], allowedTools: ['read_file'],
  expectedBenefit: 'More consistent review; benefit has not been measured.', limitations: ['Does not authorize code edits or deployment.'],
  implementation: 'Use existing filesystem and structural tools.', acceptance: ['Report only source-backed findings.'],
  evidenceRefs: ['tool:read_file:task-one'], ...overrides,
});
export async function nativeChatFixture() {
  const base = await fixture();
  const { AgentRuntimeService } = await import('../src/agent-runtime.js');
  const { NativeAgentController } = await import('../src/agent-controller.js');
  const { AgentChatService } = await import('../src/agent-chat-service.js');
  const { createServer } = await import('node:http');
  const requests: any[] = [];
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = []; for await (const part of req) chunks.push(Buffer.from(part));
    requests.push(JSON.parse(Buffer.concat(chunks).toString()));
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ finish_reason: 'tool_calls', message: { content: null, tool_calls: [{
      id: 'final', type: 'function', function: { name: 'agent_core_finalize', arguments: JSON.stringify({
        outcome: 'failed', finalResponse: 'Task answer retained.', nothingWorthSaving: true,
      }) },
    }] } }] }));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const config = { enabled: true, baseUrl: 'http://127.0.0.1:' + (server.address() as any).port + '/v1',
    model: 'isolated-test-provider', apiKey: null, requestTimeoutMs: 3000, maxToolIterations: 3, allowedTools: [] };
  const runtime = await AgentRuntimeService.initialize(base.root, base.learning, config, base.memory);
  const controller = new NativeAgentController(runtime, { memoryService: base.memory, learningService: base.learning, skillsService: base.skills }, config);
  const chat = await AgentChatService.initialize(base.root, runtime, controller);
  const created = await chat.createConversation({ workspace: 'agent-core' });
  return { ...base, runtime, chat, requests, conversation: created.conversation,
    close: async () => { await new Promise<void>(resolve => server.close(() => resolve())); } };
}
export const digest = (text: string) => 'sha256:' + createHash('sha256').update(text).digest('hex');
export async function report(root: string, taskId: string, pass = true) {
  const content = JSON.stringify({ domain: 'engineering', tests: [{ input: 2, expected: 4 }] });
  const answer = pass ? 'n => n * 2' : 'n => n * 3';
  const casePath = path.join(root, taskId + '-case.json'), answerPath = path.join(root, taskId + '-answer.js');
  await writeFile(casePath, content); await writeFile(answerPath, answer);
  const bytes = JSON.stringify({ verifierRevision: WORKFLOW_VERIFIER_REVISION, taskId, case: { path: casePath, digest: digest(content) }, answer: { path: answerPath, digest: digest(answer) } });
  const file = path.join(root, taskId + '-report.json'); await writeFile(file, bytes);
  registerWorkflowVerification({ taskId, case: { path: casePath, digest: digest(content) }, answerPath });
  return 'verification:' + file + '#' + digest(bytes);
}
