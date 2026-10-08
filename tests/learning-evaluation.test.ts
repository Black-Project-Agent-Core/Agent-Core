import baselineSchema from './fixtures/learning-pre-sie-schema.json';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LearningReviewCoordinator } from '../src/learning/review.js';
import { learning } from '../src/mcp/learning-schemas.js';
afterEach(()=>vi.restoreAllMocks());
const evidence=()=>({ref:'verification:fixture',digest:'sha256:'+'a'.repeat(64),observedAt:'2026-09-23T01:00:00+07:00'});
const envelope=()=>({schemaVersion:1,mode:'rank',evaluatorRevision:'fixture-v1',correct:true,objective:0.175,evidence:[evidence()]});
const candidate=(evaluation?:unknown,verified=true)=>({kind:'durable-fact',content:'Measured fixture claim.',verified,evidenceRefs:['source:fixture'],...(evaluation===undefined?{}:{evaluation})});
async function review(value:any) {
  const capture=vi.fn().mockResolvedValue({kind:'durable-fact',status:'captured',id:'fake-sink'});
  const outcome=(await new LearningReviewCoordinator({capture} as any).review([value],true))[0];
  return {outcome:outcome as any,capture};
}
describe('SIE-P1 real coordinator and MCP schema',()=>{
  it('preserves legacy facts without inventing evaluated verification',async()=>{
    const {outcome,capture}=await review(candidate());
    expect(outcome.status).toBe('captured');expect(outcome.evaluation).toBeUndefined();expect(capture).toHaveBeenCalledTimes(1);
  });
  it('retains the optional envelope in the actual MCP schema',()=>{
    const value:any=learning.parse({action:'review',candidates:[candidate(envelope())]});
    expect(value.candidates[0].evaluation).toEqual(envelope());
  });
  it('returns declared-only normalized evidence without fetching artifacts',async()=>{
    const fetch=vi.spyOn(globalThis,'fetch');const {outcome,capture}=await review(candidate(envelope()));
    expect(outcome.evaluation).toEqual(envelope());expect(outcome.evidenceValidation).toBe('declared');
    expect(capture).toHaveBeenCalledTimes(1);expect(fetch).not.toHaveBeenCalled();
  });
  it('keeps unverified false correctness as a proposal even for explicit learn',async()=>{
    const {outcome,capture}=await review(candidate({...envelope(),correct:false},false));
    expect(outcome.status).toBe('proposal');expect(outcome.evidenceValidation).toBe('declared');expect(capture).not.toHaveBeenCalled();
  });
  for(const [name,patch,code] of [
    ['false correctness',{correct:false,objective:999},'correctness-failed'],
    ['missing rank objective',{objective:undefined},'objective-invalid'],
    ['null rank objective',{objective:null},'objective-invalid'],
    ['false attribution',{attributionComplete:false},'attribution-incomplete'],
  ] as const)it(`rejects ${name} before capture`,async()=>{
    const {outcome,capture}=await review(candidate({...envelope(),...patch}));
    expect(outcome.status).toBe('rejected');expect(outcome.reasonCode).toBe(code);expect(capture).not.toHaveBeenCalled();
  });
  for(const objective of [undefined,null,-1,0])it(`allows discover objective ${objective}`,async()=>{
    const {outcome}=await review(candidate({...envelope(),mode:'discover',objective}));
    expect(outcome.status).toBe('captured');expect(outcome.evidenceValidation).toBe('declared');
  });
  const invalids:Record<string,()=>unknown>={
    'empty evidence':()=>({...envelope(),evidence:[]}),
    'over-budget evidence':()=>({...envelope(),evidence:Array.from({length:9},(_,i)=>({...evidence(),ref:'file:'+i}))}),
    'duplicate evidence':()=>({...envelope(),evidence:[evidence(),evidence()]}),
    'conflicting evidence':()=>({...envelope(),evidence:[evidence(),{...evidence(),digest:'sha256:'+'b'.repeat(64)}]}),
    'malformed digest':()=>({...envelope(),evidence:[{...evidence(),digest:'hash'}]}),
    'timezone absent':()=>({...envelope(),evidence:[{...evidence(),observedAt:'2026-09-23T00:00:00'}]}),
    'impossible day':()=>({...envelope(),evidence:[{...evidence(),observedAt:'2026-02-30T00:00:00Z'}]}),
    'unsafe ref':()=>({...envelope(),evidence:[{...evidence(),ref:'https://example.invalid'}]}),
    'empty revision':()=>({...envelope(),evaluatorRevision:'  '}),
    'oversized revision':()=>({...envelope(),evaluatorRevision:'a'.repeat(201)}),
    'unknown field':()=>({...envelope(),verification:{verdict:'pass'}}),
    'string boolean':()=>({...envelope(),correct:'true'}),
    'nonfinite objective':()=>({...envelope(),objective:Infinity}),
    'nonfinite metric':()=>({...envelope(),metrics:{latency:NaN}}),
    'unsafe metric name':()=>({...envelope(),metrics:{apiKey:1}}),
    'too many metrics':()=>({...envelope(),metrics:Object.fromEntries(Array.from({length:17},(_,i)=>['m'+i,i]))}),
    'fractional samples':()=>({...envelope(),samples:{candidate:20.9,baseline:20,minimum:20}}),
    'string samples':()=>({...envelope(),samples:{candidate:'20',baseline:20,minimum:20}}),
    'boolean samples':()=>({...envelope(),samples:{candidate:true,baseline:20,minimum:20}}),
    'unsafe integer':()=>({...envelope(),samples:{candidate:Number.MAX_SAFE_INTEGER+1,baseline:20,minimum:20}}),
    'insufficient samples':()=>({...envelope(),samples:{candidate:19,baseline:20,minimum:20}}),
    'zero minimum':()=>({...envelope(),samples:{candidate:20,baseline:20,minimum:0}}),
    'null envelope':()=>null,
  };
  for(const [name,make] of Object.entries(invalids))it(`rejects ${name} through both entry paths`,async()=>{
    const value=candidate(make());
    const {outcome,capture}=await review(value);
    expect(outcome.status).toBe('rejected');expect(capture).not.toHaveBeenCalled();
    expect(learning.safeParse({action:'review',candidates:[value]}).success).toBe(false);
  });
  it('accepts explicit valid samples and safe bounded metrics',async()=>{
    const {outcome}=await review(candidate({...envelope(),metrics:{latency:5},samples:{candidate:40,baseline:40,minimum:20}}));
    expect(outcome.status).toBe('captured');expect(outcome.evidenceValidation).toBe('declared');
  });
});

