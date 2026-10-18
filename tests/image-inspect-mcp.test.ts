import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAgentCoreMcpServer } from '../src/mcp/server.js';
import { applyResultBudget } from '../src/mcp/result-budget.js';
import { decideToolEvidenceCapture, EVIDENCE_POLICY_MARKER, extractEvidenceCandidatePaths } from '../src/security/evidence-capture-policy.js';
import { ToolHistory, toolHistory } from '../src/rdc/utils/toolHistory.js';
import { usageTracker } from '../src/rdc/utils/usageTracker.js';
import { activityTracker } from '../src/tracker/activity-tracker.js';
import { AGENT_CAPABILITY_CATALOG } from '../src/agent-capability-catalog.js';
import * as imageInspection from '../src/rdc/tools/image-inspect.js';
import { attachControllerContract } from './controller-contract-fixture.js';
import { fixture as learningFixture } from './skill-proposal-fixture.js';
import { ExternalControllerLearningService } from '../src/learning/external-controller.js';

const roots: string[] = [];
const closers: Array<() => Promise<void>> = [];
async function tempDir() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'image-inspect-mcp-'));
  roots.push(root);
  return root;
}
async function connected(key?: unknown, runtime = {}) {
  const server = createAgentCoreMcpServer(key, runtime);
  const client = new Client({ name: 'isolated-image-inspect-test', version: '1.0.0' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(b);
  await client.connect(a);
  const contractSession = !(runtime as any).nativeTaskId ? await attachControllerContract(client) : undefined;
  closers.push(async () => { await client.close(); await server.close(); });
  return { server, client, contractSession };
}
async function fixture(width = 10, height = 10) {
  const root = await tempDir();
  const file = path.join(root, 'source.png');
  await sharp(randomBytes(width * height * 3), { raw: { width, height, channels: 3 } }).png().toFile(file);
  return { root, file };
}
function imageResult(bytes: number) {
  return { content: [{ type: 'image', mimeType: 'image/png', data: Buffer.alloc(bytes, 77).toString('base64') },
    { type: 'text', text: '{"viewId":"bounded-view"}' }] };
}
async function observerFixture(sessionId = 'external-test') {
  const f = await learningFixture(), ownerId = 'image-observer-owner';
  const externalControllerLearning = await ExternalControllerLearningService.initialize({
    stateDir: path.join(f.root, 'external'), memory: f.memory, learning: f.learning, skills: f.skills,
  });
  await externalControllerLearning.startEpisode(sessionId, { taskKey: 'image-inspect', workspace: 'agent-core' }, {
    ownerId, workspaceIdentityKey: f.memory.registeredWorkspaceIdentity('agent-core').key,
  });
  return { key: { id: ownerId }, runtime: { controllerSessionId: sessionId, externalControllerLearning } };
}
beforeEach(() => {
  vi.spyOn(toolHistory, 'addCall').mockReturnValue(true);
  vi.spyOn(usageTracker, 'trackSuccess').mockResolvedValue(undefined);
  vi.spyOn(usageTracker, 'trackFailure').mockResolvedValue(undefined);
  vi.spyOn(activityTracker, 'record').mockImplementation(() => undefined as any);
  vi.spyOn(activityTracker, 'captureFailure').mockImplementation(() => undefined as any);
});
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

describe('image_inspect transport and permission boundary', () => {
  it('registers an explicitly read-only external tool with a real MCP image response', async () => {
    const { file } = await fixture();
    const { client } = await connected();
    const descriptor = (await client.listTools()).tools.find(tool => tool.name === 'image_inspect');
    expect(descriptor?.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false, openWorldHint: false });
    const result: any = await client.callTool({ name: 'image_inspect', arguments: { action: 'overview', path: file } });
    expect(result.isError).not.toBe(true);
    expect(result.content.find((part: any) => part.type === 'image')).toMatchObject({ mimeType: 'image/png', data: expect.any(String) });
  });

  it('honors exact credential membership for discovery and direct dispatch', async () => {
    const denied = await connected({ id: 'restricted', toolGrant: { version: 1, allowedTools: ['read_file'] } });
    expect((await denied.client.listTools()).tools.map(tool => tool.name)).not.toContain('image_inspect');
    await expect(denied.client.callTool({ name: 'image_inspect', arguments: { action: 'overview', path: '/never-read' } })).rejects.toThrow(/disabled|GRANT_DENIED/);
    const granted = await connected({ id: 'image-only', toolGrant: { version: 1, allowedTools: ['image_inspect'] } });
    expect((await granted.client.listTools()).tools.map(tool => tool.name)).toEqual(['controller_contract', 'image_inspect']);
    await expect((denied.server as any)._registeredTools.image_inspect.executor({ action: 'overview', path: '/never-read', contractSession: denied.contractSession }, {})).rejects.toThrow(/GRANT_DENIED/);
  });

  it('does not register image_inspect in Native tasks or the Native executable capability catalog', async () => {
    const { client } = await connected(undefined, { nativeTaskId: 'native-test' });
    expect((await client.listTools()).tools.map(tool => tool.name)).not.toContain('image_inspect');
    await expect(client.callTool({ name: 'image_inspect', arguments: { action: 'overview', path: '/never-read' } })).rejects.toThrow();
    expect(AGENT_CAPABILITY_CATALOG.flatMap(family => family.tools.map(tool => tool.name))).not.toContain('image_inspect');
  });

  it('preserves real image bytes larger than the ordinary 256 KiB budget through SDK dispatch', async () => {
    const { file } = await fixture(640, 480);
    const { client } = await connected();
    const result: any = await client.callTool({ name: 'image_inspect', arguments: { action: 'overview', path: file } });
    expect(result.isError).not.toBe(true);
    const image = result.content.find((part: any) => part.type === 'image');
    expect(image).toBeDefined();
    expect(Buffer.from(image.data, 'base64').length).toBeGreaterThan(256 * 1024);
    expect(await sharp(Buffer.from(image.data, 'base64')).metadata()).toMatchObject({ width: 640, height: 480 });
    expect(result._meta?.resultBudget?.spilled).not.toBe(true);
  });

  it('bounds the whole response after optional capability notices are appended', async () => {
    const { file } = await fixture();
    const observer = await observerFixture();
    vi.spyOn(observer.runtime.externalControllerLearning, 'takeCapabilityUsageNotice').mockResolvedValue('N'.repeat(3 * 1024 * 1024));
    const { client } = await connected(observer.key, observer.runtime);
    const result: any = await client.callTool({ name: 'image_inspect', arguments: { action: 'overview', path: file } });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result).length).toBeLessThan(3 * 1024 * 1024);
    expect(result.content).toEqual([expect.objectContaining({ type: 'text', text: expect.stringMatching(/IMAGE_RESULT_BUDGET_EXCEEDED/) })]);
  });
});

