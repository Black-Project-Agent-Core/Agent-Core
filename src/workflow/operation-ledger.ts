import path from 'node:path';
import { executionIdentityHash } from '../execution/provenance.js';
import { WorkflowError } from './types.js';

export interface WorkflowOperationPathState { path: string; kind: 'file' | 'directory' | 'missing'; hash: string | null }
export interface WorkflowOperationBaseline { path: string; hash: string | null; expectedKind?: WorkflowOperationPathState['kind']; operationRecorded?: boolean }
export interface WorkflowOperationReceipt {
  runId: string; nodeId: string; attemptId: string; attemptNo: number;
  planRevision: number; planHash: string; inputManifestHash: string; outputManifestHash: string;
  outputStates: WorkflowOperationPathState[]; recordedAt: number;
}
/** Constructed from the authenticated execution store, never accepted in a public tool schema. */
export interface WorkflowActiveWriter {
  runId: string; nodeId: string; attemptId: string; attemptNo: number;
  planRevision: number; planHash: string; writes: string[];
}
export interface WorkflowExecutionTrust {
  stage: 'create' | 'start' | 'add_nodes' | 'retry' | 'dispatch' | 'reconcile' | 'completion';
  activeWriters: WorkflowActiveWriter[];
}

const canonical = (value: string) => process.platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value);
const inside = (root: string, value: string) => value === root || value.startsWith(root + path.sep);
function fail(code: string, message: string, details?: Record<string, unknown>): never { throw new WorkflowError(code, message, details); }
const sameState = (baseline: WorkflowOperationBaseline, state: WorkflowOperationPathState) => baseline.hash === state.hash
  && (!baseline.expectedKind || baseline.expectedKind === state.kind);

/** An active sibling can defer its own paths, but cannot bless their contents or the selected operation's inputs. */
export function assertWorkflowBaselinesCurrent(input: {
  baselines: readonly WorkflowOperationBaseline[]; currentStates: readonly WorkflowOperationPathState[];
  planRevision: number; planHash: string; activeWriters?: readonly WorkflowActiveWriter[]; selectedPaths?: readonly string[];
}): void {
  const states = new Map(input.currentStates.map(state => [canonical(state.path), state]));
  const selected = (input.selectedPaths ?? []).map(canonical);
  for (const baseline of input.baselines) {
    const target = canonical(baseline.path), state = states.get(target);
    if (!state) fail('WORKFLOW_OPERATION_STATE_REQUIRED', 'Every checked target needs an observed state', { path: baseline.path });
    if (sameState(baseline, state)) continue;
    const needed = selected.some(value => inside(value, target) || inside(target, value));
    const pending = !needed && input.activeWriters?.some(writer => writer.planRevision === input.planRevision
      && writer.planHash === input.planHash && writer.writes.some(value => inside(canonical(value), target)));
    if (!pending) fail('WORKFLOW_TARGET_STALE', 'Target changed outside its accepted operation', { path: baseline.path });
  }
}

/** Reconcile a successful current attempt once. Sibling baselines remain untouched until their own receipt arrives. */
export function reconcileWorkflowOperation(input: {
  baselines: readonly WorkflowOperationBaseline[]; receipts: readonly WorkflowOperationReceipt[];
  operation: WorkflowOperationReceipt; currentStates: readonly WorkflowOperationPathState[];
  activeWriters?: readonly WorkflowActiveWriter[];
}): { baselines: WorkflowOperationBaseline[]; receipts: WorkflowOperationReceipt[]; duplicate: boolean } {
  const operation = input.operation;
  const sameAttempt = input.receipts.find(item => item.runId === operation.runId && item.nodeId === operation.nodeId
    && (item.attemptId === operation.attemptId || item.attemptNo === operation.attemptNo));
  if (sameAttempt) {
    const proof = ({ recordedAt: _, ...value }: WorkflowOperationReceipt) => value;
    if (executionIdentityHash(proof(sameAttempt)) !== executionIdentityHash(proof(operation))) {
      fail('WORKFLOW_OPERATION_IDENTITY_MISMATCH', 'An acknowledged attempt cannot change its recorded proof');
    }
    return { baselines: structuredClone([...input.baselines]), receipts: structuredClone([...input.receipts]), duplicate: true };
  }
  if (input.receipts.some(item => item.runId === operation.runId && item.nodeId === operation.nodeId && item.attemptNo >= operation.attemptNo)) {
    fail('WORKFLOW_OPERATION_ATTEMPT_STALE', 'A superseded attempt cannot acknowledge a newer operation');
  }
  if (!Number.isSafeInteger(operation.attemptNo) || operation.attemptNo < 1 || !operation.outputStates.length) {
    fail('WORKFLOW_OPERATION_RECEIPT_INVALID', 'An operation receipt requires an attempt identity and captured target states');
  }
  const observed = new Map(input.currentStates.map(state => [canonical(state.path), state]));
  const outputs = new Map(operation.outputStates.map(state => [canonical(state.path), state]));
  if (outputs.size !== operation.outputStates.length) fail('WORKFLOW_OPERATION_RECEIPT_INVALID', 'Operation targets must be unique');
  const planned = new Set(input.baselines.map(item => canonical(item.path)));
  for (const [target, output] of outputs) {
    if (!planned.has(target)) fail('WORKFLOW_PATH_NOT_PLANNED', 'Operation receipt references an unplanned target', { path: output.path });
    const current = observed.get(target);
    if (!current || current.kind !== output.kind || current.hash !== output.hash) {
      fail('WORKFLOW_OPERATION_OUTPUT_STALE', 'Current target no longer matches its successful attempt output', { path: output.path });
    }
  }
  const baselines = input.baselines.map(baseline => {
    const output = outputs.get(canonical(baseline.path));
    return output ? { ...baseline, hash: output.hash, expectedKind: output.kind, operationRecorded: true } : { ...baseline };
  });
  assertWorkflowBaselinesCurrent({ baselines, currentStates: input.currentStates, planRevision: operation.planRevision,
    planHash: operation.planHash, activeWriters: input.activeWriters, selectedPaths: operation.outputStates.map(state => state.path) });
  return { baselines, receipts: [...structuredClone([...input.receipts]), structuredClone(operation)], duplicate: false };
}
