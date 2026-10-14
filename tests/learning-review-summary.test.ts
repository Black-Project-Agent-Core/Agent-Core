import { afterEach, describe, expect, it, vi } from 'vitest';
import { LearningService } from '../src/learning/service.js';
import { activityTracker } from '../src/tracker/activity-tracker.js';
import type { LearningReviewOutcome } from '../src/learning/types.js';
afterEach(() => vi.restoreAllMocks());
const cases = [
  [[], 'no-new-knowledge', true],
  [['captured'], 'captured', true],
  [['duplicate'], 'duplicates-only', true],
  [['proposal'], 'awaiting-verification', true],
  [['rejected'], 'incomplete', false],
  [['sink-unavailable'], 'incomplete', false],
  [['sink-failed'], 'incomplete', false],
  [['captured', 'sink-failed'], 'partial', false],
  [['captured', 'proposal'], 'captured', true],
] as const;
describe('SIE-P4 actual LearningService review', () => {
  for (const [statuses, status, complete] of cases) {
    it(`classifies ${statuses.join('+') || 'empty'} honestly`, async () => {
      const outcomes: LearningReviewOutcome[] = statuses.map(status => ({kind:'durable-fact',status}));
      const record=vi.spyOn(activityTracker,'record');
      let state:any={sinceReview:4,lastReviewAt:null,recentRejections:[],pendingReviews:[{
        idempotencyKey:'fixture',reason:'task-complete',evidenceRefs:['source:fixture'],createdAt:'2026-09-30T00:00:00Z'}]};
      const mutate=vi.fn().mockImplementation(async(_owner:string,update:any)=>{
        const next=await update(state);state=next.state;return {state,result:next.result};
      });
      const self={assertEnabled(){},reviewer:{review:async()=>outcomes},stateStore:{load:async()=>state,mutate}};
      const candidates=statuses.map(()=>({kind:'durable-fact',content:'Fact',verified:true,evidenceRefs:['source:fixture']}));
      const result:any=await LearningService.prototype.review.call(self as any,candidates as any);
      expect(result.summary?.status).toBe(status);
      expect(result.summary?.complete).toBe(complete);
      const expectedCounts={captured:0,proposal:0,duplicate:0,rejected:0,'sink-unavailable':0,'sink-failed':0};
      for(const item of statuses)expectedCounts[item]++;
      expect(result.summary?.counts).toEqual(expectedCounts);
      expect(result.outcomes).toEqual(outcomes);
      expect(result.nothingWorthSaving).toBe(!statuses.includes('captured' as never));
      expect(mutate).toHaveBeenCalledWith('review',expect.any(Function));
      expect(state.sinceReview).toBe(1);
      expect(state.pendingReviews.map((item:any)=>item.idempotencyKey)).toEqual(['fixture']);
      const entry=record.mock.calls.find(call=>call[3]==='learning-review');
      expect(entry?.[4]).toEqual(expect.objectContaining({status,complete}));
      if(!complete) {
        expect(entry?.[1]).not.toBe('success');
        expect(entry?.[2]).not.toContain('nothing new to persist');
      }
    });
  }
});
