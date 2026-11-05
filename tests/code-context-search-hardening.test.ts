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

// Directory mtimes can tie with the previous write inside one clock tick, so wait a tick before adding an entry.
function tick(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 25));
}

// Registers the tools and returns the code_orient handler, the way the MCP server calls it.
function codeOrientHandler(service: Record<string, unknown>): (args: unknown) => Promise<any> {
  const handlers = new Map<string, (args: unknown) => Promise<any>>();
  const server = {
    registerTool: (name: string, _config: unknown, handler: (args: unknown) => Promise<any>) => {
      handlers.set(name, handler);
    },
  } as any;
  registerCodeIntelligenceTools(server, service as any);
  const handler = handlers.get('code_orient');
  if (!handler) throw new Error('code_orient is not registered');
  return handler;
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
    const padding = Array.from({ length: 60 }, (_, i) => `// padding ${i + 1}`);
    await write('src/edit.ts', [...padding, 'export function fuseRanked() {', '  return 1;', '}', ''].join('\n'));
    const first = await contextSearch.searchCodeContext({ root, query: 'fuseRanked' });
    expect(first.hits[0]?.snippet).toContain('return 1');

    const header = Array.from({ length: 10 }, (_, i) => `// header line ${i + 1}`);
    await write('src/edit.ts', [...header, ...padding, 'export function fuseRanked() {', '  return 2;', '}', ''].join('\n'));

    const second = await contextSearch.searchCodeContext({ root, query: 'fuseRanked' });
    const hit = second.hits[0];
    expect(hit?.path).toBe('src/edit.ts');
    // The function now starts on line 71: 10 header lines, 60 padding lines, then the declaration.
    expect(hit!.startLine).toBeLessThanOrEqual(71);
    expect(hit!.endLine).toBeGreaterThanOrEqual(71);
    expect(hit!.snippet).toContain('return 2');
    expect(hit!.snippet).not.toContain('return 1');
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
    // A cut file list still yields hits from the files that were kept.
    expect(byFiles.hits.length).toBeGreaterThan(0);

    const byTime = await contextSearch.searchCodeContext({ root, query: 'partMarker', limits: { buildBudgetMs: 0 } });
    expect(byTime.index.truncated).toBe(true);
    expect(byTime.index.truncatedReason).toBe('time-budget');
  });

  it('serves action=context through the tool handler and records telemetry', async () => {
    await write('src/handler.ts', 'export function handlerMarkerR9() { return 1; }\n');
    const record = vi.spyOn(activityTracker, 'record').mockImplementation(() => undefined as any);
    const service = { resolveWorkspace: vi.fn(async () => ({ workspace: 'w', group: 'w', cwd: root })) };
    const handler = codeOrientHandler(service);

    const response = await handler({ action: 'context', query: 'handlerMarkerR9' });
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

  it('masks compound secret names (camelCase, SCREAMING_SNAKE, snake_case) and keeps type annotations readable', async () => {
    await write('src/compound.ts', [
      'const dbPassword = "hunter2hunter2";',
      'const DB_PASSWORD = "correcthorsebattery";',
      'const session = { access_token: "abcdefghijklmnop" };',
      'interface Creds { password: string; }',
    ].join('\n'));

    const result = await contextSearch.searchCodeContext({ root, query: 'dbPassword session creds' });
    const snippets = result.hits.map(hit => hit.snippet).join('\n');

    expect(snippets).not.toContain('hunter2hunter2');
    expect(snippets).not.toContain('correcthorsebattery');
    expect(snippets).not.toContain('abcdefghijklmnop');
    expect(snippets).toContain('password: string');
  });

  it('finds a file created after the index was built, without waiting for the TTL', async () => {
    await write('src/first.ts', 'export const firstMarker = 1;\n');
    await contextSearch.searchCodeContext({ root, query: 'firstMarker' });

    await tick();
    await write('b.ts', 'export const newlyCreatedMarkerQ9 = 1;\n');
    const result = await contextSearch.searchCodeContext({ root, query: 'newlyCreatedMarkerQ9' });

    expect(result.status).toBe('ok');
    expect(result.hits[0]?.path).toBe('b.ts');
    expect(result.index.rebuilt).toBe(true);
  });

  it('keeps src, tests, and scripts ahead of docs when the file list is cut', async () => {
    await write('docs/guide.md', 'PriorityMarkerZ1 described in prose\n');
    await write('src/app.ts', 'export const PriorityMarkerZ1 = 1;\n');
    await write('tests/app.test.ts', 'export const PriorityMarkerZ1 = 2;\n');
    await write('scripts/build.ts', 'export const PriorityMarkerZ1 = 3;\n');

    const result = await contextSearch.searchCodeContext({ root, query: 'PriorityMarkerZ1', limits: { maxFiles: 2 } });
    const paths = result.hits.map(hit => hit.path);

    expect(result.index.truncatedReason).toBe('max-files');
    expect(paths).toEqual(expect.arrayContaining(['src/app.ts', 'tests/app.test.ts']));
    expect(paths.some(p => p.startsWith('docs/'))).toBe(false);
  });

  it('rebuilds once when concurrent queries both find a new file', async () => {
    await write('src/seed.ts', 'export const seedMarkerY4 = 1;\n');
    await contextSearch.searchCodeContext({ root, query: 'seedMarkerY4' });

    await tick();
    await write('late.ts', 'export const concurrentMarkerY4 = 1;\n');
    const before = contextSearch.codeContextStats().indexBuilds;

    const [first, second] = await Promise.all([
      contextSearch.searchCodeContext({ root, query: 'concurrentMarkerY4' }),
      contextSearch.searchCodeContext({ root, query: 'concurrentMarkerY4' }),
    ]);

    expect(contextSearch.codeContextStats().indexBuilds - before).toBe(1);
    expect(first.hits[0]?.path).toBe('late.ts');
    expect(second.hits[0]?.path).toBe('late.ts');
  });

  it('masks backtick values, Go := assignments, and a secret after a type annotation', async () => {
    await write('src/creds.ts', [
      '// connection config for the lookup',
      'const apiToken = `tickValueOnly`;',
      'const password: string = "correcthorsebattery";',
      'password := "gopherSecretValue"',
      'const conn = "Server=db;Password=secret;"',
    ].join('\n'));

    const result = await contextSearch.searchCodeContext({ root, query: 'apiToken password conn' });
    const snippets = result.hits.map(hit => hit.snippet).join('\n');

    expect(snippets).not.toContain('tickValueOnly');
    expect(snippets).not.toContain('correcthorsebattery');
    expect(snippets).not.toContain('gopherSecretValue');
    expect(snippets).not.toContain('secret;');
    expect(snippets).toContain('password: string');
  });

  it('never returns key material from a window that starts inside a PEM body', async () => {
    const keyBody = Array.from({ length: 60 }, (_, i) =>
      `MIIEpAIBAAKCAQEAu1bKhQ8pZkFwOzT3sqLxR9mNvYcHtG2dWeXfJaUoSbEi${String(i).padStart(3, '0')}`);
    await write('src/keys.ts', [
      ...Array.from({ length: 12 }, (_, i) => `// prose line ${i + 1}`),
      '-----BEGIN RSA PRIVATE KEY-----',
      ...keyBody,
      '-----END RSA PRIVATE KEY-----',
      ...Array.from({ length: 30 }, (_, i) => `export const after${i} = ${i};`),
      '',
    ].join('\n'));

    // A body line that sits in a window which does not contain the BEGIN line.
    const result = await contextSearch.searchCodeContext({ root, query: keyBody[30]! });
    const snippets = result.hits.map(hit => hit.snippet).join('\n');

    expect(snippets).not.toContain(keyBody[30]!);
    expect(snippets).not.toContain('MIIEpAIBAAKCAQEAu1bK');
  });

  it.runIf(process.platform === 'win32')('does not record the name of a denied link, but records an ordinary one', async () => {
    const outside = await mkdtemp(path.join(os.tmpdir(), 'code-context-outside-'));
    scratch.push(outside);
    await writeFile(path.join(outside, 'zone.ts'), 'export const outsideLinkMarkerW1 = 1;\n');
    const secretsLink = path.join(root, 'secrets');
    const ordinaryLink = path.join(root, 'linked-ok');
    await symlink(outside, secretsLink, 'junction');
    await symlink(outside, ordinaryLink, 'junction');
    await write('src/keep.ts', 'export const linkKeepMarkerW1 = 1;\n');

    try {
      const result = await contextSearch.searchCodeContext({ root, query: 'linkKeepMarkerW1' });
      const sampled = result.index.skippedSamples.map(sample => sample.path);

      expect(result.hits[0]?.path).toBe('src/keep.ts');
      expect(sampled).not.toContain('secrets');
      expect(sampled).toContain('linked-ok');
    } finally {
      // Remove the links themselves, not their targets, so the generic cleanup never walks into them.
      await rmdir(secretsLink).catch(() => undefined);
      await rmdir(ordinaryLink).catch(() => undefined);
    }
  });

  it('answers a query with no searchable terms without building an index', async () => {
    await write('src/any.ts', 'export const anyMarker = 1;\n');
    const before = contextSearch.codeContextStats().indexBuilds;

    const result = await contextSearch.searchCodeContext({ root, query: 'the and of' });

    expect(result.status).toBe('empty-query');
    expect(result.hits).toEqual([]);
    expect(contextSearch.codeContextStats().indexBuilds - before).toBe(0);
  });

  it('reports token-limit truncation for a window too dense to tokenize in full', async () => {
    await write('src/dense.ts', `${'alpha1 '.repeat(5000)}\n`);

    const result = await contextSearch.searchCodeContext({ root, query: 'alpha1' });

    expect(result.index.truncatedReason).toBe('token-limit');
    expect(result.hits[0]?.path).toBe('src/dense.ts');
  });

  it('refuses a search root inside a denied folder or above the repository', async () => {
    await write('secrets/vault.ts', 'export const vaultMarkerK2 = 1;\n');
    await write('src/app.ts', 'export const appMarkerK2 = 1;\n');
    vi.spyOn(activityTracker, 'record').mockImplementation(() => undefined as any);
    const handler = codeOrientHandler({
      resolveWorkspace: vi.fn(async (context: { worktreePath?: string }) => ({
        workspace: 'w',
        group: 'w',
        cwd: root,
        worktreePath: context.worktreePath,
      })),
    });

    const inDenied = await handler({ action: 'context', query: 'vaultMarkerK2', worktreePath: path.join(root, 'secrets') });
    expect(inDenied.isError).toBe(true);
    expect(inDenied.content[0].text).toContain('CODE_CONTEXT_ROOT_DENIED');

    const aboveRepo = await handler({ action: 'context', query: 'appMarkerK2', worktreePath: path.dirname(root) });
    expect(aboveRepo.isError).toBe(true);
    expect(aboveRepo.content[0].text).toContain('CODE_CONTEXT_ROOT_TOO_BROAD');

    const inside = await handler({ action: 'context', query: 'appMarkerK2', worktreePath: path.join(root, 'src') });
    expect(inside.isError).not.toBe(true);
    expect(JSON.parse(inside.content[0].text).hits[0]?.path).toBe('app.ts');
  });

  it('checks the requested ref before reading the working tree', async () => {
    await write('src/ref.ts', 'export const refMarkerR3 = 1;\n');
    vi.spyOn(activityTracker, 'record').mockImplementation(() => undefined as any);
    const assertRequestedRef = vi.fn(async () => {
      throw new Error('CODE_INTELLIGENCE_REF_MISMATCH: requested=release worktreeHead=main');
    });
    const handler = codeOrientHandler({
      resolveWorkspace: vi.fn(async () => ({ workspace: 'w', group: 'w', cwd: root, ref: 'release' })),
      assertRequestedRef,
    });

    const response = await handler({ action: 'context', query: 'refMarkerR3', ref: 'release' });

    expect(assertRequestedRef).toHaveBeenCalledTimes(1);
    expect(response.isError).toBe(true);
    expect(response.content[0].text).toContain('CODE_INTELLIGENCE_REF_MISMATCH');
  });
});
