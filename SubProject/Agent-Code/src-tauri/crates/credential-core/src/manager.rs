use std::collections::BTreeMap;
use std::sync::{Mutex, MutexGuard};

use thiserror::Error;
use uuid::Uuid;

use crate::{
    AvailabilityState, KeyId, KeySummary, LifecycleState, NewStoredKey, ProtectError,
    SecretBytes, SecretProtector, StoreError, StoredKeyRecord, VaultStore,
};

#[derive(Debug, Error)]
pub enum ManagerError {
    #[error("vault persistence failed")]
    Store(#[from] StoreError),
    #[error("credential protection failed")]
    Protect(#[from] ProtectError),
    #[error("credential already exists")]
    DuplicateCredential,
    #[error("credential label is outside the accepted range")]
    InvalidLabel,
    #[error("credential was not found")]
    KeyNotFound,
    #[error("credential is currently leased")]
    KeyInUse,
    #[error("stored credential cannot be trusted")]
    ProtectedRecordUnavailable,
    #[error("credential manager state is unavailable")]
    StateUnavailable,
}

pub struct CredentialManager<P: SecretProtector> {
    pub(crate) inner: Mutex<ManagerInner<P>>,
}

pub(crate) struct ManagerInner<P: SecretProtector> {
    pub(crate) store: VaultStore,
    pub(crate) protector: P,
    pub(crate) keys: BTreeMap<KeyId, StoredKeyRecord>,
    pub(crate) in_flight: BTreeMap<KeyId, u32>,
    pub(crate) active_leases: BTreeMap<Uuid, KeyId>,
    pub(crate) rotation_cursor: i64,
}

impl<P: SecretProtector> CredentialManager<P> {
    pub fn open(mut store: VaultStore, protector: P) -> Result<Self, ManagerError> {
        let records = store.list_keys()?;
        let rotation_cursor = store.load_rotation_cursor()?;
        let mut keys = BTreeMap::new();

        for mut record in records {
            if !record.protected_blob.verify_checksum() {
                record.lifecycle_state = LifecycleState::Quarantined;
                record.availability_state = AvailabilityState::Unverified;
                record.cooldown_until_utc_ms = None;
                let update = record.state_update();
                store.update_key_state(&record.key_id, &update)?;
            }
            if keys.insert(record.key_id.clone(), record).is_some() {
                return Err(ManagerError::ProtectedRecordUnavailable);
            }
        }

        Ok(Self {
            inner: Mutex::new(ManagerInner {
                store,
                protector,
                in_flight: keys.keys().cloned().map(|key_id| (key_id, 0)).collect(),
                active_leases: BTreeMap::new(),
                keys,
                rotation_cursor,
            }),
        })
    }

    pub fn add_openrouter_key(
        &self,
        secret: SecretBytes,
        label: String,
        now_ms: i64,
    ) -> Result<KeySummary, ManagerError> {
        let mut inner = self.lock_inner()?;
        let existing_records = inner.keys.values().cloned().collect::<Vec<_>>();

        for record in existing_records {
            if !record.protected_blob.verify_checksum() {
                quarantine_record(&mut inner, &record.key_id, now_ms)?;
                return Err(ManagerError::ProtectedRecordUnavailable);
            }

            let existing = match inner.protector.unprotect(&record.protected_blob) {
                Ok(existing) => existing,
                Err(_) => {
                    quarantine_record(&mut inner, &record.key_id, now_ms)?;
                    return Err(ManagerError::ProtectedRecordUnavailable);
                }
            };
            if existing.ct_eq(&secret) {
                return Err(ManagerError::DuplicateCredential);
            }
        }

        let slot_index = inner.store.reserve_next_slot_index()?;
        let label = normalize_label(label, slot_index)?;
        let masked_suffix = secret.masked_suffix();
        let protected_blob = inner.protector.protect(&secret)?;
        let key_id = KeyId(Uuid::new_v4().to_string());
        let new_key = NewStoredKey {
            key_id: key_id.clone(),
            slot_index,
            label,
            masked_suffix,
            protected_blob,
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
            created_at_utc_ms: now_ms,
            updated_at_utc_ms: now_ms,
        };

        inner.store.insert_key(new_key)?;
        let record = inner.store.load_key(&key_id)?;
        let summary = record.summary();
        inner.in_flight.insert(key_id.clone(), 0);
        inner.keys.insert(key_id, record);
        Ok(summary)
    }

    pub fn list_summaries(&self) -> Result<Vec<KeySummary>, ManagerError> {
        let inner = self.lock_inner()?;
        let mut records = inner.keys.values().collect::<Vec<_>>();
        records.sort_by_key(|record| record.slot_index);
        Ok(records.into_iter().map(StoredKeyRecord::summary).collect())
    }

    pub fn set_enabled(
        &self,
        key_id: &KeyId,
        enabled: bool,
        now_ms: i64,
    ) -> Result<KeySummary, ManagerError> {
        let mut inner = self.lock_inner()?;
        let mut record = inner
            .keys
            .get(key_id)
            .cloned()
            .ok_or(ManagerError::KeyNotFound)?;
        let previous = record.lifecycle_state;

        record.lifecycle_state = if enabled {
            LifecycleState::Enabled
        } else {
            LifecycleState::Disabled
        };
        if enabled && matches!(previous, LifecycleState::Invalid | LifecycleState::Quarantined) {
            record.availability_state = AvailabilityState::Unverified;
            record.cooldown_until_utc_ms = None;
        }
        record.updated_at_utc_ms = now_ms;

        let update = record.state_update();
        inner.store.update_key_state(key_id, &update)?;
        let summary = record.summary();
        inner.keys.insert(key_id.clone(), record);
        Ok(summary)
    }

    pub fn delete_key(&self, key_id: &KeyId, _now_ms: i64) -> Result<bool, ManagerError> {
        let mut inner = self.lock_inner()?;
        if inner.in_flight.get(key_id).copied().unwrap_or(0) > 0 {
            return Err(ManagerError::KeyInUse);
        }
        let deleted = inner.store.delete_key(key_id)?;
        if deleted {
            inner.keys.remove(key_id);
            inner.in_flight.remove(key_id);
        }
        Ok(deleted)
    }

    pub(crate) fn lock_inner(&self) -> Result<MutexGuard<'_, ManagerInner<P>>, ManagerError> {
        self.inner.lock().map_err(|_| ManagerError::StateUnavailable)
    }
}

fn normalize_label(label: String, slot_index: i64) -> Result<String, ManagerError> {
    let trimmed = label.trim();
    if trimmed.chars().count() > 80 {
        return Err(ManagerError::InvalidLabel);
    }
    if trimmed.is_empty() {
        return Ok(format!("OpenRouter Key {}", slot_index + 1));
    }
    Ok(trimmed.to_owned())
}

fn quarantine_record<P: SecretProtector>(
    inner: &mut ManagerInner<P>,
    key_id: &KeyId,
    now_ms: i64,
) -> Result<(), ManagerError> {
    let mut record = inner
        .keys
        .get(key_id)
        .cloned()
        .ok_or(ManagerError::KeyNotFound)?;
    record.lifecycle_state = LifecycleState::Quarantined;
    record.availability_state = AvailabilityState::Unverified;
    record.cooldown_until_utc_ms = None;
    record.updated_at_utc_ms = now_ms;
    let update = record.state_update();
    inner.store.update_key_state(key_id, &update)?;
    inner.keys.insert(key_id.clone(), record);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        AvailabilityState, CredentialProfile, CredentialProvider, KeyId, LifecycleState, NewStoredKey,
        ProtectError, ProtectedBlob, RotationSession, SecretBytes, SecretProtector, VaultStore,
    };

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

