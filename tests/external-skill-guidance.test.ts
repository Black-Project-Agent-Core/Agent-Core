import { expect, it } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fixture } from './skill-proposal-fixture.js';
import { ExternalControllerLearningService } from '../src/learning/external-controller.js';
import { taskSkillGuidance } from '../src/skills/external-guidance.js';

it('reuses the current task catalog without rescanning mandatory Skill packages', async () => {
  const known = { 'mind-control': 'sha256:' + 'a'.repeat(64) };
  const result = await taskSkillGuidance({ inspect: async () => { throw Error('unexpected rescan'); } } as any, 'native', [], known);
  expect(result.entries.find(entry => entry.name === 'mind-control')).toMatchObject({ status: 'available', read: { expectedActiveDigest: known['mind-control'] } });
  expect(result.entries.find(entry => entry.name === 'agent-core-capability-index')).toMatchObject({ status: 'unavailable' });
});

it('compresses Native guidance while preserving descriptors, exact read requests and the reasoning gate', async () => {
 const skills = { inspect: async () => ({ digest: 'sha256:' + 'a'.repeat(64) }) } as any;
 const native = await taskSkillGuidance(skills, 'native');
 const external = await taskSkillGuidance(skills, 'external');
 expect(native.entries).toEqual(external.entries);
 expect(Buffer.byteLength(native.text)).toBeLessThan(Buffer.byteLength(external.text) * 0.8);
 for (const entry of native.entries) {
  expect(native.text).toContain(entry.name + ': available');
  expect(native.text).toContain(JSON.stringify(entry.read));
 }
 for (const clause of ['nextOffset', 'no tool', 'every coding task', 'Skip only non-coding',
  'standard', 'activation gate', 'not actual use', 'evidence', 'does not grant execution authority']) {
  // The shared contract uses equivalent wording for tool avoidance, actual use and authority.
  if (clause === 'no tool') expect(native.text).toContain('needs no tool');
  else if (clause === 'not actual use') expect(native.text).toContain('not application');
  else if (clause === 'does not grant execution authority') expect(native.text).toContain('does not grant execution authority');
  else expect(native.text).toContain(clause);
 }
});

async function setup(installed=true){
 const f=await fixture();
 if(installed){
  const source=path.join(f.root,'performance-source');await mkdir(source);
  await writeFile(path.join(source,'SKILL.md'),'---\nname: performance-oriented-software-engineering\ndescription: Workload-aware software engineering.\n---\nAnalyze the workload before selecting an implementation strategy.\n');
  await f.skills.import(source);
 }
 const service=await ExternalControllerLearningService.initialize({stateDir:path.join(f.root,'external'),memory:f.memory,learning:f.learning,skills:f.skills});
 return {...f,service};
}
it('external bootstrap supplies capability consideration and an exact digest-bound Skill read, without granting execution',async()=>{
 const f=await setup();const artifact=await f.skills.inspect('performance-oriented-software-engineering');
 const text=await f.service.bootstrapInstructions('hook-fixture');
 expect(text).toContain('EXTERNAL SKILL GUIDANCE');expect(text).toContain(artifact.digest);
 expect(text).toContain('performance-oriented-software-engineering');expect(text).toContain('expectedActiveDigest');
 expect(text).toContain('trivial');expect(text).toContain('does not grant execution');
 expect(text.slice(text.indexOf('EXTERNAL SKILL GUIDANCE'),text.indexOf('Proposal files and revisions'))).not.toContain(f.root);
});
it('missing installation is reported honestly and does not prevent controller bootstrap',async()=>{
 const f=await setup(false);const text=await f.service.bootstrapInstructions('hook-missing');
 expect(text).toContain('performance-oriented-software-engineering: unavailable');
 expect(text).not.toContain('"expectedActiveDigest"');
});
it('task context refreshes guidance from the current catalog without calling a model or running hook scripts',async()=>{
 const f=await setup();const context:any=await f.service.context('hook-context',{query:'software throughput',workspace:'agent-core'});
 expect(context.skillGuidance).toMatchObject({advisory:true,executionAuthority:false});
 expect(context.skillGuidance.entries.find((row:any)=>row.name==='performance-oriented-software-engineering')).toMatchObject({status:'available'});
});
it('always exposes the installed capability index outside lexical selection without loading child instructions',async()=>{
 const f=await setup();const source=path.join(f.root,'index-source');await mkdir(source);
 await writeFile(path.join(source,'SKILL.md'),'---\nname: agent-core-capability-index\ndescription: Installed capability routes\n---\nCHILD-INSTRUCTIONS-MUST-NOT-BE-INLINED\n');
 const index=await f.skills.import(source);
 const bootstrap=await f.service.bootstrapInstructions('index');
 const context:any=await f.service.context('index',{query:'unmatched astronomy question',workspace:'agent-core'});
 for(const text of [bootstrap,context.skillGuidance.text]){
  expect(text).toContain('agent-core-capability-index');expect(text).toContain(index.digest);
  expect(text).toContain('a task that needs tools, code, evidence or multi-step judgment');expect(text).toContain('material change');expect(text).toContain('Simple conversation or a simple question');expect(text).toContain('coding work, including standard coding, still is');
  expect(text).toContain('nextOffset');expect(text).toContain('apply');
  expect(text).not.toContain('CHILD-INSTRUCTIONS-MUST-NOT-BE-INLINED');
 }
});
it('auto-advertises scientific critical thinking across sessions without inlining its body',async()=>{
 const f=await setup();const source=path.join(f.root,'scientific-source');await mkdir(source);
 await writeFile(path.join(source,'SKILL.md'),'---\nname: mind-control\ndescription: Evidence appraisal.\n---\nSCIENTIFIC-BODY-MUST-NOT-BE-INLINED\n');
 const scientific=await f.skills.import(source);
 const bootstrap=await f.service.bootstrapInstructions('scientific-auto');
 const context:any=await f.service.context('scientific-auto',{query:'routine deterministic task',workspace:'agent-core'});
 const native=(await taskSkillGuidance(f.skills,'native')).text;
 for(const text of [bootstrap,context.skillGuidance.text,native]){
  expect(text).toContain('mind-control');expect(text).toContain(scientific.digest);
  expect(text).toContain('activation gate');expect(text).toContain('every coding task');
  expect(text).toContain('standard');expect(text).toContain('Skip only non-coding');
  expect(text).not.toContain('first-priority relevance candidate');
  expect(text).not.toContain('SCIENTIFIC-BODY-MUST-NOT-BE-INLINED');
 }
});
