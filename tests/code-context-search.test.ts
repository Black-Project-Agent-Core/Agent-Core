import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearCodeContextIndexCache, searchCodeContext } from '../src/code-intelligence/context-search.js';
import * as schemas from '../src/mcp/code-intelligence-schemas.js';

let root: string;

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'code-context-'));
  clearCodeContextIndexCache();
});

afterEach(async () => {
  clearCodeContextIndexCache();
  await rm(root, { recursive: true, force: true });
});

async function write(relative: string, text: string): Promise<void> {
  const target = path.join(root, relative);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, text, 'utf8');
}

describe('code_orient action=context (lexical code context)', () => {
  it('returns the line range of the body that holds the query terms', async () => {
    await write('src/memory/retrieval.ts', [
      'export function searchMemories(query) {',
      '  const lexical = buildBm25Profile(records, query);',
      '  const semantic = await embedQuery(query);',
      '  return fuseRanked(lexical, semantic);',
      '}',
    ].join('\n'));
    await write('src/other.ts', 'export const unrelated = 1;\n');

    const result = await searchCodeContext({ root, query: 'fuse lexical semantic' });

    expect(result.hits[0]?.path).toBe('src/memory/retrieval.ts');
    expect(result.hits[0]?.startLine).toBeLessThanOrEqual(4);
    expect(result.hits[0]?.endLine).toBeGreaterThanOrEqual(4);
    expect(result.hits[0]?.snippet).toContain('fuseRanked');
  });

  it('never indexes runtime, dotenv, or key files', async () => {
    await write('runtime/backup/retrieval.ts', 'export function fuseRanked() {}\n');
    await write('.env', 'EMBED_KEY=fuseRanked-token-123\n');
    await write('certs/server.pem', 'fuseRanked\n');
    await write('src/retrieval.ts', 'export function fuseRanked() {}\n');

    const result = await searchCodeContext({ root, query: 'fuseRanked' });
    const paths = result.hits.map(hit => hit.path);

    expect(paths).toContain('src/retrieval.ts');
    expect(paths.some(p => p.startsWith('runtime/') || p === '.env' || p.endsWith('.pem'))).toBe(false);
  });

  it('masks credential-shaped text in snippets', async () => {
    await write('src/client.ts', [
      'const apiKey = "sk-abcdefghijklmnopqrstuvwxyz123456";',
      'export function callApi() { return apiKey; }',
    ].join('\n'));

    const result = await searchCodeContext({ root, query: 'callApi apiKey' });
    const snippets = result.hits.map(hit => hit.snippet).join('\n');

    expect(snippets).toContain('[REDACTED:');
    expect(snippets).not.toContain('sk-abcdefghijklmnopqrstuvwxyz123456');
  });

  it('bounds hits and rejects a missing root', async () => {
    for (let i = 0; i < 6; i += 1) {
      await write(`src/module${i}.ts`, 'export function sharedTerm() { return sharedTerm; }\n');
    }

    const result = await searchCodeContext({ root, query: 'sharedTerm', limit: 2 });

    expect(result.hits.length).toBeLessThanOrEqual(2);
    await expect(searchCodeContext({ root: path.join(root, 'missing'), query: 'sharedTerm' }))
      .rejects.toThrow('CODE_CONTEXT_ROOT_INVALID');
    expect(schemas.codeOrient.parse({ action: 'context', query: 'sharedTerm' }).action).toBe('context');
  });
});
