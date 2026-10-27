import type {
  AgentProviderFailureDecision,
  AgentProviderResponseObservation,
} from './agent-provider-errors.js';
import {
  ProviderStateStore,
  secretRevisionDigest,
  type ProviderOperationalHealth,
  type ProviderPoolCursor,
  type ProviderModelReadiness,
  type ProviderSelectionDiagnostics,
  type ProviderSelectionRecord,
  type ProviderSkipReason,
} from './agent-provider-state.js';
export type {
  ProviderPoolCursor,
  ProviderRouteStatus,
  ProviderSelectionDiagnostics,
  ProviderSkipReason,
} from './agent-provider-state.js';

export interface ProviderSchedulerCredential {
  id: string;
  ordinal: number;
  secret: string;
}

export interface ScheduledProviderCredential {
  id: string;
  secret: string;
  selection: ProviderSelectionRecord;
}

export interface SchedulerSelectionResult {
  credential: ScheduledProviderCredential | null;
  nextAvailableAtMs: number | null;
  reason: 'selected' | 'provider-open' | 'no-eligible-credential' | 'pool-changed';
  diagnostics?: ProviderSelectionDiagnostics;
}

const PROVIDER_LOCKS = new Map<string, Promise<void>>();
async function withProviderLock<T>(providerId: string, fn: () => Promise<T> | T): Promise<T> {
  const key = providerId.trim().toLowerCase();
  const prior = PROVIDER_LOCKS.get(key) ?? Promise.resolve();
  let release!: () => void;
  const tail = new Promise<void>(resolve => { release = resolve; });
  PROVIDER_LOCKS.set(key, tail);
  await prior;
  try {
    return await fn();
  } finally {
    release();
    if (PROVIDER_LOCKS.get(key) === tail) PROVIDER_LOCKS.delete(key);
  }
}

function descriptors(credentials: ProviderSchedulerCredential[]) {
  return credentials.map(credential => ({
    id: credential.id,
    ordinal: credential.ordinal,
    secretRevisionDigest: secretRevisionDigest(credential.secret),
  }));
}

export class PersistentCredentialScheduler {
  readonly state: ProviderStateStore;

  constructor(statePath: string) {
    this.state = new ProviderStateStore(statePath);
  }

  health(
    providerId: string,
    credentials: ProviderSchedulerCredential[],
    now = Date.now(),
  ): ProviderOperationalHealth {
    return this.state.providerHealth(providerId, descriptors(credentials), now);
  }
  readPoolCursor(providerIds: string[]): ProviderPoolCursor | null {
    return this.state.readPoolCursor(providerIds);
  }
  /** Read-only eligibility counts for evidence; never selects or records anything. */
  diagnose(input: {
    providerId: string;
    model: string | null;
    credentials: ProviderSchedulerCredential[];
    excludedCredentialIds?: ReadonlySet<string>;
    excludedReasons?: ReadonlyMap<string, ProviderSkipReason>;
    qualifiedModels?: ReadonlyMap<string, ProviderModelReadiness>;
    now?: number;
  }): ProviderSelectionDiagnostics | null {
    return this.state.diagnoseCredentials({
      providerId: input.providerId,
      credentials: descriptors(input.credentials),
      model: input.model,
      excludedCredentialIds: input.excludedCredentialIds,
      excludedReasons: input.excludedReasons,
      qualifiedModels: input.qualifiedModels,
      now: input.now,
    });
  }
  async select(input: {
    providerId: string;
    model: string | null;
    credentials: ProviderSchedulerCredential[];
    excludedCredentialIds?: Set<string>;
    excludedReasons?: ReadonlyMap<string, ProviderSkipReason>;
    qualifiedModels?: ReadonlyMap<string, ProviderModelReadiness>;
    trackPool?: boolean;
    expectedPoolRevision?: number;
    now?: number;
  }): Promise<SchedulerSelectionResult> {
    return withProviderLock(input.providerId, () => {
      const result = this.state.selectCredential({
        providerId: input.providerId,
        credentials: descriptors(input.credentials),
        model: input.model,
        excludedCredentialIds: input.excludedCredentialIds,
        excludedReasons: input.excludedReasons,
        qualifiedModels: input.qualifiedModels,
        trackPool: input.trackPool,
        expectedPoolRevision: input.expectedPoolRevision,
        now: input.now,
      });
      if (!result.selection) return {
        credential: null,
        nextAvailableAtMs: result.nextAvailableAtMs,
        reason: result.reason,
        ...(result.diagnostics ? { diagnostics: result.diagnostics } : {}),
      };
      const configured = input.credentials.find(item => item.id === result.selection!.credentialId);
      if (!configured) {
        throw new Error('AGENT_RUNTIME_PROVIDER_CREDENTIAL_RESOLUTION_FAILED');
      }
      return {
        credential: {
          id: configured.id,
          secret: configured.secret,
          selection: result.selection,
        },
        nextAvailableAtMs: null,
        reason: 'selected' as const,
        ...(result.diagnostics ? { diagnostics: result.diagnostics } : {}),
      };
    });
  }

  recordSuccess(selection: ProviderSelectionRecord, completedAtMs = Date.now()): void {
    this.state.recordSuccess(selection, completedAtMs);
  }
  recordFailure(input: {
    selection: ProviderSelectionRecord;
    decision: AgentProviderFailureDecision;
    model: string | null;
    httpStatus?: number | null;
    completedAtMs?: number;
  }): number | null {
    return this.state.recordFailure(input);
  }

  recordObservation(input: {
    providerId: string;
    credentialId: string;
    model: string | null;
    observation: AgentProviderResponseObservation;
    observedAtMs?: number;
  }): void {
    this.state.recordQuotaObservation(input);
  }

  resetCredential(providerId: string, credentialId: string, now = Date.now()): boolean {
    return this.state.resetCredential(providerId, credentialId, now);
  }

  issue(): string | null {
    return this.state.healthIssue();
  }
}
