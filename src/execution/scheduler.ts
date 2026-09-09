import { randomUUID } from 'node:crypto';
import { ExecutionLogStore, type ExecutionResultMarker } from './log-store.js';
import type { ExecutionRunHandle, ExecutionRunOptions } from './runner.js';
import type { ExecutionScope, ExecutionRunState } from './types.js';
import { ExecutionStore, ExecutionStoreError, type ExecutionNodeRecord, type ExecutionRunRecord } from './store.js';
import type { ValidatedExecutionNode } from './dag.js';
import type { ExecutionEventJournal, ExecutionEventType } from './wake.js';
import { currentCorrelation, runWithCorrelation, type CorrelationContext } from '../observability/correlation.js';
import type { RuntimeMetricRegistry } from '../runtime/metric-window.js';
import type { ResourceGovernanceDecision } from './resource-governor.js';
import type { ResourceGovernor } from './resource-governor.js';
import type { WorkspacePolicy } from '../runtime/workspace.js';
import { ExecutionResourceClaims, hasExecutionResourceClaims } from './resource-claims.js';
import { executionIdentityHash, executionInputPaths, type DependencyIdentity, type ExecutionWorkflowBinding } from './provenance.js';

export interface ExecutionRunnerLike {
  start(
    runId: string,
    node: ValidatedExecutionNode,
    attemptId: string,
    attemptNo: number,
    options?: ExecutionRunOptions,
  ): Promise<ExecutionRunHandle>;
}

export interface ExecutionSchedulerStatus {
  runId: string;
  runningNodeIds: string[];
}

export interface ExecutionSchedulerOptions {
  logRoot: string;
  journal?: ExecutionEventJournal;
  onAttemptCompleted?: (scope: ExecutionScope, marker: ExecutionResultMarker) => Promise<void>;
  resourceGovernor?: ResourceGovernor;
  metrics?: RuntimeMetricRegistry;
  workspace?: WorkspacePolicy;
  resourceClaims?: ExecutionResourceClaims;
  beforeDispatch?: (scope: ExecutionScope, run: ExecutionRunRecord, node: ExecutionNodeRecord) => Promise<void>;
  requiresWorkflowAfterAttempt?: boolean;
}

interface ActiveExecution {
  handle: ExecutionRunHandle;
  settled: Promise<void>;
}

const FAILED_DEPENDENCY_STATES = new Set(['failed', 'blocked', 'interrupted', 'cancelled']);

export function executionNodeSpec(node: ExecutionNodeRecord): ValidatedExecutionNode {
  return {
    id: node.nodeId,
    purpose: node.purpose,
    command: node.command,
    cwd: node.cwd,
    dependsOn: [...node.dependsOn],
    timeoutMs: node.timeoutMs,
    expectedArtifacts: node.expectedArtifacts.map((artifact) => ({ ...artifact })),
    stepIds: node.stepIds ?? [],
    ...(node.resources ? { resources: node.resources } : {}),
    ...(node.inputs ? { inputs: node.inputs } : {}),
    ...(node.toolchain ? { toolchain: node.toolchain } : {}),
  };
}

function nodeTerminalEvent(marker: ExecutionResultMarker): ExecutionEventType {
  if (marker.state === 'succeeded') return 'node.succeeded';
  if (marker.state === 'failed') return 'node.failed';
  if (marker.state === 'interrupted') return 'node.interrupted';
  return 'node.cancelled';
}

function runTerminalEvent(state: ExecutionRunState): ExecutionEventType | null {
  if (state === 'completed') return 'run.completed';
  if (state === 'failed') return 'run.failed';
  if (state === 'blocked') return 'run.blocked';
  if (state === 'interrupted') return 'run.interrupted';
  if (state === 'cancelled') return 'run.cancelled';
  return null;
}

export class ExecutionScheduler {
  private readonly locks = new Map<string, Promise<void>>();
  private readonly active = new Map<string, ActiveExecution>();
  private readonly paths: ExecutionLogStore;
  private readonly journal?: ExecutionEventJournal;
  private readonly onAttemptCompleted?: (scope: ExecutionScope, marker: ExecutionResultMarker) => Promise<void>;
  private readonly resourceGovernor?: ResourceGovernor;
  private readonly metrics?: RuntimeMetricRegistry;
  private readonly resourceSignatures = new Map<string, string>();
  private closing = false;
  readonly resourceClaims: ExecutionResourceClaims;
  private readonly workspace?: WorkspacePolicy;
  private readonly beforeDispatch?: ExecutionSchedulerOptions['beforeDispatch'];
  private readonly runScopes = new Map<string, ExecutionScope>();
  private readonly requiresWorkflowAfterAttempt: boolean;

