import { afterAll, describe, expect, it } from 'vitest';
import { buildKnowledgeSynthesisPacket } from '../src/agent-knowledge-synthesis.js';
import { readRakaCapability } from '../src/external-partner-capability.js';
import { mkdir, mkdtemp, rename, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { resolveModuleProjectRoot } from '../src/portability/paths.js';

const fixtureParent = path.join(resolveModuleProjectRoot(import.meta.url), 'runtime', 'tmp');
const fixtures: string[] = [];
async function profileFixture() {
  await mkdir(fixtureParent, { recursive: true });
  const root = await mkdtemp(path.join(fixtureParent, 'raka-profile-'));
  fixtures.push(root);
  await mkdir(path.join(root, 'subagents'));
  for (const name of ['README.md', 'raka.md', 'CORTEX_MEMORY.md']) {
    await writeFile(path.join(root, 'subagents', name), '# local-profile-private-marker\n');
  }
  return root;
}
afterAll(async () => {
  for (const root of fixtures) {
    if (path.dirname(root) !== fixtureParent || !path.basename(root).startsWith('raka-profile-')) throw Error('Unsafe fixture cleanup');
    await rm(root, { recursive: true, force: true });
  }
});

async function context(externalController: boolean) {
  return buildKnowledgeSynthesisPacket({
    runtime: {}, memoryItems: [], procedures: [],
    task: { goal: 'Implement a coding task with partner Raka', episodes: [] },
    availableTools: ['read_file', 'controller_learning'], externalController,
  });
}

describe('external Raka capability discovery', () => {
  it('delivers actionable host delegation guidance through the existing context inventory', async () => {
    const result = await context(true);
    const raka = result.capabilityExposure.inventory.find(item => item.capabilityId === 'external:raka');
    expect(raka).toBeDefined();
    expect(raka).toMatchObject({
      kind: 'external', displayName: 'Raka', availability: 'unknown',
      execution: { owner: 'controller-host', availability: 'unknown', executionAuthority: false },
      profile: { status: 'available' },
    });
    const guidance = (raka as any).invocation;
    expect(guidance.inspect.tool).toBe('collaboration.list_agents');
    expect(guidance.create.arguments.task_name).toBe('raka');
    expect(guidance.create.arguments.fork_turns).toBe('none');
    expect(guidance.reuse.tool).toBe('collaboration.followup_task');
    expect(guidance.steer.tool).toBe('collaboration.send_message');
    expect(guidance.create.requires).toContain('no-reusable-instance');
    expect(result.text).toContain('external:raka');
    expect(result.text).toContain('collaboration.list_agents');
    expect(result.text).toContain('subagents');
    expect(result.capabilityExposure.executionAuthority).toBe(false);
  });

  it('keeps host partner exposure out of Native knowledge packets', async () => {
    const result = await context(false);
    expect(result.capabilityExposure.inventory.some(item => item.capabilityId === 'external:raka')).toBe(false);
    expect(result.text).not.toContain('collaboration.spawn_agent');
    expect(result.capabilityExposure.external.status).toBe('unknown');
  });

  it('keeps Raka invocation visible in a crowded final context without losing structured identities', async () => {
    const artifacts = Array.from({ length: 500 }, (_, i) => ({
      name: 'skill-' + i, description: 'bounded task helper', digest: 'sha256:' + 'a'.repeat(64), allowedTools: [],
    }));
    const result = await buildKnowledgeSynthesisPacket({
      runtime: { skillsService: { list: async () => artifacts } as any }, memoryItems: [], procedures: [],
      task: { goal: '', episodes: [] }, availableTools: ['read_file'], externalController: true,
    });
    expect(result.capabilityExposure.counts.skill).toBe(500);
    expect(result.capabilityExposure.inventory.filter(item => item.capabilityId === 'external:raka')).toHaveLength(1);
    expect(result.capabilityExposure.inventory.some(item => item.capabilityId === 'skill:skill-499')).toBe(true);
    expect(result.text).toContain('collaboration.followup_task');
    expect(result.text).toContain('collaboration.spawn_agent');
    expect(result.text.length).toBeLessThanOrEqual(16_000);
    expect(result.capabilityExposure.text.length).toBeLessThanOrEqual(5_000);
    expect(result.capabilityExposure.omittedFromText).toBeGreaterThan(0);
  });

  it('uses the selected relocated profile root and refreshes revision when source bytes change', async () => {
    const root = await profileFixture();
    const before = await readRakaCapability(root);
    expect(before.profile.status).toBe('available');
    expect(before.profile.sources.map(source => path.relative(root, source.path))).toEqual([
      path.join('subagents', 'README.md'), path.join('subagents', 'raka.md'), path.join('subagents', 'CORTEX_MEMORY.md'),
    ]);
    expect(JSON.stringify(before)).not.toContain('local-profile-private-marker');
    await writeFile(path.join(root, 'subagents', 'raka.md'), '# changed-role\n');
    const after = await readRakaCapability(root);
    expect(after.revision).not.toBe(before.revision);
    expect(after.profile.sources[1].digest).not.toBe(before.profile.sources[1].digest);
    expect(after.execution.availability).toBe('unknown');
  });

  it.each(['missing', 'oversized', 'empty'] as const)('fails softly for a %s profile without offering an ungrounded spawn', async failure => {
    const root = await profileFixture();
    const file = path.join(root, 'subagents', 'raka.md');
    if (failure === 'missing') await rm(file);
    else await writeFile(file, failure === 'oversized' ? 'x'.repeat(24_577) : ' \n');
    const result = await readRakaCapability(root);
    expect(result.profile.status).toBe('unavailable');
    expect(result.profile.sources[1]).toEqual({ path: file, status: 'unavailable' });
    expect(result.invocation).toBeUndefined();
    expect(result.availability).toBe('unavailable');
    expect(result.execution).toMatchObject({ availability: 'unknown', executionAuthority: false });
  });

  it('keeps local Raka collaboration discoverable when the optional Cortex guide is missing', async () => {
    const root = await profileFixture();
    await rm(path.join(root, 'subagents', 'CORTEX_MEMORY.md'));
    const result = await readRakaCapability(root);
    expect(result.profile.status).toBe('available');
    expect(result.profile.sources[2].status).toBe('unavailable');
    expect(result.invocation?.create.arguments.task_name).toBe('raka');
    expect(result.contextRows.join('\n')).toContain('Restore/read the guide before optional Cortex use');
  });

  it('refuses a profile-directory alias to other project files before treating them as a profile', async ctx => {
    const root = await profileFixture();
    const directory = path.join(root, 'subagents');
    const otherFiles = path.join(root, 'other-documents');
    await rename(directory, otherFiles);
    try { await symlink(otherFiles, directory, process.platform === 'win32' ? 'junction' : 'dir'); }
    catch (error) {
      if (['EISDIR', 'EPERM', 'EACCES', 'ENOTSUP'].includes((error as NodeJS.ErrnoException).code ?? '')) {
        ctx.skip('Host cannot create the directory-alias fixture; no product result is inferred.');
        return;
      }
      throw error;
    }
    const result = await readRakaCapability(root);
    expect(result.profile.status).toBe('unavailable');
    expect(result.profile.sources.every(source => source.digest === undefined)).toBe(true);
    expect(result.invocation).toBeUndefined();
  });
});
