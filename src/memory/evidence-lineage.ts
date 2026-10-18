import {isMemoryLinkActive} from './relations.js';
import {memorySemanticRevision} from './disclosure.js';
import type {MemoryRecord} from './types.js';

export type EvidenceLineageAdvisory = {
  status:'shared-origin'|'unknown';
  /** Peers are only other records in the same disclosed selection. */
  peers?:string[];
  basis?:'derived-from'|'exact-source-ref'|'captured-source'|'declared-source';
};
type Basis = NonNullable<EvidenceLineageAdvisory['basis']>;
const MAX_DEPTH=12;
const MAX_VISITS=128;
/** Read-only projection of existing Memory lineage, never a trust score or ledger. */
export function assessEvidenceLineage(
  disclosed:readonly MemoryRecord[], eligible:readonly MemoryRecord[]=disclosed, at=Date.now(),
):Map<string,EvidenceLineageAdvisory> {
  const byId=new Map(eligible.map(record=>[record.id,record]));
  const roots=new Map<string,Map<string,Basis>>();
  const collect=(record:MemoryRecord,stack:Set<string>,depth:number,visits:{remaining:number}):Map<string,Basis>=>{
    const out=new Map<string,Basis>();
    if(visits.remaining--<=0)return out;
    const add=(key:string,basis:Basis)=>{if(key.length<=1200)out.set(key,basis);};
    // Identity of a canonical record is a shared upstream only for its derivatives.
    add('memory:'+record.id,'derived-from');
    const source=record.source;
    if(source?.ref && source.ref.length<=500
      && ((/^https?:\/\//i.test(source.ref)&&['url','web','website','document'].includes(source.type))
        || /^(?:sha256:|verification:|source:)/i.test(source.ref)))
      add('source:'+source.type+':'+source.ref,'declared-source');
    if(record.version===2)for(const ref of record.experience.sourceRefs.slice(0,64)){
      add('exact:'+ref.kind+':'+ref.id+':'+ref.revision,'exact-source-ref');
      if(ref.kind==='memory' && depth<MAX_DEPTH){
        const parent=byId.get(ref.id);
        if(parent&&memorySemanticRevision(parent)===ref.revision){
          add('memory:'+ref.id,'exact-source-ref');
          if(!stack.has(ref.id))for(const [key,basis] of collect(parent,new Set([...stack,ref.id]),depth+1,visits))add(key,basis);
        }
      }
    }
    for(const link of record.links.filter(link=>link.type==='derived-from'
      && isMemoryLinkActive(link,at)).slice(0,32)){
      add('memory:'+link.targetId,'derived-from');
      const parent=byId.get(link.targetId);
      if(parent&&depth<MAX_DEPTH&&!stack.has(parent.id))
        for(const [key,basis] of collect(parent,new Set([...stack,parent.id]),depth+1,visits))add(key,basis);
    }
    const provenance=record.provenance;
    if(provenance?.sourceSnapshot?.version===1) {
      const identity=provenance.identity?.repositoryId??('workspace:'+String(provenance.workspace??'unknown'));
      for(const file of provenance.sourceSnapshot.files.slice(0,64))
        if(file.status==='captured' && /^sha256:[a-f0-9]{64}$/i.test(file.digest))
          add('captured:'+identity+':'+file.path+':'+file.digest.toLowerCase(),'captured-source');
    }
    return out;
  };
  for(const record of disclosed)roots.set(record.id,collect(record,new Set([record.id]),0,{remaining:MAX_VISITS}));
  const result=new Map<string,EvidenceLineageAdvisory>();
  for(const record of disclosed){
    const mine=roots.get(record.id)!;
    const peers:string[]=[];let basis:Basis|undefined;
    for(const other of disclosed){
      if(other.id===record.id)continue;
      const theirs=roots.get(other.id)!;
      for(const [key,origin] of mine)if(theirs.has(key)){
        peers.push(other.id);basis??=origin;break;
      }
    }
    result.set(record.id,peers.length
      ?{status:'shared-origin',peers:peers.sort().slice(0,4),basis}
      :{status:'unknown'});
  }
  return result;
}
