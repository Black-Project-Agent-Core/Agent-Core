import type { SkillService } from './service.js';

const routes = [
  {name:'performance-oriented-software-engineering',when:'For software work, assess workload scale, latency, throughput, CPU/I/O and memory before choosing an implementation. Read and apply this Skill when relevant; skip trivial edits and unrelated work. Verify performance claims; availability alone does not prove benefit.'},
  {name:'reverse-engineer-anything',when:'For a selected shipped artifact, packaged application or observed behavior, read this Skill and its relevant target guide. Start with artifact identity and bounded evidence; the reconstruction harness checks proof obligations and does not decompile a target.'},
] as const;

/** External instruction hook only. Never executes scripts, models or a Skill's declared tools. */
export async function externalSkillGuidance(skills?: Pick<SkillService,'inspect'>) {
  const entries=await Promise.all(routes.map(async route=>{
    try {
      if(!skills)throw new Error('unavailable');
      const artifact=await skills.inspect(route.name);
      return {...route,status:'available' as const,read:{action:'read' as const,name:route.name,expectedActiveDigest:artifact.digest,maxBytes:8192},instruction:'Read all returned fragments using nextOffset before applying; re-inspect if the revision changes.'};
    } catch { return {...route,status:'unavailable' as const,instruction:'Installation could not be verified; do not claim this Skill was loaded or used.'}; }
  }));
  return {advisory:true as const,executionAuthority:false as const,entries,text:[
    'EXTERNAL SKILL GUIDANCE — always assess relevance to the current task; this hook does not grant execution authority or prove compliance.',
    ...entries.map(entry=>entry.name+': '+entry.status+'. '+entry.when+' '+entry.instruction+('read' in entry?' skills('+JSON.stringify(entry.read)+')':'')),
  ].join('\n')};
}
