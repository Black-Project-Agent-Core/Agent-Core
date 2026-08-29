use crate::structural_index_v01::{apply_direction_v01, DirectionInputV01};

const REQUEST_HEADER_BYTES: usize = 8;
const REQUEST_ROW_BYTES: usize = 48;
const RESULT_HEADER_BYTES: usize = 16;
const RESULT_ROW_BYTES: usize = 32;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct StructuralDirectionWireInputRowV01 {
    pub row_key: u32,
    pub comparable_runs: u32,
    pub current_volume: f64,
    pub prior_volume: f64,
    pub current_equal: f64,
    pub prior_equal: f64,
    pub base_confidence: f64,
}

#[derive(Debug, Clone, PartialEq)]
pub struct StructuralDirectionWireInputV01 {
    pub rows: Vec<StructuralDirectionWireInputRowV01>,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct StructuralDirectionWireResultRowV01 {
    pub row_key: u32,
    pub stage_code: u8,
    pub direction_code: u8,
    pub trend_score: Option<f64>,
    pub confidence: f64,
    pub reason_mask: u8,
}

#[derive(Debug, Clone, PartialEq)]
pub struct StructuralDirectionWireResultV01 {
    pub rows: Vec<StructuralDirectionWireResultRowV01>,
}

#[derive(Debug, Clone, Copy)]
pub struct StructuralDirectionV01View<'a> {
    payload: &'a [u8],
    row_count: usize,
}

impl<'a> StructuralDirectionV01View<'a> {
    pub fn parse(payload: &'a [u8]) -> Result<Self, &'static str> {
        if payload.len() < REQUEST_HEADER_BYTES {
            return Err("structural direction v0.1 request is truncated");
        }
        if payload[4..8].iter().any(|byte| *byte != 0) {
            return Err("structural direction v0.1 reserved header bytes must be zero");
        }
        let row_count = u32::from_le_bytes(
            payload[0..4]
                .try_into()
                .map_err(|_| "structural direction v0.1 row count is truncated")?,
        ) as usize;
        if row_count == 0 {
            return Err("structural direction v0.1 requires rows");
        }
        let rows_bytes = row_count
            .checked_mul(REQUEST_ROW_BYTES)
            .ok_or("structural direction v0.1 request size overflow")?;
        let expected = REQUEST_HEADER_BYTES
            .checked_add(rows_bytes)
            .ok_or("structural direction v0.1 request size overflow")?;
        if payload.len() != expected {
            return Err("structural direction v0.1 request length is invalid");
        }
        Ok(Self { payload, row_count })
    }

    pub fn len(&self) -> usize {
        self.row_count
    }

    pub fn is_empty(&self) -> bool {
        self.row_count == 0
    }

    pub fn to_owned_input(&self) -> Result<StructuralDirectionWireInputV01, &'static str> {
        let mut rows = Vec::with_capacity(self.row_count);
        for index in 0..self.row_count {
            let off = REQUEST_HEADER_BYTES + index * REQUEST_ROW_BYTES;
            let row_key = read_u32(self.payload, off)?;
            if row_key == 0 {
                return Err("structural direction v0.1 row key must be non-zero");
            }
            let comparable_runs = read_u32(self.payload, off + 4)?;
            let current_volume = read_f64(self.payload, off + 8)?;
            let prior_volume = read_f64(self.payload, off + 16)?;
            let current_equal = read_f64(self.payload, off + 24)?;
            let prior_equal = read_f64(self.payload, off + 32)?;
            let base_confidence = read_f64(self.payload, off + 40)?;
            for value in [
                current_volume,
                prior_volume,
                current_equal,
                prior_equal,
                base_confidence,
            ] {
                if !value.is_finite() {
                    return Err("structural direction v0.1 values must be finite");
                }
            }
            rows.push(StructuralDirectionWireInputRowV01 {
                row_key,
                comparable_runs,
                current_volume,
                prior_volume,
                current_equal,
                prior_equal,
                base_confidence,
            });
        }
        Ok(StructuralDirectionWireInputV01 { rows })
    }
}

