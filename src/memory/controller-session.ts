import type {IntentionObservation} from './prospective-intentions.js';
import {createProjectSynthesisEligibility,type ProjectSynthesisEligibility,type SynthesisEligibilitySummary} from './project-synthesis.js';
import type {HistoricalMemorySnapshot} from './revisions.js';
import {exactInstant,selectTemporalCandidates} from './temporal.js';
import type {MemoryPromotion,ConsolidationInput,ApplyConsolidationInput,ConsolidationPlan,PromotionReceipt} from './promotion.js';
import type { MemoryEpisodes } from './episodes.js';
import type { IngestionCursor,ContinuityAssessment,RetentionInput,RetentionReceipt,AppendEventInput, ArtifactReceipt, CaptureEvidenceInput,CheckpointInput, EpisodeAppendResult, EpisodeHeader, EpisodeStatusInput, StartEpisodeInput,TaskCapsule, TaskContext } from './experience-types.js';
import { isMemoryLinkActive } from './relations.js';
import {assertMemoryDisclosureSafe} from './safety.js';
import { randomUUID } from 'node:crypto';
import { memoryFeedbackContentDigest } from './feedback-target.js';
import { hashMemoryRetrievalQuery, memoryRecordFingerprint, type MemoryRetrievalAttempt } from './retrieval-ledger.js';
import { decodeDisclosureCursor, disclosureCursorBinding, encodeDisclosureCursor } from './page.js';
import { projectMemoryHit } from './search-projection.js';
import { assessEvidenceLineage } from './evidence-lineage.js';
import { controllerScopeSchema, disclosureDigest, disclosurePayloadDigest, expandInputSchema,
  insufficientBudget, measureBudgeted, memorySemanticRevision, MemoryControllerError, parseControllerInput,
  recallInputSchema, serializeMemoryRecordView,taskContextInputSchema } from './disclosure.js';
import type { Budgeted, ControllerMemoryCapabilities, ControllerScope, ExpandInput, ExpansionPage,
  MemoryHit, RecallInput, RecallPage, SourceRef } from './disclosure.js';
import type { MemoryRecord } from './types.js';
import {searchMemories,type MemorySearchResult} from './retrieval.js';
import {assessMemoryRelevance,type RelevanceInput,type RelevancePolicy} from './relevance.js';
import {externalClaimReviewGuide,type MemoryClaimReviews} from './claim-review.js';
import {RECALL_REPAIR_GUIDE,type MemoryRecallRepairs} from './recall-repair.js';
import {DERIVATION_GUIDE,type MemoryDerivations} from './derivations.js';

/** Internal host-owned read/telemetry ports. Never exported from the package root. */
export interface ControllerRankedSnapshot {
  results: MemorySearchResult[];
  rankingRevision: string;
  relevanceContext?: {semanticStatus:RelevanceInput['semanticStatus']};
  invalidatedSynthesisIds?:string[];
}

export interface ControllerMemoryBackend {
  root: string;
  readonly relevancePolicy?:Readonly<RelevancePolicy>;
  experienceEnabled?:boolean;
  episodes?:MemoryEpisodes;
  claimReviews?:MemoryClaimReviews;
  recallRepairs?:MemoryRecallRepairs;
  derivations?:MemoryDerivations;
  assertScopeCurrent?:()=>void|Promise<void>;
  promotion?:MemoryPromotion;
  resolveWorkspace(value: string): string;
  snapshot(workspace: string, options?:{historical?:boolean;referenceTime?:number}): Promise<MemoryRecord[]>;
  historicalSnapshot?(workspace:string,input:{knownAt:string;maxRecords:number}):Promise<HistoricalMemorySnapshot>;
  rankHistorical?(records:MemoryRecord[],query:string,rankingTime:number):Promise<ControllerRankedSnapshot>;
  synthesisEligibility?():ProjectSynthesisEligibility;
  onSynthesisEligibility?:(summary:SynthesisEligibilitySummary)=>void;
  rank(records: MemoryRecord[], query: string, rankingTime: number): Promise<ControllerRankedSnapshot>;
  read(id: string): Promise<MemoryRecord | null>;
  archivedRevision?(ref:SourceRef):Promise<MemoryRecord|null>;
  inScope(record: MemoryRecord, workspace: string): boolean;
  freshness(record: MemoryRecord): Promise<MemoryHit['freshness']>;
  recordExposure(attempt: MemoryRetrievalAttempt): Promise<unknown>;
}

