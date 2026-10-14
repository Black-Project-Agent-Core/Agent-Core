import type { z } from 'zod/v4';
import type { LearningService } from '../learning/service.js';
import type { ExternalControllerLearningService } from '../learning/external-controller.js';
import type { skills } from './skills-schemas.js';
export const PROPOSAL_ACTIONS = new Set(['proposals', 'propose', 'decide_proposal', 'self_awareness', 'explain_improvement', 'review_outcomes']);
export async function runSkillProposalAction(input: z.infer<typeof skills>, context: {
  learning?: LearningService; external?: ExternalControllerLearningService; sessionId?: string; nativeTaskId?: string; nativeWorkspace?: string;
}) {
  const learning = context.learning;
  if (!learning) throw new Error('SKILL_PROPOSALS_UNAVAILABLE');
  const episode = context.external && context.sessionId ? await context.external.getEpisode(context.sessionId) : null;
  const workspace = input.workspace ?? context.nativeWorkspace ?? episode?.workspace ?? 'agent-core';
  if (input.action === 'proposals') return { items: await learning.skillProposals(workspace), executionAuthority: false };
  if (input.action === 'self_awareness') return learning.selfAwareness(workspace, input.questionType);
  if (input.action === 'explain_improvement') return learning.explainImprovement({ workspace, proposalId: input.proposalId, skillName: input.name, revisionDigest: input.proposalDigest });
  if (input.action === 'review_outcomes') return learning.reviewSkillOutcomes(workspace);
  if (input.action === 'propose') {
    const taskId = context.nativeTaskId ?? episode?.id;
    if (!taskId) throw new Error('SKILL_PROPOSAL_TASK_IDENTITY_REQUIRED');
    return learning.upsertSkillProposal({ ...input.proposal!, workspace, taskId,
      sessionId: context.sessionId, expectedProposalDigest: input.proposalDigest });
  }
  if (input.action === 'decide_proposal') {
    const item = (await learning.skillProposals(workspace)).find(p => p.id === input.proposalId);
    const proof = item?.decisions.find(d => d.userEvidenceRef === input.userEvidenceRef && d.revisionDigest === input.proposalDigest);
    if (!proof) throw new Error('SKILL_PROPOSAL_USER_EVIDENCE_REQUIRED: use an actual Native user message for this exact proposal revision.');
    return learning.decideSkillProposal({ workspace, proposalId: input.proposalId!, expectedProposalDigest: input.proposalDigest!,
      decision: input.decision!, scope: input.decisionScope!, userEvidenceRef: proof.userEvidenceRef, sessionId: proof.sessionId, taskId: proof.taskId });
  }
  throw new Error('SKILL_PROPOSAL_ACTION_INVALID');
}
