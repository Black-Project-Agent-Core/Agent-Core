import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { assertWorkflowBaselinesCurrent, reconcileWorkflowOperation, type WorkflowActiveWriter,
  type WorkflowOperationBaseline, type WorkflowOperationPathState, type WorkflowOperationReceipt } from '../src/workflow/operation-ledger.js';
import { beginExecutionProvenance, executionApplicability, executionIdentityHash, finishExecutionProvenance } from '../src/execution/provenance.js';
import { validateExecutionDag } from '../src/execution/dag.js';
import { ExecutionLogStore, type ExecutionResultMarker } from '../src/execution/log-store.js';
import { WorkspacePolicy } from '../src/runtime/workspace.js';

const a = path.resolve('fixture/a.ts'), b = path.resolve('fixture/b.ts'), c = path.resolve('fixture/c.ts');
const oldHash = '1'.repeat(64), newHash = '2'.repeat(64), planHash = '3'.repeat(64);
const state = (target: string, hash = newHash): WorkflowOperationPathState => ({ path: target, kind: 'file', hash });
const baselines = (): WorkflowOperationBaseline[] => [a, b].map(target => ({ path: target, hash: oldHash, expectedKind: 'file' }));
const receipt = (target = a, nodeId = 'a', attemptNo = 1): WorkflowOperationReceipt => ({
  runId: 'run', nodeId, attemptId: `${nodeId}-${attemptNo}`, attemptNo, planRevision: 1, planHash,
  inputManifestHash: oldHash, outputManifestHash: newHash, outputStates: [state(target)], recordedAt: 10,
});
const sibling = (): WorkflowActiveWriter => ({ runId: 'run', nodeId: 'b', attemptId: 'b-1', attemptNo: 1,
  planRevision: 1, planHash, writes: [b] });

describe('workflow operation ledger', () => {
  it('reconciles disjoint completed writes independently without blessing an in-flight sibling', () => {
    const first = reconcileWorkflowOperation({ baselines: baselines(), receipts: [], operation: receipt(),
      currentStates: [state(a), state(b)], activeWriters: [sibling()] });
    expect(first.baselines).toEqual([{ path: a, hash: newHash, expectedKind: 'file', operationRecorded: true },
      { path: b, hash: oldHash, expectedKind: 'file' }]);
    const second = reconcileWorkflowOperation({ baselines: first.baselines, receipts: first.receipts,
      operation: receipt(b, 'b'), currentStates: [state(a), state(b)] });
    expect(second.baselines.every(item => item.hash === newHash && item.operationRecorded)).toBe(true);
    expect(second.receipts.map(item => item.attemptId)).toEqual(['a-1', 'b-1']);
  });

  it('rejects unrelated changes that have no authoritative sibling writer', () => {
    expect(() => reconcileWorkflowOperation({ baselines: baselines(), receipts: [], operation: receipt(),
      currentStates: [state(a), state(b)] })).toThrowError(expect.objectContaining({ code: 'WORKFLOW_TARGET_STALE' }));
  });

  it.each([{ ...sibling(), planHash: oldHash }, { ...sibling(), planRevision: 2 }, { ...sibling(), writes: [c] }])(
    'does not accept a writer for another revision, plan or path', writer => {
      expect(() => reconcileWorkflowOperation({ baselines: baselines(), receipts: [], operation: receipt(),
        currentStates: [state(a), state(b)], activeWriters: [writer] })).toThrowError(expect.objectContaining({ code: 'WORKFLOW_TARGET_STALE' }));
    });

  it('never defers a changed path needed by the node being authorized', () => {
    expect(() => assertWorkflowBaselinesCurrent({ baselines: baselines(), currentStates: [state(a, oldHash), state(b)],
      planRevision: 1, planHash, activeWriters: [sibling()], selectedPaths: [b] }))
      .toThrowError(expect.objectContaining({ code: 'WORKFLOW_TARGET_STALE' }));
  });

  it('requires current output bytes to match the captured attempt', () => {
    expect(() => reconcileWorkflowOperation({ baselines: baselines(), receipts: [], operation: receipt(),
      currentStates: [state(a, oldHash), state(b, oldHash)] }))
      .toThrowError(expect.objectContaining({ code: 'WORKFLOW_OPERATION_OUTPUT_STALE' }));
  });

  it('rejects receipts for unplanned paths and duplicate path entries', () => {
    expect(() => reconcileWorkflowOperation({ baselines: baselines(), receipts: [], operation: receipt(c),
      currentStates: [state(a), state(b), state(c)] })).toThrowError(expect.objectContaining({ code: 'WORKFLOW_PATH_NOT_PLANNED' }));
    expect(() => reconcileWorkflowOperation({ baselines: baselines(), receipts: [],
      operation: { ...receipt(), outputStates: [state(a), state(a)] }, currentStates: [state(a), state(b)] }))
      .toThrowError(expect.objectContaining({ code: 'WORKFLOW_OPERATION_RECEIPT_INVALID' }));
  });

  it('acknowledges a retry callback idempotently without reverting later writes', () => {
    const first = receipt();
    const later = [{ path: a, hash: oldHash, expectedKind: 'file' as const, operationRecorded: true }];
    const repeated = reconcileWorkflowOperation({ baselines: later, receipts: [first],
      operation: { ...first, recordedAt: 99 }, currentStates: [state(a, oldHash)] });
    expect(repeated.duplicate).toBe(true);
    expect(repeated.receipts).toEqual([first]);
    expect(repeated.baselines).toEqual(later);
  });

  it('rejects changed proof for the same attempt and stale attempt order', () => {
    expect(() => reconcileWorkflowOperation({ baselines: baselines(), receipts: [receipt()],
      operation: { ...receipt(), outputManifestHash: oldHash }, currentStates: [state(a), state(b)] }))
      .toThrowError(expect.objectContaining({ code: 'WORKFLOW_OPERATION_IDENTITY_MISMATCH' }));
    expect(() => reconcileWorkflowOperation({ baselines: baselines(), receipts: [receipt(a, 'a', 2)],
      operation: receipt(), currentStates: [state(a), state(b)] }))
      .toThrowError(expect.objectContaining({ code: 'WORKFLOW_OPERATION_ATTEMPT_STALE' }));
  });
});

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });

