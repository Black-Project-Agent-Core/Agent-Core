import { createHash } from 'node:crypto';
import { stat } from 'node:fs/promises';
import type { AuthenticationMode } from '../auth/key-types.js';
import type { OperatorDirectiveConfig } from '../config.js';
import {
  isOperatorDirectiveKey,
  operatorDirectiveCatalogEntry,
  type OperatorDirectiveKey,
} from './catalog.js';
import { buildOperatorDirectivePromptContext } from './prompt-context.js';
import {
  OperatorDirectiveStore,
  type OperatorDirectiveMutationResult,
  type StoredOperatorDirective,
} from './store.js';
import type { OperatorDirectiveStatusState } from './types.js';

export type OperatorDirectiveServiceState = 'disabled' | 'idle' | 'healthy' | 'degraded' | 'closed';

export interface OperatorDirectivePublicView {
  directiveKey: OperatorDirectiveKey;
  category: 'standing_consent';
  effect: string;
  scope: 'principal_global';
  trust: 'authenticated_user_explicit';
  active: true;
  effectVersion: number;
  revisionNo: number;
  verbatimText: string;
  verbatimSha256: string;
  expandsAgentCoreToolPermissions: false;
  bypassesSafetyPolicy: false;
  bypassesOsAuthorization: false;
}

export interface OperatorDirectiveSnapshot {
  status: OperatorDirectiveStatusState;
  snapshotHash: string | null;
  directives: OperatorDirectivePublicView[];
  promptContext: string;
}

export interface OperatorDirectiveStatus {
  enabled: boolean;
  healthy: boolean;
  state: OperatorDirectiveServiceState;
  schemaVersion: number;
  activeDirectiveCount: number;
  integrity: string;
}

export interface OperatorDirectiveSetInput {
  principalId: string;
  directiveKey: OperatorDirectiveKey;
  verbatimText: string;
  explicitGrant: true;
  actorKeyId: string;
  authenticationMode: AuthenticationMode;
  now?: number;
}

export interface OperatorDirectiveRevokeInput {
  principalId: string;
  directiveKey: OperatorDirectiveKey;
  actorKeyId: string;
  authenticationMode: AuthenticationMode;
  reason: string;
  now?: number;
}

