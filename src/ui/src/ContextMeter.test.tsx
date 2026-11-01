import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { COMPACT_BUTTON_PERCENT, ContextMeter, FREE_SPACE_COLOR, NEAR_FULL_PERCENT, SEGMENT_COLORS, contextBreakdownRows, contextMeterModel, contextSegmentWidths, formatTokenCount, isCategoryRow } from './ContextMeter';
import { reduceContextUsage, selectContextUsage } from './host';
import type { AgentChatEvent, AgentChatUiState } from './host';

const ev = (event: Partial<AgentChatEvent> & { type: string }): AgentChatEvent =>
  ({ at: 'now', conversationId: 'chat-1', turnId: 'turn-1', ...event });

describe('formatTokenCount', () => {
  it('abbreviates thousands and millions', () => {
    expect(formatTokenCount(135_000)).toBe('135k');
    expect(formatTokenCount(1_000_000)).toBe('1M');
    expect(formatTokenCount(1_500_000)).toBe('1.5M');
    expect(formatTokenCount(512)).toBe('512');
  });
});

describe('contextMeterModel', () => {
  it('is ok below 70%, warn from the 70% Compact-button point, critical from 90%', () => {
    expect(COMPACT_BUTTON_PERCENT).toBe(70);
    expect(NEAR_FULL_PERCENT).toBe(90);
    expect(contextMeterModel(699_000, 1_000_000).level).toBe('ok');
    expect(contextMeterModel(700_000, 1_000_000)).toMatchObject({ level: 'warn', hint: 'Compact tersedia; otomatis di 100%' });
    expect(contextMeterModel(899_000, 1_000_000).level).toBe('warn');
    expect(contextMeterModel(900_000, 1_000_000)).toMatchObject({ level: 'critical', hint: 'Hampir penuh' });
  });
  it('never pressures the user to compact', () => {
    for (const tokens of [100_000, 750_000, 900_000]) {
      expect(JSON.stringify(contextMeterModel(tokens, 1_000_000))).not.toMatch(/Segera compact|Waktu yang pas/);
    }
  });
  it('never guesses a capacity', () => {
    expect(contextMeterModel(135_000, null)).toMatchObject({ level: 'unknown', known: false,
      label: '135k · kapasitas tidak diketahui' });
  });
});

