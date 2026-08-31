import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AgentCodeApp } from '../app/AgentCodeApp';

describe('AgentCodeApp', () => {
  it('renders the Agent Code product shell', () => {
    render(<AgentCodeApp />);
    expect(screen.getByRole('application', { name: 'Agent Code' })).toBeInTheDocument();
  });
});
