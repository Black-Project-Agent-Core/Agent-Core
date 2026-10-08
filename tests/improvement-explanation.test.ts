import { describe, expect, it } from 'vitest';
import { fixture, proposalInput } from './skill-proposal-fixture.js';
describe('evidence-bound improvement explanations (P5)', () => {
  it('distinguishes expected benefit, actual evidence and missing proof', async () => {
    const { learning } = await fixture(); const p = await learning.upsertSkillProposal(proposalInput());
    expect(learning.explainImprovement).toBeTypeOf('function');
    const why = await learning.explainImprovement({ workspace: 'agent-core', proposalId: p.id });
    expect(why.expectedBenefit).toBe(p.input.expectedBenefit); expect(why.measuredImprovement).toBe('unavailable');
    expect(why.evidence[0].status).toBe('unavailable'); expect(why.missingLinks.length).toBeGreaterThan(0);
    expect(why.delivery).not.toBe('confirmed');
  });
  it('refuses wrong workspace or a nonexistent revision rather than inventing reasons', async () => {
    const { learning } = await fixture(); const p = await learning.upsertSkillProposal(proposalInput());
    expect(learning.explainImprovement).toBeTypeOf('function');
    await expect(learning.explainImprovement({ workspace: 'agent-core', proposalId: p.id, revisionDigest: 'sha256:' + '0'.repeat(64) })).rejects.toThrow(/REVISION/);
  });
});

it('a notice on an older revision does not prove the current proposal was included', async () => {
  const { learning } = await fixture(); const p = await learning.upsertSkillProposal(proposalInput());
  await learning.recordSkillNoticeDelivery({ workspace: 'agent-core', sessionId: 'session-a', proposalId: p.id,
    revisionDigest: p.revisionDigest, status: 'included-in-response' });
  const next = await learning.upsertSkillProposal(proposalInput({ expectedProposalDigest: p.revisionDigest,
    steps: ['Read source', 'Inspect changed contracts', 'Report supported findings'] }));
  const why = await learning.explainImprovement({ workspace: 'agent-core', proposalId: next.id });
  expect(why.delivery).toBe('pending'); expect(why.missingLinks).toContain('user-decision');
});
it('changed verification bytes invalidate current support in the explanation', async () => {
  const { learning, root } = await fixture();
  const { report } = await import('./skill-proposal-fixture.js');
  const { writeFile } = await import('node:fs/promises');
  const path = await import('node:path');
  for (const taskId of ['proof-one', 'proof-two']) {
    const ref = await report(root, taskId);
    await learning.supportProcedure({ taskId, origin: 'external', workspace: 'agent-core', name: 'code-review',
      description: 'Review exact source.', steps: ['Read source', 'Report evidence'], reuseCondition: 'When reviewing code.',
      allowedTools: ['read_file'], evidenceRefs: [ref], outcome: 'verified' });
  }
  const p = (await learning.skillProposals('agent-core'))[0];
  await writeFile(path.join(root, 'proof-one-answer.js'), 'n => n * 9');
  const why = await learning.explainImprovement({ workspace: 'agent-core', proposalId: p.id });
  expect(why.independentlyVerifiedSupport).not.toContain('proof-one');
  expect(why.independentlyVerifiedSupport).toContain('proof-two');
});