describe('image_inspect nonpersistent result budget', () => {
  it('keeps image blocks intact up to the dedicated budget without relaxing generic tools', async () => {
    const storageDir = await tempDir();
    const result = imageResult(500 * 1024);
    expect(await applyResultBudget('image_inspect', result, { storageDir })).toBe(result);
    expect(await readdir(storageDir)).toEqual([]);
    const generic = await applyResultBudget('read_file', result, { storageDir });
    expect(generic).not.toBe(result);
    expect((generic as any)._meta.resultBudget).toMatchObject({ spilled: false, reason: 'non-persistable-tool' });
  });

  it('fails clearly above 3 MiB, counts base64 and metadata, and never spills bytes', async () => {
    const storageDir = await tempDir();
    const result = imageResult(2 * 1024 * 1024);
    result.content.push({ type: 'text', text: 'M'.repeat(512 * 1024) } as any);
    const bounded = await applyResultBudget('image_inspect', result, { storageDir });
    expect((bounded as any).isError).toBe(true);
    expect(bounded.content).toEqual([expect.objectContaining({ type: 'text', text: expect.stringMatching(/IMAGE_RESULT_BUDGET_EXCEEDED/) })]);
    expect((bounded as any)._meta.resultBudget).toMatchObject({ spilled: false });
    expect(JSON.stringify(bounded)).not.toContain('TU1N');
    expect(await readdir(storageDir)).toEqual([]);
  });

  it('enforces the encoded image cap independently of the total response cap', async () => {
    const storageDir = await tempDir();
    const bounded = await applyResultBudget('image_inspect', imageResult(2 * 1024 * 1024 + 1), { storageDir });
    expect((bounded as any).isError).toBe(true);
    expect(await readdir(storageDir)).toEqual([]);
  });

  it('counts original transport bytes rather than a shorter redacted projection', async () => {
    const storageDir = await tempDir();
    const result = { content: [{ type: 'text', text: 'password="' + 'S'.repeat(3 * 1024 * 1024) + '"' }] };
    const bounded = await applyResultBudget('image_inspect', result, { storageDir });
    expect((bounded as any).isError).toBe(true);
    expect(JSON.stringify(bounded)).not.toContain('SSSS');
    expect(await readdir(storageDir)).toEqual([]);
  });
});

