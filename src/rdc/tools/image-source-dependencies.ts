// Declared, opt-in local text dependencies for the existing image inspector.
// These are source-byte observations, not proof of render derivation or visual quality.
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { validatePath } from './filesystem.js';
import { decideToolEvidenceCapture } from '../../security/evidence-capture-policy.js';
import { assertEvidenceLocalPath, evidencePathKey, readEvidenceSnapshot, sameEvidenceIdentity,
  type EvidenceFileIdentity, EVIDENCE_DOCUMENT_MAX } from '../../verification/evidence-snapshot.js';

const MAX_FILES=8, MAX_ATTEMPTS=16, MAX_METADATA=4096, VIEW_TTL=15*60_000;
const TEXT_EXTENSIONS=new Set(['.html','.htm','.css','.js','.mjs','.cjs','.jsx','.ts','.tsx',
  '.json','.md','.txt','.scss','.less','.xml','.yml','.yaml']);
const fail=(code:string):never=>{throw new Error('IMAGE_INSPECT_DEPENDENCY_'+code);};
type Sample={kind:'present'|'missing'|'unavailable';digest:string|null;bytes:number|null;
  identity:EvidenceFileIdentity|null;reason:string|null};
type Expected={handle:string;canonicalPath:string;digest:string|null;bytes:number|null;
  identity:EvidenceFileIdentity|null;reason:string|null};
