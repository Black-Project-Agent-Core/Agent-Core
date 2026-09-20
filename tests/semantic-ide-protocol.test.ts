import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { LspConnection, LspServerRequestError } from '../src/semantic-ide/protocol.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixtureServer = path.join(repoRoot, 'tests', 'fixtures', 'semantic-second-wave-lsp.mjs');
const roots: string[] = [];

async function rootFixture(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-core-semantic-protocol-'));
  roots.push(root);
  return root;
}

function connection(root: string, mode: string, aux?: string, onServerRequest?: (method: string, params: unknown) => unknown) {
  return new LspConnection(
    process.execPath,
    [fixtureServer, mode, ...(aux ? [aux] : [])],
    root,
    5000,
    undefined,
    onServerRequest,
  );
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

describe('Semantic IDE LSP protocol hardening', () => {
  it('retries ContentModified only for explicitly registered methods', async () => {
    const root = await rootFixture();
    const client = connection(root, 'content-modified-once');
    client.setContentModifiedRetryMethods(['textDocument/documentSymbol']);
    await client.start();
    try {
      await client.request('initialize', {});
      const result = await client.request('textDocument/documentSymbol', { textDocument: { uri: 'file:///fixture.ts' } });
      expect(Array.isArray(result)).toBe(true);
    } finally {
      await client.close();
    }
  });

  it('accepts numeric-string response IDs without losing the pending request', async () => {
    const root = await rootFixture();
    const client = connection(root, 'numeric-id');
    await client.start();
    try {
      const result = await client.request('initialize', {}) as any;
      expect(result.capabilities.documentSymbolProvider).toBe(true);
    } finally {
      await client.close();
    }
  });

  it('returns JSON-RPC MethodNotFound for unknown provider requests', async () => {
    const root = await rootFixture();
    const client = connection(root, 'basic', undefined, method => {
      throw new LspServerRequestError(-32601, `Method not found: ${method}`);
    });
    await client.start();
    try {
      await client.request('initialize', {});
      const response = await client.request('trigger-server-request', {}) as any;
      expect(response.error).toMatchObject({ code: -32601 });
      expect(response.error.message).toMatch(/Method not found/);
    } finally {
      await client.close();
    }
  });

  it('sends shutdown and exit without a params field', async () => {
    const root = await rootFixture();
    const logFile = path.join(root, 'wire.jsonl');
    const client = connection(root, 'basic', logFile);
    await client.start();
    await client.request('initialize', {});
    await client.close();

    const rows = (await readFile(logFile, 'utf8')).trim().split(/\r?\n/).map(line => JSON.parse(line));
    expect(rows.some(row => row.shutdownHasParams === false)).toBe(true);
    expect(rows.some(row => row.exitHasParams === false)).toBe(true);
  });

  it('terminates owned provider descendants when the wrapper exits', async () => {
    const root = await rootFixture();
    const logFile = path.join(root, 'tree.jsonl');
    const client = connection(root, 'tree', logFile);
    await client.start();
    await client.request('initialize', {});
    client.notify('initialized', {});
    await new Promise(resolve => setTimeout(resolve, 250));
    const childPid = Number(await client.request('child-pid'));
    expect(Number.isSafeInteger(childPid) && childPid > 0).toBe(true);
    expect(isAlive(childPid)).toBe(true);

    await client.close();
    await new Promise(resolve => setTimeout(resolve, 500));
    expect(isAlive(childPid)).toBe(false);
  });
});
