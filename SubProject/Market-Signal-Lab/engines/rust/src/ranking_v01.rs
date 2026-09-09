use std::cmp::Ordering;
use std::collections::{BTreeMap, BTreeSet};

#[derive(Debug, Clone, Copy)]
pub struct RankingModelV01 {
    pub name: &'static str,
    pub version: &'static str,
    pub weights: &'static [(&'static str, f64)],
}

#[derive(Debug, Clone, PartialEq)]
pub struct OptionalWeightedScoreV01 {
    pub score: f64,
    pub missing: Vec<String>,
    pub present_weight: f64,
}

const PRODUCT_EXPOSURE_WEIGHTS: &[(&str, f64)] = &[
    ("median_position", 0.35),
    ("cross_query", 0.20),
    ("surface_strength", 0.10),
    ("rank_velocity", 0.20),
    ("freshness", 0.15),
];

const PRODUCT_OPPORTUNITY_WEIGHTS: &[(&str, f64)] = &[
    ("exposure", 0.40),
    ("relative_strength", 0.25),
    ("freshness", 0.15),
    ("cross_query", 0.10),
    ("rank_velocity", 0.10),
];

const CATALOG_TREND_WEIGHTS: &[(&str, f64)] = &[
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
];

const CATALOG_OPPORTUNITY_WEIGHTS: &[(&str, f64)] = &[
    ("trend", 0.35),
    ("supply_gap", 0.20),
    ("market_breadth", 0.15),
    ("freshness", 0.10),
    ("author_diversity", 0.10),
    ("inverse_competition", 0.10),
];

const DIRECTION_WEIGHTS: &[(&str, f64)] = &[
    ("demand_momentum", 0.25),
    ("market_breadth", 0.25),
    ("exposure_movement", 0.25),
    ("new_product_velocity", 0.10),
    ("relative_strength", 0.15),
];

static MODEL_REGISTRY_V01: [RankingModelV01; 5] = [
    RankingModelV01 {
        name: "product-exposure",
        version: "product-exposure-v0.1",
        weights: PRODUCT_EXPOSURE_WEIGHTS,
    },
    RankingModelV01 {
        name: "product-opportunity",
        version: "product-opportunity-v0.1",
        weights: PRODUCT_OPPORTUNITY_WEIGHTS,
    },
    RankingModelV01 {
        name: "catalog-trend",
        version: "catalog-trend-v0.1",
        weights: CATALOG_TREND_WEIGHTS,
    },
    RankingModelV01 {
        name: "catalog-opportunity",
        version: "catalog-opportunity-v0.1",
        weights: CATALOG_OPPORTUNITY_WEIGHTS,
    },
    RankingModelV01 {
        name: "direction",
        version: "direction-v0.1",
        weights: DIRECTION_WEIGHTS,
    },
];

pub fn model_registry_v01() -> &'static [RankingModelV01] {
    &MODEL_REGISTRY_V01
}

pub fn clamp_100(value: f64) -> f64 {
    if value < 0.0 {
        0.0
    } else if value > 100.0 {
        100.0
    } else {
        value
    }
}

pub fn round_1(value: f64) -> f64 {
    (value * 10.0).round() / 10.0
}

pub fn median(values: &[f64]) -> Option<f64> {
    if values.is_empty() {
        return None;
    }

    let mut sorted = values.to_vec();
    sorted.sort_by(go_float_cmp);

    let mid = sorted.len() / 2;
    if sorted.len() % 2 == 1 {
        Some(sorted[mid])
    } else {
        Some((sorted[mid - 1] + sorted[mid]) / 2.0)
    }
}

pub fn signed_delta_percent(current: f64, previous: f64) -> f64 {
    if previous == 0.0 {
        if current == 0.0 {
            return 0.0;
        }
        return 100.0;
    }

    let mut raw = (current - previous) / previous * 100.0;
    if raw < -200.0 {
        raw = -200.0;
    }
    if raw > 200.0 {
        raw = 200.0;
    }

    round_1(raw)
}

pub fn delta_index(delta_percent: f64) -> f64 {
    round_1(clamp_100(50.0 + delta_percent / 4.0))
}

pub fn percentile_ranks(values: &BTreeMap<String, f64>) -> BTreeMap<String, f64> {
    let mut out = BTreeMap::new();

    if values.is_empty() {
        return out;
    }

    if values.len() == 1 {
        if let Some(key) = values.keys().next() {
            out.insert(key.clone(), 50.0);
        }
        return out;
    }

    let mut pairs: Vec<(&String, f64)> = values.iter().map(|(key, value)| (key, *value)).collect();

    pairs.sort_by(|left, right| {
        if left.1 == right.1 {
            left.0.cmp(right.0)
        } else {
            go_float_cmp(&left.1, &right.1)
        }
    });

    let mut i = 0usize;
    while i < pairs.len() {
        let mut j = i + 1;
        while j < pairs.len() && pairs[j].1 == pairs[i].1 {
            j += 1;
        }

        let average_index = (i as f64 + (j - 1) as f64) / 2.0;
        let percentile = round_1(average_index / (pairs.len() - 1) as f64 * 100.0);

        for pair in &pairs[i..j] {
            out.insert(pair.0.clone(), percentile);
        }

        i = j;
    }

    out
}

