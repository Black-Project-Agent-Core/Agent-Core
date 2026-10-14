import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { assertContainedPath, fingerprintFile, type MemoryPublicationClock, type MemoryTransactionMutation } from './transaction.js';
import type { MemoryPaths } from './paths.js';
import type { MemoryRecord } from './types.js';
import { normalizeRecord, validateMemoryId } from './note-format.js';
import { isoInstantSchema, sourceRefSchema, type SourceRef } from './experience-types.js';
import { memorySemanticRevision } from './disclosure.js';

const MAX_REVISIONS_PER_MEMORY = 8;
const MAX_REVISION_BYTES_PER_MEMORY = 1_000_000;
const knowledgeIntervalSchema=z.strictObject({source:sourceRefSchema.refine(ref=>ref.kind==='memory'),knownFrom:isoInstantSchema,
  knownTo:isoInstantSchema.optional(),publicationOrder:z.number().int().positive()});
const coverageSchema=z.strictObject({from:isoInstantSchema.optional(),complete:z.boolean(),reason:z.enum(['legacy-unproven','retained-history-gap','clock-regression','bounded-scan']).optional()});
export type KnowledgeInterval=z.infer<typeof knowledgeIntervalSchema>;
export type KnownHistoryCoverage=z.infer<typeof coverageSchema>;
export interface HistoricalMemorySnapshot {records:MemoryRecord[];coverage:KnownHistoryCoverage;revisionRefs:SourceRef[]}
export interface MemoryRevisionSnapshot {capturedAt:string;record:MemoryRecord;knowledge?:KnowledgeInterval}
export interface MemoryRevisionFile {version:1|2;id:string;revisions:MemoryRevisionSnapshot[];current?:KnowledgeInterval;coverage?:KnownHistoryCoverage}
export interface MemoryRevisionRead {revisions:MemoryRevisionSnapshot[];warning?:string}
export function revisionStatePath(paths:MemoryPaths,id:string):string {return path.join(paths.revisions,`${id}.json`);}
const serialize=(file:MemoryRevisionFile)=>`${JSON.stringify(file,null,2)}\n`;
const ref=(record:MemoryRecord):SourceRef=>({kind:'memory',id:record.id,revision:memorySemanticRevision(record)});
const invalid=(id:string):never=>{throw new Error(`MEMORY_REVISION_STATE_INVALID: ${id}`);};

