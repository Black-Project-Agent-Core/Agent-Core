import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { McpServer } from '@modelcontextprotocol/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CodeIntelligenceService, isSupportedGrafelWireVersion } from '../src/code-intelligence/service.js';
import { WorkspaceResolver } from '../src/code-intelligence/workspace-resolver.js';
import { collectBoundedGraphTouches, registerCodeIntelligenceTools } from '../src/mcp/code-intelligence-tools.js';

const tempRoots: string[] = [];
afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

function config(root = 'C:\\repo'): any {
  return {
    enabled: true, projectRoot: root, runtimeDir: 'C:\\runtime', binaryPath: 'C:\\runtime\\grafel.exe',
    group: 'agent-core', repoSlug: 'agent-core', startupTimeoutMs: 1000, callTimeoutMs: 1000,
  };
}
function serviceWith(runtime: any, resolver?: any): any {
  const service = new (CodeIntelligenceService as any)(config());
  service.runtime = runtime;
  if (resolver) service.workspaceResolver = resolver;
  service.providerCapabilities = {
    coreNavigation: true, workspaceRouting: true, refGraphs: false, repairs: true,
    fitness: true, diagnostics: true, quarantine: true, patterns: true, messaging: true,
    graphPatterns: true, crossLinkCandidates: true, enrichmentCandidates: true, dynamicToolRefresh: true,
    toolNames: [], issues: [],
  };
  return service;
}

function registeredHandler(server: any, name: string): (args: any) => Promise<any> {
  const regs = server._registeredTools ?? server.registeredTools;
  const entry = regs instanceof Map ? regs.get(name) : regs?.[name];
  if (!entry?.handler) throw new Error(`missing handler ${name}`);
  return entry.handler;
}

