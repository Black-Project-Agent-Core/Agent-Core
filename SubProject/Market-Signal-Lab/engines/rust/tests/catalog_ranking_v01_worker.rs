use msl_analytics_rust::batch_v2::execute_analytics_batch;
use msl_analytics_rust::protocol_v2::{decode_frame, STATUS_INTERNAL_ERROR, STATUS_OK};

const CATALOG_RESULT_HEADER_BYTES: usize = 16;
const CATALOG_RESULT_ROW_BYTES: usize = 192;

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
                    _ => panic!("invalid hex fixture"),
                }
            }

            (nibble(pair[0]) << 4) | nibble(pair[1])
        })
        .collect()
}

fn read_u32(bytes: &[u8], offset: usize) -> u32 {
    u32::from_le_bytes(bytes[offset..offset + 4].try_into().unwrap())
}

fn read_u64(bytes: &[u8], offset: usize) -> u64 {
    u64::from_le_bytes(bytes[offset..offset + 8].try_into().unwrap())
}

fn read_f64(bytes: &[u8], offset: usize) -> f64 {
    f64::from_le_bytes(bytes[offset..offset + 8].try_into().unwrap())
}

fn assert_exact(got: f64, want: f64, label: &str) {
    assert_eq!(
        got.to_bits(),
        want.to_bits(),
        "{label}: got={got:?} want={want:?}"
    );
}

#[test]
fn catalog_ranking_v01_go_wire_executes_real_rust_kernel() {
    let bytes = decode_hex(include_str!(
        "../../../testdata/analytics_v2/c1/ranking_request_three_ops.hex"
    ));
    let frame = decode_frame(&bytes).expect("Go-generated ranking request must decode");
    let results = execute_analytics_batch(&frame);

    assert_eq!(results.len(), 3);

    let catalog = results
        .iter()
        .find(|result| result.slot_id == 52)
        .expect("catalog ranking slot 52");

    assert_ne!(
        catalog.status, STATUS_INTERNAL_ERROR,
        "Task 5 worker RED: op-6 still uses the Task 2 placeholder INTERNAL_ERROR"
    );
    assert_eq!(
        catalog.status, STATUS_OK,
        "valid CatalogRankingV01 input must execute successfully"
    );

    assert_eq!(
        catalog.payload.len(),
        CATALOG_RESULT_HEADER_BYTES + CATALOG_RESULT_ROW_BYTES,
        "one-row catalog result payload length"
    );

    let _duration_micros = read_u64(&catalog.payload, 0);
    assert_eq!(read_u32(&catalog.payload, 8), 1, "row_count");
    assert_eq!(read_u32(&catalog.payload, 12), 0, "reserved header");

    let row = CATALOG_RESULT_HEADER_BYTES;
    assert_eq!(read_u32(&catalog.payload, row), 11, "catalog_key");
    assert_eq!(read_u32(&catalog.payload, row + 4), 1, "observed_products");
    assert_eq!(read_u32(&catalog.payload, row + 8), 1, "observed_authors");
    assert_eq!(read_u32(&catalog.payload, row + 12), 1, "new_products");
    assert_eq!(
        read_u32(&catalog.payload, row + 16),
        0,
        "previous_new_products"
    );
    assert_eq!(read_u32(&catalog.payload, row + 20), 1, "rising_products");
    assert_eq!(read_u32(&catalog.payload, row + 24), 0, "neutral_products");
    assert_eq!(read_u32(&catalog.payload, row + 28), 0, "falling_products");
    assert_eq!(
        read_u32(&catalog.payload, row + 32),
        1,
        "comparable_products"
    );

    // Frozen direction code order:
    // 0 strong_falling, 1 falling, 2 neutral, 3 rising, 4 strong_rising.
    assert_eq!(catalog.payload[row + 36], 3, "direction_code");
    assert!(
        catalog.payload[row + 37..row + 40]
            .iter()
            .all(|byte| *byte == 0),
        "reserved row bytes must be zero"
    );

    for (label, offset, want) in [
        ("median_rank_velocity", 40usize, 2.0),
        ("exposure_breadth", 48, 100.0),
        ("demand_momentum_percent", 56, 100.0),
        ("demand_momentum_index", 64, 75.0),
        ("new_supply_velocity_percent", 72, 100.0),
        ("new_supply_velocity_index", 80, 75.0),
        ("competition_acceleration", 88, 100.0),
        ("competition_momentum_index", 96, 75.0),
        ("author_concentration", 104, 100.0),
        ("author_attribution_coverage", 112, 100.0),
        ("freshness_index", 120, 100.0),
        ("relative_strength", 128, 50.0),
        ("supply_gap", 136, 50.0),
        ("direction_index", 144, 73.8),
        ("trend_score", 152, 70.5),
        ("opportunity_score", 160, 62.2),
        ("confidence", 168, 60.0),
        ("coverage", 176, 92.5),
    ] {
        assert_exact(read_f64(&catalog.payload, row + offset), want, label);
    }

    // Catalog v0.1 missing mask:
    // bit 0 = previous_window_history
    // bit 1 = research_session_coverage
    // bit 2 = author_attribution
    // bit 3 = external_trend
    assert_eq!(
        read_u64(&catalog.payload, row + 184),
        0b1001,
        "missing_mask"
    );
}
