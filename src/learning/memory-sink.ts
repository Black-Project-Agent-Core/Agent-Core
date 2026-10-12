import path from 'node:path';
import { createHash } from 'node:crypto';
import type { MemoryService as ExperienceMemoryService } from '../../SubProject/agent-core-memory/dist/index.js';
import type { ControllerMemorySession } from '../../SubProject/agent-core-memory/dist/memory/controller-session.js';
import type { ConsolidationPlan, ConsolidationPolicy } from '../../SubProject/agent-core-memory/dist/memory/promotion.js';
import { legacyExperience, type SourceRef } from '../../SubProject/agent-core-memory/dist/memory/experience-types.js';
import { memorySemanticRevision, stableDisclosureJson } from '../../SubProject/agent-core-memory/dist/memory/disclosure.js';
import { memorySourcePathAllowed } from '../../SubProject/agent-core-memory/dist/memory/source-snapshot.js';
import { readEvidenceSnapshot, revalidateEvidenceSnapshot } from '../verification/evidence-snapshot.js';
import { curationEntryFingerprint } from './curation-delta.js';
import type { CurationBinding, CurationDelta } from './types.js';
import type { MemoryService } from '../memory/service.js';
import { normalizeMemoryWorkspace } from '../memory/provenance.js';
import type { LearningCandidate } from './types.js';
import { validateDecisionMetadata } from './decision-evidence.js';
import type { LearningCaptureResult, LearningSink, LearningSinkHealth } from './sink.js';

type CorrectionHost = {
  projectRoot: string;
  apply(session: ControllerMemorySession, plan: ConsolidationPlan, operationId: string, validate: () => Promise<void>): ReturnType<ControllerMemorySession['applyConsolidation']>;
};
const correctionHosts = new WeakMap<object, CorrectionHost>();
const correctionOperation = (delta: CurationDelta, entry: CurationDelta['entries'][number], binding: CurationBinding, workspaceKey: string): string =>
  createHash('sha256').update(stableDisclosureJson([binding.taskId, workspaceKey, delta.checkpointKey, delta.operationId, curationEntryFingerprint(entry)])).digest('hex');

/** Host wiring only. No controller argument or persisted record can grant review authority. */
export function createLearningConsolidationHost(projectRoot: string): { policy: ConsolidationPolicy; bind(memory: ExperienceMemoryService): void } {
  const approvals = new Map<string, { plan: string; validate: () => Promise<void> }>();
  const host: CorrectionHost = { projectRoot: path.resolve(projectRoot), async apply(session, plan, operationId, validate) {
    approvals.set(plan.digest, { plan: stableDisclosureJson(plan), validate });
    try { return await session.applyConsolidation({ planId: plan.id, expectedPlanDigest: plan.digest, operationId }); }
    finally { approvals.delete(plan.digest); }
  } };
  return { bind(memory) { correctionHosts.set(memory, host); }, policy: { async review(plan) {
    const approval = approvals.get(plan.digest);
    if (!approval || approval.plan !== stableDisclosureJson(plan)) return null;
    await approval.validate();
    return { digest: plan.digest, reviewer: 'learning-curation', reason: 'Exact host-bound Learning delta passed existing candidate and source eligibility; semantic truth is not independently certified.' };
  } } };
}

function workspaceOf(value: string | undefined): string | undefined {
  return value === undefined ? undefined : normalizeMemoryWorkspace(value);
}

function contextFor(candidate: LearningCandidate): string {
  return candidate.reuseCondition?.trim()
    ? `Reusable when: ${candidate.reuseCondition.trim()}`
    : 'Captured by Agent Core learning review.';
}

function categoryFor(candidate: LearningCandidate): string {
  if (candidate.kind === 'operational-reflection') return 'operational-reflection';
  if (candidate.kind === 'architecture') return 'learning-architecture';
  return 'learned-fact';
}

export class MemoryLearningSink implements LearningSink {
  readonly name = 'memory';

  constructor(private readonly memory: MemoryService) {}

  async isAvailable(): Promise<boolean> {
    const health = this.memory.health();
    return health.status !== 'error' && health.canonicalStore !== 'error';
  }

  async health(): Promise<LearningSinkHealth> {
    const health = this.memory.health();
    return {
      available: health.status !== 'error' && health.canonicalStore !== 'error',
      ...(health.status === 'error' ? { issue: 'MemoryService unavailable' } : {}),
    };
  }

  classifySupport(candidate: LearningCandidate): boolean {
    return candidate.kind !== 'code-pattern';
  }

