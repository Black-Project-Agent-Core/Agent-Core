import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { MemoryService } from '../memory/service.js';
import { loadSubAgentCoreConfig } from './env.js';
import { inspectSubAgentCoreReadiness } from './readiness.js';
import { ProviderKeyPool } from './key-pool.js';
import { SubAgentCoreMemoryBridge } from './memory.js';
import { buildWorkerSystemPrompt, buildWorkerTaskPrompt, parseWorkerEnvelope } from './prompt.js';
import { SUBAGENTCORE_LEADER, getSubAgentCoreTeam, workerById } from './team.js';
import { OpenAICompatibleProvider } from './providers/openai-compatible.js';
import { OpenHandsProvider } from './providers/openhands.js';
import { ProviderInvocationError, redactProviderText, type SubAgentProvider } from './providers/types.js';
import type { SubAgentCoreConfig, SubAgentCoreProviderId, SubAgentDispatchInput, SubAgentDispatchResult, WorkerEnvelope } from './types.js';

function redactWorkerValue(value: unknown, secrets: readonly string[]): unknown {
  if (typeof value === 'string') return redactProviderText(value, secrets);
  if (Array.isArray(value)) return value.map((item) => redactWorkerValue(item, secrets));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => [key, redactWorkerValue(item, secrets)]),
  );
}

function redactWorkerEnvelope(envelope: WorkerEnvelope, secrets: readonly string[]): WorkerEnvelope {
  return redactWorkerValue(envelope, secrets) as WorkerEnvelope;
}

const RETRYABLE = new Set(['auth', 'credits_exhausted', 'rate_limit', 'model_entitlement', 'forbidden', 'server', 'network', 'timeout']);

export class SubAgentCoreService {
  readonly config: SubAgentCoreConfig;
  private readonly projectRoot: string;
  readonly memoryBridge: SubAgentCoreMemoryBridge;
  readonly keyPool: ProviderKeyPool;
  private readonly providers: Record<SubAgentCoreProviderId, SubAgentProvider>;

  constructor(options: {
    memory: MemoryService;
    projectRoot: string;
    env?: Record<string, string | undefined>;
    statePath?: string;
    providers?: Partial<Record<SubAgentCoreProviderId, SubAgentProvider>>;
  }) {
    this.projectRoot = options.projectRoot;
    this.config = loadSubAgentCoreConfig(options.env ?? process.env, options.projectRoot);
    this.memoryBridge = new SubAgentCoreMemoryBridge(options.memory);
    this.keyPool = new ProviderKeyPool(this.config.providers, options.statePath ?? path.join(options.projectRoot, 'runtime', 'subagentcore', 'key-state.json'));
    const openai = new OpenAICompatibleProvider();
    this.providers = {
      openrouter: options.providers?.openrouter ?? openai,
      nvidia: options.providers?.nvidia ?? openai,
      openhands: options.providers?.openhands ?? new OpenHandsProvider(),
    };
  }

  async status() {
    const keyState = await this.keyPool.status();
    return {
      enabled: this.config.enabled,
      readiness: inspectSubAgentCoreReadiness(this.config, this.projectRoot),
      leader: SUBAGENTCORE_LEADER,
      sharedMemoryRequired: this.config.sharedMemoryRequired,
      providers: (Object.keys(this.config.providers) as SubAgentCoreProviderId[]).map((id) => ({
        id,
        baseUrl: this.config.providers[id].baseUrl,
        defaultModel: this.config.providers[id].defaultModel,
        configuredKeySlots: this.config.providers[id].keySlots.map((slot) => slot.index),
        keyState: keyState[id],
      })),
      workers: getSubAgentCoreTeam().map((worker) => ({
        ...worker,
        binding: this.config.workers[worker.id],
      })),
    };
  }

  team() {
    return { leader: SUBAGENTCORE_LEADER, workers: getSubAgentCoreTeam() };
  }

  async resetSlot(provider: SubAgentCoreProviderId, slotIndex: number, model?: string) {
    await this.keyPool.reset(provider, slotIndex, model);
    return { reset: true, slotRef: `${provider}:${slotIndex}`, ...(model ? { model } : {}) };
  }

