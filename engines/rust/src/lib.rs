#[path = "batch_v2.rs"]
mod batch_v2_impl;
mod response_v2;

pub mod batch_v2 {
    pub use crate::batch_v2_impl::*;
    pub use crate::response_v2::encode_analytics_response_frame;
}

pub mod c3_v02;
pub mod c3_v02_schema;
pub mod protocol_v2;
pub mod ranking_v01;
pub mod ranking_v01_schema;
pub mod schema_v2;
pub mod selection;
pub mod similarity;
pub mod structural_direction_v01;
pub mod structural_index_v01;
pub mod volatility;
pub mod worker_v2;

#[cfg(test)]
mod tests {
    use crate::protocol_v2::{
        decode_frame, OP_CLUSTER_VOLATILITY, OP_DISTRIBUTION_SIMILARITY, OP_ITEM_VOLATILITY,
        OP_SELECTION_PROBABILITY, STATUS_INTERNAL_ERROR, STATUS_INVALID_INPUT,
        STATUS_MALFORMED_PAYLOAD, STATUS_OK, STATUS_UNSUPPORTED_OPERATION,
        STATUS_UNSUPPORTED_SCHEMA,
    };
    use crate::schema_v2::{
        ClusterVolatilityView, DistributionSimilarityView, ItemVolatilityView,
        SelectionProbabilityView,
    };
    use crate::selection::{
        selection_probability, selection_probability_view, SelectionObservation,
        SelectionProbabilityInput,
    };
    use crate::similarity::{
        distribution_similarity, distribution_similarity_view, DistributionSimilarityInput,
    };
    use crate::volatility::{
        cluster_volatility, cluster_volatility_view, item_volatility, item_volatility_view,
        ClusterVolatilityInput, ItemVolatilityInput, VolatilityResult,
    };
    use std::collections::HashMap;

    fn decode_hex(text: &str) -> Vec<u8> {
        let compact: Vec<u8> = text.bytes().filter(|b| !b.is_ascii_whitespace()).collect();
        assert_eq!(compact.len() % 2, 0);
        compact
            .chunks_exact(2)
            .map(|pair| {
                fn nibble(b: u8) -> u8 {
                    match b {
                        b'0'..=b'9' => b - b'0',
                        b'a'..=b'f' => b - b'a' + 10,
                        b'A'..=b'F' => b - b'A' + 10,
                        _ => panic!("invalid hex fixture"),
                    }
                }
                (nibble(pair[0]) << 4) | nibble(pair[1])
            })
            .collect()
    }

    fn request_fixture() -> Vec<u8> {
        decode_hex(include_str!(
            "../../../testdata/analytics_v2/analytics_request_four_ops.hex"
        ))
    }

    fn operation_payload(operation_id: u16) -> Vec<u8> {
        let bytes = request_fixture();
        let frame = decode_frame(&bytes).expect("valid v2 request fixture");
        let descriptor = frame
            .descriptors
            .iter()
            .find(|descriptor| descriptor.operation_id == operation_id)
            .expect("operation descriptor");
        frame
            .payload_for(descriptor)
            .expect("operation payload")
            .to_vec()
    }

    fn assert_volatility_exact(got: &VolatilityResult, want: &VolatilityResult) {
        assert_eq!(got.label, want.label);
        assert_eq!(got.score.to_bits(), want.score.to_bits());
        assert_eq!(got.rank_variance.to_bits(), want.rank_variance.to_bits());
        assert_eq!(got.absence_rate.to_bits(), want.absence_rate.to_bits());
        assert_eq!(
            got.median_absolute_deviation.to_bits(),
            want.median_absolute_deviation.to_bits()
        );
        assert_eq!(
            got.rbo_persistence.to_bits(),
            want.rbo_persistence.to_bits()
        );
        assert_eq!(
            got.consecutive_persistence.to_bits(),
            want.consecutive_persistence.to_bits()
        );
    }

