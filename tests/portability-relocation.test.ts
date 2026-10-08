import { access, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolvePortableProjectPath, resolveProjectRoot } from '../src/portability/paths.js';
import { preparePortableRuntime, readPortabilityReindexRequest } from '../src/portability/runtime-relocation.js';
import { FileCheckpointService } from '../src/rdc/checkpoints/service.js';

const roots: string[] = [];
async function tempRoot(prefix: string) {
  const root = await mkdtemp(path.join(os.tmpdir(), prefix));
  roots.push(root);
  await writeFile(path.join(root, 'package.json'), '{"name":"agent-core"}', 'utf8');
  return root;
}
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

describe('portable project relocation', () => {
  it('falls back from a stale project-root override and rebases stale project-owned absolute paths', async () => {
    const root = await tempRoot('agent-core-portable-root-');
    const env = { AGENT_CORE_PROJECT_ROOT: 'Z:\\OldMachine\\Agent-Core' };
    expect(resolveProjectRoot(env, root)).toBe(path.resolve(root));
    const rebased = resolvePortableProjectPath(
      root,
      'Z:\\OldMachine\\Agent-Core\\runtime\\semantic-ide\\providers\\python\\server.js',
      path.join('runtime', 'semantic-ide', 'providers', 'python', 'server.js'),
    );
    expect(rebased).toBe(path.join(root, 'runtime', 'semantic-ide', 'providers', 'python', 'server.js'));
  });
  it('archives only transient machine-bound runtime state when root or machine changes', async () => {
    const root = await tempRoot('agent-core-portable-state-');
    const portability = path.join(root, 'runtime', 'portability');
    await mkdir(portability, { recursive: true });
    await writeFile(path.join(portability, 'root-state.json'), JSON.stringify({
      schemaVersion: 1, projectRoot: 'E:\\Projects\\Agent-Core', machineId: 'win32:x64:old-pc', updatedAt: '2026-01-01T00:00:00Z',
    }), 'utf8');
    const transient = [
      path.join(root, 'runtime', 'grafel', 'daemon', 'daemon.pid'),
      path.join(root, 'runtime', 'semantic-ide', 'state', 'powershell', 'session.json'),
      path.join(root, 'runtime', 'rdc', 'browser-control', 'stale', 'profile.lock'),
    ];
    for (const file of transient) { await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, 'stale'); }
    const durable = path.join(root, 'runtime', 'memory', '00-agent-core-memory.md');
    await mkdir(path.dirname(durable), { recursive: true });
    await writeFile(durable, 'durable-memory');

    const result = await preparePortableRuntime(root, 'win32:x64:new-pc');
    expect(result.relocated).toBe(true);
    expect(result.rootChanged).toBe(true);
    expect(result.machineChanged).toBe(true);
    expect(result.transientReset).toBe(true);
    expect(await readPortabilityReindexRequest(root)).toMatchObject({ reason: 'root-change' });
    await expect(access(durable)).resolves.toBeUndefined();
    for (const file of transient) await expect(access(file)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(result.backupDir).toBeTruthy();
    const state = JSON.parse(await readFile(path.join(portability, 'root-state.json'), 'utf8'));
    expect(path.resolve(state.projectRoot)).toBe(path.resolve(root));
    expect(state.machineId).toBe('win32:x64:new-pc');
  });
  it('performs a one-time transient reset when upgrading a v1 portability anchor', async () => {
    const root = await tempRoot('agent-core-portable-upgrade-');
    const portability = path.join(root, 'runtime', 'portability');
    await mkdir(portability, { recursive: true });
    await writeFile(path.join(portability, 'root-state.json'), JSON.stringify({
      schemaVersion: 1,
      projectRoot: root,
      machineId: 'win32:x64:same-pc',
      updatedAt: '2026-01-01T00:00:00Z',
    }), 'utf8');
    const daemonFile = path.join(root, 'runtime', 'grafel', 'daemon', 'state', 'registry.json');
    await mkdir(path.dirname(daemonFile), { recursive: true });
    await writeFile(daemonFile, 'stale-registry');

    const result = await preparePortableRuntime(root, 'win32:x64:same-pc');
    expect(result.relocated).toBe(false);
    expect(result.firstAnchor).toBe(false);
    expect(result.transientReset).toBe(true);
    expect(await readPortabilityReindexRequest(root)).toMatchObject({ reason: 'schema-upgrade' });
    await expect(access(daemonFile)).rejects.toMatchObject({ code: 'ENOENT' });
    const state = JSON.parse(await readFile(path.join(portability, 'root-state.json'), 'utf8'));
    expect(state.schemaVersion).toBe(2);
  });

  it('rebases checkpoint history instead of failing when the project root moves', async () => {
    const oldRoot = await tempRoot('agent-core-checkpoint-old-');
    const newRoot = await tempRoot('agent-core-checkpoint-new-');
    const oldFile = path.join(oldRoot, 'src', 'sample.txt');
    await mkdir(path.dirname(oldFile), { recursive: true });
    await writeFile(oldFile, 'before-move', 'utf8');
    const oldService = new FileCheckpointService(oldRoot, path.join(oldRoot, 'runtime', 'checkpoints'));
    const checkpoint = await oldService.create([oldFile], 'portable');

    await mkdir(path.join(newRoot, 'runtime'), { recursive: true });
    await rename(path.join(oldRoot, 'runtime', 'checkpoints'), path.join(newRoot, 'runtime', 'checkpoints'));
    const newFile = path.join(newRoot, 'src', 'sample.txt');
    await mkdir(path.dirname(newFile), { recursive: true });
    await writeFile(newFile, 'after-move', 'utf8');
    const movedService = new FileCheckpointService(newRoot, path.join(newRoot, 'runtime', 'checkpoints'));
    const preview = await movedService.previewRestore(checkpoint.id);
    expect(preview.changes).toHaveLength(1);
    expect(preview.changes[0]!.path).toBe(newFile);
    await movedService.restore(checkpoint.id, preview.previewDigest);
    expect(await readFile(newFile, 'utf8')).toBe('before-move');
    const state = JSON.parse(await readFile(path.join(newRoot, 'runtime', 'checkpoints', 'state.json'), 'utf8'));
    expect(path.resolve(state.root)).toBe(path.resolve(newRoot));
  });
});