pub fn hhi_msl(counts: &BTreeMap<String, i64>) -> f64 {
    let mut total = 0i64;

    for count in counts.values() {
        if *count > 0 {
            total += *count;
        }
    }

    if total == 0 {
        return 0.0;
    }

    let mut sum = 0.0;
    for count in counts.values() {
        if *count <= 0 {
            continue;
        }

        let share = *count as f64 / total as f64;
        sum += share * share;
    }

    round_1(clamp_100(sum * 100.0))
}

pub fn optional_weighted_score(
    features: &BTreeMap<String, Option<f64>>,
    model: &RankingModelV01,
) -> Result<OptionalWeightedScoreV01, &'static str> {
    // Go v0.1 iterates model.Weights as a map, which makes floating-point
    // accumulation order nondeterministic at half-round boundaries. The frozen
    // C1 oracle records 71.3 for the known boundary case; lexical feature
    // ordering reproduces that frozen result deterministically in Rust.
    let mut ordered_weights = model.weights.to_vec();
    ordered_weights.sort_by(|left, right| left.0.cmp(right.0));

    let mut total_weight = 0.0;
    let mut present_weight = 0.0;
    let mut missing = Vec::new();

    for &(name, weight) in &ordered_weights {
        if weight <= 0.0 {
            return Err("model weights must be positive");
        }

        total_weight += weight;

        match features.get(name).and_then(|value| *value) {
            Some(_) => {
                present_weight += weight;
            }
            None => {
                missing.push(name.to_string());
            }
        }
    }

    if total_weight <= 0.0 || present_weight <= 0.0 {
        missing.sort();
        return Err("no model features available");
    }

    missing.sort();

    let mut score = 0.0;

    for &(name, weight) in &ordered_weights {
        let Some(value) = features.get(name).and_then(|value| *value) else {
            continue;
        };

        score += clamp_100(value) * (weight / present_weight);
    }

    Ok(OptionalWeightedScoreV01 {
        score: round_1(score),
        missing,
        present_weight: round_1(present_weight / total_weight),
    })
}

pub fn direction_from_index(value: f64) -> &'static str {
    if value >= 75.0 {
        "strong_rising"
    } else if value >= 60.0 {
        "rising"
    } else if value >= 40.0 {
        "neutral"
    } else if value >= 25.0 {
        "falling"
    } else {
        "strong_falling"
    }
}

