use std::fs;
use std::path::{Path, PathBuf};

use rusqlite::{params, Connection, OptionalExtension, Transaction};
use thiserror::Error;

use crate::{
    AvailabilityState, FailureClass, KeyId, KeySummary, LifecycleState, LimitReset, ProtectedBlob,
};

const SCHEMA_VERSION: i64 = 1;

#[derive(Debug, Error)]
pub enum StoreError {
    #[error("vault database I/O failed")]
    Io(#[from] std::io::Error),
    #[error("vault database operation failed")]
    Sqlite(#[source] rusqlite::Error),
    #[error("existing vault database is corrupt")]
    CorruptExisting,
    #[error("vault schema version {0} is newer than this application")]
    UnsupportedSchema(i64),
    #[error("vault contains an invalid stored value: {0}")]
    InvalidStoredValue(&'static str),
    #[error("vault key was not found")]
    KeyNotFound,
}

#[derive(Clone, Debug)]
pub struct NewStoredKey {
    pub key_id: KeyId,
    pub slot_index: i64,
    pub label: String,
    pub masked_suffix: String,
    pub protected_blob: ProtectedBlob,
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
    pub created_at_utc_ms: i64,
    pub updated_at_utc_ms: i64,
}

#[derive(Clone, Debug)]
pub struct StoredKeyRecord {
    pub key_id: KeyId,
    pub slot_index: i64,
    pub label: String,
    pub masked_suffix: String,
    pub protected_blob: ProtectedBlob,
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
    pub created_at_utc_ms: i64,
    pub updated_at_utc_ms: i64,
}

impl StoredKeyRecord {
    pub fn summary(&self) -> KeySummary {
        KeySummary {
            key_id: self.key_id.clone(),
            slot_index: self.slot_index,
            label: self.label.clone(),
            masked_suffix: self.masked_suffix.clone(),
            lifecycle_state: self.lifecycle_state,
            availability_state: self.availability_state,
            cooldown_until_utc_ms: self.cooldown_until_utc_ms,
            consecutive_failures: self.consecutive_failures,
            last_success_at_utc_ms: self.last_success_at_utc_ms,
            last_failure_at_utc_ms: self.last_failure_at_utc_ms,
            last_failure_class: self.last_failure_class,
            last_probe_at_utc_ms: self.last_probe_at_utc_ms,
            limit_value: self.limit_value,
            limit_remaining: self.limit_remaining,
            limit_reset: self.limit_reset,
            usage_daily: self.usage_daily,
            is_free_tier: self.is_free_tier,
            expires_at_utc_ms: self.expires_at_utc_ms,
        }
    }

    pub fn state_update(&self) -> StoredKeyUpdate {
        StoredKeyUpdate {
            lifecycle_state: self.lifecycle_state,
            availability_state: self.availability_state,
            cooldown_until_utc_ms: self.cooldown_until_utc_ms,
            consecutive_failures: self.consecutive_failures,
            last_success_at_utc_ms: self.last_success_at_utc_ms,
            last_failure_at_utc_ms: self.last_failure_at_utc_ms,
            last_failure_class: self.last_failure_class,
            last_probe_at_utc_ms: self.last_probe_at_utc_ms,
            limit_value: self.limit_value,
            limit_remaining: self.limit_remaining,
            limit_reset: self.limit_reset,
            usage_daily: self.usage_daily,
            is_free_tier: self.is_free_tier,
            expires_at_utc_ms: self.expires_at_utc_ms,
            updated_at_utc_ms: self.updated_at_utc_ms,
        }
    }
}

#[derive(Clone, Debug)]
pub struct StoredKeyUpdate {
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
    pub updated_at_utc_ms: i64,
}

pub struct VaultStore {
    path: PathBuf,
    connection: Connection,
}

impl VaultStore {
    pub(crate) fn open_in_memory() -> Result<Self, StoreError> {
        let connection = Connection::open_in_memory().map_err(StoreError::Sqlite)?;
        let mut store = Self {
            path: PathBuf::from(":memory:"),
            connection,
        };
        store.migrate_v1()?;
        store.verify_integrity(false)?;
        store.ensure_slot_state()?;
        Ok(store)
    }

    pub fn open(path: impl AsRef<Path>) -> Result<Self, StoreError> {
        let path = path.as_ref().to_path_buf();
        let existed = path.exists();
        if !existed {
            if let Some(parent) = path.parent() {
                fs::create_dir_all(parent)?;
            }
        }

        let connection = Connection::open(&path).map_err(StoreError::Sqlite)?;
        let version = connection
            .query_row("PRAGMA user_version", [], |row| row.get::<_, i64>(0))
            .map_err(|error| if existed { StoreError::CorruptExisting } else { StoreError::Sqlite(error) })?;

        if version > SCHEMA_VERSION {
            return Err(StoreError::UnsupportedSchema(version));
        }

        connection
            .pragma_update(None, "journal_mode", "WAL")
            .map_err(StoreError::Sqlite)?;

        let mut store = Self { path, connection };
        if version == 0 {
            store.migrate_v1()?;
        }
        store.verify_integrity(existed)?;
        store.ensure_slot_state()?;
        Ok(store)
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    fn migrate_v1(&mut self) -> Result<(), StoreError> {
        let transaction = self.connection.transaction().map_err(StoreError::Sqlite)?;
        transaction
            .execute_batch(
                r#"
                CREATE TABLE IF NOT EXISTS vault_keys (
                  key_id TEXT PRIMARY KEY NOT NULL,
                  slot_index INTEGER NOT NULL UNIQUE,
                  label TEXT NOT NULL,
                  masked_suffix TEXT NOT NULL,
                  protected_blob BLOB NOT NULL,
                  protected_blob_sha256 BLOB NOT NULL CHECK(length(protected_blob_sha256) = 32),
                  lifecycle_state TEXT NOT NULL,
                  availability_state TEXT NOT NULL,
                  cooldown_until_utc_ms INTEGER,
                  consecutive_failures INTEGER NOT NULL DEFAULT 0,
                  last_success_at_utc_ms INTEGER,
                  last_failure_at_utc_ms INTEGER,
                  last_failure_class TEXT,
                  last_probe_at_utc_ms INTEGER,
                  limit_value REAL,
                  limit_remaining REAL,
                  limit_reset TEXT,
                  usage_daily REAL,
                  is_free_tier INTEGER,
                  expires_at_utc_ms INTEGER,
                  created_at_utc_ms INTEGER NOT NULL,
                  updated_at_utc_ms INTEGER NOT NULL
                ) STRICT;

                CREATE TABLE IF NOT EXISTS rotation_state (
                  singleton_id INTEGER PRIMARY KEY CHECK(singleton_id = 1),
                  cursor_slot INTEGER NOT NULL,
                  updated_at_utc_ms INTEGER NOT NULL
                ) STRICT;

                INSERT OR IGNORE INTO rotation_state(singleton_id, cursor_slot, updated_at_utc_ms)
                VALUES(1, -1, 0);

                CREATE TABLE IF NOT EXISTS vault_slot_state (
                  singleton_id INTEGER PRIMARY KEY CHECK(singleton_id = 1),
                  next_slot_index INTEGER NOT NULL CHECK(next_slot_index >= 0)
                ) STRICT;

                INSERT OR IGNORE INTO vault_slot_state(singleton_id, next_slot_index)
                VALUES(1, 0);

                PRAGMA user_version = 1;
                "#,
            )
            .map_err(StoreError::Sqlite)?;
        transaction.commit().map_err(StoreError::Sqlite)
    }

    fn ensure_slot_state(&mut self) -> Result<(), StoreError> {
        let transaction = self.connection.transaction().map_err(StoreError::Sqlite)?;
        transaction
            .execute_batch(
                r#"
                CREATE TABLE IF NOT EXISTS vault_slot_state (
                  singleton_id INTEGER PRIMARY KEY CHECK(singleton_id = 1),
                  next_slot_index INTEGER NOT NULL CHECK(next_slot_index >= 0)
                ) STRICT;
                "#,
            )
            .map_err(StoreError::Sqlite)?;
        let observed_next: i64 = transaction
            .query_row(
                "SELECT COALESCE(MAX(slot_index), -1) + 1 FROM vault_keys",
                [],
                |row| row.get(0),
            )
            .map_err(StoreError::Sqlite)?;
        transaction
            .execute(
                "INSERT OR IGNORE INTO vault_slot_state(singleton_id, next_slot_index) VALUES(1, ?1)",
                params![observed_next],
            )
            .map_err(StoreError::Sqlite)?;
        transaction
            .execute(
                "UPDATE vault_slot_state SET next_slot_index = MAX(next_slot_index, ?1) WHERE singleton_id = 1",
                params![observed_next],
            )
            .map_err(StoreError::Sqlite)?;
        transaction.commit().map_err(StoreError::Sqlite)
    }

    fn verify_integrity(&self, existed: bool) -> Result<(), StoreError> {
        let result = self
            .connection
            .query_row("PRAGMA integrity_check(1)", [], |row| row.get::<_, String>(0));
        match result {
            Ok(value) if value == "ok" => Ok(()),
            Ok(_) => Err(StoreError::CorruptExisting),
            Err(_error) if existed => Err(StoreError::CorruptExisting),
            Err(error) => Err(StoreError::Sqlite(error)),
        }
    }

    pub fn insert_key(&mut self, key: NewStoredKey) -> Result<(), StoreError> {
        let transaction = self.connection.transaction().map_err(StoreError::Sqlite)?;
        insert_key_tx(&transaction, &key)?;
        transaction.commit().map_err(StoreError::Sqlite)
    }

    pub fn list_keys(&self) -> Result<Vec<StoredKeyRecord>, StoreError> {
        let mut statement = self
            .connection
            .prepare(
                r#"
                SELECT key_id, slot_index, label, masked_suffix, protected_blob, protected_blob_sha256,
                       lifecycle_state, availability_state, cooldown_until_utc_ms, consecutive_failures,
                       last_success_at_utc_ms, last_failure_at_utc_ms, last_failure_class, last_probe_at_utc_ms,
                       limit_value, limit_remaining, limit_reset, usage_daily, is_free_tier, expires_at_utc_ms,
                       created_at_utc_ms, updated_at_utc_ms
                FROM vault_keys
                ORDER BY slot_index ASC
                "#,
            )
            .map_err(StoreError::Sqlite)?;
        let rows = statement
            .query_map([], row_to_record)
            .map_err(StoreError::Sqlite)?;
        let mut result = Vec::new();
        for row in rows {
            result.push(row.map_err(StoreError::Sqlite)?);
        }
        Ok(result)
    }

    pub fn load_key(&self, key_id: &KeyId) -> Result<StoredKeyRecord, StoreError> {
        self.connection
            .query_row(
                r#"
                SELECT key_id, slot_index, label, masked_suffix, protected_blob, protected_blob_sha256,
                       lifecycle_state, availability_state, cooldown_until_utc_ms, consecutive_failures,
                       last_success_at_utc_ms, last_failure_at_utc_ms, last_failure_class, last_probe_at_utc_ms,
                       limit_value, limit_remaining, limit_reset, usage_daily, is_free_tier, expires_at_utc_ms,
                       created_at_utc_ms, updated_at_utc_ms
                FROM vault_keys WHERE key_id = ?1
                "#,
                params![key_id.0],
                row_to_record,
            )
            .optional()
            .map_err(StoreError::Sqlite)?
            .ok_or(StoreError::KeyNotFound)
    }

    pub fn load_protected_blob(&self, key_id: &KeyId) -> Result<ProtectedBlob, StoreError> {
        let (bytes, checksum): (Vec<u8>, Vec<u8>) = self
            .connection
            .query_row(
                "SELECT protected_blob, protected_blob_sha256 FROM vault_keys WHERE key_id = ?1",
                params![key_id.0],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()
            .map_err(StoreError::Sqlite)?
            .ok_or(StoreError::KeyNotFound)?;
        let checksum = checksum
            .try_into()
            .map_err(|_| StoreError::InvalidStoredValue("protected_blob_sha256"))?;
        Ok(ProtectedBlob::from_parts(bytes, checksum))
    }

    pub fn update_key_state(&mut self, key_id: &KeyId, update: &StoredKeyUpdate) -> Result<(), StoreError> {
        let transaction = self.connection.transaction().map_err(StoreError::Sqlite)?;
        update_key_state_tx(&transaction, key_id, update)?;
        transaction.commit().map_err(StoreError::Sqlite)
    }

    pub fn update_key_state_and_cursor(
        &mut self,
        key_id: &KeyId,
        update: &StoredKeyUpdate,
        cursor_slot: i64,
        now_ms: i64,
    ) -> Result<(), StoreError> {
        let transaction = self.connection.transaction().map_err(StoreError::Sqlite)?;
        update_key_state_tx(&transaction, key_id, update)?;
        transaction
            .execute(
                "UPDATE rotation_state SET cursor_slot = ?1, updated_at_utc_ms = ?2 WHERE singleton_id = 1",
                params![cursor_slot, now_ms],
            )
            .map_err(StoreError::Sqlite)?;
        transaction.commit().map_err(StoreError::Sqlite)
    }

    pub fn delete_key(&mut self, key_id: &KeyId) -> Result<bool, StoreError> {
        let transaction = self.connection.transaction().map_err(StoreError::Sqlite)?;
        let changed = transaction
            .execute("DELETE FROM vault_keys WHERE key_id = ?1", params![key_id.0])
            .map_err(StoreError::Sqlite)?;
        transaction.commit().map_err(StoreError::Sqlite)?;
        Ok(changed == 1)
    }

    pub fn reserve_next_slot_index(&mut self) -> Result<i64, StoreError> {
        let transaction = self.connection.transaction().map_err(StoreError::Sqlite)?;
        let slot: i64 = transaction
            .query_row(
                "SELECT next_slot_index FROM vault_slot_state WHERE singleton_id = 1",
                [],
                |row| row.get(0),
            )
            .map_err(StoreError::Sqlite)?;
        let next = slot
            .checked_add(1)
            .ok_or(StoreError::InvalidStoredValue("next_slot_index"))?;
        transaction
            .execute(
                "UPDATE vault_slot_state SET next_slot_index = ?1 WHERE singleton_id = 1",
                params![next],
            )
            .map_err(StoreError::Sqlite)?;
        transaction.commit().map_err(StoreError::Sqlite)?;
        Ok(slot)
    }

    pub fn load_rotation_cursor(&self) -> Result<i64, StoreError> {
        self.connection
            .query_row("SELECT cursor_slot FROM rotation_state WHERE singleton_id = 1", [], |row| row.get(0))
            .map_err(StoreError::Sqlite)
    }

    pub fn save_rotation_cursor(&mut self, slot: i64, now_ms: i64) -> Result<(), StoreError> {
        let transaction = self.connection.transaction().map_err(StoreError::Sqlite)?;
        transaction
            .execute(
                "UPDATE rotation_state SET cursor_slot = ?1, updated_at_utc_ms = ?2 WHERE singleton_id = 1",
                params![slot, now_ms],
            )
            .map_err(StoreError::Sqlite)?;
        transaction.commit().map_err(StoreError::Sqlite)
    }

    #[cfg(test)]
    fn journal_mode_for_test(&self) -> Result<String, StoreError> {
        self.connection
            .query_row("PRAGMA journal_mode", [], |row| row.get(0))
            .map_err(StoreError::Sqlite)
    }

    #[cfg(test)]
    fn user_version_for_test(&self) -> Result<i64, StoreError> {
        self.connection
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .map_err(StoreError::Sqlite)
    }

    #[cfg(test)]
    fn protected_blob_type_for_test(&self, key_id: &KeyId) -> Result<String, StoreError> {
        self.connection
            .query_row(
                "SELECT typeof(protected_blob) FROM vault_keys WHERE key_id = ?1",
                params![key_id.0],
                |row| row.get(0),
            )
            .map_err(StoreError::Sqlite)
    }
}

fn update_key_state_tx(
    transaction: &Transaction<'_>,
    key_id: &KeyId,
    update: &StoredKeyUpdate,
) -> Result<(), StoreError> {
    let changed = transaction
        .execute(
            r#"
            UPDATE vault_keys SET
              lifecycle_state = ?2,
              availability_state = ?3,
              cooldown_until_utc_ms = ?4,
              consecutive_failures = ?5,
              last_success_at_utc_ms = ?6,
              last_failure_at_utc_ms = ?7,
              last_failure_class = ?8,
              last_probe_at_utc_ms = ?9,
              limit_value = ?10,
              limit_remaining = ?11,
              limit_reset = ?12,
              usage_daily = ?13,
              is_free_tier = ?14,
              expires_at_utc_ms = ?15,
              updated_at_utc_ms = ?16
            WHERE key_id = ?1
            "#,
            params![
                key_id.0,
                lifecycle_to_text(update.lifecycle_state),
                availability_to_text(update.availability_state),
                update.cooldown_until_utc_ms,
                i64::from(update.consecutive_failures),
                update.last_success_at_utc_ms,
                update.last_failure_at_utc_ms,
                update.last_failure_class.map(failure_to_text),
                update.last_probe_at_utc_ms,
                update.limit_value,
                update.limit_remaining,
                update.limit_reset.map(limit_reset_to_text),
                update.usage_daily,
                update.is_free_tier.map(i64::from),
                update.expires_at_utc_ms,
                update.updated_at_utc_ms,
            ],
        )
        .map_err(StoreError::Sqlite)?;
    if changed != 1 {
        return Err(StoreError::KeyNotFound);
    }
    Ok(())
}

fn insert_key_tx(transaction: &Transaction<'_>, key: &NewStoredKey) -> Result<(), StoreError> {
    transaction
        .execute(
            r#"
            INSERT INTO vault_keys (
              key_id, slot_index, label, masked_suffix, protected_blob, protected_blob_sha256,
              lifecycle_state, availability_state, cooldown_until_utc_ms, consecutive_failures,
              last_success_at_utc_ms, last_failure_at_utc_ms, last_failure_class, last_probe_at_utc_ms,
              limit_value, limit_remaining, limit_reset, usage_daily, is_free_tier, expires_at_utc_ms,
              created_at_utc_ms, updated_at_utc_ms
            ) VALUES (
              ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10,
              ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22
            )
            "#,
            params![
                key.key_id.0,
                key.slot_index,
                key.label,
                key.masked_suffix,
                key.protected_blob.as_bytes(),
                key.protected_blob.checksum().as_slice(),
                lifecycle_to_text(key.lifecycle_state),
                availability_to_text(key.availability_state),
                key.cooldown_until_utc_ms,
                i64::from(key.consecutive_failures),
                key.last_success_at_utc_ms,
                key.last_failure_at_utc_ms,
                key.last_failure_class.map(failure_to_text),
                key.last_probe_at_utc_ms,
                key.limit_value,
                key.limit_remaining,
                key.limit_reset.map(limit_reset_to_text),
                key.usage_daily,
                key.is_free_tier.map(i64::from),
                key.expires_at_utc_ms,
                key.created_at_utc_ms,
                key.updated_at_utc_ms,
            ],
        )
        .map_err(StoreError::Sqlite)?;
    Ok(())
}

fn row_to_record(row: &rusqlite::Row<'_>) -> rusqlite::Result<StoredKeyRecord> {
    let checksum: Vec<u8> = row.get(5)?;
    let checksum: [u8; 32] = checksum.try_into().map_err(|_| rusqlite::Error::InvalidColumnType(
        5,
        "protected_blob_sha256".to_owned(),
        rusqlite::types::Type::Blob,
    ))?;
    let consecutive_failures: i64 = row.get(9)?;
    let consecutive_failures = u32::try_from(consecutive_failures).map_err(|_| rusqlite::Error::IntegralValueOutOfRange(9, consecutive_failures))?;
    let is_free_tier = parse_bool(row.get::<_, Option<i64>>(18)?, 18)?;

    Ok(StoredKeyRecord {
        key_id: KeyId(row.get(0)?),
        slot_index: row.get(1)?,
        label: row.get(2)?,
        masked_suffix: row.get(3)?,
        protected_blob: ProtectedBlob::from_parts(row.get(4)?, checksum),
        lifecycle_state: parse_lifecycle(&row.get::<_, String>(6)?, 6)?,
        availability_state: parse_availability(&row.get::<_, String>(7)?, 7)?,
        cooldown_until_utc_ms: row.get(8)?,
        consecutive_failures,
        last_success_at_utc_ms: row.get(10)?,
        last_failure_at_utc_ms: row.get(11)?,
        last_failure_class: parse_optional_failure(row.get::<_, Option<String>>(12)?, 12)?,
        last_probe_at_utc_ms: row.get(13)?,
        limit_value: row.get(14)?,
        limit_remaining: row.get(15)?,
        limit_reset: parse_optional_limit_reset(row.get::<_, Option<String>>(16)?, 16)?,
        usage_daily: row.get(17)?,
        is_free_tier,
        expires_at_utc_ms: row.get(19)?,
        created_at_utc_ms: row.get(20)?,
        updated_at_utc_ms: row.get(21)?,
    })
}

fn lifecycle_to_text(value: LifecycleState) -> &'static str {
    match value {
        LifecycleState::Enabled => "ENABLED",
        LifecycleState::Disabled => "DISABLED",
        LifecycleState::Invalid => "INVALID",
        LifecycleState::Quarantined => "QUARANTINED",
    }
}

fn availability_to_text(value: AvailabilityState) -> &'static str {
    match value {
        AvailabilityState::Unverified => "UNVERIFIED",
        AvailabilityState::Ready => "READY",
        AvailabilityState::Cooldown => "COOLDOWN",
        AvailabilityState::Exhausted => "EXHAUSTED",
    }
}

fn failure_to_text(value: FailureClass) -> &'static str {
    match value {
        FailureClass::AuthInvalid => "AUTH_INVALID",
        FailureClass::PermissionBlocked => "PERMISSION_BLOCKED",
        FailureClass::CreditBlocked => "CREDIT_BLOCKED",
        FailureClass::RateLimited => "RATE_LIMITED",
        FailureClass::RequestInvalid => "REQUEST_INVALID",
        FailureClass::ProviderTransient => "PROVIDER_TRANSIENT",
        FailureClass::Unknown => "UNKNOWN",
    }
}

fn limit_reset_to_text(value: LimitReset) -> &'static str {
    match value {
        LimitReset::Daily => "DAILY",
        LimitReset::Weekly => "WEEKLY",
        LimitReset::Monthly => "MONTHLY",
    }
}

fn parse_lifecycle(value: &str, column: usize) -> rusqlite::Result<LifecycleState> {
    match value {
        "ENABLED" => Ok(LifecycleState::Enabled),
        "DISABLED" => Ok(LifecycleState::Disabled),
        "INVALID" => Ok(LifecycleState::Invalid),
        "QUARANTINED" => Ok(LifecycleState::Quarantined),
        _ => Err(invalid_text(column, "lifecycle_state")),
    }
}

fn parse_availability(value: &str, column: usize) -> rusqlite::Result<AvailabilityState> {
    match value {
        "UNVERIFIED" => Ok(AvailabilityState::Unverified),
        "READY" => Ok(AvailabilityState::Ready),
        "COOLDOWN" => Ok(AvailabilityState::Cooldown),
        "EXHAUSTED" => Ok(AvailabilityState::Exhausted),
        _ => Err(invalid_text(column, "availability_state")),
    }
}

fn parse_optional_failure(value: Option<String>, column: usize) -> rusqlite::Result<Option<FailureClass>> {
    value
        .map(|value| match value.as_str() {
            "AUTH_INVALID" => Ok(FailureClass::AuthInvalid),
            "PERMISSION_BLOCKED" => Ok(FailureClass::PermissionBlocked),
            "CREDIT_BLOCKED" => Ok(FailureClass::CreditBlocked),
            "RATE_LIMITED" => Ok(FailureClass::RateLimited),
            "REQUEST_INVALID" => Ok(FailureClass::RequestInvalid),
            "PROVIDER_TRANSIENT" => Ok(FailureClass::ProviderTransient),
            "UNKNOWN" => Ok(FailureClass::Unknown),
            _ => Err(invalid_text(column, "last_failure_class")),
        })
        .transpose()
}

fn parse_optional_limit_reset(value: Option<String>, column: usize) -> rusqlite::Result<Option<LimitReset>> {
    value
        .map(|value| match value.as_str() {
            "DAILY" => Ok(LimitReset::Daily),
            "WEEKLY" => Ok(LimitReset::Weekly),
            "MONTHLY" => Ok(LimitReset::Monthly),
            _ => Err(invalid_text(column, "limit_reset")),
        })
        .transpose()
}

fn parse_bool(value: Option<i64>, column: usize) -> rusqlite::Result<Option<bool>> {
    match value {
        None => Ok(None),
        Some(0) => Ok(Some(false)),
        Some(1) => Ok(Some(true)),
        Some(other) => Err(rusqlite::Error::IntegralValueOutOfRange(column, other)),
    }
}

fn invalid_text(column: usize, name: &str) -> rusqlite::Error {
    rusqlite::Error::InvalidColumnType(column, name.to_owned(), rusqlite::types::Type::Text)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{AvailabilityState, KeyId, LifecycleState, ProtectedBlob};

    fn sample_key() -> NewStoredKey {
        NewStoredKey {
            key_id: KeyId("key-1".to_owned()),
            slot_index: 0,
            label: "Primary".to_owned(),
            masked_suffix: "••••1234".to_owned(),
            protected_blob: ProtectedBlob::new(vec![9, 8, 7, 6, 5]),
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
            created_at_utc_ms: 100,
            updated_at_utc_ms: 100,
        }
    }

    #[test]
    fn schema_stores_protected_secret_as_blob_and_sets_version() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("vault.db");
        let mut store = VaultStore::open(&path).unwrap();
        store.insert_key(sample_key()).unwrap();
        assert_eq!(store.user_version_for_test().unwrap(), 1);
        assert_eq!(store.protected_blob_type_for_test(&KeyId("key-1".to_owned())).unwrap(), "blob");
        assert_eq!(store.list_keys().unwrap().len(), 1);
    }