describe('ContextMeter', () => {
  it('shows used / window, percent and the 70% Compact-button marker', () => {
    render(<ContextMeter tokens={135_000} capacity={1_000_000}/>);
    expect(screen.getByText('135k / 1M · 14%')).toBeInTheDocument();
    expect(screen.getByTitle('otomatis di 100%')).toBeInTheDocument();
    expect(screen.getByTestId('context-meter-mark')).toHaveStyle({ left: '70%' });
    expect(screen.getByText('otomatis di 100%')).toBeInTheDocument();
    expect(screen.getByRole('meter')).toHaveAttribute('aria-valuenow', '14');
  });
  it('says Compact is available from 70% and that automatic compaction is at 100%, without pressure', () => {
    const { container } = render(<ContextMeter tokens={760_000} capacity={1_000_000}/>);
    expect(screen.getByText('Compact tersedia; otomatis di 100%')).toBeInTheDocument();
    expect(container.firstElementChild).toHaveAttribute('data-level', 'warn');
    expect(container.textContent).not.toMatch(/Segera compact|Waktu yang pas/);
  });
  it('says "Hampir penuh" from 90%', () => {
    const { container } = render(<ContextMeter tokens={905_000} capacity={1_000_000}/>);
    expect(screen.getByText('Hampir penuh')).toBeInTheDocument();
    expect(container.firstElementChild).toHaveAttribute('data-level', 'critical');
  });
  it('says capacity is unknown instead of inventing one, and renders nothing without data', () => {
    const view = render(<ContextMeter tokens={90_000}/>);
    expect(screen.getByText('90k · kapasitas tidak diketahui')).toBeInTheDocument();
    view.rerender(<ContextMeter/>);
    expect(view.container).toBeEmptyDOMElement();
  });
  it('renders one coloured segment per category sized by tokens / window, keeping the meter role and the 70% marker', () => {
    const segments = [{ key: 'system' as const, tokens: 10_000 }, { key: 'tools' as const, tokens: 20_000 },
      { key: 'conversation' as const, tokens: 30_000 }, { key: 'memory' as const, tokens: 40_000 }];
    const { container } = render(<ContextMeter tokens={100_000} capacity={1_000_000} segments={segments} hideLabel/>);
    expect(screen.getByTestId('context-segment-system')).toHaveStyle({ width: '1%', backgroundColor: SEGMENT_COLORS.system });
    expect(screen.getByTestId('context-segment-tools')).toHaveStyle({ width: '2%' });
    expect(screen.getByTestId('context-segment-conversation')).toHaveStyle({ width: '3%' });
    expect(screen.getByTestId('context-segment-memory')).toHaveStyle({ width: '4%', backgroundColor: SEGMENT_COLORS.memory });
    expect(screen.getByRole('meter')).toHaveAttribute('aria-valuenow', '10');
    expect(screen.getByTestId('context-meter-mark')).toHaveStyle({ left: '70%' });
    expect(container.firstElementChild).toHaveAttribute('data-level', 'ok');
  });
  it('caps the segments so their sum never exceeds 100%', () => {
    expect(contextSegmentWidths([{ key: 'system', tokens: 600_000 }, { key: 'tools', tokens: 600_000 }, { key: 'memory', tokens: 5 }], 1_000_000))
      .toEqual([{ key: 'system', width: 60 }, { key: 'tools', width: 40 }, { key: 'memory', width: 0 }]);
    render(<ContextMeter tokens={1_200_000} capacity={1_000_000} segments={[{ key: 'system', tokens: 600_000 }, { key: 'tools', tokens: 600_000 }]}/>);
    expect(screen.getByTestId('context-segment-system')).toHaveStyle({ width: '60%' });
    expect(screen.getByTestId('context-segment-tools')).toHaveStyle({ width: '40%' });
  });
  it('falls back to the single bar when the capacity is unknown, even with segments', () => {
    render(<ContextMeter tokens={90_000} segments={[{ key: 'system', tokens: 90_000 }]}/>);
    expect(screen.queryByTestId('context-segment-system')).toBeNull();
    expect(screen.getByRole('meter')).not.toHaveAttribute('aria-valuenow');
    expect(screen.getByText('90k · kapasitas tidak diketahui')).toBeInTheDocument();
  });
});