// Go's sort.Float64s orders NaN before non-NaN values.
// Preserve that behavior instead of relying on Rust total_cmp.
fn go_float_cmp(left: &f64, right: &f64) -> Ordering {
    match (left.is_nan(), right.is_nan()) {
        (true, true) => Ordering::Equal,
        (true, false) => Ordering::Less,
        (false, true) => Ordering::Greater,
        (false, false) => left.partial_cmp(right).unwrap_or(Ordering::Equal),
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct ProductRankingEntityV01 {
    pub product_key: u32,
    pub catalog_key: u32,
    pub first_seen_bucket: u8,
    pub applicable_query_keys: Vec<u32>,
    pub session_coverages: Vec<f64>,
    pub segmentation_fallback: bool,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ProductRankingObservationV01 {
    pub product_key: u32,
    pub window_bucket: u8,
    pub query_key: u32,
    pub surface_code: u8,
    pub position: i32,
    pub reliability: f64,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ProductRankingInputV01 {
    pub products: Vec<ProductRankingEntityV01>,
    pub observations: Vec<ProductRankingObservationV01>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ProductRankingResultRowV01 {
    pub product_key: u32,
    pub catalog_key: u32,
    pub current_observation_count: u32,
    pub previous_observation_count: u32,
    pub query_appearances: u32,
    pub applicable_queries: u32,
    pub surface_appearances: u32,
    pub median_position: f64,
    pub previous_median_position: Option<f64>,
    pub rank_velocity: f64,
    pub rank_velocity_score: Option<f64>,
    pub exposure_score: f64,
    pub freshness_score: f64,
    pub cross_query_strength: f64,
    pub relative_strength: f64,
    pub opportunity_score: f64,
    pub direction: &'static str,
    pub comparable_history: bool,
    pub confidence: f64,
    pub coverage: f64,
    pub missing: Vec<String>,
}

pub fn build_product_ranking_v01(
    input: &ProductRankingInputV01,
) -> Result<Vec<ProductRankingResultRowV01>, &'static str> {
    let exposure_model = model_registry_v01()
        .iter()
        .find(|model| model.name == "product-exposure")
        .ok_or("product exposure model is unavailable")?;

    let opportunity_model = model_registry_v01()
        .iter()
        .find(|model| model.name == "product-opportunity")
        .ok_or("product opportunity model is unavailable")?;

    let mut products: Vec<&ProductRankingEntityV01> = input.products.iter().collect();
    products.sort_by_key(|product| product.product_key);

    let mut rows = Vec::new();

    for product in products {
        let current: Vec<&ProductRankingObservationV01> = input
            .observations
            .iter()
            .filter(|observation| {
                observation.product_key == product.product_key
                    && observation.window_bucket == 1
                    && observation.position >= 1
            })
            .collect();

        if current.is_empty() {
            continue;
        }

        let previous: Vec<&ProductRankingObservationV01> = input
            .observations
            .iter()
            .filter(|observation| {
                observation.product_key == product.product_key
                    && observation.window_bucket == 2
                    && observation.position >= 1
            })
            .collect();

        let current_positions: Vec<f64> = current
            .iter()
            .map(|observation| f64::from(observation.position))
            .collect();

        let current_median =
            round_1(median(&current_positions).ok_or("current product median is unavailable")?);

        let previous_positions: Vec<f64> = previous
            .iter()
            .map(|observation| f64::from(observation.position))
            .collect();

        let previous_median = median(&previous_positions).map(round_1);
        let comparable_history = previous_median.is_some();

        let applicable: BTreeSet<u32> = product
            .applicable_query_keys
            .iter()
            .copied()
            .filter(|key| *key != 0)
            .collect();

        let query_appearances: BTreeSet<u32> = current
            .iter()
            .map(|observation| observation.query_key)
            .filter(|key| *key != 0)
            .collect();

        let cross_query_strength = if applicable.is_empty() {
            0.0
        } else {
            let matched: BTreeSet<u32> = current
                .iter()
                .map(|observation| observation.query_key)
                .filter(|key| applicable.contains(key))
                .collect();

            round_1(clamp_100(
                matched.len() as f64 / applicable.len() as f64 * 100.0,
            ))
        };

        let surfaces: BTreeSet<u8> = current
            .iter()
            .map(|observation| observation.surface_code)
            .filter(|code| *code != 0)
            .collect();

        let surface_strength = round_1(clamp_100(surfaces.len() as f64 / 3.0 * 100.0));

        let position_score = round_1(clamp_100(102.0 - 2.0 * current_median));

        let freshness_score = match product.first_seen_bucket {
            1 => 100.0,
            2 => 60.0,
            _ => 25.0,
        };

        let (rank_velocity, rank_velocity_score) = if let Some(previous_median) = previous_median {
            let velocity = round_1(previous_median - current_median);
            let score = round_1(clamp_100(50.0 + 5.0 * velocity));
            (velocity, Some(score))
        } else {
            (0.0, None)
        };

        let exposure_features = BTreeMap::from([
            ("median_position".to_string(), Some(position_score)),
            ("cross_query".to_string(), Some(cross_query_strength)),
            ("surface_strength".to_string(), Some(surface_strength)),
            ("rank_velocity".to_string(), rank_velocity_score),
            ("freshness".to_string(), Some(freshness_score)),
        ]);

        let exposure = optional_weighted_score(&exposure_features, exposure_model)?;

        let coverage = if product.session_coverages.is_empty() {
            0.0
        } else {
            let total: f64 = product
                .session_coverages
                .iter()
                .map(|coverage| clamp_100(*coverage))
                .sum();

            round_1(total / product.session_coverages.len() as f64)
        };

        let volume_score = clamp_100(current.len() as f64 / 5.0 * 100.0);

        let temporal_score = if comparable_history { 100.0 } else { 30.0 };

        let reliability_score = {
            let total: f64 = current
                .iter()
                .map(|observation| {
                    let mut reliability = observation.reliability;
                    if reliability < 0.0 {
                        reliability = 0.0;
                    }
                    if reliability > 1.0 {
                        reliability = 1.0;
                    }
                    reliability
                })
                .sum();

            total / current.len() as f64 * 100.0
        };

        let mut confidence = round_1(
            volume_score * 0.25
                + cross_query_strength * 0.20
                + temporal_score * 0.20
                + reliability_score * 0.20
                + coverage * 0.15,
        );

        if !comparable_history && confidence > 60.0 {
            confidence = 60.0;
        }

        if coverage < 25.0 && confidence > 50.0 {
            confidence = 50.0;
        } else if coverage < 50.0 && confidence > 65.0 {
            confidence = 65.0;
        }

        let mut missing: BTreeSet<String> = exposure.missing.into_iter().collect();

        if product.segmentation_fallback {
            missing.insert("segmentation_fallback".to_string());
        }

        rows.push(ProductRankingResultRowV01 {
            product_key: product.product_key,
            catalog_key: product.catalog_key,
            current_observation_count: current.len() as u32,
            previous_observation_count: previous.len() as u32,
            query_appearances: query_appearances.len() as u32,
            applicable_queries: applicable.len() as u32,
            surface_appearances: surfaces.len() as u32,
            median_position: current_median,
            previous_median_position: previous_median,
            rank_velocity,
            rank_velocity_score,
            exposure_score: exposure.score,
            freshness_score,
            cross_query_strength,
            relative_strength: 50.0,
            opportunity_score: 0.0,
            direction: "neutral",
            comparable_history,
            confidence: round_1(confidence),
            coverage,
            missing: missing.into_iter().collect(),
        });
    }

    // Exact v0.1 peer-relative-strength behavior is computed within catalog.
    let mut catalog_groups: BTreeMap<u32, Vec<usize>> = BTreeMap::new();
    for (index, row) in rows.iter().enumerate() {
        catalog_groups
            .entry(row.catalog_key)
            .or_default()
            .push(index);
    }

    for indexes in catalog_groups.values() {
        let mut momentum = BTreeMap::new();

        for index in indexes {
            let row = &rows[*index];

            let value = if let Some(velocity_score) = row.rank_velocity_score {
                row.exposure_score * 0.40 + velocity_score * 0.60
            } else {
                row.exposure_score
            };

            momentum.insert(row.product_key.to_string(), round_1(value));
        }

        let ranks = percentile_ranks(&momentum);

        for index in indexes {
            let key = rows[*index].product_key.to_string();
            rows[*index].relative_strength = *ranks
                .get(&key)
                .ok_or("product relative-strength rank is unavailable")?;
        }
    }

    for row in &mut rows {
        let opportunity_features = BTreeMap::from([
            ("exposure".to_string(), Some(row.exposure_score)),
            ("relative_strength".to_string(), Some(row.relative_strength)),
            ("freshness".to_string(), Some(row.freshness_score)),
            ("cross_query".to_string(), Some(row.cross_query_strength)),
            ("rank_velocity".to_string(), row.rank_velocity_score),
        ]);

        let opportunity = optional_weighted_score(&opportunity_features, opportunity_model)?;

        row.opportunity_score = opportunity.score;

        let mut missing: BTreeSet<String> = row.missing.iter().cloned().collect();
        missing.extend(opportunity.missing);
        row.missing = missing.into_iter().collect();

        row.direction = if row.comparable_history && row.rank_velocity_score.is_some() {
            direction_from_index(
                row.rank_velocity_score
                    .expect("checked rank velocity score"),
            )
        } else {
            "neutral"
        };
    }

    rows.sort_by_key(|row| row.product_key);
    Ok(rows)
}

const PRODUCT_RANKING_V01_RESULT_HEADER_BYTES: usize = 16;
const PRODUCT_RANKING_V01_RESULT_ROW_BYTES: usize = 128;

fn product_direction_code(direction: &str) -> Result<u8, &'static str> {
    match direction {
        "strong_falling" => Ok(0),
        "falling" => Ok(1),
        "neutral" => Ok(2),
        "rising" => Ok(3),
        "strong_rising" => Ok(4),
        _ => Err("product ranking v0.1 direction is invalid"),
    }
}

fn product_missing_mask(missing: &[String]) -> Result<u64, &'static str> {
    let mut mask = 0u64;

    for name in missing {
        match name.as_str() {
            "rank_velocity" => mask |= 1 << 0,
            "segmentation_fallback" => mask |= 1 << 1,
            _ => {
                return Err("product ranking v0.1 contains an unknown missing marker");
            }
        }
    }

    Ok(mask)
}

fn write_product_result_f64(bytes: &mut [u8], offset: usize, value: f64) {
    bytes[offset..offset + 8].copy_from_slice(&value.to_le_bytes());
}

pub fn encode_product_ranking_v01_result(
    duration_micros: u64,
    rows: &[ProductRankingResultRowV01],
) -> Result<Vec<u8>, &'static str> {
    let row_count =
        u32::try_from(rows.len()).map_err(|_| "product ranking v0.1 result row count overflow")?;

    let row_bytes = rows
        .len()
        .checked_mul(PRODUCT_RANKING_V01_RESULT_ROW_BYTES)
        .ok_or("product ranking v0.1 result size overflow")?;

    let total = PRODUCT_RANKING_V01_RESULT_HEADER_BYTES
        .checked_add(row_bytes)
        .ok_or("product ranking v0.1 result size overflow")?;

    let mut out = vec![0u8; total];

    out[0..8].copy_from_slice(&duration_micros.to_le_bytes());
    out[8..12].copy_from_slice(&row_count.to_le_bytes());
    // 12..16 reserved and intentionally zero.

    for (index, row) in rows.iter().enumerate() {
        if row.product_key == 0 {
            return Err("product ranking v0.1 result product key must be non-zero");
        }

        let off =
            PRODUCT_RANKING_V01_RESULT_HEADER_BYTES + index * PRODUCT_RANKING_V01_RESULT_ROW_BYTES;

        out[off..off + 4].copy_from_slice(&row.product_key.to_le_bytes());
        out[off + 4..off + 8].copy_from_slice(&row.current_observation_count.to_le_bytes());
        out[off + 8..off + 12].copy_from_slice(&row.previous_observation_count.to_le_bytes());
        out[off + 12..off + 16].copy_from_slice(&row.query_appearances.to_le_bytes());
        out[off + 16..off + 20].copy_from_slice(&row.applicable_queries.to_le_bytes());
        out[off + 20..off + 24].copy_from_slice(&row.surface_appearances.to_le_bytes());

        let mut flags = 0u32;

        if row.previous_median_position.is_some() {
            flags |= 1 << 0;
        }

        if row.rank_velocity_score.is_some() {
            flags |= 1 << 1;
        }

        if row.comparable_history {
            flags |= 1 << 2;
        }

        out[off + 24..off + 28].copy_from_slice(&flags.to_le_bytes());

        out[off + 28] = product_direction_code(row.direction)?;
        // 29..32 reserved and intentionally zero.

        write_product_result_f64(&mut out, off + 32, row.median_position);

        if let Some(value) = row.previous_median_position {
            write_product_result_f64(&mut out, off + 40, value);
        }

        write_product_result_f64(&mut out, off + 48, row.rank_velocity);

        if let Some(value) = row.rank_velocity_score {
            write_product_result_f64(&mut out, off + 56, value);
        }

        write_product_result_f64(&mut out, off + 64, row.exposure_score);
        write_product_result_f64(&mut out, off + 72, row.freshness_score);
        write_product_result_f64(&mut out, off + 80, row.cross_query_strength);
        write_product_result_f64(&mut out, off + 88, row.relative_strength);
        write_product_result_f64(&mut out, off + 96, row.confidence);
        write_product_result_f64(&mut out, off + 104, row.coverage);
        write_product_result_f64(&mut out, off + 112, row.opportunity_score);

        let missing_mask = product_missing_mask(&row.missing)?;
        out[off + 120..off + 128].copy_from_slice(&missing_mask.to_le_bytes());
    }

    Ok(out)
}

#[derive(Debug, Clone, PartialEq)]
pub struct CatalogRankingEntityV01 {
    pub catalog_key: u32,
    pub peer_group_key: u32,
    pub applicable_query_count: u32,
    pub current_completed_queries: u32,
    pub previous_completed_queries: u32,
    pub current_session_coverages: Vec<f64>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct CatalogRankingObservationV01 {
    pub catalog_key: u32,
    pub product_key: u32,
    pub author_key: u32,
    pub has_author: bool,
    pub query_key: u32,
    pub window_bucket: u8,
    pub reliability: f64,
}

#[derive(Debug, Clone, PartialEq)]
pub struct CatalogProductMembershipV01 {
    pub catalog_key: u32,
    pub product_key: u32,
}

#[derive(Debug, Clone, PartialEq)]
pub struct CatalogProductFirstSeenV01 {
    pub product_key: u32,
    pub first_seen_bucket: u8,
}

#[derive(Debug, Clone, PartialEq)]
pub struct CatalogProductResultV01 {
    pub product_key: u32,
    pub direction_code: u8,
    pub comparable_history: bool,
    pub rank_velocity: f64,
}

#[derive(Debug, Clone, PartialEq)]
pub struct CatalogRankingInputV01 {
    pub catalogs: Vec<CatalogRankingEntityV01>,
    pub observations: Vec<CatalogRankingObservationV01>,
    pub memberships: Vec<CatalogProductMembershipV01>,
    pub first_seen: Vec<CatalogProductFirstSeenV01>,
    pub product_results: Vec<CatalogProductResultV01>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct CatalogRankingResultRowV01 {
    pub catalog_key: u32,
    pub observed_products: u32,
    pub observed_authors: u32,
    pub new_products: u32,
    pub previous_new_products: u32,
    pub rising_products: u32,
    pub neutral_products: u32,
    pub falling_products: u32,
    pub comparable_products: u32,
    pub median_rank_velocity: f64,
    pub exposure_breadth: f64,
    pub demand_momentum_percent: f64,
    pub demand_momentum_index: f64,
    pub new_supply_velocity_percent: f64,
    pub new_supply_velocity_index: f64,
    pub competition_acceleration: f64,
    pub competition_momentum_index: f64,
    pub author_concentration: f64,
    pub author_attribution_coverage: f64,
    pub freshness_index: f64,
    pub relative_strength: f64,
    pub supply_gap: f64,
    pub direction_index: f64,
    pub trend_score: f64,
    pub opportunity_score: f64,
    pub direction: &'static str,
    pub confidence: f64,
    pub coverage: f64,
    pub missing: Vec<String>,
}

pub fn build_catalog_ranking_v01(
    input: &CatalogRankingInputV01,
) -> Result<Vec<CatalogRankingResultRowV01>, &'static str> {
    let direction_model = model_registry_v01()
        .iter()
        .find(|model| model.name == "direction")
        .ok_or("direction model is unavailable")?;
    let trend_model = model_registry_v01()
        .iter()
        .find(|model| model.name == "catalog-trend")
        .ok_or("catalog trend model is unavailable")?;
    let opportunity_model = model_registry_v01()
        .iter()
        .find(|model| model.name == "catalog-opportunity")
        .ok_or("catalog opportunity model is unavailable")?;

    let mut first_seen_by_product = BTreeMap::new();
    for row in &input.first_seen {
        first_seen_by_product.insert(row.product_key, row.first_seen_bucket);
    }

    let mut catalogs: Vec<&CatalogRankingEntityV01> = input.catalogs.iter().collect();
    catalogs.sort_by_key(|catalog| catalog.catalog_key);

    let mut rows = Vec::new();
    let mut row_peer_groups = Vec::new();

    for catalog in catalogs {
        let current: Vec<&CatalogRankingObservationV01> = input
            .observations
            .iter()
            .filter(|observation| {
                observation.catalog_key == catalog.catalog_key && observation.window_bucket == 1
            })
            .collect();

        if current.is_empty() {
            continue;
        }

        let previous: Vec<&CatalogRankingObservationV01> = input
            .observations
            .iter()
            .filter(|observation| {
                observation.catalog_key == catalog.catalog_key && observation.window_bucket == 2
            })
            .collect();

        let current_products: BTreeSet<u32> = current
            .iter()
            .map(|observation| observation.product_key)
            .filter(|product_key| *product_key != 0)
            .collect();
        let previous_products: BTreeSet<u32> = previous
            .iter()
            .map(|observation| observation.product_key)
            .filter(|product_key| *product_key != 0)
            .collect();

        let current_pairs: BTreeSet<(u32, u32)> = current
            .iter()
            .filter_map(|observation| {
                if observation.product_key == 0 || observation.query_key == 0 {
                    None
                } else {
                    Some((observation.product_key, observation.query_key))
                }
            })
            .collect();
        let previous_pairs: BTreeSet<(u32, u32)> = previous
            .iter()
            .filter_map(|observation| {
                if observation.product_key == 0 || observation.query_key == 0 {
                    None
                } else {
                    Some((observation.product_key, observation.query_key))
                }
            })
            .collect();

        let new_products = current_products
            .iter()
            .filter(|product_key| first_seen_by_product.get(product_key).copied() == Some(1))
            .count() as u32;
        let previous_new_products = previous_products
            .iter()
            .filter(|product_key| first_seen_by_product.get(product_key).copied() == Some(2))
            .count() as u32;

        let member_products: BTreeSet<u32> = input
            .memberships
            .iter()
            .filter(|membership| membership.catalog_key == catalog.catalog_key)
            .map(|membership| membership.product_key)
            .collect();

        let mut rising = 0u32;
        let mut neutral = 0u32;
        let mut falling = 0u32;
        let mut velocities = Vec::new();

        for product in &input.product_results {
            if !member_products.contains(&product.product_key) || !product.comparable_history {
                continue;
            }

            velocities.push(product.rank_velocity);
            match product.direction_code {
                0 | 1 => falling += 1,
                3 | 4 => rising += 1,
                _ => neutral += 1,
            }
        }

        let comparable = rising + neutral + falling;
        let exposure_breadth = if comparable == 0 {
            50.0
        } else {
            round_1(50.0 + 50.0 * f64::from(rising as i32 - falling as i32) / comparable as f64)
        };

        let median_rank_velocity = round_1(median(&velocities).unwrap_or(0.0));
        let freshness_index = round_1(clamp_100(
            new_products as f64 / current_products.len() as f64 * 100.0,
        ));

        let mut product_author: BTreeMap<u32, u32> = BTreeMap::new();
        for observation in &current {
            if observation.has_author
                && observation.author_key != 0
                && !product_author.contains_key(&observation.product_key)
            {
                product_author.insert(observation.product_key, observation.author_key);
            }
        }

        let mut author_counts_by_key: BTreeMap<u32, i64> = BTreeMap::new();
        for author_key in product_author.values() {
            *author_counts_by_key.entry(*author_key).or_default() += 1;
        }
        let author_counts: BTreeMap<String, i64> = author_counts_by_key
            .iter()
            .map(|(key, count)| (key.to_string(), *count))
            .collect();
        let observed_authors = author_counts_by_key.len() as u32;
        let author_attribution_coverage = round_1(clamp_100(
            product_author.len() as f64 / current_products.len() as f64 * 100.0,
        ));
        let author_concentration = hhi_msl(&author_counts);

        let current_rate = if catalog.current_completed_queries == 0 {
            0.0
        } else {
            current_pairs.len() as f64 / catalog.current_completed_queries as f64
        };
        let previous_rate = if catalog.previous_completed_queries == 0 {
            0.0
        } else {
            previous_pairs.len() as f64 / catalog.previous_completed_queries as f64
        };

        let demand_momentum_percent = signed_delta_percent(current_rate, previous_rate);
        let demand_momentum_index = delta_index(demand_momentum_percent);
        let new_supply_velocity_percent =
            signed_delta_percent(new_products as f64, previous_new_products as f64);
        let new_supply_velocity_index = delta_index(new_supply_velocity_percent);
        let competition_acceleration = signed_delta_percent(
            current_products.len() as f64,
            previous_products.len() as f64,
        );
        let competition_momentum_index = delta_index(competition_acceleration);
        let exposure_movement = round_1(clamp_100(50.0 + 5.0 * median_rank_velocity));

        let preliminary_direction = optional_weighted_score(
            &BTreeMap::from([
                ("demand_momentum".to_string(), Some(demand_momentum_index)),
                ("market_breadth".to_string(), Some(exposure_breadth)),
                ("exposure_movement".to_string(), Some(exposure_movement)),
                (
                    "new_product_velocity".to_string(),
                    Some(new_supply_velocity_index),
                ),
                ("relative_strength".to_string(), Some(50.0)),
            ]),
            direction_model,
        )?;

        let coverage = if catalog.current_session_coverages.is_empty() {
            0.0
        } else {
            let total: f64 = catalog
                .current_session_coverages
                .iter()
                .map(|coverage| clamp_100(*coverage))
                .sum();
            round_1(total / catalog.current_session_coverages.len() as f64)
        };

        let volume_score = clamp_100(current_products.len() as f64 / 10.0 * 100.0);
        let comparable_share = if current_products.is_empty() {
            0.0
        } else {
            clamp_100(comparable as f64 / current_products.len() as f64 * 100.0)
        };

        let current_queries: BTreeSet<u32> = current
            .iter()
            .map(|observation| observation.query_key)
            .filter(|query_key| *query_key != 0)
            .collect();
        let query_diversity = if catalog.applicable_query_count == 0 {
            0.0
        } else {
            round_1(clamp_100(
                current_queries.len() as f64 / catalog.applicable_query_count as f64 * 100.0,
            ))
        };

        let reliability = {
            let total: f64 = current
                .iter()
                .map(|observation| observation.reliability.clamp(0.0, 1.0))
                .sum();
            total / current.len() as f64 * 100.0
        };

        let mut confidence = round_1(
            volume_score * 0.15
                + comparable_share * 0.25
                + query_diversity * 0.15
                + reliability * 0.15
                + coverage * 0.20
                + author_attribution_coverage * 0.10,
        );
        if previous_products.is_empty() && confidence > 60.0 {
            confidence = 60.0;
        }
        if coverage < 25.0 && confidence > 50.0 {
            confidence = 50.0;
        } else if coverage < 50.0 && confidence > 65.0 {
            confidence = 65.0;
        }

        let mut missing = BTreeSet::new();
        if previous_products.is_empty() {
            missing.insert("previous_window_history".to_string());
        }
        if coverage == 0.0 {
            missing.insert("research_session_coverage".to_string());
        }
        if author_attribution_coverage < 100.0 {
            missing.insert("author_attribution".to_string());
        }

        row_peer_groups.push(catalog.peer_group_key);
        rows.push(CatalogRankingResultRowV01 {
            catalog_key: catalog.catalog_key,
            observed_products: current_products.len() as u32,
            observed_authors,
            new_products,
            previous_new_products,
            rising_products: rising,
            neutral_products: neutral,
            falling_products: falling,
            comparable_products: comparable,
            median_rank_velocity,
            exposure_breadth,
            demand_momentum_percent,
            demand_momentum_index,
            new_supply_velocity_percent,
            new_supply_velocity_index,
            competition_acceleration,
            competition_momentum_index,
            author_concentration,
            author_attribution_coverage,
            freshness_index,
            relative_strength: 50.0,
            supply_gap: 50.0,
            direction_index: preliminary_direction.score,
            trend_score: 0.0,
            opportunity_score: 0.0,
            direction: direction_from_index(preliminary_direction.score),
            confidence,
            coverage,
            missing: missing.into_iter().collect(),
        });
    }

    let mut peer_groups: BTreeMap<u32, Vec<usize>> = BTreeMap::new();
    for (index, peer_group_key) in row_peer_groups.iter().copied().enumerate() {
        peer_groups.entry(peer_group_key).or_default().push(index);
    }

    for indexes in peer_groups.values() {
        let mut momentum_values = BTreeMap::new();
        let mut supply_values = BTreeMap::new();

        for index in indexes {
            let row = &rows[*index];
            momentum_values.insert(
                row.catalog_key.to_string(),
                round_1(
                    row.direction_index * 0.60
                        + row.exposure_breadth * 0.20
                        + row.demand_momentum_index * 0.20,
                ),
            );
            supply_values.insert(row.catalog_key.to_string(), row.observed_products as f64);
        }

        let relative_ranks = percentile_ranks(&momentum_values);
        let supply_ranks = percentile_ranks(&supply_values);

        for index in indexes {
            let key = rows[*index].catalog_key.to_string();
            rows[*index].relative_strength = *relative_ranks
                .get(&key)
                .ok_or("catalog relative-strength rank is unavailable")?;
            rows[*index].supply_gap = round_1(
                100.0
                    - *supply_ranks
                        .get(&key)
                        .ok_or("catalog supply rank is unavailable")?,
            );
        }
    }

    for row in &mut rows {
        let exposure_movement = round_1(clamp_100(50.0 + 5.0 * row.median_rank_velocity));
        let author_diversity = round_1(100.0 - row.author_concentration);

        let direction = optional_weighted_score(
            &BTreeMap::from([
                (
                    "demand_momentum".to_string(),
                    Some(row.demand_momentum_index),
                ),
                ("market_breadth".to_string(), Some(row.exposure_breadth)),
                ("exposure_movement".to_string(), Some(exposure_movement)),
                (
                    "new_product_velocity".to_string(),
                    Some(row.new_supply_velocity_index),
                ),
                ("relative_strength".to_string(), Some(row.relative_strength)),
            ]),
            direction_model,
        )?;
        row.direction_index = direction.score;
        row.direction = direction_from_index(row.direction_index);

        let trend = optional_weighted_score(
            &BTreeMap::from([
                (
                    "demand_momentum".to_string(),
                    Some(row.demand_momentum_index),
                ),
                ("market_breadth".to_string(), Some(row.exposure_breadth)),
                ("exposure_movement".to_string(), Some(exposure_movement)),
                (
                    "new_product_velocity".to_string(),
                    Some(row.new_supply_velocity_index),
                ),
                ("freshness".to_string(), Some(row.freshness_index)),
                ("relative_strength".to_string(), Some(row.relative_strength)),
                ("supply_gap".to_string(), Some(row.supply_gap)),
                (
                    "competition_momentum".to_string(),
                    Some(row.competition_momentum_index),
                ),
                ("author_diversity".to_string(), Some(author_diversity)),
                ("external_trend".to_string(), None),
            ]),
            trend_model,
        )?;
        row.trend_score = trend.score;

        let inverse_competition = round_1(100.0 - row.competition_momentum_index);
        let opportunity = optional_weighted_score(
            &BTreeMap::from([
                ("trend".to_string(), Some(row.trend_score)),
                ("supply_gap".to_string(), Some(row.supply_gap)),
                ("market_breadth".to_string(), Some(row.exposure_breadth)),
                ("freshness".to_string(), Some(row.freshness_index)),
                ("author_diversity".to_string(), Some(author_diversity)),
                ("inverse_competition".to_string(), Some(inverse_competition)),
            ]),
            opportunity_model,
        )?;
        row.opportunity_score = opportunity.score;

        let mut missing: BTreeSet<String> = row.missing.iter().cloned().collect();
        missing.extend(direction.missing);
        missing.extend(trend.missing);
        missing.extend(opportunity.missing);
        row.missing = missing.into_iter().collect();
    }

    rows.sort_by_key(|row| row.catalog_key);
    Ok(rows)
}

const CATALOG_RANKING_V01_RESULT_HEADER_BYTES: usize = 16;
const CATALOG_RANKING_V01_RESULT_ROW_BYTES: usize = 192;

fn catalog_direction_code(direction: &str) -> Result<u8, &'static str> {
    match direction {
        "strong_falling" => Ok(0),
        "falling" => Ok(1),
        "neutral" => Ok(2),
        "rising" => Ok(3),
        "strong_rising" => Ok(4),
        _ => Err("catalog ranking v0.1 direction is invalid"),
    }
}

fn catalog_missing_mask(missing: &[String]) -> Result<u64, &'static str> {
    let mut mask = 0u64;
    for name in missing {
        match name.as_str() {
            "previous_window_history" => mask |= 1 << 0,
            "research_session_coverage" => mask |= 1 << 1,
            "author_attribution" => mask |= 1 << 2,
            "external_trend" => mask |= 1 << 3,
            _ => return Err("catalog ranking v0.1 contains an unknown missing marker"),
        }
    }
    Ok(mask)
}

