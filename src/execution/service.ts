import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { correlationFields } from '../observability/correlation.js';
import type { ExecutionConfig } from '../config.js';
import type { ExecutionContinuitySummary } from '../continuity/snapshot.js';
import type { WorkspacePolicy } from '../runtime/workspace.js';
import type { RuntimeMetricRegistry } from '../runtime/metric-window.js';
import { validateExecutionDag, type ExecutionNodeSpec, type ExecutionResourceSpec } from './dag.js';
import { ExecutionArtifactManager } from './artifact-manager.js';
import type { ExecutionArtifactEvidence } from './evidence.js';
import { ExecutionLogStore, type ExecutionResultMarker } from './log-store.js';
import type { ExecutionMemoryBridge } from './memory-bridge.js';
import {
  type ExecutionMemoryPreSearchResult,
  type ExecutionMemorySearchNode,
  ExecutionMemoryPreSearch,
} from './memory-search.js';
import { ExecutionOutputParserService, EXECUTION_OUTPUT_PARSER_VERSION, type ExecutionOutputParserLike } from './output-parser.js';
import { ExecutionRecovery } from './recovery.js';
import type { ResourceGovernor } from './resource-governor.js';
import { ExecutionRuntimeLease } from './runtime-lease.js';
import { ExecutionCommandRunner } from './runner.js';
import { ExecutionScheduler, executionNodeSpec, type ExecutionRunnerLike } from './scheduler.js';
import { executionApplicability, executionContentManifest, executionIdentityHash, executionInputPaths, executionNodeSpecHash, executionToolchainHash, type ContentEntry, type ExecutionApplicability, type ExecutionWorkflowBinding } from './provenance.js';
import { canonicalExecutionPath, hasExecutionResourceClaims, type ExecutionClaim } from './resource-claims.js';
import {
  ExecutionStore,
  ExecutionStoreError,
  executionWorkflowPending,
  type ExecutionNodeRecord,
  type ExecutionRunRecord,
} from './store.js';
import { EXECUTION_STATE_VERSION, type ExecutionScope } from './types.js';
import type { WorkflowActiveWriter, WorkflowExecutionTrust } from '../workflow/operation-ledger.js';
import {
  ExecutionEventJournal,
  ExecutionWakeCoordinator,
  type ExecutionEventFilter,
  type ExecutionEventRecord,
} from './wake.js';

export interface CreateExecutionGraphInput {
  objective: string;
  continuityTaskId?: string;
  originRouteContextId?: string;
  nodes: ExecutionNodeSpec[];
  maxConcurrency?: number;
  metadata?: Record<string, unknown>;
}

export type ExecutionEvidenceSummaryState = 'pending' | 'verified' | 'failed';
export type ExecutionNodeEvidenceState = 'pending' | 'not_declared' | 'verified' | 'failed';

export interface ExecutionNodeEvidenceSummary {
  nodeId: string;
  attemptNo: number | null;
  resultVersion: 1 | 2 | null;
  processState: string;
  evidenceState: ExecutionNodeEvidenceState;
  stdoutBytes: number;
  stderrBytes: number;
  stdoutSha256: string | null;
  stderrSha256: string | null;
  artifacts: ExecutionArtifactEvidence[];
  applicability?: ExecutionApplicability;
  parsedOutput?: (import('./store.js').ExecutionParsedOutputView | { available: false; status: 'unavailable'; parserVersion: string })
    & { rawAccess?: import('./output-parser.js').ExecutionOutputRawAccess; recovery?: 'pending' };
}

export interface ExecutionRunEvidenceSummary {
  verification: ExecutionEvidenceSummaryState;
  nodes: ExecutionNodeEvidenceSummary[];
  current: boolean;
}

export interface ExecutionWorkflowGuardRequest {
  operation: 'create' | 'start' | 'add_nodes' | 'retry' | 'dispatch' | 'reconcile';
  scope: ExecutionScope;
  runId?: string;
  objective: string;
  nodes: readonly ExecutionNodeSpec[];
  continuityTaskId?: string;
  originRouteContextId?: string;
  /** Runtime-derived authority. This field is never part of the public execution input. */
  executionTrust?: WorkflowExecutionTrust;
}
export type ExecutionWorkflowGuard = (request: ExecutionWorkflowGuardRequest) => Promise<ExecutionWorkflowBinding | void>;
export interface ExecutionOperationContext { originRouteContextId?: string }
export type { ExecutionWorkflowBinding } from './provenance.js';

export interface ExecutionRunView extends ExecutionRunRecord {
  nodes: ExecutionNodeRecord[];
  evidence: ExecutionRunEvidenceSummary;
  memoryPreSearch?: ExecutionMemoryPreSearchResult;
}

export interface ExecutionWaitResult {
  event: ExecutionEventRecord | null;
  timedOut: boolean;
  lastEventSequence: number;
  state: ExecutionRunView;
}

export interface ExecutionServiceDependencies {
  store?: ExecutionStore;
  runner?: ExecutionRunnerLike;
  wake?: ExecutionWakeCoordinator;
  journal?: ExecutionEventJournal;
  memoryBridge?: ExecutionMemoryBridge;
  memorySearch?: ExecutionMemoryPreSearch;
  metrics?: RuntimeMetricRegistry;
  outputParser?: ExecutionOutputParserLike;
  artifactManager?: ExecutionArtifactManager;
  resourceGovernor?: ResourceGovernor;
  workflowGuard?: ExecutionWorkflowGuard;
  workflowAfterAttempt?: (scope: ExecutionScope, run: ExecutionRunRecord, node: ExecutionNodeRecord, marker: ExecutionResultMarker) => Promise<void>;
  /** Runtime acknowledgement of an implementation attempt in its current plan ledger. */
  workflowAcknowledgedOperation?: (scope: ExecutionScope, run: ExecutionRunRecord, node: ExecutionNodeRecord, marker: ExecutionResultMarker) => Promise<boolean>;
}

export type ExecutionServiceState = 'disabled' | 'idle' | 'healthy' | 'degraded' | 'closing' | 'closed';

export interface ExecutionHealth {
  enabled: boolean;
  healthy: boolean;
  state: ExecutionServiceState;
  stateVersion: number;
  stateRoot: string;
  integrity: string;
  activeRuns: number;
  queuedSync: number;
  lastIntegrityCheckAt?: number;
}

