import {z} from 'zod';
import {sourceRefSchema,recordExperienceSchema,type SourceRef,type RecordExperience} from './experience-types.js';
import {stableDisclosureJson,memorySemanticRevision} from './disclosure.js';
import type {MemoryRecord} from './types.js';
import {uniqueSourceRefs} from './capsule.js';
import type {ConsolidationProposal} from './promotion.js';
const text=z.string().min(1).refine(value=>/\S/.test(value)&&!value.includes('\0')&&Buffer.from(value,'utf8').toString('utf8')===value);
const schema=z.strictObject({schemaVersion:z.literal(1),projectKey:z.string().trim().min(1).max(120),
  claims:z.array(z.strictObject({text,refs:z.array(sourceRefSchema).min(1).max(32)})).min(1).max(16),gaps:z.array(text).max(32)});
export type ProjectSynthesis=z.infer<typeof schema>;
export function projectSynthesisRefs(value:ProjectSynthesis):SourceRef[]{return uniqueSourceRefs(value.claims.flatMap(claim=>claim.refs));}
export function encodeProjectSynthesis(value:ProjectSynthesis):string {
  const parsed=schema.parse(value),encoded=stableDisclosureJson(parsed);
  if(projectSynthesisRefs(parsed).length>32||Buffer.byteLength(encoded,'utf8')>8192)throw new Error('MEMORY_SYNTHESIS_INVALID');
  return encoded;
}
export function decodeProjectSynthesis(content:string):ProjectSynthesis|null {
  try{if(Buffer.byteLength(content,'utf8')>8192)return null;const parsed=schema.parse(JSON.parse(content));encodeProjectSynthesis(parsed);return parsed;}catch{return null;}
}
export function buildProjectSynthesisAction(input:{actionId:string;value:ProjectSynthesis;experience:RecordExperience;target?:SourceRef}):ConsolidationProposal['actions'][number] {
  const content=encodeProjectSynthesis(input.value),refs=projectSynthesisRefs(input.value),experience=recordExperienceSchema.parse(input.experience);
  if(experience.verification.status==='verified'||experience.verification.method!==undefined||experience.verification.verifierRevision!==undefined||experience.verification.verifiedAt!==undefined
    ||(input.target&&(input.target.kind!=='memory'||refs.some(ref=>ref.kind==='memory'&&ref.id===input.target!.id))))throw new Error('MEMORY_SYNTHESIS_INVALID');
  const keys=new Set(refs.map(stableDisclosureJson));
  if(experience.verification.evidence.some(ref=>!keys.has(stableDisclosureJson(ref))))throw new Error('MEMORY_SYNTHESIS_INVALID');
  return {actionId:input.actionId,kind:input.target?'amend':'create',...(input.target?{target:input.target}:{}),inputRefs:refs,
    reason:'Preserve bounded project synthesis with exact claim evidence',value:{category:'project-synthesis',content,experience:{...experience,sourceRefs:refs}}} as ConsolidationProposal['actions'][number];
}
export async function checkProjectSynthesisDependencies(value:ProjectSynthesis,resolve:(ref:SourceRef)=>Promise<'current'|'stale'|'unavailable'>):Promise<{status:'current'|'stale'|'unknown';invalidRefs:SourceRef[]}> {
  const parsed=decodeProjectSynthesis(encodeProjectSynthesis(value))!,invalidRefs:SourceRef[]=[];let stale=false,unknown=false;
  for(const ref of projectSynthesisRefs(parsed)){
    let status:'current'|'stale'|'unavailable';try{status=await resolve(ref);}catch{status='unavailable';}
    if(status!=='current'){invalidRefs.push(ref);stale ||= status==='stale';unknown ||= status!=='stale';}
  }
  return {status:stale?'stale':unknown?'unknown':'current',invalidRefs};
}

export type SynthesisEligibilityReason='stale'|'unknown'|'scope-unavailable'|'deadline'|'cycle'|'limit';
/** Aggregate only: dependency identities, bodies and ancestry never leave this owner. */
export interface SynthesisEligibilitySummary {
  checked:number;
  omitted:number;
  completeness:'complete'|'partial';
  reasons:SynthesisEligibilityReason[];
}
export type SynthesisDependencyStatus='current'|'stale'|'unavailable';
export type SynthesisEligibilityWait=<T>(operation:()=>Promise<T>)=>Promise<T>;
export type SynthesisDependencyResolver=(ref:SourceRef,resolve:(ref:SourceRef)=>Promise<SynthesisDependencyStatus>,wait:SynthesisEligibilityWait)=>Promise<SynthesisDependencyStatus>;

