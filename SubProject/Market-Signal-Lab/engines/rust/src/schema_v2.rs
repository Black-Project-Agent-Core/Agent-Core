use std::convert::TryFrom;
use std::str;

pub struct DistributionSimilarityView<'a> {
    payload: &'a [u8],
    key_count: usize,
    offsets_start: usize,
    dictionary_start: usize,
    dictionary_bytes: usize,
    values_a_start: usize,
    values_b_start: usize,
}

impl<'a> DistributionSimilarityView<'a> {
    pub fn parse(payload: &'a [u8]) -> Result<Self, &'static str> {
        if payload.len() < 12 {
            return Err("distribution v2 payload is truncated");
        }
        let key_count = usize::try_from(read_u32(payload, 0)?)
            .map_err(|_| "distribution key count exceeds platform size")?;
        let dictionary_bytes = usize::try_from(read_u32(payload, 4)?)
            .map_err(|_| "distribution dictionary exceeds platform size")?;
        let offset_count = key_count
            .checked_add(1)
            .ok_or("distribution offset count overflow")?;
        let offset_bytes = offset_count
            .checked_mul(4)
            .ok_or("distribution offset table size overflow")?;
        let offsets_start = 8usize;
        let dictionary_start = offsets_start
            .checked_add(offset_bytes)
            .ok_or("distribution dictionary offset overflow")?;
        let dictionary_end = dictionary_start
            .checked_add(dictionary_bytes)
            .ok_or("distribution dictionary length overflow")?;
        let values_a_start = align8(dictionary_end)?;
        let values_bytes = key_count
            .checked_mul(8)
            .ok_or("distribution value array size overflow")?;
        let values_b_start = values_a_start
            .checked_add(values_bytes)
            .ok_or("distribution value array offset overflow")?;
        let expected_len = values_b_start
            .checked_add(values_bytes)
            .ok_or("distribution payload length overflow")?;
        if payload.len() != expected_len {
            return Err("distribution v2 payload length is invalid");
        }
        if payload[dictionary_end..values_a_start]
            .iter()
            .any(|byte| *byte != 0)
        {
            return Err("distribution v2 alignment padding must be zero");
        }

        let first = read_u32(payload, offsets_start)?;
        if first != 0 {
            return Err("distribution dictionary offsets must begin at zero");
        }
        let mut previous = 0usize;
        let mut previous_key: Option<&str> = None;
        for index in 0..key_count {
            let start = usize::try_from(read_u32(payload, offsets_start + index * 4)?)
                .map_err(|_| "distribution dictionary offset exceeds platform size")?;
            let end = usize::try_from(read_u32(payload, offsets_start + (index + 1) * 4)?)
                .map_err(|_| "distribution dictionary offset exceeds platform size")?;
            if start != previous || end < start || end > dictionary_bytes {
                return Err("distribution dictionary offsets are invalid");
            }
            let key_bytes = payload
                .get(dictionary_start + start..dictionary_start + end)
                .ok_or("distribution dictionary slice is invalid")?;
            let key = str::from_utf8(key_bytes)
                .map_err(|_| "distribution dictionary key must be valid utf-8")?;
            if let Some(prev) = previous_key {
                if prev.as_bytes() >= key.as_bytes() {
                    return Err("distribution dictionary keys must be strictly ordered");
                }
            }
            previous = end;
            previous_key = Some(key);
        }
        if previous != dictionary_bytes {
            return Err("distribution dictionary final offset mismatch");
        }

        Ok(Self {
            payload,
            key_count,
            offsets_start,
            dictionary_start,
            dictionary_bytes,
            values_a_start,
            values_b_start,
        })
    }

    pub fn len(&self) -> usize {
        self.key_count
    }

    pub fn is_empty(&self) -> bool {
        self.key_count == 0
    }

    pub fn key(&self, index: usize) -> Option<&'a str> {
        if index >= self.key_count {
            return None;
        }
        let start =
            usize::try_from(read_u32(self.payload, self.offsets_start + index * 4).ok()?).ok()?;
        let end =
            usize::try_from(read_u32(self.payload, self.offsets_start + (index + 1) * 4).ok()?)
                .ok()?;
        if end > self.dictionary_bytes {
            return None;
        }
        str::from_utf8(
            self.payload
                .get(self.dictionary_start + start..self.dictionary_start + end)?,
        )
        .ok()
    }

