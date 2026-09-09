import { createHash, randomUUID } from 'node:crypto';
import { access, cp, mkdir, open, readFile, readdir, unlink } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import type { MemoryConfig } from '../../config.js';
import { ContinuityStoreError, assertContinuityTransition, type ContinuityBeginTurnResult, type ContinuityCheckpointResult, type ContinuityFrontierRecord, type ContinuityReconcileResult, type ContinuityTaskRecord } from '../../continuity/store.js';
import { CONTINUITY_SNAPSHOT_LIMITS, type ContinuitySnapshot, type ContinuityInterruptedTurnRecord } from '../../continuity/snapshot.js';
import type { ContinuityCapture, ContinuityCheckpointInput, ContinuityTaskStatus, ContinuityTurnState, FrontierStatus } from '../../continuity/types.js';
import { isTerminalContinuityTaskStatus, normalizeContinuityCapture, normalizeContinuityCheckpointInput } from '../../continuity/types.js';
import type { ContinuityPromotionResult } from '../../continuity/promoter.js';
import { normalizeCanonicalKey, normalizeMemoryText } from '../normalizer.js';
import { redactMemoryText } from '../redaction.js';
import { memoryRelationPolicy } from '../relation-policy.js';
import { normalizeMemorySemanticProfile } from '../semantic-profile.js';
import { normalizeMemoryValue, type RecordMemoryEventRequest, type StoredMemoryRevision } from '../record-types.js';
import type {
  MemoryCommitRequest, MemoryCommitResult, MemoryDurabilityBoundaryReason, MemoryDurabilityBoundaryResult,
  MemoryNodeMetadataRecord, MemoryPersistenceDecisionType, MemoryPostflightApplyResult, MemoryPostflightEvaluation,
  MemoryPostflightRelationProposal, MemoryPostflightRequest, MemoryPreflightRequest, MemoryPreflightResult,
  MemoryRecallExpansionRecord, MemoryRememberMoreEntry, MemoryRememberMoreRequest, MemoryRememberMoreResult,
  MemoryRelation, MemoryRemoteStateRecord, MemoryReviseRequest, MemoryReviseResult, MemoryScope,
  MemorySearchRequest, MemorySearchResult, MemorySemanticProfile, MemoryWriteDecisionRecord, MemoryWriteReasonCode,
} from '../types.js';
import { MEMORY_REMEMBER_MORE_DEFAULTS, MEMORY_REMEMBER_MORE_LIMITS, MUTABLE_MEMORY_KINDS } from '../types.js';
import { deriveMutableChangeReason, validatePostflightRelationPlan } from '../write-policy.js';
import { MemoryHardLifecycleError, type MemoryContextLifecycleRecord } from '../hard-lifecycle.js';
import { MemoryRemoteCrypto } from '../remote-crypto.js';
import { FileNativeAuxStore } from './aux-store.js';
import { GraphifyAdapter } from './graphify-adapter.js';
import { canonicalFileNativeProjectId, type FileNativeMemoryPaths } from './paths.js';
import { FileNativeMemoryRetriever, canonicalSubject, explanation } from './retriever.js';
import { buildRecallProbes } from './ripgrep.js';
import { SupabaseDirectMemory, SupabaseDirectHttpTransport, SupabaseDirectError, type SupabaseDirectTransport } from './supabase-direct.js';
import type { MemoryDirectStatus, MemorySearchHit } from '../types.js';
import { FileNativeMemoryRepository, segmentInScope } from './vault-repository.js';
import { recoverPendingVaultTransactions } from './transaction-journal.js';
import { parseVaultSegment } from './vault-codec.js';
import { SupabaseSecondMemory, type FileSecondMemoryTransport } from './supabase-second-memory.js';
import { VaultSecondMemoryCoordinator } from './vault-second-memory.js';
import { SupabaseEd25519FileTransport } from './supabase-second-transport.js';
import { acquireMemoryRecoveryLease, assertNoMemoryRecoveryPending, restoreWorkflowBackup, type MemoryRecoveryLease } from './recovery-coordinator.js';
import { validateWorkflowProjectionDocument } from './workflow-projection.js';

export interface FileNativeMemoryContextRecord {
  contextId:string; principalId:string; projectId:string; routeContextId:string; queryText:string; queryHash:string;
  resultJson:string; blockingJson:string; createdAt:number; expiresAt:number; vaultSnapshotHash?:string;
}
export interface FileNativeConflictRecord {
  conflictId:string; principalId:string; projectId:string; leftMemoryId:string; rightMemoryId:string;
  conflictType:string; status:'open'|'resolved'; evidence:Record<string,unknown>; createdAt:number; resolvedAt?:number;
}
interface ContinuityTurnRecord {
  turnId:string; taskId:string; principalId:string; projectId:string; routeContextId:string; state:ContinuityTurnState;
  createdAt:number; closedAt?:number; expiresAt?:number;
}
type StoredFrontier = ContinuityFrontierRecord & { principalId?:string; projectId?:string; ordinal?:number };
interface ContinuityCheckpointRecord {
  checkpointId:string; principalId:string; projectId:string; taskId:string; routeContextId:string;
  phase:ContinuityTaskStatus; input:ContinuityCheckpointInput; stateHash:string; createdAt:number;
  turnId?:string; contextId?:string; requestHash?:string; priorCheckpointId?:string;
  memoryDecision?:ContinuityCheckpointClosure['memoryDecision'];
}
export interface ContinuityCheckpointClosure {
  contextId:string;
  memoryDecision?:{reasonCode:'TRANSIENT_OPERATION'|'INSUFFICIENT_EVIDENCE'|'NO_FUTURE_RELEVANCE';explanation:string};
}

const C = {
  contexts:'contexts', lifecycles:'lifecycles', decisions:'write-decisions', metadata:'node-metadata', recall:'recall-expansions',
  conflicts:'conflicts', remote:'remote-state', events:'events', tasks:'continuity-tasks', turns:'continuity-turns',
  checkpoints:'continuity-checkpoints', frontier:'continuity-frontier',
} as const;
const BLOCKERS=new Set<MemoryWriteReasonCode>(['TRANSIENT_OPERATION','INSUFFICIENT_EVIDENCE','NO_FUTURE_RELEVANCE']);
const project=(paths:FileNativeMemoryPaths,scope:MemoryScope)=>canonicalFileNativeProjectId(paths,scope.projectId);
const binary=(a:string,b:string)=>a<b?-1:a>b?1:0;
const unique=(v:readonly string[])=>[...new Set(v.filter(Boolean))].sort(binary);
function durabilityCause(error:unknown):string{
  const code=error&&typeof error==='object'&&'code'in error?(error as {code:unknown}).code:undefined;
  if(typeof code==='string'&&/^[A-Z0-9_]{1,100}$/.test(code))return code;
  if(error instanceof Error&&/^[A-Z0-9_]{1,100}$/.test(error.message))return error.message;
  return'MEMORY_DURABILITY_FAILED';
}
function stableJson(v:unknown):string {
  if(v===null||typeof v!=='object')return JSON.stringify(v);
  if(Array.isArray(v))return `[${v.map(stableJson).join(',')}]`;
  return `{${Object.entries(v as Record<string,unknown>).sort(([a],[b])=>binary(a,b)).map(([k,x])=>`${JSON.stringify(k)}:${stableJson(x)}`).join(',')}}`;
}
const digest=(v:unknown)=>createHash('sha256').update(typeof v==='string'?v:stableJson(v),'utf8').digest('hex');
const decisionIdFor=(hash:string)=>`${hash.slice(0,8)}-${hash.slice(8,12)}-4${hash.slice(13,16)}-8${hash.slice(17,20)}-${hash.slice(20,32)}`;
type DurablePostflightDecision=MemoryWriteDecisionRecord&{coveredMeaningfulWorkCount?:number;plannedRevisionId?:string};
const objectiveHash=(task:string,context?:string)=>digest([task,context].filter(Boolean).map(v=>String(v).normalize('NFKC').trim()).join('\n'));
const scopeMatches=(paths:FileNativeMemoryPaths,r:{principalId:string;projectId:string},s:MemoryScope)=>r.principalId===s.principalId&&r.projectId===project(paths,s);
// Share the queue across backend instances using the same canonical vault.
const postflightQueues=new Map<string,Promise<unknown>>();
function postflightCandidate(request:MemoryPostflightRequest){
  if(!request.candidate)return{hash:digest({candidate:null})};
  const canonicalKey=normalizeCanonicalKey(request.candidate.canonicalKey??''); if(!canonicalKey)throw new Error('MEMORY_CANONICAL_KEY_REQUIRED');
  const value=normalizeMemoryValue(request.candidate.value); const semantic=request.candidate.semanticProfile?normalizeMemorySemanticProfile(request.candidate.semanticProfile):undefined;
  return {canonicalKey,hash:digest({canonicalKey,kind:request.candidate.kind,valueText:value.valueText,valueJson:value.valueJson??null,semanticProfile:semantic?.profile??null}),semanticProfileHash:semantic&&Object.keys(semantic.profile).length?semantic.hash:undefined};
}
function relationPlan(relations:readonly MemoryPostflightRelationProposal[]){
  return [...relations].sort((a,b)=>binary(`${a.relation}\0${a.targetMemoryId}`,`${b.relation}\0${b.targetMemoryId}`)).map(r=>({targetMemoryId:r.targetMemoryId,relation:r.relation,evidenceRefs:unique(r.evidenceRefs)}));
}
function relationReason(r:MemoryRelation){
  if(r==='failed_because'||r==='caused_by')return'failure_cause'; if(r==='resolved_by')return'resolved_by'; if(r==='validated_by')return'validated_by';
  if(r==='branch_of'||r==='derived_from')return'branch_parent'; if(r==='contradicts')return'conflict'; if(r==='depends_on'||r==='blocked_by')return'dependency'; return'other_recursive';
}

export type MemoryGraphProvider=Pick<GraphifyAdapter,'update'|'health'|'ensureFresh'|'scoreRelated'>;
export interface FileNativeMemoryBackendDependencies { fileSecondTransport?: FileSecondMemoryTransport; supabaseDirectTransport?: SupabaseDirectTransport; graphify?:MemoryGraphProvider; }