  constructor(
    readonly store: ExecutionStore,
    readonly runner: ExecutionRunnerLike,
    options: ExecutionSchedulerOptions,
  ) {
    this.paths = new ExecutionLogStore(options.logRoot);
    this.journal = options.journal;
    this.onAttemptCompleted = options.onAttemptCompleted;
    this.resourceGovernor = options.resourceGovernor;
    this.metrics = options.metrics;
    this.workspace = options.workspace;
    this.resourceClaims = options.resourceClaims ?? new ExecutionResourceClaims();
    this.beforeDispatch = options.beforeDispatch;
    this.requiresWorkflowAfterAttempt = Boolean(options.requiresWorkflowAfterAttempt);
  }

  async startRun(scope: ExecutionScope, runId: string): Promise<ExecutionSchedulerStatus> {
    this.runScopes.set(runId, scope);
    return this.withRunLock(runId, async () => {
      if (this.closing) throw new Error('EXECUTION_SCHEDULER_CLOSING');
      const run = await this.store.getRun(scope, runId);
      if (!run) throw new ExecutionStoreError('EXECUTION_RUN_NOT_FOUND', 'Execution run was not found in authenticated scope');
      if (run.state === 'planned') {
        await this.store.setRunState(scope, runId, 'running');
        await this.emit(scope, runId, 'run.started', { payload: { previousState: 'planned' } });
      } else if (run.state !== 'running') {
        throw new ExecutionStoreError('EXECUTION_RUN_NOT_STARTABLE', `Run cannot start from state ${run.state}`);
      }
      await this.reconcileAndDispatch(scope, runId);
      return this.schedulerStatus(runId);
    });
  }

  async retryNode(scope: ExecutionScope, runId: string, nodeId: string): Promise<ExecutionSchedulerStatus> {
    this.runScopes.set(runId, scope);
    return this.withRunLock(runId, async () => {
      if (this.closing) throw new Error('EXECUTION_SCHEDULER_CLOSING');
      if (this.active.has(this.key(runId, nodeId))) {
        throw new ExecutionStoreError('EXECUTION_RETRY_RUNNING', 'A running node cannot be retried');
      }
      const node = await this.store.getNode(scope, runId, nodeId);
      if (!node) throw new ExecutionStoreError('EXECUTION_NODE_NOT_FOUND', 'Execution node was not found');
      await this.store.resetNodeForRetry(scope, runId, nodeId);
      await this.emit(scope, runId, 'node.retry_started', {
        nodeId,
        payload: { previousState: node.state, nextAttemptNo: node.attemptCount + 1 },
      });
      await this.reconcileAndDispatch(scope, runId);
      return this.schedulerStatus(runId);
    });
  }

