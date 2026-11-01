import type { ContextBreakdown } from './host';

/** The manual Compact button appears from 70% (marker + amber level); automatic compaction fires at 100% of the window. */
export const COMPACT_BUTTON_PERCENT = 70;
export const NEAR_FULL_PERCENT = 90;
const AUTO_COMPACT_CAPTION = 'otomatis di 100%';

/** One colour per breakdown category: the bar segment and the swatch in the category list share it. */
export const SEGMENT_COLORS: Record<keyof ContextBreakdown, string> =
  { system: '#9ca3af', tools: '#14b8a6', conversation: '#3b82f6', memory: '#f97316', skills: '#8b5cf6', toolResults: '#eab308' };
/** Not a category: the dim swatch for the 'Free space' row, which is never a bar segment. */
export const FREE_SPACE_COLOR = 'rgba(127, 127, 127, .35)';

const isKnownCapacity = (capacity?: number | null): capacity is number =>
  typeof capacity === 'number' && Number.isFinite(capacity) && capacity > 0;

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

/** percent = share of the used tokens (integer); percentOfWindow = share of the window capacity, one decimal, only when the capacity is known.
 *  key is 'free' only for the synthetic 'Free space' row (capacity minus used); that row is never a bar segment. */
export type ContextBreakdownRow = { key: keyof ContextBreakdown | 'free'; label: string; tokens: number; percent: number; percentOfWindow?: number };

/** True for an ordinary category row (not the synthetic 'Free space' row); narrows `key` back to a bar-segment-eligible key. */
export function isCategoryRow(row: ContextBreakdownRow): row is ContextBreakdownRow & { key: keyof ContextBreakdown } {
  return row.key !== 'free';
}

const BREAKDOWN_ORDER: ReadonlyArray<[keyof ContextBreakdown, string]> = [
  ['system', 'System Instructions'], ['tools', 'Tools & MCP Manifests'], ['skills', 'Skills'],
  ['memory', 'Memory Injections'], ['conversation', 'Conversation & Files'], ['toolResults', 'Tool Results']];
/** system/tools/conversation/memory are always shown, even at 0; skills/toolResults only get a row when the data has that key. */
const ALWAYS_SHOWN: ReadonlySet<keyof ContextBreakdown> = new Set(['system', 'tools', 'conversation', 'memory']);

/** Scales the chars/4 estimates to the provider total; largest-remainder rounding keeps the token sum exactly equal to contextTokens. */
export function contextBreakdownRows(breakdown: ContextBreakdown | undefined, contextTokens: number, capacity?: number | null): ContextBreakdownRow[] {
  if (!breakdown || !(contextTokens > 0)) return [];
  const order = BREAKDOWN_ORDER.filter(([key]) => ALWAYS_SHOWN.has(key) || breakdown[key] !== undefined);
  const raw = order.map(([key]) => Math.max(0, Number(breakdown[key]) || 0));
  const sum = raw.reduce((acc, value) => acc + value, 0);
  if (sum <= 0) return [];
  const exact = raw.map(value => value * contextTokens / sum);
  const tokens = exact.map(Math.floor);
  let left = contextTokens - tokens.reduce((acc, value) => acc + value, 0);
  const byRemainder = exact.map((value, index) => ({ index, remainder: value - tokens[index] }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (const { index } of byRemainder) { if (left <= 0) break; tokens[index] += 1; left -= 1; }
  const windowKnown = isKnownCapacity(capacity);
  const rows: ContextBreakdownRow[] = order.map(([key, label], index) =>
    ({ key, label, tokens: tokens[index], percent: Math.round(tokens[index] / contextTokens * 100),
      ...(windowKnown ? { percentOfWindow: Math.round(tokens[index] * 1000 / capacity) / 10 } : {}) }));
  // 'Free space': capacity minus used, listed alongside the categories but never part of the bar (contextSegmentWidths
  // already caps at 100% of used tokens; this row only informs the legend).
  if (windowKnown) {
    const freeTokens = Math.max(0, capacity! - contextTokens);
    rows.push({ key: 'free', label: 'Free space', tokens: freeTokens, percent: 0,
      percentOfWindow: Math.round(freeTokens * 1000 / capacity!) / 10 });
  }
  return rows;
}

export type ContextMeterSegment = { key: keyof ContextBreakdown; tokens: number };

/** Segment widths in % of the window, in order; the running sum is capped at 100 so the segments never overflow the track. */
export function contextSegmentWidths(segments: ContextMeterSegment[], capacity: number): Array<{ key: keyof ContextBreakdown; width: number }> {
  let used = 0;
  return segments.map(segment => {
    const width = Math.min(Math.max(0, segment.tokens) * 100 / capacity, Math.max(0, 100 - used));
    used += width;
    return { key: segment.key, width };
  });
}

const COLORS = { ok: '#3fb68b', warn: '#f5a524', critical: '#ef4444', unknown: '#8a8f98' } as const;

/**
 * hideLabel: the host already shows "used / capacity" (Inspector card), so only the bar and its caption render.
 * segments: with a known capacity the fill is one coloured segment per category (width = tokens / capacity); otherwise the single fill stays.
 */
export function ContextMeter({ tokens, capacity, hideLabel, segments }: {
  tokens?: number; capacity?: number | null; hideLabel?: boolean; segments?: ContextMeterSegment[];
}) {
  if (tokens === undefined) return null;
  const model = contextMeterModel(tokens, capacity);
  const widths = model.known && segments?.length ? contextSegmentWidths(segments, capacity as number) : undefined;
  return <div className={'context-meter context-meter-' + model.level} data-level={model.level}
    style={{ margin: '0 0 6px', fontSize: 12 }}>
    <div role="meter" aria-label="Context window usage" aria-valuemin={0} aria-valuemax={100}
      {...(model.known ? { 'aria-valuenow': Math.round(model.fillPercent) } : {})}
      className="context-meter-track"
      style={{ position: 'relative', height: 6, borderRadius: 3, background: 'rgba(127,127,127,.25)' }}>
      {widths
        ? <div className="context-meter-segments" style={{ display: 'flex', height: '100%', borderRadius: 3, overflow: 'hidden' }}>
          {widths.map(segment => <span key={segment.key} className="context-meter-segment" data-testid={'context-segment-' + segment.key}
            style={{ display: 'block', width: segment.width + '%', height: '100%', backgroundColor: SEGMENT_COLORS[segment.key] }}/>)}
        </div>
        : <div style={{ width: model.fillPercent + '%', height: '100%', borderRadius: 3, background: COLORS[model.level] }}/>}
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
