import type { MemoryCognitiveConfig } from './cognitive-config.js';
import { enabledCognitiveFeatures } from './cognitive-config.js';
import { decideContradictions, type ContradictionDecision } from './contradiction.js';
import {
  assessEpistemicConfidence, buildEpistemicLinkIndex, epistemicRankingInfluence, type EpistemicAssessment,
} from './epistemic-confidence.js';
import { FORGETTING_PARAMS, scoreMemoryForgetting } from './forgetting-curve.js';
import type { MemoryIndexResult } from './index.js';
import { boundedHistory } from './note-format.js';
import { IntervalLoop, planEpisodicDigests, type DigestPlanResult, type DigestPlan, type DigestCommitResult } from './rem-consolidation.js';
import {
  ASSIST_SYSTEM_PROMPT, ASSIST_TAG, buildAssistPrompt, checkAbstractiveDigest, emptyAssistCounts,
  type AssistCounts, type DreamingCompletion,
} from './rem-model-assist.js';
import { normalizeLinks } from './relations.js';
import {
  classifyEmbeddingDrift, findOrphanReferences, stripOrphanReferences, type IntegrityScan,
} from './self-repair.js';
import type { MemoryRecord } from './types.js';

/** Narrow capability surface the service hands to the engine; keeps service internals private. */
export interface CognitiveHost {
  /** Reloads canonical records and returns them. */
  snapshot(): Promise<MemoryRecord[]>;
  /** Whether the last snapshot loaded every canonical note. */
  canonicalComplete(): boolean;
  mutate(id: string, mutation: (current: MemoryRecord, validIds: Set<string>) => MemoryRecord): Promise<MemoryRecord>;
  refreshIndex(): Promise<void>;
  inspectIndex(records: MemoryRecord[]): Promise<MemoryIndexResult>;
  repairSummary(): Promise<{ pending: number; failed: number; issue?: string }>;
  commitDigest(plan: DigestPlan): Promise<DigestCommitResult>;
  feedbackSalience(): Promise<Map<string, number>>;
  /** Forgotten record ids; a failed read fails the digest step instead of planning without it. */
  forgottenIds?(): Promise<ReadonlySet<string>>;
}

export interface ContradictionReport {
  mode: 'preview' | 'applied';
  decisions: ContradictionDecision[];
  applied: Array<{ winnerId: string; loserId: string }>;
  failed: Array<{ winnerId: string; loserId: string; error: string }>;
}

export interface IntegrityReport {
  mode: 'preview' | 'applied';
  scan: IntegrityScan;
  repaired: { owners: number; links: number; evidenceRefs: number };
  indexRefreshed: boolean;
  failed: Array<{ ownerId: string; error: string }>;
}

export interface CognitiveCycleReport {
  startedAt: string;
  completedAt: string;
  mode: 'preview' | 'applied';
  enabled: string[];
  contradictions?: ContradictionReport;
  digests?: Omit<DigestPlanResult, 'plans'> & {
    planned: number; created: string[]; updated: string[]; failed: string[]; indexIssues: number; assist?: AssistCounts;
  };
  forgetting?: { threshold: number; reviewCandidates: number; sampleIds: string[] };
  integrity?: IntegrityReport;
  errors: string[];
}

const MAX_DIGESTS_PER_CYCLE = 5;
/** Bounds the blast radius of an autonomous cycle; the rest waits for the next one. */
const MAX_PRUNES_PER_CYCLE = 10;
const DEFAULT_PRUNE_BUDGET = 50;
const MAX_DECISIONS_REPORTED = 200;
const message = (error: unknown): string => (error instanceof Error ? error.message : String(error)).slice(0, 200);

export class MemoryCognitiveEngine {
  private busy = false;
  private loop: IntervalLoop | undefined;
  private lastCycle: CognitiveCycleReport | undefined;
  private lastLoopError: string | undefined;
  private completion: DreamingCompletion | undefined;
  // shortcut: the daily model-call budget lives in process memory and resets on restart; persist it if restarts become frequent.
  private assistBudget = { day: '', used: 0 };

  constructor(private readonly host: CognitiveHost, readonly config: MemoryCognitiveConfig) {}

  /** The host injects the model call after the Native runtime exists; `src/memory` never imports provider modules. */
  setDreamingCompletion(completion: DreamingCompletion | undefined): void {
    this.completion = completion;
  }

  private takeAssistBudget(now = Date.now()): boolean {
    const day = new Date(now).toISOString().slice(0, 10);
    if (this.assistBudget.day !== day) this.assistBudget = { day, used: 0 };
    if (this.assistBudget.used >= this.config.rem.modelCallsPerDay) return false;
    this.assistBudget.used += 1;
    return true;
  }

