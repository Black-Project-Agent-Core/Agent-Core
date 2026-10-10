import type { SkillProposalCoordinator } from './skill-proposals.js';
import { activityTracker } from '../tracker/activity-tracker.js';
import { validateWorkflowUse } from './workflow-evidence.js';
export interface SkillOutcomeInput {
  workspace: string; skillName: string; revisionDigest: string; taskId: string;
  outcome: 'success' | 'failure'; applicability: 'applied' | 'adapted';
  verificationRef: string; evidenceRefs: string[]; actionRefs?: string[];
}
export async function recordSkillOutcome(coordinator: SkillProposalCoordinator, input: SkillOutcomeInput) {
  const active = await coordinator.skills.inspect(input.skillName).catch(() => undefined);
  if (!active || active.digest !== input.revisionDigest) throw new Error('SKILL_OUTCOME_ACTIVE_REVISION_REQUIRED');
  const proof = await validateWorkflowUse(input);
  if (proof.status !== 'resolved' || proof.verification !== (input.outcome === 'success' ? 'pass' : 'fail')) throw new Error('SKILL_OUTCOME_EVIDENCE_REQUIRED');
  activityTracker.recordOutcome('LEARNING', input.outcome === 'success' ? 'success' : 'warn', 'Verified task outcome using a Skill revision',
    { featureId: 'skill:' + input.skillName, outcome: input.outcome, properties: { kind: 'skill', applicability: input.applicability } },
    'skill-proposal-use-outcome', { workspace: input.workspace, taskId: input.taskId, artifactKind: 'skill', artifactId: input.skillName,
      contentDigest: input.revisionDigest, evidenceValidation: proof.status, semanticSupport: 'not-established',
      actionRefs: input.actionRefs, verificationRef: input.verificationRef });
  return { recorded: true, semanticSupport: 'not-established' };
}
export async function reviewSkillOutcomes(coordinator: SkillProposalCoordinator, workspace: string) {
  const proposals = await coordinator.list(workspace), active = await coordinator.skills.list();
  const events = activityTracker.readFeatureOutcomes({ workspace, maxEvents: 128, maxAgeMs: 90 * 86400000 });
  const bySkill = new Map<string, { positive: Set<string>; negative: Set<string>; refs: Set<string>; actions: Set<string> }>();
  let excluded = 0; const seen = new Set<string>();
  for (const event of events) {
    const c = event.context, feature = event.featureOutcome;
    if (c?.artifactKind !== 'skill' || c.evidenceValidation !== 'resolved' || !feature
      || typeof c.artifactId !== 'string' || typeof c.contentDigest !== 'string' || typeof c.taskId !== 'string'
      || typeof c.verificationRef !== 'string' || !Array.isArray(c.actionRefs)) { excluded++; continue; }
    const skill = active.find(s => s.name === c.artifactId && s.digest === c.contentDigest);
    if (!skill || !['success', 'failure'].includes(feature.outcome)) { excluded++; continue; }
    const proof = await validateWorkflowUse({ taskId: c.taskId, actionRefs: c.actionRefs, verificationRef: c.verificationRef }).catch(() => null);
    if (proof?.status !== 'resolved' || proof.verification !== (feature.outcome === 'success' ? 'pass' : 'fail')) { excluded++; continue; }
    const key = skill.name + '|' + skill.digest + '|' + c.taskId;
    if (seen.has(key)) continue; seen.add(key);
    const item = bySkill.get(skill.name) ?? { positive: new Set<string>(), negative: new Set<string>(), refs: new Set<string>(), actions: new Set<string>() };
    item[feature.outcome === 'success' ? 'positive' : 'negative'].add(c.taskId);
    item.refs.add(c.verificationRef); for (const ref of c.actionRefs) if (typeof ref === 'string') item.actions.add(ref);
    bySkill.set(skill.name, item);
  }
  const recommendations: Array<{ skillName: string; action: 'retain' | 'review'; positive: number; negative: number; proposalId?: string; reason: string }> = [];
  for (const [skillName, evidence] of bySkill) {
    let proposalId: string | undefined;
    const previous = proposals.find(p => p.targetSkillName === skillName);
    if (evidence.negative.size && previous) {
      const next = await coordinator.upsert({ ...previous.input, taskId: [...evidence.negative][0],
        expectedProposalDigest: previous.revisionDigest, targetSkillName: skillName,
        evidenceRefs: [...evidence.refs, ...evidence.actions].slice(0, 32) },
        { positive: [...evidence.positive], negative: [...evidence.negative], refs: [...evidence.refs] });
      proposalId = next.id;
    }
    recommendations.push({ skillName, action: evidence.negative.size ? 'review' : 'retain', positive: evidence.positive.size,
      negative: evidence.negative.size, ...(proposalId ? { proposalId } : {}),
      reason: 'Verified task outcomes justify review, not a causal claim about the Skill or automatic retirement.' });
  }
  return { recommendations, excluded, executionAuthority: false, mutation: 'proposal-only', observedAt: new Date().toISOString() };
}

export async function skillUseTrace(input: { workspace: string; skillName: string; artifactDigest?: string }) {
  if (!input.artifactDigest) return [];
  const events = activityTracker.readFeatureOutcomes({ workspace: input.workspace, maxEvents: 128, maxAgeMs: 90 * 86400000 });
  const rows: Array<{ taskId: string; artifactDigest: string; outcome: string; applicability: string;
    evidenceStatus: 'resolved' | 'unavailable'; verificationRef?: string; actionRefs: string[]; eventRef: string; recordedAt: string }> = [];
  const seen = new Set<string>();
  for (const event of events) {
    const c = event.context;
    if (c?.artifactKind !== 'skill' || c.artifactId !== input.skillName || c.contentDigest !== input.artifactDigest || typeof c.taskId !== 'string') continue;
    const key = c.taskId + '|' + c.contentDigest + '|' + event.featureOutcome?.outcome;
    if (seen.has(key)) continue; seen.add(key);
    const actionRefs = Array.isArray(c.actionRefs) ? c.actionRefs.filter((r): r is string => typeof r === 'string').slice(0, 32) : [];
    const verificationRef = typeof c.verificationRef === 'string' ? c.verificationRef : undefined;
    const proof = await validateWorkflowUse({ taskId: c.taskId, actionRefs, verificationRef }).catch(() => null);
    const outcome = event.featureOutcome?.outcome ?? 'unknown';
    rows.push({ taskId: c.taskId, artifactDigest: c.contentDigest, outcome,
      applicability: String(event.featureOutcome?.properties?.applicability ?? 'unknown'),
      evidenceStatus: c.evidenceValidation === 'resolved' && proof?.status === 'resolved' && proof.verification === (outcome === 'success' ? 'pass' : 'fail') ? 'resolved' : 'unavailable',
      verificationRef, actionRefs, eventRef: 'activity:' + event.id, recordedAt: event.timestamp });
    if (rows.length === 32) break;
  }
  return rows;
}
