import type { CraftPlan } from './craft-plan.js';
import type { CreateExecutionGraphInput, ExecutionRunView } from '../execution/service.js';
import type { ExecutionAttemptRecord } from '../execution/store.js';
import type { ExecutionScope } from '../execution/types.js';
import type { ExecutionExpectedArtifactSpec } from '../execution/dag.js';

export interface CraftingExecutionBackend {
  create(scope: ExecutionScope, input: CreateExecutionGraphInput): Promise<ExecutionRunView>;
  start(scope: ExecutionScope, runId: string): Promise<ExecutionRunView>;
  status(scope: ExecutionScope, runId: string): Promise<ExecutionRunView | null>;
  retry(scope: ExecutionScope, runId: string, nodeId: string): Promise<ExecutionRunView>;
  attempts(scope: ExecutionScope, runId: string, nodeId?: string): Promise<ExecutionAttemptRecord[]>;
}

export interface CraftingExecutionStep {
  stepId: string;
  purpose: string;
  command: string;
  cwd: string;
  sparepartId?: string;
  compatibilityBoundary?: string;
  dependsOn?: string[];
  timeoutMs?: number;
  continueOnFailure?: boolean;
  expectedArtifacts?: ExecutionExpectedArtifactSpec[];
}

export interface CraftingExecutionDagRequest {
  objective: string;
  steps: CraftingExecutionStep[];
  maxConcurrency?: number;
  continuityTaskId?: string;
  originRouteContextId?: string;
}
export type CraftingExecutionNextAction =
  | { kind: 'REPAIR_RETRY'; nodeIds: string[] }
  | { kind: 'WAIT'; nodeIds: string[] }
  | { kind: 'VERIFY'; nodeIds: string[] }
  | { kind: 'BLOCKED'; nodeIds: string[] }
  | { kind: 'NONE'; nodeIds: [] };
export interface CraftingExecutionEvaluation {
  status: 'active' | 'repair_required' | 'verification_pending' | 'blocked' | 'verified';
  failedNodeIds: string[];
  blockedNodeIds: string[];
  activeNodeIds: string[];
  missingEvidenceNodeIds: string[];
  nextAction: CraftingExecutionNextAction;
}

export interface CraftingExecutionObservation extends CraftingExecutionEvaluation {
  run: ExecutionRunView;
  attempts: ExecutionAttemptRecord[];
}

