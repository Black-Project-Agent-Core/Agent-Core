import { constants } from 'node:fs';
import { access, lstat, readFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { userInfo } from 'node:os';
import * as z from 'zod/v4';
import type { AppConfig } from '../config.js';
import { EXECUTION_STATE_VERSION } from '../execution/types.js';
import { FileNativeAuxStore } from '../memory/file-native/aux-store.js';
import { FileNativeMemoryRepository } from '../memory/file-native/vault-repository.js';
import { GraphifyAdapter, type GraphifyHealth } from '../memory/file-native/graphify-adapter.js';
import { canonicalFileNativeProjectId } from '../memory/file-native/paths.js';
import { acquireMemoryRecoveryLease } from '../memory/file-native/recovery-coordinator.js';
import { SupabaseDirectMemory, SupabaseDirectHttpTransport, type SupabaseDirectTransport } from '../memory/file-native/supabase-direct.js';
import type { WorkflowProjectionSnapshot } from '../memory/file-native/workflow-projection.js';
import { atomicReplaceValidated } from '../memory/file-native/atomic-writer.js';
import { redactMemoryText } from '../memory/redaction.js';
import { verifyAuditJournal, type AuditJournalRecord } from '../observability/audit-journal.js';
import { WorkflowStore, validateWorkflowRecord, workflowHash, workflowScopeId } from '../workflow/store.js';
import { WorkflowError, workflowRecordSchema, type WorkflowRecord, type WorkflowScope } from '../workflow/types.js';
import { classifyWorkflowInput } from '../workflow/classification.js';
import { WorkspacePolicy } from './workspace.js';

const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const classificationRecoveryRequestSchema = z.strictObject({
  principalId: z.string().min(1).max(200), projectId: z.string().min(1).max(5000), taskId: z.string().uuid(),
  expectedVersion: z.literal(2), expectedStateHash: hash, predecessorContentHash: hash,
  operatorReason: z.string().trim().min(40).max(2000), acknowledgeLegacyInstructionReview: z.literal(true),
});
export type ClassificationRecoveryRequest = z.infer<typeof classificationRecoveryRequestSchema>;
interface RecoveryDependencies { transport?: SupabaseDirectTransport; graphHealth?: () => Promise<GraphifyHealth> }
const fail = (code: string): never => { throw new WorkflowError(code, code); };
async function exists(file: string) { try { await lstat(file); return true; } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; } }
async function regularFile(file: string): Promise<string> {
  const info = await lstat(file);
  if (!info.isFile() || info.isSymbolicLink() || info.size > 64 * 1024 * 1024) return fail('WORKFLOW_RECOVERY_FILE_INVALID');
  return readFile(file, 'utf8');
}
async function directory(file: string) {
  const info = await lstat(file);
  if (!info.isDirectory() || info.isSymbolicLink()) return fail('WORKFLOW_RECOVERY_DIRECTORY_INVALID');
  return readdir(file, { withFileTypes: true });
}
function emptyContract(record: WorkflowRecord) {
  return record.phase === 'DISCOVERY' && !record.donors.length && !record.requirements.length && !record.snapshots.length
    && !record.receipts.length && !record.blockers.length && !record.plan && !record.verification && !record.closure
    && !record.classification && !record.classificationRecovery;
}
function legacyEligibility(scope: WorkflowScope, current: WorkflowRecord, predecessor: WorkflowRecord, request: ClassificationRecoveryRequest) {
  if (current.version !== 2 || current.stateHash !== request.expectedStateHash) return fail('WORKFLOW_VERSION_CONFLICT');
  if (!emptyContract(current) || !emptyContract(predecessor) || !current.craftRequired || predecessor.craftRequired || predecessor.version !== 1) return fail('WORKFLOW_RECOVERY_NOT_EMPTY_LEGACY');
  if (!current.dagRequired || !current.planRequired || current.dagRequired !== predecessor.dagRequired || current.planRequired !== predecessor.planRequired) return fail('WORKFLOW_RECOVERY_OBLIGATIONS_CHANGED');
  for (const key of ['principalId', 'projectId', 'taskId'] as const) if (current[key] !== scope[key] || predecessor[key] !== scope[key]) return fail('WORKFLOW_SCOPE_MISMATCH');
  if (current.brief !== predecessor.brief || current.targetRoot !== predecessor.targetRoot || current.createdAt !== predecessor.createdAt) return fail('WORKFLOW_RECOVERY_DIFFERENT_BRIEF');
  if (classifyWorkflowInput({ brief: current.brief, context: current.context }, Date.now()).result.craftRequired) return fail('WORKFLOW_RECOVERY_EXPLICIT_CRAFT_REQUEST');
}