pub fn build_structural_direction_wire_v01(
    input: &StructuralDirectionWireInputV01,
) -> Result<StructuralDirectionWireResultV01, &'static str> {
    if input.rows.is_empty() {
        return Err("structural direction v0.1 requires rows");
    }
    let mut rows = Vec::with_capacity(input.rows.len());
    for row in &input.rows {
        if row.row_key == 0 {
            return Err("structural direction v0.1 row key must be non-zero");
        }
        for value in [
            row.current_volume,
            row.prior_volume,
            row.current_equal,
            row.prior_equal,
            row.base_confidence,
        ] {
            if !value.is_finite() {
                return Err("structural direction v0.1 values must be finite");
            }
        }
        let result = apply_direction_v01(DirectionInputV01 {
            comparable_runs: row.comparable_runs as usize,
            current_volume: row.current_volume,
            prior_volume: row.prior_volume,
            current_equal: row.current_equal,
            prior_equal: row.prior_equal,
            base_confidence: row.base_confidence,
        });
        let stage_code = match result.stage.as_str() {
            "composition" => 0,
            "movement" => 1,
            "preliminary" => 2,
            "established" => 3,
            _ => return Err("structural direction v0.1 stage is invalid"),
        };
        let direction_code = match result.direction.as_str() {
            "" => 0,
            "rising" => 1,
            "falling" => 2,
            "concentrated_rising" => 3,
            "concentrated_falling" => 4,
            "neutral" => 5,
            _ => return Err("structural direction v0.1 direction is invalid"),
        };
        let mut reason_mask = 0u8;
        for reason in &result.reason_codes {
            reason_mask |= match reason.as_str() {
                "current_composition_only" => 1,
                "movement_indication_only" => 2,
                "preliminary_trend" => 4,
                _ => return Err("structural direction v0.1 reason is invalid"),
            };
        }
        rows.push(StructuralDirectionWireResultRowV01 {
            row_key: row.row_key,
            stage_code,
            direction_code,
            trend_score: result.trend_score,
            confidence: result.confidence,
            reason_mask,
        });
    }
    Ok(StructuralDirectionWireResultV01 { rows })
}

pub fn encode_structural_direction_v01_result(
    duration_micros: u64,
    result: &StructuralDirectionWireResultV01,
) -> Result<Vec<u8>, &'static str> {
    let row_count = u32::try_from(result.rows.len())
        .map_err(|_| "structural direction v0.1 result row count overflow")?;
    let rows_bytes = result
        .rows
        .len()
        .checked_mul(RESULT_ROW_BYTES)
        .ok_or("structural direction v0.1 result size overflow")?;
    let total = RESULT_HEADER_BYTES
        .checked_add(rows_bytes)
        .ok_or("structural direction v0.1 result size overflow")?;
    let mut out = vec![0u8; total];
    out[0..8].copy_from_slice(&duration_micros.to_le_bytes());
    out[8..12].copy_from_slice(&row_count.to_le_bytes());
    for (index, row) in result.rows.iter().enumerate() {
        if row.row_key == 0
            || row.stage_code > 3
            || row.direction_code > 5
            || row.reason_mask & !0b111 != 0
        {
            return Err("structural direction v0.1 result metadata is invalid");
        }
        if !row.confidence.is_finite() || row.trend_score.is_some_and(|value| !value.is_finite()) {
            return Err("structural direction v0.1 result values must be finite");
        }
        let off = RESULT_HEADER_BYTES + index * RESULT_ROW_BYTES;
        out[off..off + 4].copy_from_slice(&row.row_key.to_le_bytes());
        out[off + 4] = row.stage_code;
        out[off + 5] = row.direction_code;
        out[off + 6] = u8::from(row.trend_score.is_some());
        out[off + 7] = row.reason_mask;
        if let Some(value) = row.trend_score {
            out[off + 8..off + 16].copy_from_slice(&value.to_le_bytes());
        }
        out[off + 16..off + 24].copy_from_slice(&row.confidence.to_le_bytes());
    }
    Ok(out)
}

