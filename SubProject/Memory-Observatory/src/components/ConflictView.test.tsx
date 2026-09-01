import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ConflictView } from './ConflictView';

const nodes = [
  { memoryId:'left', title:'Use Architecture X' },
  { memoryId:'right', title:'Do Not Use Architecture X' },
];

describe('ConflictView', () => {
  it('preserves both memories and evidence when conflict status changes from open to resolved', () => {
    const conflict = { conflictId:'c1', leftMemoryId:'left', rightMemoryId:'right', conflictType:'contradicts', status:'open', evidence:{ reason:'verified contradiction' }, createdAt:1 };
    const { rerender } = render(<ConflictView snapshot={{ nodes, conflicts:[conflict] } as any} />);
    const card = screen.getByTestId('conflict-c1');
    expect(within(card).getByText('Use Architecture X')).toBeInTheDocument();
    expect(within(card).getByText('Do Not Use Architecture X')).toBeInTheDocument();
    expect(within(card).getByText('OPEN')).toBeInTheDocument();
    expect(within(card).getByText(/verified contradiction/)).toBeInTheDocument();

    rerender(<ConflictView snapshot={{ nodes, conflicts:[{...conflict,status:'resolved',resolvedAt:2}] } as any} />);
    expect(screen.getByText('RESOLVED')).toBeInTheDocument();
    expect(screen.getByText('Use Architecture X')).toBeInTheDocument();
    expect(screen.getByText('Do Not Use Architecture X')).toBeInTheDocument();
  });
});
