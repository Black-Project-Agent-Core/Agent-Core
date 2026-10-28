import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SemanticIdeService } from '../src/semantic-ide/service.js';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

async function healthFor(servers: unknown): Promise<Awaited<ReturnType<SemanticIdeService['health']>>> {
  const parent = fileURLToPath(new URL('../runtime/tmp', import.meta.url));
  await mkdir(parent, { recursive: true });
  const root = await mkdtemp(path.join(parent, 'semantic-servers-'));
  roots.push(root);
  const serversFile = path.join(root, 'servers.json');
  await writeFile(serversFile, JSON.stringify(servers));
  const service = await SemanticIdeService.initialize({
    enabled: true,
    projectRoot: path.resolve('.'),
    runtimeDir: root,
    startupTimeoutMs: 1000,
    callTimeoutMs: 1000,
    typescriptServerPath: path.resolve('node_modules/typescript-language-server/lib/cli.mjs'),
    typescriptTsserverPath: path.resolve('node_modules/typescript-lsp-runtime/lib/tsserver.js'),
    serversFile,
  });
  try { return await service.health(); } finally { await service.close(); }
}

const valid = { id: 'fixture-ls', command: 'node', extensions: ['.fix'], languageIds: { '.fix': 'fixture' } };

describe('semantic provider servers file', () => {
  it('keeps the valid entries when one entry is invalid and reports the skipped one', async () => {
    const health = await healthFor([valid, { id: 'broken' }]);
    expect(health.configuredServers.map(server => server.id)).toContain('fixture-ls');
    const issue = health.issues?.find(item => item.code === 'SEMANTIC_SERVER_CONFIG_INVALID');
    expect(issue?.message).toContain('1 of 2');
  });

  it('still rejects a file that is not a list', async () => {
    const health = await healthFor({ servers: [valid] });
    expect(health.configuredServers.map(server => server.id)).not.toContain('fixture-ls');
    expect(health.issues?.some(item => item.code === 'SEMANTIC_SERVER_CONFIG_INVALID')).toBe(true);
  });
});
