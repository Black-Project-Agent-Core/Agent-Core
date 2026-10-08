use crate::c3_v02::{
    author_concentration_change_v02, competition_acceleration_v02, directional_momentum_v02,
    movement_divergence_v02, peer_relative_rank_v02,
};
use crate::c3_v02_schema::{
    encode_author_concentration_change_v02_result, encode_competition_acceleration_v02_result,
    encode_directional_momentum_v02_result, encode_movement_divergence_v02_result,
    encode_peer_relative_rank_v02_result, AuthorConcentrationChangeV02View,
    CompetitionAccelerationV02View, DirectionalMomentumV02View, MovementDivergenceV02View,
    PeerRelativeRankV02View,
};
use crate::protocol_v2;
use crate::ranking_v01::{
    build_catalog_ranking_v01, build_product_ranking_v01, encode_catalog_ranking_v01_result,
    encode_product_ranking_v01_result,
};
use crate::ranking_v01_schema::{
    CatalogRankingV01View, ProductRankingV01View, StructuralIndexV01View,
};
use crate::schema_v2::{
    self, ClusterVolatilityView, DistributionSimilarityView, ItemVolatilityView,
    SelectionProbabilityView,
};
use crate::selection::selection_probability_view;
use crate::similarity::distribution_similarity_view;
use crate::structural_direction_v01::{
    build_structural_direction_wire_v01, encode_structural_direction_v01_result,
    StructuralDirectionV01View,
};
use crate::structural_index_v01::{build_structural_wire_v01, encode_structural_index_v01_result};
use crate::volatility::{cluster_volatility_view, item_volatility_view, VolatilityResult};
use std::convert::TryFrom;
use std::time::Instant;

pub const HANDSHAKE_STATUS_OK: u32 = 0;
pub const HANDSHAKE_STATUS_INCOMPATIBLE_PROTOCOL: u32 = 1;
pub const HANDSHAKE_STATUS_MISSING_REQUIRED_OPERATION: u32 = 2;
pub const HANDSHAKE_STATUS_UNSUPPORTED_REQUIRED_FEATURE: u32 = 3;

