use std::convert::TryFrom;

pub struct CompetitionAccelerationV02View {
    older_count: i64,
    prior_count: i64,
    current_count: i64,
}

impl CompetitionAccelerationV02View {
    pub fn parse(payload: &[u8]) -> Result<Self, &'static str> {
        if payload.len() != 24 {
            return Err("competition acceleration v0.2 payload must be exactly 24 bytes");
        }
        let older_count = read_i64(payload, 0)?;
        let prior_count = read_i64(payload, 8)?;
        let current_count = read_i64(payload, 16)?;
        if older_count < 0 || prior_count < 0 || current_count < 0 {
            return Err("competition acceleration v0.2 counts must be non-negative");
        }
        const MAX_EXACT_F64_INT: i64 = 9_007_199_254_740_992;
        if older_count > MAX_EXACT_F64_INT
            || prior_count > MAX_EXACT_F64_INT
            || current_count > MAX_EXACT_F64_INT
        {
            return Err("competition acceleration v0.2 count exceeds exact f64 integer range");
        }
        Ok(Self {
            older_count,
            prior_count,
            current_count,
        })
    }
    pub fn older_count(&self) -> i64 {
        self.older_count
    }
    pub fn prior_count(&self) -> i64 {
        self.prior_count
    }
    pub fn current_count(&self) -> i64 {
        self.current_count
    }
}

pub struct DirectionalMomentumV02View {
    rising: i64,
    neutral: i64,
    falling: i64,
    comparable: i64,
}

impl DirectionalMomentumV02View {
    pub fn parse(payload: &[u8]) -> Result<Self, &'static str> {
        if payload.len() != 24 {
            return Err("directional momentum v0.2 payload must be exactly 24 bytes");
        }
        let rising = read_i64(payload, 0)?;
        let neutral = read_i64(payload, 8)?;
        let falling = read_i64(payload, 16)?;
        if rising < 0 || neutral < 0 || falling < 0 {
            return Err("directional momentum v0.2 counts must be non-negative");
        }
        let comparable = rising
            .checked_add(neutral)
            .and_then(|v| v.checked_add(falling))
            .ok_or("directional momentum v0.2 comparable count overflow")?;
        if comparable <= 0 {
            return Err("directional momentum v0.2 requires comparable products");
        }
        Ok(Self {
            rising,
            neutral,
            falling,
            comparable,
        })
    }
    pub fn rising(&self) -> i64 {
        self.rising
    }
    pub fn neutral(&self) -> i64 {
        self.neutral
    }
    pub fn falling(&self) -> i64 {
        self.falling
    }
    pub fn comparable(&self) -> i64 {
        self.comparable
    }
}

pub struct PeerRelativeRankV02View<'a> {
    payload: &'a [u8],
    count: usize,
    subject_index: usize,
}

impl<'a> PeerRelativeRankV02View<'a> {
    pub fn parse(payload: &'a [u8]) -> Result<Self, &'static str> {
        if payload.len() < 32 {
            return Err("peer relative rank v0.2 payload is truncated");
        }
        let count = usize::try_from(read_u32(payload, 0)?)
            .map_err(|_| "peer relative rank v0.2 count exceeds platform size")?;
        let subject_index = usize::try_from(read_u32(payload, 4)?)
            .map_err(|_| "peer relative rank v0.2 subject index exceeds platform size")?;
        if payload[8..16].iter().any(|b| *b != 0) {
            return Err("peer relative rank v0.2 reserved header bytes must be zero");
        }
        if count < 2 {
            return Err("peer relative rank v0.2 requires at least two peers");
        }
        if subject_index >= count {
            return Err("peer relative rank v0.2 subject index is out of range");
        }
        let values_bytes = count
            .checked_mul(8)
            .ok_or("peer relative rank v0.2 payload size overflow")?;
        let expected = 16usize
            .checked_add(values_bytes)
            .ok_or("peer relative rank v0.2 payload size overflow")?;
        if payload.len() != expected {
            return Err("peer relative rank v0.2 payload length is invalid");
        }
        for index in 0..count {
            let value = read_f64(payload, 16 + index * 8)?;
            if !value.is_finite() {
                return Err("peer relative rank v0.2 values must be finite");
            }
        }
        Ok(Self {
            payload,
            count,
            subject_index,
        })
    }
    pub fn len(&self) -> usize {
        self.count
    }
    pub fn subject_index(&self) -> usize {
        self.subject_index
    }
    pub fn value(&self, index: usize) -> Option<f64> {
        if index >= self.count {
            return None;
        }
        read_f64(self.payload, 16 + index * 8).ok()
    }
}

pub struct AuthorConcentrationChangeV02View {
    prior: f64,
    current: f64,
}

impl AuthorConcentrationChangeV02View {
    pub fn parse(payload: &[u8]) -> Result<Self, &'static str> {
        if payload.len() != 16 {
            return Err("author concentration change v0.2 payload must be exactly 16 bytes");
        }
        let prior = read_f64(payload, 0)?;
        let current = read_f64(payload, 8)?;
        if !prior.is_finite()
            || !current.is_finite()
            || !(0.0..=100.0).contains(&prior)
            || !(0.0..=100.0).contains(&current)
        {
            return Err("author concentration change v0.2 values must be finite and within 0..100");
        }
        Ok(Self { prior, current })
    }
    pub fn prior(&self) -> f64 {
        self.prior
    }
    pub fn current(&self) -> f64 {
        self.current
    }
}

