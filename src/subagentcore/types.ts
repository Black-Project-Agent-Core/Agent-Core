export const SUBAGENTCORE_PROVIDER_IDS = ['openrouter', 'nvidia', 'openhands'] as const;
export type SubAgentCoreProviderId = (typeof SUBAGENTCORE_PROVIDER_IDS)[number];

export interface SubAgentCoreLeader {
  id: 'joe-lead';
  name: 'JOE';
  authority: 'leader-only';
  purpose: string;
}

export interface SubAgentCoreWorker {
  id: 'astra' | 'forge' | 'sentinel' | 'scribe';
  name: string;
  authority: 'worker';
  role: string;
  goal: string;
  taskBoundary: string;
  allowedTools: readonly string[];
}

export interface WorkerToolRequest {
  tool: string;
  reason: string;
  args?: Record<string, unknown>;
}

export interface WorkerMemoryHandoff {
  facts: string[];
  decisions: string[];
  failures: string[];
  nextStep: string;
}

export interface WorkerEnvelope {
  summary: string;
  findings: string[];
  proposedActions: string[];
  toolRequests: WorkerToolRequest[];
  memoryHandoff: WorkerMemoryHandoff;
}

export interface ProviderKeySlot {
  index: number;
  envName: string;
  value: string;
}

export interface SubAgentCoreProviderConfig {
  id: SubAgentCoreProviderId;
  baseUrl: string;
  defaultModel: string | null;
  keySlots: ProviderKeySlot[];
}

export interface WorkerProviderBinding {
  provider: SubAgentCoreProviderId;
  model: string | null;
  keySlot: 'auto' | number;
}

export interface SubAgentCoreConfig {
  enabled: boolean;
  sharedMemoryRequired: true;
  requestTimeoutMs: number;
  providers: Record<SubAgentCoreProviderId, SubAgentCoreProviderConfig>;
  workers: Record<SubAgentCoreWorker['id'], WorkerProviderBinding>;
}

export interface SubAgentDispatchInput {
  scope: { principalId: string; projectId?: string };
  routeContextId: string;
  workerId: string;
  task: string;
  context?: string;
  provider?: SubAgentCoreProviderId;
  model?: string;
  keySlot?: 'auto' | number;
  sharedMemoryIds?: string[];
}

export interface SubAgentDispatchResult {
  dispatchId: string;
  worker: Pick<SubAgentCoreWorker, 'id' | 'name' | 'role'>;
  provider: SubAgentCoreProviderId;
  requestedModel: string;
  model: string;
  keySlot: string;
  summary: string;
  findings: string[];
  proposedActions: string[];
  toolRequests: WorkerToolRequest[];
  rejectedToolRequests: WorkerToolRequest[];
  memoryHandoff: WorkerMemoryHandoff;
  memoryHandoffStatus: 'PENDING_LEADER_REVIEW';
  memoryHandoffId?: string;
  sharedMemory: { exportedMemoryIds: string[] };
  usage: { promptTokens: number; completionTokens: number; recordedCost: number };
}
