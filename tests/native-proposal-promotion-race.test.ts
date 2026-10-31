import { expect, it, vi } from 'vitest';
import { nativeChatFixture, proposalInput } from './skill-proposal-fixture.js';

it('keeps promotion without a typed digest compatible with an already delivered exact-revision notice', async () => {
  const f = await nativeChatFixture();
  try {
    const p = await f.learning.upsertSkillProposal(proposalInput());
    await f.learning.recordSkillNoticeDelivery({ workspace: 'agent-core', sessionId: f.conversation.runtimeSessionId,
      taskId: 'prior-presentation', proposalId: p.id, revisionDigest: p.revisionDigest, status: 'included-in-response' });
    await f.chat.runTurn({ conversationId: f.conversation.id, clientRequestId: 'noticed-promotion', prompt: 'Promote proposal Skill code-review.' });
    expect((await f.skills.list()).map(s => s.name)).toEqual(['code-review']);
    expect((await f.learning.skillProposals('agent-core'))[0].decisions[0].revisionDigest).toBe(p.revisionDigest);
    expect(f.requests).toHaveLength(0);
  } finally { await f.close(); }
});

it('does not promote a concurrent revision even when a newer notice appears before the host decision', async () => {
  const f = await nativeChatFixture();
  try {
    const p = await f.learning.upsertSkillProposal(proposalInput());
    await f.learning.recordSkillNoticeDelivery({ workspace: 'agent-core', sessionId: f.conversation.runtimeSessionId,
      taskId: 'prior-presentation', proposalId: p.id, revisionDigest: p.revisionDigest, status: 'included-in-response' });
    const apply = f.runtime.applyUserSkillCommand.bind(f.runtime);
    const race = vi.spyOn(f.runtime, 'applyUserSkillCommand').mockImplementationOnce(async input => {
      const next = await f.learning.upsertSkillProposal(proposalInput({ expectedProposalDigest: p.revisionDigest,
        taskId: 'concurrent-revision', steps: ['Read source', 'Add an expanded new review step'] }));
      expect(next.revisionDigest).not.toBe(p.revisionDigest);
      await f.learning.recordSkillNoticeDelivery({ workspace: 'agent-core', sessionId: f.conversation.runtimeSessionId,
        taskId: 'later-presentation', proposalId: next.id, revisionDigest: next.revisionDigest, status: 'included-in-response' });
      return apply(input);
    });
    try {
      await expect(f.chat.runTurn({ conversationId: f.conversation.id, clientRequestId: 'racing-promotion',
        prompt: 'Promote proposal Skill code-review.' })).rejects.toThrow('SKILL_PROPOSAL_BOUND_REVISION_CHANGED');
      expect(await f.skills.list()).toHaveLength(0);
      expect((await f.learning.skillProposals('agent-core'))[0].decisions).toHaveLength(0);
      expect(f.requests).toHaveLength(0);
    } finally { race.mockRestore(); }
  } finally { await f.close(); }
});
