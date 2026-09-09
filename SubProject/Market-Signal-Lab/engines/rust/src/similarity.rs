use crate::schema_v2::DistributionSimilarityView;
use serde::Deserialize;
use std::collections::{HashMap, HashSet};

#[derive(Debug, Deserialize)]
pub struct DistributionSimilarityInput {
    pub a: HashMap<String, f64>,
    pub b: HashMap<String, f64>,
}

fn clamp(v: f64) -> f64 {
    if !v.is_finite() {
        return 0.0;
    }
    v.clamp(0.0, 100.0)
}

fn normalize(input: &HashMap<String, f64>) -> HashMap<String, f64> {
    let mut out = HashMap::new();
    let mut total = 0.0;
    for (key, value) in input {
        if *value > 0.0 && value.is_finite() {
            out.insert(key.clone(), *value);
            total += value;
        }
    }
    if total > 0.0 {
        for value in out.values_mut() {
            *value /= total;
        }
    }
    out
}

pub fn distribution_similarity(input: &DistributionSimilarityInput) -> f64 {
    let pa = normalize(&input.a);
    let pb = normalize(&input.b);
    if pa.is_empty() || pb.is_empty() {
        return 0.0;
    }
    let keys: HashSet<String> = pa.keys().chain(pb.keys()).cloned().collect();
    let mut mid = HashMap::new();
    for key in keys {
        mid.insert(
            key.clone(),
            (pa.get(&key).copied().unwrap_or(0.0) + pb.get(&key).copied().unwrap_or(0.0)) / 2.0,
        );
    }
    fn kl(p: &HashMap<String, f64>, m: &HashMap<String, f64>) -> f64 {
        p.iter()
            .filter_map(|(key, pv)| {
                let mv = m.get(key).copied().unwrap_or(0.0);
                if *pv > 0.0 && mv > 0.0 {
                    Some(*pv * (*pv / mv).ln())
                } else {
                    None
                }
            })
            .sum()
    }
    let jsd = 0.5 * kl(&pa, &mid) + 0.5 * kl(&pb, &mid);
    let normalized = jsd / 2.0_f64.ln();
    clamp(100.0 * (1.0 - normalized))
}

pub fn distribution_similarity_view(input: DistributionSimilarityView<'_>) -> f64 {
    let mut total_a = 0.0;
    let mut total_b = 0.0;

    for index in 0..input.len() {
        let Some(value_a) = input.value_a(index) else {
            return 0.0;
        };
        let Some(value_b) = input.value_b(index) else {
            return 0.0;
        };
        if value_a > 0.0 && value_a.is_finite() {
            total_a += value_a;
        }
        if value_b > 0.0 && value_b.is_finite() {
            total_b += value_b;
        }
    }

    if total_a <= 0.0 || total_b <= 0.0 {
        return 0.0;
    }

    let mut kl_a = 0.0;
    let mut kl_b = 0.0;
    for index in 0..input.len() {
        let Some(raw_a) = input.value_a(index) else {
            return 0.0;
        };
        let Some(raw_b) = input.value_b(index) else {
            return 0.0;
        };
        let pa = if raw_a > 0.0 && raw_a.is_finite() {
            raw_a / total_a
        } else {
            0.0
        };
        let pb = if raw_b > 0.0 && raw_b.is_finite() {
            raw_b / total_b
        } else {
            0.0
        };
        let mid = (pa + pb) / 2.0;
        if pa > 0.0 && mid > 0.0 {
            kl_a += pa * (pa / mid).ln();
        }
        if pb > 0.0 && mid > 0.0 {
            kl_b += pb * (pb / mid).ln();
        }
    }

    let jsd = 0.5 * kl_a + 0.5 * kl_b;
    let normalized = jsd / 2.0_f64.ln();
    clamp(100.0 * (1.0 - normalized))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn map(values: &[(&str, f64)]) -> HashMap<String, f64> {
        values.iter().map(|(k, v)| ((*k).to_string(), *v)).collect()
    }

    #[test]
    fn identical_distribution_is_one_hundred() {
        let input = DistributionSimilarityInput {
            a: map(&[("a", 2.0), ("b", 1.0)]),
            b: map(&[("a", 2.0), ("b", 1.0)]),
        };
        assert!((distribution_similarity(&input) - 100.0).abs() <= 1e-12);
    }

    #[test]
    fn disjoint_distribution_is_zero() {
        let input = DistributionSimilarityInput {
            a: map(&[("a", 1.0)]),
            b: map(&[("b", 1.0)]),
        };
        assert!(distribution_similarity(&input).abs() <= 1e-12);
    }

    #[test]
    fn normalized_weight_invariance_matches_go_fixture() {
        let input = DistributionSimilarityInput {
            a: map(&[("a", 2.0), ("b", 1.0)]),
            b: map(&[("a", 1.0), ("c", 2.0)]),
        };
        let got = distribution_similarity(&input);
        assert!(
            (got - 45.914_791_702_724_48).abs() <= 1e-12,
            "got={got:.15}"
        );
        let scaled = DistributionSimilarityInput {
            a: map(&[("a", 20.0), ("b", 10.0), ("ignored", 0.0)]),
            b: map(&[("a", 10.0), ("c", 20.0), ("ignored", -5.0)]),
        };
        assert!((distribution_similarity(&scaled) - got).abs() <= 1e-12);
    }

    #[test]
    fn empty_positive_mass_returns_zero() {
        let input = DistributionSimilarityInput {
            a: map(&[("a", 0.0), ("b", -1.0)]),
            b: map(&[("a", 1.0)]),
        };
        assert_eq!(distribution_similarity(&input), 0.0);
    }
}
