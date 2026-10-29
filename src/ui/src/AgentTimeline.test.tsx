import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { InvocationCards, TurnTimeline, activityToSteps, buildTimeline, pickTurnSteps, stepCategory, summarizeSteps } from './AgentTimeline';
import type { AgentChatActivity, AgentChatStepMeta } from './host';

const meta = (over: Partial<AgentChatStepMeta> = {}): AgentChatStepMeta => ({
  turnId: 'turn-1', seq: 1, iteration: 1, toolName: 'read_file', status: 'ok', startedAtMs: 10,
  durationMs: 1000, argsSummary: 'path="a"', resultSummary: 'ok', ...over });
const note = (seq: number, text: string): AgentChatStepMeta =>
  ({ turnId: 'turn-1', seq, kind: 'note', toolName: '', status: 'ok', startedAtMs: 0, resultSummary: text });

describe('stepCategory', () => {
  it('maps every known tool family and falls back to other', () => {
    expect(stepCategory('read_file')).toBe('read');
    expect(stepCategory('list_directory')).toBe('read');
    expect(stepCategory('start_search')).toBe('search');
    expect(stepCategory('code_graph')).toBe('search');
    expect(stepCategory('start_process')).toBe('run');
    expect(stepCategory('kill_process')).toBe('run');
    expect(stepCategory('edit_block')).toBe('edit');
    expect(stepCategory('write_pdf')).toBe('edit');
    expect(stepCategory('memory_search')).toBe('memory');
    expect(stepCategory('learning')).toBe('memory');
    expect(stepCategory('skills')).toBe('memory');
    expect(stepCategory('web_search')).toBe('web');
    expect(stepCategory('browser_control')).toBe('web');
    expect(stepCategory('phone_tap')).toBe('other');
    expect(stepCategory('')).toBe('other');
  });
});

describe('summarizeSteps', () => {
  it('counts per category in a fixed order, skips empty categories and notes', () => {
    const steps = [
      meta({ seq: 1, toolName: 'start_process' }), meta({ seq: 2, toolName: 'read_file' }), note(3, 'thinking'),
      meta({ seq: 4, toolName: 'read_file' }), meta({ seq: 5, toolName: 'web_open' }), meta({ seq: 6, toolName: 'start_process' }),
    ];
    expect(summarizeSteps(steps)).toBe('2 pembacaan, 2 perintah, 1 akses web');
    expect(summarizeSteps([meta({ toolName: 'phone_tap' })])).toBe('1 langkah lain');
    expect(summarizeSteps([note(1, 'x')])).toBe('');
  });
});

describe('buildTimeline', () => {
  it('splits groups at notes, drops blank notes, sorts by seq and keeps stable keys', () => {
    const items = buildTimeline([
      meta({ seq: 4, toolName: 'edit_block' }), note(3, '  Now editing  '), meta({ seq: 2 }), meta({ seq: 1 }), note(5, '   '),
    ]);
    expect(items.map(item => item.type)).toEqual(['group', 'note', 'group']);
    expect(items[0]).toMatchObject({ type: 'group', key: 'g:turn-1:1' });
    expect((items[0] as { steps: AgentChatStepMeta[] }).steps.map(step => step.seq)).toEqual([1, 2]);
    expect(items[1]).toEqual({ type: 'note', key: 'n:turn-1:3', text: '  Now editing  ' });
    expect(items[2]).toMatchObject({ type: 'group', key: 'g:turn-1:4' });
    expect((items[2] as { steps: AgentChatStepMeta[] }).steps).toHaveLength(1);
    expect(buildTimeline([])).toEqual([]);
  });
});

describe('activityToSteps', () => {
  it('maps live activity to ordered steps, drops budget rows and keeps notes', () => {
    const items: AgentChatActivity[] = [
      { id: 'a', toolName: 'read_file', status: 'done', iteration: 1, durationMs: 5, argsSummary: 'p', resultSummary: 'r' },
      { id: 'b', kind: 'budget', toolName: '', status: 'done', text: 'limit' },
      { id: 'c', kind: 'note', toolName: '', status: 'done', text: 'Reading first' },
      { id: 'd', toolName: 'start_process', status: 'running' },
      { id: 'e', toolName: 'edit_block', status: 'failed' },
    ];
    const steps = activityToSteps('turn-9', items);
    expect(steps.map(step => step.seq)).toEqual([1, 2, 3, 4]);
    expect(steps[0]).toEqual({ turnId: 'turn-9', seq: 1, toolName: 'read_file', status: 'ok', iteration: 1, durationMs: 5,
      argsSummary: 'p', resultSummary: 'r', startedAtMs: 0 });
    expect(steps[1]).toEqual({ turnId: 'turn-9', seq: 2, kind: 'note', toolName: '', status: 'ok', resultSummary: 'Reading first', startedAtMs: 0 });
    expect(steps[2].status).toBe('running');
    expect(steps[3].status).toBe('error');
  });
});

