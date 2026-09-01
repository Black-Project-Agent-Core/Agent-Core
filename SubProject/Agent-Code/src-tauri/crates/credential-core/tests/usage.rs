use agent_code_credential_core::{
    analyze_usage, AvailabilityState, KeyId, LifecycleState, NewStoredKey, ProtectedBlob,
    UsageAnalysisError, UsageObservation, VaultStore, EWMA_ALPHA,
    MIN_PREDICTION_WARNING_CONFIDENCE, WARNING_EXHAUSTION_HORIZON_MS, WARNING_QUOTA_RATIO,
};

fn sample(key: &str, at_ms: i64, limit: Option<f64>, remaining: Option<f64>) -> UsageObservation {
    UsageObservation {
        key_id: KeyId(key.to_owned()),
        observed_at_utc_ms: at_ms,
        limit_value: limit,
        limit_remaining: remaining,
        usage_daily: None,
        availability_state: if remaining == Some(0.0) {
            AvailabilityState::Exhausted
        } else {
            AvailabilityState::Ready
        },
    }
}

fn stored_key(key: &str) -> NewStoredKey {
    NewStoredKey {
        key_id: KeyId(key.to_owned()),
        slot_index: 0,
        label: "Usage Key".to_owned(),
        masked_suffix: "••••1234".to_owned(),
        protected_blob: ProtectedBlob::new(vec![1, 2, 3, 4]),
        lifecycle_state: LifecycleState::Enabled,
        availability_state: AvailabilityState::Ready,
        cooldown_until_utc_ms: None,
        consecutive_failures: 0,
        last_success_at_utc_ms: None,
        last_failure_at_utc_ms: None,
        last_failure_class: None,
        last_probe_at_utc_ms: None,
        limit_value: Some(100.0),
        limit_remaining: Some(100.0),
        limit_reset: None,
        usage_daily: None,
        is_free_tier: Some(false),
        expires_at_utc_ms: None,
        created_at_utc_ms: 0,
        updated_at_utc_ms: 0,
    }
}

#[test]
fn one_sample_keeps_exhaustion_prediction_unknown_but_scores_known_quota() {
    let analysis = analyze_usage(&[sample("key-1", 1_000, Some(100.0), Some(80.0))]).unwrap();

    assert_eq!(analysis.ewma_burn_rate_per_ms, None);
    assert_eq!(analysis.time_to_exhaustion_ms, None);
    assert_eq!(analysis.quota_ratio, Some(0.8));
    assert_eq!(analysis.quota_score, 80.0);
    assert_eq!(analysis.confidence_score, 25.0);
    assert!(!analysis.warning);
}

#[test]
fn deterministic_ewma_and_time_to_exhaustion_use_named_policy_constants() {
    assert_eq!(EWMA_ALPHA, 0.5);
    assert_eq!(WARNING_QUOTA_RATIO, 0.15);
    assert_eq!(WARNING_EXHAUSTION_HORIZON_MS, 6 * 60 * 60 * 1_000);
    assert_eq!(MIN_PREDICTION_WARNING_CONFIDENCE, 75.0);

    let observations = [
        sample("key-1", 0, Some(100.0), Some(100.0)),
        sample("key-1", 10_000, Some(100.0), Some(90.0)),
        sample("key-1", 20_000, Some(100.0), Some(70.0)),
    ];
    let analysis = analyze_usage(&observations).unwrap();

    // interval rates: 0.001 then 0.002 units/ms; alpha 0.5 => 0.0015 units/ms
    assert_eq!(analysis.ewma_burn_rate_per_ms, Some(0.0015));
    assert_eq!(analysis.time_to_exhaustion_ms, Some(46_667));
    assert_eq!(analysis.confidence_score, 75.0);
    assert!(analysis.warning);
}

