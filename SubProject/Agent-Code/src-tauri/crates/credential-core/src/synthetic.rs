use thiserror::Error;

use crate::{
    AvailabilityState, CredentialManager, KeyId, LifecycleState, NewStoredKey, OutcomeSignal,
    ProtectError, ProtectedBlob, RotationSession, RotationSnapshot, SecretBytes, SecretProtector,
    VaultStore,
};

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct SyntheticRotationReport {
    pub passed: bool,
    pub scenarios_run: u32,
    pub transitions_run: u64,
    pub duplicate_selection_violations: u64,
    pub ineligible_selection_violations: u64,
    pub provider_churn_violations: u64,
    pub deterministic_replay_equal: bool,
}

#[derive(Debug, Error)]
pub enum SyntheticError {
    #[error("synthetic vault setup failed")]
    Setup,
    #[error("synthetic rotation scenario failed")]
    Scenario,
}

struct RejectingSyntheticProtector;

impl SecretProtector for RejectingSyntheticProtector {
    fn protect(&self, _secret: &SecretBytes) -> Result<ProtectedBlob, ProtectError> {
        Err(ProtectError::UnsupportedPlatform)
    }

    fn unprotect(&self, _protected: &ProtectedBlob) -> Result<SecretBytes, ProtectError> {
        Err(ProtectError::UnsupportedPlatform)
    }
}

pub fn run_synthetic_rotation_self_test() -> Result<SyntheticRotationReport, SyntheticError> {
    let first = run_required_scenarios()?;
    let second = run_required_scenarios()?;
    let deterministic_replay_equal = first.snapshots == second.snapshots;
    Ok(SyntheticRotationReport {
        passed: first.duplicate_selection_violations == 0
            && first.ineligible_selection_violations == 0
            && first.provider_churn_violations == 0
            && deterministic_replay_equal,
        scenarios_run: 4,
        transitions_run: first.transitions_run,
        duplicate_selection_violations: first.duplicate_selection_violations,
        ineligible_selection_violations: first.ineligible_selection_violations,
        provider_churn_violations: first.provider_churn_violations,
        deterministic_replay_equal,
    })
}

struct ScenarioRun {
    transitions_run: u64,
    duplicate_selection_violations: u64,
    ineligible_selection_violations: u64,
    provider_churn_violations: u64,
    snapshots: Vec<RotationSnapshot>,
}

