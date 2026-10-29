export const COMPACT_MARK_PERCENT = 70;
export const COMPACT_CRITICAL_PERCENT = 85;

/** 135000 -> "135k", 1000000 -> "1M", 1500000 -> "1.5M". */
export function formatTokenCount(count: number): string {
  if (count >= 1_000_000) return String(+(count / 1_000_000).toFixed(1)) + 'M';
  if (count >= 1_000) return String(Math.round(count / 1_000)) + 'k';
  return String(count);
}

export type ContextMeterModel = {
  level: 'ok' | 'warn' | 'critical' | 'unknown';
  known: boolean;
  fillPercent: number;
  label: string;
  hint: string;
};

/** Pure view model: thresholds use the unrounded share; the capacity is never guessed. */
export function contextMeterModel(tokens: number, capacity?: number | null): ContextMeterModel {
  const known = typeof capacity === 'number' && Number.isFinite(capacity) && capacity > 0;
  if (!known) return { level: 'unknown', known: false, fillPercent: 0,
    label: formatTokenCount(tokens) + ' · kapasitas tidak diketahui', hint: '' };
  const percent = (tokens / capacity!) * 100;
  const level = percent >= COMPACT_CRITICAL_PERCENT ? 'critical' : percent >= COMPACT_MARK_PERCENT ? 'warn' : 'ok';
  return { level, known: true, fillPercent: Math.min(100, percent),
    label: formatTokenCount(tokens) + ' / ' + formatTokenCount(capacity!) + ' · ' + Math.round(percent) + '%',
    hint: level === 'critical' ? 'Segera compact' : level === 'warn' ? 'Waktu yang pas untuk compact' : '' };
}

const COLORS = { ok: '#3fb68b', warn: '#f5a524', critical: '#ef4444', unknown: '#8a8f98' } as const;

export function ContextMeter({ tokens, capacity }: { tokens?: number; capacity?: number | null }) {
  if (tokens === undefined) return null;
  const model = contextMeterModel(tokens, capacity);
  return <div className={'context-meter context-meter-' + model.level} data-level={model.level}
    style={{ margin: '0 0 6px', fontSize: 12 }}>
    <div role="meter" aria-label="Context window usage" aria-valuemin={0} aria-valuemax={100}
      {...(model.known ? { 'aria-valuenow': Math.round(model.fillPercent) } : {})}
      style={{ position: 'relative', height: 6, borderRadius: 3, background: 'rgba(127,127,127,.25)' }}>
      <div style={{ width: model.fillPercent + '%', height: '100%', borderRadius: 3, background: COLORS[model.level] }}/>
      {model.known && <span data-testid="context-meter-mark" title="compact manual paling pas ~70%"
        style={{ position: 'absolute', left: COMPACT_MARK_PERCENT + '%', top: -2, bottom: -2, width: 2,
          background: 'currentColor', opacity: 0.7 }}/>}
    </div>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 3 }}>
      <span>{model.label}</span>
      <span style={{ color: COLORS[model.level] }}>{model.hint || (model.known ? 'compact manual paling pas ~70%' : '')}</span>
    </div>
  </div>;
}