  async cancel(scope: ExecutionScope, runId: string, nodeId?: string): Promise<ExecutionSchedulerStatus> {
    const settlements: Promise<void>[] = [];
    await this.withRunLock(runId, async () => {
      if (this.closing) throw new Error('EXECUTION_SCHEDULER_CLOSING');
      const run = await this.store.getRun(scope, runId);
      if (!run) throw new ExecutionStoreError('EXECUTION_RUN_NOT_FOUND', 'Execution run was not found in authenticated scope');

      if (nodeId) {
        const node = await this.store.getNode(scope, runId, nodeId);
        if (!node) throw new ExecutionStoreError('EXECUTION_NODE_NOT_FOUND', 'Execution node was not found');
        if (node.state === 'cancelled') return;
        if (node.state === 'succeeded' || node.state === 'failed') {
          throw new ExecutionStoreError('EXECUTION_CANCEL_NOT_ALLOWED', `Node ${nodeId} cannot be cancelled from state ${node.state}`);
        }
        const active = this.active.get(this.key(runId, nodeId));
        if (active) {
          active.handle.terminate('cancelled');
          settlements.push(active.settled);
          return;
        }
        await this.store.setNodeState(scope, runId, nodeId, 'cancelled');
        await this.emit(scope, runId, 'node.cancelled', { nodeId, payload: { reason: 'explicit_cancel' } });
        await this.reconcileAndDispatch(scope, runId);
        return;
      }

      if (run.state === 'cancelled') return;
      const nodes = await this.store.getNodes(scope, runId);
      for (const node of nodes) {
        const active = this.active.get(this.key(runId, node.nodeId));
        if (active) {
          active.handle.terminate('cancelled');
          settlements.push(active.settled);
          continue;
        }
        if (node.state === 'queued' || node.state === 'ready' || node.state === 'blocked') {
          await this.store.setNodeState(scope, runId, node.nodeId, 'cancelled');
          await this.emit(scope, runId, 'node.cancelled', {
            nodeId: node.nodeId,
            payload: { reason: 'explicit_run_cancel' },
          });
        }
      }
    });

    if (settlements.length > 0) await Promise.allSettled(settlements);

    return this.withRunLock(runId, async () => {
      if (nodeId) {
        await this.reconcileAndDispatch(scope, runId);
        return this.schedulerStatus(runId);
      }
      const current = await this.store.getRun(scope, runId);
      if (!current) throw new ExecutionStoreError('EXECUTION_RUN_NOT_FOUND', 'Execution run was not found in authenticated scope');
      if (current.state !== 'cancelled') {
        await this.store.setRunState(scope, runId, 'cancelled');
        await this.emit(scope, runId, 'run.cancelled', { payload: { previousState: current.state } });
      }
      return this.schedulerStatus(runId);
    });
  }

  async close(): Promise<void> {
    if (this.closing) return;
    this.closing = true;
    const active = [...this.active.values()];
    for (const execution of active) execution.handle.terminate('interrupted');
    await Promise.allSettled(active.map((execution) => execution.settled));
    await Promise.allSettled([...this.locks.values()]);
    for (const [runId, scope] of [...this.runScopes]) {
      await this.withRunLock(runId, async () => {
        const run = await this.store.getRun(scope, runId);
        if (run?.state !== 'running') return;
        for (const node of await this.store.getNodes(scope, runId)) {
          if (node.state !== 'queued' && node.state !== 'ready') continue;
          await this.store.setNodeState(scope, runId, node.nodeId, 'interrupted', { reason: 'runtime_closed_before_dispatch' });
          await this.emit(scope, runId, 'node.interrupted', { nodeId: node.nodeId, payload: { reason: 'runtime_closed_before_dispatch' } });
        }
        await this.updateRunTerminalState(scope, runId, await this.store.getNodes(scope, runId));
      });
    }
    this.resourceSignatures.clear();
    this.runScopes.clear();
  }

  private async reconcileAndDispatch(scope: ExecutionScope, runId: string): Promise<void> {
    await this.propagateBlocked(scope, runId);
    let run = await this.store.getRun(scope, runId);
    if (!run) throw new ExecutionStoreError('EXECUTION_RUN_NOT_FOUND', 'Execution run disappeared from authenticated scope');
    let nodes = await this.store.getNodes(scope, runId);

    if (run.state !== 'running') return;
    if (this.closing) {
      await this.updateRunTerminalState(scope, runId, nodes);
      return;
    }

    const runningCount = nodes.filter((node) => node.state === 'running').length;
    const dispatchCeiling = await this.resourceDispatchCeiling(scope, run);
    let slots = Math.max(0, dispatchCeiling - runningCount);
    if (slots > 0) {
      const byId = new Map(nodes.map((node) => [node.nodeId, node]));
      const ready = nodes
        .filter((node) => (node.state === 'queued' || node.state === 'ready')
          && node.dependsOn.every((dependencyId) => byId.get(dependencyId)?.state === 'succeeded'))
        .sort((left, right) => left.nodeId.localeCompare(right.nodeId));
      for (const node of ready) {
        if (slots <= 0) break;
        try {
          const key = this.key(runId, node.nodeId);
          const resources = hasExecutionResourceClaims(node.resources) ? { ...node.resources, writes: [...(node.resources?.writes ?? []), ...node.expectedArtifacts.map((item) => item.path)] } : undefined;
          const claims = this.workspace ? await this.resourceClaims.resolve(this.workspace, node.cwd, resources, executionInputPaths(this.workspace, executionNodeSpec(node))) : [];
          if (!this.resourceClaims.acquire(key, claims)) continue;
          try {
            await this.beforeDispatch?.(scope, run, node);
            await this.launchNode(scope, runId, node);
          }
          catch (error) { this.releaseClaims(key, runId); throw error; }
          slots -= 1;
        } catch (error) {
          await this.store.setNodeState(scope, runId, node.nodeId, 'blocked', { reason: 'dispatch_guard', message: error instanceof Error ? error.message : String(error) });
          await this.emit(scope, runId, 'node.blocked', { nodeId: node.nodeId, payload: { reason: 'dispatch_guard' } });
        }
      }
    }

    await this.propagateBlocked(scope, runId);
    run = (await this.store.getRun(scope, runId))!;
    nodes = await this.store.getNodes(scope, runId);
    if (run.state === 'running') await this.updateRunTerminalState(scope, runId, nodes);
  }

