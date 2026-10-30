import type { ComponentProps } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ChatPage } from './pages';
import type { DesktopSnapshot } from './host';

const runtime = (over: Record<string, unknown> = {}) => ({ status: 'available', issueCount: 0, providerCount: 4, configuredProviderCount: 4,
  sessionCount: 1, runningSessionCount: 0, skillCount: 1, pendingFinalizationCount: 0, ...over });
const snapshot = (agentRuntime?: unknown) => ({ health: { ...(agentRuntime ? { agentRuntime } : {}) } }) as unknown as DesktopSnapshot;

function props(agentRuntime?: unknown): ComponentProps<typeof ChatPage> {
  return {
    snapshot: snapshot(agentRuntime), logs: [], onAction: vi.fn(), setPage: vi.fn(), agentRun: { status: 'idle' }, onAgentRun: vi.fn(),
    agentChat: { conversations: [], modelChoice: '' },
    onChatCreate: vi.fn(), onChatOpen: vi.fn(), onChatSend: vi.fn(), onChatCancel: vi.fn(), onChatArchive: vi.fn(),
  };
}

describe('chat bar runtime status', () => {
  it('shows one green badge and no Finalizing chip, whatever the pending finalization count', () => {
    render(<ChatPage {...props(runtime({ pendingFinalizationCount: 3 }))}/>);
    expect(screen.getByText('Agent Ready')).toBeInTheDocument();
    expect(screen.queryByText(/Finalizing/)).not.toBeInTheDocument();
  });

  it('keeps the last known state through a status poll that carries no runtime, instead of flipping to Provider Not Configured', () => {
    const view = render(<ChatPage {...props(runtime())}/>);
    expect(screen.getByText('Agent Ready')).toBeInTheDocument();
    view.rerender(<ChatPage {...props()}/>);
    expect(screen.getByText('Agent Ready')).toBeInTheDocument();
    expect(screen.queryByText('Provider Not Configured')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Message Agent Core')).not.toBeDisabled();
    view.rerender(<ChatPage {...props(runtime())}/>);
    expect(screen.getByText('Agent Ready')).toBeInTheDocument();
  });

  it('says Connecting, not Provider Not Configured, before any runtime state has arrived', () => {
    render(<ChatPage {...props()}/>);
    expect(screen.getByText('Connecting…')).toBeInTheDocument();
    expect(screen.queryByText('Provider Not Configured')).not.toBeInTheDocument();
  });

  it('still reports Provider Not Configured when the runtime really has no configured provider', () => {
    const view = render(<ChatPage {...props(runtime({ configuredProviderCount: 0 }))}/>);
    expect(screen.getByText('Provider Not Configured')).toBeInTheDocument();
    expect(screen.getByLabelText('Message Agent Core')).toBeDisabled();
    view.rerender(<ChatPage {...props(runtime())}/>);
    expect(screen.getByText('Agent Ready')).toBeInTheDocument();
  });
});
