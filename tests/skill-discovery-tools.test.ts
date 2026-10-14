import { describe, expect, it, vi } from 'vitest';
import { skills } from '../src/mcp/skills-schemas.js';
import { controllerLearning } from '../src/mcp/controller-learning-schemas.js';
import { registerSkillsTools } from '../src/mcp/skills-tools.js';
import { registerControllerLearningTools } from '../src/mcp/controller-learning-tools.js';
import { inspectedSkillArtifacts, toolCapabilityUse } from '../src/capability-awareness.js';
import { AGENT_CAPABILITY_CATALOG } from '../src/agent-capability-catalog.js';

vi.mock('../src/tracker/activity-tracker.js', () => ({ activityTracker: {
  record: vi.fn(), captureFailure: vi.fn(),
} }));
const digest = 'sha256:' + 'a'.repeat(64);
const hit = { name: 'source-review', description: 'Read code', digest, allowedTools: ['read_file'],
  triggers: ['review'], nonTriggers: ['deploy'], applicability: 'declared', descriptorTruncated: false,
  rank: 1, channels: ['lexical'], lexicalScore: 1, scoreKind: 'rank-fusion', executionAuthority: false };
const search = { version: 1, requestedMode: 'lexical', effectiveMode: 'lexical', hits: [hit],
  catalog: { scanned: 1, valid: 1, invalid: 0, omitted: 0, complete: true },
  semantic: { status: 'not-requested' }, truncated: false };
const read = { name: hit.name, digest, source: 'SKILL.md', content: '# Read the code', offset: 0,
  nextOffset: null, totalContentBytes: 15, truncated: false, delivery: 'instruction-fragment', executionAuthority: false };
function facade() {
  const tools = new Map<string, { config: any; call: (args: any, ctx?: any) => Promise<any> }>();
  return { tools, server: { registerTool(name: string, config: any, call: any) { tools.set(name, { config, call }); } } as any };
}