export type SourceSnapshot={snapshotId:string;capturedAt:string;expiresAt:number;entries:ReadonlyArray<Readonly<Expected>>};
export type ReadBudget={attempts:number};
export type SourceReading=Sample;
export interface SourceDependenciesReport {
  version:1;scope:'declared-local-text-files';snapshotId:string|null;capturedAt:string|null;
  checkedAt:string|null;state:'not-requested'|'current'|'changed'|'unavailable';
  declaredCount:number;checkedCount:number;changedCount:number;unavailableCount:number;
  declaredDependenciesOnly:true;closureCompleteness:'unknown';derivationVerified:false;
  entries:Array<{handle:string;status:'current'|'changed'|'unavailable';reason:string|null;
    expectedDigest:string|null;expectedBytes:number|null}>;
}
export const noSourceDependencies=():SourceDependenciesReport=>({
  version:1,scope:'declared-local-text-files',snapshotId:null,capturedAt:null,checkedAt:null,
  state:'not-requested',declaredCount:0,checkedCount:0,changedCount:0,unavailableCount:0,
  declaredDependenciesOnly:true,closureCompleteness:'unknown',derivationVerified:false,entries:[],
});
const absent=(kind:Sample['kind'],reason:string):Sample=>({kind,digest:null,bytes:null,identity:null,reason});
const assertFresh=(snapshot:SourceSnapshot)=>{if(Date.now()>=snapshot.expiresAt)fail('SNAPSHOT_EXPIRED');};
async function canonicalize(raw:string[]):Promise<string[]> {
  if(!raw.length||raw.length>MAX_FILES)fail('SOURCE_COUNT_INVALID');
  const result:string[]=[],seen=new Set<string>();
  for(const input of raw){
    if(!path.isAbsolute(input)||input.startsWith('\\\\')||input.startsWith('//')||
      /^(?:file|data|https?):/i.test(input)||input.includes('\0'))fail('PATH_REFUSED');
    const canonical=await validatePath(input).catch(()=>fail('PATH_REFUSED'));
    if(evidencePathKey(path.resolve(input))!==evidencePathKey(canonical))fail('ALIAS_REFUSED');
    try{await assertEvidenceLocalPath(canonical);}
    catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')fail('PATH_REFUSED');}
    const key=evidencePathKey(canonical);
    if(seen.has(key))fail('DUPLICATE_SOURCE');
    seen.add(key);result.push(canonical);
  }
  return result;
}
async function readOne(file:string,budget:ReadBudget):Promise<Sample> {
  const policy=decideToolEvidenceCapture('read_file',{path:file});
  if(policy.policyState==='invalid'||policy.disposition!=='full')
    return absent('unavailable','source-policy-unavailable');
  if(!TEXT_EXTENSIONS.has(path.extname(file).toLowerCase()))
    return absent('unavailable','source-format-unsupported');
  if(budget.attempts>=MAX_ATTEMPTS)return absent('unavailable','source-budget-exhausted');
  // Reserve a full 2 MiB for every attempt, even a failed one: at most two 8-file passes.
  budget.attempts++;
  try{
    const snapshot=await readEvidenceSnapshot(file,EVIDENCE_DOCUMENT_MAX);
    return {kind:'present',digest:snapshot.digest,bytes:snapshot.bytes.length,
      identity:snapshot.identity,reason:null};
  }catch(e){
    if((e as NodeJS.ErrnoException).code==='ENOENT')return absent('missing','source-missing');
    const code=e instanceof Error?e.message:'';
    if(code==='EVIDENCE_UTF8_REQUIRED'||code==='EVIDENCE_TEXT_REQUIRED')
      return absent('unavailable','source-format-unsupported');
    if(code==='EVIDENCE_INPUT_LIMIT')return absent('unavailable','source-size-limit');
    return absent('unavailable','source-read-unavailable');
  }
}
export async function captureSourceDependencies(raw:string[]):Promise<{
  snapshot:SourceSnapshot;observed:SourceReading[];budget:ReadBudget;
}> {
  const paths=await canonicalize(raw),budget:ReadBudget={attempts:0};
  const capturedAt=new Date().toISOString(),expiresAt=Date.now()+VIEW_TTL;
  const entries:Expected[]=[],observed:Sample[]=[];
  for(let i=0;i<paths.length;i++){
    const sample=await readOne(paths[i]!,budget);observed.push(sample);
    entries.push({handle:'d'+(i+1),canonicalPath:paths[i]!,
      digest:sample.kind==='present'?sample.digest:null,
      bytes:sample.kind==='present'?sample.bytes:null,
      identity:sample.kind==='present'?sample.identity:null,
      reason:sample.kind==='present'?null:'baseline-unavailable'});
  }
  const snapshot=Object.freeze({snapshotId:randomUUID(),capturedAt,expiresAt,
    entries:Object.freeze(entries.map(entry=>Object.freeze(entry)))});
  assertFresh(snapshot);
  return {snapshot,observed,budget};
}
export async function sampleSourceDependencies(snapshot:SourceSnapshot,budget:ReadBudget):Promise<SourceReading[]> {
  assertFresh(snapshot);
  const observed:Sample[]=[];
  for(const entry of snapshot.entries){
    if(entry.digest===null)observed.push(absent('unavailable','baseline-unavailable'));
    else observed.push(await readOne(entry.canonicalPath,budget));
    assertFresh(snapshot);
  }
  return observed;
}
export async function completeSourceDependencies(
  snapshot:SourceSnapshot|null,first?:SourceReading[],budget:ReadBudget={attempts:0},
):Promise<SourceDependenciesReport> {
  if(!snapshot)return noSourceDependencies();
  assertFresh(snapshot);
  const original=first??await sampleSourceDependencies(snapshot,budget);
  const final=await sampleSourceDependencies(snapshot,budget);
  const entries:SourceDependenciesReport['entries']=[];
  for(let i=0;i<snapshot.entries.length;i++){
    const expected=snapshot.entries[i]!,a=original[i]!,b=final[i]!;
    let status:'current'|'changed'|'unavailable'='current',reason:string|null=null;
    if(expected.digest===null){status='unavailable';reason='baseline-unavailable';}
    else if(a.kind==='unavailable'||b.kind==='unavailable'){
      status='unavailable';reason=a.reason??b.reason??'source-read-unavailable';
    }else if(a.kind!==b.kind){status='unavailable';reason='source-read-race';}
    else if(a.kind==='missing'){status='changed';reason='source-missing';}
    else if(a.digest!==b.digest||!a.identity||!b.identity||!sameEvidenceIdentity(a.identity,b.identity)){
      status='unavailable';reason='source-read-race';
    }else if(b.digest!==expected.digest||b.bytes!==expected.bytes||!expected.identity||
      !sameEvidenceIdentity(b.identity,expected.identity)){
      status='changed';reason='source-changed';
    }
    entries.push({handle:expected.handle,status,reason,expectedDigest:expected.digest,expectedBytes:expected.bytes});
  }
  const changedCount=entries.filter(x=>x.status==='changed').length;
  const unavailableCount=entries.filter(x=>x.status==='unavailable').length;
  const report:SourceDependenciesReport={
    version:1,scope:'declared-local-text-files',snapshotId:snapshot.snapshotId,
    capturedAt:snapshot.capturedAt,checkedAt:new Date().toISOString(),
    state:changedCount?'changed':unavailableCount?'unavailable':'current',
    declaredCount:entries.length,checkedCount:entries.length-unavailableCount,changedCount,unavailableCount,
    declaredDependenciesOnly:true,closureCompleteness:'unknown',derivationVerified:false,entries,
  };
  assertFresh(snapshot);
  if(Buffer.byteLength(JSON.stringify(report),'utf8')>MAX_METADATA)fail('METADATA_LIMIT');
  return report;
}
