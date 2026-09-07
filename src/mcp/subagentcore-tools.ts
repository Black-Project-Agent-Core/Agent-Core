import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import type { VerifiedKey } from '../auth/key-types.js';
import type { RuntimeServices } from '../runtime/services.js';
import type { SubAgentCoreProviderId, SubAgentCoreWorker } from '../subagentcore/types.js';
import { resolvedMemoryProjectScope } from './project-scope.js';

export const SUBAGENTCORE_TOOL_NAMES = ['subagentcore'] as const;

function textResult(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] };
}

function errorResult(error: unknown) {
  const code = error instanceof Error && 'code' in error && typeof (error as { code?: unknown }).code === 'string'
    ? (error as { code: string }).code
    : 'SUBAGENTCORE_ERROR';
  return {
    content: [{ type: 'text' as const, text: JSON.stringify({
      error: { code, message: error instanceof Error ? error.message : String(error) },
    }, null, 2) }],
    isError: true as const,
  };
}

export function registerSubAgentCoreTools(server: McpServer, runtime: RuntimeServices, key: VerifiedKey): void {
  server.registerTool('subagentcore', {
    title: 'SubAgentCore Team',
    description: 'Leader-owned SubAgentCore team control. Inspect team/provider slot status, dispatch a bounded worker through shared Agent Core memory, or reset one non-secret key-slot health record. Dispatch/reset require routeContextId from capability_route. Raw provider keys are never returned.',
    inputSchema: {
      operation: z.enum(['status', 'team', 'dispatch', 'reset_slot']),
      routeContextId: z.string().uuid().optional(),
      workerId: z.string().min(1).max(100).optional(),
      sharedMemoryIds: z.array(z.string().uuid()).max(16).optional(),
      task: z.string().min(1).max(50_000).optional(),
      context: z.string().max(100_000).optional(),
      provider: z.enum(['openrouter', 'nvidia', 'openhands']).optional(),
      model: z.string().min(1).max(500).optional(),
      keySlot: z.union([z.literal('auto'), z.number().int().positive()]).optional(),
      slotIndex: z.number().int().positive().optional(),
      slotModel: z.string().min(1).max(500).optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  }, async (input) => {
    try {
      if (input.operation === 'status') return textResult(await runtime.subagentcore.status());
      if (input.operation === 'team') return textResult(runtime.subagentcore.team());
      if (!input.routeContextId) throw new Error('routeContextId is required for dispatch/reset_slot');
      const scope = resolvedMemoryProjectScope(runtime, key, input.routeContextId);
      if (input.operation === 'reset_slot') {
        if (!input.provider || !input.slotIndex) throw new Error('provider and slotIndex are required for reset_slot');
        return textResult(await runtime.subagentcore.resetSlot(input.provider as SubAgentCoreProviderId, input.slotIndex, input.slotModel));
      }
      if (!input.workerId || !input.task) throw new Error('workerId and task are required for dispatch');
      return textResult(await runtime.subagentcore.dispatch({
        scope,
        routeContextId: input.routeContextId,
        workerId: input.workerId,
        task: input.task,
        ...(input.context === undefined ? {} : { context: input.context }),
        ...(input.provider === undefined ? {} : { provider: input.provider as SubAgentCoreProviderId }),
        ...(input.model === undefined ? {} : { model: input.model }),
        ...(input.keySlot === undefined ? {} : { keySlot: input.keySlot }),
        ...(input.sharedMemoryIds === undefined ? {} : { sharedMemoryIds: input.sharedMemoryIds }),
      }));
    } catch (error) {
      return errorResult(error);
    }
  });
}
