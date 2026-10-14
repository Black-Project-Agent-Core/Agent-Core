import { createHash } from 'node:crypto';
import { activityTracker } from '../tracker/activity-tracker.js';
import { readEvidenceSnapshot } from '../verification/evidence-snapshot.js';
import { recheckWorkflowReport } from './workflow-verifier.js';

export interface WorkflowEvidence {
  ref: string;
  status: 'resolved' | 'unavailable';
  digest?: string;
  taskId?: string;
  semanticSupport: 'not-established';
  reason?: string;
}

/** A resolvable source identifies bytes/an invocation; it does not certify a claim. */
export async function resolveWorkflowEvidence(ref: string): Promise<WorkflowEvidence> {
  const unavailable = (reason: string): WorkflowEvidence => ({ ref, status: 'unavailable', semanticSupport: 'not-established', reason });
  const file = /^(?:file|source|verification):(.+)#(sha256:[a-f0-9]{64})$/i.exec(ref);
  if (file) {
    try {
      const snapshot = await readEvidenceSnapshot(file[1]!);
      if (snapshot.digest !== file[2]!.toLowerCase()) return unavailable('revision-mismatch');
      return { ref, status: 'resolved', digest: snapshot.digest, semanticSupport: 'not-established' };
    } catch { return unavailable('source-unavailable'); }
  }
  const invocation = /^(?:tool|activity):(.+)$/.exec(ref)?.[1];
  if (invocation) {
    const events = activityTracker.readToolInvocationEvents({ maxEvents: 10_000, maxAgeMs: 30 * 86_400_000 });
    const found = events.find(event => event.kind !== 'tool-invocation-start'
      && (event.id === invocation || event.context?.invocationId === invocation || event.context?.durableInvocationId === invocation));
    if (found) return { ref, status: 'resolved',
      ...(typeof found.context?.taskId === 'string' ? { taskId: found.context.taskId } : {}),
      digest: 'sha256:' + createHash('sha256').update(JSON.stringify(found)).digest('hex'), semanticSupport: 'not-established' };
  }
  return unavailable('reference-not-found-or-unversioned');
}

export async function validateWorkflowUse(input: { taskId?: string; actionRefs?: string[]; verificationRef?: string }) {
  const evidence = await Promise.all([...new Set([...(input.actionRefs ?? []), ...(input.verificationRef ? [input.verificationRef] : [])])].map(resolveWorkflowEvidence));
  const verification = input.verificationRef ? await recheckWorkflowReport(input.verificationRef, input.taskId) : 'unavailable';
  let actionBound = false;
  if (input.taskId && input.verificationRef) {
    try {
      const match = /^verification:(.+)#sha256:[a-f0-9]{64}$/i.exec(input.verificationRef);
      if (match && verification !== 'unavailable') {
        const report = JSON.parse((await readEvidenceSnapshot(match[1]!)).text);
        actionBound = (input.actionRefs ?? []).includes('file:' + report.answer.path + '#' + report.answer.digest);
      }
    } catch { /* Unavailable evidence cannot validate use. */ }
    // A same-task invocation is available context, not proof it produced the checked answer.
    // Only the report's exact answer bytes bind this independently rechecked outcome.
  }
  return { status: verification !== 'unavailable' && actionBound && input.taskId && input.actionRefs?.length && input.verificationRef && evidence.every(item => item.status === 'resolved')
    ? 'resolved' as const : 'unavailable' as const, evidence, verification, semanticSupport: 'not-established' as const, use:'controller-reported' as const, causation:'not-established' as const };
}

export function failureContext(action: string, observation: string, cause = 'unknown', strategyChange = 'required', nextCheck = 'gather new evidence') {
  return { action: action.slice(0, 300), observation: observation.slice(0, 1200), suspectedCause: cause.slice(0, 300),
    strategyChange: strategyChange.slice(0, 500), nextCheck: nextCheck.slice(0, 500) };
}