  /**
   * Runs outside the canonical lock. Any failure, timeout or rejected output returns the unchanged extractive
   * plan; `validateDigestPlan` still re-checks the sources inside the transaction at commit time.
   */
  private async assistPlan(plan: DigestPlan, byId: Map<string, MemoryRecord>, counts: AssistCounts): Promise<DigestPlan> {
    const complete = this.completion;
    // A legacy digest binds only to the exact extractive text, so a rewrite could never be committed over it.
    if (!complete || plan.legacy) return plan;
    const members = plan.memberIds.flatMap((id) => byId.get(id) ?? []);
    if (members.length !== plan.memberIds.length) { counts.fallback += 1; return plan; }
    if (!this.takeAssistBudget()) { counts.deferred += 1; return plan; }
    counts.called += 1;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.rem.modelTimeoutMs);
    try {
      // A completion that ignores the signal must still not stall the cycle.
      const timedOut = new Promise<never>((_, reject) => {
        controller.signal.addEventListener('abort', () => reject(new Error('REM_MODEL_ASSIST_TIMEOUT')), { once: true });
      });
      const text = await Promise.race([
        complete({ system: ASSIST_SYSTEM_PROMPT, prompt: buildAssistPrompt(members), signal: controller.signal }),
        timedOut,
      ]);
      const checked = checkAbstractiveDigest(text, plan.title, members);
      if (!checked.ok) {
        counts.rejected += 1;
        counts.reasons[checked.reason] = (counts.reasons[checked.reason] ?? 0) + 1;
        return plan;
      }
      counts.accepted += 1;
      return { ...plan, content: checked.content, tags: [...plan.tags, ASSIST_TAG], assist: 'model' };
    } catch {
      // The error text may quote source material; only the count survives.
      counts.fallback += 1;
      return plan;
    } finally {
      clearTimeout(timer);
    }
  }

  /** Bounded additive ranking influence per record id, derived from the eligible set's links. */
  epistemicInfluence(records: MemoryRecord[], now = Date.now()): Map<string, number> {
    const links = buildEpistemicLinkIndex(records, now);
    return new Map(records.map((record) =>
      [record.id, epistemicRankingInfluence(assessEpistemicConfidence(record, links.get(record.id)))]));
  }

  epistemicAssessment(record: MemoryRecord, records: MemoryRecord[], now = Date.now()): EpistemicAssessment {
    return assessEpistemicConfidence(record, buildEpistemicLinkIndex(records, now).get(record.id));
  }

  async resolveContradictions(options: { apply?: boolean; limit?: number } = {}): Promise<ContradictionReport> {
    const records = await this.host.snapshot();
    const decisions = decideContradictions(records, Date.now(), this.config.contradiction, MAX_DECISIONS_REPORTED);
    const report: ContradictionReport = { mode: options.apply ? 'applied' : 'preview', decisions, applied: [], failed: [] };
    if (!options.apply) return report;
    // The budget counts prune attempts, so unresolved pairs can never starve resolvable ones.
    let attempts = 0;
    const budget = Math.max(1, options.limit ?? DEFAULT_PRUNE_BUDGET);
    for (const decision of decisions) {
      if (decision.outcome !== 'resolved' || !decision.winnerId || !decision.loserId) continue;
      if (attempts >= budget) break;
      attempts += 1;
      const { winnerId, loserId } = decision;
      try {
        const updated = await this.host.mutate(winnerId, (current, validIds) => {
          const now = new Date().toISOString();
          const link = {
            targetId: loserId, type: 'supersedes' as const, strength: 1, createdAt: now, validFrom: now,
            reason: `contradiction-resolution:${decision.reason}`,
          };
          return {
            ...current,
            links: normalizeLinks(current.id, [...current.links, link], validIds, current.version === 2),
            updatedAt: now,
            evolutionHistory: boundedHistory(current.evolutionHistory, {
              kind: 'superseded', source: 'system', timestamp: now, changedFields: ['links'],
              details: { loserId, reason: decision.reason, confidence: decision.confidence },
            }),
          };
        });
        // Link capacity can silently drop the new link; never report a prune that did not happen.
        if (!updated.links.some((link) => link.type === 'supersedes' && link.targetId === loserId)) {
          report.failed.push({ winnerId, loserId, error: 'supersedes-link-not-retained' });
        } else report.applied.push({ winnerId, loserId });
      } catch (error) {
        report.failed.push({ winnerId, loserId, error: message(error) });
      }
    }
    if (report.applied.length) await this.host.refreshIndex();
    return report;
  }

  async scanIntegrity(): Promise<IntegrityScan> {
    const records = await this.host.snapshot();
    const canonicalComplete = this.host.canonicalComplete();
    const orphanReferences = canonicalComplete ? findOrphanReferences(records) : [];
    const drift = classifyEmbeddingDrift(await this.host.inspectIndex(records));
    const queue = await this.host.repairSummary();
    return {
      scannedRecords: records.length,
      canonicalComplete,
      orphanReferences,
      embedding: { ...drift, pending: queue.pending, failed: queue.failed },
      needsRepair: orphanReferences.length > 0
        || drift.status === 'stale-index' || drift.status === 'incomplete-embeddings' || queue.pending > 0,
    };
  }

  async repairIntegrity(options: { apply?: boolean } = {}): Promise<IntegrityReport> {
    let scan = await this.scanIntegrity();
    const report: IntegrityReport = {
      mode: options.apply ? 'applied' : 'preview', scan,
      repaired: { owners: 0, links: 0, evidenceRefs: 0 }, indexRefreshed: false, failed: [],
    };
    if (!options.apply || !scan.needsRepair) return report;
    if (!scan.canonicalComplete) {
      report.failed.push({ ownerId: '*', error: 'canonical-store-incomplete' });
      return report;
    }

    const records = new Map((await this.host.snapshot()).map((record) => [record.id, record]));
    for (const ownerId of new Set(scan.orphanReferences.map((orphan) => orphan.ownerId))) {
      if (records.get(ownerId)?.pinned) { report.failed.push({ ownerId, error: 'pinned-record' }); continue; }
      try {
        let removed = { links: 0, evidenceRefs: 0 };
        await this.host.mutate(ownerId, (current, validIds) => {
          // A reference is dangling only if the target is absent from the complete scan and from the
          // commit-time snapshot, so a transiently unreadable note can never cost a valid link.
          const stripped = stripOrphanReferences(current, new Set([...validIds, ...records.keys()]));
          if (!stripped) return current;
          removed = { links: stripped.removedTargets.length, evidenceRefs: stripped.removedEvidenceIds.length };
          return stripped.record;
        });
        report.repaired.owners += 1;
        report.repaired.links += removed.links;
        report.repaired.evidenceRefs += removed.evidenceRefs;
      } catch (error) {
        report.failed.push({ ownerId, error: message(error) });
      }
    }
    // Incremental refresh: re-embeds only changed or due records through the bounded repair queue.
    await this.host.refreshIndex();
    report.indexRefreshed = true;
    scan = await this.scanIntegrity();
    report.scan = scan;
    return report;
  }

  async runCycle(options: { apply?: boolean; remOnly?: boolean } = {}): Promise<CognitiveCycleReport> {
    if (this.busy) throw new Error('MEMORY_COGNITIVE_CYCLE_BUSY');
    this.busy = true;
    const apply = options.apply === true;
    const features = this.config.features;
    const report: CognitiveCycleReport = {
      startedAt: new Date().toISOString(), completedAt: '', mode: apply ? 'applied' : 'preview',
      enabled: enabledCognitiveFeatures(this.config).filter(name => !options.remOnly || name === 'remConsolidation'), errors: [],
    };
    const step = async (name: string, run: () => Promise<void>): Promise<void> => {
      try { await run(); } catch (error) { report.errors.push(`${name}: ${message(error)}`); }
    };
    try {
      if (!options.remOnly && features.contradictionResolution) {
        await step('contradictions', async () => {
          report.contradictions = await this.resolveContradictions({ apply, limit: MAX_PRUNES_PER_CYCLE });
        });
      }
      if (features.remConsolidation) await step('digests', async () => { report.digests = await this.consolidate(apply); });
      if (!options.remOnly && features.forgettingCurve) await step('forgetting', async () => { report.forgetting = await this.reviewForgetting(); });
      if (!options.remOnly && features.selfRepair) await step('integrity', async () => { report.integrity = await this.repairIntegrity({ apply }); });
    } finally {
      report.completedAt = new Date().toISOString();
      this.lastCycle = report;
      this.busy = false;
    }
    return report;
  }

  private async consolidate(apply: boolean): Promise<NonNullable<CognitiveCycleReport['digests']>> {
    const records = await this.host.snapshot();
    if (!this.host.canonicalComplete()) throw new Error('MEMORY_CANONICAL_INCOMPLETE');
    const excludeIds = await this.host.forgottenIds?.();
    const assist = apply && this.config.rem.modelAssist === 'digest' && this.completion ? emptyAssistCounts() : undefined;
    const { plans: planned, ...counts } = planEpisodicDigests(records, {
      now: Date.now(), windowMs: this.config.rem.windowMs,
      minClusterSize: this.config.rem.minClusterSize, maxClusterSize: this.config.rem.maxClusterSize,
      ...(excludeIds ? { excludeIds } : {}),
      ...(assist ? { upgradeExtractive: true } : {}),
    });
    // shortcut: no per-family backoff for upgrades the model keeps failing; the daily call budget bounds the waste.
    // Upgrades go last so they never take a cycle slot from a new or changed family.
    const plans = [...planned].sort((a, b) => Number(Boolean(a.upgrade)) - Number(Boolean(b.upgrade)));
    const created: string[] = [];
    const updated: string[] = [];
    const failed: string[] = [];
    let indexIssues = 0;
    if (apply) {
      counts.reasons.budgetDeferred += Math.max(0, plans.length - MAX_DIGESTS_PER_CYCLE);
      const batch = plans.slice(0, MAX_DIGESTS_PER_CYCLE);
      // Independent provider waits overlap; the five-digest cycle cap already bounds the fan-out.
      const byId = new Map(records.map((record) => [record.id, record]));
      const ready = assist ? await Promise.all(batch.map((plan) => this.assistPlan(plan, byId, assist))) : batch;
      for (const plan of ready) {
        // A failed upgrade leaves the existing extractive digest as it is instead of rewriting it with the same text.
        if (plan.upgrade && !plan.assist) { counts.reasons.unchanged += 1; continue; }
        try {
          const result = await this.host.commitDigest(plan);
          if (result.status === 'skipped') counts.reasons[result.reason] += 1;
          else {
            (result.status === 'created' ? created : updated).push(result.id);
            if (result.indexIssue) indexIssues += 1;
          }
        } catch (error) {
          counts.reasons.commitFailed += 1;
          // Do not expose raw source/error text through the maintenance report.
          failed.push(plan.key);
        }
      }
    }
    return { ...counts, planned: plans.length, created, updated, failed, indexIssues, ...(assist ? { assist } : {}) };
  }

  /** Review-only: reports records whose retrievability fell under the threshold, never deletes. */
  private async reviewForgetting(): Promise<NonNullable<CognitiveCycleReport['forgetting']>> {
    const records = await this.host.snapshot();
    const salience = await this.host.feedbackSalience();
    const links = buildEpistemicLinkIndex(records);
    const now = Date.now();
    const candidates = records
      .filter((record) => !record.pinned)
      .map((record) => ({
        id: record.id,
        score: scoreMemoryForgetting(record, now, {
          salience: salience.get(record.id) ?? 1,
          confidence: assessEpistemicConfidence(record, links.get(record.id)).confidence,
        })?.retrievability,
      }))
      .filter((item): item is { id: string; score: number } =>
        item.score !== undefined && item.score < FORGETTING_PARAMS.reviewThreshold)
      .sort((a, b) => a.score - b.score || a.id.localeCompare(b.id));
    return {
      threshold: FORGETTING_PARAMS.reviewThreshold,
      reviewCandidates: candidates.length,
      sampleIds: candidates.slice(0, 10).map((item) => item.id),
    };
  }

  startLoop(): void {
    if (!this.config.features.remConsolidation || this.loop) return;
    this.loop = new IntervalLoop(
      () => this.runCycle({ apply: true }),
      this.config.rem.intervalMs,
      (error) => { this.lastLoopError = message(error); },
    );
    this.loop.start();
  }

  stopLoop(): void {
    this.loop?.stop();
    this.loop = undefined;
  }

  status() {
    return {
      enabled: enabledCognitiveFeatures(this.config),
      loopRunning: this.loop?.running ?? false,
      ...(this.lastCycle ? { lastCycle: this.lastCycle } : {}),
      ...(this.lastLoopError ? { lastLoopError: this.lastLoopError } : {}),
    };
  }

  /** Desktop evidence: aggregate counts only, never source/digest identifiers or snippets. */
  dreamingStatus() {
    const cycle = this.lastCycle?.enabled.includes('remConsolidation') ? this.lastCycle : undefined;
    const digest = cycle?.digests;
    return {
      enabled: this.config.features.remConsolidation, loopRunning: this.loop?.running ?? false,
      busy: this.busy, intervalMs: this.config.rem.intervalMs,
      modelAssist: this.config.rem.modelAssist, modelAssistReady: Boolean(this.completion),
      ...(cycle ? { lastCycle: {
        startedAt: cycle.startedAt, completedAt: cycle.completedAt, mode: cycle.mode,
        planned: digest?.planned ?? null, clusters: digest?.clusters ?? null,
        created: digest?.created.length ?? null, updated: digest?.updated.length ?? null,
        failed: digest?.failed.length ?? null, indexIssues: digest?.indexIssues ?? null,
        reasons: digest?.reasons ?? {}, errors: cycle.errors.length,
        ...(digest?.assist ? { assist: { ...digest.assist, reasons: { ...digest.assist.reasons } } } : {}),
      } } : {}),
      ...(this.lastLoopError ? { loopError: true } : {}),
    };
  }
}
