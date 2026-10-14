import path from 'node:path';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('../src/tracker/activity-tracker.js', () => ({ activityTracker: { record: vi.fn(), captureFailure: vi.fn() } }));
import { ExternalControllerLearningService } from '../src/learning/external-controller.js';
import { MemoryService } from '../src/memory/service.js';
const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
async function fixture() {
  const base = path.resolve('runtime/tmp'); await mkdir(base, { recursive: true });
  const root = await mkdtemp(path.join(base, 'memory-binding-')); roots.push(root);
  const memory = await MemoryService.initialize(root);
  const stateDir = path.join(root, 'learning');
  const service = await ExternalControllerLearningService.initialize({ stateDir, memory, learning: {} as any });
  const start = (ownerId: string, session: string, taskKey: string, workspace = 'agent-core') =>
    (service.startEpisode as any)(session, { taskKey, workspace }, { ownerId, workspaceIdentityKey: memory.registeredWorkspaceIdentity(workspace).key });
  return { root, memory, stateDir, service, start };
}
describe('host-validated Memory task binding', () => {
  // Removing the owner predicate in startEpisode must make this fail.
  it('separates_owner_and_registered_workspace', async () => {
    const f = await fixture();
    const a = await f.start('owner-a', 'same-header', 'repair-1');
    const b = await f.start('owner-b', 'same-header', 'repair-1');
    expect(a.id).not.toBe(b.id);
    expect((await f.start('owner-a', 'reconnected-header', 'repair-1')).id).toBe(a.id);
    const repo = path.join(f.root, 'repo'); await mkdir(repo);
    await f.memory.registerWorkspaceAliases([{ name: 'registered', repos: [{ path: repo }] }]);
    expect((await f.start('owner-a', 'same-header', 'repair-1', 'registered')).id).not.toBe(a.id);
    expect((await f.service.getEpisode('reconnected-header'))?.memoryBinding).toEqual({ ownerId: 'owner-a', workspaceIdentityKey: 'agent-core' });
  });
  it('uses one canonical task key for persistence and reconnect', async () => {
    const f = await fixture(); const first = await f.start('owner-a', 'header', 'repair  whitespace');
    expect((await f.start('owner-a', 'reconnect', 'repair  whitespace')).id).toBe(first.id);
  });
  it.each(['touch', 'tool', 'recall', 'checkpoint', 'label', 'verify', 'artifact'])('keeps bound workspace immutable through the %s Learning observation path', async hook => {
    const f = await fixture(); const canonicalRoot = path.join(f.root, 'canonical/repo'), otherRoot = path.join(f.root, 'other/repo');
    await mkdir(canonicalRoot, { recursive: true }); await mkdir(otherRoot, { recursive: true });
    await f.memory.registerWorkspaceAliases([{ name: 'canonical', repos: [{ path: canonicalRoot }] }, { name: 'other', repos: [{ path: otherRoot }] }]);
    const session = 'bound-session'; const task = await f.start('owner-a', session, 'stable-task', 'canonical');
    const digest = 'sha256:' + 'd'.repeat(64);
    if (hook === 'artifact') {
      const file = path.join(f.stateDir, 'external-controller.json'); const state = JSON.parse(await readFile(file, 'utf8'));
      state.episodes[0].deliveredArtifacts = { 'pattern:synthetic-pattern': digest }; await writeFile(file, JSON.stringify(state));
    }
    const observe = async (workspace: string) => {
      if (hook === 'touch') await f.service.touchSession(session, workspace);
      else if (hook === 'tool') await f.service.recordToolOutcome({ sessionId: session, tool: 'synthetic', argumentKeys: [], outcome: 'success', readOnly: true, workspace });
      else if (hook === 'recall') await f.service.recordMemoryRecall(session, workspace, []);
      else if (hook === 'checkpoint') await f.service.recordLearningCheckpoint(session, workspace, 'synthetic-checkpoint', task.id);
      else if (hook === 'label') await f.service.labelEpisode(session, { workspace });
      else if (hook === 'verify') await f.service.verifyEpisode(session, { workspace, outcome: 'failed', verificationRef: 'verification:synthetic-unavailable' });
      else await f.service.artifactReceipt(session, { workspace, kind: 'pattern', artifactId: 'synthetic-pattern', contentDigest: digest, applicability: 'rejected', result: 'unavailable', reasonCode: 'synthetic' });
    };
    for (const workspace of [canonicalRoot, 'other']) {
      await observe(workspace);
      expect((await f.service.getEpisode(session))?.workspace).toBe('canonical');
      expect(await f.service.resolveMemoryTask('owner-a', task.id)).toEqual({ taskId: task.id, workspaceKey: 'canonical' });
      expect((await f.start('owner-a', 'reconnect-' + workspace, 'stable-task', 'canonical')).id).toBe(task.id);
    }
    const reopened = await ExternalControllerLearningService.initialize({ stateDir: f.stateDir, memory: f.memory, learning: {} as any });
    const resumed = await reopened.startEpisode('restart', { taskKey: 'stable-task', workspace: canonicalRoot }, { ownerId: 'owner-a', workspaceIdentityKey: f.memory.registeredWorkspaceIdentity('canonical').key });
    expect(resumed.id).toBe(task.id); expect(resumed.workspace).toBe('canonical');
    // Unbound historical episodes retain their previous observational labeling behavior.
    await f.service.startEpisode('legacy', { taskKey: 'legacy-' + hook, workspace: 'agent-core' });
    await f.service.touchSession('legacy', 'other'); expect((await f.service.getEpisode('legacy'))?.workspace).toBe('other');
  });
  it('preserves exact registered workspace spelling through binding persistence and reconnect', async () => {
    const f = await fixture(); const repo = path.join(f.root, 'spaced-repo'); await mkdir(repo);
    await f.memory.registerWorkspaceAliases([{ name: 'my  repo', repos: [{ path: repo }] }]);
    const task = await f.start('owner-a', 'first', 'stable', 'my  repo');
    expect(task.workspace).toBe('my  repo');
    expect(await f.service.resolveMemoryTask('owner-a', task.id)).toEqual({ taskId: task.id, workspaceKey: 'my  repo' });
    expect((await f.start('owner-a', 'second', 'stable', 'my  repo')).id).toBe(task.id);
    const reopened = await ExternalControllerLearningService.initialize({ stateDir: f.stateDir, memory: f.memory, learning: {} as any });
    expect(await reopened.resolveMemoryTask('owner-a', task.id)).toEqual({ taskId: task.id, workspaceKey: 'my  repo' });
    const archive = path.join(f.stateDir, 'episodes-archive'); await mkdir(archive);
    const file = path.join(f.stateDir, 'external-controller.json'); const state = JSON.parse(await readFile(file, 'utf8'));
    await writeFile(path.join(archive, createHash('sha256').update(task.id).digest('hex') + '.json'), JSON.stringify(state.episodes[0]));
    state.episodes = []; await writeFile(file, JSON.stringify(state));
    expect(await reopened.resolveMemoryTask('owner-a', task.id)).toEqual({ taskId: task.id, workspaceKey: 'my  repo' });
    expect((await reopened.startEpisode('archive-reconnect', { taskKey: 'stable', workspace: repo }, { ownerId: 'owner-a', workspaceIdentityKey: f.memory.registeredWorkspaceIdentity('my  repo').key })).id).toBe(task.id);
  });
  it('never adopts a historical unbound episode', async () => {
    const f = await fixture(); const old = await f.service.startEpisode('old', { taskKey: 'repair', workspace: 'agent-core' });
    const bound = await f.start('owner-a', 'new', 'repair'); expect(bound.id).not.toBe(old.id);
    expect((await f.service.startEpisode('legacy-again', { taskKey: 'repair', workspace: 'agent-core' })).id).toBe(old.id);
  });
  it('resolves an archived binding read-only and refuses foreign or unknown selectors', async () => {
    const f = await fixture(); const task = await f.start('owner-a', 'header', 'repair');
    const statePath = path.join(f.stateDir, 'external-controller.json');
    const state = JSON.parse(await readFile(statePath, 'utf8'));
    const archive = path.join(f.stateDir, 'episodes-archive'); await mkdir(archive);
    await writeFile(path.join(archive, createHash('sha256').update(task.id).digest('hex') + '.json'), JSON.stringify(state.episodes[0]));
    state.episodes = []; await writeFile(statePath, JSON.stringify(state)); const before = await readFile(statePath);
    expect(await (f.service as any).resolveMemoryTask('owner-a', task.id)).toEqual({ taskId: task.id, workspaceKey: 'agent-core' });
    for (const [owner, id] of [['owner-b', task.id], ['owner-a', 'unknown'], ['', task.id]]) {
      await expect((f.service as any).resolveMemoryTask(owner, id)).rejects.toThrow('MEMORY_CONTROLLER_SCOPE_UNAVAILABLE');
    }
    expect(await readFile(statePath)).toEqual(before);
    expect((await f.start('owner-a', 'reconnect', 'repair')).id).toBe(task.id);
  });
  it('refuses registry drift, ambiguity, fake names and same-basename roots without writes', async () => {
    const f = await fixture(); const first = path.join(f.root, 'first/repo'), other = path.join(f.root, 'other/repo');
    await mkdir(first, { recursive: true }); await mkdir(other, { recursive: true });
    await f.memory.registerWorkspaceAliases([{ name: 'registered', repos: [{ path: first }] }]);
    const task = await f.start('owner-a', 'header', 'repair', 'registered');
    const statePath = path.join(f.stateDir, 'external-controller.json'); const before = await readFile(statePath);
    for (const registrations of [[], [{ name: 'registered', repos: [{ path: other }] }], [{ name: 'registered', repos: [{ path: first }, { path: other }] }]]) {
      await f.memory.registerWorkspaceAliases(registrations);
      await expect((f.service as any).resolveMemoryTask('owner-a', task.id)).rejects.toThrow('MEMORY_CONTROLLER_SCOPE_UNAVAILABLE');
      expect(await readFile(statePath)).toEqual(before);
    }
    await expect((f.service.startEpisode as any)('fake', { taskKey: 'repair', workspace: 'fake' }, { ownerId: 'owner-a', workspaceIdentityKey: 'fake' })).rejects.toThrow('MEMORY_CONTROLLER_SCOPE_UNAVAILABLE');
    expect(await readFile(statePath)).toEqual(before);
  });
  it('rejects invalid binding and degraded state instead of resetting history', async () => {
    const f = await fixture(); const task = await f.start('owner-a', 'header', 'repair');
    const file = path.join(f.stateDir, 'external-controller.json');
    const valid = JSON.parse(await readFile(file, 'utf8'));
    for (const bytes of ['{broken', JSON.stringify({ ...valid, episodes: [{ ...valid.episodes[0], memoryBinding: { ownerId: 'owner-a', workspaceIdentityKey: '' } }] })]) {
      await writeFile(file, bytes);
      await expect((f.service as any).resolveMemoryTask('owner-a', task.id)).rejects.toThrow('MEMORY_CONTROLLER_SCOPE_UNAVAILABLE');
      expect(await readFile(file, 'utf8')).toBe(bytes);
    }
  });
});
