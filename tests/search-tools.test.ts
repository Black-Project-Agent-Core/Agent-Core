import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { SearchService } from '../src/runtime/search.js';
import { WorkspacePolicy } from '../src/runtime/workspace.js';

const roots: string[] = [];
async function setup() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-core-search-'));
  roots.push(root);
  const outside = await mkdtemp(path.join(os.tmpdir(), 'agent-core-search-out-'));
  roots.push(outside);
  await mkdir(path.join(root, 'src'));
  await writeFile(path.join(root, 'README.md'), 'Agent Core gateway documentation');
  await writeFile(path.join(root, 'src', 'alpha.ts'), 'export const alpha = "needle";');
  await writeFile(path.join(root, 'src', 'beta.ts'), 'export const beta = "needle";');
  return { root, outside, search: new SearchService(new WorkspacePolicy([root])) };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('SearchService', () => {
  it('searches filenames case-insensitively', async () => {
    const { root, search } = await setup();
    const result = await search.search({ path: root, query: 'ALPHA', mode: 'files', maxResults: 10 });
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]?.path).toBe(path.join(root, 'src', 'alpha.ts'));
  });

  it('searches text content with line numbers and respects result limits', async () => {
    const { root, search } = await setup();
    const result = await search.search({ path: root, query: 'needle', mode: 'content', maxResults: 1 });
    expect(result.matches).toHaveLength(1);
    expect(result.truncated).toBe(true);
    expect(result.matches[0]).toMatchObject({ line: 1 });
  });

  it('tolerates files that disappear during recursive content search', async () => {
    const { root, search } = await setup();
    const churnDir = path.join(root, 'churn');
    await mkdir(churnDir, { recursive: true });
    let running = true;
    const churn = (async () => {
      let index = 0;
      while (running && index < 5000) {
        const file = path.join(churnDir, `volatile-${index % 8}.tmp`);
        await writeFile(file, 'needle transient').catch(() => undefined);
        await rm(file, { force: true }).catch(() => undefined);
        index += 1;
      }
    })();

    try {
      for (let index = 0; index < 100; index++) {
        await expect(search.search({ path: root, query: 'needle', mode: 'content', maxResults: 100 }))
          .resolves.toMatchObject({ matches: expect.any(Array) });
      }
    } finally {
      running = false;
      await churn;
    }
  });

  it('rejects search roots outside the workspace', async () => {
    const { outside, search } = await setup();
    await expect(search.search({ path: outside, query: 'anything', mode: 'files', maxResults: 10 }))
      .rejects.toThrow(/outside allowed roots/i);
  });
});
