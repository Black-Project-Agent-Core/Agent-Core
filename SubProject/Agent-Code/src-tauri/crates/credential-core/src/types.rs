use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(transparent)]
pub struct KeyId(pub String);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum CredentialProvider {
    OpenRouter,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum CredentialEventKind {
    CredentialAdded,
    CredentialRemoved,
    CredentialHealthy,
    CredentialWarning,
    CredentialCooldown,
    CredentialRecovered,
    CredentialExpired,
    CredentialSelected,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CredentialEvent {
    pub event_id: i64,
    pub kind: CredentialEventKind,
    pub key_id: KeyId,
    pub occurred_at_utc_ms: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CredentialProfile {
    pub key_id: KeyId,
    pub provider: CredentialProvider,
    pub health_score: f64,
    pub reliability_score: f64,
    pub latency_score: f64,
    pub quota_score: f64,
    pub confidence_score: f64,
    pub last_observed_at_utc_ms: Option<i64>,
    pub updated_at_utc_ms: i64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum LifecycleState {
    Enabled,
    Disabled,
    Invalid,
    Quarantined,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum AvailabilityState {
    Unverified,
    Ready,
    Cooldown,
    Exhausted,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum LimitReset {
    Daily,
    Weekly,
    Monthly,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum FailureClass {
    AuthInvalid,
    PermissionBlocked,
    CreditBlocked,
    RateLimited,
    RequestInvalid,
    ProviderTransient,
    Unknown,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct KeySummary {
    pub key_id: KeyId,
    pub slot_index: i64,
    pub label: String,
    pub masked_suffix: String,
    pub lifecycle_state: LifecycleState,
    pub availability_state: AvailabilityState,
    pub cooldown_until_utc_ms: Option<i64>,
    pub consecutive_failures: u32,
    pub last_success_at_utc_ms: Option<i64>,
    pub last_failure_at_utc_ms: Option<i64>,
    pub last_failure_class: Option<FailureClass>,
    pub last_probe_at_utc_ms: Option<i64>,
    pub limit_value: Option<f64>,
    pub limit_remaining: Option<f64>,
    pub limit_reset: Option<LimitReset>,
    pub usage_daily: Option<f64>,
    pub is_free_tier: Option<bool>,
    pub expires_at_utc_ms: Option<i64>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn credential_profile_serialization_is_metadata_only() {
        let profile = CredentialProfile {
            key_id: KeyId("key-1".to_owned()),
            provider: CredentialProvider::OpenRouter,
            health_score: 91.0,
            reliability_score: 88.0,
            latency_score: 76.0,
            quota_score: 64.0,
            confidence_score: 83.0,
            last_observed_at_utc_ms: Some(1_000),
            updated_at_utc_ms: 1_000,
        };

        let serialized = serde_json::to_string(&profile).unwrap();
        assert!(serialized.contains("OPEN_ROUTER"));
        assert!(!serialized.contains("secret"));
        assert!(!serialized.contains("protected_blob"));
        assert!(!serialized.contains("ciphertext"));
    }

    #[test]
    fn key_summary_serialization_is_metadata_only() {
        let canary = "sk-or-v1-SYNTHETIC_FULL_KEY_MUST_NOT_SERIALIZE_3Fxa";
        let summary = KeySummary {
            key_id: KeyId("key-1".to_owned()),
            slot_index: 0,
            label: "Primary".to_owned(),
            masked_suffix: "••••3Fxa".to_owned(),
            lifecycle_state: LifecycleState::Enabled,
            availability_state: AvailabilityState::Unverified,
            cooldown_until_utc_ms: None,
            consecutive_failures: 0,
            last_success_at_utc_ms: None,
            last_failure_at_utc_ms: None,
            last_failure_class: None,
            last_probe_at_utc_ms: None,
            limit_value: None,
            limit_remaining: None,
            limit_reset: None,
            usage_daily: None,
            is_free_tier: None,
            expires_at_utc_ms: None,
        };

        let serialized = serde_json::to_string(&summary).unwrap();
        assert!(!serialized.contains(canary));
        assert!(!serialized.contains("secret"));
        assert!(!serialized.contains("protected_blob"));
        assert!(serialized.contains("••••3Fxa"));
    }
}