#[test]
fn one_burn_interval_is_not_enough_confidence_for_prediction_only_warning() {
    let observations = [
        sample("key-1", 600, Some(100.0), Some(80.0)),
        sample("key-1", 800, Some(100.0), Some(75.0)),
    ];
    let analysis = analyze_usage(&observations).unwrap();

    assert_eq!(analysis.confidence_score, 50.0);
    assert!(analysis.time_to_exhaustion_ms.is_some());
    assert!(!analysis.warning);
}

#[test]
fn low_quota_warns_even_when_consumption_rate_is_not_yet_known() {
    let analysis = analyze_usage(&[sample("key-1", 1_000, Some(100.0), Some(15.0))]).unwrap();
    assert_eq!(analysis.time_to_exhaustion_ms, None);
    assert!(analysis.warning);
}

#[test]
fn provider_quota_reset_discards_stale_burn_rate_until_new_evidence_arrives() {
    let observations = [
        sample("key-1", 0, Some(100.0), Some(50.0)),
        sample("key-1", 10_000, Some(100.0), Some(40.0)),
        sample("key-1", 20_000, Some(100.0), Some(100.0)),
    ];
    let analysis = analyze_usage(&observations).unwrap();

    assert_eq!(analysis.ewma_burn_rate_per_ms, None);
    assert_eq!(analysis.time_to_exhaustion_ms, None);
    assert_eq!(analysis.quota_ratio, Some(1.0));
    assert_eq!(analysis.confidence_score, 25.0);
    assert!(!analysis.warning);
}

#[test]
fn limit_without_remaining_has_zero_prediction_confidence() {
    let analysis = analyze_usage(&[sample("key-1", 1_000, Some(100.0), None)]).unwrap();

    assert_eq!(analysis.quota_ratio, None);
    assert_eq!(analysis.ewma_burn_rate_per_ms, None);
    assert_eq!(analysis.time_to_exhaustion_ms, None);
    assert_eq!(analysis.quota_score, 50.0);
    assert_eq!(analysis.confidence_score, 0.0);
    assert!(!analysis.warning);
}

#[test]
fn unknown_or_unlimited_quota_stays_unknown_instead_of_inventing_prediction() {
    let observations = [
        sample("key-1", 0, None, None),
        sample("key-1", 10_000, None, None),
    ];
    let analysis = analyze_usage(&observations).unwrap();

    assert_eq!(analysis.quota_ratio, None);
    assert_eq!(analysis.ewma_burn_rate_per_ms, None);
    assert_eq!(analysis.time_to_exhaustion_ms, None);
    assert_eq!(analysis.quota_score, 50.0);
    assert_eq!(analysis.confidence_score, 0.0);
    assert!(!analysis.warning);
}

#[test]
fn no_usage_samples_is_explicitly_unknown() {
    assert!(matches!(
        analyze_usage(&[]),
        Err(UsageAnalysisError::NoObservations)
    ));
}

#[test]
fn provider_limit_change_resets_old_burn_evidence() {
    let observations = [
        sample("key-1", 0, Some(100.0), Some(50.0)),
        sample("key-1", 10_000, Some(100.0), Some(40.0)),
        sample("key-1", 20_000, Some(200.0), Some(80.0)),
    ];
    let analysis = analyze_usage(&observations).unwrap();

    assert_eq!(analysis.ewma_burn_rate_per_ms, None);
    assert_eq!(analysis.time_to_exhaustion_ms, None);
    assert_eq!(analysis.quota_ratio, Some(0.4));
    assert_eq!(analysis.confidence_score, 25.0);
    assert!(!analysis.warning);
}

#[test]
fn extreme_burn_spike_stays_finite_and_deterministic() {
    let observations = [
        sample("key-1", 0, Some(1_000_000.0), Some(1_000_000.0)),
        sample("key-1", 1, Some(1_000_000.0), Some(1.0)),
    ];
    let analysis = analyze_usage(&observations).unwrap();

    assert_eq!(analysis.ewma_burn_rate_per_ms, Some(999_999.0));
    assert_eq!(analysis.time_to_exhaustion_ms, Some(1));
    assert!(analysis.warning);
    assert!(analysis.quota_score.is_finite());
    assert!(analysis.confidence_score.is_finite());
}

