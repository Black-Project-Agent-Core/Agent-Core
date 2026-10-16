import { curationCandidateId, curationCandidates, curationEntryFingerprint } from './curation-delta.js';
import { updateDecisionReview, reviewDecisions, type DecisionRequest } from './decision-review.js';
import { evaluateDecisionCalibration } from './decision-calibration.js';
import { improvementHandoff } from './improvement-handoff.js';
import { memorySemanticRevision } from '../memory/disclosure.js';
import { createLearningDecision } from './decision-evidence.js';
import type { CurationBinding, CurationDelta } from './types.js';
import type { CodeIntelligenceService } from '../code-intelligence/service.js';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { procedureFingerprint, procedureContractDigest, assertProcedureCompatible, type AgentProcedureCandidate } from '../agent-learning-loop.js';
import { assertLearningTextSafe } from '../memory/safety.js';
import type { SkillService } from '../skills/service.js';
import { SkillProposalCoordinator } from './skill-proposals.js';
import { buildSelfAwarenessView, type SelfAwarenessQuestion } from './self-awareness.js';
import { explainImprovement } from './improvement-explanation.js';
import { recordSkillOutcome, reviewSkillOutcomes, type SkillOutcomeInput } from './skill-outcome-review.js';
import { recordUserSkillDecision, decideSkillProposal, applyUserSkillCommand, isUserSkillCommand, type SkillDecisionInput } from './skill-proposal-decisions.js';
import { pendingSkillNotices, recordSkillNoticeDelivery } from './skill-proposal-notification.js';
import type { SkillProposalInput, SkillNoticeScope, SkillNoticeDeliveryInput } from './skill-proposal-types.js';
import { recheckWorkflowReport, registerWorkflowVerification, type WorkflowVerificationManifest } from '../memory/workflow-verifier.js';
import type { MemoryService } from '../memory/service.js';
import type { MemoryUseReceiptInput } from '../memory/retrieval-ledger.js';
import { activityTracker } from '../tracker/activity-tracker.js';
import { CodePatternLearningSink } from './code-pattern-sink.js';
import { LearningCurator } from './curator.js';
import { LearningJourneyBuilder } from './journey.js';
import { MemoryLearningSink } from '../memory/learning-sink.js';
import { resolveLearningPaths } from './paths.js';
import { LearningReviewCoordinator } from './review.js';
import { summarizeLearningReview } from './review-summary.js';
import { recordLearningDecisions } from './decision-evidence.js';
import { safeEvidenceRefSchema } from './evaluation.js';
import { resolveBrowserObservationUse } from './workflow-evidence.js';
import { validBrowserReceipt } from '../rdc/browser-control/procedure-context.js';
import type { LearningReviewSummary } from './types.js';
import { LearningSinkManager } from './sink-manager.js';
import { LearningStateStore } from './state.js';
import { applyCheckpoint, isCuratorDue, markCurated, markReviewed } from './triggers.js';
import type {
  LearningCandidate,
  LearningCheckpointInput,
  LearningConfig,
  LearningCuratorProposal,
  LearningHealth,
  LearningJourney,
  LearningReviewOutcome,
  LearningState,
  LearningRejectionFingerprint,
  LearningReviewOptions,
} from './types.js';

const REJECTION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_REJECTION_HISTORY = 128;

function checkpointEvidence(refs: string[] | undefined): { refs: string[]; dropped: number } {
  const input = [...new Set((refs ?? []).map((value) => value.trim()).filter(Boolean))].slice(0, 32);
  const safe: string[] = [];
  for (const ref of input) {
    if (safeEvidenceRefSchema().safeParse(ref).success) safe.push(ref);
  }
  return { refs: safe, dropped: input.length - safe.length };
}

function liveRejections(state: LearningState, now = Date.now()): LearningRejectionFingerprint[] {
  const cutoff = now - REJECTION_TTL_MS;
  const recent = Array.isArray(state.recentRejections) ? state.recentRejections : [];
  return recent.filter((item) => Number.isFinite(Date.parse(item.at)) && Date.parse(item.at) >= cutoff);
}

function rejectionKey(item: Pick<LearningRejectionFingerprint, 'fingerprint' | 'evidenceDigest' | 'workspaceKey'>): string {
  return `${item.workspaceKey}\u0000${item.fingerprint}\u0000${item.evidenceDigest}`;
}

export function applyPriorRejectionAdvisory(outcomes: LearningReviewOutcome[], state: LearningState): void {
  const prior = new Map(liveRejections(state).map((item) => [rejectionKey(item), item]));
  for (const outcome of outcomes) {
    if ((outcome.status !== 'proposal' && outcome.status !== 'rejected') || !outcome.decision) continue;
    const match = prior.get(rejectionKey(outcome.decision));
    if (!match) continue;
    const suffix = `prior identical ${match.status} at ${match.at} (${match.reasonCode}); evidence unchanged`;
    outcome.reason = outcome.reason ? `${outcome.reason}; ${suffix}` : suffix;
  }
}

