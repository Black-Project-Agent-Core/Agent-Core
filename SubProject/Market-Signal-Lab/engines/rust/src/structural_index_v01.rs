use std::collections::{BTreeMap, BTreeSet};

#[derive(Debug, Clone, PartialEq)]
pub struct WeightResultV01 {
    pub weights: BTreeMap<String, f64>,
    pub configured_cap: f64,
    pub effective_cap: f64,
    pub fallback_rules: Vec<String>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct DirectionInputV01 {
    pub comparable_runs: usize,
    pub current_volume: f64,
    pub prior_volume: f64,
    pub current_equal: f64,
    pub prior_equal: f64,
    pub base_confidence: f64,
}

#[derive(Debug, Clone, PartialEq)]
pub struct DirectionResultV01 {
    pub stage: String,
    pub direction: String,
    pub trend_score: Option<f64>,
    pub confidence: f64,
    pub reason_codes: Vec<String>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct StructuralSegmentV01 {
    pub level: String,
    pub entity_id: String,
    pub parent_id: String,
    pub volume: f64,
    pub composition: f64,
    pub coverage: f64,
    pub confidence: f64,
    pub data_quality_score: f64,
    pub data_quality_grade: String,
    pub eligible: bool,
}

#[derive(Debug, Clone, PartialEq)]
pub struct StructuralBuildInputV01 {
    pub segments: Vec<StructuralSegmentV01>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct StructuralResultRowV01 {
    pub level: String,
    pub entity_id: String,
    pub parent_id: String,
    pub composition_index: f64,
    pub volume_weighted_value: f64,
    pub equal_sector_value: f64,
    pub divergence_value: f64,
    pub divergence_state: String,
    pub direction_stage: String,
    pub coverage: f64,
    pub confidence: f64,
    pub data_quality_score: f64,
    pub data_quality_grade: String,
    pub sample_size: u32,
}

#[derive(Debug, Clone, PartialEq)]
pub struct StructuralBuildResultV01 {
    pub rows: Vec<StructuralResultRowV01>,
    pub weight_results: BTreeMap<String, WeightResultV01>,
}

pub fn round_index1(value: f64) -> f64 {
    (value * 10.0).round() / 10.0
}

pub fn capped_weights_v01(volumes: &BTreeMap<String, f64>, configured_cap: f64) -> WeightResultV01 {
    let positive: BTreeMap<String, f64> = volumes
        .iter()
        .filter(|(_, value)| **value > 0.0)
        .map(|(key, value)| (key.clone(), *value))
        .collect();
    let keys: Vec<String> = positive.keys().cloned().collect();

    let configured_cap = if configured_cap <= 0.0 || configured_cap > 1.0 {
        1.0
    } else {
        configured_cap
    };

    if keys.is_empty() {
        return WeightResultV01 {
            weights: BTreeMap::new(),
            configured_cap,
            effective_cap: configured_cap,
            fallback_rules: Vec::new(),
        };
    }

    let mut effective_cap = configured_cap;
    let mut fallback_rules = Vec::new();
    let minimum_feasible = 1.0 / keys.len() as f64;
    if effective_cap < minimum_feasible {
        effective_cap = minimum_feasible;
        fallback_rules.push("cap_relaxed_for_small_peer_set".to_string());
    }

    let mut remaining_mass = 1.0;
    let mut uncapped = keys.clone();
    let mut weights = BTreeMap::new();

    while !uncapped.is_empty() {
        let total: f64 = uncapped.iter().map(|key| positive[key]).sum();
        if total <= 0.0 {
            let equal = remaining_mass / uncapped.len() as f64;
            for key in &uncapped {
                weights.insert(key.clone(), equal);
            }
            break;
        }

        let mut capped_any = false;
        let mut next = Vec::new();
        for key in &uncapped {
            let proposed = remaining_mass * positive[key] / total;
            if proposed > effective_cap + 1e-12 {
                weights.insert(key.clone(), effective_cap);
                remaining_mass -= effective_cap;
                capped_any = true;
            } else {
                next.push(key.clone());
            }
        }

        if !capped_any {
            for key in &uncapped {
                weights.insert(key.clone(), remaining_mass * positive[key] / total);
            }
            break;
        }
        uncapped = next;
    }

    let total: f64 = weights.values().sum();
    if (total - 1.0).abs() > 1e-12 {
        let delta = 1.0 - total;
        for key in &keys {
            let candidate = weights.get(key).copied().unwrap_or(0.0) + delta;
            if candidate >= 0.0 && candidate <= effective_cap + 1e-12 {
                weights.insert(key.clone(), candidate);
                break;
            }
        }
    }

    WeightResultV01 {
        weights,
        configured_cap,
        effective_cap,
        fallback_rules,
    }
}

fn equal_sector_value(children: &[(f64, bool)]) -> f64 {
    let mut total = 0.0;
    let mut count = 0usize;
    for (value, eligible) in children {
        if *eligible {
            total += *value;
            count += 1;
        }
    }
    if count == 0 {
        0.0
    } else {
        round_index1(total / count as f64)
    }
}

fn clamp_direction(value: f64) -> f64 {
    round_index1(value.clamp(0.0, 100.0))
}

pub fn stage_for_comparable_runs_v01(count: usize) -> &'static str {
    if count >= 6 {
        "established"
    } else if count >= 3 {
        "preliminary"
    } else if count == 2 {
        "movement"
    } else {
        "composition"
    }
}

pub fn apply_direction_v01(input: DirectionInputV01) -> DirectionResultV01 {
    let stage = stage_for_comparable_runs_v01(input.comparable_runs).to_string();
    let mut confidence = clamp_direction(input.base_confidence);
    let mut result = DirectionResultV01 {
        stage: stage.clone(),
        direction: String::new(),
        trend_score: None,
        confidence,
        reason_codes: Vec::new(),
    };

    if stage == "composition" {
        result.confidence = result.confidence.min(55.0);
        result
            .reason_codes
            .push("current_composition_only".to_string());
        return result;
    }

    let volume_delta = input.current_volume - input.prior_volume;
    let equal_delta = input.current_equal - input.prior_equal;
    let score = round_index1(50.0 + (volume_delta + equal_delta) / 2.0).clamp(0.0, 100.0);
    result.trend_score = Some(score);
    result.direction = if volume_delta >= 5.0 && equal_delta >= 5.0 {
        "rising"
    } else if volume_delta <= -5.0 && equal_delta <= -5.0 {
        "falling"
    } else if volume_delta >= 5.0 && equal_delta < 5.0 {
        "concentrated_rising"
    } else if volume_delta <= -5.0 && equal_delta > -5.0 {
        "concentrated_falling"
    } else {
        "neutral"
    }
    .to_string();

    if stage == "movement" {
        confidence = confidence.min(65.0);
        result
            .reason_codes
            .push("movement_indication_only".to_string());
    } else if stage == "preliminary" {
        confidence = confidence.min(80.0);
        result.reason_codes.push("preliminary_trend".to_string());
    }
    result.confidence = confidence;
    result
}

fn divergence_state(value: f64) -> &'static str {
    if value >= 15.0 {
        "concentrated"
    } else if value >= 8.0 {
        "moderate"
    } else {
        "aligned"
    }
}

fn cap_for_parent(level: &str) -> f64 {
    if level == "global" || level == "site" {
        0.45
    } else {
        0.50
    }
}

fn parent_level(child: &str) -> Option<&'static str> {
    match child {
        "site" => Some("global"),
        "content_type" => Some("site"),
        "catalog" => Some("content_type"),
        "product_type" => Some("catalog"),
        "use_case" => Some("product_type"),
        _ => None,
    }
}

