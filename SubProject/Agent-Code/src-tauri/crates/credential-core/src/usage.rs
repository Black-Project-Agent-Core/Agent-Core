use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::{AvailabilityState, KeyId};

pub const EWMA_ALPHA: f64 = 0.5;
pub const WARNING_QUOTA_RATIO: f64 = 0.15;
pub const WARNING_EXHAUSTION_HORIZON_MS: u64 = 6 * 60 * 60 * 1_000;
pub const MIN_PREDICTION_WARNING_CONFIDENCE: f64 = 75.0;
const NEUTRAL_QUOTA_SCORE: f64 = 50.0;
const SINGLE_SAMPLE_CONFIDENCE: f64 = 25.0;
const INTERVAL_CONFIDENCE_STEP: f64 = 25.0;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct UsageObservation {
    pub key_id: KeyId,
    pub observed_at_utc_ms: i64,
    pub limit_value: Option<f64>,
    pub limit_remaining: Option<f64>,
    pub usage_daily: Option<f64>,
    pub availability_state: AvailabilityState,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct UsageAnalysis {
    pub key_id: KeyId,
    pub observed_at_utc_ms: i64,
    pub quota_ratio: Option<f64>,
    pub ewma_burn_rate_per_ms: Option<f64>,
    pub time_to_exhaustion_ms: Option<u64>,
    pub quota_score: f64,
    pub confidence_score: f64,
    pub warning: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Error)]
pub enum UsageAnalysisError {
    #[error("usage analysis requires at least one observation")]
    NoObservations,
    #[error("usage observations contain more than one credential id")]
    MixedCredentialIds,
    #[error("usage observation timestamps must be strictly increasing")]
    NonMonotonicTimestamp,
    #[error("usage observation contains an invalid field: {0}")]
    InvalidObservation(&'static str),
}

pub fn analyze_usage(
    observations: &[UsageObservation],
) -> Result<UsageAnalysis, UsageAnalysisError> {
    let first = observations
        .first()
        .ok_or(UsageAnalysisError::NoObservations)?;
    let key_id = first.key_id.clone();

    for observation in observations {
        if observation.key_id != key_id {
            return Err(UsageAnalysisError::MixedCredentialIds);
        }
        validate_observation(observation)?;
    }
    for pair in observations.windows(2) {
        if pair[1].observed_at_utc_ms <= pair[0].observed_at_utc_ms {
            return Err(UsageAnalysisError::NonMonotonicTimestamp);
        }
    }

    let current = observations
        .last()
        .expect("non-empty observations checked above");
    let quota_ratio = match (current.limit_value, current.limit_remaining) {
        (Some(limit), Some(remaining)) => Some((remaining / limit).clamp(0.0, 1.0)),
        _ => None,
    };
    let quota_score = quota_ratio
        .map(|ratio| ratio * 100.0)
        .unwrap_or(NEUTRAL_QUOTA_SCORE);

    let mut ewma: Option<f64> = None;
    let mut reliable_intervals = 0usize;
    for pair in observations.windows(2) {
        let previous = &pair[0];
        let next = &pair[1];
        let (Some(previous_remaining), Some(next_remaining)) =
            (previous.limit_remaining, next.limit_remaining)
        else {
            ewma = None;
            reliable_intervals = 0;
            continue;
        };

        let limit_changed = matches!(
            (previous.limit_value, next.limit_value),
            (Some(left), Some(right)) if left != right
        );
        let quota_reset = next_remaining > previous_remaining;
        if limit_changed || quota_reset {
            ewma = None;
            reliable_intervals = 0;
            continue;
        }

        let elapsed_ms = next.observed_at_utc_ms - previous.observed_at_utc_ms;
        let consumed = (previous_remaining - next_remaining).max(0.0);
        let rate = consumed / elapsed_ms as f64;
        ewma = Some(match ewma {
            Some(previous_ewma) => EWMA_ALPHA * rate + (1.0 - EWMA_ALPHA) * previous_ewma,
            None => rate,
        });
        reliable_intervals = reliable_intervals.saturating_add(1);
    }

    let confidence_score = if current.limit_remaining.is_none() {
        0.0
    } else {
        (SINGLE_SAMPLE_CONFIDENCE + INTERVAL_CONFIDENCE_STEP * reliable_intervals as f64).min(100.0)
    };

    let time_to_exhaustion_ms = match (current.limit_remaining, ewma) {
        (Some(remaining), Some(_rate)) if remaining == 0.0 => Some(0),
        (Some(remaining), Some(rate)) if rate > 0.0 => {
            let millis = (remaining / rate).ceil();
            if millis.is_finite() && millis >= 0.0 && millis <= u64::MAX as f64 {
                Some(millis as u64)
            } else {
                None
            }
        }
        _ => None,
    };

    let low_quota_warning = quota_ratio.is_some_and(|ratio| ratio <= WARNING_QUOTA_RATIO);
    let predicted_exhaustion_warning = confidence_score >= MIN_PREDICTION_WARNING_CONFIDENCE
        && time_to_exhaustion_ms.is_some_and(|millis| millis <= WARNING_EXHAUSTION_HORIZON_MS);

    Ok(UsageAnalysis {
        key_id,
        observed_at_utc_ms: current.observed_at_utc_ms,
        quota_ratio,
        ewma_burn_rate_per_ms: ewma,
        time_to_exhaustion_ms,
        quota_score,
        confidence_score,
        warning: low_quota_warning || predicted_exhaustion_warning,
    })
}

fn validate_observation(observation: &UsageObservation) -> Result<(), UsageAnalysisError> {
    if let Some(limit) = observation.limit_value {
        if !limit.is_finite() || limit <= 0.0 {
            return Err(UsageAnalysisError::InvalidObservation("limit_value"));
        }
    }
    if let Some(remaining) = observation.limit_remaining {
        if !remaining.is_finite() || remaining < 0.0 {
            return Err(UsageAnalysisError::InvalidObservation("limit_remaining"));
        }
        if observation
            .limit_value
            .is_some_and(|limit| remaining > limit)
        {
            return Err(UsageAnalysisError::InvalidObservation("limit_remaining"));
        }
    }
    if let Some(usage_daily) = observation.usage_daily {
        if !usage_daily.is_finite() || usage_daily < 0.0 {
            return Err(UsageAnalysisError::InvalidObservation("usage_daily"));
        }
    }
    Ok(())
}
