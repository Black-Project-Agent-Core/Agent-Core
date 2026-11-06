import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RouterPage } from './LauncherPages';
import type { AgentChatUiState, HostListener, ProviderTestReport } from './host';

type HostEnvelope = Parameters<HostListener>[0];

const host = vi.hoisted(() => ({ sent: [] as Array<Record<string, unknown>>, listeners: new Set<(message: HostEnvelope) => void>() }));
vi.mock('./host', async importOriginal => ({
  ...(await importOriginal<typeof import('./host')>()),
  postHost: (message: Record<string, unknown>) => { host.sent.push(message); },
  subscribeHost: (listener: (message: HostEnvelope) => void) => { host.listeners.add(listener); return () => host.listeners.delete(listener); },
}));
const reply = (message: HostEnvelope) => act(() => { for (const listener of host.listeners) listener(message); });
const lastTest = () => host.sent.filter(message => message.type === 'agent-provider-test').at(-1) as { requestId: string; providerId: string };

beforeEach(() => { host.sent.length = 0; host.listeners.clear(); });

const page = (agentChat: Partial<AgentChatUiState>, extra: Partial<Parameters<typeof RouterPage>[0]> = {}) => {
  const props = { setPage: vi.fn(), onAction: vi.fn(), onChatProvider: vi.fn(), onChatModel: vi.fn(), ...extra };
  render(<RouterPage agentChat={{ conversations: [], modelChoice: '', ...agentChat } as AgentChatUiState} {...props}/>);
  return props;
};
const anthropic = { id: 'anthropic', model: 'claude-sonnet-5-5', configured: true, available: true,
  models: [{ id: 'claude-sonnet-5-5' }, { id: 'claude-opus-5-5' }] };
const report = (overrides: Partial<ProviderTestReport> = {}): ProviderTestReport => ({
  providerId: 'anthropic', checkedAt: '2026-11-06T10:00:00.000Z', status: 'ok',
  keys: [{ credentialId: 'anthropic:01', ok: true, modelCount: 3 }],
  models: [
    { id: 'claude-opus-5-5', displayName: 'Claude Opus 5.5', contextWindowTokens: 1_000_000, maxOutputTokens: 128_000, keyCount: 1 },
    { id: 'claude-sonnet-5-5', contextWindowTokens: 200_000, maxOutputTokens: 64_000, keyCount: 1 },
    { id: 'claude-mythos-1', contextWindowTokens: null, maxOutputTokens: null, keyCount: 1 },
  ],
  ...overrides,
});

