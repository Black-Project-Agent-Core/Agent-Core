import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { WorkspaceFreshnessCoordinator } from '../src/semantic-ide/freshness.js';

const roots: string[] = [];

async function fixture(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-core-semantic-freshness-'));
  roots.push(root);
  await writeFile(path.join(root, 'a.ts'), 'export const a = 1;\n', 'utf8');
  await writeFile(path.join(root, 'b.ts'), 'export const b = 2;\n', 'utf8');
  await mkdir(path.join(root, 'node_modules'), { recursive: true });
  await writeFile(path.join(root, 'node_modules', 'ignored.ts'), 'export const ignored = 1;\n', 'utf8');
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

describe('Semantic IDE workspace freshness', () => {
  it('establishes a baseline and then emits created/changed/deleted watched-file events', async () => {
    const root = await fixture();
    const notifications: any[] = [];
    const bound: string[] = [];
    const closed: string[] = [];
    const states: any[] = [];
    const session = {
      notify: (method: string, params?: unknown) => notifications.push({ method, params }),
      bindCreatedFile: async (filePath: string) => { bound.push(filePath); },
      closeDeletedFile: async (filePath: string) => { closed.push(filePath); },
      noteFreshness: (result: unknown) => states.push(result),
    };
    const definition = {
      id: 'typescript',
      extensions: ['.ts'],
      languageIds: { '.ts': 'typescript' },
      command: process.execPath,
      args: [],
    };
    const coordinator = new WorkspaceFreshnessCoordinator(100, 100, 5000, 0);

    const baseline = await coordinator.reconcile(session, root, definition, []);
    expect(baseline.state).toBe('baseline');
    expect(baseline.scannedFiles).toBe(2);
    expect(notifications).toHaveLength(0);

    await writeFile(path.join(root, 'a.ts'), 'export const a = 123456;\n', 'utf8');
    await writeFile(path.join(root, 'c.ts'), 'export const c = 3;\n', 'utf8');
    await rm(path.join(root, 'b.ts'));

    const refreshed = await coordinator.reconcile(session, root, definition, []);
    expect(refreshed).toMatchObject({ state: 'fresh', created: 1, changed: 1, deleted: 1, eventCount: 3 });
    expect(notifications).toHaveLength(1);
    const changes = notifications[0].params.changes as Array<{ uri: string; type: number }>;
    expect(changes.map(item => item.type).sort()).toEqual([1, 2, 3]);
    expect(bound).toContain(path.join(root, 'c.ts'));
    expect(closed).toContain(path.join(root, 'b.ts'));
    expect(states.at(-1)?.state).toBe('fresh');
  });

  it('shares one in-flight baseline scan across concurrent freshness requests', async () => {
    const root = await fixture();
    const session = {
      notify: () => undefined,
      bindCreatedFile: async () => undefined,
      closeDeletedFile: async () => undefined,
      noteFreshness: () => undefined,
    };
    const definition = {
      id: 'typescript',
      extensions: ['.ts'],
      languageIds: { '.ts': 'typescript' },
      command: process.execPath,
      args: [],
    };
    const coordinator = new WorkspaceFreshnessCoordinator(100, 100, 5000, 0);
    const [left, right] = await Promise.all([
      coordinator.reconcile(session, root, definition, []),
      coordinator.reconcile(session, root, definition, []),
    ]);
    expect(left).toBe(right);
    expect(left.state).toBe('baseline');
  });

  it('honors local .gitignore rules without contacting a remote', async () => {
    const root = await fixture();
    spawnSync('git', ['init', '--quiet'], { cwd: root, windowsHide: true });
    await writeFile(path.join(root, '.gitignore'), 'ignored.ts\n', 'utf8');
    await writeFile(path.join(root, 'ignored.ts'), 'export const ignoredByGit = true;\n', 'utf8');

    const session = {
      notify: () => undefined,
      bindCreatedFile: async () => undefined,
      closeDeletedFile: async () => undefined,
      noteFreshness: () => undefined,
    };
    const definition = {
      id: 'typescript',
      extensions: ['.ts'],
      languageIds: { '.ts': 'typescript' },
      command: process.execPath,
      args: [],
    };
    const result = await new WorkspaceFreshnessCoordinator(100, 100, 5000, 0)
      .reconcile(session, root, definition, []);
    expect(result.scannedFiles).toBe(2);
  });

  it('reports truthful degraded state when the scan bound is exceeded', async () => {
    const root = await fixture();
    const session = {
      notify: () => undefined,
      bindCreatedFile: async () => undefined,
      closeDeletedFile: async () => undefined,
      noteFreshness: () => undefined,
    };
    const definition = {
      id: 'typescript',
      extensions: ['.ts'],
      languageIds: { '.ts': 'typescript' },
      command: process.execPath,
      args: [],
    };
    const coordinator = new WorkspaceFreshnessCoordinator(1, 100, 5000, 0);
    const result = await coordinator.reconcile(session, root, definition, []);
    expect(result.state).toBe('degraded');
    expect(result.truncated).toBe(true);
    expect(result.reason).toBe('SEMANTIC_FRESHNESS_SCAN_TRUNCATED');
  });
});
