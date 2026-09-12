import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryService } from '../src/memory/service.js';
import { TaskCheckpointService, type TaskCheckpointInput } from '../src/memory/task-checkpoint.js';
import { FileNativeAuxStore } from '../src/memory/file-native/aux-store.js';
import { resolveFileNativeMemoryPaths } from '../src/memory/file-native/paths.js';
import { SupabaseDirectMemory, type SupabaseDirectTransport } from '../src/memory/file-native/supabase-direct.js';
import { FileNativeMemoryRepository } from '../src/memory/file-native/vault-repository.js';
import { isEngineeringSourceBlob } from '../src/memory/file-native/workflow-source-projection.js';
import { WorkflowService } from '../src/workflow/service.js';
import { WorkspacePolicy } from '../src/runtime/workspace.js';
import { FakeDirectMemoryTransport, isolatedMemoryDependencies, memoryRoot, strictMemoryConfig } from './helpers/memory-fixture.js';

const roots: string[] = [];
const services = new Set<MemoryService>();
afterEach(async () => {
  for (const service of services) await service.close();
  services.clear();
  for (const root of roots.splice(0)) {
    if (!path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep)
      || !path.basename(root).startsWith('ac-engineering-projection-lifecycle-')) throw new Error('Fixture cleanup escaped temp');
    await rm(root, { recursive: true, force: true, maxRetries: 3 });
  }
});

class GenerationFailureTransport extends FakeDirectMemoryTransport {
  failCommit = false;
  rejectedCommits = 0;
  override async call(operation: Parameters<SupabaseDirectTransport['call']>[0], payload: Record<string, unknown>): Promise<unknown> {
    if (this.failCommit && operation === 'workflow_commit_generation') {
      this.rejectedCommits++;
      throw new Error('Fixture workflow generation unavailable');
    }
    return super.call(operation, payload);
  }
}

async function fixture(transport = new GenerationFailureTransport()) {
  const root = await memoryRoot('engineering-projection-lifecycle'); roots.push(root);
  const config = await strictMemoryConfig(root);
  const dependencies = { ...isolatedMemoryDependencies(config), supabaseDirectTransport: transport };
  const memory = new MemoryService(config, undefined, dependencies); services.add(memory);
  const paths = resolveFileNativeMemoryPaths(root), aux = new FileNativeAuxStore(paths);
  const workspace = new WorkspacePolicy([root]);
  const workflow = new WorkflowService({ workspace, stateRoot: aux.root,
    cacheRoot: path.join(root, 'runtime', 'craft', 'sources'), projectRoot: root });
  const direct = new SupabaseDirectMemory(paths, new FileNativeMemoryRepository(paths), aux, transport, 'https://fixture.supabase.co');
  return { root, config, dependencies, memory, aux, workflow, direct, transport, workspace };
}