describe('Skill discovery MCP surface', () => {
  it('validates search and revision-bound read fields by action', () => {
    expect(skills.safeParse({ action: 'search', query: 'review', limit: 8, searchMode: 'hybrid' }).success).toBe(true);
    expect(skills.safeParse({ action: 'read', name: hit.name, expectedActiveDigest: digest, offset: 0, maxBytes: 512 }).success).toBe(true);
    for (const input of [
      { action: 'search' }, { action: 'search', query: '   ' }, { action: 'search', query: 'a'.repeat(4001) },
      { action: 'search', query: 'review', limit: 9 }, { action: 'search', query: 'review', offset: 0 },
      { action: 'list', query: 'review' }, { action: 'inspect', name: hit.name, limit: 1 },
      { action: 'status', searchMode: 'hybrid' }, { action: 'read', name: hit.name },
      { action: 'read', name: hit.name, expectedActiveDigest: digest, offset: -1 },
      { action: 'read', name: hit.name, expectedActiveDigest: digest, maxBytes: 511 },
      { action: 'read', name: hit.name, expectedActiveDigest: digest, searchMode: 'lexical' },
      { action: 'list', maxBytes: 512 },
    ]) expect(skills.safeParse(input).success, JSON.stringify(input)).toBe(false);
    expect(skills.safeParse({ action: 'promote_revision', name: hit.name, candidateDigest: digest,
      expectedActiveDigest: digest, confirmation: 'PROMOTE_SKILL_REVISION' }).success).toBe(true);
  });

  it('requires explicit query-bearing context for hybrid and rejects mode on other actions', () => {
    expect(controllerLearning.safeParse({ action: 'context', query: 'review', skillSearchMode: 'hybrid' }).success).toBe(true);
    expect(controllerLearning.safeParse({ action: 'context', skillSearchMode: 'lexical' }).success).toBe(true);
    for (const input of [{ action: 'status', skillSearchMode: 'lexical' }, { action: 'context', skillSearchMode: 'hybrid' },
      { action: 'context', query: '   ', skillSearchMode: 'hybrid' }]) {
      expect(controllerLearning.safeParse(input).success).toBe(false);
    }
  });

  it('returns only compact search/read envelopes, forwards SDK cancellation and records read-only outcomes', async () => {
    const f = facade();
    const received: any[] = [], outcomes: any[] = [];
    const owner = { discover: async (input: any) => { received.push(input); return { artifacts: ['internal-only'], search }; },
      read: async (name: string, input: any) => { received.push({ name, ...input }); return read; } };
    registerSkillsTools(f.server, owner as any, { recordToolOutcome: async (input: any) => outcomes.push(input) } as any, 'task');
    const tool = f.tools.get('skills')!;
    const signal = new AbortController().signal;
    const searched = await tool.call({ action: 'search', query: 'review', limit: 2, searchMode: 'hybrid' }, { mcpReq: { signal } });
    expect(searched.content[0].text).toBe(JSON.stringify(search));
    expect(received[0]).toEqual({ query: 'review', limit: 2, mode: 'hybrid', signal });
    const fragment = await tool.call({ action: 'read', name: hit.name, expectedActiveDigest: digest, offset: 0, maxBytes: 512 });
    expect(fragment.content[0].text).toBe(JSON.stringify(read));
    expect(received[1]).toEqual({ name: hit.name, expectedActiveDigest: digest, offset: 0, maxBytes: 512 });
    expect(outcomes.map(item => item.readOnly)).toEqual([true, true]);
    expect(tool.config.annotations.readOnlyHint).toBe(false);
  });

  it('forwards explicit context mode and signal without adding a default hybrid request', async () => {
    const f = facade(), received: any[] = [];
    registerControllerLearningTools(f.server, { context: async (_session: string, input: any) => { received.push(input); return {}; } } as any, 'task');
    const signal = new AbortController().signal;
    await f.tools.get('controller_learning')!.call({ action: 'context', query: 'review', skillSearchMode: 'hybrid' }, { mcpReq: { signal } });
    await f.tools.get('controller_learning')!.call({ action: 'context', query: 'review' });
    expect(received[0]).toEqual({ query: 'review', skillSearchMode: 'hybrid', signal });
    expect(received[1]).toEqual({ query: 'review' });
    expect(f.tools.get('controller_learning')!.config.description).not.toContain('never invokes a model/provider');
  });

  it('retains read-only outcome classification on stale revision failures', async () => {
    const f = facade(), outcomes: any[] = [];
    registerSkillsTools(f.server, { read: async () => { throw new Error('SKILL_ACTIVE_REVISION_CHANGED'); } } as any,
      { failureContext: async () => ({ capsule: '' }), recordToolOutcome: async (input: any) => outcomes.push(input) } as any, 'task');
    const result = await f.tools.get('skills')!.call({ action: 'read', name: hit.name, expectedActiveDigest: digest });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('SKILL_ACTIVE_REVISION_CHANGED');
    expect(outcomes[0]).toMatchObject({ outcome: 'handled-failure', readOnly: true });
  });

  it('keeps discovery in the existing read-only capability family without adding grants or material use', () => {
    const family = AGENT_CAPABILITY_CATALOG.find(item => item.family === 'skills.inspect')!;
    expect(family.tools.find(tool => tool.name === 'skills')?.restriction?.allowedActions).toEqual(expect.arrayContaining(['search', 'read']));
    expect(toolCapabilityUse('skills', { action: 'search' }, true, 'tool:search')).toBeNull();
    expect(toolCapabilityUse('skills', { action: 'read' }, true, 'tool:read')).toBeNull();
  });
});

describe('typed Skill delivery parsing', () => {
  it('accepts emitted search/read identities alongside legacy list and inspect', () => {
    for (const value of [search, read, [hit], hit]) {
      expect(inspectedSkillArtifacts(JSON.stringify(value))).toEqual([{ name: hit.name, digest }]);
    }
  });
  it('rejects malformed delivery envelopes and does not treat arbitrary hit arrays as deliveries', () => {
    for (const value of [{ hits: [hit] }, { ...search, version: 2 },
      { ...search, hits: [{ ...hit, executionAuthority: true }] },
      { ...search, hits: [{ ...hit, scoreKind: 'confidence' }] },
      { ...read, delivery: 'complete-execution' }, { ...read, executionAuthority: true },
      { ...read, source: 'other.md' }]) expect(inspectedSkillArtifacts(JSON.stringify(value))).toEqual([]);
  });
});