export class ExecutionService {
  readonly store: ExecutionStore;
  readonly wake: ExecutionWakeCoordinator;
  readonly journal: ExecutionEventJournal;
  readonly logs: ExecutionLogStore;
  readonly scheduler: ExecutionScheduler;
  readonly memoryBridge?: ExecutionMemoryBridge;
  readonly memorySearch?: ExecutionMemoryPreSearch;
  readonly metrics?: RuntimeMetricRegistry;
  readonly outputParser: ExecutionOutputParserLike;
  readonly artifacts: ExecutionArtifactManager;
  readonly workflowGuard?: ExecutionWorkflowGuard;
  private readonly workflowAfterAttempt?: ExecutionServiceDependencies['workflowAfterAttempt'];
  private readonly workflowAcknowledgedOperation?: ExecutionServiceDependencies['workflowAcknowledgedOperation'];
  private unsubscribeBridge?: () => void;
  private opened = false;
  private closed = false;
  private state: ExecutionServiceState;
  private degradedReason?: string;
  private runtimeLease?: ExecutionRuntimeLease;
  private readonly outputRecoveryAttempts = new Set<string>();
  private readonly outputCollection = new Map<string, Promise<void>>();

  constructor(
    readonly config: ExecutionConfig,
    readonly workspace: WorkspacePolicy,
    dependencies: ExecutionServiceDependencies = {},
  ) {
    this.state = config.enabled ? 'idle' : 'disabled';
    this.store = dependencies.store ?? new ExecutionStore();
    this.metrics = dependencies.metrics;
    this.logs = new ExecutionLogStore(config.logRoot);
    this.outputParser = dependencies.outputParser ?? new ExecutionOutputParserService(this.store, this.logs, this.metrics);
    this.artifacts = dependencies.artifactManager ?? new ExecutionArtifactManager(this.store, workspace, this.logs, this.metrics);
    this.wake = dependencies.wake ?? new ExecutionWakeCoordinator(this.store, this.metrics);
    this.journal = dependencies.journal ?? new ExecutionEventJournal(this.store, this.wake);
    this.memoryBridge = dependencies.memoryBridge;
    this.memorySearch = dependencies.memorySearch;
    this.workflowGuard = dependencies.workflowGuard;
    this.workflowAfterAttempt = dependencies.workflowAfterAttempt;
    this.workflowAcknowledgedOperation = dependencies.workflowAcknowledgedOperation;
    if (this.memoryBridge) {
      this.unsubscribeBridge = this.journal.subscribe((scope, event) => {
        this.memoryBridge!.dispatch(scope, event);
      });
    }
    const runner = dependencies.runner ?? new ExecutionCommandRunner(this.logs, workspace, { maxOutputBytes: config.maxOutputBytes });
    this.scheduler = new ExecutionScheduler(this.store, runner, {
      logRoot: config.logRoot,
      requiresWorkflowAfterAttempt: Boolean(dependencies.workflowAfterAttempt),
      journal: this.journal,
      onAttemptCompleted: async (scope, marker) => {
        if (dependencies.workflowAfterAttempt && marker.state === 'succeeded' && marker.provenance?.sourceBound && marker.provenance.inputsStableDuringAttempt) {
          const run = (await this.store.getRun(scope, marker.runId))!;
          const node = (await this.store.getNode(scope, marker.runId, marker.nodeId))!;
          try {
            await dependencies.workflowAfterAttempt(scope, run, node, marker);
            await this.store.settleWorkflowAttempt(scope, marker);
          }
          catch (error) {
            await this.store.settleWorkflowAttempt(scope, marker, error instanceof Error ? error.message : String(error));
            await this.journal.record(scope, marker.runId, 'node.output_available', { nodeId: marker.nodeId, attemptId: marker.attemptId,
              payload: { workflowPending: true, reason: error instanceof Error ? error.message : String(error) } });
            await this.store.setRunState(scope, marker.runId, 'blocked');
            await this.journal.record(scope, marker.runId, 'run.blocked', { payload: { reason: 'workflow_post_attempt_pending' } });
          }
        }
        await this.captureDerivedEvidence(scope, marker);
      },
      resourceGovernor: dependencies.resourceGovernor,
      metrics: this.metrics,
      workspace,
      beforeDispatch: async (scope, run, node) => {
        await this.guardWorkflow('dispatch', scope, run, [executionNodeSpec(node)]);
        if (this.workflowGuard && node.dependsOn.length > 0) {
          const view = await this.status(scope, run.runId);
          for (const dependency of node.dependsOn) {
            const evidence = view?.evidence.nodes.find((item) => item.nodeId === dependency);
            if (!evidence || (evidence.applicability !== 'current'
              && (!view || !await this.acknowledgedSupersededDependency(scope, view, node, dependency)))) {
              throw new ExecutionStoreError('EXECUTION_DEPENDENCY_EVIDENCE_STALE', `Dependency ${dependency} does not have current source-bound evidence`);
            }
          }
        }
      },
    });
  }

  get currentState(): ExecutionServiceState {
    return this.state;
  }

  /** A later prerequisite may replace an acknowledged implementation output, never a verification result. */
  private async acknowledgedSupersededDependency(scope: ExecutionScope, run: ExecutionRunView,
    consumer: ExecutionNodeRecord, dependencyId: string): Promise<boolean> {
    if (!this.workflowAcknowledgedOperation || executionWorkflowPending(run).length) return false;
    const predecessor = run.nodes.find(node => node.nodeId === dependencyId);
    const evidence = run.evidence.nodes.find(node => node.nodeId === dependencyId);
    if (!predecessor || predecessor.state !== 'succeeded'
      || !['inputs_changed', 'outputs_changed'].includes(evidence?.applicability ?? '')) return false;
    try {
      const marker = await this.logs.readResult(run.runId, dependencyId, predecessor.attemptCount);
      const provenance = marker?.provenance;
      if (!marker || !provenance?.writeManifest || !await this.workflowAcknowledgedOperation(scope, run, predecessor, marker)) return false;
      const spec = executionNodeSpec(predecessor);
      const dependencies = await this.scheduler.dependencyIdentities(scope, run.runId, predecessor.dependsOn);
      if (provenance.nodeSpecHash !== executionNodeSpecHash(spec)
        || executionIdentityHash(provenance.dependencies) !== executionIdentityHash(dependencies)
        || executionIdentityHash(provenance.inputPaths) !== executionIdentityHash(executionInputPaths(this.workspace, spec, run.projectId))
        || executionIdentityHash(provenance.inputManifest) !== provenance.inputManifestHash
        || executionIdentityHash(provenance.outputManifest) !== provenance.outputManifestHash
        || executionIdentityHash(provenance.writeManifest) !== provenance.writeManifestHash
        || await executionToolchainHash(spec) !== provenance.toolchainHash) return false;
      const ownWrites = await Promise.all((predecessor.resources?.writes ?? []).map(value => canonicalExecutionPath(path.resolve(predecessor.cwd, value))));
      if (!ownWrites.length) return false;
      const covers = (roots: string[], target: string) => roots.some(root => target === root || target.startsWith(`${root}${path.sep}`));
      const immutable = (entries: ContentEntry[]) => entries.filter(entry => !covers(ownWrites, entry.path));
      if (executionIdentityHash(immutable(await executionContentManifest(this.workspace, provenance.inputPaths)))
        !== executionIdentityHash(immutable(provenance.inputManifest))) return false;
      const ancestors = (node: ExecutionNodeRecord): Set<string> => {
        const result = new Set<string>(), pending = [...node.dependsOn];
        while (pending.length) {
          const id = pending.pop()!;
          if (result.has(id)) continue;
          result.add(id);
          pending.push(...(run.nodes.find(item => item.nodeId === id)?.dependsOn ?? []));
        }
        return result;
      };
      const prerequisites = ancestors(consumer), successorWrites: string[] = [];
      for (const successor of run.nodes) {
        if (!prerequisites.has(successor.nodeId) || !ancestors(successor).has(dependencyId)
          || successor.state !== 'succeeded'
          || run.evidence.nodes.find(item => item.nodeId === successor.nodeId)?.applicability !== 'current') continue;
        const successorMarker = await this.logs.readResult(run.runId, successor.nodeId, successor.attemptCount);
        if (!successorMarker || !await this.workflowAcknowledgedOperation(scope, run, successor, successorMarker)) continue;
        successorWrites.push(...await Promise.all((successor.resources?.writes ?? []).map(value => canonicalExecutionPath(path.resolve(successor.cwd, value)))));
      }
      if (!successorWrites.length) return false;
      for (const [before, paths] of [
        [provenance.writeManifest, (predecessor.resources?.writes ?? []).map(value => path.resolve(predecessor.cwd, value))],
        [provenance.outputManifest, predecessor.expectedArtifacts.map(item => item.path)],
      ] as Array<[ContentEntry[], string[]]>) {
        const after = await executionContentManifest(this.workspace, paths);
        const previous = new Map(before.map(entry => [entry.path, entry]));
        const current = new Map(after.map(entry => [entry.path, entry]));
        for (const target of new Set([...previous.keys(), ...current.keys()])) {
          if (executionIdentityHash(previous.get(target)) !== executionIdentityHash(current.get(target))
            && (!covers(ownWrites, target) || !covers(successorWrites, target))) return false;
        }
      }
      return true;
    } catch { return false; }
  }

