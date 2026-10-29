import type { LearningCheckpointInput, LearningCheckpointResult } from './types.js';

/** Shared controller behavior; it never selects an improvement or authorizes execution. */
export const IMPROVEMENT_HANDOFF_CONTRACT = [
  'For a substantial task, assess improvement opportunities from evidence already observed while doing the authorized work.',
  'Offer at most one material opportunity without waiting to be asked. If no supported gap exists, finish without a proposal.',
  'Check the current source owner and existing docs/proposals before claiming a missing capability; reuse or revise an existing proposal instead of duplicating it.',
  'For a supported opportunity, use the existing file tools to create or update a title-matched Markdown proposal in docs/proposals and read it back.',
  'In the same user response state the observation and evidence limits, existing owner, smallest change, expected benefit, scope, risks and verification plan; link the proposal and request APPROVE / REVISE / HOLD / REJECT for the exact scope.',
  'Proposal delivery is not implementation, verified benefit or permission. Preserve HOLD and REJECT decisions. Do not scan, benchmark, modify source, activate a Skill or start background work merely to find or execute an improvement.',
  'Use existing Skill proposals for Skill work. This completion review does not implement the deferred Invocate questionnaire or add another Memory/Learning owner.',
  'Without an isolated contrast, simultaneous component changes have confounded attribution; lessons relying only on that evidence remain awaiting-verification.',
].join('\n');

export function improvementHandoff(input: LearningCheckpointInput, result: LearningCheckpointResult) {
  if (!result.advanced || input.meaningful === false || input.reason === 'status') return undefined;
  const evidenceRefs = input.evidenceRefs ?? [];
  return {
    status: evidenceRefs.length ? 'assess-observed-evidence' : 'insufficient-evidence',
    taskId: input.taskId,
    evidenceRefs,
    maxProposals: 1,
    proposalRequired: false,
    executionAuthority: false,
    instructions: IMPROVEMENT_HANDOFF_CONTRACT,
  };
}