describe('contextBreakdownRows', () => {
  // system, tools, memory, conversation: the required categories, in their fixed display order (skills/toolResults omitted here).
  const LABELS = ['System Instructions', 'Tools & MCP Manifests', 'Memory Injections', 'Conversation & Files'];
  it('scales the estimates to the provider total in a fixed order and the rows add up exactly', () => {
    const rows = contextBreakdownRows({ system: 3, tools: 6, conversation: 7, memory: 4 }, 1000);
    expect(rows.map(row => row.key)).toEqual(['system', 'tools', 'memory', 'conversation']);
    expect(rows.map(row => row.label)).toEqual(LABELS);
    expect(rows.map(row => row.tokens)).toEqual([150, 300, 200, 350]);
    expect(rows.map(row => row.percent)).toEqual([15, 30, 20, 35]);
    expect(rows.reduce((sum, row) => sum + row.tokens, 0)).toBe(1000);
  });
  it('uses largest-remainder rounding so the token sum is exactly the total', () => {
    const rows = contextBreakdownRows({ system: 1, tools: 1, conversation: 1, memory: 0 }, 100);
    expect(rows.map(row => row.tokens)).toEqual([34, 33, 0, 33]);
    expect(rows.map(row => row.percent)).toEqual([34, 33, 0, 33]);
    expect(rows.reduce((sum, row) => sum + row.tokens, 0)).toBe(100);
    const big = contextBreakdownRows({ system: 1234, tools: 5678, conversation: 91011, memory: 7 }, 123_457);
    expect(big.reduce((sum, row) => sum + row.tokens, 0)).toBe(123_457);
  });
  it('adds percentOfWindow rounded to one decimal only when the capacity is known, and a Free space row for the remainder', () => {
    const rows = contextBreakdownRows({ system: 3, tools: 6, conversation: 7, memory: 4 }, 1000, 3000);
    expect(rows.map(row => row.key)).toEqual(['system', 'tools', 'memory', 'conversation', 'free']);
    expect(rows.map(row => row.percentOfWindow)).toEqual([5, 10, 6.7, 11.7, 66.7]);
    expect(rows.map(row => row.percent)).toEqual([15, 30, 20, 35, 0]);
    expect(rows.at(-1)).toMatchObject({ label: 'Free space', tokens: 2000 });
    expect(contextBreakdownRows({ system: 1, tools: 0, conversation: 0, memory: 0 }, 373_100, 1_000_000)[0].percentOfWindow).toBe(37.3);
    for (const capacity of [undefined, null, 0, -1, Number.NaN]) {
      const rowsNoCapacity = contextBreakdownRows({ system: 1, tools: 0, conversation: 0, memory: 0 }, 1000, capacity);
      expect(rowsNoCapacity.find(row => row.key === 'free')).toBeUndefined();
      expect(rowsNoCapacity[0]!.percentOfWindow).toBeUndefined();
      expect(rowsNoCapacity[0]!.percent).toBe(100);
    }
  });
  it('is empty without a breakdown, with all-zero estimates, or without a provider total', () => {
    expect(contextBreakdownRows(undefined, 1000)).toEqual([]);
    expect(contextBreakdownRows({ system: 0, tools: 0, conversation: 0, memory: 0 }, 1000)).toEqual([]);
    expect(contextBreakdownRows({ system: 1, tools: 1, conversation: 1, memory: 1 }, 0)).toEqual([]);
  });
  it('only rows skills/toolResults when the breakdown actually carries them, in their fixed slots', () => {
    const withBoth = contextBreakdownRows({ system: 1, tools: 1, conversation: 1, memory: 1, skills: 1, toolResults: 1 }, 600);
    expect(withBoth.map(row => row.key)).toEqual(['system', 'tools', 'skills', 'memory', 'conversation', 'toolResults']);
    const withoutEither = contextBreakdownRows({ system: 1, tools: 1, conversation: 1, memory: 1 }, 400);
    expect(withoutEither.map(row => row.key)).toEqual(['system', 'tools', 'memory', 'conversation']);
  });
  it('isCategoryRow excludes only the synthetic Free space row', () => {
    const rows = contextBreakdownRows({ system: 1, tools: 1, conversation: 1, memory: 1 }, 1000, 2000);
    expect(rows.filter(isCategoryRow).map(row => row.key)).toEqual(['system', 'tools', 'memory', 'conversation']);
    expect(rows.find(row => row.key === 'free')).toBeDefined();
    expect(FREE_SPACE_COLOR).not.toBe(SEGMENT_COLORS.system);
  });
});

