import { describe, expect, it, vi } from 'vitest';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fixture, proposalInput, nativeChatFixture } from './skill-proposal-fixture.js';
const decision = (p: any, overrides: any = {}) => ({ workspace: 'agent-core', proposalId: p.id, expectedProposalDigest: p.revisionDigest,
  decision: 'approve', scope: 'build-and-activate', sessionId: 'session-a', taskId: 'user-task', userEvidenceRef: 'user-message:msg-one', ...overrides });
describe('user-governed Skill activation (P3)', () => {
  it('refuses model-declared consent without a trusted user decision', async () => {
    const { learning, skills } = await fixture(); const p = await learning.upsertSkillProposal(proposalInput());
    expect(learning.decideSkillProposal).toBeTypeOf('function');
    await expect(learning.decideSkillProposal(decision(p))).rejects.toThrow(/USER_EVIDENCE/);
    expect(await skills.list()).toHaveLength(0);
  });
  it('trusted creation approval builds but does not activate; explicit activation creates the native artifact', async () => {
    const { learning, skills } = await fixture(); const p = await learning.upsertSkillProposal(proposalInput());
    expect(learning.recordUserSkillDecision).toBeTypeOf('function');
    const build = decision(p, { scope: 'build' }); await learning.recordUserSkillDecision(build);
    const staged = await learning.decideSkillProposal(build);
    expect(staged.artifactStatus).toBe('validated'); expect(await skills.list()).toHaveLength(0);
    await expect(skills.import(staged.artifactPath)).rejects.toThrow(/PROPOSAL_APPROVAL/);
    const activate = decision(p, { userEvidenceRef: 'user-message:msg-two' });
    await learning.recordUserSkillDecision(activate); const active = await learning.decideSkillProposal(activate);
    expect(active.artifactStatus).toBe('catalog-active'); expect((await skills.list()).map(s => s.name)).toEqual(['code-review']);
    expect((await learning.decideSkillProposal(activate)).artifactDigest).toBe(active.artifactDigest);
    expect((await skills.inspect('code-review')).allowedTools).toEqual(['read_file']);
  });
  it('reject and later persist across restart without repeated reminders', async () => {
    const { learning, reopen } = await fixture(); const p = await learning.upsertSkillProposal(proposalInput());
    expect(learning.recordUserSkillDecision).toBeTypeOf('function');
    await learning.recordUserSkillDecision(decision(p, { decision: 'defer', scope: 'build' }));
    const next = await reopen(); expect((await next.skillProposals('agent-core'))[0].status).toBe('deferred');
    expect(await next.pendingSkillNotices({ workspace: 'agent-core', sessionId: 'new' })).toHaveLength(0);
  });
  it('scope and revision changes invalidate old consent', async () => {
    const { learning } = await fixture(); const p = await learning.upsertSkillProposal(proposalInput());
    expect(learning.recordUserSkillDecision).toBeTypeOf('function'); await learning.recordUserSkillDecision(decision(p));
    const next = await learning.upsertSkillProposal(proposalInput({ expectedProposalDigest: p.revisionDigest, steps: ['Read code', 'Check new constraints'] }));
    await expect(learning.decideSkillProposal(decision(p))).rejects.toThrow(/REVISION/);
    await expect(learning.decideSkillProposal(decision(next))).rejects.toThrow(/USER_EVIDENCE/);
    await expect(learning.decideSkillProposal(decision(next, { workspace: 'other' }))).rejects.toThrow(/WORKSPACE/);
  });
  it('changed files cannot be activated with a previous valid decision', async () => {
    const { learning, skills } = await fixture(); const p = await learning.upsertSkillProposal(proposalInput());
    expect(learning.recordUserSkillDecision).toBeTypeOf('function'); await learning.recordUserSkillDecision(decision(p));
    await writeFile(p.path, 'tampered'); await expect(learning.decideSkillProposal(decision(p))).rejects.toThrow(/DRIFT/);
    expect(await skills.list()).toHaveLength(0);
  });
});

it('the actual Native user message can approve an exact proposal revision', async () => {
  const f = await nativeChatFixture();
  try {
    const p = await f.learning.upsertSkillProposal(proposalInput());
    await f.chat.runTurn({ conversationId: f.conversation.id, clientRequestId: 'decision-one', prompt: 'buat dan aktifkan code-review ' + p.revisionDigest });
    expect((await f.skills.list()).map(s => s.name)).toEqual(['code-review']);
    const record = (await f.learning.skillProposals('agent-core'))[0];
    expect(record.decisions[0].userEvidenceRef).toMatch(/^user-message:/);
    expect(f.requests).toHaveLength(0); // The trusted decision completes without another model interpreting consent.
  } finally { await f.close(); }
});

it('a replay after activation is not a new revision or a new reminder', async () => {
  const { learning, skills } = await fixture(); const p = await learning.upsertSkillProposal(proposalInput());
  const approval = decision(p); await learning.recordUserSkillDecision(approval); await learning.decideSkillProposal(approval);
  const replay = await learning.upsertSkillProposal(proposalInput());
  expect(replay.revisionDigest).toBe(p.revisionDigest); expect(replay.artifactStatus).toBe('catalog-active');
  expect(await learning.pendingSkillNotices({ workspace: 'agent-core', sessionId: 'later' })).toHaveLength(0);
  expect(await skills.list()).toHaveLength(1);
});

