import { invoke } from '@tauri-apps/api/core';
import type { CredentialEvent, KeySummary } from './vault-types';

export const listKeys = () => invoke<KeySummary[]>('vault_list_openrouter_keys');
export const listEvents = (limit: number) => invoke<CredentialEvent[]>('vault_list_credential_events', { limit });

export const addKey = (secret: string, label: string) =>
  invoke<KeySummary>('vault_add_openrouter_key', {
    request: { secret, label },
  });

export const setKeyEnabled = (keyId: string, enabled: boolean) =>
  invoke<KeySummary>('vault_set_enabled', {
    request: { keyId, enabled },
  });

export const deleteKey = (keyId: string) =>
  invoke<boolean>('vault_delete_key', {
    request: { keyId },
  });

export const validateKey = (keyId: string) =>
  invoke<KeySummary>('vault_validate_key', {
    request: { keyId },
  });
