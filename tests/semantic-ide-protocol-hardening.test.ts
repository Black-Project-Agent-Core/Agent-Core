import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { LanguageServerSession } from '../src/semantic-ide/language-server.js';
import { LspConnection, LspResponseError } from '../src/semantic-ide/protocol.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixture = path.join(repoRoot, 'tests', 'fixtures', 'semantic-protocol-lsp.mjs');
const roots: string[] = [];

async function rootFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-core-semantic-protocol-'));
  roots.push(root);
  return root;
}

function alive(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

async function waitFor(check: () => boolean | Promise<boolean>, timeoutMs = 4000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return true;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  return Boolean(await check());
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

describe('Semantic IDE LSP protocol hardening', () => {
  it('retries ContentModified only for declared methods and accepts numeric-string response ids', async () => {
    const root = await rootFixture();
    const connection = new LspConnection(process.execPath, [fixture, 'retry'], root, 3000);
    connection.setContentModifiedRetryMethods(['retry/test']);
    await connection.start();
    try {
      await expect(connection.request('retry/test', {})).resolves.toEqual({ attempts: 3 });
      await expect(connection.request('no-retry/test', {})).rejects.toMatchObject({
        name: 'LspResponseError',
        code: -32801,
      } satisfies Partial<LspResponseError>);
      await expect(connection.request('string-id/test', {})).resolves.toEqual({ stringId: true });
    } finally {
      await connection.close();
    }
  });

  it('answers unknown server requests with MethodNotFound', async () => {
    const root = await rootFixture();
    const connection = new LspConnection(process.execPath, [fixture, 'unknown'], root, 3000);
    await connection.start();
    try {
      const result = await connection.request('trigger-unknown/test', {}) as any;
      expect(result.code).toBe(-32601);
      expect(result.message).toMatch(/Method not found/);
    } finally {
      await connection.close();
    }
  });

  it('sends void shutdown and exit without params', async () => {
    const root = await rootFixture();
    const marker = path.join(root, 'wire.json');
    const connection = new LspConnection(process.execPath, [fixture, 'wire', marker], root, 3000);
    await connection.start();
    await connection.close();
    const wire = JSON.parse(await readFile(marker, 'utf8')) as any;
    expect(wire).toEqual({ shutdownHasParams: false, exitHasParams: false });
  });

  it('cleans partially started provider descendants when initialize fails', async () => {
    const root = await rootFixture();
    const marker = path.join(root, 'startup-child.pid');
    const session = new LanguageServerSession({
      id: 'hang-startup',
      extensions: ['.foo'],
      languageIds: { '.foo': 'foo' },
      command: process.execPath,
      args: [fixture, 'hang-initialize-child', marker],
    }, root, 250);

    await expect(session.start()).rejects.toThrow(/SEMANTIC_IDE_LSP_TIMEOUT: initialize/);
    const markerReady = await waitFor(async () => {
      try { return Boolean((await readFile(marker, 'utf8')).trim()); } catch { return false; }
    });
    expect(markerReady).toBe(true);
    const childPid = Number.parseInt((await readFile(marker, 'utf8')).trim(), 10);
    expect(await waitFor(() => !alive(childPid))).toBe(true);
  });

  it('terminates owned provider descendants during close', async () => {
    const root = await rootFixture();
    const marker = path.join(root, 'child.pid');
    const connection = new LspConnection(process.execPath, [fixture, 'spawn-child', marker], root, 3000);
    await connection.start();
    const markerReady = await waitFor(async () => {
      try { return Boolean((await readFile(marker, 'utf8')).trim()); } catch { return false; }
    });
    expect(markerReady).toBe(true);
    const childPid = Number.parseInt((await readFile(marker, 'utf8')).trim(), 10);
    expect(alive(childPid)).toBe(true);

    await connection.close();
    expect(await waitFor(() => !alive(childPid))).toBe(true);
  });
});
