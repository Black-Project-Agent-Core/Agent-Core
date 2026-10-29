import type { AgentChatProvider, ReasoningChoice, ReasoningEffort } from './host';

/** The owner's pinned route. providerId 'auto' = automatic rotation; model '' = provider default. */
export type ChatSelection = { providerId: string; model: string; reasoningEffort: ReasoningChoice; updatedAtMs: number };
export type ChatSelectionResolution = {
  levels: ReasoningEffort[];
  /** What is displayed/sent; the stored choice is never rewritten to it. */
  effectiveReasoning: ReasoningChoice;
  modelMissing: boolean;
  sendBlocked: boolean;
  notice?: string;
};

const LEVELS: ReasoningEffort[] = ['low', 'medium', 'high', 'xhigh', 'max'];
const SELECTION_KEY = 'agentcore.chat.selection';
const LEGACY_PROVIDER_KEY = 'agentcore.chat.provider';
const LEGACY_REASONING_KEY = 'agentcore.chat.reasoning';

const isChoice = (value: unknown): value is ReasoningChoice => value === 'auto' || LEVELS.includes(value as ReasoningEffort);

export function parseServerSelection(value: unknown): ChatSelection | undefined {
  const v = value as Partial<ChatSelection> | undefined;
  if (!v || typeof v.providerId !== 'string' || !v.providerId || typeof v.model !== 'string'
    || !isChoice(v.reasoningEffort) || typeof v.updatedAtMs !== 'number') return undefined;
  return { providerId: v.providerId, model: v.model, reasoningEffort: v.reasoningEffort, updatedAtMs: v.updatedAtMs };
}

export function readLocalSelection(): ChatSelection | undefined {
  try {
    const raw = window.localStorage.getItem(SELECTION_KEY);
    if (raw) { const parsed = parseServerSelection(JSON.parse(raw)); if (parsed) return parsed; }
    // Legacy keys carried no model and no timestamp: any server record is newer.
    const provider = window.localStorage.getItem(LEGACY_PROVIDER_KEY);
    const reasoning = window.localStorage.getItem(LEGACY_REASONING_KEY);
    if (!provider && !reasoning) return undefined;
    return { providerId: provider || 'auto', model: '', reasoningEffort: isChoice(reasoning) ? reasoning : 'auto', updatedAtMs: 0 };
  } catch { return undefined; }
}

export function writeLocalSelection(selection: ChatSelection): void {
  try { window.localStorage.setItem(SELECTION_KEY, JSON.stringify(selection)); } catch { /* storage is optional */ }
}

/** Newest record wins (local on a tie). Two Auto records: the server never sees model/effort for Auto, so local keeps them. */
export function mergeSelection(server: ChatSelection, local: ChatSelection): ChatSelection;
export function mergeSelection(server?: ChatSelection, local?: ChatSelection): ChatSelection | undefined;
export function mergeSelection(server?: ChatSelection, local?: ChatSelection): ChatSelection | undefined {
  if (!server || !local) return server ?? local;
  if (server.providerId === 'auto' && local.providerId === 'auto') return local;
  return server.updatedAtMs > local.updatedAtMs ? server : local;
}

export function resolveSelection(
  providers: AgentChatProvider[] | undefined,
  choice: { providerId: string; model: string; reasoningEffort: ReasoningChoice },
): ChatSelectionResolution {
  const none: ChatSelectionResolution = { levels: [], effectiveReasoning: 'auto', modelMissing: false, sendBlocked: false };
  if (!choice.providerId || choice.providerId === 'auto') return none;
  const provider = providers?.find(item => item.id === choice.providerId);
  if (!provider || !provider.configured) {
    return { ...none, sendBlocked: true, notice: providers
      ? `Provider ${choice.providerId} tidak tersedia; pilih provider`
      : 'Katalog model belum dimuat; tunggu sebentar' };
  }
  const known = new Set([...(provider.models?.map(item => item.id) ?? []), ...(provider.model ? [provider.model] : [])]);
  if (choice.model && !known.has(choice.model)) {
    return { ...none, modelMissing: true, sendBlocked: true, notice: 'Model tidak tersedia di katalog saat ini; pilih model' };
  }
  const levels = (choice.model ? provider.models?.find(item => item.id === choice.model)?.reasoningEfforts : undefined)
    ?? provider.reasoningEfforts ?? [];
  const wanted = choice.reasoningEffort;
  if (wanted === 'auto' || provider.reasoningEfforts === undefined && !provider.models?.some(item => item.reasoningEfforts !== undefined)) {
    return { ...none, levels };
  }
  if (levels.includes(wanted)) return { ...none, levels, effectiveReasoning: wanted };
  const below = [...LEVELS].slice(0, LEVELS.indexOf(wanted)).reverse().find(level => levels.includes(level));
  const effective: ReasoningChoice = below ?? 'auto';
  return { ...none, levels, effectiveReasoning: effective,
    notice: `Effort ${wanted} tidak didukung ${choice.model || provider.model || provider.id}; memakai ${effective} untuk model ini` };
}