  async open(): Promise<void> {
    if (this.closed || this.state === 'closed') throw new Error('EXECUTION_SERVICE_CLOSED');
    if (this.opened && this.state === 'healthy') return;
    if (!this.config.enabled) {
      this.state = 'disabled';
      throw new Error('EXECUTION_DISABLED');
    }
    if (this.state === 'degraded') throw new Error(`EXECUTION_DEGRADED:${this.degradedReason ?? 'unknown'}`);
    let acquiredLease: ExecutionRuntimeLease | undefined;
    try {
      acquiredLease = await ExecutionRuntimeLease.acquire(this.config.stateRoot);
      await this.store.open({ stateRoot: this.config.stateRoot, lockTimeoutMs: this.config.lockTimeoutMs });
      this.runtimeLease = acquiredLease;
      acquiredLease = undefined;
      const recovery = new ExecutionRecovery(this.store, this.logs, Boolean(this.workflowAfterAttempt));
      await recovery.reconcile();
      try {
        const reconciled = await this.artifacts.reconcile();
        if (reconciled.failed > 0) this.metrics?.failure('execution.artifact_index.duration_ms', 'EXECUTION_ARTIFACT_RECONCILE_PARTIAL');
      } catch {
        this.metrics?.failure('execution.artifact_index.duration_ms', 'EXECUTION_ARTIFACT_RECONCILE_FAILED');
      }
      this.opened = true;
      this.state = 'healthy';
      this.degradedReason = undefined;
    } catch (error) {
      this.opened = false;
      this.state = 'degraded';
      this.degradedReason = error instanceof Error ? error.message : String(error);
      try { await this.store.close(); } catch {}
      await acquiredLease?.release().catch(() => undefined);
      await this.runtimeLease?.release().catch(() => undefined);
      this.runtimeLease = undefined;
      throw error;
    }
  }

  async health(scope?: ExecutionScope): Promise<ExecutionHealth> {
    if (!this.config.enabled || this.state === 'disabled') {
      return { enabled: false, healthy: false, state: 'disabled', stateVersion: EXECUTION_STATE_VERSION, stateRoot: this.config.stateRoot, integrity: 'disabled', activeRuns: 0, queuedSync: 0 };
    }
    if (this.state === 'idle') {
      try { await this.open(); } catch {}
    }
    if (this.state !== 'healthy') {
      return { enabled: true, healthy: false, state: this.state, stateVersion: EXECUTION_STATE_VERSION, stateRoot: this.config.stateRoot, integrity: `degraded:${this.degradedReason ?? this.state}`, activeRuns: 0, queuedSync: 0 };
    }
    try {
      const status = await this.store.status();
      let activeRuns = 0;
      let queuedSync = 0;
      if (scope) {
        activeRuns = (await this.store.listRuns(scope, 1000)).filter((run) => run.state === 'planned' || run.state === 'running').length;
        queuedSync = await this.store.countMemorySyncQueue(scope);
      } else {
        const counts = await this.store.systemCounts();
        activeRuns = counts.activeRuns;
        queuedSync = counts.queuedSync;
      }
      if (!status.healthy) {
        this.state = 'degraded';
        this.degradedReason = status.integrity;
      }
      return {
        enabled: true,
        healthy: status.healthy,
        state: status.healthy ? 'healthy' : 'degraded',
        stateVersion: status.stateVersion,
        stateRoot: status.stateRoot,
        integrity: status.integrity,
        activeRuns,
        queuedSync,
        ...(status.lastIntegrityCheckAt ? { lastIntegrityCheckAt: status.lastIntegrityCheckAt } : {}),
      };
    } catch (error) {
      this.state = 'degraded';
      this.degradedReason = error instanceof Error ? error.message : String(error);
      return { enabled: true, healthy: false, state: 'degraded', stateVersion: EXECUTION_STATE_VERSION, stateRoot: this.config.stateRoot, integrity: `degraded:${this.degradedReason}`, activeRuns: 0, queuedSync: 0 };
    }
  }

