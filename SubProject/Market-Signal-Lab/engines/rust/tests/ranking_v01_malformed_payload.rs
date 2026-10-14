use msl_analytics_rust::batch_v2::execute_analytics_batch;
use msl_analytics_rust::protocol_v2::{
    decode_frame, MessageType, OPERATION_DESCRIPTOR_BYTES, STATUS_MALFORMED_PAYLOAD,
};

fn request_with_payload(operation_id: u16, payload: &[u8]) -> Vec<u8> {
    let descriptor_bytes = OPERATION_DESCRIPTOR_BYTES as u32;
    let payload_bytes = payload.len() as u64;
    let total = 64u64 + u64::from(descriptor_bytes) + payload_bytes;

    let mut frame = vec![0u8; total as usize];
    frame[0..4].copy_from_slice(b"MSL2");
    frame[4..6].copy_from_slice(&2u16.to_le_bytes());
    frame[6..8].copy_from_slice(&0u16.to_le_bytes());
    frame[8..10].copy_from_slice(&(MessageType::AnalyticsRequest as u16).to_le_bytes());
    frame[12..16].copy_from_slice(&64u32.to_le_bytes());
    frame[16..24].copy_from_slice(&777u64.to_le_bytes());
    frame[24..28].copy_from_slice(&1u32.to_le_bytes());
    frame[28..32].copy_from_slice(&descriptor_bytes.to_le_bytes());
    frame[32..40].copy_from_slice(&payload_bytes.to_le_bytes());
    frame[40..48].copy_from_slice(&total.to_le_bytes());

    let descriptor = 64usize;
    frame[descriptor..descriptor + 4].copy_from_slice(&1u32.to_le_bytes());
    frame[descriptor + 4..descriptor + 6].copy_from_slice(&operation_id.to_le_bytes());
    frame[descriptor + 6..descriptor + 8].copy_from_slice(&1u16.to_le_bytes());
    frame[descriptor + 24..descriptor + 32].copy_from_slice(&(payload.len() as u64).to_le_bytes());

    frame[64 + OPERATION_DESCRIPTOR_BYTES..].copy_from_slice(payload);
    frame
}

#[test]
fn malformed_ranking_payloads_are_rejected_as_malformed_payload() {
    for operation_id in [5u16, 6u16, 7u16, 8u16] {
        let bytes = request_with_payload(operation_id, &[0xAA]);
        let frame = decode_frame(&bytes).expect("structurally valid ranking request frame");
        let result = execute_analytics_batch(&frame);
        assert_eq!(result.len(), 1);
        assert_eq!(
            result[0].status, STATUS_MALFORMED_PAYLOAD,
            "operation {operation_id} must classify malformed schema bytes as malformed payload"
        );
        assert!(result[0].payload.is_empty());
    }
}
