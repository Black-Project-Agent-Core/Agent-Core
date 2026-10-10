import type { MemoryService } from '../memory/service.js';
import type { SkillProposalCoordinator } from './skill-proposals.js';
import type { LearningHealth } from './types.js';
export type SelfAwarenessQuestion = 'capabilities' | 'skills' | 'memory' | 'learning' | 'connections' | 'identity' | 'rules' | 'built-items' | 'user-knowledge';
export async function buildSelfAwarenessView(input: {
  workspace: string; questionType: SelfAwarenessQuestion; memory: MemoryService;
  proposals: SkillProposalCoordinator; learningHealth: () => Promise<LearningHealth>;
}) {
  const scope = input.memory.registeredWorkspaceIdentity(input.workspace);
  const observedAt = new Date().toISOString();
  const observations: Array<{ name: string; status: string; evidenceRef: string; observedAt: string }> = [];
  const omissions = ['Per-tool connection and task effectiveness are not established by catalog availability.', 'Learning availability does not establish that every pending review is complete.'];
  let skills: Array<{ name: string; digest: string; status: 'catalog-active'; nativeUse: 'unknown' }> = [];
  let proposals: Array<{ name: string; status: string; artifactStatus: string; evidenceStatus: string; revisionDigest: string; path: string }> = [];
  if (['capabilities', 'skills', 'built-items'].includes(input.questionType)) {
    try {
      skills = (await input.proposals.skills.list()).map(s => ({ name: s.name, digest: s.digest, status: 'catalog-active', nativeUse: 'unknown' }));
      for (const p of await input.proposals.list(scope.name)) proposals.push({ name: p.name, status: p.status,
        artifactStatus: p.artifactStatus, evidenceStatus: await input.proposals.matches(p) ? 'current' : 'stale', revisionDigest: p.revisionDigest, path: p.path });
      observations.push({ name: 'skill-catalog', status: 'available', evidenceRef: 'service:SkillService.list', observedAt });
    } catch { observations.push({ name: 'skill-catalog', status: 'degraded', evidenceRef: 'service:SkillService.list', observedAt }); }
  }
  if (['capabilities', 'memory', 'user-knowledge'].includes(input.questionType)) {
    await input.memory.list(scope.name);
    const health = input.memory.health();
    observations.push({ name: 'memory', status: health.status, evidenceRef: 'service:MemoryService.health', observedAt });
    omissions.push('Memory contents are not dumped; ask a topic-scoped Memory question. Health does not prove canonical factual correctness.');
  }
  if (['capabilities', 'learning'].includes(input.questionType)) {
    const health = await input.learningHealth();
    observations.push({ name: 'learning', status: health.status, evidenceRef: 'service:LearningService.health', observedAt });
  }
  if (['connections', 'identity', 'rules'].includes(input.questionType)) {
    observations.push({ name: input.questionType, status: 'unknown', evidenceRef: 'not-inspected', observedAt });
    omissions.push('Read the relevant current host contract or connection status; this projection does not infer identity or permissions.');
  }
  return { workspace: scope.name, questionType: input.questionType, observedAt, observations,
    totalSkills: skills.length, totalProposals: proposals.length, truncated: skills.length > 40 || proposals.length > 20,
    executionAuthority: false, scope: 'workspace-proposals-and-shared-catalog', omissions, skills: skills.slice(0, 40), proposals: proposals.slice(0, 20) };
}
