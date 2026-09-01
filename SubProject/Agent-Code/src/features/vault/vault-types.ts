export type LifecycleState = 'ENABLED' | 'DISABLED' | 'INVALID' | 'QUARANTINED';
export type AvailabilityState = 'UNVERIFIED' | 'READY' | 'WARNING' | 'COOLDOWN' | 'EXHAUSTED';
export type FailureClass =
  | 'AUTH_INVALID'
  | 'PERMISSION_BLOCKED'
  | 'CREDIT_BLOCKED'
  | 'RATE_LIMITED'
  | 'REQUEST_INVALID'
  | 'PROVIDER_TRANSIENT'
  | 'UNKNOWN';

export type CredentialEventKind =
  | 'CREDENTIAL_ADDED'
  | 'CREDENTIAL_REMOVED'
  | 'CREDENTIAL_HEALTHY'
  | 'CREDENTIAL_WARNING'
  | 'CREDENTIAL_COOLDOWN'
  | 'CREDENTIAL_RECOVERED'
  | 'CREDENTIAL_EXPIRED'
  | 'CREDENTIAL_SELECTED';

export type CredentialEvent = {
  event_id: number;
  kind: CredentialEventKind;
  key_id: string;
  occurred_at_utc_ms: number;
};

export type KeySummary = {
  key_id: string;
  slot_index: number;
  label: string;
  masked_suffix: string;
  lifecycle_state: LifecycleState;
  availability_state: AvailabilityState;
  cooldown_until_utc_ms: number | null;
  consecutive_failures: number;
  last_success_at_utc_ms: number | null;
  last_failure_at_utc_ms: number | null;
  last_failure_class: FailureClass | null;
  last_probe_at_utc_ms: number | null;
  limit_value: number | null;
  limit_remaining: number | null;
  limit_reset: 'DAILY' | 'WEEKLY' | 'MONTHLY' | null;
  usage_daily: number | null;
  is_free_tier: boolean | null;
  expires_at_utc_ms: number | null;
};