  private async resourceDispatchCeiling(scope: ExecutionScope, run: ExecutionRunRecord): Promise<number> {
    if (!this.resourceGovernor) return run.maxConcurrency;
    const decision = await this.resourceGovernor.decide(run.maxConcurrency);
    const safeConcurrency = Math.max(1, Math.min(run.maxConcurrency, decision.safeConcurrency));
    this.metrics?.observe('execution.resource.safe_concurrency', safeConcurrency);
    await this.recordResourceTransition(scope, run.runId, decision);
    return safeConcurrency;
  }

  private async recordResourceTransition(
    scope: ExecutionScope,
    runId: string,
    decision: ResourceGovernanceDecision,
  ): Promise<void> {
    const pressured = decision.severity !== 'none';
    const previous = this.resourceSignatures.get(runId);
    if (pressured) {
      const signature = `${decision.safeConcurrency}|${decision.severity}|${decision.reasonCodes.join(',')}`;
      if (previous === signature) return;
      this.resourceSignatures.set(runId, signature);
      this.metrics?.increment('execution.resource_throttle.count');
      await this.emit(scope, runId, 'run.resource_throttled', {
        payload: {
          requestedMaxConcurrency: decision.requestedMaxConcurrency,
          safeConcurrency: decision.safeConcurrency,
          severity: decision.severity,
          reasonCodes: [...decision.reasonCodes],
        },
      });
      return;
    }
    if (!previous) return;
    this.resourceSignatures.delete(runId);
    this.metrics?.increment('execution.resource_recovery.count');
    await this.emit(scope, runId, 'run.resource_recovered', {
      payload: {
        requestedMaxConcurrency: decision.requestedMaxConcurrency,
        safeConcurrency: decision.safeConcurrency,
        severity: 'none',
        reasonCodes: [],
      },
    });
  }