    pub fn value_a(&self, index: usize) -> Option<f64> {
        self.value_at(self.values_a_start, index)
    }

    pub fn value_b(&self, index: usize) -> Option<f64> {
        self.value_at(self.values_b_start, index)
    }

    fn value_at(&self, start: usize, index: usize) -> Option<f64> {
        if index >= self.key_count {
            return None;
        }
        read_f64(self.payload, start.checked_add(index.checked_mul(8)?)?).ok()
    }
}

pub struct ItemVolatilityView<'a> {
    payload: &'a [u8],
    rank_count: usize,
    top_k: i64,
    consecutive_appearances: i64,
    eligible_snapshots: i64,
    rbo_to_previous: f64,
    ranks_start: usize,
    validity_start: usize,
}

impl<'a> ItemVolatilityView<'a> {
    pub fn parse(payload: &'a [u8]) -> Result<Self, &'static str> {
        if payload.len() < 40 {
            return Err("item volatility v2 payload is truncated");
        }
        let rank_count = usize::try_from(read_u32(payload, 0)?)
            .map_err(|_| "item volatility rank count exceeds platform size")?;
        let validity_bytes = usize::try_from(read_u32(payload, 4)?)
            .map_err(|_| "item volatility validity length exceeds platform size")?;
        let expected_validity = bitset_bytes(rank_count)?;
        if validity_bytes != expected_validity {
            return Err("item volatility validity bitset length mismatch");
        }
        let ranks_bytes = rank_count
            .checked_mul(8)
            .ok_or("item volatility ranks length overflow")?;
        let ranks_start = 40usize;
        let validity_start = ranks_start
            .checked_add(ranks_bytes)
            .ok_or("item volatility validity offset overflow")?;
        let raw_end = validity_start
            .checked_add(validity_bytes)
            .ok_or("item volatility payload length overflow")?;
        let expected_len = align8(raw_end)?;
        if payload.len() != expected_len {
            return Err("item volatility v2 payload length is invalid");
        }
        validate_bitset(payload, validity_start, validity_bytes, rank_count)?;
        if payload[raw_end..expected_len].iter().any(|byte| *byte != 0) {
            return Err("item volatility alignment padding must be zero");
        }

        Ok(Self {
            payload,
            rank_count,
            top_k: read_i64(payload, 8)?,
            consecutive_appearances: read_i64(payload, 16)?,
            eligible_snapshots: read_i64(payload, 24)?,
            rbo_to_previous: read_f64(payload, 32)?,
            ranks_start,
            validity_start,
        })
    }

    pub fn len(&self) -> usize {
        self.rank_count
    }

    pub fn is_empty(&self) -> bool {
        self.rank_count == 0
    }

    pub fn top_k(&self) -> i64 {
        self.top_k
    }

    pub fn consecutive_appearances(&self) -> i64 {
        self.consecutive_appearances
    }

    pub fn eligible_snapshots(&self) -> i64 {
        self.eligible_snapshots
    }

    pub fn rbo_to_previous(&self) -> f64 {
        self.rbo_to_previous
    }

    pub fn rank(&self, index: usize) -> Option<Option<i64>> {
        if index >= self.rank_count {
            return None;
        }
        let present = bit_is_set(self.payload, self.validity_start, index)?;
        if !present {
            return Some(None);
        }
        let offset = self.ranks_start.checked_add(index.checked_mul(8)?)?;
        Some(Some(read_i64(self.payload, offset).ok()?))
    }
}

pub struct ClusterVolatilityView<'a> {
    payload: &'a [u8],
    share_count: usize,
    context_disagreement: f64,
    cross_time_persistence: f64,
}