fn grade_for_score(score: f64) -> &'static str {
    if score >= 85.0 {
        "A"
    } else if score >= 70.0 {
        "B"
    } else if score >= 50.0 {
        "C"
    } else {
        "D"
    }
}

fn aggregate_index(
    level: &str,
    entity_id: &str,
    children: &[StructuralSegmentV01],
    cap: f64,
) -> (StructuralResultRowV01, WeightResultV01) {
    let mut volumes = BTreeMap::new();
    let mut equal_children = Vec::new();
    let mut eligible_by_id: BTreeMap<String, StructuralSegmentV01> = BTreeMap::new();
    let mut sample_size: i64 = 0;
    let mut coverage = 0.0;
    let mut confidence = 0.0;
    let mut quality_score = 0.0;
    let mut quality_count = 0usize;

    for child in children {
        if !child.eligible || child.entity_id.is_empty() {
            continue;
        }
        *volumes.entry(child.entity_id.clone()).or_insert(0.0) += child.volume.max(0.0);
        eligible_by_id.insert(child.entity_id.clone(), child.clone());
        equal_children.push((child.composition, true));
        sample_size += child.volume.max(0.0).round() as i64;
        coverage += child.coverage;
        confidence += child.confidence;
        if child.data_quality_score > 0.0 {
            quality_score += child.data_quality_score;
            quality_count += 1;
        }
    }

    let weights = capped_weights_v01(&volumes, cap);
    let mut volume_value = 0.0;
    for (key, weight) in &weights.weights {
        if let Some(child) = eligible_by_id.get(key) {
            volume_value += child.composition * weight;
        }
    }
    let equal_value = equal_sector_value(&equal_children);
    let divergence = round_index1((round_index1(volume_value) - equal_value).abs());
    let count = eligible_by_id.len();
    if count > 0 {
        coverage = round_index1(coverage / count as f64);
        confidence = round_index1(confidence / count as f64);
    }

    let mut grade = "D".to_string();
    if quality_count > 0 {
        quality_score = round_index1(quality_score / quality_count as f64);
        grade = grade_for_score(quality_score).to_string();
    }

    let mut composition = equal_value;
    if count == 1 {
        composition = round_index1(eligible_by_id.values().next().unwrap().composition);
    }

    (
        StructuralResultRowV01 {
            level: level.to_string(),
            entity_id: entity_id.to_string(),
            parent_id: String::new(),
            composition_index: composition,
            volume_weighted_value: round_index1(volume_value),
            equal_sector_value: equal_value,
            divergence_value: divergence,
            divergence_state: divergence_state(divergence).to_string(),
            direction_stage: "composition".to_string(),
            coverage,
            confidence,
            data_quality_score: quality_score,
            data_quality_grade: grade,
            sample_size: sample_size.max(0) as u32,
        },
        weights,
    )
}

