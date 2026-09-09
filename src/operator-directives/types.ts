import path from 'node:path';

export const OPERATOR_DIRECTIVE_TRUST_CLASSES = ['authenticated_user_explicit'] as const;
export const OPERATOR_DIRECTIVE_SCOPES = ['principal_global'] as const;
export const OPERATOR_DIRECTIVE_STATUSES = ['healthy', 'degraded', 'disabled'] as const;
export const OPERATOR_DIRECTIVE_EVENT_TYPES = ['granted', 'revised', 'revoked'] as const;

export type OperatorDirectiveTrustClass = (typeof OPERATOR_DIRECTIVE_TRUST_CLASSES)[number];
export type OperatorDirectiveScope = (typeof OPERATOR_DIRECTIVE_SCOPES)[number];
export type OperatorDirectiveStatusState = (typeof OPERATOR_DIRECTIVE_STATUSES)[number];
export type OperatorDirectiveEventType = (typeof OPERATOR_DIRECTIVE_EVENT_TYPES)[number];

export interface OperatorDirectiveCatalogEntryShape {
  directiveKey: string;
  category: 'standing_consent';
  scope: OperatorDirectiveScope;
  trustClass: OperatorDirectiveTrustClass;
  effect: string;
  effectVersion: number;
  expandsAgentCoreToolPermissions: false;
  bypassesSafetyPolicy: false;
  bypassesOsAuthorization: false;
  promptContext: string;
}

export const OPERATOR_DIRECTIVE_STATE_VERSION = 1 as const;

/** On-disk layout of the file-native directive state root. */
export interface OperatorDirectiveStatePaths {
  root: string;
  events: string;
  current: string;
  journal: string;
  lock: string;
}

export function operatorDirectiveStatePaths(stateRoot: string): OperatorDirectiveStatePaths {
  return {
    root: stateRoot,
    events: path.join(stateRoot, 'events'),
    current: path.join(stateRoot, 'current'),
    journal: path.join(stateRoot, 'journal'),
    lock: path.join(stateRoot, '.directives.lock'),
  };
}

/** One append-only line of `events/<principal>.jsonl`. `hash` chains over `prevHash`. */
export interface PersistedOperatorDirectiveEvent {
  seq: number;
  id: string;
  directiveId: string;
  principalId: string;
  directiveKey: string;
  eventType: OperatorDirectiveEventType;
  revisionNo: number;
  verbatimText: string;
  verbatimSha256: string;
  snapshotSha256: string;
  actorKeyId: string;
  authenticationMode: string;
  reason: string;
  createdAt: number;
  prevHash: string;
  hash: string;
}

/** Pending transaction journal entry replayed on open. */
export interface PersistedOperatorDirectiveJournal {
  stateVersion: typeof OPERATOR_DIRECTIVE_STATE_VERSION;
  transactionId: string;
  principalId: string;
  createdAt: number;
  event: PersistedOperatorDirectiveEvent;
}

/** Materialized `current/<principal>.json`; always rebuildable from the event stream. */
export interface PersistedOperatorDirectiveState<TDirective> {
  stateVersion: typeof OPERATOR_DIRECTIVE_STATE_VERSION;
  principalId: string;
  seq: number;
  headHash: string;
  directives: TDirective[];
  recovery?: OperatorDirectiveRecoveryReport;
}

/** Truthful record of what open-time recovery had to repair. */
export interface OperatorDirectiveRecoveryReport {
  at: number;
  interruptedAppendsDropped: number;
  journalsRedone: number;
  journalsDiscarded: number;
  materializedStateRebuilt: boolean;
}