#[test]
fn twenty_key_mixed_quota_pool_isolatedly_classifies_each_key() {
    let mut warning_count = 0usize;
    for index in 0..20 {
        let remaining = index as f64 * 5.0;
        let analysis = analyze_usage(&[sample(
            &format!("key-{index}"),
            1_000,
            Some(100.0),
            Some(remaining),
        )])
        .unwrap();
        assert_eq!(analysis.key_id, KeyId(format!("key-{index}")));
        assert!((analysis.quota_score - remaining).abs() < 1e-9);
        if analysis.warning {
            warning_count += 1;
        }
    }
    assert_eq!(warning_count, 4);
}

#[test]
fn invalid_or_non_monotonic_observations_are_rejected() {
    let duplicate_time = [
        sample("key-1", 1_000, Some(100.0), Some(80.0)),
        sample("key-1", 1_000, Some(100.0), Some(70.0)),
    ];
    assert!(matches!(
        analyze_usage(&duplicate_time),
        Err(UsageAnalysisError::NonMonotonicTimestamp)
    ));

    let impossible_remaining = [sample("key-1", 1_000, Some(100.0), Some(101.0))];
    assert!(matches!(
        analyze_usage(&impossible_remaining),
        Err(UsageAnalysisError::InvalidObservation("limit_remaining"))
    ));

    let mixed_keys = [
        sample("key-1", 1_000, Some(100.0), Some(80.0)),
        sample("key-2", 2_000, Some(100.0), Some(70.0)),
    ];
    assert!(matches!(
        analyze_usage(&mixed_keys),
        Err(UsageAnalysisError::MixedCredentialIds)
    ));
}

#[test]
fn zero_remaining_is_exhausted_and_warns_without_division_edge_cases() {
    let analysis = analyze_usage(&[
        sample("key-1", 0, Some(10.0), Some(2.0)),
        sample("key-1", 1_000, Some(10.0), Some(0.0)),
    ])
    .unwrap();

    assert_eq!(analysis.quota_ratio, Some(0.0));
    assert_eq!(analysis.quota_score, 0.0);
    assert_eq!(analysis.time_to_exhaustion_ms, Some(0));
    assert!(analysis.warning);
}

#[test]
fn usage_observations_are_bounded_to_64_per_key_and_survive_restart() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("vault.db");
    let key_id = KeyId("key-1".to_owned());

    {
        let mut store = VaultStore::open(&path).unwrap();
        store.insert_key(stored_key("key-1")).unwrap();
        for index in 0..70i64 {
            store
                .append_usage_observation(&sample(
                    "key-1",
                    1_000 + index,
                    Some(100.0),
                    Some(100.0 - index as f64),
                ))
                .unwrap();
        }

        let observations = store.list_usage_observations(&key_id).unwrap();
        assert_eq!(observations.len(), 64);
        assert_eq!(observations.first().unwrap().observed_at_utc_ms, 1_006);
        assert_eq!(observations.last().unwrap().observed_at_utc_ms, 1_069);
    }

    let store = VaultStore::open(&path).unwrap();
    let observations = store.list_usage_observations(&key_id).unwrap();
    assert_eq!(observations.len(), 64);
    assert_eq!(observations.first().unwrap().observed_at_utc_ms, 1_006);
    assert_eq!(observations.last().unwrap().observed_at_utc_ms, 1_069);
}

#[test]
fn deleting_a_key_cascades_its_usage_observations() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("vault.db");
    let key_id = KeyId("key-1".to_owned());
    let mut store = VaultStore::open(&path).unwrap();
    store.insert_key(stored_key("key-1")).unwrap();
    store
        .append_usage_observation(&sample("key-1", 1_000, Some(100.0), Some(90.0)))
        .unwrap();
    assert_eq!(store.list_usage_observations(&key_id).unwrap().len(), 1);

    assert!(store.delete_key(&key_id).unwrap());
    assert!(store.list_usage_observations(&key_id).unwrap().is_empty());
}
