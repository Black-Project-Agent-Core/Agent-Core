import { createHash } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
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

function patchZipEntryHeader(
  archive: Buffer,
  patch: (copy: Buffer, local: number, central: number) => void,
): Buffer {
  const copy = Buffer.from(archive);
  const local = copy.indexOf(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  const central = copy.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  if (local < 0 || central < 0) throw new Error('fixture ZIP headers not found');
  patch(copy, local, central);
  return copy;
}

function patchCentralDirectorySize(archive: Buffer, size: number): Buffer {
  const copy = Buffer.from(archive);
  const eocd = copy.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new Error('fixture ZIP EOCD not found');
  copy.writeUInt32LE(size >>> 0, eocd + 12);
  return copy;
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
  it('rejects declared content-type and byte-signature format mismatches before extraction', async () => {
    const archive = makeZip({ 'bin/server.txt': 'ok' });
    const { base } = await listen((_request, response) => {
      response.statusCode = 200;
      response.setHeader('content-type', 'application/gzip');
      response.end(archive);
    });
    const runtime = await tempRuntime();
    const provisioner = new SemanticProviderProvisioner(runtime, {
      python: fixtureRecipe(`${base}/provider.zip`, archive),
    });
    await expect(provisioner.provision('python')).rejects.toThrow('SEMANTIC_PROVIDER_ARTIFACT_FORMAT_MISMATCH');
    await expect(readFile(path.join(runtime, 'providers', 'python', 'bin', 'server.txt'), 'utf8')).rejects.toThrow();
  });

  it('rejects a byte-signature mismatch even without a content-type declaration', async () => {
    const archive = gzipSync(Buffer.from('not-a-zip'));
    const { base } = await listen((_request, response) => {
      response.statusCode = 200;
      response.end(archive);
    });
    const runtime = await tempRuntime();
    const provisioner = new SemanticProviderProvisioner(runtime, {
      python: fixtureRecipe(`${base}/provider.zip`, archive),
    });
    await expect(provisioner.provision('python')).rejects.toThrow('SEMANTIC_PROVIDER_ARTIFACT_FORMAT_MISMATCH');
    await expect(readFile(path.join(runtime, 'providers', 'python', 'bin', 'server.txt'), 'utf8')).rejects.toThrow();
  });

  it('rejects oversized ZIP central-directory metadata before ZIP library extraction', async () => {
    const baseArchive = makeZip({ 'bin/server.txt': 'ok' });
    const archive = patchCentralDirectorySize(baseArchive, 4 * 1024 * 1024 + 1);
    const { base } = await listen((_request, response) => { response.statusCode = 200; response.end(archive); });
    const runtime = await tempRuntime();
    const provisioner = new SemanticProviderProvisioner(runtime, {
      python: fixtureRecipe(`${base}/provider.zip`, archive),
    });
    await expect(provisioner.provision('python')).rejects.toThrow('SEMANTIC_PROVIDER_ZIP_CENTRAL_DIRECTORY_LIMIT');
  });

  it('rejects ZIP64-era extractor versions and unbounded compression methods', async () => {
    const original = makeZip({ 'bin/server.txt': 'ok' });
    const zip64 = patchZipEntryHeader(original, (copy, local, central) => {
      copy.writeUInt16LE(45, local + 4);
      copy.writeUInt16LE(45, central + 6);
    });
    const refusedCompression = patchZipEntryHeader(original, (copy, local, central) => {
      copy.writeUInt16LE(12, local + 8);
      copy.writeUInt16LE(12, central + 10);
    });
    for (const [name, archive, expected] of [
      ['zip64.zip', zip64, 'SEMANTIC_PROVIDER_ZIP64_OR_UNSUPPORTED_VERSION'],
      ['bzip2.zip', refusedCompression, 'SEMANTIC_PROVIDER_ZIP_COMPRESSION_REFUSED'],
    ] as const) {
      const { base } = await listen((_request, response) => { response.statusCode = 200; response.end(archive); });
      const runtime = await tempRuntime();
      const provisioner = new SemanticProviderProvisioner(runtime, {
        python: fixtureRecipe(`${base}/${name}`, archive),
      });
      await expect(provisioner.provision('python')).rejects.toThrow(expected);
    }
  });

  it('rejects Windows-reserved and case-colliding archive paths before writes', async () => {
    for (const entries of [
      { 'NUL.txt': 'bad', 'bin/server.txt': 'ok' },
      { 'Readme.txt': 'one', 'README.TXT': 'two', 'bin/server.txt': 'ok' },
    ]) {
      const archive = makeZip(entries);
      const { base } = await listen((_request, response) => { response.statusCode = 200; response.end(archive); });
      const runtime = await tempRuntime();
      const provisioner = new SemanticProviderProvisioner(runtime, {
        python: fixtureRecipe(`${base}/provider.zip`, archive),
      });
      await expect(provisioner.provision('python')).rejects.toThrow(/SEMANTIC_PROVIDER_ARCHIVE_PATH_NONPORTABLE|SEMANTIC_PROVIDER_ARCHIVE_COLLISION/);
      await expect(readFile(path.join(runtime, 'providers', 'python', 'bin', 'server.txt'), 'utf8')).rejects.toThrow();
    }
  });

  it('preserves a prior valid provider when an explicit repair candidate fails preflight', async () => {
    const good = makeZip({ 'bin/server.txt': 'stable' });
    const { base } = await listen((request, response) => {
      response.statusCode = 200;
      response.end(request.url === '/good.zip' ? good : patchCentralDirectorySize(good, 4 * 1024 * 1024 + 1));
    });
    const runtime = await tempRuntime();
    const firstRecipe = fixtureRecipe(`${base}/good.zip`, good);
    await new SemanticProviderProvisioner(runtime, { python: firstRecipe }).provision('python');

    const bad = patchCentralDirectorySize(good, 4 * 1024 * 1024 + 1);
    const nextRecipe = fixtureRecipe(`${base}/bad.zip`, bad);
    nextRecipe.recipeVersion = 100;
    const next = new SemanticProviderProvisioner(runtime, { python: nextRecipe });
    await expect(next.provision('python', { repair: true })).rejects.toThrow('SEMANTIC_PROVIDER_ZIP_CENTRAL_DIRECTORY_LIMIT');
    expect(await readFile(path.join(runtime, 'providers', 'python', 'bin', 'server.txt'), 'utf8')).toBe('stable');
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
