use crate::c3_v02_schema::{MovementDivergenceV02View, PeerRelativeRankV02View};
use crate::ranking_v01::{round_1, signed_delta_percent};

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct CompetitionAccelerationV02Result {
    pub previous_delta_percent: f64,
    pub current_delta_percent: f64,
    pub acceleration: f64,
    pub zero_baseline_flags: u32,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct DirectionalMomentumV02Result {
    pub odmi: f64,
    pub magnitude: f64,
    pub comparable_products: u64,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct MovementDivergenceV02Result {
    pub product_mass_weighted: f64,
    pub equal_segment: f64,
    pub signed_divergence: f64,
    pub divergence_magnitude: f64,
    pub participation: f64,
    pub eligible_child_count: u64,
    pub total_child_count: u64,
}

pub fn competition_acceleration_v02(
    older: i64,
    prior: i64,
    current: i64,
) -> Result<CompetitionAccelerationV02Result, &'static str> {
    if older < 0 || prior < 0 || current < 0 {
        return Err("competition acceleration v0.2 counts must be non-negative");
    }
    let previous_delta_percent = signed_delta_percent(prior as f64, older as f64);
    let current_delta_percent = signed_delta_percent(current as f64, prior as f64);
    let acceleration = round_1(current_delta_percent - previous_delta_percent);
    let mut zero_baseline_flags = 0u32;
    if older == 0 && prior > 0 {
        zero_baseline_flags |= 1;
    }
    if prior == 0 && current > 0 {
        zero_baseline_flags |= 2;
    }
    Ok(CompetitionAccelerationV02Result {
        previous_delta_percent,
        current_delta_percent,
        acceleration,
        zero_baseline_flags,
    })
}

pub fn directional_momentum_v02(
    rising: i64,
    neutral: i64,
    falling: i64,
) -> Result<DirectionalMomentumV02Result, &'static str> {
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
    let odmi = round_1(100.0 * (rising - falling) as f64 / comparable as f64);
    let magnitude = round_1(odmi.abs());
    Ok(DirectionalMomentumV02Result {
        odmi,
        magnitude,
        comparable_products: comparable as u64,
    })
}

pub fn peer_relative_rank_v02(
    view: &PeerRelativeRankV02View<'_>,
) -> Result<(f64, u64), &'static str> {
    if view.len() < 2 {
        return Err("peer relative rank v0.2 requires at least two peers");
    }
    let mut pairs = Vec::with_capacity(view.len());
    for i in 0..view.len() {
        let value = view
            .value(i)
            .ok_or("peer relative rank v0.2 peer value missing")?;
        if !value.is_finite() {
            return Err("peer relative rank v0.2 peer value must be finite");
        }
        pairs.push((i, value));
    }
    pairs.sort_by(|left, right| match left.1.total_cmp(&right.1) {
        std::cmp::Ordering::Equal => left.0.cmp(&right.0),
        other => other,
    });
    let subject = view.subject_index();
    let mut i = 0usize;
    while i < pairs.len() {
        let mut j = i + 1;
        while j < pairs.len() && pairs[j].1 == pairs[i].1 {
            j += 1;
        }
        if pairs[i..j].iter().any(|pair| pair.0 == subject) {
            let average_index = (i as f64 + (j - 1) as f64) / 2.0;
            let percentile = round_1(average_index / (pairs.len() - 1) as f64 * 100.0);
            return Ok((percentile, pairs.len() as u64));
        }
        i = j;
    }
    Err("peer relative rank v0.2 subject not found")
}

pub fn author_concentration_change_v02(prior: f64, current: f64) -> Result<f64, &'static str> {
    if !prior.is_finite()
        || !current.is_finite()
        || !(0.0..=100.0).contains(&prior)
        || !(0.0..=100.0).contains(&current)
    {
        return Err("author concentration change v0.2 values must be within 0..100");
    }
    Ok(round_1(current - prior))
}