describe('reduceContextUsage', () => {
  it('keeps the last context.usage per conversation and ignores other events', () => {
    const first = reduceContextUsage(undefined, ev({ type: 'context.usage', contextTokens: 100_000, contextWindow: 1_000_000, iteration: 2 }));
    expect(first).toEqual({ conversationId: 'chat-1', contextTokens: 100_000, contextWindow: 1_000_000, iteration: 2 });
    expect(reduceContextUsage(first, ev({ type: 'tool.started' }))).toBe(first);
    const next = reduceContextUsage(first, ev({ type: 'context.usage', contextTokens: 120_000, iteration: 3 }));
    expect(next).toEqual({ conversationId: 'chat-1', contextTokens: 120_000, iteration: 3 });
  });
  it('carries the breakdown of the event and never inherits an older one', () => {
    const contextBreakdown = { system: 10, tools: 20, conversation: 30, memory: 5 };
    const first = reduceContextUsage(undefined, ev({ type: 'context.usage', contextTokens: 100_000, contextBreakdown }));
    expect(first).toEqual({ conversationId: 'chat-1', contextTokens: 100_000, contextBreakdown });
    const next = reduceContextUsage(first, ev({ type: 'context.usage', contextTokens: 120_000 }));
    expect(next).toEqual({ conversationId: 'chat-1', contextTokens: 120_000 });
    expect(next).not.toHaveProperty('contextBreakdown');
  });
  it('keeps the last real cache tokens across a later interim estimate, and sets estimated only on that event', () => {
    const real = reduceContextUsage(undefined,
      ev({ type: 'context.usage', contextTokens: 100_000, cacheReadTokens: 80_000, cacheWriteTokens: 5_000 }));
    expect(real).toEqual({ conversationId: 'chat-1', contextTokens: 100_000, cacheReadTokens: 80_000, cacheWriteTokens: 5_000 });
    const estimate = reduceContextUsage(real, ev({ type: 'context.usage', contextTokens: 140_000, estimated: true }));
    expect(estimate).toEqual({ conversationId: 'chat-1', contextTokens: 140_000, cacheReadTokens: 80_000, cacheWriteTokens: 5_000, estimated: true });
    // The next real measurement overwrites only the cache field it carries (cacheWriteTokens is still coalesced forward)
    // and clears estimated (the event carries neither the key nor true).
    const nextReal = reduceContextUsage(estimate, ev({ type: 'context.usage', contextTokens: 150_000, cacheReadTokens: 90_000 }));
    expect(nextReal).toEqual({ conversationId: 'chat-1', contextTokens: 150_000, cacheReadTokens: 90_000, cacheWriteTokens: 5_000 });
  });
  it('never carries cache tokens over from a different conversation', () => {
    const first = reduceContextUsage(undefined, ev({ type: 'context.usage', contextTokens: 100_000, cacheReadTokens: 80_000 }));
    const other = reduceContextUsage(first, { ...ev({ type: 'context.usage', contextTokens: 50_000 }), conversationId: 'chat-2' });
    expect(other).toEqual({ conversationId: 'chat-2', contextTokens: 50_000 });
  });
});

describe('selectContextUsage', () => {
  it('falls back to the last turn with a context size and returns that turn\'s breakdown', () => {
    const contextBreakdown = { system: 1, tools: 2, conversation: 3, memory: 4 };
    const chat = { active: { conversation: { id: 'chat-1' }, turns: [
      { id: 't1', contextTokens: 50, contextWindow: 100, contextBreakdown: { system: 9, tools: 9, conversation: 9, memory: 9 } },
      { id: 't2', contextTokens: 60, contextWindow: 100, contextBreakdown },
      { id: 't3' }] } } as unknown as AgentChatUiState;
    expect(selectContextUsage(chat)).toEqual({ contextTokens: 60, contextWindow: 100, contextBreakdown });
    const bare = { active: { conversation: { id: 'chat-1' }, turns: [{ id: 't1', contextTokens: 50 }] } } as unknown as AgentChatUiState;
    expect(selectContextUsage(bare)).toEqual({ contextTokens: 50 });
  });
  it('maps a turn\'s cache tokens and estimated flag, omitting them when absent', () => {
    const chat = { active: { conversation: { id: 'chat-1' }, turns: [
      { id: 't1', contextTokens: 90, cacheReadTokens: 70, cacheWriteTokens: 3, contextEstimated: true }] } } as unknown as AgentChatUiState;
    expect(selectContextUsage(chat)).toEqual({ contextTokens: 90, cacheReadTokens: 70, cacheWriteTokens: 3, estimated: true });
    const withoutThem = { active: { conversation: { id: 'chat-1' }, turns: [{ id: 't1', contextTokens: 90 }] } } as unknown as AgentChatUiState;
    expect(selectContextUsage(withoutThem)).toEqual({ contextTokens: 90 });
  });
});
