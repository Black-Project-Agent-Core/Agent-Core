import { expect, it, vi } from 'vitest';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { fixture } from './skill-proposal-fixture.js';
import { ExternalControllerLearningService } from '../src/learning/external-controller.js';
import { createAgentCoreMcpServer } from '../src/mcp/server.js';
import { attachControllerContract } from './controller-contract-fixture.js';
import { createToolInvocationIdentity } from '../src/tracker/tool-invocation.js';
import { skillInstructionsRead, skillReferenceRead } from '../src/capability-awareness.js';

it('observes actual search/read delivery with active revision rechecks and no material-use credit', async () => {
  const f = await fixture(), source = path.join(f.root, 'source-skill');
  await mkdir(source);
  const markdown = '---\nname: source-review\ndescription: Inspect code review evidence\nallowed-tools: ["read_file"]\n---\n\n## Trigger\nReview code.\n\n## Non-trigger\nDeploy code.\n';
  await writeFile(path.join(source, 'SKILL.md'), markdown);
  const imported = await f.skills.import(source);
  const external = await ExternalControllerLearningService.initialize({ stateDir: path.join(f.root, 'runtime/learning'),
    memory: f.memory, learning: f.learning, skills: f.skills });
  const ownerId = 'skill-delivery-owner';
  await external.startEpisode('search', { taskKey: 'search-only', workspace: 'agent-core' }, {
    ownerId, workspaceIdentityKey: f.memory.registeredWorkspaceIdentity('agent-core').key,
  });
  const server = createAgentCoreMcpServer({ id: ownerId, toolGrant: { version: 1, allowedTools: ['skills'] } }, {
    externalControllerLearning: external, controllerSessionId: 'search', skillsService: f.skills,
  });
  const client = new Client({ name: 'skill-delivery-test', version: '1' });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  try {
    await server.connect(st); await client.connect(ct);
    await attachControllerContract(client);
    const searched = await client.callTool({ name: 'skills', arguments: { action: 'search', query: 'review' } });
    expect(searched.isError, JSON.stringify(searched)).not.toBe(true);
    const payload = JSON.parse((searched.content as any[])[0].text);
    expect(payload.hits[0]).toMatchObject({ name: imported.name, digest: imported.digest, executionAuthority: false });
    expect(payload.hits[0].content).toBeUndefined();
    let episode = await external.getEpisode('search');
    expect(episode?.deliveredArtifacts?.['skill:' + imported.name]).toBe(imported.digest);
    expect(episode?.capabilityUses ?? []).toEqual([]);
    expect(JSON.stringify(searched)).not.toContain('CAPABILITY USAGE NOTICE');
    const read = await client.callTool({ name: 'skills', arguments: { action: 'read', name: imported.name, expectedActiveDigest: imported.digest } });
    expect(read.isError, JSON.stringify(read)).not.toBe(true);
    expect(JSON.parse((read.content as any[])[0].text)).toMatchObject({ content: markdown, delivery: 'instruction-fragment', executionAuthority: false });
    episode = await external.getEpisode('search');
    expect(episode?.capabilityUses ?? []).toEqual([]);
    expect(JSON.stringify(read)).not.toContain('CAPABILITY USAGE NOTICE');

    await external.startEpisode('stale', { taskKey: 'stale-delivery', workspace: 'agent-core' });
    const current = path.join(f.root, 'runtime/skills/catalog', imported.name, 'SKILL.md');
    await writeFile(current, markdown + '\nChanged active instructions.\n');
    await external.recordInspectedSkillArtifacts('stale', JSON.stringify(payload));
    expect((await external.getEpisode('stale'))?.deliveredArtifacts?.['skill:' + imported.name]).toBeUndefined();
    const stale = await client.callTool({ name: 'skills', arguments: { action: 'read', name: imported.name, expectedActiveDigest: imported.digest } });
    expect(stale.isError).toBe(true);
    expect((stale.content as any[])[0].text).toContain('SKILL_ACTIVE_REVISION_CHANGED');
  } finally { await client.close(); await server.close(); }
});

