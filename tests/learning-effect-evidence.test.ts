import { describe, expect, it, vi } from 'vitest';
import { LearningReviewCoordinator } from '../src/learning/review.js';
import { LearningSinkManager } from '../src/learning/sink-manager.js';
import { createLearningDecision, recordLearningDecisions } from '../src/learning/decision-evidence.js';
import { learning } from '../src/mcp/learning-schemas.js';

const base=(patch:any={})=>({
  kind:'durable-fact',
  content:'Synthetic fixture.',
  evidenceRefs:['verification:fixture'],
  verified:true,
  candidateId:'effect-fixture',
  ...patch,
});
async function review(value:any){
  const capture=vi.fn().mockResolvedValue({id:'captured'});
  const sink:any={
    name:'memory',
    classifySupport:()=>true,
    isAvailable:async()=>true,
    findDuplicates:async()=>[],
    capture,
  };
  const reviewer=new LearningReviewCoordinator(new LearningSinkManager([sink]));
  return {outcome:(await reviewer.review([value]))[0],capture};
}

describe('RF-P3 behavioral effect evidence',()=>{

  it('captures observed evidence',async()=>{
    const value=base({effectEvidence:{
      claimType:'behavioral-outcome',
      status:'observed',
      evidenceRefs:['verification:readback'],
      expected:'expected',
      observed:'observed',
    }});
    const {outcome,capture}=await review(value);
    expect(outcome.status).toBe('captured');
    expect(capture).toHaveBeenCalledTimes(1);
  });

});

it('does not persist a behavioral claim without observed effect',async()=>{
  const value=base({effectEvidence:{claimType:'behavioral-outcome',status:'not-exercised',evidenceRefs:['verification:fixture'],expected:'expected'}});
  const result=await review(value);
  expect(result.outcome.status).toBe('proposal');
  expect(result.capture).not.toHaveBeenCalled();
});

it('does not persist a behavioral claim when effect evidence is unavailable',async()=>{
  const value=base({effectEvidence:{claimType:'behavioral-outcome',status:'unavailable',evidenceRefs:['verification:fixture'],expected:'expected'}});
  const result=await review(value);
  expect(result.outcome.status).toBe('proposal');
  expect(result.capture).not.toHaveBeenCalled();
});

it('keeps legacy verified non-behavioral claims compatible',async()=>{
  const result=await review(base());
  expect(result.outcome.status).toBe('captured');
  expect(result.capture).toHaveBeenCalledTimes(1);
});

it('rejects observed status without observed detail',async()=>{
  const value=base({effectEvidence:{
    claimType:'behavioral-outcome',
    status:'observed',
    evidenceRefs:['verification:fixture'],
    expected:'expected'
  }});
  const result=await review(value);
  expect(result.outcome.status).toBe('rejected');
  expect(result.capture).not.toHaveBeenCalled();
});

it('public Learning schema accepts bounded effect evidence',()=>{
  const parsed=learning.parse({action:'review',candidates:[base({effectEvidence:{
    claimType:'behavioral-outcome',
    status:'observed',
    evidenceRefs:['verification:public-schema'],
    expected:'expected',
    observed:'observed',
  }})]});
  expect(parsed.candidates?.[0]?.effectEvidence).toMatchObject({claimType:'behavioral-outcome',status:'observed'});
});

it('decision evidence keeps effect content behind a digest',()=>{
  const raw:any=base({effectEvidence:{
    claimType:'behavioral-outcome',
    status:'observed',
    evidenceRefs:['verification:fixture'],
    expected:'expected-text-fixture',
    observed:'observed-text-fixture'
  }});
  const decision=createLearningDecision(raw,raw,'review-1',0);
  expect(decision.effectClaimType).toBe('behavioral-outcome');
  expect(decision.effectStatus).toBe('observed');
  expect(decision.effectEvidenceDigest).toMatch(/^sha256:/);
  expect(JSON.stringify(decision)).not.toContain('expected-text-fixture');
  expect(JSON.stringify(decision)).not.toContain('observed-text-fixture');
});
