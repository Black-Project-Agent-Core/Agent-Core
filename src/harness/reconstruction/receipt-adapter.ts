import {createHash} from 'node:crypto';
import type { TrackerEvent } from '../../tracker/activity-tracker.js';
import { activityTracker } from '../../tracker/activity-tracker.js';
import type { HostProof,HostScope,ReceiptResolver } from './contracts.js';

const MAX_AGE_MS = 24 * 60 * 60 * 1000;
// Same terminal kinds the tracker reader returns; auxiliary records (start, request/response detail) are not terminals.
const TERMINAL_KINDS = new Set(['tool-call','handled-tool-failure','tool-exception','tool-invocation-interrupted']);
const REF = /^tool:([a-f0-9]{32})$/;
const exact = (value:unknown, expected:string|undefined):boolean =>
  typeof value==='string' && !!expected && value===expected;

/** A bound tool terminal attests operation completion only, not output correctness. */
export function resolveToolTerminals(
  refs:readonly string[],scope:HostScope,events:readonly TrackerEvent[],now=Date.now(),
):ReadonlyMap<string,HostProof>{
  const wanted=new Set(refs.filter(ref=>REF.test(ref)));
  const grouped=new Map<string,TrackerEvent[]>();
  for(const event of events){
    const id=event.context?.invocationId;
    const ref=typeof id==='string'?'tool:'+id:'';
    if(!wanted.has(ref))continue;
    grouped.set(ref,[...(grouped.get(ref)??[]),event]);
  }
  const proofs=new Map<string,HostProof>();
  for(const ref of wanted){
    const terminal=(grouped.get(ref)??[]).filter(e=>TERMINAL_KINDS.has(e.kind));
    if(terminal.length!==1)continue; // ambiguous or absent
    const event=terminal[0]!,ctx=event.context;
    const at=Date.parse(event.timestamp);
    if(event.kind!=='tool-call'||ctx?.outcome!=='success'
      ||ctx?.invocationSource!=='mcp-wrapper'
      ||!Number.isFinite(at)||at>now||now-at>MAX_AGE_MS
      ||!exact(ctx?.taskId,scope.taskId))continue;
    if(scope.origin==='external'){
      if(ctx?.binding!=='bound'||ctx?.attributionStatus!=='attributed'
        ||!exact(ctx.ownerId,scope.ownerId)
        ||!exact(ctx.workspace,scope.workspace)
        ||!exact(ctx.workspaceIdentityKey,scope.workspaceIdentityKey))continue;
    }else{
      // The raw process session ID is intentionally redacted from persisted Activity Tracker.
      // Compare the host-written one-way process-instance digest, never redacted/unknown text.
      const expected=scope.processSessionId
        ? 'sha256:'+createHash('sha256').update(scope.processSessionId).digest('hex'):undefined;
      if(!exact(ctx?.processInstanceDigest,expected))continue;
    }
    if(typeof ctx.tool!=='string'||!/^[a-z][a-z0-9_]{0,119}$/.test(ctx.tool))continue;
    proofs.set(ref,{ref,tool:ctx.tool,authority:'tool-terminal',status:'pass',purpose:'tool-completion'});
  }
  return proofs;
}
/** Reads existing owner telemetry: never accepts user-authored 'verified' flags. */
export const liveReceiptResolver:ReceiptResolver=(refs,scope)=>
  resolveToolTerminals(refs,scope,activityTracker.readToolInvocationEvents({
    maxEvents:10_000,maxAgeMs:MAX_AGE_MS,
  }));