describe('image_inspect metadata-only persistence', () => {
  it('keeps failed image argument values and failure details out of Learning and failure-advisor observations', async () => {
    const { root, file } = await fixture();
    const failures: any[] = [];
    const observations: any[] = [];
    const observer = await observerFixture();
    vi.spyOn(observer.runtime.externalControllerLearning, 'failureContext').mockImplementation(async (input: any) => { failures.push(input); return {} as any; });
    const runtime = {
      ...observer.runtime,
      failureLoopAdvisor: {
        observeFailure: (tool: string, args: unknown, failure: unknown) => { observations.push({ tool, args, failure }); },
        observeSuccess() {},
      },
    };
    const { client } = await connected(observer.key, runtime as any);
    // Actual image owner exceptions are sent to the caller, while observers
    // receive metadata only. The missing path appears in the underlying error.
    const privatePath = path.join(root, 'private-image-does-not-exist.png');
    const result: any = await client.callTool({ name: 'image_inspect', arguments: { action: 'overview', path: privatePath } });
    expect(result.isError).toBe(true);
    expect(failures).toHaveLength(1);
    expect(observations).toHaveLength(1);
    const captured = JSON.stringify([...failures, ...observations], (_key, value) => value instanceof Error ? value.message : value);
    expect(captured).not.toContain(root);
    expect(failures[0].args).toEqual({ argumentKeys: ['action', 'path'] });
    expect(String(failures[0].failure)).toMatch(/detail omitted/);

    // Force a handled failure at the owner boundary to exercise the sibling
    // result branch, including image bytes and crop parameters.
    const bytes = Buffer.from('PRIVATE_IMAGE_BYTES').toString('base64');
    vi.spyOn(imageInspection, 'createImageInspector').mockReturnValue(async () => ({
      isError: true, content: [{ type: 'text', text: privatePath }, { type: 'image', data: bytes, mimeType: 'image/png' }],
    }));
    const handled = await connected(observer.key, runtime as any);
    const viewId = '123e4567-e89b-42d3-a456-426614174000';
    await handled.client.callTool({ name: 'image_inspect', arguments: {
      action: 'crop', path: file, viewId, rectangle: { x: 123, y: 234, width: 345, height: 456 },
    } });
    expect(failures).toHaveLength(2);
    const allCaptured = JSON.stringify([...failures, ...observations], (_key, value) => value instanceof Error ? value.message : value);
    for (const sensitive of [root, viewId, bytes, '123', '234', '345', '456']) expect(allCaptured).not.toContain(sensitive);
    expect(failures[1].args).toEqual({ argumentKeys: ['action', 'path', 'viewId', 'rectangle'] });
    expect(JSON.stringify(vi.mocked(activityTracker.record).mock.calls)).not.toContain(root);
    expect(JSON.stringify(vi.mocked(activityTracker.captureFailure).mock.calls)).not.toContain(root);
  });

  it.each([undefined, 'full', 'metadata-only', 'omit'] as const)('keeps workspace %s policy no weaker than metadata-only', async disposition => {
    const { root, file } = await fixture();
    if (disposition) await writeFile(path.join(root, EVIDENCE_POLICY_MARKER), JSON.stringify({ version: 1, default: disposition }));
    expect(extractEvidenceCandidatePaths('image_inspect', { path: file })).toEqual({ knownFileTool: true, paths: [file] });
    expect(decideToolEvidenceCapture('image_inspect', { path: file }).disposition).toBe(disposition === 'omit' ? 'omit' : 'metadata-only');
  });

  it('never persists even tiny image bytes, raw path, viewId or arguments without a workspace marker', async () => {
    const { root, file } = await fixture();
    const history = new ToolHistory(path.join(root, 'history'));
    const args = { action: 'crop', path: file, viewId: 'private-view-id', rectangle: { x: 0, y: 0, width: 1, height: 1 } };
    const result = imageResult(20);
    history.addCall('image_inspect', args, result as any, 1, decideToolEvidenceCapture('image_inspect', args));
    await history.cleanup();
    const persisted = await readFile(path.join(root, 'history/tool-history.jsonl'), 'utf8');
    expect(persisted).not.toContain(result.content[0].data);
    expect(persisted).not.toContain(file);
    expect(persisted).not.toContain('private-view-id');
    expect(history.getRecentCalls({})[0].capture?.disposition).toBe('metadata-only');
  });

  it('cannot bypass metadata-only history by omitting the capture decision', async () => {
    const root = await tempDir();
    const history = new ToolHistory(root);
    const result = imageResult(20);
    history.addCall('image_inspect', { path: 'private-path' }, result as any);
    await history.cleanup();
    const persisted = await readFile(path.join(root, 'tool-history.jsonl'), 'utf8');
    expect(persisted).not.toContain(result.content[0].data);
    expect(persisted).not.toContain('private-path');
  });

  it('passes metadata-only evidence to the actual wrapper and respects workspace omission', async () => {
    const { root, file } = await fixture();
    const { client } = await connected();
    await client.callTool({ name: 'image_inspect', arguments: { action: 'overview', path: file } });
    expect(vi.mocked(toolHistory.addCall).mock.calls.at(-1)?.[4]).toMatchObject({ disposition: 'metadata-only' });
    const terminal = vi.mocked(activityTracker.record).mock.calls.find(call => call[3] === 'tool-call');
    expect(terminal?.[4]).toMatchObject({ evidenceCapture: 'metadata-only' });
    expect(JSON.stringify(vi.mocked(activityTracker.record).mock.calls)).not.toContain(file);
    await writeFile(path.join(root, EVIDENCE_POLICY_MARKER), JSON.stringify({ version: 1, default: 'omit' }));
    await client.callTool({ name: 'image_inspect', arguments: { action: 'overview', path: file } });
    expect(vi.mocked(toolHistory.addCall).mock.calls.at(-1)?.[4]).toMatchObject({ disposition: 'omit' });
  });
  it('keeps private image arguments and raw errors out of failure-learning observations', async () => {
    const {file}=await fixture(); await writeFile(file,'invalid-image-private-content');
    const observer=await observerFixture('private-test');
    const failureContext=vi.spyOn(observer.runtime.externalControllerLearning,'failureContext').mockResolvedValue({capsule:'',memoryIds:[]} as any);
    const observeFailure=vi.fn(()=>undefined);
    const {client}=await connected(observer.key,{...observer.runtime,failureLoopAdvisor:{observeFailure}} as any);
    await client.callTool({name:'image_inspect',arguments:{action:'overview',path:file}}).catch(()=>undefined);
    expect(failureContext).toHaveBeenCalled();
    expect(observeFailure).toHaveBeenCalled();
    expect(JSON.stringify(failureContext.mock.calls)).not.toContain(file);
    expect(JSON.stringify(observeFailure.mock.calls)).not.toContain(file);
    expect(failureContext.mock.calls[0][0].failure.message).toContain('detail omitted');
  });

});