    #[test]
    fn vault_uses_wal_journal_mode() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("vault.db");
        let store = VaultStore::open(&path).unwrap();
        assert_eq!(store.journal_mode_for_test().unwrap(), "wal");
    }

    #[test]
    fn corrupt_existing_database_fails_closed_and_is_not_recreated() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("vault.db");
        std::fs::write(&path, b"not a sqlite database").unwrap();
        let before = std::fs::read(&path).unwrap();
        assert!(VaultStore::open(&path).is_err());
        assert_eq!(std::fs::read(&path).unwrap(), before);
    }

    #[test]
    fn state_and_cursor_survive_restart() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("vault.db");
        {
            let mut store = VaultStore::open(&path).unwrap();
            store.insert_key(sample_key()).unwrap();
            let record = store.load_key(&KeyId("key-1".to_owned())).unwrap();
            let mut update = record.state_update();
            update.availability_state = AvailabilityState::Cooldown;
            update.cooldown_until_utc_ms = Some(5_000);
            update.consecutive_failures = 2;
            update.last_failure_class = Some(FailureClass::RateLimited);
            update.last_failure_at_utc_ms = Some(1_000);
            update.updated_at_utc_ms = 1_000;
            store.update_key_state(&record.key_id, &update).unwrap();
            store.save_rotation_cursor(0, 1_000).unwrap();
        }
        let store = VaultStore::open(&path).unwrap();
        let record = store.load_key(&KeyId("key-1".to_owned())).unwrap();
        assert_eq!(record.availability_state, AvailabilityState::Cooldown);
        assert_eq!(record.cooldown_until_utc_ms, Some(5_000));
        assert_eq!(record.consecutive_failures, 2);
        assert_eq!(record.last_failure_class, Some(FailureClass::RateLimited));
        assert_eq!(store.load_rotation_cursor().unwrap(), 0);
    }
}