  async findDuplicates(candidate: LearningCandidate): Promise<Array<{ id?: string; reason: string }>> {
    const workspace = candidate.workspace ? this.memory.resolveWorkspace(candidate.workspace) : undefined;
    const records = await this.memory.list();
    return records
      .filter((record) => !record.pinned)
      .filter((record) => (record.provenance?.workspace ? this.memory.resolveWorkspace(record.provenance.workspace) : undefined) === workspace)
      // A shared title is not evidence that a changed lesson has the same meaning.
      // Preserve code case/whitespace and different applicability conditions.
      .filter((record) => record.content.trim() === candidate.content.trim()
        && record.category === categoryFor(candidate)
        && record.context.trim() === contextFor(candidate))
      .map((record) => ({ id: record.id, reason: 'same-scope content and reuse condition already exist' }));
  }

  supportsCorrections(): boolean { return correctionHosts.has(this.memory); }

  async replayCorrection(delta: CurationDelta, entry: CurationDelta['entries'][number], binding: CurationBinding): Promise<LearningCaptureResult | undefined> {
    if (!correctionHosts.has(this.memory)) return;
    const memory = this.memory as unknown as ExperienceMemoryService;
    const workspace = memory.registeredWorkspaceIdentity(binding.workspace);
    const session = memory.controller({ workspaceKey: workspace.name, taskId: binding.taskId, controllerId: 'learning-curation' });
    const receipt = await session.committedConsolidation({ operationId: 'curation:' + correctionOperation(delta, entry, binding, workspace.key) + ':apply' });
    if (!receipt) return;
    if (receipt.canonicalRefs.length !== 1) throw new Error('CURATION_PROMOTION_RECEIPT_INVALID');
    return { id: receipt.canonicalRefs[0]!.id, raw: receipt };
  }

  correctionSink(delta: CurationDelta, entry: CurationDelta['entries'][number], binding: CurationBinding): LearningSink {
    return { name: this.name, isAvailable: () => this.isAvailable(), health: () => this.health(),
      classifySupport: candidate => this.classifySupport(candidate), findDuplicates: async () => [],
      capture: candidate => this.captureCorrection(candidate, delta, entry, binding) };
  }

