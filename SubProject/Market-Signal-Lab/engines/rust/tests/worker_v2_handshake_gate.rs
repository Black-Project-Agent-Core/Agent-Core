use msl_analytics_rust::worker_v2::run_binary_worker_session;
use std::io::Cursor;

fn decode_hex(text: &str) -> Vec<u8> {
    let compact: Vec<u8> = text
        .bytes()
        .filter(|byte| !byte.is_ascii_whitespace())
        .collect();
    assert_eq!(compact.len() % 2, 0);
    compact
        .chunks_exact(2)
        .map(|pair| {
            fn nibble(byte: u8) -> u8 {
                match byte {
                    b'0'..=b'9' => byte - b'0',
                    b'a'..=b'f' => byte - b'a' + 10,
                    b'A'..=b'F' => byte - b'A' + 10,
                    _ => panic!("invalid hex fixture"),
                }
            }
            (nibble(pair[0]) << 4) | nibble(pair[1])
        })
        .collect()
}

fn analytics_request_without_handshake() -> Vec<u8> {
    decode_hex(include_str!(
        "../../../testdata/analytics_v2/analytics_request_four_ops.hex"
    ))
}

#[test]
fn binary_worker_rejects_analytics_before_handshake() {
    let mut input = Cursor::new(analytics_request_without_handshake());
    let mut output = Vec::new();

    let error = run_binary_worker_session(&mut input, &mut output, "0.1.0")
        .expect_err("analytics must not execute before the mandatory handshake");

    assert_eq!(error, "analytics v2 first frame must be handshake request");
    assert!(output.is_empty());
}