export function withRejectionHistory(state: LearningState, outcomes: LearningReviewOutcome[], now = new Date()): LearningState {
  const retained = liveRejections(state, now.getTime());
  const byKey = new Map(retained.map((item) => [rejectionKey(item), item]));
  for (const outcome of outcomes) {
    if ((outcome.status !== 'proposal' && outcome.status !== 'rejected') || !outcome.decision) continue;
    const item: LearningRejectionFingerprint = {
      fingerprint: outcome.decision.fingerprint,
      evidenceDigest: outcome.decision.evidenceDigest,
      workspaceKey: outcome.decision.workspaceKey,
      status: outcome.status,
      reasonCode: String(outcome.reasonCode ?? outcome.status).slice(0, 120),
      at: now.toISOString(),
    };
    byKey.set(rejectionKey(item), item);
  }
  return { ...state, recentRejections: [...byKey.values()].sort((a, b) => a.at.localeCompare(b.at)).slice(-MAX_REJECTION_HISTORY) };
}

export class LearningService {
  async decisionReview(binding: { taskId: string; workspace: string }, request: DecisionRequest, access = { readFiles: false }) {
    const workspace = this.memory.registeredWorkspaceIdentity(binding.workspace).name;
    const records = await updateDecisionReview(this.stateStore, { taskId: binding.taskId, workspace }, request, access);
    return { records, ...await reviewDecisions(records, request.operation === 'inspect' ? request.salience : undefined, access),
      ...(request.operation === 'inspect' ? { calibration: await evaluateDecisionCalibration(records, access) } : {}) };
  }
  /** Trusted host/harness setup only; deliberately absent from the controller tool contract. */
  async registerVerificationManifest(manifest: WorkflowVerificationManifest): Promise<void> {
    await this.stateStore.mutate('verification', state => {
      const previous = state.verificationManifests?.find(item => item.taskId === manifest.taskId);
      if (previous && JSON.stringify(previous) !== JSON.stringify(manifest)) throw new Error('WORKFLOW_MANIFEST_CONFLICT');
      return { state: { ...state, verificationManifests: [...(state.verificationManifests ?? []).filter(item => item.taskId !== manifest.taskId), manifest] }, result: null };
    });
    registerWorkflowVerification(manifest);
  }
  private skills?: SkillService;
  private proposalCoordinator?: SkillProposalCoordinator;
  attachSkills(skills: SkillService | undefined) {
    if (!skills) return;
    this.skills = skills;
    this.proposalCoordinator = new SkillProposalCoordinator(this.stateStore, skills, value => this.memory.registeredWorkspaceIdentity(value));
  }
  private requireProposals(): SkillProposalCoordinator {
    if (!this.proposalCoordinator) throw new Error('SKILL_PROPOSALS_UNAVAILABLE');
    return this.proposalCoordinator;
  }
  hasSkillProposals(): boolean { return Boolean(this.proposalCoordinator); }
  async upsertSkillProposal(input: SkillProposalInput) { return this.requireProposals().upsert(input); }
  async selfAwareness(workspace: string, questionType: SelfAwarenessQuestion = 'capabilities') {
    return buildSelfAwarenessView({ workspace, questionType, memory: this.memory, proposals: this.requireProposals(), learningHealth: () => this.health() });
  }
  async explainImprovement(input: { workspace: string; proposalId?: string; skillName?: string; revisionDigest?: string }) {
    return explainImprovement(this.requireProposals(), input);
  }
  async recordSkillOutcome(input: SkillOutcomeInput) {
    const coordinator = this.requireProposals(), workspace = this.memory.resolveWorkspace(input.workspace);
    const recorded = await recordSkillOutcome(coordinator, { ...input, workspace });
    // A verified negative use must surface a review proposal in this task, not wait for a scheduler.
    if (input.outcome === 'failure') {
      try { return { ...recorded, review: await reviewSkillOutcomes(coordinator, workspace) }; }
      catch (error) {
        activityTracker.captureFailure('LEARNING', error, 'skill-outcome-review-unavailable');
        return { ...recorded, reviewStatus: 'unavailable' as const };
      }
    }
    return recorded;
  }
  async reviewSkillOutcomes(workspace: string) { return reviewSkillOutcomes(this.requireProposals(), this.memory.resolveWorkspace(workspace)); }
  async skillProposals(workspace = 'agent-core') { return this.requireProposals().list(workspace); }
  async reconcileSkillProposals(workspace = 'agent-core') {
    return this.requireProposals().reconcileActiveArtifacts(this.memory.resolveWorkspace(workspace));
  }
  /** Host-only entry; called only after the actual user message is persisted. */
  async recordUserSkillDecision(input: SkillDecisionInput) { return recordUserSkillDecision(this.requireProposals(), input); }
  async decideSkillProposal(input: SkillDecisionInput) { return decideSkillProposal(this.requireProposals(), input); }
  async applyUserSkillCommand(input: { workspace: string; sessionId: string; taskId: string; userEvidenceRef: string; prompt: string }) {
    if (!isUserSkillCommand(input.prompt)) return null;
    // Ordinary language must not depend on an optional Skill owner.
    if (!this.proposalCoordinator && !/^\/skill\s/i.test(input.prompt.trim())) return null;
    return applyUserSkillCommand(this.requireProposals(), input);
  }
  async pendingSkillNotices(scope: SkillNoticeScope) {
    return this.proposalCoordinator ? pendingSkillNotices(this.proposalCoordinator, scope) : [];
  }
  async recordSkillNoticeDelivery(input: SkillNoticeDeliveryInput) {
    return recordSkillNoticeDelivery(this.requireProposals(), input);
  }

