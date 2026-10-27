import { EXTERNAL_PROCEDURE_GUIDE } from './external-procedure.js';

/**
 * Self-questions that turn a verified recovery into a procedure candidate that can pass admission.
 * The state shows procedures never being proposed even though recoveries are checkpointed, so the
 * checkpoint itself hands the controller the questions. It is guidance only: it selects nothing,
 * grants nothing, and "no candidate" is a valid answer.
 */
export const PROCEDURE_SCAFFOLD_QUESTIONS = [
  'What exact action recovered it? List the steps in order, including the ones tried and dropped.',
  'What independent evidence shows the recovery worked: a result a second reader could recheck, not your own report?',
  'What failed first, and under which conditions, so a reader can tell the situation from a look-alike?',
  'When should this be reused, and what condition would make reuse wrong or cancel it?',
  'How is it undone or stopped, and which positive, negative and exception cases show where it holds and where it does not?',
] as const;

export function procedureScaffold(taskId?: string) {
  return {
    status: 'consider-procedure-candidate' as const,
    ...(taskId ? { taskId } : {}),
    questions: [...PROCEDURE_SCAFFOLD_QUESTIONS],
    propose: { tool: 'controller_learning', action: 'procedure', procedureOperation: 'propose' },
    payloadFields: ['description', 'trigger', 'prerequisite', 'action', 'avoid', 'expectedConsequence',
      'reversalOrStop', 'rollback', 'cases', 'provenanceRefs', 'allowedTools'],
    payloadGuide: EXTERNAL_PROCEDURE_GUIDE.payload,
    note: 'Propose a candidate only when every answer rests on evidence you observed; an honest "no candidate" is a valid outcome. This neither activates a Skill nor grants execution.',
    executionAuthority: false as const,
  };
}
