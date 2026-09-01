use std::io::Read;
use std::time::Duration;

use reqwest::blocking::Client;
use reqwest::header::{HeaderValue, AUTHORIZATION, RETRY_AFTER};
use serde::Deserialize;
use thiserror::Error;
use time::{format_description::well_known::Rfc3339, OffsetDateTime};
use zeroize::Zeroize;

use crate::rotation::apply_failure;
use crate::{
    classify_status, AvailabilityState, CredentialEventKind, CredentialManager, FailureClass, KeyId,
    KeySummary, LifecycleState, LimitReset, ProtectError, SecretBytes, SecretProtector, StoreError,
};

pub const OPENROUTER_CURRENT_KEY_URL: &str = "https://openrouter.ai/api/v1/key";
pub const MAX_PROBE_BODY_BYTES: usize = 64 * 1024;
const CONNECT_TIMEOUT: Duration = Duration::from_secs(5);
const REQUEST_TIMEOUT: Duration = Duration::from_secs(10);
const MAX_RETRY_AFTER_MS: u64 = 30 * 24 * 60 * 60 * 1_000;

#[derive(Debug, Error)]
pub enum OpenRouterValidationError {
    #[error("credential was not found")]
    KeyNotFound,
    #[error("credential could not be decrypted safely")]
    ProtectedCredentialUnavailable,
    #[error("OpenRouter probe is temporarily unavailable")]
    ProbeUnavailable,
    #[error("OpenRouter probe returned malformed metadata")]
    ProbeMalformed,
    #[error("vault persistence failed")]
    Store(#[from] StoreError),
    #[error("probe state is unavailable")]
    StateUnavailable,
    #[error("probe time arithmetic overflowed")]
    TimeOverflow,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ProbeHttpResponse {
    pub(crate) status: u16,
    pub(crate) retry_after_ms: Option<u64>,
    pub(crate) body: Vec<u8>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Error)]
pub(crate) enum ProbeTransportError {
    #[error("probe timed out")]
    Timeout,
    #[error("probe transport failed")]
    Network,
    #[error("probe authorization header could not be constructed")]
    Header,
    #[error("probe response exceeded the bounded body limit")]
    ResponseTooLarge,
}

pub(crate) trait OpenRouterProbeTransport {
    fn get_current_key(
        &self,
        secret: &SecretBytes,
    ) -> Result<ProbeHttpResponse, ProbeTransportError>;
}

pub struct OpenRouterProbeClient {
    client: Client,
}

impl OpenRouterProbeClient {
    pub fn new() -> Result<Self, OpenRouterValidationError> {
        let client = Client::builder()
            .connect_timeout(CONNECT_TIMEOUT)
            .timeout(REQUEST_TIMEOUT)
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .map_err(|_| OpenRouterValidationError::ProbeUnavailable)?;
        Ok(Self { client })
    }
}

impl OpenRouterProbeTransport for OpenRouterProbeClient {
    fn get_current_key(
        &self,
        secret: &SecretBytes,
    ) -> Result<ProbeHttpResponse, ProbeTransportError> {
        let mut authorization = secret.expose_bytes(|secret_bytes| {
            let mut value = Vec::with_capacity(7 + secret_bytes.len());
            value.extend_from_slice(b"Bearer ");
            value.extend_from_slice(secret_bytes);
            value
        });
        let header_value = HeaderValue::from_bytes(&authorization).map_err(|_| {
            authorization.zeroize();
            ProbeTransportError::Header
        })?;
        authorization.zeroize();

        let mut response = self
            .client
            .get(OPENROUTER_CURRENT_KEY_URL)
            .header(AUTHORIZATION, header_value)
            .send()
            .map_err(|error| {
                if error.is_timeout() {
                    ProbeTransportError::Timeout
                } else {
                    ProbeTransportError::Network
                }
            })?;

        let status = response.status().as_u16();
        let retry_after_ms = parse_retry_after_ms(response.headers().get(RETRY_AFTER));
        let mut body = Vec::with_capacity(8 * 1024);
        response
            .by_ref()
            .take((MAX_PROBE_BODY_BYTES + 1) as u64)
            .read_to_end(&mut body)
            .map_err(|_| ProbeTransportError::Network)?;
        if body.len() > MAX_PROBE_BODY_BYTES {
            body.zeroize();
            return Err(ProbeTransportError::ResponseTooLarge);
        }

        Ok(ProbeHttpResponse {
            status,
            retry_after_ms,
            body,
        })
    }
}

#[derive(Debug, Deserialize)]
struct CurrentKeyEnvelope {
    data: CurrentKeyData,
}

#[derive(Debug, Deserialize)]
struct CurrentKeyData {
    limit: Option<f64>,
    limit_remaining: Option<f64>,
    limit_reset: Option<String>,
    usage_daily: Option<f64>,
    is_free_tier: Option<bool>,
    expires_at: Option<String>,
}

#[derive(Debug, Clone, PartialEq)]
struct BoundedKeyMetadata {
    limit_value: Option<f64>,
    limit_remaining: Option<f64>,
    limit_reset: Option<LimitReset>,
    usage_daily: Option<f64>,
    is_free_tier: Option<bool>,
    expires_at_utc_ms: Option<i64>,
}

impl<P: SecretProtector> CredentialManager<P> {
    pub fn validate_openrouter_key(
        &self,
        key_id: &KeyId,
        client: &OpenRouterProbeClient,
        now_ms: i64,
    ) -> Result<KeySummary, OpenRouterValidationError> {
        self.validate_openrouter_key_with(key_id, client, now_ms)
    }