const SUPPORTED_FEATURE_FLAGS: u32 = 0;
const HANDSHAKE_REQUEST_FIXED_BYTES: usize = 16;
const HANDSHAKE_RESPONSE_FIXED_BYTES: usize = 24;
const HANDSHAKE_REGISTRY_ENTRY_BYTES: usize = 8;
const SCHEMA_V1: u16 = 1;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct HandshakeRequestRegistryEntry {
    pub operation_id: u16,
    pub schema_id: u16,
    pub required_flags: u32,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HandshakeRequest {
    pub required_feature_flags: u32,
    pub host_max_frame_bytes: u64,
    pub registry: Vec<HandshakeRequestRegistryEntry>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct HandshakeResponseRegistryEntry {
    pub operation_id: u16,
    pub schema_id: u16,
    pub supported_flags: u32,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HandshakeResponse {
    pub status: u32,
    pub supported_feature_flags: u32,
    pub worker_max_frame_bytes: u64,
    pub registry: Vec<HandshakeResponseRegistryEntry>,
    pub engine_version: String,
}

#[derive(Debug, Clone, PartialEq)]
pub struct BatchOperationResult {
    pub slot_id: u32,
    pub status: u32,
    pub payload: Vec<u8>,
}

pub fn adaptive_worker_count(
    operation_count: usize,
    combined_elements: usize,
    available_cpus: usize,
) -> usize {
    if operation_count < 2 || combined_elements < 100_000 {
        return 1;
    }
    operation_count.min(available_cpus.max(1)).clamp(1, 4)
}

pub fn decode_handshake_request(payload: &[u8]) -> Result<HandshakeRequest, &'static str> {
    if payload.len() < HANDSHAKE_REQUEST_FIXED_BYTES {
        return Err("analytics v2 handshake request is truncated");
    }

    let required_feature_flags = read_u32(payload, 0)?;
    let registry_count = usize::try_from(read_u32(payload, 4)?)
        .map_err(|_| "analytics v2 handshake registry count exceeds platform size")?;
    let host_max_frame_bytes = read_u64(payload, 8)?;
    if host_max_frame_bytes == 0 {
        return Err("analytics v2 handshake host frame cap must be non-zero");
    }

    let registry_bytes = registry_count
        .checked_mul(HANDSHAKE_REGISTRY_ENTRY_BYTES)
        .ok_or("analytics v2 handshake registry length overflow")?;
    let expected_len = HANDSHAKE_REQUEST_FIXED_BYTES
        .checked_add(registry_bytes)
        .ok_or("analytics v2 handshake request length overflow")?;
    if payload.len() != expected_len {
        return Err("analytics v2 handshake request length is invalid");
    }

    let mut registry = Vec::with_capacity(registry_count);
    for index in 0..registry_count {
        let start = HANDSHAKE_REQUEST_FIXED_BYTES
            .checked_add(
                index
                    .checked_mul(HANDSHAKE_REGISTRY_ENTRY_BYTES)
                    .ok_or("analytics v2 handshake registry offset overflow")?,
            )
            .ok_or("analytics v2 handshake registry offset overflow")?;
        registry.push(HandshakeRequestRegistryEntry {
            operation_id: read_u16(payload, start)?,
            schema_id: read_u16(payload, start + 2)?,
            required_flags: read_u32(payload, start + 4)?,
        });
    }

    Ok(HandshakeRequest {
        required_feature_flags,
        host_max_frame_bytes,
        registry,
    })
}

pub fn negotiate_handshake(request: &HandshakeRequest, engine_version: &str) -> HandshakeResponse {
    let unsupported_feature = request.required_feature_flags & !SUPPORTED_FEATURE_FLAGS != 0
        || request
            .registry
            .iter()
            .any(|entry| entry.required_flags & !SUPPORTED_FEATURE_FLAGS != 0);
    let missing_required_operation = request
        .registry
        .iter()
        .any(|entry| !is_supported_operation_schema(entry.operation_id, entry.schema_id));

    let status = if unsupported_feature {
        HANDSHAKE_STATUS_UNSUPPORTED_REQUIRED_FEATURE
    } else if missing_required_operation {
        HANDSHAKE_STATUS_MISSING_REQUIRED_OPERATION
    } else {
        HANDSHAKE_STATUS_OK
    };

    HandshakeResponse {
        status,
        supported_feature_flags: SUPPORTED_FEATURE_FLAGS,
        worker_max_frame_bytes: protocol_v2::MAX_FRAME_BYTES,
        registry: supported_registry(),
        engine_version: engine_version.to_string(),
    }
}

pub fn encode_handshake_response(response: &HandshakeResponse) -> Result<Vec<u8>, &'static str> {
    if response.status > HANDSHAKE_STATUS_UNSUPPORTED_REQUIRED_FEATURE {
        return Err("analytics v2 handshake response status is invalid");
    }
    if response.worker_max_frame_bytes == 0
        || response.worker_max_frame_bytes > protocol_v2::MAX_FRAME_BYTES
    {
        return Err("analytics v2 handshake worker frame cap is invalid");
    }

    let registry_count = u32::try_from(response.registry.len())
        .map_err(|_| "analytics v2 handshake response registry count overflow")?;
    let version_bytes = response.engine_version.as_bytes();
    let version_len = u16::try_from(version_bytes.len())
        .map_err(|_| "analytics v2 engine version is too long")?;
    let registry_bytes = response
        .registry
        .len()
        .checked_mul(HANDSHAKE_REGISTRY_ENTRY_BYTES)
        .ok_or("analytics v2 handshake response registry length overflow")?;
    let version_start = HANDSHAKE_RESPONSE_FIXED_BYTES
        .checked_add(registry_bytes)
        .ok_or("analytics v2 handshake response version offset overflow")?;
    let raw_len = version_start
        .checked_add(version_bytes.len())
        .ok_or("analytics v2 handshake response length overflow")?;
    let encoded_len = align8(raw_len)?;
    if encoded_len > usize::try_from(protocol_v2::MAX_FRAME_BYTES).unwrap_or(usize::MAX) {
        return Err("analytics v2 handshake response exceeds hard frame limit");
    }

    let mut encoded = vec![0u8; encoded_len];
    encoded[0..4].copy_from_slice(&response.status.to_le_bytes());
    encoded[4..8].copy_from_slice(&response.supported_feature_flags.to_le_bytes());
    encoded[8..16].copy_from_slice(&response.worker_max_frame_bytes.to_le_bytes());
    encoded[16..20].copy_from_slice(&registry_count.to_le_bytes());
    encoded[20..22].copy_from_slice(&version_len.to_le_bytes());

    for (index, entry) in response.registry.iter().enumerate() {
        let start = HANDSHAKE_RESPONSE_FIXED_BYTES + index * HANDSHAKE_REGISTRY_ENTRY_BYTES;
        encoded[start..start + 2].copy_from_slice(&entry.operation_id.to_le_bytes());
        encoded[start + 2..start + 4].copy_from_slice(&entry.schema_id.to_le_bytes());
        encoded[start + 4..start + 8].copy_from_slice(&entry.supported_flags.to_le_bytes());
    }
    encoded[version_start..raw_len].copy_from_slice(version_bytes);

    Ok(encoded)
}

pub fn execute_analytics_batch(frame: &protocol_v2::DecodedFrame<'_>) -> Vec<BatchOperationResult> {
    let available_cpus = std::thread::available_parallelism()
        .map(|count| count.get())
        .unwrap_or(1);
    execute_analytics_batch_with_available_cpus(frame, available_cpus)
}

pub fn execute_analytics_batch_with_available_cpus(
    frame: &protocol_v2::DecodedFrame<'_>,
    available_cpus: usize,
) -> Vec<BatchOperationResult> {
    let operation_count = frame.descriptors.len();
    if operation_count == 0 {
        return Vec::new();
    }

    let combined_elements = frame.descriptors.iter().fold(0usize, |total, descriptor| {
        total.saturating_add(operation_element_count(frame, descriptor))
    });
    let worker_count = adaptive_worker_count(operation_count, combined_elements, available_cpus);
    if worker_count == 1 {
        return execute_analytics_batch_sequential(frame);
    }

    let ranges = worker_ranges(operation_count, worker_count);
    std::thread::scope(|scope| {
        let mut handles = Vec::with_capacity(ranges.len());
        for (start, end) in ranges {
            let handle = scope.spawn(move || {
                frame.descriptors[start..end]
                    .iter()
                    .map(|descriptor| execute_analytics_operation(frame, descriptor))
                    .collect::<Vec<_>>()
            });
            handles.push((start, end, handle));
        }

        let mut results = Vec::with_capacity(operation_count);
        for (start, end, handle) in handles {
            match handle.join() {
                Ok(mut chunk_results) => results.append(&mut chunk_results),
                Err(_) => results.extend(frame.descriptors[start..end].iter().map(|descriptor| {
                    batch_failure(descriptor.slot_id, protocol_v2::STATUS_INTERNAL_ERROR)
                })),
            }
        }
        results
    })
}

fn execute_analytics_batch_sequential(
    frame: &protocol_v2::DecodedFrame<'_>,
) -> Vec<BatchOperationResult> {
    frame
        .descriptors
        .iter()
        .map(|descriptor| execute_analytics_operation(frame, descriptor))
        .collect()
}

fn worker_ranges(operation_count: usize, worker_count: usize) -> Vec<(usize, usize)> {
    let worker_count = worker_count.min(operation_count).max(1);
    let base = operation_count / worker_count;
    let remainder = operation_count % worker_count;
    let mut ranges = Vec::with_capacity(worker_count);
    let mut start = 0usize;

    for worker_index in 0..worker_count {
        let length = base + usize::from(worker_index < remainder);
        let end = start + length;
        ranges.push((start, end));
        start = end;
    }

    ranges
}

fn operation_element_count(
    frame: &protocol_v2::DecodedFrame<'_>,
    descriptor: &protocol_v2::OperationDescriptor,
) -> usize {
    if descriptor.schema_id != SCHEMA_V1 {
        return 0;
    }
    let payload = match frame.payload_for(descriptor) {
        Ok(payload) => payload,
        Err(_) => return 0,
    };

    match descriptor.operation_id {
        protocol_v2::OP_DISTRIBUTION_SIMILARITY => DistributionSimilarityView::parse(payload)
            .map(|view| view.len())
            .unwrap_or(0),
        protocol_v2::OP_ITEM_VOLATILITY => ItemVolatilityView::parse(payload)
            .map(|view| view.len())
            .unwrap_or(0),
        protocol_v2::OP_CLUSTER_VOLATILITY => ClusterVolatilityView::parse(payload)
            .map(|view| view.len())
            .unwrap_or(0),
        protocol_v2::OP_SELECTION_PROBABILITY => SelectionProbabilityView::parse(payload)
            .map(|view| view.len())
            .unwrap_or(0),
        protocol_v2::OP_PRODUCT_RANKING_V01 => ProductRankingV01View::parse(payload)
            .map(|view| view.len())
            .unwrap_or(0),
        protocol_v2::OP_CATALOG_RANKING_V01 => CatalogRankingV01View::parse(payload)
            .map(|view| view.len())
            .unwrap_or(0),
        protocol_v2::OP_STRUCTURAL_INDEX_V01 => StructuralIndexV01View::parse(payload)
            .map(|view| view.len())
            .unwrap_or(0),
        protocol_v2::OP_STRUCTURAL_DIRECTION_V01 => StructuralDirectionV01View::parse(payload)
            .map(|view| view.len())
            .unwrap_or(0),
        protocol_v2::OP_COMPETITION_ACCELERATION_V02 => {
            CompetitionAccelerationV02View::parse(payload)
                .map(|_| 1)
                .unwrap_or(0)
        }
        protocol_v2::OP_DIRECTIONAL_MOMENTUM_V02 => DirectionalMomentumV02View::parse(payload)
            .map(|_| 1)
            .unwrap_or(0),
        protocol_v2::OP_PEER_RELATIVE_RANK_V02 => PeerRelativeRankV02View::parse(payload)
            .map(|view| view.len())
            .unwrap_or(0),
        protocol_v2::OP_AUTHOR_CONCENTRATION_CHANGE_V02 => {
            AuthorConcentrationChangeV02View::parse(payload)
                .map(|_| 1)
                .unwrap_or(0)
        }
        protocol_v2::OP_MOVEMENT_DIVERGENCE_V02 => MovementDivergenceV02View::parse(payload)
            .map(|view| view.len())
            .unwrap_or(0),
        _ => 0,
    }
}

fn execute_analytics_operation(
    frame: &protocol_v2::DecodedFrame<'_>,
    descriptor: &protocol_v2::OperationDescriptor,
) -> BatchOperationResult {
    if !is_known_operation(descriptor.operation_id) {
        return batch_failure(
            descriptor.slot_id,
            protocol_v2::STATUS_UNSUPPORTED_OPERATION,
        );
    }
    if descriptor.schema_id != SCHEMA_V1 {
        return batch_failure(descriptor.slot_id, protocol_v2::STATUS_UNSUPPORTED_SCHEMA);
    }

    let payload = match frame.payload_for(descriptor) {
        Ok(payload) => payload,
        Err(_) => {
            return batch_failure(descriptor.slot_id, protocol_v2::STATUS_MALFORMED_PAYLOAD);
        }
    };
    let started = Instant::now();

    match descriptor.operation_id {
        protocol_v2::OP_DISTRIBUTION_SIMILARITY => {
            let view = match DistributionSimilarityView::parse(payload) {
                Ok(view) => view,
                Err(_) => {
                    return batch_failure(
                        descriptor.slot_id,
                        protocol_v2::STATUS_MALFORMED_PAYLOAD,
                    );
                }
            };
            let score = distribution_similarity_view(view);
            batch_success(
                descriptor.slot_id,
                schema_v2::encode_distribution_similarity_result(elapsed_micros(started), score)
                    .to_vec(),
            )
        }
        protocol_v2::OP_ITEM_VOLATILITY => {
            let view = match ItemVolatilityView::parse(payload) {
                Ok(view) => view,
                Err(_) => {
                    return batch_failure(
                        descriptor.slot_id,
                        protocol_v2::STATUS_MALFORMED_PAYLOAD,
                    );
                }
            };
            let result = item_volatility_view(view);
            encode_volatility_batch_result(descriptor.slot_id, elapsed_micros(started), &result)
        }
        protocol_v2::OP_CLUSTER_VOLATILITY => {
            let view = match ClusterVolatilityView::parse(payload) {
                Ok(view) => view,
                Err(_) => {
                    return batch_failure(
                        descriptor.slot_id,
                        protocol_v2::STATUS_MALFORMED_PAYLOAD,
                    );
                }
            };
            let result = cluster_volatility_view(view);
            encode_volatility_batch_result(descriptor.slot_id, elapsed_micros(started), &result)
        }
        protocol_v2::OP_SELECTION_PROBABILITY => {
            let view = match SelectionProbabilityView::parse(payload) {
                Ok(view) => view,
                Err(_) => {
                    return batch_failure(
                        descriptor.slot_id,
                        protocol_v2::STATUS_MALFORMED_PAYLOAD,
                    );
                }
            };
            let result = match selection_probability_view(view) {
                Ok(result) => result,
                Err(_) => {
                    return batch_failure(descriptor.slot_id, protocol_v2::STATUS_INVALID_INPUT);
                }
            };
            let selected_count = match u64::try_from(result.selected_count) {
                Ok(count) => count,
                Err(_) => {
                    return batch_failure(descriptor.slot_id, protocol_v2::STATUS_INTERNAL_ERROR);
                }
            };
            let eligible_count = match u64::try_from(result.eligible_count) {
                Ok(count) => count,
                Err(_) => {
                    return batch_failure(descriptor.slot_id, protocol_v2::STATUS_INTERNAL_ERROR);
                }
            };
            batch_success(
                descriptor.slot_id,
                schema_v2::encode_selection_probability_result(
                    elapsed_micros(started),
                    result.score,
                    result.selected_weight,
                    result.eligible_weight,
                    selected_count,
                    eligible_count,
                )
                .to_vec(),
            )
        }
        protocol_v2::OP_PRODUCT_RANKING_V01 => {
            let view = match ProductRankingV01View::parse(payload) {
                Ok(view) => view,
                Err(_) => {
                    return batch_failure(
                        descriptor.slot_id,
                        protocol_v2::STATUS_MALFORMED_PAYLOAD,
                    );
                }
            };

            let input = match view.to_owned_input() {
                Ok(input) => input,
                Err(_) => {
                    return batch_failure(
                        descriptor.slot_id,
                        protocol_v2::STATUS_MALFORMED_PAYLOAD,
                    );
                }
            };

            let rows = match build_product_ranking_v01(&input) {
                Ok(rows) => rows,
                Err(_) => {
                    return batch_failure(descriptor.slot_id, protocol_v2::STATUS_INTERNAL_ERROR);
                }
            };

            let encoded = match encode_product_ranking_v01_result(elapsed_micros(started), &rows) {
                Ok(encoded) => encoded,
                Err(_) => {
                    return batch_failure(descriptor.slot_id, protocol_v2::STATUS_INTERNAL_ERROR);
                }
            };

            batch_success(descriptor.slot_id, encoded)
        }
        protocol_v2::OP_CATALOG_RANKING_V01 => {
            let view = match CatalogRankingV01View::parse(payload) {
                Ok(view) => view,
                Err(_) => {
                    return batch_failure(
                        descriptor.slot_id,
                        protocol_v2::STATUS_MALFORMED_PAYLOAD,
                    );
                }
            };
            let input = match view.to_owned_input() {
                Ok(input) => input,
                Err(_) => {
                    return batch_failure(
                        descriptor.slot_id,
                        protocol_v2::STATUS_MALFORMED_PAYLOAD,
                    );
                }
            };
            let rows = match build_catalog_ranking_v01(&input) {
                Ok(rows) => rows,
                Err(_) => {
                    return batch_failure(descriptor.slot_id, protocol_v2::STATUS_INTERNAL_ERROR);
                }
            };
            let encoded = match encode_catalog_ranking_v01_result(elapsed_micros(started), &rows) {
                Ok(encoded) => encoded,
                Err(_) => {
                    return batch_failure(descriptor.slot_id, protocol_v2::STATUS_INTERNAL_ERROR);
                }
            };
            batch_success(descriptor.slot_id, encoded)
        }
        protocol_v2::OP_STRUCTURAL_INDEX_V01 => {
            let view = match StructuralIndexV01View::parse(payload) {
                Ok(view) => view,
                Err(_) => {
                    return batch_failure(
                        descriptor.slot_id,
                        protocol_v2::STATUS_MALFORMED_PAYLOAD,
                    );
                }
            };
            let input = match view.to_owned_input() {
                Ok(input) => input,
                Err(_) => {
                    return batch_failure(
                        descriptor.slot_id,
                        protocol_v2::STATUS_MALFORMED_PAYLOAD,
                    );
                }
            };
            let result = match build_structural_wire_v01(&input) {
                Ok(result) => result,
                Err(_) => {
                    return batch_failure(descriptor.slot_id, protocol_v2::STATUS_INTERNAL_ERROR);
                }
            };
            let encoded = match encode_structural_index_v01_result(elapsed_micros(started), &result)
            {
                Ok(encoded) => encoded,
                Err(_) => {
                    return batch_failure(descriptor.slot_id, protocol_v2::STATUS_INTERNAL_ERROR);
                }
            };
            batch_success(descriptor.slot_id, encoded)
        }
        protocol_v2::OP_STRUCTURAL_DIRECTION_V01 => {
            let view = match StructuralDirectionV01View::parse(payload) {
                Ok(view) => view,
                Err(_) => {
                    return batch_failure(
                        descriptor.slot_id,
                        protocol_v2::STATUS_MALFORMED_PAYLOAD,
                    );
                }
            };
            let input = match view.to_owned_input() {
                Ok(input) => input,
                Err(_) => {
                    return batch_failure(
                        descriptor.slot_id,
                        protocol_v2::STATUS_MALFORMED_PAYLOAD,
                    );
                }
            };
            let result = match build_structural_direction_wire_v01(&input) {
                Ok(result) => result,
                Err(_) => {
                    return batch_failure(descriptor.slot_id, protocol_v2::STATUS_INTERNAL_ERROR);
                }
            };
            let encoded =
                match encode_structural_direction_v01_result(elapsed_micros(started), &result) {
                    Ok(encoded) => encoded,
                    Err(_) => {
                        return batch_failure(
                            descriptor.slot_id,
                            protocol_v2::STATUS_INTERNAL_ERROR,
                        );
                    }
                };
            batch_success(descriptor.slot_id, encoded)
        }
        protocol_v2::OP_COMPETITION_ACCELERATION_V02 => {
            let view = match CompetitionAccelerationV02View::parse(payload) {
                Ok(view) => view,
                Err(_) => {
                    return batch_failure(descriptor.slot_id, protocol_v2::STATUS_MALFORMED_PAYLOAD)
                }
            };
            let result = match competition_acceleration_v02(
                view.older_count(),
                view.prior_count(),
                view.current_count(),
            ) {
                Ok(result) => result,
                Err(_) => {
                    return batch_failure(descriptor.slot_id, protocol_v2::STATUS_INVALID_INPUT)
                }
            };
            match encode_competition_acceleration_v02_result(
                elapsed_micros(started),
                result.previous_delta_percent,
                result.current_delta_percent,
                result.acceleration,
                result.zero_baseline_flags,
            ) {
                Ok(encoded) => batch_success(descriptor.slot_id, encoded.to_vec()),
                Err(_) => batch_failure(descriptor.slot_id, protocol_v2::STATUS_INTERNAL_ERROR),
            }
        }
        protocol_v2::OP_DIRECTIONAL_MOMENTUM_V02 => {
            let view = match DirectionalMomentumV02View::parse(payload) {
                Ok(view) => view,
                Err(_) => {
                    return batch_failure(descriptor.slot_id, protocol_v2::STATUS_MALFORMED_PAYLOAD)
                }
            };
            let result = match directional_momentum_v02(
                view.rising(),
                view.neutral(),
                view.falling(),
            ) {
                Ok(result) => result,
                Err(_) => {
                    return batch_failure(descriptor.slot_id, protocol_v2::STATUS_INVALID_INPUT)
                }
            };
            match encode_directional_momentum_v02_result(
                elapsed_micros(started),
                result.odmi,
                result.magnitude,
                result.comparable_products,
            ) {
                Ok(encoded) => batch_success(descriptor.slot_id, encoded.to_vec()),
                Err(_) => batch_failure(descriptor.slot_id, protocol_v2::STATUS_INTERNAL_ERROR),
            }
        }
        protocol_v2::OP_PEER_RELATIVE_RANK_V02 => {
            let view = match PeerRelativeRankV02View::parse(payload) {
                Ok(view) => view,
                Err(_) => {
                    return batch_failure(descriptor.slot_id, protocol_v2::STATUS_MALFORMED_PAYLOAD)
                }
            };
            let (percentile, peer_group_size) = match peer_relative_rank_v02(&view) {
                Ok(result) => result,
                Err(_) => {
                    return batch_failure(descriptor.slot_id, protocol_v2::STATUS_INVALID_INPUT)
                }
            };
            match encode_peer_relative_rank_v02_result(
                elapsed_micros(started),
                percentile,
                peer_group_size,
            ) {
                Ok(encoded) => batch_success(descriptor.slot_id, encoded.to_vec()),
                Err(_) => batch_failure(descriptor.slot_id, protocol_v2::STATUS_INTERNAL_ERROR),
            }
        }
        protocol_v2::OP_AUTHOR_CONCENTRATION_CHANGE_V02 => {
            let view = match AuthorConcentrationChangeV02View::parse(payload) {
                Ok(view) => view,
                Err(_) => {
                    return batch_failure(descriptor.slot_id, protocol_v2::STATUS_MALFORMED_PAYLOAD)
                }
            };
            let change = match author_concentration_change_v02(view.prior(), view.current()) {
                Ok(change) => change,
                Err(_) => {
                    return batch_failure(descriptor.slot_id, protocol_v2::STATUS_INVALID_INPUT)
                }
            };
            match encode_author_concentration_change_v02_result(elapsed_micros(started), change) {
                Ok(encoded) => batch_success(descriptor.slot_id, encoded.to_vec()),
                Err(_) => batch_failure(descriptor.slot_id, protocol_v2::STATUS_INTERNAL_ERROR),
            }
        }
        protocol_v2::OP_MOVEMENT_DIVERGENCE_V02 => {
            let view = match MovementDivergenceV02View::parse(payload) {
                Ok(view) => view,
                Err(_) => {
                    return batch_failure(descriptor.slot_id, protocol_v2::STATUS_MALFORMED_PAYLOAD)
                }
            };
            let result = match movement_divergence_v02(&view) {
                Ok(result) => result,
                Err(_) => {
                    return batch_failure(descriptor.slot_id, protocol_v2::STATUS_INVALID_INPUT)
                }
            };
            match encode_movement_divergence_v02_result(
                elapsed_micros(started),
                result.product_mass_weighted,
                result.equal_segment,
                result.signed_divergence,
                result.divergence_magnitude,
                result.participation,
                result.eligible_child_count,
                result.total_child_count,
            ) {
                Ok(encoded) => batch_success(descriptor.slot_id, encoded.to_vec()),
                Err(_) => batch_failure(descriptor.slot_id, protocol_v2::STATUS_INTERNAL_ERROR),
            }
        }
        _ => batch_failure(
            descriptor.slot_id,
            protocol_v2::STATUS_UNSUPPORTED_OPERATION,
        ),
    }
}

fn encode_volatility_batch_result(
    slot_id: u32,
    duration_micros: u64,
    result: &VolatilityResult,
) -> BatchOperationResult {
    let label = match result.label.as_str() {
        "stable" => 0,
        "variable" => 1,
        "unstable" => 2,
        "extreme" => 3,
        _ => return batch_failure(slot_id, protocol_v2::STATUS_INTERNAL_ERROR),
    };
    match schema_v2::encode_volatility_result(
        duration_micros,
        label,
        result.score,
        result.rank_variance,
        result.absence_rate,
        result.median_absolute_deviation,
        result.rbo_persistence,
        result.consecutive_persistence,
    ) {
        Ok(payload) => batch_success(slot_id, payload.to_vec()),
        Err(_) => batch_failure(slot_id, protocol_v2::STATUS_INTERNAL_ERROR),
    }
}

fn batch_success(slot_id: u32, payload: Vec<u8>) -> BatchOperationResult {
    BatchOperationResult {
        slot_id,
        status: protocol_v2::STATUS_OK,
        payload,
    }
}

fn batch_failure(slot_id: u32, status: u32) -> BatchOperationResult {
    BatchOperationResult {
        slot_id,
        status,
        payload: Vec::new(),
    }
}

fn elapsed_micros(started: Instant) -> u64 {
    u64::try_from(started.elapsed().as_micros()).unwrap_or(u64::MAX)
}

fn supported_registry() -> Vec<HandshakeResponseRegistryEntry> {
    [
        protocol_v2::OP_DISTRIBUTION_SIMILARITY,
        protocol_v2::OP_ITEM_VOLATILITY,
        protocol_v2::OP_CLUSTER_VOLATILITY,
        protocol_v2::OP_SELECTION_PROBABILITY,
        protocol_v2::OP_PRODUCT_RANKING_V01,
        protocol_v2::OP_CATALOG_RANKING_V01,
        protocol_v2::OP_STRUCTURAL_INDEX_V01,
        protocol_v2::OP_STRUCTURAL_DIRECTION_V01,
        protocol_v2::OP_COMPETITION_ACCELERATION_V02,
        protocol_v2::OP_DIRECTIONAL_MOMENTUM_V02,
        protocol_v2::OP_PEER_RELATIVE_RANK_V02,
        protocol_v2::OP_AUTHOR_CONCENTRATION_CHANGE_V02,
        protocol_v2::OP_MOVEMENT_DIVERGENCE_V02,
    ]
    .into_iter()
    .map(|operation_id| HandshakeResponseRegistryEntry {
        operation_id,
        schema_id: SCHEMA_V1,
        supported_flags: 0,
    })
    .collect()
}

fn is_supported_operation_schema(operation_id: u16, schema_id: u16) -> bool {
    schema_id == SCHEMA_V1 && is_known_operation(operation_id)
}

fn is_known_operation(operation_id: u16) -> bool {
    matches!(
        operation_id,
        protocol_v2::OP_DISTRIBUTION_SIMILARITY
            | protocol_v2::OP_ITEM_VOLATILITY
            | protocol_v2::OP_CLUSTER_VOLATILITY
            | protocol_v2::OP_SELECTION_PROBABILITY
            | protocol_v2::OP_PRODUCT_RANKING_V01
            | protocol_v2::OP_CATALOG_RANKING_V01
            | protocol_v2::OP_STRUCTURAL_INDEX_V01
            | protocol_v2::OP_STRUCTURAL_DIRECTION_V01
            | protocol_v2::OP_COMPETITION_ACCELERATION_V02
            | protocol_v2::OP_DIRECTIONAL_MOMENTUM_V02
            | protocol_v2::OP_PEER_RELATIVE_RANK_V02
            | protocol_v2::OP_AUTHOR_CONCENTRATION_CHANGE_V02
            | protocol_v2::OP_MOVEMENT_DIVERGENCE_V02
    )
}

fn align8(value: usize) -> Result<usize, &'static str> {
    value
        .checked_add(7)
        .map(|aligned| aligned & !7)
        .ok_or("analytics v2 handshake alignment overflow")
}