it('accepts a one-character evidence identifier without changing the safe-prefix contract',async()=>{
  const {outcome}=await review(candidate({...envelope(),evidence:[{...evidence(),ref:'file:x'}]}));
  expect(outcome.status).toBe('captured');
});

it('round-trips the selected learning tool over real SDK client/server transports',async()=>{
  const {McpServer}=await import('@modelcontextprotocol/server');
  const {Client}=await import('@modelcontextprotocol/client');
  const {registerLearningTools}=await import('../src/mcp/learning-tools.js');
  const {LearningService}=await import('../src/learning/service.js');
  const {LearningSinkManager}=await import('../src/learning/sink-manager.js');
  const ends:any[]=[{},{}];
  for(let i=0;i<2;i++)Object.assign(ends[i],{start:async()=>{},
    send:async(message:unknown)=>{queueMicrotask(()=>ends[1-i].onmessage?.(structuredClone(message)));},
    close:async()=>{ends[i].onclose?.();}});
  const capture=vi.fn().mockResolvedValue({id:'fixture-only'});
  const sink:any={name:'memory',classifySupport:()=>true,isAvailable:async()=>true,findDuplicates:async()=>[],capture};
  const service:any={assertEnabled(){},reviewer:new LearningReviewCoordinator(new LearningSinkManager([sink])),
    stateStore:{load:async()=>({sinceReview:0}),mutate:async(_owner:any,fn:any)=>fn({sinceReview:0})},review:LearningService.prototype.review};
  const server=new McpServer({name:'sie-fixture',version:'1.0.0'});
  const client=new Client({name:'sie-test',version:'1.0.0'});
  registerLearningTools(server,service);
  try {
    await server.connect(ends[0]);await client.connect(ends[1]);
    const listed=await client.listTools();expect(listed.tools.map(t=>t.name)).toEqual(['learning']);
    const properties:any=listed.tools[0].inputSchema.properties;
    expect(properties.action.enum).toEqual(['status','checkpoint','review','curate','journey','receipt']);
    expect(properties.candidates.items.properties.evaluation).toBeTruthy();
    const good:any=await client.callTool({name:'learning',arguments:{action:'review',candidates:[candidate(envelope())]}});
    const decoded=JSON.parse(good.content[0].text);expect(decoded.summary.status).toBe('captured');
    expect(decoded.outcomes[0].evidenceValidation).toBe('declared');expect(decoded.outcomes[0].decision.reviewId).toBeTruthy();
    const bad:any=await client.callTool({name:'learning',arguments:{action:'review',candidates:[candidate({...envelope(),correct:false})]}});
    expect(JSON.parse(bad.content[0].text).outcomes[0].status).toBe('rejected');expect(capture).toHaveBeenCalledTimes(1);
  } finally {await client.close();await server.close();}
});

it('preserves required fields while adding optional evidence and task bindings',async()=>{
  const z=await import('zod/v4');
  const before:any=baselineSchema.schema,after:any=z.toJSONSchema(learning);
  const oldCandidate=before.properties.candidates.items,newCandidate=after.properties.candidates.items;
  expect(newCandidate.required).toEqual(oldCandidate.required);
  const additions=Object.keys(newCandidate.properties).filter(key=>!(key in oldCandidate.properties));
  expect(additions.sort()).toEqual(['auditRef','candidateId','checkpointKey','corrections','effectEvidence','evaluation']);
  for(const key of Object.keys(oldCandidate.properties))expect(newCandidate.properties[key]).toEqual(oldCandidate.properties[key]);
  for(const key of Object.keys(before.properties).filter(key=>key!=='candidates' && key!=='action'))
    expect(after.properties[key]).toEqual(before.properties[key]);
  expect(after.properties.action.enum).toEqual(expect.arrayContaining(before.properties.action.enum));
  expect(after.required).toEqual(before.required);
});
