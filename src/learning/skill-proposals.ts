import path from 'node:path';
import { lstat, mkdir, realpath } from 'node:fs/promises';
import type { LearningStateStore } from './state.js';
import type { SkillService } from '../skills/service.js';
import type { SkillProposalInput, SkillProposalRecord, SkillWorkspaceIdentity } from './skill-proposal-types.js';
import { assertLearningTextSafe } from '../memory/safety.js';
import { recheckWorkflowReport } from '../memory/workflow-verifier.js';
import { safeEvidenceRefSchema } from './evaluation.js';
import { assertProcedureCompatible, procedureBoundEvidence } from '../agent-learning-loop.js';
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
    return { ...structuredClone(item), ...(item.input.procedureFingerprint ? { procedureEvidenceAttribution: item.procedureContractDigest ? 'contract-bound' as const : 'legacy-unattributed' as const } : {}), path: path.join(this.root, proposalWorkspaceSegment(item.workspace), semanticSkillName(item.name) + '.md') };
  }
  async list(workspace: string): Promise<SkillProposalRecord[]> {
    const scope = this.resolveWorkspace(workspace), state = await this.stateStore.load();
    if (this.stateStore.getIssue()) throw new Error('SKILL_PROPOSAL_STATE_DEGRADED');
    return (state.skillProposals ?? []).filter(p => p.workspaceIdentity === scope.key).map(p => this.project(p));
  }
  /** Local dashboard reader; no publication or lifecycle mutation on polling. */
  async listForReview(): Promise<SkillProposalRecord[]> {
    const state = await this.stateStore.load();
    if (this.stateStore.getIssue()) throw new Error('SKILL_PROPOSAL_STATE_DEGRADED');
    return (state.skillProposals ?? []).filter(item => {
      try { return this.resolveWorkspace(item.workspace).key === item.workspaceIdentity; } catch { return false; }
    }).map(item => this.project(item));
  }
  /** Trusted external adapter only. Same state owner serializes this projection, never a second writer. */
  async publishExternal(input: { workspace: string; proposalId: string; revisionDigest: string }) {
    const scope = this.resolveWorkspace(input.workspace);
    const result = await this.stateStore.mutate('proposals', async state => {
      const old = state.skillProposals?.find(item => item.id === input.proposalId && item.workspaceIdentity === scope.key);
      if (!old || old.revisionDigest !== input.revisionDigest) throw new Error('SKILL_PROPOSAL_REVISION_CONFLICT');
      const projectRoot = this.skills.proposalProjectRoot();
      if (path.resolve(await realpath(projectRoot)).toLowerCase() !== projectRoot.toLowerCase()) throw new Error('SKILL_PROPOSAL_SYMLINK_REFUSED');
      let parent = projectRoot;
      for (const part of ['docs', 'proposals', 'skills']) {
        parent = path.join(parent, part);
        try { const stat = await lstat(parent); if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('SKILL_PROPOSAL_SYMLINK_REFUSED'); }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; await mkdir(parent); }
      }
      if (old.externalDocument && (!/^sha256:[a-f0-9]{64}$/.test(old.externalDocument.documentDigest)
        || !/^sha256:[a-f0-9]{64}$/.test(old.externalDocument.revisionDigest))) throw new Error('SKILL_PROPOSAL_STATE_DEGRADED');
      const projected = { ...this.project(old), path: path.join(parent, proposalWorkspaceSegment(old.workspace), semanticSkillName(old.name) + '.md'),
        previousDocumentDigest: old.externalDocument?.documentDigest };
      await writeProposalProjection(parent, projected);
      const documentDigest = proposalDigest(renderSkillProposal(projected));
      const item = { ...old, externalDocument: { revisionDigest: old.revisionDigest, documentDigest, publishedAt: new Date().toISOString() } };
      return { state: { ...state, skillProposals: state.skillProposals!.map(record => record.id === old.id ? item : record) },
        result: { proposalId: old.id, revisionDigest: old.revisionDigest, documentDigest, path: projected.path } };
    });
    return result.result;
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
      if (old && old.input.procedureFingerprint !== input.procedureFingerprint) throw new Error('SKILL_PROPOSAL_SEMANTIC_CONFLICT');
      if (procedure) {
        if (input.triggers.length !== 1) throw new Error('LEARNING_PROCEDURE_CONTRACT_CONFLICT:trigger');
        assertProcedureCompatible(procedure, { ...procedure, description: input.purpose,
          reuseCondition: input.triggers[0], steps: input.steps, allowedTools: input.allowedTools });
      }
      const targetSkillName = input.targetSkillName ?? procedure?.skillName ?? input.name;
      const active = (await this.skills.list()).find(s => s.name === targetSkillName);
      const contentKey = proposalDigest(JSON.stringify([input.name, input.purpose, input.triggers, input.nonTriggers,
        input.steps, input.allowedTools, input.expectedBenefit, input.limitations, input.implementation, input.acceptance, targetSkillName]));
      if (old && old.contentKey !== contentKey && input.expectedProposalDigest !== old.revisionDigest) throw new Error('SKILL_PROPOSAL_SEMANTIC_CONFLICT');
      const sourceTaskIds = unique([...(old?.sourceTaskIds ?? []), input.taskId, ...(procedure?.supportTaskIds ?? []), ...(procedure?.failureTaskIds ?? []), ...(procedure?.historicalTaskIds ?? [])]);
      const bound = procedure ? procedureBoundEvidence(procedure) : undefined;
      const recordedSupport = unique([...(bound?.supportTaskIds ?? old?.supportTaskIds ?? []), ...(!procedure ? trustedOutcomes?.positive ?? [] : [])]);
      const recordedFailure = unique([...(bound?.failureTaskIds ?? old?.failureTaskIds ?? []), ...(!procedure ? trustedOutcomes?.negative ?? [] : [])]);
      const evidenceRefs = unique([...(old?.evidenceRefs ?? []), ...input.evidenceRefs, ...(procedure?.evidenceRefs ?? []), ...(trustedOutcomes?.refs ?? [])]);
      const supportTaskIds: string[] = [], failureTaskIds: string[] = [];
      // Bounded fresh replay; stored counts are history, not permanent proof.
      for (const id of unique([...recordedSupport, ...recordedFailure]).slice(0, 32)) {
        if (bound) {
          for (const receipt of bound.receipts.filter(receipt => receipt.taskId === id)) {
            const verdicts = await Promise.all(receipt.evidenceRefs.map(ref => recheckWorkflowReport(ref, id)));
            if (receipt.outcome === 'verified' && verdicts.includes('pass') && !supportTaskIds.includes(id)) supportTaskIds.push(id);
            if (receipt.outcome === 'failed' && verdicts.includes('fail') && !failureTaskIds.includes(id)) failureTaskIds.push(id);
          }
        } else {
          const verdicts = await Promise.all(evidenceRefs.filter(ref => ref.startsWith('verification:')).slice(0, 32).map(ref => recheckWorkflowReport(ref, id)));
          if (recordedSupport.includes(id) && verdicts.includes('pass')) supportTaskIds.push(id);
          if (recordedFailure.includes(id) && verdicts.includes('fail')) failureTaskIds.push(id);
        }
      }
      const historicalTaskIds = unique([...(old?.historicalTaskIds ?? []), ...(procedure?.historicalTaskIds ?? []), ...(bound?.legacyTaskIds ?? []), ...recordedSupport, ...recordedFailure, input.taskId]).filter(id => !supportTaskIds.includes(id) && !failureTaskIds.includes(id));
      const qualification = procedure?.needsReview || trustedOutcomes?.negative.length || (!procedure && failureTaskIds.length) ? 'needs-review' : supportTaskIds.length >= 2 && supportTaskIds.length > failureTaskIds.length * 2 ? 'qualified' : 'awaiting-verification';
      // Compatibility rollout alone is not a new user decision or active-Skill revision.
      if (old && procedure && !bound?.receipts.length && !trustedOutcomes?.negative.length && contentKey === old.contentKey
        && (old.status === 'approved' || old.status === 'implemented' || old.artifactStatus === 'catalog-active')) {
        return { state, result: old, persist: false };
      }
      const sameEvidence = old && contentKey === old.contentKey && (procedure?.contractDigest ?? null) === (old.procedureContractDigest ?? null) && JSON.stringify([sourceTaskIds, supportTaskIds, failureTaskIds, historicalTaskIds, evidenceRefs, qualification]) === JSON.stringify([old.sourceTaskIds, old.supportTaskIds, old.failureTaskIds, old.historicalTaskIds, old.evidenceRefs, old.qualification]);
      if (sameEvidence && old.artifactStatus === 'catalog-active' && old.artifactDigest !== active?.digest) throw new Error('SKILL_PROPOSAL_ACTIVE_DRIFT');
      const replayActive = sameEvidence && old.artifactStatus === 'catalog-active';
      const revisionDigest = replayActive ? old.revisionDigest : proposalDigest(JSON.stringify([contentKey, sourceTaskIds, supportTaskIds, failureTaskIds, historicalTaskIds, evidenceRefs, qualification, active?.digest ?? null, ...(procedure?.contractDigest ? [procedure.contractDigest] : [])]));
      const changed = !old || revisionDigest !== old.revisionDigest;
      const now = new Date().toISOString();
      const item: SkillProposalRecord = {
        version: 1, id: old?.id ?? 'skill-proposal:' + proposalDigest(scope.key + '|' + input.name).slice(7, 39),
        workspace: scope.name, workspaceIdentity: scope.key, name: input.name,
        path: path.join(this.root, proposalWorkspaceSegment(scope.name), input.name + '.md'), input, contentKey, revisionDigest,
        status: changed ? 'proposed' : old.status, artifactStatus: changed ? 'not-built' : old.artifactStatus,
        ...(procedure?.contractDigest ? { procedureContractDigest: procedure.contractDigest } : {}),
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
        ...(old?.externalDocument ? { externalDocument: old.externalDocument } : {}),
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
        || proof.userEvidenceRef !== input.userEvidenceRef || proof.sessionId !== input.sessionId || proof.taskId !== input.taskId
        || proof.controllerId !== input.controllerId) throw new Error('SKILL_PROPOSAL_USER_EVIDENCE_REQUIRED');
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
