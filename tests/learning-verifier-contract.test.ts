import { expect, it, vi } from 'vitest';
import { LearningReviewCoordinator } from '../src/learning/review.js';
import { learning } from '../src/mcp/learning-schemas.js';
const digest='sha256:'+'a'.repeat(64);
const evidence={ref:'verification:fixture-report',digest,observedAt:'2026-09-23T00:00:00Z'};
const evaluation=()=>({schemaVersion:1,mode:'rank',correct:true,objective:0.175,evaluatorRevision:'retrieval-v1',inputsDigest:digest,evidence:[evidence],
  verification:{method:'recomputed',verdict:'pass',verifierRevision:'independent-v1',evaluatorRevision:'retrieval-v1',inputsDigest:digest,resultEvidence:evidence}});
async function reviewed(value:unknown,verified=true){
  const capture=vi.fn().mockResolvedValue({kind:'durable-fact',status:'captured',id:'fixture'});
  const c:any={kind:'durable-fact',content:'A reviewed retrieval comparison.',evidenceRefs:['verification:fixture-report'],verified,evaluation:value};
  const result:any=(await new LearningReviewCoordinator({capture} as any).review([c],true))[0];
  return {result,capture};
}
it('accepts complete bound attestation while keeping artifact authenticity declared',async()=>{
  const {result,capture}=await reviewed(evaluation());
  expect(result.status).toBe('captured');expect(result.evidenceValidation).toBe('declared');
  expect(result.verificationValidation).toBe('controller-attested-recomputation');expect(capture).toHaveBeenCalledTimes(1);
  const parsed:any=learning.parse({action:'review',candidates:[{kind:'durable-fact',content:'Comparison.',evidenceRefs:['file:report'],verified:true,evaluation:evaluation()}]});
  expect(parsed.candidates[0].evaluation.verification.inputsDigest).toBe(digest);
});
for(const [name,change,reason] of [
  ['failed verdict',{verdict:'fail'},'verifier-failed'],
  ['unavailable verdict',{verdict:'unavailable'},'verifier-unavailable'],
  ['different input',{inputsDigest:'sha256:'+'b'.repeat(64)},'verification-input-mismatch'],
  ['different evaluator',{evaluatorRevision:'wrong-v2'},'verification-evaluator-mismatch'],
] as const)it(`rejects ${name} before any sink call`,async()=>{
  const e=evaluation();const {result,capture}=await reviewed({...e,verification:{...e.verification,...change}});
  expect(result.status).toBe('rejected');expect(result.reasonCode).toBe(reason);expect(capture).not.toHaveBeenCalled();
});
for(const [name,change] of [
  ['missing input digest',{inputsDigest:undefined}],
  ['missing report',{verification:{...evaluation().verification,resultEvidence:undefined}}],
  ['unknown verifier field',{verification:{...evaluation().verification,runCommand:'not-permitted'}}],
  ['malformed verifier digest',{verification:{...evaluation().verification,inputsDigest:'short'}}],
] as const)it(`fails closed for ${name}`,async()=>{
  const {result,capture}=await reviewed({...evaluation(),...change});
  expect(result.status).toBe('rejected');expect(capture).not.toHaveBeenCalled();
});
it('does not let a passing verifier override a failed correctness gate',async()=>{
  const {result,capture}=await reviewed({...evaluation(),correct:false});
  expect(result.reasonCode).toBe('correctness-failed');expect(capture).not.toHaveBeenCalled();
});
it('preserves P1-only evaluation and unverified proposal handling',async()=>{
  const {verification,inputsDigest,...plain}=evaluation();
  expect((await reviewed(plain)).result.status).toBe('captured');
  const {result,capture}=await reviewed(evaluation(),false);
  expect(result.status).toBe('proposal');expect(result.verificationValidation).toBeUndefined();expect(capture).not.toHaveBeenCalled();
});
