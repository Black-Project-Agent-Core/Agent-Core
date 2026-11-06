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

  it('indexes a new file once for concurrent queries, without a full rebuild', async () => {
    await write('src/seed.ts', 'export const seedMarkerY4 = 1;\n');
    await contextSearch.searchCodeContext({ root, query: 'seedMarkerY4' });

    await tick();
    await write('late.ts', 'export const concurrentMarkerY4 = 1;\n');
    const before = contextSearch.codeContextStats().indexBuilds;

    const [first, second] = await Promise.all([
      contextSearch.searchCodeContext({ root, query: 'concurrentMarkerY4' }),
      contextSearch.searchCodeContext({ root, query: 'concurrentMarkerY4' }),
    ]);

    expect(contextSearch.codeContextStats().indexBuilds - before).toBe(0);
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

  it('masks the command-line token, the Authorization header, and a subscript api key in snippets', async () => {
    await write('src/forms.ts', [
      "export const probeCommand = 'node app.js --token abc123tokenvalue';",
      "export const authHeader = 'Authorization: Basic dXNlcjpwYXNzd29yZA==';",
      'headers["x-api-key"] = "keyvalue1234567890";',
    ].join('\n'));

    const result = await contextSearch.searchCodeContext({ root, query: 'probeCommand authHeader headers' });
    const snippets = result.hits.map(hit => hit.snippet).join('\n');

    expect(snippets).not.toContain('abc123tokenvalue');
    expect(snippets).not.toContain('dXNlcjpwYXNzd29yZA==');
    expect(snippets).not.toContain('keyvalue1234567890');
    expect(snippets).toContain('--token [REDACTED:secret]');
    expect(snippets).toContain('Authorization: Basic [REDACTED:secret]');
  });

  it('excludes the changeset archive from the index', async () => {
    await write('.changeset/applied/old-note.md', 'archiveMarkerP9 described an applied change\n');
    await write('src/live-note.ts', 'export const liveMarkerP9 = 1; // archiveMarkerP9 is referenced here\n');

    const result = await contextSearch.searchCodeContext({ root, query: 'archiveMarkerP9 liveMarkerP9' });
    const paths = result.hits.map(hit => hit.path);

    expect(paths).toContain('src/live-note.ts');
    expect(paths.filter(p => p.startsWith('.changeset/applied'))).toEqual([]);
    expect(result.index.files).toBe(1);
  });

  it('resumes an unfinished build on later queries until the index is complete, without a second build', async () => {
    for (let i = 0; i < 8; i += 1) await write(`src/part${i}.ts`, `export const progressMarker${i} = ${i};\n`);
    const before = contextSearch.codeContextStats().indexBuilds;
    const limits = { buildBudgetMs: 0 };

    let result = await contextSearch.searchCodeContext({ root, query: 'progressMarker7', limits });
    expect(result.index.complete).toBe(false);
    expect(result.index.truncatedReason).toBe('time-budget');

    let rounds = 1;
    while (!result.index.complete && rounds < 40) {
      result = await contextSearch.searchCodeContext({ root, query: 'progressMarker7', limits });
      rounds += 1;
    }

    expect(result.index.complete).toBe(true);
    expect(result.index.files).toBe(8);
    expect(result.hits[0]?.path).toBe('src/part7.ts');
    expect(contextSearch.codeContextStats().indexBuilds - before).toBe(1);
  });

  it('finds a file in a folder created while a build is unfinished, without restarting the build', async () => {
    for (let i = 0; i < 4; i += 1) await write(`src/seed${i}.ts`, `export const seedPart${i} = ${i};\n`);
    const before = contextSearch.codeContextStats().indexBuilds;
    const limits = { buildBudgetMs: 0 };

    // Two queries list the root and then src, so src is known before the new folder appears.
    await contextSearch.searchCodeContext({ root, query: 'seedPart0', limits });
    await contextSearch.searchCodeContext({ root, query: 'seedPart0', limits });
    await tick();
    await write('src/late/found.ts', 'export const lateFolderMarkerZ2 = 1;\n');

    let result = await contextSearch.searchCodeContext({ root, query: 'lateFolderMarkerZ2', limits });
    let rounds = 1;
    while (!result.index.complete && rounds < 60) {
      result = await contextSearch.searchCodeContext({ root, query: 'lateFolderMarkerZ2', limits });
      rounds += 1;
    }

    expect(result.index.complete).toBe(true);
    expect(result.hits[0]?.path).toBe('src/late/found.ts');
    expect(contextSearch.codeContextStats().indexBuilds - before).toBe(1);
  });

  it('drops a deleted folder from the index on the next query', async () => {
    await write('src/gone/old.ts', 'export const vanishedAlphaQ7 = 1;\n');
    await write('src/keep.ts', 'export const steadyBetaR8 = 1;\n');
    const first = await contextSearch.searchCodeContext({ root, query: 'vanishedAlphaQ7' });
    expect(first.hits[0]?.path).toBe('src/gone/old.ts');

    await tick();
    await rm(path.join(root, 'src', 'gone'), { recursive: true, force: true });
    const second = await contextSearch.searchCodeContext({ root, query: 'vanishedAlphaQ7' });

    expect(second.hits).toEqual([]);
    expect(second.status).toBe('no-match');
    expect(second.index.files).toBe(1);
  });

  it('masks a private-key assignment in snippets', async () => {
    await write('src/keyholder.ts', 'const privateKey = "MIIEvQabcdefghijklmnop";\n');

    const result = await contextSearch.searchCodeContext({ root, query: 'privateKey keyholder' });
    const snippets = result.hits.map(hit => hit.snippet).join('\n');

    expect(snippets).not.toContain('MIIEvQabcdefghijklmnop');
    expect(snippets).toContain('[REDACTED:secret]');
  });

  it('re-reads an urgent hit at the chunk cap when its new text fits', async () => {
    await write('src/hit.ts', 'export function capHit() { return "oldCapToken"; }\n');
    await write('src/other.ts', 'export const capOther = 1;\n');
    const probe = await contextSearch.searchCodeContext({ root, query: 'capOther' });
    const limits = { maxChunks: probe.index.chunks };
    const first = await contextSearch.searchCodeContext({ root, query: 'capHit', limits });
    expect(first.index.complete).toBe(true);
    expect(first.index.truncatedReason).toBeNull();

    await tick();
    await write('src/hit.ts', 'export function capHit() { return "newCapToken"; }\n');
    const second = await contextSearch.searchCodeContext({ root, query: 'capHit', limits });

    expect(second.hits[0]?.path).toBe('src/hit.ts');
    expect(second.hits[0]!.snippet).toContain('newCapToken');
    expect(second.index.truncatedReason).toBeNull();
  });

  it('leaves an urgent hit out when its new text does not fit under the chunk cap', async () => {
    await write('src/hit.ts', 'export function capHit() { return "oldCapToken"; }\n');
    await write('src/other.ts', 'export const capOther = 1;\n');
    const probe = await contextSearch.searchCodeContext({ root, query: 'capOther' });
    const limits = { maxChunks: probe.index.chunks };
    await contextSearch.searchCodeContext({ root, query: 'capHit', limits });

    await tick();
    const grown = Array.from({ length: 200 }, (_, i) => `export function capHit${i}() { return "newCapToken${i}"; }`);
    await write('src/hit.ts', `${grown.join('\n')}\n`);
    const second = await contextSearch.searchCodeContext({ root, query: 'capHit', limits });

    expect(second.hits.filter(hit => hit.path === 'src/hit.ts')).toEqual([]);
    expect(second.index.complete).toBe(true);
    expect(second.index.truncatedReason).toBe('max-chunks');
  });

  it.runIf(process.platform === 'win32')('walks the real folder when a junction is the search root', async () => {
    const target = await mkdtemp(path.join(os.tmpdir(), 'code-context-target-'));
    scratch.push(target);
    await mkdir(path.join(target, 'src'), { recursive: true });
    await writeFile(path.join(target, 'src', 'a.ts'), 'export const junctionRootMarkerD1 = 1;\n');
    const link = path.join(root, 'rootlink');
    await symlink(target, link, 'junction');

    try {
      const result = await contextSearch.searchCodeContext({ root: link, query: 'junctionRootMarkerD1' });
      expect(result.hits[0]?.path).toBe('src/a.ts');
      expect(result.index.complete).toBe(true);
    } finally {
      await rmdir(link).catch(() => undefined);
    }
  });

  it('walks the real folder when a directory symlink is the search root', async (ctx) => {
    const target = await mkdtemp(path.join(os.tmpdir(), 'code-context-target-'));
    scratch.push(target);
    await mkdir(path.join(target, 'src'), { recursive: true });
    await writeFile(path.join(target, 'src', 'b.ts'), 'export const symlinkRootMarkerD1 = 1;\n');
    const link = path.join(root, 'dirlink');
    try {
      await symlink(target, link, 'dir');
    } catch {
      // Creating a directory symlink needs a privilege some Windows accounts lack; there is nothing to test then.
      ctx.skip();
    }

    try {
      const result = await contextSearch.searchCodeContext({ root: link, query: 'symlinkRootMarkerD1' });
      expect(result.hits[0]?.path).toBe('src/b.ts');
      expect(result.index.complete).toBe(true);
    } finally {
      await rmdir(link).catch(() => undefined);
    }
  });

  it('reports rebuilt when a folder added after the first complete pass is indexed', async () => {
    await write('src/first.ts', 'export const folderBaseMarkerD4 = 1;\n');
    const before = await contextSearch.searchCodeContext({ root, query: 'folderBaseMarkerD4' });
    expect(before.index.complete).toBe(true);
    expect(before.index.rebuilt).toBe(false);

    await tick();
    await write('fresh/late/new.ts', 'export const newFolderMarkerD4 = 1;\n');
    const after = await contextSearch.searchCodeContext({ root, query: 'newFolderMarkerD4' });

    expect(after.hits[0]?.path).toBe('fresh/late/new.ts');
    expect(after.index.rebuilt).toBe(true);
  });

  it('does not report rebuilt on the first query of a fresh state', async () => {
    await write('src/one.ts', 'export const freshStateMarkerD4 = 1;\n');
    const result = await contextSearch.searchCodeContext({ root, query: 'freshStateMarkerD4' });

    expect(result.hits[0]?.path).toBe('src/one.ts');
    expect(result.index.rebuilt).toBe(false);
  });

  it('displaces the worst indexed file when a better-ranked file arrives at the file cap', async () => {
    await write('docs/a.md', 'alphawordd6a described in prose\n');
    await write('docs/b.md', 'bravowordd6b described in prose\n');
    const limits = { maxFiles: 2 };
    const first = await contextSearch.searchCodeContext({ root, query: 'alphawordd6a bravowordd6b', limits });
    expect(first.index.files).toBe(2);

    await tick();
    await write('src/new.ts', 'export const newcodewordd6 = 1;\n');
    const second = await contextSearch.searchCodeContext({ root, query: 'newcodewordd6', limits });

    expect(second.hits[0]?.path).toBe('src/new.ts');
    expect(second.index.truncatedReason).toBe('max-files');
    // b.md ranks after a.md, so it was displaced: its own word finds nothing now.
    const evicted = await contextSearch.searchCodeContext({ root, query: 'bravowordd6b', limits });
    expect(evicted.hits).toEqual([]);
  });

  it('counts the file cap from text files only, so skipped binaries do not trigger a cut', async () => {
    await write('src/keep.ts', 'export const binaryCapMarkerD7 = 1;\n');
    const binaries = ['blob1.json', 'blob2.json', 'blob3.json'];
    for (const name of binaries) await write(name, Buffer.from([0x7b, 0x00, 0x7d]));
    const limits = { maxFiles: 2 };

    const result = await contextSearch.searchCodeContext({ root, query: 'binaryCapMarkerD7', limits });
    expect(result.index.skippedByReason.binary).toBe(3);
    expect(result.index.truncatedReason).toBeNull();
    expect(result.index.complete).toBe(true);

    await tick();
    for (const name of binaries) await rm(path.join(root, name));
    const after = await contextSearch.searchCodeContext({ root, query: 'binaryCapMarkerD7', limits });
    expect(after.hits[0]?.path).toBe('src/keep.ts');
    expect(after.index.truncatedReason).toBeNull();
    expect(after.index.complete).toBe(true);
  });

  it('reads files on every step with a zero budget, and lists a folder that changed', async () => {
    for (let i = 0; i < 4; i += 1) await write(`src/part${i}.ts`, `export const starveMarkerD9${i} = ${i};\n`);
    for (let i = 0; i < 4; i += 1) await write(`tests/part${i}.test.ts`, `export const starveTestD9${i} = ${i};\n`);
    const limits = { buildBudgetMs: 0 };
    const query = (text: string) => contextSearch.searchCodeContext({ root, query: text, limits });

    await query('starveMarkerD9');
    await query('starveMarkerD9');
    await tick();
    await write('src/late.ts', 'export const starveLateD9 = 1;\n');

    let result = await query('starveLateD9');
    let rounds = 1;
    while (!result.index.complete && rounds < 30) {
      result = await query('starveLateD9');
      rounds += 1;
    }

    expect(result.index.complete).toBe(true);
    expect(result.index.files).toBe(9);
    expect(result.hits[0]?.path).toBe('src/late.ts');
  });

  // Serves code_orient the way the resolver does: a requested worktree becomes the cwd, the repository is the cwd otherwise.
  function guardedHandler(repo: string): (args: unknown) => Promise<any> {
    vi.spyOn(activityTracker, 'record').mockImplementation(() => undefined as any);
    return codeOrientHandler({
      resolveWorkspace: vi.fn(async (context: { worktreePath?: string }) => ({
        workspace: 'w',
        group: 'w',
        cwd: context.worktreePath ?? repo,
        worktreePath: context.worktreePath,
      })),
    });
  }

  it('rejects a root named like a denied folder inside the repository, and a root above it', async () => {
    await mkdir(path.join(root, 'runtime'), { recursive: true });
    await mkdir(path.join(root, 'src'), { recursive: true });

    await expect(contextSearch.assertSearchRoot(path.join(root, 'runtime'), root)).rejects.toThrow('CODE_CONTEXT_ROOT_DENIED');
    await expect(contextSearch.assertSearchRoot(path.dirname(root), root)).rejects.toThrow('CODE_CONTEXT_ROOT_TOO_BROAD');
    await expect(contextSearch.assertSearchRoot(path.join(root, 'src'), root)).resolves.toBeUndefined();
  });

  it('refuses a worktree inside a denied folder of the repository', async () => {
    await write('runtime/state.ts', 'export const runtimeMarkerD10 = 1;\n');
    await write('src/app.ts', 'export const appMarkerD10 = 1;\n');

    const response = await guardedHandler(root)({
      action: 'context',
      query: 'runtimeMarkerD10',
      worktreePath: path.join(root, 'runtime'),
    });

    expect(response.isError).toBe(true);
    expect(response.content[0].text).toContain('CODE_CONTEXT_ROOT_DENIED');
  });

  it.runIf(process.platform === 'win32')('refuses a junction inside the repository that points to a denied folder', async () => {
    await write('runtime/state.ts', 'export const junctionDeniedMarkerD10 = 1;\n');
    const alias = path.join(root, 'alias');
    await symlink(path.join(root, 'runtime'), alias, 'junction');

    try {
      const response = await guardedHandler(root)({ action: 'context', query: 'junctionDeniedMarkerD10', worktreePath: alias });

      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('CODE_CONTEXT_ROOT_DENIED');
    } finally {
      await rmdir(alias).catch(() => undefined);
    }
  });

  it('refuses a root outside the repository whose own name is denied', async () => {
    const outside = await mkdtemp(path.join(os.tmpdir(), 'code-context-outside-'));
    scratch.push(outside);
    const denied = path.join(outside, 'runtime');
    await mkdir(denied);
    await writeFile(path.join(denied, 'state.ts'), 'export const outsideDeniedMarkerD10 = 1;\n');

    const response = await guardedHandler(root)({ action: 'context', query: 'outsideDeniedMarkerD10', worktreePath: denied });

    expect(response.isError).toBe(true);
    expect(response.content[0].text).toContain('CODE_CONTEXT_ROOT_DENIED');
  });

  it('does not index or list the dot-prefixed secrets and credentials folders', async () => {
    await write('.secrets/vault.ts', 'export const dotSecretsMarkerD11 = 1;\n');
    await write('.credentials/keys.ts', 'export const dotCredentialsMarkerD11 = 1;\n');
    await write('src/keep.ts', 'export const keepMarkerD11 = 1;\n');

    const result = await contextSearch.searchCodeContext({ root, query: 'dotSecretsMarkerD11 dotCredentialsMarkerD11 keepMarkerD11' });
    const sampled = result.index.skippedSamples.map(sample => sample.path);

    expect(result.hits.map(hit => hit.path)).toEqual(['src/keep.ts']);
    expect(result.index.files).toBe(1);
    expect(sampled.filter(p => /^\.(secrets|credentials)(\/|$)/.test(p))).toEqual([]);
  });

  it('forgets the skip record of a binary file once it is deleted, and records it again when recreated', async () => {
    await write('src/keep.ts', 'export const skipLedgerMarkerD12 = 1;\n');
    await write('src/blob.json', Buffer.from([0x7b, 0x00, 0x7d]));
    const first = await contextSearch.searchCodeContext({ root, query: 'skipLedgerMarkerD12' });
    expect(first.index.skippedSamples.map(sample => sample.path)).toContain('src/blob.json');

    await tick();
    await rm(path.join(root, 'src', 'blob.json'));
    const second = await contextSearch.searchCodeContext({ root, query: 'skipLedgerMarkerD12' });
    expect(second.index.skippedSamples.map(sample => sample.path)).not.toContain('src/blob.json');
    expect(second.index.skippedByReason.binary).toBeUndefined();

    await tick();
    await write('src/blob.json', Buffer.from([0x7b, 0x00, 0x7d]));
    const third = await contextSearch.searchCodeContext({ root, query: 'skipLedgerMarkerD12' });
    expect(third.index.skippedSamples.map(sample => sample.path)).toContain('src/blob.json');
  });

  it.runIf(process.platform === 'win32')('drops a link record once the same name is a plain entry again', async () => {
    const outside = await mkdtemp(path.join(os.tmpdir(), 'code-context-outside-'));
    scratch.push(outside);
    const swap = path.join(root, 'swap');
    await write('src/keep.ts', 'export const swapKeepMarkerD12 = 1;\n');
    await symlink(outside, swap, 'junction');
    const first = await contextSearch.searchCodeContext({ root, query: 'swapKeepMarkerD12' });
    expect(first.index.skippedSamples.map(sample => sample.path)).toContain('swap');

    await tick();
    await rmdir(swap);
    await writeFile(swap, 'plain\n');
    const second = await contextSearch.searchCodeContext({ root, query: 'swapKeepMarkerD12' });

    expect(second.index.skippedSamples.map(sample => sample.path)).not.toContain('swap');
  });

  it('excludes the changeset archive when the search root is the changeset folder itself', async () => {
    await write('.changeset/applied/x.md', 'archiveRootMarkerD13 described an applied change\n');
    await write('.changeset/a.md', 'liveRootMarkerD13 described a pending change\n');

    const result = await contextSearch.searchCodeContext({
      root: path.join(root, '.changeset'),
      query: 'archiveRootMarkerD13 liveRootMarkerD13',
    });
    const paths = result.hits.map(hit => hit.path);

    expect(paths).toContain('a.md');
    expect(paths.filter(p => p.startsWith('applied/'))).toEqual([]);
    expect(result.index.files).toBe(1);
  });

  it('keeps the prose after a secret-like word intact in a snippet', async () => {
    await write('docs/prose.md', [
      'Agent Core stores a token: see docs for the refresh flow.',
      'secret: rotate it before release',
      'credentials: read from the keychain',
    ].join('\n') + '\n');

    const result = await contextSearch.searchCodeContext({ root, query: 'refresh flow' });

    expect(result.hits[0]?.path).toBe('docs/prose.md');
    expect(result.hits[0]!.snippet).toContain('Agent Core stores a token: see docs for the refresh flow.');
  });

  it('masks a credentials value that ends its line in a snippet', async () => {
    await write('docs/field.md', 'Vault setup notes.\ncredentials: keychain\n');

    // The value itself is masked before indexing, so the query names the words around it.
    const result = await contextSearch.searchCodeContext({ root, query: 'vault setup notes' });

    expect(result.hits[0]!.snippet).toContain('credentials: [REDACTED:secret]');
  });

  // An incremental catalog must report the same skip records as a fresh build of the same tree.
  function bySkipPath(result: contextSearch.CodeContextResult): Array<{ path: string; reason: string }> {
    return [...result.index.skippedSamples].sort((a, b) => a.path.localeCompare(b.path));
  }

  it('reports a known file replaced by a link the way a fresh build does', async (ctx) => {
    await write('src/x.ts', 'export const linkSwapX1 = 1;\n');
    await write('src/y.ts', 'export const linkSwapY1 = 1;\n');
    const outside = await mkdtemp(path.join(os.tmpdir(), 'code-context-outside-'));
    scratch.push(outside);
    await writeFile(path.join(outside, 'z.ts'), 'export const linkSwapZ1 = 1;\n');
    const seeded = await contextSearch.searchCodeContext({ root, query: 'linkSwapY1' });
    expect(seeded.index.complete).toBe(true);

    await tick();
    await rm(path.join(root, 'src', 'x.ts'));
    try {
      await symlink(path.join(outside, 'z.ts'), path.join(root, 'src', 'x.ts'), 'file');
    } catch {
      ctx.skip(); // this platform refuses file links without a privilege
    }
    const incremental = await contextSearch.searchCodeContext({ root, query: 'linkSwapY1' });
    contextSearch.clearCodeContextIndexCache();
    const fresh = await contextSearch.searchCodeContext({ root, query: 'linkSwapY1' });

    expect(fresh.index.skippedByReason.link).toBe(1);
    expect(incremental.index.skippedFiles).toBe(fresh.index.skippedFiles);
    expect(incremental.index.skippedByReason).toEqual(fresh.index.skippedByReason);
    expect(bySkipPath(incremental)).toEqual(bySkipPath(fresh));
    expect(incremental.index.files).toBe(fresh.index.files);
  });

  it('reports a known folder replaced by a junction the way a fresh build does', async () => {
    await write('src/y.ts', 'export const junctionSwapY1 = 1;\n');
    await write('src/sub/inner.ts', 'export const junctionSwapInner1 = 1;\n');
    const outside = await mkdtemp(path.join(os.tmpdir(), 'code-context-outside-'));
    scratch.push(outside);
    const seeded = await contextSearch.searchCodeContext({ root, query: 'junctionSwapY1' });
    expect(seeded.index.complete).toBe(true);

    await tick();
    const link = path.join(root, 'src', 'sub');
    await rm(link, { recursive: true, force: true });
    await symlink(outside, link, 'junction');
    try {
      const incremental = await contextSearch.searchCodeContext({ root, query: 'junctionSwapY1' });
      contextSearch.clearCodeContextIndexCache();
      const fresh = await contextSearch.searchCodeContext({ root, query: 'junctionSwapY1' });

      expect(fresh.index.skippedByReason.link).toBe(1);
      expect(incremental.index.skippedFiles).toBe(fresh.index.skippedFiles);
      expect(incremental.index.skippedByReason).toEqual(fresh.index.skippedByReason);
      expect(bySkipPath(incremental)).toEqual(bySkipPath(fresh));
      expect(incremental.index.files).toBe(fresh.index.files);
    } finally {
      // Remove the junction itself, never its target.
      await rmdir(link).catch(() => undefined);
    }
  });

  it('answers an unrelated query in one build step while a new folder of files waits to be read', async () => {
    await write('src/seed.ts', 'export const seedAlpha = 1;\n');
    const limits = { buildBudgetMs: 30 };
    const seeded = await contextSearch.searchCodeContext({ root, query: 'seedAlpha', limits });
    expect(seeded.index.complete).toBe(true);

    await tick();
    const bulk = path.join(root, 'bulk');
    await mkdir(bulk);
    for (let start = 0; start < 1500; start += 100) {
      await Promise.all(Array.from({ length: 100 }, (_, k) => {
        const i = start + k;
        return writeFile(path.join(bulk, `f${String(i).padStart(4, '0')}.ts`), `export const bulkMarker${i} = ${i};\n`);
      }));
    }

    const slices = contextSearch.codeContextStats().indexSlices;
    const unrelated = await contextSearch.searchCodeContext({ root, query: 'unrelatedZeta', limits });
    expect(contextSearch.codeContextStats().indexSlices - slices).toBeLessThanOrEqual(1);
    expect(unrelated.hits).toEqual([]);
    expect(unrelated.index.rebuilt).toBe(true);

    // Later queries finish the index; each one moves it on by one budgeted step.
    let result = unrelated;
    for (let round = 0; !result.index.complete && round < 400; round += 1) {
      result = await contextSearch.searchCodeContext({ root, query: 'bulkMarker1499', limits });
    }
    expect(result.index.complete).toBe(true);
    expect(result.index.files).toBe(1501);
    expect(result.hits[0]?.path).toBe('bulk/f1499.ts');
  }, 60_000);

  it('resolves a worktree from the workspace it belongs to, not from the default workspace', async () => {
    const repoA = path.join(root, 'ws-a', 'repo-a');
    const repoB = path.join(root, 'ws-b', 'repo-b');
    await mkdir(path.join(repoA, 'src'), { recursive: true });
    await mkdir(path.join(repoB, 'src'), { recursive: true });
    await writeFile(path.join(repoB, 'src', 'worktree.ts'), 'export const worktreeMarkerK5 = 1;\n');
    vi.spyOn(activityTracker, 'record').mockImplementation(() => undefined as any);
    const workspaces: Record<string, { cwd: string; repo: string }> = {
      A: { cwd: repoA, repo: 'repo-a' },
      B: { cwd: repoB, repo: 'repo-b' },
    };
    // Honours the workspace argument: a worktree names its workspace by location, otherwise the default A is used.
    const resolveWorkspace = vi.fn(async (context: { workspace?: string; worktreePath?: string; repoFilter?: string[] }) => {
      const owner = context.worktreePath?.startsWith(repoB) ? 'B' : undefined;
      const name = context.workspace ?? owner ?? 'A';
      const target = workspaces[name]!;
      if (context.repoFilter && !context.repoFilter.includes(target.repo)) {
        throw new Error(`CODE_WORKSPACE_REPO_FILTER_NOT_FOUND: ${context.repoFilter.join(',')} in workspace ${name}`);
      }
      return {
        workspace: name,
        group: name,
        cwd: context.worktreePath ?? target.cwd,
        repo: target.repo,
        worktreePath: context.worktreePath,
      };
    });
    const handler = codeOrientHandler({ resolveWorkspace });

    const response = await handler({ action: 'context', query: 'worktreeMarkerK5', worktreePath: path.join(repoB, 'src') });

    expect(response.isError).not.toBe(true);
    expect(JSON.parse(response.content[0].text).hits[0]?.path).toBe('worktree.ts');
  });
});