  private async captureCorrection(candidate: LearningCandidate, delta: CurationDelta, entry: CurationDelta['entries'][number], binding: CurationBinding): Promise<LearningCaptureResult> {
    const host = correctionHosts.get(this.memory);
    if (!host || !entry.target) throw new Error('CURATION_PROMOTION_UNAVAILABLE: enable the existing experience Memory host.');
    const memory = this.memory as unknown as ExperienceMemoryService;
    const workspace = memory.registeredWorkspaceIdentity(binding.workspace);
    const root = workspace.key === 'agent-core' ? host.projectRoot : workspace.key.replace(/^registered-root:/, '');
    const session = memory.controller({ workspaceKey: workspace.name, taskId: binding.taskId, controllerId: 'learning-curation' });
    const episodeRequired = 'CURATION_EPISODE_REQUIRED: start or resume the host-bound Memory episode for this task and workspace.';
    const context = await session.getTaskContext({ budget: { maxBytes: 65536 } }).catch(error => {
      if (error instanceof Error && error.message === 'MEMORY_TASK_NOT_FOUND') throw new Error(episodeRequired);
      throw error;
    });
    if (context.status === 'insufficient-budget' || !context.data.episode || context.data.episode.taskId !== binding.taskId
      || context.data.episode.workspaceKey !== workspace.name || !['open', 'paused'].includes(context.data.episode.status))
      throw new Error(episodeRequired);
    const operation = correctionOperation(delta, entry, binding, workspace.key);
    const snapshots = await Promise.all(candidate.evidenceRefs.map(async ref => {
      const match = /^(?:file|source|verification):(.+)#(sha256:[a-f0-9]{64})$/i.exec(ref);
      if (!match) throw new Error('CURATION_WORKSPACE_FILE_EVIDENCE_REQUIRED: provide revision-pinned evidence files in this registered workspace.');
      const file = path.resolve(match[1]!), relativePath = path.relative(root, file).split(path.sep).join('/');
      if (!path.isAbsolute(match[1]!) || !memorySourcePathAllowed(relativePath))
        throw new Error('CURATION_WORKSPACE_FILE_EVIDENCE_REQUIRED: evidence must be an allowed file inside this registered workspace.');
      const snapshot = await readEvidenceSnapshot(file);
      if (snapshot.digest !== match[2]!.toLowerCase()) throw new Error('CURATION_EVIDENCE_REVISION_CHANGED');
      return { file, relativePath, snapshot };
    }));
    const validate = async () => { for (const source of snapshots) await revalidateEvidenceSnapshot(source.file, source.snapshot.identity, source.snapshot.digest); };
    const refs: SourceRef[] = [];
    for (const [index, source] of snapshots.entries()) {
      const captured = await session.captureEvidence({ operationId: `curation:${operation}:source:${index}`,
        source: { kind: 'workspace-file', relativePath: source.relativePath } });
      if (captured.availability !== 'available') throw new Error('CURATION_EVIDENCE_CAPTURE_UNAVAILABLE:' + (captured.reason ?? 'unknown'));
      refs.push(captured.source);
    }
    await validate();
    const target: SourceRef = { kind: 'memory', ...entry.target };
    // Verify visibility using exact disclosure, then use the same owner's full
    // revision record so public redaction cannot strip unaffected provenance.
    await session.expand({ source: target, view: 'record', budget: { maxBytes: 65536 } });
    const current = await memory.read(target.id, false);
    const prior = current && memorySemanticRevision(current) === target.revision ? current
      : (await memory.revisions(target.id, 8)).revisions.find(item => memorySemanticRevision(item.record) === target.revision)?.record;
    if (!prior || !prior.provenance?.workspace || memory.resolveWorkspace(prior.provenance.workspace) !== workspace.name)
      throw new Error('CURATION_TARGET_STALE_OR_UNAVAILABLE');
    if (prior.pinned) throw new Error('CURATION_PINNED_TARGET_UNSUPPORTED');
    // Rewriting temporal edges or a structured synthesis requires its dedicated owner.
    if (entry.refinement && (prior.category === 'project-synthesis' || prior.links.some(link => !['related', 'supports', 'contradicts', 'derived-from'].includes(link.type))))
      throw new Error('CURATION_TARGET_REQUIRES_SPECIALIZED_OWNER: use project synthesis or temporal consolidation.');
    const experience = entry.refinement && prior.version === 2 ? prior.experience : legacyExperience();
    const value = {
      content: candidate.content,
      title: candidate.title ?? (entry.refinement ? prior.title : undefined),
      keywords: entry.refinement ? prior.keywords : [],
      context: candidate.reuseCondition?.trim() ? contextFor(candidate) : entry.refinement ? prior.context : contextFor(candidate),
      category: entry.refinement ? prior.category : categoryFor(candidate),
      tags: [...new Set([...(entry.refinement ? prior.tags : ['learning', candidate.kind]), ...(candidate.tags ?? [])])],
      source: entry.refinement ? prior.source : { type: 'learning-review', ref: candidate.candidateId },
      provenance: entry.refinement ? prior.provenance : { workspace: workspace.name, files: [] },
      ...(entry.refinement && prior.expiresAt ? { expiresAt: prior.expiresAt } : {}),
      links: entry.refinement ? prior.links.map(({ targetId, type, strength, reason }) => ({ targetId, type, strength, reason }))
        : [{ targetId: target.id, type: 'contradicts' as const, reason: 'Sourced counterexample from Learning review' }],
      experience: { ...experience, kind: entry.refinement ? experience.kind : 'lesson' as const, sourceRefs: [...(entry.refinement ? experience.sourceRefs : []), ...refs, target],
        verification: { status: 'supported' as const, evidence: refs } },
    };
    const plan = await session.prepareConsolidation({ episodeId: context.data.episode.id, expectedRevision: context.data.episode.revision,
      operationId: 'curation:' + operation + ':prepare', proposal: { actions: [{ actionId: 'curation-' + operation,
        kind: entry.refinement ? 'amend' : 'create', ...(entry.refinement ? { target } : {}), inputRefs: [...refs, target],
        reason: `Learning ${entry.kind} for checkpoint ${delta.checkpointKey}; operation ${delta.operationId}`, value }] } });
    if (!plan.readSet.some(item => item.requireCurrent && item.source.kind === 'memory' && item.source.id === target.id && item.source.revision === target.revision))
      throw new Error('CURATION_TARGET_STALE_OR_UNAVAILABLE');
    const receipt = await host.apply(session, plan, 'curation:' + operation + ':apply', validate);
    if (receipt.canonicalRefs.length !== 1) throw new Error('CURATION_PROMOTION_RECEIPT_INVALID');
    return { id: receipt.canonicalRefs[0]!.id, raw: receipt };
  }

  async capture(candidate: LearningCandidate): Promise<LearningCaptureResult> {
    const { auditRef } = validateDecisionMetadata(candidate);
    const evidence = auditRef ?? candidate.evidenceRefs.join(', ').slice(0, 480);
    const workspace = candidate.workspace ? this.memory.resolveWorkspace(candidate.workspace) : undefined;
    const record = await this.memory.remember({
      ...(candidate.title ? { title: candidate.title } : {}),
      content: candidate.content,
      context: contextFor(candidate),
      ...(workspace !== undefined ? { provenance: { workspace, files: [] } } : {}),
      tags: [...new Set(['learning', candidate.kind, ...(candidate.tags ?? [])])],
      category: categoryFor(candidate),
      source: { type: 'learning-review', ...(evidence ? { ref: evidence } : {}) },
    });
    return { id: record.id };
  }
}
