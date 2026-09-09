import type { ExecutionLogStore } from './log-store.js';
import type { ExecutionRunState, ExecutionScope } from './types.js';
import { executionWorkflowPending, type ExecutionStore, type ExecutionRecoverableAttempt } from './store.js';

export interface ExecutionRecoveryResult {
  recoveredTerminal: number;
  interrupted: number;
  runsReconciled: number;
}

function scopeOf(attempt: ExecutionRecoverableAttempt): ExecutionScope {
  return { principalId: attempt.principalId, ...(attempt.projectId ? { projectId: attempt.projectId } : {}) };
}

function stateFromNodes(states: string[]): ExecutionRunState {
  if (states.some((state) => state === 'running' || state === 'queued' || state === 'ready')) return 'running';
  if (states.length > 0 && states.every((state) => state === 'succeeded')) return 'completed';
  if (states.some((state) => state === 'interrupted')) return 'interrupted';
  if (states.some((state) => state === 'failed')) return 'failed';
  if (states.some((state) => state === 'cancelled')) return 'cancelled';
  if (states.some((state) => state === 'blocked')) return 'blocked';
  return 'running';
}

export class ExecutionRecovery {
  constructor(readonly store: ExecutionStore, readonly logs: ExecutionLogStore, readonly workflowPending = false) {}

  async reconcile(): Promise<ExecutionRecoveryResult> {
    const recoverable = await this.store.listRecoverableAttempts();
    const touched = new Map<string, ExecutionScope>();
    for (const run of await this.store.listRunsForRecovery()) touched.set(run.runId, {
      principalId: run.principalId, ...(run.projectId ? { projectId: run.projectId } : {}),
    });
    let recoveredTerminal = 0;
    let interrupted = 0;

    for (const attempt of recoverable) {
      const scope = scopeOf(attempt);
      touched.set(attempt.runId, scope);
      let result;
      try { result = await this.logs.readResult(attempt.runId, attempt.nodeId, attempt.attemptNo); }
      catch { result = null; }
      const current = await this.store.getNode(scope, attempt.runId, attempt.nodeId);
      if (result && result.attemptId === attempt.attemptId && current?.attemptCount === attempt.attemptNo) {
        await this.store.completeAttempt(scope, result, { workflowPending: this.workflowPending });
        recoveredTerminal += 1;
        await this.store.appendEvent(scope, attempt.runId,
          result.state === 'succeeded' ? 'node.succeeded'
            : result.state === 'failed' ? 'node.failed'
              : result.state === 'cancelled' ? 'node.cancelled' : 'node.interrupted', {
            nodeId: attempt.nodeId,
            attemptId: attempt.attemptId,
            payload: { recovery: true, attemptNo: attempt.attemptNo, resultMarker: true },
          });
      } else {
        await this.store.markAttemptInterrupted(scope, attempt.runId, attempt.nodeId, attempt.attemptId,
          result ? 'terminal result identity mismatch during recovery' : 'missing terminal result marker during recovery');
        interrupted += 1;
        await this.store.appendEvent(scope, attempt.runId, 'node.interrupted', {
          nodeId: attempt.nodeId,
          attemptId: attempt.attemptId,
          payload: { recovery: true, attemptNo: attempt.attemptNo, resultMarker: false },
        });
      }
    }

    for (const [runId, scope] of touched) {
      const run = await this.store.getRun(scope, runId);
      if (!run) continue;
      const nodes = await this.store.getNodes(scope, runId);
      // A successful process is not a settled workflow receipt. Recovery must
      // preserve this boundary until execution_start replays the exact callback.
      const next = executionWorkflowPending(run).length > 0 ? 'blocked' : stateFromNodes(nodes.map((node) => node.state));
      if (run.state !== next) {
        await this.store.setRunState(scope, runId, next);
        const terminalEvent = next === 'completed' ? 'run.completed'
          : next === 'failed' ? 'run.failed'
            : next === 'blocked' ? 'run.blocked'
              : next === 'interrupted' ? 'run.interrupted'
                : next === 'cancelled' ? 'run.cancelled' : null;
        if (terminalEvent) await this.store.appendEvent(scope, runId, terminalEvent, { payload: { recovery: true } });
      }
    }

    return { recoveredTerminal, interrupted, runsReconciled: touched.size };
  }
}
