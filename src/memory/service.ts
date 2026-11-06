import {checkProjectSynthesisDependencies,decodeProjectSynthesis,createProjectSynthesisEligibility,type ProjectSynthesisEligibility,type SynthesisEligibilitySummary} from './project-synthesis.js';
import {MemoryPromotion,type ConsolidationPolicy} from './promotion.js';
import { MemoryEpisodes } from './episodes.js';
import { ControllerMemorySession } from './controller-session.js';
import { controllerScopeSchema, stableDisclosureJson, disclosureDigest, memorySemanticRevision, MemoryControllerError, type ControllerScope } from './disclosure.js';
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
import { MemoryIndex, type MemoryIndexResult, type SemanticSearchContext } from './index.js';
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
import { RETENTION_PARAMS, scoreMemoryRetention } from './retention-score.js';
import { IDENTIFIER_TOKENIZER_VERSION, lexicalRetrievalTokens } from './identifier-tokenizer.js';
import { FUSION_DIVERSITY_POLICY, searchMemories, type MemorySearchOptions, type MemorySearchResult } from './retrieval.js';
import { projectMemorySearchResults, type DeliveredMemorySearchResult } from './search-projection.js';
import { FileMemoryStore } from './store.js';
import {MemoryClaimReviews} from './claim-review.js';
import {MemoryRecallRepairs} from './recall-repair.js';
import {MemoryDerivations} from './derivations.js';
import { isMemoryExpired, normalizeMemoryExpiresAt } from './visibility.js';
import { resolveMemoryCognitiveConfig, type MemoryCognitiveConfig, type MemoryCognitiveOptions } from './cognitive-config.js';
import { MemoryCognitiveEngine, type CognitiveHost } from './cognitive-maintenance.js';
import type { DreamingCompletion } from './rem-model-assist.js';
import { digestSourceRef, validateDigestPlan, REM_SOURCE_TYPE, type DigestPlan, type DigestCommitResult } from './rem-consolidation.js';
import { legacyExperience } from './experience-types.js';
import { assessEpistemicConfidence, buildEpistemicLinkIndex } from './epistemic-confidence.js';
import { FORGETTING_PARAMS, scoreMemoryForgetting } from './forgetting-curve.js';
import { searchByTier } from './memory-tiers.js';
import { maskMemoryInput, summarizeRedactions, type MaskableMemoryInput, type SecretRedaction } from './privacy-masking.js';
import { classifyQueryIntent, QUERY_INTENT_VERSION } from './query-intent.js';
import { MEMORY_SCHEMA_VERSION, type EvolutionEvent, type MemoryHealth, type MemoryIssue, type MemoryLink, type MemoryProvenance, type MemoryRecord } from './types.js';

/** Internal, host-authenticated context. Never populate from public/model search options. */
export interface MemorySearchHostContext {
  scope:ControllerScope;
  assertScopeCurrent:()=>void|Promise<void>;
  signal?:AbortSignal;
  /** Absolute epoch milliseconds; eligibility caps this to 15 seconds per request. */
  deadlineMs?:number;
  onSynthesisEligibility?:(summary:SynthesisEligibilitySummary)=>void;
}

