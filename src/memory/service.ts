import type { MemoryConfig } from '../config.js';
import type { RuntimeMetricRegistry } from '../runtime/metric-window.js';
import type {
  ContinuityBeginTurnResult,
  ContinuityCheckpointResult,
  ContinuityFrontierRecord,
  ContinuityReconcileResult,
  ContinuityTaskRecord,
} from '../continuity/store.js';
import type { ContinuityCapture, ContinuityCheckpointInput, ContinuityTurnState } from '../continuity/types.js';
import type { ContinuitySnapshot } from '../continuity/snapshot.js';
import { ContinuityPromoter, type ContinuityPromotionResult } from '../continuity/promoter.js';
import { MemoryContextLeaseAuthority, type IssuedMemoryContextLease, type ValidatedMemoryContextLease } from './context-lease.js';
import { MemoryHardLifecycleError, type MemoryContextLifecycleRecord } from './hard-lifecycle.js';
import { createDisabledPreflightResult } from './preflight.js';
import type { MemoryBackupRecord, RecordMemoryEventRequest } from './record-types.js';
import type {
  MemoryCommitRequest,
  MemoryCommitResult,
  MemoryDurabilityBoundaryReason,
  MemoryDurabilityBoundaryResult,
  MemoryPostflightApplyResult,
  MemoryPostflightEvaluation,
  MemoryPostflightRequest,
  MemoryPreflightRequest,
  MemoryPreflightResult,
  MemoryRememberMoreRequest,
  MemoryRememberMoreResult,
  MemoryReviseRequest,
  MemoryReviseResult,
  MemoryScope,
  MemorySearchRequest,
  MemorySearchResult,
  MemoryStatus,
} from './types.js';
import { FileNativeMemoryBackend, type MemoryGraphProvider } from './file-native/backend.js';
import { canonicalFileNativeProjectId } from './file-native/paths.js';
import type { FileSecondMemoryTransport } from './file-native/supabase-second-memory.js';
import type { SupabaseDirectTransport } from './file-native/supabase-direct.js';

type Backend = FileNativeMemoryBackend;
type Arg<K extends keyof Backend, I extends number = 0> = Backend[K] extends (...args: infer A) => unknown ? A[I] : never;
type View<K extends keyof Backend> = Backend[K] extends (...args: never[]) => Promise<infer R> ? R : never;

export type MemoryContextRecord = NonNullable<View<'getContext'>>;
export type MemoryGetWithProvenanceResult = NonNullable<View<'getWithProvenance'>>;
export type MemoryProvenanceEvent = MemoryGetWithProvenanceResult['provenance']['events'][number];
export type MemoryExplainView = NonNullable<View<'explain'>>;
export type MemoryExportView = View<'export'>;
export type MemoryServiceState = 'disabled' | 'idle' | 'healthy' | 'degraded' | 'closed';

export interface MemoryServiceDependencies {
  graphify?: MemoryGraphProvider;
  supabaseDirectTransport?: SupabaseDirectTransport;
  fileSecondTransport?: FileSecondMemoryTransport;
}

/**
 * The file-native Obsidian-compatible vault is the canonical write authority.
 * Optional Supabase retrieval contributes scoped remote context to recall.
 * MemoryService owns the lifecycle/lease policy that sits above it and nothing else.
 */
export class MemoryService {
  private state: MemoryServiceState;
  private degradedReason: string | undefined;
  private lastBackup: MemoryBackupRecord | undefined;
  private readonly contextLeaseAuthority = new MemoryContextLeaseAuthority();
  private readonly fileNative: FileNativeMemoryBackend | undefined;

  constructor(
    readonly config: MemoryConfig,
    private readonly metrics?: RuntimeMetricRegistry,
    dependencies: MemoryServiceDependencies = {},
  ) {
    this.fileNative = config.enabled
      ? new FileNativeMemoryBackend(config, dependencies)
      : undefined;
    this.state = config.enabled ? 'idle' : 'disabled';
  }

  get currentState(): MemoryServiceState {
    return this.state;
  }

  async hydrateRemote(scope: MemoryScope) {
    if (this.state !== 'idle') throw new Error('MEMORY_REMOTE_HYDRATION_REQUIRES_IDLE_SERVICE');
    if(!this.fileNative)throw new Error('MEMORY_DISABLED');
    return this.fileNative.hydrateFromSecondMemory(scope);
  }

