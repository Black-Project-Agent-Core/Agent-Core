import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SessionTaskView } from './SessionTaskView';

const records = [
  { sequence:1, timestamp:'2026-09-01T00:00:00Z', category:'memory', event:'memory.recalled', contextId:'ctx-a', continuityTaskId:'task-a' },
  { sequence:2, timestamp:'2026-09-01T00:00:01Z', category:'memory', event:'memory.write_decision', contextId:'ctx-a', continuityTaskId:'task-a' },
  { sequence:3, timestamp:'2026-09-01T00:00:02Z', category:'memory', event:'memory.recalled', contextId:'ctx-b', continuityTaskId:'task-b' },
  { sequence:4, timestamp:'2026-09-01T00:00:03Z', category:'memory', event:'memory.remember_more_expanded', contextId:'ctx-only' },
];

describe('SessionTaskView', () => {
  it('groups same continuity task/context events together and keeps unrelated groups separate', () => {
    render(<SessionTaskView records={records as any} />);
    const taskA = screen.getByTestId('session-group-task-a');
    expect(within(taskA).getByText('memory.recalled')).toBeInTheDocument();
    expect(within(taskA).getByText('memory.write_decision')).toBeInTheDocument();
    expect(within(taskA).getByText('ctx-a')).toBeInTheDocument();
    expect(screen.getByTestId('session-group-task-b')).toBeInTheDocument();
    expect(screen.getByTestId('session-group-ctx-only')).toBeInTheDocument();
    expect(screen.getAllByTestId(/^session-group-/)).toHaveLength(3);
  });
});
