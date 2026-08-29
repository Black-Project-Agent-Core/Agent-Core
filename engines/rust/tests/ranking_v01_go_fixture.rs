use msl_analytics_rust::batch_v2::execute_analytics_batch;
use msl_analytics_rust::protocol_v2::{
    decode_frame, OP_CATALOG_RANKING_V01, OP_PRODUCT_RANKING_V01, OP_STRUCTURAL_INDEX_V01,
    STATUS_OK,
};
use msl_analytics_rust::ranking_v01_schema::{
    CatalogRankingV01View, ProductRankingV01View, StructuralIndexV01View,
};
use std::fs;
use std::path::PathBuf;

fn decode_hex(text: &str) -> Vec<u8> {
    let compact: Vec<u8> = text
        .bytes()
        .filter(|byte| !byte.is_ascii_whitespace())
        .collect();
    assert_eq!(compact.len() % 2, 0, "hex fixture length must be even");
    compact
        .chunks_exact(2)
        .map(|pair| {
            fn nibble(byte: u8) -> u8 {
                match byte {
                    b'0'..=b'9' => byte - b'0',
                    b'a'..=b'f' => byte - b'a' + 10,
                    b'A'..=b'F' => byte - b'A' + 10,
                    _ => panic!("invalid hex fixture byte"),
                }
            }
            (nibble(pair[0]) << 4) | nibble(pair[1])
        })
        .collect()
}

fn go_fixture_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .join("testdata/analytics_v2/c1/ranking_request_three_ops.hex")
}

#[test]
fn go_generated_ranking_request_parses_in_rust() {
    let path = go_fixture_path();
    let text = fs::read_to_string(&path).unwrap_or_else(|error| {
        panic!(
            "Go-generated C1 ranking wire fixture missing at {}: {error}",
            path.display()
        )
    });
    let bytes = decode_hex(&text);
    let frame =
        decode_frame(&bytes).expect("Go-generated ranking request must be a valid v2 frame");

    assert_eq!(frame.header.request_id, 902);
    assert_eq!(frame.descriptors.len(), 3);

    let expected_ops = [
        OP_PRODUCT_RANKING_V01,
        OP_CATALOG_RANKING_V01,
        OP_STRUCTURAL_INDEX_V01,
    ];
    for (descriptor, expected_op) in frame.descriptors.iter().zip(expected_ops) {
        assert_eq!(descriptor.operation_id, expected_op);
        assert_eq!(descriptor.schema_id, 1);
    }

    let product_payload = frame
        .payload_for(&frame.descriptors[0])
        .expect("product ranking payload");
    let product = ProductRankingV01View::parse(product_payload)
        .expect("Rust must parse Go-generated product ranking payload");
    assert_eq!(product.product_count(), 1);
    assert_eq!(product.observation_count(), 1);
    assert_eq!(product.product_key(0), Some(1));
    assert_eq!(product.catalog_key(0), Some(11));
    assert_eq!(product.observation_product_key(0), Some(1));

    let catalog_payload = frame
        .payload_for(&frame.descriptors[1])
        .expect("catalog ranking payload");
    let catalog = CatalogRankingV01View::parse(catalog_payload)
        .expect("Rust must parse Go-generated catalog ranking payload");
    assert_eq!(catalog.catalog_count(), 1);
    assert_eq!(catalog.catalog_key(0), Some(11));

    let structural_payload = frame
        .payload_for(&frame.descriptors[2])
        .expect("structural index payload");
    let structural = StructuralIndexV01View::parse(structural_payload)
        .expect("Rust must parse Go-generated structural-index payload");
    assert_eq!(structural.segment_count(), 1);
    assert_eq!(structural.segment_key(0), Some(21));
    assert_eq!(structural.observed_products(0), Some(40));
    assert_eq!(
        structural.data_quality_score(0).map(f64::to_bits),
        Some(90.0f64.to_bits())
    );

    let results = execute_analytics_batch(&frame);
    assert_eq!(results.len(), 3);

    let product_result = results
        .iter()
        .find(|result| result.slot_id == 51)
        .expect("product ranking result slot 51");
    assert_eq!(
        product_result.status, STATUS_OK,
        "Task 4 product kernel must execute successfully"
    );
    assert!(
        !product_result.payload.is_empty(),
        "successful product ranking must return a payload"
    );

    let catalog_result = results
        .iter()
        .find(|result| result.slot_id == 52)
        .expect("catalog ranking result slot 52");
    assert_eq!(
        catalog_result.status, STATUS_OK,
        "Task 5 catalog kernel must execute successfully"
    );
    assert!(
        !catalog_result.payload.is_empty(),
        "successful catalog ranking must return a payload"
    );

    let structural_result = results
        .iter()
        .find(|result| result.slot_id == 53)
        .expect("structural ranking result slot 53");
    assert_eq!(
        structural_result.status, STATUS_OK,
        "Task 6 structural kernel must execute successfully"
    );
    assert!(
        !structural_result.payload.is_empty(),
        "successful structural index must return a payload"
    );
}