    #[derive(Clone, Copy)]
    struct PanicUnprotectProtector;

    impl SecretProtector for PanicUnprotectProtector {
        fn protect(&self, _secret: &SecretBytes) -> Result<ProtectedBlob, ProtectError> {
            Err(ProtectError::ProtectFailed)
        }

        fn unprotect(&self, _protected: &ProtectedBlob) -> Result<SecretBytes, ProtectError> {
            panic!("checksum mismatch must fail before unprotect")
        }
    }

    #[derive(Clone, Copy)]
    struct FailingUnprotectProtector;

    impl SecretProtector for FailingUnprotectProtector {
        fn protect(&self, secret: &SecretBytes) -> Result<ProtectedBlob, ProtectError> {
            Ok(ProtectedBlob::new(secret.expose_bytes(|bytes| bytes.to_vec())))
        }

        fn unprotect(&self, _protected: &ProtectedBlob) -> Result<SecretBytes, ProtectError> {
            Err(ProtectError::UnprotectFailed)
        }
    }

    #[test]
    fn add_list_duplicate_disable_enable_delete_and_restart_are_safe() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("vault.db");
        let store = VaultStore::open(&path).unwrap();
        let manager = CredentialManager::open(store, XorTestProtector(0xa5)).unwrap();

        let first = manager
            .add_openrouter_key(
                SecretBytes::parse_import("sk-or-v1-SYNTHETIC_MANAGER_A_1234".to_owned()).unwrap(),
                "Primary".to_owned(),
                100,
            )
            .unwrap();
        assert_eq!(first.lifecycle_state, LifecycleState::Enabled);
        assert_eq!(first.availability_state, AvailabilityState::Unverified);
        assert_eq!(first.masked_suffix, "••••1234");

