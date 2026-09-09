use serde::{Deserialize, Serialize};
use serde_json::Value;

pub const PROTOCOL_V1: &str = "msl-analytics/1";
pub const ENGINE_NAME: &str = "rust-native";
pub const ENGINE_VERSION: &str = env!("CARGO_PKG_VERSION");

pub const OP_CAPABILITIES: &str = "capabilities";
pub const OP_DISTRIBUTION_SIMILARITY: &str = "distribution_similarity";
pub const OP_ITEM_VOLATILITY: &str = "item_volatility";
pub const OP_CLUSTER_VOLATILITY: &str = "cluster_volatility";
pub const OP_SELECTION_PROBABILITY: &str = "selection_probability";

pub const PILOT_CAPABILITIES: [&str; 4] = [
    OP_DISTRIBUTION_SIMILARITY,
    OP_ITEM_VOLATILITY,
    OP_CLUSTER_VOLATILITY,
    OP_SELECTION_PROBABILITY,
];

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Request {
    pub protocol: String,
    pub id: String,
    pub op: String,
    #[serde(default)]
    pub input: Value,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ErrorBody {
    pub code: String,
    pub message: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Response {
    pub protocol: &'static str,
    pub id: String,
    pub ok: bool,
    pub engine: &'static str,
    pub engine_version: &'static str,
    pub duration_micros: u128,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<ErrorBody>,
}

pub fn valid_op(op: &str) -> bool {
    matches!(
        op,
        OP_CAPABILITIES
            | OP_DISTRIBUTION_SIMILARITY
            | OP_ITEM_VOLATILITY
            | OP_CLUSTER_VOLATILITY
            | OP_SELECTION_PROBABILITY
    )
}

pub fn validate_request(req: &Request) -> Result<(), ErrorBody> {
    if req.protocol != PROTOCOL_V1 {
        return Err(ErrorBody {
            code: "unsupported_protocol".to_string(),
            message: format!("unsupported analytics protocol {:?}", req.protocol),
        });
    }
    if req.id.trim().is_empty() {
        return Err(ErrorBody {
            code: "missing_request_id".to_string(),
            message: "analytics request id is required".to_string(),
        });
    }
    if !valid_op(&req.op) {
        return Err(ErrorBody {
            code: "unsupported_operation".to_string(),
            message: format!("unsupported analytics operation {:?}", req.op),
        });
    }
    Ok(())
}

pub fn success(id: String, result: Value, duration_micros: u128) -> Response {
    Response {
        protocol: PROTOCOL_V1,
        id,
        ok: true,
        engine: ENGINE_NAME,
        engine_version: ENGINE_VERSION,
        duration_micros,
        result: Some(result),
        error: None,
    }
}

pub fn failure(id: String, error: ErrorBody, duration_micros: u128) -> Response {
    Response {
        protocol: PROTOCOL_V1,
        id,
        ok: false,
        engine: ENGINE_NAME,
        engine_version: ENGINE_VERSION,
        duration_micros,
        result: None,
        error: Some(error),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request(protocol: &str, id: &str, op: &str) -> Request {
        Request {
            protocol: protocol.to_string(),
            id: id.to_string(),
            op: op.to_string(),
            input: Value::Object(Default::default()),
        }
    }

    #[test]
    fn validates_protocol_request_contract() {
        assert!(validate_request(&request(PROTOCOL_V1, "req-1", OP_CAPABILITIES)).is_ok());
        assert_eq!(
            validate_request(&request("msl-analytics/0", "req-1", OP_CAPABILITIES))
                .unwrap_err()
                .code,
            "unsupported_protocol"
        );
        assert_eq!(
            validate_request(&request(PROTOCOL_V1, "", OP_CAPABILITIES))
                .unwrap_err()
                .code,
            "missing_request_id"
        );
        assert_eq!(
            validate_request(&request(PROTOCOL_V1, "req-1", "unknown"))
                .unwrap_err()
                .code,
            "unsupported_operation"
        );
    }

    #[test]
    fn pilot_capabilities_are_stable_and_ordered() {
        assert_eq!(
            PILOT_CAPABILITIES,
            [
                "distribution_similarity",
                "item_volatility",
                "cluster_volatility",
                "selection_probability"
            ]
        );
    }
}
