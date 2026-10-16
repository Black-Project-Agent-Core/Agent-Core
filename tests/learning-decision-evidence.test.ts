import { afterEach, describe, expect, it, vi } from 'vitest';
import { fileURLToPath } from 'node:url';
vi.mock('../src/tracker/activity-tracker.js', () => ({ activityTracker: { record: vi.fn(), recordOutcome: vi.fn(), captureFailure: vi.fn(), readFeatureOutcomes: () => [] } }));
import { LearningService } from '../src/learning/service.js';
import { normalizeMemoryWorkspace } from '../src/memory/provenance.js';
import { LearningReviewCoordinator } from '../src/learning/review.js';
import { LearningSinkManager } from '../src/learning/sink-manager.js';
import { MemoryLearningSink } from '../src/memory/learning-sink.js';
import { activityTracker } from '../src/tracker/activity-tracker.js';
import { learning } from '../src/mcp/learning-schemas.js';
afterEach(()=>{vi.restoreAllMocks();vi.resetAllMocks();});
const claim=(patch:any={})=>({kind:'durable-fact',content:'Private fixture content not for telemetry.',verified:true,evidenceRefs:['source:fixture'],candidateId:'claim-1',...patch});
async function run(values:any[],status='captured') {
  const capture=vi.fn().mockImplementation(async()=>{if(status==='sink-failed')throw Error('fixture failure');return {id:'sink-original'};});
  const sink:any={name:'memory',classifySupport:()=>true,isAvailable:async()=>status!=='sink-unavailable',
    findDuplicates:async()=>status==='duplicate'?[{id:'sink-original',reason:'equivalent'}]:[],capture};
  const reviewer=new LearningReviewCoordinator(new LearningSinkManager([sink]));
  let state:any={version:1,checkpointCount:1,sinceReview:1,lastCheckpointAt:null,lastReviewAt:null,lastCuratorAt:null,recentIdempotency:[],recentRejections:[]};
  const self={assertEnabled(){},memory:{resolveWorkspace:normalizeMemoryWorkspace},reviewer,stateStore:{
    load:async()=>state,
    mutate:async(_owner:string,update:any)=>{const next=update(state);state=next.state;return {state,result:next.result};},
  }};
  const result:any=await LearningService.prototype.review.call(self as any,values);
  return {result,capture};
}
describe('SIE-P3 bounded decision evidence',()=>{
  for(const status of ['captured','duplicate','sink-failed','sink-unavailable'])it(`correlates ${status} without exposing content`,async()=>{
    const record=vi.spyOn(activityTracker,'record');const {result}=await run([claim()],status);
    const outcome=result.outcomes[0];expect(outcome.status).toBe(status);
    expect(outcome.decision?.candidateId).toBe('claim-1');expect(outcome.decision?.reviewId).toBeTruthy();
    const event=record.mock.calls.find(call=>call[3]==='learning-candidate-decision');
    expect(event?.[4]).toEqual(expect.objectContaining({candidateId:'claim-1',outcome:status}));
    expect(JSON.stringify(event)).not.toContain(claim().content);expect(JSON.stringify(event?.[4]).length).toBeLessThan(2000);
    if(status==='duplicate')expect(outcome.id).toBe('sink-original');
  });
  it('pairs repeated IDs with normalized content fingerprints',async()=>{
    const {result}=await run([claim(),claim({content:'Different measured content.'})]);
    const [a,b]=result.outcomes.map((o:any)=>o.decision);
    expect(a?.reviewId).toBeTruthy();expect(a?.reviewId).toBe(b?.reviewId);
    expect(a?.candidateKey).toBe(b?.candidateKey);expect(a?.fingerprint).not.toBe(b?.fingerprint);
  });
  it('generates call-scoped IDs and separates workspace namespaces',async()=>{
    const {result}=await run([claim({candidateId:undefined}),claim({candidateId:undefined}),claim({workspace:'another'})]);
    const decisions=result.outcomes.map((o:any)=>o.decision);
    expect(decisions[0]?.candidateId).toBeTruthy();expect(decisions[0]?.candidateId).not.toBe(decisions[1]?.candidateId);
    expect(decisions[0]?.candidateKey).not.toBe(decisions[2]?.candidateKey);
  });
  it('declares corrections only on captured claims, without touching an old sink record',async()=>{
    const record=vi.spyOn(activityTracker,'record');
    const correction={kind:'supersedes',targetCandidateId:'old-claim',reasonRef:'verification:recheck'};
    const {result,capture}=await run([claim({corrections:[correction]}),claim({verified:false,corrections:[correction]})]);
    expect(capture).toHaveBeenCalledTimes(1);expect(result.outcomes[1].status).toBe('proposal');
    const events=record.mock.calls.filter(call=>call[3]==='learning-candidate-decision');
    expect(events[0]?.[4]).toEqual(expect.objectContaining({correctionCount:1,correctionsDeclared:true}));
    expect(events[1]?.[4]).toEqual(expect.objectContaining({correctionsDeclared:false}));
    expect(JSON.stringify(events)).not.toContain('verification:recheck');
  });
  it('does not repeat a capture when tracker recording fails',async()=>{
    vi.spyOn(activityTracker,'record').mockImplementation(()=>{throw Error('tracker unavailable');});
    const {result,capture}=await run([claim()]);
    expect(result.outcomes[0].status).toBe('captured');expect(capture).toHaveBeenCalledTimes(1);
  });
  for(const patch of [
    {candidateId:''},{candidateId:'x'.repeat(201)},{auditRef:'https://example.invalid'},
    {auditRef:'file:'+'x'.repeat(481)},{corrections:[{kind:'delete',targetCandidateId:'old',reasonRef:'source:fixture'}]},
    {corrections:Array.from({length:9},(_,i)=>({kind:'invalidates',targetCandidateId:'old-'+i,reasonRef:'source:fixture'}))},
  ])it(`rejects invalid decision metadata ${Object.keys(patch)[0]}`,async()=>{
    const record=vi.spyOn(activityTracker,'record');const value=claim(patch);
    const {result,capture}=await run([value]);expect(result.outcomes[0].status).toBe('rejected');
    expect(capture).not.toHaveBeenCalled();expect(learning.safeParse({action:'review',candidates:[value]}).success).toBe(false);
    expect(record.mock.calls.some(call=>call[3]==='learning-candidate-decision')).toBe(true);
  });
  it('stores the explicit audit pointer instead of truncating the evidence list',async()=>{
    const remember=vi.fn().mockResolvedValue({id:'new-memory'});
    const sink=new MemoryLearningSink({remember} as any);
    await sink.capture(claim({auditRef:'file:runtime/reports/claim.json',evidenceRefs:['source:'+'x'.repeat(600)]}) as any);
    expect(remember.mock.calls[0][0].source).toEqual({type:'learning-review',ref:'file:runtime/reports/claim.json'});
  });
  it('preserves the old source.ref fallback when no audit pointer exists',async()=>{
    const remember=vi.fn().mockResolvedValue({id:'new-memory'});const sink=new MemoryLearningSink({remember} as any);
    const value=claim({candidateId:undefined,evidenceRefs:['source:'+'x'.repeat(600)]});
    await sink.capture(value as any);expect(remember.mock.calls[0][0].source.ref).toBe(value.evidenceRefs.join(', ').slice(0,480));
  });
});