pub fn encode_catalog_ranking_v01_result(
    duration_micros: u64,
    rows: &[CatalogRankingResultRowV01],
) -> Result<Vec<u8>, &'static str> {
    let row_count =
        u32::try_from(rows.len()).map_err(|_| "catalog ranking v0.1 result row count overflow")?;
    let row_bytes = rows
        .len()
        .checked_mul(CATALOG_RANKING_V01_RESULT_ROW_BYTES)
        .ok_or("catalog ranking v0.1 result size overflow")?;
    let total = CATALOG_RANKING_V01_RESULT_HEADER_BYTES
        .checked_add(row_bytes)
        .ok_or("catalog ranking v0.1 result size overflow")?;
    let mut out = vec![0u8; total];
    out[0..8].copy_from_slice(&duration_micros.to_le_bytes());
    out[8..12].copy_from_slice(&row_count.to_le_bytes());

    for (index, row) in rows.iter().enumerate() {
        if row.catalog_key == 0 {
            return Err("catalog ranking v0.1 result catalog key must be non-zero");
        }
        let off =
            CATALOG_RANKING_V01_RESULT_HEADER_BYTES + index * CATALOG_RANKING_V01_RESULT_ROW_BYTES;
        for (field_off, value) in [
            (0usize, row.catalog_key),
            (4, row.observed_products),
            (8, row.observed_authors),
            (12, row.new_products),
            (16, row.previous_new_products),
            (20, row.rising_products),
            (24, row.neutral_products),
            (28, row.falling_products),
            (32, row.comparable_products),
        ] {
            out[off + field_off..off + field_off + 4].copy_from_slice(&value.to_le_bytes());
        }
        out[off + 36] = catalog_direction_code(row.direction)?;
        for (field_off, value) in [
            (40usize, row.median_rank_velocity),
            (48, row.exposure_breadth),
            (56, row.demand_momentum_percent),
            (64, row.demand_momentum_index),
            (72, row.new_supply_velocity_percent),
            (80, row.new_supply_velocity_index),
            (88, row.competition_acceleration),
            (96, row.competition_momentum_index),
            (104, row.author_concentration),
            (112, row.author_attribution_coverage),
            (120, row.freshness_index),
            (128, row.relative_strength),
            (136, row.supply_gap),
            (144, row.direction_index),
            (152, row.trend_score),
            (160, row.opportunity_score),
            (168, row.confidence),
            (176, row.coverage),
        ] {
            if !value.is_finite() {
                return Err("catalog ranking v0.1 result value must be finite");
            }
            out[off + field_off..off + field_off + 8].copy_from_slice(&value.to_le_bytes());
        }
        let missing_mask = catalog_missing_mask(&row.missing)?;
        out[off + 184..off + 192].copy_from_slice(&missing_mask.to_le_bytes());
    }
    Ok(out)
}
