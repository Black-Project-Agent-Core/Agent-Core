import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/tracker/activity-tracker.js', () => ({ activityTracker: {
  record: vi.fn(), recordOutcome: vi.fn(), captureFailure: vi.fn(), readFeatureOutcomes: () => [],
} }));
import { writeStateFile } from '../src/persistence/state-file.js';
import { memoryTaskFixture } from './memory/memory-task-test-utils.js';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
async function tempRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-core-state-file-'));
  roots.push(root);
  return root;
}
const isCompact = (text: string) => text === JSON.stringify(JSON.parse(text)) + '\n';

describe('writeStateFile serialization', () => {
  it('keeps the two-space default byte-identical for callers that pass no option', async () => {
    const file = path.join(await tempRoot(), 'state.json');
    const value = { version: 1, items: [{ id: 'a', nested: { n: 1 } }] };
    await writeStateFile(file, value);
    expect(await readFile(file, 'utf8')).toBe(JSON.stringify(value, null, 2) + '\n');
  });

  it('writes one compact line on request and keeps the previous generation in .last-good', async () => {
    const file = path.join(await tempRoot(), 'state.json');
    const first = { version: 1, items: [] }, second = { version: 1, items: [{ id: 'b' }] };
    await writeStateFile(file, first);
    const previous = await readFile(file, 'utf8');
    await writeStateFile(file, second, { compact: true });
    const written = await readFile(file, 'utf8');
    expect(written).toBe(JSON.stringify(second) + '\n');
    expect(await readFile(file + '.last-good', 'utf8')).toBe(previous);
  });

  it('still refuses to overwrite an unreadable state when compact', async () => {
    const file = path.join(await tempRoot(), 'state.json');
    await writeFile(file, '{ not json', 'utf8');
    await expect(writeStateFile(file, { version: 1 }, { compact: true })).rejects.toThrow('STATE_DEGRADED_WRITE_REFUSED');
    expect(await readFile(file, 'utf8')).toBe('{ not json');
  });
});

describe('external controller state file', () => {
  it('rewrites a legacy indented state compactly with identical existing episodes', async () => {
    const f = await memoryTaskFixture(); roots.push(f.root);
    const statePath = path.join(f.root, 'external', 'external-controller.json');
    const first = await f.start('owner-a', 'transport', 'compact-first');
    expect(isCompact(await readFile(statePath, 'utf8'))).toBe(true);

    const legacy = JSON.stringify(JSON.parse(await readFile(statePath, 'utf8')), null, 2) + '\n';
    await writeFile(statePath, legacy, 'utf8');
    await f.start('owner-a', 'transport-2', 'compact-second');

    const rewritten = await readFile(statePath, 'utf8');
    expect(isCompact(rewritten)).toBe(true);
    expect(await readFile(statePath + '.last-good', 'utf8')).toBe(legacy);
    const before = JSON.parse(legacy).episodes.find((item: any) => item.id === first.id);
    const after = JSON.parse(rewritten).episodes.find((item: any) => item.id === first.id);
    expect(after).toEqual(before);
  });
});