  async create(scope: ExecutionScope, input: CreateExecutionGraphInput): Promise<ExecutionRunView> {
    this.assertReady();
    const requestedConcurrency = input.maxConcurrency ?? this.config.maxConcurrency;
    if (!Number.isInteger(requestedConcurrency) || requestedConcurrency < 1 || requestedConcurrency > this.config.maxConcurrency) {
      throw new ExecutionStoreError(
        'EXECUTION_CONCURRENCY_INVALID',
        `maxConcurrency must be between 1 and configured maximum ${this.config.maxConcurrency}`,
      );
    }
    const validationStarted = performance.now();
    let graph;
    try {
      graph = await validateExecutionDag(input.nodes, { workspace: this.workspace, maxNodes: this.config.maxNodes });
    } catch (error) {
      this.metrics?.failure('execution.dag_validation.duration_ms', error instanceof Error ? error.name : 'EXECUTION_DAG_ERROR');
      throw error;
    } finally {
      this.metrics?.observe('execution.dag_validation.duration_ms', Math.max(0, performance.now() - validationStarted));
    }
    const memoryPreSearch = await this.preSearch(scope, input.objective, graph.nodes);
    this.assertMemoryPreSearchAllowed(memoryPreSearch);
    const workflowBinding = await this.workflowGuard?.({ operation: 'create', scope, objective: input.objective, nodes: graph.nodes,
      continuityTaskId: input.continuityTaskId, originRouteContextId: input.originRouteContextId,
      executionTrust: { stage: 'create', activeWriters: [] } });
    if (this.workflowGuard && graph.nodes.some(node => node.inputs === undefined)) {
      throw new ExecutionStoreError('EXECUTION_INPUTS_REQUIRED', 'Each new execution node must declare its source inputs; use an explicit empty array only for commands with no source inputs');
    }
    const createdBy = correlationFields();
    const existingObservability = input.metadata?.observability && typeof input.metadata.observability === 'object'
      && !Array.isArray(input.metadata.observability)
      ? input.metadata.observability as Record<string, unknown>
      : {};
    const rawMetadata = Object.keys(createdBy).length > 0
      ? { ...(input.metadata ?? {}), observability: { ...existingObservability, createdBy } }
      : input.metadata;
    const metadata: Record<string, unknown> = { ...(rawMetadata ?? {}) };
    delete metadata.workflowBinding;
    delete metadata.workflowPendingAttempts;
    if (workflowBinding) metadata.workflowBinding = workflowBinding;
    const run = await this.store.createRun(scope, {
      objective: input.objective,
      continuityTaskId: input.continuityTaskId ?? randomUUID(),
      originRouteContextId: input.originRouteContextId,
      maxConcurrency: requestedConcurrency,
      metadata,
    });
    try {
      await this.store.persistGraph(scope, run.runId, graph.nodes);
      await this.journal.record(scope, run.runId, 'run.created', {
        payload: { objective: run.objective, maxConcurrency: run.maxConcurrency, nodeCount: graph.nodes.length },
      });
      for (const node of graph.nodes) {
        await this.journal.record(scope, run.runId, 'node.queued', {
          nodeId: node.id,
          payload: { dependsOn: node.dependsOn, timeoutMs: node.timeoutMs },
        });
      }
    } catch (error) {
      await this.store.setRunState(scope, run.runId, 'failed').catch(() => undefined);
      throw error;
    }
    const view = (await this.status(scope, run.runId))!;
    return memoryPreSearch ? { ...view, memoryPreSearch } : view;
  }

  async start(scope: ExecutionScope, runId: string, context: ExecutionOperationContext = {}): Promise<ExecutionRunView> {
    this.assertReady();
    await this.reconcileWorkflowAttempts(scope, runId, context);
    const run = await this.store.getRun(scope, runId);
    if (!run) throw new ExecutionStoreError('EXECUTION_RUN_NOT_FOUND', 'Execution run was not found in authenticated scope');
    const nodes = await this.store.getNodes(scope, runId);
    await this.guardWorkflow('start', scope, { ...run, ...(context.originRouteContextId ? context : {}) }, nodes.map(executionNodeSpec));
    const memoryPreSearch = await this.preSearch(
      scope,
      run.objective,
      nodes.map((node) => ({ id: node.nodeId, purpose: node.purpose })),
    );
    this.assertMemoryPreSearchAllowed(memoryPreSearch);
    if (run.state === 'completed') {
      const completed = (await this.status(scope, runId))!;
      return memoryPreSearch ? { ...completed, memoryPreSearch } : completed;
    }
    const dispatchStarted = performance.now();
    try {
      await this.scheduler.startRun(scope, runId);
    } catch (error) {
      this.metrics?.failure('execution.dispatch.duration_ms', error instanceof Error ? error.name : 'EXECUTION_DISPATCH_ERROR');
      throw error;
    } finally {
      this.metrics?.observe('execution.dispatch.duration_ms', Math.max(0, performance.now() - dispatchStarted));
    }
    const view = await this.status(scope, runId);
    if (!view) throw new ExecutionStoreError('EXECUTION_RUN_NOT_FOUND', 'Execution run was not found in authenticated scope');
    return memoryPreSearch ? { ...view, memoryPreSearch } : view;
  }

