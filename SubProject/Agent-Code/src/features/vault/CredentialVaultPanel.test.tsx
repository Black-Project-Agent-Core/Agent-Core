import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CredentialVaultPanel } from './CredentialVaultPanel';
import type { KeySummary } from './vault-types';

const vaultApi = vi.hoisted(() => ({
  listKeys: vi.fn(),
  addKey: vi.fn(),
  setKeyEnabled: vi.fn(),
  deleteKey: vi.fn(),
  validateKey: vi.fn(),
}));

vi.mock('./vault-api', () => vaultApi);

const primary: KeySummary = {
  key_id: 'key-primary',
  slot_index: 0,
  label: 'Primary',
  masked_suffix: '••••3Fxa',
  lifecycle_state: 'ENABLED',
  availability_state: 'READY',
  cooldown_until_utc_ms: null,
  consecutive_failures: 0,
  last_success_at_utc_ms: 1000,
  last_failure_at_utc_ms: null,
  last_failure_class: null,
  last_probe_at_utc_ms: 900,
  limit_value: null,
  limit_remaining: null,
  limit_reset: null,
  usage_daily: null,
  is_free_tier: null,
  expires_at_utc_ms: null,
};

const disabled: KeySummary = {
  ...primary,
  key_id: 'key-disabled',
  slot_index: 1,
  label: 'Disabled key',
  masked_suffix: '••••9Abc',
  lifecycle_state: 'DISABLED',
  availability_state: 'UNVERIFIED',
};

const cooldown: KeySummary = {
  ...primary,
  key_id: 'key-cooldown',
  slot_index: 2,
  label: 'Cooling down',
  masked_suffix: '••••7Zyx',
  lifecycle_state: 'ENABLED',
  availability_state: 'COOLDOWN',
  cooldown_until_utc_ms: 5000,
};

describe('CredentialVaultPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vaultApi.listKeys.mockResolvedValue([primary, disabled, cooldown]);
    vaultApi.addKey.mockResolvedValue(primary);
    vaultApi.setKeyEnabled.mockResolvedValue(primary);
    vaultApi.deleteKey.mockResolvedValue(undefined);
    vaultApi.validateKey.mockResolvedValue({ ...primary, availability_state: 'READY', last_probe_at_utc_ms: 1234 });
  });

  it('renders a password-only import surface and never exposes stored plaintext', async () => {
    render(<CredentialVaultPanel onClose={() => undefined} />);
    expect(await screen.findByRole('heading', { name: 'Credential Vault' })).toBeInTheDocument();
    const input = screen.getByLabelText('OpenRouter API key');
    expect(input).toHaveAttribute('type', 'password');
    expect(input).toHaveAttribute('autocomplete', 'off');
    expect(input).toHaveAttribute('spellcheck', 'false');
    expect(await screen.findByText('••••3Fxa')).toBeInTheDocument();
    expect(screen.queryByText('sk-or-v1-SYNTHETIC_FULL_SECRET_3Fxa')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /reveal/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /copy/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /export/i })).not.toBeInTheDocument();
  });

  it('clears the uncontrolled secret input when import starts and does not echo the secret', async () => {
    const user = userEvent.setup();
    let resolveAdd!: (value: KeySummary) => void;
    vaultApi.addKey.mockImplementation(() => new Promise<KeySummary>((resolve) => {
      resolveAdd = resolve;
    }));
    render(<CredentialVaultPanel onClose={() => undefined} />);
    await screen.findByText('••••3Fxa');
    const input = screen.getByLabelText('OpenRouter API key');
    const label = screen.getByRole('textbox', { name: 'Key label' });
    const canary = 'sk-or-v1-SYNTHETIC_DOM_CANARY_123456';
    await user.type(input, canary);
    await user.type(label, 'Imported key');
    await user.click(screen.getByRole('button', { name: 'Import key' }));
    expect(input).toHaveValue('');
    expect(document.body.textContent).not.toContain(canary);
    resolveAdd({ ...primary, label: 'Imported key' });
    await waitFor(() => expect(vaultApi.addKey).toHaveBeenCalledWith(canary, 'Imported key'));
  });

  it('renders lifecycle and availability badges from metadata', async () => {
    render(<CredentialVaultPanel onClose={() => undefined} />);
    expect(await screen.findByText('DISABLED')).toBeInTheDocument();
    expect(screen.getByText('UNVERIFIED')).toBeInTheDocument();
    expect(screen.getByText('COOLDOWN')).toBeInTheDocument();
    expect(screen.getAllByText('ENABLED').length).toBeGreaterThan(0);
  });
  it('validates a selected key without requesting or rendering plaintext', async () => {
    const user = userEvent.setup();
    render(<CredentialVaultPanel onClose={() => undefined} />);
    await screen.findByText('••••3Fxa');
    await user.click(screen.getByRole('button', { name: 'Validate Primary' }));
    await waitFor(() => expect(vaultApi.validateKey).toHaveBeenCalledWith('key-primary'));
    expect(screen.queryByRole('button', { name: /reveal/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /copy/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /export/i })).not.toBeInTheDocument();
  });

});
