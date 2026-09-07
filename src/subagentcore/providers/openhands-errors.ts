import { classifyProviderFailure, type ProviderFailure } from './types.js';

type RecordValue = Record<string, unknown>;
function record(value: unknown): RecordValue | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : undefined;
}

function explicitFailure(value: unknown): ProviderFailure | undefined {
  const event = record(value);
  if (!event || event.value !== undefined || event.system_prompt !== undefined || event.tools !== undefined) return;
  const role = String(event.role ?? event.source ?? '').toLowerCase();
  if (['user', 'system', 'assistant'].includes(role)) return;
  const nested = record(event.error);
  const error = nested ?? event;
  const code = String(error.code ?? error.type ?? '');
  const kind = String(event.kind ?? event.type ?? '');
  const message = typeof error.detail === 'string' ? error.detail
    : typeof error.message === 'string' ? error.message
    : typeof event.error === 'string' ? event.error : '';
  if (!message || (!nested && !/error|exception|denied|rate_limit/i.test(`${code} ${kind}`)
    && !/^[45]\d{2}$/.test(code) && typeof event.error !== 'string')) return;
  const rawStatus = error.status_code ?? error.status ?? error.code;
  const statusText = String(rawStatus ?? '');
  const match = /\b(?:error code|http(?: status)?)\s*[:=]?\s*([45]\d{2})\b/i.exec(message);
  const status = /^[45]\d{2}$/.test(statusText) ? Number(statusText) : match ? Number(match[1]) : undefined;
  const failure = classifyProviderFailure(status, `${code}: ${message}`);
  // A runtime error record with no HTTP evidence is not a network failure.
  return { ...failure, kind: failure.kind === 'network' ? 'unknown' : failure.kind, message: message.slice(0, 4000) };
}

/** Inspect structured event records only; never recurse through prompts or snapshots. */
export function extractOpenHandsFailure(entries: readonly { name: string; text: string }[], metadata: RecordValue): ProviderFailure {
  let latest: ProviderFailure | undefined;
  let latestAt: number | undefined;
  const inspect = (value: unknown): void => {
    if (Array.isArray(value)) { for (const item of value) inspect(item); return; }
    const item = record(value);
    if (!item) return;
    const failure = explicitFailure(item);
    if (failure) {
      const rawAt = item.timestamp ?? item.created_at;
      const parsedAt = typeof rawAt === 'number' ? rawAt : typeof rawAt === 'string' ? Date.parse(rawAt) : NaN;
      const at = Number.isFinite(parsedAt) ? parsedAt : undefined;
      if (latestAt === undefined || at === undefined || at >= latestAt) { latest = failure; latestAt = at; }
      return;
    }
    // Only well-known event-list wrappers, never arbitrary nested objects.
    if (Array.isArray(item.events)) inspect(item.events);
    else if (Array.isArray(item.items) && item.role === undefined && item.value === undefined) inspect(item.items);
  };
  for (const entry of [...entries].sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }))) {
    const name = entry.name.replace(/\\/g, '/');
    if (!/(?:^|\/)(?:events?(?:\/|[._-])|trajectory[._-])/i.test(name) || !/\.jsonl?$/i.test(name)) continue;
    try { inspect(JSON.parse(entry.text)); }
    catch { for (const line of entry.text.split(/\r?\n/)) { try { inspect(JSON.parse(line)); } catch { /* Not a JSON event. */ } } }
  }
  return latest ?? explicitFailure(metadata) ?? {
    kind: 'unknown',
    message: `OpenHands execution ${String(metadata.execution_status ?? 'failed')} without an authoritative error event`,
  };
}
