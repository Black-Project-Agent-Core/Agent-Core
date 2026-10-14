import {createHash} from 'node:crypto';
import * as z from 'zod/v4';

const ids=z.array(z.string().uuid()).max(4).refine(values=>new Set(values).size===values.length,'Duplicate evidence view ID');
export const imageReviewCriteriaSchema=z.array(z.strictObject({
  id:z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/),
  description:z.string().min(1).max(280).refine(value=>Boolean(value.trim()),'Blank description'),
  assessment:z.strictObject({
    status:z.enum(['pass','fail','unknown','not-assessable']),
    reason:z.string().min(1).max(500).refine(value=>Boolean(value.trim()),'Blank reason'),
    evidenceViewIds:ids,
    counterEvidenceViewIds:ids.optional(),
  }).superRefine((value,ctx)=>{
    if((value.status==='pass'||value.status==='fail')&&!value.evidenceViewIds.length)
      ctx.addIssue({code:'custom',path:['evidenceViewIds'],message:'Pass/fail requires a bound evidence view'});
  }).optional(),
})).min(1).max(16).superRefine((rows,ctx)=>{
  if(new Set(rows.map(row=>row.id)).size!==rows.length)
    ctx.addIssue({code:'custom',message:'Duplicate criterion ID'});
});

export type ImageReviewCriteria=z.infer<typeof imageReviewCriteriaSchema>;
export interface ImageReviewView {
  viewId:string;digest:string;viewDigest:string;viewDigestAlgorithm:'sha256-returned-image-bytes';
  sourceRect:{x:number;y:number;width:number;height:number};
  original:{width:number;height:number};displayed:{width:number;height:number};
  mimeType:string;fidelity:string;createdAt:string;expiresAt:string;
}
export function referencedReviewIds(baseId:string,criteria:ImageReviewCriteria):string[] {
  const ids=new Set([baseId]);
  for(const row of criteria)if(row.assessment){
    for(const id of [...row.assessment.evidenceViewIds,...(row.assessment.counterEvidenceViewIds??[])])
      ids.add(id);
  }
  return [...ids];
}
/** Declarative projection only. The owning inspector has already resolved and checked all views.
 * Input statuses are not semantic verification, quality scores, or task authorization.
 */
export function buildImageReviewReport(input:{
  criteria:ImageReviewCriteria;sourceDigest:string;snapshotAt:string;views:ImageReviewView[];
}) {
  const ordered=input.criteria.map(({id,description})=>({id,description:description.trim()}))
    .sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
  const criteriaDigest=createHash('sha256').update(JSON.stringify(ordered)).digest('hex');
  const rows=input.criteria.map(({id,description,assessment})=>assessment
    ? {id,description,status:assessment.status,reason:assessment.reason,
      evidenceViewIds:assessment.evidenceViewIds,
      counterEvidenceViewIds:assessment.counterEvidenceViewIds??[],
      reasonCode:'controller-declared'}
    : {id,description,status:'unknown' as const,reasonCode:'assessment-missing',
      evidenceViewIds:[] as string[],counterEvidenceViewIds:[] as string[]});
  // Count only supplied declarations. Missing rows are unknown, but not declared unknown.
  const statuses=input.criteria.flatMap(row=>row.assessment?[row.assessment.status]:[]);
  const supplied=statuses.length;
  return {
    version:1 as const,action:'review' as const,artifactScope:'single-local-raster' as const,
    sourceDigest:input.sourceDigest,sourceDigestAlgorithm:'sha256-original-file' as const,
    snapshotAt:input.snapshotAt,views:input.views,criteriaDigest,
    criteria:rows,
    coverage:{total:rows.length,suppliedAssessments:supplied,missingAssessments:rows.length-supplied,
      declaredPass:statuses.filter(s=>s==='pass').length,
      declaredFail:statuses.filter(s=>s==='fail').length,
      declaredUnknown:statuses.filter(s=>s==='unknown').length,
      declaredNotAssessable:statuses.filter(s=>s==='not-assessable').length},
    bindingStatus:'current-source-snapshot' as const,bindingStatusScope:'raster-only' as const,
    dependencySemantics:'Declared source byte freshness is independent of raster provenance; no renderer derivation is verified.' as const,
    assessmentAuthority:'external-controller' as const,
    semanticVerification:'not-performed' as const,executionAuthority:false as const,
    advisory:'Controller declarations are not verified pixel judgments or task/quality decisions.',
  };
}