describe('engineering source evidence at the durable memory boundary', () => {
  it('keeps computed-label evidence exact through lifecycle validation, interrupted checkpoint retry, restore, and fresh preflight', async () => {
    const f = await fixture();
    const content = [
      'export function createLabel(nodeLabel, stream) {',
      '  const token = `${nodeLabel}_${stream.toUpperCase()}`;',
      '  return token;',
      '}',
      '',
    ].join('\n');
    const sourcePath = path.join(f.root, 'src', 'labels.mjs');
    const sourceHash = createHash('sha256').update(content).digest('hex');
    await mkdir(path.dirname(sourcePath), { recursive: true });
    await writeFile(sourcePath, content);
    const scope = { principalId: randomUUID(), projectId: 'agent-core://self' };
    const routeContextId = randomUUID(), expiresAt = Date.now() + 120_000;
    const brief = 'Inspect the existing label implementation before planning any changes';
    const preflight = await f.memory.preflight({ scope, routeContextId, task: brief, expiresAt });
    const turn = await f.memory.beginContinuityTurn(scope, routeContextId, brief, undefined, {}, expiresAt);
    await f.memory.bindLifecycleTask(scope, preflight.contextId, turn.taskId);
    const workflowScope = { ...scope, taskId: turn.taskId };
    await f.workflow.bind(workflowScope, { brief });
    // Capture actual receipts and immutable source bytes; do not seed a fabricated projection.
    const discovery = await f.workflow.source(workflowScope, { operation: 'discover', role: 'target', query: 'createLabel' });
    const read = await f.workflow.source(workflowScope, { operation: 'read', role: 'target', path: sourcePath });
    expect(read).toMatchObject({ content, contentHash: sourceHash, receipt: { contentHash: sourceHash, complete: true } });
    const captured = (await f.workflow.store.read(workflowScope))!;
    expect(captured.engineering?.evidence).toHaveLength(1);
    expect(captured.receipts).toHaveLength(1);
    expect(discovery.version).toBeLessThan(read.version);
    await f.memory.markLifecycleMeaningfulWork({ scope, contextId: preflight.contextId, routeContextId,
      toolName: 'craft_source', reasonCode: 'SOURCE_EVIDENCE_CAPTURED' });

    // The old generic redactor rejected the captured computed token assignment here.
    await expect(f.memory.validateLifecycleContext({ scope, contextId: preflight.contextId, routeContextId }))
      .resolves.toMatchObject({ meaningfulWorkCount: 1, postflightState: 'POSTFLIGHT_PENDING' });
    const before = await f.direct.workflowSnapshot(scope);
    const blob = before.records.find(record => isEngineeringSourceBlob(record.document))!;
    expect(blob.document).toMatchObject({ content, sourceHash, bytes: Buffer.byteLength(content) });
    expect(before.records.filter(record => isEngineeringSourceBlob(record.document))).toHaveLength(1);
    const checkpointInput: TaskCheckpointInput = {
      workspaceRoot: f.root, routeContextId, memoryContextId: preflight.contextId,
      continuityTaskId: turn.taskId, continuityTurnId: turn.turnId,
      status: 'interrupted', summary: 'Source evidence captured; implementation has not begun.',
      memoryDecision: { reasonCode: 'TRANSIENT_OPERATION', explanation: 'Temporary fixture inspection adds no reusable project knowledge.' },
    };
    f.transport.failCommit = true;
    const checkpoint = new TaskCheckpointService(f.memory, f.workspace);
    await expect(checkpoint.checkpointForScope(scope, checkpointInput)).rejects.toMatchObject({ code: 'MEMORY_POSTFLIGHT_REQUIRED' });
    expect(f.transport.rejectedCommits).toBeGreaterThan(0);
    const pending = await f.aux.list<{ checkpointId: string }>('continuity-checkpoints');
    expect(pending).toHaveLength(1);
    const decisions = await f.aux.list('write-decisions');
    expect(decisions).toHaveLength(1);
    expect(await f.memory.workflowClosureStatus(scope, turn.taskId, pending[0]!.checkpointId)).toEqual({ state: 'pending' });
    expect(await f.memory.getLifecycleContext(scope, preflight.contextId))
      .toMatchObject({ postflightState: 'POSTFLIGHT_PENDING', meaningfulWorkCount: 1 });

    await f.memory.close(); services.delete(f.memory);
    f.transport.failCommit = false;
    const restarted = new MemoryService(f.config, undefined, f.dependencies); services.add(restarted);
    const closed = await new TaskCheckpointService(restarted, f.workspace).checkpointForScope(scope, checkpointInput);
    expect(closed).toMatchObject({ checkpointId: pending[0]!.checkpointId, taskStatus: 'interrupted',
      memoryLifecycle: { postflightState: 'CLOSED', durabilityState: 'DURABLY_CLOSED' },
      remoteDurability: { state: 'REMOTE_SYNCED' } });
    // Recovery only repeats durability: no new capture, checkpoint, decision, or source mutation.
    expect(await f.aux.list('continuity-checkpoints')).toHaveLength(1);
    expect(await f.aux.list('write-decisions')).toEqual(decisions);
    expect(await f.workflow.store.read(workflowScope)).toEqual(captured);
    expect(await readFile(sourcePath, 'utf8')).toBe(content);
    expect(await restarted.getLifecycleContext(scope, preflight.contextId))
      .toMatchObject({ meaningfulWorkCount: 1, postflightState: 'CLOSED' });
    const backup = (await f.direct.readWorkflowBackup(scope))!;
    expect(backup.snapshot.records.find(record => record.recordId === blob.recordId)).toEqual(blob);

    const fresh = await fixture(f.transport);
    expect(await fresh.memory.hydrateRemote(scope)).toMatchObject({ state: 'WORKFLOW_MEMORY_HYDRATED' });
    const restoredBytes = await readFile(path.join(fresh.root, 'runtime', 'craft', 'sources', 'blobs', `${sourceHash}.txt`));
    expect(restoredBytes.toString('utf8')).toBe(content);
    expect(createHash('sha256').update(restoredBytes).digest('hex')).toBe(sourceHash);
    const restored = await fresh.direct.workflowSnapshot(scope);
    expect(restored.logicalStateHash).toBe(backup.generation.logicalStateHash);
    expect(restored.records.find(record => record.recordId === blob.recordId)).toEqual(blob);
    expect(await fresh.workflow.store.read(workflowScope)).toEqual(captured);
    expect(await fresh.memory.getLifecycleContext(scope, preflight.contextId))
      .toMatchObject({ postflightState: 'CLOSED', expiresAt: 0, meaningfulWorkCount: 1 });
    await expect(fresh.memory.preflight({ scope, routeContextId: randomUUID(),
      task: 'Inspect recovered label evidence', expiresAt: Date.now() + 60_000 }))
      .resolves.toMatchObject({ blocking: { blocked: false } });
  });
});
