use std::collections::BTreeSet;

use serde::Serialize;
use sha2::{Digest, Sha256};
use thiserror::Error;
use uuid::Uuid;

use crate::{
    classify_status, AvailabilityState, CredentialEventKind, CredentialManager, FailureClass, KeyId,
    KeySummary, LifecycleState, SecretProtector, StoreError,
};

#[derive(Debug, Clone, Default)]
pub struct RotationSession {
    pub(crate) attempted: BTreeSet<KeyId>,
}

impl RotationSession {
    pub fn new() -> Self {
        Self::default()
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct KeyLease {
    pub lease_id: Uuid,
    pub key_id: KeyId,
    pub slot_index: i64,
    pub scanned_candidates: usize,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OutcomeSignal {
    Success,
    Http {
        status: u16,
        retry_after_ms: Option<u64>,
    },
    RequestInvalid,
    ProviderTransient,
    Unknown,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct RotationSnapshot {
    pub cursor_slot: i64,
    pub active_lease_count: usize,
    pub keys: Vec<KeySummary>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct RotationCandidate {
    pub(crate) key_id: KeyId,
    pub(crate) slot_index: i64,
    pub(crate) lifecycle_state: LifecycleState,
    pub(crate) availability_state: AvailabilityState,
    pub(crate) cooldown_until_utc_ms: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct SelectionDecision {
    pub(crate) key_id: KeyId,
    pub(crate) slot_index: i64,
    pub(crate) scanned_candidates: usize,
    pub(crate) reconcile_cooldown: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct SelectionMiss {
    pub(crate) earliest_retry_at_utc_ms: Option<i64>,
    pub(crate) scanned_candidates: usize,
}

pub(crate) fn select_candidate(
    candidates: &[RotationCandidate],
    cursor_slot: i64,
    attempted: &BTreeSet<KeyId>,
    now_ms: i64,
) -> Result<SelectionDecision, SelectionMiss> {
    if candidates.is_empty() {
        return Err(SelectionMiss {
            earliest_retry_at_utc_ms: None,
            scanned_candidates: 0,
        });
    }

    let start = candidates
        .iter()
        .position(|candidate| candidate.slot_index > cursor_slot)
        .unwrap_or(0);
    let mut earliest_retry_at_utc_ms: Option<i64> = None;
    let mut scanned_candidates = 0usize;

    for offset in 0..candidates.len() {
        let candidate = &candidates[(start + offset) % candidates.len()];
        scanned_candidates += 1;

        if attempted.contains(&candidate.key_id) {
            continue;
        }
        if candidate.lifecycle_state != LifecycleState::Enabled {
            continue;
        }

        let reconcile_cooldown = if candidate.availability_state == AvailabilityState::Cooldown {
            match candidate.cooldown_until_utc_ms {
                Some(deadline) if deadline <= now_ms => true,
                Some(deadline) => {
                    earliest_retry_at_utc_ms = Some(
                        earliest_retry_at_utc_ms
                            .map(|current| current.min(deadline))
                            .unwrap_or(deadline),
                    );
                    continue;
                }
                None => continue,
            }
        } else {
            false
        };

        if !matches!(
            candidate.availability_state,
            AvailabilityState::Ready | AvailabilityState::Warning
        ) && !reconcile_cooldown
        {
            continue;
        }

        return Ok(SelectionDecision {
            key_id: candidate.key_id.clone(),
            slot_index: candidate.slot_index,
            scanned_candidates,
            reconcile_cooldown,
        });
    }

    Err(SelectionMiss {
        earliest_retry_at_utc_ms,
        scanned_candidates,
    })
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum PoolUnavailableReason {
    NoEligibleKeys,
    StateUnavailable,
    Persistence,
}

#[derive(Debug, Clone, PartialEq, Eq, Error)]
#[error("credential pool is unavailable")]
pub struct PoolUnavailable {
    reason: PoolUnavailableReason,
    earliest_retry_at_utc_ms: Option<i64>,
    scanned_candidates: usize,
}

impl PoolUnavailable {
    fn no_eligible(earliest_retry_at_utc_ms: Option<i64>, scanned_candidates: usize) -> Self {
        Self {
            reason: PoolUnavailableReason::NoEligibleKeys,
            earliest_retry_at_utc_ms,
            scanned_candidates,
        }
    }

    fn state_unavailable() -> Self {
        Self {
            reason: PoolUnavailableReason::StateUnavailable,
            earliest_retry_at_utc_ms: None,
            scanned_candidates: 0,
        }
    }

    fn persistence(scanned_candidates: usize) -> Self {
        Self {
            reason: PoolUnavailableReason::Persistence,
            earliest_retry_at_utc_ms: None,
            scanned_candidates,
        }
    }

    pub fn earliest_retry_at_utc_ms(&self) -> Option<i64> {
        self.earliest_retry_at_utc_ms
    }

    pub fn scanned_candidates(&self) -> usize {
        self.scanned_candidates
    }
}

#[derive(Debug, Error)]
pub enum RotationError {
    #[error("rotation state is unavailable")]
    StateUnavailable,
    #[error("rotation persistence failed")]
    Store(#[from] StoreError),
    #[error("lease is unknown or was already reported")]
    UnknownLease,
    #[error("lease identity does not match the active key")]
    LeaseKeyMismatch,
    #[error("leased key no longer exists")]
    KeyMissing,
    #[error("in-flight counter is invalid")]
    CounterInvalid,
    #[error("cooldown deadline overflow")]
    TimeOverflow,
}

impl<P: SecretProtector> CredentialManager<P> {
    pub fn acquire(
        &self,
        session: &mut RotationSession,
        now_ms: i64,
    ) -> Result<KeyLease, PoolUnavailable> {
        let mut inner = self
            .lock_inner()
            .map_err(|_| PoolUnavailable::state_unavailable())?;
        let mut candidates = inner
            .keys
            .values()
            .map(|record| RotationCandidate {
                key_id: record.key_id.clone(),
                slot_index: record.slot_index,
                lifecycle_state: record.lifecycle_state,
                availability_state: record.availability_state,
                cooldown_until_utc_ms: record.cooldown_until_utc_ms,
            })
            .collect::<Vec<_>>();
        candidates.sort_by_key(|candidate| candidate.slot_index);

        let decision = select_candidate(
            &candidates,
            inner.rotation_cursor,
            &session.attempted,
            now_ms,
        )
        .map_err(|miss| {
            PoolUnavailable::no_eligible(miss.earliest_retry_at_utc_ms, miss.scanned_candidates)
        })?;

        let mut record = inner
            .keys
            .get(&decision.key_id)
            .cloned()
            .ok_or_else(PoolUnavailable::state_unavailable)?;
        if decision.reconcile_cooldown {
            record.availability_state = AvailabilityState::Ready;
            record.cooldown_until_utc_ms = None;
            record.updated_at_utc_ms = now_ms;
        }

        let current_in_flight = inner
            .in_flight
            .get(&decision.key_id)
            .copied()
            .unwrap_or(0);
        let next_in_flight = current_in_flight
            .checked_add(1)
            .ok_or_else(PoolUnavailable::state_unavailable)?;

        let persist_result = if decision.reconcile_cooldown {
            let update = record.state_update();
            inner.store.update_key_state_and_cursor_with_events(
                &decision.key_id,
                &update,
                decision.slot_index,
                now_ms,
                &[
                    CredentialEventKind::CredentialRecovered,
                    CredentialEventKind::CredentialSelected,
                ],
            )
        } else {
            inner.store.save_rotation_cursor_with_event(
                decision.slot_index,
                &decision.key_id,
                now_ms,
                CredentialEventKind::CredentialSelected,
            )
        };
        persist_result.map_err(|_| PoolUnavailable::persistence(decision.scanned_candidates))?;

        if decision.reconcile_cooldown {
            inner.keys.insert(decision.key_id.clone(), record);
        }
        inner.rotation_cursor = decision.slot_index;
        let lease_id = Uuid::new_v4();
        inner
            .active_leases
            .insert(lease_id, decision.key_id.clone());
        inner
            .in_flight
            .insert(decision.key_id.clone(), next_in_flight);
        session.attempted.insert(decision.key_id.clone());

        Ok(KeyLease {
            lease_id,
            key_id: decision.key_id,
            slot_index: decision.slot_index,
            scanned_candidates: decision.scanned_candidates,
        })
    }

    pub fn report_outcome(
        &self,
        lease: KeyLease,
        outcome: OutcomeSignal,
        now_ms: i64,
    ) -> Result<RotationSnapshot, RotationError> {
        let mut inner = self
            .lock_inner()
            .map_err(|_| RotationError::StateUnavailable)?;
        let active_key = inner
            .active_leases
            .get(&lease.lease_id)
            .cloned()
            .ok_or(RotationError::UnknownLease)?;
        if active_key != lease.key_id {
            return Err(RotationError::LeaseKeyMismatch);
        }

        let mut record = inner
            .keys
            .get(&active_key)
            .cloned()
            .ok_or(RotationError::KeyMissing)?;
        apply_outcome(&mut record, outcome, now_ms)?;
        let update = record.state_update();
        let cursor_slot = inner.rotation_cursor;
        let event = match outcome {
            OutcomeSignal::Success => Some(CredentialEventKind::CredentialHealthy),
            _ if record.availability_state == AvailabilityState::Cooldown => {
                Some(CredentialEventKind::CredentialCooldown)
            }
            _ if record.availability_state == AvailabilityState::Exhausted => {
                Some(CredentialEventKind::CredentialExpired)
            }
            _ => None,
        };
        let events = event.into_iter().collect::<Vec<_>>();
        inner.store.update_key_state_and_cursor_with_events(
            &active_key,
            &update,
            cursor_slot,
            now_ms,
            &events,
        )?;

        let current_in_flight = inner
            .in_flight
            .get(&active_key)
            .copied()
            .unwrap_or(0);
        let next_in_flight = current_in_flight
            .checked_sub(1)
            .ok_or(RotationError::CounterInvalid)?;
        inner.keys.insert(active_key.clone(), record);
        inner.in_flight.insert(active_key, next_in_flight);
        inner.active_leases.remove(&lease.lease_id);
        Ok(snapshot_from_inner(&inner))
    }

    pub fn rotation_snapshot(&self) -> Result<RotationSnapshot, RotationError> {
        let inner = self
            .lock_inner()
            .map_err(|_| RotationError::StateUnavailable)?;
        Ok(snapshot_from_inner(&inner))
    }
}

fn snapshot_from_inner<P: SecretProtector>(
    inner: &crate::manager::ManagerInner<P>,
) -> RotationSnapshot {
    let mut keys = inner
        .keys
        .values()
        .map(|record| record.summary())
        .collect::<Vec<_>>();
    keys.sort_by_key(|summary| summary.slot_index);
    RotationSnapshot {
        cursor_slot: inner.rotation_cursor,
        active_lease_count: inner.active_leases.len(),
        keys,
    }
}

fn apply_outcome(
    record: &mut crate::StoredKeyRecord,
    outcome: OutcomeSignal,
    now_ms: i64,
) -> Result<(), RotationError> {
    match outcome {
        OutcomeSignal::Success => {
            record.consecutive_failures = 0;
            record.last_success_at_utc_ms = Some(now_ms);
        }
        OutcomeSignal::Http {
            status,
            retry_after_ms,
        } => {
            let classified = classify_status(status, retry_after_ms);
            apply_failure(
                record,
                classified.failure_class,
                classified.retry_after_ms,
                now_ms,
            )?;
        }
        OutcomeSignal::RequestInvalid => {
            apply_failure(record, FailureClass::RequestInvalid, None, now_ms)?;
        }
        OutcomeSignal::ProviderTransient => {
            apply_failure(record, FailureClass::ProviderTransient, None, now_ms)?;
        }
        OutcomeSignal::Unknown => {
            apply_failure(record, FailureClass::Unknown, None, now_ms)?;
        }
    }
    record.updated_at_utc_ms = now_ms;
    Ok(())
}

pub(crate) fn apply_failure(
    record: &mut crate::StoredKeyRecord,
    failure_class: FailureClass,
    retry_after_ms: Option<u64>,
    now_ms: i64,
) -> Result<(), RotationError> {
    record.last_failure_at_utc_ms = Some(now_ms);
    record.last_failure_class = Some(failure_class);

    match failure_class {
        FailureClass::AuthInvalid => {
            record.consecutive_failures = record.consecutive_failures.saturating_add(1);
            record.lifecycle_state = LifecycleState::Invalid;
            record.availability_state = AvailabilityState::Unverified;
            record.cooldown_until_utc_ms = None;
        }
        FailureClass::PermissionBlocked => {
            record.consecutive_failures = record.consecutive_failures.saturating_add(1);
            record.lifecycle_state = LifecycleState::Quarantined;
            record.availability_state = AvailabilityState::Unverified;
            record.cooldown_until_utc_ms = None;
        }
        FailureClass::CreditBlocked => {
            record.consecutive_failures = record.consecutive_failures.saturating_add(1);
            record.availability_state = AvailabilityState::Exhausted;
            record.cooldown_until_utc_ms = None;
        }
        FailureClass::RateLimited => {
            record.consecutive_failures = record.consecutive_failures.saturating_add(1);
            record.availability_state = AvailabilityState::Cooldown;
            let delay = match retry_after_ms {
                Some(delay) => delay,
                None => deterministic_backoff_ms(&record.key_id, record.consecutive_failures),
            };
            let delay = i64::try_from(delay).map_err(|_| RotationError::TimeOverflow)?;
            record.cooldown_until_utc_ms = Some(
                now_ms
                    .checked_add(delay)
                    .ok_or(RotationError::TimeOverflow)?,
            );
        }
        FailureClass::RequestInvalid
        | FailureClass::ProviderTransient
        | FailureClass::Unknown => {
            // Observability metadata is updated above, but key eligibility is unchanged.
        }
    }
    Ok(())
}

fn deterministic_backoff_ms(key_id: &KeyId, consecutive_failures: u32) -> u64 {
    let exponent = consecutive_failures.min(5);
    let base = (1_000u64.saturating_mul(1u64 << exponent)).min(60_000);
    base + deterministic_jitter_ms(key_id)
}

fn deterministic_jitter_ms(key_id: &KeyId) -> u64 {
    let digest = Sha256::digest(key_id.0.as_bytes());
    let mut head = [0u8; 8];
    head.copy_from_slice(&digest[..8]);
    u64::from_be_bytes(head) % 251
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        AvailabilityState, CredentialManager, FailureClass, KeyId, LifecycleState, ProtectError,
        ProtectedBlob, SecretBytes, SecretProtector, VaultStore,
    };

    #[derive(Clone, Copy)]
    struct XorTestProtector(u8);

    impl SecretProtector for XorTestProtector {
        fn protect(&self, secret: &SecretBytes) -> Result<ProtectedBlob, ProtectError> {
            Ok(ProtectedBlob::new(secret.expose_bytes(|bytes| {
                bytes.iter().map(|byte| byte ^ self.0).collect()
            })))
        }

        fn unprotect(&self, protected: &ProtectedBlob) -> Result<SecretBytes, ProtectError> {
            if !protected.verify_checksum() {
                return Err(ProtectError::IntegrityFailed);
            }
            SecretBytes::from_decrypted(
                protected
                    .as_bytes()
                    .iter()
                    .map(|byte| byte ^ self.0)
                    .collect(),
            )
            .map_err(|_| ProtectError::UnprotectFailed)
        }
    }

    fn manager_with_keys(count: usize) -> (tempfile::TempDir, CredentialManager<XorTestProtector>, Vec<KeyId>) {
        let dir = tempfile::tempdir().unwrap();
        let manager = CredentialManager::open(
            VaultStore::open(dir.path().join("vault.db")).unwrap(),
            XorTestProtector(0x66),
        )
        .unwrap();
        let mut ids = Vec::new();
        for index in 0..count {
            let summary = manager
                .add_openrouter_key(
                    SecretBytes::parse_import(format!("sk-or-v1-ROTATION_TEST_KEY_{index:02}_123456789")).unwrap(),
                    format!("Key {index}"),
                    100 + index as i64,
                )
                .unwrap();
            ids.push(summary.key_id.clone());
            set_state(
                &manager,
                &summary.key_id,
                LifecycleState::Enabled,
                AvailabilityState::Ready,
                None,
                200 + index as i64,
            );
        }
        (dir, manager, ids)
    }

    fn set_state(
        manager: &CredentialManager<XorTestProtector>,
        key_id: &KeyId,
        lifecycle: LifecycleState,
        availability: AvailabilityState,
        cooldown_until: Option<i64>,
        now_ms: i64,
    ) {
        let mut inner = manager.lock_inner().unwrap();
        let mut record = inner.keys.get(key_id).cloned().unwrap();
        record.lifecycle_state = lifecycle;
        record.availability_state = availability;
        record.cooldown_until_utc_ms = cooldown_until;
        record.updated_at_utc_ms = now_ms;
        let update = record.state_update();
        inner.store.update_key_state(key_id, &update).unwrap();
        inner.keys.insert(key_id.clone(), record);
    }

    #[test]
    fn independent_sessions_follow_stable_round_robin_order() {
        let (_dir, manager, _ids) = manager_with_keys(3);
        let mut observed = Vec::new();
        for now in 1_000..1_004 {
            let mut session = RotationSession::new();
            let lease = manager.acquire(&mut session, now).unwrap();
            observed.push(lease.slot_index);
            manager.report_outcome(lease, OutcomeSignal::Success, now + 10).unwrap();
        }
        assert_eq!(observed, vec![0, 1, 2, 0]);
    }

    #[test]
    fn one_logical_session_never_reuses_a_key() {
        let (_dir, manager, _ids) = manager_with_keys(2);
        let mut session = RotationSession::new();
        let first = manager.acquire(&mut session, 1_000).unwrap();
        manager.report_outcome(first, OutcomeSignal::Success, 1_001).unwrap();
        let second = manager.acquire(&mut session, 1_002).unwrap();
        manager.report_outcome(second, OutcomeSignal::Success, 1_003).unwrap();
        let unavailable = manager.acquire(&mut session, 1_004).unwrap_err();
        assert_eq!(unavailable.scanned_candidates(), 2);
    }

    #[test]
    fn scheduler_skips_all_ineligible_states_and_never_scans_more_than_pool_length() {
        let (_dir, manager, ids) = manager_with_keys(7);
        set_state(&manager, &ids[0], LifecycleState::Disabled, AvailabilityState::Ready, None, 300);
        set_state(&manager, &ids[1], LifecycleState::Invalid, AvailabilityState::Unverified, None, 301);
        set_state(&manager, &ids[2], LifecycleState::Quarantined, AvailabilityState::Unverified, None, 302);
        set_state(&manager, &ids[3], LifecycleState::Enabled, AvailabilityState::Unverified, None, 303);
        set_state(&manager, &ids[4], LifecycleState::Enabled, AvailabilityState::Exhausted, None, 304);
        set_state(&manager, &ids[5], LifecycleState::Enabled, AvailabilityState::Cooldown, Some(5_000), 305);
        set_state(&manager, &ids[6], LifecycleState::Enabled, AvailabilityState::Ready, None, 306);

        let mut session = RotationSession::new();
        let lease = manager.acquire(&mut session, 1_000).unwrap();
        assert_eq!(lease.key_id, ids[6]);
        assert!(lease.scanned_candidates <= ids.len());
        manager.report_outcome(lease, OutcomeSignal::Success, 1_001).unwrap();
    }

    #[test]
    fn warning_key_remains_rotation_eligible() {
        let (_dir, manager, ids) = manager_with_keys(1);
        set_state(
            &manager,
            &ids[0],
            LifecycleState::Enabled,
            AvailabilityState::Warning,
            None,
            900,
        );

        let mut session = RotationSession::new();
        let lease = manager.acquire(&mut session, 1_000).unwrap();
        assert_eq!(lease.key_id, ids[0]);
        manager
            .report_outcome(lease, OutcomeSignal::Success, 1_001)
            .unwrap();
    }

    #[test]
    fn expired_cooldown_reconciles_to_ready_but_future_cooldown_reports_retry_time() {
        let (_dir, manager, ids) = manager_with_keys(1);
        set_state(&manager, &ids[0], LifecycleState::Enabled, AvailabilityState::Cooldown, Some(900), 800);
        let mut session = RotationSession::new();
        let lease = manager.acquire(&mut session, 1_000).unwrap();
        assert_eq!(lease.key_id, ids[0]);
        assert_eq!(manager.list_summaries().unwrap()[0].availability_state, AvailabilityState::Ready);
        manager.report_outcome(lease, OutcomeSignal::Success, 1_001).unwrap();

        set_state(&manager, &ids[0], LifecycleState::Enabled, AvailabilityState::Cooldown, Some(5_000), 2_000);
        let mut session = RotationSession::new();
        let unavailable = manager.acquire(&mut session, 2_500).unwrap_err();
        assert_eq!(unavailable.earliest_retry_at_utc_ms(), Some(5_000));
        assert_eq!(unavailable.scanned_candidates(), 1);
    }

    #[test]
    fn selection_cooldown_recovery_and_health_events_follow_rotation_transitions() {
        let (_dir, manager, ids) = manager_with_keys(1);
        set_state(
            &manager,
            &ids[0],
            LifecycleState::Enabled,
            AvailabilityState::Cooldown,
            Some(900),
            800,
        );
        let mut session = RotationSession::new();
        let lease = manager.acquire(&mut session, 1_000).unwrap();
        manager
            .report_outcome(lease, OutcomeSignal::Success, 1_100)
            .unwrap();

        let events = manager.list_credential_events(10).unwrap();
        assert_eq!(events[0].kind, CredentialEventKind::CredentialHealthy);
        assert_eq!(events[1].kind, CredentialEventKind::CredentialSelected);
        assert_eq!(events[2].kind, CredentialEventKind::CredentialRecovered);
        assert_eq!(events[3].kind, CredentialEventKind::CredentialAdded);

        let mut next_session = RotationSession::new();
        let lease = manager.acquire(&mut next_session, 1_200).unwrap();
        manager
            .report_outcome(
                lease,
                OutcomeSignal::Http {
                    status: 429,
                    retry_after_ms: Some(1_000),
                },
                1_300,
            )
            .unwrap();
        let events = manager.list_credential_events(10).unwrap();
        assert_eq!(events[0].kind, CredentialEventKind::CredentialCooldown);
        assert_eq!(events[1].kind, CredentialEventKind::CredentialSelected);
    }

    #[test]
    fn credit_blocked_outcome_emits_expired_instead_of_predictive_warning() {
        let (_dir, manager, _ids) = manager_with_keys(1);
        let mut session = RotationSession::new();
        let lease = manager.acquire(&mut session, 1_000).unwrap();
        manager
            .report_outcome(
                lease,
                OutcomeSignal::Http {
                    status: 402,
                    retry_after_ms: None,
                },
                1_100,
            )
            .unwrap();

        let events = manager.list_credential_events(10).unwrap();
        assert_eq!(events[0].kind, CredentialEventKind::CredentialExpired);
        assert!(!events
            .iter()
            .any(|event| event.kind == CredentialEventKind::CredentialWarning));
    }

    #[test]
    fn auth_invalid_outcome_does_not_emit_predictive_warning() {
        let (_dir, manager, _ids) = manager_with_keys(1);
        let mut session = RotationSession::new();
        let lease = manager.acquire(&mut session, 1_000).unwrap();
        manager
            .report_outcome(
                lease,
                OutcomeSignal::Http {
                    status: 401,
                    retry_after_ms: None,
                },
                1_100,
            )
            .unwrap();

        let events = manager.list_credential_events(10).unwrap();
        assert!(!events
            .iter()
            .any(|event| event.kind == CredentialEventKind::CredentialWarning));
    }

    #[test]
    fn outcome_is_exactly_once_and_key_scoped_failures_persist() {
        let (_dir, manager, ids) = manager_with_keys(2);
        let mut session = RotationSession::new();
        let lease = manager.acquire(&mut session, 1_000).unwrap();
        let duplicate = lease.clone();
        manager
            .report_outcome(
                lease,
                OutcomeSignal::Http {
                    status: 429,
                    retry_after_ms: Some(2_000),
                },
                1_100,
            )
            .unwrap();
        let first = manager
            .list_summaries()
            .unwrap()
            .into_iter()
            .find(|summary| summary.key_id == ids[0])
            .unwrap();
        assert_eq!(first.availability_state, AvailabilityState::Cooldown);
        assert_eq!(first.cooldown_until_utc_ms, Some(3_100));
        assert_eq!(first.last_failure_class, Some(FailureClass::RateLimited));
        assert!(matches!(
            manager.report_outcome(duplicate, OutcomeSignal::Success, 1_200),
            Err(RotationError::UnknownLease)
        ));

        let mut new_session = RotationSession::new();
        let second = manager.acquire(&mut new_session, 1_300).unwrap();
        assert_eq!(second.key_id, ids[1]);
        manager
            .report_outcome(
                second,
                OutcomeSignal::Http {
                    status: 401,
                    retry_after_ms: None,
                },
                1_400,
            )
            .unwrap();
        let second_state = manager
            .list_summaries()
            .unwrap()
            .into_iter()
            .find(|summary| summary.key_id == ids[1])
            .unwrap();
        assert_eq!(second_state.lifecycle_state, LifecycleState::Invalid);
        assert_eq!(second_state.availability_state, AvailabilityState::Unverified);
    }

    #[test]
    fn provider_transient_does_not_poison_or_rotate_the_pool() {
        let (_dir, manager, ids) = manager_with_keys(2);
        let mut session = RotationSession::new();
        let lease = manager.acquire(&mut session, 1_000).unwrap();
        assert_eq!(lease.key_id, ids[0]);
        let snapshot = manager
            .report_outcome(lease, OutcomeSignal::ProviderTransient, 1_100)
            .unwrap();
        let first = snapshot.keys.iter().find(|key| key.key_id == ids[0]).unwrap();
        assert_eq!(first.lifecycle_state, LifecycleState::Enabled);
        assert_eq!(first.availability_state, AvailabilityState::Ready);
    }


    #[test]
    fn permission_and_credit_failures_apply_key_scoped_state_transitions() {
        let (_dir, manager, ids) = manager_with_keys(2);

        let mut first_session = RotationSession::new();
        let first = manager.acquire(&mut first_session, 1_000).unwrap();
        manager
            .report_outcome(
                first,
                OutcomeSignal::Http {
                    status: 403,
                    retry_after_ms: None,
                },
                1_010,
            )
            .unwrap();
        let first_state = manager
            .list_summaries()
            .unwrap()
            .into_iter()
            .find(|summary| summary.key_id == ids[0])
            .unwrap();
        assert_eq!(first_state.lifecycle_state, LifecycleState::Quarantined);
        assert_eq!(first_state.availability_state, AvailabilityState::Unverified);
        assert_eq!(first_state.last_failure_class, Some(FailureClass::PermissionBlocked));

        let mut second_session = RotationSession::new();
        let second = manager.acquire(&mut second_session, 1_020).unwrap();
        manager
            .report_outcome(
                second,
                OutcomeSignal::Http {
                    status: 402,
                    retry_after_ms: None,
                },
                1_030,
            )
            .unwrap();
        let second_state = manager
            .list_summaries()
            .unwrap()
            .into_iter()
            .find(|summary| summary.key_id == ids[1])
            .unwrap();
        assert_eq!(second_state.lifecycle_state, LifecycleState::Enabled);
        assert_eq!(second_state.availability_state, AvailabilityState::Exhausted);
        assert_eq!(second_state.last_failure_class, Some(FailureClass::CreditBlocked));
    }

    #[test]
    fn fallback_backoff_uses_golden_deterministic_per_key_jitter() {
        let key_id = KeyId("fixed-key".to_owned());
        assert_eq!(deterministic_jitter_ms(&key_id), 147);
        assert_eq!(deterministic_backoff_ms(&key_id, 1), 2_147);
        assert_eq!(deterministic_backoff_ms(&key_id, 99), 32_147);
    }

    #[test]
    fn restart_preserves_rotation_cursor_and_failure_states() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("vault.db");
        let protector = XorTestProtector(0x71);
        let manager = CredentialManager::open(VaultStore::open(&path).unwrap(), protector).unwrap();
        let mut ids = Vec::new();
        for index in 0..3 {
            let summary = manager
                .add_openrouter_key(
                    SecretBytes::parse_import(format!("sk-or-v1-RESTART_KEY_{index}_123456789")).unwrap(),
                    format!("Restart {index}"),
                    100 + index,
                )
                .unwrap();
            set_state(&manager, &summary.key_id, LifecycleState::Enabled, AvailabilityState::Ready, None, 200 + index);
            ids.push(summary.key_id);
        }

        let mut a = RotationSession::new();
        let lease0 = manager.acquire(&mut a, 1_000).unwrap();
        manager.report_outcome(lease0, OutcomeSignal::Success, 1_010).unwrap();
        let mut b = RotationSession::new();
        let lease1 = manager.acquire(&mut b, 1_020).unwrap();
        manager
            .report_outcome(
                lease1,
                OutcomeSignal::Http { status: 429, retry_after_ms: Some(5_000) },
                1_030,
            )
            .unwrap();
        let mut c = RotationSession::new();
        let lease2 = manager.acquire(&mut c, 1_040).unwrap();
        manager
            .report_outcome(
                lease2,
                OutcomeSignal::Http { status: 401, retry_after_ms: None },
                1_050,
            )
            .unwrap();
        manager.set_enabled(&ids[0], false, 1_060).unwrap();
        let before = manager.rotation_snapshot().unwrap();
        drop(manager);

        let reopened = CredentialManager::open(VaultStore::open(&path).unwrap(), protector).unwrap();
        let after = reopened.rotation_snapshot().unwrap();
        assert_eq!(before.cursor_slot, after.cursor_slot);
        assert_eq!(before.keys, after.keys);

        let mut session = RotationSession::new();
        let unavailable = reopened.acquire(&mut session, 2_000).unwrap_err();
        assert_eq!(unavailable.earliest_retry_at_utc_ms(), Some(6_030));
        let lease = reopened.acquire(&mut RotationSession::new(), 6_031).unwrap();
        assert_eq!(lease.key_id, ids[1]);
    }
}