it('does not expose skills search/read without the existing tool grant', async () => {
  const f = await fixture();
  const server = createAgentCoreMcpServer({ toolGrant: { version: 1, allowedTools: ['get_config'] } }, { skillsService: f.skills });
  const client = new Client({ name: 'skill-grant-test', version: '1' });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  try {
    await server.connect(st); await client.connect(ct);
    expect((await client.listTools()).tools.map(tool => tool.name)).toEqual(['controller_contract', 'get_config']);
    for (const args of [{ action: 'search', query: 'review' }, { action: 'read', name: 'source-review', expectedActiveDigest: 'sha256:' + 'a'.repeat(64) }]) {
      const result = await client.callTool({ name: 'skills', arguments: args }).catch(() => null);
      expect(result === null || result.isError === true).toBe(true);
    }
  } finally { await client.close(); await server.close(); }
});

async function deliveryFixture(withReferences = false) {
  const f = await fixture(), source = path.join(f.root, 'proof-source'); await mkdir(source);
  const markdown = '---\nname: proof-review\ndescription: Review exact evidence\n---\nRead source before conclusions.\n';
  await writeFile(path.join(source, 'SKILL.md'), markdown);
  if (withReferences) {
    await mkdir(path.join(source, 'references'));
    await writeFile(path.join(source, 'references', 'appraisal.md'), 'a😀'.repeat(240));
    await writeFile(path.join(source, 'references', 'independent.md'), 'Independent review.');
  }
  const skill = await f.skills.import(source);
  const stateDir = path.join(f.root, 'external'), ownerId = 'delivery-owner', sessionId = 'delivery';
  const external = await ExternalControllerLearningService.initialize({ stateDir, memory: f.memory, learning: f.learning, skills: f.skills });
  const binding = { ownerId, workspaceIdentityKey: f.memory.registeredWorkspaceIdentity('agent-core').key };
  const episode = await external.startEpisode(sessionId, { taskKey: 'first', workspace: 'agent-core' }, binding);
  const server = createAgentCoreMcpServer({ id: ownerId, toolGrant: { version: 1, allowedTools: ['skills'] } }, {
    externalControllerLearning: external, controllerSessionId: sessionId, skillsService: f.skills,
  });
  const client = new Client({ name: 'durable-skill-delivery', version: '1' }), [ct, st] = InMemoryTransport.createLinkedPair();
  await server.connect(st); await client.connect(ct); await attachControllerContract(client);
  return { ...f, external, client, server, skill, markdown, stateDir, sessionId, episode, binding,
    read: () => client.callTool({ name: 'skills', arguments: { action: 'read', name: skill.name, expectedActiveDigest: skill.digest } }),
    state: async () => JSON.parse(await readFile(path.join(stateDir, 'external-controller.json'), 'utf8')),
    close: async () => { await (external as any).mutationTail; await client.close(); await server.close(); },
  };
}

it.each(['primary', 'passive-fallback'] as const)('atomically persists %s Skill delivery with its primary event despite a save exceeding 250ms', async path => {
  const f = await deliveryFixture(), original = (f.external as any).save.bind(f.external);
  let saved = false;
  const save = vi.spyOn(f.external as any, 'save').mockImplementation(async state => {
    await new Promise(resolve => setTimeout(resolve, 320)); await original(state); saved = true;
  });
  try {
    if (path === 'primary') {
      const result = await f.read(); expect(result.isError).not.toBe(true);
    } else {
      const identity = createToolInvocationIdentity();
      const context = await f.external.captureToolInvocationContext({ ...identity, invocationId: identity.id,
        sessionId: f.sessionId, ownerId: f.binding.ownerId, taskScope: {} });
      const request = { action: 'read', name: f.skill.name, expectedActiveDigest: f.skill.digest };
      const response = await f.skills.read(f.skill.name, request);
      await f.external.recordInspectedSkillArtifacts(f.sessionId, JSON.stringify(response), context, request);
    }
    expect(saved).toBe(true);
    const episode = await f.external.getEpisode(f.sessionId);
    expect(episode?.events.filter(event => event.tool === 'skills' && event.outcome === 'success')).toHaveLength(1);
    expect(episode?.deliveredArtifacts?.['skill:' + f.skill.name]).toBe(f.skill.digest);
    expect(episode?.skillReads?.[f.skill.name]).toMatchObject({ digest: f.skill.digest, complete: true });
    expect(save).toHaveBeenCalledTimes(1);
    expect(episode?.capabilityUses ?? []).toEqual([]);
  } finally { await f.close(); save.mockRestore(); }
});

