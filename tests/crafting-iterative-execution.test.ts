import { describe, expect, it } from 'vitest';
import type { CraftPlan } from '../src/crafting/craft-plan.js';
import {
  CraftingExecutionController,
  evaluateCraftingExecution,
  type CraftingExecutionBackend,
} from '../src/crafting/execution-controller.js';
import type { ExecutionAttemptRecord, ExecutionNodeRecord } from '../src/execution/store.js';
import type { ExecutionRunView } from '../src/execution/service.js';
import type { ExecutionScope } from '../src/execution/types.js';

const scope: ExecutionScope = { principalId: 'principal', projectId: '/host' };
const plan: CraftPlan = {
  craftPlanId: 'craft-plan:test', craftingId: 'craft:test', mode: 'BUILD_FROM_ZERO',
  featureContractHash: 'a'.repeat(64), referenceSetHash: 'b'.repeat(64), decisions: [],
  hostVerification: ['focused test'], donorVerification: [], status: 'ready', blockingReasons: [],
};

function node(id: string, state: ExecutionNodeRecord['state'], dependsOn: string[] = []): ExecutionNodeRecord {
  return {
    nodeId: id, runId: 'run-1', purpose: id, command: 'node -e "process.exit(0)"', cwd: '/host',
    state, timeoutMs: 1000, continueOnFailure: false, expectedArtifacts: [], attemptCount: state === 'queued' ? 0 : 1,
    dependsOn, createdAt: 1, updatedAt: 1,
  };
}

function view(nodes: ExecutionNodeRecord[], evidence: ExecutionRunView['evidence']): ExecutionRunView {
  return {
    runId: 'run-1', principalId: 'principal', projectId: '/host', objective: 'craft',
    continuityTaskId: 'task', state: nodes.every((item) => item.state === 'succeeded') ? 'completed' : 'running',
    maxConcurrency: 3, metadata: {}, createdAt: 1, updatedAt: 2, lastEventSequence: 1,
    nodes, evidence,
  };
}

function attempt(no: number, state: ExecutionAttemptRecord['state']): ExecutionAttemptRecord {
  return {
    attemptId: `attempt-${no}`, runId: 'run-1', nodeId: 'core', attemptNo: no, state,
    stdoutPath: `out-${no}`, stderrPath: `err-${no}`, resultPath: `result-${no}`,
    startedAt: no, ...(state === 'running' ? {} : { finishedAt: no + 1, exitCode: state === 'succeeded' ? 0 : 1 }),
    stdoutBytes: 0, stderrBytes: 0,
  };
}

class FakeBackend implements CraftingExecutionBackend {
  created: any[] = [];
  statuses: ExecutionRunView[] = [];
  attemptRecords: ExecutionAttemptRecord[] = [];
  retryCalls: string[] = [];
  async create(_scope: ExecutionScope, input: any) { this.created.push(input); return this.statuses[0]!; }
  async start() { return this.statuses[0]!; }
  async status() { return this.statuses[0] ?? null; }
  async retry(_scope: ExecutionScope, _runId: string, nodeId: string) { this.retryCalls.push(nodeId); return this.statuses.shift() ?? this.statuses[0]!; }
  async attempts() { return [...this.attemptRecords]; }
}

describe('Real Steel iterative crafting execution', () => {
  it('does not call a successful process verified when required artifact evidence failed', () => {
    const state = evaluateCraftingExecution(view(
      [node('core', 'succeeded')],
      { verification: 'failed', nodes: [{
        nodeId: 'core', attemptNo: 1, resultVersion: 2, processState: 'succeeded', evidenceState: 'failed',
        stdoutBytes: 0, stderrBytes: 0, stdoutSha256: null, stderrSha256: null, artifacts: [],
      }] },
    ), []);
    expect(state.status).toBe('repair_required');
    expect(state.missingEvidenceNodeIds).toEqual(['core']);
    expect(state.nextAction).toEqual({ kind: 'REPAIR_RETRY', nodeIds: ['core'] });
  });

  it('blocks only hard dependents of a failed node while unrelated work may continue', () => {
    const state = evaluateCraftingExecution(view(
      [node('core', 'failed'), node('dependent', 'blocked', ['core']), node('independent', 'running')],
      { verification: 'pending', nodes: [] },
    ), []);
    expect(state.failedNodeIds).toEqual(['core']);
    expect(state.blockedNodeIds).toEqual(['dependent']);
    expect(state.activeNodeIds).toEqual(['independent']);
    expect(state.nextAction).toEqual({ kind: 'REPAIR_RETRY', nodeIds: ['core'] });
  });

  it('preserves failed attempt evidence before a repaired retry succeeds', async () => {
    const backend = new FakeBackend();
    backend.statuses = [view(
      [node('core', 'failed')],
      { verification: 'failed', nodes: [{
        nodeId: 'core', attemptNo: 1, resultVersion: 2, processState: 'failed', evidenceState: 'not_declared',
        stdoutBytes: 0, stderrBytes: 0, stdoutSha256: null, stderrSha256: null, artifacts: [],
      }] },
    )];
    backend.attemptRecords = [attempt(1, 'failed')];
    const controller = new CraftingExecutionController(backend);
    const first = await controller.observe(scope, plan, 'run-1');
    expect(first.attempts.map((item) => item.state)).toEqual(['failed']);

    backend.statuses = [view(
      [node('core', 'succeeded')],
      { verification: 'verified', nodes: [{
        nodeId: 'core', attemptNo: 2, resultVersion: 2, processState: 'succeeded', evidenceState: 'verified',
        stdoutBytes: 0, stderrBytes: 0, stdoutSha256: null, stderrSha256: null, artifacts: [],
      }] },
    )];
    backend.attemptRecords = [attempt(1, 'failed'), attempt(2, 'succeeded')];
    const repaired = await controller.retry(scope, plan, 'run-1', 'core');
    expect(repaired.status).toBe('verified');
    expect(repaired.attempts.map((item) => item.state)).toEqual(['failed', 'succeeded']);
    expect(backend.retryCalls).toEqual(['core']);
  });

  it('starts bounded execution with crafting correlation metadata instead of raw donor source', async () => {
    const backend = new FakeBackend();
    backend.statuses = [view(
      [node('core', 'queued')],
      { verification: 'pending', nodes: [{
        nodeId: 'core', attemptNo: null, resultVersion: null, processState: 'queued', evidenceState: 'pending',
        stdoutBytes: 0, stderrBytes: 0, stdoutSha256: null, stderrSha256: null, artifacts: [],
      }] },
    )];
    const controller = new CraftingExecutionController(backend);
    await controller.start(scope, plan, {
      stepId: 'core-step', purpose: 'verify core', command: 'npm test', cwd: '/host', sparepartId: 'core',
    });
    expect(backend.created[0].metadata.crafting).toEqual({
      craftingId: 'craft:test', craftPlanId: 'craft-plan:test', stepId: 'core-step', sparepartId: 'core',
    });
    expect(JSON.stringify(backend.created[0].metadata)).not.toMatch(/sourceBody|donorBody/i);
  });
});