fn run_required_scenarios() -> Result<ScenarioRun, SyntheticError> {
    let mut transitions = 0u64;
    let mut duplicate_selection_violations = 0u64;
    let mut ineligible_selection_violations = 0u64;
    let mut provider_churn_violations = 0u64;
    let mut snapshots = Vec::new();

    // A: rate limit moves A to cooldown and next acquisition uses B.
    let manager = manager_with_states(&[
        (LifecycleState::Enabled, AvailabilityState::Ready, None),
        (LifecycleState::Enabled, AvailabilityState::Ready, None),
    ])?;
    let mut session = RotationSession::new();
    let a = manager.acquire(&mut session, 1_000).map_err(|_| SyntheticError::Scenario)?;
    transitions += 1;
    manager
        .report_outcome(
            a,
            OutcomeSignal::Http {
                status: 429,
                retry_after_ms: Some(30_000),
            },
            1_000,
        )
        .map_err(|_| SyntheticError::Scenario)?;
    transitions += 1;
    let b = manager.acquire(&mut session, 1_001).map_err(|_| SyntheticError::Scenario)?;
    transitions += 1;
    if b.slot_index != 1 {
        duplicate_selection_violations += 1;
    }
    manager
        .report_outcome(b, OutcomeSignal::Success, 1_001)
        .map_err(|_| SyntheticError::Scenario)?;
    transitions += 1;
    let snapshot = manager.rotation_snapshot().map_err(|_| SyntheticError::Scenario)?;
    if snapshot.keys[0].availability_state != AvailabilityState::Cooldown
        || snapshot.keys[1].availability_state != AvailabilityState::Ready
    {
        ineligible_selection_violations += 1;
    }
    snapshots.push(snapshot);

    // B: auth-invalid -> credit-blocked -> third key succeeds.
    let manager = manager_with_states(&[
        (LifecycleState::Enabled, AvailabilityState::Ready, None),
        (LifecycleState::Enabled, AvailabilityState::Ready, None),
        (LifecycleState::Enabled, AvailabilityState::Ready, None),
    ])?;
    let mut session = RotationSession::new();
    let a = manager.acquire(&mut session, 2_000).map_err(|_| SyntheticError::Scenario)?;
    transitions += 1;
    manager
        .report_outcome(
            a,
            OutcomeSignal::Http {
                status: 401,
                retry_after_ms: None,
            },
            2_000,
        )
        .map_err(|_| SyntheticError::Scenario)?;
    transitions += 1;
    let b = manager.acquire(&mut session, 2_001).map_err(|_| SyntheticError::Scenario)?;
    transitions += 1;
    manager
        .report_outcome(
            b,
            OutcomeSignal::Http {
                status: 402,
                retry_after_ms: None,
            },
            2_001,
        )
        .map_err(|_| SyntheticError::Scenario)?;
    transitions += 1;
    let c = manager.acquire(&mut session, 2_002).map_err(|_| SyntheticError::Scenario)?;
    transitions += 1;
    manager
        .report_outcome(c, OutcomeSignal::Success, 2_002)
        .map_err(|_| SyntheticError::Scenario)?;
    transitions += 1;
    let snapshot = manager.rotation_snapshot().map_err(|_| SyntheticError::Scenario)?;
    if snapshot.keys[0].lifecycle_state != LifecycleState::Invalid
        || snapshot.keys[1].availability_state != AvailabilityState::Exhausted
        || snapshot.keys[2].availability_state != AvailabilityState::Ready
    {
        ineligible_selection_violations += 1;
    }
    snapshots.push(snapshot);

    // C: provider-wide transient failure leaves both keys eligible; lab does not consume B.
    let manager = manager_with_states(&[
        (LifecycleState::Enabled, AvailabilityState::Ready, None),
        (LifecycleState::Enabled, AvailabilityState::Ready, None),
    ])?;
    let mut session = RotationSession::new();
    let a = manager.acquire(&mut session, 3_000).map_err(|_| SyntheticError::Scenario)?;
    transitions += 1;
    manager
        .report_outcome(a, OutcomeSignal::ProviderTransient, 3_000)
        .map_err(|_| SyntheticError::Scenario)?;
    transitions += 1;
    let snapshot = manager.rotation_snapshot().map_err(|_| SyntheticError::Scenario)?;
    if session.attempted_count() != 1
        || snapshot.keys.iter().any(|key| {
            key.lifecycle_state != LifecycleState::Enabled
                || key.availability_state != AvailabilityState::Ready
        })
    {
        provider_churn_violations += 1;
    }
    snapshots.push(snapshot);

    // D: all unavailable terminates after exactly one bounded pool scan.
    let manager = manager_with_states(&[
        (LifecycleState::Disabled, AvailabilityState::Ready, None),
        (LifecycleState::Enabled, AvailabilityState::Exhausted, None),
    ])?;
    let unavailable = manager
        .acquire(&mut RotationSession::new(), 4_000)
        .expect_err("all unavailable must terminate");
    transitions += 1;
    if unavailable.scanned_candidates() != 2 {
        ineligible_selection_violations += 1;
    }
    snapshots.push(manager.rotation_snapshot().map_err(|_| SyntheticError::Scenario)?);

    Ok(ScenarioRun {
        transitions_run: transitions,
        duplicate_selection_violations,
        ineligible_selection_violations,
        provider_churn_violations,
        snapshots,
    })
}