async function executionEvidence(root: string, scope: WorkflowScope, routeIds: Set<string>, taskCreatedAt: number) {
  const markerText = await regularFile(path.join(root, 'state.json'));
  if (JSON.parse(markerText).stateVersion !== EXECUTION_STATE_VERSION) return fail('WORKFLOW_RECOVERY_EXECUTION_HISTORY_UNKNOWN');
  if ((await directory(path.join(root, 'journal'))).some(entry => entry.isFile() && entry.name.endsWith('.json'))) return fail('WORKFLOW_RECOVERY_EXECUTION_PENDING');
  const files: Array<[string, string]> = [['state.json', workflowHash(markerText)]];
  for (const entry of await directory(path.join(root, 'state', 'runs'))) {
    if (!entry.isDirectory() || entry.isSymbolicLink() || !z.string().uuid().safeParse(entry.name).success) return fail('WORKFLOW_RECOVERY_EXECUTION_HISTORY_UNKNOWN');
    const text = await regularFile(path.join(root, 'state', 'runs', entry.name, 'run.json'));
    const run = z.object({ runId: z.string().uuid(), principalId: z.string(), projectId: z.string().optional(), continuityTaskId: z.string().optional(), originRouteContextId: z.string().optional(), createdAt: z.number() }).parse(JSON.parse(text));
    if (run.runId !== entry.name) return fail('WORKFLOW_RECOVERY_EXECUTION_HISTORY_UNKNOWN');
    if (run.continuityTaskId === scope.taskId || run.originRouteContextId && routeIds.has(run.originRouteContextId)) return fail('WORKFLOW_RECOVERY_EXECUTION_EXISTS');
    if (run.principalId === scope.principalId && !run.continuityTaskId && run.createdAt >= taskCreatedAt) return fail('WORKFLOW_RECOVERY_EXECUTION_HISTORY_UNKNOWN');
    files.push([entry.name, workflowHash(text)]);
  }
  return { count: files.length - 1, hash: workflowHash(JSON.stringify(files.sort(([a], [b]) => a.localeCompare(b)))) };
}

async function auditEvidence(root: string, routeIds: Set<string>, taskCreatedAt: number, updatedAt: number) {
  const verified = await verifyAuditJournal(root);
  if (!verified.ok || verified.anchorSequence !== 0 || !verified.headHash || verified.records === 0) return fail('WORKFLOW_RECOVERY_AUDIT_HISTORY_UNKNOWN');
  const safeTools = new Set(['task_checkpoint', 'memory_status', 'memory_search', 'memory_get', 'memory_remember_more', 'memory_explain', 'continuity_get_task', 'continuity_frontier', 'continuity_resume_context', 'workflow_status', 'read_file', 'read_multiple_files', 'get_file_info', 'list_directory', 'search_files', 'workspace_info']);
  let first = Infinity, last = 0, scopedEvents = 0;
  for (const entry of await directory(root)) {
    if (!entry.name.endsWith('.jsonl')) continue;
    if (!entry.isFile() || entry.isSymbolicLink()) return fail('WORKFLOW_RECOVERY_AUDIT_HISTORY_UNKNOWN');
    for (const line of (await regularFile(path.join(root, entry.name))).split('\n').filter(line => line.trim())) {
      const event = JSON.parse(line) as AuditJournalRecord;
      const timestamp = Date.parse(event.timestamp);
      if (!Number.isFinite(timestamp)) return fail('WORKFLOW_RECOVERY_AUDIT_HISTORY_UNKNOWN');
      first = Math.min(first, timestamp); last = Math.max(last, timestamp);
      if (!event.routeContextId || !routeIds.has(event.routeContextId)) continue;
      scopedEvents++;
      if (event.category === 'tool' && (!event.toolName || !safeTools.has(event.toolName))) return fail('WORKFLOW_RECOVERY_OPERATION_EXISTS');
      if (event.category !== 'tool' && /execution|operation|filesystem|process/i.test(event.category + ':' + event.event)) return fail('WORKFLOW_RECOVERY_OPERATION_EXISTS');
    }
  }
  const again = await verifyAuditJournal(root);
  if (!again.ok || again.headHash !== verified.headHash || first > taskCreatedAt || last < updatedAt || scopedEvents === 0) return fail('WORKFLOW_RECOVERY_AUDIT_HISTORY_UNKNOWN');
  return { headHash: verified.headHash, scopedEvents, recordCount: verified.records };
}

