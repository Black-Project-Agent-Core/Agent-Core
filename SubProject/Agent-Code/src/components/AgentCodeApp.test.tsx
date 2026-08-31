import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AgentCodeApp } from '../app/AgentCodeApp';

describe('AgentCodeApp', () => {
  it('renders the Agent Code product shell', () => {
    render(<AgentCodeApp />);
    expect(screen.getByRole('application', { name: 'Agent Code' })).toBeInTheDocument();
  });

  it('renders the focused console hierarchy without dashboard cards', () => {
    render(<AgentCodeApp />);
    expect(screen.getByRole('button', { name: 'New session' })).toBeInTheDocument();
    expect(screen.getByText('PROJECTS')).toBeInTheDocument();
    expect(screen.getByText('RECENT')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'What are we building?' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Describe a task or ask a question')).toBeInTheDocument();
    expect(screen.queryByText(/sessions|tokens|streak|statistics/i)).not.toBeInTheDocument();
  });
  it('uses the prompt mark in the sidebar and the monogram in the welcome state', () => {
    render(<AgentCodeApp />);
    expect(screen.getByRole('img', { name: 'Agent Code app icon' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Agent Code monogram' })).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'Agent Code premium emblem' })).not.toBeInTheDocument();
  });

});
