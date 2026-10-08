use msl_analytics_rust::batch_v2::execute_analytics_batch;
use msl_analytics_rust::protocol_v2::{
    decode_frame, OP_CLUSTER_VOLATILITY, OP_DISTRIBUTION_SIMILARITY, OP_SELECTION_PROBABILITY,
    STATUS_INVALID_INPUT, STATUS_OK,
};

fn decode_hex(text: &str) -> Vec<u8> {
    let compact: Vec<u8> = text.bytes().filter(|b| !b.is_ascii_whitespace()).collect();
    assert_eq!(compact.len() % 2, 0);
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

fn shared_four_op_request() -> Vec<u8> {
    decode_hex(include_str!(
        "../../../testdata/analytics_v2/analytics_request_four_ops.hex"
    ))
}

fn partial_error_request() -> Vec<u8> {
    let source = shared_four_op_request();
    let source_payload_start = 64 + 4 * 32;

    let distribution = &source[source_payload_start..source_payload_start + 80];
    let cluster = &source[source_payload_start + 144..source_payload_start + 184];
    let mut selection = source[source_payload_start + 184..source_payload_start + 224].to_vec();

    // Selection schema: 8-byte fixed header, then f64 weights[]. A zero first
    // weight is structurally valid but analytically invalid, so this must be a
    // per-operation INVALID_INPUT rather than a malformed-frame failure.
    selection[8..16].copy_from_slice(&0.0f64.to_le_bytes());

    let payload_bytes = distribution.len() + cluster.len() + selection.len();
    let descriptor_bytes = 3 * 32;
    let total_bytes = 64 + descriptor_bytes + payload_bytes;
    let mut frame = vec![0u8; total_bytes];

    frame[0..4].copy_from_slice(b"MSL2");
    frame[4..6].copy_from_slice(&2u16.to_le_bytes());
    frame[6..8].copy_from_slice(&0u16.to_le_bytes());
    frame[8..10].copy_from_slice(&3u16.to_le_bytes()); // AnalyticsRequest
    frame[10..12].copy_from_slice(&0u16.to_le_bytes());
    frame[12..16].copy_from_slice(&64u32.to_le_bytes());
    frame[16..24].copy_from_slice(&77u64.to_le_bytes());
    frame[24..28].copy_from_slice(&3u32.to_le_bytes());
    frame[28..32].copy_from_slice(&(descriptor_bytes as u32).to_le_bytes());
    frame[32..40].copy_from_slice(&(payload_bytes as u64).to_le_bytes());
    frame[40..48].copy_from_slice(&(total_bytes as u64).to_le_bytes());

    let descriptors = [
        (1u32, OP_DISTRIBUTION_SIMILARITY, 0u64, 80u64),
        (3u32, OP_CLUSTER_VOLATILITY, 80u64, 40u64),
        (4u32, OP_SELECTION_PROBABILITY, 120u64, 40u64),
    ];
    for (index, (slot_id, operation_id, offset, length)) in descriptors.into_iter().enumerate() {
        let start = 64 + index * 32;
        frame[start..start + 4].copy_from_slice(&slot_id.to_le_bytes());
        frame[start + 4..start + 6].copy_from_slice(&operation_id.to_le_bytes());
        frame[start + 6..start + 8].copy_from_slice(&1u16.to_le_bytes());
        frame[start + 8..start + 12].copy_from_slice(&0u32.to_le_bytes());
        frame[start + 12..start + 16].copy_from_slice(&0u32.to_le_bytes());
        frame[start + 16..start + 24].copy_from_slice(&offset.to_le_bytes());
        frame[start + 24..start + 32].copy_from_slice(&length.to_le_bytes());
    }

    let payload_start = 64 + descriptor_bytes;
    frame[payload_start..payload_start + 80].copy_from_slice(distribution);
    frame[payload_start + 80..payload_start + 120].copy_from_slice(cluster);
    frame[payload_start + 120..payload_start + 160].copy_from_slice(&selection);
    frame
}

#[test]
fn valid_slots_survive_invalid_selection_in_same_batch() {
    let bytes = partial_error_request();
    let frame = decode_frame(&bytes).expect("structurally valid analytics request");
    let results = execute_analytics_batch(&frame);

    assert_eq!(results.len(), 3);
    assert_eq!(results[0].slot_id, 1);
    assert_eq!(results[0].status, STATUS_OK);
    assert_eq!(results[0].payload.len(), 16);

    assert_eq!(results[1].slot_id, 3);
    assert_eq!(results[1].status, STATUS_OK);
    assert_eq!(results[1].payload.len(), 64);

    assert_eq!(results[2].slot_id, 4);
    assert_eq!(results[2].status, STATUS_INVALID_INPUT);
    assert!(results[2].payload.is_empty());
}
