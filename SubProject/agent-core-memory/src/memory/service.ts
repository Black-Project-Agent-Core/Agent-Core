import {MemoryPromotion,type ConsolidationPolicy} from './promotion.js';
import { MemoryEpisodes } from './episodes.js';
import { ControllerMemorySession } from './controller-session.js';
import { disclosureDigest, memorySemanticRevision, MemoryControllerError, type ControllerScope } from './disclosure.js';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { realpath } from 'node:fs/promises';
import { validateWorkflowUse } from '../learning/workflow-evidence.js';
import { findConsolidationCandidates, type ConsolidationOptions } from './consolidation.js';
import type { MemoryEmbedder } from './embedder.js';
import { applyEvolutionProposal } from './evolution.js';
import { MemoryFeedbackStore, type MemoryFeedbackKind, type MemoryFeedbackResult, type MemoryLifecycleAction } from './feedback.js';
import { assertMemoryFeedbackDigest, memoryFeedbackContentDigest } from './feedback-target.js';
import { activityTracker } from '../tracker/activity-tracker.js';
import { MemoryIndex, type MemoryIndexResult } from './index.js';
import type { QueryCacheLimits } from './query-embedding-cache.js';
import {validateRelevancePolicy,type RelevancePolicy} from './relevance.js';
import { EmbeddingMemoryIntelligence, enrichMemoryMetadata, type MemoryEvolutionPreview, type MemoryEvolutionProposal, type MemoryIntelligence } from './intelligence.js';
import { boundedHistory, validateMemoryId } from './note-format.js';
import { resolveMemoryPaths } from './paths.js';
import { pageMemoryRecords } from './page.js';
import { assessMemoryStaleness, captureMemoryProvenance, normalizeMemoryWorkspace } from './provenance.js';
import { isMemoryLinkActive, normalizeLinks } from './relations.js';
import { hashMemoryRetrievalQuery, memoryRecordFingerprint, MemoryRetrievalLedger, type MemoryRetrievalAttempt, type MemoryUseReceiptInput } from './retrieval-ledger.js';
import { buildMemoryTransferPayload, planMemoryImport, type MemoryImportOptions } from './transfer.js';
import { memoryRetirementFingerprint } from './retirement.js';
import { RETENTION_PARAMS, scoreMemoryRetention } from '../learning/retention-score.js';
import { IDENTIFIER_TOKENIZER_VERSION, lexicalRetrievalTokens } from './identifier-tokenizer.js';
import { searchMemories, type MemorySearchOptions, type MemorySearchResult } from './retrieval.js';
import { projectMemorySearchResults, type DeliveredMemorySearchResult } from './search-projection.js';
import { FileMemoryStore } from './store.js';
import { isMemoryExpired, normalizeMemoryExpiresAt } from './visibility.js';
import { MEMORY_SCHEMA_VERSION, type EvolutionEvent, type MemoryHealth, type MemoryIssue, type MemoryLink, type MemoryProvenance, type MemoryRecord } from './types.js';

export interface MemoryServiceOptions {experience?:{enabled:true};consolidation?:ConsolidationPolicy;indexGranularity?:'record'|'passage';queryCache?:QueryCacheLimits;controllerRelevancePolicy?:RelevancePolicy}

/** Host-owned rollout policy; public recall input cannot select ranking or feedback. */
export type ControllerRetrievalPolicy = 'baseline-v1' | 'fusion-feedback-v1';

export type MemoryLinkInput = Omit<MemoryLink, 'createdAt'> & { createdAt?: string };

export interface RememberInput {
  content: string;
  title?: string;
  keywords?: string[];
  context?: string;
  tags?: string[];
  category?: string;
  links?: MemoryLinkInput[];
  source?: MemoryRecord['source'];
  provenance?: MemoryProvenance;
  expiresAt?: string;
}

export interface UpdateInput {
  title?: string;
  content?: string;
  keywords?: string[];
  context?: string;
  tags?: string[];
  category?: string;
  links?: MemoryLinkInput[];
  provenance?: MemoryProvenance;
  expiresAt?: string | null;
}

export type MemoryBatchOperation =
  | { op: 'remember'; id?: string; value: RememberInput }
  | { op: 'update'; id: string; patch: UpdateInput }
  | { op: 'delete'; id: string }
  | { op: 'link'; id: string; link: MemoryLinkInput };

export interface MemoryBatchResult {
  committed: true;
  operations: Array<{ op: MemoryBatchOperation['op']; id: string; deleted?: boolean }>;
  indexRefreshes: 1;
}

export interface LinkInput {
  targetId: string;
  type?: MemoryLink['type'];
  strength?: number;
  reason?: string;
}

export interface EvolutionResult {
  proposal: MemoryEvolutionProposal;
  applied: boolean;
  changedFields: string[];
  addedLinks: string[];
  strengthenedLinks: string[];
  reciprocalLinks: string[];
}

export interface EvolutionPreviewResult {
  mode: 'preview';
  proposal: MemoryEvolutionProposal;
  neighbors: MemoryEvolutionPreview['neighbors'];
  applied: false;
  changedFields: string[];
  addedLinks: string[];
  strengthenedLinks: string[];
  reciprocalLinks: string[];
}

function uniqueStrings(values: string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))].slice(0, 64);
}

function event(kind: EvolutionEvent['kind'], source: EvolutionEvent['source'], changedFields?: string[], details?: Record<string, unknown>): EvolutionEvent {
  return {
    kind,
    source,
    timestamp: new Date().toISOString(),
    ...(changedFields?.length ? { changedFields } : {}),
    ...(details ? { details } : {}),
  };
}

function materializeLinks(links: MemoryLinkInput[] | undefined,strict=false): MemoryLink[] {
  const now = new Date().toISOString();
  return (links ?? []).map((link) => ({
    targetId: link.targetId,
    type: link.type,
    strength: link.strength,
    createdAt: strict?(link.createdAt===undefined?now:link.createdAt):link.createdAt ?? now,
    ...(link.reason ? { reason: link.reason } : {}),
    ...((strict?link.validFrom!==undefined:Boolean(link.validFrom)) ? { validFrom: link.validFrom } : {}),
    ...((strict?link.validTo!==undefined:Boolean(link.validTo)) ? { validTo: link.validTo } : {}),
    ...((strict?link.referenceTime!==undefined:Boolean(link.referenceTime)) ? { referenceTime: link.referenceTime } : {}),
    ...(link.evidenceRefs?.length ? { evidenceRefs: [...link.evidenceRefs] } : {}),
  }));
}
export class MemoryService {
  private records = new Map<string, MemoryRecord>();
  private issues: MemoryIssue[] = [];
  private canonicalIssues: MemoryIssue[] = [];
  private status: MemoryHealth['status'] = 'not-used';
  private canonicalStatus: 'available' | 'degraded' | 'error' = 'error';
  private canonicalComplete = false;
  private indexStatus: MemoryHealth['index'] = 'not-configured';
  private embeddingStatus: MemoryHealth['embedding'] = 'not-configured';
  private intelligenceStatus: MemoryHealth['intelligence'] = 'not-configured';
  private indexIssue: MemoryIssue | null = null;
  private embeddingIssue: MemoryIssue | null = null;
  private embeddingQueryIssue: MemoryIssue | null = null;
  private intelligenceIssue: MemoryIssue | null = null;
  private readonly index: MemoryIndex;
  private readonly feedbackStore: MemoryFeedbackStore;
  private readonly retrievalLedger: MemoryRetrievalLedger;
  private readonly intelligence?: MemoryIntelligence;
  private readonly workspaceAliases = new Map<string, string>();
  private readonly workspaceRoots = new Map<string,string>();
  private experienceEnabled = false;

  resolveWorkspace(value: string): string {
    const normalized = normalizeMemoryWorkspace(value, this.projectRoot);
    return this.workspaceAliases.get(normalized.replaceAll('\\', '/').replace(/\/$/, '')) ?? normalized;
  }

  registeredWorkspaceIdentity(value: string): { name: string; key: string } {
    const name = this.resolveWorkspace(value);
    if (name === 'agent-core') return { name, key: 'agent-core' };
    const roots = [...this.workspaceAliases].filter(([, alias]) => alias === name).map(([root]) => root);
    if (roots.length !== 1) throw new Error('WORKSPACE_IDENTITY_UNVERIFIED');
    return { name, key: 'registered-root:' + roots[0] };
  }

