use msl_analytics_rust::ranking_v01::{
    build_product_ranking_v01, ProductRankingEntityV01, ProductRankingInputV01,
    ProductRankingObservationV01,
};
use serde_json::Value;
use std::collections::BTreeMap;
use std::fs;
use std::path::PathBuf;

fn repo_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..")
}

fn oracle() -> Value {
    let path = repo_root().join("internal/ranking/testdata/c1/product_v01_cases.json");
    let raw = fs::read_to_string(&path)
        .unwrap_or_else(|err| panic!("C1 product oracle missing at {}: {err}", path.display()));
    let fixture: Value = serde_json::from_str(&raw).expect("C1 product oracle must be valid JSON");
    assert_eq!(
        fixture.get("schemaVersion").and_then(Value::as_str),
        Some("msl-c1-product-golden/1")
    );
    fixture
}

fn expected_case<'a>(fixture: &'a Value, name: &str) -> &'a Vec<Value> {
    fixture["cases"]
        .as_array()
        .expect("product cases")
        .iter()
        .find(|case| case["name"].as_str() == Some(name))
        .unwrap_or_else(|| panic!("missing product golden case {name}"))["expected"]
        .as_array()
        .expect("product expected rows")
}

fn peer_input() -> ProductRankingInputV01 {
    ProductRankingInputV01 {
        products: vec![
            ProductRankingEntityV01 {
                product_key: 1,
                catalog_key: 11,
                first_seen_bucket: 0,
                applicable_query_keys: vec![101, 102],
                session_coverages: vec![100.0],
                segmentation_fallback: false,
            },
            ProductRankingEntityV01 {
                product_key: 2,
                catalog_key: 11,
                first_seen_bucket: 0,
                applicable_query_keys: vec![101, 102],
                session_coverages: vec![100.0],
                segmentation_fallback: false,
            },
            ProductRankingEntityV01 {
                product_key: 3,
                catalog_key: 11,
                first_seen_bucket: 0,
                applicable_query_keys: vec![101, 102],
                session_coverages: vec![100.0],
                segmentation_fallback: false,
            },
        ],
        observations: vec![
            // laggard
            ProductRankingObservationV01 { product_key: 1, window_bucket: 1, query_key: 101, surface_code: 1, position: 20, reliability: 0.9 },
            ProductRankingObservationV01 { product_key: 1, window_bucket: 1, query_key: 102, surface_code: 2, position: 22, reliability: 0.9 },
            ProductRankingObservationV01 { product_key: 1, window_bucket: 2, query_key: 101, surface_code: 1, position: 5, reliability: 0.9 },
            ProductRankingObservationV01 { product_key: 1, window_bucket: 2, query_key: 102, surface_code: 1, position: 6, reliability: 0.9 },
            // leader
            ProductRankingObservationV01 { product_key: 2, window_bucket: 1, query_key: 101, surface_code: 1, position: 5, reliability: 0.9 },
            ProductRankingObservationV01 { product_key: 2, window_bucket: 1, query_key: 102, surface_code: 2, position: 4, reliability: 0.9 },
            ProductRankingObservationV01 { product_key: 2, window_bucket: 2, query_key: 101, surface_code: 1, position: 25, reliability: 0.9 },
            ProductRankingObservationV01 { product_key: 2, window_bucket: 2, query_key: 102, surface_code: 1, position: 20, reliability: 0.9 },
            // middle
            ProductRankingObservationV01 { product_key: 3, window_bucket: 1, query_key: 101, surface_code: 1, position: 10, reliability: 0.9 },
            ProductRankingObservationV01 { product_key: 3, window_bucket: 1, query_key: 102, surface_code: 2, position: 11, reliability: 0.9 },
            ProductRankingObservationV01 { product_key: 3, window_bucket: 2, query_key: 101, surface_code: 1, position: 10, reliability: 0.9 },
            ProductRankingObservationV01 { product_key: 3, window_bucket: 2, query_key: 102, surface_code: 1, position: 10, reliability: 0.9 },
        ],
    }
}

fn assert_f64(got: f64, expected: &Value, label: &str) {
    let want = expected.as_f64().unwrap_or_else(|| panic!("{label}: expected number"));
    assert_eq!(got.to_bits(), want.to_bits(), "{label}: got={got} want={want}");
}