    pub(crate) fn validate_openrouter_key_with<T: OpenRouterProbeTransport>(
        &self,
        key_id: &KeyId,
        transport: &T,
        now_ms: i64,
    ) -> Result<KeySummary, OpenRouterValidationError> {
        let (secret, started_lifecycle) = {
            let mut inner = self
                .lock_inner()
                .map_err(|_| OpenRouterValidationError::StateUnavailable)?;
            let mut record = inner
                .keys
                .get(key_id)
                .cloned()
                .ok_or(OpenRouterValidationError::KeyNotFound)?;

            if !record.protected_blob.verify_checksum() {
                record.lifecycle_state = LifecycleState::Quarantined;
                record.availability_state = AvailabilityState::Unverified;
                record.cooldown_until_utc_ms = None;
                record.updated_at_utc_ms = now_ms;
                let update = record.state_update();
                inner.store.update_key_state(key_id, &update)?;
                inner.keys.insert(key_id.clone(), record);
                return Err(OpenRouterValidationError::ProtectedCredentialUnavailable);
            }

            let secret = match inner.protector.unprotect(&record.protected_blob) {
                Ok(secret) => secret,
                Err(ProtectError::UnsupportedPlatform)
                | Err(ProtectError::ProtectFailed)
                | Err(ProtectError::UnprotectFailed)
                | Err(ProtectError::IntegrityFailed) => {
                    record.lifecycle_state = LifecycleState::Quarantined;
                    record.availability_state = AvailabilityState::Unverified;
                    record.cooldown_until_utc_ms = None;
                    record.updated_at_utc_ms = now_ms;
                    let update = record.state_update();
                    inner.store.update_key_state(key_id, &update)?;
                    inner.keys.insert(key_id.clone(), record);
                    return Err(OpenRouterValidationError::ProtectedCredentialUnavailable);
                }
            };

            let current = inner.in_flight.get(key_id).copied().unwrap_or(0);
            let next = current
                .checked_add(1)
                .ok_or(OpenRouterValidationError::StateUnavailable)?;
            inner.in_flight.insert(key_id.clone(), next);
            (secret, record.lifecycle_state)
        };

        let probe_result = transport.get_current_key(&secret);
        drop(secret);

        let mut inner = self
            .lock_inner()
            .map_err(|_| OpenRouterValidationError::StateUnavailable)?;
        let current_in_flight = inner.in_flight.get(key_id).copied().unwrap_or(0);
        let next_in_flight = current_in_flight
            .checked_sub(1)
            .ok_or(OpenRouterValidationError::StateUnavailable)?;
        inner.in_flight.insert(key_id.clone(), next_in_flight);

        let mut record = inner
            .keys
            .get(key_id)
            .cloned()
            .ok_or(OpenRouterValidationError::KeyNotFound)?;
        record.last_probe_at_utc_ms = Some(now_ms);
        record.updated_at_utc_ms = now_ms;

        let mut events = Vec::new();
        let result = match probe_result {
            Err(ProbeTransportError::Timeout | ProbeTransportError::Network) => {
                apply_failure(&mut record, FailureClass::ProviderTransient, None, now_ms)
                    .map_err(|_| OpenRouterValidationError::TimeOverflow)?;
                Err(OpenRouterValidationError::ProbeUnavailable)
            }
            Err(ProbeTransportError::Header | ProbeTransportError::ResponseTooLarge) => {
                Err(OpenRouterValidationError::ProbeMalformed)
            }
            Ok(response) if response.body.len() > MAX_PROBE_BODY_BYTES => {
                Err(OpenRouterValidationError::ProbeMalformed)
            }
            Ok(response) if response.status == 200 => {
                let metadata = match parse_metadata(&response.body) {
                    Ok(metadata) => metadata,
                    Err(error) => {
                        persist_probe_record(&mut inner, key_id, &record, &[], now_ms)?;
                        return Err(error);
                    }
                };
                apply_successful_metadata(&mut record, metadata, started_lifecycle, now_ms);
                if matches!(
                    started_lifecycle,
                    LifecycleState::Invalid | LifecycleState::Quarantined
                ) && record.lifecycle_state == LifecycleState::Enabled
                {
                    events.push(CredentialEventKind::CredentialRecovered);
                }
                if record.availability_state == AvailabilityState::Exhausted {
                    events.push(CredentialEventKind::CredentialExpired);
                } else {
                    events.push(CredentialEventKind::CredentialHealthy);
                }
                Ok(record.summary())
            }
            Ok(response) => {
                let classified = classify_status(response.status, response.retry_after_ms);
                if classified.failure_class == FailureClass::RateLimited
                    && classified.retry_after_ms.is_none()
                {
                    record.last_failure_at_utc_ms = Some(now_ms);
                    record.last_failure_class = Some(FailureClass::RateLimited);
                    Err(OpenRouterValidationError::ProbeUnavailable)
                } else {
                    match classified.failure_class {
                        FailureClass::AuthInvalid
                        | FailureClass::PermissionBlocked
                        | FailureClass::CreditBlocked
                        | FailureClass::RateLimited => {
                            apply_failure(
                                &mut record,
                                classified.failure_class,
                                classified.retry_after_ms,
                                now_ms,
                            )
                            .map_err(|_| OpenRouterValidationError::TimeOverflow)?;
                            if record.availability_state == AvailabilityState::Cooldown {
                                events.push(CredentialEventKind::CredentialCooldown);
                            } else if record.availability_state == AvailabilityState::Exhausted {
                                events.push(CredentialEventKind::CredentialExpired);
                            }
                            Ok(record.summary())
                        }
                        FailureClass::ProviderTransient
                        | FailureClass::RequestInvalid
                        | FailureClass::Unknown => {
                            apply_failure(&mut record, classified.failure_class, None, now_ms)
                                .map_err(|_| OpenRouterValidationError::TimeOverflow)?;
                            Err(OpenRouterValidationError::ProbeUnavailable)
                        }
                    }
                }
            }
        };

        persist_probe_record(&mut inner, key_id, &record, &events, now_ms)?;
        result
    }
}

fn persist_probe_record<P: SecretProtector>(
    inner: &mut crate::manager::ManagerInner<P>,
    key_id: &KeyId,
    record: &crate::StoredKeyRecord,
    events: &[CredentialEventKind],
    now_ms: i64,
) -> Result<(), OpenRouterValidationError> {
    let update = record.state_update();
    inner
        .store
        .update_key_state_with_events(key_id, &update, events, now_ms)?;
    inner.keys.insert(key_id.clone(), record.clone());
    Ok(())
}

fn parse_metadata(body: &[u8]) -> Result<BoundedKeyMetadata, OpenRouterValidationError> {
    if body.len() > MAX_PROBE_BODY_BYTES {
        return Err(OpenRouterValidationError::ProbeMalformed);
    }
    let envelope: CurrentKeyEnvelope =
        serde_json::from_slice(body).map_err(|_| OpenRouterValidationError::ProbeMalformed)?;
    let data = envelope.data;
    let limit_reset = match data.limit_reset.as_deref() {
        None => None,
        Some("daily") => Some(LimitReset::Daily),
        Some("weekly") => Some(LimitReset::Weekly),
        Some("monthly") => Some(LimitReset::Monthly),
        Some(_) => return Err(OpenRouterValidationError::ProbeMalformed),
    };
    let expires_at_utc_ms = match data.expires_at {
        None => None,
        Some(value) => Some(parse_rfc3339_utc_ms(&value)?),
    };

    for value in [data.limit, data.limit_remaining, data.usage_daily]
        .into_iter()
        .flatten()
    {
        if !value.is_finite() {
            return Err(OpenRouterValidationError::ProbeMalformed);
        }
    }

    Ok(BoundedKeyMetadata {
        limit_value: data.limit,
        limit_remaining: data.limit_remaining,
        limit_reset,
        usage_daily: data.usage_daily,
        is_free_tier: data.is_free_tier,
        expires_at_utc_ms,
    })
}

fn parse_rfc3339_utc_ms(value: &str) -> Result<i64, OpenRouterValidationError> {
    let timestamp = OffsetDateTime::parse(value, &Rfc3339)
        .map_err(|_| OpenRouterValidationError::ProbeMalformed)?;
    let millis = timestamp.unix_timestamp_nanos() / 1_000_000;
    i64::try_from(millis).map_err(|_| OpenRouterValidationError::ProbeMalformed)
}

fn apply_successful_metadata(
    record: &mut crate::StoredKeyRecord,
    metadata: BoundedKeyMetadata,
    started_lifecycle: LifecycleState,
    now_ms: i64,
) {
    if matches!(
        started_lifecycle,
        LifecycleState::Invalid | LifecycleState::Quarantined
    ) && record.lifecycle_state == started_lifecycle
    {
        record.lifecycle_state = LifecycleState::Enabled;
    }
    record.limit_value = metadata.limit_value;
    record.limit_remaining = metadata.limit_remaining;
    record.limit_reset = metadata.limit_reset;
    record.usage_daily = metadata.usage_daily;
    record.is_free_tier = metadata.is_free_tier;
    record.expires_at_utc_ms = metadata.expires_at_utc_ms;
    record.cooldown_until_utc_ms = None;
    record.consecutive_failures = 0;
    record.availability_state = if metadata
        .expires_at_utc_ms
        .is_some_and(|expires_at| expires_at <= now_ms)
        || metadata
            .limit_remaining
            .is_some_and(|remaining| remaining <= 0.0)
    {
        AvailabilityState::Exhausted
    } else {
        AvailabilityState::Ready
    };
}

fn parse_retry_after_ms(value: Option<&HeaderValue>) -> Option<u64> {
    let seconds = value?.to_str().ok()?.trim().parse::<u64>().ok()?;
    seconds
        .checked_mul(1_000)
        .map(|millis| millis.min(MAX_RETRY_AFTER_MS))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        AvailabilityState, CredentialManager, FailureClass, KeyId, LifecycleState, ProtectError,
        ProtectedBlob, SecretBytes, SecretProtector, VaultStore,
    };
    use std::sync::Mutex;

