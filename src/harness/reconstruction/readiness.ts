import {createHash} from 'node:crypto';
import {HARNESS_LIMITS,type HarnessAction,type HarnessManifest,type HostScope} from './contracts.js';
import type {ObligationResult} from './obligations.js';

export type HarnessStatus='ready'|'open'|'failed'|'unknown';
function canonical(input:unknown):unknown {
  if(Array.isArray(input))return input.map(canonical);
  if(!input||typeof input!=='object')return input;
  return Object.fromEntries(Object.entries(input as Record<string,unknown>)
    .filter(([,value])=>value!==undefined).sort(([a],[b])=>a<b?-1:a>b?1:0)
    .map(([key,value])=>[key,canonical(value)]));
}
const hash=(input:unknown)=>'sha256:'+createHash('sha256')
  .update(JSON.stringify(canonical(input))).digest('hex');
const count=(rows:readonly ObligationResult[],status:ObligationResult['status'])=>
  rows.filter(o=>o.required&&o.status===status).length;
const worse=(states:readonly HarnessStatus[]):HarnessStatus=>
  states.includes('failed')?'failed':states.includes('unknown')?'unknown':
    states.includes('open')?'open':'ready';

export function createHarnessReport(
  action:HarnessAction,manifest:HarnessManifest,rows:ObligationResult[],scope:HostScope,
){
  const readyCount=count(rows,'verified'),openCount=count(rows,'open');
  const failedCount=count(rows,'failed'),unknownCount=count(rows,'unknown');
  const required=rows.filter(o=>o.required);
  const missing=rows.filter(o=>o.reasons.includes('DECLARED_OBLIGATION_MISSING')).length;
  const claimStatus=manifest.claims.map(claim=>{
    const related=claim.obligationIds.map(id=>rows.find(row=>row.id===id))
      .filter((row):row is ObligationResult=>row!==undefined);
    const status:HarnessStatus=related.length!==claim.obligationIds.length?'unknown':
      worse(related.filter(row=>row.required).map(row=>
        row.status==='verified'?'ready':row.status==='failed'?'failed':row.status));
    return {id:claim.id,kind:claim.kind,status,requiredAuthority:claim.requiredAuthority};
  }).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
  const limitations:string[]=['Claims concern declared obligations only; not global program equivalence.',
    'Tool terminal success does not prove source semantics, runtime behavior or goal success.',
    'Host activity evidence is not cryptographically signed.'];
  if(action==='preview')limitations.push('Preview never supplies authenticated proof.');
  if(manifest.coverage!=='complete')limitations.push('Caller declares partial or unknown inventory coverage.');
  if(manifest.contradictions.length)limitations.push('Unresolved declared contradictions require independent review.');
  const preliminary:HarnessStatus=required.length===0?'unknown':
    action==='preview'?'unknown':manifest.coverage!=='complete'?'unknown':
      worse(required.map(row=>row.status==='verified'?'ready':
        row.status==='failed'?'failed':row.status));
  const sorted=[...rows].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
  const digestInput={
    manifest:{...manifest,claims:[...manifest.claims].map(c=>({...c,obligationIds:[...c.obligationIds].sort()}))
      .sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0),
      obligations:[...manifest.obligations].map(o=>({...o,requiredCases:[...o.requiredCases].sort(),
        dependsOn:[...o.dependsOn].sort()})).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0),
      selections:[...manifest.selections].sort((a,b)=>a.receiptRef.localeCompare(b.receiptRef)),
      contradictions:[...manifest.contradictions].map(c=>({...c,evidenceRefs:[...c.evidenceRefs].sort()}))
        .sort((a,b)=>a.obligationId.localeCompare(b.obligationId))},
    rows:sorted,action,scope:{taskId:scope.taskId,workspace:scope.workspace,origin:scope.origin},
  };
  let omitted=0,status=preliminary;
  const report={
    schemaVersion:1 as const,algorithmRevision:'agent-core-rea-harness/v1',
    action,status,scope:'declared-obligations-only' as const,
    taskScopeDigest:hash({taskId:scope.taskId,workspace:scope.workspace,
      ownerId:scope.ownerId??null,workspaceIdentityKey:scope.workspaceIdentityKey??null}),
    reportDigest:hash(digestInput),
    summary:{required:required.length,verified:readyCount,open:openCount,
      failed:failedCount,unknown:unknownCount,missing,omitted:0},
    claims:claimStatus,obligations:sorted,
    limitations,
    proofBoundary:'host-tool-terminal-only' as const,
    automaticApproval:false as const,memoryPersisted:false as const,
    mutatesSources:false as const,executesTarget:false as const,
  };
  while(Buffer.byteLength(JSON.stringify(report),'utf8')>HARNESS_LIMITS.maxReportBytes
    &&report.obligations.length){
    report.obligations.pop();omitted++;
  }
  if(omitted){
    report.status='unknown';report.summary.omitted=omitted;
    report.limitations.push('REPORT_BUDGET_OMITTED_ROWS');
  }
  if(Buffer.byteLength(JSON.stringify(report),'utf8')>HARNESS_LIMITS.maxReportBytes)
    throw new Error('HARNESS_REPORT_LIMIT');
  return report;
}