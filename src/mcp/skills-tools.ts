import { McpServer } from '@modelcontextprotocol/server';
import type { SkillService } from '../skills/service.js';
import type { ExternalControllerLearningService } from '../learning/external-controller.js';
import { activityTracker } from '../tracker/activity-tracker.js';
import { externalControllerToolResult } from './external-controller-tool-support.js';
import * as schemas from './skills-schemas.js';
import type { LearningService } from '../learning/service.js';
import { PROPOSAL_ACTIONS, runSkillProposalAction } from './skill-proposal-actions.js';

function text(value: unknown) {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] } as any;
}

export function registerSkillsTools(
  server: McpServer,
  service: SkillService,
  externalController?: ExternalControllerLearningService,
  externalSessionId?: string,
  learning?: LearningService,
  nativeTaskId?: string,
  nativeWorkspace?: string,
): void {
  server.registerTool('skills', {
    title: 'Skill Artifacts',
    description: 'Manage native Skill artifacts and semantic proposals. proposals/self_awareness/explain_improvement read current evidence; propose and review_outcomes never activate. decide_proposal requires a host-recorded user message for the exact revision/scope. Send proposal reminders in the current user session. Declared tools never grant execution authority.',
    inputSchema: schemas.skills,
    annotations: { title: 'Skill Artifacts', readOnlyHint: false, destructiveHint: false },
  }, async (args: any) => {
    const started = Date.now();
    const input = schemas.skills.parse(args ?? {});
    try {
      let result: unknown;
      if (PROPOSAL_ACTIONS.has(input.action)) {
        result = await runSkillProposalAction(input, { learning, external: externalController, sessionId: externalSessionId, nativeTaskId, nativeWorkspace });
      } else switch (input.action) {
        case 'status': result = await service.status(); break;
        case 'list': result = await service.list(); break;
        case 'inspect': result = await service.inspect(input.name!); break;
        case 'validate': result = await service.validate(input.sourcePath!); break;
        case 'import': result = await service.import(input.sourcePath!); break;
        case 'package': result = await service.package(input.name!); break;
        case 'render_export': result = await service.renderExport(input.name!, input.profile!); break;
        case 'stage_revision': result = await service.stageRevision(input.sourcePath!, input.evidenceRefs!); break;
        case 'list_revisions': result = await service.listRevisions(input.name!); break;
        case 'promote_revision': result = await service.promoteRevision(input.name!, input.candidateDigest!, input.expectedActiveDigest!, input.confirmation!, input.sourceChangeConfirmation); break;
        case 'rollback_revision': result = await service.rollbackRevision(input.name!, input.targetDigest!, input.expectedActiveDigest!, input.confirmation!); break;
      }
      activityTracker.record('SKILLS', 'success', 'skills operation completed', 'skills-tool', {
        action: input.action,
        durationMs: Date.now() - started,
      });
      return externalControllerToolResult({
        service: externalController,
        sessionId: externalSessionId,
        tool: 'skills',
        args: input,
        result: text(result),
        readOnly: ['status', 'list', 'inspect', 'validate', 'list_revisions', 'proposals', 'self_awareness', 'explain_improvement'].includes(input.action),
      });
    } catch (error) {
      activityTracker.record('SKILLS', 'info', 'skills operation failed', 'handled-skills-failure', {
        action: input.action,
        durationMs: Date.now() - started,
      });
      const message = error instanceof Error ? error.message : String(error);
      return externalControllerToolResult({
        service: externalController,
        sessionId: externalSessionId,
        tool: 'skills',
        args: input,
        result: { content: [{ type: 'text', text: 'Error: ' + message }], isError: true } as any,
        readOnly: ['status', 'list', 'inspect', 'validate', 'list_revisions', 'proposals', 'self_awareness', 'explain_improvement'].includes(input.action),
      });
    }
  });
}