  private async launchNode(scope: ExecutionScope, runId: string, node: ExecutionNodeRecord): Promise<void> {
    const attemptNo = node.attemptCount + 1;
    const attemptId = randomUUID();
    const parentCorrelation = currentCorrelation();
    const nodeCorrelation: CorrelationContext | null = parentCorrelation ? {
      ...parentCorrelation,
      runId,
      nodeId: node.nodeId,
    } : null;
    const attemptCorrelation: CorrelationContext | null = nodeCorrelation ? {
      ...nodeCorrelation,
      attemptId,
    } : null;
    const withNodeCorrelation = <T>(operation: () => T): T => nodeCorrelation
      ? runWithCorrelation(nodeCorrelation, operation)
      : operation();
    const withAttemptCorrelation = <T>(operation: () => T): T => attemptCorrelation
      ? runWithCorrelation(attemptCorrelation, operation)
      : operation();
    const paths = this.paths.paths(runId, node.nodeId, attemptNo);
    await withNodeCorrelation(() => this.emit(scope, runId, 'node.ready', {
      nodeId: node.nodeId,
      payload: { attemptNo, dependsOn: node.dependsOn },
    }));
    await this.store.createAttempt(scope, runId, node.nodeId, attemptId, attemptNo, paths);

    let handle: ExecutionRunHandle | undefined;
    try {
      const run = (await this.store.getRun(scope, runId))!;
      const dependencies = await this.dependencyIdentities(scope, runId, node.dependsOn);
      handle = await withAttemptCorrelation(() => this.runner.start(runId, executionNodeSpec(node), attemptId, attemptNo, {
        dependencies,
        workflowBinding: run.metadata.workflowBinding as ExecutionWorkflowBinding | undefined,
        onOutputAvailable: (payload) => withAttemptCorrelation(() => this.emit(scope, runId, 'node.output_available', {
          nodeId: node.nodeId,
          attemptId,
          payload: { ...payload },
        })).then(() => undefined),
      }));
      await this.store.setAttemptPid(scope, runId, node.nodeId, attemptNo, handle.pid);
      const pid = handle.pid;
      await withAttemptCorrelation(() => this.emit(scope, runId, 'node.started', {
        nodeId: node.nodeId,
        attemptId,
        payload: { attemptNo, pid },
      }));
    } catch (error) {
      if (handle) {
        handle.terminate('interrupted');
        await handle.completion.catch(() => undefined);
      }
      const failure = error instanceof Error ? error : new Error(String(error));
      await this.store.failAttemptStart(scope, runId, node.nodeId, attemptId, failure);
      await withAttemptCorrelation(() => this.emit(scope, runId, 'node.failed', {
        nodeId: node.nodeId,
        attemptId,
        payload: { attemptNo, startFailure: failure.message },
      }));
      this.releaseClaims(this.key(runId, node.nodeId), runId);
      return;
    }

    const key = this.key(runId, node.nodeId);
    const settled = handle.completion.then(
      (marker) => withAttemptCorrelation(() => this.withRunLock(runId, async () => {
        this.active.delete(key);
        await this.store.completeAttempt(scope, marker, { workflowPending: this.requiresWorkflowAfterAttempt });
        if (this.onAttemptCompleted) {
          try { await this.onAttemptCompleted(scope, marker); } catch { /* derived observers never override process truth */ }
        }
        await this.emit(scope, runId, nodeTerminalEvent(marker), {
          nodeId: marker.nodeId,
          attemptId: marker.attemptId,
          payload: {
            attemptNo: marker.attemptNo,
            exitCode: marker.exitCode,
            signal: marker.signal,
            stdoutBytes: marker.stdoutBytes,
            stderrBytes: marker.stderrBytes,
          },
        });
        this.releaseClaims(key, runId);
        await this.reconcileAndDispatch(scope, runId);
      })),
      (error) => withAttemptCorrelation(() => this.withRunLock(runId, async () => {
        this.active.delete(key);
        const failure = error instanceof Error ? error : new Error(String(error));
        await this.store.failAttemptStart(scope, runId, node.nodeId, attemptId, failure);
        await this.emit(scope, runId, 'node.failed', {
          nodeId: node.nodeId,
          attemptId,
          payload: { attemptNo, completionFailure: failure.message },
        });
        this.releaseClaims(key, runId);
        await this.reconcileAndDispatch(scope, runId);
      })),
    );
    this.active.set(key, { handle, settled });
    void settled.catch(() => { this.active.delete(key); this.releaseClaims(key, runId); });
  }

  async dependencyIdentities(scope: ExecutionScope, runId: string, ids: readonly string[]): Promise<DependencyIdentity[]> {
    const result: DependencyIdentity[] = [];
    for (const nodeId of [...ids].sort()) {
      const node = await this.store.getNode(scope, runId, nodeId);
      if (!node || node.state !== 'succeeded') throw new ExecutionStoreError('EXECUTION_DEPENDENCY_NOT_SUCCEEDED', `Dependency ${nodeId} has no current successful attempt`);
      const attempt = (await this.store.listAttempts(scope, runId, nodeId)).find((item) => item.attemptNo === node.attemptCount);
      if (!attempt) throw new ExecutionStoreError('EXECUTION_DEPENDENCY_EVIDENCE_MISSING', `Dependency ${nodeId} lacks attempt evidence`);
      const marker = await this.paths.readResult(runId, nodeId, attempt.attemptNo);
      if (!marker && node.inputs !== undefined) throw new ExecutionStoreError('EXECUTION_DEPENDENCY_EVIDENCE_MISSING', 'Source-bound dependency lacks its durable result marker');
      if (marker && marker.attemptId !== attempt.attemptId) throw new ExecutionStoreError('EXECUTION_RESULT_IDENTITY_MISMATCH', 'Dependency marker identity mismatch');
      // Test runners may persist only the store result; production runners always write a marker.
      result.push({ nodeId, attemptId: attempt.attemptId, attemptNo: attempt.attemptNo, resultHash: executionIdentityHash(marker ?? attempt) });
    }
    return result;
  }