pub fn build_structural_index_v01(
    input: &StructuralBuildInputV01,
) -> Result<StructuralBuildResultV01, &'static str> {
    for segment in &input.segments {
        for value in [
            segment.volume,
            segment.composition,
            segment.coverage,
            segment.confidence,
            segment.data_quality_score,
        ] {
            if !value.is_finite() {
                return Err("structural index v0.1 values must be finite");
            }
        }
    }

    let mut hierarchy = Vec::with_capacity(input.segments.len() + 1);
    for segment in &input.segments {
        let grade = if segment.data_quality_grade.is_empty() {
            "D".to_string()
        } else {
            segment.data_quality_grade.clone()
        };
        let value = round_index1(segment.composition);
        hierarchy.push(StructuralResultRowV01 {
            level: segment.level.clone(),
            entity_id: segment.entity_id.clone(),
            parent_id: segment.parent_id.clone(),
            composition_index: value,
            volume_weighted_value: value,
            equal_sector_value: value,
            divergence_value: 0.0,
            divergence_state: "aligned".to_string(),
            direction_stage: "composition".to_string(),
            coverage: segment.coverage,
            confidence: segment.confidence,
            data_quality_score: segment.data_quality_score,
            data_quality_grade: grade,
            sample_size: segment.volume.max(0.0).round() as u32,
        });
    }

    let mut groups: BTreeMap<String, Vec<StructuralSegmentV01>> = BTreeMap::new();
    let mut group_levels: BTreeMap<String, String> = BTreeMap::new();
    for segment in &input.segments {
        let Some(level) = parent_level(&segment.level) else {
            continue;
        };
        let parent_id = if level == "global" {
            "global".to_string()
        } else {
            segment.parent_id.clone()
        };
        if parent_id.is_empty() {
            continue;
        }
        let key = format!("{level}|{parent_id}");
        groups.entry(key.clone()).or_default().push(segment.clone());
        group_levels.insert(key, level.to_string());
    }

    let mut weight_results = BTreeMap::new();
    let mut has_global = false;
    for (key, children) in &groups {
        let level = &group_levels[key];
        let entity_id = key[level.len() + 1..].to_string();
        let (row, weights) = aggregate_index(level, &entity_id, children, cap_for_parent(level));
        if level == "global" {
            has_global = true;
        }
        hierarchy.push(row);
        weight_results.insert(key.clone(), weights);
    }

    if !has_global {
        let top: Vec<StructuralSegmentV01> = input
            .segments
            .iter()
            .filter(|segment| segment.parent_id.is_empty())
            .cloned()
            .collect();
        let (row, weights) = aggregate_index("global", "global", &top, 0.45);
        hierarchy.push(row);
        weight_results.insert("global|global".to_string(), weights);
    }

    let mut seen = BTreeSet::new();
    hierarchy.retain(|row| {
        seen.insert((
            row.level.clone(),
            row.entity_id.clone(),
            row.parent_id.clone(),
        ))
    });
    hierarchy.sort_by(|a, b| {
        a.level
            .cmp(&b.level)
            .then_with(|| a.entity_id.cmp(&b.entity_id))
    });

    Ok(StructuralBuildResultV01 {
        rows: hierarchy,
        weight_results,
    })
}

