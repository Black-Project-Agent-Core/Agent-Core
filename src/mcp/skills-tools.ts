import { createHash } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/server';
import type { SkillService } from '../skills/service.js';
import type { ExternalControllerLearningService } from '../learning/external-controller.js';
import { activityTracker } from '../tracker/activity-tracker.js';
import { currentToolCaller } from '../tracker/tool-invocation.js';
import { externalControllerToolResult, beginExternalControllerToolCall } from './external-controller-tool-support.js';
import * as schemas from './skills-schemas.js';
import type { LearningService } from '../learning/service.js';
import { PROPOSAL_ACTIONS, runSkillProposalAction } from './skill-proposal-actions.js';
import { skillDisabledMessage, type NativeSkillSettings } from '../native-skill-settings.js';

function text(value: unknown, compact = false) {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, compact ? undefined : 2) }] } as any;
}

/**
 * What the host prepared for one read, never the instruction text. Host counters (episode skillReads) are built from
 * this same text before the client sees it, so they prove preparation, not client receipt: compare resultSha256 with
 * what a client actually received.
 */
function readDelivery(fragment: any, prepared: string) {
  return {
    basis: 'host-prepared', skill: fragment?.name, source: fragment?.source, digest: fragment?.digest,
    offset: fragment?.offset, nextOffset: fragment?.nextOffset, contentBytes: Buffer.byteLength(String(fragment?.content ?? ''), 'utf8'),
    resultBytes: Buffer.byteLength(prepared, 'utf8'), resultSha256: createHash('sha256').update(prepared).digest('hex'),
  };
}

/** Native only: a Skill the owner switched off is hard-blocked (inspect, read). List and search still name it so Native can ask the owner to switch it on. */
function blockDisabledSkill(name: string, settings?: NativeSkillSettings): void {
  if (settings?.isDisabled(name)) throw new Error(skillDisabledMessage(name));
}

function markNativeSkills<T extends { name: string }>(items: T[], settings?: NativeSkillSettings) {
  if (!settings) return items;
  return items.map(item => settings.isDisabled(item.name)
    ? { name: item.name, nativeEnabled: false, note: 'switched off by the user' }
    : { ...item, nativeEnabled: true });
}

const READ_ONLY_ACTIONS =new Set(['status', 'list', 'inspect', 'search', 'read', 'validate', 'list_revisions', 'list_retired', 'proposals', 'self_awareness', 'explain_improvement']);

export function registerSkillsTools(
  server: McpServer,
  service: SkillService,
  externalController?: ExternalControllerLearningService,
  externalSessionId?: string,
  learning?: LearningService,
  nativeTaskId?: string,
  nativeWorkspace?: string,
  proposalApprover?: { principalId: string; authorize: (workspace: string) => Promise<boolean> },
  nativeSkillSettings?: NativeSkillSettings,
): void {
  server.registerTool('skills', {
    title: 'Skill Artifacts',
    description: 'Manage Skill artifacts/proposals. search defaults local; read requires active digest. Hybrid shares query/descriptors with configured Cloudflare AI; obtain consent. propose/review_outcomes never activate. decide_proposal requires exact revision/scope and Native user proof, or APPROVE_SKILL_PROPOSAL confirmation from an operator-allowlisted authenticated controller with a bound task/workspace. Relay reminders. Skills never widen tool grants.',
    inputSchema: schemas.skills,
    annotations: { readOnlyHint: false, destructiveHint: false },
  }, async (args: any, ctx) => {
    const call = beginExternalControllerToolCall('skills');
    const started = Date.now();
    const input = schemas.skills.parse(args ?? {});
    try {
      let result: unknown;
      // A registry shared by many Native tasks has no task fixed at registration: the host's caller names it on each call.
      const caller = currentToolCaller();
      const nativeTask = nativeTaskId ?? caller?.taskId;
      const nativeWs = nativeWorkspace ?? caller?.workspace;
      const off = nativeTask ? nativeSkillSettings : undefined;
      if (PROPOSAL_ACTIONS.has(input.action)) {
        result = await runSkillProposalAction(input, { learning, external: externalController, sessionId: externalSessionId, nativeTaskId: nativeTask, nativeWorkspace: nativeWs, proposalApprover });
      } else switch (input.action) {
        case 'status': result = await service.status(); break;
        case 'list': result = markNativeSkills(await service.list(), off); break;
        case 'inspect': blockDisabledSkill(input.name!, off); result = await service.inspect(input.name!); break;
        case 'search': {
          const found = (await service.discover({ query: input.query!, limit: input.limit, mode: input.searchMode, signal: ctx?.mcpReq?.signal })).search;
          result = off ? { ...found, hits: markNativeSkills(found.hits, off) } : found;
          break;
        }
        case 'read': blockDisabledSkill(input.name!, off); result = await service.read(input.name!, { expectedActiveDigest: input.expectedActiveDigest!, offset: input.offset, maxBytes: input.maxBytes, resourcePath: input.resourcePath }); break;
        case 'validate': result = await service.validateSource(input.sourcePath!); break;
        case 'import': result = await service.import(input.sourcePath!, undefined, input.name); break;
        case 'package': result = await service.package(input.name!); break;
        case 'render_export': result = await service.renderExport(input.name!, input.profile!); break;
        case 'stage_revision': result = await service.stageRevision(input.sourcePath!, input.evidenceRefs!, undefined, input.name); break;
        case 'list_revisions': result = await service.listRevisions(input.name!); break;
        case 'promote_revision': result = await service.promoteRevision(input.name!, input.candidateDigest!, input.expectedActiveDigest!, input.confirmation!, input.sourceChangeConfirmation); break;
        case 'rollback_revision': result = await service.rollbackRevision(input.name!, input.targetDigest!, input.expectedActiveDigest!, input.confirmation!); break;
        case 'retire': result = await service.retireSkill(input.name!, input.expectedActiveDigest!, input.confirmation!, input.evidenceRefs!, input.supersededBy); break;
        case 'list_retired': result = await service.listRetired(); break;
      }
      const prepared = text(result, input.action === 'search' || input.action === 'read');
      activityTracker.record('SKILLS', 'success', 'skills operation completed', 'skills-tool', {
        action: input.action,
        durationMs: Date.now() - started,
        ...(input.action === 'read' ? readDelivery(result, prepared.content[0].text) : {}),
      });
      return externalControllerToolResult({ call,
        service: externalController,
        sessionId: externalSessionId,
        tool: 'skills',
        args: input,
        result: prepared,
        readOnly: READ_ONLY_ACTIONS.has(input.action),
      });
    } catch (error) {
      activityTracker.record('SKILLS', 'info', 'skills operation failed', 'handled-skills-failure', {
        action: input.action,
        durationMs: Date.now() - started,
      });
      const message = error instanceof Error ? error.message : String(error);
      return externalControllerToolResult({ call,
        service: externalController,
        sessionId: externalSessionId,
        tool: 'skills',
        args: input,
        result: { content: [{ type: 'text', text: 'Error: ' + message }], isError: true } as any,
        readOnly: READ_ONLY_ACTIONS.has(input.action),
      });
    }
  });
}
