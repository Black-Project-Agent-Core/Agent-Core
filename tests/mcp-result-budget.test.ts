import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { applyResultBudget } from '../src/mcp/result-budget.js';

const roots: string[] = [];
async function tempDir() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-core-result-budget-'));
  roots.push(root);
  return root;
}
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

describe('MCP result budget', () => {
  it('leaves small results unchanged', async () => {
    const result = { content: [{ type: 'text', text: 'small' }] };
    expect(await applyResultBudget('list_sessions', result, { budgetChars: 16 * 1024 })).toBe(result);
  });

  it('redacts and spills an oversized result to a retrievable local artifact', async () => {
    const storageDir = await tempDir();
    const secret = 'api_key=agent_core_secret_example123';
    const result = { content: [{ type: 'text', text: secret + '\n' + 'x'.repeat(20_000) }] };
    const bounded = await applyResultBudget('list_processes', result, {
      budgetChars: 16 * 1024,
      previewChars: 2048,
      storageDir,
    });
    const metadata = (bounded._meta as any).resultBudget;
    expect(metadata.spilled).toBe(true);
    expect(bounded.content[0].text).not.toContain(secret);
    const persisted = await readFile(metadata.artifact, 'utf8');
    expect(persisted).not.toContain(secret);
    expect(persisted).toContain('[REDACTED]');
  });

  it('does not persist oversized results from sensitive-capable tools', async () => {
    const storageDir = await tempDir();
    const result = { content: [{ type: 'text', text: 'authorization=top-secret\n' + 'z'.repeat(20_000) }] };
    const bounded = await applyResultBudget('read_file', result, {
      budgetChars: 16 * 1024,
      previewChars: 2048,
      storageDir,
    });
    expect((bounded._meta as any).resultBudget).toMatchObject({ spilled: false, reason: 'non-persistable-tool' });
    expect(bounded.content[0].text).not.toContain('top-secret');
    expect(await readdir(storageDir)).toEqual([]);
  });
});

describe('browser screenshot privacy budget', () => {
  const screenshot = (bytes: number, extra: Record<string, unknown> = {}) => ({
    content: [
      { type: 'text', text: JSON.stringify({ capture: { captureId: 'fixture' } }) },
      { type: 'image', mimeType: 'image/jpeg', data: Buffer.alloc(bytes, 42).toString('base64') },
    ],
    ...extra,
  });

  it('preserves an allowed browser screenshot exactly even with a smaller generic text budget', async () => {
    const storageDir = await tempDir();
    const result = screenshot(128 * 1024);
    expect((await applyResultBudget('browser_control', result, { budgetChars: 16 * 1024, storageDir })) === result).toBe(true);
    expect(await readdir(storageDir)).toEqual([]);
  });

  it.each([
    ['image', () => screenshot(128 * 1024 + 1)],
    ['metadata', () => screenshot(100, { structuredContent: { extra: 'x'.repeat(16 * 1024) } })],
    ['duplicated pixels', () => { const value = screenshot(100); return { ...value, structuredContent: { image: value.content[1] } }; }],
    ['invalid base64', () => ({ content: [{ type: 'image', mimeType: 'image/jpeg', data: 'invalid@@' }] })],
    ['extra image', () => { const value = screenshot(100); return { content: [...value.content, value.content[1]] }; }],
    ['serialized envelope', () => { const value = screenshot(128 * 1024); return { content: [{ type: 'text', text: '\u0000'.repeat(16 * 1024) }, value.content[1]] }; }],
    ['unbounded image metadata', () => { const value = screenshot(100); return { content: [{ ...value.content[1], _meta: { extra: 'x'.repeat(16 * 1024) } }] }; }],
    ['unbounded text-block metadata', () => { const value = screenshot(100); return { content: [{ ...value.content[0], _meta: { extra: 'x'.repeat(16 * 1024) } }, value.content[1]] }; }],
  ])('rejects %s without persisting any screenshot bytes', async (_label, makeResult) => {
    const storageDir = await tempDir();
    const result = await applyResultBudget('browser_control', makeResult(), { storageDir });
    expect(result.isError).toBe(true);
    expect(result.content).toEqual([{ type: 'text', text: expect.stringContaining('BROWSER_SCREENSHOT_RESULT_INVALID') }]);
    expect((result._meta as any)?.resultBudget).toMatchObject({ spilled: false, reason: 'browser-screenshot-budget' });
    expect(await readdir(storageDir)).toEqual([]);
  });

  it('keeps ordinary browser text results on the existing generic budget', async () => {
    const storageDir = await tempDir();
    const result = await applyResultBudget('browser_control', { content: [{ type: 'text', text: 'x'.repeat(20_000) }] }, { budgetChars: 16 * 1024, storageDir });
    expect((result._meta as any)?.resultBudget.spilled).toBe(true);
  });
});
