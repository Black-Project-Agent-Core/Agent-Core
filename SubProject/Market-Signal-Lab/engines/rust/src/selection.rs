use crate::schema_v2::SelectionProbabilityView;
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
pub struct SelectionObservation {
    pub weight: f64,
    pub selected: bool,
}

#[derive(Debug, Deserialize)]
pub struct SelectionProbabilityInput {
    pub observations: Vec<SelectionObservation>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SelectionProbabilityResult {
    pub score: f64,
    pub selected_count: usize,
    pub eligible_count: usize,
    pub selected_weight: f64,
    pub eligible_weight: f64,
}

fn clamp(v: f64) -> f64 {
    if !v.is_finite() {
        return 0.0;
    }
    v.clamp(0.0, 100.0)
}

pub fn selection_probability(
    input: &SelectionProbabilityInput,
) -> Result<SelectionProbabilityResult, String> {
    if input.observations.is_empty() {
        return Err("selection probability requires eligible observations".to_string());
    }
    let mut eligible_weight = 0.0;
    let mut selected_weight = 0.0;
    let mut selected_count = 0;
    for observation in &input.observations {
        if observation.weight <= 0.0 || !observation.weight.is_finite() {
            return Err("selection observation weight must be positive".to_string());
        }
        eligible_weight += observation.weight;
        if observation.selected {
            selected_weight += observation.weight;
            selected_count += 1;
        }
    }
    if eligible_weight <= 0.0 {
        return Err("empty eligible denominator".to_string());
    }
    Ok(SelectionProbabilityResult {
        score: clamp(100.0 * selected_weight / eligible_weight),
        selected_count,
        eligible_count: input.observations.len(),
        selected_weight,
        eligible_weight,
    })
}

pub fn selection_probability_view(
    input: SelectionProbabilityView<'_>,
) -> Result<SelectionProbabilityResult, String> {
    if input.is_empty() {
        return Err("selection probability requires eligible observations".to_string());
    }

    let mut eligible_weight = 0.0;
    let mut selected_weight = 0.0;
    let mut selected_count = 0;

    for index in 0..input.len() {
        let weight = input
            .weight(index)
            .ok_or_else(|| "selection probability view is inconsistent".to_string())?;
        if weight <= 0.0 || !weight.is_finite() {
            return Err("selection observation weight must be positive".to_string());
        }
        eligible_weight += weight;
        let selected = input
            .selected(index)
            .ok_or_else(|| "selection probability view is inconsistent".to_string())?;
        if selected {
            selected_weight += weight;
            selected_count += 1;
        }
    }

    if eligible_weight <= 0.0 {
        return Err("empty eligible denominator".to_string());
    }

    Ok(SelectionProbabilityResult {
        score: clamp(100.0 * selected_weight / eligible_weight),
        selected_count,
        eligible_count: input.len(),
        selected_weight,
        eligible_weight,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn weighted_fixture_matches_go() {
        let got = selection_probability(&SelectionProbabilityInput {
            observations: vec![
                SelectionObservation {
                    weight: 2.0,
                    selected: true,
                },
                SelectionObservation {
                    weight: 1.0,
                    selected: false,
                },
                SelectionObservation {
                    weight: 3.0,
                    selected: true,
                },
            ],
        })
        .unwrap();
        assert!((got.score - 83.33333333333333).abs() <= 1e-12);
        assert_eq!(got.selected_count, 2);
        assert_eq!(got.eligible_count, 3);
        assert_eq!(got.selected_weight, 5.0);
        assert_eq!(got.eligible_weight, 6.0);
    }

    #[test]
    fn empty_and_non_positive_weights_are_rejected() {
        assert!(selection_probability(&SelectionProbabilityInput {
            observations: vec![]
        })
        .is_err());
        assert!(selection_probability(&SelectionProbabilityInput {
            observations: vec![SelectionObservation {
                weight: 0.0,
                selected: true
            }]
        })
        .is_err());
        assert!(selection_probability(&SelectionProbabilityInput {
            observations: vec![SelectionObservation {
                weight: -1.0,
                selected: true
            }]
        })
        .is_err());
    }
}