const TRUST_WARNING = 'memory-is-advisory';

/** Advisory projection only: ready is capsule freshness, never outcome verification or permission. */
export function assessTaskContinuity(context:TaskContext):ContinuityAssessment {
  if(context.detail==='handle-only')return {status:'expand-required',reasons:['handle-only']};
  if(context.freshness==='stale')return {status:'revalidate-required',reasons:['capsule-source-stale']};
  if(!context.capsule&&!context.capsuleRef)return {status:'checkpoint-required',reasons:['capsule-not-available']};
  if(context.freshness==='unknown')return {status:'revalidate-required',reasons:['capsule-source-unknown']};
  if(!context.capsule||context.needsCheckpoint)return {status:'checkpoint-required',reasons:['checkpoint-needed']};
  return {status:'ready',reasons:[]};
}

/** Obtain sessions through MemoryService.controller with host-authorized scope. */
export class ControllerMemorySession {
  readonly #scope: Readonly<ControllerScope>;
  readonly #workspace: string;
  readonly #binding: string;
  readonly #backend: ControllerMemoryBackend;
  constructor(backend: ControllerMemoryBackend, scope: ControllerScope) {
    this.#backend = backend;
    this.#scope = Object.freeze(parseControllerInput(controllerScopeSchema, scope));
    try { this.#workspace = backend.resolveWorkspace(this.#scope.workspaceKey); }
    catch { throw new MemoryControllerError('MEMORY_INPUT_INVALID'); }
    this.#binding = disclosureCursorBinding(disclosureDigest(['controller-scope/v1', backend.root, this.#workspace, this.#scope.taskId]));
  }

  capabilities(): ControllerMemoryCapabilities {
    return { contractVersion: 1, views: this.#backend.experienceEnabled ? ['map','abstract','record','episode','evidence'] : ['map','abstract','record'],
      budgets: { defaultBytes:8192,minBytes:512,maxBytes:65536 }, writeMode:this.#backend.experienceEnabled ? 'experience-v2' : 'legacy-read',temporalAsOf:Boolean(this.#backend.experienceEnabled),...(this.#backend.experienceEnabled&&this.#backend.historicalSnapshot&&this.#backend.rankHistorical?{temporalKnownAt:true as const}:{}),...(this.#backend.experienceEnabled&&this.#backend.claimReviews?{claimReview:externalClaimReviewGuide()}:{}),
      ...(this.#backend.experienceEnabled&&this.#backend.recallRepairs?{recallRepair:RECALL_REPAIR_GUIDE,derivation:DERIVATION_GUIDE}:{}),advisory:true };
  }

  private async snapshot(options?:{historical?:boolean;referenceTime?:number}): Promise<MemoryRecord[]> {
    try { return await this.#backend.snapshot(this.#workspace,options); }
    catch { throw new MemoryControllerError('MEMORY_SOURCE_UNAVAILABLE'); }
  }

  private position(raw: string | undefined, request: string, snapshot: string): number {
    if (!raw) return 0;
    let cursor;
    try { cursor = decodeDisclosureCursor(raw); }
    catch { throw new MemoryControllerError('MEMORY_CURSOR_INVALID'); }
    if (cursor.scope !== this.#binding) throw new MemoryControllerError('MEMORY_SCOPE_MISMATCH');
    if (cursor.request !== request || cursor.snapshot !== snapshot) throw new MemoryControllerError('MEMORY_CURSOR_STALE');
    return cursor.position;
  }
  private cursor(request: string, snapshot: string, position: number, rankingTime = 0): string {
    return encodeDisclosureCursor({ scope:this.#binding,request,snapshot,position,rankingTime });
  }

  private async exposure<T>(input: { result: Budgeted<T>; attemptId: string; startedAt: string;
    view: 'map' | 'abstract' | 'record' | 'episode' | 'evidence'; sourceDelivered?:boolean; records: MemoryRecord[]; delivered: MemoryRecord[];
    query?: string; full?: boolean; candidateCount?: number; synthesisEligibility?:SynthesisEligibilitySummary }): Promise<void> {
    const { result, attemptId, startedAt, view, records, delivered } = input;
    const deliveredIds = new Set(delivered.map(record => record.id));
    const observedNow = new Date().toISOString(),skew=Date.parse(observedNow)<Date.parse(startedAt);
    const now=skew?startedAt:observedNow;
    try {
      await this.#backend.recordExposure({ version:1,attemptId, taskId:this.#scope.taskId,
        surface:view === 'map'||view === 'abstract' ? 'memory_recall' : 'memory_expand', trigger:'explicit', startedAt,completedAt:now,
        ...(skew?{observedCompletedAt:observedNow,clockSkewMs:Date.parse(startedAt)-Date.parse(observedNow)}:{}),
        retrievalStatus:delivered.length||input.sourceDelivered ? 'succeeded' : 'no-results',deliveryStatus:'returned-to-controller',
        candidateCount:input.candidateCount ?? records.length,selectedCount:delivered.length+(input.sourceDelivered?1:0),workspace:this.#workspace,
        disclosureView:view,payloadBytes:result.metrics.payloadBytes,payloadDigest:disclosurePayloadDigest(result),
        ...(input.synthesisEligibility?{synthesisEligibility:input.synthesisEligibility}:{}),
        ...(input.query ? { queryHashSha256:hashMemoryRetrievalQuery(input.query),queryCharCount:Array.from(input.query).length } : {}),
        exposures:records.slice(0,50).map((record,index) => ({ memoryId:record.id,rank:index+1,
          disposition:deliveredIds.has(record.id) ? (input.full ? 'selected' : 'trimmed') : 'dropped',
          handoffStatus:deliveredIds.has(record.id) ? 'returned-to-controller' : 'not-attempted',
          recordFingerprint:memoryRecordFingerprint(record.id,record.updatedAt),contentDigest:memoryFeedbackContentDigest(record),
          reasonCodes:[`view.${view}`,...(skew?['clock-skew-backwards']:[]), ...(deliveredIds.has(record.id) ? [] : ['budget-omitted'])] })) });
    } catch { throw new MemoryControllerError('MEMORY_DISCLOSURE_LEDGER_UNAVAILABLE'); }
  }

  async recall(raw: RecallInput = {}): Promise<Budgeted<RecallPage>> {
    const input = parseControllerInput(recallInputSchema, raw);
    if ((input.asOf !== undefined || input.validAt!==undefined) && !this.#backend.experienceEnabled) throw new MemoryControllerError('MEMORY_TEMPORAL_UNSUPPORTED');
    if(input.knownAt!==undefined&&(!this.#backend.experienceEnabled||!this.#backend.historicalSnapshot||!this.#backend.rankHistorical))throw new MemoryControllerError('MEMORY_TEMPORAL_UNSUPPORTED');
    const asOf=input.validAt??(input.asOf===undefined?undefined:exactInstant(input.asOf));
    const query = input.query?.trim() ?? '';
    if (!query && input.view === 'abstract') throw new MemoryControllerError('MEMORY_INPUT_INVALID');
    const view = input.view ?? (query ? 'abstract' : 'map');
    const retention = input.retention ?? 'active-durable';
    const maxBytes = input.budget?.maxBytes ?? 8192;
    const limit = input.limit ?? 5;
    const attemptId = randomUUID().replaceAll('-','');
    const startedAt = new Date().toISOString();
    const synthesisEligibility=this.#backend.synthesisEligibility?.()??createProjectSynthesisEligibility({
      assertScopeCurrent:()=>{throw new MemoryControllerError('MEMORY_SCOPE_MISMATCH');},inScope:()=>false,validateSnapshot:async()=>{}});
    const request = disclosureCursorBinding(disclosureDigest(['recall/v1','evidence-excerpt/v1',query,view,retention,...(asOf?[asOf]:[]),...(input.knownAt?['knownAt',input.knownAt]:[])]));
    let rankingTime = Date.now();
    if (input.cursor) {
      let previous;
      try { previous = decodeDisclosureCursor(input.cursor); }
      catch { throw new MemoryControllerError('MEMORY_CURSOR_INVALID'); }
      if (previous.scope !== this.#binding) throw new MemoryControllerError('MEMORY_SCOPE_MISMATCH');
      if (previous.request !== request) throw new MemoryControllerError('MEMORY_CURSOR_STALE');
      rankingTime = previous.rankingTime;
    }
    let history:HistoricalMemorySnapshot|undefined;
    if(input.knownAt){try{history=await this.#backend.historicalSnapshot!(this.#workspace,{knownAt:input.knownAt,maxRecords:500});}catch{throw new MemoryControllerError('MEMORY_SOURCE_UNAVAILABLE');}}
    const selected = history?.records??await this.snapshot({historical:asOf!==undefined,referenceTime:rankingTime});
    // Preserve historical behavior: current evidence cannot establish a knownAt synthesis.
    if(history)for(const record of selected)synthesisEligibility.omit(record,'unknown');
    const records=history?selected.filter(record=>record.category!=='project-synthesis'):await synthesisEligibility.filter(selected);
    // Withheld synthesis cannot suppress or contradict ordinary temporal candidates.
    const temporal=this.#backend.experienceEnabled?selectTemporalCandidates(records,asOf??new Date(rankingTime).toISOString())?.filter(({record})=>retention==='all'||(retention==='archive'?(record.version===2&&record.experience.retention==='archive'):(record.version!==2||record.experience.retention!=='archive'))):undefined;
    const eligible=temporal?temporal.map(candidate=>candidate.record):records;
    // Abandoned dependency I/O may still hold a snapshot lock. Ordinary memory can
    // use its already-read snapshot without waiting behind that operation again.
    const dependencyDeadline=synthesisEligibility.summary().reasons.includes('deadline');
    const rankedSnapshot:ControllerRankedSnapshot|undefined = query && !(retention === 'archive' && !this.#backend.experienceEnabled)
      ? dependencyDeadline?{results:searchMemories(eligible,query,{limit:Math.max(1,eligible.length),maxNeighbors:0},undefined,Math.max(1,eligible.length),rankingTime),
        rankingRevision:disclosureDigest(['synthesis-deadline-lexical/v1']),relevanceContext:{semanticStatus:'unavailable'}}
        :await (history?this.#backend.rankHistorical!(eligible,query,rankingTime):this.#backend.rank(eligible,query,rankingTime)) : undefined;
    const relevance = rankedSnapshot && this.#backend.relevancePolicy
      ? assessMemoryRelevance({results:rankedSnapshot.results,eligibleCount:eligible.length,
        semanticStatus:rankedSnapshot.relevanceContext?.semanticStatus as RelevanceInput['semanticStatus'],policy:this.#backend.relevancePolicy})
      : undefined;
    const accepted = relevance ? new Set(relevance.acceptedIds) : undefined;
    let ranked: Array<{ record: MemoryRecord; score?: number }> = retention === 'archive' && !this.#backend.experienceEnabled ? [] : rankedSnapshot ? rankedSnapshot.results.filter(item=>!accepted||accepted.has(item.record.id)) : eligible.map(record => ({ record }));
    if(temporal){const known=new Map(temporal.map(c=>[c.record.id,c.certainty==='known']));ranked.sort((a,b)=>Number(known.get(b.record.id))-Number(known.get(a.record.id)));}
    for(const id of rankedSnapshot?.invalidatedSynthesisIds??[]){const record=records.find(item=>item.id===id);if(record)synthesisEligibility.omit(record,'unknown');}
    const eligibleDelivery=new Set((await synthesisEligibility.validateDelivery(ranked.map(item=>item.record))).map(record=>record.id));
    ranked=ranked.filter(item=>eligibleDelivery.has(item.record.id));
    let snapshot = disclosureDigest(['controller-snapshot/v2', records.map(record => [record.id,memorySemanticRevision(record)]).sort(([a],[b]) => a.localeCompare(b)),
      rankedSnapshot?.rankingRevision ?? 'ranking-unrequested/v1', ranked.map(item => [item.record.id,item.score ?? null]),
      ...(history?[{knowledgeCoverage:history.coverage,revisionRefs:history.revisionRefs}]:[]),
      ...(relevance ? [{policyDigest:relevance.policyDigest,acceptedIds:relevance.acceptedIds,semanticStatus:relevance.semanticStatus}] : [])]);
    let snapshotBinding = disclosureCursorBinding(snapshot);
    const start = this.position(input.cursor,request,snapshotBinding);
    if (start >= ranked.length && (start !== 0 || input.cursor)) throw new MemoryControllerError('MEMORY_CURSOR_STALE');
    const warnings = [TRUST_WARNING,...(view === 'abstract' ? ['abstract-is-preview'] : []),
      ...(retention !== 'active-durable' && !this.#backend.experienceEnabled ? ['archive-not-enabled'] : []),
      ...(relevance?.semanticStatus==='unavailable' ? ['semantic-unavailable'] : []),...(asOf&&!history?['valid-time-with-current-evidence','not-known-at']:[]),...(history?['historical-knowledge-snapshot','historical-source-freshness-unknown',...(!history.coverage.complete?[`knowledge-history-${history.coverage.reason??'unknown'}`]:[])]:[]),...(synthesisEligibility.summary().omitted?['synthesis-stale-or-unknown-omitted']:[])];
    const count = Math.min(limit,ranked.length-start);
    let pageRecords=ranked.slice(start,start+count).map(item=>item.record);
    let hits: MemoryHit[] = [];
    for (const item of ranked.slice(start,start+count)) {
      try {assertMemoryDisclosureSafe(JSON.parse(serializeMemoryRecordView(item.record)));}catch{throw new MemoryControllerError('MEMORY_SOURCE_UNAVAILABLE');}
      const temporalItem=temporal?.find(c=>c.record.id===item.record.id);
      const conflicted = temporalItem ? temporalItem.conflicted : records.some(owner => owner.links.some(link => link.type === 'contradicts' && link.targetId === item.record.id && isMemoryLinkActive(link,asOf?Date.parse(asOf):rankingTime)));
      // Present-day source inspection cannot establish what was known at the historical cutoff.
      hits.push(projectMemoryHit(item.record,{ revision:memorySemanticRevision(item.record),view,query,
        ...(item.score !== undefined ? { score:item.score } : {}), applicability:conflicted ? 'conflicted' : temporalItem?.certainty==='known' ? (asOf?'historical':'current') : 'unknown',
        invalidatedBy:temporalItem?.invalidatedBy,freshness:history?'unknown':await this.#backend.freshness(item.record),retrievalEvidence:{ attemptId,
          contentDigest:memoryFeedbackContentDigest(item.record),recordFingerprint:memoryRecordFingerprint(item.record.id,item.record.updatedAt) } }));
    }
    // Freshness projection may await I/O. Recheck after it and before disclosure/ledger delivery.
    const finalEligible=new Set((await synthesisEligibility.validateDelivery(ranked.map(item=>item.record))).map(record=>record.id));
    const deliveryDrift=ranked.some(item=>!finalEligible.has(item.record.id));
    if(deliveryDrift){
      pageRecords=pageRecords.filter(record=>finalEligible.has(record.id));
      const ids=new Set(pageRecords.map(record=>record.id));hits=hits.filter(hit=>ids.has(hit.id));
      snapshot=disclosureDigest([snapshot,'synthesis-delivery-drift',ranked.filter(item=>finalEligible.has(item.record.id)).map(item=>[item.record.id,memorySemanticRevision(item.record)])]);
      snapshotBinding=disclosureCursorBinding(snapshot);
      if(!warnings.includes('synthesis-stale-or-unknown-omitted'))warnings.push('synthesis-stale-or-unknown-omitted');
    }
    const eligibilitySummary=synthesisEligibility.summary();
    try{this.#backend.onSynthesisEligibility?.(eligibilitySummary);}catch{/* Advisory coverage remains fail-soft. */}
    const page = (take: number) => {
      const more = start+take < ranked.length;
      const lineage = take > 1 ? assessEvidenceLineage(pageRecords.slice(0,take),records,asOf?Date.parse(asOf):rankingTime) : undefined;
      const returned = hits.slice(0,take).map(hit=>({
        ...hit,...(lineage?{evidenceLineage:lineage.get(hit.id)}:{}),
      }));
      const partial = more || eligibilitySummary.completeness==='partial' || Boolean(history&&!history.coverage.complete) || (retention !== 'active-durable' && !this.#backend.experienceEnabled);
      return measureBudgeted<RecallPage>({ status:partial ? 'partial' : 'ok',warnings,
        data:{ snapshot,hits:returned,...(history?{knowledgeCoverage:history.coverage}:{}),...(relevance ? {relevance:{status:relevance.status,policyDigest:relevance.policyDigest,semanticStatus:relevance.semanticStatus}} : {}),...(more&&!deliveryDrift ? { nextCursor:this.cursor(request,snapshotBinding,start+take,rankingTime) } : {}),
          archiveSearchAvailable:Boolean(this.#backend.experienceEnabled),completeness:partial ? 'partial' : 'complete' } });
    };
    let take = hits.length;
    let result = page(take);
    while (result.metrics.payloadBytes > maxBytes && take > 1) { take--; result = page(take); }
    if (result.metrics.payloadBytes > maxBytes) { result = insufficientBudget(result.metrics.payloadBytes,warnings); take = 0; }
    await this.exposure({ result,attemptId,startedAt,view,records:pageRecords,
      delivered:pageRecords.slice(0,take),query,candidateCount:rankedSnapshot?.results.length??ranked.length,synthesisEligibility:eligibilitySummary });
    return result;
  }

  async expand(raw: ExpandInput): Promise<Budgeted<ExpansionPage>> {
    const input = parseControllerInput(expandInputSchema, raw);
    if (input.source.kind !== 'memory' || input.view !== 'record') return this.expandExperience(input);
    const maxBytes = input.budget?.maxBytes ?? 8192;
    const attemptId = randomUUID().replaceAll('-','');
    const startedAt = new Date().toISOString();
    // Exact selected read is deliberately access-free; scope and visibility are
    // revalidated from the current host snapshot before any body leaves the API.
    let record: MemoryRecord | null;
    try { record = await this.#backend.read(input.source.id); }
    catch { throw new MemoryControllerError('MEMORY_SOURCE_UNAVAILABLE'); }
    if (!record) throw new MemoryControllerError('MEMORY_SOURCE_UNAVAILABLE');
    if (!this.#backend.inScope(record,this.#workspace)) throw new MemoryControllerError('MEMORY_SCOPE_MISMATCH');
    const records = await this.snapshot({historical:Boolean(this.#backend.experienceEnabled)});
    const eligible = records.find(item => item.id === input.source.id);
    if (!eligible) throw new MemoryControllerError('MEMORY_SOURCE_UNAVAILABLE');
    if (memorySemanticRevision(record) !== memorySemanticRevision(eligible)) throw new MemoryControllerError('MEMORY_REVISION_CONFLICT');
    let retained = record.version === 2;
    if (memorySemanticRevision(record) !== input.source.revision) {
      retained = true;
      try { record = await this.#backend.archivedRevision?.(input.source) ?? null; }
      catch { throw new MemoryControllerError('MEMORY_SOURCE_UNAVAILABLE'); }
      if (!record) throw new MemoryControllerError('MEMORY_REVISION_CONFLICT');
      if (!this.#backend.inScope(record,this.#workspace)) throw new MemoryControllerError('MEMORY_SCOPE_MISMATCH');
      if (memorySemanticRevision(record) !== input.source.revision) throw new MemoryControllerError('MEMORY_SOURCE_UNAVAILABLE');
    }
    const request = disclosureCursorBinding(disclosureDigest(['expand/v1',input.source,input.view]));
    const snapshot = disclosureCursorBinding(input.source.revision);
    try {assertMemoryDisclosureSafe(JSON.parse(serializeMemoryRecordView(record)));}catch{throw new MemoryControllerError('MEMORY_SOURCE_UNAVAILABLE');}
    const points = Array.from(serializeMemoryRecordView(record));
    const start = this.position(input.cursor,request,snapshot);
    if (start >= points.length) throw new MemoryControllerError('MEMORY_CURSOR_STALE');
    const warnings = [TRUST_WARNING,retained ? 'retained-exact-revision' : 'legacy-latest-revision-only',...(this.#backend.experienceEnabled?['exact-revision-not-current-applicability']:[])];
    const page = (length: number) => {
      const more = start+length < points.length;
      return measureBudgeted<ExpansionPage>({ status:more ? 'partial' : 'ok',warnings,
        data:{ source:input.source,view:input.view,text:points.slice(start,start+length).join(''),offset:start,totalCodePoints:points.length,
          sourceRefs:[],...(more ? { nextCursor:this.cursor(request,snapshot,start+length) } : {}),availability:'available' } });
    };
    let result = page(points.length-start);
    if (result.metrics.payloadBytes > maxBytes) {
      const minimum = page(1);
      if (minimum.metrics.payloadBytes > maxBytes) result = insufficientBudget(minimum.metrics.payloadBytes,warnings);
      else {
        let low = 1, high = points.length-start;
        result = minimum;
        while (low <= high) {
          const mid = Math.floor((low+high)/2), candidate = page(mid);
          if (candidate.metrics.payloadBytes <= maxBytes) { result = candidate; low = mid+1; } else high = mid-1;
        }
      }
    }
    await this.exposure({ result,attemptId,startedAt,view:'record',records:[record],
      delivered:result.status === 'insufficient-budget' ? [] : [record],full:start === 0 && result.status === 'ok' });
    return result;
  }

  private episodeOwner():MemoryEpisodes {
    if(!this.#backend.experienceEnabled||!this.#backend.episodes)throw new MemoryControllerError('MEMORY_EXPERIENCE_NOT_ENABLED');
    return this.#backend.episodes;
  }
  private episodeScope():ControllerScope {return {...this.#scope,workspaceKey:this.#workspace};}
  private async expandExperience(input:ExpandInput):Promise<Budgeted<ExpansionPage>> {
    const owner=this.episodeOwner();
    if(input.view==='record')throw new MemoryControllerError('MEMORY_INPUT_INVALID');
    const attemptId=randomUUID().replaceAll('-',''),startedAt=new Date().toISOString();
    const view=input.view,source=await owner.expand(this.episodeScope(),input.source,view);
    try {assertMemoryDisclosureSafe(input.source.kind==='artifact'?source.text:JSON.parse(source.text));}catch{throw new MemoryControllerError('MEMORY_SOURCE_UNAVAILABLE');}
    const maxBytes=input.budget?.maxBytes??8192;
    const request=disclosureCursorBinding(disclosureDigest(['experience-expand/v1',input.source,view]));
    const snapshot=disclosureCursorBinding(input.source.revision),points=Array.from(source.text);
    const start=this.position(input.cursor,request,snapshot);
    if(start>points.length||(input.cursor&&start===points.length))throw new MemoryControllerError('MEMORY_CURSOR_STALE');
    const warnings=[TRUST_WARNING,'retained-exact-revision',...(source.availability!=='available'?['evidence-unavailable']:[]),...(source.warning?[source.warning]:[])];
    const page=(length:number)=>{
      const more=start+length<points.length;
      return measureBudgeted<ExpansionPage>({status:more||source.availability!=='available'?'partial':'ok',warnings,data:{source:input.source,view,
        text:points.slice(start,start+length).join(''),offset:start,totalCodePoints:points.length,sourceRefs:source.sourceRefs,
        ...(more?{nextCursor:this.cursor(request,snapshot,start+length)}:{}),availability:source.availability}});
    };
    let result=page(points.length-start);
    if(result.metrics.payloadBytes>maxBytes){
      const minimum=page(points.length?1:0);
      if(minimum.metrics.payloadBytes>maxBytes){
        const insufficient=insufficientBudget<ExpansionPage>(minimum.metrics.payloadBytes,warnings);
        await this.exposure({result:insufficient,attemptId,startedAt,view,records:[],delivered:[],candidateCount:1});return insufficient;
      }
      let low=1,high=points.length-start;result=minimum;
      while(low<=high){const middle=Math.floor((low+high)/2),candidate=page(middle);if(candidate.metrics.payloadBytes<=maxBytes){result=candidate;low=middle+1;}else high=middle-1;}
    }
    await this.exposure({result,attemptId,startedAt,view,records:[],delivered:[],candidateCount:1,sourceDelivered:source.availability==='available'});
    return result;
  }
  async captureEvidence(input:CaptureEvidenceInput):Promise<ArtifactReceipt> {return this.episodeOwner().captureEvidence(this.episodeScope(),input);}
  async startEpisode(input:StartEpisodeInput):Promise<EpisodeHeader> {return this.episodeOwner().startEpisode(this.episodeScope(),input);}
  async appendEvent(input:AppendEventInput):Promise<EpisodeAppendResult> {return this.episodeOwner().appendEvent(this.episodeScope(),input);}
  async setEpisodeStatus(input:EpisodeStatusInput):Promise<EpisodeHeader> {return this.episodeOwner().setEpisodeStatus(this.episodeScope(),input);}
  async getIngestionCursor(input:{streamId:string}):Promise<IngestionCursor> {return this.episodeOwner().getIngestionCursor(this.episodeScope(),input);}
  async getTaskContext(raw?:{budget?:{maxBytes?:number};intentions?:IntentionObservation}):Promise<Budgeted<TaskContext>> {
    const owner=this.episodeOwner();
    const input=parseControllerInput(taskContextInputSchema,raw??{});
    const {context,warnings:sourceWarnings}=await owner.taskContext(this.episodeScope(),input.budget?.maxBytes??8192,input.intentions);
    context.continuity=assessTaskContinuity(context);
    const warnings=[TRUST_WARNING,...sourceWarnings];
    const full=measureBudgeted<TaskContext>({status:context.needsCheckpoint||sourceWarnings.length?'partial':'ok',warnings,data:context});
    if(full.metrics.payloadBytes<=(input.budget?.maxBytes??8192))return full;
    // Omit the capsule as a whole. The exact episode handle always retains paged full-state expansion.
    const handleContext:TaskContext={detail:'handle-only',episodeRef:context.episodeRef,freshness:context.freshness,needsCheckpoint:context.needsCheckpoint};
    handleContext.continuity=assessTaskContinuity(handleContext);
    const handle=measureBudgeted<TaskContext>({status:'partial',warnings:[...new Set([...warnings,...(context.capsule?['capsule-omitted-budget']:[])])],data:handleContext});
    return handle.metrics.payloadBytes<=(input.budget?.maxBytes??8192)?handle:insufficientBudget(handle.metrics.payloadBytes,warnings);
  }

  // Stable gates only. Later owning increments supply actual input/result types.
  private unsupported(): Promise<never> { return Promise.reject(new MemoryControllerError('MEMORY_EXPERIENCE_NOT_ENABLED')); }
  async checkpoint(input:CheckpointInput): Promise<Budgeted<TaskCapsule>> { return this.episodeOwner().checkpoint(this.episodeScope(),input); }
  async prepareConsolidation(input:ConsolidationInput):Promise<ConsolidationPlan> { this.episodeOwner();if(!this.#backend.promotion)return this.unsupported();return this.#backend.promotion.prepare(this.episodeScope(),input); }
  async applyConsolidation(input:ApplyConsolidationInput):Promise<PromotionReceipt> { this.episodeOwner();if(!this.#backend.promotion)return this.unsupported();return this.#backend.promotion.apply(this.episodeScope(),input); }
  /** Host reconciliation only; deliberately absent from the controller protocol dispatcher. */
  async committedConsolidation(input:{operationId:string}):Promise<PromotionReceipt|undefined> { this.episodeOwner();if(!this.#backend.promotion)return this.unsupported();return this.#backend.promotion.committed(this.episodeScope(),input); }
  async setRetention(input:RetentionInput):Promise<RetentionReceipt> {return this.episodeOwner().setRetention(this.episodeScope(),input);}
  async readClaimReview(input:unknown){
    if(!this.#backend.claimReviews)throw new MemoryControllerError('MEMORY_SCOPE_MISMATCH');
    await this.#backend.assertScopeCurrent?.();
    const result=await this.#backend.claimReviews.read(this.#scope,input);
    await this.#backend.assertScopeCurrent?.();return result;
  }
  async writeClaimReview(input:unknown){
    if(!this.#backend.claimReviews)throw new MemoryControllerError('MEMORY_SCOPE_MISMATCH');
    return this.#backend.claimReviews.write(this.#scope,input,this.#backend.assertScopeCurrent);
  }
  async readRecallRepair(input:unknown){
    if(!this.#backend.recallRepairs)throw new MemoryControllerError('MEMORY_SCOPE_MISMATCH');
    return this.#backend.recallRepairs.read(this.#scope,input,this.#backend.assertScopeCurrent);
  }
  async writeRecallRepair(input:unknown){
    if(!this.#backend.recallRepairs)throw new MemoryControllerError('MEMORY_SCOPE_MISMATCH');
    return this.#backend.recallRepairs.write(this.#scope,input,this.#backend.assertScopeCurrent);
  }
  async readDerivation(input:unknown){
    if(!this.#backend.derivations)throw new MemoryControllerError('MEMORY_SCOPE_MISMATCH');
    return this.#backend.derivations.read(this.#scope,input,this.#backend.assertScopeCurrent);
  }
  async writeDerivation(input:unknown){
    if(!this.#backend.derivations)throw new MemoryControllerError('MEMORY_SCOPE_MISMATCH');
    return this.#backend.derivations.write(this.#scope,input,this.#backend.assertScopeCurrent);
  }
}
