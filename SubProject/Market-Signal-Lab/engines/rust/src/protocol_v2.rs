use std::convert::TryFrom;

pub const HEADER_BYTES: usize = 64;
pub const OPERATION_DESCRIPTOR_BYTES: usize = 32;
pub const MAX_OPERATIONS: u32 = 32;
pub const MAX_FRAME_BYTES: u64 = 128 << 20;

pub const OP_DISTRIBUTION_SIMILARITY: u16 = 1;
pub const OP_ITEM_VOLATILITY: u16 = 2;
pub const OP_CLUSTER_VOLATILITY: u16 = 3;
pub const OP_SELECTION_PROBABILITY: u16 = 4;
pub const OP_PRODUCT_RANKING_V01: u16 = 5;
pub const OP_CATALOG_RANKING_V01: u16 = 6;
pub const OP_STRUCTURAL_INDEX_V01: u16 = 7;
pub const OP_STRUCTURAL_DIRECTION_V01: u16 = 8;
pub const OP_COMPETITION_ACCELERATION_V02: u16 = 9;
pub const OP_DIRECTIONAL_MOMENTUM_V02: u16 = 10;
pub const OP_PEER_RELATIVE_RANK_V02: u16 = 11;
pub const OP_AUTHOR_CONCENTRATION_CHANGE_V02: u16 = 12;
pub const OP_MOVEMENT_DIVERGENCE_V02: u16 = 13;

pub const STATUS_OK: u32 = 0;
pub const STATUS_INVALID_INPUT: u32 = 1;
pub const STATUS_UNSUPPORTED_OPERATION: u32 = 2;
pub const STATUS_UNSUPPORTED_SCHEMA: u32 = 3;
pub const STATUS_MALFORMED_PAYLOAD: u32 = 4;
pub const STATUS_INTERNAL_ERROR: u32 = 5;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MessageType {
    HandshakeRequest = 1,
    HandshakeResponse = 2,
    AnalyticsRequest = 3,
    AnalyticsResponse = 4,
}

impl TryFrom<u16> for MessageType {
    type Error = &'static str;

