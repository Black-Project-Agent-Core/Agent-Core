import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AUTO_COMPACT_PERCENT, ContextMeter, NEAR_FULL_PERCENT, contextBreakdownRows, contextMeterModel, formatTokenCount } from './ContextMeter';
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
  it('is ok below 75%, warn from the 75% auto-compaction point, critical from 90%', () => {
    expect(AUTO_COMPACT_PERCENT).toBe(75);
    expect(NEAR_FULL_PERCENT).toBe(90);
    expect(contextMeterModel(749_000, 1_000_000).level).toBe('ok');
    expect(contextMeterModel(750_000, 1_000_000)).toMatchObject({ level: 'warn', hint: 'Kompak otomatis dimulai di ~75%' });
    expect(contextMeterModel(899_000, 1_000_000).level).toBe('warn');
    expect(contextMeterModel(900_000, 1_000_000)).toMatchObject({ level: 'critical', hint: 'Hampir penuh' });
  });
  it('never mentions a manual compact action the product does not have', () => {
    for (const tokens of [100_000, 750_000, 900_000]) {
      expect(JSON.stringify(contextMeterModel(tokens, 1_000_000))).not.toMatch(/compact manual|Segera compact|Waktu yang pas/);
    }
  });
  it('never guesses a capacity', () => {
    expect(contextMeterModel(135_000, null)).toMatchObject({ level: 'unknown', known: false,
      label: '135k · kapasitas tidak diketahui' });
  });
});

describe('ContextMeter', () => {
  it('shows used / window, percent and the 75% auto-compaction marker', () => {
    render(<ContextMeter tokens={135_000} capacity={1_000_000}/>);
    expect(screen.getByText('135k / 1M · 14%')).toBeInTheDocument();
    expect(screen.getByTitle('kompak otomatis ~75%')).toBeInTheDocument();
    expect(screen.getByTestId('context-meter-mark')).toHaveStyle({ left: '75%' });
    expect(screen.getByText('kompak otomatis ~75%')).toBeInTheDocument();
    expect(screen.getByRole('meter')).toHaveAttribute('aria-valuenow', '14');
  });
  it('tells the user that automatic compaction starts, never to compact manually', () => {
    const { container } = render(<ContextMeter tokens={760_000} capacity={1_000_000}/>);
    expect(screen.getByText('Kompak otomatis dimulai di ~75%')).toBeInTheDocument();
    expect(container.firstElementChild).toHaveAttribute('data-level', 'warn');
    expect(container.textContent).not.toMatch(/compact manual|Segera compact|Waktu yang pas/);
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
});

describe('contextBreakdownRows', () => {
  const LABELS = ['System Instructions', 'Tools & MCP Manifests', 'Conversation & Files', 'Memory Injections'];
  it('scales the estimates to the provider total in a fixed order and the rows add up exactly', () => {
    const rows = contextBreakdownRows({ system: 3, tools: 6, conversation: 7, memory: 4 }, 1000);
    expect(rows.map(row => row.key)).toEqual(['system', 'tools', 'conversation', 'memory']);
    expect(rows.map(row => row.label)).toEqual(LABELS);
    expect(rows.map(row => row.tokens)).toEqual([150, 300, 350, 200]);
    expect(rows.map(row => row.percent)).toEqual([15, 30, 35, 20]);
    expect(rows.reduce((sum, row) => sum + row.tokens, 0)).toBe(1000);
  });
  it('uses largest-remainder rounding so the token sum is exactly the total', () => {
    const rows = contextBreakdownRows({ system: 1, tools: 1, conversation: 1, memory: 0 }, 100);
    expect(rows.map(row => row.tokens)).toEqual([34, 33, 33, 0]);
    expect(rows.map(row => row.percent)).toEqual([34, 33, 33, 0]);
    expect(rows.reduce((sum, row) => sum + row.tokens, 0)).toBe(100);
    const big = contextBreakdownRows({ system: 1234, tools: 5678, conversation: 91011, memory: 7 }, 123_457);
    expect(big.reduce((sum, row) => sum + row.tokens, 0)).toBe(123_457);
  });
  it('is empty without a breakdown, with all-zero estimates, or without a provider total', () => {
    expect(contextBreakdownRows(undefined, 1000)).toEqual([]);
    expect(contextBreakdownRows({ system: 0, tools: 0, conversation: 0, memory: 0 }, 1000)).toEqual([]);
    expect(contextBreakdownRows({ system: 1, tools: 1, conversation: 1, memory: 1 }, 0)).toEqual([]);
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
});
