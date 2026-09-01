use std::collections::BTreeSet;
use std::path::{Path, PathBuf};
use std::time::Instant;

use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::rotation::{select_candidate, RotationCandidate};
use crate::{
    AvailabilityState, CredentialManager, KeyId, LifecycleState, OutcomeSignal, ProtectError,
    ProtectedBlob, RotationSession, SecretBytes, SecretProtector, VaultStore,
};

const STRESS_TRANSITIONS: u64 = 100_000;
const STRESS_POOL_SIZE: usize = 32;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SyntheticRotationReport {
    pub passed: bool,
    pub scenarios_run: u32,
    pub transitions_run: u64,
    pub duplicate_selection_violations: u64,
    pub ineligible_selection_violations: u64,
    pub provider_churn_violations: u64,
    pub deterministic_replay_equal: bool,
    pub selection_p50_ns: u64,
    pub selection_p95_ns: u64,
}

#[derive(Clone, Copy)]
struct SyntheticProtector(u8);

impl SecretProtector for SyntheticProtector {
    fn protect(&self, secret: &SecretBytes) -> Result<ProtectedBlob, ProtectError> {
        let is_synthetic = secret.expose_bytes(|bytes| bytes.starts_with(b"sk-or-v1-SYNTHETIC_"));
        if !is_synthetic {
            return Err(ProtectError::ProtectFailed);
        }
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

#[derive(Default)]
struct ScenarioMetrics {
    scenarios_run: u32,
    transitions_run: u64,
    duplicate_selection_violations: u64,
    ineligible_selection_violations: u64,
    provider_churn_violations: u64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct StressReplay {
    final_cursor: i64,
    trace_hash: u64,
    duplicate_selection_violations: u64,
    ineligible_selection_violations: u64,
}

pub fn run_synthetic_rotation_self_test() -> SyntheticRotationReport {
    let mut metrics = ScenarioMetrics::default();
    let scenarios_passed = run_scripted_scenarios(&mut metrics).is_ok();
    let (stress_a, mut latencies) = run_in_memory_stress(STRESS_TRANSITIONS, true);
    let (stress_b, _) = run_in_memory_stress(STRESS_TRANSITIONS, false);
    latencies.sort_unstable();

    let selection_p50_ns = percentile_ns(&latencies, 50);
    let selection_p95_ns = percentile_ns(&latencies, 95);
    metrics.transitions_run = metrics.transitions_run.saturating_add(STRESS_TRANSITIONS);
    metrics.duplicate_selection_violations = metrics
        .duplicate_selection_violations
        .saturating_add(stress_a.duplicate_selection_violations);
    metrics.ineligible_selection_violations = metrics
        .ineligible_selection_violations
        .saturating_add(stress_a.ineligible_selection_violations);
    let deterministic_replay_equal = stress_a == stress_b;

    let passed = scenarios_passed
        && metrics.scenarios_run == 4
        && metrics.transitions_run >= STRESS_TRANSITIONS
        && metrics.duplicate_selection_violations == 0
        && metrics.ineligible_selection_violations == 0
        && metrics.provider_churn_violations == 0
        && deterministic_replay_equal;

    SyntheticRotationReport {
        passed,
        scenarios_run: metrics.scenarios_run,
        transitions_run: metrics.transitions_run,
        duplicate_selection_violations: metrics.duplicate_selection_violations,
        ineligible_selection_violations: metrics.ineligible_selection_violations,
        provider_churn_violations: metrics.provider_churn_violations,
        deterministic_replay_equal,
        selection_p50_ns,
        selection_p95_ns,
    }
}

fn run_scripted_scenarios(metrics: &mut ScenarioMetrics) -> Result<(), ()> {
    scenario_rate_limit_failover(metrics)?;
    scenario_key_scoped_failures(metrics)?;
    scenario_provider_transient(metrics)?;
    scenario_all_unavailable(metrics)?;
    Ok(())
}

fn scenario_rate_limit_failover(metrics: &mut ScenarioMetrics) -> Result<(), ()> {
    let (path, manager, ids) = build_ready_manager(2, "scenario-a")?;
    let mut session = RotationSession::new();
    let first = manager.acquire(&mut session, 1_000).map_err(|_| ())?;
    if first.key_id != ids[0] {
        metrics.ineligible_selection_violations += 1;
    }
    manager
        .report_outcome(
            first,
            OutcomeSignal::Http {
                status: 429,
                retry_after_ms: Some(30_000),
            },
            1_010,
        )
        .map_err(|_| ())?;
    let second = manager.acquire(&mut session, 1_020).map_err(|_| ())?;
    if second.key_id != ids[1] {
        metrics.duplicate_selection_violations += 1;
    }
    manager
        .report_outcome(second, OutcomeSignal::Success, 1_030)
        .map_err(|_| ())?;
    let snapshot = manager.rotation_snapshot().map_err(|_| ())?;
    let first_state = snapshot.keys.iter().find(|key| key.key_id == ids[0]).ok_or(())?;
    let second_state = snapshot.keys.iter().find(|key| key.key_id == ids[1]).ok_or(())?;
    if first_state.availability_state != AvailabilityState::Cooldown
        || first_state.cooldown_until_utc_ms != Some(31_010)
        || second_state.availability_state != AvailabilityState::Ready
    {
        metrics.ineligible_selection_violations += 1;
    }
    metrics.scenarios_run += 1;
    metrics.transitions_run += 4;
    drop(manager);
    cleanup_vault(&path);
    Ok(())
}

fn scenario_key_scoped_failures(metrics: &mut ScenarioMetrics) -> Result<(), ()> {
    let (path, manager, ids) = build_ready_manager(3, "scenario-b")?;
    let mut session = RotationSession::new();
    let first = manager.acquire(&mut session, 2_000).map_err(|_| ())?;
    manager
        .report_outcome(
            first,
            OutcomeSignal::Http {
                status: 401,
                retry_after_ms: None,
            },
            2_010,
        )
        .map_err(|_| ())?;
    let second = manager.acquire(&mut session, 2_020).map_err(|_| ())?;
    manager
        .report_outcome(
            second,
            OutcomeSignal::Http {
                status: 402,
                retry_after_ms: None,
            },
            2_030,
        )
        .map_err(|_| ())?;
    let third = manager.acquire(&mut session, 2_040).map_err(|_| ())?;
    manager
        .report_outcome(third, OutcomeSignal::Success, 2_050)
        .map_err(|_| ())?;
    let snapshot = manager.rotation_snapshot().map_err(|_| ())?;
    let a = snapshot.keys.iter().find(|key| key.key_id == ids[0]).ok_or(())?;
    let b = snapshot.keys.iter().find(|key| key.key_id == ids[1]).ok_or(())?;
    let c = snapshot.keys.iter().find(|key| key.key_id == ids[2]).ok_or(())?;
    if a.lifecycle_state != LifecycleState::Invalid
        || b.availability_state != AvailabilityState::Exhausted
        || c.availability_state != AvailabilityState::Ready
    {
        metrics.ineligible_selection_violations += 1;
    }
    metrics.scenarios_run += 1;
    metrics.transitions_run += 6;
    drop(manager);
    cleanup_vault(&path);
    Ok(())
}

fn scenario_provider_transient(metrics: &mut ScenarioMetrics) -> Result<(), ()> {
    let (path, manager, ids) = build_ready_manager(2, "scenario-c")?;
    let before = manager.rotation_snapshot().map_err(|_| ())?;
    let mut session = RotationSession::new();
    let first = manager.acquire(&mut session, 3_000).map_err(|_| ())?;
    if first.key_id != ids[0] {
        metrics.ineligible_selection_violations += 1;
    }
    let after = manager
        .report_outcome(first, OutcomeSignal::ProviderTransient, 3_010)
        .map_err(|_| ())?;
    for (left, right) in before.keys.iter().zip(after.keys.iter()) {
        if left.lifecycle_state != right.lifecycle_state
            || left.availability_state != right.availability_state
        {
            metrics.provider_churn_violations += 1;
        }
    }
    if after.active_lease_count != 0 {
        metrics.provider_churn_violations += 1;
    }
    metrics.scenarios_run += 1;
    metrics.transitions_run += 2;
    drop(manager);
    cleanup_vault(&path);
    Ok(())
}

fn scenario_all_unavailable(metrics: &mut ScenarioMetrics) -> Result<(), ()> {
    let (path, manager, ids) = build_ready_manager(3, "scenario-d")?;
    for (index, key_id) in ids.iter().enumerate() {
        set_runtime_state(
            &manager,
            key_id,
            LifecycleState::Disabled,
            AvailabilityState::Ready,
            None,
            4_000 + index as i64,
        )?;
    }
    let mut session = RotationSession::new();
    let unavailable = manager.acquire(&mut session, 4_100).expect_err("all-disabled pool must be unavailable");
    if unavailable.scanned_candidates() > ids.len() {
        metrics.ineligible_selection_violations += 1;
    }
    metrics.scenarios_run += 1;
    metrics.transitions_run += 1;
    drop(manager);
    cleanup_vault(&path);
    Ok(())
}

fn build_ready_manager(
    count: usize,
    label: &str,
) -> Result<(PathBuf, CredentialManager<SyntheticProtector>, Vec<KeyId>), ()> {
    let path = std::env::temp_dir().join(format!(
        "agent-code-vault-{label}-{}.db",
        Uuid::new_v4()
    ));
    let manager = CredentialManager::open(VaultStore::open(&path).map_err(|_| ())?, SyntheticProtector(0xa7))
        .map_err(|_| ())?;
    let mut ids = Vec::with_capacity(count);
    for index in 0..count {
        let summary = manager
            .add_openrouter_key(
                SecretBytes::parse_import(format!(
                    "sk-or-v1-SYNTHETIC_{label}_{index:02}_1234567890"
                ))
                .map_err(|_| ())?,
                format!("Synthetic {label} {index}"),
                100 + index as i64,
            )
            .map_err(|_| ())?;
        set_runtime_state(
            &manager,
            &summary.key_id,
            LifecycleState::Enabled,
            AvailabilityState::Ready,
            None,
            200 + index as i64,
        )?;
        ids.push(summary.key_id);
    }
    Ok((path, manager, ids))
}

fn set_runtime_state(
    manager: &CredentialManager<SyntheticProtector>,
    key_id: &KeyId,
    lifecycle_state: LifecycleState,
    availability_state: AvailabilityState,
    cooldown_until_utc_ms: Option<i64>,
    now_ms: i64,
) -> Result<(), ()> {
    let mut inner = manager.lock_inner().map_err(|_| ())?;
    let mut record = inner.keys.get(key_id).cloned().ok_or(())?;
    record.lifecycle_state = lifecycle_state;
    record.availability_state = availability_state;
    record.cooldown_until_utc_ms = cooldown_until_utc_ms;
    record.updated_at_utc_ms = now_ms;
    let update = record.state_update();
    inner
        .store
        .update_key_state(key_id, &update)
        .map_err(|_| ())?;
    inner.keys.insert(key_id.clone(), record);
    Ok(())
}

fn cleanup_vault(path: &Path) {
    for candidate in [
        path.to_path_buf(),
        PathBuf::from(format!("{}-wal", path.display())),
        PathBuf::from(format!("{}-shm", path.display())),
    ] {
        let _ = std::fs::remove_file(candidate);
    }
}

fn run_in_memory_stress(
    transitions: u64,
    measure_latency: bool,
) -> (StressReplay, Vec<u64>) {
    let candidates = (0..STRESS_POOL_SIZE)
        .map(|slot| RotationCandidate {
            key_id: KeyId(format!("stress-key-{slot:02}")),
            slot_index: slot as i64,
            lifecycle_state: LifecycleState::Enabled,
            availability_state: AvailabilityState::Ready,
            cooldown_until_utc_ms: None,
        })
        .collect::<Vec<_>>();
    let mut cursor_slot = -1i64;
    let mut attempted = BTreeSet::new();
    let mut trace_hash = 0xcbf29ce484222325u64;
    let mut duplicate_selection_violations = 0u64;
    let mut ineligible_selection_violations = 0u64;
    let mut latencies = if measure_latency {
        Vec::with_capacity(transitions as usize)
    } else {
        Vec::new()
    };

    for transition in 0..transitions {
        if transition % 4 == 0 {
            attempted.clear();
        }
        let started = Instant::now();
        let decision = select_candidate(&candidates, cursor_slot, &attempted, transition as i64)
            .expect("fixed stress pool must always contain an eligible key");
        if measure_latency {
            latencies.push(started.elapsed().as_nanos().min(u128::from(u64::MAX)) as u64);
        }
        if !attempted.insert(decision.key_id.clone()) {
            duplicate_selection_violations += 1;
        }
        let selected = &candidates[decision.slot_index as usize];
        if selected.lifecycle_state != LifecycleState::Enabled
            || selected.availability_state != AvailabilityState::Ready
        {
            ineligible_selection_violations += 1;
        }
        cursor_slot = decision.slot_index;
        trace_hash ^= decision.slot_index as u64;
        trace_hash = trace_hash.wrapping_mul(0x100000001b3);
    }

    (
        StressReplay {
            final_cursor: cursor_slot,
            trace_hash,
            duplicate_selection_violations,
            ineligible_selection_violations,
        },
        latencies,
    )
}

fn percentile_ns(samples: &[u64], percentile: usize) -> u64 {
    if samples.is_empty() {
        return 0;
    }
    let index = ((samples.len() - 1) * percentile) / 100;
    samples[index]
}

#[cfg(test)]
mod tests {
    use super::*;
    use proptest::prelude::*;
    use std::collections::BTreeSet;
    use std::sync::{Arc, Mutex};

    #[test]
    fn scripted_scenarios_and_fixed_stress_certify_rotation_invariants() {
        let report = run_synthetic_rotation_self_test();
        eprintln!(
            "synthetic rotation: transitions={} p50={}ns p95={}ns",
            report.transitions_run, report.selection_p50_ns, report.selection_p95_ns
        );
        assert!(report.passed);
        assert_eq!(report.scenarios_run, 4);
        assert!(report.transitions_run >= 100_000);
        assert_eq!(report.duplicate_selection_violations, 0);
        assert_eq!(report.ineligible_selection_violations, 0);
        assert_eq!(report.provider_churn_violations, 0);
        assert!(report.deterministic_replay_equal);
        assert!(report.selection_p95_ns < 1_000_000);
    }

    #[test]
    fn report_serialization_is_metadata_only() {
        let report = run_synthetic_rotation_self_test();
        let serialized = serde_json::to_string(&report).unwrap();
        assert!(!serialized.contains("sk-or-v1-"));
        assert!(!serialized.contains("secret"));
        assert!(!serialized.contains("header"));
    }

    proptest! {
        #![proptest_config(ProptestConfig::with_cases(24))]

        #[test]
        fn selector_state_machine_is_bounded_and_deterministic(
            pool_size in 1usize..33,
            events in proptest::collection::vec(any::<u8>(), 1..501),
        ) {
            let first = generated_replay(pool_size, &events);
            let second = generated_replay(pool_size, &events);
            prop_assert_eq!(&first, &second);
            prop_assert!(first.max_consecutive_failures <= 32);
            prop_assert!(first.max_scanned <= pool_size);
            prop_assert!(first.final_cursor == -1 || (0..pool_size as i64).contains(&first.final_cursor));
            prop_assert_eq!(first.duplicate_selection_violations, 0);
            prop_assert_eq!(first.ineligible_selection_violations, 0);
        }
    }

    #[derive(Debug, Clone, PartialEq, Eq)]
    struct GeneratedReplay {
        final_cursor: i64,
        trace: Vec<i64>,
        max_consecutive_failures: u32,
        max_scanned: usize,
        duplicate_selection_violations: u64,
        ineligible_selection_violations: u64,
    }

    fn generated_replay(pool_size: usize, events: &[u8]) -> GeneratedReplay {
        let mut candidates = (0..pool_size)
            .map(|slot| RotationCandidate {
                key_id: KeyId(format!("property-key-{slot:02}")),
                slot_index: slot as i64,
                lifecycle_state: LifecycleState::Enabled,
                availability_state: AvailabilityState::Ready,
                cooldown_until_utc_ms: None,
            })
            .collect::<Vec<_>>();
        let mut cursor = -1i64;
        let mut attempted = BTreeSet::new();
        let mut trace = Vec::new();
        let mut failures = vec![0u32; pool_size];
        let mut max_consecutive_failures = 0u32;
        let mut max_scanned = 0usize;
        let mut duplicate_selection_violations = 0u64;
        let mut ineligible_selection_violations = 0u64;

        for (step, event) in events.iter().copied().enumerate() {
            let target = event as usize % pool_size;
            let now_ms = step as i64 + 1_000;
            match event % 8 {
                0 => {
                    attempted.clear();
                    candidates[target].lifecycle_state = LifecycleState::Enabled;
                    candidates[target].availability_state = AvailabilityState::Ready;
                    candidates[target].cooldown_until_utc_ms = None;
                }
                1 => candidates[target].lifecycle_state = LifecycleState::Disabled,
                2 => {
                    candidates[target].lifecycle_state = LifecycleState::Enabled;
                    candidates[target].availability_state = AvailabilityState::Unverified;
                }
                3 => {
                    candidates[target].lifecycle_state = LifecycleState::Enabled;
                    candidates[target].availability_state = AvailabilityState::Cooldown;
                    candidates[target].cooldown_until_utc_ms = Some(now_ms + 25);
                }
                4 => {
                    candidates[target].lifecycle_state = LifecycleState::Enabled;
                    candidates[target].availability_state = AvailabilityState::Cooldown;
                    candidates[target].cooldown_until_utc_ms = Some(now_ms.saturating_sub(1));
                }
                5 => {
                    failures[target] = failures[target].saturating_add(1).min(32);
                    max_consecutive_failures = max_consecutive_failures.max(failures[target]);
                }
                6 => failures[target] = 0,
                _ => {}
            }

            match select_candidate(&candidates, cursor, &attempted, now_ms) {
                Ok(decision) => {
                    max_scanned = max_scanned.max(decision.scanned_candidates);
                    let candidate = candidates
                        .iter_mut()
                        .find(|candidate| candidate.key_id == decision.key_id)
                        .expect("selected candidate must exist");
                    let was_eligible = candidate.lifecycle_state == LifecycleState::Enabled
                        && (candidate.availability_state == AvailabilityState::Ready
                            || (candidate.availability_state == AvailabilityState::Cooldown
                                && candidate
                                    .cooldown_until_utc_ms
                                    .is_some_and(|deadline| deadline <= now_ms)));
                    if !was_eligible {
                        ineligible_selection_violations += 1;
                    }
                    if !attempted.insert(decision.key_id.clone()) {
                        duplicate_selection_violations += 1;
                    }
                    if decision.reconcile_cooldown {
                        candidate.availability_state = AvailabilityState::Ready;
                        candidate.cooldown_until_utc_ms = None;
                    }
                    cursor = decision.slot_index;
                    trace.push(decision.slot_index);
                }
                Err(miss) => {
                    max_scanned = max_scanned.max(miss.scanned_candidates);
                    attempted.clear();
                }
            }
        }

        GeneratedReplay {
            final_cursor: cursor,
            trace,
            max_consecutive_failures,
            max_scanned,
            duplicate_selection_violations,
            ineligible_selection_violations,
        }
    }

    #[test]
    fn eight_threads_preserve_lease_and_persistence_invariants() {
        let path = std::env::temp_dir().join(format!(
            "agent-code-vault-concurrency-{}.db",
            Uuid::new_v4()
        ));
        let manager = CredentialManager::open(VaultStore::open(&path).unwrap(), SyntheticProtector(0x39)).unwrap();
        let mut ids = Vec::new();
        for index in 0..9 {
            let summary = manager
                .add_openrouter_key(
                    SecretBytes::parse_import(format!(
                        "sk-or-v1-SYNTHETIC_CONCURRENCY_{index:02}_1234567890"
                    ))
                    .unwrap(),
                    format!("Concurrent {index}"),
                    100 + index as i64,
                )
                .unwrap();
            set_runtime_state(
                &manager,
                &summary.key_id,
                LifecycleState::Enabled,
                AvailabilityState::Ready,
                None,
                200 + index as i64,
            )
            .unwrap();
            ids.push(summary.key_id);
        }
        let delete_target = ids.pop().unwrap();
        manager.set_enabled(&delete_target, false, 300).unwrap();

        let manager = Arc::new(manager);
        let seen_lease_ids = Arc::new(Mutex::new(BTreeSet::new()));
        let mut handles = Vec::new();
        for worker in 0..8usize {
            let manager = Arc::clone(&manager);
            let seen_lease_ids = Arc::clone(&seen_lease_ids);
            let toggle_key = ids[worker % ids.len()].clone();
            let delete_target = delete_target.clone();
            handles.push(std::thread::spawn(move || {
                if worker == 0 {
                    assert!(manager.delete_key(&delete_target, 400).unwrap());
                }
                for iteration in 0..100usize {
                    let now_ms = 1_000 + (worker * 10_000 + iteration) as i64;
                    if iteration % 29 == 0 {
                        let _ = manager.set_enabled(&toggle_key, false, now_ms);
                    } else if iteration % 29 == 1 {
                        let _ = manager.set_enabled(&toggle_key, true, now_ms);
                    }
                    let mut session = RotationSession::new();
                    if let Ok(lease) = manager.acquire(&mut session, now_ms) {
                        assert!(seen_lease_ids.lock().unwrap().insert(lease.lease_id));
                        let outcome = if iteration % 17 == 0 {
                            OutcomeSignal::Http {
                                status: 429,
                                retry_after_ms: Some(2),
                            }
                        } else {
                            OutcomeSignal::Success
                        };
                        manager.report_outcome(lease, outcome, now_ms + 1).unwrap();
                    }
                    let _ = manager.acquire(&mut RotationSession::new(), now_ms + 3).map(|lease| {
                        assert!(seen_lease_ids.lock().unwrap().insert(lease.lease_id));
                        manager.report_outcome(lease, OutcomeSignal::Success, now_ms + 4).unwrap();
                    });
                }
            }));
        }
        for handle in handles {
            handle.join().unwrap();
        }

        let snapshot = manager.rotation_snapshot().unwrap();
        assert_eq!(snapshot.active_lease_count, 0);
        {
            let inner = manager.lock_inner().unwrap();
            assert!(inner.in_flight.values().all(|count| *count == 0));
        }
        drop(manager);

        let reopened = CredentialManager::open(VaultStore::open(&path).unwrap(), SyntheticProtector(0x39)).unwrap();
        let reopened_snapshot = reopened.rotation_snapshot().unwrap();
        assert_eq!(reopened_snapshot.active_lease_count, 0);
        assert!(!reopened_snapshot.keys.iter().any(|key| key.key_id == delete_target));
        drop(reopened);
        cleanup_vault(&path);
    }
}