fn read_u16(bytes: &[u8], offset: usize) -> Result<u16, &'static str> {
    let end = offset
        .checked_add(2)
        .ok_or("analytics v2 handshake u16 offset overflow")?;
    let raw: [u8; 2] = bytes
        .get(offset..end)
        .ok_or("analytics v2 handshake u16 field is truncated")?
        .try_into()
        .map_err(|_| "analytics v2 handshake u16 field is truncated")?;
    Ok(u16::from_le_bytes(raw))
}

fn read_u32(bytes: &[u8], offset: usize) -> Result<u32, &'static str> {
    let end = offset
        .checked_add(4)
        .ok_or("analytics v2 handshake u32 offset overflow")?;
    let raw: [u8; 4] = bytes
        .get(offset..end)
        .ok_or("analytics v2 handshake u32 field is truncated")?
        .try_into()
        .map_err(|_| "analytics v2 handshake u32 field is truncated")?;
    Ok(u32::from_le_bytes(raw))
}

fn read_u64(bytes: &[u8], offset: usize) -> Result<u64, &'static str> {
    let end = offset
        .checked_add(8)
        .ok_or("analytics v2 handshake u64 offset overflow")?;
    let raw: [u8; 8] = bytes
        .get(offset..end)
        .ok_or("analytics v2 handshake u64 field is truncated")?
        .try_into()
        .map_err(|_| "analytics v2 handshake u64 field is truncated")?;
    Ok(u64::from_le_bytes(raw))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::protocol_v2::{
        MAX_FRAME_BYTES, OP_CATALOG_RANKING_V01, OP_CLUSTER_VOLATILITY, OP_DISTRIBUTION_SIMILARITY,
        OP_ITEM_VOLATILITY, OP_PRODUCT_RANKING_V01, OP_SELECTION_PROBABILITY,
        OP_STRUCTURAL_DIRECTION_V01, OP_STRUCTURAL_INDEX_V01,
    };

    fn handshake_request_payload(host_max_frame_bytes: u64) -> Vec<u8> {
        let registry = [
            (OP_DISTRIBUTION_SIMILARITY, 1u16, 0u32),
            (OP_ITEM_VOLATILITY, 1u16, 0u32),
            (OP_CLUSTER_VOLATILITY, 1u16, 0u32),
            (OP_SELECTION_PROBABILITY, 1u16, 0u32),
            (OP_PRODUCT_RANKING_V01, 1u16, 0u32),
            (OP_CATALOG_RANKING_V01, 1u16, 0u32),
            (OP_STRUCTURAL_INDEX_V01, 1u16, 0u32),
            (OP_STRUCTURAL_DIRECTION_V01, 1u16, 0u32),
        ];

        let mut payload = Vec::with_capacity(16 + registry.len() * 8);
        payload.extend_from_slice(&0u32.to_le_bytes()); // requiredFeatureFlags
        payload.extend_from_slice(&(registry.len() as u32).to_le_bytes());
        payload.extend_from_slice(&host_max_frame_bytes.to_le_bytes());
        for (operation_id, schema_id, required_flags) in registry {
            payload.extend_from_slice(&operation_id.to_le_bytes());
            payload.extend_from_slice(&schema_id.to_le_bytes());
            payload.extend_from_slice(&required_flags.to_le_bytes());
        }
        payload
    }

    #[test]
    fn handshake_accepts_all_required_schema_pairs_and_exposes_worker_frame_cap() {
        let host_max = 64u64 << 20;
        let payload = handshake_request_payload(host_max);
        let request = decode_handshake_request(&payload).expect("valid handshake request");

        assert_eq!(request.required_feature_flags, 0);
        assert_eq!(request.host_max_frame_bytes, host_max);
        assert_eq!(request.registry.len(), 8);
        assert_eq!(
            request
                .registry
                .iter()
                .map(|entry| (entry.operation_id, entry.schema_id, entry.required_flags))
                .collect::<Vec<_>>(),
            vec![
                (1, 1, 0),
                (2, 1, 0),
                (3, 1, 0),
                (4, 1, 0),
                (5, 1, 0),
                (6, 1, 0),
                (7, 1, 0),
                (8, 1, 0),
            ]
        );

        let response = negotiate_handshake(&request, "0.1.0");
        assert_eq!(response.status, HANDSHAKE_STATUS_OK);
        assert_eq!(response.supported_feature_flags, 0);
        assert_eq!(response.worker_max_frame_bytes, MAX_FRAME_BYTES);
        assert_eq!(response.registry.len(), 13);
        assert_eq!(response.registry.last().unwrap().operation_id, 13);
        assert_eq!(response.engine_version, "0.1.0");

        let encoded = encode_handshake_response(&response).expect("handshake response encoding");
        assert_eq!(u32::from_le_bytes(encoded[0..4].try_into().unwrap()), 0);
        assert_eq!(
            u64::from_le_bytes(encoded[8..16].try_into().unwrap()),
            MAX_FRAME_BYTES
        );
        assert_eq!(u32::from_le_bytes(encoded[16..20].try_into().unwrap()), 13);
        assert_eq!(u16::from_le_bytes(encoded[20..22].try_into().unwrap()), 5);
        assert_eq!(&encoded[128..133], b"0.1.0");
        assert!(encoded[133..136].iter().all(|byte| *byte == 0));
    }
}