  async status(scope: ExecutionScope, runId: string): Promise<ExecutionRunView | null> {
    this.assertReady();
    const run = await this.store.getRun(scope, runId);
    if (!run) return null;
    const nodes = await this.store.getNodes(scope, runId);
    // One status snapshot can share executable reads; never cache evidence across operations.
    const toolchainHashes = new Map<string, Promise<string>>();
    const attempts = await this.store.listAttempts(scope, runId);
    const latestAttempt = new Map<string, (typeof attempts)[number]>();
    for (const attempt of attempts) latestAttempt.set(attempt.nodeId, attempt);

    const evidenceNodes: ExecutionNodeEvidenceSummary[] = [];
    let outputRecoveries = 0;
    for (const node of nodes) {
      const attempt = latestAttempt.get(node.nodeId);
      if (!attempt) {
        evidenceNodes.push({
          nodeId: node.nodeId,
          attemptNo: null,
          resultVersion: null,
          processState: node.state,
          evidenceState: 'pending',
          stdoutBytes: 0,
          stderrBytes: 0,
          stdoutSha256: null,
          stderrSha256: null,
          artifacts: [],
        });
        continue;
      }

      let parsedOutput: NonNullable<ExecutionNodeEvidenceSummary['parsedOutput']> = await this.store.getParsedOutput(scope, runId, node.nodeId, attempt.attemptNo)
        ?? { available: false as const, status: 'unavailable' as const, parserVersion: EXECUTION_OUTPUT_PARSER_VERSION };
      parsedOutput = { ...parsedOutput, rawAccess: { tool: 'execution_logs', runId, nodeId: node.nodeId,
        attemptId: attempt.attemptId, attemptNo: attempt.attemptNo, requiresRouteContext: true } };
      const marker = await this.logs.readResult(runId, node.nodeId, attempt.attemptNo);
      const terminalAttempt = ['succeeded', 'failed', 'interrupted', 'cancelled'].includes(attempt.state);
      if (marker && (marker.attemptId !== attempt.attemptId || node.attemptCount !== attempt.attemptNo
        || (terminalAttempt && (marker.stdoutSha256 !== attempt.stdoutSha256 || marker.stderrSha256 !== attempt.stderrSha256
          || marker.stdoutBytes !== attempt.stdoutBytes || marker.stderrBytes !== attempt.stderrBytes
          || marker.exitCode !== (attempt.exitCode ?? null) || marker.state !== attempt.state))
        || (parsedOutput.available && parsedOutput.binding && (
          parsedOutput.binding.runId !== marker.runId || parsedOutput.binding.attemptId !== marker.attemptId
          || parsedOutput.binding.planHash !== marker.provenance?.workflowBinding?.planHash
          || parsedOutput.binding.planRevision !== marker.provenance?.workflowBinding?.planRevision)))) {
        evidenceNodes.push({ nodeId: node.nodeId, attemptNo: attempt.attemptNo, resultVersion: marker.version, processState: attempt.state,
          evidenceState: 'failed', stdoutBytes: 0, stderrBytes: 0, stdoutSha256: null, stderrSha256: null, artifacts: [], applicability: 'identity_mismatch',
          parsedOutput: { available: false, status: 'degraded', parserVersion: parsedOutput.parserVersion,
            failureCode: 'EXECUTION_PARSED_OUTPUT_SOURCE_MISMATCH', rawAccess: parsedOutput.rawAccess } });
        continue;
      }
      if (!marker) {
        const terminal = ['succeeded', 'failed', 'interrupted', 'cancelled'].includes(attempt.state);
        evidenceNodes.push({
          nodeId: node.nodeId,
          attemptNo: attempt.attemptNo,
          resultVersion: null,
          processState: attempt.state,
          evidenceState: terminal ? 'failed' : 'pending',
          stdoutBytes: attempt.stdoutBytes,
          stderrBytes: attempt.stderrBytes,
          stdoutSha256: attempt.stdoutSha256 ?? null,
          stderrSha256: attempt.stderrSha256 ?? null,
          artifacts: [],
          parsedOutput,
        });
        continue;
      }

      // Recover only selected terminal output, never rescan all history or execute a process.
      if (!parsedOutput.available && ['succeeded', 'failed', 'interrupted', 'cancelled'].includes(attempt.state)) {
        const key = this.outputAttemptKey(scope, marker);
        const inFlight = this.outputCollection.get(key);
        if (inFlight) await inFlight;
        else if (!this.outputRecoveryAttempts.has(key)) {
          if (outputRecoveries < 2 && this.outputRecoveryAttempts.size < 1024) {
            outputRecoveries += 1;
            await this.collectOutput(scope, marker);
          } else parsedOutput = { ...parsedOutput, recovery: 'pending' };
        }
        const recovered = await this.store.getParsedOutput(scope, runId, node.nodeId, attempt.attemptNo);
        if (recovered) parsedOutput = { ...recovered, ...(parsedOutput.recovery ? { recovery: parsedOutput.recovery } : {}) };
      }
      parsedOutput = { ...parsedOutput, rawAccess: { tool: 'execution_logs', runId, nodeId: node.nodeId,
        attemptId: marker.attemptId, attemptNo: marker.attemptNo, requiresRouteContext: true } };

      let applicability: ExecutionApplicability = 'legacy_unbound';
      try {
        const dependencies = await this.scheduler.dependencyIdentities(scope, runId, node.dependsOn);
        applicability = await executionApplicability(this.workspace, executionNodeSpec(node), marker.provenance,
          { runId, attemptId: attempt.attemptId, attemptNo: attempt.attemptNo }, dependencies, run.metadata.workflowBinding as ExecutionWorkflowBinding | undefined, toolchainHashes, run.projectId);
      } catch { applicability = 'identity_mismatch'; }
      if (marker.version === 2) {
        evidenceNodes.push({
          nodeId: node.nodeId,
          attemptNo: marker.attemptNo,
          resultVersion: 2,
          processState: marker.processState,
          evidenceState: marker.evidenceState,
          stdoutBytes: marker.stdoutBytes,
          stderrBytes: marker.stderrBytes,
          stdoutSha256: marker.stdoutSha256,
          stderrSha256: marker.stderrSha256,
          artifacts: marker.evidence.artifacts.map((artifact) => ({ ...artifact })),
          parsedOutput,
          applicability,
        });
      } else {
        evidenceNodes.push({
          nodeId: node.nodeId,
          attemptNo: marker.attemptNo,
          resultVersion: 1,
          processState: marker.state,
          evidenceState: 'not_declared',
          stdoutBytes: marker.stdoutBytes,
          stderrBytes: marker.stderrBytes,
          stdoutSha256: marker.stdoutSha256,
          stderrSha256: marker.stderrSha256,
          artifacts: [],
          parsedOutput,
          applicability,
        });
      }
    }

    const verification: ExecutionEvidenceSummaryState = evidenceNodes.some((item) => item.evidenceState === 'failed')
      ? 'failed'
      : evidenceNodes.some((item) => item.evidenceState === 'pending')
        ? 'pending'
        : 'verified';
    return { ...run, nodes, evidence: { verification, nodes: evidenceNodes, current: evidenceNodes.length > 0 && evidenceNodes.every((item) => item.applicability === 'current') } };
  }

  async addNodes(scope: ExecutionScope, runId: string, nodes: ExecutionNodeSpec[], context: ExecutionOperationContext = {}): Promise<ExecutionRunView> {
    this.assertReady();
    const current = await this.status(scope, runId);
    if (!current) throw new ExecutionStoreError('EXECUTION_RUN_NOT_FOUND', 'Execution run was not found in authenticated scope');
    if (current.state !== 'planned' && current.state !== 'running') {
      throw new ExecutionStoreError('EXECUTION_RUN_NOT_EXTENSIBLE', `Nodes can only be added while run is planned or running, not ${current.state}`);
    }

    const existingSpecs: ExecutionNodeSpec[] = current.nodes.map(executionNodeSpec);
    const validationStarted = performance.now();
    let graph;
    try {
      graph = await validateExecutionDag([...existingSpecs, ...nodes], {
        workspace: this.workspace,
        maxNodes: this.config.maxNodes,
      });
    } catch (error) {
      this.metrics?.failure('execution.dag_validation.duration_ms', error instanceof Error ? error.name : 'EXECUTION_DAG_ERROR');
      throw error;
    } finally {
      this.metrics?.observe('execution.dag_validation.duration_ms', Math.max(0, performance.now() - validationStarted));
    }
    const requestedIds = new Set(nodes.map((node) => node.id.trim()));
    const validatedNew = graph.nodes.filter((node) => requestedIds.has(node.id));
    if (validatedNew.length !== nodes.length) {
      throw new ExecutionStoreError('EXECUTION_DYNAMIC_GRAPH_INVALID', 'Dynamic execution nodes did not validate one-to-one');
    }
    const memoryPreSearch = await this.preSearch(scope, current.objective, validatedNew);
    this.assertMemoryPreSearchAllowed(memoryPreSearch);
    await this.guardWorkflow('add_nodes', scope, { ...current, ...(context.originRouteContextId ? context : {}) }, graph.nodes);
    if (this.workflowGuard && nodes.some(node => node.inputs === undefined)) {
      throw new ExecutionStoreError('EXECUTION_INPUTS_REQUIRED', 'Each new execution node must declare its source inputs');
    }

    await this.store.appendGraphNodes(scope, runId, validatedNew);
    for (const node of validatedNew) {
      await this.journal.record(scope, runId, 'node.queued', {
        nodeId: node.id,
        payload: { dependsOn: node.dependsOn, timeoutMs: node.timeoutMs, dynamic: true },
      });
    }
    if (current.state === 'running') {
      const dispatchStarted = performance.now();
      try { await this.scheduler.startRun(scope, runId); }
      finally { this.metrics?.observe('execution.dispatch.duration_ms', Math.max(0, performance.now() - dispatchStarted)); }
    }
    const view = await this.status(scope, runId);
    if (!view) throw new ExecutionStoreError('EXECUTION_RUN_NOT_FOUND', 'Execution run was not found in authenticated scope');
    return memoryPreSearch ? { ...view, memoryPreSearch } : view;
  }

