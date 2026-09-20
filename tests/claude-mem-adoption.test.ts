import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryService } from '../src/memory/service.js';
import { resolveMemoryPaths } from '../src/memory/paths.js';
import * as schemas from '../src/mcp/memory-schemas.js';

const execFileAsync = promisify(execFile);
const roots: string[] = [];

async function git(root: string, ...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', ['-C', root, ...args], {
    windowsHide: true,
    timeout: 10_000,
    encoding: 'utf8',
  });
  return String(stdout ?? '').trim();
}

async function fixture(): Promise<{ projectRoot: string; memoryRoot: string; memory: MemoryService }> {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'agent-core-claude-mem-'));
  roots.push(projectRoot);
  await mkdir(path.join(projectRoot, 'src'), { recursive: true });
  await writeFile(path.join(projectRoot, 'src', 'alpha.ts'), 'export const alpha = 1;\n', 'utf8');
  await writeFile(path.join(projectRoot, 'src', 'beta.ts'), 'export const beta = 1;\n', 'utf8');
  await git(projectRoot, 'init');
  await git(projectRoot, 'config', 'user.email', 'agent-core@example.invalid');
  await git(projectRoot, 'config', 'user.name', 'Agent Core Test');
  await git(projectRoot, 'add', '.');
  await git(projectRoot, 'commit', '-m', 'initial');

  const memoryRoot = path.join(projectRoot, '.memory-test');
  await mkdir(path.join(memoryRoot, 'notes'), { recursive: true });
  await writeFile(path.join(memoryRoot, '00-agent-core-memory.md'), '# Claude Mem Adoption Test Foundation\n', 'utf8');
  const memory = await MemoryService.initialize(projectRoot, memoryRoot);
  return { projectRoot, memoryRoot, memory };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('Claude Mem native adoption', () => {
  it('captures git provenance and reports advisory staleness without invalidating the memory', async () => {
    const { projectRoot, memory } = await fixture();
    const record = await memory.remember({
      content: 'alpha source-backed durable fact',
      provenance: { workspace: 'agent-core', repo: 'fixture', files: ['src/alpha.ts'] },
    });

    expect(record.provenance?.gitCommit).toMatch(/^[0-9a-f]{40}$/);
    expect(record.provenance?.files).toEqual(['src/alpha.ts']);
    expect(await memory.staleness(record.id)).toMatchObject({
      status: 'current',
      changedFiles: [],
    });

    await writeFile(path.join(projectRoot, 'src', 'alpha.ts'), 'export const alpha = 2;\n', 'utf8');
    const changed = await memory.staleness(record.id);
    expect(changed.status).toBe('changed');
    expect(changed.changedFiles).toEqual(['src/alpha.ts']);
    expect((await memory.read(record.id, false))?.content).toBe('alpha source-backed durable fact');
  });

  it('fails soft for unanchored and non-local provenance', async () => {
    const { memory } = await fixture();
    const plain = await memory.remember({ content: 'unanchored fact' });
    expect(await memory.staleness(plain.id)).toMatchObject({ status: 'unanchored' });

    const external = await memory.remember({
      content: 'external workspace fact',
      provenance: { workspace: 'other-workspace', files: ['src/alpha.ts'], gitCommit: 'abcdef1' },
    });
    expect(await memory.staleness(external.id)).toMatchObject({ status: 'source-unavailable' });
  });

  it('preserves bounded prior content revisions only for committed content changes', async () => {
    const { memory } = await fixture();
    const record = await memory.remember({ content: 'revision-v0', tags: ['initial'] });

    await memory.update(record.id, { content: 'revision-v1' });
    let history = await memory.revisions(record.id, 8);
    expect(history.warning).toBeUndefined();
    expect(history.revisions).toHaveLength(1);
    expect(history.revisions[0]?.record.content).toBe('revision-v0');

    await memory.update(record.id, { tags: ['metadata-only'] });
    history = await memory.revisions(record.id, 8);
    expect(history.revisions).toHaveLength(1);

    for (let index = 2; index <= 11; index += 1) {
      await memory.update(record.id, { content: `revision-v${index}` });
    }
    history = await memory.revisions(record.id, 8);
    expect(history.revisions).toHaveLength(8);
    expect(history.revisions[0]?.record.content).toBe('revision-v10');
    expect(history.revisions[7]?.record.content).toBe('revision-v3');
  });

  it('does not create a false revision when a batch transaction fails', async () => {
    const { memory } = await fixture();
    const record = await memory.remember({ content: 'atomic-before' });
    const before = await memory.revisions(record.id, 8);

    await expect(memory.batch([
      { op: 'update', id: record.id, patch: { content: 'must-not-commit' } },
      { op: 'update', id: 'missing-memory-id', patch: { content: 'fail' } },
    ])).rejects.toThrow(/Memory not found/);

    expect((await memory.read(record.id, false))?.content).toBe('atomic-before');
    expect((await memory.revisions(record.id, 8)).revisions).toEqual(before.revisions);
  });

  it('keeps canonical reads available when revision state is malformed', async () => {
    const { projectRoot, memoryRoot, memory } = await fixture();
    const record = await memory.remember({ content: 'canonical-survives-revision-corruption' });
    const revisionsPath = path.join(resolveMemoryPaths(projectRoot, memoryRoot).revisions, `${record.id}.json`);
    await mkdir(path.dirname(revisionsPath), { recursive: true });
    await writeFile(revisionsPath, '{broken', 'utf8');

    expect((await memory.read(record.id, false))?.content).toBe('canonical-survives-revision-corruption');
    const history = await memory.revisions(record.id, 8);
    expect(history.revisions).toEqual([]);
    expect(history.warning).toMatch(/revision|JSON/i);
    await expect(memory.update(record.id, { content: 'must-not-overwrite-corrupt-audit' }))
      .rejects.toThrow();
  });

  it('adds a transparent bounded source-file boost without changing default search behavior', async () => {
    const { memory } = await fixture();
    const alpha = await memory.remember({
      content: 'shared retrieval marker',
      provenance: { files: ['src/alpha.ts'] },
    });
    const beta = await memory.remember({
      content: 'shared retrieval marker',
      provenance: { files: ['src/beta.ts'] },
    });

    const defaultResults = await memory.search('shared retrieval marker', { limit: 2, maxNeighbors: 0 });
    expect(defaultResults).toHaveLength(2);
    expect(defaultResults.every((item) => item.components.sourceFileMatch === 0)).toBe(true);

    const contextual = await memory.search('shared retrieval marker', {
      limit: 2,
      maxNeighbors: 0,
      sourceFiles: ['src/alpha.ts'],
    });
    expect(contextual[0]?.record.id).toBe(alpha.id);
    expect(contextual[0]?.components.sourceFileMatch).toBeGreaterThan(0);
    expect(contextual.find((item) => item.record.id === beta.id)?.components.sourceFileMatch).toBe(0);
  });

  it('accepts the additive MCP schema fields without making them required', () => {
    expect(() => schemas.memoryRemember.parse({
      content: 'schema provenance',
      provenance: { files: ['src/alpha.ts'] },
    })).not.toThrow();
    expect(() => schemas.memoryUpdate.parse({
      id: 'memory-abc',
      provenance: { files: ['src/alpha.ts'], gitCommit: 'abcdef1' },
    })).not.toThrow();
    expect(() => schemas.memorySearch.parse({
      query: 'schema search',
      sourceFiles: ['src/alpha.ts'],
    })).not.toThrow();
    expect(() => schemas.memoryRead.parse({
      id: 'memory-abc',
      revisionLimit: 8,
    })).not.toThrow();
    expect(schemas.memorySearch.parse({ query: 'legacy compatible' }).sourceFiles).toBeUndefined();
    expect(schemas.memoryRead.parse({ id: 'memory-abc' }).revisionLimit).toBeUndefined();
  });
});
