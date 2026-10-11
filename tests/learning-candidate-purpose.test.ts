import { expect, test } from 'vitest';
import { validateCandidatePurpose } from '../src/learning/candidate-purpose.js';
import { LearningReviewCoordinator } from '../src/learning/review.js';
import { LearningSinkManager } from '../src/learning/sink-manager.js';
import { createLearningDecision } from '../src/learning/decision-evidence.js';
import { learning } from '../src/mcp/learning-schemas.js';
import type { LearningCandidate } from '../src/learning/types.js';
const fact = { kind: 'durable-fact', content: 'Task override applies only to this task.', evidenceRefs: ['source:fixture'], verified: false } as LearningCandidate;
test('purpose omitted preserves legacy candidate compatibility', () => {
  expect(validateCandidatePurpose(fact)).toEqual(fact);
});
test('task facts and artifact outcomes cannot contain procedure steps or use reflection kind', () => {
  for (const purpose of ['task-fact', 'artifact-outcome'] as const) {
    expect(validateCandidatePurpose({ ...fact, purpose })).toEqual({ ...fact, purpose });
    expect(() => validateCandidatePurpose({ ...fact, purpose, steps: ['Apply everywhere'] })).toThrow();
    expect(() => validateCandidatePurpose({ ...fact, purpose, kind: 'operational-reflection' })).toThrow();
  }
});
test('reusable procedure requires reflection, explicit condition, bounded steps and evidence', () => {
  const candidate: LearningCandidate = { ...fact, purpose: 'reusable-procedure', kind: 'operational-reflection', reuseCondition: 'Only for task-local replay', steps: ['Inspect exact evidence'] };
  expect(validateCandidatePurpose(candidate)).toEqual(candidate);
  for (const edit of [{ kind: 'architecture' }, { reuseCondition: ' ' }, { steps: [] }, { steps: Array(51).fill('Step') }, { evidenceRefs: [] }])
    expect(() => validateCandidatePurpose({ ...candidate, ...edit } as LearningCandidate)).toThrow();
});
test('purpose gate runs before existing evidence review and never confers verification', async () => {
  const reviewer = new LearningReviewCoordinator(new LearningSinkManager([]));
  const outcomes = await reviewer.review([
    { ...fact, purpose: 'artifact-outcome', steps: ['Make a Skill'] },
    { ...fact, purpose: 'task-fact', verified: true },
    { ...fact, purpose: 'task-fact', evidenceRefs: ['https://unsupported.test'] },
  ], true, true);
  expect(outcomes.map(value => value.status)).toEqual(['rejected', 'proposal', 'rejected']);
});
test('candidate purpose survives tool parsing and decision audit fingerprint', () => {
  const candidate = { ...fact, purpose: 'artifact-outcome' as const };
  expect(learning.parse({ action: 'review', candidates: [candidate] }).candidates?.[0].purpose).toBe('artifact-outcome');
  const audit = createLearningDecision(candidate, candidate, 'review', 0);
  expect(audit.purpose).toBe('artifact-outcome');
  expect(audit.fingerprint).not.toBe(createLearningDecision(fact, fact, 'review', 0).fingerprint);
});
test('opt-in purpose requires resolvable evidence even through legacy unscoped review', async () => {
 let writes = 0;
 const sink = {name:'fixture',isAvailable:async()=>true,health:async()=>({available:true}),classifySupport:()=>true,findDuplicates:async()=>[],capture:async()=>{writes++;return{id:'captured'};}};
 const reviewer=new LearningReviewCoordinator(new LearningSinkManager([sink]));
 expect((await reviewer.review([{...fact,purpose:'task-fact',verified:true}]))[0].status).toBe('proposal');
 expect(writes).toBe(0);
});
