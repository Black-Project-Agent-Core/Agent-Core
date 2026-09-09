use msl_analytics_rust::protocol_v2::{
    decode_frame, MessageType, OP_CLUSTER_VOLATILITY, OP_DISTRIBUTION_SIMILARITY,
    OP_ITEM_VOLATILITY, OP_SELECTION_PROBABILITY,
};
use msl_analytics_rust::worker_v2::run_binary_worker_session;
use std::io::Cursor;

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

fn handshake_request() -> Vec<u8> {
    let registry = [
        (OP_DISTRIBUTION_SIMILARITY, 1u16, 0u32),
        (OP_ITEM_VOLATILITY, 1u16, 0u32),
        (OP_CLUSTER_VOLATILITY, 1u16, 0u32),
        (OP_SELECTION_PROBABILITY, 1u16, 0u32),
    ];
    let mut payload = Vec::with_capacity(16 + registry.len() * 8);
    payload.extend_from_slice(&0u32.to_le_bytes());
    payload.extend_from_slice(&(registry.len() as u32).to_le_bytes());
    payload.extend_from_slice(&(64u64 << 20).to_le_bytes());
    for (operation_id, schema_id, required_flags) in registry {
        payload.extend_from_slice(&operation_id.to_le_bytes());
        payload.extend_from_slice(&schema_id.to_le_bytes());
        payload.extend_from_slice(&required_flags.to_le_bytes());
    }

    let total = 64 + payload.len();
    let mut frame = vec![0u8; total];
    frame[0..4].copy_from_slice(b"MSL2");
    frame[4..6].copy_from_slice(&2u16.to_le_bytes());
    frame[6..8].copy_from_slice(&0u16.to_le_bytes());
    frame[8..10].copy_from_slice(&(MessageType::HandshakeRequest as u16).to_le_bytes());
    frame[12..16].copy_from_slice(&64u32.to_le_bytes());
    frame[16..24].copy_from_slice(&8101u64.to_le_bytes());
    frame[32..40].copy_from_slice(&(payload.len() as u64).to_le_bytes());
    frame[40..48].copy_from_slice(&(total as u64).to_le_bytes());
    frame[64..].copy_from_slice(&payload);
    frame
}

fn assert_only_handshake_response(output: &[u8]) {
    let frame = decode_frame(output).expect("only handshake response must be emitted");
    assert_eq!(frame.header.message_type, MessageType::HandshakeResponse);
    assert_eq!(frame.header.request_id, 8101);
    assert_eq!(frame.header.operation_count, 0);
    assert_eq!(frame.header.descriptor_bytes, 0);
}

#[test]
fn malformed_frame_terminates_session_before_following_valid_request() {
    let valid_request = shared_four_op_request();
    let mut malformed = valid_request.clone();
    malformed[0] = b'X';

    let mut input_bytes = handshake_request();
    input_bytes.extend_from_slice(&malformed);
    input_bytes.extend_from_slice(&valid_request);

    let mut input = Cursor::new(input_bytes);
    let mut output = Vec::new();
    let error = run_binary_worker_session(&mut input, &mut output, "0.1.0")
        .expect_err("malformed analytics frame must terminate the session");

    assert_eq!(error, "analytics v2 magic mismatch");
    assert_only_handshake_response(&output);
}

#[test]
fn truncated_frame_body_terminates_session_after_handshake() {
    let valid_request = shared_four_op_request();
    let truncated_len = 100usize;
    assert!(truncated_len > 64 && truncated_len < valid_request.len());

    let mut input_bytes = handshake_request();
    input_bytes.extend_from_slice(&valid_request[..truncated_len]);

    let mut input = Cursor::new(input_bytes);
    let mut output = Vec::new();
    let error = run_binary_worker_session(&mut input, &mut output, "0.1.0")
        .expect_err("truncated analytics frame must terminate the session");

    assert_eq!(error, "analytics v2 frame body is truncated");
    assert_only_handshake_response(&output);
}