impl<'a> ClusterVolatilityView<'a> {
    pub fn parse(payload: &'a [u8]) -> Result<Self, &'static str> {
        if payload.len() < 24 {
            return Err("cluster volatility v2 payload is truncated");
        }
        let share_count = usize::try_from(read_u32(payload, 0)?)
            .map_err(|_| "cluster volatility share count exceeds platform size")?;
        if read_u32(payload, 4)? != 0 {
            return Err("cluster volatility reserved field must be zero");
        }
        let shares_bytes = share_count
            .checked_mul(8)
            .ok_or("cluster volatility shares length overflow")?;
        let expected_len = 24usize
            .checked_add(shares_bytes)
            .ok_or("cluster volatility payload length overflow")?;
        if payload.len() != expected_len {
            return Err("cluster volatility v2 payload length is invalid");
        }
        Ok(Self {
            payload,
            share_count,
            context_disagreement: read_f64(payload, 8)?,
            cross_time_persistence: read_f64(payload, 16)?,
        })
    }

    pub fn len(&self) -> usize {
        self.share_count
    }

    pub fn is_empty(&self) -> bool {
        self.share_count == 0
    }

    pub fn context_disagreement(&self) -> f64 {
        self.context_disagreement
    }

    pub fn cross_time_persistence(&self) -> f64 {
        self.cross_time_persistence
    }

    pub fn share(&self, index: usize) -> Option<f64> {
        if index >= self.share_count {
            return None;
        }
        read_f64(self.payload, 24usize.checked_add(index.checked_mul(8)?)?).ok()
    }
}

pub struct SelectionProbabilityView<'a> {
    payload: &'a [u8],
    observation_count: usize,
    weights_start: usize,
    selected_start: usize,
}

impl<'a> SelectionProbabilityView<'a> {
    pub fn parse(payload: &'a [u8]) -> Result<Self, &'static str> {
        if payload.len() < 8 {
            return Err("selection probability v2 payload is truncated");
        }
        let observation_count = usize::try_from(read_u32(payload, 0)?)
            .map_err(|_| "selection observation count exceeds platform size")?;
        if observation_count == 0 {
            return Err("selection probability requires eligible observations");
        }
        let selected_bytes = usize::try_from(read_u32(payload, 4)?)
            .map_err(|_| "selection bitset length exceeds platform size")?;
        let expected_selected = bitset_bytes(observation_count)?;
        if selected_bytes != expected_selected {
            return Err("selection bitset length mismatch");
        }
        let weights_start = 8usize;
        let weights_bytes = observation_count
            .checked_mul(8)
            .ok_or("selection weights length overflow")?;
        let selected_start = weights_start
            .checked_add(weights_bytes)
            .ok_or("selection bitset offset overflow")?;
        let raw_end = selected_start
            .checked_add(selected_bytes)
            .ok_or("selection payload length overflow")?;
        let expected_len = align8(raw_end)?;
        if payload.len() != expected_len {
            return Err("selection probability v2 payload length is invalid");
        }
        validate_bitset(payload, selected_start, selected_bytes, observation_count)?;
        if payload[raw_end..expected_len].iter().any(|byte| *byte != 0) {
            return Err("selection probability alignment padding must be zero");
        }

        Ok(Self {
            payload,
            observation_count,
            weights_start,
            selected_start,
        })
    }

    pub fn len(&self) -> usize {
        self.observation_count
    }

    pub fn is_empty(&self) -> bool {
        self.observation_count == 0
    }

    pub fn weight(&self, index: usize) -> Option<f64> {
        if index >= self.observation_count {
            return None;
        }
        read_f64(
            self.payload,
            self.weights_start.checked_add(index.checked_mul(8)?)?,
        )
        .ok()
    }

    pub fn selected(&self, index: usize) -> Option<bool> {
        if index >= self.observation_count {
            return None;
        }
        bit_is_set(self.payload, self.selected_start, index)
    }
}

pub fn encode_distribution_similarity_result(duration_micros: u64, score: f64) -> [u8; 16] {
    let mut out = [0u8; 16];
    out[0..8].copy_from_slice(&duration_micros.to_le_bytes());
    out[8..16].copy_from_slice(&score.to_le_bytes());
    out
}

#[allow(clippy::too_many_arguments)]
pub fn encode_volatility_result(
    duration_micros: u64,
    label: u8,
    score: f64,
    rank_variance: f64,
    absence_rate: f64,
    median_absolute_deviation: f64,
    rbo_persistence: f64,
    consecutive_persistence: f64,
) -> Result<[u8; 64], &'static str> {
    if label > 3 {
        return Err("volatility label is invalid");
    }
    let mut out = [0u8; 64];
    out[0..8].copy_from_slice(&duration_micros.to_le_bytes());
    out[8] = label;
    write_f64(&mut out, 16, score)?;
    write_f64(&mut out, 24, rank_variance)?;
    write_f64(&mut out, 32, absence_rate)?;
    write_f64(&mut out, 40, median_absolute_deviation)?;
    write_f64(&mut out, 48, rbo_persistence)?;
    write_f64(&mut out, 56, consecutive_persistence)?;
    Ok(out)
}