  async assertWorkflowReady(scope:MemoryScope):Promise<void>{await(await this.backend()).assertWorkflowReady(scope);}
  async workflowClosureStatus(scope:MemoryScope,taskId:string,checkpointId:string){return(await this.backend()).workflowClosureStatus(scope,taskId,checkpointId);}

  async beginContinuityTurn(
    scope: MemoryScope,
    routeContextId: string,
    task: string,
    context: string | undefined,
    capture: ContinuityCapture = {},
    expiresAt?: number,
  ): Promise<ContinuityBeginTurnResult> {
    return (await this.backend()).beginContinuityTurn(scope, routeContextId, task, context, capture, expiresAt);
  }

  async checkpointContinuity(
    scope: MemoryScope,
    taskId: string,
    turnId: string,
    input: ContinuityCheckpointInput,
    closure?: Arg<'checkpointContinuity', 4>,
  ): Promise<ContinuityCheckpointResult> {
    return (await this.backend()).checkpointContinuity(scope, taskId, turnId, input, closure);
  }

  async promoteContinuityCheckpoint(
    scope: MemoryScope,
    taskId: string,
    checkpointId: string,
    input: ContinuityCheckpointInput,
  ): Promise<ContinuityPromotionResult> {
    return new ContinuityPromoter(this).promote(scope, taskId, checkpointId, input);
  }

  async closeContinuityTurn(
    scope: MemoryScope,
    turnId: string,
    finalState: Exclude<ContinuityTurnState, 'open'>,
  ): Promise<void> {
    await (await this.backend()).closeContinuityTurn(scope, turnId, finalState);
  }

  async getContinuityTask(scope: MemoryScope, taskId: string): Promise<ContinuityTaskRecord | null> {
    if (!this.config.enabled) return null;
    return (await this.backend()).getContinuityTask(scope, taskId);
  }

  async listContinuityFrontier(scope: MemoryScope, limit = 5): Promise<ContinuityFrontierRecord[]> {
    if (!this.config.enabled) return [];
    return (await this.backend()).listContinuityFrontier(scope, limit);
  }

  async getContinuitySnapshot(scope: MemoryScope): Promise<ContinuitySnapshot> {
    return (await this.backend()).getContinuitySnapshot(scope);
  }

  async reconcileContinuity(
    scope: MemoryScope,
    activeRouteContextIds: readonly string[],
  ): Promise<ContinuityReconcileResult> {
    return (await this.backend()).reconcileContinuity(scope, activeRouteContextIds);
  }

  async recordEvent(request: RecordMemoryEventRequest) {
    if (!this.config.enabled) return null;
    return (await this.backend()).recordEvent(request);
  }

  async commit(request: MemoryCommitRequest): Promise<MemoryCommitResult> {
    return (await this.backend()).commit(request);
  }

  async revise(request: MemoryReviseRequest): Promise<MemoryReviseResult> {
    return (await this.backend()).revise(request);
  }

  async search(request: MemorySearchRequest): Promise<MemorySearchResult> {
    const started = performance.now();
    try {
      if (!this.config.enabled) {
        const disabled = createDisabledPreflightResult({
          scope: request.scope,
          routeContextId: 'disabled-search',
          task: request.query || 'disabled search',
          expiresAt: Date.now() + 1,
        });
        return { query: request.query, hits: [], graphTruncated: false, snapshotHash: disabled.snapshotHash };
      }
      return await (await this.backend()).search(request);
    } catch (error) {
      this.metrics?.failure('memory.search.duration_ms', error instanceof Error ? error.name : 'MEMORY_SEARCH_ERROR');
      throw error;
    } finally {
      this.metrics?.observe('memory.search.duration_ms', Math.max(0, performance.now() - started));
    }
  }

  async preflight(request: MemoryPreflightRequest): Promise<MemoryPreflightResult> {
    const started = performance.now();
    try {
      if (!this.config.enabled) return createDisabledPreflightResult(request);
      return await (await this.backend()).preflight(request);
    } catch (error) {
      this.metrics?.failure('memory.preflight.duration_ms', error instanceof Error ? error.name : 'MEMORY_PREFLIGHT_ERROR');
      throw error;
    } finally {
      this.metrics?.observe('memory.preflight.duration_ms', Math.max(0, performance.now() - started));
    }
  }

  async issueContextLease(input: {
    scope: MemoryScope;
    contextId: string;
    routeContextId: string;
    now?: number;
  }): Promise<IssuedMemoryContextLease> {
    const now = input.now ?? Date.now();
    const lifecycle = await this.validateLifecycleContext({
      scope: input.scope,
      contextId: input.contextId,
      routeContextId: input.routeContextId,
      now,
    });
    return this.contextLeaseAuthority.issue(lifecycle, now);
  }

