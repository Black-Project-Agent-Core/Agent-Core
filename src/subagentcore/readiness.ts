import path from 'node:path';
import { getSubAgentCoreTeam } from './team.js';
import { SUBAGENTCORE_PROVIDER_IDS, type SubAgentCoreConfig } from './types.js';

/** Configuration inspection only: never calls providers or reads/writes memory. */
export function inspectSubAgentCoreReadiness(config: SubAgentCoreConfig, projectRoot: string) {
  const providers = SUBAGENTCORE_PROVIDER_IDS.map((id) => ({
    id,
    defaultModel: config.providers[id].defaultModel,
    configuredKeySlots: config.providers[id].keySlots.map((slot) => slot.index),
    keyVariablePattern: `SUBAGENTCORE_${id.toUpperCase()}_API_KEY_<number>`,
  }));
  const workers = getSubAgentCoreTeam().map((worker) => {
    const binding = config.workers[worker.id];
    const provider = config.providers[binding.provider];
    const model = binding.model || provider.defaultModel;
    const blockers: string[] = [];
    if (!config.enabled) blockers.push('SUBAGENTCORE_DISABLED');
    if (provider.keySlots.length === 0) blockers.push('API_KEY_MISSING');
    else if (binding.keySlot !== 'auto' && !provider.keySlots.some((slot) => slot.index === binding.keySlot)) blockers.push('KEY_SLOT_UNAVAILABLE');
    if (!model) blockers.push('MODEL_MISSING');
    return { id: worker.id, name: worker.name, role: worker.role, provider: binding.provider,
      model, keySlot: binding.keySlot, configured: blockers.length === 0, blockers };
  });
  const configurationReady = config.enabled && workers.every((worker) => worker.configured);
  return {
    envPath: path.resolve(projectRoot, '.env'),
    state: !config.enabled ? 'DISABLED' as const
      : configurationReady ? 'CONFIGURED_NOT_LIVE_TESTED' as const : 'NEEDS_CONFIGURATION' as const,
    enabled: config.enabled,
    configurationReady,
    configurationOnly: true as const,
    liveInference: 'NOT_TESTED' as const,
    sharedMemoryHealth: 'NOT_CHECKED' as const,
    providers,
    workers,
  };
}
