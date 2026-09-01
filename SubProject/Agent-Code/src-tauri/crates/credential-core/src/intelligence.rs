use std::cmp::Ordering;

use serde::Serialize;
use thiserror::Error;

use crate::{CredentialProfile, CredentialProvider, KeyId};

const HEALTH_WEIGHT: f64 = 0.35;
const RELIABILITY_WEIGHT: f64 = 0.25;
const QUOTA_WEIGHT: f64 = 0.20;
const LATENCY_WEIGHT: f64 = 0.10;
const RECENT_SUCCESS_WEIGHT: f64 = 0.10;

#[derive(Debug, Clone)]
pub struct CredentialScoreInput {
    pub slot_index: i64,
    pub profile: CredentialProfile,
    pub recent_success_score: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct CredentialScoreExplanation {
    pub key_id: KeyId,
    pub slot_index: i64,
    pub provider: CredentialProvider,
    pub total_score: f64,
    pub health_contribution: f64,
    pub reliability_contribution: f64,
    pub quota_contribution: f64,
    pub latency_contribution: f64,
    pub recent_success_contribution: f64,
    pub profile_confidence_score: f64,
    pub last_observed_at_utc_ms: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct CredentialSelectionDecision {
    pub selected: CredentialScoreExplanation,
    pub ranked: Vec<CredentialScoreExplanation>,
    pub deterministic_tie_break_applied: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Error)]
pub enum ScoringError {
    #[error("credential scoring requires at least one candidate")]
    NoCandidates,
    #[error("credential scoring received an invalid score: {0}")]
    InvalidScore(&'static str),
}

pub fn derive_recent_success_score(
    last_success_at_utc_ms: Option<i64>,
    last_failure_at_utc_ms: Option<i64>,
) -> f64 {
    match (last_success_at_utc_ms, last_failure_at_utc_ms) {
        (None, None) => 50.0,
        (Some(_), None) => 100.0,
        (None, Some(_)) => 0.0,
        (Some(success), Some(failure)) if success >= failure => 100.0,
        (Some(_), Some(_)) => 0.0,
    }
}

pub fn score_credential(input: &CredentialScoreInput) -> Result<CredentialScoreExplanation, ScoringError> {
    validate_score("health_score", input.profile.health_score)?;
    validate_score("reliability_score", input.profile.reliability_score)?;
    validate_score("latency_score", input.profile.latency_score)?;
    validate_score("quota_score", input.profile.quota_score)?;
    validate_score("confidence_score", input.profile.confidence_score)?;
    validate_score("recent_success_score", input.recent_success_score)?;

    let health_contribution = input.profile.health_score * HEALTH_WEIGHT;
    let reliability_contribution = input.profile.reliability_score * RELIABILITY_WEIGHT;
    let quota_contribution = input.profile.quota_score * QUOTA_WEIGHT;
    let latency_contribution = input.profile.latency_score * LATENCY_WEIGHT;
    let recent_success_contribution = input.recent_success_score * RECENT_SUCCESS_WEIGHT;
    let total_score = health_contribution
        + reliability_contribution
        + quota_contribution
        + latency_contribution
        + recent_success_contribution;

    Ok(CredentialScoreExplanation {
        key_id: input.profile.key_id.clone(),
        slot_index: input.slot_index,
        provider: input.profile.provider,
        total_score,
        health_contribution,
        reliability_contribution,
        quota_contribution,
        latency_contribution,
        recent_success_contribution,
        profile_confidence_score: input.profile.confidence_score,
        last_observed_at_utc_ms: input.profile.last_observed_at_utc_ms,
    })
}

pub fn select_best_credential(
    inputs: &[CredentialScoreInput],
) -> Result<CredentialSelectionDecision, ScoringError> {
    if inputs.is_empty() {
        return Err(ScoringError::NoCandidates);
    }

    let mut ranked = inputs
        .iter()
        .map(score_credential)
        .collect::<Result<Vec<_>, _>>()?;
    ranked.sort_by(|left, right| {
        right
            .total_score
            .partial_cmp(&left.total_score)
            .unwrap_or(Ordering::Equal)
            .then_with(|| left.slot_index.cmp(&right.slot_index))
            .then_with(|| left.key_id.0.cmp(&right.key_id.0))
    });

    let deterministic_tie_break_applied = ranked
        .get(1)
        .map(|runner_up| ranked[0].total_score == runner_up.total_score)
        .unwrap_or(false);

    Ok(CredentialSelectionDecision {
        selected: ranked[0].clone(),
        ranked,
        deterministic_tie_break_applied,
    })
}

fn validate_score(name: &'static str, score: f64) -> Result<(), ScoringError> {
    if score.is_finite() && (0.0..=100.0).contains(&score) {
        Ok(())
    } else {
        Err(ScoringError::InvalidScore(name))
    }
}
