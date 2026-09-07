import type { MemoryService } from '../memory/service.js';
import type { MemoryScope } from '../memory/types.js';
import type { WorkerMemoryHandoff } from './types.js';

function meaningful(handoff: WorkerMemoryHandoff): boolean {
  return handoff.facts.length > 0 || handoff.decisions.length > 0 || handoff.failures.length > 0 || Boolean(handoff.nextStep.trim());
}

export class SubAgentCoreMemoryBridge {
  constructor(private readonly memory: MemoryService) {}

  async preflight(input: { scope: MemoryScope; routeContextId: string; workerId: string; task: string; context?: string }): Promise<{ contextId: string; contextText: string; blocked: boolean; blockingReasons: string[] }> {
    const status = await this.memory.status(input.scope);
    if (!status.enabled || !status.healthy) throw new Error('SUBAGENTCORE_SHARED_MEMORY_UNAVAILABLE');
    const result = await this.memory.preflight({
      scope: input.scope,
      routeContextId: input.routeContextId,
      task: `[SubAgentCore:${input.workerId}] ${input.task}`,
      context: input.context,
      routeMetadata: { subagentcore: true, workerId: input.workerId },
      expiresAt: Date.now() + 15 * 60_000,
    });
    const lines = result.recalled.slice(0, 16).map((hit) => `${hit.kind}:${hit.canonicalKey} = ${hit.valueText.slice(0, 2_000)}`);
    return { contextId: result.contextId, contextText: lines.join('\n'), blocked: result.blocking.blocked, blockingReasons: result.blocking.reasons };
  }

  async approvedContext(input: { scope: MemoryScope; memoryIds?: readonly string[] }): Promise<{ exportedMemoryIds: string[]; contextText: string }> {
    const ids = [...new Set((input.memoryIds ?? []).map((value) => value.trim()).filter(Boolean))].slice(0, 16);
    const exportedMemoryIds: string[] = [];
    const lines: string[] = [];
    for (const memoryId of ids) {
      const record = await this.memory.getWithProvenance(input.scope, memoryId);
      if (!record || record.memory.state !== 'active') {
        throw new Error(`SUBAGENTCORE_SHARED_MEMORY_NOT_ACCESSIBLE:${memoryId}`);
      }
      exportedMemoryIds.push(memoryId);
      lines.push(`${record.memory.kind}:${record.memory.canonicalKey} = ${record.memory.valueText.slice(0, 2_000)}`);
    }
    return { exportedMemoryIds, contextText: lines.join('\n') };
  }

  async commitHandoff(input: { scope: MemoryScope; workerId: string; dispatchId: string; handoff: WorkerMemoryHandoff }) {
    if (!meaningful(input.handoff)) return null;
    return this.memory.commit({
      scope: input.scope,
      canonicalKey: `subagentcore.handoff.${input.dispatchId}`,
      kind: 'observation',
      value: { workerId: input.workerId, facts: input.handoff.facts, decisions: input.handoff.decisions, failures: input.handoff.failures, nextStep: input.handoff.nextStep },
      importance: 0.65,
      sourceType: 'subagentcore_leader_curated',
      sourceRef: input.workerId,
      metadata: { subagentcore: true, sharedMemory: true, workerId: input.workerId, dispatchId: input.dispatchId },
    });
  }
}