  async dispatch(input: SubAgentDispatchInput): Promise<SubAgentDispatchResult> {
    if (!this.config.enabled) throw new Error('SUBAGENTCORE_DISABLED');
    const worker = workerById(input.workerId);
    if (!worker) throw new Error(`SUBAGENTCORE_WORKER_UNKNOWN:${input.workerId}`);
    const binding = this.config.workers[worker.id];
    const provider = input.provider ?? binding.provider;
    const providerConfig = this.config.providers[provider];
    const model = input.model?.trim() || (provider === binding.provider ? binding.model : null) || providerConfig.defaultModel;
    if (!model) throw new Error(`SUBAGENTCORE_MODEL_REQUIRED:${provider}`);
    const requestedSlot = input.keySlot ?? binding.keySlot;
    if (providerConfig.keySlots.length === 0) throw new Error(`SUBAGENTCORE_API_KEY_REQUIRED:${provider}`);

    const preflight = await this.memoryBridge.preflight({
      scope: input.scope,
      routeContextId: input.routeContextId,
      workerId: worker.id,
      task: input.task,
      context: input.context,
    });
    if (preflight.blocked) throw new Error(`SUBAGENTCORE_MEMORY_BLOCKED:${preflight.blockingReasons.join('|')}`);

    const approvedMemory = await this.memoryBridge.approvedContext({
      scope: input.scope,
      memoryIds: input.sharedMemoryIds,
    });
    const systemPrompt = buildWorkerSystemPrompt(worker, {
      leaderName: SUBAGENTCORE_LEADER.name,
      sharedMemoryContext: approvedMemory.contextText ? approvedMemory.contextText.split(/\r?\n/) : [],
    });
    const taskPrompt = buildWorkerTaskPrompt(input.task, input.context);
    const dispatchId = randomUUID();
    const attempted = new Set<string>();
    const secrets = providerConfig.keySlots.map((slot) => slot.value);
    let lastFailure = 'No eligible key slot';

    while (attempted.size < providerConfig.keySlots.length) {
      const selected = await this.keyPool.select(provider, model, requestedSlot, attempted);
      if (!selected) break;
      attempted.add(selected.slotRef);
      try {
        const result = await this.providers[provider].invoke({
          provider,
          baseUrl: providerConfig.baseUrl,
          apiKey: selected.value,
          model,
          systemPrompt,
          taskPrompt,
          timeoutMs: this.config.requestTimeoutMs,
        });
        const envelope = redactWorkerEnvelope(parseWorkerEnvelope(result.text), secrets);
        const toolRequests = envelope.toolRequests.filter((request) => worker.allowedTools.includes(request.tool));
        const rejectedToolRequests = envelope.toolRequests.filter((request) => !worker.allowedTools.includes(request.tool));
        await this.keyPool.recordSuccess(selected);
        return {
          dispatchId,
          worker: { id: worker.id, name: worker.name, role: worker.role },
          provider,
          requestedModel: model,
          model: result.actualModel?.trim() || model,
          keySlot: selected.slotRef,
          summary: envelope.summary,
          findings: envelope.findings,
          proposedActions: envelope.proposedActions,
          toolRequests,
          rejectedToolRequests,
          memoryHandoff: envelope.memoryHandoff,
          memoryHandoffStatus: 'PENDING_LEADER_REVIEW',
          sharedMemory: { exportedMemoryIds: approvedMemory.exportedMemoryIds },
          usage: {
            promptTokens: result.promptTokens ?? 0,
            completionTokens: result.completionTokens ?? 0,
            recordedCost: result.recordedCost ?? 0,
          },
        };
      } catch (error) {
        if (!(error instanceof ProviderInvocationError)) throw error;
        const failure = { ...error.failure, ...(error.failure.kind === 'model_entitlement' ? { model } : {}) };
        lastFailure = `${failure.kind}${failure.status ? `/${failure.status}` : ''}: ${redactProviderText(failure.message, secrets)}`;
        await this.keyPool.recordFailure(selected, failure);
        if (!RETRYABLE.has(failure.kind) || requestedSlot !== 'auto') break;
      }
    }
    throw new Error(`SUBAGENTCORE_PROVIDER_EXHAUSTED:${provider}:${model}:${lastFailure}`);
  }
}