describe('pickTurnSteps', () => {
  it('prefers stored steps when they are at least as long as the live ones', () => {
    const stored = [meta({ seq: 1 }), meta({ seq: 2 })];
    expect(pickTurnSteps(stored, [meta({ seq: 1 })])).toEqual({ steps: stored, readOnly: false });
    expect(pickTurnSteps(stored, [meta({ seq: 1 }), meta({ seq: 2, toolName: 'x' })])).toEqual({ steps: stored, readOnly: false });
  });

  it('falls back to live steps as read-only when they are longer', () => {
    const live = [meta({ seq: 1 }), meta({ seq: 2 }), note(3, 'n')];
    expect(pickTurnSteps([meta({ seq: 1 })], live)).toEqual({ steps: live, readOnly: true });
  });

  it('returns an empty list when both are empty', () => {
    expect(pickTurnSteps([], [])).toEqual({ steps: [], readOnly: false });
  });
});

describe('TurnTimeline', () => {
  const three = [meta({ seq: 1 }), meta({ seq: 2, toolName: 'start_search' }), meta({ seq: 3, toolName: 'start_process' })];

  it('renders narration and a closed summary group when nothing runs', () => {
    const view = render(<TurnTimeline steps={[note(0, 'Let me look'), ...three]}/>);
    expect(screen.getByText('Let me look').className).toBe('chat-narration');
    const details = view.container.querySelector('details.chat-step-group') as HTMLDetailsElement;
    expect(details).not.toBeNull();
    expect(details.hasAttribute('open')).toBe(false);
    expect(details.querySelector('summary')).toHaveTextContent('1 pembacaan, 1 pencarian, 1 perintah · 3 langkah · 3,0 s');
    expect(details.querySelectorAll('li.chat-step')).toHaveLength(3);
  });

  it('opens the group while a step runs and renders a single step without details', () => {
    const running = render(<TurnTimeline steps={[three[0], meta({ seq: 2, status: 'running', durationMs: undefined })]}/>);
    const details = running.container.querySelector('details.chat-step-group') as HTMLDetailsElement;
    expect(details.hasAttribute('open')).toBe(true);
    expect(details.querySelector('summary')).toHaveTextContent('2 pembacaan · 2 langkah');
    expect(details.querySelector('summary')).not.toHaveTextContent(' s');
    running.unmount();
    const single = render(<TurnTimeline steps={[three[0]]}/>);
    expect(single.container.querySelector('details')).toBeNull();
    expect(single.container.querySelectorAll('ul.chat-step-list > li.chat-step')).toHaveLength(1);
  });

  it('renders nothing for an empty list and disables rows when readOnly', () => {
    const empty = render(<TurnTimeline steps={[]}/>);
    expect(empty.container.innerHTML).toBe('');
    empty.unmount();
    const onStepDetail = vi.fn();
    render(<TurnTimeline steps={[three[0]]} onStepDetail={onStepDetail} readOnly/>);
    const toggle = screen.getByRole('button', { name: /Used read_file/ });
    expect(toggle).toBeDisabled();
    fireEvent.click(toggle);
    expect(onStepDetail).not.toHaveBeenCalled();
  });
});

describe('InvocationCards', () => {
  it('renders null without tool steps and ignores notes', () => {
    const view = render(<InvocationCards steps={[note(1, 'x')]}/>);
    expect(view.container.innerHTML).toBe('');
  });

  it('lists at most six invocations and a +N row', () => {
    const steps = Array.from({ length: 8 }, (_, i) => meta({ seq: i + 1, toolName: 'tool_' + i, resultSummary: 'r' + i }));
    const view = render(<InvocationCards steps={[note(0, 'n'), ...steps]}/>);
    expect(screen.getByRole('region', { name: 'Executed invocations' })).toBeInTheDocument();
    expect(screen.getByText('EXECUTED INVOCATIONS (8)')).toBeInTheDocument();
    expect(view.container.querySelectorAll('li')).toHaveLength(7);
    expect(screen.getByText('+2 lainnya').className).toBe('chat-invocations-more');
    expect(screen.getByText('tool_0').tagName).toBe('B');
    expect(screen.getByText('r0').tagName).toBe('CODE');
    expect(screen.getAllByText('✓ 1,0 s')).toHaveLength(6);
    expect(screen.queryByText('tool_6')).toBeNull();
  });
});
