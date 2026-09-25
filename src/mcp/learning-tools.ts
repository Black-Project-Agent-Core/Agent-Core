import { McpServer } from '@modelcontextprotocol/server';
import type { LearningService } from '../learning/service.js';
import { activityTracker } from '../tracker/activity-tracker.js';
import { appendFailureLoopAdvisory, type FailureLoopAdvisor } from './failure-loop-advisor.js';
import * as schemas from './learning-schemas.js';

function text(value: unknown) {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] as any };
}

function failure(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  activityTracker.record('LEARNING', 'info', 'learning tool operation failed', 'handled-learning-failure', { message });
  return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true } as any;
}

export function registerLearningTools(
  server: McpServer,
  learning: LearningService,
  advisor?: FailureLoopAdvisor,
): void {
  server.registerTool('learning', {
    title: 'Agent Core Learning',
    description: 'Controller-driven self-learning facade. The controller owns semantic judgment; Agent Core only tracks checkpoints, validates reviewed candidates, routes verified non-destructive captures, proposes curation, and exposes a read-only learning journey. Learning never gates normal MCP execution.',
    inputSchema: schemas.learning.shape,
    annotations: { title: 'Agent Core Learning', readOnlyHint: false, destructiveHint: false },
  }, async (args: any) => {
    const input = schemas.learning.parse(args);
    try {
      let result: unknown;

      if (input.action === 'status') {
        result = await learning.status();
      } else if (input.action === 'checkpoint') {
        if (!input.idempotencyKey) throw new Error('idempotencyKey is required for action=checkpoint');
        result = await learning.checkpoint({
          idempotencyKey: input.idempotencyKey,
          ...(input.meaningful !== undefined ? { meaningful: input.meaningful } : {}),
          ...(input.reason ? { reason: input.reason } : {}),
          ...(input.evidenceRefs ? { evidenceRefs: input.evidenceRefs } : {}),
        });
      } else if (input.action === 'review') {
        result = await learning.review(input.candidates ?? [], input.explicit === true);
      } else if (input.action === 'curate') {
        result = await learning.curate(input.workspace);
      } else {
        result = await learning.journey(input.workspace);
      }
      advisor?.observeSuccess('learning', args);
      return text(result);
    } catch (error) {
      const result = failure(error);
      const advisory = advisor?.observeFailure('learning', args, result);
      if (advisory) {
        activityTracker.record(
          'REFLEXION',
          advisory.strength === 'no-progress' ? 'warn' : 'info',
          advisory.message,
          'failure-loop-advisory',
          { tool: 'learning', repeatCount: advisory.repeatCount, failureFamily: advisory.failureFamily },
        );
        return appendFailureLoopAdvisory(result, advisory);
      }
      return result;
    }
  });
}
