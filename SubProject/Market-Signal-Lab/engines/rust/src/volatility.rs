use crate::schema_v2::{ClusterVolatilityView, ItemVolatilityView};
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ItemVolatilityInput {
    pub ranks: Vec<Option<i64>>,
    pub top_k: i64,
    pub consecutive_appearances: i64,
    pub eligible_snapshots: i64,
    pub rbo_to_previous: f64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClusterVolatilityInput {
    pub shares: Vec<f64>,
    pub context_disagreement: f64,
    pub cross_time_persistence: f64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VolatilityResult {
    pub score: f64,
    pub label: String,
    #[serde(skip_serializing_if = "is_zero")]
    pub rank_variance: f64,
    #[serde(skip_serializing_if = "is_zero")]
    pub absence_rate: f64,
    #[serde(skip_serializing_if = "is_zero")]
    pub median_absolute_deviation: f64,
    #[serde(skip_serializing_if = "is_zero")]
    pub rbo_persistence: f64,
    #[serde(skip_serializing_if = "is_zero")]
    pub consecutive_persistence: f64,
}

fn is_zero(v: &f64) -> bool {
    *v == 0.0
}

fn clamp(v: f64) -> f64 {
    if !v.is_finite() {
        return 0.0;
    }
    v.clamp(0.0, 100.0)
}

fn variance(xs: &[f64]) -> f64 {
    if xs.is_empty() {
        return 0.0;
    }
    let mean = xs.iter().sum::<f64>() / xs.len() as f64;
    xs.iter()
        .map(|x| {
            let d = *x - mean;
            d * d
        })
        .sum::<f64>()
        / xs.len() as f64
}

fn median(xs: &[f64]) -> f64 {
    if xs.is_empty() {
        return 0.0;
    }
    let mut ys = xs.to_vec();
    ys.sort_by(|a, b| a.total_cmp(b));
    let n = ys.len();
    if n % 2 == 1 {
        ys[n / 2]
    } else {
        (ys[n / 2 - 1] + ys[n / 2]) / 2.0
    }
}

fn median_absolute_deviation(xs: &[f64]) -> f64 {
    let m = median(xs);
    let deviations: Vec<f64> = xs.iter().map(|x| (*x - m).abs()).collect();
    median(&deviations)
}

fn label(score: f64) -> String {
    (if score < 25.0 {
        "stable"
    } else if score < 45.0 {
        "variable"
    } else if score < 65.0 {
        "unstable"
    } else {
        "extreme"
    })
    .to_string()
}

pub fn item_volatility(input: &ItemVolatilityInput) -> VolatilityResult {
    let eligible = if input.eligible_snapshots <= 0 {
        input.ranks.len() as i64
    } else {
        input.eligible_snapshots
    };
    let top_k = if input.top_k <= 0 { 1 } else { input.top_k };
    let mut values = Vec::new();
    let mut missing = 0_i64;
    for rank in &input.ranks {
        match rank {
            Some(value) => values.push(*value as f64),
            None => missing += 1,
        }
    }
    volatility_from_item_parts(
        &values,
        missing,
        top_k,
        input.consecutive_appearances,
        eligible,
        input.rbo_to_previous,
    )
}

pub fn item_volatility_view(input: ItemVolatilityView<'_>) -> VolatilityResult {
    let eligible = if input.eligible_snapshots() <= 0 {
        input.len() as i64
    } else {
        input.eligible_snapshots()
    };
    let top_k = if input.top_k() <= 0 { 1 } else { input.top_k() };
    let mut values = Vec::with_capacity(input.len());
    let mut missing = 0_i64;
    for index in 0..input.len() {
        match input.rank(index) {
            Some(Some(value)) => values.push(value as f64),
            Some(None) => missing += 1,
            None => missing += 1,
        }
    }
    volatility_from_item_parts(
        &values,
        missing,
        top_k,
        input.consecutive_appearances(),
        eligible,
        input.rbo_to_previous(),
    )
}

fn volatility_from_item_parts(
    values: &[f64],
    missing: i64,
    top_k: i64,
    consecutive_appearances: i64,
    eligible: i64,
    rbo_to_previous: f64,
) -> VolatilityResult {
    let std = variance(values).sqrt();
    let rank_variance = clamp(std / top_k as f64 * 300.0);
    let absence_rate = if eligible > 0 {
        100.0 * missing as f64 / eligible as f64
    } else {
        0.0
    };
    let mad = clamp(median_absolute_deviation(values) / top_k as f64 * 300.0);
    let inverse_rbo = clamp(100.0 - rbo_to_previous);
    let consecutive = if eligible > 0 {
        100.0 * consecutive_appearances as f64 / eligible as f64
    } else {
        0.0
    };
    let inverse_consecutive = 100.0 - consecutive;
    let score = clamp(
        rank_variance * 0.30
            + absence_rate * 0.25
            + inverse_rbo * 0.20
            + mad * 0.10
            + inverse_consecutive * 0.15,
    );
    VolatilityResult {
        score,
        label: label(score),
        rank_variance,
        absence_rate,
        median_absolute_deviation: mad,
        rbo_persistence: clamp(rbo_to_previous),
        consecutive_persistence: consecutive,
    }
}

pub fn cluster_volatility(input: &ClusterVolatilityInput) -> VolatilityResult {
    cluster_volatility_from_variance(
        variance(&input.shares),
        input.context_disagreement,
        input.cross_time_persistence,
    )
}

pub fn cluster_volatility_view(input: ClusterVolatilityView<'_>) -> VolatilityResult {
    let variance = if input.is_empty() {
        0.0
    } else {
        let mut sum = 0.0;
        for index in 0..input.len() {
            if let Some(share) = input.share(index) {
                sum += share;
            }
        }
        let mean = sum / input.len() as f64;
        let mut squared_sum = 0.0;
        for index in 0..input.len() {
            if let Some(share) = input.share(index) {
                let d = share - mean;
                squared_sum += d * d;
            }
        }
        squared_sum / input.len() as f64
    };

    cluster_volatility_from_variance(
        variance,
        input.context_disagreement(),
        input.cross_time_persistence(),
    )
}

fn cluster_volatility_from_variance(
    variance: f64,
    context_disagreement: f64,
    cross_time_persistence: f64,
) -> VolatilityResult {
    let share_std = variance.sqrt();
    let share_variance = clamp(share_std * 2.0);
    let score = clamp(
        share_variance * 0.40
            + clamp(context_disagreement) * 0.35
            + clamp(100.0 - cross_time_persistence) * 0.25,
    );
    VolatilityResult {
        score,
        label: label(score),
        rank_variance: share_variance,
        absence_rate: 0.0,
        median_absolute_deviation: 0.0,
        rbo_persistence: clamp(cross_time_persistence),
        consecutive_persistence: 0.0,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn item_fixture_matches_go() {
        let got = item_volatility(&ItemVolatilityInput {
            ranks: vec![Some(5), Some(7), Some(4), Some(6)],
            top_k: 30,
            consecutive_appearances: 4,
            eligible_snapshots: 4,
            rbo_to_previous: 82.0,
        });
        assert_eq!(got.label, "stable");
        assert!((got.score - 7.954101966249684).abs() <= 1e-12);
        assert!((got.rank_variance - 11.180339887498949).abs() <= 1e-12);
        assert_eq!(got.absence_rate, 0.0);
        assert_eq!(got.median_absolute_deviation, 10.0);
        assert_eq!(got.rbo_persistence, 82.0);
        assert_eq!(got.consecutive_persistence, 100.0);
    }

    #[test]
    fn missing_ranks_and_top_k_normalization_are_deterministic() {
        let got = item_volatility(&ItemVolatilityInput {
            ranks: vec![Some(2), None, Some(28), Some(3), None],
            top_k: 0,
            consecutive_appearances: 1,
            eligible_snapshots: 5,
            rbo_to_previous: 10.0,
        });
        assert_eq!(got.label, "extreme");
        assert!(got.score >= 65.0 && got.score <= 100.0);
        assert_eq!(got.absence_rate, 40.0);
    }

    #[test]
    fn cluster_fixture_matches_go() {
        let got = cluster_volatility(&ClusterVolatilityInput {
            shares: vec![10.0, 12.0, 11.0, 9.0],
            context_disagreement: 20.0,
            cross_time_persistence: 75.0,
        });
        assert_eq!(got.label, "stable");
        assert!((got.score - 14.144427190999917).abs() <= 1e-12);
        assert!((got.rank_variance - 2.23606797749979).abs() <= 1e-12);
        assert_eq!(got.rbo_persistence, 75.0);
    }
}