  async validateContextLease(input: {
    lease: string;
    workspaceRoot: string;
    now?: number;
  }): Promise<ValidatedMemoryContextLease> {
    if (!this.config.enabled) {
      throw new MemoryHardLifecycleError('MEMORY_PREFLIGHT_REQUIRED', 'Memory is disabled; lease authority is unavailable');
    }
    const now = input.now ?? Date.now();
    let decoded: ValidatedMemoryContextLease;
    try {
      decoded = this.contextLeaseAuthority.validate(input.lease, now);
    } catch (error) {
      if (error instanceof MemoryHardLifecycleError) throw error;
      throw new MemoryHardLifecycleError('MEMORY_PREFLIGHT_REQUIRED', 'Memory Context Lease validation failed');
    }
    if (decoded.scope.projectId !== canonicalFileNativeProjectId(this.config.fileNative, input.workspaceRoot)) {
      throw new MemoryHardLifecycleError('MEMORY_PREFLIGHT_REQUIRED', 'Memory Context Lease does not authorize this workspace');
    }
    const lifecycle = await this.validateLifecycleContext({
      scope: decoded.scope,
      contextId: decoded.contextId,
      routeContextId: decoded.routeContextId,
      now,
    });
    if (lifecycle.objectiveHash !== decoded.objectiveHash || decoded.expiresAt > lifecycle.expiresAt) {
      throw new MemoryHardLifecycleError('MEMORY_PREFLIGHT_REQUIRED', 'Memory Context Lease no longer matches persisted lifecycle authority');
    }
    return decoded;
  }

  async completeContextLeaseMeaningfulWork(input: {
    lease: string;
    workspaceRoot: string;
    toolName: string;
    reasonCode: string;
    now?: number;
  }): Promise<MemoryContextLifecycleRecord> {
    if (!this.config.enabled) {
      throw new MemoryHardLifecycleError('MEMORY_POSTFLIGHT_REQUIRED', 'Memory is disabled; completed work cannot be recorded');
    }
    const decoded = this.contextLeaseAuthority.validateCompletion(input.lease, input.now);
    if (decoded.scope.projectId !== canonicalFileNativeProjectId(this.config.fileNative, input.workspaceRoot)) {
      throw new MemoryHardLifecycleError('MEMORY_POSTFLIGHT_REQUIRED', 'Memory Context Lease does not authorize this workspace');
    }
    const lifecycle = await this.getLifecycleContext(decoded.scope, decoded.contextId);
    if (!lifecycle || lifecycle.routeContextId !== decoded.routeContextId
      || lifecycle.objectiveHash !== decoded.objectiveHash || decoded.expiresAt > lifecycle.expiresAt) {
      throw new MemoryHardLifecycleError('MEMORY_POSTFLIGHT_REQUIRED', 'Memory Context Lease no longer matches persisted lifecycle authority');
    }
    return this.markLifecycleMeaningfulWork({
      scope: decoded.scope,
      contextId: decoded.contextId,
      routeContextId: decoded.routeContextId,
      toolName: input.toolName,
      reasonCode: input.reasonCode,
      now: input.now,
    });
  }

  async getLifecycleContext(scope: MemoryScope, contextId: string): Promise<MemoryContextLifecycleRecord | null> {
    if (!this.config.enabled) return null;
    return (await this.backend()).getLifecycleContext(scope, contextId);
  }

  async findContinuityTurnForRoute(input: Arg<'findContinuityTurnForRoute'>) {
    if (!this.config.enabled) return null;
    return (await this.backend()).findContinuityTurnForRoute(input);
  }

  async findLifecycleByRoute(input: Arg<'findLifecycleByRoute'>): Promise<MemoryContextLifecycleRecord | null> {
    if (!this.config.enabled) return null;
    return (await this.backend()).findLifecycleByRoute(input);
  }

  async closeLifecycleDurably(input: Arg<'closeLifecycleDurably'>) {
    return (await this.postflightBackend()).closeLifecycleDurably(input);
  }

  async bindLifecycleTask(scope: MemoryScope, contextId: string, continuityTaskId: string): Promise<MemoryContextLifecycleRecord> {
    return (await this.lifecycleBackend()).bindLifecycleTask(scope, contextId, continuityTaskId);
  }

  async validateLifecycleContext(input: {
    scope: MemoryScope;
    contextId: string;
    routeContextId: string;
    now?: number;
  }): Promise<MemoryContextLifecycleRecord> {
    return (await this.lifecycleBackend()).validateLifecycleContext(input);
  }