it.each(['rebind', 'revision', 'mismatch'] as const)('does not credit Skill delivery after a %s during the read', async change => {
  const f = await deliveryFixture(), read = f.skills.read.bind(f.skills);
  const spy = vi.spyOn(f.skills, 'read').mockImplementation(async (name, input) => {
    const result = await read(name, input);
    if (change === 'rebind') await f.external.startEpisode(f.sessionId, { taskKey: 'replacement', workspace: 'agent-core' }, f.binding);
    else if (change === 'revision') await writeFile(path.join(f.root, 'runtime/skills/catalog', f.skill.name, 'SKILL.md'), f.markdown + '\nChanged active instructions.');
    return change === 'mismatch' ? { ...result, name: 'different-skill' } : result;
  });
  try {
    const result = await f.read(); expect(result.isError).not.toBe(true); await (f.external as any).mutationTail;
    for (const episode of (await f.state()).episodes) {
      expect(episode.deliveredArtifacts?.['skill:' + f.skill.name]).toBeUndefined();
      expect(episode.skillReads?.[f.skill.name]).toBeUndefined();
    }
  } finally { await f.close(); spy.mockRestore(); }
});

it('awaits required Skill task capture when current-state loading exceeds the optional 100ms budget', async () => {
  const f = await deliveryFixture(), load = (f.external as any).load.bind(f.external); let delayed = false;
  const spy = vi.spyOn(f.external as any, 'load').mockImplementation(async (...args) => {
    if (!delayed) { delayed = true; await new Promise(resolve => setTimeout(resolve, 160)); }
    return load(...args);
  });
  try {
    const result = await f.read(); expect(result.isError).not.toBe(true);
    expect((await f.external.getEpisode(f.sessionId))?.skillReads?.[f.skill.name]?.complete).toBe(true);
  } finally { await f.close(); spy.mockRestore(); }
});

it('refuses cancelled Skill proof before persistence without granting usage', async () => {
  const f = await deliveryFixture(), identity = createToolInvocationIdentity();
  try {
    const context = await f.external.captureToolInvocationContext({ ...identity, invocationId: identity.id,
      sessionId: f.sessionId, ownerId: f.binding.ownerId, taskScope: {} });
    const request = { action: 'read', name: f.skill.name, expectedActiveDigest: f.skill.digest };
    const response = await f.skills.read(f.skill.name, request), abort = new AbortController(); abort.abort();
    const save = vi.spyOn(f.external as any, 'save');
    await expect(f.external.recordToolOutcome({ sessionId: f.sessionId, tool: 'skills', argumentKeys: Object.keys(request),
      outcome: 'success', readOnly: true, invocationId: identity.id, invocationContext: context,
      skillDelivery: { request, text: JSON.stringify(response), signal: abort.signal } })).rejects.toThrow();
    expect(save).not.toHaveBeenCalled(); save.mockRestore();
    expect((await f.external.getEpisode(f.sessionId))?.skillReads?.[f.skill.name]).toBeUndefined();
  } finally { await f.close(); }
});