export class FileNativeMemoryBackend {
  readonly paths:FileNativeMemoryPaths; readonly repo:FileNativeMemoryRepository; readonly aux:FileNativeAuxStore;
  private readonly retriever:FileNativeMemoryRetriever;
  private readonly graphify:MemoryGraphProvider;
  private directHealthCheckedAt=0;
  private vaultWriteCheckedAt=0;
  private secondPromise:Promise<SupabaseSecondMemory|null>|undefined;
  private secondLastError:string|undefined;
  private startupPromise:Promise<void>|undefined;
  private recoveredTransactions=0;
  private readonly direct: SupabaseDirectMemory | undefined;
  private recoveryLease:MemoryRecoveryLease|undefined;
  constructor(readonly config:MemoryConfig, private readonly dependencies:FileNativeMemoryBackendDependencies={}){
    this.paths=config.fileNative; this.repo=new FileNativeMemoryRepository(this.paths); this.aux=new FileNativeAuxStore(this.paths);
    if (config.supabaseDirect?.enabled) {
      this.direct = new SupabaseDirectMemory(this.paths, this.repo, this.aux,
        dependencies.supabaseDirectTransport ?? new SupabaseDirectHttpTransport(config.supabaseDirect), config.supabaseDirect.url!);
    }
    this.graphify=dependencies.graphify??new GraphifyAdapter(this.paths,{
      pythonPath:config.fileNative.pythonPath??path.join(this.paths.pythonRoot,process.platform==='win32'?'python.exe':'bin/python3'),
      bridgePath:path.join(this.paths.projectRoot,'scripts','memory','graphify-bridge.py'),
      nodeCap:config.graphNodeCap,edgeCap:config.graphEdgeCap,maxHops:config.graphMaxHops,
    });
    this.retriever=new FileNativeMemoryRetriever(this.paths,{itemBudget:config.recallItemBudget,characterBudget:config.recallCharacterBudget,scoreWeights:config.scoreWeights,graphNodeCap:config.graphNodeCap,...(config.fileNative.rgPath?{rgPath:config.fileNative.rgPath}:{}),graphProvider:this.graphify,repository:this.repo,diagnosticAllowGraphFailure:config.hardLifecycleMode!=='enforce'});
  }
  async ensureReady(){
    this.startupPromise??=(async()=>{
      this.recoveryLease??=await acquireMemoryRecoveryLease(this.paths,'reader');
      await assertNoMemoryRecoveryPending(this.paths);
      await Promise.all([this.paths.vaultRoot,this.paths.transactionRoot,this.paths.graphRoot,this.paths.syncRoot].map(p=>mkdir(p,{recursive:true})));
      const recovered=await recoverPendingVaultTransactions(this.paths,(content)=>{parseVaultSegment(content,'recovered.md');});
      this.recoveredTransactions+=recovered.recovered;
    })();
    try{await this.startupPromise;}catch(error){this.startupPromise=undefined;await this.recoveryLease?.release();this.recoveryLease=undefined;throw error;}
  }
  async recordEvent(request:RecordMemoryEventRequest){
    if(!request.scope.principalId?.trim()||!request.eventType?.trim()||!request.sourceType?.trim())throw new Error('MEMORY_EVENT_INVALID');
    const eventId=randomUUID(),createdAt=Date.now(),redactedText=normalizeMemoryText(redactMemoryText(request.text??'').text).canonical;
    await this.aux.put(C.events,eventId,{eventId,principalId:request.scope.principalId,projectId:project(this.paths,request.scope),eventType:request.eventType,sourceType:request.sourceType,sourceRef:request.sourceRef?redactMemoryText(request.sourceRef).text:undefined,redactedText,metadata:request.metadata??{},createdAt});
    return{eventId,redactedText,createdAt};
  }
  async commit(r:MemoryCommitRequest):Promise<MemoryCommitResult>{const result=await this.repo.commit(r);await this.refreshGraph();const supabaseSync=await this.syncAfterMutation(r.scope);return {...result,...(supabaseSync?{supabaseSync}:{})};}
  async revise(r:MemoryReviseRequest):Promise<MemoryReviseResult>{const result=await this.repo.revise(r);await this.refreshGraph();const supabaseSync=await this.syncAfterMutation(r.scope);return {...result,...(supabaseSync?{supabaseSync}:{})};}
  async search(r:MemorySearchRequest):Promise<MemorySearchResult>{return this.recall(r);}
  async getMemory(s:MemoryScope,id:string){
    const local=await this.repo.getMemory(s,id); if(local||!this.direct)return local;
    const remote=await this.direct.get(s,id);return remote?{...remote.entry,principalId:s.principalId,projectId:project(this.paths,s)}:null;
  }
  async listRevisions(s:MemoryScope,id:string){
    if(await this.repo.getMemory(s,id)||!this.direct)return this.repo.listRevisions(s,id);
    return (await this.direct.get(s,id))?.revisions??[];
  }
  async forget(s:MemoryScope,id:string,reason:string){await this.repo.tombstoneMemory(s,id,reason);await this.refreshGraph();return this.syncAfterMutation(s);}

  async preflight(request:MemoryPreflightRequest):Promise<MemoryPreflightResult>{
    if(!request.scope.principalId?.trim())throw new Error('Memory preflight requires principalId');
    if(!request.routeContextId?.trim())throw new Error('Memory preflight requires routeContextId');
    if(!request.task?.trim())throw new Error('Memory preflight requires a task');
    if(!Number.isFinite(request.expiresAt)||request.expiresAt<=Date.now())throw new Error('Memory preflight expiresAt must be in the future');
    if(this.config.hardLifecycleMode==='enforce'){
      const pending=await this.findPendingLifecycle({scope:request.scope});
      if(pending.length)throw new MemoryHardLifecycleError('MEMORY_POSTFLIGHT_REQUIRED','Previous work in this project must be finalized before a new objective opens',{pendingCount:pending.length});
      await this.assertComponentsReady(request.scope,true);
    }
    const vaultSnapshotHash=await this.scopeSnapshotHash(request.scope,true);
    const queryText=[request.task.trim(),request.context?.trim()].filter(Boolean).join('\n');
    const recall=await this.recall({scope:request.scope,query:queryText});
    const canonicalSubjectMemory=recall.canonicalSubjectMemory;
    const openConflicts=await this.listOpenConflicts(request.scope);
    const blockingGuardrails=recall.hits.filter(h=>h.kind==='guardrail'&&h.state==='active'&&h.enforcement==='hard');
    const priorFailures=recall.hits.filter(h=>h.kind==='failure'); const relatedDecisions=recall.hits.filter(h=>h.kind==='decision');
    const blocking={blocked:blockingGuardrails.length>0,guardrailMemoryIds:blockingGuardrails.map(h=>h.memoryId),reasons:blockingGuardrails.map(h=>`${h.memoryId}:${h.revisionId}:${h.canonicalKey}`)};
    const contextId=randomUUID(),createdAt=Date.now();
    const result:MemoryPreflightResult={contextId,queryText,snapshotHash:digest({recallSnapshotHash:recall.snapshotHash,canonicalSubjectMemory:canonicalSubjectMemory.map(h=>[h.memoryId,h.revisionId,h.canonicalKey])}),recalled:recall.hits,canonicalSubjectMemory,blocking,blockingGuardrails,openConflicts:openConflicts.map(c=>({...c})),priorFailures,relatedDecisions,expiresAt:request.expiresAt};
    const context:FileNativeMemoryContextRecord={contextId,principalId:request.scope.principalId,projectId:project(this.paths,request.scope),routeContextId:request.routeContextId,queryText,queryHash:digest(queryText),resultJson:stableJson({...result,routeMetadata:request.routeMetadata??{}}),blockingJson:stableJson(blocking),createdAt,expiresAt:request.expiresAt};
    if(await this.scopeSnapshotHash(request.scope,true)!==vaultSnapshotHash)throw new MemoryHardLifecycleError('MEMORY_PREFLIGHT_REQUIRED','Vault changed during recall; retry preflight');
    context.vaultSnapshotHash=vaultSnapshotHash;
    await this.aux.put(C.contexts,contextId,context);
    const lifecycle:MemoryContextLifecycleRecord={contextId,principalId:request.scope.principalId,...(typeof request.routeMetadata?.authorityPrincipalId==='string'?{authorityPrincipalId:request.routeMetadata.authorityPrincipalId}:{}),projectId:project(this.paths,request.scope),routeContextId:request.routeContextId,objectiveHash:objectiveHash(request.task,request.context),postflightState:'OPEN',meaningfulWorkCount:0,createdAt,updatedAt:createdAt,expiresAt:request.expiresAt};
    await this.aux.put(C.lifecycles,contextId,lifecycle); return result;
  }
  async getContext(scope:MemoryScope,id:string):Promise<FileNativeMemoryContextRecord|null>{const r=await this.aux.get<FileNativeMemoryContextRecord>(C.contexts,id);return r&&scopeMatches(this.paths,r,scope)&&r.expiresAt>Date.now()?r:null;}
  async getLifecycleContext(scope:MemoryScope,id:string):Promise<MemoryContextLifecycleRecord|null>{const r=await this.aux.get<MemoryContextLifecycleRecord>(C.lifecycles,id);return r&&scopeMatches(this.paths,r,scope)?r:null;}
  async findLifecycleByRoute(input:{principalId:string;routeContextId:string;projectIds:readonly string[];authorityPrincipalId?:string}):Promise<MemoryContextLifecycleRecord|null>{
    const allowedProjects=new Set(input.projectIds.map(projectId=>project(this.paths,{principalId:input.principalId,projectId})));
    const matches=(await this.aux.list<MemoryContextLifecycleRecord>(C.lifecycles)).filter(r=>r.principalId===input.principalId&&r.routeContextId===input.routeContextId&&allowedProjects.has(r.projectId)&&(!input.authorityPrincipalId||(r.authorityPrincipalId??r.principalId)===input.authorityPrincipalId));
    if(matches.length>1)throw new MemoryHardLifecycleError('MEMORY_LIFECYCLE_CONFLICT','Persisted route has ambiguous lifecycle authority');
    return matches[0]??null;
  }
  async bindLifecycleTask(scope:MemoryScope,id:string,taskId:string){const r=await this.requireLifecycle(scope,id);r.continuityTaskId=taskId;r.updatedAt=Date.now();return this.aux.put(C.lifecycles,id,r);}
  async validateLifecycleContext(input:{scope:MemoryScope;contextId:string;routeContextId:string;now?:number}){
    const r=await this.requireLifecycle(input.scope,input.contextId),now=input.now??Date.now();
    if(r.routeContextId!==input.routeContextId||r.expiresAt<=now||r.postflightState==='CLOSED')throw new MemoryHardLifecycleError('MEMORY_PREFLIGHT_REQUIRED','A valid persisted memory preflight context is required for this actionable route');
    if(this.config.hardLifecycleMode==='enforce'){
      const pending=await this.findPendingLifecycle({scope:input.scope,excludeContextId:input.contextId});
      if(pending.length)throw new MemoryHardLifecycleError('MEMORY_POSTFLIGHT_REQUIRED','Other work in this project must be finalized before this context can perform substantive work',{pendingCount:pending.length});
      await this.assertComponentsReady(input.scope);
      const context=await this.getContext(input.scope,input.contextId);
      if(!context?.vaultSnapshotHash||context.vaultSnapshotHash!==await this.scopeSnapshotHash(input.scope))throw new MemoryHardLifecycleError('MEMORY_PREFLIGHT_REQUIRED','Memory changed after recall; refresh preflight before continuing');
    }
    return r;
  }
  async markLifecycleMeaningfulWork(input:{scope:MemoryScope;contextId:string;routeContextId:string;toolName:string;reasonCode:string;now?:number}){
    return this.withLifecycleQueue(input.scope,input.contextId,async()=>{
      const r=await this.requireLifecycle(input.scope,input.contextId),now=input.now??Date.now();
      if(r.routeContextId!==input.routeContextId)throw new MemoryHardLifecycleError('MEMORY_POSTFLIGHT_REQUIRED','Completed work must match its persisted lifecycle');
      // This records an already-authorized operation completing late; it never
      // grants permission to start another operation on a closed route.
      r.postflightState='POSTFLIGHT_PENDING';r.meaningfulWorkCount+=1;r.firstMeaningfulAt??=now;r.lastMeaningfulAt=now;r.lastToolName=input.toolName.slice(0,200);r.lastReasonCode=input.reasonCode.slice(0,200);r.updatedAt=now;
      delete r.closedAt;delete r.postflightAppliedAt;delete r.localDurableGeneration;delete r.localDurableHash;
      return this.aux.put(C.lifecycles,r.contextId,r);
    });
  }
  async findPendingLifecycle(input:{scope:MemoryScope;objectiveHash?:string;continuityTaskId?:string;excludeContextId?:string;includeClosedWithoutDurability?:boolean}){
    return (await this.aux.list<MemoryContextLifecycleRecord>(C.lifecycles)).filter(r=>scopeMatches(this.paths,r,input.scope)&&r.contextId!==input.excludeContextId&&(r.postflightState==='POSTFLIGHT_PENDING'||Boolean(input.includeClosedWithoutDurability&&r.postflightState==='CLOSED'&&!r.localDurableGeneration&&!r.localDurableHash))&&(!input.objectiveHash&&!input.continuityTaskId||Boolean((input.objectiveHash&&r.objectiveHash===input.objectiveHash)||(input.continuityTaskId&&r.continuityTaskId===input.continuityTaskId)))).sort((a,b)=>a.updatedAt-b.updatedAt||binary(a.contextId,b.contextId));
  }
  async prepareLifecycleClosure(input:{scope:MemoryScope;contextId:string;routeContextId:string;now?:number}){
    return this.withLifecycleQueue(input.scope,input.contextId,()=>this.prepareLifecycleClosureOnce(input));
  }
  private async prepareLifecycleClosureOnce(input:{scope:MemoryScope;contextId:string;routeContextId:string;now?:number}){
    const r=await this.requireLifecycle(input.scope,input.contextId);
    if(r.routeContextId!==input.routeContextId)throw new MemoryHardLifecycleError('MEMORY_LIFECYCLE_CONFLICT','Memory lifecycle route mismatch');
    if(r.postflightState==='CLOSED')return r;
    const now=input.now??Date.now();
    r.postflightState='POSTFLIGHT_PENDING';r.postflightAppliedAt=now;r.updatedAt=now;
    delete r.closedAt;delete r.localDurableGeneration;delete r.localDurableHash;
    await this.aux.put(C.lifecycles,r.contextId,r);
    const planned=(await this.aux.list<DurablePostflightDecision>(C.decisions)).filter(d=>scopeMatches(this.paths,{...d,projectId:d.projectId??''},input.scope)&&d.contextId===r.contextId&&d.routeContextId===r.routeContextId);
    if(planned.some(d=>d.coveredMeaningfulWorkCount!==undefined&&d.appliedAt===undefined))throw new MemoryHardLifecycleError('MEMORY_POSTFLIGHT_REQUIRED','A persisted memory plan is unfinished; retry its original finalization arguments',{mutationCommitted:true,postflightPlanPending:true});
    const decisions=planned.filter(d=>d.appliedAt!==undefined);
    if((this.config.hardLifecycleMode==='enforce'||decisions.some(d=>d.coveredMeaningfulWorkCount!==undefined))&&!decisions.some(d=>d.coveredMeaningfulWorkCount===r.meaningfulWorkCount))throw new MemoryHardLifecycleError('MEMORY_POSTFLIGHT_REQUIRED','A memory decision covering the latest completed work is required before closure',{mutationCommitted:true,coveredWorkPending:true});
    try {
      if(this.config.hardLifecycleMode==='enforce'){
        await this.checkVaultAccess();await this.scopeSnapshotHash(input.scope);await this.graphify.ensureFresh();
      }
      await this.requireDirectSync(input.scope);
      if(this.direct||this.config.hardLifecycleMode==='enforce')await this.checkDirectHealth(true);
    } catch(error) {
      throw new MemoryHardLifecycleError('MEMORY_POSTFLIGHT_REQUIRED','Memory was applied locally; retry finalization to complete synchronization',{
        mutationCommitted:true,syncPending:true,
        ...(error instanceof SupabaseDirectError?{causeCode:error.code}:{}),
      });
    }
    r.postflightState='CLOSED';r.closedAt=input.now??Date.now();r.updatedAt=r.closedAt;
    const closed=await this.aux.put(C.lifecycles,r.contextId,r);
    // The optional file mirror includes lifecycle records, unlike the direct
    // semantic projection, so it must carry the final closure receipt too.
    if(this.config.supabaseSecond.enabled){
      try{await this.syncScopeSecond(input.scope,true);}
      catch{
        r.postflightState='POSTFLIGHT_PENDING';delete r.closedAt;r.updatedAt=Date.now();
        await this.aux.put(C.lifecycles,r.contextId,r);
        throw new MemoryHardLifecycleError('MEMORY_POSTFLIGHT_REQUIRED','Memory was applied locally; retry finalization to synchronize its closure receipt',{mutationCommitted:true,syncPending:true});
      }
    }
    return closed;
  }
  async markLifecycleDurableClosure(input:{scope:MemoryScope;contextId:string;generationId:string;logicalStateHash:string;now?:number}){
    return this.withLifecycleQueue(input.scope,input.contextId,()=>this.markLifecycleDurableClosureOnce(input));
  }
  private async markLifecycleDurableClosureOnce(input:{scope:MemoryScope;contextId:string;generationId:string;logicalStateHash:string;now?:number}){
    const r=await this.requireLifecycle(input.scope,input.contextId);if(r.postflightState!=='CLOSED')throw new MemoryHardLifecycleError('MEMORY_POSTFLIGHT_REQUIRED','Local postflight must be closed before durability can be certified');
    r.localDurableGeneration=input.generationId;r.localDurableHash=input.logicalStateHash;r.updatedAt=input.now??Date.now();
    try{
      const saved=await this.aux.put(C.lifecycles,r.contextId,r);
      if(this.direct&&!this.config.supabaseSecond.enabled&&!input.generationId.startsWith('supabase-workflow-v1:')&&!input.generationId.startsWith('supabase-direct-v1:'))throw new SupabaseDirectError('MEMORY_SUPABASE_GENERATION_INVALID');
      if(this.direct&&!this.config.supabaseSecond.enabled&&await this.direct.hasWorkflowContracts(input.scope)&&!input.generationId.startsWith('supabase-workflow-v1:'))throw new SupabaseDirectError('WORKFLOW_SUPABASE_GENERATION_REQUIRED');
      await this.requireDirectSync(input.scope);
      if(this.direct||this.config.hardLifecycleMode==='enforce')await this.checkDirectHealth(true);
      if(this.config.supabaseSecond.enabled)await this.syncScopeSecond(input.scope,true);
      if(this.direct&&input.generationId.startsWith('supabase-workflow-v1:')){
        const verified=await this.direct.verifyWorkflowGeneration(input.scope);
        if(input.generationId!=='supabase-workflow-v1:'+verified.generationId||input.logicalStateHash!==verified.logicalStateHash)throw new SupabaseDirectError('WORKFLOW_SUPABASE_GENERATION_MISMATCH');
      }else if(this.direct&&input.generationId.startsWith('supabase-direct-v1:')){
        const verified=await this.direct.verifyMemoryDocuments(input.scope);
        if(input.generationId!=='supabase-direct-v1:'+verified||input.logicalStateHash!==verified)throw new SupabaseDirectError('MEMORY_SUPABASE_DOCUMENT_MISMATCH');
      }
      return saved;
    }catch(error){
      r.postflightState='POSTFLIGHT_PENDING';r.updatedAt=Date.now();delete r.closedAt;delete r.localDurableGeneration;delete r.localDurableHash;
      await this.aux.put(C.lifecycles,r.contextId,r);
      throw new MemoryHardLifecycleError('MEMORY_POSTFLIGHT_REQUIRED','The final closure receipt is not durably synchronized; retry finalization',{mutationCommitted:true,syncPending:true,causeCode:durabilityCause(error)});
    }
  }
  /** A full-vault second-memory restore already carries every durable closure receipt, so nothing is left to reconcile. */
  async reconcileLifecycleDurability(_scope:MemoryScope):Promise<{reconciled:number;generationId?:string;logicalStateHash?:string}>{return{reconciled:0};}

