import { describe, expect, it } from 'vitest';
import { fixture, proposalInput } from './skill-proposal-fixture.js';
describe('grounded self-awareness (P4)', () => {
  it('separates proposed from catalog-active and does not invent connected tools', async () => {
    const { learning } = await fixture(); await learning.upsertSkillProposal(proposalInput());
    expect(learning.selfAwareness).toBeTypeOf('function');
    const view = await learning.selfAwareness('agent-core', 'capabilities');
    expect(view.proposals[0]).toMatchObject({ name: 'code-review', status: 'proposed' });
    expect(view.skills).toHaveLength(0); expect(view.executionAuthority).toBe(false);
    expect(view.omissions).toContain('Per-tool connection and task effectiveness are not established by catalog availability.');
    expect(view.observedAt).toMatch(/^20/);
  });
  it('reports drift as stale instead of treating a proposal as active', async () => {
    const { learning } = await fixture(); const p = await learning.upsertSkillProposal(proposalInput());
    const { writeFile } = await import('node:fs/promises'); await writeFile(p.path, 'user change');
    expect(learning.selfAwareness).toBeTypeOf('function');
    expect((await learning.selfAwareness('agent-core', 'capabilities')).proposals[0].evidenceStatus).toBe('stale');
  });
});
