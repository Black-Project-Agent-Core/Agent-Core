import { expect, it } from 'vitest';
import { scoreControlledOutcome } from '../src/learning/controlled-outcome.js';
async function score(value:unknown) {
  return scoreControlledOutcome(value);
}
const input=()=>({testsPassed:true,attributionComplete:true,eligibleIdentityVerified:true,substantiveActions:4,minimumSamples:20,candidate:{successes:15,opportunities:40},baseline:{successes:8,opportunities:40}});
it('calculates the selected consumer positive control with fixed denominators',async()=>{
  const r=await score(input());expect(r.correct).toBe(true);expect(r.objective).toBeCloseTo(0.175,12);
});
for(const successes of [0,8])it(`validity does not imply improvement (${successes})`,async()=>{
  const r=await score({...input(),candidate:{successes,opportunities:40}});expect(r.correct).toBe(true);expect(r.objective).toBeLessThanOrEqual(0);
});
for(const field of ['testsPassed','attributionComplete','eligibleIdentityVerified'])it(`rejects false ${field}`,async()=>{
  const r=await score({...input(),[field]:false});expect(r.correct).toBe(false);expect(r.objective).toBeNull();
});
for(const value of [-1,1.5,'20',true,Infinity,NaN,Number.MAX_SAFE_INTEGER+1])it(`rejects non-count ${String(value)}`,async()=>{
  const r=await score({...input(),candidate:{successes:value,opportunities:40}});expect(r.correct).toBe(false);
});
for(const value of [0,-1,1.5,'20',true,Infinity])it(`rejects invalid sample minimum ${String(value)}`,async()=>{
  expect((await score({...input(),minimumSamples:value})).correct).toBe(false);
});
it('rejects impossible successes, undersized cohorts and no substantive action',async()=>{
  for(const patch of [{candidate:{successes:41,opportunities:40}},{baseline:{successes:8,opportunities:19}},{substantiveActions:0}])
    expect((await score({...input(),...patch})).correct).toBe(false);
});
it('does not accept unknown fields or coerce hard flags',async()=>{
  expect((await score({...input(),testsPassed:'true'})).correct).toBe(false);
  expect((await score({...input(),ignoreFailure:true})).correct).toBe(false);
});