    fn try_from(value: u16) -> Result<Self, Self::Error> {
        match value {
            1 => Ok(Self::HandshakeRequest),
            2 => Ok(Self::HandshakeResponse),
            3 => Ok(Self::AnalyticsRequest),
            4 => Ok(Self::AnalyticsResponse),
            _ => Err("analytics v2 message type is invalid"),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct FrameHeader {
    pub protocol_major: u16,
    pub protocol_minor: u16,
    pub message_type: MessageType,
    pub flags: u16,
    pub header_bytes: u32,
    pub request_id: u64,
    pub operation_count: u32,
    pub descriptor_bytes: u32,
    pub payload_bytes: u64,
    pub total_frame_bytes: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct OperationDescriptor {
    pub slot_id: u32,
    pub operation_id: u16,
    pub schema_id: u16,
    pub flags: u32,
    pub status: u32,
    pub payload_offset: u64,
    pub payload_length: u64,
}

#[derive(Debug)]
pub struct DecodedFrame<'a> {
    pub header: FrameHeader,
    pub descriptors: Vec<OperationDescriptor>,
    payload: &'a [u8],
}

impl<'a> DecodedFrame<'a> {
    pub fn payload_for(&self, descriptor: &OperationDescriptor) -> Result<&'a [u8], &'static str> {
        let start = usize::try_from(descriptor.payload_offset)
            .map_err(|_| "analytics v2 payload offset exceeds platform size")?;
        let length = usize::try_from(descriptor.payload_length)
            .map_err(|_| "analytics v2 payload length exceeds platform size")?;
        let end = start
            .checked_add(length)
            .ok_or("analytics v2 payload range overflow")?;
        self.payload
            .get(start..end)
            .ok_or("analytics v2 operation payload is outside frame")
    }
}

pub fn decode_frame(bytes: &[u8]) -> Result<DecodedFrame<'_>, &'static str> {
    let header = decode_header(bytes)?;
    let total = usize::try_from(header.total_frame_bytes)
        .map_err(|_| "analytics v2 frame length exceeds platform size")?;
    if bytes.len() != total {
        return Err("analytics v2 frame length does not match header");
    }

    let descriptor_bytes = usize::try_from(header.descriptor_bytes)
        .map_err(|_| "analytics v2 descriptor table exceeds platform size")?;
    let descriptor_end = HEADER_BYTES
        .checked_add(descriptor_bytes)
        .ok_or("analytics v2 descriptor table overflow")?;
    if descriptor_end > bytes.len() {
        return Err("analytics v2 descriptor table is truncated");
    }

    let operation_count = usize::try_from(header.operation_count)
        .map_err(|_| "analytics v2 operation count exceeds platform size")?;
    let mut descriptors = Vec::with_capacity(operation_count);
    for index in 0..operation_count {
        let start = HEADER_BYTES
            .checked_add(
                index
                    .checked_mul(OPERATION_DESCRIPTOR_BYTES)
                    .ok_or("analytics v2 descriptor offset overflow")?,
            )
            .ok_or("analytics v2 descriptor offset overflow")?;
        let end = start
            .checked_add(OPERATION_DESCRIPTOR_BYTES)
            .ok_or("analytics v2 descriptor offset overflow")?;
        let descriptor = decode_descriptor(
            bytes
                .get(start..end)
                .ok_or("analytics v2 descriptor is truncated")?,
        )?;
        descriptors.push(descriptor);
    }

    validate_layout(&header, &descriptors)?;
    let payload = bytes
        .get(descriptor_end..total)
        .ok_or("analytics v2 payload is truncated")?;
    if u64::try_from(payload.len()).map_err(|_| "analytics v2 payload length overflow")?
        != header.payload_bytes
    {
        return Err("analytics v2 payload length does not match header");
    }

    Ok(DecodedFrame {
        header,
        descriptors,
        payload,
    })
}

fn decode_header(bytes: &[u8]) -> Result<FrameHeader, &'static str> {
    let header = bytes
        .get(..HEADER_BYTES)
        .ok_or("analytics v2 header is truncated")?;
    if header.get(0..4) != Some(b"MSL2") {
        return Err("analytics v2 magic mismatch");
    }
    if header[48..64].iter().any(|byte| *byte != 0) {
        return Err("analytics v2 reserved header bytes must be zero");
    }

    let protocol_major = read_u16(header, 4)?;
    let protocol_minor = read_u16(header, 6)?;
    let message_type = MessageType::try_from(read_u16(header, 8)?)?;
    let flags = read_u16(header, 10)?;
    let header_bytes = read_u32(header, 12)?;
    let request_id = read_u64(header, 16)?;
    let operation_count = read_u32(header, 24)?;
    let descriptor_bytes = read_u32(header, 28)?;
    let payload_bytes = read_u64(header, 32)?;
    let total_frame_bytes = read_u64(header, 40)?;

    if protocol_major != 2 || protocol_minor != 0 {
        return Err("analytics v2 protocol mismatch");
    }
    if header_bytes != HEADER_BYTES as u32 {
        return Err("analytics v2 header size mismatch");
    }
    if flags != 0 {
        return Err("analytics v2 header flags are unsupported");
    }
    if request_id == 0 {
        return Err("analytics v2 request id must be non-zero");
    }

    match message_type {
        MessageType::HandshakeRequest | MessageType::HandshakeResponse => {
            if operation_count != 0 || descriptor_bytes != 0 {
                return Err("analytics v2 handshake frame cannot have operation descriptors");
            }
        }
        MessageType::AnalyticsRequest | MessageType::AnalyticsResponse => {
            if operation_count == 0 || operation_count > MAX_OPERATIONS {
                return Err("analytics v2 operation count is invalid");
            }
            let want = operation_count
                .checked_mul(OPERATION_DESCRIPTOR_BYTES as u32)
                .ok_or("analytics v2 descriptor table size overflow")?;
            if descriptor_bytes != want {
                return Err("analytics v2 descriptor table size mismatch");
            }
        }
    }

    let base = (HEADER_BYTES as u64)
        .checked_add(u64::from(descriptor_bytes))
        .ok_or("analytics v2 total frame size overflow")?;
    let expected_total = base
        .checked_add(payload_bytes)
        .ok_or("analytics v2 total frame size overflow")?;
    if total_frame_bytes != expected_total {
        return Err("analytics v2 total frame size mismatch");
    }
    if total_frame_bytes > MAX_FRAME_BYTES {
        return Err("analytics v2 frame exceeds hard limit");
    }

    Ok(FrameHeader {
        protocol_major,
        protocol_minor,
        message_type,
        flags,
        header_bytes,
        request_id,
        operation_count,
        descriptor_bytes,
        payload_bytes,
        total_frame_bytes,
    })
}

fn decode_descriptor(bytes: &[u8]) -> Result<OperationDescriptor, &'static str> {
    if bytes.len() != OPERATION_DESCRIPTOR_BYTES {
        return Err("analytics v2 descriptor is truncated");
    }
    let descriptor = OperationDescriptor {
        slot_id: read_u32(bytes, 0)?,
        operation_id: read_u16(bytes, 4)?,
        schema_id: read_u16(bytes, 6)?,
        flags: read_u32(bytes, 8)?,
        status: read_u32(bytes, 12)?,
        payload_offset: read_u64(bytes, 16)?,
        payload_length: read_u64(bytes, 24)?,
    };
    if descriptor.flags != 0 {
        return Err("analytics v2 descriptor flags are unsupported");
    }
    if descriptor.status > STATUS_INTERNAL_ERROR {
        return Err("analytics v2 operation status is unknown");
    }
    Ok(descriptor)
}

fn validate_layout(
    header: &FrameHeader,
    descriptors: &[OperationDescriptor],
) -> Result<(), &'static str> {
    if descriptors.len() != header.operation_count as usize {
        return Err("analytics v2 descriptor count mismatch");
    }