fn read_u32(bytes: &[u8], offset: usize) -> Result<u32, &'static str> {
    let end = offset
        .checked_add(4)
        .ok_or("structural direction v0.1 u32 offset overflow")?;
    let raw: [u8; 4] = bytes
        .get(offset..end)
        .ok_or("structural direction v0.1 u32 field is truncated")?
        .try_into()
        .map_err(|_| "structural direction v0.1 u32 field is truncated")?;
    Ok(u32::from_le_bytes(raw))
}

fn read_f64(bytes: &[u8], offset: usize) -> Result<f64, &'static str> {
    let end = offset
        .checked_add(8)
        .ok_or("structural direction v0.1 f64 offset overflow")?;
    let raw: [u8; 8] = bytes
        .get(offset..end)
        .ok_or("structural direction v0.1 f64 field is truncated")?
        .try_into()
        .map_err(|_| "structural direction v0.1 f64 field is truncated")?;
    Ok(f64::from_le_bytes(raw))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn view_rejects_truncation_and_decodes_owned_rows() {
        let mut payload = vec![0u8; REQUEST_HEADER_BYTES + REQUEST_ROW_BYTES];
        payload[0..4].copy_from_slice(&1u32.to_le_bytes());
        payload[8..12].copy_from_slice(&7u32.to_le_bytes());
        payload[12..16].copy_from_slice(&3u32.to_le_bytes());
        for (offset, value) in [
            (16usize, 70.0_f64),
            (24, 50.0),
            (32, 68.0),
            (40, 52.0),
            (48, 95.0),
        ] {
            payload[offset..offset + 8].copy_from_slice(&value.to_le_bytes());
        }
        for end in 0..payload.len() {
            assert!(StructuralDirectionV01View::parse(&payload[..end]).is_err());
        }
        let view = StructuralDirectionV01View::parse(&payload).expect("direction view");
        assert_eq!(view.len(), 1);
        let owned = view.to_owned_input().expect("owned direction input");
        assert_eq!(owned.rows[0].row_key, 7);
        assert_eq!(owned.rows[0].comparable_runs, 3);
        assert_eq!(owned.rows[0].current_volume.to_bits(), 70.0f64.to_bits());
    }

    #[test]
    fn wire_kernel_preserves_direction_semantics() {
        let input = StructuralDirectionWireInputV01 {
            rows: vec![
                StructuralDirectionWireInputRowV01 {
                    row_key: 1,
                    comparable_runs: 1,
                    current_volume: 70.0,
                    prior_volume: 0.0,
                    current_equal: 65.0,
                    prior_equal: 0.0,
                    base_confidence: 90.0,
                },
                StructuralDirectionWireInputRowV01 {
                    row_key: 2,
                    comparable_runs: 2,
                    current_volume: 70.0,
                    prior_volume: 50.0,
                    current_equal: 68.0,
                    prior_equal: 52.0,
                    base_confidence: 95.0,
                },
            ],
        };
        let result = build_structural_direction_wire_v01(&input).expect("direction build");
        assert_eq!(result.rows[0].stage_code, 0);
        assert_eq!(result.rows[0].direction_code, 0);
        assert!(result.rows[0].trend_score.is_none());
        assert_eq!(result.rows[0].confidence.to_bits(), 55.0f64.to_bits());
        assert_eq!(result.rows[0].reason_mask, 1);
        assert_eq!(result.rows[1].stage_code, 1);
        assert_eq!(result.rows[1].direction_code, 1);
        assert_eq!(
            result.rows[1].trend_score.unwrap().to_bits(),
            68.0f64.to_bits()
        );
        assert_eq!(result.rows[1].confidence.to_bits(), 65.0f64.to_bits());
        assert_eq!(result.rows[1].reason_mask, 2);

        let encoded = encode_structural_direction_v01_result(9, &result).expect("encode result");
        assert_eq!(encoded.len(), RESULT_HEADER_BYTES + 2 * RESULT_ROW_BYTES);
        assert_eq!(u64::from_le_bytes(encoded[0..8].try_into().unwrap()), 9);
    }
}
