use std::collections::BTreeSet;

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use thiserror::Error;
use uuid::Uuid;

use crate::{
    classify_status, AvailabilityState, CredentialManager, FailureClass, KeyId, LifecycleState,
    ManagerError, SecretProtector,
};

#[derive(Debug, Default)]
pub struct RotationSession {
    attempted: BTreeSet<KeyId>,
}

impl RotationSession {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn attempted_count(&self) -> usize {
        self.attempted.len()
    }

    fn has_attempted(&self, key_id: &KeyId) -> bool {
        self.attempted.contains(key_id)
    }

    fn mark_attempted(&mut self, key_id: KeyId) {
        self.attempted.insert(key_id);
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct KeyLease {
    pub lease_id: Uuid,
    pub key_id: KeyId,
    pub slot_index: i64,
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

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum PoolUnavailableReason {
    NoKeys,
    NoEligibleKeys,
    SessionExhausted,
    PersistenceFailed,
    StateUnavailable,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PoolUnavailable {
    pub reason: PoolUnavailableReason,
    pub earliest_retry_at_utc_ms: Option<i64>,
    pub scanned: usize,
}

#[derive(Debug, Error, PartialEq, Eq)]
pub enum RotationError {
    #[error("rotation manager state is unavailable")]
    StateUnavailable,
    #[error("lease is unknown or has already been reported")]
    UnknownLease,
    #[error("lease key does not match the registered lease")]
    LeaseMismatch,
    #[error("leased credential no longer exists")]
    KeyMissing,
    #[error("rotation state persistence failed")]
    PersistenceFailed,
    #[error("in-flight accounting is inconsistent")]
    InFlightInvariant,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct OutcomeReport {
    pub failure_class: Option<FailureClass>,
    pub rotate: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RotationKeySnapshot {
    pub key_id: KeyId,
    pub slot_index: i64,
    pub lifecycle_state: LifecycleState,
    pub availability_state: AvailabilityState,
    pub cooldown_until_utc_ms: Option<i64>,
    pub consecutive_failures: u32,
    pub in_flight: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RotationSnapshot {
    pub cursor_slot: i64,
    pub active_leases: usize,
    pub keys: Vec<RotationKeySnapshot>,
}

impl<P: SecretProtector> CredentialManager<P> {
    pub fn acquire(
        &self,
        session: &mut RotationSession,
        now_ms: i64,
    ) -> Result<KeyLease, PoolUnavailable> {
        let mut inner = self.inner.lock().map_err(|_| PoolUnavailable {
            reason: PoolUnavailableReason::StateUnavailable,
            earliest_retry_at_utc_ms: None,
            scanned: 0,
        })?;

        if inner.keys.is_empty() {
            return Err(PoolUnavailable {
                reason: PoolUnavailableReason::NoKeys,
                earliest_retry_at_utc_ms: None,
                scanned: 0,
            });
        }

        let mut records = inner.keys.values().cloned().collect::<Vec<_>>();
        records.sort_by_key(|record| record.slot_index);
        let pool_len = records.len();

        // Reconcile time-based cooldowns before selection. Invalid/quarantined/exhausted
        // states never recover merely because time passed.
        for record in &mut records {
            if record.lifecycle_state == LifecycleState::Enabled
                && record.availability_state == AvailabilityState::Cooldown
                && record.cooldown_until_utc_ms.is_some_and(|deadline| deadline <= now_ms)
            {
                record.availability_state = AvailabilityState::Ready;
                record.cooldown_until_utc_ms = None;
                record.updated_at_utc_ms = now_ms;
                let update = record.state_update();
                if inner.store.update_key_state(&record.key_id, &update).is_err() {
                    return Err(PoolUnavailable {
                        reason: PoolUnavailableReason::PersistenceFailed,
                        earliest_retry_at_utc_ms: None,
                        scanned: 0,
                    });
                }
                inner.keys.insert(record.key_id.clone(), record.clone());
            }
        }

        // Re-read the reconciled current projection and preserve stable slot order.
        records = inner.keys.values().cloned().collect::<Vec<_>>();
        records.sort_by_key(|record| record.slot_index);

        let start = records
            .iter()
            .position(|record| record.slot_index > inner.rotation_cursor)
            .unwrap_or(0);
        let mut earliest_retry = None;
        let mut ready_but_attempted = false;

        for offset in 0..pool_len {
            let record = &records[(start + offset) % pool_len];
            if record.lifecycle_state == LifecycleState::Enabled
                && record.availability_state == AvailabilityState::Cooldown
            {
                if let Some(deadline) = record.cooldown_until_utc_ms.filter(|deadline| *deadline > now_ms) {
                    earliest_retry = Some(earliest_retry.map_or(deadline, |current: i64| current.min(deadline)));
                }
            }

            let eligible = record.lifecycle_state == LifecycleState::Enabled
                && record.availability_state == AvailabilityState::Ready;
            if !eligible {
                continue;
            }
            if session.has_attempted(&record.key_id) {
                ready_but_attempted = true;
                continue;
            }

            // Cursor persistence is part of the acquisition decision. If persistence fails,
            // no lease/session mutation is published.
            if inner.store.save_rotation_cursor(record.slot_index, now_ms).is_err() {
                return Err(PoolUnavailable {
                    reason: PoolUnavailableReason::PersistenceFailed,
                    earliest_retry_at_utc_ms: earliest_retry,
                    scanned: pool_len,
                });
            }

            let lease = KeyLease {
                lease_id: Uuid::new_v4(),
                key_id: record.key_id.clone(),
                slot_index: record.slot_index,
            };
            inner.rotation_cursor = record.slot_index;
            *inner.in_flight.entry(record.key_id.clone()).or_insert(0) += 1;
            inner.active_leases.insert(lease.lease_id, record.key_id.clone());
            session.mark_attempted(record.key_id.clone());
            return Ok(lease);
        }

        Err(PoolUnavailable {
            reason: if ready_but_attempted {
                PoolUnavailableReason::SessionExhausted
            } else {
                PoolUnavailableReason::NoEligibleKeys
            },
            earliest_retry_at_utc_ms: earliest_retry,
            scanned: pool_len,
        })
    }

    pub fn report_outcome(
        &self,
        lease: KeyLease,
        signal: OutcomeSignal,
        now_ms: i64,
    ) -> Result<OutcomeReport, RotationError> {
        let mut inner = self.inner.lock().map_err(|_| RotationError::StateUnavailable)?;
        let registered_key = inner
            .active_leases
            .get(&lease.lease_id)
            .ok_or(RotationError::UnknownLease)?;
        if registered_key != &lease.key_id {
            return Err(RotationError::LeaseMismatch);
        }

        let mut record = inner
            .keys
            .get(&lease.key_id)
            .cloned()
            .ok_or(RotationError::KeyMissing)?;

        let current_in_flight = inner.in_flight.get(&lease.key_id).copied().unwrap_or(0);
        if current_in_flight == 0 {
            return Err(RotationError::InFlightInvariant);
        }

        let (failure_class, rotate) = match signal {
            OutcomeSignal::Success => {
                record.consecutive_failures = 0;
                record.last_success_at_utc_ms = Some(now_ms);
                (None, false)
            }
            OutcomeSignal::Http {
                status,
                retry_after_ms,
            } => {
                let classified = classify_status(status, retry_after_ms);
                apply_failure(
                    &mut record,
                    classified.failure_class,
                    classified.retry_after_ms,
                    now_ms,
                );
                (Some(classified.failure_class), classified.rotate)
            }
            OutcomeSignal::RequestInvalid => {
                record.last_failure_at_utc_ms = Some(now_ms);
                record.last_failure_class = Some(FailureClass::RequestInvalid);
                record.updated_at_utc_ms = now_ms;
                (Some(FailureClass::RequestInvalid), false)
            }
            OutcomeSignal::ProviderTransient => {
                record.last_failure_at_utc_ms = Some(now_ms);
                record.last_failure_class = Some(FailureClass::ProviderTransient);
                record.updated_at_utc_ms = now_ms;
                (Some(FailureClass::ProviderTransient), false)
            }
            OutcomeSignal::Unknown => {
                record.last_failure_at_utc_ms = Some(now_ms);
                record.last_failure_class = Some(FailureClass::Unknown);
                record.updated_at_utc_ms = now_ms;
                (Some(FailureClass::Unknown), false)
            }
        };
        record.updated_at_utc_ms = now_ms;

        inner
            .store
            .update_key_state(&record.key_id, &record.state_update())
            .map_err(|_| RotationError::PersistenceFailed)?;

        // Consume the lease only after the durable transition succeeds.
        inner.active_leases.remove(&lease.lease_id);
        let counter = inner
            .in_flight
            .get_mut(&lease.key_id)
            .ok_or(RotationError::InFlightInvariant)?;
        *counter = counter.checked_sub(1).ok_or(RotationError::InFlightInvariant)?;
        inner.keys.insert(record.key_id.clone(), record);

        Ok(OutcomeReport {
            failure_class,
            rotate,
        })
    }

    pub fn rotation_snapshot(&self) -> Result<RotationSnapshot, ManagerError> {
        let inner = self.lock_inner()?;
        let mut records = inner.keys.values().collect::<Vec<_>>();
        records.sort_by_key(|record| record.slot_index);
        Ok(RotationSnapshot {
            cursor_slot: inner.rotation_cursor,
            active_leases: inner.active_leases.len(),
            keys: records
                .into_iter()
                .map(|record| RotationKeySnapshot {
                    key_id: record.key_id.clone(),
                    slot_index: record.slot_index,
                    lifecycle_state: record.lifecycle_state,
                    availability_state: record.availability_state,
                    cooldown_until_utc_ms: record.cooldown_until_utc_ms,
                    consecutive_failures: record.consecutive_failures,
                    in_flight: inner.in_flight.get(&record.key_id).copied().unwrap_or(0),
                })
                .collect(),
        })
    }
}

fn apply_failure(
    record: &mut crate::StoredKeyRecord,
    failure_class: FailureClass,
    retry_after_ms: Option<u64>,
    now_ms: i64,
) {
    record.last_failure_at_utc_ms = Some(now_ms);
    record.last_failure_class = Some(failure_class);
    record.updated_at_utc_ms = now_ms;

    match failure_class {
        FailureClass::AuthInvalid => {
            record.consecutive_failures = record.consecutive_failures.saturating_add(1).min(32);
            record.lifecycle_state = LifecycleState::Invalid;
            record.availability_state = AvailabilityState::Unverified;
            record.cooldown_until_utc_ms = None;
        }
        FailureClass::PermissionBlocked => {
            record.consecutive_failures = record.consecutive_failures.saturating_add(1).min(32);
            record.lifecycle_state = LifecycleState::Quarantined;
            record.availability_state = AvailabilityState::Unverified;
            record.cooldown_until_utc_ms = None;
        }
        FailureClass::CreditBlocked => {
            record.consecutive_failures = record.consecutive_failures.saturating_add(1).min(32);
            record.availability_state = AvailabilityState::Exhausted;
            record.cooldown_until_utc_ms = None;
        }
        FailureClass::RateLimited => {
            record.consecutive_failures = record.consecutive_failures.saturating_add(1).min(32);
            record.availability_state = AvailabilityState::Cooldown;
            let delay_ms = retry_after_ms.unwrap_or_else(|| fallback_cooldown_ms(&record.key_id, record.consecutive_failures));
            let delay_ms = i64::try_from(delay_ms).unwrap_or(i64::MAX);
            record.cooldown_until_utc_ms = Some(now_ms.saturating_add(delay_ms));
        }
        FailureClass::RequestInvalid | FailureClass::ProviderTransient | FailureClass::Unknown => {
            // Observability fields are updated above, but key health stays unchanged.
        }
    }
}

fn fallback_cooldown_ms(key_id: &KeyId, consecutive_failures: u32) -> u64 {
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
        AvailabilityState, CredentialManager, KeyId, LifecycleState, NewStoredKey, ProtectError,
        ProtectedBlob, SecretBytes, SecretProtector, VaultStore,
    };

    struct XorTestProtector(u8);

    impl SecretProtector for XorTestProtector {
        fn protect(&self, secret: &SecretBytes) -> Result<ProtectedBlob, ProtectError> {
            Ok(ProtectedBlob::new(secret.expose_bytes(|bytes| bytes.iter().map(|byte| byte ^ self.0).collect())))
        }

        fn unprotect(&self, protected: &ProtectedBlob) -> Result<SecretBytes, ProtectError> {
            if !protected.verify_checksum() {
                return Err(ProtectError::IntegrityFailed);
            }
            SecretBytes::from_decrypted(protected.as_bytes().iter().map(|byte| byte ^ self.0).collect())
                .map_err(|_| ProtectError::UnprotectFailed)
        }
    }

    fn manager_with_states(
        states: &[(LifecycleState, AvailabilityState, Option<i64>)],
    ) -> (tempfile::TempDir, CredentialManager<XorTestProtector>) {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("vault.db");
        let mut store = VaultStore::open(&path).unwrap();
        for (index, (lifecycle, availability, cooldown)) in states.iter().copied().enumerate() {
            store
                .insert_key(NewStoredKey {
                    key_id: KeyId(format!("key-{index}")),
                    slot_index: index as i64,
                    label: format!("Key {index}"),
                    masked_suffix: format!("••••{index:04}"),
                    protected_blob: ProtectedBlob::new(vec![index as u8 + 1; 24]),
                    lifecycle_state: lifecycle,
                    availability_state: availability,
                    cooldown_until_utc_ms: cooldown,
                    consecutive_failures: 0,
                    last_success_at_utc_ms: None,
                    last_failure_at_utc_ms: None,
                    last_failure_class: None,
                    last_probe_at_utc_ms: None,
                    limit_value: None,
                    limit_remaining: None,
                    limit_reset: None,
                    usage_daily: None,
                    is_free_tier: None,
                    expires_at_utc_ms: None,
                    created_at_utc_ms: 0,
                    updated_at_utc_ms: 0,
                })
                .unwrap();
        }
        let manager = CredentialManager::open(store, XorTestProtector(0x5a)).unwrap();
        (dir, manager)
    }

    fn ready_states(count: usize) -> Vec<(LifecycleState, AvailabilityState, Option<i64>)> {
        (0..count)
            .map(|_| (LifecycleState::Enabled, AvailabilityState::Ready, None))
            .collect()
    }

    #[test]
    fn round_robin_order_is_deterministic_across_independent_sessions() {
        let (_dir, manager) = manager_with_states(&ready_states(3));
        let mut slots = Vec::new();
        for now in 0..4 {
            let mut session = RotationSession::new();
            let lease = manager.acquire(&mut session, now).unwrap();
            slots.push(lease.slot_index);
            manager.report_outcome(lease, OutcomeSignal::Success, now).unwrap();
        }
        assert_eq!(slots, vec![0, 1, 2, 0]);
    }

    #[test]
    fn one_rotation_session_never_selects_the_same_key_twice() {
        let (_dir, manager) = manager_with_states(&ready_states(2));
        let mut session = RotationSession::new();
        let first = manager.acquire(&mut session, 0).unwrap();
        manager.report_outcome(first, OutcomeSignal::Success, 0).unwrap();
        let second = manager.acquire(&mut session, 1).unwrap();
        manager.report_outcome(second, OutcomeSignal::Success, 1).unwrap();
        let unavailable = manager.acquire(&mut session, 2).unwrap_err();
        assert_eq!(unavailable.scanned, 2);
        assert_eq!(unavailable.reason, PoolUnavailableReason::SessionExhausted);
        assert_eq!(session.attempted_count(), 2);
    }

    #[test]
    fn scheduler_skips_ineligible_states_and_reconciles_expired_cooldown() {
        let states = [
            (LifecycleState::Disabled, AvailabilityState::Ready, None),
            (LifecycleState::Invalid, AvailabilityState::Ready, None),
            (LifecycleState::Quarantined, AvailabilityState::Ready, None),
            (LifecycleState::Enabled, AvailabilityState::Unverified, None),
            (LifecycleState::Enabled, AvailabilityState::Exhausted, None),
            (LifecycleState::Enabled, AvailabilityState::Cooldown, Some(500)),
            (LifecycleState::Enabled, AvailabilityState::Ready, None),
        ];
        let (_dir, manager) = manager_with_states(&states);
        let mut session = RotationSession::new();
        let lease = manager.acquire(&mut session, 100).unwrap();
        assert_eq!(lease.slot_index, 6);
        manager.report_outcome(lease, OutcomeSignal::Success, 100).unwrap();

        let (_dir, manager) = manager_with_states(&[(
            LifecycleState::Enabled,
            AvailabilityState::Cooldown,
            Some(500),
        )]);
        let mut session = RotationSession::new();
        assert!(manager.acquire(&mut session, 499).is_err());
        let lease = manager.acquire(&mut RotationSession::new(), 500).unwrap();
        assert_eq!(lease.slot_index, 0);
    }

    #[test]
    fn no_eligible_key_returns_a_bounded_terminal_result() {
        let states = [
            (LifecycleState::Disabled, AvailabilityState::Ready, None),
            (LifecycleState::Enabled, AvailabilityState::Exhausted, None),
            (LifecycleState::Enabled, AvailabilityState::Cooldown, Some(10_000)),
        ];
        let (_dir, manager) = manager_with_states(&states);
        let unavailable = manager.acquire(&mut RotationSession::new(), 100).unwrap_err();
        assert_eq!(unavailable.scanned, states.len());
        assert_eq!(unavailable.earliest_retry_at_utc_ms, Some(10_000));
    }

    #[test]
    fn key_scoped_failures_transition_state_but_provider_failures_do_not() {
        let (_dir, manager) = manager_with_states(&ready_states(3));
        let mut session = RotationSession::new();
        let a = manager.acquire(&mut session, 100).unwrap();
        let report = manager
            .report_outcome(
                a,
                OutcomeSignal::Http {
                    status: 429,
                    retry_after_ms: Some(30_000),
                },
                100,
            )
            .unwrap();
        assert_eq!(report.failure_class, Some(FailureClass::RateLimited));
        assert!(report.rotate);
        let b = manager.acquire(&mut session, 101).unwrap();
        manager
            .report_outcome(
                b,
                OutcomeSignal::Http {
                    status: 401,
                    retry_after_ms: None,
                },
                101,
            )
            .unwrap();
        let c = manager.acquire(&mut session, 102).unwrap();
        let c_id = c.key_id.clone();
        let before = manager.rotation_snapshot().unwrap();
        let report = manager
            .report_outcome(c, OutcomeSignal::ProviderTransient, 102)
            .unwrap();
        assert_eq!(report.failure_class, Some(FailureClass::ProviderTransient));
        assert!(!report.rotate);
        let after = manager.rotation_snapshot().unwrap();
        let c_before = before.keys.iter().find(|key| key.key_id == c_id).unwrap();
        let c_after = after.keys.iter().find(|key| key.key_id == c_id).unwrap();
        assert_eq!(c_before.lifecycle_state, c_after.lifecycle_state);
        assert_eq!(c_before.availability_state, c_after.availability_state);
    }

    #[test]
    fn lease_is_consumed_once_and_blocks_delete_until_reported() {
        let (_dir, manager) = manager_with_states(&ready_states(1));
        let mut session = RotationSession::new();
        let lease = manager.acquire(&mut session, 0).unwrap();
        assert!(matches!(manager.delete_key(&lease.key_id, 1), Err(ManagerError::KeyBusy)));
        let duplicate = lease.clone();
        manager.report_outcome(lease, OutcomeSignal::Success, 1).unwrap();
        assert_eq!(
            manager.report_outcome(duplicate, OutcomeSignal::Success, 2),
            Err(RotationError::UnknownLease)
        );
    }

    #[test]
    fn restart_preserves_cursor_and_key_state_after_reported_outcomes() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("vault.db");
        {
            let mut store = VaultStore::open(&path).unwrap();
            for index in 0..3 {
                store
                    .insert_key(NewStoredKey {
                        key_id: KeyId(format!("key-{index}")),
                        slot_index: index,
                        label: format!("Key {index}"),
                        masked_suffix: format!("••••{index:04}"),
                        protected_blob: ProtectedBlob::new(vec![index as u8 + 1; 24]),
                        lifecycle_state: LifecycleState::Enabled,
                        availability_state: AvailabilityState::Ready,
                        cooldown_until_utc_ms: None,
                        consecutive_failures: 0,
                        last_success_at_utc_ms: None,
                        last_failure_at_utc_ms: None,
                        last_failure_class: None,
                        last_probe_at_utc_ms: None,
                        limit_value: None,
                        limit_remaining: None,
                        limit_reset: None,
                        usage_daily: None,
                        is_free_tier: None,
                        expires_at_utc_ms: None,
                        created_at_utc_ms: 0,
                        updated_at_utc_ms: 0,
                    })
                    .unwrap();
            }
        }
        let manager = CredentialManager::open(VaultStore::open(&path).unwrap(), XorTestProtector(0x5a)).unwrap();
        let a = manager.acquire(&mut RotationSession::new(), 10).unwrap();
        manager.report_outcome(a, OutcomeSignal::Success, 10).unwrap();
        let b = manager.acquire(&mut RotationSession::new(), 20).unwrap();
        manager
            .report_outcome(
                b,
                OutcomeSignal::Http {
                    status: 429,
                    retry_after_ms: Some(5_000),
                },
                20,
            )
            .unwrap();
        let c = manager.acquire(&mut RotationSession::new(), 30).unwrap();
        manager
            .report_outcome(
                c,
                OutcomeSignal::Http {
                    status: 401,
                    retry_after_ms: None,
                },
                30,
            )
            .unwrap();
        let before = manager.rotation_snapshot().unwrap();
        drop(manager);
        let reopened = CredentialManager::open(VaultStore::open(&path).unwrap(), XorTestProtector(0x5a)).unwrap();
        let after = reopened.rotation_snapshot().unwrap();
        assert_eq!(before, after);
        assert_eq!(after.active_leases, 0);
        assert!(after.keys.iter().all(|key| key.in_flight == 0));
    }
}
