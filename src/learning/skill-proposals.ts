import path from 'node:path';
import type { LearningStateStore } from './state.js';
import type { SkillService } from '../skills/service.js';
import type { SkillProposalInput, SkillProposalRecord, SkillWorkspaceIdentity } from './skill-proposal-types.js';
import { assertLearningTextSafe } from '../memory/safety.js';
import { recheckWorkflowReport } from './workflow-verifier.js';
import { safeEvidenceRefSchema } from './evaluation.js';
import { proposalDigest, semanticSkillName, proposalWorkspaceSegment, renderSkillProposal, writeProposalProjection, proposalFileMatches } from './skill-proposal-files.js';

const unique = (values: string[]) => [...new Set(values)].sort();
function validatedInput(input: SkillProposalInput): SkillProposalInput {
  semanticSkillName(input.name);
  if (typeof input.taskId !== 'string' || input.taskId.length > 200 || /[\0\r\n]/.test(input.taskId)
    || input.sessionId !== undefined && (typeof input.sessionId !== 'string' || input.sessionId.length > 200 || /[\0\r\n]/.test(input.sessionId))) throw new Error('SKILL_PROPOSAL_TASK_INVALID');
  for (const digest of [input.procedureFingerprint, input.expectedProposalDigest]) if (digest !== undefined && !/^sha256:[a-f0-9]{64}$/.test(digest)) throw new Error('SKILL_PROPOSAL_DIGEST_INVALID');
  if (input.targetSkillName !== undefined && (typeof input.targetSkillName !== 'string' || input.targetSkillName.length > 64 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.targetSkillName))) throw new Error('SKILL_PROPOSAL_TARGET_NAME_INVALID');
  for (const key of ['workspace', 'taskId', 'purpose', 'expectedBenefit', 'implementation'] as const) {
    if (typeof input[key] !== 'string' || !input[key].trim() || input[key].length > 2000) throw new Error('SKILL_PROPOSAL_INPUT_INVALID:' + key);
  }
  for (const key of ['triggers', 'nonTriggers', 'steps', 'allowedTools', 'limitations', 'acceptance', 'evidenceRefs'] as const) {
    const items = input[key];
    if (!Array.isArray(items) || items.length > 50 || (!items.length && key !== 'allowedTools' && key !== 'evidenceRefs')
      || items.some(s => typeof s !== 'string' || !s.trim() || s.length > 2000)) throw new Error('SKILL_PROPOSAL_INPUT_INVALID:' + key);
  }
  for (const ref of input.evidenceRefs) if (!safeEvidenceRefSchema().safeParse(ref).success) throw new Error('SKILL_PROPOSAL_EVIDENCE_INVALID');
  if (JSON.stringify(input).length > 60000) throw new Error('SKILL_PROPOSAL_INPUT_TOO_LARGE');
  assertLearningTextSafe([input.purpose, ...input.triggers, ...input.nonTriggers, ...input.steps,
    input.expectedBenefit, ...input.limitations, input.implementation, ...input.acceptance].join('\n'));
  return structuredClone(input);
}
export class SkillProposalCoordinator {
  constructor(private readonly stateStore: LearningStateStore, readonly skills: SkillService,
    private readonly resolveWorkspace: (value: string) => SkillWorkspaceIdentity) {}
  get root(): string { return this.skills.proposalDirectory(); }
  project(item: SkillProposalRecord): SkillProposalRecord {
    return { ...structuredClone(item), path: path.join(this.root, proposalWorkspaceSegment(item.workspace), semanticSkillName(item.name) + '.md') };
  }
  async list(workspace: string): Promise<SkillProposalRecord[]> {
    const scope = this.resolveWorkspace(workspace), state = await this.stateStore.load();
    if (this.stateStore.getIssue()) throw new Error('SKILL_PROPOSAL_STATE_DEGRADED');
    return (state.skillProposals ?? []).filter(p => p.workspaceIdentity === scope.key).map(p => this.project(p));
  }
  async upsert(raw: SkillProposalInput, trustedOutcomes?: { positive: string[]; negative: string[]; refs: string[] }): Promise<SkillProposalRecord> {
    const input = validatedInput(raw), scope = this.resolveWorkspace(input.workspace);
    input.workspace = scope.name;
    const result = await this.stateStore.mutate('proposals', async state => {
      const records = [...(state.skillProposals ?? [])];
      const old = records.find(p => p.workspaceIdentity === scope.key && p.name === input.name);
      if (!old && records.length >= 500) throw new Error('SKILL_PROPOSAL_CAPACITY_REVIEW_REQUIRED');
      if (records.some(p => proposalWorkspaceSegment(p.workspace) === proposalWorkspaceSegment(scope.name) && p.workspaceIdentity !== scope.key)) throw new Error('SKILL_PROPOSAL_WORKSPACE_COLLISION');
      if (input.expectedProposalDigest && old?.revisionDigest !== input.expectedProposalDigest) throw new Error('SKILL_PROPOSAL_REVISION_CONFLICT');
      const procedure = input.procedureFingerprint ? state.procedures?.find(p => p.fingerprint === input.procedureFingerprint && p.workspace === scope.name) : undefined;
      if (input.procedureFingerprint && !procedure) throw new Error('SKILL_PROPOSAL_PROCEDURE_NOT_FOUND');
      const targetSkillName = input.targetSkillName ?? procedure?.skillName ?? input.name;
      const active = (await this.skills.list()).find(s => s.name === targetSkillName);
      const contentKey = proposalDigest(JSON.stringify([input.name, input.purpose, input.triggers, input.nonTriggers,
        input.steps, input.allowedTools, input.expectedBenefit, input.limitations, input.implementation, input.acceptance, targetSkillName]));
      if (old && old.contentKey !== contentKey && input.expectedProposalDigest !== old.revisionDigest) throw new Error('SKILL_PROPOSAL_SEMANTIC_CONFLICT');
      const sourceTaskIds = unique([...(old?.sourceTaskIds ?? []), input.taskId, ...(procedure?.supportTaskIds ?? []), ...(procedure?.failureTaskIds ?? []), ...(procedure?.historicalTaskIds ?? [])]);
      const recordedSupport = unique([...(procedure?.supportTaskIds ?? old?.supportTaskIds ?? []), ...(trustedOutcomes?.positive ?? [])]);
      const recordedFailure = unique([...(procedure?.failureTaskIds ?? old?.failureTaskIds ?? []), ...(trustedOutcomes?.negative ?? [])]);
      const evidenceRefs = unique([...(old?.evidenceRefs ?? []), ...input.evidenceRefs, ...(procedure?.evidenceRefs ?? []), ...(trustedOutcomes?.refs ?? [])]);
      const supportTaskIds: string[] = [], failureTaskIds: string[] = [];
      // Bounded fresh replay; stored counts are history, not permanent proof.
      for (const id of unique([...recordedSupport, ...recordedFailure]).slice(0, 32)) {
        const verdicts = await Promise.all(evidenceRefs.filter(ref => ref.startsWith('verification:')).slice(0, 32).map(ref => recheckWorkflowReport(ref, id)));
        if (recordedSupport.includes(id) && verdicts.includes('pass')) supportTaskIds.push(id);
        if (recordedFailure.includes(id) && verdicts.includes('fail')) failureTaskIds.push(id);
      }
      const historicalTaskIds = unique([...(old?.historicalTaskIds ?? []), ...(procedure?.historicalTaskIds ?? []), ...recordedSupport, ...recordedFailure, input.taskId]).filter(id => !supportTaskIds.includes(id) && !failureTaskIds.includes(id));
      const qualification = procedure?.needsReview || trustedOutcomes?.negative.length || (!procedure && failureTaskIds.length) ? 'needs-review' : supportTaskIds.length >= 2 && supportTaskIds.length > failureTaskIds.length * 2 ? 'qualified' : 'awaiting-verification';
      const sameEvidence = old && contentKey === old.contentKey && JSON.stringify([sourceTaskIds, supportTaskIds, failureTaskIds, historicalTaskIds, evidenceRefs, qualification]) === JSON.stringify([old.sourceTaskIds, old.supportTaskIds, old.failureTaskIds, old.historicalTaskIds, old.evidenceRefs, old.qualification]);
      if (sameEvidence && old.artifactStatus === 'catalog-active' && old.artifactDigest !== active?.digest) throw new Error('SKILL_PROPOSAL_ACTIVE_DRIFT');
      const replayActive = sameEvidence && old.artifactStatus === 'catalog-active';
      const revisionDigest = replayActive ? old.revisionDigest : proposalDigest(JSON.stringify([contentKey, sourceTaskIds, supportTaskIds, failureTaskIds, historicalTaskIds, evidenceRefs, qualification, active?.digest ?? null]));
      const changed = !old || revisionDigest !== old.revisionDigest;
      const now = new Date().toISOString();
      const item: SkillProposalRecord = {
        version: 1, id: old?.id ?? 'skill-proposal:' + proposalDigest(scope.key + '|' + input.name).slice(7, 39),
        workspace: scope.name, workspaceIdentity: scope.key, name: input.name,
        path: path.join(this.root, proposalWorkspaceSegment(scope.name), input.name + '.md'), input, contentKey, revisionDigest,
        status: changed ? 'proposed' : old.status, artifactStatus: changed ? 'not-built' : old.artifactStatus,
        qualification, sourceTaskIds, supportTaskIds, failureTaskIds, historicalTaskIds, evidenceRefs,
        sourceSessionIds: unique([...(old?.sourceSessionIds ?? []), ...(input.sessionId ? [input.sessionId] : [])]),
        action: changed ? active ? 'revise' : 'create' : old.action, targetSkillName,
        ...(replayActive ? old.expectedActiveDigest ? { expectedActiveDigest: old.expectedActiveDigest } : {} : active ? { expectedActiveDigest: active.digest } : {}),
        createdAt: old?.createdAt ?? now, updatedAt: changed ? now : old.updatedAt,
        notices: old?.notices ?? [], decisions: old?.decisions ?? [],
        history: old ? [...old.history, ...(changed ? [{ revisionDigest: old.revisionDigest, at: old.updatedAt, status: old.status, evidenceRefs: old.evidenceRefs }] : [])] : [],
        ...(old ? { previousDocumentDigest: proposalDigest(renderSkillProposal(old)) } : {}),
        ...(!changed && old?.artifactDigest ? { artifactDigest: old.artifactDigest, artifactPath: old.artifactPath } : {}),
        ...(!changed && old?.fulfillment ? { fulfillment: old.fulfillment } : {}),
      };
      await writeProposalProjection(this.root, item);
      return { state: { ...state, skillProposals: [...records.filter(p => p.id !== item.id), item] }, result: item };
    });
    return this.project(result.result);
  }
  async matches(item: SkillProposalRecord): Promise<boolean> { return proposalFileMatches(this.root, this.project(item)); }
  async reconcileActiveArtifacts(workspace: string): Promise<SkillProposalRecord[]> {
    const reconciled: SkillProposalRecord[] = [];
    for (const current of await this.list(workspace)) {
      if (!['proposed', 'notified', 'approved'].includes(current.status) || current.artifactStatus === 'catalog-active') continue;
      let active: Awaited<ReturnType<SkillService['inspect']>>;
      try { active = await this.skills.inspect(current.targetSkillName); }
      catch { continue; }
      const metadata = active.metadata.metadata;
      const proposalId = metadata['proposal-id'] ?? metadata['origin-proposal-id'];
      const proposalRevision = metadata['proposal-revision'] ?? metadata['origin-proposal-revision'];
      if (proposalId !== current.id || proposalRevision !== current.revisionDigest) continue;
      const evidenceRef = 'source:active-skill-provenance:' + active.name + ':' + active.digest;
      if (!safeEvidenceRefSchema().safeParse(evidenceRef).success) throw new Error('SKILL_PROPOSAL_RECONCILIATION_EVIDENCE_INVALID');
      try {
        reconciled.push(await this.update(current.workspace, current.id, current.revisionDigest, item => {
          item.status = 'implemented';
          item.artifactStatus = 'catalog-active';
          item.artifactDigest = active.digest;
          item.fulfillment = {
            revisionDigest: current.revisionDigest,
            kind: 'active-artifact-reconciliation',
            artifactDigest: active.digest,
            evidenceRef,
            at: new Date().toISOString(),
          };
        }));
      } catch {
        // Reconciliation is fail-soft: stale/tampered proposal projection must not block ordinary work.
      }
    }
    return reconciled;
  }
  async recoverArtifactProjection(input: import('./skill-proposal-decisions.js').SkillDecisionInput): Promise<SkillProposalRecord> {
    const scope = this.resolveWorkspace(input.workspace);
    const result = await this.stateStore.mutate('proposals', async state => {
      const old = state.skillProposals?.find(p => p.id === input.proposalId && p.workspaceIdentity === scope.key);
      if (!old || old.revisionDigest !== input.expectedProposalDigest) throw new Error('SKILL_PROPOSAL_REVISION_CONFLICT');
      const proof = old.decisions.filter(d => d.revisionDigest === old.revisionDigest).at(-1);
      if (!proof || proof.decision !== 'approve' || proof.decision !== input.decision || proof.scope !== input.scope
        || proof.userEvidenceRef !== input.userEvidenceRef || proof.sessionId !== input.sessionId || proof.taskId !== input.taskId) throw new Error('SKILL_PROPOSAL_USER_EVIDENCE_REQUIRED');
      const item = this.project(old);
      try { Object.assign(item, await this.skills.inspectBuiltProposal(item, proof)); }
      catch { throw new Error('SKILL_PROPOSAL_FILE_DRIFT'); }
      if (!await this.matches(item)) throw new Error('SKILL_PROPOSAL_FILE_DRIFT');
      item.updatedAt = new Date().toISOString();
      // The artifact and projection already match; reconcile only the existing state owner.
      return { state: { ...state, skillProposals: state.skillProposals!.map(p => p.id === item.id ? item : p) }, result: item };
    });
    return this.project(result.result);
  }
  async update(workspace: string, id: string, digest: string, operation: (item: SkillProposalRecord) => Promise<void> | void, projectionOnly = false): Promise<SkillProposalRecord> {
    const scope = this.resolveWorkspace(workspace);
    const result = await this.stateStore.mutate('proposals', async state => {
      const old = state.skillProposals?.find(p => p.id === id && p.workspaceIdentity === scope.key);
      if (!old || old.revisionDigest !== digest) throw new Error('SKILL_PROPOSAL_REVISION_CONFLICT');
      const item = this.project(old);
      if (!projectionOnly && !await this.matches(item)) throw new Error('SKILL_PROPOSAL_FILE_DRIFT');
      item.previousDocumentDigest = proposalDigest(renderSkillProposal(old));
      await operation(item);
      item.updatedAt = new Date().toISOString();
      await writeProposalProjection(this.root, item);
      return { state: { ...state, skillProposals: state.skillProposals!.map(p => p.id === item.id ? item : p) }, result: item };
    });
    return this.project(result.result);
  }
}
