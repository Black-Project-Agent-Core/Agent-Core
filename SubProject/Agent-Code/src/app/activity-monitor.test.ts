import { describe, expect, it } from 'vitest';
import { captureLabel, isActivityError, mergeActivity, type ActivityBatch, type ActivityRecord } from './activity-monitor';
const row=(sequence:number):ActivityRecord=>({sequence,event:'tool.result',data:{}});
const batch=(records:ActivityRecord[],reset=false):ActivityBatch=>({records,reset,lastSequence:records.at(-1)?.sequence??0,skipped:0,malformed:0,pendingBytes:false,desired:{},applied:{},scope:'fixture'});
describe('activity presentation truth',()=>{
  it('never claims enabled from the desired toggle without a matching runtime acknowledgement',()=>{
    const desired={enabled:true,revision:'r1'},now=Date.now();
    expect(captureLabel(desired,{},now)).toBe('Runtime capture unconfirmed');
    expect(captureLabel(desired,{enabled:false,revision:'r0',updatedAt:new Date(now).toISOString()},now)).toBe('Applying capture setting...');
    expect(captureLabel(desired,{...desired,updatedAt:new Date(now).toISOString()},now)).toBe('Capture active');
    expect(captureLabel(desired,{...desired,updatedAt:new Date(now-6000).toISOString()},now)).toBe('Runtime capture unconfirmed');
  });
  it('merges without duplicate sequences and honors explicit reset',()=>{
    expect(mergeActivity([row(1),row(2)],batch([row(2),row(3)])).map(r=>r.sequence)).toEqual([1,2,3]);
    expect(mergeActivity([row(1),row(2)],batch([row(1)],true))).toEqual([row(1)]);
  });
  it('bounds the retained UI window',()=>expect(mergeActivity([],batch(Array.from({length:5000},(_,i)=>row(i+1))))).toHaveLength(4000));
  it('shows operational and protocol failures, not just exceptions',()=>{
    expect(isActivityError({...row(1),data:{httpStatus:401}})).toBe(true);
    expect(isActivityError({...row(2),event:'anomaly'})).toBe(true);
    expect(isActivityError({...row(3),event:'tool.failed'})).toBe(true);
    expect(isActivityError({...row(4),data:{outcome:'ok'}})).toBe(false);
  });
});

it.each([true,false])('preserves capture enabled=%s when cumulative errors are recorded',enabled=>{
  const desired={enabled,revision:'r'},updatedAt=new Date().toISOString();
  expect(captureLabel(desired,{...desired,updatedAt,captureErrors:2})).toBe(`Capture ${enabled?'on':'off'} - capture errors recorded`);
});

it.each([{dropped:1},{writeErrors:1}])('keeps audit issues visible without inferring current health: %j',audit=>{
  const desired={enabled:true,revision:'r'},updatedAt=new Date().toISOString();
  expect(captureLabel(desired,{...desired,updatedAt,audit})).toBe('Capture on - audit issues recorded');
});

it('gives stale, mismatched and failed control acknowledgements precedence over counters',()=>{
  const desired={enabled:true,revision:'r'},now=Date.now();
  const applied={...desired,updatedAt:new Date(now).toISOString(),captureErrors:2,audit:{dropped:1}};
  expect(captureLabel(desired,{...applied,updatedAt:new Date(now-6000).toISOString()},now)).toBe('Runtime capture unconfirmed');
  expect(captureLabel(desired,{...applied,revision:'previous'},now)).toBe('Applying capture setting...');
  expect(captureLabel(desired,{...applied,controlError:'ACTIVITY_CONTROL_INVALID'},now)).toBe('ACTIVITY_CONTROL_INVALID');
});

it('shows first-launch capture as off when no control revision has been created',()=>{
  expect(captureLabel({enabled:false}, {enabled:false,revision:'',updatedAt:new Date().toISOString()})).toBe('Capture off - baseline audit continues');
});
