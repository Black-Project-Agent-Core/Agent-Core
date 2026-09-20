import { describe, expect, it, vi } from 'vitest';
import { CodeIntelligenceService } from '../src/code-intelligence/service.js';
import * as schemas from '../src/mcp/code-intelligence-schemas.js';

const context = { workspace: 'w', group: 'w', cwd: 'C:\\repo', repo: 'repo' };

function serviceWithRuntime(runtime: any): any {
  const service = new (CodeIntelligenceService as any)({
    enabled: true,
    projectRoot: 'C:\\repo',
    runtimeDir: 'C:\\runtime',
    binaryPath: 'C:\\runtime\\grafel.exe',
    group: 'w',
    repoSlug: 'repo',
    startupTimeoutMs: 1000,
    callTimeoutMs: 1000,
  });
  service.runtime = runtime;
  service.providerCapabilities = {
    coreNavigation: true, workspaceRouting: true, refGraphs: true, repairs: true,
    fitness: true, diagnostics: true, quarantine: true, patterns: true, messaging: true,
    graphPatterns: true, crossLinkCandidates: true, enrichmentCandidates: true, dynamicToolRefresh: true,
    toolNames: [], issues: [],
  };
  service.resolveWorkspace = vi.fn(async () => context);
  return service;
}

describe('Grafel final lifecycle contracts', () => {
  it('protects provider-default refs from unpin and requires exact ref rows', async () => {
    const runtime = {
      refs: vi.fn(async () => [{ group: 'w', repo: 'repo', ref: 'main', pinned: true, pin_reason: 'main' }]),
      unpinRef: vi.fn(),
    };
    const service = serviceWithRuntime(runtime);
    await expect(service.setWorkspaceRefPin({ repo: 'repo', targetRef: 'main', pinned: false }))
      .rejects.toThrow(/DEFAULT_REF_PIN_PROTECTED/);
    expect(runtime.unpinRef).not.toHaveBeenCalled();

    runtime.refs = vi.fn(async () => []);
    await expect(service.setWorkspaceRefPin({ repo: 'repo', targetRef: 'missing', pinned: true }))
      .rejects.toThrow(/REF_NOT_FOUND/);
  });

  it('verifies a successful pin transition against provider state', async () => {
    const refs = vi.fn()
      .mockResolvedValueOnce([{ group: 'w', repo: 'repo', ref: 'feature', pinned: false }])
      .mockResolvedValueOnce([{ group: 'w', repo: 'repo', ref: 'feature', pinned: true, pin_reason: 'user' }]);
    const runtime = { refs, pinRef: vi.fn(async () => 'pinned w/repo feature') };
    const service = serviceWithRuntime(runtime);
    const result = await service.setWorkspaceRefPin({ repo: 'repo', targetRef: 'feature', pinned: true });
    expect(result).toMatchObject({ changed: true, ref: { pinned: true } });
    expect(runtime.pinRef).toHaveBeenCalledWith('w', 'repo', 'feature');
  });

  it('keeps ref pruning dry-run by default and gates destructive apply behind an exact confirmation', async () => {
    const runtime = {
      refs: vi.fn(async () => [{ group: 'w', repo: 'repo', ref: 'old', tier: 'expired', pinned: false }]),
      pruneRefs: vi.fn(async (_group: string, options: any) => options.apply ? 'deleted' : 'dry run'),
    };
    const service = serviceWithRuntime(runtime);
    const preview = await service.pruneWorkspaceRefs({ ttl: '14d' });
    expect(preview).toMatchObject({ dryRun: true, beforeCount: 1, afterCount: 1 });
    expect(runtime.pruneRefs).toHaveBeenCalledWith('w', { ttl: '14d', apply: false });

    await expect(service.pruneWorkspaceRefs({ apply: true }))
      .rejects.toThrow(/PRUNE_CONFIRMATION_REQUIRED/);
  });

  it('rejects ambiguous quarantine repo slugs before provider mutation', async () => {
    const runtime = {
      listWorkspaces: vi.fn(async () => [
        { name: 'w', repos: [{ slug: 'repo', path: 'C:\\repo' }] },
        { name: 'other', repos: [{ slug: 'repo', path: 'C:\\other' }] },
      ]),
      quarantine: vi.fn(),
      mutateQuarantine: vi.fn(),
    };
    const service = serviceWithRuntime(runtime);
    await expect(service.mutateQuarantine({
      action: 'remove', repo: 'repo', relativePath: 'dist', confirmation: 'QUARANTINE_MUTATION',
    })).rejects.toThrow(/REPO_AMBIGUOUS/);
    expect(runtime.mutateQuarantine).not.toHaveBeenCalled();
  });

  it('requires exact quarantine state and verifies pin mutation after provider write', async () => {
    const quarantine = vi.fn()
      .mockResolvedValueOnce([{ group: 'w', repo: 'repo', path: 'dist', pinned: false }])
      .mockResolvedValueOnce([{ group: 'w', repo: 'repo', path: 'dist', pinned: true }]);
    const runtime = {
      listWorkspaces: vi.fn(async () => [{ name: 'w', repos: [{ slug: 'repo', path: 'C:\\repo' }] }]),
      quarantine,
      mutateQuarantine: vi.fn(async () => 'pinned repo/dist'),
    };
    const service = serviceWithRuntime(runtime);
    const result = await service.mutateQuarantine({
      action: 'pin', repo: 'repo', relativePath: 'dist', confirmation: 'QUARANTINE_MUTATION',
    });
    expect(result).toMatchObject({ changed: true, action: 'pin', entry: { pinned: true } });
  });

  it('returns bounded provider metrics without exposing provider rollup paths or session identifiers', async () => {
    const service = serviceWithRuntime({});
    service.callProviderTool = vi.fn(async () => ({
      content: [{ type: 'text', text: JSON.stringify({
        rollup_dir: 'C:/sensitive/path',
        session: {
          session_id: 'hidden-session', uptime_seconds: 12, total_calls: 9, total_errors: 1,
          tools: [
            { tool: 'b', calls: 2, errors: 1, error_pct: 50, p50_ms: 5, p95_ms: 9 },
            { tool: 'a', calls: 7, errors: 0, error_pct: 0, p50_ms: 2, p95_ms: 4 },
          ],
        },
        rollup_records: [
          { session_id: 'one', tool: 'a', calls: 4, errors: 0, p50_ms: 2, p95_ms: 5 },
          { session_id: 'two', tool: 'a', calls: 3, errors: 1, p50_ms: 3, p95_ms: 8 },
        ],
      }) }],
    }));
    const result = await service.providerMetrics({ days: 3, limit: 1 });
    expect(result.session.tools).toEqual([{ tool: 'a', calls: 7, errors: 0, errorPct: 0, p50Ms: 2, p95Ms: 4 }]);
    expect(result.rollup.tools).toEqual([{ tool: 'a', calls: 7, errors: 1, records: 2, maxObservedP50Ms: 3, maxObservedP95Ms: 8 }]);
    expect(JSON.stringify(result)).not.toContain('sensitive/path');
    expect(JSON.stringify(result)).not.toContain('hidden-session');
  });

  it('accepts the final public lifecycle and metrics schema actions', () => {
    expect(schemas.codeOrient.parse({ action: 'metrics', metricsDays: 7, metricsLimit: 10 }).action).toBe('metrics');
    expect(schemas.codeWorkspace.parse({ action: 'pin_ref', repo: 'repo', targetRef: 'feature' }).action).toBe('pin_ref');
    expect(schemas.codeWorkspace.parse({ action: 'prune_refs', apply: true, confirmation: 'PRUNE_EXPIRED_REFS' }).action).toBe('prune_refs');
    expect(schemas.codeRepair.parse({ action: 'quarantine_pin', repo: 'repo', quarantinePath: 'dist', confirmation: 'QUARANTINE_MUTATION' }).action).toBe('quarantine_pin');
  });
});