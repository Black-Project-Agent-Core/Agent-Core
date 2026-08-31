import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

  it('does not submit an empty composer', async () => {
    const user = userEvent.setup();
    render(<AgentCodeApp />);
    await user.click(screen.getByRole('button', { name: 'Submit prompt' }));
    expect(screen.queryByTestId('local-message')).not.toBeInTheDocument();
  });

  it('shows a submitted local user message and no AI response', async () => {
    const user = userEvent.setup();
    render(<AgentCodeApp />);
    const composer = screen.getByPlaceholderText('Describe a task or ask a question');
    await user.type(composer, 'Build a clean command palette');
    await user.keyboard('{Enter}');
    expect(screen.getByText('Build a clean command palette')).toHaveAttribute('data-testid', 'local-message');
    expect(screen.queryByText(/assistant response|thinking|generated/i)).not.toBeInTheDocument();
    expect(composer).toHaveValue('');
  });

  it('creates a fresh local session and can select an existing session', async () => {
    const user = userEvent.setup();
    render(<AgentCodeApp />);
    await user.click(screen.getByRole('button', { name: 'New session' }));
    expect(screen.getByRole('button', { name: 'New session, selected' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'General coding session' }));
    expect(screen.getByRole('button', { name: 'General coding session, selected' })).toBeInTheDocument();
  });

  it('collapses and expands the sidebar without removing accessible navigation', async () => {
    const user = userEvent.setup();
    render(<AgentCodeApp />);
    await user.click(screen.getByRole('button', { name: 'Collapse sidebar' }));
    expect(screen.getByRole('navigation', { name: 'Agent Code workspace' })).toHaveAttribute('data-collapsed', 'true');
    await user.click(screen.getByRole('button', { name: 'Expand sidebar' }));
    expect(screen.getByRole('navigation', { name: 'Agent Code workspace' })).toHaveAttribute('data-collapsed', 'false');
  });

});