pub fn movement_divergence_v02(
    view: &MovementDivergenceV02View<'_>,
) -> Result<MovementDivergenceV02Result, &'static str> {
    if view.len() == 0 {
        return Err("movement divergence v0.2 requires eligible children");
    }
    let mut weighted_sum = 0.0;
    let mut mass_sum = 0.0;
    let mut equal_sum = 0.0;
    for i in 0..view.len() {
        let (value, mass) = view
            .child(i)
            .ok_or("movement divergence v0.2 child missing")?;
        if !value.is_finite()
            || !mass.is_finite()
            || !(-100.0..=100.0).contains(&value)
            || mass <= 0.0
        {
            return Err("movement divergence v0.2 child is invalid");
        }
        weighted_sum += value * mass;
        mass_sum += mass;
        equal_sum += value;
    }
    if !mass_sum.is_finite() || mass_sum <= 0.0 {
        return Err("movement divergence v0.2 product mass is invalid");
    }
    let weighted = round_1(weighted_sum / mass_sum);
    let equal = round_1(equal_sum / view.len() as f64);
    let signed = round_1(weighted - equal);
    let magnitude = round_1(signed.abs());
    let participation = round_1(100.0 * view.len() as f64 / view.total_count() as f64);
    Ok(MovementDivergenceV02Result {
        product_mass_weighted: weighted,
        equal_segment: equal,
        signed_divergence: signed,
        divergence_magnitude: magnitude,
        participation,
        eligible_child_count: view.len() as u64,
        total_child_count: view.total_count() as u64,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::c3_v02_schema::{MovementDivergenceV02View, PeerRelativeRankV02View};

    #[test]
    fn competition_acceleration_is_change_in_adjacent_first_order_deltas() {
        let got = competition_acceleration_v02(80, 100, 140).unwrap();
        assert_eq!(got.previous_delta_percent, 25.0);
        assert_eq!(got.current_delta_percent, 40.0);
        assert_eq!(got.acceleration, 15.0);
        assert_eq!(got.zero_baseline_flags, 0);
        let zero = competition_acceleration_v02(0, 10, 20).unwrap();
        assert_eq!(zero.previous_delta_percent, 100.0);
        assert_eq!(zero.current_delta_percent, 100.0);
        assert_eq!(zero.acceleration, 0.0);
        assert_eq!(zero.zero_baseline_flags, 1);
    }

    #[test]
    fn odmi_is_peer_independent_signed_directional_balance() {
        let got = directional_momentum_v02(7, 2, 1).unwrap();
        assert_eq!(got.odmi, 60.0);
        assert_eq!(got.magnitude, 60.0);
        assert_eq!(got.comparable_products, 10);
        let falling = directional_momentum_v02(1, 2, 7).unwrap();
        assert_eq!(falling.odmi, -60.0);
        assert_eq!(falling.magnitude, 60.0);
        assert!(directional_momentum_v02(0, 0, 0).is_err());
    }

    #[test]
    fn prr_is_tie_aware_and_rejects_single_peer_in_schema() {
        let mut payload = vec![0u8; 48];
        payload[0..4].copy_from_slice(&4u32.to_le_bytes());
        payload[4..8].copy_from_slice(&1u32.to_le_bytes());
        for (i, value) in [-20.0f64, 10.0, 10.0, 80.0].into_iter().enumerate() {
            payload[16 + i * 8..24 + i * 8].copy_from_slice(&value.to_le_bytes());
        }
        let view = PeerRelativeRankV02View::parse(&payload).unwrap();
        let (percentile, count) = peer_relative_rank_v02(&view).unwrap();
        assert_eq!(percentile, 50.0);
        assert_eq!(count, 4);
    }

    #[test]
    fn author_concentration_change_is_hhi_point_delta() {
        assert_eq!(author_concentration_change_v02(31.25, 27.5).unwrap(), -3.8);
    }

    #[test]
    fn movement_divergence_preserves_sign_and_weighting() {
        let mut payload = vec![0u8; 48];
        payload[0..4].copy_from_slice(&2u32.to_le_bytes());
        payload[4..8].copy_from_slice(&4u32.to_le_bytes());
        payload[16..24].copy_from_slice(&50f64.to_le_bytes());
        payload[24..32].copy_from_slice(&10f64.to_le_bytes());
        payload[32..40].copy_from_slice(&(-10f64).to_le_bytes());
        payload[40..48].copy_from_slice(&30f64.to_le_bytes());
        let view = MovementDivergenceV02View::parse(&payload).unwrap();
        let got = movement_divergence_v02(&view).unwrap();
        assert_eq!(got.product_mass_weighted, 5.0);
        assert_eq!(got.equal_segment, 20.0);
        assert_eq!(got.signed_divergence, -15.0);
        assert_eq!(got.divergence_magnitude, 15.0);
        assert_eq!(got.participation, 50.0);
        assert_eq!(got.eligible_child_count, 2);
        assert_eq!(got.total_child_count, 4);
    }
}
