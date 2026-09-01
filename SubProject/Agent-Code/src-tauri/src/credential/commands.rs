use std::time::{SystemTime, UNIX_EPOCH};

use agent_code_credential_core::{
    run_synthetic_rotation_self_test, KeyId, KeySummary, ManagerError, OpenRouterProbeClient,
    OpenRouterValidationError, ProtectError, RotationSnapshot, SecretBytes, SecretProtector,
    SecretValidationError, StoreError, SyntheticRotationReport,
};
use serde::{Deserialize, Serialize};
use tauri::State;
use uuid::Uuid;
use zeroize::Zeroize;

use super::dpapi::DpapiProtector;
use super::state::CredentialAppState;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddOpenRouterKeyRequest {
    pub secret: String,
    pub label: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetEnabledRequest {
    pub key_id: String,
    pub enabled: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteKeyRequest {
    pub key_id: String,
}


#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidateKeyRequest {
    pub key_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct VaultCommandError {
    pub code: String,
}

impl VaultCommandError {
    fn new(code: &'static str) -> Self {
        Self {
            code: code.to_owned(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeVaultSelfTestReport {
    pub passed: bool,
    pub error_class: Option<String>,
}

#[tauri::command]
pub fn vault_add_openrouter_key(
    state: State<'_, CredentialAppState>,
    request: AddOpenRouterKeyRequest,
) -> Result<KeySummary, VaultCommandError> {
    let AddOpenRouterKeyRequest {
        mut secret,
        label,
    } = request;
    let moved_secret = std::mem::take(&mut secret);
    let parsed = SecretBytes::parse_import(moved_secret).map_err(map_secret_error);
    secret.zeroize();
    let parsed = parsed?;
    state
        .manager
        .add_openrouter_key(parsed, label, now_utc_ms()?)
        .map_err(map_manager_error)
}

#[tauri::command]
pub fn vault_list_openrouter_keys(
    state: State<'_, CredentialAppState>,
) -> Result<Vec<KeySummary>, VaultCommandError> {
    state.manager.list_summaries().map_err(map_manager_error)
}

#[tauri::command]
pub fn vault_set_enabled(
    state: State<'_, CredentialAppState>,
    request: SetEnabledRequest,
) -> Result<KeySummary, VaultCommandError> {
    state
        .manager
        .set_enabled(&KeyId(request.key_id), request.enabled, now_utc_ms()?)
        .map_err(map_manager_error)
}

#[tauri::command]
pub fn vault_delete_key(
    state: State<'_, CredentialAppState>,
    request: DeleteKeyRequest,
) -> Result<bool, VaultCommandError> {
    state
        .manager
        .delete_key(&KeyId(request.key_id), now_utc_ms()?)
        .map_err(map_manager_error)
}


#[tauri::command]
pub async fn vault_validate_key(
    state: State<'_, CredentialAppState>,
    request: ValidateKeyRequest,
) -> Result<KeySummary, VaultCommandError> {
    let manager = std::sync::Arc::clone(&state.manager);
    let key_id = KeyId(request.key_id);
    let now_ms = now_utc_ms()?;
    tauri::async_runtime::spawn_blocking(move || {
        let client = OpenRouterProbeClient::new().map_err(map_openrouter_error)?;
        manager
            .validate_openrouter_key(&key_id, &client, now_ms)
            .map_err(map_openrouter_error)
    })
    .await
    .map_err(|_| VaultCommandError::new("INTERNAL_ERROR"))?
}

#[tauri::command]
pub fn vault_run_native_self_test() -> NativeVaultSelfTestReport {
    run_dpapi_self_test()
}

#[tauri::command]
pub fn rotation_get_snapshot(
    state: State<'_, CredentialAppState>,
) -> Result<RotationSnapshot, VaultCommandError> {
    state
        .manager
        .rotation_snapshot()
        .map_err(|_| VaultCommandError::new("VAULT_CORRUPT"))
}

#[tauri::command]
pub fn rotation_run_synthetic_self_test() -> SyntheticRotationReport {
    run_synthetic_rotation_self_test()
}

fn run_dpapi_self_test() -> NativeVaultSelfTestReport {
    let mut canary = format!(
        "sk-or-v1-SYNTHETIC_DPAPI_SELFTEST_{}",
        Uuid::new_v4().simple()
    );
    let moved_canary = std::mem::take(&mut canary);
    let secret = match SecretBytes::parse_import(moved_canary) {
        Ok(secret) => secret,
        Err(_) => {
            canary.zeroize();
            return failed_self_test("INVALID_INPUT");
        }
    };
    canary.zeroize();

    let protector = DpapiProtector;
    let protected = match protector.protect(&secret) {
        Ok(protected) => protected,
        Err(_) => return failed_self_test("PROTECTION_FAILED"),
    };
    if !protected.verify_checksum() {
        return failed_self_test("PROTECTION_FAILED");
    }
    let contains_plaintext = secret.expose_bytes(|plaintext| {
        protected
            .as_bytes()
            .windows(plaintext.len())
            .any(|window| window == plaintext)
    });
    if contains_plaintext {
        return failed_self_test("PROTECTION_FAILED");
    }
    let recovered = match protector.unprotect(&protected) {
        Ok(recovered) => recovered,
        Err(_) => return failed_self_test("PROTECTION_FAILED"),
    };
    if !recovered.ct_eq(&secret) {
        return failed_self_test("PROTECTION_FAILED");
    }

    NativeVaultSelfTestReport {
        passed: true,
        error_class: None,
    }
}

fn failed_self_test(code: &'static str) -> NativeVaultSelfTestReport {
    NativeVaultSelfTestReport {
        passed: false,
        error_class: Some(code.to_owned()),
    }
}

fn now_utc_ms() -> Result<i64, VaultCommandError> {
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| VaultCommandError::new("INTERNAL_ERROR"))?;
    i64::try_from(duration.as_millis()).map_err(|_| VaultCommandError::new("INTERNAL_ERROR"))
}

fn map_secret_error(_error: SecretValidationError) -> VaultCommandError {
    VaultCommandError::new("INVALID_INPUT")
}

fn map_manager_error(error: ManagerError) -> VaultCommandError {
    match error {
        ManagerError::DuplicateCredential => VaultCommandError::new("DUPLICATE_CREDENTIAL"),
        ManagerError::InvalidLabel => VaultCommandError::new("INVALID_INPUT"),
        ManagerError::KeyNotFound => VaultCommandError::new("KEY_NOT_FOUND"),
        ManagerError::KeyInUse => VaultCommandError::new("KEY_BUSY"),
        ManagerError::Protect(error) => map_protect_error(error),
        ManagerError::Store(error) => map_store_error(error),
        ManagerError::ProtectedRecordUnavailable | ManagerError::StateUnavailable => {
            VaultCommandError::new("VAULT_CORRUPT")
        }
    }
}

fn map_protect_error(error: ProtectError) -> VaultCommandError {
    match error {
        ProtectError::UnsupportedPlatform => VaultCommandError::new("UNSUPPORTED_PLATFORM"),
        ProtectError::ProtectFailed | ProtectError::UnprotectFailed | ProtectError::IntegrityFailed => {
            VaultCommandError::new("PROTECTION_FAILED")
        }
    }
}


fn map_openrouter_error(error: OpenRouterValidationError) -> VaultCommandError {
    match error {
        OpenRouterValidationError::KeyNotFound => VaultCommandError::new("KEY_NOT_FOUND"),
        OpenRouterValidationError::ProtectedCredentialUnavailable => {
            VaultCommandError::new("PROTECTION_FAILED")
        }
        OpenRouterValidationError::ProbeUnavailable => {
            VaultCommandError::new("PROBE_UNAVAILABLE")
        }
        OpenRouterValidationError::ProbeMalformed => VaultCommandError::new("PROBE_MALFORMED"),
        OpenRouterValidationError::Store(_) | OpenRouterValidationError::StateUnavailable => {
            VaultCommandError::new("VAULT_CORRUPT")
        }
        OpenRouterValidationError::TimeOverflow => VaultCommandError::new("INTERNAL_ERROR"),
    }
}

fn map_store_error(error: StoreError) -> VaultCommandError {
    match error {
        StoreError::KeyNotFound => VaultCommandError::new("KEY_NOT_FOUND"),
        StoreError::CorruptExisting
        | StoreError::UnsupportedSchema(_)
        | StoreError::InvalidStoredValue(_)
        | StoreError::Sqlite(_)
        | StoreError::Io(_) => VaultCommandError::new("VAULT_CORRUPT"),
    }
}