pub struct MovementDivergenceV02View<'a> {
    payload: &'a [u8],
    eligible_count: usize,
    total_count: usize,
}

impl<'a> MovementDivergenceV02View<'a> {
    pub fn parse(payload: &'a [u8]) -> Result<Self, &'static str> {
        if payload.len() < 32 {
            return Err("movement divergence v0.2 payload is truncated");
        }
        let eligible_count = usize::try_from(read_u32(payload, 0)?)
            .map_err(|_| "movement divergence v0.2 child count exceeds platform size")?;
        let total_count = usize::try_from(read_u32(payload, 4)?)
            .map_err(|_| "movement divergence v0.2 total child count exceeds platform size")?;
        if payload[8..16].iter().any(|b| *b != 0) {
            return Err("movement divergence v0.2 reserved header bytes must be zero");
        }
        if eligible_count == 0 || total_count < eligible_count {
            return Err("movement divergence v0.2 child counts are invalid");
        }
        let children_bytes = eligible_count
            .checked_mul(16)
            .ok_or("movement divergence v0.2 payload size overflow")?;
        let expected = 16usize
            .checked_add(children_bytes)
            .ok_or("movement divergence v0.2 payload size overflow")?;
        if payload.len() != expected {
            return Err("movement divergence v0.2 payload length is invalid");
        }
        for i in 0..eligible_count {
            let value = read_f64(payload, 16 + i * 16)?;
            let mass = read_f64(payload, 24 + i * 16)?;
            if !value.is_finite()
                || !mass.is_finite()
                || !(-100.0..=100.0).contains(&value)
                || mass <= 0.0
            {
                return Err("movement divergence v0.2 child value or product mass is invalid");
            }
        }
        Ok(Self {
            payload,
            eligible_count,
            total_count,
        })
    }
    pub fn len(&self) -> usize {
        self.eligible_count
    }
    pub fn total_count(&self) -> usize {
        self.total_count
    }
    pub fn child(&self, index: usize) -> Option<(f64, f64)> {
        if index >= self.eligible_count {
            return None;
        }
        let value = read_f64(self.payload, 16 + index * 16).ok()?;
        let mass = read_f64(self.payload, 24 + index * 16).ok()?;
        Some((value, mass))
    }
}

pub fn encode_competition_acceleration_v02_result(
    duration_micros: u64,
    previous_delta: f64,
    current_delta: f64,
    acceleration: f64,
    zero_baseline_flags: u32,
) -> Result<[u8; 40], &'static str> {
    if !previous_delta.is_finite()
        || !current_delta.is_finite()
        || !acceleration.is_finite()
        || zero_baseline_flags & !3 != 0
    {
        return Err("competition acceleration v0.2 result is invalid");
    }
    let mut out = [0u8; 40];
    out[0..8].copy_from_slice(&duration_micros.to_le_bytes());
    write_f64(&mut out, 8, previous_delta)?;
    write_f64(&mut out, 16, current_delta)?;
    write_f64(&mut out, 24, acceleration)?;
    out[32..36].copy_from_slice(&zero_baseline_flags.to_le_bytes());
    Ok(out)
}

pub fn encode_directional_momentum_v02_result(
    duration_micros: u64,
    odmi: f64,
    magnitude: f64,
    comparable: u64,
) -> Result<[u8; 32], &'static str> {
    if !odmi.is_finite()
        || !magnitude.is_finite()
        || !(-100.0..=100.0).contains(&odmi)
        || !(0.0..=100.0).contains(&magnitude)
        || comparable == 0
    {
        return Err("directional momentum v0.2 result is invalid");
    }
    let mut out = [0u8; 32];
    out[0..8].copy_from_slice(&duration_micros.to_le_bytes());
    write_f64(&mut out, 8, odmi)?;
    write_f64(&mut out, 16, magnitude)?;
    out[24..32].copy_from_slice(&comparable.to_le_bytes());
    Ok(out)
}