        let duplicate = manager.add_openrouter_key(
            SecretBytes::parse_import("sk-or-v1-SYNTHETIC_MANAGER_A_1234".to_owned()).unwrap(),
            "Duplicate".to_owned(),
            110,
        );
        assert!(matches!(duplicate, Err(ManagerError::DuplicateCredential)));

        let same_suffix = manager
            .add_openrouter_key(
                SecretBytes::parse_import("sk-or-v1-DIFFERENT_MANAGER_B_1234".to_owned()).unwrap(),
                "Secondary".to_owned(),
                120,
            )
            .unwrap();
        assert_ne!(first.key_id, same_suffix.key_id);

        let disabled = manager.set_enabled(&first.key_id, false, 130).unwrap();
        assert_eq!(disabled.lifecycle_state, LifecycleState::Disabled);
        assert_eq!(disabled.availability_state, AvailabilityState::Unverified);

        let enabled = manager.set_enabled(&first.key_id, true, 140).unwrap();
        assert_eq!(enabled.lifecycle_state, LifecycleState::Enabled);
        assert_eq!(enabled.availability_state, AvailabilityState::Unverified);

        assert!(manager.delete_key(&same_suffix.key_id, 150).unwrap());
        assert_eq!(manager.list_summaries().unwrap().len(), 1);
        drop(manager);

