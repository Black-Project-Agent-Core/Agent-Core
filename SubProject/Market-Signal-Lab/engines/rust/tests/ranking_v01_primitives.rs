#[path = "../src/ranking_v01.rs"]
mod ranking_v01;

use ranking_v01::{
    clamp_100, delta_index, direction_from_index, hhi_msl, median, model_registry_v01,
    optional_weighted_score, percentile_ranks, round_1, signed_delta_percent,
};
use serde_json::Value;
use std::collections::BTreeMap;
use std::fs;
use std::path::PathBuf;

fn repo_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..")
}

fn oracle() -> Value {
    let fixture_path = repo_root().join("internal/ranking/testdata/c1/product_v01_cases.json");
    let raw = fs::read_to_string(&fixture_path).unwrap_or_else(|err| {
        panic!(
            "C1 primitive oracle missing at {}: {err}",
            fixture_path.display()
        )
    });
    let fixture: Value =
        serde_json::from_str(&raw).expect("C1 product golden fixture must be valid JSON");
    assert_eq!(
        fixture.get("schemaVersion").and_then(Value::as_str),
        Some("msl-c1-product-golden/1"),
        "Task 3 must consume the frozen C1 product oracle"
    );
    fixture
}

fn assert_exact(got: f64, want: f64, label: &str) {
    if want.is_nan() {
        assert!(got.is_nan(), "{label}: got={got:?} want=NaN");
        return;
    }
    assert_eq!(
        got.to_bits(),
        want.to_bits(),
        "{label}: got={got:?} want={want:?}"
    );
}

#[test]
fn ranking_v01_primitives_clamp_round_median_and_delta_index_match_go() {
    for (value, want) in [
        (-5.0, 0.0),
        (0.0, 0.0),
        (42.5, 42.5),
        (100.0, 100.0),
        (150.0, 100.0),
        (f64::NEG_INFINITY, 0.0),
        (f64::INFINITY, 100.0),
    ] {
        assert_exact(clamp_100(value), want, "clamp_100");
    }
    assert!(clamp_100(f64::NAN).is_nan(), "Go Clamp100 preserves NaN");

    for (value, want) in [
        (1.24, 1.2),
        (1.25, 1.3),
        (-1.25, -1.3),
        (42.0, 42.0),
    ] {
        assert_exact(round_1(value), want, "round_1");
    }

    assert_eq!(median(&[]), None);
    assert_eq!(median(&[3.0, 1.0, 2.0]), Some(2.0));
    assert_eq!(median(&[4.0, 1.0, 3.0, 2.0]), Some(2.5));

    for (delta, want) in [
        (-200.0, 0.0),
        (0.0, 50.0),
        (100.0, 75.0),
        (200.0, 100.0),
        (33.3, 58.3),
    ] {
        assert_exact(delta_index(delta), want, "delta_index");
    }
}

#[test]
fn ranking_v01_primitives_signed_delta_matches_frozen_oracle() {
    let fixture = oracle();
    let cases = fixture["primitives"]["signedDelta"]
        .as_array()
        .expect("signedDelta vectors");
    assert!(!cases.is_empty());

    for case in cases {
        let name = case["name"].as_str().expect("signedDelta case name");
        let current = case["current"].as_f64().expect("current");
        let previous = case["previous"].as_f64().expect("previous");
        let want = case["expected"].as_f64().expect("expected");
        assert_exact(
            signed_delta_percent(current, previous),
            want,
            &format!("signed_delta_percent/{name}"),
        );
    }
}

#[test]
fn ranking_v01_primitives_percentiles_match_frozen_oracle_with_ties() {
    let fixture = oracle();
    let cases = fixture["primitives"]["percentiles"]
        .as_array()
        .expect("percentile vectors");

    for case in cases {
        let name = case["name"].as_str().expect("percentile case name");
        let values = case["values"].as_object().expect("percentile values");
        let input: BTreeMap<String, f64> = values
            .iter()
            .map(|(key, value)| (key.clone(), value.as_f64().expect("percentile value")))
            .collect();
        let got = percentile_ranks(&input);
        let expected = case["expected"].as_object().expect("percentile expected");

        assert_eq!(got.len(), expected.len(), "percentiles/{name}: len");
        for (key, value) in expected {
            let want = value.as_f64().expect("percentile expected value");
            let actual = *got
                .get(key)
                .unwrap_or_else(|| panic!("percentiles/{name}: missing key {key}"));
            assert_exact(actual, want, &format!("percentiles/{name}/{key}"));
        }
    }
}

#[test]
fn ranking_v01_primitives_hhi_matches_frozen_oracle() {
    let fixture = oracle();
    let cases = fixture["primitives"]["hhi"].as_array().expect("HHI vectors");

    for case in cases {
        let name = case["name"].as_str().expect("HHI case name");
        let counts = case["counts"].as_object().expect("HHI counts");
        let input: BTreeMap<String, i64> = counts
            .iter()
            .map(|(key, value)| (key.clone(), value.as_i64().expect("HHI count")))
            .collect();
        let want = case["expected"].as_f64().expect("HHI expected");
        assert_exact(hhi_msl(&input), want, &format!("hhi/{name}"));
    }
}

