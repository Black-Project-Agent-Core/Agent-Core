import type { SkillProposalCoordinator } from './skill-proposals.js';
import { resolveWorkflowEvidence } from './workflow-evidence.js';
import { skillUseTrace } from './skill-outcome-review.js';
import { recheckWorkflowReport } from '../memory/workflow-verifier.js';
export async function explainImprovement(coordinator: SkillProposalCoordinator, input: {
  workspace: string; proposalId?: string; skillName?: string; revisionDigest?: string;
}) {
  const item = (await coordinator.list(input.workspace)).find(p => input.proposalId ? p.id === input.proposalId : p.targetSkillName === input.skillName);
  if (!item) throw new Error('SKILL_PROPOSAL_NOT_FOUND');
  if (input.revisionDigest && input.revisionDigest !== item.revisionDigest) throw new Error('SKILL_PROPOSAL_REVISION_CONFLICT');
  const current = await coordinator.matches(item);
  const evidence = await Promise.all(item.evidenceRefs.slice(0, 32).map(async ref => {
    try { return await resolveWorkflowEvidence(ref); }
    catch { return { ref, status: 'unavailable' as const, semanticSupport: 'not-established' as const, reason: 'reader-unavailable' }; }
  }));
  const missingLinks = evidence.filter(e => e.status !== 'resolved').map(e => e.ref);
  const currentNotices = item.notices.filter(n => n.revisionDigest === item.revisionDigest);
  const currentDecisions = item.decisions.filter(d => d.revisionDigest === item.revisionDigest);
  const support: string[] = [], failures: string[] = [];
  const recorded = [...new Set([...item.supportTaskIds, ...item.failureTaskIds])];
  const verificationRefs = item.evidenceRefs.filter(ref => ref.startsWith('verification:')).slice(0, 32);
  for (const taskId of recorded.slice(0, 32)) {
    const verdicts = await Promise.all(verificationRefs.map(ref => recheckWorkflowReport(ref, taskId).catch(() => 'unavailable')));
    if (item.supportTaskIds.includes(taskId) && verdicts.includes('pass')) support.push(taskId);
    if (item.failureTaskIds.includes(taskId) && verdicts.includes('fail')) failures.push(taskId);
    if (!support.includes(taskId) && !failures.includes(taskId)) missingLinks.push('task-proof:' + taskId);
  }
  const historicalUnknown = [...new Set([...item.historicalTaskIds, ...recorded.filter(id => !support.includes(id) && !failures.includes(id))])];
  if (!current) missingLinks.push('proposal-file-drift');
  if (!currentDecisions.length && !item.fulfillment) missingLinks.push('user-decision');
  if (item.artifactStatus !== 'catalog-active') missingLinks.push('active-skill');
  const laterUse = await skillUseTrace({ workspace: item.workspace, skillName: item.targetSkillName, artifactDigest: item.artifactDigest ?? item.expectedActiveDigest });
  if (!laterUse.length) missingLinks.push('later-use-receipt-unavailable');
  for (const use of laterUse) if (use.evidenceStatus === 'unavailable') missingLinks.push('artifact-use:' + use.taskId);
  missingLinks.push('causal-benefit-evaluation');
  return { proposalId: item.id, revisionDigest: item.revisionDigest, workspace: item.workspace,
    observedAt: new Date().toISOString(), status: item.status, proposalFile: current ? 'current' : 'stale',
    sourceTasks: item.sourceTaskIds, independentlyVerifiedSupport: support, failures,
    recordedSupport: item.supportTaskIds, recordedFailures: item.failureTaskIds,
    proofTasksOmitted: Math.max(0, recorded.length - 32),
    historicalUnknown, evidence, evidenceOmitted: Math.max(0, item.evidenceRefs.length - evidence.length),
    userDecisions: item.decisions.slice(-32), fulfillment: item.fulfillment ?? null,
    revisionHistory: item.history.slice(-32), artifactStatus: item.artifactStatus,
    omittedDecisions: Math.max(0, item.decisions.length - 32), omittedRevisions: Math.max(0, item.history.length - 32),
    artifactDigest: item.artifactDigest ?? null, notices: item.notices.slice(-32), laterUse,
    useCoverage: 'At most 128 scoped events over 90 days, 32 distinct uses; absence is not proof of no prior use.',
    delivery: item.status === 'implemented' ? 'fulfilled' : currentNotices.length ? 'included-but-unconfirmed' : 'pending',
    expectedBenefit: item.input.expectedBenefit, measuredImprovement: 'unavailable', missingLinks,
    caveat: 'Resolvable bytes or recorded outcomes are not proof of semantic correctness, user reading, or causal improvement.' };
}