  releaseClaims(key: string, completedRunId?: string): void {
    this.resourceClaims.release(key);
    if (this.closing) return;
    for (const [runId, scope] of this.runScopes) {
      if (runId === completedRunId) continue;
      queueMicrotask(() => { void this.withRunLock(runId, () => this.reconcileAndDispatch(scope, runId)).catch(() => undefined); });
    }
  }

  private async propagateBlocked(scope: ExecutionScope, runId: string): Promise<void> {
    while (true) {
      const nodes = await this.store.getNodes(scope, runId);
      const byId = new Map(nodes.map((node) => [node.nodeId, node]));
      const blocked = nodes
        .filter((node) => (node.state === 'queued' || node.state === 'ready')
          && node.dependsOn.some((dependencyId) => FAILED_DEPENDENCY_STATES.has(byId.get(dependencyId)?.state ?? '')))
        .sort((left, right) => left.nodeId.localeCompare(right.nodeId));
      if (blocked.length === 0) return;
      for (const node of blocked) {
        const failedDependencies = node.dependsOn.filter((dependencyId) => FAILED_DEPENDENCY_STATES.has(byId.get(dependencyId)?.state ?? ''));
        await this.store.setNodeState(scope, runId, node.nodeId, 'blocked', { failedDependencies });
        await this.emit(scope, runId, 'node.blocked', {
          nodeId: node.nodeId,
          payload: { failedDependencies },
        });
      }
    }
  }

  private async updateRunTerminalState(scope: ExecutionScope, runId: string, nodes: ExecutionNodeRecord[]): Promise<void> {
    if (nodes.length === 0) return;
    let nextState: ExecutionRunState;
    if (nodes.some((node) => node.state === 'running' || node.state === 'queued' || node.state === 'ready')) {
      nextState = 'running';
    } else if (nodes.every((node) => node.state === 'succeeded')) {
      nextState = 'completed';
    } else if (nodes.some((node) => node.state === 'failed')) {
      nextState = 'failed';
    } else if (nodes.some((node) => node.state === 'interrupted')) {
      nextState = 'interrupted';
    } else if (nodes.some((node) => node.state === 'cancelled')) {
      nextState = 'cancelled';
    } else {
      nextState = 'blocked';
    }
    const current = await this.store.getRun(scope, runId);
    if (!current || current.state === nextState) return;
    await this.store.setRunState(scope, runId, nextState);
    const eventType = runTerminalEvent(nextState);
    if (eventType) await this.emit(scope, runId, eventType, { payload: { previousState: current.state } });
    if (eventType) {
      this.resourceSignatures.delete(runId);
      this.runScopes.delete(runId);
    }
  }

  private async emit(
    scope: ExecutionScope,
    runId: string,
    eventType: ExecutionEventType,
    options: { nodeId?: string; attemptId?: string; payload?: Record<string, unknown> } = {},
  ): Promise<void> {
    if (this.journal) await this.journal.record(scope, runId, eventType, options);
  }

  private schedulerStatus(runId: string): ExecutionSchedulerStatus {
    const prefix = `${runId}/`;
    return {
      runId,
      runningNodeIds: [...this.active.keys()]
        .filter((key) => key.startsWith(prefix))
        .map((key) => key.slice(prefix.length))
        .sort((left, right) => left.localeCompare(right)),
    };
  }

  private key(runId: string, nodeId: string): string {
    return `${runId}/${nodeId}`;
  }

  async withRunLock<T>(runId: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(runId) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const tail = previous.catch(() => undefined).then(() => gate);
    this.locks.set(runId, tail);
    await previous.catch(() => undefined);
    try {
      return await operation();
    } finally {
      release();
      if (this.locks.get(runId) === tail) this.locks.delete(runId);
    }
  }
}

export type ExecutionTerminalCallback = (marker: ExecutionResultMarker) => void;
