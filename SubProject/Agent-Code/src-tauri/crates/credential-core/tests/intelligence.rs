use agent_code_credential_core::{
    derive_recent_success_score, select_best_credential, score_credential, CredentialProfile,
    CredentialProvider, CredentialScoreInput, KeyId, ScoringError,
};

fn profile(key: &str, health: f64, reliability: f64, latency: f64, quota: f64) -> CredentialProfile {
    CredentialProfile {
        key_id: KeyId(key.to_owned()),
        provider: CredentialProvider::OpenRouter,
        health_score: health,
        reliability_score: reliability,
        latency_score: latency,
        quota_score: quota,
        confidence_score: 90.0,
        last_observed_at_utc_ms: Some(1_000),
        updated_at_utc_ms: 1_000,
    }
}

#[test]
fn scoring_uses_the_locked_weight_formula_and_explains_every_component() {
    let explanation = score_credential(&CredentialScoreInput {
        slot_index: 4,
        profile: profile("key-a", 100.0, 90.0, 80.0, 50.0),
        recent_success_score: 70.0,
    })
    .unwrap();

    assert!((explanation.total_score - 82.5).abs() < 1e-9);
    assert!((explanation.health_contribution - 35.0).abs() < 1e-9);
    assert!((explanation.reliability_contribution - 22.5).abs() < 1e-9);
    assert!((explanation.quota_contribution - 10.0).abs() < 1e-9);
    assert!((explanation.latency_contribution - 8.0).abs() < 1e-9);
    assert!((explanation.recent_success_contribution - 7.0).abs() < 1e-9);
    assert_eq!(explanation.profile_confidence_score, 90.0);
}

#[test]
fn intelligent_selection_is_deterministic_and_reports_tie_breaks() {
    let decision = select_best_credential(&[
        CredentialScoreInput {
            slot_index: 3,
            profile: profile("key-b", 90.0, 90.0, 90.0, 90.0),
            recent_success_score: 90.0,
        },
        CredentialScoreInput {
            slot_index: 1,
            profile: profile("key-a", 90.0, 90.0, 90.0, 90.0),
            recent_success_score: 90.0,
        },
        CredentialScoreInput {
            slot_index: 7,
            profile: profile("key-c", 60.0, 60.0, 60.0, 60.0),
            recent_success_score: 60.0,
        },
    ])
    .unwrap();

    assert_eq!(decision.selected.key_id, KeyId("key-a".to_owned()));
    assert_eq!(decision.selected.slot_index, 1);
    assert!(decision.deterministic_tie_break_applied);
    assert_eq!(decision.ranked.len(), 3);
    assert_eq!(decision.ranked[0].key_id, KeyId("key-a".to_owned()));
    assert_eq!(decision.ranked[1].key_id, KeyId("key-b".to_owned()));
    assert_eq!(decision.ranked[2].key_id, KeyId("key-c".to_owned()));
}

#[test]
fn recent_success_score_is_derived_deterministically_from_outcome_history() {
    assert_eq!(derive_recent_success_score(None, None), 50.0);
    assert_eq!(derive_recent_success_score(Some(1_000), None), 100.0);
    assert_eq!(derive_recent_success_score(None, Some(1_000)), 0.0);
    assert_eq!(derive_recent_success_score(Some(2_000), Some(1_000)), 100.0);
    assert_eq!(derive_recent_success_score(Some(1_000), Some(2_000)), 0.0);
    assert_eq!(derive_recent_success_score(Some(2_000), Some(2_000)), 100.0);
}

#[test]
fn intelligent_selection_rejects_empty_or_invalid_inputs() {
    assert!(matches!(
        select_best_credential(&[]),
        Err(ScoringError::NoCandidates)
    ));

    let invalid = CredentialScoreInput {
        slot_index: 0,
        profile: profile("bad", 101.0, 50.0, 50.0, 50.0),
        recent_success_score: 50.0,
    };
    assert!(matches!(
        score_credential(&invalid),
        Err(ScoringError::InvalidScore("health_score"))
    ));

    let invalid_recent = CredentialScoreInput {
        slot_index: 0,
        profile: profile("bad-recent", 50.0, 50.0, 50.0, 50.0),
        recent_success_score: f64::NAN,
    };
    assert!(matches!(
        score_credential(&invalid_recent),
        Err(ScoringError::InvalidScore("recent_success_score"))
    ));
}