  async evaluatePostflight(request:MemoryPostflightRequest,identity?:{decisionId:string;coveredMeaningfulWorkCount?:number}):Promise<MemoryPostflightEvaluation>{
    if(!request.scope.principalId?.trim())throw new Error('MEMORY_SCOPE_REQUIRED');if(!request.routeContextId?.trim())throw new Error('MEMORY_POSTFLIGHT_ROUTE_REQUIRED');
    const proposed=request.proposedRelations??[];if(request.evidenceRefs.length>64||(request.relatedMemoryIds?.length??0)>32||proposed.length>32)throw new Error('MEMORY_POSTFLIGHT_REQUEST_TOO_LARGE');
    const candidate=postflightCandidate(request),reasons=new Set<MemoryWriteReasonCode>(request.reasonCodes),evidenceRefs=unique(request.evidenceRefs),existingIds=new Set<string>();
    const prior=identity?await this.getWriteDecision(request.scope,identity.decisionId):null;
    if(prior){
      if(prior.routeContextId!==request.routeContextId||prior.contextId!==request.contextId||prior.candidateHash!==candidate.hash)throw new MemoryHardLifecycleError('MEMORY_LIFECYCLE_CONFLICT','Persisted postflight decision does not match the retry');
      return{decisionRecord:prior,decision:prior.decisionType,targetMemoryId:prior.targetMemoryId,existingMemoryIds:prior.existingMemoryIds,reasonCodes:prior.reasonCodes,candidateHash:prior.candidateHash,semanticProfileHash:candidate.semanticProfileHash,advisory:true};
    }
    const snapshot=await this.repo.readSnapshot(); // every lookup below shares this one validation pass
    const exact=request.candidate&&candidate.canonicalKey?await this.repo.getMemoryByCanonicalKey(request.scope,candidate.canonicalKey,snapshot):null;if(exact&&exact.state!=='tombstoned')existingIds.add(exact.memoryId);
    const profileMatches:MemoryNodeMetadataRecord[]=[];
    if(!exact&&candidate.semanticProfileHash){
      const matching=(await this.aux.list<MemoryNodeMetadataRecord>(C.metadata)).filter(m=>m.semanticProfileHash===candidate.semanticProfileHash);
      const found=new Set((await this.repo.findEntries(request.scope,matching.map(m=>m.memoryId),snapshot)).filter(m=>m.entry.state!=='tombstoned').map(m=>m.entry.memoryId));
      for(const m of matching)if(found.has(m.memoryId)){profileMatches.push(m);existingIds.add(m.memoryId);}
    }
    const explicitIds=unique([...(request.relatedMemoryIds??[]),...(request.targetMemoryId?[request.targetMemoryId]:[]),...(request.branchParentMemoryId?[request.branchParentMemoryId]:[]),...(request.conflictWithMemoryId?[request.conflictWithMemoryId]:[]),...proposed.map(r=>r.targetMemoryId)]);if(explicitIds.length>32)throw new Error('MEMORY_POSTFLIGHT_REQUEST_TOO_LARGE');
    const explicitMatches=await this.repo.findEntries(request.scope,explicitIds,snapshot);
    if(explicitMatches.length!==explicitIds.length||explicitMatches.some(m=>m.entry.state==='tombstoned'))throw new Error('MEMORY_POSTFLIGHT_RELATED_NOT_FOUND');
    for(const id of explicitIds)existingIds.add(id);
    const explicitNoWrite=request.reasonCodes.some(reason=>BLOCKERS.has(reason));
    const changedCandidate=request.candidate&&(!exact||exact.valueHash!==normalizeMemoryValue(request.candidate.value).valueHash);
    if(changedCandidate&&!explicitNoWrite){
      if(!evidenceRefs.some(ref=>ref.trim()))throw new Error('MEMORY_POSTFLIGHT_EVIDENCE_REQUIRED');
      if(!exact&&!profileMatches.length&&!explicitIds.length&&!request.rootReason?.trim())throw new Error('MEMORY_POSTFLIGHT_ROOT_REASON_REQUIRED');
    }
    let decision:MemoryPersistenceDecisionType='NO_DURABLE_MEMORY',targetMemoryId:string|undefined;
    if(exact&&exact.state!=='tombstoned'&&request.candidate){
      targetMemoryId=exact.memoryId;reasons.add('DUPLICATE_CANONICAL');const value=normalizeMemoryValue(request.candidate.value);
      if(exact.kind!==request.candidate.kind)reasons.add('INSUFFICIENT_EVIDENCE');
      else if(exact.valueHash===value.valueHash){reasons.add('DUPLICATE_VALUE');if(reasons.has('SAME_BELIEF_NEW_EVIDENCE')&&evidenceRefs.length)decision='LINK_EXISTING';}
      else if(![...reasons].some(r=>BLOCKERS.has(r))&&MUTABLE_MEMORY_KINDS.includes(exact.kind as never)){decision='REVISE_EXISTING';reasons.add(deriveMutableChangeReason(exact.kind));}
      else reasons.add('INSUFFICIENT_EVIDENCE');
    } else if(profileMatches.length){targetMemoryId=profileMatches[0]!.memoryId;decision='LINK_EXISTING';reasons.add('RELATED_EXISTING_ONLY');}
    else if(request.candidate&&request.conflictWithMemoryId){
      targetMemoryId=request.conflictWithMemoryId;let valid=false;try{validatePostflightRelationPlan({decision:'OPEN_CONFLICT',candidatePresent:true,conflictWithMemoryId:request.conflictWithMemoryId,proposedRelations:proposed});valid=true;}catch{}
      if(reasons.has('CONFLICT_DETECTED')&&evidenceRefs.length&&request.conflictType?.trim()&&valid)decision='OPEN_CONFLICT';else reasons.add('INSUFFICIENT_EVIDENCE');
    } else if(request.candidate&&request.branchParentMemoryId){
      targetMemoryId=request.branchParentMemoryId;let valid=false;try{validatePostflightRelationPlan({decision:'WRITE_BRANCH',candidatePresent:true,branchParentMemoryId:request.branchParentMemoryId,proposedRelations:proposed});valid=true;}catch{}
      if(reasons.has('DISTINCT_BRANCH')&&evidenceRefs.length&&![...reasons].some(r=>BLOCKERS.has(r))&&valid)decision='WRITE_BRANCH';else reasons.add('INSUFFICIENT_EVIDENCE');
    } else if(request.candidate&&request.rootReason?.trim()&&reasons.has('FRESH_DURABLE_CONTEXT')&&evidenceRefs.length&&![...reasons].some(r=>BLOCKERS.has(r))&&explicitIds.length===0)decision='WRITE_NEW_ROOT';
    else {if(!evidenceRefs.length&&!reasons.has('TRANSIENT_OPERATION'))reasons.add('INSUFFICIENT_EVIDENCE');else if(reasons.size===0)reasons.add('NO_FUTURE_RELEVANCE');}
    if(identity&&request.contextId){
      // Pending authority precedes the durable plan: even an interruption at the
      // first plan write remains discoverable by project-level reconciliation.
      const lifecycle=await this.requireLifecycle(request.scope,request.contextId);
      lifecycle.postflightState='POSTFLIGHT_PENDING';lifecycle.updatedAt=Date.now();
      await this.aux.put(C.lifecycles,lifecycle.contextId,lifecycle);
    }
    const decisionRecord=await this.recordWriteDecision({scope:request.scope,routeContextId:request.routeContextId,continuityTaskId:request.continuityTaskId,contextId:request.contextId,decisionType:decision,candidateCanonicalKey:candidate.canonicalKey,candidateHash:candidate.hash,targetMemoryId,existingMemoryIds:unique([...existingIds]),reasonCodes:[...reasons].sort(),evidenceRefs,relationPlan:relationPlan(proposed),rootReason:decision==='WRITE_NEW_ROOT'?request.rootReason?.trim():undefined,...identity,...(decision==='REVISE_EXISTING'&&exact?{plannedRevisionId:exact.revisionId}:{})});
    return{decisionRecord,decision,targetMemoryId,existingMemoryIds:decisionRecord.existingMemoryIds,reasonCodes:decisionRecord.reasonCodes,candidateHash:candidate.hash,semanticProfileHash:candidate.semanticProfileHash,advisory:true};
  }

