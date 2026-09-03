import { describe, expect, it } from 'vitest';
import type { CraftPlan } from '../src/crafting/craft-plan.js';
import {
  CraftingExecutionController,
  evaluateCraftingExecution,
  type CraftingExecutionBackend,
  type CraftingExecutionStep,
} from '../src/crafting/execution-controller.js';
import type { CreateExecutionGraphInput, ExecutionRunView } from '../src/execution/service.js';
import type { ExecutionAttemptRecord, ExecutionNodeRecord } from '../src/execution/store.js';
import type { ExecutionScope } from '../src/execution/types.js';

const scope: ExecutionScope = { principalId: 'principal', projectId: '/host' };
const plan: CraftPlan = {
  craftPlanId: 'craft-plan:multi', craftingId: 'craft:multi', mode: 'BUILD_FROM_ZERO',
  featureContractHash: 'a'.repeat(64), referenceSetHash: 'b'.repeat(64), decisions: [],
  hostVerification: ['focused', 'diff'], donorVerification: [], status: 'ready', blockingReasons: [],
};

function record(id: string, state: ExecutionNodeRecord['state'], dependsOn: string[] = []): ExecutionNodeRecord {
  return {
    nodeId: id, runId: 'run-multi', purpose: id, command: 'echo ok', cwd: '/host', state,
    timeoutMs: 1000, continueOnFailure: false, expectedArtifacts: [], attemptCount: state === 'queued' ? 0 : 1,
    dependsOn, createdAt: 1, updatedAt: 2,
  };
}
function view(nodes: ExecutionNodeRecord[], verification: ExecutionRunView['evidence']['verification']): ExecutionRunView {
  return {
    runId: 'run-multi', principalId: 'principal', projectId: '/host', objective: 'multi', continuityTaskId: 'task',
    state: verification === 'verified' ? 'completed' : 'running', maxConcurrency: 3, metadata: {}, createdAt: 1, updatedAt: 2,
    lastEventSequence: 1, nodes,
    evidence: { verification, nodes: nodes.map((item) => ({
      nodeId: item.nodeId, attemptNo: item.state === 'queued' ? null : 1, resultVersion: item.state === 'queued' ? null : 2,
      processState: item.state, evidenceState: item.state === 'succeeded' ? 'verified' : 'pending',
      stdoutBytes: 0, stderrBytes: 0, stdoutSha256: null, stderrSha256: null, artifacts: [],
    })) },
  };
}

class FakeBackend implements CraftingExecutionBackend {
  created: CreateExecutionGraphInput[] = [];
  statusView = view([record('placeholder', 'queued')], 'pending');
  maxAllowed = 8;
  async create(_scope: ExecutionScope, input: CreateExecutionGraphInput) {
    if ((input.maxConcurrency ?? 1) > this.maxAllowed) throw new Error('EXECUTION_CONCURRENCY_INVALID');
    this.created.push(input);
    this.statusView = view(input.nodes.map((item) => record(item.id, 'queued', item.dependsOn ?? [])), 'pending');
    return this.statusView;
  }
  async start() { return this.statusView; }
  async status() { return this.statusView; }
  async retry() { return this.statusView; }
  async attempts(): Promise<ExecutionAttemptRecord[]> { return []; }
}
function step(stepId: string, purpose: string, dependsOn: string[] = []): CraftingExecutionStep {
  return { stepId, purpose, command: `echo ${stepId}`, cwd: '/host', ...(dependsOn.length ? { dependsOn } : {}) };
}

describe('Real Steel multi-command crafting DAG', () => {
  it('submits independent test, diff audit, and source inspection as dependency-free parallel nodes', async () => {
    const backend = new FakeBackend();
    const controller = new CraftingExecutionController(backend);
    await controller.startDag(scope, plan, {
      objective: 'verify independent evidence', maxConcurrency: 3,
      steps: [step('focused-test', 'focused test'), step('diff-audit', 'diff audit'), step('source-inspection', 'source inspection')],
    });
    const created = backend.created[0]!;
    expect(created.maxConcurrency).toBe(3);
    expect(created.nodes.map((item) => [item.id, item.dependsOn ?? []])).toEqual([
      ['focused-test', []], ['diff-audit', []], ['source-inspection', []],
    ]);
  });

  it('preserves build -> start -> health as a strict dependency chain', async () => {
    const backend = new FakeBackend();
    const controller = new CraftingExecutionController(backend);
    await controller.startDag(scope, plan, {
      objective: 'ordered runtime check', maxConcurrency: 3,
      steps: [step('build', 'build'), step('start', 'start', ['build']), step('health', 'health', ['start'])],
    });
    expect(backend.created[0]!.nodes.map((item) => ({ id: item.id, dependsOn: item.dependsOn ?? [] }))).toEqual([
      { id: 'build', dependsOn: [] }, { id: 'start', dependsOn: ['build'] }, { id: 'health', dependsOn: ['start'] },
    ]);
  });
  it('leaves unrelated work active while only hard dependents of a failed node are blocked', () => {
    const evaluation = evaluateCraftingExecution(view([
      record('build', 'failed'),
      record('health', 'blocked', ['build']),
      record('diff-audit', 'running'),
    ], 'pending'), []);
    expect(evaluation.failedNodeIds).toEqual(['build']);
    expect(evaluation.blockedNodeIds).toEqual(['health']);
    expect(evaluation.activeNodeIds).toEqual(['diff-audit']);
    expect(evaluation.nextAction).toEqual({ kind: 'REPAIR_RETRY', nodeIds: ['build'] });
  });

  it('does not clamp or bypass ExecutionService concurrency authority', async () => {
    const backend = new FakeBackend();
    backend.maxAllowed = 2;
    const controller = new CraftingExecutionController(backend);
    await expect(controller.startDag(scope, plan, {
      objective: 'respect backend concurrency', maxConcurrency: 3,
      steps: [step('a', 'a'), step('b', 'b'), step('c', 'c')],
    })).rejects.toThrow('EXECUTION_CONCURRENCY_INVALID');
  });

  it('waits for every required evidence-producing branch instead of closing on first success', () => {
    const evaluation = evaluateCraftingExecution(view([
      record('focused-test', 'succeeded'),
      record('diff-audit', 'running'),
    ], 'pending'), []);
    expect(evaluation.status).toBe('active');
    expect(evaluation.nextAction).toEqual({ kind: 'WAIT', nodeIds: ['diff-audit'] });
  });
  it('records bounded per-node sparepart and compatibility correlation in run metadata', async () => {
    const backend = new FakeBackend();
    const controller = new CraftingExecutionController(backend);
    await controller.startDag(scope, plan, {
      objective: 'correlated graph', maxConcurrency: 2,
      steps: [
        { ...step('adapt-core', 'adapt core'), sparepartId: 'core' },
        { ...step('wire-host', 'wire host', ['adapt-core']), sparepartId: 'core', compatibilityBoundary: 'host-api' },
      ],
    });
    expect((backend.created[0]!.metadata as any).crafting.steps).toEqual([
      { stepId: 'adapt-core', sparepartId: 'core' },
      { stepId: 'wire-host', sparepartId: 'core', compatibilityBoundary: 'host-api' },
    ]);
    expect(JSON.stringify(backend.created[0]!.metadata)).not.toMatch(/sourceBody|donorBody/i);
  });
});