  async registerWorkspaceAliases(workspaces: Array<{ name: string; repos: Array<{ path: string }> }>): Promise<void> {
    const candidates = new Map<string, Set<string>>();
    const actualRoots = new Map<string,Set<string>>();
    for (const workspace of workspaces) for (const repo of workspace.repos) {
      const actual = await realpath(repo.path).catch(() => undefined);
      if (!actual) continue;
      if (workspace.name.toLowerCase() === 'agent-core'
        && path.resolve(actual).toLowerCase() !== path.resolve(this.projectRoot).toLowerCase()) continue;
      const key = normalizeMemoryWorkspace(actual).replaceAll('\\', '/').replace(/\/$/, '');
      const actuals = actualRoots.get(key) ?? new Set<string>();
      actuals.add(actual);actualRoots.set(key,actuals);
      const names = candidates.get(key) ?? new Set<string>();
      names.add(normalizeMemoryWorkspace(workspace.name)); candidates.set(key, names);
    }
    this.workspaceAliases.clear();
    this.workspaceRoots.clear();
    for (const [key, names] of candidates) if (names.size === 1) {
      this.workspaceAliases.set(key, [...names][0]!);
      const actuals=actualRoots.get(key)!;if(actuals.size===1)this.workspaceRoots.set(key,[...actuals][0]!);
    }
  }

  private constructor(
    private readonly store: FileMemoryStore,
    private readonly embedder: MemoryEmbedder | undefined,
    private readonly projectRoot: string,
    private readonly consolidation:ConsolidationPolicy = {},
    indexGranularity: 'record' | 'passage' = 'record',
    queryCache?: QueryCacheLimits,
    private readonly controllerRelevancePolicy?:Readonly<RelevancePolicy>,
  ) {
    this.index = new MemoryIndex(store.paths, embedder, { granularity: indexGranularity,
      ...(queryCache ? { queryCache: { ...queryCache } } : {}) });
    this.feedbackStore = new MemoryFeedbackStore(store.paths);
    this.retrievalLedger = new MemoryRetrievalLedger(store.paths);
    this.intelligence = embedder ? new EmbeddingMemoryIntelligence(this.index) : undefined;
    this.embeddingStatus = embedder ? 'degraded' : 'not-configured';
    this.intelligenceStatus = this.intelligence ? 'degraded' : 'not-configured';
  }

  /** Release owner-local query waiters and volatile vectors. No provider abort is implied. */
  dispose(): void {
    this.index.dispose();
  }

  controller(scope: ControllerScope, policy: ControllerRetrievalPolicy = 'baseline-v1'): ControllerMemorySession {
    if (policy !== 'baseline-v1' && policy !== 'fusion-feedback-v1') throw new MemoryControllerError('MEMORY_INPUT_INVALID');
    const retrievalPolicy = policy;
    const inScope = (record: MemoryRecord, workspace: string) =>
      (record.id === 'agent-core-foundational' && record.pinned)
      || Boolean(record.provenance?.workspace && this.resolveWorkspace(record.provenance.workspace) === workspace);
    const episodes=new MemoryEpisodes(this.store,{inScope,workspaceRoot:workspace=>{
        if(workspace==='agent-core')return this.projectRoot;
        const registrations=[...this.workspaceAliases].filter(([,alias])=>alias===workspace);
        const roots=registrations.map(([root])=>this.workspaceRoots.get(root));
        return roots.length===1&&roots[0]?roots[0]:undefined;
      }});
    return new ControllerMemorySession({
      root:this.store.paths.root,experienceEnabled:this.experienceEnabled,episodes,
      ...(this.controllerRelevancePolicy ? {relevancePolicy:this.controllerRelevancePolicy} : {}),
      promotion:new MemoryPromotion(this.store,episodes,this.index,this.consolidation,async()=>{await this.refreshIndex();return this.indexStatus==='available'?'current':'degraded';}),
      resolveWorkspace: value => this.resolveWorkspace(value),
      inScope,
      snapshot: async (workspace,options) => this.store.snapshot(async loaded => {
        this.records = new Map(loaded.records.map(record => [record.id,record]));
        this.syncCanonicalIssues(loaded.issues,loaded.complete);
        if (!this.canonicalComplete || this.canonicalStatus === 'error') throw new MemoryControllerError('MEMORY_SOURCE_UNAVAILABLE');
        const scoped = [...this.records.values()].filter(record => inScope(record, workspace));
        let forgotten: Set<string>;
        try { forgotten = await this.feedbackStore.strictForgottenIds(new Set(scoped.map(record => record.id))); }
        catch { throw new MemoryControllerError('MEMORY_SOURCE_UNAVAILABLE'); }
        const now = options?.referenceTime ?? Date.now();
        const superseded = new Set(scoped.flatMap(record => record.links
          .filter(link => link.type === 'supersedes' && isMemoryLinkActive(link, now)).map(link => link.targetId)));
        return scoped.filter(record => record.id === 'agent-core-foundational' && record.pinned
          || (!forgotten.has(record.id) && (options?.historical || (!isMemoryExpired(record, now) && (this.experienceEnabled || !superseded.has(record.id))))))
          .sort((a,b) => Number(b.pinned)-Number(a.pinned) || a.id.localeCompare(b.id));
      }),
      rank: async (records, query, rankingTime) => {
        lexicalRetrievalTokens(query, 'query');
        // Validate against a complete canonical snapshot, then release the store
        // lock before the network-capable query embedder is invoked.
        const canonicalRecords = await this.store.snapshot(async loaded => {
          this.syncCanonicalIssues(loaded.issues, loaded.complete);
          if (!this.canonicalComplete || this.canonicalStatus === 'error') throw new MemoryControllerError('MEMORY_SOURCE_UNAVAILABLE');
          const canonical = new Map(loaded.records.map(record => [record.id, record]));
          for (const record of records) {
            const current = canonical.get(record.id);
            if (!current || memorySemanticRevision(current) !== memorySemanticRevision(record)) {
              throw new MemoryControllerError('MEMORY_CURSOR_STALE');
            }
          }
          return structuredClone(loaded.records);
        });
        let semantic;
        if (this.embedder && this.indexStatus === 'available') {
          try { semantic = await this.index.semanticContext(query, canonicalRecords, records) ?? undefined; }
          catch { this.setEmbeddingIssue('Controller query embedding unavailable'); }
        }
        const options: MemorySearchOptions = { limit: Math.max(1, records.length), maxNeighbors: 0 };
        let salienceEntries: Array<[string, number]> = [];
        if (retrievalPolicy === 'fusion-feedback-v1') {
          const eligibleIds = new Set(records.map(record => record.id));
          // Salience is advisory and may fail soft; visibility was already read
          // strictly in snapshot and is never replaced by this neutral fallback.
          salienceEntries = [...await this.feedbackSalienceMap()]
            .filter(([id, value]) => eligibleIds.has(id) && Number.isFinite(value))
            .sort(([a], [b]) => a.localeCompare(b));
          options.rankingProfile = 'fusion';
          options.feedbackSalience = new Map(salienceEntries);
        }
        return {
          results: searchMemories(records, query, options, semantic, Math.max(1, records.length), rankingTime),
          relevanceContext:{semanticStatus:!this.embedder ? 'disabled' : semantic ? 'available' : 'unavailable'},
          rankingRevision: disclosureDigest(['controller-ranking/v1', retrievalPolicy, IDENTIFIER_TOKENIZER_VERSION,
            semantic?.revision ?? 'semantic-unavailable/v1', salienceEntries]),
        };
      },
      read: id => this.read(id, false),
      archivedRevision:ref => this.store.archivedRevision(ref),
      freshness: async record => {
        const assessment = await assessMemoryStaleness(record, this.projectRoot);
        return assessment.status === 'current' ? 'current' : assessment.status === 'changed' ? 'stale' : 'unknown';
      },
      recordExposure: attempt => this.retrievalLedger.record(attempt),
    }, scope);
  }

