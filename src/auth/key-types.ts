import type { ToolGrant } from './tool-grant.js';

export interface KeyMetadata {
  toolGrant?: ToolGrant;
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
}

export type AuthenticationMode = 'bearer-api-key' | 'oauth2';

export interface VerifiedKey extends KeyMetadata {
  authentication?: AuthenticationMode;
}

export interface CreatedKey {
  key: string;
  metadata: KeyMetadata;
}

export interface CreateKeyOptions {
  expiresAt?: Date;
  toolGrant?: ToolGrant;
  /** Issuing operator supplies names from the current available registry. */
  availableTools?: readonly string[];
}

export interface StoredKeyRecord extends KeyMetadata {
  salt: string;
  hash: string;
}

export interface StoredKeyFile {
  version: 1;
  keys: StoredKeyRecord[];
}