/** V1 remains readable; capturedAt and controller timestamps never become publication evidence. */
export function parseRevisionFile(serialized:string,id:string):MemoryRevisionFile {
  let raw:any;try{raw=JSON.parse(serialized);}catch{return invalid(id);}
  if(!raw||![1,2].includes(raw.version)||raw.id!==id||!Array.isArray(raw.revisions))return invalid(id);
  if(Object.keys(raw).some(key=>!['version','id','revisions',...(raw.version===2?['current','coverage']:[])].includes(key)))return invalid(id);
  const revisions:MemoryRevisionSnapshot[]=raw.revisions.map((item:any)=>{
    if(!item||typeof item!=='object'||Object.keys(item).some(key=>!['capturedAt','record',...(raw.version===2?['knowledge']:[])].includes(key))
      ||!Number.isFinite(Date.parse(item.capturedAt))||!item.record||item.record.id!==id||typeof item.record.content!=='string')return invalid(id);
    let record:MemoryRecord;try{record=normalizeRecord(item.record,item.record.content);}catch{return invalid(id);}
    const knowledge=item.knowledge===undefined?undefined:knowledgeIntervalSchema.safeParse(item.knowledge);
    if(knowledge&&!knowledge.success)return invalid(id);
    if(knowledge?.success&&(knowledge.data.source.id!==id||knowledge.data.source.revision!==memorySemanticRevision(record)||knowledge.data.knownTo===undefined))return invalid(id);
    return {capturedAt:new Date(item.capturedAt).toISOString(),record,...(knowledge?.success?{knowledge:knowledge.data}:{})};
  });
  if(raw.version===1)return{version:1,id,revisions};
  const current=knowledgeIntervalSchema.safeParse(raw.current),coverage=coverageSchema.safeParse(raw.coverage);
  if(!current.success||!coverage.success||current.data.source.id!==id||current.data.knownTo!==undefined||revisions.length>MAX_REVISIONS_PER_MEMORY
    ||Buffer.byteLength(serialized,'utf8')>MAX_REVISION_BYTES_PER_MEMORY)return invalid(id);
  const intervals=[...revisions.flatMap(item=>item.knowledge?[item.knowledge]:[]),current.data];
  if(intervals.some((value,i)=>i>0&&value.publicationOrder<=intervals[i-1]!.publicationOrder))return invalid(id);
  if(coverage.data.complete&&(coverage.data.reason!==undefined||revisions.some(item=>!item.knowledge)))return invalid(id);
  if(!coverage.data.complete&&!coverage.data.reason)return invalid(id);
  if(coverage.data.reason!=='clock-regression'&&intervals.some((value,i)=>
    (value.knownTo!==undefined&&value.knownTo<value.knownFrom)||(i>0&&intervals[i-1]!.knownTo!==value.knownFrom)))return invalid(id);
  return {version:2,id,revisions,current:current.data,coverage:coverage.data};
}
async function loadStrict(paths:MemoryPaths,id:string):Promise<MemoryRevisionFile|null> {
  validateMemoryId(id);const filePath=await assertContainedPath(paths.root,revisionStatePath(paths,id));
  try{return parseRevisionFile(await readFile(filePath,'utf8'),id);}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return null;throw error;}
}
function bounded(file:MemoryRevisionFile):MemoryRevisionFile {
  const revisions=file.revisions.slice(-MAX_REVISIONS_PER_MEMORY);let pruned=revisions.length!==file.revisions.length;
  while(revisions.length&&Buffer.byteLength(serialize({...file,revisions}),'utf8')>MAX_REVISION_BYTES_PER_MEMORY){revisions.shift();pruned=true;}
  const coverage=file.version===2&&pruned&&file.coverage?.reason!=='clock-regression'
    ?{complete:false,reason:'retained-history-gap' as const,from:revisions.find(item=>item.knowledge)?.knowledge?.knownFrom??file.current!.knownFrom}:file.coverage;
  const result={...file,revisions,...(coverage?{coverage}:{})};
  if(Buffer.byteLength(serialize(result),'utf8')>MAX_REVISION_BYTES_PER_MEMORY)throw new Error('MEMORY_REVISION_STATE_TOO_LARGE');
  return result;
}
/** Legacy writer intentionally remains v1 and refuses to downgrade publication metadata. */
export async function buildRevisionMutation(paths:MemoryPaths,current:MemoryRecord):Promise<MemoryTransactionMutation> {
  const targetPath=await assertContainedPath(paths.root,revisionStatePath(paths,current.id)),expectedFingerprint=await fingerprintFile(targetPath),existing=await loadStrict(paths,current.id);
  if(existing?.version===2)throw new Error('MEMORY_REVISION_WRITE_VERSION_UNSUPPORTED');
  const next=bounded({version:1,id:current.id,revisions:[...(existing?.revisions??[]),{capturedAt:new Date().toISOString(),record:structuredClone(current)}]});
  return{targetPath,content:serialize(next),expectedFingerprint};
}
/** Called only by the canonical store under its transaction lock; no caller-supplied clock. */
export async function buildPublicationMutation(paths:MemoryPaths,previous:MemoryRecord|undefined,next:MemoryRecord,clock:MemoryPublicationClock):Promise<MemoryTransactionMutation> {
  const targetPath=await assertContainedPath(paths.root,revisionStatePath(paths,next.id)),expectedFingerprint=await fingerprintFile(targetPath),existing=await loadStrict(paths,next.id),now=clock.lastPublishedAt;
  if(!previous&&existing)throw new Error('MEMORY_REVISION_STATE_INVALID');
  if(existing?.version===2&&(!previous||existing.current!.source.revision!==memorySemanticRevision(previous)||clock.publicationOrder<=existing.current!.publicationOrder))throw new Error('MEMORY_REVISION_CONFLICT');
  const backwards=clock.regressed||(existing?.version===2&&(now<existing.current!.knownFrom||existing.coverage!.reason==='clock-regression'));
  const current:KnowledgeInterval={source:ref(next),knownFrom:now,publicationOrder:clock.publicationOrder};
  const coverage:KnownHistoryCoverage=backwards?{complete:false,reason:'clock-regression'}:existing?.coverage??(previous?{complete:false,reason:'legacy-unproven',from:now}:{complete:true});
  const old=previous?{capturedAt:now,record:structuredClone(previous),...(existing?.current?{knowledge:{...existing.current,knownTo:now}}:{})}:undefined;
  const file=bounded({version:2,id:next.id,current,coverage,revisions:[...(existing?.revisions??[]),...(old?[old]:[])]});
  return{targetPath,content:serialize(file),expectedFingerprint};
}
/** Reconstruct one retained semantic revision. Missing/corrupt history never falls back to current. */
export async function readKnownMemoryRevision(paths:MemoryPaths,current:MemoryRecord,knownAt:string,clock?:MemoryPublicationClock):Promise<{record?:MemoryRecord;coverage:KnownHistoryCoverage}> {
  const instant=isoInstantSchema.parse(knownAt);let file:MemoryRevisionFile|null;
  try{file=await loadStrict(paths,current.id);}catch{return{coverage:{complete:false,reason:'retained-history-gap'}};}
  if(!file||file.version===1||!clock)return{coverage:{complete:false,reason:'legacy-unproven'}};
  if(file.current!.publicationOrder>clock.publicationOrder||(!clock.regressed&&file.current!.knownFrom>clock.lastPublishedAt))return{coverage:{complete:false,reason:'retained-history-gap'}};
  if(file.current!.source.revision!==memorySemanticRevision(current))return{coverage:{complete:false,reason:'retained-history-gap'}};
  const coverage=file.coverage!;
  if(coverage.reason==='clock-regression')return{coverage};
  const complete=coverage.complete||Boolean(coverage.from&&instant>=coverage.from);
  if(!complete)return{coverage};
  const selected=[...file.revisions.flatMap(item=>item.knowledge?[{record:item.record,knowledge:item.knowledge}]:[]),{record:current,knowledge:file.current!}]
    .filter(item=>item.knowledge.knownFrom<=instant&&(item.knowledge.knownTo===undefined||instant<item.knowledge.knownTo))
    .sort((a,b)=>b.knowledge.publicationOrder-a.knowledge.publicationOrder)[0];
  return {coverage:{complete:true,...(coverage.from?{from:coverage.from}:{})},...(selected?{record:structuredClone(selected.record)}:{})};
}
export async function readMemoryRevisions(paths:MemoryPaths,id:string,limit=5):Promise<MemoryRevisionRead> {
  const boundedLimit=Math.max(0,Math.min(MAX_REVISIONS_PER_MEMORY,Math.trunc(limit)));if(!boundedLimit)return{revisions:[]};
  try{return{revisions:(await loadStrict(paths,id))?.revisions.slice(-boundedLimit).reverse()??[]};}catch(error){return{revisions:[],warning:(error instanceof Error?error.message:String(error)).slice(0,500)};}
}