    #[test]
    fn v2_public_api_surface_is_fully_exercised_before_runtime_cutover() {
        assert_eq!(
            [
                STATUS_OK,
                STATUS_INVALID_INPUT,
                STATUS_UNSUPPORTED_OPERATION,
                STATUS_UNSUPPORTED_SCHEMA,
                STATUS_MALFORMED_PAYLOAD,
                STATUS_INTERNAL_ERROR,
            ],
            [0, 1, 2, 3, 4, 5],
        );

        let bytes = request_fixture();
        let frame = decode_frame(&bytes).expect("valid v2 request fixture");
        for descriptor in &frame.descriptors {
            let payload = frame.payload_for(descriptor).expect("operation payload");
            match descriptor.operation_id {
                OP_DISTRIBUTION_SIMILARITY => {
                    let view =
                        DistributionSimilarityView::parse(payload).expect("distribution view");
                    assert!(!view.is_empty());
                }
                OP_ITEM_VOLATILITY => {
                    let view = ItemVolatilityView::parse(payload).expect("item view");
                    assert!(!view.is_empty());
                }
                OP_CLUSTER_VOLATILITY => {
                    let view = ClusterVolatilityView::parse(payload).expect("cluster view");
                    assert!(!view.is_empty());
                }
                OP_SELECTION_PROBABILITY => {
                    let view = SelectionProbabilityView::parse(payload).expect("selection view");
                    assert!(!view.is_empty());
                }
                other => panic!("unexpected operation id {other}"),
            }
        }
    }

    #[test]
    fn distribution_view_kernel_matches_owned_kernel_exactly() {
        let owned = DistributionSimilarityInput {
            a: HashMap::from([("a".to_string(), 2.0), ("b".to_string(), 1.0)]),
            b: HashMap::from([("a".to_string(), 1.0), ("c".to_string(), 2.0)]),
        };
        let expected = distribution_similarity(&owned);
        let payload = operation_payload(OP_DISTRIBUTION_SIMILARITY);
        let view = DistributionSimilarityView::parse(&payload).expect("distribution view");
        let got = distribution_similarity_view(view);

        assert_eq!(got.to_bits(), expected.to_bits());
        assert!((got - 45.914_791_702_724_48).abs() <= 1e-12);
    }

    #[test]
    fn selection_view_kernel_matches_owned_kernel_exactly() {
        let owned = SelectionProbabilityInput {
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
        };
        let expected = selection_probability(&owned).expect("owned selection result");
        let payload = operation_payload(OP_SELECTION_PROBABILITY);
        let view = SelectionProbabilityView::parse(&payload).expect("selection view");
        let got = selection_probability_view(view).expect("view selection result");

        assert_eq!(got.score.to_bits(), expected.score.to_bits());
        assert_eq!(got.selected_count, expected.selected_count);
        assert_eq!(got.eligible_count, expected.eligible_count);
        assert_eq!(
            got.selected_weight.to_bits(),
            expected.selected_weight.to_bits()
        );
        assert_eq!(
            got.eligible_weight.to_bits(),
            expected.eligible_weight.to_bits()
        );
    }

    #[test]
    fn item_volatility_view_kernel_matches_owned_kernel_exactly() {
        let owned = ItemVolatilityInput {
            ranks: vec![Some(5), None],
            top_k: 10,
            consecutive_appearances: 1,
            eligible_snapshots: 2,
            rbo_to_previous: 80.0,
        };
        let expected = item_volatility(&owned);
        let payload = operation_payload(OP_ITEM_VOLATILITY);
        let view = ItemVolatilityView::parse(&payload).expect("item volatility view");
        let got = item_volatility_view(view);

        assert_volatility_exact(&got, &expected);
    }

    #[test]
    fn cluster_volatility_view_kernel_matches_owned_kernel_exactly() {
        let owned = ClusterVolatilityInput {
            shares: vec![10.0, 12.0],
            context_disagreement: 20.0,
            cross_time_persistence: 75.0,
        };
        let expected = cluster_volatility(&owned);
        let payload = operation_payload(OP_CLUSTER_VOLATILITY);
        let view = ClusterVolatilityView::parse(&payload).expect("cluster volatility view");
        let got = cluster_volatility_view(view);

        assert_volatility_exact(&got, &expected);
    }
}