    for (index, descriptor) in descriptors.iter().enumerate() {
        if descriptor.slot_id == 0 {
            return Err("analytics v2 slot id must be non-zero");
        }
        if descriptors[..index]
            .iter()
            .any(|other| other.slot_id == descriptor.slot_id)
        {
            return Err("analytics v2 slot id must be unique");
        }
        if descriptor.flags != 0 {
            return Err("analytics v2 descriptor flags are unsupported");
        }
        if header.message_type == MessageType::AnalyticsRequest && descriptor.status != STATUS_OK {
            return Err("analytics v2 request descriptor status must be zero");
        }
        if descriptor.status > STATUS_INTERNAL_ERROR {
            return Err("analytics v2 operation status is unknown");
        }

        let end = descriptor
            .payload_offset
            .checked_add(descriptor.payload_length)
            .ok_or("analytics v2 operation payload overflow")?;
        if end > header.payload_bytes {
            return Err("analytics v2 operation payload is outside frame");
        }
        if descriptor.payload_length == 0 {
            continue;
        }
        for other in &descriptors[..index] {
            if other.payload_length == 0 {
                continue;
            }
            let other_end = other
                .payload_offset
                .checked_add(other.payload_length)
                .ok_or("analytics v2 operation payload overflow")?;
            if descriptor.payload_offset < other_end && other.payload_offset < end {
                return Err("analytics v2 operation payloads overlap");
            }
        }
    }
    Ok(())
}

fn read_u16(bytes: &[u8], offset: usize) -> Result<u16, &'static str> {
    let end = offset
        .checked_add(2)
        .ok_or("analytics v2 u16 field offset overflow")?;
    let raw: [u8; 2] = bytes
        .get(offset..end)
        .ok_or("analytics v2 u16 field is truncated")?
        .try_into()
        .map_err(|_| "analytics v2 u16 field is truncated")?;
    Ok(u16::from_le_bytes(raw))
}

fn read_u32(bytes: &[u8], offset: usize) -> Result<u32, &'static str> {
    let end = offset
        .checked_add(4)
        .ok_or("analytics v2 u32 field offset overflow")?;
    let raw: [u8; 4] = bytes
        .get(offset..end)
        .ok_or("analytics v2 u32 field is truncated")?
        .try_into()
        .map_err(|_| "analytics v2 u32 field is truncated")?;
    Ok(u32::from_le_bytes(raw))
}