  static async initialize(baseDir: string, memoryRoot?: string, embedder?: MemoryEmbedder, options:MemoryServiceOptions = {}): Promise<MemoryService> {
    const relevancePolicy=options.controllerRelevancePolicy===undefined ? undefined : validateRelevancePolicy(options.controllerRelevancePolicy);
    const service = new MemoryService(
      new FileMemoryStore(resolveMemoryPaths(baseDir, memoryRoot),options),
      embedder,
      path.resolve(baseDir),
      options.consolidation,
      options.indexGranularity,
      options.queryCache,
      relevancePolicy,
    );
    try {
      const loaded = await service.store.initialize();
      service.experienceEnabled = await service.store.experienceEnabled();
      service.records = new Map(loaded.records.map((record) => [record.id, record]));
      service.syncCanonicalIssues(loaded.issues, loaded.complete);
      if (loaded.complete && loaded.records.every(record => record.id === 'agent-core-foundational' && record.pinned)) {
        await service.feedbackStore.initializeEmptyVisibilityIf(async () => {
          const current = await service.store.loadAll();
          return current.complete && current.records.every(record => record.id === 'agent-core-foundational' && record.pinned);
        }).catch(() => undefined);
      }
      await service.feedbackStore.reconcile(new Set(loaded.records.map(record => record.id))).catch(() => undefined);
      if (service.canonicalStatus !== 'error') await service.ensureIndex(loaded.records);
    } catch (error) {
      service.canonicalStatus = 'error';
      service.canonicalIssues = [{
        path: service.store.paths.root,
        message: error instanceof Error ? error.message : String(error),
        severity: 'error',
      }];
      service.syncIssueList();
    }
    return service;
  }

  private auxiliaryIssues(): MemoryIssue[] {
    return [this.indexIssue, this.embeddingIssue, this.embeddingQueryIssue, this.intelligenceIssue]
      .filter((issue): issue is MemoryIssue => Boolean(issue));
  }

  private effectiveEmbeddingStatus(): MemoryHealth['embedding'] {
    return this.embeddingQueryIssue ? 'degraded' : this.embeddingStatus;
  }

  private recomputeStatus(): void {
    if (this.canonicalStatus === 'error') this.status = 'error';
    else if (this.canonicalStatus === 'degraded' || this.auxiliaryIssues().length) this.status = 'degraded';
    else this.status = 'available';
    this.intelligenceStatus = this.intelligence
      ? this.effectiveEmbeddingStatus() === 'available' && !this.intelligenceIssue ? 'available' : 'degraded'
      : 'not-configured';
  }

  private syncIssueList(): void {
    this.issues = [...this.canonicalIssues, ...this.auxiliaryIssues()];
    this.recomputeStatus();
  }

  private setEmbeddingIssue(error: unknown): void {
    if (!this.embedder) return;
    this.embeddingQueryIssue = {
      path: this.store.paths.index,
      message: `Memory embedding query degraded: ${error instanceof Error ? error.message : String(error)}`,
      severity: 'degraded',
    };
    this.syncIssueList();
  }

  private clearEmbeddingQueryIssue(): void {
    if (!this.embeddingQueryIssue) return;
    this.embeddingQueryIssue = null;
    this.syncIssueList();
  }

  private setIntelligenceIssue(error: unknown): void {
    if (!this.intelligence) return;
    this.intelligenceIssue = {
      path: this.store.paths.state,
      message: `Memory intelligence degraded: ${error instanceof Error ? error.message : String(error)}`,
      severity: 'degraded',
    };
    this.syncIssueList();
  }

  private syncCanonicalIssues(canonicalIssues: MemoryIssue[], complete = true): void {
    this.canonicalComplete = complete;
    this.canonicalIssues = [...canonicalIssues];
    this.canonicalStatus = canonicalIssues.some((issue) => issue.severity === 'error')
      ? 'error'
      : canonicalIssues.length ? 'degraded' : 'available';
    this.syncIssueList();
  }

  private applyIndexResult(result: MemoryIndexResult): void {
    this.indexStatus = result.index;
    this.embeddingStatus = result.embedding;
    this.indexIssue = result.indexWarning ? {
      path: this.store.paths.index,
      message: `Memory index degraded: ${result.indexWarning}`,
      severity: 'degraded',
    } : null;
    this.embeddingIssue = result.embeddingWarning ? {
      path: this.store.paths.index,
      message: `Memory embedding degraded: ${result.embeddingWarning}`,
      severity: 'degraded',
    } : null;
    this.syncIssueList();
  }

  private setIndexFailure(prefix: string, error: unknown): void {
    this.indexStatus = 'degraded';
    this.embeddingStatus = this.embedder ? 'degraded' : 'not-configured';
    this.indexIssue = {
      path: this.store.paths.index,
      message: `${prefix}: ${error instanceof Error ? error.message : String(error)}`,
      severity: 'degraded',
    };
    this.syncIssueList();
  }

  private async ensureIndex(records: MemoryRecord[]): Promise<void> {
    try {
      this.applyIndexResult(await this.index.ensure(records, { retainMissing: !this.canonicalComplete }));
    } catch (error) {
      this.setIndexFailure('Memory index unavailable', error);
    }
  }
  health(): MemoryHealth {
    const identity = this.index.identity();
    return {
      status: this.status,
      mode: 'file-native',
      canonicalStore: this.canonicalStatus,
      canonicalComplete: this.canonicalComplete,
      noteCount: this.records.size,
      issueCount: this.issues.length,
      index: this.indexStatus,
      embedding: this.effectiveEmbeddingStatus(),
      intelligence: this.intelligenceStatus,
      ...(identity ? {
        embeddingProvider: identity.provider,
        embeddingModel: identity.model,
        embeddingDimensions: identity.dimensions,
      } : {}),
    };
  }

  getIssues(): MemoryIssue[] { return [...this.issues]; }

  async embeddingRepairStatus(): Promise<{ pending: number; failed: number; issue?: string }> {
    return this.index.repairSummary();
  }

  async feedbackStatus(): Promise<{ recordCount: number; helpfulAboveDefault: number; reducedBelowDefault: number; forgottenCount: number; issue?: string }> {
    return this.feedbackStore.status(new Set(this.records.keys()));
  }

  async feedbackSalienceMap(): Promise<Map<string, number>> {
    try {
      return await this.feedbackStore.salienceMap(new Set(this.records.keys()));
    } catch {
      return new Map();
    }
  }

  async feedback(
    id: string,
    eventId: string,
    kind: MemoryFeedbackKind,
    expectedContentDigest?: string,
  ): Promise<MemoryFeedbackResult> {
    if (expectedContentDigest !== undefined) assertMemoryFeedbackDigest(expectedContentDigest);
    this.assertOperational();
    await this.reload();
    this.assertOperational();
    const normalized = validateMemoryId(id);
    const record = this.records.get(normalized);
    if (!record) throw new Error(`Memory not found: ${id}`);
    if (record.pinned) throw new Error('Pinned foundational memory does not accept ordinary feedback');
    return this.feedbackStore.apply(normalized, eventId, kind, expectedContentDigest === undefined ? undefined : async () => {
      // Non-locking store read: apply already owns the canonical process lock.
      const current = await this.store.read(normalized);
      if (!current) throw new Error('MEMORY_FEEDBACK_TARGET_MISSING');
      if (current.pinned) throw new Error('Pinned foundational memory does not accept ordinary feedback');
      const observed = memoryFeedbackContentDigest(current);
      if (observed !== expectedContentDigest) throw new Error('MEMORY_FEEDBACK_CONTENT_CHANGED');
      return observed;
    });
  }

  async recordUseReceipt(input: MemoryUseReceiptInput) {
    if (input.result !== 'unavailable' && !input.verificationRef) throw new Error('MEMORY_USE_RECEIPT_VERIFICATION_REQUIRED');
    this.assertOperational();
    await this.reload();
    this.assertOperational();
    const record = this.records.get(validateMemoryId(input.memoryId));
    if (!record) throw new Error('MEMORY_USE_RECEIPT_MEMORY_NOT_FOUND');
    const currentContentDigest = memoryFeedbackContentDigest(record);
    input={...input,...(input.workspace?{workspace:this.resolveWorkspace(input.workspace)}:{})};
    const replay=await this.retrievalLedger.replayUseReceipt(input);if(replay)return replay;
    const reportedResult=input.result;
    const validation = await validateWorkflowUse(input);
    input = { ...input, ...(input.workspace ? { workspace: this.resolveWorkspace(input.workspace) } : {}),
      evidenceValidation: validation.status,
      ...(validation.status === 'unavailable' || validation.verification !== (input.result === 'success' ? 'pass' : 'fail')
        ? { result: 'unavailable' as const } : {}) };
    const result = await this.retrievalLedger.recordUseReceipt(input, currentContentDigest,reportedResult);
    if (!result.duplicate) {
      try {
        activityTracker.recordOutcome(
          'MEMORY',
          'success',
          'Memory use receipt recorded',
          { featureId: 'memory.use', outcome: result.receipt.applicability, properties: {
            result: result.receipt.result,
            verified: validation.status === 'resolved' && validation.verification !== 'unavailable',
            evidenceValidation: validation.status,
          } },
          'memory-use-receipt',
          {
            useId: result.receipt.useId,
            retrievalAttemptId: result.receipt.retrievalAttemptId,
            memoryId: result.receipt.memoryId,
            contentDigest: result.receipt.contentDigest,
            workspace: result.receipt.workspace ?? '',
            reasonCode: result.receipt.reasonCode,
            evidenceRefs: result.receipt.evidenceRefs,
            verificationRef: result.receipt.verificationRef ?? '',
          },
        );
      } catch { /* Receipt persistence is authoritative; tracker mirroring is fail-soft. */ }
    }
    return result;
  }

