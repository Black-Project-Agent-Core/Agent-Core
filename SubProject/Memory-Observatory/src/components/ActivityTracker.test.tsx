import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ActivityTracker } from './ActivityTracker';
import type { ObservatoryActivity } from '../app/types';

const records: ObservatoryActivity[] = [
  {
    sequence: 41,
    timestamp: '2026-09-01T06:10:11.123Z',
    category: 'memory',
    event: 'memory.write_decision',
    state: 'completed',
    memoryIds: ['memory-a', 'memory-b'],
    relation: 'resolved_by',
    decisionType: 'REVISE_EXISTING',
    reasonCodes: ['SOLUTION_VERIFIED', 'CURRENT_STATE_CHANGED'],
    requestId: 'request-41',
    durationMs: 12,
  },
  {
    sequence: 42,
    timestamp: '2026-09-01T06:10:12.000Z',
    category: 'http',
    event: 'request.completed',
    state: 'completed',
    statusCode: '200',
  },
];

describe('ActivityTracker', () => {
  it('shows ordered event evidence fields and hides HTTP noise by default', () => {
    render(<ActivityTracker records={records} gap={false} />);
    const tracker = screen.getByLabelText('Live activity');
    expect(within(tracker).getByText('memory.write_decision')).toBeInTheDocument();
    expect(within(tracker).getByText('COMPLETED')).toBeInTheDocument();
    expect(within(tracker).getByText('memory-a · memory-b')).toBeInTheDocument();
    expect(within(tracker).getByText('resolved_by')).toBeInTheDocument();
    expect(within(tracker).getByText('REVISE_EXISTING')).toBeInTheDocument();
    expect(within(tracker).getByText('SOLUTION_VERIFIED · CURRENT_STATE_CHANGED')).toBeInTheDocument();
    expect(within(tracker).getByText('request-41')).toBeInTheDocument();
    expect(within(tracker).getByText('12 ms')).toBeInTheDocument();
    expect(within(tracker).queryByText('request.completed')).not.toBeInTheDocument();
  });

  it('can explicitly enable HTTP activity and filter by state', () => {
    render(<ActivityTracker records={records} gap={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'HTTP' }));
    expect(screen.getByText('request.completed')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Filter activity state'), { target: { value: 'failed' } });
    expect(screen.queryByText('memory.write_decision')).not.toBeInTheDocument();
    expect(screen.queryByText('request.completed')).not.toBeInTheDocument();
  });

  it('shows the explicit retained-history gap banner', () => {
    render(<ActivityTracker records={records} gap />);
    expect(screen.getByText('HISTORY GAP — GRAPH RESYNCED')).toBeInTheDocument();
  });
});
