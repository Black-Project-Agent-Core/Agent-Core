import type { RuntimeServices } from './services.js';
import type { MemoryScope } from '../memory/types.js';
import type { TaskCheckpointInput } from '../memory/task-checkpoint.js';
import { canonicalFileNativeProjectId } from '../memory/file-native/paths.js';
import type { WorkflowRunEvidence } from '../workflow/types.js';
import { executionWorkflowPending } from '../execution/store.js';

export function completionWorkflowScope(runtime: RuntimeServices, scope: MemoryScope, input: TaskCheckpointInput) {
  return { principalId: scope.principalId, projectId: canonicalFileNativeProjectId(runtime.memory.config.fileNative, input.workspaceRoot), taskId: input.continuityTaskId };
}

export async function verifyWorkflowCompletion(runtime: RuntimeServices, scope: MemoryScope, input: TaskCheckpointInput): Promise<void> {
  if (input.status !== 'completed') return;
  const workflowScope = completionWorkflowScope(runtime, scope, input);
  const contract = await runtime.workflow.status(workflowScope);
  if (!contract) throw Object.assign(new Error('Revalidate this task through capability_route before completion'), { code: 'WORKFLOW_CONTEXT_REQUIRED' });
  if (!contract.planRequired) return;
  if (!runtime.execution.config.enabled) throw Object.assign(new Error('Required execution is unavailable'), { code: 'WORKFLOW_EXECUTION_REQUIRED' });
  const lifecycle = await runtime.memory.getLifecycleContext(scope, input.memoryContextId);
  const executionScope = { principalId: lifecycle?.authorityPrincipalId ?? scope.principalId, projectId: input.workspaceRoot };
  await runtime.execution.open();
  const linked = await runtime.execution.runsForContinuityTask(executionScope, input.continuityTaskId);
  const declared = new Set((input.evidence ?? []).filter(e => e.type === 'tool' && e.ref.startsWith('execution:')).map(e => e.ref.slice('execution:'.length)));
  const runs: WorkflowRunEvidence[] = [];
  const verificationSteps = new Set(contract.plan?.checks.flatMap(check => check.stepIds) ?? []);
  for (const run of linked) {
    if (executionWorkflowPending(run).length > 0) {
      throw Object.assign(new Error('Reconcile the completed process receipts through execution_start before closing the task'), { code: 'WORKFLOW_OPERATION_RECEIPT_PENDING' });
    }
    const binding = run.metadata.workflowBinding as { planHash?: string } | undefined;
    const nodes: WorkflowRunEvidence['nodes'] = [];
    for (const node of run.nodes) {
      const evidence = run.evidence.nodes.find(e => e.nodeId === node.nodeId);
      const marker = evidence?.attemptNo ? await runtime.execution.logs.readResult(run.runId, node.nodeId, evidence.attemptNo) : null;
      nodes.push({ stepIds: node.stepIds ?? [], state: node.state,
        verification: evidence?.applicability === 'current' ? evidence.evidenceState : 'stale',
        artifacts: evidence?.artifacts ?? [],
        inputHashes: (marker?.provenance?.inputManifest ?? []).flatMap(e => e.kind === 'file' && e.sha256 ? [{ path: e.path, hash: e.sha256 }] : []),
        inputEntries: (marker?.provenance?.inputManifest ?? []).map(e => ({ path: e.path, kind: e.kind, hash: e.sha256 ?? null })),
      });
    }
    const applicable = run.nodes.every(node => {
      const evidence = run.evidence.nodes.find(e => e.nodeId === node.nodeId);
      if (!evidence || node.state !== 'succeeded') return false;
      if ((node.stepIds ?? []).some(id => verificationSteps.has(id))) return evidence.applicability === 'current' && evidence.evidenceState === 'verified';
      // Earlier implementation commands may consume a version superseded by a
      // later accepted edit. Their attempt identity must remain valid, while the
      // acceptance nodes below must verify the final target content.
      return ['current', 'inputs_changed', 'outputs_changed'].includes(evidence.applicability ?? '');
    });
    runs.push({ runId: run.runId, taskId: input.continuityTaskId, state: run.state,
      verification: declared.has(run.runId) && applicable ? 'verified' : 'unreferenced_or_stale',
      planHash: binding?.planHash ?? '', nodes });
  }
  await runtime.workflow.prepareCompletion(workflowScope, { runs });
  if (contract.craftRequired && ![input.decisions, input.artifacts, input.outcomes].some(items => items?.length)) {
    throw Object.assign(new Error('A completed transplant must record its integration outcome and source provenance'), { code: 'WORKFLOW_MEMORY_EVIDENCE_REQUIRED' });
  }
}
