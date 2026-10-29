import type { SkillProposalCoordinator } from './skill-proposals.js';
import type { SkillProposalDecision, SkillProposalRecord } from './skill-proposal-types.js';
export interface SkillDecisionInput {
  workspace: string; proposalId: string; expectedProposalDigest: string;
  decision: SkillProposalDecision['decision']; scope: SkillProposalDecision['scope'];
  userEvidenceRef: string; sessionId: string; taskId: string;
  controllerId?: string;
}
function checkDecision(input: SkillDecisionInput): void {
  if (!['approve', 'revise', 'reject', 'defer'].includes(input.decision)
    || !['build', 'build-and-activate'].includes(input.scope)
    || !(input.controllerId ? /^controller-decision:[a-f0-9]{64}$/ : /^user-message:[a-zA-Z0-9._:-]{1,200}$/).test(input.userEvidenceRef)
    || (input.controllerId !== undefined && (!input.controllerId.trim() || input.controllerId.length > 128 || /[\x00-\x1f\x7f]/.test(input.controllerId)))
    || !input.sessionId || input.sessionId.length > 200 || !input.taskId || input.taskId.length > 200) throw new Error('SKILL_PROPOSAL_USER_EVIDENCE_INVALID');
}
/** Host-only. Caller must have persisted this actual user message; never expose as an MCP action. */
export async function recordUserSkillDecision(coordinator: SkillProposalCoordinator, input: SkillDecisionInput): Promise<SkillProposalRecord> {
  if (input.controllerId !== undefined) throw new Error('SKILL_PROPOSAL_USER_EVIDENCE_INVALID');
  return recordDecision(coordinator, input);
}
/** Host-only: the authenticated MCP ingress checks the live approver allowlist before calling this. */
export async function recordControllerSkillDecision(coordinator: SkillProposalCoordinator, input: SkillDecisionInput): Promise<SkillProposalRecord> {
  if (!input.controllerId) throw new Error('SKILL_PROPOSAL_CONTROLLER_IDENTITY_REQUIRED');
  return recordDecision(coordinator, input);
}
async function recordDecision(coordinator: SkillProposalCoordinator, input: SkillDecisionInput): Promise<SkillProposalRecord> {
  checkDecision(input);
  return coordinator.update(input.workspace, input.proposalId, input.expectedProposalDigest, item => {
    const existing = item.decisions.find(d => d.userEvidenceRef === input.userEvidenceRef);
    const next: SkillProposalDecision = { revisionDigest: input.expectedProposalDigest, decision: input.decision,
      scope: input.scope, userEvidenceRef: input.userEvidenceRef, sessionId: input.sessionId, taskId: input.taskId, at: new Date().toISOString(),
      ...(input.controllerId ? { controllerId: input.controllerId } : {}) };
    if (existing) {
      if (Object.keys(next).some(k => k !== 'at' && existing[k as keyof SkillProposalDecision] !== next[k as keyof SkillProposalDecision])) throw new Error('SKILL_PROPOSAL_USER_EVIDENCE_CONFLICT');
      return;
    }
    item.decisions.push(next);
    item.status = { approve: 'approved', revise: 'changes-requested', reject: 'rejected', defer: 'deferred' }[input.decision] as SkillProposalRecord['status'];
  }, true);
}
export async function decideSkillProposal(coordinator: SkillProposalCoordinator, input: SkillDecisionInput): Promise<SkillProposalRecord> {
  checkDecision(input);
  try { return await coordinator.update(input.workspace, input.proposalId, input.expectedProposalDigest, async item => {
    const latest = item.decisions.filter(d => d.revisionDigest === item.revisionDigest).at(-1);
    if (!latest || latest.userEvidenceRef !== input.userEvidenceRef || latest.decision !== input.decision
      || latest.scope !== input.scope || latest.sessionId !== input.sessionId || latest.taskId !== input.taskId
      || latest.controllerId !== input.controllerId) throw new Error('SKILL_PROPOSAL_USER_EVIDENCE_REQUIRED');
    if (input.decision !== 'approve') return;
    if (item.artifactStatus === 'catalog-active') {
      const active = await coordinator.skills.inspect(item.targetSkillName);
      if (active.digest !== item.artifactDigest) throw new Error('SKILL_PROPOSAL_ACTIVE_DRIFT');
      return;
    }
    if (item.status !== 'approved') throw new Error('SKILL_PROPOSAL_APPROVAL_INACTIVE');
    const artifact = await coordinator.skills.buildApprovedProposal(item, latest);
    Object.assign(item, artifact);
  }); } catch (error) {
    if (!(error instanceof Error) || error.message !== 'SKILL_PROPOSAL_FILE_DRIFT') throw error;
    return coordinator.recoverArtifactProjection(input);
  }
}
export function isUserSkillCommand(prompt: string): boolean { return /^(?:\/skill\s+)?(?:approve|setujui|build|buat|revise|revisi|reject|tolak|defer|nanti)\s/i.test(prompt.trim()); }
export async function applyUserSkillCommand(coordinator: SkillProposalCoordinator, input: {
  workspace: string; sessionId: string; taskId: string; userEvidenceRef: string; prompt: string;
}): Promise<SkillProposalRecord | null> {
  const match = /^(?:\/skill\s+)?(approve|setujui|build|buat|revise|revisi|reject|tolak|defer|nanti)(?:\s+(?:and|dan)\s+(activate|aktifkan))?\s+([a-z][a-z0-9-]*)(?:\s+(sha256:[a-f0-9]{64}))?\s*$/i.exec(input.prompt.trim());
  if (!match) return null;
  if (match[2] && !['approve', 'setujui', 'build', 'buat'].includes(match[1].toLowerCase())) throw new Error('SKILL_PROPOSAL_AMBIGUOUS_DECISION');
  const item = (await coordinator.list(input.workspace)).find(p => p.name === match[3].toLowerCase());
  if (!item) {
    // Bare requests such as "buat ringkasan" are normal work, not failed Skill commands.
    if (!/^\/skill\s/i.test(input.prompt.trim()) && !match[4]) return null;
    throw new Error('SKILL_PROPOSAL_NOT_FOUND');
  }
  const digest = match[4] ?? item.notices.filter(n => n.sessionId === input.sessionId && n.revisionDigest === item.revisionDigest).at(-1)?.revisionDigest;
  if (!digest) throw new Error('SKILL_PROPOSAL_EXACT_REVISION_REQUIRED');
  const decision = ({ approve: 'approve', setujui: 'approve', build: 'approve', buat: 'approve', revise: 'revise', revisi: 'revise', reject: 'reject', tolak: 'reject', defer: 'defer', nanti: 'defer' } as const)[match[1].toLowerCase() as 'approve'];
  const choice: SkillDecisionInput = { ...input, proposalId: item.id, expectedProposalDigest: digest, decision, scope: match[2] ? 'build-and-activate' : 'build' };
  await recordUserSkillDecision(coordinator, choice);
  return decideSkillProposal(coordinator, choice);
}
