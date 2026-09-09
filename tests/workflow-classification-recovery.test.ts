import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { recoverWorkflowClassification } from '../src/runtime/workflow-classification-recovery.js';
import { WorkflowStore, workflowHash, workflowScopeId } from '../src/workflow/store.js';
import { FileNativeAuxStore } from '../src/memory/file-native/aux-store.js';
import { FileNativeMemoryRepository } from '../src/memory/file-native/vault-repository.js';
import { SupabaseDirectMemory, type SupabaseDirectTransport } from '../src/memory/file-native/supabase-direct.js';
import { acquireMemoryRecoveryLease, assertNoMemoryRecoveryPending } from '../src/memory/file-native/recovery-coordinator.js';
import { AuditJournal } from '../src/observability/audit-journal.js';
import { createRequestCorrelation, runWithCorrelation } from '../src/observability/correlation.js';
import { FakeDirectMemoryTransport } from './helpers/memory-fixture.js';
import type { WorkflowRecord } from '../src/workflow/types.js';

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) {
  if (!root.startsWith(path.join(os.tmpdir(), 'ac-classification-recovery-'))) throw new Error('Unsafe fixture cleanup');
  await rm(root, { recursive: true, force: true, maxRetries: 3 });
} });
async function inventory(root: string): Promise<string> {
  const result: Array<[string, string]> = [];
  async function walk(dir: string) { for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(file); else result.push([path.relative(root, file), workflowHash(await readFile(file))]);
  } }
  await walk(root); return workflowHash(JSON.stringify(result.sort(([a], [b]) => a.localeCompare(b))));
}
async function fixture(change?: (record: WorkflowRecord) => void) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ac-classification-recovery-')); roots.push(root);
  const config = loadConfig({ AGENT_CORE_MEMORY_SUPABASE_DIRECT_ENABLED: 'true', AGENT_CORE_MEMORY_SUPABASE_URL: 'https://fixture.supabase.co', AGENT_CORE_MEMORY_SUPABASE_SECRET_KEY: 'sb_secret_fixture_only' }, root);
  const paths = config.memory.fileNative, aux = new FileNativeAuxStore(paths), transport = new FakeDirectMemoryTransport();
  const scope = { principalId: randomUUID(), projectId: 'agent-core://self', taskId: randomUUID() }, routeContextId = randomUUID(), contextId = randomUUID(), turnId = randomUUID();
  const base = Date.now() - 10_000;
  await mkdir(paths.vaultRoot, { recursive: true });
  for (const child of ['journal', 'state/runs']) await mkdir(path.join(config.execution.stateRoot, child), { recursive: true });
  await writeFile(path.join(config.execution.stateRoot, 'state.json'), JSON.stringify({ stateVersion: 1 }));
  await aux.put('continuity-tasks', scope.taskId, { ...scope, title: 'Verify current behavior', acceptanceCriteria: [], constraints: [], status: 'interrupted', priority: 0, blockers: [], createdAt: base, updatedAt: base + 1 });
  const memoryScope = { principalId: scope.principalId, projectId: scope.projectId };
  await aux.put('continuity-turns', turnId, { ...memoryScope, turnId, taskId: scope.taskId, routeContextId, state: 'interrupted', createdAt: base, closedAt: base + 2 });
  await aux.put('lifecycles', contextId, { ...memoryScope, contextId, routeContextId, continuityTaskId: scope.taskId, objectiveHash: workflowHash('Verify'), postflightState: 'CLOSED', meaningfulWorkCount: 0, createdAt: base, updatedAt: base + 2, closedAt: base + 2 });
  const store = new WorkflowStore(aux.root, path.join(root, 'runtime', 'craft', 'sources', 'locks'));
  const first = await store.update(scope, undefined, () => ({ schemaVersion: 1, ...scope, version: 1, stateHash: '0'.repeat(64), targetRoot: root,
    brief: 'Verify current behavior', briefHash: workflowHash('Verify current behavior'), phase: 'DISCOVERY', planRequired: true, dagRequired: true, craftRequired: false,
    blockers: [], requirements: [], donors: [], snapshots: [], receipts: [], createdAt: base, updatedAt: base }));
  const direct = new SupabaseDirectMemory(paths, new FileNativeMemoryRepository(paths), aux, transport, config.memory.supabaseDirect.url!);
  await direct.syncWorkflow(scope);
  const predecessor = await direct.getWorkflowRecord(scope, 'workflow-contracts', workflowScopeId(scope));
  const second = await store.update(scope, 1, current => { current!.craftRequired = true; current!.context = 'Previously verified behavior is documented in reports/acceptance.json'; current!.updatedAt = base + 1; change?.(current!); return current!; });
  await direct.syncWorkflow(scope);
  const journal = new AuditJournal(config.logDir);
  journal.enqueue({ category: 'runtime', event: 'runtime.started', timestamp: new Date(base - 1).toISOString() });
  runWithCorrelation({ ...createRequestCorrelation(), routeContextId, toolName: 'task_checkpoint' }, () => journal.enqueue({ category: 'tool', event: 'tool.completed', timestamp: new Date(base + 3).toISOString(), data: { status: 'ok' } }));
  await journal.close();
  const request = { ...scope, expectedVersion: 2 as const, expectedStateHash: second.stateHash, predecessorContentHash: predecessor!.contentHash,
    operatorReason: 'Reviewed the original instructions: this was a verification-only continuation and the stronger flag came from retrospective status wording.', acknowledgeLegacyInstructionReview: true as const };
  const dependencies = { transport, graphHealth: async () => ({ healthy: true, checkedAt: Date.now() }) };
  return { root, config, paths, aux, transport, direct, scope, first, second, store, request, dependencies, routeContextId, contextId, turnId, base };
}