describe('RouterPage', () => {
  it('describes the live provider pool instead of an inactive router', () => {
    page({ providers: [anthropic], verifiedModels: [] });
    expect(screen.queryByText('Not active')).toBeNull();
    expect(screen.queryByRole('button', { name: /Enable Router/ })).toBeNull();
    expect(screen.getByText('Provider pool')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Test anthropic keys' })).toHaveProperty('disabled', false);
  });

  it('tests one provider from the keyboard and lists every model its keys can see', async () => {
    const user = userEvent.setup();
    const props = page({ providers: [anthropic, { id: 'gonka', model: null, configured: false, available: false }], verifiedModels: [] });
    expect(screen.getByRole('button', { name: 'Test gonka keys' })).toHaveProperty('disabled', true);
    await user.tab();
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Test anthropic keys' }));
    await user.keyboard('{Enter}');
    expect(lastTest()).toEqual(expect.objectContaining({ type: 'agent-provider-test', providerId: 'anthropic' }));
    expect(screen.getByRole('button', { name: 'Test anthropic keys' }).textContent).toContain('Testing');
    expect(screen.getByRole('button', { name: 'Test anthropic keys' })).toHaveProperty('disabled', true);
    reply({ type: 'agent-provider-test-result', requestId: lastTest().requestId, providerId: 'anthropic', result: { test: report() } });

    const table = screen.getByRole('table', { name: 'Models available to anthropic keys' });
    expect(within(table).getAllByRole('row')).toHaveLength(4);
    const opus = within(table).getByRole('row', { name: /claude-opus-5-5/ });
    expect(within(opus).getByText('1M')).toBeTruthy();
    expect(within(opus).getByText('128K')).toBeTruthy();
    expect(within(within(table).getByRole('row', { name: /claude-mythos-1/ })).getByText('Not in AI Models')).toBeTruthy();
    expect(screen.getByText(/1 of 1 key answered · 3 models/)).toBeTruthy();

    // Choosing goes through the AI Models handlers, never a second selection.
    screen.getByRole('button', { name: 'Use claude-opus-5-5 from anthropic' }).focus();
    await user.keyboard('{Enter}');
    expect(props.onChatProvider).toHaveBeenCalledWith('anthropic');
    expect(props.onChatModel).toHaveBeenCalledWith('claude-opus-5-5');
    expect(props.setPage).toHaveBeenCalledWith('chat');
  });

  it('explains each failed key and keeps the keys that answered', async () => {
    const user = userEvent.setup();
    page({ providers: [anthropic], verifiedModels: [] });
    await user.click(screen.getByRole('button', { name: 'Test anthropic keys' }));
    reply({ type: 'agent-provider-test-result', requestId: lastTest().requestId, providerId: 'anthropic', result: { test: report({
      status: 'partial',
      keys: [
        { credentialId: 'anthropic:01', ok: true, modelCount: 3 },
        { credentialId: 'anthropic:02', ok: false, modelCount: 0, failure: { code: 'AUTH_REJECTED', httpStatus: 401,
          message: 'The provider rejected the API key (invalid, revoked or expired). Replace the key.' } },
        { credentialId: 'anthropic:03', ok: false, modelCount: 0, failure: { code: 'RATE_LIMITED', httpStatus: 429,
          retryAt: '2026-11-06T10:05:00.000Z', message: 'The provider is rate limiting this key. Try again later.' } },
      ] }) } });
    const keys = screen.getByRole('list', { name: 'anthropic key results' });
    expect(within(keys).getByText(/rejected the API key.*\(HTTP 401\)/)).toBeTruthy();
    expect(within(keys).getByText(/rate limiting.*\(HTTP 429\).*Retry after/)).toBeTruthy();
    expect(screen.getByText(/1 of 3 keys answered/)).toBeTruthy();
    expect(screen.getByRole('table', { name: 'Models available to anthropic keys' })).toBeTruthy();
  });

  it('marks a test where no key answered as an alert, and reports bridge errors', async () => {
    const user = userEvent.setup();
    page({ providers: [anthropic], verifiedModels: [] });
    await user.click(screen.getByRole('button', { name: 'Test anthropic keys' }));
    reply({ type: 'agent-provider-test-result', requestId: lastTest().requestId, providerId: 'anthropic', result: { test: report({
      status: 'failed', models: [],
      keys: [{ credentialId: 'anthropic:01', ok: false, modelCount: 0, failure: { code: 'NETWORK_UNREACHABLE',
        message: 'The provider could not be reached (DNS, connection or proxy failure).' } }] }) } });
    expect(screen.getByRole('alert').textContent).toContain('0 of 1 key answered');
    expect(screen.getByText(/could not be reached/)).toBeTruthy();
    expect(screen.queryByRole('table', { name: /Models available/ })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Test anthropic keys' }));
    reply({ type: 'agent-provider-test-error', requestId: lastTest().requestId, providerId: 'anthropic', error: 'agent_chat_provider_test_timeout' });
    expect(screen.getAllByRole('alert').map(item => item.textContent).join(' ')).toContain('longer than 90 seconds');
  });

  it('ignores a stale answer for another request', async () => {
    const user = userEvent.setup();
    page({ providers: [anthropic], verifiedModels: [] });
    await user.click(screen.getByRole('button', { name: 'Test anthropic keys' }));
    reply({ type: 'agent-provider-test-result', requestId: 'other', providerId: 'anthropic', result: { test: report() } });
    expect(screen.queryByRole('table', { name: /Models available/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Test anthropic keys' }).textContent).toContain('Testing');
  });

  it('marks the model AI Models has selected', async () => {
    const user = userEvent.setup();
    page({ providers: [anthropic], verifiedModels: [], providerChoice: 'anthropic', modelChoice: 'claude-sonnet-5-5' });
    await user.click(screen.getByRole('button', { name: 'Test anthropic keys' }));
    reply({ type: 'agent-provider-test-result', requestId: lastTest().requestId, providerId: 'anthropic', result: { test: report() } });
    expect(within(screen.getByRole('row', { name: /claude-sonnet-5-5/ })).getByText('Selected')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Use claude-sonnet-5-5 from anthropic' })).toBeNull();
  });

  it('keeps the models that finished a turn with their provider route state', () => {
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
  });

  it('separates the loading and empty states', () => {
    page({});
    expect(screen.getAllByRole('status').map(item => item.textContent).join(' ')).toContain('Waiting for model information');
    expect(screen.getAllByRole('status').map(item => item.textContent).join(' ')).toContain('Waiting for provider information');
  });

  it('shows the empty state', () => {
    page({ providers: [], verifiedModels: [] });
    expect(screen.getByText(/No model has finished a turn yet/)).toBeTruthy();
    expect(screen.getByText('No providers are configured.')).toBeTruthy();
  });
});