pub fn encode_selection_probability_result(
    duration_micros: u64,
    score: f64,
    selected_weight: f64,
    eligible_weight: f64,
    selected_count: u64,
    eligible_count: u64,
) -> [u8; 48] {
    let mut out = [0u8; 48];
    out[0..8].copy_from_slice(&duration_micros.to_le_bytes());
    out[8..16].copy_from_slice(&score.to_le_bytes());
    out[16..24].copy_from_slice(&selected_weight.to_le_bytes());
    out[24..32].copy_from_slice(&eligible_weight.to_le_bytes());
    out[32..40].copy_from_slice(&selected_count.to_le_bytes());
    out[40..48].copy_from_slice(&eligible_count.to_le_bytes());
    out
}

fn validate_bitset(
    payload: &[u8],
    bitset_start: usize,
    bitset_bytes: usize,
    bit_count: usize,
) -> Result<(), &'static str> {
    let bitset_end = bitset_start
        .checked_add(bitset_bytes)
        .ok_or("analytics v2 bitset range overflow")?;
    let bitset = payload
        .get(bitset_start..bitset_end)
        .ok_or("analytics v2 bitset is truncated")?;
    if bit_count == 0 || bitset.is_empty() {
        return Ok(());
    }
    let used_bits_last = bit_count % 8;
    if used_bits_last != 0 {
        let allowed_mask = (1u8 << used_bits_last) - 1;
        if bitset[bitset.len() - 1] & !allowed_mask != 0 {
            return Err("analytics v2 bitset has non-canonical high bits");
        }
    }
    Ok(())
}

fn bit_is_set(payload: &[u8], bitset_start: usize, index: usize) -> Option<bool> {
    let byte = *payload.get(bitset_start.checked_add(index / 8)?)?;
    Some(byte & (1u8 << (index % 8)) != 0)
}

fn bitset_bytes(count: usize) -> Result<usize, &'static str> {
    count
        .checked_add(7)
        .map(|value| value / 8)
        .ok_or("analytics v2 bitset size overflow")
}

fn align8(value: usize) -> Result<usize, &'static str> {
    value
        .checked_add(7)
        .map(|v| v & !7usize)
        .ok_or("analytics v2 alignment overflow")
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

fn read_i64(bytes: &[u8], offset: usize) -> Result<i64, &'static str> {
    let end = offset
        .checked_add(8)
        .ok_or("analytics v2 i64 field offset overflow")?;
    let raw: [u8; 8] = bytes
        .get(offset..end)
        .ok_or("analytics v2 i64 field is truncated")?
        .try_into()
        .map_err(|_| "analytics v2 i64 field is truncated")?;
    Ok(i64::from_le_bytes(raw))
}

fn read_f64(bytes: &[u8], offset: usize) -> Result<f64, &'static str> {
    let end = offset
        .checked_add(8)
        .ok_or("analytics v2 f64 field offset overflow")?;
    let raw: [u8; 8] = bytes
        .get(offset..end)
        .ok_or("analytics v2 f64 field is truncated")?
        .try_into()
        .map_err(|_| "analytics v2 f64 field is truncated")?;
    Ok(f64::from_le_bytes(raw))
}

