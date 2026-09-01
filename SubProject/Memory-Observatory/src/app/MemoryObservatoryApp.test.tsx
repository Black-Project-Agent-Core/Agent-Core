import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryObservatoryApp } from './MemoryObservatoryApp';

afterEach(() => vi.unstubAllGlobals());

describe('MemoryObservatoryApp scaffold', () => {
  it('shows shadow health from the local read-only API without claiming graph/activity are already implemented', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      status: 'ok',
      mode: 'shadow',
      auditSequence: 42,
    }), { status: 200, headers: { 'content-type': 'application/json' } })));

    render(<MemoryObservatoryApp />);

    expect(screen.getByRole('heading', { name: 'Memory Observatory' })).toBeInTheDocument();
    expect(await screen.findByText('SHADOW · OBSERVER READY')).toBeInTheDocument();
    expect(screen.getByText('Authoritative DMF graph arrives in Task 7.')).toBeInTheDocument();
    expect(screen.getByText('Ordered audit activity arrives in Task 8.')).toBeInTheDocument();
  });
});