#[test]
fn product_ranking_v01_peer_case_matches_frozen_go_golden() {
    let fixture = oracle();
    let expected = expected_case(&fixture, "peer_ranking");
    assert_eq!(expected.len(), 3, "peer_ranking frozen row count");

    let rows = build_product_ranking_v01(&peer_input()).expect("Rust product ranking kernel");
    assert_eq!(rows.len(), 3);

    let expected_by_key: BTreeMap<u32, &Value> = [
        (1u32, "laggard"),
        (2u32, "leader"),
        (3u32, "middle"),
    ]
    .into_iter()
    .map(|(key, product_id)| {
        let row = expected
            .iter()
            .find(|row| row["productId"].as_str() == Some(product_id))
            .unwrap_or_else(|| panic!("missing golden row {product_id}"));
        (key, row)
    })
    .collect();

    for row in rows {
        let want = expected_by_key
            .get(&row.product_key)
            .unwrap_or_else(|| panic!("unexpected product key {}", row.product_key));
        assert_eq!(row.catalog_key, 11);
        assert_eq!(row.current_observation_count, want["currentObservationCount"].as_u64().unwrap() as u32);
        assert_eq!(row.previous_observation_count, want["previousObservationCount"].as_u64().unwrap() as u32);
        assert_eq!(row.query_appearances, want["queryAppearances"].as_u64().unwrap() as u32);
        assert_eq!(row.applicable_queries, want["applicableQueries"].as_u64().unwrap() as u32);
        assert_eq!(row.surface_appearances, want["surfaceAppearances"].as_u64().unwrap() as u32);
        assert_f64(row.median_position, &want["medianPosition"], "median_position");
        assert_f64(row.previous_median_position.expect("previous median"), &want["previousMedianPosition"], "previous_median_position");
        assert_f64(row.rank_velocity, &want["rankVelocity"], "rank_velocity");
        assert_f64(row.rank_velocity_score.expect("rank velocity score"), &want["rankVelocityScore"], "rank_velocity_score");
        assert_f64(row.exposure_score, &want["exposureScore"], "exposure_score");
        assert_f64(row.freshness_score, &want["freshnessScore"], "freshness_score");
        assert_f64(row.cross_query_strength, &want["crossQueryStrength"], "cross_query_strength");
        assert_f64(row.relative_strength, &want["relativeStrength"], "relative_strength");
        assert_f64(row.opportunity_score, &want["opportunityScore"], "opportunity_score");
        assert_eq!(row.direction, want["direction"].as_str().unwrap());
        assert_eq!(row.comparable_history, want["comparableHistory"].as_bool().unwrap());
        assert_f64(row.confidence, &want["confidence"], "confidence");
        assert_f64(row.coverage, &want["coverage"], "coverage");
        assert!(row.missing.is_empty(), "peer case missing={:?}", row.missing);
    }
}

fn edge_input() -> ProductRankingInputV01 {
    ProductRankingInputV01 {
        products: vec![
            ProductRankingEntityV01 {
                product_key: 11,
                catalog_key: 21,
                first_seen_bucket: 0,
                applicable_query_keys: vec![201],
                session_coverages: vec![80.0, 100.0],
                segmentation_fallback: true,
            },
            ProductRankingEntityV01 {
                product_key: 12,
                catalog_key: 22,
                first_seen_bucket: 1,
                applicable_query_keys: vec![202],
                session_coverages: vec![20.0],
                segmentation_fallback: true,
            },
            ProductRankingEntityV01 {
                product_key: 13,
                catalog_key: 23,
                first_seen_bucket: 2,
                applicable_query_keys: vec![203],
                session_coverages: vec![40.0],
                segmentation_fallback: true,
            },
        ],
        observations: vec![
            // high-old: reliability clamp 1.2 -> 1 and -0.2 -> 0.
            ProductRankingObservationV01 {
                product_key: 11,
                window_bucket: 1,
                query_key: 201,
                surface_code: 1,
                position: 8,
                reliability: 1.2,
            },
            ProductRankingObservationV01 {
                product_key: 11,
                window_bucket: 1,
                query_key: 201,
                surface_code: 2,
                position: 6,
                reliability: -0.2,
            },
            ProductRankingObservationV01 {
                product_key: 11,
                window_bucket: 2,
                query_key: 201,
                surface_code: 1,
                position: 20,
                reliability: 0.9,
            },
            ProductRankingObservationV01 {
                product_key: 11,
                window_bucket: 2,
                query_key: 201,
                surface_code: 1,
                position: 18,
                reliability: 0.9,
            },
            // low-current: position 0 must not enter the ranking kernel.
            ProductRankingObservationV01 {
                product_key: 12,
                window_bucket: 1,
                query_key: 202,
                surface_code: 1,
                position: 3,
                reliability: 0.8,
            },
            ProductRankingObservationV01 {
                product_key: 12,
                window_bucket: 1,
                query_key: 202,
                surface_code: 2,
                position: 0,
                reliability: 1.0,
            },
            // mid-previous.
            ProductRankingObservationV01 {
                product_key: 13,
                window_bucket: 1,
                query_key: 203,
                surface_code: 1,
                position: 12,
                reliability: 0.9,
            },
            ProductRankingObservationV01 {
                product_key: 13,
                window_bucket: 2,
                query_key: 203,
                surface_code: 1,
                position: 12,
                reliability: 0.9,
            },
        ],
    }
}