/** One request-local policy for current recall and search. No persistent cache or retries. */
export function createProjectSynthesisEligibility(input:{
  resolve?:SynthesisDependencyResolver;
  assertScopeCurrent:()=>void|Promise<void>;
  inScope:(record:MemoryRecord)=>boolean;
  validateSnapshot:(records:MemoryRecord[],wait:SynthesisEligibilityWait)=>Promise<void>;
  signal?:AbortSignal;
  /** Absolute epoch milliseconds, capped locally to the same 15-second allowance. */
  deadlineMs?:number;
}) {
  const deadline=Math.min(Date.now()+15_000,input.deadlineMs===undefined?Infinity:Number.isFinite(input.deadlineMs)?input.deadlineMs:Date.now());
  const monotonicDeadline=performance.now()+Math.max(0,deadline-Date.now());
  const cache=new Map<string,Promise<SynthesisDependencyStatus>>();
  const checked=new Set<string>(),omitted=new Set<string>(),reasons=new Set<SynthesisEligibilityReason>();
  const revisions=new Map<string,string>();
  let scopeUnavailable=false,abandoned=false;
  const expired=()=>{
    if(abandoned||input.signal?.aborted||Date.now()>=deadline||performance.now()>=monotonicDeadline){abandoned=true;reasons.add('deadline');return true;}
    return false;
  };
  const bounded=async<T>(operation:()=>Promise<T>):Promise<T>=>{
    if(expired())throw new Error('MEMORY_SYNTHESIS_DEADLINE');
    return new Promise<T>((resolve,reject)=>{
      let settled=false;
      const finish=(error:unknown,value?:T)=>{
        if(settled)return;settled=true;clearTimeout(timer);input.signal?.removeEventListener('abort',abort);
        if(error)reject(error);else resolve(value!);
      };
      const abort=()=>{abandoned=true;reasons.add('deadline');finish(new Error('MEMORY_SYNTHESIS_DEADLINE'));};
      const timer=setTimeout(abort,Math.max(0,Math.min(deadline-Date.now(),monotonicDeadline-performance.now())));
      input.signal?.addEventListener('abort',abort,{once:true});
      if(input.signal?.aborted){abort();return;}
      Promise.resolve().then(()=>{if(expired())throw new Error('MEMORY_SYNTHESIS_DEADLINE');return operation();})
        .then(value=>{if(expired())abort();else finish(undefined,value);},error=>finish(error));
    });
  };
  const scopeCurrent=async()=>{
    if(scopeUnavailable||expired())return false;
    try{await bounded(async()=>{await input.assertScopeCurrent();});return true;}
    catch{if(!expired()){scopeUnavailable=true;reasons.add('scope-unavailable');}return false;}
  };
  const resolve=(ref:SourceRef,ancestors:Set<string>):Promise<SynthesisDependencyStatus>=>{
    const key=stableDisclosureJson(ref);
    // Cycle detection MUST precede promise-cache lookup: never await our own ancestor.
    if(ancestors.has(key)){reasons.add('cycle');return Promise.resolve('unavailable');}
    if(expired()||scopeUnavailable)return Promise.resolve('unavailable');
    const existing=cache.get(key);if(existing)return existing;
    if(cache.size>=32){reasons.add('limit');return Promise.resolve('unavailable');}
    if(!input.resolve){reasons.add('scope-unavailable');return Promise.resolve('unavailable');}
    const next=new Set([...ancestors,key]);
    const pending=bounded(()=>input.resolve!(ref,child=>resolve(child,next),bounded)).catch(error=>{
      if(error instanceof Error&&/MEMORY_(?:SCOPE_MISMATCH|CONTROLLER_SCOPE_UNAVAILABLE)/.test(error.message))reasons.add('scope-unavailable');
      return 'unavailable' as const;
    });
    cache.set(key,pending);return pending;
  };
  const omit=(record:MemoryRecord,reason:SynthesisEligibilityReason='unknown')=>{
    if(record.category!=='project-synthesis')return;
    checked.add(record.id);omitted.add(record.id);reasons.add(reason);
  };
  const inScope=(record:MemoryRecord)=>{try{return input.inScope(record);}catch{return false;}};
  const summary=():SynthesisEligibilitySummary=>({checked:checked.size,omitted:omitted.size,
    completeness:omitted.size?'partial':'complete',reasons:[...reasons].sort()});
  return {
    omit,summary,
    async filter(records:MemoryRecord[]):Promise<MemoryRecord[]> {
      if(!records.some(record=>record.category==='project-synthesis'))return records;
      const authorized=await scopeCurrent();
      const eligible:MemoryRecord[]=[];
      for(const record of records){
        if(record.category!=='project-synthesis'){eligible.push(record);continue;}
        checked.add(record.id);
        if(!authorized||!input.resolve||!inScope(record)){
          omit(record,expired()?'deadline':'scope-unavailable');continue;
        }
        const value=decodeProjectSynthesis(record.content);
        if(!value){omit(record);continue;}
        const revision=memorySemanticRevision(record);
        const ownKey=stableDisclosureJson({kind:'memory',id:record.id,revision});
        const status=await checkProjectSynthesisDependencies(value,ref=>resolve(ref,new Set([ownKey])));
        if(expired()){omit(record,'deadline');continue;}
        if(status.status!=='current'){omit(record,status.status==='stale'?'stale':'unknown');continue;}
        revisions.set(record.id,revision);eligible.push(record);
      }
      if(expired())for(const record of eligible)omit(record,'deadline');
      return eligible.filter(record=>record.category!=='project-synthesis'||!omitted.has(record.id));
    },
    async validateDelivery(records:MemoryRecord[]):Promise<MemoryRecord[]> {
      const syntheses=records.filter(record=>record.category==='project-synthesis'&&!omitted.has(record.id));
      if(syntheses.length){
        const authorized=await scopeCurrent();
        let valid=authorized;
        if(valid){try{
          for(const record of syntheses)if(!inScope(record)||revisions.get(record.id)!==memorySemanticRevision(record))throw new Error('MEMORY_REVISION_CONFLICT');
          await bounded(()=>input.validateSnapshot(syntheses,bounded));
          valid=await scopeCurrent();
        }catch{valid=false;}}
        if(!valid)for(const record of syntheses)omit(record,expired()?'deadline':scopeUnavailable?'scope-unavailable':'unknown');
      }
      return records.filter(record=>record.category!=='project-synthesis'||!omitted.has(record.id));
    },
  };
}
export type ProjectSynthesisEligibility=ReturnType<typeof createProjectSynthesisEligibility>;