  async retry(scope: ExecutionScope, runId: string, nodeId: string, context: ExecutionOperationContext = {}): Promise<ExecutionRunView> {
    this.assertReady();
    const run = await this.store.getRun(scope, runId);
    const node = await this.store.getNode(scope, runId, nodeId);
    if (!run) throw new ExecutionStoreError('EXECUTION_RUN_NOT_FOUND', 'Execution run was not found in authenticated scope');
    if (!node) throw new ExecutionStoreError('EXECUTION_NODE_NOT_FOUND', 'Execution node was not found');
    await this.guardWorkflow('retry', scope, { ...run, ...(context.originRouteContextId ? context : {}) }, [executionNodeSpec(node)]);
    const memoryPreSearch = await this.preSearch(scope, run.objective, [{ id: node.nodeId, purpose: node.purpose }]);
    this.assertMemoryPreSearchAllowed(memoryPreSearch);
    const dispatchStarted = performance.now();
    try { await this.scheduler.retryNode(scope, runId, nodeId); }
    finally { this.metrics?.observe('execution.dispatch.duration_ms', Math.max(0, performance.now() - dispatchStarted)); }
    const view = await this.status(scope, runId);
    if (!view) throw new ExecutionStoreError('EXECUTION_RUN_NOT_FOUND', 'Execution run was not found in authenticated scope');
    return memoryPreSearch ? { ...view, memoryPreSearch } : view;
  }

  async cancel(scope: ExecutionScope, runId: string, nodeId?: string): Promise<ExecutionRunView> {
    this.assertReady();
    await this.scheduler.cancel(scope, runId, nodeId);
    const view = await this.status(scope, runId);
    if (!view) throw new ExecutionStoreError('EXECUTION_RUN_NOT_FOUND', 'Execution run was not found in authenticated scope');
    return view;
  }

  async events(
    scope: ExecutionScope,
    runId: string,
    afterSequence = 0,
    filters?: ExecutionEventFilter,
    limit = 1000,
  ): Promise<ExecutionEventRecord[]> {
    this.assertReady();
    return this.store.getEvents(scope, runId, afterSequence, filters, limit);
  }