function hash(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function authoritySnapshotHash(directives: readonly OperatorDirectivePublicView[]): string {
  const projection = directives
    .map((directive) => ({
      active: directive.active,
      directiveKey: directive.directiveKey,
      effectVersion: directive.effectVersion,
      revisionNo: directive.revisionNo,
      scope: directive.scope,
      trustClass: directive.trust,
      verbatimSha256: directive.verbatimSha256,
    }))
    .sort((left, right) => left.directiveKey.localeCompare(right.directiveKey));
  return hash(JSON.stringify(projection));
}

function publicView(directive: StoredOperatorDirective): OperatorDirectivePublicView {
  const catalog = operatorDirectiveCatalogEntry(directive.directiveKey);
  if (!directive.active) throw new Error('OPERATOR_DIRECTIVE_NOT_ACTIVE');
  return {
    directiveKey: directive.directiveKey,
    category: catalog.category,
    effect: catalog.effect,
    scope: catalog.scope,
    trust: catalog.trustClass,
    active: true,
    effectVersion: catalog.effectVersion,
    revisionNo: directive.revisionNo,
    verbatimText: directive.verbatimText,
    verbatimSha256: directive.verbatimSha256,
    expandsAgentCoreToolPermissions: catalog.expandsAgentCoreToolPermissions,
    bypassesSafetyPolicy: catalog.bypassesSafetyPolicy,
    bypassesOsAuthorization: catalog.bypassesOsAuthorization,
  };
}

export class OperatorDirectiveService {
  private readonly store: OperatorDirectiveStore;
  private state: OperatorDirectiveServiceState;
  private degradedReason: string | undefined;

  constructor(readonly config: OperatorDirectiveConfig, store?: OperatorDirectiveStore) {
    this.store = store ?? new OperatorDirectiveStore(config);
    this.state = config.enabled ? 'idle' : 'disabled';
  }

  get currentState(): OperatorDirectiveServiceState {
    return this.state;
  }

  async set(input: OperatorDirectiveSetInput): Promise<OperatorDirectiveMutationResult> {
    if (input.explicitGrant !== true) throw new Error('OPERATOR_DIRECTIVE_EXPLICIT_GRANT_REQUIRED');
    if (!isOperatorDirectiveKey(String(input.directiveKey))) throw new Error('OPERATOR_DIRECTIVE_UNKNOWN_KEY');
    if (!input.verbatimText) throw new Error('OPERATOR_DIRECTIVE_VERBATIM_REQUIRED');
    const store = await this.requireStore();
    const existing = await store.listCurrent(input.principalId, { includeRevoked: true });
    const eventType = existing.some((item) => item.directiveKey === input.directiveKey) ? 'revision' : 'grant';
    const result = await store.grantOrRevise({
      principalId: input.principalId,
      directiveKey: input.directiveKey,
      verbatimText: input.verbatimText,
      actorKeyId: input.actorKeyId,
      authenticationMode: input.authenticationMode,
      reason: `explicit authenticated operator ${eventType}`,
      now: input.now,
    });
    this.state = 'healthy';
    return result;
  }

  async revoke(input: OperatorDirectiveRevokeInput): Promise<OperatorDirectiveMutationResult> {
    if (!isOperatorDirectiveKey(String(input.directiveKey))) throw new Error('OPERATOR_DIRECTIVE_UNKNOWN_KEY');
    if (!input.reason.trim()) throw new Error('OPERATOR_DIRECTIVE_REASON_REQUIRED');
    const store = await this.requireStore();
    const result = await store.revoke(input);
    this.state = 'healthy';
    return result;
  }

  async snapshot(principalId: string): Promise<OperatorDirectiveSnapshot> {
    if (!this.config.enabled) {
      return { status: 'disabled', snapshotHash: null, directives: [], promptContext: '' };
    }
    if ((this.state === 'idle' || this.state === 'healthy') && !await this.databaseExists()) {
      this.state = 'healthy';
      this.degradedReason = undefined;
      return { status: 'healthy', snapshotHash: authoritySnapshotHash([]), directives: [], promptContext: '' };
    }
    try {
      const store = await this.requireStore();
      const integrity = await store.integrity();
      if (!integrity.ok) throw new Error(`OPERATOR_DIRECTIVE_INTEGRITY_FAILED:${integrity.result}`);
      const directives = (await store.listCurrent(principalId))
        .map(publicView)
        .sort((left, right) => left.directiveKey.localeCompare(right.directiveKey));
      this.state = 'healthy';
      this.degradedReason = undefined;
      return {
        status: 'healthy',
        snapshotHash: authoritySnapshotHash(directives),
        directives,
        promptContext: buildOperatorDirectivePromptContext(directives.map((item) => item.directiveKey)),
      };
    } catch (error) {
      this.state = 'degraded';
      this.degradedReason = error instanceof Error ? error.message : String(error);
      return { status: 'degraded', snapshotHash: null, directives: [], promptContext: '' };
    }
  }

  async status(principalId: string): Promise<OperatorDirectiveStatus> {
    if (!this.config.enabled) {
      return {
        enabled: false,
        healthy: false,
        state: 'disabled',
        schemaVersion: this.config.schemaVersion,
        activeDirectiveCount: 0,
        integrity: 'disabled',
      };
    }
    const snapshot = await this.snapshot(principalId);
    return {
      enabled: true,
      healthy: snapshot.status === 'healthy',
      state: this.state,
      schemaVersion: this.config.schemaVersion,
      activeDirectiveCount: snapshot.directives.length,
      integrity: snapshot.status === 'healthy' ? 'ok' : `degraded:${this.degradedReason ?? 'unknown'}`,
    };
  }

  async close(): Promise<void> {
    if (this.state === 'closed') return;
    await this.store.close();
    this.state = 'closed';
  }

  private async databaseExists(): Promise<boolean> {
    try {
      const info = await stat(this.config.dbPath);
      return info.isFile() || info.isDirectory();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
      this.state = 'degraded';
      this.degradedReason = error instanceof Error ? error.message : String(error);
      return true;
    }
  }

  private async requireStore(): Promise<OperatorDirectiveStore> {
    if (!this.config.enabled) throw new Error('OPERATOR_DIRECTIVES_DISABLED');
    if (this.state === 'closed') throw new Error('OPERATOR_DIRECTIVES_CLOSED');
    if (this.state === 'degraded') throw new Error(`OPERATOR_DIRECTIVES_DEGRADED:${this.degradedReason ?? 'unknown'}`);
    try {
      await this.store.open();
      if (this.state === 'idle') this.state = 'healthy';
      return this.store;
    } catch (error) {
      this.state = 'degraded';
      this.degradedReason = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }
}
