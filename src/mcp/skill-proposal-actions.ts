import type { z } from 'zod/v4';
import type { LearningService } from '../learning/service.js';
import type { ExternalControllerLearningService } from '../learning/external-controller.js';
import type { skills } from './skills-schemas.js';
import type { SkillProposalRecord } from '../learning/skill-proposal-types.js';
export const PROPOSAL_ACTIONS = new Set(['proposals', 'propose', 'decide_proposal', 'self_awareness', 'explain_improvement', 'review_outcomes']);
export async function runSkillProposalAction(input: z.infer<typeof skills>, context: {
  learning?: LearningService; external?: ExternalControllerLearningService; sessionId?: string; nativeTaskId?: string; nativeWorkspace?: string;
}) {
  const learning = context.learning;
  if (!learning) throw new Error('SKILL_PROPOSALS_UNAVAILABLE');
  const episode = context.external && context.sessionId ? await context.external.getEpisode(context.sessionId) : null;
  const workspace = input.workspace ?? context.nativeWorkspace ?? episode?.workspace ?? 'agent-core';
  const publishExternal = async (item: SkillProposalRecord) => {
    if (context.nativeTaskId) return item;
    const published = await learning.publishExternalSkillProposal({ workspace, proposalId: item.id, revisionDigest: item.revisionDigest });
    return { ...item, path: published.path, canonicalPath: item.path, documentDigest: published.documentDigest, projection: 'external-docs' as const };
  };
  if (input.action === 'proposals') {
    const items = await learning.skillProposals(workspace);
    if (context.nativeTaskId) return { items, executionAuthority: false };
    const documents = await learning.proposalDocuments().list();
    return { items: items.map(item => {
      const document = documents.items.find(candidate => candidate.id === item.id && candidate.projection === 'external-docs');
      return document ? { ...item, path: document.path, canonicalPath: item.path, documentDigest: document.documentDigest,
        documentStatus: document.readStatus, projection: document.projection } : item;
    }), reviewGuide: learning.proposalReviewGuide(), documentWarnings: documents.warnings, executionAuthority: false };
  }
  if (input.action === 'self_awareness') return learning.selfAwareness(workspace, input.questionType);
  if (input.action === 'explain_improvement') return learning.explainImprovement({ workspace, proposalId: input.proposalId, skillName: input.name, revisionDigest: input.proposalDigest });
  if (input.action === 'review_outcomes') {
    const result = await learning.reviewSkillOutcomes(workspace);
    if (!context.nativeTaskId) for (const recommendation of result.recommendations) {
      if (!recommendation.proposalId) continue;
      const item = (await learning.skillProposals(workspace)).find(candidate => candidate.id === recommendation.proposalId);
      if (item) await publishExternal(item);
    }
    return result;
  }
  if (input.action === 'propose') {
    const taskId = context.nativeTaskId ?? episode?.id;
    if (!taskId) throw new Error('SKILL_PROPOSAL_TASK_IDENTITY_REQUIRED');
    return publishExternal(await learning.upsertSkillProposal({ ...input.proposal!, workspace, taskId,
      sessionId: context.sessionId, expectedProposalDigest: input.proposalDigest }));
  }
  if (input.action === 'decide_proposal') {
    const item = (await learning.skillProposals(workspace)).find(p => p.id === input.proposalId);
    const proof = item?.decisions.find(d => d.userEvidenceRef === input.userEvidenceRef && d.revisionDigest === input.proposalDigest);
    if (!proof) throw new Error('SKILL_PROPOSAL_USER_EVIDENCE_REQUIRED: use an actual Native user message for this exact proposal revision.');
    return publishExternal(await learning.decideSkillProposal({ workspace, proposalId: input.proposalId!, expectedProposalDigest: input.proposalDigest!,
      decision: input.decision!, scope: input.decisionScope!, userEvidenceRef: proof.userEvidenceRef, sessionId: proof.sessionId, taskId: proof.taskId }));
  }
  throw new Error('SKILL_PROPOSAL_ACTION_INVALID');
}
