use msl_analytics_rust::batch_v2::{
    negotiate_handshake, HandshakeRequest, HandshakeRequestRegistryEntry,
    HANDSHAKE_STATUS_MISSING_REQUIRED_OPERATION, HANDSHAKE_STATUS_OK,
};

const SCHEMA_V1: u16 = 1;
const OP_PRODUCT_RANKING_V01: u16 = 5;
const OP_CATALOG_RANKING_V01: u16 = 6;
const OP_STRUCTURAL_INDEX_V01: u16 = 7;
const OP_STRUCTURAL_DIRECTION_V01: u16 = 8;

fn request(entries: &[(u16, u16)]) -> HandshakeRequest {
    HandshakeRequest {
        required_feature_flags: 0,
        host_max_frame_bytes: 64 << 20,
        registry: entries
            .iter()
            .map(|(operation_id, schema_id)| HandshakeRequestRegistryEntry {
                operation_id: *operation_id,
                schema_id: *schema_id,
                required_flags: 0,
            })
            .collect(),
    }
}

#[test]
fn ranking_v01_operation_schema_pairs_are_supported_and_advertised() {
    let required = [
        (OP_PRODUCT_RANKING_V01, SCHEMA_V1),
        (OP_CATALOG_RANKING_V01, SCHEMA_V1),
        (OP_STRUCTURAL_INDEX_V01, SCHEMA_V1),
        (OP_STRUCTURAL_DIRECTION_V01, SCHEMA_V1),
    ];
    let response = negotiate_handshake(&request(&required), "c1-test");

    assert_eq!(response.status, HANDSHAKE_STATUS_OK);
    for pair in required {
        assert!(
            response
                .registry
                .iter()
                .any(|entry| (entry.operation_id, entry.schema_id) == pair),
            "worker handshake must advertise operation/schema {:?}",
            pair
        );
    }
}

#[test]
fn ranking_v01_rejects_unsupported_schema_id() {
    let response = negotiate_handshake(
        &request(&[(OP_PRODUCT_RANKING_V01, SCHEMA_V1 + 1)]),
        "c1-test",
    );
    assert_eq!(response.status, HANDSHAKE_STATUS_MISSING_REQUIRED_OPERATION);
}
