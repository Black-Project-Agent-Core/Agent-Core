use crate::batch_v2_impl::BatchOperationResult;
use crate::protocol_v2;
use std::convert::TryFrom;

pub fn encode_analytics_response_frame(
    request: &protocol_v2::DecodedFrame<'_>,
    results: &[BatchOperationResult],
) -> Result<Vec<u8>, &'static str> {
    if request.header.message_type != protocol_v2::MessageType::AnalyticsRequest {
        return Err("analytics v2 response requires an analytics request frame");
    }
    if results.len() != request.descriptors.len() {
        return Err("analytics v2 response result count mismatch");
    }

    let operation_count = u32::try_from(results.len())
        .map_err(|_| "analytics v2 response operation count overflow")?;
    let descriptor_bytes_usize = results
        .len()
        .checked_mul(protocol_v2::OPERATION_DESCRIPTOR_BYTES)
        .ok_or("analytics v2 response descriptor size overflow")?;
    let descriptor_bytes = u32::try_from(descriptor_bytes_usize)
        .map_err(|_| "analytics v2 response descriptor size overflow")?;

    let mut payload_bytes_usize = 0usize;
    for (descriptor, result) in request.descriptors.iter().zip(results) {
        if result.slot_id != descriptor.slot_id {
            return Err("analytics v2 response slot order mismatch");
        }
        if result.status > protocol_v2::STATUS_INTERNAL_ERROR {
            return Err("analytics v2 response operation status is invalid");
        }
        if result.status != protocol_v2::STATUS_OK && !result.payload.is_empty() {
            return Err("analytics v2 error response payload must be empty");
        }
        payload_bytes_usize = payload_bytes_usize
            .checked_add(result.payload.len())
            .ok_or("analytics v2 response payload size overflow")?;
    }

    let payload_bytes = u64::try_from(payload_bytes_usize)
        .map_err(|_| "analytics v2 response payload size overflow")?;
    let total_frame_bytes_usize = protocol_v2::HEADER_BYTES
        .checked_add(descriptor_bytes_usize)
        .and_then(|value| value.checked_add(payload_bytes_usize))
        .ok_or("analytics v2 response total size overflow")?;
    let total_frame_bytes = u64::try_from(total_frame_bytes_usize)
        .map_err(|_| "analytics v2 response total size overflow")?;
    if total_frame_bytes > protocol_v2::MAX_FRAME_BYTES {
        return Err("analytics v2 response exceeds hard frame limit");
    }

    let mut encoded = vec![0u8; total_frame_bytes_usize];
    encoded[0..4].copy_from_slice(b"MSL2");
    encoded[4..6].copy_from_slice(&2u16.to_le_bytes());
    encoded[6..8].copy_from_slice(&0u16.to_le_bytes());
    encoded[8..10]
        .copy_from_slice(&(protocol_v2::MessageType::AnalyticsResponse as u16).to_le_bytes());
    encoded[10..12].copy_from_slice(&0u16.to_le_bytes());
    encoded[12..16].copy_from_slice(&(protocol_v2::HEADER_BYTES as u32).to_le_bytes());
    encoded[16..24].copy_from_slice(&request.header.request_id.to_le_bytes());
    encoded[24..28].copy_from_slice(&operation_count.to_le_bytes());
    encoded[28..32].copy_from_slice(&descriptor_bytes.to_le_bytes());
    encoded[32..40].copy_from_slice(&payload_bytes.to_le_bytes());
    encoded[40..48].copy_from_slice(&total_frame_bytes.to_le_bytes());

    let payload_start = protocol_v2::HEADER_BYTES + descriptor_bytes_usize;
    let mut payload_offset = 0usize;
    for (index, (request_descriptor, result)) in request.descriptors.iter().zip(results).enumerate()
    {
        let descriptor_start =
            protocol_v2::HEADER_BYTES + index * protocol_v2::OPERATION_DESCRIPTOR_BYTES;
        let payload_length = u64::try_from(result.payload.len())
            .map_err(|_| "analytics v2 response payload length overflow")?;
        let payload_offset_u64 = u64::try_from(payload_offset)
            .map_err(|_| "analytics v2 response payload offset overflow")?;

        encoded[descriptor_start..descriptor_start + 4]
            .copy_from_slice(&result.slot_id.to_le_bytes());
        encoded[descriptor_start + 4..descriptor_start + 6]
            .copy_from_slice(&request_descriptor.operation_id.to_le_bytes());
        encoded[descriptor_start + 6..descriptor_start + 8]
            .copy_from_slice(&request_descriptor.schema_id.to_le_bytes());
        encoded[descriptor_start + 8..descriptor_start + 12].copy_from_slice(&0u32.to_le_bytes());
        encoded[descriptor_start + 12..descriptor_start + 16]
            .copy_from_slice(&result.status.to_le_bytes());
        encoded[descriptor_start + 16..descriptor_start + 24]
            .copy_from_slice(&payload_offset_u64.to_le_bytes());
        encoded[descriptor_start + 24..descriptor_start + 32]
            .copy_from_slice(&payload_length.to_le_bytes());

        let payload_end = payload_offset
            .checked_add(result.payload.len())
            .ok_or("analytics v2 response payload offset overflow")?;
        encoded[payload_start + payload_offset..payload_start + payload_end]
            .copy_from_slice(&result.payload);
        payload_offset = payload_end;
    }

    Ok(encoded)
}