describe('Grafel re-grounding G20-G25', () => {
  it('detects stale workspaces without classifying unreadable paths as stale', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'ac-grafel-hygiene-'));
    tempRoots.push(root);
    const present = path.join(root, 'present');
    await mkdir(present);
    const resolver = new WorkspaceResolver(config(root), {
      listWorkspaces: vi.fn(async () => [
        { name: 'live', repos: [{ slug: 'live', path: present }] },
        { name: 'stale', repos: [{ slug: 'gone', path: path.join(root, 'gone') }] },
      ]),
    } as any);
    const rows = await resolver.hygiene();
    expect(rows.find(row => row.workspace === 'live')?.stale).toBe(false);
    expect(rows.find(row => row.workspace === 'stale')?.stale).toBe(true);
  });
  it('keeps workspace removal explicit, idempotent, and default-workspace protected', async () => {
    let workspaces = [{ name: 'old-audit', repos: [{ slug: 'x', path: 'C:\\gone' }] }];
    const runtime = { deleteWorkspace: vi.fn(async (name: string) => { workspaces = workspaces.filter(item => item.name !== name); }) };
    const resolver = {
      list: vi.fn(async () => workspaces),
      hygiene: vi.fn(async () => [{ workspace: 'old-audit', stale: true, repos: [{ slug: 'x', path: 'C:\\gone', state: 'missing' }] }]),
    };
    const service = serviceWith(runtime, resolver);

    await expect(service.unregisterWorkspace({ workspace: 'agent-core', confirmation: 'UNREGISTER_WORKSPACE' }))
      .rejects.toThrow(/DEFAULT_PROTECTED/);
    await expect(service.unregisterWorkspace({ workspace: 'old-audit' }))
      .rejects.toThrow(/UNREGISTER_CONFIRMATION_REQUIRED/);
    expect(await service.unregisterWorkspace({ workspace: 'old-audit', confirmation: 'UNREGISTER_WORKSPACE' }))
      .toMatchObject({ changed: true, workspace: 'old-audit' });
    expect(await service.unregisterWorkspace({ workspace: 'old-audit', confirmation: 'UNREGISTER_WORKSPACE' }))
      .toMatchObject({ changed: false, reason: 'already-unregistered' });
  });

  it('keeps stale workspace pruning dry-run by default and gates apply', async () => {
    let workspaces = [{ name: 'stale-audit', repos: [{ slug: 'x', path: 'C:\\gone' }] }];
    const runtime = { deleteWorkspace: vi.fn(async () => { workspaces = []; }) };
    const resolver = {
      list: vi.fn(async () => workspaces),
      hygiene: vi.fn(async () => [{ workspace: 'stale-audit', stale: true, repos: [{ slug: 'x', path: 'C:\\gone', state: 'missing' }] }]),
    };
    const service = serviceWith(runtime, resolver);
    expect(await service.pruneWorkspaces()).toMatchObject({ dryRun: true, staleCount: 1 });
    await expect(service.pruneWorkspaces({ apply: true })).rejects.toThrow(/PRUNE_CONFIRMATION_REQUIRED/);
    expect(await service.pruneWorkspaces({ apply: true, confirmation: 'PRUNE_STALE_WORKSPACES' }))
      .toMatchObject({ dryRun: false, removed: ['stale-audit'] });
  });
  it('enforces the current Grafel wire-version compatibility policy without affecting other subsystems', async () => {
    expect(isSupportedGrafelWireVersion('0.1.0')).toBe(true);
    expect(isSupportedGrafelWireVersion('0.1.9')).toBe(true);
    expect(isSupportedGrafelWireVersion('0.2.0')).toBe(false);
    expect(isSupportedGrafelWireVersion(undefined)).toBe(false);

    const runtime = {
      status: vi.fn(async () => ({ status: 'ok', state: 'current', version: 'candidate' })),
      indexState: vi.fn(() => 'current'),
      isolationStatus: vi.fn(() => ({ ok: true, missingOrInvalid: [] })),
      resourcePolicy: vi.fn(() => ({})),
    };
    const service = serviceWith(runtime);
    service.client = {
      callTool: vi.fn(async (name: string) => name === 'grafel_orient'
        ? { content: [{ type: 'text', text: JSON.stringify({ wire_version: '0.2.0' }) }] }
        : { content: [{ type: 'text', text: JSON.stringify({ repos: [{ repo: 'C:\\repo', state: 'current' }] }) }] }),
    };
    await service.refreshProviderWireCompatibility();
    const health = await service.refreshHealth();
    expect(health).toMatchObject({ status: 'degraded', providerWireVersion: '0.2.0', providerWireCompatible: false });
    expect(health.issue).toMatch(/WIRE_VERSION_UNSUPPORTED/);
  });
  it('routes typed find/inspect/stats options and rejects cross-kind analysis discriminators', async () => {
    const callProviderTool = vi.fn(async () => ({ content: [{ type: 'text', text: '{}' }] }));
    const service: any = {
      callProviderTool,
      health: vi.fn(), workspaceStatus: vi.fn(), diagnostics: vi.fn(), quarantine: vi.fn(), providerMetrics: vi.fn(),
    };
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    registerCodeIntelligenceTools(server, service);

    await registeredHandler(server, 'code_orient')({
      action: 'find', query: 'Foo', search: 'substring', limit: 3, fields: ['id'],
      contextFilter: ['service'], crossRepo: true,
    });
    expect(callProviderTool).toHaveBeenLastCalledWith('grafel_find', expect.objectContaining({
      query: 'Foo', search: 'substring', limit: 3, fields: ['id'], context_filter: ['service'], cross_repo: true,
    }), expect.any(Object));

    await registeredHandler(server, 'code_orient')({ action: 'inspect', entityId: 'repo::Foo', fields: ['id'], includeUnresolved: true, includeFacet: 'call_contexts' });
    expect(callProviderTool).toHaveBeenLastCalledWith('grafel_inspect', expect.objectContaining({ include_unresolved: true, include: 'call_contexts' }), expect.any(Object));

    await registeredHandler(server, 'code_orient')({ action: 'stats' });
    expect(callProviderTool).toHaveBeenLastCalledWith('grafel_orient', expect.objectContaining({ view: 'stats' }), expect.any(Object));

    const result = await registeredHandler(server, 'code_analysis')({ kind: 'security', analysisPreset: 'cycles' });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result)).toMatch(/valid values: findings, secrets, auth_coverage/);

    await registeredHandler(server, 'code_analysis')({ kind: 'security', analysis: 'future_provider_mode' });
    expect(callProviderTool).toHaveBeenLastCalledWith('grafel_security', expect.objectContaining({ kind: 'future_provider_mode' }), expect.any(Object));
  });
  it('collects bounded redacted graph-touch evidence without changing provider results', () => {
    const rawSecret = 'api_key=FAKE_TEST_SECRET_1234567890';
    const items = Array.from({ length: 30 }, (_, i) => ({ id: `repo::entity-${i}`, edge_id: `edge-${i}` }));
    items[0] = { id: rawSecret, edge_id: 'edge-secret' };
    const result: any = { content: [{ type: 'text', text: JSON.stringify({ items }) }] };
    const touches = collectBoundedGraphTouches(result, { entity_id: 'repo::input' });
    expect(touches.entityIds.length).toBeLessThanOrEqual(12);
    expect(touches.edgeIds.length).toBeLessThanOrEqual(12);
    expect(JSON.stringify(touches)).not.toContain(rawSecret);
    expect(JSON.stringify(result)).toContain(rawSecret);
  });
});