  async procedures(workspace?: string, allWorkspaces = false): Promise<AgentProcedureCandidate[]> {
    const scope = workspace ? this.memory.resolveWorkspace(workspace) : undefined;
    return (await this.stateStore.load()).procedures?.filter(item => allWorkspaces || item.workspace === scope) ?? [];
  }

  async migrateProcedures(records: AgentProcedureCandidate[], origin: 'native' | 'external') {
    if (!records.length) return;
    const migrated = await this.stateStore.mutate('procedures', state => {
      const procedures = [...(state.procedures ?? [])];
      const conflicts: Array<{ fingerprint: string; reason: string }> = [];
      for (const raw of records) {
        const workspace = raw.workspace ? this.memory.resolveWorkspace(raw.workspace) : undefined;
        const source = origin + ':' + raw.fingerprint + ':' + (workspace ?? 'unknown');
        let item = procedures.find(value => value.fingerprint === raw.fingerprint && value.workspace === workspace);
        if (item) {
          try { assertProcedureCompatible(item, { ...raw, workspace }); }
          catch (error) { conflicts.push({ fingerprint: raw.fingerprint, reason: String(error).slice(0, 240) }); continue; }
        }
        if (!item) {
          const { contractVersion: _version, contractDigest: _digest, contractReceipts: _receipts, ...legacy } = raw;
          item = { ...legacy, workspace, supportTaskIds: [], failureTaskIds: [], historicalTaskIds: [], origins: [], migratedSources: [] };
          procedures.push(item);
        }
        item.historicalTaskIds = [...new Set([...(item.historicalTaskIds ?? []), ...raw.supportTaskIds.map(id => origin + ':' + id)])];
        item.failureTaskIds = [...new Set([...item.failureTaskIds, ...raw.failureTaskIds.map(id => origin + ':' + id)])];
        item.needsReview = Boolean(item.needsReview || raw.failureTaskIds.length);
        item.origins = [...new Set([...(item.origins ?? []), origin])];
        item.migratedSources = [...new Set([...(item.migratedSources ?? []), source])];
      }
      return { state: { ...state, procedures }, result: conflicts };
    });
    for (const conflict of migrated.result) activityTracker.captureFailure('LEARNING', new Error(conflict.reason), 'procedure-migration-contract-conflict', { fingerprint: conflict.fingerprint });
    return { conflicts: migrated.result };
  }

