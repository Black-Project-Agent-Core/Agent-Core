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
