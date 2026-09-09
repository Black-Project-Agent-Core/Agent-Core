use msl_analytics_rust::batch_v2::execute_analytics_batch;
use msl_analytics_rust::protocol_v2::{decode_frame, STATUS_INTERNAL_ERROR, STATUS_OK};

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
fn product_ranking_v01_go_wire_executes_real_rust_kernel() {
    let bytes = decode_hex(include_str!(
        "../../../testdata/analytics_v2/c1/ranking_request_three_ops.hex"
    ));

    let frame = decode_frame(&bytes).expect("Go-generated ranking request must decode");

    let results = execute_analytics_batch(&frame);

    assert_eq!(results.len(), 3);

    let product = results
        .iter()
        .find(|result| result.slot_id == 51)
        .expect("product ranking slot 51");

    assert_ne!(
        product.status, STATUS_INTERNAL_ERROR,
        "Task 4 RED: op-5 still uses the Task 2 placeholder INTERNAL_ERROR"
    );

    assert_eq!(
        product.status, STATUS_OK,
        "valid ProductRankingV01 input must execute successfully"
    );

    // Product response:
    //
    //   u64 duration_micros
    //   u32 row_count
    //   u32 reserved
    //   row_count * 128-byte ProductRankingV01ResultRow
    //
    assert_eq!(
        product.payload.len(),
        16 + 128,
        "one-row product result payload length"
    );

    let _duration_micros = read_u64(&product.payload, 0);

    assert_eq!(read_u32(&product.payload, 8), 1, "row_count");
    assert_eq!(read_u32(&product.payload, 12), 0, "reserved");

    let row = 16usize;

    assert_eq!(read_u32(&product.payload, row), 1, "product_key");
    assert_eq!(
        read_u32(&product.payload, row + 4),
        1,
        "current_observation_count"
    );
    assert_eq!(
        read_u32(&product.payload, row + 8),
        0,
        "previous_observation_count"
    );
    assert_eq!(read_u32(&product.payload, row + 12), 1, "query_appearances");
    assert_eq!(
        read_u32(&product.payload, row + 16),
        2,
        "applicable_queries"
    );
    assert_eq!(
        read_u32(&product.payload, row + 20),
        1,
        "surface_appearances"
    );

    // No previous median, no velocity score, no comparable history.
    assert_eq!(read_u32(&product.payload, row + 24), 0, "flags");

    // Direction codes are ordered:
    // 0 strong_falling, 1 falling, 2 neutral, 3 rising, 4 strong_rising.
    assert_eq!(product.payload[row + 28], 2, "direction_code");
    assert!(
        product.payload[row + 29..row + 32]
            .iter()
            .all(|byte| *byte == 0),
        "reserved row bytes must be zero"
    );

    assert_exact(read_f64(&product.payload, row + 32), 7.0, "median_position");

    // Optional values are zero-filled when their flags are absent.
    assert_exact(
        read_f64(&product.payload, row + 40),
        0.0,
        "absent_previous_median",
    );
    assert_exact(read_f64(&product.payload, row + 48), 0.0, "rank_velocity");
    assert_exact(
        read_f64(&product.payload, row + 56),
        0.0,
        "absent_rank_velocity_score",
    );

    assert_exact(read_f64(&product.payload, row + 64), 73.9, "exposure_score");
    assert_exact(
        read_f64(&product.payload, row + 72),
        100.0,
        "freshness_score",
    );
    assert_exact(
        read_f64(&product.payload, row + 80),
        50.0,
        "cross_query_strength",
    );
    assert_exact(
        read_f64(&product.payload, row + 88),
        50.0,
        "relative_strength",
    );
    assert_exact(read_f64(&product.payload, row + 96), 52.5, "confidence");
    assert_exact(read_f64(&product.payload, row + 104), 90.0, "coverage");
    assert_exact(
        read_f64(&product.payload, row + 112),
        69.0,
        "opportunity_score",
    );

    // Product v0.1 missing mask:
    // bit 0 = rank_velocity
    // bit 1 = segmentation_fallback
    assert_eq!(read_u64(&product.payload, row + 120), 0b11, "missing_mask");

    // Structural op-7 remains a later C1 task. Catalog op-6 is implemented in
    // Task 5 and is covered by catalog_ranking_v01_worker.rs.
}