fn read_u64(bytes: &[u8], offset: usize) -> Result<u64, &'static str> {
    let end = offset
        .checked_add(8)
        .ok_or("analytics v2 u64 field offset overflow")?;
    let raw: [u8; 8] = bytes
        .get(offset..end)
        .ok_or("analytics v2 u64 field is truncated")?
        .try_into()
        .map_err(|_| "analytics v2 u64 field is truncated")?;
    Ok(u64::from_le_bytes(raw))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn decode_hex(text: &str) -> Vec<u8> {
        let compact: Vec<u8> = text.bytes().filter(|b| !b.is_ascii_whitespace()).collect();
        assert_eq!(compact.len() % 2, 0);
        compact
            .chunks_exact(2)
            .map(|pair| {
                fn nibble(b: u8) -> u8 {
                    match b {
                        b'0'..=b'9' => b - b'0',
                        b'a'..=b'f' => b - b'a' + 10,
                        b'A'..=b'F' => b - b'A' + 10,
                        _ => panic!("invalid hex fixture"),
                    }
                }
                (nibble(pair[0]) << 4) | nibble(pair[1])
            })
            .collect()
    }

    fn request_fixture() -> Vec<u8> {
        decode_hex(include_str!(
            "../../../testdata/analytics_v2/analytics_request_four_ops.hex"
        ))
    }

    fn response_fixture() -> Vec<u8> {
        decode_hex(include_str!(
            "../../../testdata/analytics_v2/analytics_response_four_ops.hex"
        ))
    }

    #[test]
    fn golden_request_header_and_descriptors_decode() {
        let bytes = request_fixture();
        let frame = decode_frame(&bytes).expect("valid Go v2 request fixture");
        assert_eq!(frame.header.protocol_major, 2);
        assert_eq!(frame.header.protocol_minor, 0);
        assert_eq!(frame.header.message_type, MessageType::AnalyticsRequest);
        assert_eq!(frame.header.request_id, 3);
        assert_eq!(frame.header.operation_count, 4);
        assert_eq!(frame.header.descriptor_bytes, 128);
        assert_eq!(frame.header.payload_bytes, 224);
        assert_eq!(frame.header.total_frame_bytes, 416);
        assert_eq!(frame.descriptors.len(), 4);

        let expected = [
            (1, OP_DISTRIBUTION_SIMILARITY, 0, 80),
            (2, OP_ITEM_VOLATILITY, 80, 64),
            (3, OP_CLUSTER_VOLATILITY, 144, 40),
            (4, OP_SELECTION_PROBABILITY, 184, 40),
        ];
        for (descriptor, (slot, op, offset, length)) in frame.descriptors.iter().zip(expected) {
            assert_eq!(descriptor.slot_id, slot);
            assert_eq!(descriptor.operation_id, op);
            assert_eq!(descriptor.schema_id, 1);
            assert_eq!(descriptor.flags, 0);
            assert_eq!(descriptor.status, STATUS_OK);
            assert_eq!(descriptor.payload_offset, offset);
            assert_eq!(descriptor.payload_length, length);
            assert_eq!(
                frame.payload_for(descriptor).expect("payload").len(),
                length as usize
            );
        }
    }

    #[test]
    fn golden_response_header_and_descriptors_decode() {
        let bytes = response_fixture();
        let frame = decode_frame(&bytes).expect("valid shared v2 response fixture");
        assert_eq!(frame.header.message_type, MessageType::AnalyticsResponse);
        assert_eq!(frame.header.request_id, 3);
        assert_eq!(frame.header.payload_bytes, 192);
        assert_eq!(frame.header.total_frame_bytes, 384);
        assert_eq!(frame.descriptors.len(), 4);
    }

    #[test]
    fn every_truncated_request_fixture_is_rejected() {
        let bytes = request_fixture();
        for end in 0..bytes.len() {
            assert!(
                decode_frame(&bytes[..end]).is_err(),
                "truncation at {end} unexpectedly decoded"
            );
        }
        assert!(decode_frame(&bytes).is_ok());
    }

    #[test]
    fn malformed_structural_mutations_are_rejected() {
        let original = request_fixture();
        let mutations: &[(usize, u8)] = &[
            (0, b'X'), // magic
            (4, 3),    // protocol major
            (10, 1),   // unsupported frame flag
            (12, 63),  // header bytes
            (48, 1),   // reserved header byte
            (72, 1),   // descriptor request status
        ];
        for (offset, value) in mutations {
            let mut bytes = original.clone();
            bytes[*offset] = *value;
            assert!(
                decode_frame(&bytes).is_err(),
                "mutation at {offset} unexpectedly decoded"
            );
        }
    }
}
