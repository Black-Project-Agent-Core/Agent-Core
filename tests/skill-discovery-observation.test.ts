import { expect, it } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { fixture } from './skill-proposal-fixture.js';
import { ExternalControllerLearningService } from '../src/learning/external-controller.js';
import { createAgentCoreMcpServer } from '../src/mcp/server.js';
import { attachControllerContract } from './controller-contract-fixture.js';

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
