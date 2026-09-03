import { describe, expect, it } from 'vitest';
import {
  NativeSearchFallbackProvider,
  type ArchitectureRequest,
  type ArchitectureResult,
  type BlastRadiusRequest,
  type BlastRadiusResult,
  type CodeEvidence,
  type CodeIntelligenceProvider,
  type FeatureSearchRequest,
  type FeatureSearchResult,
  type FreshnessRequest,
  type FreshnessResult,
  type NativeCodeIntelligenceSource,
  type SymbolTraceRequest,
  type SymbolTraceResult,
  type TestDiscoveryRequest,
  type TestDiscoveryResult,
} from '../src/implementation/code-intelligence.js';

const evidence = (path: string, symbol?: string): CodeEvidence => ({
  path,
  ...(symbol ? { symbol } : {}),
  evidenceType: 'search_hit',
});

class FakeProvider implements CodeIntelligenceProvider {
  providerId() { return 'fake-graph'; }
  async mapArchitecture(_request: ArchitectureRequest): Promise<ArchitectureResult> {
    return { providerId: this.providerId(), completeness: 'complete', evidence: [], notes: [], areas: ['core'] };
  }
  async findFeature(_request: FeatureSearchRequest): Promise<FeatureSearchResult> {
    return { providerId: this.providerId(), completeness: 'complete', evidence: [evidence('src/a.ts', 'A')], notes: [], entryPoints: [evidence('src/a.ts', 'A')] };
  }
  async traceInbound(_request: SymbolTraceRequest): Promise<SymbolTraceResult> {
    return { providerId: this.providerId(), completeness: 'complete', evidence: [], notes: [], edges: [] };
  }  async traceOutbound(request: SymbolTraceRequest): Promise<SymbolTraceResult> {
    return this.traceInbound(request);
  }
  async findTests(_request: TestDiscoveryRequest): Promise<TestDiscoveryResult> {
    return { providerId: this.providerId(), completeness: 'complete', evidence: [], notes: [], tests: [] };
  }
  async blastRadius(_request: BlastRadiusRequest): Promise<BlastRadiusResult> {
    return { providerId: this.providerId(), completeness: 'complete', evidence: [], notes: [], affected: [] };
  }
  async freshness(_request: FreshnessRequest): Promise<FreshnessResult> {
    return { providerId: this.providerId(), completeness: 'complete', evidence: [], notes: [], fingerprint: 'f'.repeat(64), fresh: true };
  }
}

class FakeNativeSource implements NativeCodeIntelligenceSource {
  async searchContent(request: { projectRoot: string; query: string; maxResults: number }) {
    return [evidence('src/one.ts', 'One'), evidence('src/two.ts', 'Two'), evidence('src/three.ts', 'Three')]
      .slice(0, request.maxResults);
  }
  async fingerprint(_projectRoot: string) { return '1'.repeat(64); }
}

describe('CodeIntelligenceProvider contract', () => {
  it('supports a provider-neutral complete graph implementation', async () => {
    const provider: CodeIntelligenceProvider = new FakeProvider();
    const found = await provider.findFeature({ projectRoot: '/repo', query: 'feature', maxResults: 5 });
    expect(provider.providerId()).toBe('fake-graph');
    expect(found.completeness).toBe('complete');
    expect(found.entryPoints).toHaveLength(1);
  });
  it('keeps native fallback feature search bounded and explicitly partial', async () => {
    const provider = new NativeSearchFallbackProvider(new FakeNativeSource());
    const found = await provider.findFeature({ projectRoot: '/repo', query: 'feature', maxResults: 2 });
    expect(provider.providerId()).toBe('native-search-fallback');
    expect(found.completeness).toBe('partial');
    expect(found.entryPoints.map((item) => item.path)).toEqual(['src/one.ts', 'src/two.ts']);
  });

  it('keeps call graph insufficient while exposing bounded partial blast evidence from native text search', async () => {
    const provider = new NativeSearchFallbackProvider(new FakeNativeSource());
    const inbound = await provider.traceInbound({ projectRoot: '/repo', symbol: 'One', maxDepth: 2, maxResults: 10 });
    const blast = await provider.blastRadius({ projectRoot: '/repo', changedSymbols: ['One'], maxDepth: 2, maxResults: 10 });
    expect(inbound.completeness).toBe('insufficient');
    expect(inbound.edges).toEqual([]);
    expect(blast.completeness).toBe('partial');
    expect(blast.affected.length).toBeGreaterThan(0);
    expect([...inbound.notes, ...blast.notes].join(' ')).toMatch(/graph/i);
  });

  it('uses a deterministic native fingerprint as complete freshness evidence', async () => {
    const provider = new NativeSearchFallbackProvider(new FakeNativeSource());
    const fresh = await provider.freshness({ projectRoot: '/repo', expectedFingerprint: '1'.repeat(64) });
    const stale = await provider.freshness({ projectRoot: '/repo', expectedFingerprint: '2'.repeat(64) });
    expect(fresh).toMatchObject({ completeness: 'complete', fingerprint: '1'.repeat(64), fresh: true });
    expect(stale).toMatchObject({ completeness: 'complete', fingerprint: '1'.repeat(64), fresh: false });
  });
});