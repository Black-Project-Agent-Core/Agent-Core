import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RouterPage } from './LauncherPages';
import type { AgentChatUiState } from './host';

const page = (agentChat: Partial<AgentChatUiState>) => render(
  <RouterPage agentChat={agentChat as AgentChatUiState} setPage={vi.fn()} onAction={vi.fn()} />,
);

describe('RouterPage', () => {
  it('lists registered models with their provider route state and offers no way to turn routing on', () => {
    page({
      providers: [
        { id: 'anthropic', model: 'claude-sonnet-5-5', configured: true, available: true },
        { id: 'gonka', model: 'MiniMaxAI/MiniMax-M2.7', configured: true, available: false },
        { id: 'atria', model: 'Atria-Dawn', configured: true, available: true },
      ],
      verifiedModels: [
        { providerId: 'anthropic', model: 'claude-sonnet-5-5', successfulTurns: 52, lastSuccessAtMs: 1_762_000_000_000 },
        { providerId: 'gonka', model: 'MiniMaxAI/MiniMax-M2.7', successfulTurns: 15, lastSuccessAtMs: 1_761_000_000_000 },
        { providerId: 'atria', model: 'Atria-Dawn-Preview', successfulTurns: 14, lastSuccessAtMs: 1_760_000_000_000 },
      ],
    });
    const sonnet = screen.getByRole('row', { name: /claude-sonnet-5-5/ });
    expect(within(sonnet).getByText('Available')).toBeTruthy();
    expect(within(sonnet).getByText('52')).toBeTruthy();
    expect(within(screen.getByRole('row', { name: /MiniMax-M2.7/ })).getByText('Waiting')).toBeTruthy();
    expect(within(screen.getByRole('row', { name: /Atria-Dawn-Preview/ })).getByText('Not the current model')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Enable Router/ })).toHaveProperty('disabled', true);
    expect(screen.getByText('Router off')).toBeTruthy();
  });

  it('separates the loading and empty states', () => {
    const { unmount } = page({});
    expect(screen.getByRole('status').textContent).toContain('Waiting for model information');
    unmount();
    page({ providers: [], verifiedModels: [] });
    expect(screen.getByText(/No model has finished a turn yet/)).toBeTruthy();
  });
});