  async applyPostflight(request:MemoryPostflightRequest):Promise<MemoryPostflightApplyResult>{
    const identity={...request,scope:{principalId:request.scope.principalId,projectId:project(this.paths,request.scope)},
      reasonCodes:unique(request.reasonCodes),evidenceRefs:unique(request.evidenceRefs),relatedMemoryIds:unique(request.relatedMemoryIds??[]),
      proposedRelations:relationPlan(request.proposedRelations??[])};
    return this.withLifecycleQueue(request.scope,request.contextId??request.routeContextId,async()=>{
      const workCount=request.contextId?(await this.requireLifecycle(request.scope,request.contextId)).meaningfulWorkCount:undefined;
      const requestHash=digest(JSON.parse(JSON.stringify({...identity,coveredMeaningfulWorkCount:workCount})));
      return this.applyPostflightOnce(request,requestHash,workCount);
    });
  }
  async closeLifecycleDurably(input:{scope:MemoryScope;contextId:string;routeContextId:string;reason:MemoryDurabilityBoundaryReason}){
    return this.withLifecycleQueue(input.scope,input.contextId,async()=>{
      const existing=await this.requireLifecycle(input.scope,input.contextId);
      if(existing.routeContextId!==input.routeContextId)throw new MemoryHardLifecycleError('MEMORY_LIFECYCLE_CONFLICT','Memory lifecycle route mismatch');
      try{
        let lifecycle=await this.prepareLifecycleClosureOnce(input);
        const remoteDurability=await this.syncDurableBoundary(input.scope,input.reason);
        if(remoteDurability.required)lifecycle=await this.markLifecycleDurableClosureOnce({...input,generationId:remoteDurability.generationId,logicalStateHash:remoteDurability.logicalStateHash});
        return{lifecycle,remoteDurability};
      }catch(error){
        const lifecycle=await this.requireLifecycle(input.scope,input.contextId);
        lifecycle.postflightState='POSTFLIGHT_PENDING';lifecycle.updatedAt=Date.now();delete lifecycle.closedAt;delete lifecycle.localDurableGeneration;delete lifecycle.localDurableHash;
        await this.aux.put(C.lifecycles,lifecycle.contextId,lifecycle);
        if(error instanceof MemoryHardLifecycleError)throw error;
        throw new MemoryHardLifecycleError('MEMORY_POSTFLIGHT_REQUIRED','Checkpoint was recorded locally; retry the same checkpoint to finish durability',{mutationCommitted:true,syncPending:true,causeCode:durabilityCause(error)});
      }
    });
  }

  private async withLifecycleQueue<T>(scope:MemoryScope,contextKey:string,operation:()=>Promise<T>):Promise<T>{
    const queueKey=digest([this.paths.vaultRoot,{principalId:scope.principalId,projectId:project(this.paths,scope)},contextKey]);
    const prior=postflightQueues.get(queueKey)??Promise.resolve();
    const next=prior.catch(()=>undefined).then(operation);
    postflightQueues.set(queueKey,next);
    try{return await next;}finally{if(postflightQueues.get(queueKey)===next)postflightQueues.delete(queueKey);}
  }

  private async applyPostflightOnce(request:MemoryPostflightRequest,requestHash:string,workCount?:number):Promise<MemoryPostflightApplyResult>{
    const saved=await this.aux.get<MemoryPostflightApplyResult>('postflight-results',requestHash);
    if(saved)return this.finishPostflightSync(request.scope,saved);
    const lifecycle=request.contextId?await this.requireLifecycle(request.scope,request.contextId):undefined;
    if(lifecycle&&(lifecycle.routeContextId!==request.routeContextId||lifecycle.postflightState==='CLOSED'))throw new MemoryHardLifecycleError('MEMORY_LIFECYCLE_CONFLICT','A closed or mismatched lifecycle cannot accept a new postflight decision');
    const ev=await this.evaluatePostflight(request,{decisionId:decisionIdFor(requestHash),coveredMeaningfulWorkCount:workCount}),candidate=request.candidate;let memoryId=ev.targetMemoryId,revisionId:string|undefined,conflictId:string|undefined,createdEdges=0,semanticMutation=false;
    const priorResult=ev.decisionRecord.applyResult;
    if(ev.decisionRecord.appliedAt!==undefined&&priorResult?.status==='applied'){
      const result:MemoryPostflightApplyResult={...ev,advisory:false,applied:true,semanticMutation:priorResult.semanticMutation===true,createdEdges:Number(priorResult.createdEdges??0),
        ...(typeof priorResult.memoryId==='string'?{memoryId:priorResult.memoryId}:{}),...(typeof priorResult.revisionId==='string'?{revisionId:priorResult.revisionId}:{}),...(typeof priorResult.conflictId==='string'?{conflictId:priorResult.conflictId}:{})};
      await this.aux.put('postflight-results',requestHash,result);return this.finishPostflightSync(request.scope,result);
    }
    if(lifecycle){
      lifecycle.postflightState='POSTFLIGHT_PENDING';lifecycle.updatedAt=Date.now();
      await this.aux.put(C.lifecycles,lifecycle.contextId,lifecycle);
    }
    if(ev.decision==='REVISE_EXISTING'){
      const target=ev.targetMemoryId?await this.repo.getMemory(request.scope,ev.targetMemoryId):null;
      const plannedRevisionId=(ev.decisionRecord as DurablePostflightDecision).plannedRevisionId;
      if(target&&candidate&&plannedRevisionId&&target.revisionId!==plannedRevisionId&&target.valueHash!==normalizeMemoryValue(candidate.value).valueHash)throw new MemoryHardLifecycleError('MEMORY_LIFECYCLE_CONFLICT','Memory changed after the persisted revision plan; reconcile before retrying');
      if(!candidate||!ev.targetMemoryId)throw new Error('MEMORY_POSTFLIGHT_APPLY_INVALID');const r=await this.repo.revise({scope:request.scope,memoryId:ev.targetMemoryId,value:candidate.value,sourceType:candidate.sourceType??'memory_postflight',sourceRef:candidate.sourceRef??ev.decisionRecord.id,metadata:{...(candidate.metadata??{}),memoryPostflightDecisionId:ev.decisionRecord.id}});memoryId=r.memoryId;revisionId=r.revisionId;semanticMutation=true;await this.upsertDecisionMetadata(request.scope,r.memoryId,candidate,ev.decisionRecord.id,{});
    } else if(ev.decision==='LINK_EXISTING'){
      const source=request.targetMemoryId??ev.targetMemoryId;if(!source)throw new Error('MEMORY_POSTFLIGHT_APPLY_INVALID');memoryId=source;for(const rel of this.uniqueRelations(request.proposedRelations??[])){const r=await this.repo.addExplicitRelation({scope:request.scope,fromMemoryId:source,toMemoryId:rel.targetMemoryId,relation:rel.relation,reasonCode:'POSTFLIGHT_LINK_EXISTING'});createdEdges+=r.createdEdges;}semanticMutation=createdEdges>0;
    } else if(ev.decision==='WRITE_BRANCH'||ev.decision==='WRITE_NEW_ROOT'||ev.decision==='OPEN_CONFLICT'){
      if(!candidate)throw new Error('MEMORY_POSTFLIGHT_APPLY_INVALID');const relations=this.uniqueRelations(request.proposedRelations??[]);const committed=await this.repo.commit({scope:request.scope,canonicalKey:candidate.canonicalKey,kind:candidate.kind,value:candidate.value,importance:candidate.importance,pinned:candidate.pinned,enforcement:candidate.enforcement,sourceType:candidate.sourceType??'memory_postflight',sourceRef:candidate.sourceRef??ev.decisionRecord.id,metadata:{...(candidate.metadata??{}),...(candidate.title?{title:candidate.title}:{}),memoryPostflightDecisionId:ev.decisionRecord.id},explicitRelations:relations.map(r=>({targetMemoryId:r.targetMemoryId,relation:r.relation}))});memoryId=committed.memoryId;revisionId=committed.revisionId;semanticMutation=true;createdEdges=relations.reduce((n,r)=>n+(memoryRelationPolicy(r.relation).direction==='symmetric'?2:1),0);
      await this.upsertDecisionMetadata(request.scope,committed.memoryId,candidate,ev.decisionRecord.id,{noveltyClass:ev.decision==='WRITE_BRANCH'?'branch':ev.decision==='OPEN_CONFLICT'?'conflict':'root',rootReason:ev.decision==='WRITE_NEW_ROOT'?request.rootReason:undefined,branchParentMemoryId:ev.decision==='WRITE_BRANCH'?request.branchParentMemoryId:undefined});
      if(ev.decision==='OPEN_CONFLICT'){if(!request.conflictWithMemoryId||!request.conflictType)throw new Error('MEMORY_POSTFLIGHT_APPLY_INVALID');const c=await this.openConflict(request.scope,request.conflictWithMemoryId,committed.memoryId,request.conflictType,{decisionId:ev.decisionRecord.id,evidenceRefs:ev.decisionRecord.evidenceRefs,reasonCodes:ev.decisionRecord.reasonCodes},true);conflictId=c.conflictId;}
    }
    const applied=await this.markWriteDecisionApplied(request.scope,ev.decisionRecord.id,{status:'applied',decision:ev.decision,semanticMutation,memoryId,revisionId,conflictId,createdEdges});
    const result:MemoryPostflightApplyResult={decisionRecord:applied,decision:ev.decision,targetMemoryId:ev.targetMemoryId,existingMemoryIds:ev.existingMemoryIds,reasonCodes:ev.reasonCodes,candidateHash:ev.candidateHash,semanticProfileHash:ev.semanticProfileHash,advisory:false,applied:true,semanticMutation,memoryId,revisionId,conflictId,createdEdges};
    // Persist the result before derived work or network I/O can fail. A retry after
    // restart returns this decision and only repairs its graph/sync boundary.
    await this.aux.put('postflight-results',requestHash,result);
    return this.finishPostflightSync(request.scope,result);
  }

  private async finishPostflightSync(scope:MemoryScope,result:MemoryPostflightApplyResult):Promise<MemoryPostflightApplyResult>{
    if(!result.semanticMutation)return result;
    await this.refreshGraph();
    const supabaseSync=await this.syncAfterMutation(scope);
    return{...result,...(supabaseSync?{supabaseSync}:{})};
  }