    #[derive(Clone, Copy)]
    struct XorTestProtector(u8);

    impl SecretProtector for XorTestProtector {
        fn protect(&self, secret: &SecretBytes) -> Result<ProtectedBlob, ProtectError> {
            Ok(ProtectedBlob::new(secret.expose_bytes(|bytes| {
                bytes.iter().map(|byte| byte ^ self.0).collect()
            })))
        }

        fn unprotect(&self, protected: &ProtectedBlob) -> Result<SecretBytes, ProtectError> {
            if !protected.verify_checksum() {
                return Err(ProtectError::IntegrityFailed);
            }
            SecretBytes::from_decrypted(
                protected
                    .as_bytes()
                    .iter()
                    .map(|byte| byte ^ self.0)
                    .collect(),
            )
            .map_err(|_| ProtectError::UnprotectFailed)
        }
    }

    struct FakeTransport {
        result: Mutex<Option<Result<ProbeHttpResponse, ProbeTransportError>>>,
        observed_secret_suffix: Mutex<Option<String>>,
    }

    impl FakeTransport {
        fn respond(response: ProbeHttpResponse) -> Self {
            Self {
                result: Mutex::new(Some(Ok(response))),
                observed_secret_suffix: Mutex::new(None),
            }
        }

        fn fail(error: ProbeTransportError) -> Self {
            Self {
                result: Mutex::new(Some(Err(error))),
                observed_secret_suffix: Mutex::new(None),
            }
        }
    }