        let reopened = CredentialManager::open(
            VaultStore::open(&path).unwrap(),
            XorTestProtector(0xa5),
        )
        .unwrap();
        let summaries = reopened.list_summaries().unwrap();
        assert_eq!(summaries.len(), 1);
        assert_eq!(summaries[0].key_id, first.key_id);
        assert_eq!(summaries[0].masked_suffix, "••••1234");
        assert_eq!(summaries[0].availability_state, AvailabilityState::Unverified);
    }

    #[test]
    fn manual_reenable_of_invalid_key_never_makes_it_ready() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("vault.db");
        let protector = XorTestProtector(0x27);
        let secret = SecretBytes::parse_import("sk-or-v1-INVALID_REENABLE_123456".to_owned()).unwrap();
        let protected_blob = protector.protect(&secret).unwrap();
        let mut store = VaultStore::open(&path).unwrap();
        let key_id = KeyId("invalid-key".to_owned());
        let slot_index = store.reserve_next_slot_index().unwrap();
        store
            .insert_key(NewStoredKey {
                key_id: key_id.clone(),
                slot_index,
                label: "Invalid".to_owned(),
                masked_suffix: secret.masked_suffix(),
                protected_blob,
                lifecycle_state: LifecycleState::Invalid,
                availability_state: AvailabilityState::Ready,
                cooldown_until_utc_ms: None,
                consecutive_failures: 1,
                last_success_at_utc_ms: None,
                last_failure_at_utc_ms: Some(90),
                last_failure_class: None,
                last_probe_at_utc_ms: Some(90),
                limit_value: None,
                limit_remaining: None,
                limit_reset: None,
                usage_daily: None,
                is_free_tier: None,
                expires_at_utc_ms: None,
                created_at_utc_ms: 80,
                updated_at_utc_ms: 90,
            })
            .unwrap();

        let manager = CredentialManager::open(store, protector).unwrap();
        let summary = manager.set_enabled(&key_id, true, 100).unwrap();
        assert_eq!(summary.lifecycle_state, LifecycleState::Enabled);
        assert_eq!(summary.availability_state, AvailabilityState::Unverified);
    }

    #[test]
    fn slot_indices_are_not_recycled_after_delete_and_restart() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("vault.db");
        {
            let manager = CredentialManager::open(
                VaultStore::open(&path).unwrap(),
                XorTestProtector(0x42),
            )
            .unwrap();
            let first = manager
                .add_openrouter_key(
                    SecretBytes::parse_import("sk-or-v1-SLOT_TEST_FIRST_123456".to_owned()).unwrap(),
                    "First".to_owned(),
                    100,
                )
                .unwrap();
            let second = manager
                .add_openrouter_key(
                    SecretBytes::parse_import("sk-or-v1-SLOT_TEST_SECOND_123456".to_owned()).unwrap(),
                    "Second".to_owned(),
                    110,
                )
                .unwrap();
            assert_eq!(first.slot_index, 0);
            assert_eq!(second.slot_index, 1);
            assert!(manager.delete_key(&second.key_id, 120).unwrap());
        }

        let manager = CredentialManager::open(
            VaultStore::open(&path).unwrap(),
            XorTestProtector(0x42),
        )
        .unwrap();
        let third = manager
            .add_openrouter_key(
                SecretBytes::parse_import("sk-or-v1-SLOT_TEST_THIRD_123456".to_owned()).unwrap(),
                "Third".to_owned(),
                130,
            )
            .unwrap();
        assert_eq!(third.slot_index, 2);
    }

    #[test]
    fn database_and_wal_bytes_never_contain_the_imported_canary() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("vault.db");
        let manager = CredentialManager::open(
            VaultStore::open(&path).unwrap(),
            XorTestProtector(0x5a),
        )
        .unwrap();
        let canary = "sk-or-v1-UNIQUE_DB_CANARY_123456789";
        let summary = manager
            .add_openrouter_key(
                SecretBytes::parse_import(canary.to_owned()).unwrap(),
                "Canary".to_owned(),
                100,
            )
            .unwrap();
        {
            let mut inner = manager.lock_inner().unwrap();
            inner
                .store
                .upsert_profile(&CredentialProfile {
                    key_id: summary.key_id,
                    provider: CredentialProvider::OpenRouter,
                    health_score: 90.0,
                    reliability_score: 90.0,
                    latency_score: 80.0,
                    quota_score: 70.0,
                    confidence_score: 85.0,
                    last_observed_at_utc_ms: Some(105),
                    updated_at_utc_ms: 105,
                })
                .unwrap();
        }

        for entry in std::fs::read_dir(dir.path()).unwrap() {
            let entry = entry.unwrap();
            let name = entry.file_name().to_string_lossy().into_owned();
            if !name.starts_with("vault.db") || !entry.file_type().unwrap().is_file() {
                continue;
            }
            let bytes = std::fs::read(entry.path()).unwrap();
            assert!(
                !bytes
                    .windows(canary.len())
                    .any(|window| window == canary.as_bytes()),
                "plaintext canary leaked into {name}"
            );
        }
    }

    #[test]
    fn blank_labels_are_defaulted_and_long_labels_are_rejected() {
        let dir = tempfile::tempdir().unwrap();
        let manager = CredentialManager::open(
            VaultStore::open(dir.path().join("vault.db")).unwrap(),
            XorTestProtector(0x33),
        )
        .unwrap();
        let summary = manager
            .add_openrouter_key(
                SecretBytes::parse_import("sk-or-v1-LABEL_TEST_1234567890".to_owned()).unwrap(),
                "   ".to_owned(),
                100,
            )
            .unwrap();
        assert_eq!(summary.label, "OpenRouter Key 1");
        let too_long = "x".repeat(81);
        let result = manager.add_openrouter_key(
            SecretBytes::parse_import("sk-or-v1-LABEL_TEST_OTHER_123456".to_owned()).unwrap(),
            too_long,
            110,
        );
        assert!(matches!(result, Err(ManagerError::InvalidLabel)));
    }

    #[test]
    fn duplicate_error_display_and_debug_never_echo_plaintext_canary() {
        let dir = tempfile::tempdir().unwrap();
        let manager = CredentialManager::open(
            VaultStore::open(dir.path().join("vault.db")).unwrap(),
            XorTestProtector(0x19),
        )
        .unwrap();
        let canary = "sk-or-v1-SYNTHETIC_MANAGER_ERROR_CANARY_123456";
        manager
            .add_openrouter_key(
                SecretBytes::parse_import(canary.to_owned()).unwrap(),
                "Original".to_owned(),
                100,
            )
            .unwrap();

        let error = manager
            .add_openrouter_key(
                SecretBytes::parse_import(canary.to_owned()).unwrap(),
                "Duplicate".to_owned(),
                110,
            )
            .unwrap_err();
        assert!(matches!(error, ManagerError::DuplicateCredential));
        assert!(!format!("{error}").contains(canary));
        assert!(!format!("{error:?}").contains(canary));
    }

    #[test]
    fn checksum_mismatch_is_quarantined_before_unprotect_and_is_never_selectable() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("vault.db");
        let key_id = KeyId("tampered-checksum-key".to_owned());
        let mut store = VaultStore::open(&path).unwrap();
        let slot_index = store.reserve_next_slot_index().unwrap();
        store
            .insert_key(NewStoredKey {
                key_id: key_id.clone(),
                slot_index,
                label: "Tampered checksum".to_owned(),
                masked_suffix: "••••0001".to_owned(),
                protected_blob: ProtectedBlob::from_parts(vec![1, 2, 3, 4], [0u8; 32]),
                lifecycle_state: LifecycleState::Enabled,
                availability_state: AvailabilityState::Ready,
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
                created_at_utc_ms: 100,
                updated_at_utc_ms: 100,
            })
            .unwrap();
        drop(store);

        let manager = CredentialManager::open(VaultStore::open(&path).unwrap(), PanicUnprotectProtector)
            .expect("checksum mismatch must quarantine without calling unprotect");
        let summary = manager.list_summaries().unwrap().remove(0);
        assert_eq!(summary.lifecycle_state, LifecycleState::Quarantined);
        assert_eq!(summary.availability_state, AvailabilityState::Unverified);
        let unavailable = manager
            .acquire(&mut RotationSession::new(), 200)
            .expect_err("quarantined key must not be selected");
        assert_eq!(unavailable.scanned_candidates(), 1);
    }

    #[test]
    fn decryption_failure_returns_safe_error_quarantines_record_and_keeps_manager_alive() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("vault.db");
        let key_id = KeyId("decrypt-failure-key".to_owned());
        let mut store = VaultStore::open(&path).unwrap();
        let slot_index = store.reserve_next_slot_index().unwrap();
        store
            .insert_key(NewStoredKey {
                key_id: key_id.clone(),
                slot_index,
                label: "Decrypt failure".to_owned(),
                masked_suffix: "••••0002".to_owned(),
                protected_blob: ProtectedBlob::new(vec![9, 8, 7, 6]),
                lifecycle_state: LifecycleState::Enabled,
                availability_state: AvailabilityState::Ready,
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
                created_at_utc_ms: 100,
                updated_at_utc_ms: 100,
            })
            .unwrap();
        drop(store);

        let manager = CredentialManager::open(
            VaultStore::open(&path).unwrap(),
            FailingUnprotectProtector,
        )
        .unwrap();
        let canary = "sk-or-v1-SYNTHETIC_DECRYPT_ERROR_CANARY_123456";
        let error = manager
            .add_openrouter_key(
                SecretBytes::parse_import(canary.to_owned()).unwrap(),
                "New key".to_owned(),
                200,
            )
            .unwrap_err();
        assert!(matches!(error, ManagerError::ProtectedRecordUnavailable));
        assert!(!format!("{error}").contains(canary));
        assert!(!format!("{error:?}").contains(canary));

        let summary = manager.list_summaries().unwrap().remove(0);
        assert_eq!(summary.key_id, key_id);
        assert_eq!(summary.lifecycle_state, LifecycleState::Quarantined);
        assert_eq!(summary.availability_state, AvailabilityState::Unverified);
        assert_eq!(manager.list_summaries().unwrap().len(), 1);
    }
}
