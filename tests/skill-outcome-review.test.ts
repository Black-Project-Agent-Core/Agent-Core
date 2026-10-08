import { describe, expect, it, vi } from 'vitest';
import { fixture, proposalInput, report } from './skill-proposal-fixture.js';
describe('outcome-driven Skill review (P6)', () => {
  it('does not infer poor quality or delete a rarely used skill', async () => {
    const { learning, skills } = await fixture(); await learning.upsertSkillProposal(proposalInput());
    expect(learning.reviewSkillOutcomes).toBeTypeOf('function');
    const result = await learning.reviewSkillOutcomes('agent-core');
    expect(result.executionAuthority).toBe(false); expect(result.recommendations).toHaveLength(0);
    expect(await skills.list()).toHaveLength(0);
  });
  it('unverified self-reported usage is not support for skill improvement', async () => {
    const { learning } = await fixture(); const p = await learning.upsertSkillProposal(proposalInput());
    expect(learning.recordSkillOutcome).toBeTypeOf('function');
    await expect(learning.recordSkillOutcome({ workspace: 'agent-core', skillName: p.name, taskId: 'invented',
      revisionDigest: p.revisionDigest, outcome: 'failure', applicability: 'applied', verificationRef: 'verification:invented', evidenceRefs: [] })).rejects.toThrow(/EVIDENCE|REVISION|ACTIVE/);
  });
});

it('verified negative use creates a review proposal, retains the active skill and deduplicates the task', async () => {
  const { learning, skills, root } = await fixture(); const p = await learning.upsertSkillProposal(proposalInput());
  const approval = { workspace: 'agent-core', proposalId: p.id, expectedProposalDigest: p.revisionDigest, decision: 'approve', scope: 'build-and-activate', sessionId: 'session-a', taskId: 'approval', userEvidenceRef: 'user-message:approval' };
  await learning.recordUserSkillDecision(approval); const activeProposal = await learning.decideSkillProposal(approval);
  const { activityTracker } = await import('../src/tracker/activity-tracker.js');
  const events: any[] = [];
  const recording = vi.spyOn(activityTracker, 'recordOutcome').mockImplementation((module, level, message, featureOutcome, kind, context) => {
    const event: any = { id: 'outcome-' + events.length, timestamp: new Date().toISOString(), module, level, message, featureOutcome, kind, context };
    events.push(event); return event;
  });
  const reading = vi.spyOn(activityTracker, 'readFeatureOutcomes').mockImplementation(() => events);
  try {
    const ref = await report(root, 'failed-skill-use', false);
    const { readFile } = await import('node:fs/promises'); const path = await import('node:path');
    const proof = JSON.parse(await readFile(path.join(root, 'failed-skill-use-report.json'), 'utf8'));
    const input = { workspace: 'agent-core', skillName: 'code-review', revisionDigest: activeProposal.artifactDigest, taskId: 'failed-skill-use',
      outcome: 'failure', applicability: 'adapted', verificationRef: ref, evidenceRefs: [ref], actionRefs: ['file:' + proof.answer.path + '#' + proof.answer.digest] };
    await learning.recordSkillOutcome(input); await learning.recordSkillOutcome(input);
    expect((await learning.skillProposals('agent-core'))[0]).toMatchObject({ action: 'revise', status: 'proposed', qualification: 'needs-review' });
    const result = await learning.reviewSkillOutcomes('agent-core');
    expect(result.recommendations[0]).toMatchObject({ action: 'review', negative: 1, positive: 0, proposalId: p.id });
    const revised = (await learning.skillProposals('agent-core'))[0];
    expect(revised).toMatchObject({ action: 'revise', qualification: 'needs-review', status: 'proposed' });
    expect((await skills.inspect('code-review')).digest).toBe(activeProposal.artifactDigest);
    const why = await learning.explainImprovement({ workspace: 'agent-core', proposalId: p.id });
    expect(why.laterUse[0]).toMatchObject({ taskId: 'failed-skill-use', outcome: 'failure', evidenceStatus: 'resolved' });
    expect(why.measuredImprovement).toBe('unavailable');
    await learning.recordUserSkillDecision({ ...approval, expectedProposalDigest: revised.revisionDigest, decision: 'defer', userEvidenceRef: 'user-message:later' });
    await learning.reviewSkillOutcomes('agent-core');
    expect((await learning.skillProposals('agent-core'))[0].status).toBe('deferred');
  } finally { recording.mockRestore(); reading.mockRestore(); }
});