    impl OpenRouterProbeTransport for FakeTransport {
        fn get_current_key(
            &self,
            secret: &SecretBytes,
        ) -> Result<ProbeHttpResponse, ProbeTransportError> {
            *self.observed_secret_suffix.lock().unwrap() = Some(secret.masked_suffix());
            self.result
                .lock()
                .unwrap()
                .take()
                .expect("fake response already consumed")
        }
    }

    fn manager_with_key() -> (
        tempfile::TempDir,
        CredentialManager<XorTestProtector>,
        KeyId,
    ) {
        let dir = tempfile::tempdir().unwrap();
        let manager = CredentialManager::open(
            VaultStore::open(dir.path().join("vault.db")).unwrap(),
            XorTestProtector(0x52),
        )
        .unwrap();
        let key = manager
            .add_openrouter_key(
                SecretBytes::parse_import("sk-or-v1-SYNTHETIC_PROBE_KEY_1234567890".to_owned())
                    .unwrap(),
                "Probe".to_owned(),
                100,
            )
            .unwrap();
        (dir, manager, key.key_id)
    }

    fn response(status: u16, body: &str) -> ProbeHttpResponse {
        ProbeHttpResponse {
            status,
            retry_after_ms: None,
            body: body.as_bytes().to_vec(),
        }
    }