#[derive(Debug, Clone, PartialEq)]
pub struct StructuralWireSegmentV01 {
    pub segment_key: u32,
    pub parent_key: u32,
    pub level_code: u8,
    pub observed_products: u32,
    pub data_quality_score: f64,
    pub data_quality_grade: u8,
}

#[derive(Debug, Clone, PartialEq)]
pub struct StructuralWireInputV01 {
    pub segments: Vec<StructuralWireSegmentV01>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct StructuralWireResultRowV01 {
    pub segment_key: u32,
    pub parent_key: u32,
    pub level_code: u8,
    pub divergence_state_code: u8,
    pub direction_stage_code: u8,
    pub data_quality_grade: u8,
    pub sample_size: u32,
    pub composition_index: f64,
    pub volume_weighted_value: f64,
    pub equal_sector_value: f64,
    pub divergence_value: f64,
    pub coverage: f64,
    pub confidence: f64,
    pub data_quality_score: f64,
}

#[derive(Debug, Clone, PartialEq)]
pub struct StructuralWireWeightV01 {
    pub segment_key: u32,
    pub weight: f64,
}

#[derive(Debug, Clone, PartialEq)]
pub struct StructuralWireWeightResultV01 {
    pub parent_key: u32,
    pub configured_cap: f64,
    pub effective_cap: f64,
    pub fallback_mask: u32,
    pub weights: Vec<StructuralWireWeightV01>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct StructuralWireResultV01 {
    pub rows: Vec<StructuralWireResultRowV01>,
    pub weight_results: Vec<StructuralWireWeightResultV01>,
}

fn level_name_from_code(code: u8) -> Result<&'static str, &'static str> {
    match code {
        0 => Ok("global"),
        1 => Ok("site"),
        2 => Ok("content_type"),
        3 => Ok("catalog"),
        4 => Ok("product_type"),
        5 => Ok("use_case"),
        _ => Err("structural index v0.1 level code is invalid"),
    }
}

fn level_code_from_name(name: &str) -> Result<u8, &'static str> {
    match name {
        "global" => Ok(0),
        "site" => Ok(1),
        "content_type" => Ok(2),
        "catalog" => Ok(3),
        "product_type" => Ok(4),
        "use_case" => Ok(5),
        _ => Err("structural index v0.1 level is invalid"),
    }
}

fn grade_name_from_code(code: u8) -> Result<&'static str, &'static str> {
    match code {
        1 => Ok("A"),
        2 => Ok("B"),
        3 => Ok("C"),
        4 => Ok("D"),
        _ => Err("structural index v0.1 grade code is invalid"),
    }
}

fn grade_code_from_name(name: &str) -> Result<u8, &'static str> {
    match name {
        "A" => Ok(1),
        "B" => Ok(2),
        "C" => Ok(3),
        "D" | "" => Ok(4),
        _ => Err("structural index v0.1 grade is invalid"),
    }
}

fn divergence_state_code(name: &str) -> Result<u8, &'static str> {
    match name {
        "aligned" => Ok(0),
        "moderate" => Ok(1),
        "concentrated" => Ok(2),
        _ => Err("structural index v0.1 divergence state is invalid"),
    }
}

fn direction_stage_code(name: &str) -> Result<u8, &'static str> {
    match name {
        "composition" => Ok(0),
        "movement" => Ok(1),
        "preliminary" => Ok(2),
        "established" => Ok(3),
        _ => Err("structural index v0.1 direction stage is invalid"),
    }
}