  async supportProcedure(input: { taskId: string; origin: 'native' | 'external'; workspace?: string;
    name: string; description: string; steps: string[]; allowedTools?: string[]; reuseCondition?: string;
    evidenceRefs: string[]; outcome: 'verified' | 'failed'; expectedContractDigest?: string;
    browserBinding?: {taskId:string;ownerId:string;workspace:string;workspaceIdentityKey:string};
  }): Promise<AgentProcedureCandidate & { materialization: { status: 'completed' | 'unavailable'; reason?: string }; browserContextStatus?: string }> {
    if (!input.taskId.trim() || input.taskId.length > 200 || !input.name.trim() || input.name.length > 160
      || !input.description.trim() || input.description.length > 2000 || !input.steps.length || input.steps.length > 50
      || input.steps.some(step => !step.trim() || step.length > 2000)) throw new Error('LEARNING_PROCEDURE_INVALID');
    assertLearningTextSafe([input.name, input.description, ...input.steps, input.reuseCondition ?? ''].join('\n'));
    const workspace = input.workspace ? this.memory.resolveWorkspace(input.workspace) : undefined;
    const contract = { ...input, workspace, allowedTools: input.allowedTools ?? [] };
    if (contract.allowedTools.length > 50 || contract.allowedTools.some(tool => !tool.trim() || tool.length > 200)
      || (input.reuseCondition !== undefined && (!input.reuseCondition.trim() || input.reuseCondition.length > 2000))
      || input.evidenceRefs.length > 32 || input.evidenceRefs.some(ref => !safeEvidenceRefSchema().safeParse(ref).success)) throw new Error('LEARNING_PROCEDURE_INVALID');
    const fingerprint = procedureFingerprint(input.name, input.steps);
    const contractDigest = procedureContractDigest(contract);
    if (input.expectedContractDigest !== undefined && input.expectedContractDigest !== contractDigest) throw new Error('LEARNING_PROCEDURE_DELIVERED_CONTRACT_CONFLICT');
    const checks = await Promise.all(input.evidenceRefs.map(ref => recheckWorkflowReport(ref, input.taskId)));
    const supported = checks.includes(input.outcome === 'verified' ? 'pass' : 'fail');
    // Explicit refs only; metadata is never inferred from task name or timestamps.
    const browserAssociation = supported && input.outcome === 'verified'
      ? resolveBrowserObservationUse(input.evidenceRefs,
          input.browserBinding?.taskId===input.taskId ? input.browserBinding : undefined) : undefined;
    const result = await this.stateStore.mutate('procedures', state => {
      const procedures = [...(state.procedures ?? [])];
      let item = procedures.find(value => value.fingerprint === fingerprint && value.workspace === workspace);
      if (item) assertProcedureCompatible(item, contract);
      if (!item) {
        item = { fingerprint, name: input.name, description: input.description, steps: input.steps,
          allowedTools: [...new Set(input.allowedTools ?? [])], reuseCondition: input.reuseCondition, workspace,
          evidenceRefs: [], supportTaskIds: [], failureTaskIds: [], status: 'candidate', updatedAt: new Date().toISOString() };
        procedures.push(item);
      }
      // Only fresh, independently checked evidence receives contract attribution.
      // Existing task arrays stay intact and never become receipts by backfill.
      let browserContextStatus = browserAssociation?.status ?? 'not-requested';
      if (supported) {
        const receipts = [...(item.contractReceipts ?? [])];
        const prior = receipts.find(receipt => receipt.taskId === input.taskId && receipt.outcome === input.outcome);
        const evidenceRefs = [...new Set([...(prior?.evidenceRefs ?? []), ...input.evidenceRefs])];
        if (evidenceRefs.length > 32 || (!prior && receipts.length >= 32)) throw new Error('LEARNING_PROCEDURE_RECEIPT_CAPACITY_REVIEW_REQUIRED');
        if (prior) prior.evidenceRefs = evidenceRefs;
        else receipts.push({ taskId: input.taskId, contractDigest, outcome: input.outcome, evidenceRefs });
        const ownedReceipt = prior ?? receipts[receipts.length - 1]!;
        if (input.outcome === 'verified' && browserAssociation?.status === 'eligible') {
          const proposed = browserAssociation.browserContext;
          if (!validBrowserReceipt(proposed)) throw new Error('LEARNING_BROWSER_CONTEXT_INVALID');
          if (ownedReceipt.browserContext && (
            !validBrowserReceipt(ownedReceipt.browserContext)
            || ownedReceipt.browserContext.actionRef !== proposed.actionRef
            || ownedReceipt.browserContext.sourceDigest !== proposed.sourceDigest
          )) browserContextStatus = 'browser-context-conflict';
          else if (!ownedReceipt.browserContext) ownedReceipt.browserContext = proposed;
        }
        item.contractVersion = 1; item.contractDigest = contractDigest; item.contractReceipts = receipts;
      }
      const key = input.taskId; // Task identity is shared; controller transfer must not add support.
      const field = supported ? input.outcome === 'verified' ? 'supportTaskIds' : 'failureTaskIds' : 'historicalTaskIds';
      item[field] = [...new Set([...(item[field] ?? []), key])];
      item.origins = [...new Set([...(item.origins ?? []), input.origin])];
      item.evidenceRefs = [...new Set([...item.evidenceRefs, ...input.evidenceRefs])];
      if (input.outcome === 'failed') item.needsReview = true;
      item.updatedAt = new Date().toISOString();
      return { state: { ...state, procedures }, result: {item,browserContextStatus} };
    });
    let materialization: { status: 'completed' | 'unavailable'; reason?: string } = { status: 'completed' };
    try { await this.materializeProcedure(result.result.item); }
    catch (error) {
      activityTracker.captureFailure('LEARNING', error, 'procedure-proposal-materialization-unavailable');
      const message = error instanceof Error ? error.message : '';
      materialization = { status: 'unavailable', reason: /^(?:LEARNING_PROCEDURE|SKILL_PROPOSAL)_[A-Z_]+(?::[a-zA-Z,]+)?$/.test(message) ? message.slice(0, 240) : 'SKILL_PROPOSAL_MATERIALIZATION_UNAVAILABLE' };
    }
    return { ...(await this.procedures(workspace)).find(item => item.fingerprint === fingerprint)!,
      materialization, browserContextStatus: result.result.browserContextStatus };
  }