    #[test]
    fn successful_probe_marks_ready_and_persists_only_bounded_metadata() {
        let (_dir, manager, key_id) = manager_with_key();
        let transport = FakeTransport::respond(response(
            200,
            r#"{"data":{"limit":100.0,"limit_remaining":74.5,"limit_reset":"monthly","usage_daily":25.5,"is_free_tier":false,"expires_at":"2027-12-31T23:59:59Z","label":"sk-or-v1-DO_NOT_PERSIST","creator_user_id":"user-private","usage_weekly":99.0}}"#,
        ));

        let summary = manager
            .validate_openrouter_key_with(&key_id, &transport, 1_000)
            .unwrap();
        assert_eq!(summary.lifecycle_state, LifecycleState::Enabled);
        assert_eq!(summary.availability_state, AvailabilityState::Ready);
        assert_eq!(summary.limit_value, Some(100.0));
        assert_eq!(summary.limit_remaining, Some(74.5));
        assert_eq!(summary.limit_reset, Some(crate::LimitReset::Monthly));
        assert_eq!(summary.usage_daily, Some(25.5));
        assert_eq!(summary.is_free_tier, Some(false));
        assert_eq!(summary.expires_at_utc_ms, Some(1_830_297_599_000));
        assert_eq!(summary.last_probe_at_utc_ms, Some(1_000));

        let serialized = serde_json::to_string(&summary).unwrap();
        assert!(!serialized.contains("DO_NOT_PERSIST"));
        assert!(!serialized.contains("user-private"));
    }

