use msl_analytics_rust::batch_v2::{
    adaptive_worker_count, execute_analytics_batch_with_available_cpus,
};
use msl_analytics_rust::protocol_v2::{decode_frame, OP_CLUSTER_VOLATILITY, STATUS_OK};

const OPERATION_COUNT: usize = 4;
const ELEMENTS_PER_OPERATION: usize = 25_000;

fn cluster_payload(count: usize, seed: f64) -> Vec<u8> {
    let mut payload = Vec::with_capacity(24 + count * 8);
    payload.extend_from_slice(&(count as u32).to_le_bytes());
    payload.extend_from_slice(&0u32.to_le_bytes());
    payload.extend_from_slice(&20.0f64.to_le_bytes());
    payload.extend_from_slice(&75.0f64.to_le_bytes());
    for index in 0..count {
        let share = seed + (index % 5) as f64;
        payload.extend_from_slice(&share.to_le_bytes());
    }
    payload
}

fn parallel_request() -> Vec<u8> {
    let slots = [40u32, 10u32, 30u32, 20u32];
    let payloads = [
        cluster_payload(ELEMENTS_PER_OPERATION, 10.0),
        cluster_payload(ELEMENTS_PER_OPERATION, 20.0),
        cluster_payload(ELEMENTS_PER_OPERATION, 30.0),
        cluster_payload(ELEMENTS_PER_OPERATION, 40.0),
    ];

    let descriptor_bytes = OPERATION_COUNT * 32;
    let payload_bytes: usize = payloads.iter().map(Vec::len).sum();
    let total_bytes = 64 + descriptor_bytes + payload_bytes;
    let mut frame = vec![0u8; total_bytes];

    frame[0..4].copy_from_slice(b"MSL2");
    frame[4..6].copy_from_slice(&2u16.to_le_bytes());
    frame[6..8].copy_from_slice(&0u16.to_le_bytes());
    frame[8..10].copy_from_slice(&3u16.to_le_bytes()); // AnalyticsRequest
    frame[10..12].copy_from_slice(&0u16.to_le_bytes());
    frame[12..16].copy_from_slice(&64u32.to_le_bytes());
    frame[16..24].copy_from_slice(&88u64.to_le_bytes());
    frame[24..28].copy_from_slice(&(OPERATION_COUNT as u32).to_le_bytes());
    frame[28..32].copy_from_slice(&(descriptor_bytes as u32).to_le_bytes());
    frame[32..40].copy_from_slice(&(payload_bytes as u64).to_le_bytes());
    frame[40..48].copy_from_slice(&(total_bytes as u64).to_le_bytes());

    let mut payload_offset = 0usize;
    for index in 0..OPERATION_COUNT {
        let descriptor_start = 64 + index * 32;
        let payload_len = payloads[index].len();
        frame[descriptor_start..descriptor_start + 4].copy_from_slice(&slots[index].to_le_bytes());
        frame[descriptor_start + 4..descriptor_start + 6]
            .copy_from_slice(&OP_CLUSTER_VOLATILITY.to_le_bytes());
        frame[descriptor_start + 6..descriptor_start + 8].copy_from_slice(&1u16.to_le_bytes());
        frame[descriptor_start + 8..descriptor_start + 12].copy_from_slice(&0u32.to_le_bytes());
        frame[descriptor_start + 12..descriptor_start + 16].copy_from_slice(&0u32.to_le_bytes());
        frame[descriptor_start + 16..descriptor_start + 24]
            .copy_from_slice(&(payload_offset as u64).to_le_bytes());
        frame[descriptor_start + 24..descriptor_start + 32]
            .copy_from_slice(&(payload_len as u64).to_le_bytes());

        let payload_start = 64 + descriptor_bytes + payload_offset;
        frame[payload_start..payload_start + payload_len].copy_from_slice(&payloads[index]);
        payload_offset += payload_len;
    }

    frame
}

#[test]
fn parallel_execution_preserves_descriptor_slot_order() {
    let bytes = parallel_request();
    let frame = decode_frame(&bytes).expect("valid parallel analytics request");
    let combined_elements = OPERATION_COUNT * ELEMENTS_PER_OPERATION;
    assert_eq!(
        adaptive_worker_count(OPERATION_COUNT, combined_elements, 16),
        4
    );

    let results = execute_analytics_batch_with_available_cpus(&frame, 16);

    assert_eq!(
        results
            .iter()
            .map(|result| result.slot_id)
            .collect::<Vec<_>>(),
        vec![40, 10, 30, 20]
    );
    assert!(results.iter().all(|result| result.status == STATUS_OK));
    assert!(results.iter().all(|result| result.payload.len() == 64));
}
