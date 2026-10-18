import type { HarnessManifest,HostProof,ProofCase,ProofStatus } from './contracts.js';

export interface CaseResult{
  caseKind:ProofCase;status:ProofStatus;reason:string;receiptRef?:string;
}
export interface ObligationResult{
  id:string;claimId:string;required:boolean;ownerTool:string;
  status:'verified'|'open'|'failed'|'unknown';
  reasons:string[];cases:CaseResult[];dependsOn:string[];
}
const rank=(s:ObligationResult['status'])=>s==='failed'?3:s==='unknown'?2:s==='open'?1:0;
const worse=(a:ObligationResult['status'],b:ObligationResult['status'])=>rank(a)>=rank(b)?a:b;

/** Declared expectations do not authenticate evidence; only the trusted receipt resolver can. */
export function evaluateObligations(
  manifest:HarnessManifest,receipts:ReadonlyMap<string,HostProof>,preview=false,
):ObligationResult[]{
  const claims=new Map(manifest.claims.map(c=>[c.id,c]));
  const selected=new Map<string,typeof manifest.selections>();
  for(const item of manifest.selections){
    const key=item.obligationId+'|'+item.caseKind;
    selected.set(key,[...(selected.get(key)??[]),item]);
  }
  const rows=new Map<string,ObligationResult>();
  for(const obligation of manifest.obligations){
    const claim=claims.get(obligation.claimId),reasons:string[]=[];
    let status:ObligationResult['status']='verified';
    if(!claim||!claim.obligationIds.includes(obligation.id)){
      status='unknown';reasons.push('CLAIM_OWNER_UNKNOWN');
    }
    const cases:CaseResult[]=[];
    for(const kind of obligation.requiredCases){
      const choices=selected.get(obligation.id+'|'+kind)??[];
      let caseStatus:ProofStatus='unknown',reason='RECEIPT_UNAVAILABLE';
      let ref:string|undefined;
      if(preview)reason='PREVIEW_UNVERIFIED';
      else if(!choices.length){reason='CASE_NOT_EXERCISED';status=worse(status,'open');}
      else if(choices.length>1)reason='AMBIGUOUS_CASE_RECEIPT';
      else{
        ref=choices[0]!.receiptRef;
        const receipt=receipts.get(ref);
        if(!receipt)reason='HOST_RECEIPT_UNAVAILABLE';
        else if(receipt.tool!==obligation.ownerTool)reason='TOOL_OWNER_MISMATCH';
        else if(claim?.kind!=='tool-completion'||claim.requiredAuthority!=='tool-terminal'
          ||kind!=='positive'||receipt.purpose!=='tool-completion'
          ||receipt.authority!=='tool-terminal')reason='AUTHORITY_INSUFFICIENT';
        else if(receipt.status==='pass'){caseStatus='pass';reason='TOOL_TERMINAL_SUCCESS';}
        else if(receipt.status==='fail'){caseStatus='fail';reason='TOOL_TERMINAL_FAILURE';}
      }
      if(caseStatus==='fail')status=worse(status,'failed');
      else if(caseStatus==='unknown'&&reason!=='CASE_NOT_EXERCISED')
        status=worse(status,'unknown');
      cases.push({caseKind:kind,status:caseStatus,reason,...(ref?{receiptRef:ref}:{})});
    }
    if(manifest.contradictions.some(c=>c.obligationId===obligation.id)){
      status=worse(status,'unknown');reasons.push('CONTRADICTION_UNRESOLVED');
    }
    rows.set(obligation.id,{id:obligation.id,claimId:obligation.claimId,
      required:obligation.required,ownerTool:obligation.ownerTool,
      status,reasons,cases:cases.sort((a,b)=>a.caseKind<b.caseKind?-1:a.caseKind>b.caseKind?1:0),
      dependsOn:[...obligation.dependsOn].sort()});
  }
  // Caller cannot omit a claim-declared required obligation and still receive READY.
  for(const claim of manifest.claims)for(const id of claim.obligationIds)
    if(!rows.has(id))rows.set(id,{id,claimId:claim.id,required:true,ownerTool:'unknown',
      status:'unknown',reasons:['DECLARED_OBLIGATION_MISSING'],cases:[],dependsOn:[]});
  const visiting=new Set<string>(),visited=new Set<string>(),cycle=new Set<string>();
  const walk=(id:string,trail:string[])=>{
    if(visiting.has(id)){
      const start=trail.indexOf(id);
      for(const member of trail.slice(start))cycle.add(member);
      return;
    }
    if(visited.has(id))return;
    visiting.add(id);
    for(const dep of rows.get(id)?.dependsOn??[])if(rows.has(dep))walk(dep,[...trail,id]);
    visiting.delete(id);visited.add(id);
  };
  for(const id of rows.keys())walk(id,[]);
  for(const id of cycle){const row=rows.get(id)!;row.status='unknown';row.reasons.push('DEPENDENCY_CYCLE');}
  // Bounded monotone fixed point: unresolved dependency propagates all the way to its users.
  for(let step=0;step<=rows.size;step++){
    let changed=false;
    for(const row of rows.values()){
      let status=row.status;
      for(const dep of row.dependsOn){
        const target=rows.get(dep);
        if(!target){status=worse(status,'unknown');row.reasons.push('DEPENDENCY_MISSING');}
        else if(target.status!=='verified'){
          status=worse(status,target.status);
          row.reasons.push('DEPENDENCY_UNVERIFIED');
        }
      }
      if(status!==row.status){row.status=status;changed=true;}
    }
    if(!changed)break;
  }
  return [...rows.values()].map(row=>({...row,reasons:[...new Set(row.reasons)].sort()}))
    .sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
}