it('reconciles an already active explicitly authored artifact and retires its reminder', async () => {
  const { root, learning, skills } = await fixture();
  const p = await learning.upsertSkillProposal(proposalInput());
  const source = path.join(root, 'explicit-code-review');
  await mkdir(source, { recursive: true });
  await writeFile(path.join(source, 'SKILL.md'), [
    '---',
    'name: code-review',
    'description: "Review code changes against exact source."',
    'allowed-tools: ["read_file"]',
    'metadata:',
    '  authored-by: "explicit-user-request"',
    '  origin-proposal-id: "' + p.id + '"',
    '  origin-proposal-revision: "' + p.revisionDigest + '"',
    '---',
    '',
    '# code-review',
    '',
    'Explicitly authored from the already-approved proposal context.',
    '',
  ].join('\n'));
  const imported = await skills.import(source);
  expect(imported.status).toBe('imported');
  expect(await learning.pendingSkillNotices({ workspace: 'agent-core', sessionId: 'later' })).toHaveLength(0);
  const record = (await learning.skillProposals('agent-core'))[0];
  expect(record.status).toBe('implemented');
  expect(record.artifactStatus).toBe('catalog-active');
  expect(record.artifactDigest).toBe(imported.digest);
  expect(record.fulfillment).toEqual(expect.objectContaining({
    revisionDigest: p.revisionDigest,
    kind: 'active-artifact-reconciliation',
    artifactDigest: imported.digest,
  }));
  const projected = await readFile(p.path, 'utf8');
  expect(projected).toContain('Status: implemented');
  expect(projected).toContain('Artifact: catalog-active');
  expect(projected).toContain('Pemenuhan proposal');
});
it('explicit user approval does not require a model request', async () => {
  const f = await nativeChatFixture();
  try {
    const p = await f.learning.upsertSkillProposal(proposalInput());
    const result = await f.chat.runTurn({ conversationId: f.conversation.id, clientRequestId: 'host-only-decision', prompt: 'buat dan aktifkan code-review ' + p.revisionDigest });
    expect(f.requests).toHaveLength(0); expect(result.response).toContain('catalog-active');
    expect(result.jobVerification).not.toBe('pass');
  } finally { await f.close(); }
});

it('recovers decision metadata after projection succeeds but state persistence fails', async () => {
  const { learning } = await fixture(); const p = await learning.upsertSkillProposal(proposalInput());
  const { LearningStateStore } = await import('../src/learning/state.js');
  const save = vi.spyOn(LearningStateStore.prototype, 'save').mockRejectedValueOnce(new Error('INJECTED_STATE_WRITE_FAILURE'));
  try {
    await expect(learning.recordUserSkillDecision(decision(p))).rejects.toThrow('INJECTED_STATE_WRITE_FAILURE');
    await expect(learning.recordUserSkillDecision(decision(p))).resolves.toMatchObject({ status: 'approved' });
  } finally { save.mockRestore(); }
});
it('recovers an already activated exact artifact without importing it twice', async () => {
  const { learning, skills } = await fixture(); const p = await learning.upsertSkillProposal(proposalInput());
  await learning.recordUserSkillDecision(decision(p));
  const { LearningStateStore } = await import('../src/learning/state.js');
  const save = vi.spyOn(LearningStateStore.prototype, 'save').mockRejectedValueOnce(new Error('INJECTED_STATE_WRITE_FAILURE'));
  try {
    await expect(learning.decideSkillProposal(decision(p))).rejects.toThrow('INJECTED_STATE_WRITE_FAILURE');
    expect(await skills.list()).toHaveLength(1);
    await expect(learning.decideSkillProposal(decision(p))).resolves.toMatchObject({ artifactStatus: 'catalog-active' });
    expect(await skills.list()).toHaveLength(1);
  } finally { save.mockRestore(); }
});
it('user-approved revision uses native history and remains explicitly rollbackable', async () => {
  const { learning, skills } = await fixture(); const p = await learning.upsertSkillProposal(proposalInput());
  await learning.recordUserSkillDecision(decision(p)); const first = await learning.decideSkillProposal(decision(p));
  const revision = await learning.upsertSkillProposal(proposalInput({ expectedProposalDigest: p.revisionDigest, taskId: 'second', steps: ['Read source', 'Inspect public contracts', 'Report evidence'] }));
  expect(revision.action).toBe('revise');
  const approve = decision(revision, { userEvidenceRef: 'user-message:revision' });
  await learning.recordUserSkillDecision(approve); const next = await learning.decideSkillProposal(approve);
  expect(next.artifactDigest).not.toBe(first.artifactDigest);
  await skills.rollbackRevision('code-review', first.artifactDigest, next.artifactDigest, 'ROLLBACK_SKILL_REVISION');
  expect((await skills.inspect('code-review')).digest).toBe(first.artifactDigest);
});

it('ordinary create requests are not mistaken for Skill decisions', async () => {
  const { learning, skills } = await fixture();
  await expect(learning.applyUserSkillCommand({ workspace: 'agent-core', sessionId: 'session-a', taskId: 'ordinary',
    userEvidenceRef: 'user-message:ordinary', prompt: 'buat ringkasan' })).resolves.toBeNull();
  expect(await skills.list()).toHaveLength(0);
});
it('ordinary requests continue when the optional Skill owner is unavailable', async () => {
  const { learning } = await fixture();
  const { LearningService } = await import('../src/learning/service.js');
  const bare: any = Object.create(LearningService.prototype);
  await expect(bare.applyUserSkillCommand({ workspace: 'agent-core', sessionId: 'session-a', taskId: 'ordinary',
    userEvidenceRef: 'user-message:ordinary', prompt: 'buat ringkasan' })).resolves.toBeNull();
  await expect(bare.applyUserSkillCommand({ workspace: 'agent-core', sessionId: 'session-a', taskId: 'explicit',
    userEvidenceRef: 'user-message:explicit', prompt: '/skill approve code-review' })).rejects.toThrow(/UNAVAILABLE/);
});