describe('explicit local operator classification recovery', () => {
  it('dry-runs read-only beside a live backend and preserves every fixture byte', async () => {
    const f = await fixture(), lease = await acquireMemoryRecoveryLease(f.paths, 'reader');
    try {
      const before = await inventory(f.root);
      const result = await recoverWorkflowClassification(f.config, f.request, { dependencies: f.dependencies });
      expect(result).toMatchObject({ state: 'WORKFLOW_CLASSIFICATION_ELIGIBLE', applied: false, version: 2, requiresStoppedRuntimeToApply: true });
      expect(await inventory(f.root)).toBe(before);
      await expect(recoverWorkflowClassification(f.config, f.request, { apply: true, dependencies: f.dependencies })).rejects.toThrow('MEMORY_RECOVERY_REQUIRES_STOPPED_RUNTIME');
      expect((await f.store.read(f.scope))?.stateHash).toBe(f.second.stateHash);
    } finally { await lease.release(); }
  });
  it('preserves immutable history, creates a backup and audit, and verifies a new scoped generation', async () => {
    const f = await fixture(), result = await recoverWorkflowClassification(f.config, f.request, { apply: true, dependencies: f.dependencies });
    expect(result).toMatchObject({ state: 'WORKFLOW_CLASSIFICATION_RECOVERED', applied: true, version: 3 });
    const current = (await f.store.read(f.scope))!;
    expect(current).toMatchObject({ craftRequired: false, dagRequired: true, planRequired: true, phase: 'DISCOVERY', classificationRecovery: { beforeStateHash: f.second.stateHash, beforeVersion: 2, reason: f.request.operatorReason } });
    expect((await f.direct.getWorkflowRecord(f.scope, 'workflow-contracts', workflowScopeId(f.scope), f.request.predecessorContentHash))?.document.stateHash).toBe(f.first.stateHash);
    expect((await f.direct.readWorkflowBackup(f.scope))?.snapshot.records.find(r => r.category === 'workflow-contracts')?.document.stateHash).toBe(current.stateHash);
    const backup = JSON.parse(await readFile((result as { backupPath: string }).backupPath, 'utf8'));
    expect(backup.current.stateHash).toBe(f.second.stateHash); expect(backup.predecessor.stateHash).toBe(f.first.stateHash);
    await expect(assertNoMemoryRecoveryPending(f.paths)).resolves.toBeUndefined();
  });
  it('leaves failed durability pending and retries the same correction without a second state transition', async () => {
    const f = await fixture(); let failCommit = true;
    const transport: SupabaseDirectTransport = { call: async (operation, payload) => {
      if (operation === 'workflow_commit_generation' && failCommit) throw new Error('TEST_REMOTE_UNAVAILABLE');
      return f.transport.call(operation, payload);
    } };
    await expect(recoverWorkflowClassification(f.config, f.request, { apply: true, dependencies: { ...f.dependencies, transport } })).rejects.toThrow('TEST_REMOTE_UNAVAILABLE');
    const pending = await f.store.read(f.scope);
    expect(pending?.version).toBe(3);
    await expect(assertNoMemoryRecoveryPending(f.paths)).rejects.toThrow('MEMORY_RECOVERY_PENDING');
    await expect(recoverWorkflowClassification(f.config, { ...f.request, operatorReason: f.request.operatorReason + ' Different request.' }, { apply: true, dependencies: f.dependencies })).rejects.toThrow('WORKFLOW_RECOVERY_DIFFERENT_REQUEST');
    failCommit = false;
    expect(await recoverWorkflowClassification(f.config, f.request, { apply: true, dependencies: { ...f.dependencies, transport } })).toMatchObject({ state: 'WORKFLOW_CLASSIFICATION_RECOVERED', version: 3, stateHash: pending!.stateHash });
    await expect(assertNoMemoryRecoveryPending(f.paths)).resolves.toBeUndefined();
  });
  it('rejects stale CAS, absent immutable history and a genuine new donor request', async () => {
    const f = await fixture();
    await expect(recoverWorkflowClassification(f.config, { ...f.request, expectedStateHash: 'f'.repeat(64) }, { dependencies: f.dependencies })).rejects.toThrow('WORKFLOW_VERSION_CONFLICT');
    await expect(recoverWorkflowClassification(f.config, { ...f.request, predecessorContentHash: 'f'.repeat(64) }, { dependencies: f.dependencies })).rejects.toThrow('WORKFLOW_RECOVERY_REMOTE_RECORD_MISMATCH');
    const actual = await fixture(record => { record.context = 'Implement retry from donor retry.py'; });
    await expect(recoverWorkflowClassification(actual.config, actual.request, { dependencies: actual.dependencies })).rejects.toThrow('WORKFLOW_RECOVERY_EXPLICIT_CRAFT_REQUEST');
    const donor = await fixture(record => { record.donors = [{ id: 'real', source: 'retry.py' }]; });
    await expect(recoverWorkflowClassification(donor.config, donor.request, { dependencies: donor.dependencies })).rejects.toThrow('WORKFLOW_RECOVERY_NOT_EMPTY_LEGACY');
  });
  it('rejects a rehashed replay candidate that tries to remove an unrelated DAG obligation', async () => {
    const f = await fixture();
    const transport: SupabaseDirectTransport = { call: async (operation, payload) => {
      if (operation === 'workflow_commit_generation') throw new Error('TEST_COMMIT_FAILURE');
      return f.transport.call(operation, payload);
    } };
    await expect(recoverWorkflowClassification(f.config, f.request, { apply: true, dependencies: { ...f.dependencies, transport } })).rejects.toThrow('TEST_COMMIT_FAILURE');
    const file = path.join(f.paths.memoryRoot, 'recovery', 'workflow-classification.json'), journal = JSON.parse(await readFile(file, 'utf8'));
    journal.after.dagRequired = false;
    const { stateHash: _, ...body } = journal.after; journal.after.stateHash = workflowHash(JSON.stringify(body));
    await writeFile(file, JSON.stringify(journal));
    await expect(recoverWorkflowClassification(f.config, f.request, { apply: true, dependencies: f.dependencies })).rejects.toThrow('WORKFLOW_RECOVERY_JOURNAL_INVALID');
    expect((await f.store.read(f.scope))?.dagRequired).toBe(true);
  });
  it('rejects recorded managed work and historical execution even if the aggregate is empty', async () => {
    const f = await fixture(), lifecycle = await f.aux.get<any>('lifecycles', f.contextId);
    await f.aux.put('lifecycles', f.contextId, { ...lifecycle, meaningfulWorkCount: 1 }); await f.direct.syncWorkflow(f.scope);
    await expect(recoverWorkflowClassification(f.config, f.request, { dependencies: f.dependencies })).rejects.toThrow('WORKFLOW_RECOVERY_OPERATION_EXISTS');
    const other = await fixture(), runId = randomUUID(), runPath = path.join(other.config.execution.stateRoot, 'state', 'runs', runId);
    await mkdir(runPath); await writeFile(path.join(runPath, 'run.json'), JSON.stringify({ ...other.scope, continuityTaskId: other.scope.taskId, runId, createdAt: other.base }));
    await expect(recoverWorkflowClassification(other.config, other.request, { dependencies: other.dependencies })).rejects.toThrow('WORKFLOW_RECOVERY_EXECUTION_EXISTS');
  });
  it('rejects unavailable audit history, wrong ownership and missing operator attestation', async () => {
    const f = await fixture();
    await writeFile(path.join(f.config.logDir, 'audit', 'audit.current.jsonl'), '{invalid\n');
    await expect(recoverWorkflowClassification(f.config, f.request, { dependencies: f.dependencies })).rejects.toThrow('WORKFLOW_RECOVERY_AUDIT_HISTORY_UNKNOWN');
    const other = await fixture();
    await expect(recoverWorkflowClassification(other.config, { ...other.request, principalId: randomUUID() }, { dependencies: other.dependencies })).rejects.toThrow('WORKFLOW_NOT_FOUND');
    await expect(recoverWorkflowClassification(other.config, { ...other.request, acknowledgeLegacyInstructionReview: false }, { dependencies: other.dependencies })).rejects.toThrow();
  });
});