it('persists selected-reference coverage through the real bound external MCP delivery path', async () => {
  const f = await deliveryFixture(true), reference = 'references/appraisal.md';
  const independent = 'references/independent.md';
  const page = (resourcePath: string, offset = 0) => f.client.callTool({ name: 'skills', arguments: {
    action: 'read', name: f.skill.name, expectedActiveDigest: f.skill.digest,
    resourcePath, offset, maxBytes: 512,
  } });
  try {
    const first = await page(reference);
    expect(first.isError).not.toBe(true);
    let data = JSON.parse((first.content as any[])[0].text);
    expect(data.nextOffset).not.toBeNull();
    let episode = await f.external.getEpisode(f.sessionId);
    expect(skillReferenceRead(episode?.skillReads, f.skill.name, reference, f.skill.digest)).toBe(false);
    let iterations = 0;
    while (data.nextOffset !== null && iterations++ < 24) {
      const next = await page(reference, data.nextOffset);
      expect(next.isError).not.toBe(true);
      data = JSON.parse((next.content as any[])[0].text);
    }
    expect(data.nextOffset).toBeNull();
    episode = await f.external.getEpisode(f.sessionId);
    expect(skillReferenceRead(episode?.skillReads, f.skill.name, reference, f.skill.digest)).toBe(true);
    expect(skillInstructionsRead(episode?.skillReads, f.skill.name, f.skill.digest)).toBe(false);
    const second = await page(independent);
    expect(second.isError).not.toBe(true);
    episode = await f.external.getEpisode(f.sessionId);
    expect(skillReferenceRead(episode?.skillReads, f.skill.name, independent, f.skill.digest)).toBe(true);
    expect(skillReferenceRead(episode?.skillReads, f.skill.name, reference, f.skill.digest)).toBe(true);
    expect(skillInstructionsRead(episode?.skillReads, f.skill.name, f.skill.digest)).toBe(false);
    expect(episode?.capabilityUses ?? []).toEqual([]);
    expect(episode?.deliveredArtifacts?.['skill:' + f.skill.name]).toBe(f.skill.digest);
    const main = await f.read();
    expect(main.isError).not.toBe(true);
    episode = await f.external.getEpisode(f.sessionId);
    expect(skillInstructionsRead(episode?.skillReads, f.skill.name, f.skill.digest)).toBe(true);
    expect(skillReferenceRead(episode?.skillReads, f.skill.name, reference, f.skill.digest)).toBe(true);
  } finally { await f.close(); }
});

it('refuses malformed, foreign, wrong-source, wrong-digest and noncontiguous external reference credit', async () => {
  const f = await deliveryFixture(true), resource = 'references/appraisal.md';
  const request = (offset = 0) => ({ action: 'read', name: f.skill.name,
    expectedActiveDigest: f.skill.digest, resourcePath: resource, offset, maxBytes: 512 });
  const delivery = async (args: ReturnType<typeof request>, text: string, sessionId = f.sessionId) => {
    const identity = createToolInvocationIdentity();
    const context = await f.external.captureToolInvocationContext({ ...identity,
      invocationId: identity.id, sessionId: f.sessionId, ownerId: f.binding.ownerId, taskScope: {} });
    return f.external.recordToolOutcome({ sessionId, tool: 'skills',
      argumentKeys: Object.keys(args), outcome: 'success', readOnly: true,
      invocationId: identity.id, invocationContext: context, skillDelivery: { request: args, text } });
  };
  try {
    for (const resourcePath of ['references/missing.md', 'references/../SKILL.md',
      '/references/appraisal.md', 'C:/tmp/appraisal.md']) {
      const denied = await f.client.callTool({ name: 'skills', arguments: { ...request(), resourcePath } }).catch(() => null);
      expect(denied === null || denied.isError === true).toBe(true);
    }
    const wrongDigest = await f.client.callTool({ name: 'skills', arguments: {
      ...request(), expectedActiveDigest: 'sha256:' + 'b'.repeat(64) } });
    expect(wrongDigest.isError).toBe(true);
    const correct = await f.skills.read(f.skill.name, request());
    await delivery(request(), JSON.stringify({ ...correct, source: 'references/independent.md' }));
    await delivery(request(), JSON.stringify({ ...correct, digest: 'sha256:' + 'b'.repeat(64) }));
    await delivery(request(), 'TOOL_ERROR\n' + JSON.stringify(correct));
    const noncontiguous = request(5);
    await delivery(noncontiguous, JSON.stringify(await f.skills.read(f.skill.name, noncontiguous)));
    let episode = await f.external.getEpisode(f.sessionId);
    expect(skillReferenceRead(episode?.skillReads, f.skill.name, resource, f.skill.digest)).toBe(false);
    expect(skillInstructionsRead(episode?.skillReads, f.skill.name, f.skill.digest)).toBe(false);
    await f.external.startEpisode('foreign', { taskKey: 'other', workspace: 'agent-core' }, f.binding);
    expect(await delivery(request(), JSON.stringify(correct), 'foreign')).toBe('unbound');
    episode = await f.external.getEpisode('foreign');
    expect(skillReferenceRead(episode?.skillReads, f.skill.name, resource, f.skill.digest)).toBe(false);
    expect(episode?.deliveredArtifacts?.['skill:' + f.skill.name]).toBeUndefined();
  } finally { await f.close(); }
});
