import * as z from 'zod/v4';
import { LearningEvidenceError, safeEvidenceRefSchema, safeMetadataSchema } from './evaluation.js';
import type { LearningEffectEvidence } from './types.js';

export const learningEffectEvidenceSchema=z.strictObject({
  claimType:z.enum(['behavioral-outcome','source-state','metric-evaluated']),
  status:z.enum(['observed','not-exercised','unavailable']),
  evidenceRefs:z.array(safeEvidenceRefSchema()).min(1).max(16),
  expected:safeMetadataSchema(2000),
  observed:safeMetadataSchema(2000).optional(),
  environment:safeMetadataSchema(500).optional(),
}).superRefine((value,context)=>{
  if(value.status==='observed'&&!value.observed){
    context.addIssue({code:'custom',path:['observed'],message:'Observed effect requires observed consequence'});
  }
});

export function validateEffectEvidence(value:unknown):LearningEffectEvidence{
  const result=learningEffectEvidenceSchema.safeParse(value);
  if(!result.success)throw new LearningEvidenceError('evidence-invalid');
  return result.data;
}
