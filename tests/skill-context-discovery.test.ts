import { describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { fixture } from './skill-proposal-fixture.js';
import { buildKnowledgeSynthesisPacket } from '../src/agent-knowledge-synthesis.js';
import { ExternalControllerLearningService } from '../src/learning/external-controller.js';
import type { SkillDiscoverySnapshot, SkillSearchHit } from '../src/skills/discovery.js';
import { createToolInvocationIdentity } from '../src/tracker/tool-invocation.js';

const digest = 'sha256:' + 'a'.repeat(64);
const summary = { name: 'locking-review', description: 'Database locking inspection', digest,
  allowedTools: ['read_file'], fileCount: 1, totalBytes: 500, license: 'MIT' };
function snapshot(overrides: Partial<SkillSearchHit> = {}): SkillDiscoverySnapshot {
  return { artifacts: [summary], search: { version: 1, requestedMode: 'hybrid', effectiveMode: 'hybrid',
    hits: [{ ...summary, triggers: ['Review contended transactions'], nonTriggers: ['Deploy database migrations'],
      applicability: 'declared', descriptorTruncated: false, rank: 1, channels: ['semantic'], lexicalScore: 0,
      semanticScore: 0.9, scoreKind: 'rank-fusion', executionAuthority: false, ...overrides }],
    catalog: { scanned: 1, valid: 1, invalid: 0, omitted: 0, complete: true },
    semantic: { providerAvailable: true, status: 'complete', embeddedDescriptors: 1, validDescriptors: 1,
      sentDescriptors: 1, queryTruncated: false, descriptorTruncated: 0 }, truncated: false } };
}

function packet(extra: Record<string, unknown> = {}) {
  return buildKnowledgeSynthesisPacket({ runtime: {}, memoryItems: [], procedures: [],
    task: { goal: 'diagnose concurrency', episodes: [] }, ...extra } as any);
}

describe('shared Skill discovery context', () => {
  it('preserves a supplied semantic-only selection and applicability without rescanning or reranking', async () => {
    const discover = vi.fn(), list = vi.fn();
    const result = await packet({ runtime: { skillsService: { discover, list } }, skillDiscovery: snapshot() });
    expect(result.skillNames).toEqual(['locking-review']);
    expect(result.artifactRevisions).toEqual({ 'skill:locking-review': digest });
    expect(result.text).toContain('Review contended transactions');
    expect(result.text).toContain('Deploy database migrations');
    expect(result.text).toContain('metadata');
    expect(discover).not.toHaveBeenCalled();
    expect(list).not.toHaveBeenCalled();
  });

  it('uses default lexical discovery once when the synthesis caller supplies no snapshot', async () => {
    const discover = vi.fn(async () => snapshot());
    const list = vi.fn();
    const result = await packet({ runtime: { skillsService: { discover, list } } });
    expect(result.skillNames).toEqual(['locking-review']);
    expect(discover).toHaveBeenCalledExactlyOnceWith({ query: 'diagnose concurrency', mode: 'lexical' });
    expect(list).not.toHaveBeenCalled();
  });

  it('uses only the existing inventory for a blank goal', async () => {
    const discover = vi.fn(), list = vi.fn(async () => [summary]);
    const result = await packet({ runtime: { skillsService: { discover, list } }, task: { goal: '', episodes: [] } });
    expect(result.capabilityExposure.counts.skill).toBe(1);
    expect(result.skillNames).toEqual([]);
    expect(list).toHaveBeenCalledTimes(1);
    expect(discover).not.toHaveBeenCalled();
  });

  it('does not attribute selected details omitted from the packet budget just because inventory names their revision', async () => {
    const selected = snapshot({ description: 'locking '.repeat(100), triggers: ['x'.repeat(240)] });
    selected.artifacts[0] = { ...summary, description: 'locking '.repeat(100), allowedTools: Array(12).fill('tool'.repeat(30)) };
    selected.search.hits[0].allowedTools = selected.artifacts[0].allowedTools;
    const items = Array.from({ length: 100 }, (_, i) => ({ id: 'memory-' + i }));
    const memoryService = { authoritySnapshot: async () => Object.fromEntries(items.map(item => [item.id, { context: 'x'.repeat(400) }])),
      staleness: async () => ({ status: 'current' }) };
    const result = await packet({ runtime: { skillsService: { list: async () => selected.artifacts }, memoryService },
      skillDiscovery: selected, memoryItems: items, task: { goal: 'locking', episodes: [] } });
    expect(result.text.length).toBeLessThanOrEqual(16_000);
    expect(result.capabilityExposure.inventory.some(item => item.capabilityId === 'skill:locking-review')).toBe(true);
    expect(result.text).not.toContain('- locking-review:');
    expect(result.skillNames).toEqual([]);
    expect(result.artifactRevisions['skill:locking-review']).toBeUndefined();
  });

  it('reuses one discovery result for outer context, inventory, synthesis and delivery attribution', async () => {
    const f = await fixture();
    const selected = snapshot();
    const discover = vi.fn(async () => selected), list = vi.fn(async () => []);
    const service = await ExternalControllerLearningService.initialize({ stateDir: path.join(f.root, 'external'),
      memory: f.memory, learning: f.learning, skills: { discover, list, proposalProjectRoot: () => f.root } as any });
    const ownerId = 'context-fixture-owner';
    await service.startEpisode('transport', { taskKey: 'discovery', workspace: 'agent-core' }, {
      ownerId, workspaceIdentityKey: f.memory.registeredWorkspaceIdentity('agent-core').key,
    });
    const identity = createToolInvocationIdentity();
    const context = await service.captureToolInvocationContext({ ...identity, invocationId: identity.id, sessionId: 'transport', ownerId });
    expect(context.binding).toBe('bound');
    const signal = new AbortController().signal;
    const result: any = await service.context('transport', { query: 'diagnose concurrency', skillSearchMode: 'hybrid', signal } as any, ownerId, context);
    expect(result.skills).toEqual([{ ...summary, ...selected.search.hits[0], delivery: 'metadata' }]);
    expect(result.synthesis.skillNames).toEqual(['locking-review']);
    expect(result.skillSearch).toMatchObject({ requestedMode: 'hybrid', effectiveMode: 'hybrid', deliveredHits: 1 });
    expect(result.skillSearch.hits).toBeUndefined();
    expect(discover).toHaveBeenCalledExactlyOnceWith({ query: 'diagnose concurrency', mode: 'hybrid', signal });
    expect(list).not.toHaveBeenCalled();
    const episode = await service.getEpisode('transport');
    expect(episode?.deliveredArtifacts).toEqual({ 'skill:locking-review': digest });
    expect(episode?.metrics.artifactUses).toBe(0);
    expect(episode?.capabilityUses ?? []).toEqual([]);
  });

  it('does not retry failed discovery through synthesis or claim an empty catalog', async () => {
    const f = await fixture();
    const discover = vi.fn(async () => { throw new Error('unavailable'); });
    const service = await ExternalControllerLearningService.initialize({ stateDir: path.join(f.root, 'external'),
      memory: f.memory, learning: f.learning, skills: { discover, list: async () => [], proposalProjectRoot: () => f.root } as any });
    const result: any = await service.context('transport', { query: 'diagnose concurrency' });
    expect(discover).toHaveBeenCalledTimes(1);
    expect(result.skills).toEqual([]);
    expect(result.capabilities.owners.skills).toBe('unavailable');
    expect(result.skillSearch).toMatchObject({ status: 'unavailable', requestedMode: 'lexical' });
    expect(result.evidenceGaps).not.toContain('no active Skill artifacts are currently available');
  });


  it('finds declared trigger text through the real lexical owner without returning instruction bodies', async () => {
    const f = await fixture();
    const source = path.join(f.root, 'locking-source');
    await mkdir(source);
    await writeFile(path.join(source, 'SKILL.md'), '---\nname: locking-review\ndescription: Database inspection\n---\n'
      + '## Trigger\nReview contended transactions\n## Non-trigger\nDeploy database migrations\n'
      + '## Instructions\nPRIVATE_BODY_MARKER: inspect database indexes.\n');
    const active = await f.skills.import(source);
    const discover = vi.spyOn(f.skills, 'discover'), list = vi.spyOn(f.skills, 'list');
    const service = await ExternalControllerLearningService.initialize({ stateDir: path.join(f.root, 'external'),
      memory: f.memory, learning: f.learning, skills: f.skills });
    const result = await service.context('transport', { query: 'contended transactions' });
    expect(result.skills).toHaveLength(1);
    expect(result.skills[0]).toMatchObject({ name: 'locking-review', digest: active.digest,
      triggers: ['Review contended transactions'], delivery: 'metadata', executionAuthority: false });
    expect(result.skillSearch).toMatchObject({ requestedMode: 'lexical', effectiveMode: 'lexical',
      semantic: { status: 'not-requested', sentDescriptors: 0 } });
    expect(JSON.stringify(result)).not.toContain('PRIVATE_BODY_MARKER');
    expect(discover).toHaveBeenCalledTimes(1);
    expect(list).not.toHaveBeenCalled();
  });

  it('requires an explicit query before hybrid context discovery', async () => {
    const f = await fixture(), discover = vi.fn();
    const service = await ExternalControllerLearningService.initialize({ stateDir: path.join(f.root, 'external'),
      memory: f.memory, learning: f.learning, skills: { discover, list: async () => [] } as any });
    await expect(service.context('transport', { skillSearchMode: 'hybrid' } as any)).rejects.toThrow(/QUERY_REQUIRED/);
    expect(discover).not.toHaveBeenCalled();
  });
});