export interface MemoryServiceOptions {hostActivation?:boolean;experience?:{enabled:true};consolidation?:ConsolidationPolicy;indexGranularity?:'record'|'passage';queryCache?:QueryCacheLimits;controllerRelevancePolicy?:RelevancePolicy;
  /** Optional cognitive upgrades; every feature is disabled unless enabled here. */
  cognitive?:MemoryCognitiveOptions}

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
  private readonly cognitiveConfig: MemoryCognitiveConfig;
  private readonly cognitive: MemoryCognitiveEngine;

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
    cognitiveOptions?: MemoryCognitiveOptions,
  ) {
    this.cognitiveConfig = resolveMemoryCognitiveConfig(cognitiveOptions);
    this.cognitive = new MemoryCognitiveEngine(this.cognitiveHost(), this.cognitiveConfig);
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
    this.cognitive.stopLoop();
    this.index.dispose();
  }

  /** Narrow capability surface for the cognitive engine; arrows run only after construction. */
  private cognitiveHost(): CognitiveHost {
    return {
      snapshot: async () => {
        this.assertOperational();
        await this.reload();
        this.assertOperational();
        return [...this.records.values()];
      },
      canonicalComplete: () => this.canonicalComplete,
      mutate: async (id, mutation) => {
        const next = await this.store.mutate(id, mutation);
        this.records.set(next.id, next);
        return next;
      },
      refreshIndex: () => this.refreshIndex(),
      inspectIndex: records => this.index.inspect(records),
      repairSummary: () => this.index.repairSummary(),
      commitDigest: plan => this.commitCognitiveDigest(plan),
      feedbackSalience: () => this.feedbackSalienceMap(),
      forgottenIds: () => this.feedbackStore.forgottenIds(new Set(this.records.keys())),
    };
  }

  private controllerInScope(record:MemoryRecord,workspace:string):boolean {
    return (record.id==='agent-core-foundational'&&record.pinned)
      || Boolean(record.provenance?.workspace&&this.resolveWorkspace(record.provenance.workspace)===workspace);
  }

  private controllerEpisodes():MemoryEpisodes {
    return new MemoryEpisodes(this.store,{inScope:(record,workspace)=>this.controllerInScope(record,workspace),workspaceRoot:workspace=>{
      if(workspace==='agent-core')return this.projectRoot;
      const registrations=[...this.workspaceAliases].filter(([,alias])=>alias===workspace);
      const roots=registrations.map(([root])=>this.workspaceRoots.get(root));
      return roots.length===1&&roots[0]?roots[0]:undefined;
    }});
  }

  /** Factory stays in the Memory owner; both consumers share orchestration in project-synthesis. */
  private synthesisEligibility(scope:ControllerScope|undefined,hostContext?:MemorySearchHostContext,workspace?:string,
    episodes=this.controllerEpisodes()):ProjectSynthesisEligibility {
    const parsed=controllerScopeSchema.safeParse(scope);
    const ownedScope=parsed.success?Object.freeze({...parsed.data,workspaceKey:this.resolveWorkspace(parsed.data.workspaceKey)}):undefined;
    const dependencies=new Map<string,string|null>(),memoryRefs=new Map<string,string>();
    const origins=new Map<string,()=>Promise<void>>();
    let activation:string|undefined,drift=false;
    const assertScopeCurrent=async()=>{
      if(!ownedScope||(workspace&&ownedScope.workspaceKey!==workspace))throw new MemoryControllerError('MEMORY_SCOPE_MISMATCH');
      if(this.resolveWorkspace(ownedScope.workspaceKey)!==ownedScope.workspaceKey)throw new MemoryControllerError('MEMORY_SCOPE_MISMATCH');
      if(hostContext){
        const current=controllerScopeSchema.parse(hostContext.scope);
        if(stableDisclosureJson({...current,workspaceKey:this.resolveWorkspace(current.workspaceKey)})!==stableDisclosureJson(ownedScope))throw new MemoryControllerError('MEMORY_SCOPE_MISMATCH');
        await hostContext.assertScopeCurrent();
      }
    };
    return createProjectSynthesisEligibility({assertScopeCurrent,
      ...(hostContext?.signal?{signal:hostContext.signal}:{}),...(hostContext?.deadlineMs!==undefined?{deadlineMs:hostContext.deadlineMs}:{}),
      inScope:record=>Boolean(ownedScope&&record.provenance?.workspace&&this.resolveWorkspace(record.provenance.workspace)===ownedScope.workspaceKey),
      resolve:ownedScope?async(ref,resolve,wait)=>{
        try{
          const checked=await episodes.promotionSnapshot(ownedScope,context=>wait(async()=>{
            await context.validate([ref],true);
            const origin=await context.sourceOrigin(ref);
            if(origin.freshness!=='current')return origin.freshness==='stale'?'stale' as const:'unavailable' as const;
            let synthesis:ReturnType<typeof decodeProjectSynthesis>|undefined;
            if(ref.kind==='memory'){
              const current=context.visible(ref.id);
              if(memorySemanticRevision(current)!==ref.revision)return 'stale' as const;
              if(memoryRefs.has(ref.id)&&memoryRefs.get(ref.id)!==ref.revision)drift=true;
              memoryRefs.set(ref.id,ref.revision);
              if(current.category==='project-synthesis')synthesis=decodeProjectSynthesis(current.content);
            }
            const currentActivation=stableDisclosureJson(context.activation);
            if(activation!==undefined&&activation!==currentActivation)drift=true;
            activation=currentActivation;
            for(const [key,content]of context.dependencies){
              if(dependencies.has(key)&&dependencies.get(key)!==content)drift=true;
              dependencies.set(key,content);
            }
            if(origin.validate)origins.set(stableDisclosureJson(ref),origin.validate);
            return synthesis!==undefined?{synthesis}:'current' as const;
          }));
          if(typeof checked==='string')return checked;
          if(!checked.synthesis)return 'unavailable' as const;
          // Never recurse while holding the canonical snapshot lock.
          const status=await checkProjectSynthesisDependencies(checked.synthesis,resolve);
          return status.status==='unknown'?'unavailable' as const:status.status;
        }catch(error){
          if(error instanceof MemoryControllerError&&error.code==='MEMORY_SCOPE_MISMATCH')throw error;
          return 'unavailable' as const;
        }
      }:undefined,
      validateSnapshot:async(records,wait)=>{
        if(!ownedScope||drift)throw new MemoryControllerError('MEMORY_REVISION_CONFLICT');
        await episodes.promotionSnapshot(ownedScope,context=>wait(async()=>{
          if(activation!==stableDisclosureJson(context.activation))throw new MemoryControllerError('MEMORY_REVISION_CONFLICT');
          for(const record of records)if(memorySemanticRevision(context.visible(record.id))!==memorySemanticRevision(record))throw new MemoryControllerError('MEMORY_REVISION_CONFLICT');
          for(const [id,revision]of memoryRefs)if(memorySemanticRevision(context.visible(id))!==revision)throw new MemoryControllerError('MEMORY_REVISION_CONFLICT');
          for(const [key,content]of dependencies)if(await context.read(key)!==content)throw new MemoryControllerError('MEMORY_REVISION_CONFLICT');
          for(const validate of origins.values())await validate();
        }));
      },
    });
  }

  controller(scope: ControllerScope, policy: ControllerRetrievalPolicy = 'baseline-v1',hostContext?:MemorySearchHostContext,
    // Internal MCP-only handoff deferral: the authenticated caller owns final
    // response admission. Normal Native/planned sessions keep direct recording.
    onExposure?: (attempt: MemoryRetrievalAttempt) => Promise<unknown>): ControllerMemorySession {
    if (policy !== 'baseline-v1' && policy !== 'fusion-feedback-v1') throw new MemoryControllerError('MEMORY_INPUT_INVALID');
    const retrievalPolicy = policy;
    const inScope = (record:MemoryRecord,workspace:string)=>this.controllerInScope(record,workspace);
    const episodes=this.controllerEpisodes();
    return new ControllerMemorySession({
      root:this.store.paths.root,experienceEnabled:this.experienceEnabled,episodes,
      ...(scope.controllerId==='agent-core-external'?{claimReviews:new MemoryClaimReviews(this.store,episodes),
        recallRepairs:new MemoryRecallRepairs(this.store,episodes,this.retrievalLedger,async()=>{await this.refreshIndex();if(this.indexStatus!=='available')throw new MemoryControllerError('MEMORY_SOURCE_UNAVAILABLE');}),
        derivations:new MemoryDerivations(episodes),assertScopeCurrent:hostContext?.assertScopeCurrent}:{}),
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
      historicalSnapshot: async (workspace,input) => this.store.historicalSnapshot(workspace,input,async loaded=>{
        const scoped=loaded.records.filter(record=>inScope(record,workspace));
        const forgotten=await this.feedbackStore.strictForgottenIds(new Set(scoped.map(record=>record.id)));
        return scoped.filter(record=>!forgotten.has(record.id));
      }),
      rankHistorical: async (records,query,rankingTime) => {
        lexicalRetrievalTokens(query,'query');
        // Historical ranking is lexical over the reconstructed universe only. Current
        // embeddings, feedback and document frequencies cannot leak a later correction.
        await this.store.snapshot(async loaded=>{
          if(!loaded.complete)throw new MemoryControllerError('MEMORY_SOURCE_UNAVAILABLE');
          const forgotten=await this.feedbackStore.strictForgottenIds(new Set(records.map(record=>record.id)));
          for(const record of records){
            const current=loaded.records.find(item=>item.id===record.id);
            if(!current||forgotten.has(record.id)||!inScope(current,this.resolveWorkspace(scope.workspaceKey))||!inScope(record,this.resolveWorkspace(scope.workspaceKey)))throw new MemoryControllerError('MEMORY_SOURCE_UNAVAILABLE');
          }
        });
        return {results:searchMemories(records,query,{limit:Math.max(1,records.length),maxNeighbors:0},undefined,Math.max(1,records.length),rankingTime),
          relevanceContext:{semanticStatus:'disabled' as const},rankingRevision:disclosureDigest(['historical-ranking/v1',IDENTIFIER_TOKENIZER_VERSION,records.map(record=>memorySemanticRevision(record))])};
      },
      synthesisEligibility:()=>this.synthesisEligibility(scope,hostContext,this.resolveWorkspace(scope.workspaceKey),episodes),
      onSynthesisEligibility:hostContext?.onSynthesisEligibility,
      rank: async (records, query, rankingTime) => {
        lexicalRetrievalTokens(query, 'query');
        // Validate against a complete canonical snapshot, then release the store
        // lock before the network-capable query embedder is invoked.
        const invalidatedSynthesisIds:string[]=[];
        const canonicalRecords = await this.store.snapshot(async loaded => {
          this.syncCanonicalIssues(loaded.issues, loaded.complete);
          if (!this.canonicalComplete || this.canonicalStatus === 'error') throw new MemoryControllerError('MEMORY_SOURCE_UNAVAILABLE');
          const canonical = new Map(loaded.records.map(record => [record.id, record]));
          for (const record of records) {
            const current = canonical.get(record.id);
            if (!current || memorySemanticRevision(current) !== memorySemanticRevision(record)) {
              if(record.category==='project-synthesis'){invalidatedSynthesisIds.push(record.id);continue;}
              throw new MemoryControllerError('MEMORY_CURSOR_STALE');
            }
          }
          return structuredClone(loaded.records);
        });
        records=records.filter(record=>!invalidatedSynthesisIds.includes(record.id));
        let semantic;
        if (this.embedder && this.indexStatus === 'available') {
          const externalSignal=hostContext?.scope.controllerId==='agent-core-external'?hostContext.signal:undefined;
          try { semantic = await this.index.semanticContext(query, canonicalRecords, records,
            externalSignal?{signal:externalSignal}:{}) ?? undefined; }
          catch { if(externalSignal?.aborted)throw externalSignal.reason;
            this.setEmbeddingIssue('Controller query embedding unavailable'); }
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
          Object.assign(options, this.cognitiveSearchOptions(query, records, options));
        }
        const cognitiveRanking = retrievalPolicy === 'fusion-feedback-v1' ? this.cognitiveRankingRevision() : undefined;
        return {
          results: searchMemories(records, query, options, semantic, Math.max(1, records.length), rankingTime),
          invalidatedSynthesisIds,
          relevanceContext:{semanticStatus:!this.embedder ? 'disabled' : semantic ? 'available' : 'unavailable'},
          rankingRevision: disclosureDigest(['controller-ranking/v1', retrievalPolicy, IDENTIFIER_TOKENIZER_VERSION,
            semantic?.revision ?? 'semantic-unavailable/v1', salienceEntries,
            ...(retrievalPolicy === 'fusion-feedback-v1' ? [FUSION_DIVERSITY_POLICY] : []),
            ...(cognitiveRanking ? [cognitiveRanking] : [])]),
        };
      },
      read: id => this.read(id, false),
      archivedRevision:ref => this.store.archivedRevision(ref),
      freshness: async record => {
        const assessment = await assessMemoryStaleness(record, this.projectRoot);
        return assessment.status === 'current' ? 'current' : assessment.status === 'changed' ? 'stale' : 'unknown';
      },
      recordExposure: onExposure ?? (attempt => this.retrievalLedger.record(attempt)),
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
      options.cognitive,
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
      if (service.canonicalStatus !== 'error') service.cognitive.startLoop();
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

  /** Commit one final admitted MCP response to the existing canonical ledger.
   * Never invent or rewrite an attempt. Scope was issued and revalidated by host. */
  async recordControllerDisclosure(attempt: MemoryRetrievalAttempt, scope: ControllerScope, admit?:()=>void,onCommitted?:()=>void) {
    this.assertOperational();
    if (!attempt.taskId || attempt.taskId !== scope.taskId
      || !attempt.workspace || attempt.workspace !== this.resolveWorkspace(scope.workspaceKey)
      || attempt.surface !== 'memory_recall') throw new Error('MEMORY_DISCLOSURE_SCOPE_UNAVAILABLE');
    return this.retrievalLedger.record(attempt,admit,onCommitted);
  }

  /** Confirm one already returned canonical retrieval without touching Memory access metadata. */
  async confirmedMemoryDelivery(input: {
    taskId: string; workspace: string; retrievalAttemptId: string;
    memoryId: string; contentDigest: string;
  }): Promise<boolean> {
    this.assertOperational();
    return this.retrievalLedger.confirmedDelivery(input);
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
    const forgetting = this.cognitiveConfig.features.forgettingCurve;
    const epistemicLinks = forgetting ? buildEpistemicLinkIndex([...this.records.values()], now) : undefined;
    const threshold = typeof options.retentionThreshold === 'number' && Number.isFinite(options.retentionThreshold)
      ? Math.max(0, Math.min(5, options.retentionThreshold))
      : forgetting ? FORGETTING_PARAMS.reviewThreshold : RETENTION_PARAMS.reviewThreshold;
    const limit = Math.max(1, Math.min(100, options.limit ?? 20));
    const workspace = options.workspace ? this.resolveWorkspace(options.workspace) : undefined;
    const staleAgeMs = 30 * 24 * 60 * 60 * 1000;
    const candidates = [];

    for (const record of this.records.values()) {
      if (record.pinned) continue;
      if (workspace && (!record.provenance?.workspace
        || this.resolveWorkspace(record.provenance.workspace) !== workspace)) continue;
      const salience = salienceByMemory.get(record.id) ?? 1;
      const retention = forgetting
        ? scoreMemoryForgetting(record, now, {
          salience,
          confidence: assessEpistemicConfidence(record, epistemicLinks?.get(record.id)).confidence,
        })
        : scoreMemoryRetention(record, now, salience);
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
    // Refuse the incompatible legacy format before loading scoped records.
    // Never silently strip v2 revisions, provenance, receipts, or history.
    if (await this.store.experienceEnabled()) throw new Error('MEMORY_TRANSFER_V2_UNSUPPORTED');
    const records = await this.list(workspace);
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

  private async touch(record: MemoryRecord,exactRevision=false): Promise<MemoryRecord> {
    if (record.pinned) return record;
    const updated = await this.store.mutate(record.id, (current) => {
      if(exactRevision&&memorySemanticRevision(current)!==memorySemanticRevision(record))throw new MemoryControllerError('MEMORY_REVISION_CONFLICT');
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

  /** Recency touches of one search in ONE store commit (each commit is O(store) under the memory lock). Per-record
   * failures, including the exact-revision conflict of a project-synthesis record, go to `onFailure` and leave the
   * others committed; a failed commit reports every entry. */
  private async touchMany(
    entries: Array<{ record: MemoryRecord; exactRevision: boolean }>,
    onFailure: (record: MemoryRecord, error: unknown) => void,
  ): Promise<void> {
    const wanted = new Map(entries.filter(entry => !entry.record.pinned).map(entry => [entry.record.id, entry] as const));
    if (!wanted.size) return;
    let outcome: Awaited<ReturnType<FileMemoryStore['mutateEach']>>;
    try {
      outcome = await this.store.mutateEach([...wanted.keys()], (current, id) => {
        const { record, exactRevision } = wanted.get(id)!;
        if(exactRevision&&memorySemanticRevision(current)!==memorySemanticRevision(record))throw new MemoryControllerError('MEMORY_REVISION_CONFLICT');
        return {
          ...current,
          lastAccessedAt: new Date().toISOString(),
          retrievalCount: current.retrievalCount + 1,
          evolutionHistory: boundedHistory(current.evolutionHistory, event('retrieved', 'system', ['lastAccessedAt', 'retrievalCount'])),
        };
      });
    } catch (error) {
      for (const { record } of wanted.values()) onFailure(record, error);
      return;
    }
    for (const [id, updated] of outcome.records) this.records.set(id, updated);
    for (const [id, error] of outcome.failures) onFailure(wanted.get(id)!.record, error);
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

  /** Pre-flight secret masking; a no-op unless the feature is on. The safety scan stays the backstop. */
  private maskInput<T extends MaskableMemoryInput>(input: T): { value: T; redactions: SecretRedaction[] } {
    return this.cognitiveConfig.features.secretMasking ? maskMemoryInput(input) : { value: input, redactions: [] };
  }

  private newRecord(input: RememberInput, provenance: MemoryProvenance | undefined, id: string,
    redactionDetails?: Record<string, unknown>): MemoryRecord {
    const content = input.content.trim();
    if (!content) throw new Error('Memory content is required');
    const needsMetadata = input.keywords === undefined || input.context === undefined
      || input.tags === undefined || input.category === undefined;
    const enriched = needsMetadata ? enrichMemoryMetadata(content) : undefined;
    const now = new Date().toISOString();
    const expiresAt = normalizeMemoryExpiresAt(input.expiresAt);
    return {
      version: MEMORY_SCHEMA_VERSION, id,
      ...(input.title?.trim() ? { title: input.title.trim() } : {}), content,
      keywords: input.keywords !== undefined ? uniqueStrings(input.keywords) : uniqueStrings(enriched?.keywords),
      context: input.context?.trim() || enriched?.context || 'General',
      tags: input.tags !== undefined ? uniqueStrings(input.tags) : uniqueStrings(enriched?.tags),
      category: input.category?.trim() || enriched?.category || 'Uncategorized',
      links: materializeLinks(input.links, this.experienceEnabled), createdAt: now, updatedAt: now,
      ...(expiresAt ? { expiresAt } : {}), lastAccessedAt: null, retrievalCount: 0,
      evolutionHistory: [event('created', 'controller', ['content', 'metadata'], redactionDetails)], pinned: false,
      ...(input.source ? { source: input.source } : {}), ...(provenance ? { provenance } : {}),
    };
  }

  /** Final source/admission CAS and digest mutation share the existing canonical lock. */
  private async commitCognitiveDigest(plan: DigestPlan): Promise<DigestCommitResult> {
    this.assertOperational();
    // A source forgotten after planning (for example while a model rewrote the text) must not be digested.
    // The transaction below cannot read the feedback store, so this is the last check before it.
    if ((await this.feedbackStore.forgottenIds(new Set(plan.memberIds))).size) return { status: 'skipped', reason: 'ineligible' };
    const { value: input, redactions } = this.maskInput<RememberInput>({
      title: plan.title, content: plan.content, keywords: plan.keywords, tags: plan.tags, context: plan.context,
      category: 'consolidated-knowledge', source: { type: REM_SOURCE_TYPE },
      links: plan.memberIds.map(targetId => ({ targetId, type: 'derived-from', strength: 0.7, reason: 'rem-consolidation source' })),
    });
    const provenance = await captureMemoryProvenance(this.projectRoot, { workspace: plan.workspace, files: [] });
    const committed = await this.store.transact<DigestCommitResult>([], ({ records, experience }) => {
      const reason = validateDigestPlan(plan, records, Date.now());
      if (reason) return { records, touchedIds: [], stateWrites: [], result: { status: 'skipped', reason } };
      const previous = plan.previous ? records.find(record => record.id === plan.previous!.id) : undefined;
      const id = previous?.id ?? randomUUID();
      let next = this.newRecord({ ...input, ...(previous?.expiresAt ? { expiresAt: previous.expiresAt } : {}) }, provenance, id);
      next.links = normalizeLinks(id, next.links, new Set([...records.map(record => record.id), id]), Boolean(experience));
      if (experience || previous?.version === 2) next = { ...next, version: 2, experience: {
        ...(previous?.version === 2 ? previous.experience : legacyExperience()),
        epistemic: 'hypothesis', verification: { status: 'unverified', evidence: [] }, sourceRefs: plan.sources,
      } };
      next.evolutionHistory = boundedHistory(previous?.evolutionHistory ?? [], event(previous ? 'updated' : 'created',
        plan.assist ? 'system' : 'deterministic', ['content', 'metadata', 'source', 'links'], {
          remFamily: plan.key, generation: plan.fingerprint,
          ...(plan.assist ? { assist: plan.assist } : {}),
          ...(previous?.source?.ref ? { previousSource: previous.source.ref } : {}),
          ...(redactions.length ? { redactions: summarizeRedactions(redactions) } : {}),
        }));
      if (previous) {
        next.createdAt = previous.createdAt;
        next.lastAccessedAt = previous.lastAccessedAt;
        next.retrievalCount = previous.retrievalCount;
      }
      next.source = { type: REM_SOURCE_TYPE, ref: digestSourceRef(plan, next) };
      return { records: previous ? records.map(record => record.id === id ? next : record) : [...records, next],
        touchedIds: [id], stateWrites: [], result: { status: previous ? 'updated' : 'created', id } };
    });
    this.records = new Map(committed.records.map(record => [record.id, record]));
    if (committed.result.status === 'skipped') return committed.result;
    if (committed.result.status === 'created') await this.feedbackStore.reset(committed.result.id).catch(() => undefined);
    try { await this.refreshIndex(); }
    catch (error) { this.setIndexFailure('REM index refresh failed', error); }
    return { ...committed.result, indexIssue: Boolean(this.indexIssue) };
  }

  async remember(rawInput: RememberInput): Promise<MemoryRecord> {
    this.assertOperational();
    await this.reload();
    this.assertOperational();
    const { value: input, redactions } = this.maskInput(rawInput);
    if (!input.content.trim()) throw new Error('Memory content is required');
    const provenance = input.provenance
      ? await captureMemoryProvenance(this.projectRoot, { ...input.provenance, ...(input.provenance.workspace ? { workspace: this.resolveWorkspace(input.provenance.workspace) } : {}) })
      : undefined;
    const id = randomUUID();
    const validIds = new Set([...this.records.keys(), id]);
    const record = this.newRecord(input, provenance, id, redactions.length ? { redactions: summarizeRedactions(redactions) } : undefined);
    record.links = normalizeLinks(id, record.links, validIds, this.experienceEnabled);

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

  async update(id: string, rawPatch: UpdateInput): Promise<MemoryRecord> {
    this.assertOperational();
    await this.reload();
    this.assertOperational();
    const { value: patch, redactions } = this.maskInput(rawPatch);
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
        event(kind, 'controller', changed, redactions.length ? { redactions: summarizeRedactions(redactions) } : undefined),
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

  async batch(rawOperations: MemoryBatchOperation[]): Promise<MemoryBatchResult> {
    this.assertOperational();
    if (!rawOperations.length) throw new Error('memory_batch requires at least one operation');
    if (rawOperations.length > 100) throw new Error('memory_batch supports at most 100 operations');

    const operationRedactions: SecretRedaction[][] = [];
    const operations = rawOperations.map((operation): MemoryBatchOperation => {
      if (operation.op === 'remember') {
        const masked = this.maskInput(operation.value);
        operationRedactions.push(masked.redactions);
        return { ...operation, value: masked.value };
      }
      if (operation.op === 'update') {
        const masked = this.maskInput(operation.patch);
        operationRedactions.push(masked.redactions);
        return { ...operation, patch: masked.value };
      }
      operationRedactions.push([]);
      return operation;
    });
    const redactionDetails = (index: number): Record<string, unknown> | undefined => {
      const redactions = operationRedactions[index] ?? [];
      return redactions.length ? { redactions: summarizeRedactions(redactions) } : undefined;
    };

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
          const id = operation.id ? validateMemoryId(operation.id) : randomUUID();
          if (byId.has(id)) throw new Error(`Memory already exists: ${id}`);
          const record = this.newRecord(operation.value, operationProvenance, id, redactionDetails(operationIndex));
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
            event('updated', 'controller', changed, redactionDetails(operationIndex)),
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

  async search(query: string, options: MemorySearchOptions = {},hostContext?:MemorySearchHostContext): Promise<DeliveredMemorySearchResult[]> {
    this.assertOperational();
    if ((options.excludeMemoryIds?.length ?? 0) > 12 || (options.excludeMemoryIds?.length && !options.taskId)) {
      throw new Error('MEMORY_SEARCH_EXCLUSIONS_INVALID');
    }
    const excludedIds = new Set((options.excludeMemoryIds ?? []).map(validateMemoryId));
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
    const synthesisEligibility=this.synthesisEligibility(hostContext?.scope,hostContext,options.workspace);
    const reportSynthesisEligibility=()=>{try{hostContext?.onSynthesisEligibility?.(synthesisEligibility.summary());}catch{/* Advisory diagnostics must remain fail-soft. */}};

    const stageMs: Record<string, number> = {};
    let stageMark = performance.now();
    const lap = (name: string) => { const now = performance.now(); stageMs[name] = Math.round(now - stageMark); stageMark = now; };
    try {
      await this.reload();
      lap('reload');
      this.assertOperational();
      await this.ensureCurrentIndex();
      lap('ensureCurrentIndex');

      const canonicalRecords = [...this.records.values()];
      const currentRecords = canonicalRecords.map(record => record.provenance?.workspace ? { ...record, provenance: { ...record.provenance, workspace: this.resolveWorkspace(record.provenance.workspace) } } : record);
      const forgottenIds = await this.feedbackStore
        .forgottenIds(new Set(currentRecords.map(record => record.id)))
        .catch(() => new Set<string>());
      lap('forgottenIds');
      const scopeRecords = canonicalRecords.filter(record => !options.workspace || record.pinned
        || (record.provenance?.workspace && this.resolveWorkspace(record.provenance.workspace) === options.workspace)
        || (options.includeGeneral && record.category === 'general'
          && !record.provenance?.workspace && !record.provenance?.repo));
      // Filter before supersession as well as ranking: a withheld derivative must
      // not hide ordinary memory through a link. Ordinary visibility rules stay intact.
      const eligibleScopeRecords=await synthesisEligibility.filter(scopeRecords);
      const supersededIds = new Set(eligibleScopeRecords.flatMap(record => record.links
        .filter(link => link.type === 'supersedes' && isMemoryLinkActive(link, Date.now())).map(link => link.targetId)));
      const workspace = options.workspace ? this.resolveWorkspace(options.workspace) : undefined;
      const semanticEligible = eligibleScopeRecords.filter(record =>
        !excludedIds.has(record.id) && !supersededIds.has(record.id) && (record.pinned || (!isMemoryExpired(record) && !forgottenIds.has(record.id) && (record.version!==2||record.experience.retention!=='archive'))));
      candidateCount=semanticEligible.length;
      lap('eligibility');
      let semanticContext: SemanticSearchContext | undefined;
      if (this.embedder && this.indexStatus === 'available' && this.embeddingStatus !== 'not-configured') {
        try {
          semanticContext = await this.index.semanticContext(normalizedQuery, canonicalRecords, semanticEligible) ?? undefined;
          if (semanticContext) this.clearEmbeddingQueryIssue();
        } catch (error) {
          this.setEmbeddingIssue(error);
        }
      }
      lap('semanticContext');

      const searchOptions: MemorySearchOptions = {
        ...(options.rankingProfile === 'fusion'
          ? { ...options, feedbackSalience: await this.feedbackSalienceMap() }
          : options),
        ...this.cognitiveSearchOptions(normalizedQuery, semanticEligible, options),
      };
      // Scope was resolved against the host alias registry above. Rank canonical
      // records so exact passage revisions are not changed by display normalization.
      const runSearch = (pool: MemoryRecord[]) =>
        searchMemories(pool, normalizedQuery, { ...searchOptions, workspace: undefined }, semanticContext);
      let rankedResults = this.cognitiveConfig.features.tiering
        ? this.searchTiered(semanticEligible, runSearch, Math.max(1, Math.min(50, options.limit ?? 5)))
        : runSearch(semanticEligible);
      let deliveryIds=new Set((await synthesisEligibility.validateDelivery(rankedResults.map(result=>result.record))).map(record=>record.id));
      rankedResults=rankedResults.filter(result=>deliveryIds.has(result.record.id));
      lap('rankAndValidate1');
      deliveryIds=new Set((await synthesisEligibility.validateDelivery(rankedResults.map(result=>result.record))).map(record=>record.id));
      rankedResults=rankedResults.filter(result=>deliveryIds.has(result.record.id));
      lap('validateDelivery2');
      const projection = projectMemorySearchResults(
        rankedResults,
        Math.max(500, Math.min(100_000, options.budgetChars ?? 20_000)),
        semanticEligible,
        referenceTime ? Date.parse(referenceTime) : Date.now(),
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
        synthesisEligibility:synthesisEligibility.summary(),
        exposures,
      };
      reportSynthesisEligibility();
      await this.retrievalLedger.record(attempt).catch(() => undefined);
      // Recency bookkeeping only (lastAccessedAt/retrievalCount). Each touch is a full-store commit under the
      // memory lock, so it starts only after the ledger write above has taken that lock; started earlier, the
      // ledger write (and this response) queued behind every touch.
      if (!synthesisEligibility.summary().reasons.includes('deadline')) {
        void this.touchMany(
          rankedResults.map(result => ({ record: result.record, exactRevision: result.record.category === 'project-synthesis' })),
          (failed, error) => {
            if(failed.category==='project-synthesis')synthesisEligibility.omit(failed,'unknown');
            const issue: MemoryIssue = {
              path: this.store.paths.root,
              message: `Recall metadata update failed for ${failed.id}: ${error instanceof Error ? error.message : String(error)}`,
              severity: 'degraded',
            };
            this.syncCanonicalIssues([...this.canonicalIssues, issue]);
          },
        );
      }
      lap('projectionAndLedger');
      try {
        activityTracker.record('MEMORY', 'info', 'memory_search stage timing', 'search-stage-timing',
          { ...stageMs, candidateCount, hasSemanticContext: Boolean(semanticContext), totalMs: Date.now() - startedMs });
      } catch { /* diagnostics must never affect the search result */ }
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
        synthesisEligibility:synthesisEligibility.summary(),
        exposures: [],
      }).catch(() => undefined);
      reportSynthesisEligibility();
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

  /** Read-path cognitive options; every failure falls back to the base ranking. */
  private cognitiveSearchOptions(query: string, eligible: MemoryRecord[], options: MemorySearchOptions): Partial<MemorySearchOptions> {
    const { features, maxHops } = this.cognitiveConfig;
    const extra: Partial<MemorySearchOptions> = {};
    try {
      if (features.multiHop && options.maxHops === undefined) extra.maxHops = maxHops;
      if (options.rankingProfile === 'fusion') {
        if (features.adaptiveFusion && !options.channelWeights) {
          extra.channelWeights = classifyQueryIntent(query, { sourceFiles: options.sourceFiles }).weights;
        }
        if (features.epistemicConfidence && !options.epistemicInfluence) {
          extra.epistemicInfluence = this.cognitive.epistemicInfluence(eligible);
        }
      }
    } catch { /* Cognitive enhancements are advisory and must never fail recall. */ }
    return extra;
  }

  private searchTiered(records: MemoryRecord[], search: (pool: MemoryRecord[]) => MemorySearchResult[], limit: number): MemorySearchResult[] {
    return searchByTier(records, search, { limit, now: Date.now(), policy: this.cognitiveConfig.tier }).results;
  }

  /** Part of the controller ranking digest only when a ranking-affecting feature is on. */
  private cognitiveRankingRevision(): string | undefined {
    const { adaptiveFusion, epistemicConfidence } = this.cognitiveConfig.features;
    return adaptiveFusion || epistemicConfidence
      ? `cognitive-ranking/v1:${adaptiveFusion ? QUERY_INTENT_VERSION : 'neutral'}:${epistemicConfidence ? 'epistemic' : 'neutral'}`
      : undefined;
  }

  /** Enabled features, loop state and the last maintenance report. */
  cognitiveStatus() {
    return this.cognitive.status();
  }

  dreamingStatus() {
    return this.cognitive.dreamingStatus();
  }

  /** Host-injected model call for REM model assist (P1); undefined removes it. Has no effect while the option is `off`. */
  setDreamingCompletion(completion: DreamingCompletion | undefined): void {
    this.cognitive.setDreamingCompletion(completion);
  }

  async epistemicAssessment(id: string) {
    this.assertOperational();
    await this.reload();
    this.assertOperational();
    const record = this.records.get(validateMemoryId(id));
    if (!record) throw new Error(`Memory not found: ${id}`);
    return this.cognitive.epistemicAssessment(record, [...this.records.values()]);
  }

  /** Preview by default; `apply` hides each resolved loser through the existing supersedes semantics. */
  async resolveContradictions(options: { apply?: boolean; limit?: number } = {}) {
    this.assertOperational();
    return this.cognitive.resolveContradictions(options);
  }

  async scanIntegrity() {
    this.assertOperational();
    return this.cognitive.scanIntegrity();
  }

  async repairIntegrity(options: { apply?: boolean } = {}) {
    this.assertOperational();
    return this.cognitive.repairIntegrity(options);
  }

  /** One cycle over the enabled features; `apply` is required for any mutation. */
  async runCognitiveMaintenance(options: { apply?: boolean; remOnly?: boolean } = {}) {
    this.assertOperational();
    return this.cognitive.runCycle(options);
  }
}