    #[test]
    fn successful_explicit_probe_rehabilitates_invalid_key_but_preserves_user_disabled_state() {
        let (_dir, manager, key_id) = manager_with_key();
        {
            let mut inner = manager.lock_inner().unwrap();
            let mut record = inner.keys.get(&key_id).cloned().unwrap();
            record.lifecycle_state = LifecycleState::Invalid;
            record.availability_state = AvailabilityState::Unverified;
            record.updated_at_utc_ms = 500;
            let update = record.state_update();
            inner.store.update_key_state(&key_id, &update).unwrap();
            inner.keys.insert(key_id.clone(), record);
        }
        let valid = FakeTransport::respond(response(
            200,
            r#"{"data":{"limit":100.0,"limit_remaining":80.0,"limit_reset":"monthly"}}"#,
        ));
        let rehabilitated = manager
            .validate_openrouter_key_with(&key_id, &valid, 600)
            .unwrap();
        assert_eq!(rehabilitated.lifecycle_state, LifecycleState::Enabled);
        assert_eq!(rehabilitated.availability_state, AvailabilityState::Ready);

        manager.set_enabled(&key_id, false, 700).unwrap();
        let valid_again = FakeTransport::respond(response(
            200,
            r#"{"data":{"limit":100.0,"limit_remaining":75.0,"limit_reset":"monthly"}}"#,
        ));
        let disabled = manager
            .validate_openrouter_key_with(&key_id, &valid_again, 800)
            .unwrap();
        assert_eq!(disabled.lifecycle_state, LifecycleState::Disabled);
        assert_eq!(disabled.availability_state, AvailabilityState::Ready);
    }

    #[test]
    fn successful_probe_detects_expired_or_exhausted_key_without_inventing_reset_deadline() {
        let (_dir, manager, key_id) = manager_with_key();
        let transport = FakeTransport::respond(response(
            200,
            r#"{"data":{"limit":10.0,"limit_remaining":0.0,"limit_reset":"daily","usage_daily":10.0,"is_free_tier":true,"expires_at":null}}"#,
        ));
        let summary = manager
            .validate_openrouter_key_with(&key_id, &transport, 2_000)
            .unwrap();
        assert_eq!(summary.availability_state, AvailabilityState::Exhausted);
        assert_eq!(summary.cooldown_until_utc_ms, None);
        assert_eq!(summary.limit_reset, Some(crate::LimitReset::Daily));
    }

    #[test]
    fn key_scoped_http_failures_apply_conservative_states() {
        for (status, lifecycle, availability, failure) in [
            (
                401,
                LifecycleState::Invalid,
                AvailabilityState::Unverified,
                FailureClass::AuthInvalid,
            ),
            (
                402,
                LifecycleState::Enabled,
                AvailabilityState::Exhausted,
                FailureClass::CreditBlocked,
            ),
            (
                403,
                LifecycleState::Quarantined,
                AvailabilityState::Unverified,
                FailureClass::PermissionBlocked,
            ),
        ] {
            let (_dir, manager, key_id) = manager_with_key();
            let transport = FakeTransport::respond(response(status, "{}"));
            let summary = manager
                .validate_openrouter_key_with(&key_id, &transport, 3_000)
                .unwrap();
            assert_eq!(summary.lifecycle_state, lifecycle, "status={status}");
            assert_eq!(summary.availability_state, availability, "status={status}");
            assert_eq!(summary.last_failure_class, Some(failure), "status={status}");
        }
    }

    #[test]
    fn rate_limit_uses_explicit_retry_hint_and_never_invents_provider_reset_metadata() {
        let (_dir, manager, key_id) = manager_with_key();
        let transport = FakeTransport::respond(ProbeHttpResponse {
            status: 429,
            retry_after_ms: Some(4_000),
            body: b"{}".to_vec(),
        });
        let summary = manager
            .validate_openrouter_key_with(&key_id, &transport, 5_000)
            .unwrap();
        assert_eq!(summary.availability_state, AvailabilityState::Cooldown);
        assert_eq!(summary.cooldown_until_utc_ms, Some(9_000));
        assert_eq!(summary.last_failure_class, Some(FailureClass::RateLimited));
    }

    #[test]
    fn rate_limit_without_retry_hint_preserves_current_health_and_returns_transient_error() {
        let (_dir, manager, key_id) = manager_with_key();
        let ready = FakeTransport::respond(response(
            200,
            r#"{"data":{"limit":100.0,"limit_remaining":80.0,"limit_reset":"monthly"}}"#,
        ));
        let ready_summary = manager
            .validate_openrouter_key_with(&key_id, &ready, 5_100)
            .unwrap();
        assert_eq!(ready_summary.availability_state, AvailabilityState::Ready);

        let rate_limited = FakeTransport::respond(response(429, "{}"));
        let error = manager
            .validate_openrouter_key_with(&key_id, &rate_limited, 5_200)
            .unwrap_err();
        assert!(matches!(error, OpenRouterValidationError::ProbeUnavailable));

        let after = manager.list_summaries().unwrap().remove(0);
        assert_eq!(after.lifecycle_state, LifecycleState::Enabled);
        assert_eq!(after.availability_state, AvailabilityState::Ready);
        assert_eq!(after.cooldown_until_utc_ms, None);
        assert_eq!(after.last_failure_class, Some(FailureClass::RateLimited));
        assert_eq!(after.last_probe_at_utc_ms, Some(5_200));
    }

