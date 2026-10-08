import type { ExternalControllerLearningService } from '../learning/external-controller.js';
import { activityTracker } from '../tracker/activity-tracker.js';

type ToolResult = {
  content: Array<any>;
  isError?: boolean;
  [key: string]: unknown;
};

function appendCapsule(result: ToolResult, capsule: string): ToolResult {
  return {
    ...result,
    content: [
      ...(Array.isArray(result.content) ? result.content : []),
      { type: 'text', text: capsule.slice(0, 5_000) },
    ],
  };
}

const reminderExposures = new WeakMap<object, Set<string>>();
export async function appendSkillReminderCapsule(result: ToolResult, service?: ExternalControllerLearningService, sessionId?: string, workspace?: string): Promise<ToolResult> {
  if (!service || !sessionId || !service.skillProposalNotices) return result;
  try {
    const episode = await service.getEpisode(sessionId);
    const notices = await service.skillProposalNotices(sessionId, workspace);
    const seen = reminderExposures.get(service) ?? new Set<string>();
    const fresh = notices.filter(n => !seen.has((episode?.id ?? sessionId) + ':' + n.proposalId + ':' + n.revisionDigest));
    if (!fresh.length) return result;
    const header = 'SKILL PROPOSAL REMINDER — Include this proposal in the user-facing response in this session. Tool exposure is not delivery. Do not claim activation.\n';
    let capsule = header;
    for (const notice of fresh) {
      const text = (capsule === header ? '' : '\n\n') + notice.text;
      if (capsule.length + text.length > 5_000) continue;
      capsule += text;
      seen.add((episode?.id ?? sessionId) + ':' + notice.proposalId + ':' + notice.revisionDigest);
    }
    // Only complete notices count as exposed. Omitted notices remain pending for another response.
    while (seen.size > 4_096) seen.delete(seen.values().next().value!);
    reminderExposures.set(service, seen);
    return capsule === header ? result : appendCapsule(result, capsule);
  } catch (error) { activityTracker.captureFailure('LEARNING', error, 'external-skill-reminder-unavailable'); return result; }
}

export async function externalControllerToolResult(input: {
  service?: ExternalControllerLearningService;
  sessionId?: string;
  tool: string;
  args: unknown;
  result: ToolResult;
  readOnly: boolean;
  workspace?: string;
  repeated?: boolean;
}): Promise<any> {
  const { service, sessionId } = input;
  if (!service || !sessionId) return input.result;
  let result = input.result;
  if (result.isError) {
    try {
      const prior = await service.failureContext({
        sessionId,
        tool: input.tool,
        args: input.args,
        failure: input.result,
        ...(input.workspace ? { workspace: input.workspace } : {}),
        repeated: input.repeated === true,
      });
      result = appendCapsule(result, prior.capsule);
    } catch (error) {
      activityTracker.captureFailure(
        'LEARNING',
        error,
        'external-custom-tool-failure-context-failure',
        { tool: input.tool },
      );
    }
  }
  try {
    await service.recordToolOutcome({
      sessionId,
      tool: input.tool,
      argumentKeys: input.args && typeof input.args === 'object'
        ? Object.keys(input.args as Record<string, unknown>)
        : [],
      outcome: result.isError ? 'handled-failure' : 'success',
      readOnly: input.readOnly,
      ...(input.workspace ? { workspace: input.workspace } : {}),
    });
  } catch (error) {
    activityTracker.captureFailure(
      'LEARNING',
      error,
      'external-custom-tool-outcome-record-failure',
      { tool: input.tool },
    );
  }
  return appendSkillReminderCapsule(result, service, sessionId, input.workspace);
}