pub fn build_structural_wire_v01(
    input: &StructuralWireInputV01,
) -> Result<StructuralWireResultV01, &'static str> {
    let mut totals: BTreeMap<(u8, u32), u64> = BTreeMap::new();
    for row in &input.segments {
        if row.segment_key == 0 {
            return Err("structural index v0.1 segment key must be non-zero");
        }
        level_name_from_code(row.level_code)?;
        grade_name_from_code(row.data_quality_grade)?;
        if !row.data_quality_score.is_finite() {
            return Err("structural index v0.1 data-quality score must be finite");
        }
        *totals.entry((row.level_code, row.parent_key)).or_default() +=
            row.observed_products as u64;
    }

    let mut legacy_segments = Vec::with_capacity(input.segments.len());
    for row in &input.segments {
        let total = totals
            .get(&(row.level_code, row.parent_key))
            .copied()
            .unwrap_or(0);
        let composition = if total == 0 {
            0.0
        } else {
            round_index1(row.observed_products as f64 * 100.0 / total as f64)
        };
        legacy_segments.push(StructuralSegmentV01 {
            level: level_name_from_code(row.level_code)?.to_string(),
            entity_id: row.segment_key.to_string(),
            parent_id: if row.parent_key == 0 {
                String::new()
            } else {
                row.parent_key.to_string()
            },
            volume: row.observed_products as f64,
            composition,
            // The canonical C1 wire contains the complete selected structural
            // evidence set but not run/persistence metadata. Coverage therefore
            // describes the request evidence itself; domain run coverage remains
            // a Go assembly concern until the production cutover task.
            coverage: 100.0,
            confidence: row.data_quality_score,
            data_quality_score: row.data_quality_score,
            data_quality_grade: grade_name_from_code(row.data_quality_grade)?.to_string(),
            eligible: row.data_quality_grade != 4,
        });
    }

    let built = build_structural_index_v01(&StructuralBuildInputV01 {
        segments: legacy_segments,
    })?;
    let by_key: BTreeMap<u32, &StructuralWireSegmentV01> = input
        .segments
        .iter()
        .map(|row| (row.segment_key, row))
        .collect();

    let mut rows = Vec::with_capacity(built.rows.len());
    for row in &built.rows {
        let segment_key = if row.level == "global" && row.entity_id == "global" {
            0
        } else {
            row.entity_id
                .parse::<u32>()
                .map_err(|_| "structural index v0.1 result key is invalid")?
        };
        let source = by_key.get(&segment_key).copied();
        let parent_key = if row.parent_id.is_empty() {
            source.map(|s| s.parent_key).unwrap_or(0)
        } else {
            row.parent_id
                .parse::<u32>()
                .map_err(|_| "structural index v0.1 result parent key is invalid")?
        };
        rows.push(StructuralWireResultRowV01 {
            segment_key,
            parent_key,
            level_code: level_code_from_name(&row.level)?,
            divergence_state_code: divergence_state_code(&row.divergence_state)?,
            direction_stage_code: direction_stage_code(&row.direction_stage)?,
            data_quality_grade: grade_code_from_name(&row.data_quality_grade)?,
            sample_size: row.sample_size,
            composition_index: row.composition_index,
            volume_weighted_value: row.volume_weighted_value,
            equal_sector_value: row.equal_sector_value,
            divergence_value: row.divergence_value,
            coverage: row.coverage,
            confidence: row.confidence,
            data_quality_score: row.data_quality_score,
        });
    }

    let mut weight_results = Vec::with_capacity(built.weight_results.len());
    for (key, result) in built.weight_results {
        let (_, parent) = key
            .split_once('|')
            .ok_or("structural index v0.1 weight key is invalid")?;
        let parent_key = if parent == "global" {
            0
        } else {
            parent
                .parse::<u32>()
                .map_err(|_| "structural index v0.1 weight parent key is invalid")?
        };
        let mut weights = Vec::with_capacity(result.weights.len());
        for (segment, weight) in result.weights {
            weights.push(StructuralWireWeightV01 {
                segment_key: segment
                    .parse::<u32>()
                    .map_err(|_| "structural index v0.1 weight segment key is invalid")?,
                weight,
            });
        }
        weight_results.push(StructuralWireWeightResultV01 {
            parent_key,
            configured_cap: result.configured_cap,
            effective_cap: result.effective_cap,
            fallback_mask: if result
                .fallback_rules
                .iter()
                .any(|r| r == "cap_relaxed_for_small_peer_set")
            {
                1
            } else {
                0
            },
            weights,
        });
    }
    weight_results.sort_by_key(|r| r.parent_key);

    Ok(StructuralWireResultV01 {
        rows,
        weight_results,
    })
}