  async lifecycle(
    id: string,
    eventId: string,
    action: MemoryLifecycleAction,
    reason?: string,
  ) {
    this.assertOperational();
    await this.reload();
    this.assertOperational();
    const normalized = validateMemoryId(id);
    const record = this.records.get(normalized);
    if (!record) throw new Error(`Memory not found: ${id}`);
    if (record.pinned) throw new Error('Pinned foundational memory cannot be forgotten or restored');
    return this.feedbackStore.applyLifecycle(normalized, eventId, action, reason);
  }

  async lifecycleState(id: string) {
    this.assertOperational();
    const normalized = validateMemoryId(id);
    const record = this.records.get(normalized);
    if (!record) throw new Error(`Memory not found: ${id}`);
    const lifecycle = await this.feedbackStore.lifecycle(normalized);
    return {
      ...lifecycle,
      expired: !record.pinned && isMemoryExpired(record),
      ...(record.expiresAt ? { expiresAt: record.expiresAt } : {}),
    };
  }

  async visibilitySnapshot(ids?: string[]) {
    this.assertOperational();
    const selected = ids?.length
      ? ids.map(validateMemoryId).map(id => this.records.get(id)).filter((record): record is MemoryRecord => Boolean(record))
      : [...this.records.values()];
    const forgotten = await this.feedbackStore.forgottenIds(new Set(selected.map(record => record.id))).catch(() => new Set<string>());
    return Object.fromEntries(selected.map(record => [record.id, {
      forgotten: forgotten.has(record.id),
      expired: !record.pinned && isMemoryExpired(record),
      ...(record.expiresAt ? { expiresAt: record.expiresAt } : {}),
    }]));
  }

  async retirementReview(options: {
    workspace?: string;
    limit?: number;
    retentionThreshold?: number;
  } = {}): Promise<{
    mode: 'preview';
    mutatesMemory: false;
    retentionThreshold: number;
    candidates: Array<{
      id: string;
      title?: string;
      category: string;
      workspace?: string;
      retention: ReturnType<typeof scoreMemoryRetention>;
      salience: number;
      reasons: string[];
      reviewFingerprint: string;
    }>;
  }> {
    this.assertOperational();
    await this.reload();
    this.assertOperational();
    const salienceByMemory = await this.feedbackSalienceMap();
    const forgottenIds = await this.feedbackStore.forgottenIds(new Set(this.records.keys())).catch(() => new Set<string>());
    const now = Date.now();
    const threshold = typeof options.retentionThreshold === 'number' && Number.isFinite(options.retentionThreshold)
      ? Math.max(0, Math.min(5, options.retentionThreshold))
      : RETENTION_PARAMS.reviewThreshold;
    const limit = Math.max(1, Math.min(100, options.limit ?? 20));
    const workspace = options.workspace ? this.resolveWorkspace(options.workspace) : undefined;
    const staleAgeMs = 30 * 24 * 60 * 60 * 1000;
    const candidates = [];

    for (const record of this.records.values()) {
      if (record.pinned) continue;
      if (workspace && (!record.provenance?.workspace
        || this.resolveWorkspace(record.provenance.workspace) !== workspace)) continue;
      const salience = salienceByMemory.get(record.id) ?? 1;
      const retention = scoreMemoryRetention(record, now, salience);
      const reasons: string[] = [];
      if (retention && retention.score < threshold) reasons.push('low-retention');
      if (salience <= 0.25) reasons.push('explicit-stale-or-wrong-feedback');
      const accessBase = record.lastAccessedAt ?? record.updatedAt;
      const age = now - Date.parse(accessBase);
      if (record.retrievalCount === 0 && Number.isFinite(age) && age >= staleAgeMs) {
        reasons.push('inactive-unretrieved');
      }
      if (isMemoryExpired(record, now)) reasons.push('expired');
      if (forgottenIds.has(record.id)) reasons.push('explicitly-forgotten');
      if (record.links.some(link => link.type === 'contradicts')) reasons.push('typed-contradiction');
      if (!reasons.length) continue;
      candidates.push({
        id: record.id,
        ...(record.title ? { title: record.title } : {}),
        category: record.category,
        ...(record.provenance?.workspace ? { workspace: record.provenance.workspace } : {}),
        retention,
        salience,
        reasons,
        reviewFingerprint: memoryRetirementFingerprint(record),
      });
    }

    candidates.sort((a, b) =>
      (a.retention?.score ?? Number.POSITIVE_INFINITY) - (b.retention?.score ?? Number.POSITIVE_INFINITY)
      || a.id.localeCompare(b.id));

    return {
      mode: 'preview',
      mutatesMemory: false,
      retentionThreshold: threshold,
      candidates: candidates.slice(0, limit),
    };
  }

  async refreshHealth(): Promise<MemoryHealth> {
    const loaded = await this.store.snapshot();
    this.records = new Map(loaded.records.map((record) => [record.id, record]));
    this.syncCanonicalIssues(loaded.issues, loaded.complete);
    if (this.canonicalStatus !== 'error') {
      try {
        this.applyIndexResult(await this.index.inspect([...this.records.values()]));
      } catch (error) {
        this.setIndexFailure('Memory index health check failed', error);
      }
    }
    return this.health();
  }

  private assertOperational(): void {
    if (this.status === 'error') throw new Error('Memory service is not safely operational');
  }

  private async reload(): Promise<void> {
    const loaded = await this.store.snapshot();
    this.records = new Map(loaded.records.map((record) => [record.id, record]));
    this.syncCanonicalIssues(loaded.issues, loaded.complete);
  }

  private async ensureCurrentIndex(): Promise<void> {
    if (this.canonicalStatus === 'error') return;
    await this.ensureIndex([...this.records.values()]);
  }

  private async refreshIndex(full = false): Promise<void> {
    const loaded = await this.store.snapshot();
    this.records = new Map(loaded.records.map((record) => [record.id, record]));
    this.syncCanonicalIssues(loaded.issues, loaded.complete);
    if (this.canonicalStatus === 'error') return;
    try {
      const records = [...this.records.values()];
      const result = full && this.canonicalComplete
        ? await this.index.rebuild(records)
        : await this.index.ensure(records, { retainMissing: !this.canonicalComplete });
      this.applyIndexResult(result);
    } catch (error) {
      this.setIndexFailure('Memory index refresh failed', error);
    }
  }

  async list(workspace?: string): Promise<MemoryRecord[]> {
    await this.reload();
    this.assertOperational();
    const normalizedWorkspace = workspace ? this.resolveWorkspace(workspace) : undefined;
    const records = normalizedWorkspace
      ? [...this.records.values()].filter((record) =>
          record.pinned || (record.provenance?.workspace && this.resolveWorkspace(record.provenance.workspace) === normalizedWorkspace))
      : [...this.records.values()];
    return records.sort((a, b) => Number(b.pinned) - Number(a.pinned)
      || b.updatedAt.localeCompare(a.updatedAt)
      || a.id.localeCompare(b.id));
  }

  async authoritySnapshot(ids?: string[], workspace?: string) {
    await this.reload();
    this.assertOperational();
    const normalizedWorkspace = workspace ? this.resolveWorkspace(workspace) : undefined;
    const records = [...this.records.values()].filter(record =>
      !normalizedWorkspace || record.pinned
      || (record.provenance?.workspace && this.resolveWorkspace(record.provenance.workspace) === normalizedWorkspace));
    const byId = new Map(records.map(record => [record.id, record]));
    const supersededBy = new Map<string, string[]>();
    const contradictedBy = new Map<string, string[]>();
    const now = Date.now();
    for (const owner of records) {
      for (const link of owner.links) {
        if (!isMemoryLinkActive(link, now) || !byId.has(link.targetId)) continue;
        if (link.type === 'supersedes') {
          supersededBy.set(link.targetId, [...(supersededBy.get(link.targetId) ?? []), owner.id]);
        } else if (link.type === 'contradicts') {
          contradictedBy.set(link.targetId, [...(contradictedBy.get(link.targetId) ?? []), owner.id]);
        }
      }
    }
    const selected = ids?.length
      ? [...new Set(ids.map(validateMemoryId))].filter(id => byId.has(id))
      : [...byId.keys()];
    return Object.fromEntries(selected.map(id => [id, {
      state: supersededBy.has(id) ? 'superseded' as const : 'active' as const,
      supersededBy: [...new Set(supersededBy.get(id) ?? [])],
      contradictedBy: [...new Set(contradictedBy.get(id) ?? [])],
    }]));
  }

