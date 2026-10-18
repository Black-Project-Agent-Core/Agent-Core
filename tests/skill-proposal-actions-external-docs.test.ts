import { expect, test } from 'vitest';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fixture, proposalInput } from './skill-proposal-fixture.js';
import { runSkillProposalAction } from '../src/mcp/skill-proposal-actions.js';

test('external propose and exact revision publish readable docs without relocating canonical state', async () => {
  const f = await fixture();
  const context: any = { learning: f.learning, external: { getEpisode: async () => ({ id: 'external-task', workspace: 'agent-core' }) }, sessionId: 'external-session' };
  const first: any = await runSkillProposalAction({ action: 'propose', proposal: proposalInput() } as any, context);
  expect(first.path).toBe(path.join(f.root, 'docs/proposals/skills/agent-core/code-review.md'));
  const old = await readFile(first.path, 'utf8'); expect(old).toContain('Revisi: ' + first.revisionDigest);
  const second: any = await runSkillProposalAction({ action: 'propose', proposalDigest: first.revisionDigest,
    proposal: proposalInput({ purpose: 'Review code with explicit dependency scope.' }) } as any, context);
  expect(second.revisionDigest).not.toBe(first.revisionDigest);
  expect(await readFile(second.path, 'utf8')).toContain('Review code with explicit dependency scope.');
  const saved = (await f.learning.skillProposals())[0];
  expect(saved.path).toBe(path.join(f.root, 'runtime/skills/proposals/agent-core/code-review.md'));
  expect(saved.decisions).toEqual([]);
  const decision = { workspace: 'agent-core', proposalId: second.id, expectedProposalDigest: second.revisionDigest,
    decision: 'defer' as const, scope: 'build' as const, userEvidenceRef: 'user-message:actual-host-fixture', sessionId: 'user-session', taskId: 'user-task' };
  // Exercise only an existing host-recorded decision; the dashboard creates no proof.
  await f.learning.recordUserSkillDecision(decision);
  const deferred: any = await runSkillProposalAction({ action: 'decide_proposal', proposalId: second.id,
    proposalDigest: second.revisionDigest, decision: 'defer', decisionScope: 'build', userEvidenceRef: decision.userEvidenceRef } as any, context);
  expect(deferred.status).toBe('deferred');
  expect(await readFile(deferred.path, 'utf8')).toContain('Status: deferred');
  const document = (await f.learning.proposalDocuments().list()).items[0];
  expect(document).toMatchObject({ status: 'deferred', revisionDigest: second.revisionDigest, readStatus: 'available' });
  expect(document.documentDigest).not.toBe(second.documentDigest);
});

test('Native propose retains its existing runtime path and creates no docs mirror', async () => {
  const f = await fixture();
  const item: any = await runSkillProposalAction({ action: 'propose', proposal: proposalInput() } as any,
    { learning: f.learning, nativeTaskId: 'native-existing-task', nativeWorkspace: 'agent-core' } as any);
  expect(item.path).toBe(path.join(f.root, 'runtime/skills/proposals/agent-core/code-review.md'));
  await expect(readdir(path.join(f.root, 'docs/proposals/skills'))).rejects.toMatchObject({ code: 'ENOENT' });
});
test('external task publication selects only its existing proposals and reports drift separately from the committed proposal',async()=>{
  const f=await fixture();
  const own=await f.learning.upsertSkillProposal({...proposalInput(),taskId:'external-review-task'});
  await f.learning.upsertSkillProposal({...proposalInput({name:'other-review',purpose:'Other task independent proposal'}),taskId:'other-task'});
  const first=await f.learning.publishExternalTaskSkillProposals({workspace:'agent-core',taskId:'external-review-task'});
  expect(first.status).toBe('completed');expect(first.documents.map(item=>item.proposalId)).toEqual([own.id]);
  const {writeFile}=await import('node:fs/promises');await writeFile(first.documents[0].path,'# Human edited review\n');
  const partial=await f.learning.publishExternalTaskSkillProposals({workspace:'agent-core',taskId:'external-review-task'});
  expect(partial.status).toBe('partial');expect(partial.unavailable).toHaveLength(1);
  expect((await f.learning.skillProposals()).find(item=>item.id===own.id)?.revisionDigest).toBe(own.revisionDigest);
  expect(await readFile(first.documents[0].path,'utf8')).toContain('Human edited review');
});
