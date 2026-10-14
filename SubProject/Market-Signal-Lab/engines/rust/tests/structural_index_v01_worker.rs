use msl_analytics_rust::batch_v2::execute_analytics_batch;
use msl_analytics_rust::protocol_v2::{decode_frame, STATUS_INTERNAL_ERROR, STATUS_OK};

const HEADER_BYTES: usize = 24;
const ROW_BYTES: usize = 72;
const WEIGHT_RESULT_BYTES: usize = 32;
const WEIGHT_BYTES: usize = 16;

fn decode_hex(text: &str) -> Vec<u8> {
    let compact: Vec<u8> = text.bytes().filter(|b| !b.is_ascii_whitespace()).collect();
    compact
        .chunks_exact(2)
        .map(|pair| {
            fn n(b: u8) -> u8 {
                match b {
                    b'0'..=b'9' => b - b'0',
                    b'a'..=b'f' => b - b'a' + 10,
                    b'A'..=b'F' => b - b'A' + 10,
                    _ => panic!("bad hex"),
                }
            }
            (n(pair[0]) << 4) | n(pair[1])
        })
        .collect()
}
fn u32_at(b: &[u8], o: usize) -> u32 {
    u32::from_le_bytes(b[o..o + 4].try_into().unwrap())
}
fn u64_at(b: &[u8], o: usize) -> u64 {
    u64::from_le_bytes(b[o..o + 8].try_into().unwrap())
}
fn f64_at(b: &[u8], o: usize) -> f64 {
    f64::from_le_bytes(b[o..o + 8].try_into().unwrap())
}

#[test]
fn structural_index_v01_go_wire_executes_real_rust_kernel() {
    let bytes = decode_hex(include_str!(
        "../../../testdata/analytics_v2/c1/ranking_request_three_ops.hex"
    ));
    let frame = decode_frame(&bytes).expect("Go-generated ranking request must decode");
    let results = execute_analytics_batch(&frame);
    let structural = results.iter().find(|r| r.slot_id == 53).expect("slot 53");

    assert_ne!(
        structural.status, STATUS_INTERNAL_ERROR,
        "Task 6 RED: op-7 still placeholder"
    );
    assert_eq!(structural.status, STATUS_OK);

    assert_eq!(
        u32_at(&structural.payload, 8),
        2,
        "row_count: global + site"
    );
    assert_eq!(u32_at(&structural.payload, 12), 1, "weight_result_count");
    assert_eq!(u32_at(&structural.payload, 16), 1, "weight_count");
    assert_eq!(u32_at(&structural.payload, 20), 0, "reserved");
    let _duration = u64_at(&structural.payload, 0);
    assert_eq!(
        structural.payload.len(),
        HEADER_BYTES + 2 * ROW_BYTES + WEIGHT_RESULT_BYTES + WEIGHT_BYTES
    );

    let global = HEADER_BYTES;
    assert_eq!(
        u32_at(&structural.payload, global),
        0,
        "global segment sentinel"
    );
    assert_eq!(u32_at(&structural.payload, global + 4), 0);
    assert_eq!(structural.payload[global + 8], 0, "global level code");
    assert_eq!(structural.payload[global + 9], 0, "aligned divergence");
    assert_eq!(structural.payload[global + 10], 0, "composition stage");
    assert_eq!(structural.payload[global + 11], 1, "grade A");
    assert_eq!(u32_at(&structural.payload, global + 12), 40);
    for offset in [16usize, 24, 32] {
        assert_eq!(
            f64_at(&structural.payload, global + offset).to_bits(),
            100.0f64.to_bits()
        );
    }
    assert_eq!(
        f64_at(&structural.payload, global + 40).to_bits(),
        0.0f64.to_bits()
    );
    assert_eq!(
        f64_at(&structural.payload, global + 48).to_bits(),
        100.0f64.to_bits()
    );
    assert_eq!(
        f64_at(&structural.payload, global + 56).to_bits(),
        90.0f64.to_bits()
    );
    assert_eq!(
        f64_at(&structural.payload, global + 64).to_bits(),
        90.0f64.to_bits()
    );

    let site = HEADER_BYTES + ROW_BYTES;
    assert_eq!(u32_at(&structural.payload, site), 21);
    assert_eq!(u32_at(&structural.payload, site + 4), 2);
    assert_eq!(structural.payload[site + 8], 1, "site level code");
    assert_eq!(u32_at(&structural.payload, site + 12), 40);
    assert_eq!(
        f64_at(&structural.payload, site + 16).to_bits(),
        100.0f64.to_bits()
    );

    let wr = HEADER_BYTES + 2 * ROW_BYTES;
    assert_eq!(
        u32_at(&structural.payload, wr),
        0,
        "global weight parent sentinel"
    );
    assert_eq!(
        u32_at(&structural.payload, wr + 4),
        1,
        "fallback mask cap relaxation"
    );
    assert_eq!(
        f64_at(&structural.payload, wr + 8).to_bits(),
        0.45f64.to_bits()
    );
    assert_eq!(
        f64_at(&structural.payload, wr + 16).to_bits(),
        1.0f64.to_bits()
    );
    assert_eq!(u32_at(&structural.payload, wr + 24), 0, "weight start");
    assert_eq!(u32_at(&structural.payload, wr + 28), 1, "weight len");

    let weight = wr + WEIGHT_RESULT_BYTES;
    assert_eq!(u32_at(&structural.payload, weight), 21);
    assert_eq!(u32_at(&structural.payload, weight + 4), 0);
    assert_eq!(
        f64_at(&structural.payload, weight + 8).to_bits(),
        1.0f64.to_bits()
    );
}
