import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('../src/tracker/activity-tracker.js', () => ({ activityTracker: { record: vi.fn(), captureFailure: vi.fn() } }));
vi.mock('../src/code-intelligence/grafel-runtime.js', () => ({ GrafelRuntime: class {} }));
vi.mock('../src/code-intelligence/grafel-client.js', () => ({ GrafelClient: class { setToolSurfaceListener() {} } }));
import { CodeIntelligenceService } from '../src/code-intelligence/service.js';
import { WorkspaceResolver } from '../src/code-intelligence/workspace-resolver.js';
const config = { enabled: false, projectRoot: 'E:/root', runtimeDir: 'E:/root/runtime/grafel', binaryPath: 'unused', group: 'w', repoSlug: 'a', startupTimeoutMs: 1000, callTimeoutMs: 1000 };
const repos = ['a', 'b', 'c', 'd', 'e'].map(slug => ({ slug, path: `E:/repos/${slug}` }));
function fixture(selected = 'b', options: { loaded?: string[]; zero?: boolean; statsError?: boolean; refs?: any[]; ref?: string; indexedRef?: string; dirty?: boolean } = {}) {
  const current = repos.find(r => r.slug === selected)!;
  const context = { workspace: 'w', group: 'w', cwd: current.path, repo: selected, ...(options.ref ? { ref: options.ref, worktreePath: current.path } : {}) };
  const service: any = new (CodeIntelligenceService as any)(config);
  const loaded = options.loaded ?? ['a'];
  service.providerCapabilities = { workspaceRouting: true, refGraphs: true };
  service.runtime = {
    refs: vi.fn(async () => options.refs ?? loaded.map(repo => ({ group: 'w', repo, ref: options.ref ?? '' }))),
    requestIndexFor: vi.fn(async () => undefined),
    assertMutationAttested: vi.fn(async () => ({ state: 'current' })),
    providerAttestation: vi.fn(async () => ({ state: 'current' })),
  };
  service.workspaceResolver = { list: vi.fn(async () => [{ name: 'w', repos }]), currentGitRef: vi.fn(async () => options.ref) };
  service.resolveWorkspace = vi.fn(async () => context);
  service.client = { callTool: vi.fn(async (name: string, args: any) => {
    if (name === 'grafel_index_status') return { content: [], structuredContent: { repos: repos.map(r => ({ repo: r.path, group: 'w', state: 'current', dirty: options.dirty ?? false, ...(options.ref ? { indexed_ref: options.indexedRef ?? options.ref, indexed_commit: 'a'.repeat(40) } : {}) })) } };
    if (name === 'grafel_orient' && args.view === 'stats') {
      if (options.statsError) throw new Error('provider offline');
      return { content: [], structuredContent: { repos: loaded.map(repo => ({ repo, entities: options.zero ? 0 : 3, relationships: options.zero ? 0 : 2 })), unavailable: repos.filter(r => !loaded.includes(r.slug)).map(r => `${r.slug}: no graph file found`) } };
    }
    throw new Error(`Unexpected provider operation ${name}`);
  }) };
  return service;
}
afterEach(() => vi.restoreAllMocks());
describe('G28 exact graph truth', () => {
  it('current sidecar and another repo graph cannot establish selected graph availability', async () => {
    const s = fixture(); const result: any = await s.workspaceStatus();
    expect(result.index).toBe('unknown'); expect(result.graphAvailability.available).toBe(false);
    expect(result.groupCoverage).toMatchObject({ totalRepos: 5, availableRepos: 1, currentRepos: 1, complete: false });
  });
  it('valid empty selected graph is current; group incompleteness is separate', async () => {
    const r: any = await fixture('a', { zero: true }).workspaceStatus();
    expect(r.index).toBe('current'); expect(r.graphAvailability.available).toBe(true);
    expect(r.groupCoverage.complete).toBe(false);
  });
  it('correct loaded graph but wrong exact ref is not current', async () => {
    const r: any = await fixture('b', { loaded: ['b'], ref: 'feature', refs: [{ group: 'w', repo: 'b', ref: 'main' }] }).workspaceStatus();
    expect(r.index).toBe('unknown');
  });
  it('wrong indexed ref is not current', async () => {
    const r: any = await fixture('b', { loaded: ['b'], ref: 'feature', indexedRef: 'main' }).workspaceStatus(); expect(r.index).toBe('unknown');
  });
  it('provider load failure remains explicit and fail-soft', async () => {
    const r: any = await fixture('a', { statsError: true }).workspaceStatus();
    expect(r.index).toBe('unknown'); expect(r.graphAvailability.available).toBe(false); expect(r.groupCoverage.complete).toBe(false);
  });
  it('dirty sidecar cannot become current solely because a graph loads', async () => {
    expect((await fixture('a', { dirty: true }).workspaceStatus() as any).index).toBe('dirty');
  });
  it('indexes only the selected context and reports its identity', async () => {
    const s = fixture('c'); const r = await s.indexWorkspace();
    expect(s.runtime.requestIndexFor).toHaveBeenCalledExactlyOnceWith('E:/repos/c', undefined);
    expect(r).toMatchObject({ context: { repo: 'c', cwd: 'E:/repos/c' }, requested: true });
  });
  it('wrong group reference cannot validate the selected graph', async () => {
    const r: any = await fixture('a', { refs: [{ group: 'other', repo: 'a', ref: '' }] }).workspaceStatus(); expect(r.index).toBe('unknown');
  });
});
describe('G28 repo-filter routing', () => {
  function resolver() { return new WorkspaceResolver(config, { listWorkspaces: async () => [{ name: 'w', repos }] } as any); }
  it('unknown explicit filter fails instead of selecting the first repo', async () => {
    await expect(resolver().resolve({ workspace: 'w', repoFilter: ['missing'] })).rejects.toThrow(/REPO_FILTER/);
  });
  it('partly unknown filter also fails before any mutation', async () => {
    await expect(resolver().resolve({ workspace: 'w', repoFilter: ['a', 'missing'] })).rejects.toThrow(/REPO_FILTER/);
  });
  it('canonicalizes a valid case-insensitive filter', async () => {
    const r = await resolver().resolve({ workspace: 'w', repoFilter: ['B'] });
    expect(r.repo).toBe('b'); expect(r.repoFilter).toEqual(['b']);
  });
  it('empty filter retains documented first-context default', async () => {
    expect((await resolver().resolve({ workspace: 'w' })).repo).toBe('a');
  });
});

