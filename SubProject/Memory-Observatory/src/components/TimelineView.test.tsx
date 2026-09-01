import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TimelineView } from './TimelineView';

const snapshot = {
  timeline: [
    { timelineId: 'revision:r2', timestamp: 20, kind: 'revision', memoryIds: ['m1'], label: 'revision 2', revisionNo: 2, valuePreview: 'new value' },
    { timelineId: 'edge:e1', timestamp: 30, kind: 'edge_event', memoryIds: ['m1','m2'], label: 'edge.created', relation: 'resolved_by', reasonCodes: ['SOLUTION_VERIFIED'] },
    { timelineId: 'revision:r1', timestamp: 10, kind: 'revision', memoryIds: ['m1'], label: 'revision 1', revisionNo: 1, valuePreview: 'old value' },
    { timelineId: 'decision:d1', timestamp: 40, kind: 'write_decision', memoryIds: ['m1'], label: 'REVISE_EXISTING', decisionType: 'REVISE_EXISTING', evidenceRefs: ['test:timeline'] },
  ],
};

describe('TimelineView', () => {
  it('renders only authoritative timeline entries in deterministic chronology', () => {
    render(<TimelineView snapshot={snapshot as any} />);
    const items = screen.getAllByTestId('timeline-entry');
    expect(items.map((item) => item.getAttribute('data-timeline-id'))).toEqual(['revision:r1','revision:r2','edge:e1','decision:d1']);
    expect(screen.getByText('resolved_by')).toBeInTheDocument();
    expect(screen.getByText('REVISE_EXISTING')).toBeInTheDocument();
    expect(items).toHaveLength(snapshot.timeline.length);
  });
});
