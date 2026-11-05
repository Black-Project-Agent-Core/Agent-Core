import { mkdtemp, mkdir, rm, rmdir, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as contextSearch from '../src/code-intelligence/context-search.js';
import * as schemas from '../src/mcp/code-intelligence-schemas.js';
import { registerCodeIntelligenceTools } from '../src/mcp/code-intelligence-tools.js';
import { activityTracker } from '../src/tracker/activity-tracker.js';

let root: string;
const scratch: string[] = [];

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'code-context-'));
  contextSearch.clearCodeContextIndexCache();
});

afterEach(async () => {
  contextSearch.clearCodeContextIndexCache();
  vi.restoreAllMocks();
  await rm(root, { recursive: true, force: true });
  for (const dir of scratch.splice(0)) await rm(dir, { recursive: true, force: true });
});

async function write(relative: string, text: string | Buffer): Promise<void> {
  const target = path.join(root, relative);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, text);
}

describe('code_orient action=context: lexical code context and hardening', () => {
  it('returns the line range of the body that holds the query terms', async () => {
    await write('src/memory/retrieval.ts', [
      'export function searchMemories(query) {',
      '  const lexical = buildBm25Profile(records, query);',
      '  const semantic = await embedQuery(query);',
      '  return fuseRanked(lexical, semantic);',
      '}',
    ].join('\n'));
    await write('src/other.ts', 'export const unrelated = 1;\n');

    const result = await contextSearch.searchCodeContext({ root, query: 'fuse lexical semantic' });

    expect(result.hits[0]?.path).toBe('src/memory/retrieval.ts');
    expect(result.hits[0]!.startLine).toBeLessThanOrEqual(4);
    expect(result.hits[0]!.endLine).toBeGreaterThanOrEqual(4);
    expect(result.hits[0]!.snippet).toContain('fuseRanked');
  });

  it('never indexes runtime, dotenv, key, appsettings, or nested secret folders, in any letter case', async () => {
    await write('runtime/backup/retrieval.ts', 'export function fuseRanked() {}\n');
    await write('Secrets/vault.ts', 'export function fuseRanked() {}\n');
    await write('.env', 'EMBED_KEY=fuseRanked-token-123\n');
    await write('certs/server.pem', 'fuseRanked\n');
    await write('src/config/secrets/vault2.ts', 'export function fuseRanked() {}\n');
    await write('src/appsettings.Production.json', '{"fuseRanked": true}\n');
    await write('src/retrieval.ts', 'export function fuseRanked() {}\n');

    const result = await contextSearch.searchCodeContext({ root, query: 'fuseRanked' });
    const paths = result.hits.map(hit => hit.path);
    const forbidden = [/^runtime\//i, /^secrets\//i, /(^|\/)secrets\//i, /^\.env$/, /\.pem$/i, /appsettings/i];

    expect(paths).toContain('src/retrieval.ts');
    expect(paths.filter(p => forbidden.some(pattern => pattern.test(p)))).toEqual([]);
  });

  it('masks credential-shaped text in snippets, including passwords with no digits or symbols', async () => {
    await write('src/client.ts', [
      'const apiKey = "sk-abcdefghijklmnopqrstuvwxyz123456";',
      'export function callApi() { return apiKey; }',
      'const password = "correcthorsebattery";',
      'const admin = { password: "P@ssw0rd!" };',
    ].join('\n'));

    const result = await contextSearch.searchCodeContext({ root, query: 'callApi password admin' });
    const snippets = result.hits.map(hit => hit.snippet).join('\n');

    expect(snippets).toContain('[REDACTED:');
    expect(snippets).not.toContain('sk-abcdefghijklmnopqrstuvwxyz123456');
    expect(snippets).not.toContain('correcthorsebattery');
    expect(snippets).not.toContain('P@ssw0rd!');
  });

  it('bounds hits per request and refuses a missing root', async () => {
    for (let i = 0; i < 6; i += 1) {
      await write(`src/module${i}.ts`, 'export function sharedTerm() { return sharedTerm; }\n');
    }

    const result = await contextSearch.searchCodeContext({ root, query: 'sharedTerm', limit: 2 });

    expect(result.hits.length).toBeLessThanOrEqual(2);
    await expect(contextSearch.searchCodeContext({ root: path.join(root, 'missing'), query: 'sharedTerm' }))
      .rejects.toThrow('CODE_CONTEXT_ROOT_INVALID');
    expect(schemas.codeOrient.parse({ action: 'context', query: 'sharedTerm' }).action).toBe('context');
  });

  it('serves line ranges that match the current file after an edit inside the cache window', async () => {
    await write('src/edit.ts', 'export function fuseRanked() {\n  return 1;\n}\n');
    const first = await contextSearch.searchCodeContext({ root, query: 'fuseRanked' });
    expect(first.hits[0]?.startLine).toBe(1);

    const header = Array.from({ length: 10 }, (_, i) => `// header line ${i + 1}`);
    await write('src/edit.ts', [...header, 'export function fuseRanked() {', '  return 2;', '}', ''].join('\n'));

    const second = await contextSearch.searchCodeContext({ root, query: 'fuseRanked' });
    const hit = second.hits[0];
    expect(hit?.path).toBe('src/edit.ts');
    expect(hit!.startLine).toBeLessThanOrEqual(11);
    expect(hit!.endLine).toBeGreaterThanOrEqual(11);
    expect(hit!.snippet).toContain('fuseRanked');
  });

  it('reports names of oversized and binary files that were skipped', async () => {
    await write('src/keep.ts', 'export const keepMarker = 1;\n');
    await write('src/big.ts', `export const bigMarker = 1;\n${'x'.repeat(Math.floor(2.1 * 1024 * 1024))}\n`);
    await write('src/blob.json', Buffer.from([0x7b, 0x00, 0x7d]));

    const result = await contextSearch.searchCodeContext({ root, query: 'keepMarker' });

    expect(result.hits[0]?.path).toBe('src/keep.ts');
    expect(result.index.skippedByReason['too-large']).toBe(1);
    expect(result.index.skippedByReason.binary).toBe(1);
    expect(result.index.skippedSamples.map(sample => sample.path)).toEqual(expect.arrayContaining(['src/big.ts', 'src/blob.json']));
  });

  it('indexes text files up to 2 MiB, so long architecture documents stay searchable', async () => {
    const filler = Array.from({ length: 6000 }, (_, i) => `Filler line ${i} describes an ordinary paragraph of project notes.`).join('\n');
    await write('docs/ARCHITECTURE.md', `${filler}\nArchitectureMarkerZeta closes this document.\n`);

    const result = await contextSearch.searchCodeContext({ root, query: 'ArchitectureMarkerZeta' });

    expect(result.hits[0]?.path).toBe('docs/ARCHITECTURE.md');
    expect(result.index.skippedByReason['too-large']).toBeUndefined();
  });

  it.runIf(process.platform === 'win32')('does not descend into a junction that points outside the root', async () => {
    const outside = await mkdtemp(path.join(os.tmpdir(), 'code-context-outside-'));
    scratch.push(outside);
    await writeFile(path.join(outside, 'zone.ts'), 'export const junctionMarkerQ7 = 1;\n');
    const link = path.join(root, 'linked');
    await symlink(outside, link, 'junction');
    await write('src/inside.ts', 'export const insideMarkerQ7 = 1;\n');

    try {
      const escaped = await contextSearch.searchCodeContext({ root, query: 'junctionMarkerQ7' });
      expect(escaped.hits.filter(hit => hit.path.startsWith('linked/'))).toEqual([]);

      const inside = await contextSearch.searchCodeContext({ root, query: 'insideMarkerQ7' });
      expect(inside.hits[0]?.path).toBe('src/inside.ts');
    } finally {
      // Remove the link itself, not its target, so the generic cleanup never walks into it.
      await rmdir(link).catch(() => undefined);
    }
  });

  it('builds the index once for concurrent cold calls', async () => {
    await write('src/one.ts', 'export const singleFlightMarker = 1;\n');
    const before = contextSearch.codeContextStats().indexBuilds;

    const [first, second] = await Promise.all([
      contextSearch.searchCodeContext({ root, query: 'singleFlightMarker' }),
      contextSearch.searchCodeContext({ root, query: 'singleFlightMarker' }),
    ]);

    expect(contextSearch.codeContextStats().indexBuilds - before).toBe(1);
    expect(first.hits[0]?.path).toBe('src/one.ts');
    expect(second.hits[0]?.path).toBe('src/one.ts');
  });

  it('reports truncation by file count and by the build time budget', async () => {
    for (let i = 0; i < 6; i += 1) await write(`src/part${i}.ts`, `export const partMarker${i} = ${i};\n`);

    const byFiles = await contextSearch.searchCodeContext({ root, query: 'partMarker', limits: { maxFiles: 3 } });
    expect(byFiles.index.truncated).toBe(true);
    expect(byFiles.index.truncatedReason).toBe('max-files');

    const byTime = await contextSearch.searchCodeContext({ root, query: 'partMarker', limits: { buildBudgetMs: 0 } });
    expect(byTime.index.truncated).toBe(true);
    expect(byTime.index.truncatedReason).toBe('time-budget');
  });

  it('serves action=context through the tool handler and records telemetry', async () => {
    await write('src/handler.ts', 'export function handlerMarkerR9() { return 1; }\n');
    const record = vi.spyOn(activityTracker, 'record').mockImplementation(() => undefined as any);
    const handlers = new Map<string, (args: unknown) => Promise<any>>();
    const server = {
      registerTool: (name: string, _config: unknown, handler: (args: unknown) => Promise<any>) => {
        handlers.set(name, handler);
      },
    } as any;
    const service = { resolveWorkspace: vi.fn(async () => ({ workspace: 'w', group: 'w', cwd: root })) } as any;

    registerCodeIntelligenceTools(server, service);
    const handler = handlers.get('code_orient');
    expect(handler).toBeTypeOf('function');

    const response = await handler!({ action: 'context', query: 'handlerMarkerR9' });
    expect(response.isError).not.toBe(true);
    const payload = JSON.parse(response.content[0].text);
    expect(payload.hits[0]?.path).toBe('src/handler.ts');
    expect(record).toHaveBeenCalledWith(
      'CODE_INTELLIGENCE',
      'success',
      'code_orient completed',
      'code-intelligence-tool',
      expect.objectContaining({ family: 'code_orient', action: 'context' }),
    );
  });
});
