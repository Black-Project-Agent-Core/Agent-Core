use std::collections::HashSet;

use agent_code_credential_core::{
    plan_shadow_health_probes, shadow_health_next_probe_at, AvailabilityState, KeyId, KeySummary,
    LifecycleState, MONITOR_HEALTHY_INTERVAL_MS, MONITOR_INITIAL_DELAY_MS,
    MONITOR_JITTER_WINDOW_MS, MONITOR_MAX_CONCURRENT_PROBES, MONITOR_WARNING_INTERVAL_MS,
};

fn summary(
    slot: i64,
    lifecycle_state: LifecycleState,
    availability_state: AvailabilityState,
    last_probe_at_utc_ms: Option<i64>,
    cooldown_until_utc_ms: Option<i64>,
) -> KeySummary {
    KeySummary {
        key_id: KeyId(format!("monitor-key-{slot:02}")),
        slot_index: slot,
        label: format!("Monitor {slot}"),
        masked_suffix: format!("••••{slot:04}"),
        lifecycle_state,
        availability_state,
        cooldown_until_utc_ms,
        consecutive_failures: 0,
        last_success_at_utc_ms: None,
        last_failure_at_utc_ms: None,
        last_failure_class: None,
        last_probe_at_utc_ms,
        limit_value: None,
        limit_remaining: None,
        limit_reset: None,
        usage_daily: None,
        is_free_tier: None,
        expires_at_utc_ms: None,
    }
}

#[test]
fn twenty_unverified_keys_are_deterministically_staggered_and_cycle_is_bounded_to_two() {
    let started_at = 1_000_000i64;
    let keys = (0..20)
        .map(|slot| {
            summary(
                slot,
                LifecycleState::Enabled,
                AvailabilityState::Unverified,
                None,
                None,
            )
        })
        .collect::<Vec<_>>();

    let due_times = keys
        .iter()
        .map(|key| shadow_health_next_probe_at(key, started_at).unwrap())
        .collect::<Vec<_>>();
    assert_eq!(due_times.iter().copied().collect::<HashSet<_>>().len(), 20);
    assert!(due_times
        .iter()
        .all(|due| *due >= started_at + MONITOR_INITIAL_DELAY_MS));
    assert!(due_times
        .iter()
        .all(|due| *due < started_at + MONITOR_INITIAL_DELAY_MS + MONITOR_JITTER_WINDOW_MS));

    let all_due_at = started_at + MONITOR_INITIAL_DELAY_MS + MONITOR_JITTER_WINDOW_MS;
    let planned = plan_shadow_health_probes(&keys, started_at, all_due_at);
    assert_eq!(MONITOR_MAX_CONCURRENT_PROBES, 2);
    assert_eq!(planned.len(), 2);
    assert_ne!(planned[0].key_id, planned[1].key_id);

    let repeated = plan_shadow_health_probes(&keys, started_at, all_due_at);
    assert_eq!(planned, repeated);
}

#[test]
fn healthy_warning_and_exhausted_intervals_are_state_specific() {
    let started_at = 5_000;
    let last_probe = 10_000;
    let ready = summary(
        1,
        LifecycleState::Enabled,
        AvailabilityState::Ready,
        Some(last_probe),
        None,
    );
    let warning = summary(
        2,
        LifecycleState::Enabled,
        AvailabilityState::Warning,
        Some(last_probe),
        None,
    );
    let exhausted = summary(
        3,
        LifecycleState::Enabled,
        AvailabilityState::Exhausted,
        Some(last_probe),
        None,
    );

    let ready_due = shadow_health_next_probe_at(&ready, started_at).unwrap();
    let warning_due = shadow_health_next_probe_at(&warning, started_at).unwrap();
    let exhausted_due = shadow_health_next_probe_at(&exhausted, started_at).unwrap();

    assert!(ready_due >= last_probe + MONITOR_HEALTHY_INTERVAL_MS);
    assert!(ready_due < last_probe + MONITOR_HEALTHY_INTERVAL_MS + MONITOR_JITTER_WINDOW_MS);
    assert!(warning_due >= last_probe + MONITOR_WARNING_INTERVAL_MS);
    assert!(warning_due < last_probe + MONITOR_WARNING_INTERVAL_MS + MONITOR_JITTER_WINDOW_MS);
    assert!(warning_due < ready_due);
    assert!(exhausted_due >= last_probe + MONITOR_HEALTHY_INTERVAL_MS);
}

#[test]
fn cooldown_is_never_planned_before_local_deadline() {
    let started_at = 1_000;
    let deadline = 50_000;
    let cooldown = summary(
        4,
        LifecycleState::Enabled,
        AvailabilityState::Cooldown,
        Some(2_000),
        Some(deadline),
    );

    let due = shadow_health_next_probe_at(&cooldown, started_at).unwrap();
    assert!(due >= deadline);
    assert!(plan_shadow_health_probes(&[cooldown.clone()], started_at, deadline - 1).is_empty());
    assert_eq!(
        plan_shadow_health_probes(&[cooldown], started_at, due)
            .into_iter()
            .map(|item| item.key_id)
            .collect::<Vec<_>>(),
        vec![KeyId("monitor-key-04".to_owned())]
    );
}

#[test]
fn disabled_invalid_and_quarantined_credentials_never_auto_probe() {
    let started_at = 1_000;
    let candidates = [
        summary(
            1,
            LifecycleState::Disabled,
            AvailabilityState::Ready,
            Some(0),
            None,
        ),
        summary(
            2,
            LifecycleState::Invalid,
            AvailabilityState::Unverified,
            Some(0),
            None,
        ),
        summary(
            3,
            LifecycleState::Quarantined,
            AvailabilityState::Unverified,
            Some(0),
            None,
        ),
    ];

    for candidate in &candidates {
        assert_eq!(shadow_health_next_probe_at(candidate, started_at), None);
    }
    assert!(plan_shadow_health_probes(&candidates, started_at, i64::MAX / 4).is_empty());
}

#[test]
fn unverified_key_after_transient_probe_retries_at_healthy_interval_instead_of_stopping() {
    let started_at = 1_000;
    let last_probe = 20_000;
    let unverified = summary(
        7,
        LifecycleState::Enabled,
        AvailabilityState::Unverified,
        Some(last_probe),
        None,
    );

    let due = shadow_health_next_probe_at(&unverified, started_at)
        .expect("transiently unverified key must remain monitorable");
    assert!(due >= last_probe + MONITOR_HEALTHY_INTERVAL_MS);
    assert!(due < last_probe + MONITOR_HEALTHY_INTERVAL_MS + MONITOR_JITTER_WINDOW_MS);
    assert!(plan_shadow_health_probes(&[unverified.clone()], started_at, due - 1).is_empty());
    assert_eq!(
        plan_shadow_health_probes(&[unverified], started_at, due).len(),
        1
    );
}