function sortedUnique(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

export function evaluateCraftingExecution(
  run: ExecutionRunView,
  _attempts: ExecutionAttemptRecord[],
): CraftingExecutionEvaluation {
  const failedNodeIds = sortedUnique(run.nodes
    .filter((item) => item.state === 'failed' || item.state === 'interrupted')
    .map((item) => item.nodeId));
  const blockedNodeIds = sortedUnique(run.nodes
    .filter((item) => item.state === 'blocked')
    .map((item) => item.nodeId));
  const activeNodeIds = sortedUnique(run.nodes
    .filter((item) => item.state === 'queued' || item.state === 'ready' || item.state === 'running')
    .map((item) => item.nodeId));
  const missingEvidenceNodeIds = sortedUnique(run.evidence.nodes
    .filter((item) => item.processState === 'succeeded'
      && item.evidenceState !== 'verified')
    .map((item) => item.nodeId));
  const repairNodeIds = sortedUnique([...failedNodeIds, ...missingEvidenceNodeIds]);
  if (repairNodeIds.length > 0) {
    return {
      status: 'repair_required', failedNodeIds, blockedNodeIds, activeNodeIds, missingEvidenceNodeIds,
      nextAction: { kind: 'REPAIR_RETRY', nodeIds: repairNodeIds },
    };
  }
  if (activeNodeIds.length > 0) {
    return {
      status: 'active', failedNodeIds, blockedNodeIds, activeNodeIds, missingEvidenceNodeIds,
      nextAction: { kind: 'WAIT', nodeIds: activeNodeIds },
    };
  }
  if (blockedNodeIds.length > 0) {
    return {
      status: 'blocked', failedNodeIds, blockedNodeIds, activeNodeIds, missingEvidenceNodeIds,
      nextAction: { kind: 'BLOCKED', nodeIds: blockedNodeIds },
    };
  }
  if (run.evidence.verification !== 'verified') {
    const succeeded = sortedUnique(run.nodes.filter((item) => item.state === 'succeeded').map((item) => item.nodeId));
    return {
      status: 'verification_pending', failedNodeIds, blockedNodeIds, activeNodeIds, missingEvidenceNodeIds,
      nextAction: { kind: 'VERIFY', nodeIds: succeeded },
    };
  }
  return {
    status: 'verified', failedNodeIds, blockedNodeIds, activeNodeIds, missingEvidenceNodeIds,
    nextAction: { kind: 'NONE', nodeIds: [] },
  };
}
export class CraftingExecutionController {
  constructor(private readonly backend: CraftingExecutionBackend) {}

  async start(
    scope: ExecutionScope,
    plan: CraftPlan,
    step: CraftingExecutionStep,
  ): Promise<CraftingExecutionObservation> {
    if (plan.status !== 'ready') throw new Error('Crafting execution requires a ready craft plan');
    const metadata = {
      crafting: {
        craftingId: plan.craftingId,
        craftPlanId: plan.craftPlanId,
        stepId: step.stepId,
        ...(step.sparepartId ? { sparepartId: step.sparepartId } : {}),
        ...(step.compatibilityBoundary ? { compatibilityBoundary: step.compatibilityBoundary } : {}),
      },
    };
    const created = await this.backend.create(scope, {
      objective: step.purpose,
      nodes: [{
        id: step.stepId,
        purpose: step.purpose,
        command: step.command,
        cwd: step.cwd,
        ...(step.dependsOn ? { dependsOn: [...step.dependsOn] } : {}),
        ...(step.timeoutMs !== undefined ? { timeoutMs: step.timeoutMs } : {}),
        ...(step.continueOnFailure !== undefined ? { continueOnFailure: step.continueOnFailure } : {}),
        ...(step.expectedArtifacts ? { expectedArtifacts: structuredClone(step.expectedArtifacts) } : {}),
      }],
      metadata,
    });
    const started = await this.backend.start(scope, created.runId);
    return this.observeView(scope, started);
  }
  async startDag(
    scope: ExecutionScope,
    plan: CraftPlan,
    request: CraftingExecutionDagRequest,
  ): Promise<CraftingExecutionObservation> {
    if (plan.status !== 'ready') throw new Error('Crafting execution requires a ready craft plan');
    if (!request.steps.length) throw new Error('Crafting execution DAG requires at least one step');
    const stepCorrelations = request.steps.map((step) => ({
      stepId: step.stepId,
      ...(step.sparepartId ? { sparepartId: step.sparepartId } : {}),
      ...(step.compatibilityBoundary ? { compatibilityBoundary: step.compatibilityBoundary } : {}),
    }));
    const nodes = request.steps.map((step) => ({
      id: step.stepId,
      purpose: step.purpose,
      command: step.command,
      cwd: step.cwd,
      ...(step.dependsOn ? { dependsOn: [...step.dependsOn] } : {}),
      ...(step.timeoutMs !== undefined ? { timeoutMs: step.timeoutMs } : {}),
      ...(step.continueOnFailure !== undefined ? { continueOnFailure: step.continueOnFailure } : {}),
      ...(step.expectedArtifacts ? { expectedArtifacts: structuredClone(step.expectedArtifacts) } : {}),
    }));
    const created = await this.backend.create(scope, {
      objective: request.objective,
      nodes,
      ...(request.maxConcurrency !== undefined ? { maxConcurrency: request.maxConcurrency } : {}),
      ...(request.continuityTaskId ? { continuityTaskId: request.continuityTaskId } : {}),
      ...(request.originRouteContextId ? { originRouteContextId: request.originRouteContextId } : {}),
      metadata: {
        crafting: {
          craftingId: plan.craftingId,
          craftPlanId: plan.craftPlanId,
          steps: stepCorrelations,
        },
      },
    });
    const started = await this.backend.start(scope, created.runId);
    return this.observeView(scope, started);
  }
  async observe(
    scope: ExecutionScope,
    _plan: CraftPlan,
    runId: string,
  ): Promise<CraftingExecutionObservation> {
    const run = await this.backend.status(scope, runId);
    if (!run) throw new Error(`Crafting execution run was not found: ${runId}`);
    return this.observeView(scope, run);
  }

  async retry(
    scope: ExecutionScope,
    _plan: CraftPlan,
    runId: string,
    nodeId: string,
  ): Promise<CraftingExecutionObservation> {
    const run = await this.backend.retry(scope, runId, nodeId);
    return this.observeView(scope, run);
  }

  private async observeView(
    scope: ExecutionScope,
    run: ExecutionRunView,
  ): Promise<CraftingExecutionObservation> {
    const attempts = await this.backend.attempts(scope, run.runId);
    const evaluation = evaluateCraftingExecution(run, attempts);
    return {
      ...evaluation,
      run,
      attempts,
    };
  }
}
