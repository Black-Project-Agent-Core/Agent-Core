import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import type { FileNativeMemoryPaths } from './paths.js';
import { resolvePrivateMemoryTool } from './tool-resolver.js';

const execFileAsync = promisify(execFile);
const STOP = new Set(['the','and','that','this','with','from','into','then','than','untuk','yang','dan','dengan','dari','atau','ini','itu','lanjut','continue','work','please','tolong']);
export type RecallProbeKind = 'entity'|'artifact'|'canonical'|'term'|'context';
export interface RecallProbe { term:string; kind:RecallProbeKind; weight:number }
export interface VaultCandidate { relativePath:string; matchedProbes:string[]; lexicalWeight:number }

export function buildRecallProbes(text:string, context=''):RecallProbe[]{
  const raw=`${text} ${context}`.trim(); const map=new Map<string,RecallProbe>();
  const add=(term:string,kind:RecallProbeKind,weight:number)=>{const t=term.trim().toLowerCase();if(t.length<3||STOP.has(t))return;const prior=map.get(t);if(!prior||prior.weight<weight)map.set(t,{term:t,kind,weight});};
  for(const match of raw.matchAll(/[A-Za-z]:[\\/][^\s"']+|\.?\.?[\\/][\w./\\-]+/g))add(match[0],'artifact',1);
  for(const match of raw.matchAll(/\b[a-zA-Z0-9._-]+:[a-zA-Z0-9._:-]+\b/g))add(match[0],'canonical',1);
  for(const match of raw.matchAll(/\b[A-Z][A-Za-z0-9._-]{2,}\b/g))add(match[0],'entity',.95);
  for(const token of (raw.toLowerCase().match(/[\p{L}\p{N}_.-]{3,}/gu)??[]))add(token,'term',.7);
  for(const family of ['brainstorming','coding','decision','failure','procedure','task','artifact','guardrail'])if(raw.toLowerCase().includes(family))add(family,'context',.8);
  return [...map.values()].sort((a,b)=>b.weight-a.weight||a.term.localeCompare(b.term)).slice(0,20);
}

export class RipgrepVaultSearch {
  private revision: object | undefined;
  private readonly cache = new Map<string, VaultCandidate[]>();
  constructor(readonly paths:FileNativeMemoryPaths, readonly toolOverride?:string){}
  async findCandidateFiles(probes:RecallProbe[], revision?:object):Promise<VaultCandidate[]>{
    if(!probes.length)return[]; const rg=await resolvePrivateMemoryTool(this.paths,'rg',this.toolOverride); const found=new Map<string,{matches:Set<string>;weight:number}>();
    // Reuse results only after the caller revalidated every segment. External edits change revision.
    if (revision !== this.revision) { this.cache.clear(); this.revision = revision; }
    const key = JSON.stringify(probes);
    if (revision && this.cache.has(key)) return this.cache.get(key)!;
    for(const probe of probes){
      try{
        const {stdout}=await execFileAsync(rg,['--files-with-matches','--ignore-case','--fixed-strings','--no-messages','--glob','*.md','--glob','!.agent-core/**','--',probe.term,this.paths.vaultRoot],{windowsHide:true,maxBuffer:2*1024*1024});
        for(const line of stdout.split(/\r?\n/).map(v=>v.trim()).filter(Boolean)){
          const absolute=path.resolve(line); const rel=path.relative(this.paths.vaultRoot,absolute).replace(/\\/g,'/'); if(rel.startsWith('..')||path.isAbsolute(rel))continue;
          const prior=found.get(rel)??{matches:new Set<string>(),weight:0}; if(!prior.matches.has(probe.term)){prior.matches.add(probe.term);prior.weight+=probe.weight;} found.set(rel,prior);
        }
      }catch(error){const code=Number((error as {code?:unknown}).code);if(code===1)continue;throw new Error(`MEMORY_RIPGREP_FAILED:${error instanceof Error?error.message:String(error)}`);}
    }
    const result = [...found.entries()].map(([relativePath,v])=>({relativePath,matchedProbes:[...v.matches].sort(),lexicalWeight:v.weight})).sort((a,b)=>b.lexicalWeight-a.lexicalWeight||a.relativePath.localeCompare(b.relativePath));
    if (revision) { this.cache.set(key, result); if (this.cache.size > 64) this.cache.delete(this.cache.keys().next().value!); }
    return result;
  }
}
