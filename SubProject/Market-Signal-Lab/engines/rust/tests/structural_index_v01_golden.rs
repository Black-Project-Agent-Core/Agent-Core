use msl_analytics_rust::structural_index_v01::{
    apply_direction_v01, build_structural_index_v01, capped_weights_v01, DirectionInputV01,
    StructuralBuildInputV01, StructuralSegmentV01,
};
use serde::Deserialize;
use std::collections::BTreeMap;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Fixture {
    schema_version: String,
    weight_cases: Vec<WeightCase>,
    direction_cases: Vec<DirectionCase>,
    cases: Vec<StructuralCase>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WeightCase {
    name: String,
    volumes: BTreeMap<String, f64>,
    configured_cap: f64,
    expected: WeightExpected,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WeightExpected {
    weights: BTreeMap<String, f64>,
    configured_cap: f64,
    effective_cap: f64,
    fallback_rules: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
struct DirectionCase {
    name: String,
    input: DirectionInputJSON,
    expected: DirectionExpected,
}

#[derive(Debug, Deserialize)]
struct DirectionInputJSON {
    #[serde(rename = "ComparableRuns")]
    comparable_runs: usize,
    #[serde(rename = "CurrentVolume")]
    current_volume: f64,
    #[serde(rename = "PriorVolume")]
    prior_volume: f64,
    #[serde(rename = "CurrentEqual")]
    current_equal: f64,
    #[serde(rename = "PriorEqual")]
    prior_equal: f64,
    #[serde(rename = "BaseConfidence")]
    base_confidence: f64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
struct DirectionExpected {
    stage: String,
    direction: String,
    trend_score: Option<f64>,
    confidence: f64,
    reason_codes: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
struct StructuralCase {
    name: String,
    input: StructuralInputJSON,
    expected: Vec<StructuralExpected>,
    #[serde(rename = "weightResults")]
    weight_results: BTreeMap<String, WeightExpected>,
}

#[derive(Debug, Deserialize)]
struct StructuralInputJSON {
    #[serde(rename = "Segments")]
    segments: Vec<SegmentJSON>,
}

#[derive(Debug, Deserialize)]
struct SegmentJSON {
    #[serde(rename = "Level")]
    level: String,
    #[serde(rename = "EntityID")]
    entity_id: String,
    #[serde(rename = "ParentID")]
    parent_id: String,
    #[serde(rename = "Volume")]
    volume: f64,
    #[serde(rename = "Composition")]
    composition: f64,
    #[serde(rename = "Coverage")]
    coverage: f64,
    #[serde(rename = "Confidence")]
    confidence: f64,
    #[serde(rename = "Quality")]
    quality: QualityJSON,
    #[serde(rename = "Eligible")]
    eligible: bool,
}

#[derive(Debug, Deserialize)]
struct QualityJSON {
    score: f64,
    grade: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StructuralExpected {
    level: String,
    entity_id: String,
    parent_id: String,
    composition_index: f64,
    volume_weighted_value: f64,
    equal_sector_value: f64,
    divergence_value: f64,
    divergence_state: String,
    direction_stage: String,
    coverage: f64,
    confidence: f64,
    data_quality_score: f64,
    data_quality_grade: String,
    sample_size: u32,
}

fn fixture() -> Fixture {
    serde_json::from_str(include_str!(
        "../../../internal/indexing/testdata/c1/structural_index_v01_cases.json"
    ))
    .expect("structural golden fixture")
}

fn assert_f64(got: f64, want: f64, label: &str) {
    assert_eq!(
        got.to_bits(),
        want.to_bits(),
        "{label}: got={got} want={want}"
    );
}

#[test]
fn structural_weight_primitives_match_go_golden() {
    let f = fixture();
    assert_eq!(f.schema_version, "msl-c1-structural-index-golden/1");
    for case in f.weight_cases {
        let got = capped_weights_v01(&case.volumes, case.configured_cap);
        assert_eq!(got.weights, case.expected.weights, "{} weights", case.name);
        assert_f64(got.configured_cap, case.expected.configured_cap, &case.name);
        assert_f64(got.effective_cap, case.expected.effective_cap, &case.name);
        assert_eq!(
            got.fallback_rules,
            case.expected.fallback_rules.unwrap_or_default(),
            "{} fallbacks",
            case.name
        );
    }
}

#[test]
fn structural_direction_primitives_match_go_golden() {
    for case in fixture().direction_cases {
        let got = apply_direction_v01(DirectionInputV01 {
            comparable_runs: case.input.comparable_runs,
            current_volume: case.input.current_volume,
            prior_volume: case.input.prior_volume,
            current_equal: case.input.current_equal,
            prior_equal: case.input.prior_equal,
            base_confidence: case.input.base_confidence,
        });
        assert_eq!(got.stage, case.expected.stage, "{} stage", case.name);
        assert_eq!(
            got.direction, case.expected.direction,
            "{} direction",
            case.name
        );
        assert_eq!(
            got.trend_score.map(f64::to_bits),
            case.expected.trend_score.map(f64::to_bits),
            "{} trend",
            case.name
        );
        assert_f64(got.confidence, case.expected.confidence, &case.name);
        assert_eq!(
            got.reason_codes,
            case.expected.reason_codes.unwrap_or_default(),
            "{} reasons",
            case.name
        );
    }
}

#[test]
fn structural_build_matches_go_golden() {
    for case in fixture().cases {
        let input = StructuralBuildInputV01 {
            segments: case
                .input
                .segments
                .into_iter()
                .map(|row| StructuralSegmentV01 {
                    level: row.level,
                    entity_id: row.entity_id,
                    parent_id: row.parent_id,
                    volume: row.volume,
                    composition: row.composition,
                    coverage: row.coverage,
                    confidence: row.confidence,
                    data_quality_score: row.quality.score,
                    data_quality_grade: row.quality.grade,
                    eligible: row.eligible,
                })
                .collect(),
        };
        let got = build_structural_index_v01(&input).expect("structural build");
        assert_eq!(
            got.rows.len(),
            case.expected.len(),
            "{} row count",
            case.name
        );
        for (row, want) in got.rows.iter().zip(case.expected.iter()) {
            assert_eq!(row.level, want.level, "{} level", case.name);
            assert_eq!(row.entity_id, want.entity_id, "{} entity", case.name);
            assert_eq!(row.parent_id, want.parent_id, "{} parent", case.name);
            assert_f64(row.composition_index, want.composition_index, &case.name);
            assert_f64(
                row.volume_weighted_value,
                want.volume_weighted_value,
                &case.name,
            );
            assert_f64(row.equal_sector_value, want.equal_sector_value, &case.name);
            assert_f64(row.divergence_value, want.divergence_value, &case.name);
            assert_eq!(
                row.divergence_state, want.divergence_state,
                "{} divergence",
                case.name
            );
            assert_eq!(
                row.direction_stage, want.direction_stage,
                "{} stage",
                case.name
            );
            assert_f64(row.coverage, want.coverage, &case.name);
            assert_f64(row.confidence, want.confidence, &case.name);
            assert_f64(row.data_quality_score, want.data_quality_score, &case.name);
            assert_eq!(
                row.data_quality_grade, want.data_quality_grade,
                "{} grade",
                case.name
            );
            assert_eq!(row.sample_size, want.sample_size, "{} sample", case.name);
        }
        assert_eq!(
            got.weight_results.len(),
            case.weight_results.len(),
            "{} weight result count",
            case.name
        );
        for (key, want) in case.weight_results {
            let row = got
                .weight_results
                .get(&key)
                .unwrap_or_else(|| panic!("{} missing weight result {key}", case.name));
            assert_eq!(row.weights, want.weights, "{} {key} weights", case.name);
            assert_f64(row.configured_cap, want.configured_cap, &case.name);
            assert_f64(row.effective_cap, want.effective_cap, &case.name);
            assert_eq!(
                row.fallback_rules,
                want.fallback_rules.unwrap_or_default(),
                "{} {key} fallbacks",
                case.name
            );
        }
    }
}