it('keeps maximum-size valid decision telemetry bounded and marks omitted references',async()=>{
  const record=vi.spyOn(activityTracker,'record');
  const evaluation={schemaVersion:1,mode:'rank',correct:true,objective:1,evaluatorRevision:'e'.repeat(200),
    evidence:Array.from({length:8},(_,i)=>({ref:'file:'+i+'x'.repeat(993),digest:'sha256:'+'a'.repeat(64),observedAt:'2026-09-23T00:00:00Z'}))};
  const corrections=Array.from({length:8},(_,i)=>({kind:'supersedes',targetCandidateId:String(i)+'c'.repeat(199),reasonRef:'file:'+'r'.repeat(995)}));
  const {result}=await run([claim({candidateId:'c'.repeat(200),evaluation,corrections})]);
  expect(result.outcomes[0].status).toBe('captured');
  const event=record.mock.calls.find(call=>call[3]==='learning-candidate-decision');
  expect(JSON.stringify(event?.[4]).length).toBeLessThan(2000);
  expect(event?.[4]).toEqual(expect.objectContaining({evidenceRefsOmitted:8,correctionRefsOmitted:8}));
});
it('validates an audit pointer even for direct Memory sink calls',async()=>{
  const remember=vi.fn();const sink=new MemoryLearningSink({remember} as any);
  await expect(sink.capture(claim({auditRef:'https://example.invalid'}) as any)).rejects.toThrow();
  expect(remember).not.toHaveBeenCalled();
});