function taskEvidence(snapshot: WorkflowProjectionSnapshot, taskId: string, now: number) {
  const task = snapshot.records.find(r => r.category === 'continuity-tasks' && r.recordId === taskId)?.document;
  if (!task || task.status !== 'interrupted' || typeof task.createdAt !== 'number') return fail('WORKFLOW_RECOVERY_TASK_NOT_INTERRUPTED');
  const lifecycles = snapshot.records.filter(r => r.category === 'lifecycles' && r.document.continuityTaskId === taskId).map(r => r.document);
  const turns = snapshot.records.filter(r => r.category === 'continuity-turns' && r.document.taskId === taskId).map(r => r.document);
  if (!lifecycles.length || !turns.length) return fail('WORKFLOW_RECOVERY_LIFECYCLE_HISTORY_UNKNOWN');
  if (lifecycles.some(r => r.meaningfulWorkCount !== 0 || r.firstMeaningfulAt || r.lastMeaningfulAt || r.postflightState === 'POSTFLIGHT_PENDING')) return fail('WORKFLOW_RECOVERY_OPERATION_EXISTS');
  // Generation projections intentionally omit lease expiries. Active turn states
  // must therefore be rejected rather than inferred expired from missing fields.
  if (turns.some(r => !['interrupted', 'checkpointed', 'completed', 'cancelled'].includes(String(r.state)))) return fail('WORKFLOW_RECOVERY_TURN_ACTIVE');
  const routes = new Set(turns.map(r => String(r.routeContextId)));
  if (lifecycles.some(r => !routes.has(String(r.routeContextId)))) return fail('WORKFLOW_RECOVERY_LIFECYCLE_HISTORY_UNKNOWN');
  return { taskCreatedAt: task.createdAt, routes, lifecycleCount: lifecycles.length, turnCount: turns.length, inspectedAt: now };
}

const journalSchema = z.strictObject({ schemaVersion: z.literal(1), request: classificationRecoveryRequestSchema, requestHash: hash, backupPath: z.string(), backupHash: hash, before: workflowRecordSchema, after: workflowRecordSchema });
type Journal = z.infer<typeof journalSchema>;

/** Local operator entry point. Dry-run never opens Runtime/ExecutionService or writes a record.
 * Apply requires a stopped cooperating runtime and the exclusive vault recovery lease. */
