import { execFileSync, spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { FileKeyStore } from '../src/auth/key-store.js';
import { loadConfig } from '../src/config.js';
import { GitHubApiService } from '../src/github/api-service.js';
import { GitHubCredentialProvider } from '../src/github/credentials.js';
import { GitHubService } from '../src/github/service.js';
import { createHttpHandler } from '../src/http/app.js';
import { startAgentCoreService, type AgentCoreService } from '../src/index.js';
import { FileAuditLogger } from '../src/logging/audit-log.js';
import { createMcpHttpHandler } from '../src/mcp/handler.js';
import { SERVER_VERSION } from '../src/mcp/server.js';
import { createRuntimeServices, type RuntimeServices } from '../src/runtime/services.js';
import { WorkspacePolicy } from '../src/runtime/workspace.js';

// The single development identity every Agent Core version probe must agree on.
const EXPECTED = '0.7.0';
const EXPECTED_USER_AGENT = `Agent-Core/${EXPECTED}`;
const VERSION_SOURCE = 'src/version.ts';
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const roots: string[] = [];
const servers: Server[] = [];
const runtimes: RuntimeServices[] = [];
const auditLoggers: FileAuditLogger[] = [];
const services: AgentCoreService[] = [];

async function tempRoot(prefix: string): Promise<string> {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), prefix)));
  roots.push(root);
  return root;
}

function readRepoText(relative: string): Promise<string> {
  return readFile(path.join(repoRoot, relative), 'utf8');
}

async function readRepoJson(relative: string): Promise<Record<string, any>> {
  return JSON.parse(await readRepoText(relative)) as Record<string, any>;
}

// Every source file on disk, so a freshly added one is scanned before it is committed and a
// still-indexed deletion is not scanned at all.
function sourceFiles(prefix: string): string[] {
  return readdirSync(path.join(repoRoot, prefix), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(repoRoot, path.join(entry.parentPath, entry.name)).replaceAll('\\', '/'))
    .sort();
}

function localTagExists(version: string): boolean {
  return execFileSync('git', ['-C', repoRoot, 'tag', '-l', `v${version}`], { encoding: 'utf8' }).trim() !== '';
}