  async markLifecycleMeaningfulWork(input: {
    scope: MemoryScope;
    contextId: string;
    routeContextId: string;
    toolName: string;
    reasonCode: string;
    now?: number;
  }): Promise<MemoryContextLifecycleRecord> {
    return (await this.lifecycleBackend()).markLifecycleMeaningfulWork(input);
  }

  async reconcileLifecycleDurability(scope: MemoryScope): Promise<{ reconciled: number; generationId?: string; logicalStateHash?: string }> {
    if (!this.config.enabled) return { reconciled: 0 };
    return (await this.backend()).reconcileLifecycleDurability(scope);
  }

  async findPendingLifecycle(input: Arg<'findPendingLifecycle'>): Promise<MemoryContextLifecycleRecord[]> {
    if (!this.config.enabled) return [];
    return (await this.backend()).findPendingLifecycle(input);
  }

  async findLifecycleReconciliationRequired(input: {
    scope: MemoryScope;
    objectiveHash?: string;
    continuityTaskId?: string;
    excludeContextId?: string;
  }): Promise<MemoryContextLifecycleRecord[]> {
    if (!this.config.enabled) return [];
    return (await this.backend()).findPendingLifecycle(input);
  }

  async prepareLifecycleClosure(input: {
    scope: MemoryScope;
    contextId: string;
    routeContextId: string;
    now?: number;
  }): Promise<MemoryContextLifecycleRecord> {
    return (await this.postflightBackend()).prepareLifecycleClosure(input);
  }

  async markLifecycleDurableClosure(input: {
    scope: MemoryScope;
    contextId: string;
    generationId: string;
    logicalStateHash: string;
    now?: number;
  }): Promise<MemoryContextLifecycleRecord> {
    return (await this.postflightBackend()).markLifecycleDurableClosure(input);
  }

  async rememberMore(request: MemoryRememberMoreRequest): Promise<MemoryRememberMoreResult> {
    return (await this.backend()).rememberMore(request);
  }

  async evaluatePostflight(request: MemoryPostflightRequest): Promise<MemoryPostflightEvaluation> {
    return (await this.backend()).evaluatePostflight(request);
  }

  async applyPostflight(request: MemoryPostflightRequest): Promise<MemoryPostflightApplyResult> {
    return (await this.backend()).applyPostflight(request);
  }

  async recordWriteDecision(input: Arg<'recordWriteDecision'>) {
    return (await this.backend()).recordWriteDecision(input);
  }

  async markWriteDecisionApplied(scope: MemoryScope, decisionId: string, result: Record<string, unknown>) {
    return (await this.backend()).markWriteDecisionApplied(scope, decisionId, result);
  }

  async getWriteDecision(scope: MemoryScope, decisionId: string) {
    if (!this.config.enabled) return null;
    return (await this.backend()).getWriteDecision(scope, decisionId);
  }

  async recordRecallExpansion(input: Arg<'recordRecallExpansion'>) {
    return (await this.backend()).recordRecallExpansion(input);
  }

  async listRecallExpansions(scope: MemoryScope, contextId: string) {
    if (!this.config.enabled) return [];
    return (await this.backend()).listRecallExpansions(scope, contextId);
  }

  async upsertNodeMetadata(input: Arg<'upsertNodeMetadata'>) {
    return (await this.backend()).upsertNodeMetadata(input);
  }

  async getNodeMetadata(scope: MemoryScope, memoryId: string) {
    if (!this.config.enabled) return null;
    return (await this.backend()).getNodeMetadata(scope, memoryId);
  }

  async setRemoteState(input: Arg<'setRemoteState'>) {
    return (await this.backend()).setRemoteState(input);
  }

  async getRemoteState(scope: MemoryScope) {
    if (!this.config.enabled) return null;
    return (await this.backend()).getRemoteState(scope);
  }

  async syncDurableBoundary(
    scope: MemoryScope,
    reason: MemoryDurabilityBoundaryReason,
  ): Promise<MemoryDurabilityBoundaryResult> {
    if (!this.config.enabled) return { required: false, state: 'NOT_REQUIRED', reason };
    return (await this.backend()).syncDurableBoundary(scope, reason);
  }

  async openConflict(
    scope: MemoryScope,
    leftMemoryId: string,
    rightMemoryId: string,
    conflictType: string,
    evidence: Record<string, unknown>,
  ) {
    return (await this.backend()).openConflict(scope, leftMemoryId, rightMemoryId, conflictType, evidence);
  }

