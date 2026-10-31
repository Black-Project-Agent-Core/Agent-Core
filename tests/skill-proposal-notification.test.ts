import { describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { fixture, proposalInput, nativeChatFixture } from './skill-proposal-fixture.js';

async function externalNoticeFixture(sessionId: string) {
  const f = await fixture();
  const { ExternalControllerLearningService } = await import('../src/learning/external-controller.js');
  const { createToolInvocationIdentity } = await import('../src/tracker/tool-invocation.js');
  const service = await ExternalControllerLearningService.initialize({ stateDir: f.root, memory: f.memory, learning: f.learning, skills: f.skills });
  const ownerId = randomUUID();
  const episode = await service.startEpisode(sessionId, { taskKey: 'notice-fixture', workspace: 'agent-core' }, {
    ownerId, workspaceIdentityKey: f.memory.registeredWorkspaceIdentity('agent-core').key,
  });
  const capture = async () => {
    const identity = createToolInvocationIdentity();
    const context = await service.captureToolInvocationContext({ ...identity, invocationId: identity.id, sessionId, ownerId });
    expect(context.binding).toBe('bound');
    return { identity, context };
  };
  return { ...f, service, episode, capture };
}

describe('in-session Skill proposal notices (P2)', () => {
  it('tool exposure stays pending until a user-facing response includes the notice', async () => {
    const { learning } = await fixture(); expect(learning.upsertSkillProposal).toBeTypeOf('function');
    const item = await learning.upsertSkillProposal(proposalInput());
    const scope = { workspace: 'agent-core', sessionId: 'session-a', taskId: 'task-one' };
    const notices = await learning.pendingSkillNotices(scope);
    expect(notices).toHaveLength(1); expect(notices[0].text).toContain('code-review');
    expect(notices[0].text).toContain(item.path); expect(notices[0].text).toContain('belum aktif');
    expect(await learning.pendingSkillNotices(scope)).toHaveLength(1);
    await learning.recordSkillNoticeDelivery({ ...scope, proposalId: item.id, revisionDigest: item.revisionDigest, status: 'included-in-response' });
    expect(await learning.pendingSkillNotices(scope)).toHaveLength(0);
    expect((await learning.skillProposals('agent-core'))[0].notices[0].status).toBe('included-in-response');
  });
  it('interruption preserves pending notice across reopen without pretending delivery', async () => {
    const { learning, reopen } = await fixture(); expect(learning.upsertSkillProposal).toBeTypeOf('function');
    await learning.upsertSkillProposal(proposalInput()); const next = await reopen();
    expect(await next.pendingSkillNotices({ workspace: 'agent-core', sessionId: 'resumed', query: 'code review' })).toHaveLength(1);
  });
  it('rejects forged delivery confirmation and avoids claiming a missing file exists', async () => {
    const { learning } = await fixture(); expect(learning.upsertSkillProposal).toBeTypeOf('function');
    const item = await learning.upsertSkillProposal(proposalInput());
    await expect(learning.recordSkillNoticeDelivery({ workspace: 'agent-core', sessionId: 'session-a', taskId: 'task-one', proposalId: item.id, revisionDigest: item.revisionDigest, status: 'delivery-confirmed' })).rejects.toThrow(/DELIVERY/);
    await writeFile(item.path, 'drift');
    expect(await learning.pendingSkillNotices({ workspace: 'agent-core', sessionId: 'session-a', taskId: 'task-one' })).toHaveLength(0);
  });
});

it('persists a Native user-facing reminder before recording inclusion', async () => {
  const f = await nativeChatFixture();
  try {
    const p = await f.learning.upsertSkillProposal(proposalInput());
    const result = await f.chat.runTurn({ conversationId: f.conversation.id, clientRequestId: 'notice-one', prompt: 'Please review code.' });
    expect(result.response).toContain('Task answer retained.'); expect(result.response).toContain(p.path);
    expect(f.chat.getConversation(f.conversation.id)?.messages.at(-1)?.content).toBe(result.response);
    const record = (await f.learning.skillProposals('agent-core'))[0];
    expect(record.notices).toHaveLength(1); expect(record.notices[0].delivery).toBe('unconfirmed');
    const replay = await f.chat.runTurn({ conversationId: f.conversation.id, clientRequestId: 'notice-one', prompt: 'Please review code.' });
    expect(replay.response).toBe(result.response); expect((await f.learning.skillProposals('agent-core'))[0].notices).toHaveLength(1);
  } finally { await f.close(); }
});
it('surfaces a reminder to an external controller without inventing delivery', async () => {
  const f = await externalNoticeFixture('external-one');
  const { beginExternalControllerToolCall, externalControllerToolResult } = await import('../src/mcp/external-controller-tool-support.js');
  const { withToolInvocationRequest } = await import('../src/tracker/tool-invocation.js');
  const p = await f.learning.upsertSkillProposal(proposalInput({ taskId: f.episode.id, sessionId: 'external-one' }));
  const { identity, context } = await f.capture();
  const result = await withToolInvocationRequest({ tool: 'skills', identity, invocationContext: context,
    mutationContext: { invocationId: identity.id, invocationContext: context, checkpointGranted: false, reportAutoCheckpoint() {} }, checkpointReceipt: () => undefined },
    () => externalControllerToolResult({ service: f.service, sessionId: 'external-one', call: beginExternalControllerToolCall('skills'),
      tool: 'skills', args: {}, result: { content: [{ type: 'text', text: 'main result' }] }, readOnly: true }));
  expect(JSON.stringify(result)).toContain('SKILL PROPOSAL REMINDER'); expect(JSON.stringify(result)).toContain(p.path.replaceAll('\\', '\\\\'));
  expect((await f.learning.skillProposals('agent-core'))[0].notices).toHaveLength(0);
});

it('controller contracts require same-session semantic proposals without granting activation', async () => {
  const { readFile } = await import('node:fs/promises');
  const contract = await readFile(new URL('../docs/instructions/skill-proposals.md', import.meta.url), 'utf8');
  expect(contract).toContain('Skill proposal and reminder protocol');
  expect(contract).toContain('code-review.md');
  expect(contract).toContain('same active session');
  const source = await readFile(new URL('../src/agent-controller.ts', import.meta.url), 'utf8');
  expect(source).toContain('Reusable procedures produce proposals, not automatic active Skills.');
});

it('does not truncate a reminder or mark an omitted proposal as exposed', async () => {
  const f = await externalNoticeFixture('session');
  const { appendSkillReminderCapsule } = await import('../src/mcp/external-controller-tool-support.js');
  const notices = ['first', 'second', 'third'].map(name => ({ proposalId: name, revisionDigest: 'revision-' + name,
    name, path: name + '.md', text: 'NOTICE-' + name + ': ' + 'x'.repeat(1850), status: 'proposed', qualification: 'awaiting-verification' }));
  // Only the notice payload is a fixture. Disclosure authority uses the real bound task/context.
  const noticeSpy = vi.spyOn(f.service, 'skillProposalNotices').mockResolvedValue(notices as any);
  const first = await appendSkillReminderCapsule({ content: [] }, f.service, 'session', undefined, (await f.capture()).context);
  const firstText = first.content.map(c => c.text ?? '').join('');
  expect(firstText).toContain(notices[0].text); expect(firstText).toContain(notices[1].text);
  expect(firstText).not.toContain('NOTICE-third');
  const second = await appendSkillReminderCapsule({ content: [] }, f.service, 'session', undefined, (await f.capture()).context);
  expect(second.content.map(c => c.text ?? '').join('')).toContain(notices[2].text);
  noticeSpy.mockRestore();
});

it('suppresses reminders with missing, foreign-session or copied non-host context', async () => {
  const f = await externalNoticeFixture('session');
  const { appendSkillReminderCapsule } = await import('../src/mcp/external-controller-tool-support.js');
  const { context } = await f.capture();
  const noticeSpy = vi.spyOn(f.service, 'skillProposalNotices');
  const main = { content: [{ type: 'text', text: 'main result' }] };
  expect(await appendSkillReminderCapsule(main, f.service, 'session')).toBe(main);
  expect(await appendSkillReminderCapsule(main, f.service, 'other-session', undefined, context)).toBe(main);
  expect(await appendSkillReminderCapsule(main, f.service, 'session', undefined, { ...context })).toBe(main);
  expect(noticeSpy).not.toHaveBeenCalled(); noticeSpy.mockRestore();
});
