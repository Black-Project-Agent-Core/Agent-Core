import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ActivityTracker } from './ActivityTracker';

describe('ActivityTracker scaffold', () => {
  it('renders a read-only activity rail', () => {
    render(<ActivityTracker />);
    expect(screen.getByLabelText('Live activity')).toBeInTheDocument();
    expect(screen.getByText('Waiting for persisted activity…')).toBeInTheDocument();
  });
});
