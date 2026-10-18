import type { McpServer } from '@modelcontextprotocol/server';
import { createHash } from 'node:crypto';
import * as z from 'zod/v4';
import { credentialAllowsTool } from '../auth/tool-grant.js';
import { manifestSchema } from '../harness/reconstruction/contracts.js';
import { resolveToolTerminals } from '../harness/reconstruction/receipt-adapter.js';
import { evaluateReconstructionHarness } from '../harness/reconstruction/service.js';
import type { ExternalControllerLearningService } from '../learning/external-controller.js';
import { currentToolInvocationRequest } from '../tracker/tool-invocation.js';
import { activityTracker } from '../tracker/activity-tracker.js';
import { beginExternalControllerToolCall, externalControllerToolResult } from './external-controller-tool-support.js';

// Keep the remote manifest bounded; schema discovery returns the full existing validation contract.
const inputSchema = z.strictObject({
  action: z.enum(['schema', 'preview', 'assess', 'readiness']), manifest: z.unknown().optional(),
});
export function registerExternalReconstructionHarnessTool(server: McpServer, host: {
  principal?: unknown; ownerId?: string; sessionId?: string;
  externalLearning?: ExternalControllerLearningService;
}): void {
  server.registerTool('reconstruction_harness', {
    description: 'REA proof obligations. Call schema for manifest format. Start a controller_learning episode before preview/assess/readiness. Receipt refs: episode status events. Host tool completion only; no execution, writes or automatic approval.',
    inputSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  }, async (args, ctx) => {
    const call = beginExternalControllerToolCall('reconstruction_harness');
    let result;
    try {
      if (args.action === 'schema') {
        result = { manifestSchema: manifestSchema.toJSONSchema(),
          example: { schemaVersion: 1, coverage: 'complete',
            claims: [{ id: 'c1', title: 'Selected tool completed', kind: 'tool-completion',
              requiredAuthority: 'tool-terminal', obligationIds: ['o1'] }],
            obligations: [{ id: 'o1', claimId: 'c1', required: true, ownerTool: 'get_config',
              requiredCases: ['positive'], dependsOn: [] }], selections: [], contradictions: [] },
          workflow: 'Start controller_learning(action=episode, episodeOperation=start, taskKey, workspace). Run the actual task tool, then obtain its tool:<invocationId> from controller_learning(action=episode, episodeOperation=status) current.events[].evidenceRefs. Add a selection {obligationId,caseKind,receiptRef}; submit the manifest object to assess/readiness. Missing or foreign proof stays unknown/open. Preview never supplies authenticated proof.',
          identity: 'Owner, task and workspace are host-bound; never supply them in the manifest.',
          proofBoundary: 'host-tool-terminal-only', automaticApproval: false };
      } else {
        const request = currentToolInvocationRequest(), binding = request?.invocationContext;
        const active = async () => {
          if (request?.mutationContext.signal?.aborted || ctx?.mcpReq?.signal?.aborted) throw new Error('HARNESS_CANCELLED');
          if (!request || request.tool !== 'reconstruction_harness' || binding?.binding !== 'bound'
            || !host.ownerId || binding.ownerId !== host.ownerId || !host.sessionId || binding.sessionId !== host.sessionId
            || !binding.taskId || !binding.workspace || !binding.workspaceIdentityKey
            || binding.invocationId !== request.identity.id || binding.processSessionId !== request.identity.processSessionId
            || request.mutationContext.taskId !== binding.taskId
            || !await host.externalLearning?.invocationTaskCurrent(binding)) throw new Error('HARNESS_HOST_SCOPE_UNAVAILABLE');
          if (request.mutationContext.signal?.aborted || ctx?.mcpReq?.signal?.aborted) throw new Error('HARNESS_CANCELLED');
        };
        await active();
        const episode = args.action === 'preview' ? null : await host.externalLearning!.getEpisode(host.sessionId!, true);
        const episodeMatches = episode && episode.boundary === 'explicit' && episode.id === binding!.taskId && !episode.closedAt
          && episode.workspace === binding!.workspace && episode.memoryBinding?.ownerId === binding!.ownerId
          && episode.memoryBinding?.workspaceIdentityKey === binding!.workspaceIdentityKey;
        result = await evaluateReconstructionHarness(args.action, args.manifest, {
          origin: 'external', taskId: binding!.taskId!, workspace: binding!.workspace!,
          ownerId: binding!.ownerId!, workspaceIdentityKey: binding!.workspaceIdentityKey!,
        }, { signal: request!.mutationContext.signal ?? ctx?.mcpReq?.signal,
          resolver: (refs, scope) => {
            const events = activityTracker.readToolInvocationEvents({ maxEvents: 10_000, maxAgeMs: 86_400_000 });
            // Observation may time out after a durable write; require both host records, never infer attribution.
            const reconciled = events.map(event => {
              const context = event.context;
              if (!episodeMatches || context?.attributionStatus !== 'late-unavailable'
                || !refs.includes('tool:' + context.invocationId)) return event;
              const matches = episode!.events.filter(item => (item.kind === 'tool' || item.kind === 'failure')
                && (item.invocationId === context.invocationId || item.evidenceRefs.includes('tool:' + context.invocationId)));
              const proof = matches.length === 1 ? matches[0] : undefined;
              if (proof?.kind !== 'tool' || proof.outcome !== 'success' || proof.attributionStatus !== 'attributed'
                || proof.invocationId !== context.invocationId || proof.taskId !== binding!.taskId || proof.tool !== context.tool
                || !proof.evidenceRefs.includes('tool:' + context.invocationId) || !proof.processSessionId
                || context.processInstanceDigest !== 'sha256:' + createHash('sha256').update(proof.processSessionId).digest('hex')) return event;
              return { ...event, context: { ...context, attributionStatus: 'attributed' } };
            });
            return new Map([...resolveToolTerminals(refs, scope, reconciled)]
              .filter(([, proof]) => credentialAllowsTool(host.principal, proof.tool)));
          },
        });
        await active();
      }
      return externalControllerToolResult({ service: host.externalLearning, sessionId: host.sessionId,
        call, tool: 'reconstruction_harness', args, readOnly: true,
        result: { content: [{ type: 'text', text: JSON.stringify(result) }] } });
    } catch (error) {
      const code = error instanceof Error && /^HARNESS_[A-Z_]+$/.test(error.message)
        ? error.message : 'HARNESS_INPUT_OR_EVIDENCE_UNAVAILABLE';
      return externalControllerToolResult({ service: host.externalLearning, sessionId: host.sessionId,
        call, tool: 'reconstruction_harness', args, readOnly: true,
        result: { isError: true, content: [{ type: 'text', text: code }] } });
    }
  });
}
