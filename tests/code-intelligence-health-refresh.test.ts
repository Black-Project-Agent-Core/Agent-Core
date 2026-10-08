import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('../src/tracker/activity-tracker.js', () => ({ activityTracker: { record: vi.fn(), captureFailure: vi.fn() } }));
vi.mock('../src/code-intelligence/grafel-runtime.js', () => ({ GrafelRuntime: class {} }));
vi.mock('../src/code-intelligence/grafel-client.js', () => ({ GrafelClient: class { listener: any; setToolSurfaceListener(fn: any) { this.listener = fn; } } }));
import { CodeIntelligenceService } from '../src/code-intelligence/service.js';
function deferred() {
  let resolve!: (value: any) => void; let reject!: (error: any) => void;
  const promise = new Promise<any>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function fixture() {
  const config = { enabled: true, projectRoot: 'E:/repo', runtimeDir: 'E:/repo/runtime/grafel', binaryPath: 'unused', group: 'w', repoSlug: 'repo', startupTimeoutMs: 1000, callTimeoutMs: 1000 };
  const s: any = new (CodeIntelligenceService as any)(config);
  s.runtime = {
    status: vi.fn(async () => ({ status: 'ok' })),
    indexState: () => 'current',
    resourcePolicy: () => ({}),
    isolationStatus: () => ({ ok: true, missingOrInvalid: [] }),
    providerAttestation: vi.fn(async () => ({ state: 'current' })),
    stop: vi.fn(async () => undefined),
  };
  s.client.close = vi.fn(async () => undefined);
  s.client.callTool = vi.fn(async (name: string) => name === 'grafel_index_status'
    ? { content: [], structuredContent: { repos: [{ repo: 'E:/repo', group: 'w', state: 'current' }] } }
    : { content: [], structuredContent: { repos: [{ repo: 'repo', entities: 1, relationships: 0 }] } });
  return s;
}
afterEach(() => vi.restoreAllMocks());
describe('TS6 health refresh ownership', () => {
  it('20 concurrent readers share one expired-cache collector', async () => {
    const s = fixture(); const d = deferred(); s.runtime.status.mockReturnValue(d.promise);
    const pending = Array.from({ length: 20 }, () => s.health()); d.resolve({ status: 'ok' });
    const results = await Promise.all(pending);
    expect(results.every(r => r === results[0])).toBe(true); expect(results[0].status).toBe('available');
    expect(s.runtime.status).toHaveBeenCalledTimes(1); expect(s.client.callTool).toHaveBeenCalledTimes(2);
  });
  it('unexpired value is reused but forced readers still share one new owner', async () => {
    const s = fixture(); const first = await s.health(); expect(await s.health()).toBe(first);
    const d = deferred(); s.runtime.status.mockReturnValue(d.promise);
    const pending = [s.health(true), s.health(true), s.health(true)]; d.resolve({ status: 'ok' });
    const results = await Promise.all(pending); expect(results[0]).toBe(results[1]); expect(s.runtime.status).toHaveBeenCalledTimes(2);
  });
  it('collector error releases ownership so a later forced call can recover', async () => {
    const s = fixture(); s.runtime.status.mockRejectedValueOnce(new Error('offline'));
    expect((await s.health()).status).toBe('error'); expect((await s.health(true)).status).toBe('available');
    expect(s.runtime.status).toHaveBeenCalledTimes(2);
  });
  it('old success cannot replace new failure after surface invalidation', async () => {
    const s = fixture(); const old = deferred(); s.runtime.status.mockReturnValueOnce(old.promise);
    const pending = s.health(); await s.client.listener([]);
    s.runtime.status.mockRejectedValueOnce(new Error('new generation failed')); const current = await s.health(true);
    old.resolve({ status: 'ok' }); const stale = await pending;
    expect(stale.status).toBe('degraded'); expect(stale.issue).toContain('SUPERSEDED');
    expect(await s.health()).toBe(current); expect(current.status).toBe('error');
  });
  it('old failure cannot replace newer healthy cache', async () => {
    const s = fixture(); const old = deferred(); s.runtime.status.mockReturnValueOnce(old.promise);
    const pending = s.health(); await s.client.listener([]); const current = await s.health(true);
    old.reject(new Error('old failure')); const stale = await pending;
    expect(stale.status).toBe('degraded'); expect(await s.health()).toBe(current); expect(current.status).toBe('available');
  });
  it('late old owner cannot clear a new pending owner', async () => {
    const s = fixture(); const old = deferred(); const newer = deferred();
    s.runtime.status.mockReturnValueOnce(old.promise).mockReturnValueOnce(newer.promise);
    const first = s.health(); await s.client.listener([]); const second = s.health(true);
    old.resolve({ status: 'ok' }); await first; const joined = s.health(true);
    newer.resolve({ status: 'ok' }); expect(await second).toBe(await joined); expect(s.runtime.status).toHaveBeenCalledTimes(2);
  });
  it('close during refresh cannot resurrect cache or restart provider calls', async () => {
    const s = fixture(); const d = deferred(); s.runtime.status.mockReturnValue(d.promise);
    const pending = s.health(); await s.close(); d.resolve({ status: 'ok' });
    const result = await pending; expect(result.status).toBe('degraded'); expect(result.issue).toContain('CLOSED');
    expect(s.client.callTool).not.toHaveBeenCalled(); expect((await s.health(true)).status).toBe('degraded');
    expect(s.runtime.status).toHaveBeenCalledTimes(1); expect(s.runtime.stop).toHaveBeenCalledTimes(1);
  });
  it('instances never share pending promises or cache snapshots', async () => {
    const a = fixture(); const b = fixture(); const [ha, hb] = await Promise.all([a.health(), b.health()]);
    expect(ha).not.toBe(hb); expect(a.runtime.status).toHaveBeenCalledTimes(1); expect(b.runtime.status).toHaveBeenCalledTimes(1);
  });
  it('missing selected graph stays degraded after deduplication', async () => {
    const s = fixture(); s.client.callTool.mockImplementation(async (name: string) => name === 'grafel_index_status'
      ? { structuredContent: { repos: [{ repo: 'E:/repo', state: 'current' }] } }
      : { structuredContent: { repos: [], unavailable: ['repo: missing'] } });
    const results = await Promise.all([s.health(), s.health()]);
    expect(results[0].status).toBe('degraded'); expect(results[0].index).toBe('unknown');
    expect(s.runtime.status).toHaveBeenCalledTimes(1);
  });
  it('degrades on exact-build attestation mismatch but keeps unverifiable evidence fail-soft', async () => {
    const mismatch = fixture();
    mismatch.runtime.providerAttestation.mockResolvedValue({
      state: 'resident-mismatch',
      issue: 'GRAFEL_PROVIDER_RESIDENT_COMMIT_MISMATCH',
    });
    const degraded = await mismatch.health(true);
    expect(degraded.status).toBe('degraded');
    expect(degraded.issue).toContain('attestation mismatch');
    expect(degraded.providerAttestation.state).toBe('resident-mismatch');

    const uncertain = fixture();
    uncertain.runtime.providerAttestation.mockResolvedValue({
      state: 'unverifiable',
      issue: 'GRAFEL_PROVIDER_RESIDENT_ATTESTATION_UNAVAILABLE',
    });
    const available = await uncertain.health(true);
    expect(available.status).toBe('available');
    expect(available.providerAttestation.state).toBe('unverifiable');
  });

  it('recovers a stale bridge with one retry per read-only provider probe', async () => {
    const s = fixture(); let indexAttempts = 0; let orientAttempts = 0;
    s.client.callTool.mockImplementation(async (name: string) => {
      if (name === 'grafel_index_status') {
        indexAttempts += 1;
        if (indexAttempts === 1) throw new Error('stale index bridge');
        return { structuredContent: { repos: [{ repo: 'E:/repo', state: 'current', dirty: false }] } };
      }
      orientAttempts += 1;
      if (orientAttempts === 1) throw new Error('stale orient bridge');
      return { structuredContent: { repos: [{ repo: 'repo', entities: 1, relationships: 0 }] } };
    });
    const result = await s.health(true);
    expect(result.status).toBe('available'); expect(result.index).toBe('current');
    expect(indexAttempts).toBe(2); expect(orientAttempts).toBe(2);
  });
  it('reconnects once when a stale read-only bridge returns an MCP error result', async () => {
    const s = fixture(); let indexAttempts = 0;
    s.client.callTool.mockImplementation(async (name: string) => {
      if (name === 'grafel_index_status') {
        indexAttempts += 1;
        if (indexAttempts === 1) return { isError: true, content: [{ type: 'text', text: 'daemon not running' }] };
        return { structuredContent: { repos: [{ repo: 'E:/repo', state: 'current', dirty: false }] } };
      }
      return { structuredContent: { repos: [{ repo: 'repo', entities: 1, relationships: 0 }] } };
    });
    const result = await s.health(true);
    expect(result.status).toBe('available'); expect(result.index).toBe('current');
    expect(indexAttempts).toBe(2); expect(s.client.close).toHaveBeenCalledTimes(1);
  });
});