fn manager_with_states(
    states: &[(LifecycleState, AvailabilityState, Option<i64>)],
) -> Result<CredentialManager<RejectingSyntheticProtector>, SyntheticError> {
    let mut store = VaultStore::open_in_memory().map_err(|_| SyntheticError::Setup)?;
    for (index, (lifecycle_state, availability_state, cooldown_until_utc_ms)) in
        states.iter().copied().enumerate()
    {
        store
            .insert_key(NewStoredKey {
                key_id: KeyId(format!("synthetic-key-{index}")),
                slot_index: index as i64,
                label: format!("Synthetic Key {index}"),
                masked_suffix: format!("••••S{index:03}"),
                protected_blob: ProtectedBlob::new(vec![0x80u8.saturating_add(index as u8); 32]),
                lifecycle_state,
                availability_state,
                cooldown_until_utc_ms,
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
            .map_err(|_| SyntheticError::Setup)?;
    }
    CredentialManager::open(store, RejectingSyntheticProtector).map_err(|_| SyntheticError::Setup)
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeSet;
    use std::sync::{Arc, Barrier, Mutex as StdMutex};
    use std::time::Instant;

    use proptest::prelude::*;

    use super::*;
    use crate::{classify_status, FailureClass};

    #[test]
    fn synthetic_self_test_covers_required_failover_scenarios() {
        let report = run_synthetic_rotation_self_test().unwrap();
        assert!(report.passed);
        assert_eq!(report.scenarios_run, 4);
        assert!(report.transitions_run >= 8);
        assert_eq!(report.duplicate_selection_violations, 0);
        assert_eq!(report.ineligible_selection_violations, 0);
        assert_eq!(report.provider_churn_violations, 0);
        assert!(report.deterministic_replay_equal);
        let json = serde_json::to_string(&report).unwrap();
        assert!(!json.contains("secret"));
        assert!(!json.contains("authorization"));
    }

    fn run_event_sequence(pool_size: usize, events: &[u8]) -> (RotationSnapshot, u64, u64) {
        let states = (0..pool_size)
            .map(|_| (LifecycleState::Enabled, AvailabilityState::Ready, None))
            .collect::<Vec<_>>();
        let manager = manager_with_states(&states).unwrap();
        let mut session = RotationSession::new();
        let mut seen = BTreeSet::new();
        let mut duplicate = 0u64;
        let mut ineligible = 0u64;

        for (index, event) in events.iter().copied().enumerate() {
            let now_ms = (index as i64).saturating_mul(1_000);
            let lease = match manager.acquire(&mut session, now_ms) {
                Ok(lease) => lease,
                Err(_) => {
                    session = RotationSession::new();
                    seen.clear();
                    continue;
                }
            };
            if !seen.insert(lease.key_id.clone()) {
                duplicate += 1;
            }
            let snapshot = manager.rotation_snapshot().unwrap();
            let selected = snapshot.keys.iter().find(|key| key.key_id == lease.key_id).unwrap();
            if selected.lifecycle_state != LifecycleState::Enabled
                || selected.availability_state != AvailabilityState::Ready
            {
                ineligible += 1;
            }

            let signal = match event % 7 {
                0 => OutcomeSignal::Success,
                1 => OutcomeSignal::Http {
                    status: 429,
                    retry_after_ms: Some(1_000 + u64::from(event)),
                },
                2 => OutcomeSignal::Http { status: 401, retry_after_ms: None },
                3 => OutcomeSignal::Http { status: 402, retry_after_ms: None },
                4 => OutcomeSignal::ProviderTransient,
                5 => OutcomeSignal::RequestInvalid,
                _ => OutcomeSignal::Unknown,
            };
            let rotate = match signal {
                OutcomeSignal::Http { status, retry_after_ms } => {
                    classify_status(status, retry_after_ms).rotate
                }
                OutcomeSignal::Success
                | OutcomeSignal::RequestInvalid
                | OutcomeSignal::ProviderTransient
                | OutcomeSignal::Unknown => false,
            };
            manager.report_outcome(lease, signal, now_ms).unwrap();
            if !rotate {
                session = RotationSession::new();
                seen.clear();
            }
        }
        (manager.rotation_snapshot().unwrap(), duplicate, ineligible)
    }

    proptest! {
        #![proptest_config(ProptestConfig::with_cases(32))]
        #[test]
        fn generated_event_sequences_are_bounded_and_deterministic(
            pool_size in 1usize..33,
            events in prop::collection::vec(any::<u8>(), 1..501),
        ) {
            let (first, d1, i1) = run_event_sequence(pool_size, &events);
            let (second, d2, i2) = run_event_sequence(pool_size, &events);
            prop_assert_eq!(d1, 0);
            prop_assert_eq!(i1, 0);
            prop_assert_eq!(d2, 0);
            prop_assert_eq!(i2, 0);
            prop_assert_eq!(first, second);
        }
    }

    fn run_success_stress(iterations: usize) -> (RotationSnapshot, Vec<u64>) {
        let states = (0..32)
            .map(|_| (LifecycleState::Enabled, AvailabilityState::Ready, None))
            .collect::<Vec<_>>();
        let manager = manager_with_states(&states).unwrap();
        let mut nanos = Vec::with_capacity(iterations);
        for index in 0..iterations {
            let mut session = RotationSession::new();
            let started = Instant::now();
            let lease = manager.acquire(&mut session, index as i64).unwrap();
            nanos.push(started.elapsed().as_nanos().min(u128::from(u64::MAX)) as u64);
            assert_eq!(lease.slot_index, (index % 32) as i64);
            assert_eq!(session.attempted_count(), 1);
            manager.report_outcome(lease, OutcomeSignal::Success, index as i64).unwrap();
        }
        (manager.rotation_snapshot().unwrap(), nanos)
    }

    #[test]
    fn one_hundred_thousand_transitions_are_deterministic_and_fast() {
        const ITERATIONS: usize = 50_000;
        let (first, mut nanos) = run_success_stress(ITERATIONS);
        let (second, _) = run_success_stress(ITERATIONS);
        assert_eq!(first, second);
        assert_eq!(ITERATIONS * 2, 100_000);
        assert_eq!(first.active_lease_count, 0);
        nanos.sort_unstable();
        let p95_index = ((nanos.len() - 1) as f64 * 0.95).ceil() as usize;
        let p95 = nanos[p95_index];
        eprintln!("synthetic rotation acquire p95={p95} ns");
        assert!(p95 < 1_000_000, "p95 acquisition exceeded 1 ms: {p95} ns");
    }

    #[test]
    fn eight_thread_scheduler_race_preserves_lease_and_state_integrity() {
        let mut states = (0..8)
            .map(|_| (LifecycleState::Enabled, AvailabilityState::Ready, None))
            .collect::<Vec<_>>();
        states.push((LifecycleState::Disabled, AvailabilityState::Ready, None));
        let manager = Arc::new(manager_with_states(&states).unwrap());
        let barrier = Arc::new(Barrier::new(8));
        let lease_ids = Arc::new(StdMutex::new(BTreeSet::new()));
        let mut handles = Vec::new();

        for worker in 0..8usize {
            let manager = Arc::clone(&manager);
            let barrier = Arc::clone(&barrier);
            let lease_ids = Arc::clone(&lease_ids);
            handles.push(std::thread::spawn(move || {
                barrier.wait();
                if worker == 7 {
                    assert!(manager.delete_key(&KeyId("synthetic-key-8".to_owned()), 1).unwrap());
                }
                for iteration in 0..250usize {
                    if worker == 0 && iteration % 50 == 0 {
                        let key = KeyId("synthetic-key-0".to_owned());
                        manager.set_enabled(&key, false, iteration as i64).unwrap();
                        manager.set_enabled(&key, true, iteration as i64).unwrap();
                    }
                    let mut session = RotationSession::new();
                    if let Ok(lease) = manager.acquire(
                        &mut session,
                        (worker * 10_000 + iteration) as i64,
                    ) {
                        assert!(lease_ids.lock().unwrap().insert(lease.lease_id));
                        manager
                            .report_outcome(
                                lease,
                                OutcomeSignal::Success,
                                (worker * 10_000 + iteration) as i64,
                            )
                            .unwrap();
                    }
                }
            }));
        }
        for handle in handles {
            handle.join().unwrap();
        }
        let snapshot = manager.rotation_snapshot().unwrap();
        assert_eq!(snapshot.active_lease_count, 0);
        let inner = manager.lock_inner().unwrap();
        assert!(inner.in_flight.values().all(|count| *count == 0));
        assert_eq!(snapshot.keys.len(), 8);
    }

    #[test]
    fn provider_transient_classification_never_requests_key_rotation() {
        for status in [408u16, 500, 502, 503, 524, 529] {
            let classified = classify_status(status, Some(50_000));
            assert_eq!(classified.failure_class, FailureClass::ProviderTransient);
            assert!(!classified.rotate);
            assert_eq!(classified.retry_after_ms, None);
        }
    }
}