  async page(input: { workspace?: string; limit?: number; cursor?: string }) {
    const records = await this.list(input.workspace);
    return pageMemoryRecords(records, input);
  }

  async exportTransfer(workspace?: string) {
    const records = await this.list(workspace);
    if (await this.store.experienceEnabled()) throw new Error('MEMORY_TRANSFER_V2_UNSUPPORTED');
    return buildMemoryTransferPayload(records, workspace);
  }

  async importTransfer(
    payload: unknown,
    input: MemoryImportOptions & { mode?: 'preview' | 'apply'; confirmation?: string } = {},
  ) {
    await this.reload();
    this.assertOperational();
    const plan = planMemoryImport(payload, [...this.records.values()], input);
    const preview = {
      version: plan.version,
      creates: plan.creates,
      duplicates: plan.duplicates,
      rejected: plan.rejected,
      idMap: plan.idMap,
    };
    if ((input.mode ?? 'preview') !== 'apply') return { mode: 'preview' as const, ...preview };
    if (input.confirmation !== 'APPLY_MEMORY_IMPORT') throw new Error('MEMORY_IMPORT_CONFIRMATION_REQUIRED');
    if (plan.rejected.length) throw new Error('MEMORY_IMPORT_REJECTED_RECORDS_PRESENT');
    if (!plan.recordsToCreate.length) return { mode: 'apply' as const, committed: true, ...preview };

    const createById = new Map(plan.recordsToCreate.map(record => [record.id, record]));
    const committed = await this.store.batch((records) => {
      const byId = new Map(records.map(record => [record.id, record]));
      for (const [id, record] of createById) {
        if (byId.has(id)) throw new Error(`MEMORY_IMPORT_TARGET_DRIFT: ${id}`);
        byId.set(id, record);
      }
      return {
        records: [...byId.values()],
        touchedIds: [...createById.keys()],
        result: { createdIds: [...createById.keys()] },
      };
    });
    this.records = new Map(committed.records.map(record => [record.id, record]));
    await this.feedbackStore.reconcile(new Set(this.records.keys())).catch(() => undefined);
    await this.refreshIndex();
    return { mode: 'apply' as const, committed: true, ...preview, createdIds: committed.result.createdIds };
  }

  async retrievalDiagnostics(input: { workspace?: string; limit?: number; maxAgeDays?: number } = {}) {
    await this.reload();
    this.assertOperational();
    const validIds = new Set(this.records.keys());
    const [feedback, trackerEvents] = await Promise.all([
      this.feedbackStore.snapshot(validIds).catch(() => []),
      Promise.resolve(activityTracker.readFeatureOutcomes({
        maxEvents: 2_000,
        maxAgeMs: Math.max(1, Math.min(365, input.maxAgeDays ?? 90)) * 86_400_000,
        ...(input.workspace ? { workspace: input.workspace } : {}),
      })),
    ]);
    return this.retrievalLedger.diagnostics(feedback, trackerEvents, input);
  }

  retrievalLedgerStatus() {
    return this.retrievalLedger.status();
  }

  private async touch(record: MemoryRecord): Promise<MemoryRecord> {
    if (record.pinned) return record;
    const updated = await this.store.mutate(record.id, (current) => {
      const now = new Date().toISOString();
      return {
        ...current,
        lastAccessedAt: now,
        retrievalCount: current.retrievalCount + 1,
        evolutionHistory: boundedHistory(current.evolutionHistory, event('retrieved', 'system', ['lastAccessedAt', 'retrievalCount'])),
      };
    });
    this.records.set(updated.id, updated);
    return updated;
  }

  async read(id: string, trackAccess = true): Promise<MemoryRecord | null> {
    this.assertOperational();
    await this.reload();
    this.assertOperational();
    const normalized = validateMemoryId(id);
    const record = this.records.get(normalized) ?? null;
    if (!record || !trackAccess) return record;
    return this.touch(record);
  }

  async staleness(id: string) {
    this.assertOperational();
    await this.reload();
    this.assertOperational();
    const normalized = validateMemoryId(id);
    const record = this.records.get(normalized);
    if (!record) throw new Error(`Memory not found: ${id}`);
    return assessMemoryStaleness(record, this.projectRoot);
  }

  async revisions(id: string, limit = 5) {
    this.assertOperational();
    await this.reload();
    this.assertOperational();
    const normalized = validateMemoryId(id);
    if (!this.records.has(normalized)) throw new Error(`Memory not found: ${id}`);
    return this.store.revisions(normalized, limit);
  }

  async remember(input: RememberInput): Promise<MemoryRecord> {
    this.assertOperational();
    await this.reload();
    this.assertOperational();
    const content = input.content.trim();
    if (!content) throw new Error('Memory content is required');

    const needsMetadata = input.keywords === undefined || input.context === undefined
      || input.tags === undefined || input.category === undefined;
    const enriched = needsMetadata ? enrichMemoryMetadata(content) : undefined;
    const provenance = input.provenance
      ? await captureMemoryProvenance(this.projectRoot, { ...input.provenance, ...(input.provenance.workspace ? { workspace: this.resolveWorkspace(input.provenance.workspace) } : {}) })
      : undefined;
    const expiresAt = normalizeMemoryExpiresAt(input.expiresAt);

    const now = new Date().toISOString();
    const id = randomUUID();
    const validIds = new Set([...this.records.keys(), id]);
    const record: MemoryRecord = {
      version: MEMORY_SCHEMA_VERSION,
      id,
      ...(input.title?.trim() ? { title: input.title.trim() } : {}),
      content,
      keywords: input.keywords !== undefined ? uniqueStrings(input.keywords) : uniqueStrings(enriched?.keywords),
      context: input.context?.trim() || enriched?.context || 'General',
      tags: input.tags !== undefined ? uniqueStrings(input.tags) : uniqueStrings(enriched?.tags),
      category: input.category?.trim() || enriched?.category || 'Uncategorized',
      links: normalizeLinks(id, materializeLinks(input.links,this.experienceEnabled), validIds,this.experienceEnabled),
      createdAt: now,
      updatedAt: now,
      ...(expiresAt ? { expiresAt } : {}),
      lastAccessedAt: null,
      retrievalCount: 0,
      evolutionHistory: [event('created', 'controller', ['content', 'metadata'])],
      pinned: false,
      ...(input.source ? { source: input.source } : {}),
      ...(provenance ? { provenance } : {}),
    };

    await this.store.create(record);
    this.records.set(record.id, record);
    await this.refreshIndex();

    if (this.intelligence) {
      try {
        const evolved = await this.evolve(record.id);
        if (evolved.applied) return (await this.read(record.id, false)) ?? record;
      } catch (error) {
        this.setIntelligenceIssue(error);
      }
    }
    return (await this.read(record.id, false)) ?? record;
  }