  async recordWriteDecision(input:{scope:MemoryScope;routeContextId:string;continuityTaskId?:string;contextId?:string;decisionType:MemoryPersistenceDecisionType;candidateCanonicalKey?:string;candidateHash:string;targetMemoryId?:string;existingMemoryIds:string[];reasonCodes:MemoryWriteReasonCode[];evidenceRefs:string[];relationPlan:Array<Record<string,unknown>>;rootReason?:string;createdAt?:number;decisionId?:string;coveredMeaningfulWorkCount?:number;plannedRevisionId?:string}):Promise<MemoryWriteDecisionRecord>{
    const record:DurablePostflightDecision={id:input.decisionId??randomUUID(),principalId:input.scope.principalId,projectId:project(this.paths,input.scope),routeContextId:input.routeContextId,continuityTaskId:input.continuityTaskId,contextId:input.contextId,decisionType:input.decisionType,candidateCanonicalKey:input.candidateCanonicalKey,candidateHash:input.candidateHash,targetMemoryId:input.targetMemoryId,existingMemoryIds:unique(input.existingMemoryIds),reasonCodes:[...new Set(input.reasonCodes)].sort(),evidenceRefs:unique(input.evidenceRefs),relationPlan:input.relationPlan,rootReason:input.rootReason,createdAt:input.createdAt??Date.now(),...(input.coveredMeaningfulWorkCount!==undefined?{coveredMeaningfulWorkCount:input.coveredMeaningfulWorkCount}:{}),...(input.plannedRevisionId?{plannedRevisionId:input.plannedRevisionId}:{})};
    await this.aux.put(C.decisions,record.id,record);return record;
  }
  async markWriteDecisionApplied(scope:MemoryScope,id:string,result:Record<string,unknown>){const r=await this.getWriteDecision(scope,id);if(!r)throw new Error('MEMORY_WRITE_DECISION_NOT_FOUND');r.appliedAt=Date.now();r.applyResult=result;return this.aux.put(C.decisions,id,r);}
  async getWriteDecision(scope:MemoryScope,id:string){const r=await this.aux.get<MemoryWriteDecisionRecord>(C.decisions,id);return r&&r.principalId===scope.principalId&&(r.projectId??'')===project(this.paths,scope)?r:null;}
  async recordRecallExpansion(input:{scope:MemoryScope;contextId:string;sourceMemoryId:string;targetMemoryId:string;depth:number;relationPath:MemoryRelation[];reasonCode:string;score:number;createdAt?:number}){
    const r:MemoryRecallExpansionRecord={id:randomUUID(),principalId:input.scope.principalId,projectId:project(this.paths,input.scope),contextId:input.contextId,sourceMemoryId:input.sourceMemoryId,targetMemoryId:input.targetMemoryId,depth:input.depth,relationPath:input.relationPath,reasonCode:input.reasonCode,score:input.score,createdAt:input.createdAt??Date.now()};await this.aux.put(C.recall,r.id,r);return r;
  }
  async listRecallExpansions(scope:MemoryScope,contextId:string){return(await this.aux.list<MemoryRecallExpansionRecord>(C.recall)).filter(r=>r.principalId===scope.principalId&&(r.projectId??'')===project(this.paths,scope)&&r.contextId===contextId).sort((a,b)=>a.createdAt-b.createdAt||binary(a.id,b.id));}
  async upsertNodeMetadata(input:{scope:MemoryScope;memoryId:string;title?:string;rootReason?:string;noveltyClass?:string;createdFromDecisionId?:string;branchParentMemoryId?:string;semanticProfile?:MemorySemanticProfile;updatedAt?:number}){
    const current=await this.getNodeMetadata(input.scope,input.memoryId),semantic=input.semanticProfile?normalizeMemorySemanticProfile(input.semanticProfile):undefined;
    const r:MemoryNodeMetadataRecord={memoryId:input.memoryId,title:input.title??current?.title,rootReason:input.rootReason??current?.rootReason,noveltyClass:input.noveltyClass??current?.noveltyClass,createdFromDecisionId:input.createdFromDecisionId??current?.createdFromDecisionId,branchParentMemoryId:input.branchParentMemoryId??current?.branchParentMemoryId,semanticProfile:semantic?.profile??current?.semanticProfile,semanticProfileHash:semantic?.hash??current?.semanticProfileHash,updatedAt:input.updatedAt??Date.now()};
    await this.aux.put(C.metadata,input.memoryId,r);return r;
  }
  async getNodeMetadata(scope:MemoryScope,id:string){if(!await this.repo.getMemory(scope,id))return null;return this.aux.get<MemoryNodeMetadataRecord>(C.metadata,id);}
  async setRemoteState(input:{scope:MemoryScope;durabilityState:MemoryRemoteStateRecord['durabilityState'];hydrationState?:MemoryRemoteStateRecord['hydrationState'];remoteGeneration?:string;remoteHead?:string;logicalStateHash?:string;lastErrorCode?:string;updatedAt?:number}){
    const r:MemoryRemoteStateRecord={principalId:input.scope.principalId,projectId:project(this.paths,input.scope),durabilityState:input.durabilityState,hydrationState:input.hydrationState,remoteGeneration:input.remoteGeneration,remoteHead:input.remoteHead,logicalStateHash:input.logicalStateHash,lastErrorCode:input.lastErrorCode,updatedAt:input.updatedAt??Date.now()};await this.aux.put(C.remote,digest(`${input.scope.principalId}\0${project(this.paths,input.scope)}`),r);return r;
  }
  async getRemoteState(scope:MemoryScope){return this.aux.get<MemoryRemoteStateRecord>(C.remote,digest(`${scope.principalId}\0${project(this.paths,scope)}`));}
  async openConflict(scope:MemoryScope,leftMemoryId:string,rightMemoryId:string,conflictType:string,evidence:Record<string,unknown>,deferProjection=false){
    const snapshot=await this.repo.readSnapshot();if(!await this.repo.getMemory(scope,leftMemoryId,snapshot)||!await this.repo.getMemory(scope,rightMemoryId,snapshot))throw new Error('MEMORY_CONFLICT_MEMORY_NOT_FOUND');
    const conflictId=deferProjection&&typeof evidence.decisionId==='string'?decisionIdFor(digest(['postflight-conflict',scope.principalId,project(this.paths,scope),evidence.decisionId])):randomUUID();
    const prior=await this.aux.get<FileNativeConflictRecord>(C.conflicts,conflictId);
    if(prior&&(!scopeMatches(this.paths,prior,scope)||prior.leftMemoryId!==leftMemoryId||prior.rightMemoryId!==rightMemoryId||prior.status!=='open'))throw new MemoryHardLifecycleError('MEMORY_LIFECYCLE_CONFLICT','Persisted conflict changed after its postflight plan; reconcile before retrying');
    const r:FileNativeConflictRecord=prior??{conflictId,principalId:scope.principalId,projectId:project(this.paths,scope),leftMemoryId,rightMemoryId,conflictType:normalizeMemoryText(redactMemoryText(conflictType).text).canonical,status:'open',evidence,createdAt:Date.now()};
    if(!prior)await this.aux.put(C.conflicts,r.conflictId,r);
    // Neither branch wins: both canonical entries are marked conflicted until a human resolves them.
    for(const id of [leftMemoryId,rightMemoryId])await this.repo.setMemoryState(scope,id,'conflicted','memory.conflict_opened',{conflictId:r.conflictId,conflictType:r.conflictType});
    if(!deferProjection){await this.refreshGraph();await this.syncAfterMutation(scope);}return r;
  }
  async listOpenConflicts(scope:MemoryScope){return(await this.aux.list<FileNativeConflictRecord>(C.conflicts)).filter(c=>scopeMatches(this.paths,c,scope)&&c.status==='open').sort((a,b)=>a.createdAt-b.createdAt||binary(a.conflictId,b.conflictId));}