async function capturedWrite() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'workflow-write-proof-')); roots.push(root);
  const output = path.join(root, 'output.txt'), workspace = new WorkspacePolicy([root]);
  const node = (await validateExecutionDag([{ id: 'write', purpose: 'Capture a declared write', command: 'node --version',
    cwd: root, inputs: [], resources: { writes: [output] }, expectedArtifacts: [] }], { workspace })).nodes[0]!;
  const identity = { runId: 'run', attemptId: 'attempt', attemptNo: 1 };
  const initial = await beginExecutionProvenance(workspace, node, identity);
  await writeFile(output, 'expected content');
  const provenance = await finishExecutionProvenance(workspace, node, initial);
  return { root, output, workspace, node, identity, provenance };
}

describe('declared write attempt evidence', () => {
  it('captures and checks writes even when they are not declared test artifacts or inputs', async () => {
    const f = await capturedWrite();
    expect(f.provenance.outputManifest).toEqual([]);
    expect(f.provenance.writeManifest).toHaveLength(1);
    expect(f.provenance.writeManifestHash).toBe(executionIdentityHash(f.provenance.writeManifest));
    expect(await executionApplicability(f.workspace, f.node, f.provenance, f.identity)).toBe('current');
    await writeFile(f.output, 'modified after execution');
    expect(await executionApplicability(f.workspace, f.node, f.provenance, f.identity)).toBe('outputs_changed');
  });

  it('rejects a terminal marker with forged declared-write content while preserving legacy marker reads', async () => {
    const f = await capturedWrite(), logs = new ExecutionLogStore(path.join(f.root, 'logs'));
    const marker: ExecutionResultMarker = { version: 1, ...f.identity, nodeId: 'write', state: 'succeeded',
      startedAt: 1, finishedAt: 2, exitCode: 0, signal: null, stdoutBytes: 0, stderrBytes: 0,
      stdoutSha256: oldHash, stderrSha256: oldHash, provenance: f.provenance };
    const target = logs.paths('run', 'write', 1).resultPath;
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, JSON.stringify({ ...marker, provenance: { ...f.provenance, writeManifestHash: oldHash } }));
    await expect(logs.readResult('run', 'write', 1)).rejects.toMatchObject({ code: 'EXECUTION_RESULT_INVALID' });
    const { writeManifest: _, writeManifestHash: __, ...legacy } = f.provenance;
    await writeFile(target, JSON.stringify({ ...marker, provenance: legacy }));
    expect((await logs.readResult('run', 'write', 1))?.provenance).toEqual(legacy);
  });
});