pub fn encode_peer_relative_rank_v02_result(
    duration_micros: u64,
    percentile: f64,
    peer_group_size: u64,
) -> Result<[u8; 24], &'static str> {
    if !percentile.is_finite() || !(0.0..=100.0).contains(&percentile) || peer_group_size < 2 {
        return Err("peer relative rank v0.2 result is invalid");
    }
    let mut out = [0u8; 24];
    out[0..8].copy_from_slice(&duration_micros.to_le_bytes());
    write_f64(&mut out, 8, percentile)?;
    out[16..24].copy_from_slice(&peer_group_size.to_le_bytes());
    Ok(out)
}

pub fn encode_author_concentration_change_v02_result(
    duration_micros: u64,
    change: f64,
) -> Result<[u8; 16], &'static str> {
    if !change.is_finite() || !(-100.0..=100.0).contains(&change) {
        return Err("author concentration change v0.2 result is invalid");
    }
    let mut out = [0u8; 16];
    out[0..8].copy_from_slice(&duration_micros.to_le_bytes());
    write_f64(&mut out, 8, change)?;
    Ok(out)
}

#[allow(clippy::too_many_arguments)]
pub fn encode_movement_divergence_v02_result(
    duration_micros: u64,
    weighted: f64,
    equal: f64,
    signed: f64,
    magnitude: f64,
    participation: f64,
    eligible_count: u64,
    total_count: u64,
) -> Result<[u8; 64], &'static str> {
    if [weighted, equal, signed, magnitude, participation]
        .iter()
        .any(|v| !v.is_finite())
        || !(-100.0..=100.0).contains(&weighted)
        || !(-100.0..=100.0).contains(&equal)
        || !(-200.0..=200.0).contains(&signed)
        || !(0.0..=200.0).contains(&magnitude)
        || !(0.0..=100.0).contains(&participation)
        || eligible_count == 0
        || total_count < eligible_count
    {
        return Err("movement divergence v0.2 result is invalid");
    }
    let mut out = [0u8; 64];
    out[0..8].copy_from_slice(&duration_micros.to_le_bytes());
    write_f64(&mut out, 8, weighted)?;
    write_f64(&mut out, 16, equal)?;
    write_f64(&mut out, 24, signed)?;
    write_f64(&mut out, 32, magnitude)?;
    write_f64(&mut out, 40, participation)?;
    out[48..56].copy_from_slice(&eligible_count.to_le_bytes());
    out[56..64].copy_from_slice(&total_count.to_le_bytes());
    Ok(out)
}

fn read_u32(bytes: &[u8], offset: usize) -> Result<u32, &'static str> {
    let raw: [u8; 4] = bytes
        .get(offset..offset.checked_add(4).ok_or("c3 v0.2 u32 offset overflow")?)
        .ok_or("c3 v0.2 u32 field is truncated")?
        .try_into()
        .map_err(|_| "c3 v0.2 u32 field is truncated")?;
    Ok(u32::from_le_bytes(raw))
}

fn read_i64(bytes: &[u8], offset: usize) -> Result<i64, &'static str> {
    let raw: [u8; 8] = bytes
        .get(offset..offset.checked_add(8).ok_or("c3 v0.2 i64 offset overflow")?)
        .ok_or("c3 v0.2 i64 field is truncated")?
        .try_into()
        .map_err(|_| "c3 v0.2 i64 field is truncated")?;
    Ok(i64::from_le_bytes(raw))
}

fn read_f64(bytes: &[u8], offset: usize) -> Result<f64, &'static str> {
    let raw: [u8; 8] = bytes
        .get(offset..offset.checked_add(8).ok_or("c3 v0.2 f64 offset overflow")?)
        .ok_or("c3 v0.2 f64 field is truncated")?
        .try_into()
        .map_err(|_| "c3 v0.2 f64 field is truncated")?;
    Ok(f64::from_le_bytes(raw))
}

fn write_f64(bytes: &mut [u8], offset: usize, value: f64) -> Result<(), &'static str> {
    let end = offset
        .checked_add(8)
        .ok_or("c3 v0.2 f64 result offset overflow")?;
    bytes
        .get_mut(offset..end)
        .ok_or("c3 v0.2 result buffer is too small")?
        .copy_from_slice(&value.to_le_bytes());
    Ok(())
}
