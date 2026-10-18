import { afterEach, expect, it, vi } from 'vitest';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fixture, proposalInput, report } from './skill-proposal-fixture.js';
import { memoryTaskFixture } from './memory/memory-task-test-utils.js';
import { LearningService } from '../src/learning/service.js';
import { ExternalControllerLearningService } from '../src/learning/external-controller.js';
import { intentionUpsert } from '../src/memory/prospective-intentions.js';
import { controllerLearning } from '../src/mcp/controller-learning-schemas.js';

const extraRoots: string[] = [];
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(extraRoots.splice(0).map(root => rm(root, {recursive:true,force:true}))); });
async function boundContext(service: ExternalControllerLearningService, input: { query?: string } = {}) {
  const invocation = await service.captureToolInvocationContext({ invocationId: randomUUID(), processSessionId: 'fixture-process', sessionId: 'transport', ownerId: 'owner' });
  expect(invocation.binding).toBe('bound');
  return service.context('transport', input, 'owner', invocation);
}
/** Receipt tests must carry a real host-issued invocation, not an unbound shortcut. */
async function boundReceipt(service: ExternalControllerLearningService, input: any) {
  const invocation = await service.captureToolInvocationContext({
    invocationId: randomUUID(), processSessionId: 'fixture-process', sessionId: 'transport', ownerId: 'owner',
  });
  expect(invocation.binding).toBe('bound');
  return service.artifactReceipt('transport', input, invocation);
}
async function receiptFixture(experience = false) {
  const f = await fixture();
  if (experience) {
    const {initializeMemoryRoot}=await import('../src/memory/initialize.js');
    f.memory=await initializeMemoryRoot({baseDir:f.root,memoryRoot:path.join(f.root,'runtime/memory-experience'),experience:{enabled:true}}) as any;
    f.learning=await LearningService.initialize({enabled:true,stateDir:path.join(f.root,'runtime/learning-experience'),reviewInterval:10,curatorIntervalHours:168},f.memory);
  }
  const external = await ExternalControllerLearningService.initialize({stateDir:path.join(f.root,'external'),memory:f.memory,learning:f.learning,skills:f.skills});
  const episode = await external.startEpisode('transport',{workspace:'agent-core',taskKey:'receipt-task'},
    {ownerId:'owner',workspaceIdentityKey:f.memory.registeredWorkspaceIdentity('agent-core').key});
  const record = await f.memory.remember({content:'Reuse exact compiler validation recipe.',category:'procedure',provenance:{workspace:'agent-core',files:[]}});
  const context = await boundContext(external,{query:'exact compiler validation recipe'});
  const hit = context.memories.find(item => item.id === record.id)!;
  const verificationRef = await report(f.root,episode.id);
  const proof = JSON.parse(await readFile(path.join(f.root,episode.id+'-report.json'),'utf8'));
  const input = {taskId:episode.id,workspace:'agent-core',kind:'memory' as const,artifactId:record.id,memoryId:record.id,
    retrievalAttemptId:hit.retrievalEvidence.attemptId,contentDigest:hit.retrievalEvidence.contentDigest,
    applicability:'applied' as const,result:'success' as const,reasonCode:'used-recipe',verificationRef,
    actionRefs:['file:'+proof.answer.path+'#'+proof.answer.digest]};
  return {...f,external,episode,record,input};
}
it('shares trusted host verification manifests with the experience runtime verifier',async()=>{
  const {root}=await fixture();
  const ref=await report(root,'shared-host-proof');
  const verifier=await import('../src/memory/workflow-verifier.js');
  expect(await verifier.recheckWorkflowReport(ref,'shared-host-proof')).toBe('pass');
});
it.each([false,true])('bridges explicit verified assessment once per task/revision (experience runtime: %s)',async(experience)=>{
  const f=await receiptFixture(experience);
  expect((await f.memory.feedbackStatus()).recordCount).toBe(0);
  await boundReceipt(f.external,f.input);
  expect((await f.memory.feedbackStatus()).recordCount).toBe(0);
  const assessed={...f.input,memoryFeedback:'helpful'};
  const first:any=await boundReceipt(f.external,assessed as any);
  expect(first.memoryFeedback).toMatchObject({status:'recorded',duplicate:false,salience:1.25});
  const second:any=await boundReceipt(f.external,{...assessed,reasonCode:'same-use-other-label'} as any);
  expect(second.memoryFeedback).toMatchObject({status:'recorded',duplicate:true,salience:1.25});
  expect(controllerLearning.parse({action:'artifact_receipt',artifactKind:'memory',...assessed}).memoryFeedback).toBe('helpful');
});
it('refuses unverified or rejected assessment and preserves receipt if feedback writing fails',async()=>{
  const f=await receiptFixture();
  await expect(boundReceipt(f.external,{...f.input,result:'unavailable',verificationRef:undefined,memoryFeedback:'helpful'} as any)).rejects.toThrow('EXTERNAL_MEMORY_FEEDBACK_VERIFIED_USE_REQUIRED');
  await expect(boundReceipt(f.external,{...f.input,applicability:'rejected',memoryFeedback:'helpful'} as any)).rejects.toThrow('EXTERNAL_MEMORY_FEEDBACK_VERIFIED_USE_REQUIRED');
  const feedback=vi.spyOn(f.memory,'feedback').mockRejectedValueOnce(new Error('TEST_FEEDBACK_UNAVAILABLE'));
  const result:any=await boundReceipt(f.external,{...f.input,memoryFeedback:'helpful'} as any);
  expect(result.receipt.memoryId).toBe(f.record.id);
  expect(result.memoryFeedback).toMatchObject({status:'unavailable'});
  feedback.mockRestore();
  const retry:any=await boundReceipt(f.external,{...f.input,memoryFeedback:'helpful'} as any);
  expect(retry.duplicate).toBe(true);expect(retry.memoryFeedback).toMatchObject({status:'recorded',duplicate:false});
});
it('keeps conflicting utility assessments and changed Memory revisions from getting new credit',async()=>{
  const f=await receiptFixture();
  const first:any=await boundReceipt(f.external,{...f.input,memoryFeedback:'helpful'} as any);
  expect(first.memoryFeedback.salience).toBe(1.25);
  const conflicting:any=await boundReceipt(f.external,{...f.input,memoryFeedback:'not-helpful'} as any);
  expect(conflicting.duplicate).toBe(true);
  expect(conflicting.memoryFeedback).toMatchObject({status:'unavailable',reason:'MEMORY_FEEDBACK_EVENT_CONFLICT'});
  expect((await f.memory.feedbackSalienceMap()).get(f.record.id)).toBe(1.25);
  await f.memory.update(f.record.id,{content:'Changed recipe with new prerequisites.'});
  await expect(boundReceipt(f.external,{...f.input,reasonCode:'after-body-change',memoryFeedback:'helpful'} as any)).rejects.toThrow('MEMORY_USE_RECEIPT_CONTENT_CHANGED');
  expect((await f.memory.feedbackSalienceMap()).get(f.record.id)).toBe(1.25);
  expect(controllerLearning.safeParse({action:'artifact_receipt',artifactKind:'memory',...f.input,applicability:'rejected',memoryFeedback:'helpful'}).success).toBe(false);
});
async function writeSkill(root:string,body:string,resource=false){
  await mkdir(root,{recursive:true});await writeFile(path.join(root,'SKILL.md'),'---\nname: code-review\ndescription: Review code safely\nlicense: Apache-2.0\n---\n'+body);
  if(resource)await writeFile(path.join(root,'reference.txt'),'Keep the important constraints.');
}
it('retains a stale staged contribution instead of promoting it over a different baseline',async()=>{
  const {root,skills}=await fixture();
  for(const v of ['base','left','right'])await writeSkill(path.join(root,v),v);
  const base=await skills.import(path.join(root,'base'));
  const left=await skills.stageRevision(path.join(root,'left'),['tool:left']);
  const right=await skills.stageRevision(path.join(root,'right'),['tool:right']);
  await skills.promoteRevision('code-review',right.digest,base.digest,'PROMOTE_SKILL_REVISION','CONFIRM_SKILL_SOURCE_CHANGE');
  await expect(skills.promoteRevision('code-review',left.digest,right.digest,'PROMOTE_SKILL_REVISION','CONFIRM_SKILL_SOURCE_CHANGE')).rejects.toThrow('SKILL_REVISION_BASELINE_CONFLICT');
  expect((await skills.inspect('code-review')).digest).toBe(right.digest);
  expect((await skills.listRevisions('code-review')).staged.map(s=>s.digest)).toContain(left.digest);
  await expect(skills.stageRevision(path.join(root,'left'),['tool:retry'])).rejects.toThrow('SKILL_REVISION_BASELINE_CONFLICT');
});
it('does not silently discard resources when building a Skill proposal revision',async()=>{
  const {root,skills,learning}=await fixture();await writeSkill(path.join(root,'original'),'Read all constraints.',true);
  const active=await skills.import(path.join(root,'original'));
  const proposal=await learning.upsertSkillProposal(proposalInput());
  const decision={workspace:'agent-core',proposalId:proposal.id,expectedProposalDigest:proposal.revisionDigest,decision:'approve',scope:'build-and-activate',sessionId:'session-a',taskId:'approval',userEvidenceRef:'user-message:approval'};
  const build={...decision,scope:'build',userEvidenceRef:'user-message:build-only'};
  await learning.recordUserSkillDecision(build);
  const built=await learning.decideSkillProposal(build);
  expect(built.artifactStatus).toBe('validated');
  expect((await skills.inspect('code-review')).digest).toBe(active.digest);
  expect(await readFile(path.join(built.artifactPath,'reference.txt'),'utf8')).toBe('Keep the important constraints.');
  await learning.recordUserSkillDecision(decision);
  const result=await learning.decideSkillProposal(decision);
  expect((await skills.inspect('code-review')).digest).not.toBe(active.digest);
  expect((await skills.inspect('code-review'))).toMatchObject({fileCount:2,license:'Apache-2.0'});
  expect(await readFile(path.join(root,'runtime/skills/catalog/code-review/reference.txt'),'utf8')).toBe('Keep the important constraints.');
  expect((await learning.skillProposals('agent-core'))[0].artifactStatus).toBe('catalog-active');
  expect((await skills.inspectBuiltProposal(result,result.decisions.at(-1))).artifactDigest).toBe(result.artifactDigest);
});
it('projects intentions at the bound controller context boundary without fabricating event observations',async()=>{
  const f=await memoryTaskFixture();extraRoots.push(f.root);
  const episode=await f.start('owner','transport','intentions-task');
  const session=f.memory.controller({taskId:episode.id,workspaceKey:'agent-core',controllerId:'agent-core-external',sessionId:'transport'});
  const header=await session.startEpisode({startKey:'intentions',goal:'Review the actual pending work',sourceRefs:[]});
  await session.appendEvent({episodeId:header.id,expectedRevision:header.revision,operationId:'pending',event:{kind:'observation',summary:'Explicit review intentions',sourceRefs:[],stateChanges:[
    intentionUpsert('due-review',{summary:'Review pending item',cue:{kind:'at-or-after',instant:'2020-01-01T00:00:00Z'}},[]),
    intentionUpsert('event-review',{summary:'Review real build output',cue:{kind:'observed-event',key:'build.finished'}},[]),
  ]}});
  const before=await session.getTaskContext();
  const result:any=await boundContext(f.external);
  expect(result.memoryTaskContext.data.intentionEvaluation).toMatchObject({advisory:true,items:expect.arrayContaining([{itemId:'due-review',status:'eligible'},{itemId:'event-review',status:'waiting'}])});
  expect((await session.getTaskContext()).data?.episodeRef).toEqual(before.data?.episodeRef);
  expect(result.intentionAttention).toMatchObject({status:'available',itemIds:['due-review'],advisory:true});
  const repeated:any=await boundContext(f.external);
  expect(repeated.intentionAttention.itemIds).toEqual([]);
  expect(repeated.memoryTaskContext.data.intentionEvaluation.items).toContainEqual({itemId:'due-review',status:'eligible'});
  const reopened=await ExternalControllerLearningService.initialize({stateDir:path.join(f.root,'external'),memory:f.memory as any,learning:f.learning});
  expect((await boundContext(reopened) as any).intentionAttention.itemIds).toEqual([]);
  const current=await session.getTaskContext();
  await session.appendEvent({episodeId:header.id,expectedRevision:current.data!.episode!.revision,operationId:'defer',event:{kind:'correction',summary:'Explicitly defer the review',sourceRefs:[],stateChanges:[intentionUpsert('due-review',{summary:'Review pending item later',cue:{kind:'at-or-after',instant:'2099-01-01T00:00:00Z'}},[])]}});
  const deferred:any=await boundContext(reopened);
  expect(deferred.intentionAttention.itemIds).toEqual([]);
  expect(deferred.memoryTaskContext.data.intentionEvaluation.items).toContainEqual({itemId:'due-review',status:'waiting'});
  const unbound=await f.external.startEpisode('unbound',{taskKey:'unbound',workspace:'agent-core'});
  expect(unbound.memoryBinding).toBeUndefined();
  expect((await f.external.context('unbound') as any).memoryTaskContext).toMatchObject({status:'unavailable',advisory:true});
});
