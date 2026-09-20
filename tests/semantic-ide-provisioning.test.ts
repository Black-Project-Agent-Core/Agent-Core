import { createHash } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import PizZip from 'pizzip';
import { afterEach, describe, expect, it } from 'vitest';
import {
  SemanticProviderProvisioner,
  type ProviderRecipe,
} from '../src/semantic-ide/provider-provisioning.js';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

function sha256(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}
function makeZip(entries: Record<string, string>): Buffer {
  const zip = new PizZip();
  for (const [name, value] of Object.entries(entries)) zip.file(name, value);
  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

async function tempRuntime(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-core-provider-test-'));
  cleanups.push(() => rm(root, { recursive: true, force: true }));
  return root;
}

async function listen(handler: Parameters<typeof createServer>[0]): Promise<{ server: Server; base: string }> {
  const server = createServer(handler);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  cleanups.push(() => new Promise<void>(resolve => server.close(() => resolve())));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('fixture listen failed');
  return { server, base: `http://127.0.0.1:${address.port}` };
}
function fixtureRecipe(url: string, body: Buffer, overrides: Partial<ProviderRecipe['artifacts'][number]> = {}): ProviderRecipe {
  return {
    id: 'python',
    recipeVersion: 99,
    artifacts: [{
      id: 'fixture',
      version: '1.0.0',
      url,
      sha256: sha256(body),
      allowedHosts: ['127.0.0.1'],
      format: 'zip',
      targetSubdir: '',
      maxBytes: 1024 * 1024,
      maxExpandedBytes: 4 * 1024 * 1024,
      maxEntries: 100,
      ...overrides,
    }],
    requiredPaths: ['bin/server.txt'],
  };
}

describe('SemanticProviderProvisioner', () => {
  it('follows an allowlisted redirect, verifies hash, stays idempotent, and repairs explicit corruption', async () => {
    const archive = makeZip({ 'bin/server.txt': 'provider-ok' });
    let requests = 0;
    const { base } = await listen((request, response) => {
      requests += 1;
      if (request.url === '/redirect') {
        response.statusCode = 302;
        response.setHeader('location', '/provider.zip');
        return response.end();
      }
      response.statusCode = 200;
      response.setHeader('content-length', String(archive.length));
      response.end(archive);
    });
    const runtime = await tempRuntime();
    const recipe = fixtureRecipe(`${base}/redirect`, archive);
    const provisioner = new SemanticProviderProvisioner(runtime, { python: recipe });

    const first = await provisioner.provision('python');
    expect(first.changed).toBe(true);
    expect(first.alreadyValid).toBe(false);
    expect(await readFile(path.join(runtime, 'providers', 'python', 'bin', 'server.txt'), 'utf8')).toBe('provider-ok');
    const requestsAfterFirst = requests;

    const second = await provisioner.provision('python');
    expect(second.changed).toBe(false);
    expect(second.alreadyValid).toBe(true);
    expect(requests).toBe(requestsAfterFirst);

    await writeFile(path.join(runtime, 'providers', 'python', 'bin', 'server.txt'), 'corrupt');
    await expect(provisioner.provision('python')).rejects.toThrow('SEMANTIC_PROVIDER_REPAIR_REQUIRED');
    const repaired = await provisioner.provision('python', { repair: true });
    expect(repaired.repaired).toBe(true);
    expect(await readFile(path.join(runtime, 'providers', 'python', 'bin', 'server.txt'), 'utf8')).toBe('provider-ok');
  });
  it('rejects redirect host escape before fetching the redirected body', async () => {
    const archive = makeZip({ 'bin/server.txt': 'ok' });
    const { base } = await listen((_request, response) => {
      response.statusCode = 302;
      response.setHeader('location', 'https://example.com/provider.zip');
      response.end();
    });
    const runtime = await tempRuntime();
    const provisioner = new SemanticProviderProvisioner(runtime, {
      python: fixtureRecipe(`${base}/redirect`, archive),
    });
    await expect(provisioner.provision('python')).rejects.toThrow('SEMANTIC_PROVIDER_ARTIFACT_HOST_REFUSED');
  });

  it('rejects a SHA mismatch with no final provider activation', async () => {
    const archive = makeZip({ 'bin/server.txt': 'ok' });
    const { base } = await listen((_request, response) => {
      response.statusCode = 200;
      response.end(archive);
    });
    const runtime = await tempRuntime();
    const recipe = fixtureRecipe(`${base}/provider.zip`, archive, { sha256: '0'.repeat(64) });
    const provisioner = new SemanticProviderProvisioner(runtime, { python: recipe });
    await expect(provisioner.provision('python')).rejects.toThrow('SEMANTIC_PROVIDER_ARTIFACT_SHA256_MISMATCH');
    await expect(readFile(path.join(runtime, 'providers', 'python', 'bin', 'server.txt'), 'utf8')).rejects.toThrow();
  });

  it('enforces the compressed byte budget before activation', async () => {
    const archive = makeZip({ 'bin/server.txt': 'x'.repeat(4096) });
    const { base } = await listen((_request, response) => {
      response.statusCode = 200;
      response.setHeader('content-length', String(archive.length));
      response.end(archive);
    });
    const runtime = await tempRuntime();
    const provisioner = new SemanticProviderProvisioner(runtime, {
      python: fixtureRecipe(`${base}/provider.zip`, archive, { maxBytes: Math.max(1, archive.length - 1) }),
    });
    await expect(provisioner.provision('python')).rejects.toThrow('SEMANTIC_PROVIDER_ARTIFACT_TOO_LARGE');
  });
  it('rejects archive traversal before extracting any final provider tree', async () => {
    const archive = makeZip({ '../escape.txt': 'escape', 'bin/server.txt': 'ok' });
    const { base } = await listen((_request, response) => {
      response.statusCode = 200;
      response.end(archive);
    });
    const runtime = await tempRuntime();
    const provisioner = new SemanticProviderProvisioner(runtime, {
      python: fixtureRecipe(`${base}/provider.zip`, archive),
    });
    await expect(provisioner.provision('python')).rejects.toThrow(/SEMANTIC_PROVIDER_ARCHIVE_PATH_ESCAPE|SEMANTIC_PROVIDER_ARCHIVE_PATH_INVALID|invalid relative path/i);
    await expect(readFile(path.join(runtime, 'providers', 'python', 'bin', 'server.txt'), 'utf8')).rejects.toThrow();
  });

  it('ignores only recipe-declared mutable runtime paths in integrity checks', async () => {
    const archive = makeZip({ 'bin/server.txt': 'provider-ok' });
    const { base } = await listen((_request, response) => { response.statusCode = 200; response.end(archive); });
    const runtime = await tempRuntime();
    const recipe = fixtureRecipe(`${base}/provider.zip`, archive);
    recipe.mutablePaths = ['cache'];
    const provisioner = new SemanticProviderProvisioner(runtime, { python: recipe });
    await provisioner.provision('python');
    const cache = path.join(runtime, 'providers', 'python', 'cache');
    await writeFile(path.join(runtime, 'providers', 'python', 'bin', 'server.txt'), 'provider-ok');
    await (await import('node:fs/promises')).mkdir(cache, { recursive: true });
    await writeFile(path.join(cache, 'runtime.tmp'), 'mutable');
    const second = await provisioner.provision('python');
    expect(second.alreadyValid).toBe(true);
    expect(second.changed).toBe(false);
  });

  it('requires the explicit public confirmation token before provisioning', async () => {
    const { SemanticIdeService } = await import('../src/semantic-ide/service.js');
    const root = await tempRuntime();
    const config = {
      enabled: true,
      projectRoot: path.resolve('.'),
      runtimeDir: root,
      startupTimeoutMs: 1000,
      callTimeoutMs: 1000,
      typescriptServerPath: path.resolve('node_modules/typescript-language-server/lib/cli.mjs'),
      typescriptTsserverPath: path.resolve('node_modules/typescript-lsp-runtime/lib/tsserver.js'),
      serversFile: path.join(root, 'servers.json'),
    };
    const service = await SemanticIdeService.initialize(config);
    try {
      await expect(service.symbol('provisionProvider', { providerId: 'python' }))
        .rejects.toThrow('SEMANTIC_PROVIDER_PROVISION_CONFIRMATION_REQUIRED');
    } finally {
      await service.close();
    }
  });
});