fn write_f64(bytes: &mut [u8], offset: usize, value: f64) -> Result<(), &'static str> {
    let end = offset
        .checked_add(8)
        .ok_or("analytics v2 response field offset overflow")?;
    let dst = bytes
        .get_mut(offset..end)
        .ok_or("analytics v2 response buffer is too small")?;
    dst.copy_from_slice(&value.to_le_bytes());
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::protocol_v2::{
        decode_frame, OP_CLUSTER_VOLATILITY, OP_DISTRIBUTION_SIMILARITY, OP_ITEM_VOLATILITY,
        OP_SELECTION_PROBABILITY,
    };

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
    fn shared_request_fixture_exposes_safe_borrowed_schema_views() {
        let bytes = request_fixture();
        let frame = decode_frame(&bytes).expect("frame");

        for descriptor in &frame.descriptors {
            let payload = frame.payload_for(descriptor).expect("payload");
            match descriptor.operation_id {
                OP_DISTRIBUTION_SIMILARITY => {
                    let view = DistributionSimilarityView::parse(payload).expect("distribution");
                    assert_eq!(view.len(), 3);
                    assert_eq!(view.key(0).unwrap(), "a");
                    assert_eq!(view.key(1).unwrap(), "b");
                    assert_eq!(view.key(2).unwrap(), "c");
                    assert_eq!(view.value_a(0).unwrap(), 2.0);
                    assert_eq!(view.value_b(0).unwrap(), 1.0);
                    assert_eq!(view.value_b(2).unwrap(), 2.0);
                }
                OP_ITEM_VOLATILITY => {
                    let view = ItemVolatilityView::parse(payload).expect("item");
                    assert_eq!(view.len(), 2);
                    assert_eq!(view.top_k(), 10);
                    assert_eq!(view.consecutive_appearances(), 1);
                    assert_eq!(view.eligible_snapshots(), 2);
                    assert_eq!(view.rbo_to_previous(), 80.0);
                    assert_eq!(view.rank(0).unwrap(), Some(5));
                    assert_eq!(view.rank(1).unwrap(), None);
                }
                OP_CLUSTER_VOLATILITY => {
                    let view = ClusterVolatilityView::parse(payload).expect("cluster");
                    assert_eq!(view.len(), 2);
                    assert_eq!(view.context_disagreement(), 20.0);
                    assert_eq!(view.cross_time_persistence(), 75.0);
                    assert_eq!(view.share(0).unwrap(), 10.0);
                    assert_eq!(view.share(1).unwrap(), 12.0);
                }
                OP_SELECTION_PROBABILITY => {
                    let view = SelectionProbabilityView::parse(payload).expect("selection");
                    assert_eq!(view.len(), 3);
                    assert_eq!(view.weight(0).unwrap(), 2.0);
                    assert_eq!(view.weight(1).unwrap(), 1.0);
                    assert_eq!(view.weight(2).unwrap(), 3.0);
                    assert!(view.selected(0).unwrap());
                    assert!(!view.selected(1).unwrap());
                    assert!(view.selected(2).unwrap());
                }
                other => panic!("unexpected operation id {other}"),
            }
        }
    }

    #[test]
    fn malformed_schema_payloads_are_rejected() {
        assert!(DistributionSimilarityView::parse(&[0; 7]).is_err());
        assert!(ItemVolatilityView::parse(&[0; 39]).is_err());
        assert!(ClusterVolatilityView::parse(&[0; 23]).is_err());
        assert!(SelectionProbabilityView::parse(&[0; 7]).is_err());

        // count=1, bitsetBytes=1, one weight, selected bitset has a non-canonical high bit.
        let mut selection = vec![0u8; 24];
        selection[0..4].copy_from_slice(&1u32.to_le_bytes());
        selection[4..8].copy_from_slice(&1u32.to_le_bytes());
        selection[8..16].copy_from_slice(&1f64.to_le_bytes());
        selection[16] = 0b1000_0001;
        assert!(SelectionProbabilityView::parse(&selection).is_err());
    }

    #[test]
    fn response_encoders_match_shared_go_fixture_payloads() {
        let bytes = response_fixture();
        let frame = decode_frame(&bytes).expect("response frame");
        for descriptor in &frame.descriptors {
            let payload = frame.payload_for(descriptor).expect("payload");
            let encoded = match descriptor.operation_id {
                OP_DISTRIBUTION_SIMILARITY => {
                    encode_distribution_similarity_result(11, 45.5).to_vec()
                }
                OP_ITEM_VOLATILITY => {
                    encode_volatility_result(22, 1, 44.5, 12.25, 5.5, 6.75, 80.0, 75.0)
                        .expect("item result")
                        .to_vec()
                }
                OP_CLUSTER_VOLATILITY => {
                    encode_volatility_result(33, 0, 14.25, 2.25, 0.0, 0.0, 75.0, 0.0)
                        .expect("cluster result")
                        .to_vec()
                }
                OP_SELECTION_PROBABILITY => {
                    encode_selection_probability_result(44, 83.33333333333333, 5.0, 6.0, 2, 3)
                        .to_vec()
                }
                other => panic!("unexpected operation id {other}"),
            };
            assert_eq!(encoded.as_slice(), payload);
        }
    }
}
