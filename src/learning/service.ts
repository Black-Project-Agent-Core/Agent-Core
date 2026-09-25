import type { CodeIntelligenceService } from '../code-intelligence/service.js';
import type { MemoryService } from '../memory/service.js';
import { activityTracker } from '../tracker/activity-tracker.js';
import { CodePatternLearningSink } from './code-pattern-sink.js';
import { LearningCurator } from './curator.js';
import { LearningJourneyBuilder } from './journey.js';
import { MemoryLearningSink } from './memory-sink.js';
import { resolveLearningPaths } from './paths.js';
import { LearningReviewCoordinator } from './review.js';
import { summarizeLearningReview } from './review-summary.js';
import { recordLearningDecisions } from './decision-evidence.js';
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
} from './types.js';

export class LearningService {
  private readonly stateStore: LearningStateStore;
  private readonly patternSink: CodePatternLearningSink;
  private readonly sinkManager: LearningSinkManager;
  private readonly reviewer: LearningReviewCoordinator;
  private readonly curator: LearningCurator;
  private readonly journeyBuilder: LearningJourneyBuilder;

  private constructor(
    readonly config: LearningConfig,
    private readonly memory: MemoryService,
    code?: CodeIntelligenceService,
  ) {
    this.stateStore = new LearningStateStore(resolveLearningPaths(process.cwd(), config.stateDir));
    const memorySink = new MemoryLearningSink(memory);
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
    await service.stateStore.load();
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
    return {
      health,
      state,
      reviewDue: this.config.enabled && state.sinceReview >= this.config.reviewInterval,
      curatorDue: isCuratorDue(state, this.config),
    };
  }

  async checkpoint(input: LearningCheckpointInput): Promise<unknown> {
    this.assertEnabled();
    const current = await this.stateStore.load();
    const transition = applyCheckpoint(current, input, this.config);
    if (!transition.result.duplicate) await this.stateStore.save(transition.state);

    let curation: LearningCuratorProposal[] | undefined;
    if (transition.result.curatorDue && transition.result.advanced) {
      try {
        curation = await this.curator.propose();
        const latest = await this.stateStore.load();
        await this.stateStore.save(markCurated(latest));
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
        reason: input.reason ?? 'task-complete',
        advanced: transition.result.advanced,
        duplicate: transition.result.duplicate,
        reviewDue: transition.result.reviewDue,
      },
    );
    return { ...transition.result, ...(curation ? { curation } : {}) };
  }

  async review(candidates: LearningCandidate[], explicit = false): Promise<{
    outcomes: LearningReviewOutcome[];
    summary: LearningReviewSummary;
    /** @deprecated Capture-count-only legacy field; consult summary for completeness. */
    nothingWorthSaving: boolean;
  }> {
    this.assertEnabled();
    const outcomes = await this.reviewer.review(candidates, explicit);
    recordLearningDecisions(outcomes, (...args) => activityTracker.record(...args));
    const state = await this.stateStore.load();
    await this.stateStore.save(markReviewed(state));

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

  async curate(workspace?: string): Promise<LearningCuratorProposal[]> {
    this.assertEnabled();
    const proposals = await this.curator.propose(workspace);
    const state = await this.stateStore.load();
    await this.stateStore.save(markCurated(state));
    activityTracker.record('LEARNING', 'success', 'Learning curator produced review proposals', 'learning-curate', {
      proposalCount: proposals.length,
      workspace: workspace ?? '',
    });
    return proposals;
  }

  async journey(workspace?: string): Promise<LearningJourney> {
    this.assertEnabled();
    return this.journeyBuilder.build(workspace);
  }
}