  async wait(
    scope: ExecutionScope,
    runId: string,
    afterSequence: number,
    filters: ExecutionEventFilter | undefined,
    timeoutMs: number,
  ): Promise<ExecutionWaitResult> {
    this.assertReady();
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > this.config.waitMaxMs) {
      throw new Error(`EXECUTION_WAIT_TIMEOUT_INVALID:max ${this.config.waitMaxMs}`);
    }
    const event = await this.wake.waitForEvent(scope, runId, afterSequence, filters, timeoutMs);
    const state = await this.status(scope, runId);
    if (!state) throw new ExecutionStoreError('EXECUTION_RUN_NOT_FOUND', 'Execution run was not found in authenticated scope');
    return {
      event,
      timedOut: event === null,
      lastEventSequence: state.lastEventSequence,
      state,
    };
  }

  async readLog(
    scope: ExecutionScope,
    runId: string,
    nodeId: string,
    attemptNo: number,
    stream: 'stdout' | 'stderr',
    offset = 0,
    maxBytes = 64 * 1024,
  ) {
    this.assertReady();
    const run = await this.store.getRun(scope, runId);
    if (!run) throw new ExecutionStoreError('EXECUTION_RUN_NOT_FOUND', 'Execution run was not found in authenticated scope');
    const attempts = await this.store.listAttempts(scope, runId, nodeId);
    if (!attempts.some((attempt) => attempt.attemptNo === attemptNo)) {
      throw new ExecutionStoreError('EXECUTION_ATTEMPT_NOT_FOUND', 'Execution attempt was not found in authenticated scope');
    }
    return this.logs.readLog(runId, nodeId, attemptNo, stream, offset, maxBytes);
  }

  async runsForContinuityTask(scope: ExecutionScope, continuityTaskId: string): Promise<ExecutionRunView[]> {
    this.assertReady();
    const taskId = continuityTaskId.normalize('NFKC').trim();
    if (!taskId) throw new ExecutionStoreError('EXECUTION_CONTINUITY_TASK_REQUIRED', 'continuityTaskId is required');
    const inventory = await this.store.listRuns(scope, 1000);
    if (inventory.length === 1000) throw new ExecutionStoreError('EXECUTION_WORKFLOW_INVENTORY_LIMIT', 'Task completion cannot use a potentially truncated run inventory');
    const runs = inventory
      .filter((run) => run.continuityTaskId === taskId)
      .sort((left, right) => left.runId.localeCompare(right.runId));
    const views: ExecutionRunView[] = [];
    for (const run of runs) {
      const view = await this.status(scope, run.runId);
      if (view) views.push(view);
    }
    return views;
  }

  async continuitySummary(scope: ExecutionScope): Promise<ExecutionContinuitySummary> {
    this.assertReady();
    const runs = await this.store.listRuns(scope, 100);
    const compact = (run: ExecutionRunRecord) => ({
      runId: run.runId,
      ...(run.continuityTaskId ? { continuityTaskId: run.continuityTaskId } : {}),
      objective: run.objective.length <= 2_000 ? run.objective : `${run.objective.slice(0, 1_999)}…`,
      state: run.state as 'planned' | 'running' | 'interrupted',
      lastEventSequence: run.lastEventSequence,
      updatedAt: run.updatedAt,
    });
    const activeRuns = runs.filter((run) => run.state === 'planned' || run.state === 'running').slice(0, 10).map(compact);
    const interruptedRuns = runs.filter((run) => run.state === 'interrupted').slice(0, 10).map(compact);
    const terminal = runs.find((run) => ['completed', 'failed', 'blocked', 'interrupted', 'cancelled'].includes(run.state));
    return {
      activeRuns,
      interruptedRuns,
      lastExecutionCheckpoint: terminal ? {
        runId: terminal.runId,
        ...(terminal.continuityTaskId ? { continuityTaskId: terminal.continuityTaskId } : {}),
        state: terminal.state as 'completed' | 'failed' | 'blocked' | 'interrupted' | 'cancelled',
        lastEventSequence: terminal.lastEventSequence,
        ...(terminal.finishedAt ? { finishedAt: terminal.finishedAt } : {}),
        updatedAt: terminal.updatedAt,
      } : null,
    };
  }

  async recordOutputAvailable(
    scope: ExecutionScope,
    runId: string,
    nodeId: string,
    payload: Record<string, unknown> = {},
  ): Promise<ExecutionEventRecord | null> {
    this.assertReady();
    return this.journal.record(scope, runId, 'node.output_available', { nodeId, payload });
  }

  async close(): Promise<void> {
    if (this.closed || this.state === 'closed') return;
    this.closed = true;
    this.state = 'closing';
    if (this.opened) {
      await this.scheduler.close();
      if (this.memoryBridge) await this.memoryBridge.drain();
    }
    this.unsubscribeBridge?.();
    this.unsubscribeBridge = undefined;
    try { await this.store.close(); } catch {}
    await this.runtimeLease?.release().catch(() => undefined);
    this.runtimeLease = undefined;
    this.opened = false;
    this.state = 'closed';
  }

  private async captureDerivedEvidence(scope: ExecutionScope, marker: ExecutionResultMarker): Promise<void> {
    await this.collectOutput(scope, marker);
    try {
      await this.artifacts.indexAttempt(scope, marker.runId, marker.nodeId, marker.attemptNo);
    } catch (error) {
      this.metrics?.failure('execution.artifact_index.duration_ms', error instanceof Error ? error.name : 'EXECUTION_ARTIFACT_INDEX_FAILED');
    }
  }

  private outputAttemptKey(scope: ExecutionScope, marker: ExecutionResultMarker): string {
    return JSON.stringify([scope.principalId, scope.projectId, marker.runId, marker.nodeId, marker.attemptId,
      marker.stdoutSha256, marker.stderrSha256, this.outputParser.parserVersion ?? EXECUTION_OUTPUT_PARSER_VERSION]);
  }

  private async collectOutput(scope: ExecutionScope, marker: ExecutionResultMarker): Promise<void> {
    const key = this.outputAttemptKey(scope, marker);
    const existing = this.outputCollection.get(key);
    if (existing) return existing;
    const collect = (async () => {
      // Failed observations are attempted once per process lifetime; restart permits recovery.
      if (this.outputRecoveryAttempts.size < 1024) this.outputRecoveryAttempts.add(key);
      try {
        const parsed = await this.store.getParsedOutput(scope, marker.runId, marker.nodeId, marker.attemptNo);
        if (parsed?.available && parsed.parserVersion === (this.outputParser.parserVersion ?? EXECUTION_OUTPUT_PARSER_VERSION)) {
          this.outputRecoveryAttempts.delete(key);
          return;
        }
        await this.outputParser.parseAttempt(scope, marker);
        this.outputRecoveryAttempts.delete(key);
      } catch (error) {
        const code = error instanceof Error && 'code' in error && typeof (error as { code?: unknown }).code === 'string'
          ? String((error as { code: string }).code)
          : error instanceof Error ? error.name : 'EXECUTION_OUTPUT_PARSE_FAILED';
        this.metrics?.failure('execution.output_parse.duration_ms', code);
        await this.store.persistParsedOutputFailure(
          scope, marker, this.outputParser.parserVersion ?? EXECUTION_OUTPUT_PARSER_VERSION, code,
        ).catch(() => undefined);
      }
    })();
    this.outputCollection.set(key, collect);
    try { await collect; } finally { this.outputCollection.delete(key); }
  }

  private async guardWorkflow(operation: Exclude<ExecutionWorkflowGuardRequest['operation'], 'create'>, scope: ExecutionScope,
    run: ExecutionRunRecord, nodes: readonly ExecutionNodeSpec[]): Promise<void> {
    const binding = await this.workflowGuard?.({ operation, scope, runId: run.runId, objective: run.objective, nodes,
      continuityTaskId: run.continuityTaskId, originRouteContextId: run.originRouteContextId,
      executionTrust: await this.workflowExecutionTrust(scope, run.runId, operation) });
    const existing = run.metadata.workflowBinding;
    if (binding && existing && executionIdentityHash(existing) !== executionIdentityHash(binding)) {
      throw new ExecutionStoreError('EXECUTION_WORKFLOW_BINDING_CHANGED', 'Execution run belongs to a different workflow plan revision');
    }
    if (operation !== 'dispatch') await this.store.bindWorkflow(scope, run.runId, binding || undefined, run.originRouteContextId);
  }

  /** Read authoritative current attempts, including successful receipts still awaiting reconciliation. */
  async workflowExecutionTrust(scope: ExecutionScope, runId: string, stage: WorkflowExecutionTrust['stage'],
    exclude?: { nodeId: string; attemptId: string }): Promise<WorkflowExecutionTrust> {
    const owner = await this.store.getRun(scope, runId);
    if (!owner) throw new ExecutionStoreError('EXECUTION_RUN_NOT_FOUND', 'Execution run was not found in authenticated scope');
    const activeWriters: WorkflowActiveWriter[] = [];
    if (!owner.continuityTaskId) return { stage, activeWriters };
    const inventory = await this.store.listRuns(scope, 1000);
    if (inventory.length === 1000) throw new ExecutionStoreError('EXECUTION_WORKFLOW_INVENTORY_LIMIT', 'Current workflow writer inventory could be truncated');
    for (const run of inventory.filter(candidate => candidate.continuityTaskId === owner.continuityTaskId)) {
      const binding = run.metadata.workflowBinding as ExecutionWorkflowBinding | undefined;
      const planRevision = Number(binding?.planRevision);
      if (!Number.isSafeInteger(planRevision) || planRevision < 1 || !binding?.planHash) continue;
      const pending = executionWorkflowPending(run);
      const nodes = await this.store.getNodes(scope, run.runId);
      const attempts = await this.store.listAttempts(scope, run.runId);
      for (const node of nodes) {
        const attempt = attempts.find(candidate => candidate.nodeId === node.nodeId && candidate.attemptNo === node.attemptCount);
        if (!attempt || (run.runId === runId && node.nodeId === exclude?.nodeId && attempt.attemptId === exclude.attemptId)) continue;
        const running = node.state === 'running' && attempt.state === 'running';
        const awaiting = node.state === 'succeeded' && attempt.state === 'succeeded'
          && pending.some(item => item.nodeId === node.nodeId && item.attemptId === attempt.attemptId && item.attemptNo === attempt.attemptNo);
        if (!running && !awaiting) continue;
        if (awaiting) {
          const marker = await this.logs.readResult(run.runId, node.nodeId, attempt.attemptNo);
          if (!marker || marker.attemptId !== attempt.attemptId || marker.state !== 'succeeded'
            || !marker.provenance?.sourceBound || !marker.provenance.inputsStableDuringAttempt
            || executionIdentityHash(marker.provenance.workflowBinding) !== executionIdentityHash(binding)) continue;
        }
        activeWriters.push({ runId: run.runId, nodeId: node.nodeId, attemptId: attempt.attemptId, attemptNo: attempt.attemptNo,
          planRevision, planHash: binding.planHash, writes: (node.resources?.writes ?? []).map(value => path.resolve(node.cwd, value)) });
      }
    }
    return { stage, activeWriters };
  }

  private async reconcileWorkflowAttempts(scope: ExecutionScope, runId: string, context: ExecutionOperationContext): Promise<void> {
    await this.scheduler.withRunLock(runId, async () => {
      const stored = await this.store.getRun(scope, runId);
      if (!stored) throw new ExecutionStoreError('EXECUTION_RUN_NOT_FOUND', 'Execution run was not found in authenticated scope');
      const pending = executionWorkflowPending(stored);
      if (!pending.length) return;
      if (!this.workflowAfterAttempt || !this.workflowGuard) throw new ExecutionStoreError('EXECUTION_WORKFLOW_RECONCILE_UNAVAILABLE', 'Pending workflow requires its authenticated reconciliation callbacks');
      if (['cancelled', 'failed', 'interrupted'].includes(stored.state)) throw new ExecutionStoreError('EXECUTION_RUN_NOT_STARTABLE', 'This stopped run cannot reconcile through start');
      const run = { ...stored, ...(context.originRouteContextId ? context : {}) };
      const successful: ExecutionResultMarker[] = [];
      const entries: Array<{ node: ExecutionNodeRecord; marker: ExecutionResultMarker }> = [];
      const claims: ExecutionClaim[] = [];
      for (const pendingAttempt of pending) {
        const node = await this.store.getNode(scope, runId, pendingAttempt.nodeId);
        const marker = await this.logs.readResult(runId, pendingAttempt.nodeId, pendingAttempt.attemptNo);
        if (!node || node.state !== 'succeeded' || node.attemptCount !== pendingAttempt.attemptNo || !marker
          || marker.state !== 'succeeded' || marker.attemptId !== pendingAttempt.attemptId) {
          throw new ExecutionStoreError('EXECUTION_RESULT_IDENTITY_MISMATCH', 'Pending workflow evidence is not the current successful attempt');
        }
        const spec = executionNodeSpec(node);
        const resources = hasExecutionResourceClaims(node.resources) ? { ...node.resources, writes: [...(node.resources?.writes ?? []), ...node.expectedArtifacts.map(a => a.path)] } : undefined;
        claims.push(...await this.scheduler.resourceClaims.resolve(this.workspace, node.cwd, resources,
          executionInputPaths(this.workspace, spec, run.projectId), run.projectId));
        entries.push({ node, marker });
      }
      const owner = `workflow-reconcile/${randomUUID()}`;
      if (!this.scheduler.resourceClaims.acquire(owner, claims)) throw new ExecutionStoreError('EXECUTION_RESOURCE_BUSY', 'A running operation conflicts with workflow reconciliation');
      try {
        for (const { node, marker } of entries) {
          const spec = executionNodeSpec(node);
          await this.guardWorkflow('reconcile', scope, run, [spec]);
          const dependencies = await this.scheduler.dependencyIdentities(scope, runId, node.dependsOn);
          const applicability = await executionApplicability(this.workspace, spec, marker.provenance,
            { runId, attemptId: marker.attemptId, attemptNo: marker.attemptNo }, dependencies, run.metadata.workflowBinding as ExecutionWorkflowBinding | undefined, undefined, run.projectId);
          if (applicability !== 'current') throw new ExecutionStoreError('EXECUTION_WORKFLOW_EVIDENCE_STALE', 'Pending workflow callback requires unchanged source-bound successful evidence');
          await this.workflowAfterAttempt(scope, run, node, marker);
          successful.push(marker);
        }
        const nodes = await this.store.getNodes(scope, runId);
        await this.guardWorkflow('start', scope, run, nodes.map(executionNodeSpec));
        for (const [index, marker] of successful.entries()) await this.store.settleWorkflowAttempt(scope, marker, undefined,
          index === successful.length - 1 ? nodes.every(node => node.state === 'succeeded') ? 'completed' : 'running' : undefined);
      } finally { this.scheduler.releaseClaims(owner, runId); }
    });
  }

  async acquireWorkspaceClaim(scope: ExecutionScope, resources: ExecutionResourceSpec): Promise<() => Promise<void>> {
    if (!scope.principalId.trim()) throw new ExecutionStoreError('EXECUTION_SCOPE_REQUIRED', 'A principal is required for a workspace claim');
    const cwd = this.workspace.resolveProjectRoot({ explicitRoot: scope.projectId });
    const claims = await this.scheduler.resourceClaims.resolve(this.workspace, cwd, resources, [], cwd);
    const owner = `workspace/${randomUUID()}`;
    if (!this.scheduler.resourceClaims.acquire(owner, claims)) throw new ExecutionStoreError('EXECUTION_RESOURCE_BUSY', 'A running operation holds an overlapping workspace resource claim');
    let released = false;
    return async () => {
      if (released) return;
      released = true;
      this.scheduler.releaseClaims(owner);
    };
  }

  private async preSearch(
    scope: ExecutionScope,
    objective: string,
    nodes: readonly ExecutionMemorySearchNode[],
  ): Promise<ExecutionMemoryPreSearchResult | undefined> {
    if (!this.memorySearch) return undefined;
    return this.memorySearch.run(scope, objective, nodes);
  }

  private assertMemoryPreSearchAllowed(result: ExecutionMemoryPreSearchResult | undefined): void {
    if (!result?.blocked) return;
    throw new ExecutionStoreError(
      'EXECUTION_MEMORY_GUARDRAIL_BLOCKED',
      `Execution is blocked by ${result.blockingGuardrails.length} active hard memory guardrail(s)`,
      {
        memorySnapshotHash: result.snapshotHash,
        guardrails: result.blockingGuardrails.map((hit) => ({
          memoryId: hit.memoryId,
          revisionId: hit.revisionId,
          canonicalKey: hit.canonicalKey,
          ...(hit.sourceEventId ? { sourceEventId: hit.sourceEventId } : {}),
        })),
      },
    );
  }

  private assertReady(): void {
    if (!this.opened || this.closed || this.state !== 'healthy') throw new Error('EXECUTION_SERVICE_NOT_OPEN: execution service is not open');
  }
}