  async listOpenConflicts(scope: MemoryScope) {
    if (!this.config.enabled) return [];
    return (await this.backend()).listOpenConflicts(scope);
  }

  async getMemory(scope: MemoryScope, memoryId: string) {
    if (!this.config.enabled) return null;
    return (await this.backend()).getMemory(scope, memoryId);
  }

  async listRevisions(scope: MemoryScope, memoryId: string) {
    if (!this.config.enabled) return [];
    return (await this.backend()).listRevisions(scope, memoryId);
  }

  async getWithProvenance(scope: MemoryScope, memoryId: string): Promise<MemoryGetWithProvenanceResult | null> {
    if (!this.config.enabled) return null;
    return (await this.backend()).getWithProvenance(scope, memoryId);
  }

  async explain(scope: MemoryScope, memoryId: string, query?: string): Promise<MemoryExplainView | null> {
    if (!this.config.enabled) return null;
    return (await this.backend()).explain(scope, memoryId, query);
  }

  async export(scope: MemoryScope, limit = 100): Promise<MemoryExportView> {
    if (!this.config.enabled) return { items: [], revisions: [], events: [], conflicts: [], truncated: false };
    return (await this.backend()).export(scope, limit);
  }

  async forget(scope: MemoryScope, memoryId: string, reason: string) {
    return (await this.backend()).forget(scope, memoryId, reason);
  }

  async compact(scope: MemoryScope, now = Date.now()) {
    return (await this.backend()).compact(scope, now);
  }

  async backup(reason = 'manual'): Promise<MemoryBackupRecord> {
    this.lastBackup = await (await this.backend()).backup(reason);
    return this.lastBackup;
  }

  async getContext(scope: MemoryScope, contextId: string): Promise<MemoryContextRecord | null> {
    if (!this.config.enabled) return null;
    return (await this.backend()).getContext(scope, contextId);
  }

  async status(scope?: MemoryScope): Promise<MemoryStatus> {
    if (!this.config.enabled) {
      return {
        enabled: false,
        healthy: false,
        schemaVersion: 1,
        vaultRoot: this.config.fileNative.vaultRoot,
        counts: {},
        integrity: 'disabled',
      };
    }
    try {
      const status = await (await this.backend()).status(scope);
      if (!status.healthy) {
        this.state = 'degraded';
        this.degradedReason = status.integrity;
      }
      return { ...status, ...(this.lastBackup ? { lastBackupPath: this.lastBackup.backupPath, lastBackupAt: this.lastBackup.createdAt } : {}) };
    } catch (error) {
      this.state = 'degraded';
      this.degradedReason = error instanceof Error ? error.message : String(error);
      return {
        enabled: true,
        healthy: false,
        schemaVersion: 1,
        vaultRoot: this.config.fileNative.vaultRoot,
        counts: {},
        integrity: `degraded:${this.degradedReason}`,
        lastIntegrityCheckAt: Date.now(),
        ...(this.lastBackup ? { lastBackupPath: this.lastBackup.backupPath, lastBackupAt: this.lastBackup.createdAt } : {}),
      };
    }
  }

  async syncDirectMemory(scope: MemoryScope) {
    return (await this.backend()).syncDirectMemory(scope);
  }

  async close(): Promise<void> {
    if (this.fileNative) await this.fileNative.close();
    this.state = 'closed';
  }

  /** The vault backend, opened and crash-recovered on first use. */
  private async backend(): Promise<FileNativeMemoryBackend> {
    if (!this.fileNative) throw new Error('MEMORY_DISABLED');
    if (this.state === 'closed') throw new Error('MEMORY_CLOSED');
    try {
      await this.fileNative.ensureReady();
      this.state = 'healthy';
      this.degradedReason = undefined;
      return this.fileNative;
    } catch (error) {
      this.state = 'degraded';
      this.degradedReason = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  private async lifecycleBackend(): Promise<FileNativeMemoryBackend> {
    if (!this.config.enabled) {
      throw new MemoryHardLifecycleError('MEMORY_PREFLIGHT_REQUIRED', 'Memory is disabled; persisted preflight compliance is unavailable');
    }
    return this.backend();
  }

  private async postflightBackend(): Promise<FileNativeMemoryBackend> {
    if (!this.config.enabled) {
      throw new MemoryHardLifecycleError('MEMORY_POSTFLIGHT_REQUIRED', 'Memory is disabled; postflight closure is unavailable');
    }
    return this.backend();
  }
}
