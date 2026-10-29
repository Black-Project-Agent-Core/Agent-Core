import { expect, test, vi } from 'vitest';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fixture, proposalInput } from './skill-proposal-fixture.js';
import { runSkillProposalAction } from '../src/mcp/skill-proposal-actions.js';
import { skills as skillsSchema } from '../src/mcp/skills-schemas.js';

test('trusted controller approval is host-bound, scoped, revocable and distinctly audited; Native proof remains separate', async () => {
  const f = await fixture();
  const p = await f.learning.upsertSkillProposal(proposalInput());
  const authorize = vi.fn(async () => true);
  const resolveMemoryTask = vi.fn(async (owner: string, taskId: string) => {
    if (owner !== 'verified-controller' || taskId !== 'external-task') throw new Error('foreign task');
    return { taskId, workspaceKey: 'agent-core' };
  });
  const context: any = { learning: f.learning, sessionId: 'external-session',
    external: { getEpisode: async () => ({ id: 'external-task', workspace: 'agent-core' }), resolveMemoryTask },
    proposalApprover: { principalId: 'verified-controller', authorize } };
  const input: any = { action: 'decide_proposal', proposalId: p.id, proposalDigest: p.revisionDigest,
    decision: 'approve', decisionScope: 'build-and-activate', confirmation: 'APPROVE_SKILL_PROPOSAL' };
  expect(skillsSchema.safeParse(input).success).toBe(true);
  for (const invalid of [{ ...input, confirmation: undefined }, { ...input, userEvidenceRef: 'user-message:fake' },
    { ...input, userEvidenceRef: 'controller-decision:' + 'a'.repeat(64) }, { ...input, decision: 'reject' }]) {
    expect(skillsSchema.safeParse(invalid).success).toBe(false);
  }
  for (const invalidContext of [{ ...context, proposalApprover: undefined }, { ...context, nativeTaskId: 'native' },
    { ...context, external: { ...context.external, getEpisode: async () => null } },
    { ...context, proposalApprover: { principalId: 'forged', authorize } }]) {
    await expect(runSkillProposalAction(input, invalidContext)).rejects.toThrow();
  }
  await expect(runSkillProposalAction({ ...input, workspace: 'foreign' }, context)).rejects.toThrow(/NOT_AUTHORIZED/);
  authorize.mockResolvedValue(false);
  await expect(runSkillProposalAction(input, context)).rejects.toThrow(/NOT_AUTHORIZED/);
  expect((await f.learning.skillProposals())[0].decisions).toHaveLength(0);
  authorize.mockResolvedValue(true);
  const approved: any = await runSkillProposalAction(input, context);
  expect(approved.artifactStatus).toBe('catalog-active');
  expect(approved.status).toBe('approved');
  expect(approved.decisions[0]).toMatchObject({ controllerId: 'verified-controller', taskId: 'external-task' });
  expect(approved.decisions[0].userEvidenceRef).toMatch(/^controller-decision:[a-f0-9]{64}$/);
  expect(await readFile(approved.path, 'utf8')).toContain('trusted-controller: verified-controller');
  await expect(f.learning.recordUserSkillDecision({ workspace: 'agent-core', proposalId: p.id, expectedProposalDigest: p.revisionDigest,
    ...approved.decisions[0] } as any)).rejects.toThrow(/USER_EVIDENCE_INVALID/);
  expect((await runSkillProposalAction(input, context)).artifactDigest).toBe(approved.artifactDigest);
  expect((await f.learning.skillProposals())[0].decisions).toHaveLength(1);
  authorize.mockResolvedValue(false);
  await expect(runSkillProposalAction(input, context)).rejects.toThrow(/NOT_AUTHORIZED/);
  authorize.mockResolvedValue(true);
  await f.learning.recordUserSkillDecision({ workspace: 'agent-core', proposalId: p.id, expectedProposalDigest: p.revisionDigest,
    decision: 'reject', scope: 'build-and-activate', userEvidenceRef: 'user-message:later-rejection', sessionId: 'human-session', taskId: 'human-task' });
  await expect(runSkillProposalAction(input, { ...context, sessionId: 'new-controller-session' })).rejects.toThrow(/APPROVAL_INACTIVE/);
  expect((await f.learning.skillProposals())[0].decisions.at(-1)?.decision).toBe('reject');
  await f.learning.upsertSkillProposal(proposalInput({ expectedProposalDigest: p.revisionDigest, purpose: 'Changed exact scope.' }));
  await expect(runSkillProposalAction(input, context)).rejects.toThrow(/REVISION/);
  expect((await f.skills.list())).toHaveLength(1);
});

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