fn assert_optional_f64(got: Option<f64>, expected: &Value, label: &str) {
    if expected.is_null() {
        assert!(got.is_none(), "{label}: got={got:?} want=None");
        return;
    }
    assert_f64(
        got.unwrap_or_else(|| panic!("{label}: missing value")),
        expected,
        label,
    );
}

#[test]
fn product_ranking_v01_edge_case_matches_frozen_go_golden() {
    let fixture = oracle();
    let expected = expected_case(&fixture, "coverage_freshness_reliability_and_fallback");

    let rows = build_product_ranking_v01(&edge_input()).expect("Rust edge product ranking kernel");
    assert_eq!(rows.len(), 3);

    let expected_by_key: BTreeMap<u32, &Value> = [
        (11u32, "high-old"),
        (12u32, "low-current"),
        (13u32, "mid-previous"),
    ]
    .into_iter()
    .map(|(key, product_id)| {
        let row = expected
            .iter()
            .find(|row| row["productId"].as_str() == Some(product_id))
            .unwrap_or_else(|| panic!("missing golden row {product_id}"));
        (key, row)
    })
    .collect();

    for row in rows {
        let want = expected_by_key
            .get(&row.product_key)
            .unwrap_or_else(|| panic!("unexpected product key {}", row.product_key));

        assert_eq!(
            row.current_observation_count,
            want["currentObservationCount"].as_u64().unwrap() as u32
        );
        assert_eq!(
            row.previous_observation_count,
            want["previousObservationCount"].as_u64().unwrap() as u32
        );
        assert_eq!(
            row.query_appearances,
            want["queryAppearances"].as_u64().unwrap() as u32
        );
        assert_eq!(
            row.applicable_queries,
            want["applicableQueries"].as_u64().unwrap() as u32
        );
        assert_eq!(
            row.surface_appearances,
            want["surfaceAppearances"].as_u64().unwrap() as u32
        );

        assert_f64(
            row.median_position,
            &want["medianPosition"],
            "median_position",
        );
        assert_optional_f64(
            row.previous_median_position,
            &want["previousMedianPosition"],
            "previous_median_position",
        );
        assert_f64(row.rank_velocity, &want["rankVelocity"], "rank_velocity");
        assert_optional_f64(
            row.rank_velocity_score,
            &want["rankVelocityScore"],
            "rank_velocity_score",
        );
        assert_f64(row.exposure_score, &want["exposureScore"], "exposure_score");
        assert_f64(
            row.freshness_score,
            &want["freshnessScore"],
            "freshness_score",
        );
        assert_f64(
            row.cross_query_strength,
            &want["crossQueryStrength"],
            "cross_query_strength",
        );
        assert_f64(
            row.relative_strength,
            &want["relativeStrength"],
            "relative_strength",
        );
        assert_f64(
            row.opportunity_score,
            &want["opportunityScore"],
            "opportunity_score",
        );
        assert_eq!(row.direction, want["direction"].as_str().unwrap());
        assert_eq!(
            row.comparable_history,
            want["comparableHistory"].as_bool().unwrap()
        );
        assert_f64(row.confidence, &want["confidence"], "confidence");
        assert_f64(row.coverage, &want["coverage"], "coverage");

        let want_missing: Vec<&str> = want["missing"]
            .as_array()
            .map(|values| values.iter().map(|v| v.as_str().unwrap()).collect())
            .unwrap_or_default();

        assert_eq!(
            row.missing.iter().map(String::as_str).collect::<Vec<_>>(),
            want_missing,
            "missing/product_key={}",
            row.product_key
        );
    }
}
