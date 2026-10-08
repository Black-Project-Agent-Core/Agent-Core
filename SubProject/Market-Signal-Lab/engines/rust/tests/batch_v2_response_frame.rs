use msl_analytics_rust::batch_v2::{encode_analytics_response_frame, BatchOperationResult};
use msl_analytics_rust::protocol_v2::{
    decode_frame, MessageType, OP_CLUSTER_VOLATILITY, OP_DISTRIBUTION_SIMILARITY,
    OP_ITEM_VOLATILITY, OP_SELECTION_PROBABILITY, STATUS_INVALID_INPUT, STATUS_OK,
};

fn decode_hex(text: &str) -> Vec<u8> {
    let compact: Vec<u8> = text
        .bytes()
        .filter(|byte| !byte.is_ascii_whitespace())
        .collect();
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

#[test]
fn analytics_response_frame_preserves_request_identity_and_canonical_layout() {
    let request_bytes = shared_four_op_request();
    let request = decode_frame(&request_bytes).expect("valid analytics request fixture");

    let results = vec![
        BatchOperationResult {
            slot_id: 1,
            status: STATUS_OK,
            payload: vec![0xA1; 16],
        },
        BatchOperationResult {
            slot_id: 2,
            status: STATUS_INVALID_INPUT,
            payload: Vec::new(),
        },
        BatchOperationResult {
            slot_id: 3,
            status: STATUS_OK,
            payload: vec![0xC3; 64],
        },
        BatchOperationResult {
            slot_id: 4,
            status: STATUS_OK,
            payload: vec![0xD4; 48],
        },
    ];

    let encoded = encode_analytics_response_frame(&request, &results)
        .expect("analytics response frame encoding");

    assert_eq!(&encoded[0..4], b"MSL2");
    assert_eq!(u16::from_le_bytes(encoded[4..6].try_into().unwrap()), 2);
    assert_eq!(u16::from_le_bytes(encoded[6..8].try_into().unwrap()), 0);
    assert_eq!(u16::from_le_bytes(encoded[8..10].try_into().unwrap()), 4);
    assert_eq!(u16::from_le_bytes(encoded[10..12].try_into().unwrap()), 0);
    assert_eq!(u32::from_le_bytes(encoded[12..16].try_into().unwrap()), 64);
    assert_eq!(u64::from_le_bytes(encoded[16..24].try_into().unwrap()), 3);
    assert_eq!(u32::from_le_bytes(encoded[24..28].try_into().unwrap()), 4);
    assert_eq!(u32::from_le_bytes(encoded[28..32].try_into().unwrap()), 128);
    assert_eq!(u64::from_le_bytes(encoded[32..40].try_into().unwrap()), 128);
    assert_eq!(u64::from_le_bytes(encoded[40..48].try_into().unwrap()), 320);
    assert!(encoded[48..64].iter().all(|byte| *byte == 0));

    let response = decode_frame(&encoded).expect("encoded analytics response must decode");
    assert_eq!(response.header.message_type, MessageType::AnalyticsResponse);
    assert_eq!(response.header.request_id, request.header.request_id);

    let expected = [
        (1u32, OP_DISTRIBUTION_SIMILARITY, STATUS_OK, 0u64, 16u64),
        (2u32, OP_ITEM_VOLATILITY, STATUS_INVALID_INPUT, 16u64, 0u64),
        (3u32, OP_CLUSTER_VOLATILITY, STATUS_OK, 16u64, 64u64),
        (4u32, OP_SELECTION_PROBABILITY, STATUS_OK, 80u64, 48u64),
    ];

    for (descriptor, (slot_id, operation_id, status, offset, length)) in
        response.descriptors.iter().zip(expected)
    {
        assert_eq!(descriptor.slot_id, slot_id);
        assert_eq!(descriptor.operation_id, operation_id);
        assert_eq!(descriptor.schema_id, 1);
        assert_eq!(descriptor.flags, 0);
        assert_eq!(descriptor.status, status);
        assert_eq!(descriptor.payload_offset, offset);
        assert_eq!(descriptor.payload_length, length);
    }

    assert_eq!(
        response.payload_for(&response.descriptors[0]).unwrap(),
        &[0xA1; 16]
    );
    assert!(response
        .payload_for(&response.descriptors[1])
        .unwrap()
        .is_empty());
    assert_eq!(
        response.payload_for(&response.descriptors[2]).unwrap(),
        &[0xC3; 64]
    );
    assert_eq!(
        response.payload_for(&response.descriptors[3]).unwrap(),
        &[0xD4; 48]
    );
}