it('persists an audit pointer through real isolated MemoryService without rewriting the duplicate',async()=>{
  const fs=await import('node:fs/promises'),path=await import('node:path');
  const {MemoryService}=await import('../dist/memory/service.js');
  const fixtureParent=fileURLToPath(new URL('../runtime/tmp',import.meta.url));
  await fs.mkdir(fixtureParent,{recursive:true});
  const base=await fs.mkdtemp(path.join(fixtureParent,'sie-memory-')); 
  const memoryRoot=path.join(base,'memory');await fs.mkdir(memoryRoot);
  await fs.writeFile(path.join(memoryRoot,'00-agent-core-memory.md'),'# Agent Core isolated test foundation\nSynthetic fixture.\n');
  try {
    const memory=await MemoryService.initialize(base,memoryRoot);
    expect(memory.health().canonicalStore).toBe('available');
    const service=await LearningService.initialize({enabled:true,stateDir:path.join(base,'learning'),reviewInterval:10,curatorIntervalHours:168},memory as any);
    const value=claim({auditRef:'file:reports/first.json'});
    const first:any=await service.review([value] as any);
    expect(first.outcomes[0].status).toBe('captured');const id=first.outcomes[0].id;
    const file=path.join(memoryRoot,'notes',id+'.md');const before=await fs.readFile(file,'utf8');
    expect(before).toContain('file:reports/first.json');
    const second:any=await service.review([claim({auditRef:'file:reports/second.json'})] as any);
    expect(second.outcomes[0].status).toBe('duplicate');expect(second.outcomes[0].id).toBe(id);
    expect(await fs.readFile(file,'utf8')).toBe(before);
    const bad:any=await service.review([claim({evaluation:{schemaVersion:1,mode:'rank',correct:false,objective:99,evaluatorRevision:'v1',
      evidence:[{ref:'file:reports/bad.json',digest:'sha256:'+'b'.repeat(64),observedAt:'2026-09-23T00:00:00Z'}]}})] as any);
    expect(bad.outcomes[0].status).toBe('rejected');expect((await memory.list()).length).toBe(2);
    expect(await fs.readFile(file,'utf8')).toBe(before);
  } finally {await fs.rm(base,{recursive:true,force:true});}
});

it('emits bounded declared correction targets only for a newly captured claim',async()=>{
  const record=vi.spyOn(activityTracker,'record');
  const corrections=[{kind:'invalidates',targetCandidateId:'previous-claim',reasonRef:'verification:correction-report'}];
  await run([claim({corrections})]);
  await run([claim({corrections,verified:false})]);
  await run([claim({corrections})],'duplicate');
  await run([claim({corrections})],'sink-failed');
  const events=record.mock.calls.filter(call=>call[3]==='learning-correction-declared');
  expect(events).toHaveLength(1);
  expect(events[0][4]).toEqual(expect.objectContaining({relation:'invalidates',targetCandidateId:'previous-claim',
    targetExistence:'not-checked',evidenceValidation:'declared',durability:'best-effort'}));
  expect(JSON.stringify(events[0])).not.toContain('verification:correction-report');
  expect(JSON.stringify(events[0][4]).length).toBeLessThan(1500);
});
