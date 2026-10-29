import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ContextMeter, contextMeterModel, formatTokenCount } from './ContextMeter';
import { reduceContextUsage } from './host';
import type { AgentChatEvent } from './host';

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
  it('is normal below 70%, amber from 70%, red from 85%', () => {
    expect(contextMeterModel(699_000, 1_000_000).level).toBe('ok');
    expect(contextMeterModel(700_000, 1_000_000)).toMatchObject({ level: 'warn', hint: 'Waktu yang pas untuk compact' });
    expect(contextMeterModel(849_000, 1_000_000).level).toBe('warn');
    expect(contextMeterModel(850_000, 1_000_000).level).toBe('critical');
  });
  it('never guesses a capacity', () => {
    expect(contextMeterModel(135_000, null)).toMatchObject({ level: 'unknown', known: false,
      label: '135k · kapasitas tidak diketahui' });
  });
});

describe('ContextMeter', () => {
  it('shows used / window, percent and the 70% marker', () => {
    render(<ContextMeter tokens={135_000} capacity={1_000_000}/>);
    expect(screen.getByText('135k / 1M · 14%')).toBeInTheDocument();
    expect(screen.getByTitle('compact manual paling pas ~70%')).toBeInTheDocument();
    expect(screen.getByRole('meter')).toHaveAttribute('aria-valuenow', '14');
  });
  it('tells the user when it is time to compact', () => {
    const { container } = render(<ContextMeter tokens={720_000} capacity={1_000_000}/>);
    expect(screen.getByText('Waktu yang pas untuk compact')).toBeInTheDocument();
    expect(container.firstElementChild).toHaveAttribute('data-level', 'warn');
  });
  it('says capacity is unknown instead of inventing one, and renders nothing without data', () => {
    const view = render(<ContextMeter tokens={90_000}/>);
    expect(screen.getByText('90k · kapasitas tidak diketahui')).toBeInTheDocument();
    view.rerender(<ContextMeter/>);
    expect(view.container).toBeEmptyDOMElement();
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
});