  async getWithProvenance(scope:MemoryScope,memoryId:string){
    const memory=await this.getMemory(scope,memoryId);if(!memory)return null;const revisions=await this.listRevisions(scope,memoryId);const ids=unique(revisions.map(r=>r.sourceEventId).filter((x):x is string=>Boolean(x)));return{memory,revisions,provenance:{events:await this.provenanceEvents(scope,ids)}};
  }
  async explain(scope:MemoryScope,memoryId:string,query?:string){
    const snapshot=await this.repo.readSnapshot();const found=await this.repo.findEntry(scope,memoryId,snapshot);if(!found)return null;const revisions=await this.repo.listRevisions(scope,memoryId,snapshot);const edges:Array<{fromMemoryId:string;toMemoryId:string;relation:string;weight:number;evidenceEventId?:string}>=[];
    for(const r of found.entry.relations)edges.push({fromMemoryId:memoryId,toMemoryId:r.targetMemoryId,relation:r.relation,weight:r.weight,...(r.evidenceEventId?{evidenceEventId:r.evidenceEventId}:{})});
    for(const segment of await this.repo.listSegments()){if(!segmentInScope(this.paths,segment,scope))continue;for(const entry of segment.entries){if(entry.memoryId===memoryId)continue;for(const r of entry.relations){if(r.targetMemoryId===memoryId)edges.push({fromMemoryId:entry.memoryId,toMemoryId:memoryId,relation:r.relation,weight:r.weight,...(r.evidenceEventId?{evidenceEventId:r.evidenceEventId}:{})});}}
    }
    edges.sort((a,b)=>binary(`${a.fromMemoryId}\0${a.toMemoryId}\0${a.relation}`,`${b.fromMemoryId}\0${b.toMemoryId}\0${b.relation}`));const eventIds=unique([...revisions.map(r=>r.sourceEventId).filter((x):x is string=>Boolean(x)),...edges.map(e=>e.evidenceEventId).filter((x):x is string=>Boolean(x))]);let queryExplanation:MemorySearchResult['hits'][number]|null=null;if(query?.trim()){const r=await this.search({scope,query,includeHistory:true,limit:Math.min(this.config.recallItemBudget,100)});queryExplanation=r.hits.find(h=>h.memoryId===memoryId)??null;}
    return{memoryId,revisions,anchors:(found.entry.anchors??[]).map(a=>({value:a.value,type:a.type})),edges,sourceEvents:await this.provenanceEvents(scope,eventIds),queryExplanation};
  }
  async export(scope:MemoryScope,limit=100){
    if(!Number.isInteger(limit)||limit<1||limit>1000)throw new Error('MEMORY_EXPORT_LIMIT_INVALID');const segments=(await this.repo.listSegments()).filter(s=>segmentInScope(this.paths,s,scope));const ordered=segments.flatMap(s=>s.entries).sort((a,b)=>b.updatedAt-a.updatedAt||binary(a.memoryId,b.memoryId));const selected=ordered.slice(0,limit);const items=[];const revisions:StoredMemoryRevision[]=[];const snapshot=await this.repo.readSnapshot();for(const entry of selected){const m=await this.repo.getMemory(scope,entry.memoryId,snapshot);if(m){items.push(m);revisions.push(...await this.repo.listRevisions(scope,entry.memoryId,snapshot));}}
    const events=(await this.provenanceEvents(scope)).slice(0,Math.min(5000,Math.max(limit,limit*10)));const conflicts=(await this.aux.list<FileNativeConflictRecord>(C.conflicts)).filter(c=>scopeMatches(this.paths,c,scope)).sort((a,b)=>a.createdAt-b.createdAt||binary(a.conflictId,b.conflictId)).slice(0,Math.min(limit,1000)).map(c=>({...c} as Record<string,unknown>));return{items,revisions,events,conflicts,truncated:ordered.length>limit};
  }
  async compact(_scope:MemoryScope,now=Date.now()){if(!Number.isFinite(now))throw new Error('Compaction time must be finite');return{archivedMemoryIds:[] as string[],cleanedEdges:0,integrity:'file-native:ok'};}
  async backup(reason='manual'){
    const safe=reason.trim().toLowerCase().replace(/[^a-z0-9._-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,80)||'backup';const createdAt=Date.now(),stamp=new Date(createdAt).toISOString().replace(/[:.]/g,'-'),target=path.join(this.paths.memoryRoot,'backups',`vault.${stamp}.${safe}`);await mkdir(path.dirname(target),{recursive:true});await cp(this.paths.vaultRoot,target,{recursive:true,errorOnExist:true,force:false});return{backupPath:target,createdAt,reason};
  }

  async rememberMore(request:MemoryRememberMoreRequest):Promise<MemoryRememberMoreResult>{
    if(!request.scope.principalId?.trim()||!request.contextId?.trim()||(!request.seedMemoryIds?.length&&!request.query?.trim()))throw new Error('MEMORY_REMEMBER_MORE_REQUEST_INVALID');
    if(request.seedMemoryIds.length>MEMORY_REMEMBER_MORE_LIMITS.seedMemoryIds||(request.query?.length??0)>20_000)throw new Error('MEMORY_REMEMBER_MORE_REQUEST_INVALID');
    if(!await this.getContext(request.scope,request.contextId))throw new Error('MEMORY_REMEMBER_MORE_CONTEXT_NOT_FOUND');
    const maxHops=this.bound(request.maxHops,MEMORY_REMEMBER_MORE_DEFAULTS.maxHops,MEMORY_REMEMBER_MORE_LIMITS.maxHops),maxItems=this.bound(request.maxItems,MEMORY_REMEMBER_MORE_DEFAULTS.maxItems,MEMORY_REMEMBER_MORE_LIMITS.maxItems),charBudget=this.bound(request.characterBudget,MEMORY_REMEMBER_MORE_DEFAULTS.characterBudget,MEMORY_REMEMBER_MORE_LIMITS.characterBudget);
    const seeds=unique(request.seedMemoryIds),queue=seeds.map(id=>({id,seed:id,depth:0,path:[id],relations:[] as MemoryRelation[]})),visited=new Set(seeds),candidates:MemoryRememberMoreEntry[]=[];
    const snapshot=await this.repo.readSnapshot(); // one validation pass for the whole expansion
    if(request.query?.trim()){
      const recall=await this.recall({scope:request.scope,query:request.query,limit:maxItems,characterBudget:charBudget});
      for(const hit of recall.hits){if(visited.has(hit.memoryId))continue;visited.add(hit.memoryId);candidates.push({...hit,sourceSeedMemoryId:hit.memoryId,depth:0,relationPath:[],memoryPath:[hit.memoryId],reasonCode:'query_context',score:hit.whyMatched.finalScore,historicalRevision:false,characterCount:hit.valueText.length});}
    }
    for(const seedId of seeds){
      const revisions=await this.listRevisions(request.scope,seedId),current=await this.getMemory(request.scope,seedId);if(!current||current.state==='tombstoned')throw new Error('MEMORY_REMEMBER_MORE_SEED_NOT_FOUND');
      for(const r of revisions.filter(x=>x.revisionId!==current.revisionId).reverse())candidates.push({memoryId:seedId,revisionId:r.revisionId,revisionNo:r.revisionNo,canonicalKey:current.canonicalKey,kind:current.kind,state:current.state,valueText:r.valueText,sourceSeedMemoryId:seedId,depth:1,relationPath:['supersedes'],memoryPath:[seedId],reasonCode:'revision_predecessor',score:1,historicalRevision:true,characterCount:r.valueText.length});
    }
    let traversed=0;const traversalCap=this.direct?Math.min(this.config.graphNodeCap,maxItems*8,64):this.config.graphNodeCap;
    while(queue.length&&traversed++<traversalCap){const current=queue.shift()!;if(current.depth>=maxHops)continue;const found=await this.repo.findEntry(request.scope,current.id,snapshot);const entry=found?.entry??(await this.direct?.get(request.scope,current.id))?.entry;if(!entry||entry.state==='tombstoned')continue;
      for(const rel of entry.relations.filter(r=>memoryRelationPolicy(r.relation).recursiveHistory)){if(visited.has(rel.targetMemoryId))continue;if(visited.size>=traversalCap)break;const target=await this.getMemory(request.scope,rel.targetMemoryId);if(!target||target.state==='tombstoned')continue;visited.add(target.memoryId);const depth=current.depth+1,relationPath=[...current.relations,rel.relation],memoryPath=[...current.path,target.memoryId],score=Number(Math.max(0,.95-.05*(depth-1)).toFixed(6));candidates.push({memoryId:target.memoryId,revisionId:target.revisionId,revisionNo:target.revisionNo,canonicalKey:target.canonicalKey,kind:target.kind,state:target.state,valueText:target.valueText,sourceSeedMemoryId:current.seed,depth,relationPath,memoryPath,reasonCode:relationReason(rel.relation),score,historicalRevision:false,characterCount:target.valueText.length});queue.push({id:target.memoryId,seed:current.seed,depth,path:memoryPath,relations:relationPath});}
    }
    candidates.sort((a,b)=>b.score-a.score||a.depth-b.depth||binary(a.memoryId,b.memoryId));const expansions:MemoryRememberMoreEntry[]=[];let used=0;
    for(const c of candidates){if(expansions.length>=maxItems)break;if(used+c.characterCount>charBudget)continue;used+=c.characterCount;expansions.push(c);await this.recordRecallExpansion({scope:request.scope,contextId:request.contextId,sourceMemoryId:c.sourceSeedMemoryId,targetMemoryId:c.memoryId,depth:c.depth,relationPath:c.relationPath,reasonCode:c.reasonCode,score:c.score});}
    const base={contextId:request.contextId,reason:request.reason,seedMemoryIds:seeds,expansions,characterBudgetConsumed:used,truncated:candidates.length>expansions.length||queue.length>0||visited.size>=traversalCap};return{...base,snapshotHash:digest(base)};
  }

  async beginContinuityTurn(scope:MemoryScope,routeContextId:string,task:string,_context:string|undefined,capture:ContinuityCapture={},expiresAt?:number):Promise<ContinuityBeginTurnResult>{
    if(!scope.principalId?.trim()||!routeContextId.trim()||!task.trim())throw new ContinuityStoreError('CONTINUITY_INPUT_INVALID','principalId, routeContextId and task are required');const safe=(v:string)=>normalizeMemoryText(redactMemoryText(v).text).canonical;const normalized=normalizeContinuityCapture(capture),now=Date.now();let record:ContinuityTaskRecord|null=null;
    if(normalized.resumeTaskId){record=await this.getContinuityTask(scope,normalized.resumeTaskId);if(!record)throw new ContinuityStoreError('CONTINUITY_TASK_NOT_FOUND','Continuity task was not found in this scope');if(['completed','cancelled'].includes(record.status))throw new ContinuityStoreError('CONTINUITY_TASK_TERMINAL','Continuity task already reached a terminal status');assertContinuityTransition(record.status,'running');record.status='running';record.updatedAt=now;await this.aux.put(C.tasks,record.taskId,record);}
    else {const id=randomUUID();record={taskId:id,principalId:scope.principalId,projectId:project(this.paths,scope),parentTaskId:normalized.parentTaskId,title:safe(normalized.objective??task).slice(0,5000),objective:safe(normalized.objective??task),acceptanceCriteria:(normalized.acceptanceCriteria??[]).map(safe),constraints:(normalized.constraints??[]).map(safe),status:'running',priority:0,blockers:[],createdAt:now,updatedAt:now};await this.aux.put(C.tasks,id,record);}
    if(normalized.resumeTaskId){
      for(const prior of await this.aux.list<ContinuityTurnRecord>(C.turns)){
        if(scopeMatches(this.paths,prior,scope)&&prior.taskId===record.taskId&&prior.state==='open'&&prior.routeContextId!==routeContextId){prior.state='interrupted';prior.closedAt=now;await this.aux.put(C.turns,prior.turnId,prior);}
      }
    }
    const turn:ContinuityTurnRecord={turnId:randomUUID(),taskId:record.taskId,principalId:scope.principalId,projectId:project(this.paths,scope),routeContextId,state:'open',createdAt:now,expiresAt};await this.aux.put(C.turns,turn.turnId,turn);return{turnId:turn.turnId,taskId:record.taskId};
  }
  async closeContinuityTurn(scope:MemoryScope,id:string,state:Exclude<ContinuityTurnState,'open'>){
    const r=await this.aux.get<ContinuityTurnRecord>(C.turns,id);if(!r||!scopeMatches(this.paths,r,scope))throw new ContinuityStoreError('CONTINUITY_TURN_NOT_FOUND','Continuity turn was not found in this scope');
    const task=await this.getContinuityTask(scope,r.taskId);
    if(state==='closed'&&task&&!isTerminalContinuityTaskStatus(task.status))throw new ContinuityStoreError('CONTINUITY_TASK_NOT_TERMINAL','Continuity turn cannot close cleanly while its task is unfinished');
    // Interrupting a route ends its turn; saved waiting and terminal task decisions remain authoritative.
    if(state==='interrupted'&&task&&task.status==='running'){task.status='interrupted';task.updatedAt=Date.now();await this.aux.put(C.tasks,task.taskId,task);}
    r.state=state;r.closedAt=Date.now();await this.aux.put(C.turns,id,r);
  }
  async getContinuityTask(scope:MemoryScope,id:string){const r=await this.aux.get<ContinuityTaskRecord>(C.tasks,id);return r&&r.principalId===scope.principalId&&(r.projectId??'')===project(this.paths,scope)?r:null;}
  async findContinuityTurnForRoute(input:{scope:MemoryScope;routeContextId:string;taskId:string}){
    const matches=(await this.aux.list<ContinuityTurnRecord>(C.turns)).filter(turn=>scopeMatches(this.paths,turn,input.scope)&&turn.routeContextId===input.routeContextId&&turn.taskId===input.taskId);
    if(matches.length>1)throw new MemoryHardLifecycleError('MEMORY_LIFECYCLE_CONFLICT','Persisted continuity route authority is ambiguous');
    return matches[0]??null;
  }
  async listContinuityFrontier(scope:MemoryScope,limit=5):Promise<ContinuityFrontierRecord[]>{
    if(!Number.isInteger(limit)||limit<1||limit>50)throw new ContinuityStoreError('CONTINUITY_LIMIT_INVALID','limit must be between 1 and 50');
    return(await this.aux.list<StoredFrontier>(C.frontier)).filter(f=>(f.principalId??scope.principalId)===scope.principalId&&(f.projectId??project(this.paths,scope))===project(this.paths,scope)&&['candidate','approved','deferred'].includes(f.status)).sort((a,b)=>b.priority-a.priority||a.createdAt-b.createdAt||(a.ordinal??0)-(b.ordinal??0)||binary(a.frontierId,b.frontierId)).slice(0,limit);
  }
  async reconcileContinuity(scope:MemoryScope,activeRouteContextIds:readonly string[]):Promise<ContinuityReconcileResult>{
    const active=new Set(activeRouteContextIds),turns=await this.aux.list<ContinuityTurnRecord>(C.turns),interruptedTurnIds:string[]=[],interruptedTaskIds:string[]=[];
    for(const r of turns.filter(t=>scopeMatches(this.paths,t,scope)&&t.state==='open'&&!active.has(t.routeContextId))){r.state='interrupted';r.closedAt=Date.now();await this.aux.put(C.turns,r.turnId,r);interruptedTurnIds.push(r.turnId);const task=await this.getContinuityTask(scope,r.taskId);if(task&&task.status==='running'){task.status='interrupted';task.updatedAt=Date.now();await this.aux.put(C.tasks,task.taskId,task);interruptedTaskIds.push(task.taskId);}}
    return{interruptedTurnIds,interruptedTaskIds};
  }
  async checkpointContinuity(scope:MemoryScope,taskId:string,turnId:string,input:ContinuityCheckpointInput,closure?:ContinuityCheckpointClosure):Promise<ContinuityCheckpointResult>{
    if(closure)return this.withLifecycleQueue(scope,closure.contextId,()=>this.checkpointContinuityClosure(scope,taskId,turnId,input,closure));
    const normalized=normalizeContinuityCheckpointInput(input),task=await this.getContinuityTask(scope,taskId),turn=await this.aux.get<ContinuityTurnRecord>(C.turns,turnId);if(!task||!turn||!scopeMatches(this.paths,turn,scope)||turn.taskId!==taskId||turn.state!=='open'||turn.routeContextId!==normalized.routeContextId)throw new ContinuityStoreError('CONTINUITY_CHECKPOINT_INVALID','Continuity checkpoint does not match an open turn in this scope');
    assertContinuityTransition(task.status,normalized.status);
    const now=Date.now(),checkpointId=randomUUID();task.status=normalized.status;task.updatedAt=now;task.blockers=normalized.blockers??[];if(['completed','failed','cancelled'].includes(task.status))task.completedAt=now;task.lastCheckpointId=checkpointId;await this.aux.put(C.tasks,taskId,task);
    const cp:ContinuityCheckpointRecord={checkpointId,principalId:scope.principalId,projectId:project(this.paths,scope),taskId,routeContextId:normalized.routeContextId,phase:normalized.status,input:normalized,stateHash:digest(normalized),createdAt:now};await this.aux.put(C.checkpoints,checkpointId,cp);
    let ordinal=0;for(const next of normalized.nextCandidates??[]){const f:StoredFrontier={ordinal:ordinal++,frontierId:randomUUID(),principalId:scope.principalId,projectId:project(this.paths,scope),sourceTaskId:taskId,title:next.title,rationale:next.rationale,status:'candidate' as FrontierStatus,dependencyTaskIds:next.dependsOnTaskIds??[],priority:next.priority??0,createdAt:now,updatedAt:now};await this.aux.put(C.frontier,f.frontierId,f);}
    return{checkpointId,taskStatus:task.status,snapshotHash:cp.stateHash};
  }
  private async checkpointContinuityClosure(scope:MemoryScope,taskId:string,turnId:string,input:ContinuityCheckpointInput,closure:ContinuityCheckpointClosure):Promise<ContinuityCheckpointResult>{
    const normalized=normalizeContinuityCheckpointInput(input),task=await this.getContinuityTask(scope,taskId),turn=await this.aux.get<ContinuityTurnRecord>(C.turns,turnId);
    const lifecycle=await this.getLifecycleContext(scope,closure.contextId);
    if(!task||!turn||!scopeMatches(this.paths,turn,scope)||turn.taskId!==taskId||turn.routeContextId!==normalized.routeContextId||!lifecycle||lifecycle.routeContextId!==normalized.routeContextId||lifecycle.continuityTaskId!==taskId)throw new ContinuityStoreError('CONTINUITY_CHECKPOINT_INVALID','Checkpoint closure does not match the persisted scoped context, task, and turn');
    const checkpointId=decisionIdFor(digest({scope:{...scope,projectId:project(this.paths,scope)},taskId,turnId,contextId:closure.contextId}));
    const requestHash=digest({input:normalized,memoryDecision:closure.memoryDecision??null});
    let cp=await this.aux.get<ContinuityCheckpointRecord>(C.checkpoints,checkpointId);
    if(cp){
      if(!scopeMatches(this.paths,cp,scope)||cp.contextId!==closure.contextId||cp.turnId!==turnId||cp.taskId!==taskId||cp.routeContextId!==normalized.routeContextId||cp.requestHash!==requestHash)throw new MemoryHardLifecycleError('MEMORY_LIFECYCLE_CONFLICT','Checkpoint retry must use the original context and arguments');
      if(task.lastCheckpointId!==cp.checkpointId&&task.lastCheckpointId!==cp.priorCheckpointId)throw new MemoryHardLifecycleError('MEMORY_LIFECYCLE_CONFLICT','A newer checkpoint already owns this task');
    }else{
      if(turn.state!=='open'||lifecycle.postflightState==='CLOSED')throw new ContinuityStoreError('CONTINUITY_CHECKPOINT_INVALID','A new checkpoint requires its original open turn and unfinished context');
      assertContinuityTransition(task.status,normalized.status);
      cp={checkpointId,principalId:scope.principalId,projectId:project(this.paths,scope),taskId,routeContextId:normalized.routeContextId,phase:normalized.status,input:normalized,stateHash:digest(normalized),createdAt:Date.now(),turnId,contextId:closure.contextId,requestHash,...(task.lastCheckpointId?{priorCheckpointId:task.lastCheckpointId}:{}),...(closure.memoryDecision?{memoryDecision:closure.memoryDecision}:{})};
      lifecycle.postflightState='POSTFLIGHT_PENDING';lifecycle.updatedAt=cp.createdAt;
      await this.aux.put(C.lifecycles,lifecycle.contextId,lifecycle);
      // Persist the exact closure intent first, so restart can finish this checkpoint without repeating the task.
      await this.aux.put(C.checkpoints,checkpointId,cp);
    }
    if(task.lastCheckpointId!==checkpointId){
      task.status=cp.phase;task.updatedAt=cp.createdAt;task.blockers=cp.input.blockers??[];if(isTerminalContinuityTaskStatus(task.status))task.completedAt=cp.createdAt;task.lastCheckpointId=checkpointId;
      await this.aux.put(C.tasks,taskId,task);
    }else if(task.status!==cp.phase)throw new MemoryHardLifecycleError('MEMORY_LIFECYCLE_CONFLICT','Checkpoint task state changed after closure began');
    for(const [ordinal,next] of (cp.input.nextCandidates??[]).entries()){
      const frontierId=decisionIdFor(digest({checkpointId,ordinal}));
      if(await this.aux.get(C.frontier,frontierId))continue;
      const f:StoredFrontier={ordinal,frontierId,principalId:scope.principalId,projectId:project(this.paths,scope),sourceTaskId:taskId,title:next.title,rationale:next.rationale,status:'candidate',dependencyTaskIds:next.dependsOnTaskIds??[],priority:next.priority??0,createdAt:cp.createdAt,updatedAt:cp.createdAt};await this.aux.put(C.frontier,frontierId,f);
    }
    return{checkpointId,taskStatus:cp.phase,snapshotHash:cp.stateHash};
  }
  async getContinuitySnapshot(scope:MemoryScope):Promise<ContinuitySnapshot>{
    const tasks=(await this.aux.list<ContinuityTaskRecord>(C.tasks)).filter(t=>t.principalId===scope.principalId&&(t.projectId??'')===project(this.paths,scope)),turns=(await this.aux.list<ContinuityTurnRecord>(C.turns)).filter(t=>scopeMatches(this.paths,t,scope));
    const by=(statuses:ContinuityTaskStatus[],limit:number,desc=false)=>tasks.filter(t=>statuses.includes(t.status)).sort((a,b)=>desc?b.updatedAt-a.updatedAt:a.updatedAt-b.updatedAt||binary(a.taskId,b.taskId)).slice(0,limit);
    const L=CONTINUITY_SNAPSHOT_LIMITS;
    const frontier=await this.listContinuityFrontier(scope,L.frontier),interruptedTurns:ContinuityInterruptedTurnRecord[]=turns.filter(t=>t.state==='interrupted').sort((a,b)=>(b.closedAt??b.createdAt)-(a.closedAt??a.createdAt)).slice(0,L.interrupted).map(t=>({turnId:t.turnId,taskId:t.taskId,routeContextId:t.routeContextId,createdAt:t.createdAt,closedAt:t.closedAt}));
    const payload={activeTasks:by(['running'],L.active),recentCompleted:by(['completed'],L.completed,true),blockedTasks:by(['blocked'],L.blocked),deferredTasks:by(['deferred'],L.deferred),unfinishedPlans:by(['planned','ready','failed','interrupted'],L.unfinished),frontier,interruptedTurns};
    // The snapshot is injected into agent context, so history is shed before current work.
    for(const key of ['recentCompleted','unfinishedPlans','interruptedTurns','blockedTasks','deferredTasks','frontier','activeTasks'] as const){
      while(JSON.stringify(payload).length>L.characterBudget&&payload[key].length>0)payload[key].pop();
    }
    const current=payload.activeTasks[0]??payload.blockedTasks[0]??payload.deferredTasks[0]??payload.unfinishedPlans[0],currentObjective=current?(current.objective??current.title).slice(0,2000):null;return{currentObjective,...payload,snapshotHash:digest({currentObjective,...payload})};
  }
  async promoteContinuityCheckpoint(_scope:MemoryScope,_taskId:string,_checkpointId:string,_input:ContinuityCheckpointInput):Promise<ContinuityPromotionResult>{return{decisions:0,artifacts:0,outcomes:0,constraints:0,failures:0,memoryIds:[],writeDecisionIds:[],noDurableMemoryDecisions:0};}

  async syncDurableBoundary(scope:MemoryScope,reason:MemoryDurabilityBoundaryReason):Promise<MemoryDurabilityBoundaryResult>{
    if(this.direct){await this.requireDirectSync(scope);await this.checkDirectHealth(true);}
    if(this.config.supabaseSecond.enabled){const synced=await this.syncScopeSecond(scope,true);if(!synced)throw new Error('MEMORY_SECOND_SYNC_FAILED');return{required:true,state:'REMOTE_SYNCED',reason,generationId:'supabase-file-v1:'+synced.rootHash,remoteHead:'supabase:'+this.config.supabaseSecond.mirrorId,logicalStateHash:synced.rootHash};}
    if(this.direct){
      if(await this.direct.hasWorkflowContracts(scope)){
        const workflow=await this.direct.syncWorkflow(scope);
        return{required:true,state:'REMOTE_SYNCED',reason,generationId:'supabase-workflow-v1:'+workflow.generationId,remoteHead:'supabase-direct',logicalStateHash:workflow.logicalStateHash};
      }
      const logicalStateHash=await this.direct.verifyMemoryDocuments(scope);
      return{required:true,state:'REMOTE_SYNCED',reason,generationId:'supabase-direct-v1:'+logicalStateHash,remoteHead:'supabase-direct',logicalStateHash};
    }
    if(!this.config.remote.enabled)return{required:false,state:'NOT_REQUIRED',reason};throw new Error('MEMORY_REMOTE_FILE_NATIVE_NOT_CONFIGURED');
  }
  async status(scope?:MemoryScope){
    await this.ensureReady();
    const scan=await this.repo.counts(scope); const {active,tombstones,edges}=scan;
    const graphify=await this.graphify.health();
    const supabaseDirect=await this.directStatus(scope);
    const malformed=scan.malformedFiles.length; const strict=this.config.hardLifecycleMode==='enforce';
    const healthy=malformed===0&&(!strict||graphify.healthy)&&(!supabaseDirect?!strict:supabaseDirect.healthy); const checked=Date.now();
    return{enabled:true,healthy,graphify,schemaVersion:1,vaultRoot:this.paths.vaultRoot,counts:{active_items:active,tombstones,total_items:active+tombstones,edges,vault_files:scan.segments,malformed_files:malformed,recovered_transactions:this.recoveredTransactions,...(!graphify.healthy?{graph_degraded:1}:{})},integrity:malformed?`file-native:recovery_required:${malformed}`:strict&&!supabaseDirect?'file-native:supabase_required':supabaseDirect&&!supabaseDirect.healthy?'file-native:degraded_supabase':(!graphify.healthy?'file-native:degraded_graph':'file-native:ok'),lastIntegrityCheckAt:checked,...(healthy?{lastSuccessfulIntegrityCheckAt:checked}:{}),...(supabaseDirect?{supabaseDirect}:{})};
  }
  async close():Promise<void>{await this.startupPromise?.catch(()=>undefined);await this.recoveryLease?.release();this.recoveryLease=undefined;this.startupPromise=undefined;}

  async assertWorkflowReady(scope:MemoryScope):Promise<void>{
    if(!this.direct)throw new SupabaseDirectError('MEMORY_SUPABASE_NOT_CONFIGURED');
    await this.direct.requireWorkflowHealth();
  }
  /** Persisted receipt status only; callers must not label this as a fresh remote verification. */
  async workflowClosureStatus(scope:MemoryScope,taskId:string,checkpointId:string):Promise<{state:'open'|'pending'|'synced';generationId?:string;logicalStateHash?:string}>{
    const rawTask=await this.aux.get(C.tasks,taskId);if(!rawTask)return{state:'open'};
    const task=validateWorkflowProjectionDocument('continuity-tasks',rawTask);
    if(task.principalId!==scope.principalId||String(task.projectId??'')!==project(this.paths,scope)||task.taskId!==taskId||task.lastCheckpointId!==checkpointId)return{state:'open'};
    const rawCheckpoint=await this.aux.get(C.checkpoints,checkpointId);if(!rawCheckpoint)return{state:'pending'};
    const checkpoint=validateWorkflowProjectionDocument('continuity-checkpoints',rawCheckpoint);
    if(checkpoint.principalId!==scope.principalId||String(checkpoint.projectId??'')!==project(this.paths,scope)||checkpoint.taskId!==taskId||checkpoint.checkpointId!==checkpointId)return{state:'pending'};
    if(typeof checkpoint.contextId!=='string')return{state:'pending'};
    const rawLifecycle=await this.aux.get(C.lifecycles,checkpoint.contextId);if(!rawLifecycle)return{state:'pending'};
    const lifecycle=validateWorkflowProjectionDocument('lifecycles',rawLifecycle);
    if(lifecycle.principalId!==scope.principalId||String(lifecycle.projectId??'')!==project(this.paths,scope)||lifecycle.continuityTaskId!==taskId||lifecycle.routeContextId!==checkpoint.routeContextId||lifecycle.contextId!==checkpoint.contextId)return{state:'pending'};
    return lifecycle.postflightState==='CLOSED'&&typeof lifecycle.localDurableGeneration==='string'&&typeof lifecycle.localDurableHash==='string'
      ?{state:'synced',generationId:lifecycle.localDurableGeneration,logicalStateHash:lifecycle.localDurableHash}:{state:'pending'};
  }

  private async provenanceEvents(scope:MemoryScope,eventIds?:readonly string[]){
    const wanted=eventIds?new Set(eventIds):null,records=new Map<string,any>();for(const r of await this.aux.list<any>(C.events)){const id=String(r.eventId??r.id??'');if(!id||r.principalId!==scope.principalId||String(r.projectId??'')!==project(this.paths,scope)||(wanted&&!wanted.has(id)))continue;records.set(id,{eventId:id,eventType:String(r.eventType??''),sourceType:String(r.sourceType??''),...(r.sourceRef?{sourceRef:String(r.sourceRef)}:{}),redactedText:String(r.redactedText??''),metadata:r.metadata&&typeof r.metadata==='object'?r.metadata:{},createdAt:Number(r.createdAt??0)});}
    const dir=path.join(this.paths.vaultRoot,'.agent-core','events');try{for(const name of (await readdir(dir)).filter(n=>n.endsWith('.json')).sort()){try{const r=JSON.parse(await readFile(path.join(dir,name),'utf8'));const id=String(r.eventId??'');if(!id||r.principalId!==scope.principalId||String(r.projectId??'')!==project(this.paths,scope)||(wanted&&!wanted.has(id)))continue;records.set(id,{eventId:id,eventType:String(r.eventType??''),sourceType:String(r.sourceType??''),...(r.sourceRef?{sourceRef:String(r.sourceRef)}:{}),redactedText:String(r.redactedText??''),metadata:r.metadata&&typeof r.metadata==='object'?r.metadata:{},createdAt:Number(r.createdAt??0)});}catch{}}}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
    return [...records.values()].sort((a,b)=>a.createdAt-b.createdAt||binary(a.eventId,b.eventId));
  }
  private async refreshGraph():Promise<void>{
    try{await this.graphify.update([]);}catch(error){if(this.config.hardLifecycleMode==='enforce')throw new MemoryHardLifecycleError('MEMORY_POSTFLIGHT_REQUIRED','Memory was written locally but Graphify could not be refreshed',{mutationCommitted:true,causeCode:error instanceof Error?error.message:'MEMORY_GRAPH_UNAVAILABLE'});}
  }

  private async scopeSnapshotHash(scope:MemoryScope,verifyContent=false):Promise<string>{
    const snapshot=await this.repo.readSnapshot({verifyContent});
    if(snapshot.malformedFiles.length)throw new MemoryHardLifecycleError('MEMORY_PREFLIGHT_REQUIRED','Vault contains unreadable memory segments',{causeCode:'MEMORY_VAULT_INVALID'});
    return digest(snapshot.spines.filter(s=>segmentInScope(this.paths,s,scope)).map(s=>[s.relativePath,s.contentHash]));
  }

  private async checkDirectHealth(force=false):Promise<void>{
    if(!this.direct)throw new SupabaseDirectError('MEMORY_SUPABASE_NOT_CONFIGURED');
    if(!force&&Date.now()-this.directHealthCheckedAt<5_000)return;
    try{await this.direct.health();this.directHealthCheckedAt=Date.now();}
    catch(error){this.directHealthCheckedAt=0;throw error;}
  }

  private async checkVaultAccess():Promise<void>{
    await access(this.paths.vaultRoot,constants.R_OK|constants.W_OK);
    if(Date.now()-this.vaultWriteCheckedAt<5_000)return;
    const probe=path.join(this.paths.vaultRoot,`.health-${randomUUID()}.tmp`);
    const handle=await open(probe,'wx');
    try{await handle.writeFile('vault-health');await handle.sync();}
    finally{await handle.close();await unlink(probe);}
    this.vaultWriteCheckedAt=Date.now();
  }

  private async assertComponentsReady(scope:MemoryScope,forceRemote=false):Promise<void>{
    try{
      await this.ensureReady();
      await this.checkVaultAccess();
      await this.scopeSnapshotHash(scope,forceRemote);
      await this.graphify.ensureFresh({verifyContent:forceRemote});
      await this.checkDirectHealth(forceRemote);
      if(await this.direct!.hasWorkflowContracts(scope)){await this.assertWorkflowReady(scope);await this.direct!.workflowSnapshot(scope);}
      if(await this.direct!.pending(scope)>0)throw new SupabaseDirectError('MEMORY_SUPABASE_SYNC_PENDING');
    }catch(error){throw new MemoryHardLifecycleError('MEMORY_PREFLIGHT_REQUIRED','Vault, Graphify, and Supabase must be healthy before substantive work',{causeCode:error instanceof SupabaseDirectError?error.code:error instanceof Error?error.message:'MEMORY_COMPONENT_UNAVAILABLE'});}
  }
  private async secondMemory():Promise<SupabaseSecondMemory|null>{
    if(!this.config.supabaseSecond.enabled)return null;
    this.secondPromise??=(async()=>{const c=this.config.supabaseSecond;if(!c.url||!c.publishableKey||!c.signingKeyFile||!c.encryptionKeyFile)throw new Error('MEMORY_SECOND_CONFIG_INCOMPLETE');const crypto=await MemoryRemoteCrypto.fromKeyFile(c.encryptionKeyFile);const transport=this.dependencies.fileSecondTransport??await SupabaseEd25519FileTransport.fromKeyFile({url:c.url,publishableKey:c.publishableKey,signingKeyFile:c.signingKeyFile,mirrorId:c.mirrorId,timeoutMs:c.timeoutMs});return new SupabaseSecondMemory(this.paths,crypto,transport,{mirrorId:c.mirrorId,retentionMs:c.retentionMs});})();
    return this.secondPromise;
  }
  async hydrateFromSecondMemory(scope:MemoryScope){
    if(this.recoveryLease||this.startupPromise)throw new Error('MEMORY_REMOTE_HYDRATION_REQUIRES_IDLE_SERVICE');
    const lease=await acquireMemoryRecoveryLease(this.paths,'recovery');
    try{
      const second=await this.secondMemory();
      if(second){await assertNoMemoryRecoveryPending(this.paths);const restored=await new VaultSecondMemoryCoordinator(this.paths,second).restore(scope);this.secondLastError=undefined;return{state:'SECOND_MEMORY_HYDRATED' as const,logicalStateHash:restored.logicalRootHash,fileCount:restored.fileCount,manifestVersionId:restored.manifestVersionId};}
      if(!this.direct)throw new Error('MEMORY_SECOND_DISABLED');
      const backup=await this.direct.readWorkflowBackup(scope);if(!backup)throw new Error('WORKFLOW_SUPABASE_GENERATION_MISSING');
      const restored=await restoreWorkflowBackup(this.paths,backup);
      // Recovery excludes process-local sync caches. Reestablish their CAS tokens
      // only after the restored bytes match the current remote generation. Equal
      // document/generation writes are idempotent and cannot replace newer state.
      const verified=await this.direct.verifyWorkflowGeneration(scope);
      if(verified.generationId!==backup.generation.generationId)throw new SupabaseDirectError('WORKFLOW_SUPABASE_GENERATION_CHANGED');
      const semantic=await this.direct.sync(scope);
      if(semantic.state!=='synced')throw new SupabaseDirectError(semantic.errorCode??'MEMORY_SUPABASE_SYNC_PENDING');
      const resumed=await this.direct.syncWorkflow(scope);
      if(resumed.generationId!==verified.generationId)throw new SupabaseDirectError('WORKFLOW_SUPABASE_GENERATION_CHANGED');
      return{state:'WORKFLOW_MEMORY_HYDRATED' as const,generationId:backup.generation.generationId,logicalStateHash:backup.generation.logicalStateHash,...restored};
    }finally{await lease.release();}
  }
  private async syncScopeSecond(scope:MemoryScope,strict:boolean):Promise<{rootHash:string;fileCount:number}|null>{
    const second=await this.secondMemory();if(!second)return null;
    try{const result=await new VaultSecondMemoryCoordinator(this.paths,second).sync(scope);this.secondLastError=undefined;return{rootHash:result.logicalRootHash,fileCount:result.fileCount};}catch(error){this.secondLastError=error instanceof Error?error.message:String(error);if(strict)throw error;return null;}
  }
  private async syncAfterMutation(scope:MemoryScope){
    const receipt=await this.syncDirectMemory(scope);
    if(this.config.supabaseSecond.enabled)await this.syncScopeSecond(scope,false);
    return receipt;
  }
  async syncDirectMemory(scope:MemoryScope){
    try{const receipt=await this.direct?.sync(scope);if(receipt?.state==='pending')this.directHealthCheckedAt=0;return receipt;}
    catch(error){this.directHealthCheckedAt=0;throw error;}
  }
  private async requireDirectSync(scope:MemoryScope){
    const receipt=await this.syncDirectMemory(scope);
    if(receipt?.state==='pending')throw new SupabaseDirectError(receipt.errorCode??'MEMORY_SUPABASE_SYNC_PENDING');
  }
  private async directStatus(scope?:MemoryScope):Promise<MemoryDirectStatus|undefined>{
    if(!this.direct)return undefined;
    let pendingItems=-1;
    try{pendingItems=await this.direct.pending(scope);await this.checkDirectHealth();return{enabled:true,healthy:pendingItems===0,checkedAt:Date.now(),pendingItems,...(pendingItems?{errorCode:'MEMORY_SUPABASE_SYNC_PENDING'}:{})};}
    catch(error){return{enabled:true,healthy:false,checkedAt:Date.now(),pendingItems,errorCode:error instanceof SupabaseDirectError?error.code:'MEMORY_SUPABASE_STATUS_FAILED'};}
  }
  private async recall(request:MemorySearchRequest){
    const local=await this.retriever.search(request);
    if(!this.direct)return local;
    await this.requireDirectSync(request.scope);
    const itemBudget=Math.min(request.limit??this.config.recallItemBudget,this.config.recallItemBudget,100);
    const remote=await this.direct.search(request.scope,request.query,itemBudget);
    const probes=buildRecallProbes(request.query),hits=new Map<string,MemorySearchHit>(local.hits.map(h=>[h.memoryId,{...h,source:'vault'}]));
    const subjects=new Map(local.canonicalSubjectMemory.map(h=>[h.memoryId,h]));
    for(const doc of remote){
      // A canonical local tombstone or revision always wins over its remote projection.
      if(await this.repo.getMemory(request.scope,doc.entry.memoryId))continue;
      const {relations:_,anchors:__,valueHash:___,title:____,...entry}=doc.entry;
      const hit:MemorySearchHit={...entry,source:'supabase',whyMatched:explanation(this.config.scoreWeights,doc.entry,probes,0)};
      hits.set(hit.memoryId,hit);if(canonicalSubject(doc.entry,request.query))subjects.set(hit.memoryId,hit);
    }
    let used=0;const budget=Math.min(request.characterBudget??this.config.recallCharacterBudget,this.config.recallCharacterBudget),selected:MemorySearchHit[]=[];
    for(const hit of [...hits.values()].sort((a,b)=>b.whyMatched.finalScore-a.whyMatched.finalScore||binary(a.memoryId,b.memoryId))){
      if(selected.length>=itemBudget||used>=budget)break;const valueText=hit.valueText.slice(0,budget-used);used+=valueText.length;selected.push({...hit,valueText});
    }
    let subjectCharacters=0;
    const canonicalSubjectMemory=[...subjects.values()].slice(0,8).map(h=>{const valueText=h.valueText.slice(0,Math.max(0,6000-subjectCharacters));subjectCharacters+=valueText.length;return{...h,valueText};}).filter(h=>h.valueText);
    return{...local,hits:selected,canonicalSubjectMemory,snapshotHash:digest(selected.map(h=>[h.memoryId,h.revisionId,h.whyMatched.finalScore]))};
  }
  private async requireLifecycle(scope:MemoryScope,id:string){const r=await this.getLifecycleContext(scope,id);if(!r)throw new MemoryHardLifecycleError('MEMORY_PREFLIGHT_REQUIRED','Memory lifecycle context was not found');return r;}
  private bound(value:number|undefined,fallback:number,max:number){const v=value??fallback;if(!Number.isSafeInteger(v)||v<1||v>max)throw new Error('MEMORY_REMEMBER_MORE_REQUEST_INVALID');return v;}
  private uniqueRelations(relations:readonly MemoryPostflightRelationProposal[]){const seen=new Set<string>(),out:MemoryPostflightRelationProposal[]=[];for(const r of [...relations].sort((a,b)=>binary(`${a.relation}\0${a.targetMemoryId}`,`${b.relation}\0${b.targetMemoryId}`))){const k=`${r.relation}\0${r.targetMemoryId}`;if(seen.has(k))continue;seen.add(k);out.push({targetMemoryId:r.targetMemoryId,relation:r.relation,evidenceRefs:unique(r.evidenceRefs)});}return out;}
  private async upsertDecisionMetadata(scope:MemoryScope,id:string,candidate:NonNullable<MemoryPostflightRequest['candidate']>,decisionId:string,o:{noveltyClass?:string;rootReason?:string;branchParentMemoryId?:string}){const current=await this.getNodeMetadata(scope,id);await this.upsertNodeMetadata({scope,memoryId:id,title:candidate.title??current?.title,rootReason:o.rootReason??current?.rootReason,noveltyClass:o.noveltyClass??current?.noveltyClass,createdFromDecisionId:decisionId,branchParentMemoryId:o.branchParentMemoryId??current?.branchParentMemoryId,semanticProfile:candidate.semanticProfile??current?.semanticProfile});}
}

// File-native read/export helpers are attached outside the class body through a focused subclass-style interface below.




