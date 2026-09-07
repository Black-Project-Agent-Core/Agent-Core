import { describe, expect, it } from 'vitest';
import { SUBAGENTCORE_LEADER, getSubAgentCoreTeam, workerById } from '../src/subagentcore/team.js';
import { buildWorkerSystemPrompt, parseWorkerEnvelope } from '../src/subagentcore/prompt.js';

describe('SubAgentCore leader-owned team contract', () => {
  it('keeps exactly one leader and four named workers with bounded roles, goals, and tool policies', () => {
    const team = getSubAgentCoreTeam();
    expect(SUBAGENTCORE_LEADER).toMatchObject({ id: 'joe-lead', authority: 'leader-only' });
    expect(team.map((worker) => worker.id)).toEqual(['astra', 'forge', 'sentinel', 'scribe']);
    for (const worker of team) {
      expect(worker.name.length).toBeGreaterThan(2);
      expect(worker.role.length).toBeGreaterThan(8);
      expect(worker.goal.length).toBeGreaterThan(12);
      expect(worker.allowedTools.length).toBeGreaterThan(0);
      expect(worker.authority).toBe('worker');
      expect(worker.allowedTools).not.toContain('subagentcore_dispatch');
      expect(worker.allowedTools).not.toContain('memory_commit');
      expect(worker.allowedTools).not.toContain('memory_revise');
    }
    expect(workerById('forge')?.role).toMatch(/implementation/i);
  });

  it('renders the leader contract and shared-memory requirement into every worker prompt', () => {
    const prompt = buildWorkerSystemPrompt(workerById('astra')!, {
      leaderName: SUBAGENTCORE_LEADER.name,
      sharedMemoryContext: ['project decision: reuse internal tools first'],
    });
    expect(prompt).toContain('JOE');
    expect(prompt).toContain('sole leader');
    expect(prompt).toContain('shared Agent Core memory');
    expect(prompt).toContain('reuse internal tools first');
    expect(prompt).toContain('leader work pattern');
    expect(prompt).toContain('Never redefine the leader workflow');
    expect(prompt).toContain('leader works in parallel');
    expect(prompt).toContain('memoryHandoff');
  });

  it('accepts a bounded JSON worker envelope and rejects unstructured output', () => {
    expect(parseWorkerEnvelope(JSON.stringify({
      summary: 'Mapped the module boundary',
      findings: ['existing MemoryService is reusable'],
      proposedActions: ['reuse MemoryService'],
      toolRequests: [],
      memoryHandoff: { facts: ['MemoryService is shared'], decisions: [], failures: [], nextStep: 'Add tests' },
    }))).toMatchObject({ summary: 'Mapped the module boundary' });
    expect(() => parseWorkerEnvelope('plain prose')).toThrow(/WORKER_ENVELOPE_INVALID/);
  });
});

