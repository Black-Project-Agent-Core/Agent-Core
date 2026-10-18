import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fixture } from './skill-proposal-fixture.js';
import { ExternalControllerLearningService } from '../src/learning/external-controller.js';
import { ArtifactAuthorization } from '../src/auth/artifact-authorization.js';
import { ArtifactInspectionService } from '../src/artifact-analysis/service.js';
import * as snapshots from '../src/artifact-analysis/snapshot.js';
import { runArtifactWorker } from '../src/artifact-analysis/worker.js';
import { createToolInvocationIdentity, withToolInvocationRequest } from '../src/tracker/tool-invocation.js';
import { registerArtifactInspectTool } from '../src/mcp/artifact-inspect-tools.js';

vi.mock('../src/rdc/config-manager.js', () => ({ configManager: { getConfig: async () => ({ allowedDirectories: [] }) } }));
vi.mock('../src/artifact-analysis/worker.js', () => ({ runArtifactWorker: vi.fn() }));
const summary = () => ({ findings: [], inventory: 1, inspected: 1, unavailable: 0, notExamined: 0,
  droppedFindings: 0, limitations: [] });
afterEach(() => vi.restoreAllMocks());
beforeEach(() => vi.clearAllMocks());

async function prepared() {
  const f = await fixture(), sessionId = 'artifact-fixture', ownerId = 'artifact-owner';
  const external = await ExternalControllerLearningService.initialize({ stateDir: path.join(f.root, 'external'),
    memory: f.memory, learning: f.learning, skills: f.skills });
  const binding = { ownerId, workspaceIdentityKey: f.memory.registeredWorkspaceIdentity('agent-core').key };
  const episode = await external.startEpisode(sessionId, { taskKey: 'first', workspace: 'agent-core' }, binding);
  const invocation = createToolInvocationIdentity();
  const context = await external.captureToolInvocationContext({ ...invocation, invocationId: invocation.id, sessionId, ownerId });
  expect(context.binding).toBe('bound');
  const identity = { ownerId, taskId: episode.id, workspace: 'agent-core' };
  const target = path.join(f.root, 'selected-artifact'); await mkdir(target);
  await writeFile(path.join(target, 'entry.js'), 'export const fixture = 1;');
  const authorization = new ArtifactAuthorization();
  const request = authorization.prepare(identity, { target, format: 'directory-js', selected: ['entry.js'],
    rightsRef: 'source:isolated-test-fixture', audience: 'test-only' });
  // A simulated trusted operator ingress in this isolated fixture; no live UI or permission is asserted.
  const operator = {
    workspace: 'agent-core', conversationId: 'fixture-conversation', userMessageId: 'fixture-user-message', persistedUserMessage: true,
  } as const;
  expect(await authorization.operatorCommand(`/artifact permit ${request.requestId} ${request.revisionDigest}`, operator)).toContain('Operator approval bound');
  const assertCurrent = async () => {
    if (!await external.invocationTaskCurrent(context)) throw new Error('ARTIFACT_SCOPE_NOT_AUTHORIZED');
  };
  vi.mocked(runArtifactWorker).mockResolvedValue(summary());
  const service = new ArtifactInspectionService(authorization);
  const inspect = (guard = assertCurrent) => (service.inspect as any)(identity, request.requestId,
    request.revisionDigest, invocation.id, undefined, guard);
  const replace = () => external.startEpisode(sessionId, { taskKey: 'replacement', workspace: 'agent-core' }, binding);
  const revoke = () => authorization.operatorCommand(`/artifact revoke ${request.requestId} ${request.revisionDigest}`, operator);
  return { ...f, context, invocation, identity, authorization, external, target, request, inspect, replace, revoke, assertCurrent };
}

