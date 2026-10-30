import type { SkillService } from './service.js';

const routes = [
  {name:'agent-core-capability-index',when:'For a task that needs tools, code, evidence or multi-step judgment, and again at a material change, read this compact index and assess its capabilities against the actual task. Use the existing strategy/hypothesis to state which workflows are relevant and why; skip only unrelated workflows with a reason. Read the selected Skills in full, then apply their relevant steps and record actual applied/adapted/rejected use with existing action and verification evidence. Read only selected child instructions and references, never bulk-load the catalog.'},
  {name:'mind-control',when:'Apply the activation gate before topical relevance: inspect and read this Skill for every coding task and for any other task that requires reasoning, judgment, inference, tradeoffs, planning, debugging, evidence assessment or uncertainty handling, including ordinary, familiar or standard tasks outside science. Skip only non-coding work that is purely routine, mechanical and deterministic and requires no reasoning or judgment. Never use topic, lexical rank, familiarity, low risk or the label standard as a reason to skip a reasoning task. A greeting, thanks, simple question with a short factual answer or other simple conversational reply is not such a task; coding work, including standard coding, still is. Progressive delivery does not itself establish causal benefit.'},
  {name:'performance-oriented-software-engineering',when:'For software work, assess workload scale, latency, throughput, CPU/I/O and memory before choosing an implementation. Read and apply this Skill when relevant; skip trivial edits and unrelated work. Verify performance claims; availability alone does not prove benefit.'},
  {name:'reverse-engineer-anything',when:'For a selected shipped artifact, packaged application or observed behavior, read this Skill and its relevant target guide. Start with byte-grounded format identity and bounded read-only metadata; batch independent probes, slice minified output, and stop when the question is evidenced. Escalate to pinned REA for remaining questions, preserve permits, and label observed, inferred and unknown. The reconstruction harness checks proof obligations, not decompilation.'},
] as const;

/** Shared instruction hook only. Never executes scripts, models or a Skill's declared tools. */
export async function taskSkillGuidance(
  skills?: Pick<SkillService,'inspect'>,
  audience: 'external' | 'native' = 'external',
  disabledNames: readonly string[] = [],
): Promise<{advisory:true;executionAuthority:false;entries:any[];text:string}> {
  const disabledSet = new Set(disabledNames);
  const entries=await Promise.all(routes.map(async route=>{
    if (disabledSet.has(route.name)) return null;
    try {
      if(!skills)throw new Error('unavailable');
      const artifact=await skills.inspect(route.name);
      return {...route,status:'available' as const,read:{action:'read' as const,name:route.name,expectedActiveDigest:artifact.digest,maxBytes:8192},instruction:'Read all returned fragments using nextOffset before applying; re-inspect if the revision changes.'};
    } catch { return {...route,status:'unavailable' as const,instruction:'Installation could not be verified; do not claim this Skill was loaded or used.'}; }
  }));
  const filtered = entries.filter((e): e is NonNullable<typeof e> => e !== null);
  const nativePurpose: Record<string, string> = {
    'agent-core-capability-index': 'Assess the actual goal and material changes; read the compact index, select relevant workflows, fully read and apply them with action/verification evidence. Do not bulk-load child Skills.',
    'performance-oriented-software-engineering': 'Select when scale, latency, throughput, CPU/I/O or memory affects design. Characterize the workload before implementation and verify performance claims; skip unrelated or trivial work.',
    'reverse-engineer-anything': 'Select for shipped artifacts or packaged applications; ground format identity in bytes, use bounded probes and only relevant references. Respect permits; distinguish observed, inferred and unknown.',
  };
  const offLine = disabledNames.length > 0
    ? 'Skills switched off by the user (hard block, do not read or apply; if one is needed, ask the user in your reply to switch it on and say why; a refusal is not permanent): ' + disabledNames.join(', ')
    : undefined;
  return {advisory:true as const,executionAuthority:false as const,entries:filtered,text:[
    (audience === 'native' ? 'NATIVE' : 'EXTERNAL') + ' SKILL GUIDANCE — mandatory capability consideration workflow for tasks that need tools, code, evidence or multi-step judgment; this hook does not grant execution authority or prove compliance.',
    'Simple conversation or a simple question (a greeting, thanks, small talk, or a short factual answer that needs no tool, file, code or multi-step judgment) needs none of this: answer directly without reading the index or any Skill. Skipping is correct there, never a violation.',
    'Follow every nextOffset from zero through the final fragment for the same active digest before declaring applied/adapted Skill use. Search, inspect, partial reading and index exposure are not application. Reading alone never earns a use receipt. Request only existing scoped capabilities when needed; unavailable instructions remain explicitly unavailable.',
    ...filtered.map(entry=>entry.name+': '+entry.status+'. '
      +(audience==='native'?(nativePurpose[entry.name]??entry.when):entry.when)
      +(audience==='native'?(entry.status==='unavailable'?' '+entry.instruction:''):' '+entry.instruction)
      +('read' in entry?' skills('+JSON.stringify(entry.read)+')':'')),
    ...(offLine ? [offLine] : []),
  ].join('\n')};
}
export const externalSkillGuidance = (skills?: Pick<SkillService,'inspect'>) => taskSkillGuidance(skills, 'external');
