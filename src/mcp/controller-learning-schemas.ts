import * as z from 'zod/v4';
import { safeEvidenceRefSchema } from '../learning/evaluation.js';
import { retrievalPlanSchema } from '../memory/subquestion-retrieval.js';

const evidenceRef = safeEvidenceRefSchema();
const evidenceRefs = z.array(evidenceRef).max(24);

export const controllerLearning = z.object({
  action: z.enum(['status', 'context', 'episode', 'artifact_receipt', 'procedure', 'evaluate', 'improvement']),
  payload: z.record(z.string(), z.unknown()).optional(),
  workspace: z.string().min(1).max(120).optional(),
  query: z.string().min(1).max(4000).optional(),
  skillSearchMode: z.enum(['lexical', 'hybrid']).optional(),
  retrievalPlan: retrievalPlanSchema.optional(),
  browserObservation: z.object({ sessionId:z.string().uuid(), observationId:z.string().uuid() }).strict().optional(),
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
  if (value.payload !== undefined && !['improvement', 'evaluate', 'procedure'].includes(value.action))
    ctx.addIssue({ code: 'custom', path: ['payload'], message: 'payload only valid for improvement, evaluate or procedure' });
  if (value.action === 'improvement' && (!value.taskId?.trim() || !value.payload))
    ctx.addIssue({ code: 'custom', path: ['payload'], message: 'improvement requires payload and host taskId' });
  if (value.browserObservation !== undefined && !(value.action === 'context'
    || value.action === 'procedure' && value.procedureOperation === 'inspect')) {
    ctx.addIssue({ code:'custom',path:['browserObservation'],
      message:'browserObservation only valid for context or procedure inspect' });
  }
  if (value.retrievalPlan !== undefined) {
    if (value.action !== 'context') ctx.addIssue({ code: 'custom', path: ['retrievalPlan'], message: 'retrievalPlan is only valid for context' });
    if (!value.taskId?.trim()) ctx.addIssue({ code: 'custom', path: ['taskId'], message: 'taskId required for planned context' });
    if (!value.query?.trim() || value.query.trim() !== value.retrievalPlan.rootQuery) ctx.addIssue({ code: 'custom', path: ['query'], message: 'query must match retrievalPlan.rootQuery' });
    if (value.retrievalPlan.questions.length < 2) ctx.addIssue({ code: 'custom', path: ['retrievalPlan', 'questions'], message: 'planned context needs 2–4 subquestions' });
    if (value.limit !== undefined && value.limit > 8) ctx.addIssue({ code: 'custom', path: ['limit'], message: 'planned per-recall limit must be 1–8' });
  }
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
    if (operation === 'verify' && (!value.taskId?.trim() || value.taskId !== value.taskId.trim())) {
      ctx.addIssue({ code: 'custom', path: ['taskId'], message: 'episode verify requires the exact host-returned taskId' });
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
    if (value.payload !== undefined && (operation !== 'propose' || !value.taskId?.trim()))
      ctx.addIssue({code:'custom',path:['payload'],message:'structured procedure requires propose and host taskId'});
    if (value.payload !== undefined && [value.description,value.steps,value.allowedTools,value.reuseCondition].some(item=>item!==undefined))
      ctx.addIssue({code:'custom',path:['payload'],message:'structured payload cannot be mixed with legacy contract fields'});
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
      if (!value.name || (!value.payload && (!value.description || !value.steps?.length)) || !value.verificationRef) {
        ctx.addIssue({
          code: 'custom',
          message: 'procedure propose requires name, description, steps, and verificationRef',
        });
      }
    }
  }
});