    #[test]
    fn timeout_and_provider_transient_do_not_poison_current_key_health() {
        let (_dir, manager, key_id) = manager_with_key();
        let timeout = FakeTransport::fail(ProbeTransportError::Timeout);
        let error = manager
            .validate_openrouter_key_with(&key_id, &timeout, 6_000)
            .unwrap_err();
        assert!(matches!(error, OpenRouterValidationError::ProbeUnavailable));
        let after_timeout = manager.list_summaries().unwrap().remove(0);
        assert_eq!(after_timeout.lifecycle_state, LifecycleState::Enabled);
        assert_eq!(
            after_timeout.availability_state,
            AvailabilityState::Unverified
        );
        assert_eq!(after_timeout.last_probe_at_utc_ms, Some(6_000));
        assert_eq!(
            after_timeout.last_failure_class,
            Some(FailureClass::ProviderTransient)
        );

        for (offset, status) in [503, 529].into_iter().enumerate() {
            let provider = FakeTransport::respond(response(status, "{}"));
            let now_ms = 7_000 + offset as i64;
            let error = manager
                .validate_openrouter_key_with(&key_id, &provider, now_ms)
                .unwrap_err();
            assert!(matches!(error, OpenRouterValidationError::ProbeUnavailable));
            let after_provider = manager.list_summaries().unwrap().remove(0);
            assert_eq!(after_provider.lifecycle_state, LifecycleState::Enabled);
            assert_eq!(
                after_provider.availability_state,
                AvailabilityState::Unverified
            );
            assert_eq!(after_provider.last_probe_at_utc_ms, Some(now_ms));
        }
    }

    #[test]
    fn malformed_json_is_typed_and_does_not_leak_provider_body() {
        let (_dir, manager, key_id) = manager_with_key();
        let canary = "sk-or-v1-MALFORMED_PROVIDER_BODY_CANARY";
        let transport = FakeTransport::respond(response(200, canary));
        let error = manager
            .validate_openrouter_key_with(&key_id, &transport, 8_000)
            .unwrap_err();
        assert!(matches!(error, OpenRouterValidationError::ProbeMalformed));
        assert!(!format!("{error:?}").contains(canary));
        let summary = manager.list_summaries().unwrap().remove(0);
        assert_eq!(summary.availability_state, AvailabilityState::Unverified);
        assert_eq!(summary.last_probe_at_utc_ms, Some(8_000));
    }

    #[test]
    fn unknown_limit_reset_is_malformed_instead_of_silently_reinterpreted() {
        let (_dir, manager, key_id) = manager_with_key();
        let transport = FakeTransport::respond(response(
            200,
            r#"{"data":{"limit":5.0,"limit_remaining":3.0,"limit_reset":"hourly"}}"#,
        ));
        let error = manager
            .validate_openrouter_key_with(&key_id, &transport, 9_000)
            .unwrap_err();
        assert!(matches!(error, OpenRouterValidationError::ProbeMalformed));
    }

    #[test]
    fn oversized_response_is_rejected_without_persisting_raw_body() {
        let (_dir, manager, key_id) = manager_with_key();
        let transport = FakeTransport::respond(ProbeHttpResponse {
            status: 200,
            retry_after_ms: None,
            body: vec![b'x'; MAX_PROBE_BODY_BYTES + 1],
        });
        let error = manager
            .validate_openrouter_key_with(&key_id, &transport, 10_000)
            .unwrap_err();
        assert!(matches!(error, OpenRouterValidationError::ProbeMalformed));
    }