describe('external artifact task freshness', () => {
  it('refuses an obsolete invocation before reading the permitted artifact', async () => {
    const f = await prepared(); await f.replace();
    const capture = vi.spyOn(snapshots, 'captureArtifact');
    await expect(f.inspect()).rejects.toThrow('ARTIFACT_SCOPE_NOT_AUTHORIZED');
    expect(capture).not.toHaveBeenCalled(); expect(runArtifactWorker).not.toHaveBeenCalled();
  });

  it('withholds a settled worker result if its task was replaced, without a second artifact read', async () => {
    const f = await prepared(); let entered!: () => void, release!: () => void;
    const running = new Promise<void>(resolve => entered = resolve), resumed = new Promise<void>(resolve => release = resolve);
    vi.mocked(runArtifactWorker).mockImplementationOnce(async () => { entered(); await resumed; return summary(); });
    const capture = vi.spyOn(snapshots, 'captureArtifact');
    const pending = f.inspect(); const outcome = expect(pending).rejects.toThrow('ARTIFACT_SCOPE_NOT_AUTHORIZED');
    try { await running; await f.replace(); } finally { release(); }
    await outcome; expect(capture).toHaveBeenCalledTimes(1);
  });

  it('rechecks scope after capture and before scheduling the worker', async () => {
    const f = await prepared(), original = snapshots.captureArtifact;
    vi.spyOn(snapshots, 'captureArtifact').mockImplementationOnce(async (...args) => {
      const result = await original(...args); await f.replace(); return result;
    });
    await expect(f.inspect()).rejects.toThrow('ARTIFACT_SCOPE_NOT_AUTHORIZED');
    expect(runArtifactWorker).not.toHaveBeenCalled();
  });

  it('preserves a current invocation and discloses clipped findings as partial', async () => {
    const f = await prepared(); vi.mocked(runArtifactWorker).mockResolvedValue({ ...summary(), droppedFindings: 7 });
    const result = await f.inspect();
    expect(result.outcome).toBe('partial');
    expect(result.coverage).toMatchObject({ returnedFindings: 0, droppedFindings: 7, findingsTruncated: true });
  });

  it('checks the task again after the final identity read', async () => {
    const f = await prepared(), original = snapshots.captureArtifact;
    vi.spyOn(snapshots, 'captureArtifact').mockImplementationOnce(original).mockImplementationOnce(async (...args) => {
      const result = await original(...args); await f.replace(); return result;
    });
    await expect(f.inspect()).rejects.toThrow('ARTIFACT_SCOPE_NOT_AUTHORIZED');
  });

  it.each(['final-read', 'final-task-check'])('refuses a lease revoked during %s before disclosing results', async stage => {
    const f = await prepared();
    if (stage === 'final-read') {
      const original = snapshots.captureArtifact;
      vi.spyOn(snapshots, 'captureArtifact').mockImplementationOnce(original).mockImplementationOnce(async (...args) => {
        const result = await original(...args); await f.revoke(); return result;
      });
      await expect(f.inspect()).rejects.toThrow('ARTIFACT_SCOPE_NOT_AUTHORIZED');
    } else {
      let checks = 0;
      await expect(f.inspect(async () => { await f.assertCurrent(); if (++checks === 4) await f.revoke(); }))
        .rejects.toThrow('ARTIFACT_SCOPE_NOT_AUTHORIZED');
    }
  });

  it('counts additional envelope clipping and keeps the whole result bounded', async () => {
    const f = await prepared();
    const findings = Array.from({ length: 256 }, (_, i) => ({ id: 'j' + i, kind: 'module-reference',
      classification: 'observed' as const, summary: 's'.repeat(220), source: 'p'.repeat(400), line: i + 1, offset: i }));
    vi.mocked(runArtifactWorker).mockResolvedValue({ ...summary(), findings, droppedFindings: 7 });
    const result = await f.inspect();
    expect(result.outcome).toBe('partial'); expect(result.findings.length).toBeLessThan(256);
    expect(result.coverage).toMatchObject({ returnedFindings: result.findings.length,
      droppedFindings: 263 - result.findings.length, findingsTruncated: true });
    expect(Buffer.byteLength(JSON.stringify(result))).toBeLessThanOrEqual(64 * 1024);
  });

  it('facade accepts the exact current host invocation and its operator-bound lease', async () => {
    const f = await prepared(); let handler!: (args: any) => Promise<any>;
    registerArtifactInspectTool({ registerTool: (_name: string, _schema: any, callback: typeof handler) => handler = callback } as any,
      f.authorization, context => f.external.invocationTaskCurrent(context));
    const request: any = { tool: 'artifact_inspect', identity: f.invocation, invocationContext: f.context,
      mutationContext: { taskId: f.identity.taskId }, checkpointReceipt: () => undefined };
    const response = await withToolInvocationRequest(request, () => handler({ action: 'inspect',
      requestId: f.request.requestId, revisionDigest: f.request.revisionDigest }));
    const result = JSON.parse(response.content[0].text);
    expect(result.outcome).toBe('complete');
    expect(result.coverage).toMatchObject({ returnedFindings: 0, droppedFindings: 0, findingsTruncated: false });
  });

  it('facade refuses a missing or obsolete host validator before preparing target metadata', async () => {
    const f = await prepared(); await f.replace();
    for (const validator of [undefined, (context: typeof f.context) => f.external.invocationTaskCurrent(context)]) {
      let handler!: (args: any) => Promise<any>;
      (registerArtifactInspectTool as any)({ registerTool: (_name: string, _schema: any, callback: typeof handler) => handler = callback }, f.authorization, validator);
      const prepare = vi.spyOn(f.authorization, 'prepare');
      const request: any = { tool: 'artifact_inspect', identity: f.invocation, invocationContext: f.context,
        mutationContext: { taskId: f.identity.taskId }, checkpointReceipt: () => undefined };
      await expect(withToolInvocationRequest(request, () => handler({ action: 'prepare', path: f.target,
        format: 'directory-js', rightsEvidenceRef: 'source:fixture', disclosureAudience: 'test' }))).rejects.toThrow('ARTIFACT_SCOPE_NOT_AUTHORIZED');
      expect(prepare).not.toHaveBeenCalled(); prepare.mockRestore();
    }
  });
});