#[test]
fn ranking_v01_primitives_weighted_score_matches_frozen_oracle() {
    let fixture = oracle();
    let cases = fixture["primitives"]["weighted"]
        .as_array()
        .expect("weighted vectors");
    let registry = model_registry_v01();

    for case in cases {
        let name = case["name"].as_str().expect("weighted case name");
        let model_name = case["modelName"].as_str().expect("modelName");
        let model_version = case["modelVersion"].as_str().expect("modelVersion");
        let model = registry
            .iter()
            .find(|model| model.name == model_name && model.version == model_version)
            .unwrap_or_else(|| panic!("weighted/{name}: model not found"));

        let features = case["features"].as_object().expect("weighted features");
        let input: BTreeMap<String, Option<f64>> = features
            .iter()
            .map(|(key, value)| {
                let value = if value.is_null() {
                    None
                } else {
                    Some(value.as_f64().expect("weighted feature value"))
                };
                (key.clone(), value)
            })
            .collect();

        let got = optional_weighted_score(&input, model)
            .unwrap_or_else(|err| panic!("weighted/{name}: {err}"));
        assert_exact(
            got.score,
            case["expectedScore"].as_f64().expect("expectedScore"),
            &format!("weighted/{name}/score"),
        );
        assert_exact(
            got.present_weight,
            case["expectedPresentWeight"]
                .as_f64()
                .expect("expectedPresentWeight"),
            &format!("weighted/{name}/present_weight"),
        );
        let want_missing: Vec<String> = case["expectedMissing"]
            .as_array()
            .expect("expectedMissing")
            .iter()
            .map(|value| value.as_str().expect("missing feature").to_string())
            .collect();
        assert_eq!(got.missing, want_missing, "weighted/{name}/missing");
    }
}

#[test]
fn ranking_v01_primitives_direction_boundaries_match_frozen_oracle() {
    let fixture = oracle();
    let cases = fixture["primitives"]["direction"]
        .as_array()
        .expect("direction vectors");

    for case in cases {
        let name = case["name"].as_str().expect("direction case name");
        let value = case["value"].as_f64().expect("direction value");
        let want = case["expected"].as_str().expect("direction expected");
        assert_eq!(
            direction_from_index(value),
            want,
            "direction_from_index/{name}"
        );
    }
}

#[test]
fn ranking_v01_primitives_model_registry_matches_locked_go_weights() {
    let registry = model_registry_v01();
    assert_eq!(registry.len(), 5, "ranking v0.1 locked model count");

    let expected: [(&str, &str, &[(&str, f64)]); 5] = [
        (
            "product-exposure",
            "product-exposure-v0.1",
            &[
                ("median_position", 0.35),
                ("cross_query", 0.20),
                ("surface_strength", 0.10),
                ("rank_velocity", 0.20),
                ("freshness", 0.15),
            ],
        ),
        (
            "product-opportunity",
            "product-opportunity-v0.1",
            &[
                ("exposure", 0.40),
                ("relative_strength", 0.25),
                ("freshness", 0.15),
                ("cross_query", 0.10),
                ("rank_velocity", 0.10),
            ],
        ),
        (
            "catalog-trend",
            "catalog-trend-v0.1",
            &[
                ("demand_momentum", 0.15),
                ("market_breadth", 0.18),
                ("exposure_movement", 0.15),
                ("new_product_velocity", 0.08),
                ("freshness", 0.08),
                ("relative_strength", 0.14),
                ("supply_gap", 0.08),
                ("competition_momentum", 0.05),
                ("author_diversity", 0.04),
                ("external_trend", 0.05),
            ],
        ),
        (
            "catalog-opportunity",
            "catalog-opportunity-v0.1",
            &[
                ("trend", 0.35),
                ("supply_gap", 0.20),
                ("market_breadth", 0.15),
                ("freshness", 0.10),
                ("author_diversity", 0.10),
                ("inverse_competition", 0.10),
            ],
        ),
        (
            "direction",
            "direction-v0.1",
            &[
                ("demand_momentum", 0.25),
                ("market_breadth", 0.25),
                ("exposure_movement", 0.25),
                ("new_product_velocity", 0.10),
                ("relative_strength", 0.15),
            ],
        ),
    ];

    for (name, version, weights) in expected {
        let model = registry
            .iter()
            .find(|model| model.name == name)
            .unwrap_or_else(|| panic!("model registry missing {name}"));
        assert_eq!(model.version, version, "model version/{name}");

        let got: BTreeMap<&str, u64> = model
            .weights
            .iter()
            .map(|(key, value)| (*key, value.to_bits()))
            .collect();
        let want: BTreeMap<&str, u64> = weights
            .iter()
            .map(|(key, value)| (*key, value.to_bits()))
            .collect();
        assert_eq!(got, want, "model weights/{name}");
    }
}
