use msl_analytics_rust::protocol_v2::{
    decode_frame, MessageType, OP_CLUSTER_VOLATILITY, OP_DISTRIBUTION_SIMILARITY,
    OP_ITEM_VOLATILITY, OP_SELECTION_PROBABILITY,
};
use std::io::Write;
use std::process::{Command, Stdio};

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
    frame[16..24].copy_from_slice(&7001u64.to_le_bytes());
    frame[32..40].copy_from_slice(&(payload.len() as u64).to_le_bytes());
    frame[40..48].copy_from_slice(&(total as u64).to_le_bytes());
    frame[64..].copy_from_slice(&payload);
    frame
}

#[test]
fn binary_entrypoint_speaks_v2_handshake_not_ndjson() {
    let binary = env!("CARGO_BIN_EXE_msl-analytics-rust");
    let mut child = Command::new(binary)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("spawn rust analytics binary");

    child
        .stdin
        .take()
        .expect("child stdin")
        .write_all(&handshake_request())
        .expect("write handshake request");

    let output = child
        .wait_with_output()
        .expect("wait for rust analytics binary");
    assert!(
        output.status.success(),
        "binary exited unsuccessfully: {:?}",
        output.status
    );
    assert!(
        !output.stdout.is_empty(),
        "binary produced no v2 handshake response"
    );

    let response = decode_frame(&output.stdout).expect("binary stdout must be one v2 frame");
    assert_eq!(response.header.message_type, MessageType::HandshakeResponse);
    assert_eq!(response.header.request_id, 7001);
    assert_eq!(response.header.operation_count, 0);
    assert_eq!(response.header.descriptor_bytes, 0);
}
