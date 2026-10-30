import type { ContextBreakdown } from './host';

/** The manual Compact button appears from 70% (marker + amber level); automatic compaction fires at 100% of the window. */
export const COMPACT_BUTTON_PERCENT = 70;
export const NEAR_FULL_PERCENT = 90;
const AUTO_COMPACT_CAPTION = 'otomatis di 100%';

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
  const level = percent >= NEAR_FULL_PERCENT ? 'critical' : percent >= COMPACT_BUTTON_PERCENT ? 'warn' : 'ok';
  return { level, known: true, fillPercent: Math.min(100, percent),
    label: formatTokenCount(tokens) + ' / ' + formatTokenCount(capacity!) + ' · ' + Math.round(percent) + '%',
    hint: level === 'critical' ? 'Hampir penuh' : level === 'warn' ? 'Compact tersedia; otomatis di 100%' : '' };
}

export type ContextBreakdownRow = { key: keyof ContextBreakdown; label: string; tokens: number; percent: number };

const BREAKDOWN_ORDER: ReadonlyArray<[keyof ContextBreakdown, string]> = [
  ['system', 'System Instructions'], ['tools', 'Tools & MCP Manifests'],
  ['conversation', 'Conversation & Files'], ['memory', 'Memory Injections']];

/** Scales the chars/4 estimates to the provider total; largest-remainder rounding keeps the token sum exactly equal to contextTokens. */
export function contextBreakdownRows(breakdown: ContextBreakdown | undefined, contextTokens: number): ContextBreakdownRow[] {
  if (!breakdown || !(contextTokens > 0)) return [];
  const raw = BREAKDOWN_ORDER.map(([key]) => Math.max(0, Number(breakdown[key]) || 0));
  const sum = raw.reduce((acc, value) => acc + value, 0);
  if (sum <= 0) return [];
  const exact = raw.map(value => value * contextTokens / sum);
  const tokens = exact.map(Math.floor);
  let left = contextTokens - tokens.reduce((acc, value) => acc + value, 0);
  const byRemainder = exact.map((value, index) => ({ index, remainder: value - tokens[index] }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (const { index } of byRemainder) { if (left <= 0) break; tokens[index] += 1; left -= 1; }
  return BREAKDOWN_ORDER.map(([key, label], index) =>
    ({ key, label, tokens: tokens[index], percent: Math.round(tokens[index] / contextTokens * 100) }));
}

const COLORS = { ok: '#3fb68b', warn: '#f5a524', critical: '#ef4444', unknown: '#8a8f98' } as const;

/** hideLabel: the host already shows "used / capacity" (Inspector card), so only the bar and its caption render. */
export function ContextMeter({ tokens, capacity, hideLabel }: { tokens?: number; capacity?: number | null; hideLabel?: boolean }) {
  if (tokens === undefined) return null;
  const model = contextMeterModel(tokens, capacity);
  return <div className={'context-meter context-meter-' + model.level} data-level={model.level}
    style={{ margin: '0 0 6px', fontSize: 12 }}>
    <div role="meter" aria-label="Context window usage" aria-valuemin={0} aria-valuemax={100}
      {...(model.known ? { 'aria-valuenow': Math.round(model.fillPercent) } : {})}
      style={{ position: 'relative', height: 6, borderRadius: 3, background: 'rgba(127,127,127,.25)' }}>
      <div style={{ width: model.fillPercent + '%', height: '100%', borderRadius: 3, background: COLORS[model.level] }}/>
      {model.known && <span data-testid="context-meter-mark" title={AUTO_COMPACT_CAPTION}
        style={{ position: 'absolute', left: COMPACT_BUTTON_PERCENT + '%', top: -2, bottom: -2, width: 2,
          background: 'currentColor', opacity: 0.7 }}/>}
    </div>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 3 }}>
      <span>{hideLabel ? '' : model.label}</span>
      <span style={{ color: COLORS[model.level] }}>{model.hint || (model.known ? AUTO_COMPACT_CAPTION : '')}</span>
    </div>
  </div>;
}