describe('G28 root health and evidence precedence', () => {
  it('root health cannot use an unrelated repository graph', async () => {
    const s = fixture('b');
    s.config = { ...config, enabled: true, projectRoot: 'E:/repos/b', repoSlug: 'b' };
    s.runtime.status = async () => ({ status: 'ok' });
    s.runtime.indexState = () => 'current';
    s.runtime.isolationStatus = () => ({ ok: true, missingOrInvalid: [] });
    s.runtime.resourcePolicy = () => ({});
    const h = await s.health(true);
    expect(h.index).toBe('unknown'); expect(h.status).toBe('degraded');
  });
  it('a matching exact worktree/ref graph can be current', async () => {
    const r: any = await fixture('b', { loaded: ['b'], ref: 'feature' }).workspaceStatus();
    expect(r.index).toBe('current'); expect(r.graphAvailability.available).toBe(true);
  });
  it('an explicit unavailable graph entry overrides a duplicate success row', async () => {
    const s = fixture('a'); const original = s.client.callTool;
    s.client.callTool = async (name: string, args: any) => {
      const reply = await original(name, args);
      if (name === 'grafel_orient') reply.structuredContent.unavailable = ['a: unreadable'];
      return reply;
    };
    expect((await s.workspaceStatus()).index).toBe('unknown');
  });
});
