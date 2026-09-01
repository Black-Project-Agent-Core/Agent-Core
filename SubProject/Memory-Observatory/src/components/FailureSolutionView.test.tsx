import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FailureSolutionView } from './FailureSolutionView';

const snapshot = {
  nodes: [
    { memoryId:'failure', title:'Font Regression', kind:'failure' },
    { memoryId:'cause', title:'Post Scaling', kind:'observation' },
    { memoryId:'solution', title:'Native Geometry', kind:'decision' },
    { memoryId:'evidence', title:'Six File PASS', kind:'artifact' },
  ],
  edges: [
    { edgeId:'1', fromMemoryId:'failure', toMemoryId:'cause', relation:'failed_because' },
    { edgeId:'2', fromMemoryId:'cause', toMemoryId:'solution', relation:'resolved_by' },
    { edgeId:'3', fromMemoryId:'solution', toMemoryId:'evidence', relation:'validated_by' },
  ],
};

describe('FailureSolutionView', () => {
  it('renders the authoritative failure -> cause -> solution -> validation path in relation order', () => {
    render(<FailureSolutionView snapshot={snapshot as any} />);
    const text = screen.getByLabelText('Failure solution chains').textContent ?? '';
    expect(text.indexOf('Font Regression')).toBeLessThan(text.indexOf('Post Scaling'));
    expect(text.indexOf('Post Scaling')).toBeLessThan(text.indexOf('Native Geometry'));
    expect(text.indexOf('Native Geometry')).toBeLessThan(text.indexOf('Six File PASS'));
    expect(text).toContain('failed_because');
    expect(text).toContain('resolved_by');
    expect(text).toContain('validated_by');
  });
});
