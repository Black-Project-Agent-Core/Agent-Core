import * as z from 'zod/v4';

const digest = z.string().regex(/^sha256:[0-9a-fA-F]{64}$/);
const evidenceRefs = z.array(z.string().min(1).max(500)).min(1).max(32);
const lines = z.array(z.string().min(1).max(2000)).min(1).max(50);
export const skillProposalDraft = z.object({
  name: z.string().min(1).max(64), purpose: z.string().min(1).max(2000),
  triggers: lines, nonTriggers: lines, steps: lines, allowedTools: z.array(z.string().min(1).max(120)).max(50),
  expectedBenefit: z.string().min(1).max(2000), limitations: lines,
  implementation: z.string().min(1).max(2000), acceptance: lines,
  evidenceRefs: z.array(z.string().min(1).max(500)).max(32).default([]),
  procedureFingerprint: digest.optional(), targetSkillName: z.string().min(1).max(64).optional(),
}).strict();

export const skills = z.object({
  action: z.enum([
    'status', 'list', 'inspect', 'search', 'read', 'validate', 'import', 'package', 'render_export',
    'stage_revision', 'list_revisions', 'promote_revision', 'rollback_revision',
    'proposals', 'propose', 'decide_proposal', 'self_awareness', 'explain_improvement', 'review_outcomes',
  ]),
  workspace: z.string().min(1).max(120).optional(),
  query: z.string().min(1).max(4000).optional(),
  limit: z.number().int().min(1).max(8).optional(),
  searchMode: z.enum(['lexical', 'hybrid']).optional(),
  offset: z.number().int().min(0).optional(),
  maxBytes: z.number().int().min(512).max(32768).optional(),
  proposalId: z.string().min(1).max(128).optional(),
  proposalDigest: digest.optional(),
  proposal: skillProposalDraft.optional(),
  decision: z.enum(['approve', 'revise', 'reject', 'defer']).optional(),
  decisionScope: z.enum(['build', 'build-and-activate']).optional(),
  userEvidenceRef: z.string().regex(/^user-message:[a-zA-Z0-9._:-]{1,200}$/).optional(),
  questionType: z.enum(['capabilities', 'skills', 'memory', 'learning', 'connections', 'identity', 'rules', 'built-items', 'user-knowledge']).optional(),
  name: z.string().min(1).max(64).optional(),
  profile: z.enum(['claude', 'codex']).optional(),
  sourcePath: z.string().min(1).max(4000).optional(),
  resourcePath: z.string().min(1).max(400).optional(), // read-only packaged references/ path
  evidenceRefs: evidenceRefs.optional(),
  candidateDigest: digest.optional(),
  targetDigest: digest.optional(),
  expectedActiveDigest: digest.optional(),
  confirmation: z.string().min(1).max(100).optional(),
  sourceChangeConfirmation: z.string().min(1).max(100).optional(),
}).superRefine((value, ctx) => {
  if (value.action === 'search' && !value.query?.trim()) {
    ctx.addIssue({ code: 'custom', path: ['query'], message: 'Nonblank query required for search' });
  }
  for (const key of ['query', 'limit', 'searchMode'] as const) {
    if (value.action !== 'search' && value[key] !== undefined) {
      ctx.addIssue({ code: 'custom', path: [key], message: key + ' is only valid for search' });
    }
  }
  for (const key of ['offset', 'maxBytes'] as const) {
    if (value.action !== 'read' && value[key] !== undefined) {
      ctx.addIssue({ code: 'custom', path: [key], message: key + ' is only valid for read' });
    }
  }
  if (value.action !== 'read' && value.resourcePath !== undefined) {
    ctx.addIssue({ code: 'custom', path: ['resourcePath'], message: 'resourcePath is only valid for read' });
  }
  if (value.action === 'read' && value.sourcePath !== undefined) {
    ctx.addIssue({ code: 'custom', path: ['sourcePath'], message: 'Use resourcePath for packaged reference reads' });
  }
  if (value.action === 'read' && !value.expectedActiveDigest) {
    ctx.addIssue({ code: 'custom', path: ['expectedActiveDigest'], message: 'Selected active digest required for read' });
  }
  if (value.action === 'propose' && !value.proposal) ctx.addIssue({ code: 'custom', message: 'proposal draft required' });
  if (value.action === 'decide_proposal') {
    const delegated = value.confirmation === 'APPROVE_SKILL_PROPOSAL';
    if (!value.proposalId || !value.proposalDigest || !value.decision || !value.decisionScope
      || (!delegated && !value.userEvidenceRef) || (delegated && (value.userEvidenceRef !== undefined || value.decision !== 'approve')))
      ctx.addIssue({ code: 'custom', message: 'Exact revision/scope and Native user proof or APPROVE_SKILL_PROPOSAL from an allowlisted controller required.' });
  }
  if (value.action === 'explain_improvement' && !value.proposalId && !value.name) ctx.addIssue({ code: 'custom', message: 'proposalId or name required' });
  if (['inspect', 'read', 'package', 'render_export', 'list_revisions', 'promote_revision', 'rollback_revision'].includes(value.action) && !value.name) {
    ctx.addIssue({ code: 'custom', message: 'name required for this action' });
  }
  if (value.action === 'render_export' && !value.profile) {
    ctx.addIssue({ code: 'custom', message: 'profile required for render_export' });
  }
  if (value.action !== 'render_export' && value.profile !== undefined) {
    ctx.addIssue({ code: 'custom', message: 'profile is only valid for render_export' });
  }
  if (['validate', 'import', 'stage_revision'].includes(value.action) && !value.sourcePath) {
    ctx.addIssue({ code: 'custom', message: 'sourcePath required for this action' });
  }
  if (value.action === 'stage_revision' && !value.evidenceRefs?.length) {
    ctx.addIssue({ code: 'custom', message: 'evidenceRefs required for stage_revision' });
  }
  if (value.action === 'promote_revision') {
    if (!value.candidateDigest || !value.expectedActiveDigest || value.confirmation !== 'PROMOTE_SKILL_REVISION') {
      ctx.addIssue({ code: 'custom', message: 'candidateDigest, expectedActiveDigest, and PROMOTE_SKILL_REVISION confirmation required' });
    }
  }
  if (value.action === 'rollback_revision') {
    if (!value.targetDigest || !value.expectedActiveDigest || value.confirmation !== 'ROLLBACK_SKILL_REVISION') {
      ctx.addIssue({ code: 'custom', message: 'targetDigest, expectedActiveDigest, and ROLLBACK_SKILL_REVISION confirmation required' });
    }
  }
});