  async update(id: string, patch: UpdateInput): Promise<MemoryRecord> {
    this.assertOperational();
    await this.reload();
    this.assertOperational();
    const normalized = validateMemoryId(id);
    const record = this.records.get(normalized);
    if (!record) throw new Error(`Memory not found: ${id}`);
    if (record.pinned) throw new Error('Pinned foundational memory cannot be updated through ordinary memory APIs');
    const provenance = patch.provenance
      ? await captureMemoryProvenance(this.projectRoot, patch.provenance)
      : undefined;

    const next = await this.store.mutate(normalized, (current, validIds) => {
      const changed: string[] = [];
      const candidate: MemoryRecord = { ...current };
      if (patch.title !== undefined) {
        candidate.title = patch.title.trim() || undefined;
        changed.push('title');
      }
      if (patch.content !== undefined) {
        if (!patch.content.trim()) throw new Error('Memory content cannot be empty');
        candidate.content = patch.content.trim();
        changed.push('content');
      }
      if (patch.keywords !== undefined) {
        candidate.keywords = uniqueStrings(patch.keywords);
        changed.push('keywords');
      }
      if (patch.context !== undefined) {
        candidate.context = patch.context.trim() || 'General';
        changed.push('context');
      }
      if (patch.tags !== undefined) {
        candidate.tags = uniqueStrings(patch.tags);
        changed.push('tags');
      }
      if (patch.category !== undefined) {
        candidate.category = patch.category.trim() || 'Uncategorized';
        changed.push('category');
      }
      if (patch.links !== undefined) {
        candidate.links = normalizeLinks(current.id, materializeLinks(patch.links,current.version===2||this.experienceEnabled), validIds,current.version===2);
        changed.push('links');
      }
      if (patch.provenance !== undefined) {
        candidate.provenance = provenance;
        changed.push('provenance');
      }
      if (patch.expiresAt !== undefined) {
        const expiresAt = normalizeMemoryExpiresAt(patch.expiresAt);
        if (expiresAt) candidate.expiresAt = expiresAt;
        else delete candidate.expiresAt;
        changed.push('expiresAt');
      }
      if (!changed.length) return current;

      const now = new Date().toISOString();
      candidate.updatedAt = now;
      const kind: EvolutionEvent['kind'] = changed.length === 1 && changed[0] === 'content'
        ? 'content_updated'
        : changed.length === 1 && changed[0] === 'tags'
          ? 'tags_changed'
          : changed.length === 1 && changed[0] === 'context'
            ? 'context_changed'
            : 'updated';
      candidate.evolutionHistory = boundedHistory(
        current.evolutionHistory,
        event(kind, 'controller', changed),
      );
      return candidate;
    });
    this.records.set(next.id, next);
    await this.refreshIndex();

    const allowAutoEvolution = this.intelligence
      && patch.content !== undefined
      && patch.keywords === undefined
      && patch.context === undefined
      && patch.tags === undefined
      && patch.category === undefined
      && patch.links === undefined
      && patch.provenance === undefined
      && patch.expiresAt === undefined;
    if (allowAutoEvolution) {
      try {
        const evolved = await this.evolve(next.id);
        if (evolved.applied) return (await this.read(next.id, false)) ?? next;
      } catch (error) {
        this.setIntelligenceIssue(error);
      }
    }
    return (await this.read(next.id, false)) ?? next;
  }

  async delete(id: string, expectedReviewFingerprint?: string): Promise<boolean> {
    this.assertOperational();
    await this.reload();
    this.assertOperational();
    const normalized = validateMemoryId(id);
    const deleted = await this.store.deleteWithLinkRepair(normalized, expectedReviewFingerprint);
    await this.reload();
    await this.feedbackStore.reconcile(new Set(this.records.keys())).catch(() => undefined);
    if (deleted) await this.refreshIndex();
    return deleted;
  }

  async batch(operations: MemoryBatchOperation[]): Promise<MemoryBatchResult> {
    this.assertOperational();
    if (!operations.length) throw new Error('memory_batch requires at least one operation');
    if (operations.length > 100) throw new Error('memory_batch supports at most 100 operations');

    await this.reload();
    this.assertOperational();
    const preparedProvenance = await Promise.all(operations.map(async (operation) => {
      const input = operation.op === 'remember'
        ? operation.value.provenance
        : operation.op === 'update' ? operation.patch.provenance : undefined;
      return input ? captureMemoryProvenance(this.projectRoot, input) : undefined;
    }));

    const committed = await this.store.batch((records) => {
      const byId = new Map(records.map((record) => [record.id, record]));
      const touched = new Set<string>();
      const results: MemoryBatchResult['operations'] = [];

      const requireMutable = (id: string): MemoryRecord => {
        const normalized = validateMemoryId(id);
        const record = byId.get(normalized);
        if (!record) throw new Error(`Memory not found: ${id}`);
        if (record.pinned) throw new Error('Pinned foundational memory cannot be altered through memory_batch');
        return record;
      };

      for (let operationIndex = 0; operationIndex < operations.length; operationIndex += 1) {
        const operation = operations[operationIndex]!;
        const operationProvenance = preparedProvenance[operationIndex];
        if (operation.op === 'remember') {
          const input = operation.value;
          const content = input.content.trim();
          if (!content) throw new Error('Memory content is required');
          const id = operation.id ? validateMemoryId(operation.id) : randomUUID();
          if (byId.has(id)) throw new Error(`Memory already exists: ${id}`);

          const needsMetadata = input.keywords === undefined || input.context === undefined
            || input.tags === undefined || input.category === undefined;
          const enriched = needsMetadata ? enrichMemoryMetadata(content) : undefined;
          const now = new Date().toISOString();
          const record: MemoryRecord = {
            version: MEMORY_SCHEMA_VERSION,
            id,
            ...(input.title?.trim() ? { title: input.title.trim() } : {}),
            content,
            keywords: input.keywords !== undefined ? uniqueStrings(input.keywords) : uniqueStrings(enriched?.keywords),
            context: input.context?.trim() || enriched?.context || 'General',
            tags: input.tags !== undefined ? uniqueStrings(input.tags) : uniqueStrings(enriched?.tags),
            category: input.category?.trim() || enriched?.category || 'Uncategorized',
            links: materializeLinks(input.links,this.experienceEnabled),
            createdAt: now,
            updatedAt: now,
            ...(normalizeMemoryExpiresAt(input.expiresAt) ? { expiresAt: normalizeMemoryExpiresAt(input.expiresAt) } : {}),
            lastAccessedAt: null,
            retrievalCount: 0,
            evolutionHistory: [event('created', 'controller', ['content', 'metadata'])],
            pinned: false,
            ...(input.source ? { source: input.source } : {}),
            ...(operationProvenance ? { provenance: operationProvenance } : {}),
          };
          byId.set(id, record);
          touched.add(id);
          results.push({ op: 'remember', id });
          continue;
        }

        if (operation.op === 'delete') {
          const current = requireMutable(operation.id);
          if (current.version === 2) throw new Error('MEMORY_PRESERVATION_REQUIRED');
          byId.delete(current.id);
          touched.add(current.id);
          const now = new Date().toISOString();
          for (const [otherId, other] of byId) {
            if (other.pinned) continue;
            const filtered = other.links.filter((link) => link.targetId !== current.id);
            if (filtered.length === other.links.length) continue;
            byId.set(otherId, {
              ...other,
              links: filtered,
              updatedAt: now,
              evolutionHistory: boundedHistory(other.evolutionHistory, event('link_removed', 'system', ['links'], {
                removedTargetId: current.id,
                reason: 'target_deleted_in_batch',
              })),
            });
            touched.add(otherId);
          }
          results.push({ op: 'delete', id: current.id, deleted: true });
          continue;
        }

        if (operation.op === 'link') {
          const current = requireMutable(operation.id);
          const incoming = materializeLinks([operation.link],current.version===2||this.experienceEnabled)[0]!;
          const now = new Date().toISOString();
          const sameSegment=(link:MemoryLink)=>link.targetId===incoming.targetId&&link.type===incoming.type&&(current.version!==2||(link.validFrom===incoming.validFrom&&link.validTo===incoming.validTo));
          const withoutSame=current.links.filter(link=>!sameSegment(link));
          const existing=current.links.find(sameSegment);
          const mergedIncoming = existing
            ? normalizeLinks(current.id, [existing, incoming], new Set(byId.keys()),current.version===2||this.experienceEnabled)[0]!
            : incoming;
          byId.set(current.id, {
            ...current,
            links: [...withoutSame, mergedIncoming],
            updatedAt: now,
            evolutionHistory: boundedHistory(current.evolutionHistory, event(
              existing ? 'link_strengthened' : 'link_added',
              'controller',
              ['links'],
              { targetId: incoming.targetId, type: incoming.type },
            )),
          });
          touched.add(current.id);
          results.push({ op: 'link', id: current.id });
          continue;
        }

        const current = requireMutable(operation.id);
        const patch = operation.patch;
        const candidate: MemoryRecord = { ...current, links: [...current.links] };
        const changed: string[] = [];
        if (patch.title !== undefined) { candidate.title = patch.title.trim() || undefined; changed.push('title'); }
        if (patch.content !== undefined) {
          if (!patch.content.trim()) throw new Error('Memory content cannot be empty');
          candidate.content = patch.content.trim(); changed.push('content');
        }
        if (patch.keywords !== undefined) { candidate.keywords = uniqueStrings(patch.keywords); changed.push('keywords'); }
        if (patch.context !== undefined) { candidate.context = patch.context.trim() || 'General'; changed.push('context'); }
        if (patch.tags !== undefined) { candidate.tags = uniqueStrings(patch.tags); changed.push('tags'); }
        if (patch.category !== undefined) { candidate.category = patch.category.trim() || 'Uncategorized'; changed.push('category'); }
        if (patch.links !== undefined) { candidate.links = materializeLinks(patch.links,current.version===2||this.experienceEnabled); changed.push('links'); }
        if (patch.provenance !== undefined) { candidate.provenance = operationProvenance; changed.push('provenance'); }
        if (patch.expiresAt !== undefined) {
          const expiresAt = normalizeMemoryExpiresAt(patch.expiresAt);
          if (expiresAt) candidate.expiresAt = expiresAt;
          else delete candidate.expiresAt;
          changed.push('expiresAt');
        }

        if (changed.length) {
          const now = new Date().toISOString();
          candidate.updatedAt = now;
          candidate.evolutionHistory = boundedHistory(
            current.evolutionHistory,
            event('updated', 'controller', changed),
          );
          byId.set(current.id, candidate);
          touched.add(current.id);
        }
        results.push({ op: 'update', id: current.id });
      }

      const validIds = new Set(byId.keys());
      for (const id of touched) {
        const record = byId.get(id);
        if (!record) continue;
        record.links = normalizeLinks(record.id, record.links, validIds,record.version===2||this.experienceEnabled);
      }

      return { records: [...byId.values()], touchedIds: [...touched], result: results };
    });

    this.records = new Map(committed.records.map((record) => [record.id, record]));
    for (const operation of committed.result) {
      if (operation.op === 'remember') await this.feedbackStore.reset(operation.id).catch(() => undefined);
    }
    await this.feedbackStore.reconcile(new Set(this.records.keys())).catch(() => undefined);
    await this.refreshIndex();
    return { committed: true, operations: committed.result, indexRefreshes: 1 };
  }

