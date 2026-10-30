import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ActivityStatus } from './ActivityStatus';
import type { AgentChatEvent, AgentChatStepMeta } from './host';

const ev = (over: Partial<AgentChatEvent> & { type: string }): AgentChatEvent => ({ at: '2026-10-30T10:00:00.000Z', conversationId: 'c', turnId: 't', ...over });
const step = (seq: number, over: Partial<AgentChatStepMeta> = {}): AgentChatStepMeta =>
  ({ turnId: 't', seq, toolName: 'read_file', status: 'ok', startedAtMs: 0, durationMs: 120, argsSummary: 'path="f' + seq + '.ts"', ...over });

afterEach(() => { vi.useRealTimers(); });

describe('ActivityStatus', () => {
  it('shows one card whose state, icon and text follow the latest event', () => {
    const view = render(<ActivityStatus turnStatus="running" event={ev({ type: 'tool.started', toolName: 'web_search' })} steps={[]}/>);
    const shell = () => view.container.querySelector('.status-shell') as HTMLElement;
    expect(shell()).toHaveAttribute('data-state', 'web_search');
    expect(screen.getByText('Searching the web…')).toBeInTheDocument();
    expect(view.container.querySelector('.status-icon svg')).not.toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('Searching the web…');
    view.rerender(<ActivityStatus turnStatus="running" event={ev({ type: 'tool.completed', toolName: 'web_search', success: false })} steps={[]}/>);
    expect(shell()).toHaveAttribute('data-state', 'debugging');
    expect(view.container.querySelectorAll('.status-shell')).toHaveLength(1);
  });

  it('opens the latest nine events with the chevron, closes with Escape and keeps all steps below', () => {
    const steps = Array.from({ length: 12 }, (_, index) => step(index + 1));
    const view = render(<ActivityStatus turnStatus="running" steps={steps}><p>full step list</p></ActivityStatus>);
    const chevron = screen.getByRole('button', { name: 'Show recent activity' });
    const panel = () => view.container.querySelector('.status-details') as HTMLElement;
    expect(panel()).toHaveAttribute('hidden');
    fireEvent.click(chevron);
    expect(chevron).toHaveAttribute('aria-expanded', 'true');
    expect(panel()).not.toHaveAttribute('hidden');
    expect(view.container.querySelectorAll('.details-log li')).toHaveLength(9);
    expect(view.container.querySelector('.details-log li')).toHaveTextContent('f12.ts');
    expect(screen.getByText('All steps').closest('details')).not.toHaveAttribute('open');
    expect(screen.getByText('full step list')).toBeInTheDocument();
    fireEvent.keyDown(panel(), { key: 'Escape' });
    expect(panel()).toHaveAttribute('hidden');
    expect(chevron).toHaveFocus();
  });

  it('counts the duration only while the turn runs and shows a compact card for a finished turn', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-30T10:00:00.000Z'));
    const startedAtMs = Date.parse('2026-10-30T10:00:00.000Z');
    const view = render(<ActivityStatus turnStatus="running" steps={[]} startedAtMs={startedAtMs}/>);
    const duration = () => view.container.querySelector('.details-duration');
    act(() => { vi.advanceTimersByTime(40_000); });
    expect(duration()).toHaveTextContent('00:40');
    view.rerender(<ActivityStatus turnStatus="finalized" compact steps={[step(1), step(2)]} startedAtMs={startedAtMs} completedAtMs={startedAtMs + 40_000}/>);
    act(() => { vi.advanceTimersByTime(20_000); });
    expect(duration()).toHaveTextContent('00:40');
    expect(view.container.querySelector('.activity-status--compact')).not.toBeNull();
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(view.container.querySelector('.activity-status__duration')).toHaveTextContent('00:40 · 2 steps');
  });
});
