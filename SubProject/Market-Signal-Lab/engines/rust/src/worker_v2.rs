use crate::batch_v2;
use crate::protocol_v2::{self, MessageType};
use std::convert::TryFrom;
use std::io::{ErrorKind, Read, Write};

pub fn run_binary_worker_session<R: Read, W: Write>(
    input: &mut R,
    output: &mut W,
    engine_version: &str,
) -> Result<(), &'static str> {
    let handshake_bytes =
        read_next_frame(input)?.ok_or("analytics v2 failed to read frame header")?;
    let handshake_frame = protocol_v2::decode_frame(&handshake_bytes)?;

    if handshake_frame.header.message_type != MessageType::HandshakeRequest {
        return Err("analytics v2 first frame must be handshake request");
    }

    let handshake_payload = handshake_bytes
        .get(protocol_v2::HEADER_BYTES..)
        .ok_or("analytics v2 handshake payload is truncated")?;
    let handshake_request = batch_v2::decode_handshake_request(handshake_payload)?;
    let handshake_response = batch_v2::negotiate_handshake(&handshake_request, engine_version);
    let handshake_status = handshake_response.status;
    let handshake_response_payload = batch_v2::encode_handshake_response(&handshake_response)?;
    let handshake_response_frame = encode_handshake_response_frame(
        handshake_frame.header.request_id,
        &handshake_response_payload,
    )?;
    write_frame(output, &handshake_response_frame)?;

    if handshake_status != batch_v2::HANDSHAKE_STATUS_OK {
        return Err("analytics v2 handshake rejected");
    }

    loop {
        let request_bytes = match read_next_frame(input)? {
            Some(bytes) => bytes,
            None => return Ok(()),
        };
        let request = protocol_v2::decode_frame(&request_bytes)?;
        if request.header.message_type != MessageType::AnalyticsRequest {
            return Err("analytics v2 session expected analytics request");
        }

        let results = batch_v2::execute_analytics_batch(&request);
        let response = batch_v2::encode_analytics_response_frame(&request, &results)?;
        write_frame(output, &response)?;
    }
}

fn encode_handshake_response_frame(
    request_id: u64,
    payload: &[u8],
) -> Result<Vec<u8>, &'static str> {
    let payload_bytes = u64::try_from(payload.len())
        .map_err(|_| "analytics v2 handshake response payload size overflow")?;
    let total_usize = protocol_v2::HEADER_BYTES
        .checked_add(payload.len())
        .ok_or("analytics v2 handshake response total size overflow")?;
    let total_bytes = u64::try_from(total_usize)
        .map_err(|_| "analytics v2 handshake response total size overflow")?;
    if total_bytes > protocol_v2::MAX_FRAME_BYTES {
        return Err("analytics v2 handshake response exceeds hard frame limit");
    }

    let mut frame = vec![0u8; total_usize];
    frame[0..4].copy_from_slice(b"MSL2");
    frame[4..6].copy_from_slice(&2u16.to_le_bytes());
    frame[6..8].copy_from_slice(&0u16.to_le_bytes());
    frame[8..10].copy_from_slice(&(MessageType::HandshakeResponse as u16).to_le_bytes());
    frame[10..12].copy_from_slice(&0u16.to_le_bytes());
    frame[12..16].copy_from_slice(&(protocol_v2::HEADER_BYTES as u32).to_le_bytes());
    frame[16..24].copy_from_slice(&request_id.to_le_bytes());
    frame[24..28].copy_from_slice(&0u32.to_le_bytes());
    frame[28..32].copy_from_slice(&0u32.to_le_bytes());
    frame[32..40].copy_from_slice(&payload_bytes.to_le_bytes());
    frame[40..48].copy_from_slice(&total_bytes.to_le_bytes());
    frame[protocol_v2::HEADER_BYTES..].copy_from_slice(payload);
    Ok(frame)
}

fn write_frame<W: Write>(output: &mut W, bytes: &[u8]) -> Result<(), &'static str> {
    output
        .write_all(bytes)
        .map_err(|_| "analytics v2 failed to write response frame")?;
    output
        .flush()
        .map_err(|_| "analytics v2 failed to flush response frame")?;
    Ok(())
}

fn read_next_frame<R: Read>(input: &mut R) -> Result<Option<Vec<u8>>, &'static str> {
    let mut header = [0u8; protocol_v2::HEADER_BYTES];
    let mut filled = 0usize;
    while filled < header.len() {
        match input.read(&mut header[filled..]) {
            Ok(0) if filled == 0 => return Ok(None),
            Ok(0) => return Err("analytics v2 frame header is truncated"),
            Ok(read) => filled += read,
            Err(error) if error.kind() == ErrorKind::Interrupted => continue,
            Err(_) => return Err("analytics v2 failed to read frame header"),
        }
    }

    let mut total_raw = [0u8; 8];
    total_raw.copy_from_slice(&header[40..48]);
    let total_frame_bytes = u64::from_le_bytes(total_raw);
    if total_frame_bytes < protocol_v2::HEADER_BYTES as u64 {
        return Err("analytics v2 frame is smaller than fixed header");
    }
    if total_frame_bytes > protocol_v2::MAX_FRAME_BYTES {
        return Err("analytics v2 frame exceeds hard limit");
    }

    let total = usize::try_from(total_frame_bytes)
        .map_err(|_| "analytics v2 frame length exceeds platform size")?;
    let mut bytes = vec![0u8; total];
    bytes[..protocol_v2::HEADER_BYTES].copy_from_slice(&header);
    input
        .read_exact(&mut bytes[protocol_v2::HEADER_BYTES..])
        .map_err(|_| "analytics v2 frame body is truncated")?;
    Ok(Some(bytes))
}