  async search(query: string, options: MemorySearchOptions = {}): Promise<DeliveredMemorySearchResult[]> {
    this.assertOperational();
    options = { ...options, ...(options.workspace ? { workspace: this.resolveWorkspace(options.workspace) } : {}) };
    const normalizedQuery = query.trim();
    if (!normalizedQuery) throw new Error('Memory search query is required');
    lexicalRetrievalTokens(normalizedQuery, 'query');
    const attemptId = randomUUID().replaceAll('-', '');
    const startedAt = new Date().toISOString();
    const startedMs = Date.now();
    const referenceTime = options.asOf && Number.isFinite(Date.parse(options.asOf))
      ? new Date(options.asOf).toISOString()
      : undefined;
    let candidateCount = 0;

    try {
      await this.reload();
      this.assertOperational();
      await this.ensureCurrentIndex();

      const canonicalRecords = [...this.records.values()];
      const currentRecords = canonicalRecords.map(record => record.provenance?.workspace ? { ...record, provenance: { ...record.provenance, workspace: this.resolveWorkspace(record.provenance.workspace) } } : record);
      const forgottenIds = await this.feedbackStore
        .forgottenIds(new Set(currentRecords.map(record => record.id)))
        .catch(() => new Set<string>());
      const scopeRecords = currentRecords.filter(record => !options.workspace || record.pinned
        || (record.provenance?.workspace && this.resolveWorkspace(record.provenance.workspace) === options.workspace));
      const supersededIds = new Set(scopeRecords.flatMap(record => record.links
        .filter(link => link.type === 'supersedes' && isMemoryLinkActive(link, Date.now())).map(link => link.targetId)));
      const activeRecords = currentRecords.filter(record =>
        !supersededIds.has(record.id) && (record.pinned || (!isMemoryExpired(record) && !forgottenIds.has(record.id) && (record.version!==2||record.experience.retention!=='archive'))));
      const workspace = options.workspace ? this.resolveWorkspace(options.workspace) : undefined;
      candidateCount = workspace
        ? activeRecords.filter(record => record.pinned
          || (record.provenance?.workspace && this.resolveWorkspace(record.provenance.workspace) === workspace)).length
        : activeRecords.length;

      const activeIds = new Set(activeRecords.map(record => record.id));
      const semanticEligible = canonicalRecords.filter(record => activeIds.has(record.id)
        && (!workspace || record.pinned
          || (record.provenance?.workspace && this.resolveWorkspace(record.provenance.workspace) === workspace)));
      let semanticContext;
      if (this.embedder && this.indexStatus === 'available' && this.embeddingStatus !== 'not-configured') {
        try {
          semanticContext = await this.index.semanticContext(normalizedQuery, canonicalRecords, semanticEligible) ?? undefined;
          if (semanticContext) this.clearEmbeddingQueryIssue();
        } catch (error) {
          this.setEmbeddingIssue(error);
        }
      }

      const searchOptions: MemorySearchOptions = options.rankingProfile === 'fusion'
        ? { ...options, feedbackSalience: await this.feedbackSalienceMap() }
        : options;
      // Scope was resolved against the host alias registry above. Rank canonical
      // records so exact passage revisions are not changed by display normalization.
      const rankedResults = searchMemories(semanticEligible, normalizedQuery, { ...searchOptions, workspace: undefined }, semanticContext);
      for (const result of rankedResults) {
        if (result.record.pinned) continue;
        try {
          result.record = await this.touch(result.record);
        } catch (error) {
          const issue: MemoryIssue = {
            path: this.store.paths.root,
            message: `Recall metadata update failed for ${result.record.id}: ${error instanceof Error ? error.message : String(error)}`,
            severity: 'degraded',
          };
          this.syncCanonicalIssues([...this.canonicalIssues, issue]);
        }
      }
      const projection = projectMemorySearchResults(
        rankedResults,
        Math.max(500, Math.min(100_000, options.budgetChars ?? 20_000)),
      );
      const results: DeliveredMemorySearchResult[] = projection.results.map(item => ({
        ...item,
        retrievalEvidence: {
          attemptId,
          contentDigest: memoryFeedbackContentDigest(item.record),
          recordFingerprint: memoryRecordFingerprint(item.record.id, item.record.updatedAt),
        },
      }));

      const completedAt = new Date().toISOString();
      const exposures: MemoryRetrievalAttempt['exposures'] = [];
      const projectionById = new Map(projection.dispositions.map(item => [item.memoryId, item]));
      const deliveredById = new Map(results.map(item => [item.record.id, item]));
      for (let index = 0; index < rankedResults.length && exposures.length < 50; index += 1) {
        const result = rankedResults[index]!;
        const delivery = projectionById.get(result.record.id);
        const delivered = deliveredById.get(result.record.id);
        const numeric: Record<string, number | null> = {
          score: result.score,
          exactPhrase: result.components.exactPhrase,
          tokenOverlap: result.components.tokenOverlap,
          keywordMatch: result.components.keywordMatch,
          tagMatch: result.components.tagMatch,
          contextMatch: result.components.contextMatch,
          categoryMatch: result.components.categoryMatch,
          semanticSimilarity: result.components.semanticSimilarity,
          bm25Lexical: result.components.bm25Lexical,
          sourceFileMatch: result.components.sourceFileMatch,
          feedbackInfluence: result.components.feedbackInfluence,
          linkBoost: result.components.linkBoost,
          ...(result.selection ? {
            rrfScore: result.selection.rrfScore,
            relativeScore: result.selection.relativeScore,
            thresholdFloor: result.selection.thresholdFloor,
            redundancy: result.selection.redundancy,
          } : {}),
        };
        exposures.push({
          memoryId: result.record.id,
          rank: index + 1,
          disposition: delivery?.disposition ?? 'dropped',
          handoffStatus: delivery?.disposition === 'dropped' ? 'not-attempted' : 'returned-to-controller',
          recordFingerprint: memoryRecordFingerprint(result.record.id, result.record.updatedAt),
          contentDigest: memoryFeedbackContentDigest(result.record),
          scoreSummary: numeric,
          reasonCodes: [
            result.matchType === 'linked' ? 'linked' : 'direct',
            `profile.${options.rankingProfile ?? 'legacy'}`,
            ...(delivered ? [`delivery.${delivered.delivery.detail}`] : ['delivery.dropped']),
          ],
        });
        for (const duplicateId of result.suppressedDuplicateIds ?? []) {
          if (exposures.length >= 50) break;
          const duplicate = this.records.get(duplicateId);
          if (!duplicate) continue;
          exposures.push({
            memoryId: duplicate.id,
            rank: index + 1,
            disposition: 'deduped',
            handoffStatus: 'not-attempted',
            recordFingerprint: memoryRecordFingerprint(duplicate.id, duplicate.updatedAt),
            contentDigest: memoryFeedbackContentDigest(duplicate),
            reasonCodes: ['duplicate-suppressed', `profile.${options.rankingProfile ?? 'legacy'}`],
          });
        }
      }

      const directCount = results.filter(result => result.matchType === 'direct').length;
      const attempt: MemoryRetrievalAttempt = {
        ...(options.taskId ? { taskId: options.taskId } : {}),
        version: 1,
        attemptId,
        surface: 'memory_search',
        trigger: 'explicit',
        startedAt,
        completedAt,
        retrievalStatus: results.length ? 'succeeded' : 'no-results',
        deliveryStatus: 'returned-to-controller',
        candidateCount,
        selectedCount: directCount,
        ...(workspace ? { workspace } : {}),
        rankingProfile: options.rankingProfile ?? 'legacy',
        ...(referenceTime ? { referenceTime } : {}),
        limitRequested: Math.max(1, Math.min(50, options.limit ?? 5)),
        budgetChars: Math.max(500, Math.min(100_000, options.budgetChars ?? 20_000)),
        queryHashSha256: hashMemoryRetrievalQuery(normalizedQuery),
        queryCharCount: normalizedQuery.length,
        queryTokenEstimate: Math.ceil(normalizedQuery.length / 4),
        latencyMs: Date.now() - startedMs,
        exposures,
      };
      await this.retrievalLedger.record(attempt).catch(() => undefined);
      try {
        activityTracker.recordOutcome(
          'MEMORY',
          'success',
          'Memory retrieval completed',
          { featureId: 'memory.retrieval', outcome: results.length ? 'success' : 'available', properties: { selectedCount: directCount, candidateCount } },
          'memory-retrieval',
          { retrievalAttemptId: attemptId, workspace: workspace ?? '', rankingProfile: options.rankingProfile ?? 'legacy', ...(referenceTime ? { referenceTime } : {}) },
        );
      } catch { /* Retrieval evidence must remain fail-soft. */ }
      return results;
    } catch (error) {
      const completedAt = new Date().toISOString();
      const failureCode = error instanceof Error ? error.message.slice(0, 120) : String(error).slice(0, 120);
      await this.retrievalLedger.record({
        version: 1,
        attemptId,
        surface: 'memory_search',
        trigger: 'explicit',
        startedAt,
        completedAt,
        retrievalStatus: 'failed',
        deliveryStatus: 'not-attempted',
        candidateCount,
        selectedCount: 0,
        ...(options.workspace ? { workspace: this.resolveWorkspace(options.workspace) } : {}),
        rankingProfile: options.rankingProfile ?? 'legacy',
        ...(referenceTime ? { referenceTime } : {}),
        limitRequested: Math.max(1, Math.min(50, options.limit ?? 5)),
        budgetChars: Math.max(500, Math.min(100_000, options.budgetChars ?? 20_000)),
        queryHashSha256: hashMemoryRetrievalQuery(normalizedQuery),
        queryCharCount: normalizedQuery.length,
        queryTokenEstimate: Math.ceil(normalizedQuery.length / 4),
        latencyMs: Date.now() - startedMs,
        failureCode,
        failureStage: 'search',
        exposures: [],
      }).catch(() => undefined);
      throw error;
    }
  }
  async reindex(): Promise<MemoryHealth> {
    this.assertOperational();
    await this.reload();
    this.assertOperational();
    await this.refreshIndex(true);
    return this.health();
  }