  async markProcedureArtifact(input: { fingerprint: string; workspace?: string; status: 'skill-imported' | 'revision-staged'; skillName: string; skillDigest: string }) {
    const workspace = input.workspace ? this.memory.resolveWorkspace(input.workspace) : undefined;
    const transition = await this.stateStore.mutate('procedures', state => {
      const item = state.procedures?.find(value => value.fingerprint === input.fingerprint && value.workspace === workspace);
      if (!item) throw new Error('LEARNING_PROCEDURE_NOT_FOUND');
      Object.assign(item, { status: input.status, skillName: input.skillName, skillDigest: input.skillDigest });
      return { state, result: item };
    });
    return transition.result;
  }

  async materializeProcedure(candidate: AgentProcedureCandidate): Promise<void> {
    if (!this.proposalCoordinator || !candidate.workspace) return;
    const taskId = [...candidate.supportTaskIds, ...candidate.failureTaskIds, ...(candidate.historicalTaskIds ?? [])].at(-1);
    if (!taskId) return;
    const name = candidate.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 64).replace(/-$/, '');
    const previous = (await this.skillProposals(candidate.workspace)).find(p => p.name === name && p.input.procedureFingerprint === candidate.fingerprint);
    // Merely revisiting legacy evidence must not revoke an existing user decision.
    if (previous && !candidate.contractReceipts?.length && (previous.status === 'approved' || previous.status === 'implemented' || previous.artifactStatus === 'catalog-active')) return;
    await this.upsertSkillProposal({ workspace: candidate.workspace, name, taskId,
      purpose: candidate.description, triggers: [candidate.reuseCondition ?? candidate.description],
      nonTriggers: ['Actions outside the user-approved task scope.'], steps: candidate.steps,
      allowedTools: candidate.allowedTools ?? [],
      expectedBenefit: 'Reusable procedure may improve consistency; effectiveness has not been measured.',
      limitations: ['The proposal does not grant execution permission or prove general effectiveness.'],
      implementation: 'Build a native Skill artifact with the existing Agent Core owners after the user decision.',
      acceptance: ['Validate the artifact and verify its behavior within the explicitly approved scope.'],
      evidenceRefs: candidate.evidenceRefs, procedureFingerprint: candidate.fingerprint,
      ...(candidate.skillName ? { targetSkillName: candidate.skillName } : {}),
      ...(previous ? { expectedProposalDigest: previous.revisionDigest } : {}),
    });
  }
  private readonly stateStore: LearningStateStore;
  private readonly patternSink: CodePatternLearningSink;
  private readonly sinkManager: LearningSinkManager;
  private readonly reviewer: LearningReviewCoordinator;
  private readonly memorySink: MemoryLearningSink;
  private readonly curator: LearningCurator;
  private readonly journeyBuilder: LearningJourneyBuilder;

  private constructor(
    readonly config: LearningConfig,
    private readonly memory: MemoryService,
    code?: CodeIntelligenceService,
  ) {
    this.stateStore = new LearningStateStore(resolveLearningPaths(config.stateDir));
    const memorySink = this.memorySink = new MemoryLearningSink(memory);
    this.patternSink = new CodePatternLearningSink(code);
    this.sinkManager = new LearningSinkManager([memorySink, this.patternSink]);
    this.reviewer = new LearningReviewCoordinator(this.sinkManager);
    this.curator = new LearningCurator(memory, this.patternSink);
    this.journeyBuilder = new LearningJourneyBuilder(memory, this.patternSink);
  }

  static async initialize(
    config: LearningConfig,
    memory: MemoryService,
    code?: CodeIntelligenceService,
  ): Promise<LearningService> {
    const service = new LearningService(config, memory, code);
    const initial = await service.stateStore.load();
    for (const manifest of initial.verificationManifests ?? []) registerWorkflowVerification(manifest);
    activityTracker.record(
      'LEARNING',
      config.enabled ? 'success' : 'info',
      config.enabled ? 'Learning service initialized' : 'Learning service disabled',
      'learning-service-start',
      { enabled: config.enabled, reviewInterval: config.reviewInterval, curatorIntervalHours: config.curatorIntervalHours },
    );
    return service;
  }

  private assertEnabled(): void {
    if (!this.config.enabled) throw new Error('LEARNING_DISABLED');
  }

  async health(): Promise<LearningHealth> {
    const state = await this.stateStore.load();
    void state;
    const issue = this.stateStore.getIssue();
    const sinkStatus = await this.sinkManager.health();
    return {
      status: !this.config.enabled ? 'disabled' : issue ? 'degraded' : 'available',
      enabled: this.config.enabled,
      issueCount: issue ? 1 : 0,
      ...(issue ? { issue } : {}),
      reviewInterval: this.config.reviewInterval,
      curatorIntervalHours: this.config.curatorIntervalHours,
      sinkStatus,
    };
  }

  async status(): Promise<unknown> {
    const state = await this.stateStore.load();
    const health = await this.health();
    const pendingReviews = state.pendingReviews ?? [];
    const immediate = pendingReviews.find((item) => item.reason === 'user-correction'
      || item.reason === 'verified-recovery' || item.reason === 'explicit-learn');
    return {
      health,
      state,
      pendingReviewCount: pendingReviews.length,
      reviewDue: this.config.enabled && pendingReviews.length > 0,
      reviewReason: immediate?.reason ?? pendingReviews[0]?.reason ?? null,
      curatorDue: isCuratorDue(state, this.config),
    };
  }

  async checkpoint(input: LearningCheckpointInput): Promise<unknown> {
    this.assertEnabled();
    const evidence = checkpointEvidence(input.evidenceRefs);
    const normalizedInput: LearningCheckpointInput = {
      ...input,
      ...(input.workspace ? { workspace: this.memory.resolveWorkspace(input.workspace) } : {}),
      evidenceRefs: evidence.refs,
    };
    const committed = await this.stateStore.mutate('checkpoint', (current) => {
      const transition = applyCheckpoint(current, normalizedInput, this.config);
      return {
        state: transition.state,
        result: transition.result,
        persist: !transition.result.duplicate,
      };
    });
    const transition = { result: committed.result, state: committed.state };

    let curation: LearningCuratorProposal[] | undefined;
    if (transition.result.curatorDue && transition.result.advanced) {
      try {
        curation = await this.curator.propose();
        await this.stateStore.mutate('curator', (latest) => ({
          state: markCurated(latest),
          result: null,
        }));
      } catch (error) {
        activityTracker.captureFailure('LEARNING', error, 'learning-curator-opportunistic-failure');
      }
    }

    activityTracker.record(
      'LEARNING',
      'success',
      transition.result.reviewDue ? 'Learning checkpoint requests semantic review' : 'Learning checkpoint recorded',
      'learning-checkpoint',
      {
        reason: normalizedInput.reason ?? 'task-complete',
        advanced: transition.result.advanced,
        duplicate: transition.result.duplicate,
        reviewDue: transition.result.reviewDue,
        pendingReviewCount: transition.result.pendingReviewCount ?? (transition.state.pendingReviews ?? []).length,
        evidenceRefCount: normalizedInput.evidenceRefs?.length ?? 0,
        evidenceRefsDropped: evidence.dropped,
        workspace: normalizedInput.workspace ?? '',
      },
    );
    const handoff = improvementHandoff(normalizedInput, transition.result);
    return { ...transition.result, ...(curation ? { curation } : {}), ...(handoff ? { improvementHandoff: handoff } : {}) };
  }

  /** Binding comes from the host's active task, never from the delta being reviewed. */
  async reviewDelta(value: CurationDelta, explicit = false, binding?: CurationBinding): ReturnType<LearningService['review']> {
    if (!binding?.taskId || !binding.workspace) throw new Error('CURATION_BINDING_REQUIRED');
    const delta = this.curator.proposeDelta(value);
    this.assertCurationScope(delta, binding);
    return this.review(curationCandidates(delta), explicit, { checkpointKeys: [delta.checkpointKey], taskId: binding.taskId,
      workspace: binding.workspace, curation: { delta, binding } });
  }

  private assertCurationScope(delta: CurationDelta, binding: CurationBinding): void {
    try {
      if (delta.taskId !== binding.taskId) throw new Error('task mismatch');
      const identity = this.memory.registeredWorkspaceIdentity(binding.workspace);
      if (this.memory.registeredWorkspaceIdentity(delta.workspace).key !== identity.key
        || delta.entries.some(entry => entry.candidate.checkpointKey && entry.candidate.checkpointKey !== delta.checkpointKey
          || entry.candidate.workspace && this.memory.registeredWorkspaceIdentity(entry.candidate.workspace).key !== identity.key))
        throw new Error('workspace mismatch');
    } catch { throw new Error('CURATION_SCOPE_MISMATCH'); }
  }

  async review(candidates: LearningCandidate[], explicit = false, options: LearningReviewOptions = {}): Promise<{
    outcomes: LearningReviewOutcome[];
    summary: LearningReviewSummary;
    /** @deprecated Capture-count-only legacy field; consult summary for completeness. */
    nothingWorthSaving: boolean;
    checkpointDecisions?: Record<string, import('./types.js').LearningCheckpointDecision>;
  }> {
    this.assertEnabled();
    const keys = [...new Set(options.checkpointKeys ?? [])];
    if (keys.length) {
      if (keys.length > 25 || keys.some(key => !key.trim() || key.length > 200)) throw new Error('LEARNING_CHECKPOINT_KEYS_INVALID');
      if (!candidates.length && !options.disposition) throw new Error('LEARNING_REVIEW_DISPOSITION_REQUIRED');
      if (candidates.some(candidate => candidate.checkpointKey
        ? !keys.includes(candidate.checkpointKey) : keys.length !== 1)) throw new Error('LEARNING_CANDIDATE_CHECKPOINT_REQUIRED');
      const committed = await this.stateStore.mutate('review', async state => {
        if (options.curation) this.assertCurationScope(options.curation.delta, options.curation.binding);
        // ponytail: one Learning mutation lock during capture; split into durable leases if throughput requires it.
        const decisions: NonNullable<LearningState['reviewDecisions']> = Object.assign(Object.create(null), state.reviewDecisions ?? {});
        const allOutcomes: LearningReviewOutcome[] = [];
        const cleared: string[] = [];
        for (const key of keys) {
          const prior = state.pendingReviews?.find(item => item.idempotencyKey === key) ?? decisions[key];
          if (!prior) throw new Error('LEARNING_CHECKPOINT_NOT_FOUND:' + key);
          if (options.taskId && prior.taskId && options.taskId !== prior.taskId) throw new Error('LEARNING_REVIEW_TASK_MISMATCH');
        }
        for (const key of keys) {
          const pending = state.pendingReviews?.find(item => item.idempotencyKey === key);
          const previous = decisions[key];
          if (!pending && !previous) throw new Error('LEARNING_CHECKPOINT_NOT_FOUND:' + key);
          if (options.taskId && (pending?.taskId ?? previous?.taskId) && options.taskId !== (pending?.taskId ?? previous?.taskId)) {
            throw new Error('LEARNING_REVIEW_TASK_MISMATCH');
          }
          const curationOperations: Record<string, string[]> = Object.assign(Object.create(null), previous?.curationOperations ?? {});
          if (options.curation) {
            const { delta, binding } = options.curation;
            if ((pending?.taskId ?? previous?.taskId) !== binding.taskId
              || !(pending?.workspace ?? previous?.workspace)
              || this.memory.registeredWorkspaceIdentity((pending?.workspace ?? previous?.workspace)!).key
                !== this.memory.registeredWorkspaceIdentity(binding.workspace).key) throw new Error('CURATION_SCOPE_MISMATCH');
            const fingerprints = delta.entries.map(curationEntryFingerprint);
            const priorEntries = curationOperations[delta.operationId];
            if (previous?.complete && !priorEntries) throw new Error('CURATION_CHECKPOINT_COMPLETE');
            if (priorEntries && fingerprints.some(value => !priorEntries.includes(value))) throw new Error('CURATION_OPERATION_CONFLICT');
            curationOperations[delta.operationId] = priorEntries ?? fingerprints;
          }
          if (previous?.complete) { allOutcomes.push(...Object.values(previous.candidateResults)); continue; }
          const selected = candidates.filter(candidate => (candidate.checkpointKey ?? keys[0]) === key);
          const candidateResults = { ...(previous?.candidateResults ?? {}) };
          const outcomes: LearningReviewOutcome[] = [];
          for (const candidate of selected) {
            const workspace = candidate.workspace ?? pending?.workspace ?? options.workspace;
            const normalized = { ...candidate, checkpointKey: key,
              ...(workspace ? { workspace: this.memory.resolveWorkspace(workspace) } : {}) };
            const identity = createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
            const cached = candidateResults[identity];
            const entry = options.curation?.delta.entries.find(value => curationCandidateId(options.curation!.delta.operationId, value) === candidate.candidateId);
            let outcome: LearningReviewOutcome;
            if (entry?.target && cached && ['captured', 'duplicate'].includes(cached.status)) outcome = cached;
            else if (entry?.target && this.memorySink.supportsCorrections()) {
              try {
                // Reconciliation of an already committed exact operation is read-only;
                // it must survive later source changes or episode completion.
                const replay = await this.memorySink.replayCorrection(options.curation!.delta, entry, options.curation!.binding);
                const correctionReviewer = new LearningReviewCoordinator(new LearningSinkManager([
                  this.memorySink.correctionSink(options.curation!.delta, entry, options.curation!.binding),
                ]));
                outcome = replay ? { kind: normalized.kind, status: 'captured', sink: 'memory', id: replay.id,
                  reason: 'Reconciled the existing committed correction receipt.',
                  decision: createLearningDecision(normalized, normalized, 'curation:' + options.curation!.delta.operationId, outcomes.length) }
                  : (await correctionReviewer.review([normalized], explicit, true))[0]!;
              } catch (error) {
                outcome = { kind: normalized.kind, status: 'sink-failed', sink: 'memory', reason: error instanceof Error ? error.message : String(error),
                  decision: createLearningDecision(normalized, normalized, 'curation:' + options.curation!.delta.operationId, outcomes.length) };
              }
            } else if (entry?.target) {
              const target = await this.memory.read(entry.target.id, false).catch(() => null);
              const current = target && target.provenance?.workspace
                && this.memory.resolveWorkspace(target.provenance.workspace) === normalized.workspace
                && memorySemanticRevision(target) === entry.target.revision;
              outcome = current ? (await this.reviewer.review([{ ...normalized, verified: false }], explicit, true))[0]!
                : { kind: normalized.kind, status: 'rejected', reasonCode: 'evidence-invalid', reason: 'CURATION_TARGET_STALE_OR_UNAVAILABLE',
                  decision: createLearningDecision(normalized, normalized, 'curation:' + options.curation!.delta.operationId, outcomes.length) };
              if (current) outcome.reason = 'CURATION_PROMOTION_UNAVAILABLE: enable the experience Memory host and bind this task episode, then retry the same delta.';
            } else outcome = cached && !['sink-failed', 'sink-unavailable'].includes(cached.status)
              ? cached : (await this.reviewer.review([normalized], explicit, true))[0]!;
            if (entry) outcome.curation = { operationId: options.curation!.delta.operationId, entryFingerprint: curationEntryFingerprint(entry),
              kind: entry.kind, ...(entry.target ? { target: entry.target } : {}), candidate: entry.candidate };
            candidateResults[identity] = outcome;
            outcomes.push(outcome);
          }
          const summary = summarizeLearningReview(Object.values(candidateResults));
          const complete = selected.length ? summary.complete : Boolean(options.disposition);
          decisions[key] = {
            status: selected.length ? summary.status : options.disposition!, complete,
            reviewedAt: new Date().toISOString(),
            ...(pending?.workspace ?? previous?.workspace ? { workspace: pending?.workspace ?? previous?.workspace } : {}),
            ...(Object.keys(curationOperations).length ? { curationOperations } : {}),
            ...(pending?.taskId ?? options.taskId ? { taskId: pending?.taskId ?? options.taskId } : {}),
            candidateResults,
          };
          if (complete) cleared.push(key);
          allOutcomes.push(...outcomes);
        }
        applyPriorRejectionAdvisory(allOutcomes, state);
        return { state: { ...withRejectionHistory(markReviewed(state, new Date(), cleared), allOutcomes), reviewDecisions: decisions },
          result: { outcomes: allOutcomes, checkpointDecisions: Object.fromEntries(keys.map(key => [key, decisions[key]!])) } };
      });
      recordLearningDecisions(committed.result.outcomes, (...args) => activityTracker.record(...args));
      const summary = summarizeLearningReview(committed.result.outcomes);
      if (!committed.result.outcomes.length) summary.status = options.disposition ?? summary.status;
      summary.complete = Object.values(committed.result.checkpointDecisions).every(item => item.complete);
      return { ...committed.result, summary, nothingWorthSaving: candidates.length === 0 && options.disposition === 'no-new-knowledge' };
    }
    const priorState = await this.stateStore.load();
    const outcomes = await this.reviewer.review(candidates.map(candidate => {
      const workspace = candidate.workspace ?? options.workspace;
      return { ...candidate, ...(workspace ? { workspace: this.memory.resolveWorkspace(workspace) } : {}) };
    }), explicit);
    applyPriorRejectionAdvisory(outcomes, priorState);
    recordLearningDecisions(outcomes, (...args) => activityTracker.record(...args));
    await this.stateStore.mutate('review', (latestState) => ({
      state: withRejectionHistory(markReviewed(latestState), outcomes),
      result: null,
    }));

    const summary = summarizeLearningReview(outcomes);
    const captured = summary.counts.captured;
    try {
      activityTracker.record(
        'LEARNING',
        !summary.complete ? 'warn' : captured ? 'success' : 'info',
        `Learning review: ${summary.status}`,
        'learning-review',
        {
          explicit,
          candidateCount: candidates.length,
          captured,
          proposalCount: summary.counts.proposal,
          duplicateCount: summary.counts.duplicate,
          rejectedCount: summary.counts.rejected,
          unavailableCount: summary.counts['sink-unavailable'],
          failedCount: summary.counts['sink-failed'],
          status: summary.status,
          complete: summary.complete,
        },
      );
    } catch { /* Summary telemetry must not turn a completed capture into a retry. */ }
    return { outcomes, summary, nothingWorthSaving: captured === 0 };
  }

  async receipt(input: MemoryUseReceiptInput) {
    this.assertEnabled();
    return this.memory.recordUseReceipt(input);
  }

  async curate(workspace?: string): Promise<LearningCuratorProposal[]> {
    this.assertEnabled();
    const proposals = await this.curator.propose(workspace);
    await this.stateStore.mutate('curator', (state) => ({
      state: markCurated(state),
      result: null,
    }));
    activityTracker.record('LEARNING', 'success', 'Learning curator produced review proposals', 'learning-curate', {
      proposalCount: proposals.length,
      workspace: workspace ?? '',
    });
    return proposals;
  }

  async journey(workspace?: string): Promise<LearningJourney> {
    this.assertEnabled();
    return this.journeyBuilder.build(workspace ? this.memory.resolveWorkspace(workspace) : undefined);
  }
}
