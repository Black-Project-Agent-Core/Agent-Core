use msl_analytics_rust::protocol_v2::{
    decode_frame, MessageType, MAX_FRAME_BYTES, OP_CLUSTER_VOLATILITY, OP_DISTRIBUTION_SIMILARITY,
    OP_ITEM_VOLATILITY, OP_SELECTION_PROBABILITY, STATUS_OK,
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
    frame[10..12].copy_from_slice(&0u16.to_le_bytes());
    frame[12..16].copy_from_slice(&64u32.to_le_bytes());
    frame[16..24].copy_from_slice(&9001u64.to_le_bytes());
    frame[24..28].copy_from_slice(&0u32.to_le_bytes());
    frame[28..32].copy_from_slice(&0u32.to_le_bytes());
    frame[32..40].copy_from_slice(&(payload.len() as u64).to_le_bytes());
    frame[40..48].copy_from_slice(&(total as u64).to_le_bytes());
    frame[64..].copy_from_slice(&payload);
    frame
}

fn split_frames(bytes: &[u8]) -> Vec<&[u8]> {
    let mut frames = Vec::new();
    let mut offset = 0usize;
    while offset < bytes.len() {
        assert!(bytes.len() - offset >= 64, "truncated response header");
        let total =
            u64::from_le_bytes(bytes[offset + 40..offset + 48].try_into().unwrap()) as usize;
        assert!(total >= 64, "invalid response frame size");
        let end = offset.checked_add(total).expect("response frame overflow");
        assert!(end <= bytes.len(), "truncated response frame");
        frames.push(&bytes[offset..end]);
        offset = end;
    }
    frames
}

#[test]
fn binary_worker_completes_handshake_then_analytics_roundtrip() {
    let mut input_bytes = handshake_request();
    input_bytes.extend_from_slice(&shared_four_op_request());
    let mut input = Cursor::new(input_bytes);
    let mut output = Vec::new();

    run_binary_worker_session(&mut input, &mut output, "0.1.0")
        .expect("valid handshake plus analytics session must complete");

    let frames = split_frames(&output);
    assert_eq!(frames.len(), 2);

    let handshake = decode_frame(frames[0]).expect("handshake response must decode");
    assert_eq!(
        handshake.header.message_type,
        MessageType::HandshakeResponse
    );
    assert_eq!(handshake.header.request_id, 9001);
    assert_eq!(handshake.header.operation_count, 0);
    assert_eq!(handshake.header.descriptor_bytes, 0);
    assert_eq!(handshake.header.payload_bytes, 136);
    assert_eq!(handshake.header.total_frame_bytes, 200);
    let handshake_payload = &frames[0][64..];
    assert_eq!(
        u32::from_le_bytes(handshake_payload[0..4].try_into().unwrap()),
        0
    );
    assert_eq!(
        u32::from_le_bytes(handshake_payload[4..8].try_into().unwrap()),
        0
    );
    assert_eq!(
        u64::from_le_bytes(handshake_payload[8..16].try_into().unwrap()),
        MAX_FRAME_BYTES
    );
    assert_eq!(
        u32::from_le_bytes(handshake_payload[16..20].try_into().unwrap()),
        13
    );
    assert_eq!(
        u16::from_le_bytes(handshake_payload[20..22].try_into().unwrap()),
        5
    );
    assert_eq!(&handshake_payload[128..133], b"0.1.0");
    assert!(handshake_payload[133..136].iter().all(|byte| *byte == 0));

    let analytics = decode_frame(frames[1]).expect("analytics response must decode");
    assert_eq!(
        analytics.header.message_type,
        MessageType::AnalyticsResponse
    );
    assert_eq!(analytics.header.request_id, 3);
    assert_eq!(analytics.descriptors.len(), 4);
    assert_eq!(
        analytics
            .descriptors
            .iter()
            .map(|descriptor| descriptor.slot_id)
            .collect::<Vec<_>>(),
        vec![1, 2, 3, 4]
    );
    assert!(analytics
        .descriptors
        .iter()
        .all(|descriptor| descriptor.status == STATUS_OK));
    assert_eq!(
        analytics
            .descriptors
            .iter()
            .map(|descriptor| descriptor.payload_length)
            .collect::<Vec<_>>(),
        vec![16, 64, 64, 48]
    );
}
