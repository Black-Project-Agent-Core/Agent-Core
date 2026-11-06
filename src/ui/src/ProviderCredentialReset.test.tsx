import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { expect, it, vi } from 'vitest';
import { ModelsPage } from './LauncherPages';
import type { AgentChatProvider, AgentChatUiState } from './host';

const lockedRoute: AgentChatProvider = { id: 'atria', model: 'Atria-Dawn', configured: true, available: false, retryAt: '2026-11-06T09:00:00.000Z' };

function view(providers: AgentChatProvider[], providerReset: AgentChatUiState['providerReset'], onProviderReset = vi.fn()): ReactElement {
  const agentChat: AgentChatUiState = { conversations: [], modelChoice: '', providers, providerReset };
  return <ModelsPage agentChat={agentChat} setPage={vi.fn()} onAction={vi.fn()} onChatProvider={vi.fn()} onChatModel={vi.fn()} onProviderReset={onProviderReset}/>;
}

it('offers the release action only for a configured route that cannot answer now', () => {
  const onProviderReset = vi.fn();
  render(view([lockedRoute], undefined, onProviderReset));
  fireEvent.click(screen.getByRole('button', { name: 'Release credentials' }));
  expect(onProviderReset).toHaveBeenCalledWith('atria');
});

it('hides the release action when the route answers or is not configured', () => {
  render(view([
    { id: 'anthropic', model: 'claude-sonnet-5-5', configured: true, available: true },
    { id: 'gonka', model: null, configured: false, available: false, issue: 'AGENT_RUNTIME_PROVIDER_CONFIGURATION_INCOMPLETE' },
  ], undefined));
  expect(screen.queryByRole('button', { name: 'Release credentials' })).toBeNull();
});

it('disables the action while its release runs and shows a failure on that route only', () => {
  const second: AgentChatProvider = { id: 'gonka', model: 'DeepSeek-V4-Flash', configured: true, available: false };
  const { rerender } = render(view([lockedRoute, second], { providerId: 'atria', busy: true }));
  const [atriaButton] = screen.getAllByRole('button', { name: 'Release credentials' });
  expect(atriaButton).toBeDisabled();
  expect(screen.getAllByRole('button', { name: 'Release credentials' })[1]).toBeEnabled();

  rerender(view([lockedRoute, second], { providerId: 'atria', busy: false, error: 'AGENT_CHAT_PROVIDER_RESET_FAILED' }));
  expect(screen.getAllByRole('button', { name: 'Release credentials' })[0]).toBeEnabled();
  expect(screen.getAllByRole('alert')).toHaveLength(1);
  expect(screen.getByRole('alert')).toHaveTextContent('Credentials could not be released');
});
