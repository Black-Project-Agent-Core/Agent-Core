import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MemoryGraph } from './MemoryGraph';

describe('MemoryGraph scaffold', () => {
  it('renders a read-only graph canvas', () => {
    render(<MemoryGraph />);
    expect(screen.getByLabelText('Memory graph')).toBeInTheDocument();
    expect(screen.getByTestId('graph-canvas')).toBeInTheDocument();
  });
});
