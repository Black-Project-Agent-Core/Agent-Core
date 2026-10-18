import { expect, it } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fixture } from './skill-proposal-fixture.js';
import { ExternalControllerLearningService } from '../src/learning/external-controller.js';

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
it('external bootstrap supplies a relevance reminder and exact digest-bound Skill read, without granting execution',async()=>{
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
