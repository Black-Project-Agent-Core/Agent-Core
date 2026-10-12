import * as z from 'zod/v4';
import { safeEvidenceRefSchema } from '../learning/evaluation.js';

const evidenceRef = safeEvidenceRefSchema();
const evidenceRefs = z.array(evidenceRef).max(24);

export const controllerLearning = z.object({
  action: z.enum(['status', 'context', 'episode', 'artifact_receipt', 'procedure', 'evaluate']),
  workspace: z.string().min(1).max(120).optional(),
  query: z.string().min(1).max(4000).optional(),
  skillSearchMode: z.enum(['lexical', 'hybrid']).optional(),
  taskFamily: z.string().min(1).max(160).optional(),
  taskKey: z.string().min(1).max(200).optional(),
  taskId: z.string().min(1).max(200).optional(),
  cohortId: z.string().min(1).max(200).optional(),
  baselineEpisodeIds: z.array(z.string().min(1).max(200)).min(1).max(100).optional(),
  candidateEpisodeIds: z.array(z.string().min(1).max(200)).min(1).max(100).optional(),
  actionRefs: evidenceRefs.optional(),
  limit: z.number().int().min(1).max(100).optional(),

  episodeOperation: z.enum(['status', 'start', 'label', 'verify', 'recover']).optional(),
  recoverySource: z.string().min(1).max(1000).optional(),
  applyRecovery: z.boolean().optional(),
  episodeOutcome: z.enum(['verified', 'failed']).optional(),

  artifactKind: z.enum(['memory', 'pattern', 'skill', 'procedure']).optional(),
  artifactId: z.string().min(1).max(300).optional(),
  applicability: z.enum(['applied', 'adapted', 'rejected']).optional(),
  result: z.enum(['success', 'failure', 'unavailable']).optional(),
  reasonCode: z.string().regex(/^[a-z0-9][a-z0-9._-]{0,63}$/).optional(),
  summary: z.string().max(1000).optional(),
  verificationRef: evidenceRef.optional(),
  evidenceRefs: evidenceRefs.optional(),
  retrievalAttemptId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/).optional(),
  memoryId: z.string().min(1).max(128).optional(),
  contentDigest: z.string().regex(/^sha256:[0-9a-fA-F]{64}$/).optional(),
  memoryFeedback: z.enum(['helpful', 'not-helpful']).optional(),

  procedureOperation: z.enum(['propose', 'list', 'inspect', 'outcome']).optional(),
  fingerprint: z.string().regex(/^sha256:[0-9a-fA-F]{64}$/).optional(),
  name: z.string().min(1).max(160).optional(),
  description: z.string().min(1).max(2000).optional(),
  steps: z.array(z.string().min(1).max(2000)).max(50).optional(),
  allowedTools: z.array(z.string().min(1).max(120)).max(64).optional(),
  reuseCondition: z.string().min(1).max(2000).optional(),
}).superRefine((value, ctx) => {
  if (value.skillSearchMode !== undefined && value.action !== 'context') {
    ctx.addIssue({ code: 'custom', path: ['skillSearchMode'], message: 'skillSearchMode is only valid for context' });
  }
  if (value.skillSearchMode === 'hybrid' && !value.query?.trim()) {
    ctx.addIssue({ code: 'custom', path: ['query'], message: 'Nonblank query required for hybrid Skill search' });
  }
  if (value.memoryFeedback !== undefined && (value.action !== 'artifact_receipt' || value.artifactKind !== 'memory'
    || value.applicability === 'rejected' || value.result === 'unavailable')) {
    ctx.addIssue({ code: 'custom', path: ['memoryFeedback'], message: 'memoryFeedback requires an applied/adapted Memory receipt with verified outcome' });
  }
  if (value.action === 'episode') {
    const operation = value.episodeOperation ?? 'status';
    if (operation === 'verify' && (!value.episodeOutcome || !value.verificationRef)) {
      ctx.addIssue({ code: 'custom', message: 'episode verify requires episodeOutcome and verificationRef' });
    }
  }

  if (value.action === 'artifact_receipt') {
    for (const key of ['artifactKind', 'artifactId', 'applicability', 'result', 'reasonCode'] as const) {
      if (value[key] === undefined) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: key + ' required for artifact_receipt',
        });
      }
    }
    if ((value.result === 'success' || value.result === 'failure') && !value.verificationRef) {
      ctx.addIssue({
        code: 'custom',
        path: ['verificationRef'],
        message: 'verified artifact result requires verificationRef',
      });
    }
    if (value.artifactKind === 'memory') {
      for (const key of ['retrievalAttemptId', 'memoryId', 'contentDigest'] as const) {
        if (value[key] === undefined) {
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: key + ' required for memory receipt',
          });
        }
      }
    }
  }

  if (value.action === 'procedure') {
    const operation = value.procedureOperation ?? 'list';
    if (operation === 'inspect' && !value.fingerprint) {
      ctx.addIssue({
        code: 'custom',
        path: ['fingerprint'],
        message: 'fingerprint required for procedure inspect',
      });
    }
    if (
      operation === 'outcome'
      && (!value.fingerprint || !value.result || value.result === 'unavailable' || !value.verificationRef)
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'procedure outcome requires fingerprint, success/failure result, and verificationRef',
      });
    }
    if (operation === 'propose') {
      if (!value.name || !value.description || !value.steps?.length || !value.verificationRef) {
        ctx.addIssue({
          code: 'custom',
          message: 'procedure propose requires name, description, steps, and verificationRef',
        });
      }
    }
  }
});
