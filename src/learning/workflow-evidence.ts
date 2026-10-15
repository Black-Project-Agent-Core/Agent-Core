import { createHash } from 'node:crypto';
import { activityTracker } from '../tracker/activity-tracker.js';
import { readEvidenceSnapshot } from '../verification/evidence-snapshot.js';
import { recheckWorkflowReport } from './workflow-verifier.js';
import { validBrowserUse, validBrowserReceipt, type BrowserReceiptContext } from '../rdc/browser-control/procedure-context.js';
export { validBrowserReceipt };

export type BrowserUseResolution = {status:'eligible';browserContext:BrowserReceiptContext}
  | {status:'unavailable' | 'ambiguous';reason:string};
/** One bounded owner tracker read; no alias, event id or model-supplied profile accepted. */
export function resolveBrowserObservationUse(
  refs:readonly string[], binding?:{taskId:string;ownerId:string;workspace:string;workspaceIdentityKey:string},
):BrowserUseResolution {
  if (!binding?.taskId || !binding.ownerId || !binding.workspace || !binding.workspaceIdentityKey)
    return {status:'unavailable',reason:'host-binding-unavailable'};
  const selected=[...new Set(refs.filter(ref=>/^tool:[0-9a-f]{32}$/.test(ref)))];
  if (!selected.length) return {status:'unavailable',reason:'no-exact-browser-action-ref'};
  const events=activityTracker.readToolInvocationEvents({maxEvents:10_000,maxAgeMs:30*86_400_000});
  const qualified:BrowserReceiptContext[]=[];
  for(const ref of selected) {
    const id=ref.slice(5);
    const event=events.find(item=>item.kind==='tool-call' && item.context?.invocationId===id
      && item.context.tool==='browser_control' && item.context.outcome==='success'
      && item.context.attributionStatus==='attributed' && item.context.binding==='bound'
      && item.context.taskId===binding.taskId && item.context.ownerId===binding.ownerId
      && item.context.workspace===binding.workspace
      && item.context.workspaceIdentityKey===binding.workspaceIdentityKey
      && typeof item.context.processSessionId==='string');
    if (!event) continue;
    const packed=event.context?.browserObservationUse;
    if (typeof packed!=='string' || packed.length>1600) continue;
    try {
      const payload=JSON.parse(packed);
      if (!validBrowserUse(payload)) continue;
      qualified.push({version:1,actionRef:ref,sourceDigest:payload.profile.shapeDigest,
        shape:payload.profile,association:'controller-selected-host-observation',semanticSupport:'not-established'});
    }catch { /* malformed tracker evidence is unavailable, not permission. */ }
  }
  if(qualified.length>1)return {status:'ambiguous',reason:'multiple-eligible-browser-action-refs'};
  return qualified[0] ? {status:'eligible',browserContext:qualified[0]}
    : {status:'unavailable',reason:'browser-terminal-or-profile-unavailable'};
}


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
    actionBound ||= evidence.some(item => (input.actionRefs ?? []).includes(item.ref) && item.status === 'resolved'
      && (item.taskId === input.taskId || item.ref.startsWith('tool:dtc:' + input.taskId + ':')));
  }
  return { status: actionBound && input.taskId && input.actionRefs?.length && input.verificationRef && evidence.every(item => item.status === 'resolved')
    ? 'resolved' as const : 'unavailable' as const, evidence, verification, semanticSupport: 'not-established' as const };
}

export function failureContext(action: string, observation: string, cause = 'unknown', strategyChange = 'required', nextCheck = 'gather new evidence') {
  return { action: action.slice(0, 300), observation: observation.slice(0, 1200), suspectedCause: cause.slice(0, 300),
    strategyChange: strategyChange.slice(0, 500), nextCheck: nextCheck.slice(0, 500) };
}
