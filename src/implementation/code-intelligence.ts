export type AnalysisCompleteness = 'complete' | 'partial' | 'insufficient';

export interface CodeEvidence {
  path: string;
  symbol?: string;
  line?: number;
  evidenceType: 'search_hit' | 'symbol' | 'call_edge' | 'test' | 'architecture' | 'fingerprint';
  summary?: string;
}

export interface AnalysisEnvelope {
  providerId: string;
  completeness: AnalysisCompleteness;
  evidence: CodeEvidence[];
  notes: string[];
}

export interface ArchitectureRequest {
  projectRoot: string;
  maxResults?: number;
}
export interface ArchitectureResult extends AnalysisEnvelope { areas: string[]; }

export interface FeatureSearchRequest {
  projectRoot: string;
  query: string;
  maxResults?: number;
}
export interface FeatureSearchResult extends AnalysisEnvelope { entryPoints: CodeEvidence[]; }

export interface SymbolTraceRequest {
  projectRoot: string;
  symbol: string;
  maxDepth?: number;
  maxResults?: number;
}
export interface TraceEdge { from: CodeEvidence; to: CodeEvidence; relation: string; }
export interface SymbolTraceResult extends AnalysisEnvelope { edges: TraceEdge[]; }
export interface TestDiscoveryRequest {
  projectRoot: string;
  query: string;
  maxResults?: number;
}
export interface TestDiscoveryResult extends AnalysisEnvelope { tests: CodeEvidence[]; }

export interface BlastRadiusRequest {
  projectRoot: string;
  changedSymbols?: string[];
  changedPaths?: string[];
  maxDepth?: number;
  maxResults?: number;
}
export interface BlastRadiusResult extends AnalysisEnvelope { affected: CodeEvidence[]; }

export interface FreshnessRequest {
  projectRoot: string;
  expectedFingerprint?: string;
}
export interface FreshnessResult extends AnalysisEnvelope {
  fingerprint: string | null;
  fresh: boolean | null;
}

export interface CodeIntelligenceProvider {
  providerId(): string;
  mapArchitecture(request: ArchitectureRequest): Promise<ArchitectureResult>;
  findFeature(request: FeatureSearchRequest): Promise<FeatureSearchResult>;
  traceInbound(request: SymbolTraceRequest): Promise<SymbolTraceResult>;
  traceOutbound(request: SymbolTraceRequest): Promise<SymbolTraceResult>;
  findTests(request: TestDiscoveryRequest): Promise<TestDiscoveryResult>;
  blastRadius(request: BlastRadiusRequest): Promise<BlastRadiusResult>;
  freshness(request: FreshnessRequest): Promise<FreshnessResult>;
}

export interface NativeCodeIntelligenceSource {
  searchContent(request: { projectRoot: string; query: string; maxResults: number }): Promise<CodeEvidence[]>;
  fingerprint(projectRoot: string): Promise<string | null>;
}
function boundedLimit(value: number | undefined, fallback = 20): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(200, Math.floor(value!)));
}

const GRAPH_REQUIRED_NOTE = 'Native text search cannot prove complete dependency graph evidence.';

export class NativeSearchFallbackProvider implements CodeIntelligenceProvider {
  constructor(private readonly source: NativeCodeIntelligenceSource) {}

  providerId(): string { return 'native-search-fallback'; }

  async mapArchitecture(_request: ArchitectureRequest): Promise<ArchitectureResult> {
    return {
      providerId: this.providerId(), completeness: 'insufficient', evidence: [],
      notes: [GRAPH_REQUIRED_NOTE], areas: [],
    };
  }

  async findFeature(request: FeatureSearchRequest): Promise<FeatureSearchResult> {
    const evidence = await this.source.searchContent({
      projectRoot: request.projectRoot,
      query: request.query,
      maxResults: boundedLimit(request.maxResults),
    });
    return {
      providerId: this.providerId(), completeness: 'partial', evidence,
      notes: ['Feature candidates come from bounded native text search.'],
      entryPoints: [...evidence],
    };
  }

  async traceInbound(_request: SymbolTraceRequest): Promise<SymbolTraceResult> {
    return { providerId: this.providerId(), completeness: 'insufficient', evidence: [], notes: [GRAPH_REQUIRED_NOTE], edges: [] };
  }

  async traceOutbound(request: SymbolTraceRequest): Promise<SymbolTraceResult> {
    return this.traceInbound(request);
  }
  async findTests(request: TestDiscoveryRequest): Promise<TestDiscoveryResult> {
    const evidence = await this.source.searchContent({
      projectRoot: request.projectRoot,
      query: request.query,
      maxResults: boundedLimit(request.maxResults),
    });
    const tests = evidence.filter((item) => /(^|[\\/])(test|tests|__tests__)([\\/]|$)|\.(test|spec)\./i.test(item.path));
    return {
      providerId: this.providerId(), completeness: 'partial', evidence,
      notes: ['Test candidates come from bounded native text search.'], tests,
    };
  }

  async blastRadius(request: BlastRadiusRequest): Promise<BlastRadiusResult> {
    const pathQueries = (request.changedPaths ?? []).map((value) => {
      const name = value.replace(/\\/g, '/').split('/').pop() ?? '';
      return name.replace(/\.[^.]+$/, '');
    });
    const queries = [...new Set([...(request.changedSymbols ?? []), ...pathQueries]
      .map((value) => value.trim()).filter(Boolean))].slice(0, 16);
    if (queries.length === 0) {
      return { providerId: this.providerId(), completeness: 'insufficient', evidence: [], notes: [GRAPH_REQUIRED_NOTE], affected: [] };
    }

    const maxResults = boundedLimit(request.maxResults);
    const evidence: CodeEvidence[] = [];
    const seen = new Set<string>();
    for (const query of queries) {
      if (evidence.length >= maxResults) break;
      const matches = await this.source.searchContent({
        projectRoot: request.projectRoot,
        query,
        maxResults: maxResults - evidence.length,
      });
      for (const match of matches) {
        const key = `${match.path}\u0000${match.line ?? ''}\u0000${match.symbol ?? ''}`;
        if (seen.has(key)) continue;
        seen.add(key);
        evidence.push(match);
        if (evidence.length >= maxResults) break;
      }
    }
    return {
      providerId: this.providerId(),
      completeness: 'partial',
      evidence,
      notes: ['Blast candidates come from bounded native text search; dependency graph completeness is not claimed.'],
      affected: [...evidence],
    };
  }

  async freshness(request: FreshnessRequest): Promise<FreshnessResult> {
    const fingerprint = await this.source.fingerprint(request.projectRoot);
    if (!fingerprint) {
      return {
        providerId: this.providerId(), completeness: 'insufficient', evidence: [],
        notes: ['Native source could not produce a repository fingerprint.'], fingerprint: null, fresh: null,
      };
    }
    return {
      providerId: this.providerId(), completeness: 'complete',
      evidence: [{ path: request.projectRoot, evidenceType: 'fingerprint', summary: fingerprint }],
      notes: [], fingerprint,
      fresh: request.expectedFingerprint ? fingerprint === request.expectedFingerprint : null,
    };
  }
}