async function mcpInitialize(baseUrl: string, key: string) {
  const response = await fetch(`${baseUrl}/mcp`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: {
        protocolVersion: '2025-11-25', capabilities: {},
        clientInfo: { name: 'agent-core-version-identity', version: '1.0.0' },
      },
    }),
  });
  return { status: response.status, json: await response.json() as Record<string, any> };
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
  for (const service of services.splice(0)) {
    await service.close().catch(() => undefined);
  }
  await Promise.all(runtimes.splice(0).map(async (runtime) => {
    await runtime.execution.close().catch(() => undefined);
    await runtime.memory.close().catch(() => undefined);
  }));
  await Promise.all(auditLoggers.splice(0).map((logger) => logger.close().catch(() => undefined)));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('Agent Core development version identity', () => {
  it('package.json declares the development version', async () => {
    const pkg = await readRepoJson('package.json');
    expect(pkg.version).toBe(EXPECTED);
  });

  it('package-lock.json root and workspace-root versions match the package version', async () => {
    const lock = await readRepoJson('package-lock.json');
    expect(lock.version).toBe(EXPECTED);
    expect(lock.packages?.['']?.version).toBe(EXPECTED);
  });

  it('SERVER_VERSION is derived from exactly one tracked version literal', async () => {
    expect(SERVER_VERSION).toBe(EXPECTED);

    const versionSource = await readRepoText(VERSION_SOURCE);
    expect(versionSource).toMatch(new RegExp(`AGENT_CORE_VERSION\\s*=\\s*'${EXPECTED.replaceAll('.', '\\.')}'`));

    const holders: string[] = [];
    for (const file of sourceFiles('src/')) {
      const text = await readRepoText(file);
      if (/(?:AGENT_CORE_VERSION|SERVER_VERSION)\s*=\s*['"]\d+\.\d+\.\d+['"]/.test(text)) holders.push(file);
      if (/Agent-Core\/\d+\.\d+\.\d+/.test(text)) holders.push(`${file}#user-agent`);
    }
    expect(holders).toEqual([VERSION_SOURCE]);
  });

  it('GitHub Fabric sends the version-derived User-Agent on API and release-asset upload paths', async () => {
    const root = await tempRoot('agent-core-version-github-');
    const config = loadConfig({}, root).github;
    await mkdir(path.dirname(config.tokenFile), { recursive: true });
    await writeFile(config.tokenFile, 'SENTINEL_GITHUB_TOKEN', 'utf8');
    await writeFile(config.packagesTokenFile, 'SENTINEL_PACKAGES_TOKEN', 'utf8');

    const seen: string[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = input instanceof Request ? input.url : String(input);
      const headers = new Headers(init?.headers);
      seen.push(`${new URL(url).host} ${headers.get('user-agent') ?? '<none>'}`);
      return new Response(JSON.stringify({ ok: true }), {
        status: 200, headers: { 'content-type': 'application/json' },
      });
    };

    const api = new GitHubApiService(config, new GitHubCredentialProvider(config), fetchImpl);
    await api.request({ method: 'GET', endpoint: '/user' });

    const assetPath = path.join(root, 'release-asset.txt');
    await writeFile(assetPath, 'asset bytes', 'utf8');
    const service = new GitHubService(config, new WorkspacePolicy([root]), { fetchImpl });
    await service.release({ operation: 'upload_asset', owner: 'black-project', repo: 'agent-core', releaseId: 1, assetPath });

    expect(seen).toEqual([
      `api.github.com ${EXPECTED_USER_AGENT}`,
      `uploads.github.com ${EXPECTED_USER_AGENT}`,
    ]);
    expect(await readRepoText('docs/github.md')).toContain(`User-Agent: ${EXPECTED_USER_AGENT}`);
  });

  it('in-process MCP initialize reports the development version', async () => {
    const root = await tempRoot('agent-core-version-mcp-');
    const keyStore = new FileKeyStore(path.join(root, 'data'));
    const created = await keyStore.create('version-identity');
    const runtime = createRuntimeServices([root], path.join(root, 'capabilities'), undefined, {
      ...loadConfig({}, root).memory,
      enabled: false,
    });
    runtimes.push(runtime);
    const auditLogger = new FileAuditLogger(path.join(root, 'logs'));
    auditLoggers.push(auditLogger);
    const server = createServer(createHttpHandler({
      keyStore,
      auditLogger,
      mcpHandler: createMcpHttpHandler(runtime),
    }));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    servers.push(server);
    const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    const initialize = await mcpInitialize(baseUrl, created.key);
    expect(initialize.status).toBe(200);
    expect(initialize.json.result.serverInfo).toMatchObject({ name: 'agent-core', version: EXPECTED });
  });

  it('the unified service /health reports the development version on an isolated root', async () => {
    const root = await tempRoot('agent-core-version-service-');
    const config = loadConfig({}, root);
    config.host = '127.0.0.1';
    config.port = 0;
    config.dataDir = path.join(root, 'runtime', 'data');
    config.logDir = path.join(root, 'runtime', 'logs');
    config.capabilityDir = path.join(root, 'capabilities');
    config.allowedRoots = [root];

    const service = await startAgentCoreService(config);
    services.push(service);
    const health = await fetch(`http://${service.host}:${service.port}/health`);
    expect(health.status).toBe(200);
    expect(await health.json()).toMatchObject({ status: 'ok', service: 'agent-core', version: EXPECTED });
  });

  it('smoke-test.mjs compares the MCP server version against package.json instead of a literal', async () => {
    const source = await readRepoText('scripts/smoke-test.mjs');
    expect(source).not.toMatch(/version\s*===\s*['"]\d+\.\d+\.\d+['"]/);
    expect(source).not.toMatch(/['"]0\.\d+\.\d+['"]/);
    expect(source).toContain('package.json');
  });

  it('check-release passes for the development identity and reports the changelog section mode', () => {
    const run = spawnSync(process.execPath, ['scripts/release/check-release.mjs'], { cwd: repoRoot, encoding: 'utf8' });
    expect(run.stderr).toBe('');
    expect(run.status).toBe(0);
    const report = JSON.parse(run.stdout) as Record<string, unknown>;
    expect(report).toMatchObject({
      ok: true,
      version: EXPECTED,
      serverVersion: EXPECTED,
      changelogSection: localTagExists(EXPECTED) ? 'released' : 'unreleased',
      readmeVersionNeutral: true,
    });
  });

  it('changelogSectionRequirement needs Unreleased content before the tag exists and a released section after', async () => {
    const mod = await import('../scripts/release/check-release.mjs') as Record<string, any>;
    const { changelogSectionRequirement } = mod;
    expect(typeof changelogSectionRequirement).toBe('function');

    const historical = '## [0.6.0] - 2026-08-31 — Stable\n\n### Added\n\n- Historical entry.\n';
    const unreleasedFilled = `# Changelog\n\n## Unreleased\n\n### Added\n\n- Pending change.\n\n${historical}`;
    const unreleasedEmpty = `# Changelog\n\n## Unreleased\n\n${historical}`;
    const released = `# Changelog\n\n## Unreleased\n\n## [0.7.0] - 2026-09-03 - Stable\n\n### Added\n\n- Released change.\n\n${historical}`;

    expect(changelogSectionRequirement({ version: '0.7.0', tagExists: false, changelog: unreleasedFilled }))
      .toMatchObject({ ok: true, changelogSection: 'unreleased' });
    expect(changelogSectionRequirement({ version: '0.7.0', tagExists: false, changelog: unreleasedEmpty }))
      .toMatchObject({ ok: false, changelogSection: 'unreleased' });
    expect(changelogSectionRequirement({ version: '0.7.0', tagExists: false, changelog: `# Changelog\n\n${historical}` }))
      .toMatchObject({ ok: false, changelogSection: 'unreleased' });
    expect(changelogSectionRequirement({ version: '0.7.0', tagExists: false, changelog: released }))
      .toMatchObject({ ok: false, changelogSection: 'unreleased' });

    expect(changelogSectionRequirement({ version: '0.7.0', tagExists: true, changelog: released }))
      .toMatchObject({ ok: true, changelogSection: 'released' });
    expect(changelogSectionRequirement({ version: '0.7.0', tagExists: true, changelog: unreleasedFilled }))
      .toMatchObject({ ok: false, changelogSection: 'released' });
  });
});