const STRUCTURAL_RESULT_HEADER_BYTES: usize = 24;
const STRUCTURAL_RESULT_ROW_BYTES: usize = 72;
const STRUCTURAL_WEIGHT_RESULT_BYTES: usize = 32;
const STRUCTURAL_WEIGHT_BYTES: usize = 16;

pub fn encode_structural_index_v01_result(
    duration_micros: u64,
    result: &StructuralWireResultV01,
) -> Result<Vec<u8>, &'static str> {
    let row_count =
        u32::try_from(result.rows.len()).map_err(|_| "structural result row count overflow")?;
    let weight_result_count = u32::try_from(result.weight_results.len())
        .map_err(|_| "structural weight result count overflow")?;
    let weight_count_usize: usize = result.weight_results.iter().map(|r| r.weights.len()).sum();
    let weight_count =
        u32::try_from(weight_count_usize).map_err(|_| "structural weight count overflow")?;
    let total = STRUCTURAL_RESULT_HEADER_BYTES
        .checked_add(
            result
                .rows
                .len()
                .checked_mul(STRUCTURAL_RESULT_ROW_BYTES)
                .ok_or("structural result size overflow")?,
        )
        .and_then(|v| {
            v.checked_add(
                result
                    .weight_results
                    .len()
                    .checked_mul(STRUCTURAL_WEIGHT_RESULT_BYTES)?,
            )
        })
        .and_then(|v| v.checked_add(weight_count_usize.checked_mul(STRUCTURAL_WEIGHT_BYTES)?))
        .ok_or("structural result size overflow")?;
    let mut out = vec![0u8; total];
    out[0..8].copy_from_slice(&duration_micros.to_le_bytes());
    out[8..12].copy_from_slice(&row_count.to_le_bytes());
    out[12..16].copy_from_slice(&weight_result_count.to_le_bytes());
    out[16..20].copy_from_slice(&weight_count.to_le_bytes());

    let mut off = STRUCTURAL_RESULT_HEADER_BYTES;
    for row in &result.rows {
        out[off..off + 4].copy_from_slice(&row.segment_key.to_le_bytes());
        out[off + 4..off + 8].copy_from_slice(&row.parent_key.to_le_bytes());
        out[off + 8] = row.level_code;
        out[off + 9] = row.divergence_state_code;
        out[off + 10] = row.direction_stage_code;
        out[off + 11] = row.data_quality_grade;
        out[off + 12..off + 16].copy_from_slice(&row.sample_size.to_le_bytes());
        for (field, value) in [
            (16usize, row.composition_index),
            (24, row.volume_weighted_value),
            (32, row.equal_sector_value),
            (40, row.divergence_value),
            (48, row.coverage),
            (56, row.confidence),
            (64, row.data_quality_score),
        ] {
            if !value.is_finite() {
                return Err("structural result value must be finite");
            }
            out[off + field..off + field + 8].copy_from_slice(&value.to_le_bytes());
        }
        off += STRUCTURAL_RESULT_ROW_BYTES;
    }

    let mut weight_start = 0u32;
    for wr in &result.weight_results {
        out[off..off + 4].copy_from_slice(&wr.parent_key.to_le_bytes());
        out[off + 4..off + 8].copy_from_slice(&wr.fallback_mask.to_le_bytes());
        out[off + 8..off + 16].copy_from_slice(&wr.configured_cap.to_le_bytes());
        out[off + 16..off + 24].copy_from_slice(&wr.effective_cap.to_le_bytes());
        out[off + 24..off + 28].copy_from_slice(&weight_start.to_le_bytes());
        let len =
            u32::try_from(wr.weights.len()).map_err(|_| "structural weight length overflow")?;
        out[off + 28..off + 32].copy_from_slice(&len.to_le_bytes());
        weight_start = weight_start
            .checked_add(len)
            .ok_or("structural weight index overflow")?;
        off += STRUCTURAL_WEIGHT_RESULT_BYTES;
    }
    for wr in &result.weight_results {
        for weight in &wr.weights {
            out[off..off + 4].copy_from_slice(&weight.segment_key.to_le_bytes());
            out[off + 8..off + 16].copy_from_slice(&weight.weight.to_le_bytes());
            off += STRUCTURAL_WEIGHT_BYTES;
        }
    }
    Ok(out)
}