export async function recoverWorkflowClassification(config: AppConfig, raw: unknown,
  options: { apply?: boolean; dependencies?: RecoveryDependencies } = {}) {
  const request = classificationRecoveryRequestSchema.parse(raw), paths = config.memory.fileNative;
  if (redactMemoryText(request.operatorReason).text !== request.operatorReason) return fail('WORKFLOW_RECOVERY_REASON_SENSITIVE');
  if (!config.memory.enabled || !config.memory.supabaseDirect.enabled || config.memory.supabaseSecond.enabled) return fail('WORKFLOW_RECOVERY_DIRECT_MEMORY_REQUIRED');
  if (config.memory.principalId && config.memory.principalId !== request.principalId) return fail('WORKFLOW_SCOPE_MISMATCH');
  const root = new WorkspacePolicy(config.allowedRoots).resolveProjectRoot({ explicitRoot: request.projectId === 'agent-core://self' ? paths.projectRoot : request.projectId });
  const scope = { principalId: request.principalId, projectId: canonicalFileNativeProjectId(paths, root), taskId: request.taskId };
  if (scope.projectId !== request.projectId) return fail('WORKFLOW_SCOPE_MISMATCH');
  const recordId = workflowScopeId(scope), requestHash = workflowHash(JSON.stringify(request));
  const journalPath = path.join(paths.memoryRoot, 'recovery', 'workflow-classification.json');
  const backupPath = path.join(paths.memoryRoot, 'backups', `workflow-classification-${recordId}-${request.expectedStateHash}.json`);
  const store = new WorkflowStore(path.join(paths.vaultRoot, '.agent-core', 'state'), path.join(paths.projectRoot, 'runtime', 'craft', 'sources', 'locks'));
  const direct = new SupabaseDirectMemory(paths, new FileNativeMemoryRepository(paths), new FileNativeAuxStore(paths),
    options.dependencies?.transport ?? new SupabaseDirectHttpTransport(config.memory.supabaseDirect), config.memory.supabaseDirect.url!);
  const graph = new GraphifyAdapter(paths, { pythonPath: paths.pythonPath ?? path.join(paths.pythonRoot, process.platform === 'win32' ? 'python.exe' : 'bin/python3'), bridgePath: path.join(paths.projectRoot, 'scripts', 'memory', 'graphify-bridge.py') });
  // Existing directory checks precede read helpers that tolerate an absent vault.
  await directory(paths.vaultRoot); await access(paths.vaultRoot, constants.R_OK | constants.W_OK);
  const lease = options.apply ? await acquireMemoryRecoveryLease(paths, 'recovery') : undefined;
  try {
    if (await exists(path.join(paths.memoryRoot, 'recovery', 'workflow-restore.json'))) return fail('MEMORY_RECOVERY_PENDING');
    let journal: Journal | undefined;
    if (await exists(journalPath)) {
      journal = journalSchema.parse(JSON.parse(await regularFile(journalPath)));
      validateWorkflowRecord(journal.before); validateWorkflowRecord(journal.after);
      if (journal.requestHash !== requestHash || workflowHash(JSON.stringify(journal.request)) !== requestHash || journal.backupPath !== backupPath) return fail('WORKFLOW_RECOVERY_DIFFERENT_REQUEST');
      const backupText = await regularFile(backupPath);
      if (workflowHash(backupText) !== journal.backupHash) return fail('WORKFLOW_RECOVERY_BACKUP_INVALID');
      const backup = JSON.parse(backupText), before = validateWorkflowRecord(backup.current), prior = validateWorkflowRecord(backup.predecessor), correction = journal.after.classificationRecovery;
      legacyEligibility(scope, before, prior, request);
      if (before.stateHash !== journal.before.stateHash || !correction || correction.requestHash !== requestHash
        || correction.reason !== request.operatorReason || correction.beforeStateHash !== before.stateHash || correction.backupHash !== journal.backupHash
        || correction.beforeContentHash !== backup.eligibility.beforeContentHash || correction.predecessorContentHash !== request.predecessorContentHash
        || correction.auditHeadHash !== backup.eligibility.auditHeadHash || correction.executionInventoryHash !== backup.eligibility.executionInventoryHash
        || journal.after.updatedAt < before.updatedAt || correction.correctedAt < before.updatedAt) return fail('WORKFLOW_RECOVERY_JOURNAL_INVALID');
      const expected = workflowRecordSchema.parse({ ...before, version: 3, craftRequired: false, updatedAt: journal.after.updatedAt, classificationRecovery: correction });
      const { stateHash: _, ...body } = expected;
      if (workflowHash(JSON.stringify(body)) !== journal.after.stateHash) return fail('WORKFLOW_RECOVERY_JOURNAL_INVALID');
      const immutableBefore = await direct.getWorkflowRecord(scope, 'workflow-contracts', recordId, correction.beforeContentHash);
      const immutablePrior = await direct.getWorkflowRecord(scope, 'workflow-contracts', recordId, request.predecessorContentHash);
      if (immutableBefore?.document.stateHash !== before.stateHash || immutablePrior?.document.stateHash !== prior.stateHash) return fail('WORKFLOW_RECOVERY_REMOTE_RECORD_MISMATCH');
    }
    const health = await (options.dependencies?.graphHealth?.() ?? graph.health({ verifyContent: true }));
    if (!health.healthy) return fail('WORKFLOW_RECOVERY_GRAPH_UNHEALTHY');
    await direct.requireWorkflowHealth();
    let current = await store.read(scope);
    if (!current) return fail('WORKFLOW_NOT_FOUND');
    if (journal && current.stateHash === journal.after.stateHash) {
      if (!options.apply) return { state: 'WORKFLOW_CLASSIFICATION_SYNC_PENDING', applied: false, taskId: scope.taskId, requestHash, version: current.version, stateHash: current.stateHash };
    } else {
      if (journal && current.stateHash !== journal.before.stateHash) return fail('WORKFLOW_VERSION_CONFLICT');
      const predecessorRef = await direct.getWorkflowRecord(scope, 'workflow-contracts', recordId, request.predecessorContentHash);
      const currentRef = await direct.getWorkflowRecord(scope, 'workflow-contracts', recordId);
      if (!predecessorRef || !currentRef || currentRef.document.stateHash !== current.stateHash) return fail('WORKFLOW_RECOVERY_REMOTE_RECORD_MISMATCH');
      const predecessor = validateWorkflowRecord(predecessorRef.document);
      legacyEligibility(scope, current, predecessor, request);
      const beforeGeneration = await direct.verifyWorkflowGeneration(scope);
      const snapshot = await direct.workflowSnapshot(scope), task = taskEvidence(snapshot, scope.taskId, Date.now());
      const execution = await executionEvidence(config.execution.stateRoot, scope, task.routes, task.taskCreatedAt);
      const audit = await auditEvidence(path.join(config.logDir, 'audit'), task.routes, task.taskCreatedAt, current.updatedAt);
      if ((await store.read(scope))?.stateHash !== current.stateHash || (await direct.verifyWorkflowGeneration(scope)).generationId !== beforeGeneration.generationId) return fail('WORKFLOW_RECOVERY_STATE_CHANGED');
      const eligibility = { taskId: scope.taskId, principalId: scope.principalId, projectId: scope.projectId, version: current.version, stateHash: current.stateHash,
        requestHash, beforeContentHash: currentRef.contentHash, predecessorContentHash: predecessorRef.contentHash, generationId: beforeGeneration.generationId,
        auditHeadHash: audit.headHash, scopedAuditEvents: audit.scopedEvents, executionInventoryHash: execution.hash, executionRunsInspected: execution.count,
        lifecyclesInspected: task.lifecycleCount, turnsInspected: task.turnCount, preserves: { planRequired: current.planRequired, dagRequired: current.dagRequired },
        requiresStoppedRuntimeToApply: true, operatorInstructionReview: true };
      if (!options.apply) return { state: 'WORKFLOW_CLASSIFICATION_ELIGIBLE', applied: false, ...eligibility };
      if (!journal) {
        const backupText = JSON.stringify({ schemaVersion: 1, request, eligibility, current, predecessor }, null, 2) + '\n';
        const backupHash = workflowHash(backupText);
        if (await exists(backupPath)) { if (await regularFile(backupPath) !== backupText) return fail('WORKFLOW_RECOVERY_BACKUP_CONFLICT'); }
        else await atomicReplaceValidated(backupPath, backupText, text => { if (workflowHash(text) !== backupHash) return fail('WORKFLOW_RECOVERY_BACKUP_INVALID'); });
        const candidate = workflowRecordSchema.parse({ ...current, version: 3, craftRequired: false, updatedAt: Date.now(), classificationRecovery: {
          policyVersion: 'workflow-intent-v2', requestHash, correctedAt: Date.now(), operator: userInfo().username, reason: request.operatorReason,
          beforeVersion: 2, beforeStateHash: current.stateHash, beforeContentHash: currentRef.contentHash, predecessorContentHash: predecessorRef.contentHash,
          auditHeadHash: audit.headHash, executionInventoryHash: execution.hash, backupHash,
        } });
        const { stateHash: _, ...body } = candidate; candidate.stateHash = workflowHash(JSON.stringify(body));
        journal = { schemaVersion: 1, request, requestHash, backupPath, backupHash, before: current, after: candidate };
        await atomicReplaceValidated(journalPath, JSON.stringify(journal, null, 2) + '\n', text => { journalSchema.parse(JSON.parse(text)); });
      }
      current = await store.update(scope, 2, existing => {
        if (!existing || existing.stateHash !== request.expectedStateHash) return fail('WORKFLOW_VERSION_CONFLICT');
        return structuredClone(journal!.after);
      });
      if (current.stateHash !== journal.after.stateHash) return fail('WORKFLOW_RECOVERY_STATE_CHANGED');
    }
    const semantic = await direct.sync(scope);
    if (semantic.state !== 'synced') return fail('WORKFLOW_RECOVERY_SYNC_PENDING');
    await direct.syncWorkflow(scope);
    const verified = await direct.verifyWorkflowGeneration(scope);
    if ((await store.read(scope))?.stateHash !== journal!.after.stateHash) return fail('WORKFLOW_RECOVERY_STATE_CHANGED');
    await rm(journalPath);
    return { state: 'WORKFLOW_CLASSIFICATION_RECOVERED', applied: true, taskId: scope.taskId, requestHash, version: current.version, stateHash: current.stateHash,
      generationId: verified.generationId, logicalStateHash: verified.logicalStateHash, backupPath, backupHash: journal!.backupHash };
  } finally { await lease?.release(); }
}
