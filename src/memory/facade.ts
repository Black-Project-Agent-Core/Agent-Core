export { MemoryService } from './service.js';
export type {
  MemoryServiceOptions,
  MemorySearchHostContext,
  ControllerRetrievalPolicy,
  RememberInput,
  UpdateInput,
  MemoryBatchOperation,
  MemoryBatchResult,
  MemoryLinkInput,
  EvolutionResult,
  EvolutionPreviewResult,
} from './service.js';

export {
  CloudflareWorkersAIEmbedder,
  cosineSimilarity,
} from './embedder.js';
export type {
  MemoryEmbedder,
  MemoryEmbedderIdentity,
  CloudflareEmbedderConfig,
} from './embedder.js';

export { initializeMemoryRoot } from './initialize.js';
export type { MemoryRootOptions } from './initialize.js';

export { resolveMemoryPaths, notePath } from './paths.js';
export type { MemoryPaths } from './paths.js';
export * from './types.js';
export type {
  MemorySearchOptions,
  MemorySearchResult,
} from './retrieval.js';
export {
  buildMemoryTransferPayload,
  planMemoryImport,
} from './transfer.js';

export { ControllerMemorySession } from './controller-session.js';
export { MemoryControllerError } from './disclosure.js';
export type {
  Digest, IsoInstant, SourceRef, Verification, RetentionTier, EpistemicType, TemporalClass,
  DisclosureView, ControllerScope, ControllerMemoryCapabilities, ReadBudget, BudgetMetrics, Budgeted,
  RecallInput, MemoryHit, RecallPage, ExpandInput, ExpansionPage, MemoryControllerErrorCode,
} from './disclosure.js';

export type { RecordExperience, RecordKind, TimeValue, Validity } from './experience-types.js';

export type { WorkingItem, WorkingStateChange, EpisodeEventKind, EpisodeEvent, EpisodeHeader,
  StartEpisodeInput, AppendEventInput, EpisodeAppendResult, EpisodeStatusInput, CaptureEvidenceInput,
  ArtifactAvailability, ArtifactReceipt, TaskContext, CheckpointTrigger, CheckpointInput, TaskCapsule,TemporalAssertion } from './experience-types.js';

export type {ConsolidationInput,ApplyConsolidationInput,ConsolidationProposal,ConsolidationPlan,PromotionReceipt,ConsolidationPolicy,ConsolidationReview} from './promotion.js';

export type {RetentionInput,RetentionReceipt} from './experience-types.js';

export {createControllerMemoryDispatcher,CONTROLLER_MEMORY_NOTICE} from './controller-protocol.js';
export type {ControllerMemoryDispatcher,ControllerMemoryMethod,ControllerMemoryInput,ControllerMemoryResult,ControllerMemoryResponse} from './controller-protocol.js';
export {MEMORY_TRANSFER_V2_VERSION,exportMemoryTransferV2,previewMemoryTransferV2,importMemoryTransferV2} from './transfer.js';
export type {MemoryTransferV2Policy,MemoryTransferV2ExportOptions,MemoryTransferV2Bundle,MemoryTransferV2Preview,MemoryTransferV2Receipt} from './transfer.js';
export {assessMemoryRelevance,validateRelevancePolicy} from './relevance.js';
export type {RelevancePolicy,RelevanceInput,RelevanceDecision} from './relevance.js';

export {encodeIntention,decodeIntention,evaluateIntentions,intentionUpsert,INTENTION_PREFIX} from './prospective-intentions.js';
export type {ProspectiveIntention,IntentionObservation,IntentionEvaluation} from './prospective-intentions.js';
export type {ContinuityAssessment,IngestionBinding,IngestionCursor} from './experience-types.js';
export {assessTaskContinuity} from './controller-session.js';
export {encodeProjectSynthesis,decodeProjectSynthesis,buildProjectSynthesisAction,projectSynthesisRefs,checkProjectSynthesisDependencies} from './project-synthesis.js';
export type {ProjectSynthesis,SynthesisEligibilitySummary,SynthesisEligibilityReason} from './project-synthesis.js';
export type {KnowledgeInterval,KnownHistoryCoverage,HistoricalMemorySnapshot} from './revisions.js';
export {claimReviewContractSchema,claimReviewReadSchema,claimReviewWriteSchema,externalClaimReviewGuide} from './claim-review.js';
export type {ClaimReviewContract,ClaimReviewRead,ClaimReviewWrite} from './claim-review.js';