    #[test]
    fn healthy_probe_appends_healthy_event() {
        let (_dir, manager, key_id) = manager_with_key();
        let transport = FakeTransport::respond(response(
            200,
            r#"{"data":{"limit":100.0,"limit_remaining":80.0,"limit_reset":"monthly"}}"#,
        ));

        manager
            .validate_openrouter_key_with(&key_id, &transport, 11_000)
            .unwrap();

        let events = manager.list_credential_events(10).unwrap();
        assert_eq!(events[0].kind, CredentialEventKind::CredentialHealthy);
        assert_eq!(events[1].kind, CredentialEventKind::CredentialAdded);
    }

    #[test]
    fn recovered_probe_appends_recovered_before_healthy_event() {
        let (_dir, manager, key_id) = manager_with_key();
        {
            let mut inner = manager.lock_inner().unwrap();
            let mut record = inner.keys.get(&key_id).cloned().unwrap();
            record.lifecycle_state = LifecycleState::Invalid;
            record.availability_state = AvailabilityState::Unverified;
            record.updated_at_utc_ms = 11_100;
            let update = record.state_update();
            inner.store.update_key_state(&key_id, &update).unwrap();
            inner.keys.insert(key_id.clone(), record);
        }
        let transport = FakeTransport::respond(response(
            200,
            r#"{"data":{"limit":100.0,"limit_remaining":80.0,"limit_reset":"monthly"}}"#,
        ));

        manager
            .validate_openrouter_key_with(&key_id, &transport, 11_200)
            .unwrap();

        let events = manager.list_credential_events(10).unwrap();
        assert_eq!(events[0].kind, CredentialEventKind::CredentialHealthy);
        assert_eq!(events[1].kind, CredentialEventKind::CredentialRecovered);
        assert_eq!(events[2].kind, CredentialEventKind::CredentialAdded);
    }

    #[test]
    fn exhausted_probe_appends_expired_event_instead_of_healthy() {
        let (_dir, manager, key_id) = manager_with_key();
        let transport = FakeTransport::respond(response(
            200,
            r#"{"data":{"limit":10.0,"limit_remaining":0.0,"limit_reset":"daily"}}"#,
        ));

        manager
            .validate_openrouter_key_with(&key_id, &transport, 11_300)
            .unwrap();

        let events = manager.list_credential_events(10).unwrap();
        assert_eq!(events[0].kind, CredentialEventKind::CredentialExpired);
        assert_eq!(events[1].kind, CredentialEventKind::CredentialAdded);
    }

    #[test]
    fn explicit_rate_limit_probe_appends_cooldown_event() {
        let (_dir, manager, key_id) = manager_with_key();
        let transport = FakeTransport::respond(ProbeHttpResponse {
            status: 429,
            retry_after_ms: Some(4_000),
            body: b"{}".to_vec(),
        });

        manager
            .validate_openrouter_key_with(&key_id, &transport, 11_400)
            .unwrap();

        let events = manager.list_credential_events(10).unwrap();
        assert_eq!(events[0].kind, CredentialEventKind::CredentialCooldown);
        assert_eq!(events[1].kind, CredentialEventKind::CredentialAdded);
    }

    #[test]
    fn provider_transient_probe_does_not_append_false_key_health_event() {
        let (_dir, manager, key_id) = manager_with_key();
        let transport = FakeTransport::fail(ProbeTransportError::Timeout);

        let error = manager
            .validate_openrouter_key_with(&key_id, &transport, 11_500)
            .unwrap_err();
        assert!(matches!(error, OpenRouterValidationError::ProbeUnavailable));

        let events = manager.list_credential_events(10).unwrap();
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].kind, CredentialEventKind::CredentialAdded);
    }

    #[test]
    fn malformed_probe_does_not_append_event_or_provider_body() {
        let (_dir, manager, key_id) = manager_with_key();
        let canary = "sk-or-v1-EVENT_BODY_CANARY_MUST_NOT_PERSIST";
        let transport = FakeTransport::respond(response(200, canary));

        let error = manager
            .validate_openrouter_key_with(&key_id, &transport, 11_600)
            .unwrap_err();
        assert!(matches!(error, OpenRouterValidationError::ProbeMalformed));

        let events = manager.list_credential_events(10).unwrap();
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].kind, CredentialEventKind::CredentialAdded);
        assert!(!serde_json::to_string(&events).unwrap().contains(canary));
    }
}