  private async syncReciprocalRelatedLinks(owner: MemoryRecord, targetIds: string[]): Promise<string[]> {
    const changedTargets: string[] = [];
    for (const targetId of [...new Set(targetIds)]) {
      const ownerLink = owner.links.find((link) => link.targetId === targetId && link.type === 'related');
      const knownTarget = this.records.get(targetId);
      if (!ownerLink || !knownTarget || knownTarget.pinned) continue;
      const before = knownTarget.links.find((link) => link.targetId === owner.id && link.type === 'related');
      if (before && before.strength >= ownerLink.strength) continue;

      try {
        const updated = await this.store.mutate(targetId, (current, validIds) => {
          const existing = current.links.find((link) => link.targetId === owner.id && link.type === 'related');
          if (existing && existing.strength >= ownerLink.strength) return current;
          const now = new Date().toISOString();
          const reciprocal: MemoryLink = {
            targetId: owner.id,
            type: 'related',
            strength: ownerLink.strength,
            createdAt: existing?.createdAt ?? now,
            reason: ownerLink.reason ? `reciprocal: ${ownerLink.reason}` : 'reciprocal semantic relationship',
          };
          const links = normalizeLinks(current.id, [...current.links, reciprocal], validIds,current.version===2);
          const kind: EvolutionEvent['kind'] = existing ? 'link_strengthened' : 'link_added';
          return {
            ...current,
            links,
            updatedAt: now,
            evolutionHistory: boundedHistory(current.evolutionHistory, event(kind, 'intelligence', ['links'], {
              reciprocalTargetId: owner.id,
            })),
          };
        });
        this.records.set(updated.id, updated);
        changedTargets.push(targetId);
      } catch (error) {
        if (error instanceof Error && error.message.startsWith('Memory not found:')) continue;
        throw error;
      }
    }
    if (changedTargets.length) await this.reload();
    return changedTargets;
  }
  private async prepareEvolution(
    id: string,
    options: { ensureCurrentIndex: boolean; neighborLimit?: number },
  ): Promise<{ record: MemoryRecord; preview: MemoryEvolutionPreview }> {
    this.assertOperational();
    await this.reload();
    this.assertOperational();
    if (!this.intelligence) throw new Error('Memory intelligence is not configured');

    const normalized = validateMemoryId(id);
    const record = this.records.get(normalized);
    if (!record) throw new Error(`Memory not found: ${id}`);
    if (record.pinned) throw new Error('Pinned foundational memory cannot be evolved through ordinary memory APIs');

    if (options.ensureCurrentIndex) {
      await this.ensureCurrentIndex();
    } else {
      const inspection = await this.index.inspect([...this.records.values()]);
      if (inspection.index !== 'available' || inspection.embedding !== 'available') {
        throw new Error(inspection.indexWarning
          ?? inspection.embeddingWarning
          ?? 'Memory evolution preview requires a current semantic index');
      }
    }

    const preview = await this.intelligence.preview(
      record,
      [...this.records.values()],
      options.neighborLimit,
    );
    return { record, preview };
  }

  async previewEvolution(id: string, neighborLimit = 5): Promise<EvolutionPreviewResult> {
    const { preview } = await this.prepareEvolution(id, {
      ensureCurrentIndex: false,
      neighborLimit,
    });
    return {
      mode: 'preview',
      proposal: preview.proposal,
      neighbors: preview.neighbors,
      applied: false,
      changedFields: [],
      addedLinks: [],
      strengthenedLinks: [],
      reciprocalLinks: [],
    };
  }

  async evolve(id: string): Promise<EvolutionResult> {
    let prepared: { record: MemoryRecord; preview: MemoryEvolutionPreview };
    try {
      prepared = await this.prepareEvolution(id, { ensureCurrentIndex: true });
    } catch (error) {
      this.setIntelligenceIssue(error);
      throw error;
    }

    const { record, preview } = prepared;
    const proposal = preview.proposal;
    const normalized = record.id;
    let committed = applyEvolutionProposal(record, proposal, new Set(this.records.keys()));
    let owner = record;
    try {
      if (committed.changedFields.length) {
        owner = await this.store.mutate(normalized, (current, validIds) => {
          committed = applyEvolutionProposal(current, proposal, validIds);
          return committed.record;
        });
        this.records.set(owner.id, owner);
        await this.refreshIndex();
        owner = this.records.get(normalized) ?? owner;
      }

      const reciprocalLinks = await this.syncReciprocalRelatedLinks(
        owner,
        proposal.links.filter((link) => link.type === 'related').map((link) => link.targetId),
      );
      this.intelligenceIssue = null;
      this.syncIssueList();
      return {
        proposal,
        applied: committed.changedFields.length > 0 || reciprocalLinks.length > 0,
        changedFields: committed.changedFields,
        addedLinks: committed.addedLinks,
        strengthenedLinks: committed.strengthenedLinks,
        reciprocalLinks,
      };
    } catch (error) {
      this.setIntelligenceIssue(error);
      throw error;
    }
  }
  async consolidate(options: ConsolidationOptions = {}) {
    this.assertOperational();
    await this.reload();
    this.assertOperational();
    await this.ensureCurrentIndex();
    return findConsolidationCandidates([...this.records.values()], this.index, options);
  }
}
