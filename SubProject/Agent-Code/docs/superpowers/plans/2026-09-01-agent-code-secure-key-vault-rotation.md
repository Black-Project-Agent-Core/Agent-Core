# Agent Code Secure API Key Vault & Deterministic Rotation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Windows-first, OpenRouter-only secure credential vault and deterministic API-key rotation core for Agent Code, with DPAPI-protected secrets, metadata-only IPC/UI, bounded failover, synthetic stress testing, and native Windows acceptance before any multi-provider work begins.

**Architecture:** Keep the existing React/Tauri shell intact while introducing a small Rust credential subsystem. A cross-platform `agent-code-credential-core` Rust crate owns secret-safe types, transactional SQLite persistence, deterministic rotation state, failure classification, synthetic fault injection, and OpenRouter current-key probing; the Tauri crate supplies the Windows-only DPAPI adapter and a narrow command boundary. The WebView receives metadata only and never receives stored plaintext credentials after import.

**Tech Stack:** Tauri 2.11.5, Rust 1.98 stable, React 19.2.8, TypeScript 7.0.2, Vite 8.2.2, Vitest 4.1.11, Playwright 1.62.1, SQLite through `rusqlite`, Windows DPAPI through `windows-sys`, `zeroize`, `serde`, `thiserror`, `uuid`, `sha2`, `subtle`, blocking `reqwest` with rustls, and `proptest` for state-machine property tests.

**Spec:** `SubProject/Agent-Code/docs/superpowers/specs/2026-09-01-agent-code-secure-key-vault-rotation-design.md`

## Global Constraints

- Product remains exactly `Agent Code`.
- Production target remains Windows desktop.
- OpenRouter is the **only provider** in Milestone 2A.
- Do not add Gemini, Anthropic-direct, OpenAI-direct, or a generic multi-provider abstraction.
- Do not connect Super-Runtime.
- Do not implement model selection, model routing, an agent loop, coding-agent execution, shell execution, or inference.
- Do not add cloud secret sync, remote secret backup, or plaintext secret export.
- Do not add a `Reveal API Key`, copy-key, or export-key action.
- Do not store API keys in `.env`, JSON, localStorage, React persisted state, logs, Tauri config, SQLite text fields, or source-control files.
- Imported plaintext may cross the WebView→Tauri command boundary once, but stored plaintext must never be returned from Rust to the WebView.
- Production Windows protection uses current-user DPAPI and must not set `CRYPTPROTECT_LOCAL_MACHINE`.
- Production builds must have **no plaintext fallback** secret protector on non-Windows targets.
- A real OpenRouter key is used only for bounded `GET /api/v1/key` validation; destructive rate-limit/exhaustion scenarios use the synthetic lab only.
- Provider-wide failures such as 503/529 must not consume the key pool.
- One logical request must never select the same key twice.
- Scheduler selection is deterministic round-robin with a bounded single-pool scan; weighted scoring is out of scope.
- Existing Agent Code UI foundation behavior and visual baselines remain valid unless a task explicitly adds a new vault surface baseline.
- Existing `SubProject/Super-Runtime/` files remain untouched.
- Root `.vscode/` remains user-owned/untracked and untouched.
- Every production behavior change follows RED → GREEN → focused regression → commit → push → remote SHA readback.
- Never force-push.
- Execution isolation note: because another session owns `feature/agent-code-key-vault-rotation`, this execution continues on `feature/agent-code-key-vault-rotation-primary` and will reconcile non-force before final integration.

## Execution Branch Contract

This document and the approved spec live on the planning branch `design/agent-code-key-vault-rotation`. **Do not implement production tasks in the design worktree.** At execution start, create a fresh worktree from the planning commit:

```bash
cd /workspaces/Agent-Core
git fetch origin
git worktree add .worktrees/agent-code-key-vault-rotation \
  -b feature/agent-code-key-vault-rotation \
  design/agent-code-key-vault-rotation
```

All implementation checkpoints are pushed to `origin/feature/agent-code-key-vault-rotation`. The design branch remains an immutable audit trail for the approved spec/plan.

## File Structure

The implementation should converge on this structure. Do not merge responsibilities back into `main.rs` or a single giant vault file.

```text
SubProject/Agent-Code/
├── package.json
├── scripts/
│   ├── build-windows-x64.sh
│   ├── check-credential-security.mjs             # new source/forbidden-surface gate
│   └── check-windows-artifact.sh
├── src/
│   ├── app/
│   │   └── AgentCodeApp.tsx
│   ├── components/
│   │   └── Sidebar.tsx
│   └── features/
│       └── vault/
│           ├── CredentialVaultPanel.tsx          # focused masked UI
│           ├── CredentialVaultPanel.test.tsx
│           ├── vault-api.ts                      # metadata-only invoke wrapper
│           └── vault-types.ts                    # frontend DTOs only
└── src-tauri/
    ├── Cargo.toml
    ├── src/
    │   ├── main.rs
    │   └── credential/
    │       ├── mod.rs
    │       ├── commands.rs                       # narrow Tauri IPC
    │       ├── dpapi.rs                          # Windows-only SecretProtector
    │       └── state.rs                          # app-managed CredentialManager
    └── crates/
        └── credential-core/
            ├── Cargo.toml
            └── src/
                ├── lib.rs
                ├── secret.rs                     # SecretBytes, validation, masking
                ├── types.rs                      # IDs/enums/metadata DTOs
                ├── protector.rs                  # SecretProtector contract
                ├── store.rs                      # SQLite schema/transactions
                ├── manager.rs                    # CRUD + persistence orchestration
                ├── rotation.rs                   # deterministic state machine
                ├── classifier.rs                 # failure semantics
                ├── synthetic.rs                  # deterministic fault lab
                └── openrouter.rs                 # current-key probe only
```

The core crate must not depend on Tauri, WebView APIs, Windows GUI APIs, Agent Core, Super-Runtime, or another model/provider SDK.

---

### Task 1: Create the credential-core crate and freeze secret-safe public types

**Files:**
- Modify: `SubProject/Agent-Code/src-tauri/Cargo.toml`
- Create: `SubProject/Agent-Code/src-tauri/crates/credential-core/Cargo.toml`
- Create: `SubProject/Agent-Code/src-tauri/crates/credential-core/src/lib.rs`
- Create: `SubProject/Agent-Code/src-tauri/crates/credential-core/src/secret.rs`
- Create: `SubProject/Agent-Code/src-tauri/crates/credential-core/src/types.rs`
- Test: inline unit tests in `secret.rs` and `types.rs`

**Interfaces:**
- Consumes: no prior Milestone 2A code.
- Produces:
  - `SecretBytes::parse_import(String) -> Result<SecretBytes, SecretValidationError>`
  - `SecretBytes::from_decrypted(Vec<u8>) -> Result<SecretBytes, SecretValidationError>`
  - `SecretBytes::expose_bytes<R>(&self, f: impl FnOnce(&[u8]) -> R) -> R`
  - `SecretBytes::ct_eq(&self, other: &SecretBytes) -> bool`
  - `SecretBytes::masked_suffix() -> String`
  - `KeyId`
  - `LifecycleState`
  - `AvailabilityState`
  - `FailureClass`
  - `LimitReset`
  - `KeySummary`

- [x] **Step 1: Add the workspace/path dependency and the exact core dependencies**

Update the Tauri package so it is also a workspace root:

```toml
[workspace]
members = ["crates/credential-core"]
resolver = "2"

[dependencies]
tauri = { version = "2.11.5", features = [] }
agent-code-credential-core = { path = "crates/credential-core" }
```

Create `crates/credential-core/Cargo.toml`:

```toml
[package]
name = "agent-code-credential-core"
version = "0.1.0"
edition = "2021"
publish = false

[dependencies]
serde = { version = "1.0.228", features = ["derive"] }
serde_json = "1.0.145"
subtle = "2.6.1"
thiserror = "2.0.17"
zeroize = { version = "1.8.2", features = ["derive"] }
```

Run `cargo update --manifest-path src-tauri/Cargo.toml` only after the RED test in Step 3 is proven. Commit the resulting `src-tauri/Cargo.lock`; do not generate a second lockfile under the child crate.

- [x] **Step 2: Write the secret contract test first**

Create `secret.rs` initially with tests referring to types that do not exist yet:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn secret_debug_is_always_redacted_and_mask_is_suffix_only() {
        let secret = SecretBytes::parse_import("sk-or-v1-THIS_IS_A_SYNTHETIC_CANARY_3Fxa".to_owned()).unwrap();
        assert_eq!(format!("{secret:?}"), "[REDACTED]");
        assert_eq!(secret.masked_suffix(), "••••3Fxa");
    }

    #[test]
    fn import_rejects_whitespace_control_and_unreasonably_short_values() {
        assert!(SecretBytes::parse_import(" short ".to_owned()).is_err());
        assert!(SecretBytes::parse_import("abc\n0123456789012345".to_owned()).is_err());
    }
}
```

- [x] **Step 3: Run the focused Rust test to verify RED**

Run:

```bash
cargo test --manifest-path src-tauri/crates/credential-core/Cargo.toml secret::tests -- --nocapture
```

Expected: FAIL because `SecretBytes` is undefined.

- [x] **Step 4: Implement `SecretBytes` with zeroization and no Display/Serialize**

Implement this contract:

```rust
use std::fmt;
use thiserror::Error;
use zeroize::{Zeroize, ZeroizeOnDrop};

#[derive(Zeroize, ZeroizeOnDrop)]
pub struct SecretBytes(Vec<u8>);

#[derive(Debug, Error, PartialEq, Eq)]
pub enum SecretValidationError {
    #[error("credential length is outside the accepted range")]
    InvalidLength,
    #[error("credential contains whitespace or control bytes")]
    InvalidCharacters,
}

impl SecretBytes {
    pub fn parse_import(mut value: String) -> Result<Self, SecretValidationError> {
        let bytes = value.as_bytes();
        let valid_len = (16..=512).contains(&bytes.len());
        let valid_chars = bytes.iter().all(|byte| byte.is_ascii_graphic());
        if !valid_len || !valid_chars {
            value.zeroize();
            return Err(if valid_len {
                SecretValidationError::InvalidCharacters
            } else {
                SecretValidationError::InvalidLength
            });
        }
        let owned = bytes.to_vec();
        value.zeroize();
        Ok(Self(owned))
    }

    pub fn from_decrypted(mut bytes: Vec<u8>) -> Result<Self, SecretValidationError> {
        let valid_len = (16..=512).contains(&bytes.len());
        let valid_chars = bytes.iter().all(|byte| byte.is_ascii_graphic());
        if !valid_len || !valid_chars {
            bytes.zeroize();
            return Err(if valid_len {
                SecretValidationError::InvalidCharacters
            } else {
                SecretValidationError::InvalidLength
            });
        }
        Ok(Self(bytes))
    }

    pub fn expose_bytes<R>(&self, f: impl FnOnce(&[u8]) -> R) -> R {
        f(&self.0)
    }

    pub fn ct_eq(&self, other: &Self) -> bool {
        use subtle::ConstantTimeEq;
        if self.0.len() != other.0.len() {
            return false;
        }
        self.0.as_slice().ct_eq(other.0.as_slice()).into()
    }

    pub fn masked_suffix(&self) -> String {
        let suffix = self.0.iter().rev().take(4).copied().collect::<Vec<_>>();
        let suffix = suffix.into_iter().rev().collect::<Vec<_>>();
        format!("••••{}", String::from_utf8_lossy(&suffix))
    }
}

impl fmt::Debug for SecretBytes {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("[REDACTED]")
    }
}
```

Do **not** implement `Clone`, `Display`, `Serialize`, or `AsRef<str>` for `SecretBytes`.

- [x] **Step 5: Add exact metadata-only types and serialization tests**

Create `types.rs` with:

```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(transparent)]
pub struct KeyId(pub String);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum LifecycleState { Enabled, Disabled, Invalid, Quarantined }

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum AvailabilityState { Unverified, Ready, Cooldown, Exhausted }

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum LimitReset { Daily, Weekly, Monthly }

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
```

Add a test that serializes `KeySummary` and asserts the synthetic full key string is absent.

- [x] **Step 6: Export only safe modules from `lib.rs`**

```rust
mod secret;
mod types;

pub use secret::{SecretBytes, SecretValidationError};
pub use types::{
    AvailabilityState, FailureClass, KeyId, KeySummary, LifecycleState, LimitReset,
};
```

- [x] **Step 7: Run focused tests, lockfile update, and compile gate**

Run:

```bash
cargo test --manifest-path src-tauri/crates/credential-core/Cargo.toml
cargo check --manifest-path src-tauri/crates/credential-core/Cargo.toml
npm run test:tauri-contract
```

Expected: PASS.

- [x] **Step 8: Commit and publish checkpoint**

```bash
git add SubProject/Agent-Code/src-tauri/Cargo.toml \
        SubProject/Agent-Code/src-tauri/Cargo.lock \
        SubProject/Agent-Code/src-tauri/crates/credential-core
git -c commit.gpgsign=false commit -m "feat(agent-code): add credential security core"
git push -u origin feature/agent-code-key-vault-rotation
git fetch origin
test "$(git rev-parse HEAD)" = "$(git rev-parse origin/feature/agent-code-key-vault-rotation)"
```

---

### Task 2: Define the SecretProtector contract and Windows DPAPI adapter

**Files:**
- Create: `SubProject/Agent-Code/src-tauri/crates/credential-core/src/protector.rs`
- Modify: `SubProject/Agent-Code/src-tauri/crates/credential-core/src/lib.rs`
- Modify: `SubProject/Agent-Code/src-tauri/Cargo.toml`
- Create: `SubProject/Agent-Code/src-tauri/src/credential/mod.rs`
- Create: `SubProject/Agent-Code/src-tauri/src/credential/dpapi.rs`
- Modify: `SubProject/Agent-Code/src-tauri/src/main.rs` to declare `mod credential;` so the Windows adapter is compiled by the target check
- Test: unit tests in `protector.rs`; Windows behavior later verified by Task 10 native self-test

**Interfaces:**
- Consumes: `SecretBytes` from Task 1.
- Produces:
  - `SecretProtector` trait
  - `ProtectedBlob`
  - `ProtectedBlob::verify_checksum()`
  - Windows `DpapiProtector`

- [x] **Step 1: Write RED checksum/protector tests**

Create tests:

```rust
#[test]
fn protected_blob_detects_ciphertext_mutation() {
    let blob = ProtectedBlob::new(vec![1, 2, 3, 4]);
    assert!(blob.verify_checksum());
    let mut bytes = blob.as_bytes().to_vec();
    bytes[2] ^= 0xff;
    let corrupt = ProtectedBlob::from_parts(bytes, *blob.checksum());
    assert!(!corrupt.verify_checksum());
}

#[test]
fn test_protector_round_trip_keeps_plaintext_out_of_blob() {
    let protector = tests::XorTestProtector::new(0xa5);
    let secret = SecretBytes::parse_import("sk-or-v1-SYNTHETIC_CANARY_123456".to_owned()).unwrap();
    let protected = protector.protect(&secret).unwrap();
    let protected_bytes = protected.bytes.clone();
    assert!(!protected_bytes.windows(b"SYNTHETIC_CANARY".len()).any(|w| w == b"SYNTHETIC_CANARY"));
    let recovered = protector.unprotect(&protected).unwrap();
    assert_eq!(recovered.expose_bytes(|b| b.to_vec()), secret.expose_bytes(|b| b.to_vec()));
}
```

The `XorTestProtector` must live under `#[cfg(test)]`; it must not be exported or compiled as a production fallback.

- [x] **Step 2: Run RED**

```bash
cargo test --manifest-path src-tauri/crates/credential-core/Cargo.toml protector::tests -- --nocapture
```

Expected: FAIL because `ProtectedBlob` and `SecretProtector` do not exist.

- [x] **Step 3: Implement `ProtectedBlob` and `SecretProtector`**

```rust
use crate::SecretBytes;
use sha2::{Digest, Sha256};
use std::fmt;
use subtle::ConstantTimeEq;
use thiserror::Error;

#[derive(Clone)]
pub struct ProtectedBlob {
    bytes: Vec<u8>,
    sha256: [u8; 32],
}

impl ProtectedBlob {
    pub fn new(bytes: Vec<u8>) -> Self {
        let sha256: [u8; 32] = Sha256::digest(&bytes).into();
        Self { bytes, sha256 }
    }

    pub fn from_parts(bytes: Vec<u8>, sha256: [u8; 32]) -> Self {
        Self { bytes, sha256 }
    }

    pub fn as_bytes(&self) -> &[u8] { &self.bytes }
    pub fn checksum(&self) -> &[u8; 32] { &self.sha256 }

    pub fn verify_checksum(&self) -> bool {
        let current: [u8; 32] = Sha256::digest(&self.bytes).into();
        current.as_slice().ct_eq(self.sha256.as_slice()).into()
    }
}

impl fmt::Debug for ProtectedBlob {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("ProtectedBlob")
            .field("len", &self.bytes.len())
            .field("checksum", &"[SHA256]")
            .finish()
    }
}

#[derive(Debug, Error)]
pub enum ProtectError {
    #[error("credential protection failed")]
    ProtectFailed,
    #[error("credential decryption failed")]
    UnprotectFailed,
    #[error("protected credential failed integrity verification")]
    IntegrityFailed,
    #[error("credential protection is unavailable on this platform")]
    UnsupportedPlatform,
}

pub trait SecretProtector: Send + Sync + 'static {
    fn protect(&self, secret: &SecretBytes) -> Result<ProtectedBlob, ProtectError>;
    fn unprotect(&self, protected: &ProtectedBlob) -> Result<SecretBytes, ProtectError>;
}
```

- [x] **Step 4: Add the crypto checksum and Windows dependencies**

Add to `crates/credential-core/Cargo.toml`:

```toml
sha2 = "0.10.9"
```

In root `src-tauri/Cargo.toml` add:

```toml
[target.'cfg(windows)'.dependencies]
windows-sys = { version = "0.61.2", features = [
  "Win32_Foundation",
  "Win32_Security_Cryptography",
  "Win32_System_Memory"
] }
```

Do not add a non-Windows DPAPI replacement.

- [x] **Step 5: Implement Windows `DpapiProtector`**

Use `CryptProtectData`/`CryptUnprotectData` with `CRYPTPROTECT_UI_FORBIDDEN`, current-user default scope, `DATA_BLOB`, and `LocalFree` for returned buffers. The implementation must copy the DPAPI result into an owned `Vec<u8>` and immediately free the Windows allocation.

Implement this Windows-only adapter; keep all unsafe Windows allocation handling inside this file:

```rust
use agent_code_credential_core::{ProtectError, ProtectedBlob, SecretBytes, SecretProtector};
use std::{ptr::{null, null_mut}, slice};
use windows_sys::Win32::{
    Foundation::LocalFree,
    Security::Cryptography::{
        CryptProtectData, CryptUnprotectData, CRYPT_INTEGER_BLOB, CRYPTPROTECT_UI_FORBIDDEN,
    },
};

pub struct DpapiProtector;

struct LocalBlob(CRYPT_INTEGER_BLOB);

impl Drop for LocalBlob {
    fn drop(&mut self) {
        if !self.0.pbData.is_null() {
            unsafe {
                LocalFree(self.0.pbData.cast());
            }
            self.0.pbData = null_mut();
            self.0.cbData = 0;
        }
    }
}

impl SecretProtector for DpapiProtector {
    fn protect(&self, secret: &SecretBytes) -> Result<ProtectedBlob, ProtectError> {
        secret.expose_bytes(|bytes| {
            let input = CRYPT_INTEGER_BLOB {
                cbData: u32::try_from(bytes.len()).map_err(|_| ProtectError::ProtectFailed)?,
                pbData: bytes.as_ptr().cast_mut(),
            };
            let mut output = CRYPT_INTEGER_BLOB::default();
            let ok = unsafe {
                CryptProtectData(
                    &input,
                    null(),
                    null(),
                    null(),
                    null(),
                    CRYPTPROTECT_UI_FORBIDDEN,
                    &mut output,
                )
            };
            if ok == 0 {
                return Err(ProtectError::ProtectFailed);
            }
            let output = LocalBlob(output);
            let protected = unsafe {
                slice::from_raw_parts(output.0.pbData, output.0.cbData as usize).to_vec()
            };
            Ok(ProtectedBlob::new(protected))
        })
    }

    fn unprotect(&self, protected: &ProtectedBlob) -> Result<SecretBytes, ProtectError> {
        if !protected.verify_checksum() {
            return Err(ProtectError::IntegrityFailed);
        }
        let input_bytes = protected.as_bytes();
        let input = CRYPT_INTEGER_BLOB {
            cbData: u32::try_from(input_bytes.len()).map_err(|_| ProtectError::UnprotectFailed)?,
            pbData: input_bytes.as_ptr().cast_mut(),
        };
        let mut output = CRYPT_INTEGER_BLOB::default();
        let ok = unsafe {
            CryptUnprotectData(
                &input,
                null_mut(),
                null(),
                null(),
                null(),
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut output,
            )
        };
        if ok == 0 {
            return Err(ProtectError::UnprotectFailed);
        }
        let output = LocalBlob(output);
        let plaintext = unsafe {
            slice::from_raw_parts(output.0.pbData, output.0.cbData as usize).to_vec()
        };
        SecretBytes::from_decrypted(plaintext).map_err(|_| ProtectError::UnprotectFailed)
    }
}
```

This code intentionally passes no optional entropy and no machine-scope flag. Before decrypting, it verifies the application checksum and fails closed on mismatch.

- [x] **Step 6: Add a compile-time no-fallback guard**

`credential/mod.rs` must only re-export `DpapiProtector` on Windows:

```rust
#[cfg(windows)]
pub mod dpapi;
```

Do not create a production `PlaintextProtector`, `NoopProtector`, or Linux compatibility protector.

- [x] **Step 7: Run tests and Windows target check**

```bash
cargo test --manifest-path src-tauri/crates/credential-core/Cargo.toml
cargo check --manifest-path src-tauri/Cargo.toml --target x86_64-pc-windows-msvc
```

If the host check cannot link the Tauri GUI due to Linux WebKit dependencies, keep the core native test and use the existing `npm run build:windows:x64` cross-build as the Windows compile gate; do not install unrelated Linux GUI packages just to make a native Linux Agent Code app.

- [x] **Step 8: Commit + push + remote equality**

```bash
git add SubProject/Agent-Code/src-tauri
git -c commit.gpgsign=false commit -m "feat(agent-code): add Windows DPAPI protector"
git push
git fetch origin
test "$(git rev-parse HEAD)" = "$(git rev-parse origin/feature/agent-code-key-vault-rotation)"
```

---

### Task 3: Add the transactional SQLite vault store

**Files:**
- Create: `SubProject/Agent-Code/src-tauri/crates/credential-core/src/store.rs`
- Modify: `SubProject/Agent-Code/src-tauri/crates/credential-core/src/lib.rs`
- Test: `store.rs` unit tests using `tempfile`

**Interfaces:**
- Consumes: safe metadata types and `ProtectedBlob`.
- Produces:
  - `VaultStore::open(path: impl AsRef<Path>) -> Result<VaultStore, StoreError>`
  - `VaultStore::insert_key(NewStoredKey)`
  - `VaultStore::list_keys()`
  - `VaultStore::update_key_state(...)`
  - `VaultStore::delete_key(&KeyId)`
  - `VaultStore::load_protected_blob(&KeyId)`
  - `VaultStore::reserve_next_slot_index(now_ms)` for monotonic, never-recycled slots
  - `VaultStore::load_rotation_cursor()` / `save_rotation_cursor(slot)`

- [x] **Step 1: Write a RED schema/storage test**

The test must open a temp DB, insert a record whose BLOB contains synthetic non-secret bytes, list it, verify `protected_blob` has SQLite `blob` type, and verify `PRAGMA user_version = 1`.

Also add:

```rust
#[test]
fn corrupt_existing_database_fails_closed_and_is_not_recreated() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("vault.db");
    std::fs::write(&path, b"not a sqlite database").unwrap();
    let before = std::fs::read(&path).unwrap();
    assert!(VaultStore::open(&path).is_err());
    assert_eq!(std::fs::read(&path).unwrap(), before);
}
```

- [x] **Step 2: Run RED**

```bash
cargo test --manifest-path src-tauri/crates/credential-core/Cargo.toml store::tests -- --nocapture
```

Expected: FAIL because `VaultStore` does not exist.

- [x] **Step 3: Add SQLite/test dependencies**

Add to `crates/credential-core/Cargo.toml`:

```toml
rusqlite = { version = "0.37.0", features = ["bundled"] }

[dev-dependencies]
tempfile = "3.23.0"
```

- [x] **Step 4: Create the exact schema**

Use SQLite `STRICT` tables where supported by the bundled SQLite version.

```sql
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

PRAGMA user_version = 1;
```

- [x] **Step 5: Implement transactions and bounded conversion**

All enum text parsing must reject unknown values; never coerce an unknown lifecycle/availability state into `READY`.

`open()` behavior:

```text
existing corrupt DB -> return StoreError::CorruptExisting
missing DB -> create parent directory + DB
valid DB user_version 0 -> migrate transactionally to 1
valid DB user_version > 1 -> fail with UnsupportedSchema
```

- [x] **Step 6: Add persistence/restart tests**

Test that key metadata, cooldown deadline, failure class, and rotation cursor survive close/reopen byte-for-byte at the semantic field level.

- [x] **Step 7: Run focused + full core tests**

```bash
cargo test --manifest-path src-tauri/crates/credential-core/Cargo.toml store::tests -- --nocapture
cargo test --manifest-path src-tauri/crates/credential-core/Cargo.toml
```

Expected: PASS.

- [x] **Step 8: Commit and publish**

```bash
git add SubProject/Agent-Code/src-tauri/crates/credential-core
git -c commit.gpgsign=false commit -m "feat(agent-code): persist protected credential metadata"
git push
git fetch origin
test "$(git rev-parse HEAD)" = "$(git rev-parse origin/feature/agent-code-key-vault-rotation)"
```

---

### Task 4: Build credential CRUD, duplicate detection, and restart rehydration

**Files:**
- Create: `SubProject/Agent-Code/src-tauri/crates/credential-core/src/manager.rs`
- Modify: `SubProject/Agent-Code/src-tauri/crates/credential-core/src/lib.rs`
- Test: `manager.rs` unit tests with a test-only protector

**Interfaces:**
- Consumes: `VaultStore`, `SecretProtector`, `SecretBytes`.
- Produces:
  - `CredentialManager<P: SecretProtector>`
  - `CredentialManager::open(store, protector)`
  - `add_openrouter_key(secret, label, now_ms)`
  - `list_summaries()`
  - `set_enabled(key_id, enabled, now_ms)`
  - `delete_key(key_id, now_ms)`
  - internal secret resolution only inside manager-owned operations

- [x] **Step 1: Write RED CRUD/security tests**

Required tests:

```text
add -> UNVERIFIED + ENABLED
list -> KeySummary only
duplicate secret -> DuplicateCredential
same suffix but different secret -> allowed
disable -> DISABLED and ineligible marker
enable -> ENABLED but does not turn INVALID into READY
delete -> record removed
restart -> metadata/state restored
```

Add a compile-time/API test ensuring there is no method named `get_plaintext`, `reveal`, or `export_secret` in the public surface; enforce this again later with the source gate.

- [x] **Step 2: Run RED**

```bash
cargo test --manifest-path src-tauri/crates/credential-core/Cargo.toml manager::tests -- --nocapture
```

Expected: FAIL because `CredentialManager` does not exist.

- [x] **Step 3: Add opaque ID dependency**

Add to `crates/credential-core/Cargo.toml`:

```toml
uuid = { version = "1.18.1", features = ["v4", "serde"] }
```

- [x] **Step 4: Implement manager state and duplicate comparison**

Use one manager-owned synchronized state boundary:

```rust
pub struct CredentialManager<P: SecretProtector> {
    inner: std::sync::Mutex<ManagerInner<P>>,
}
```

`ManagerInner` owns:

```text
VaultStore
protector P
BTreeMap<KeyId, RuntimeKeyState>
stable slot order
rotation cursor (used in Task 5)
```

Duplicate detection algorithm:

```text
for each existing record in slot order:
  verify ciphertext checksum
  decrypt one record
  constant-time compare when lengths match
  immediately drop/zeroize decrypted existing secret
if duplicate -> reject
```

Do not persist a plaintext-derived fingerprint.

- [x] **Step 5: Bound labels and IDs**

Rules:

```text
label trim length: 1..=80 Unicode scalar chars
blank label -> "OpenRouter Key <slot>"
key_id -> UUID v4 lowercase string
slot_index -> monotonically increasing, never recycled inside one DB lifetime
masked_suffix -> generated from secret before secret drops
```

- [x] **Step 6: Add database-byte canary test**

After adding `sk-or-v1-UNIQUE_DB_CANARY_123456789`, read the SQLite file bytes and assert the full canary byte sequence does not occur.

This test uses the test-only protector that transforms the bytes before storage.

- [x] **Step 7: Run focused/core tests**

```bash
cargo test --manifest-path src-tauri/crates/credential-core/Cargo.toml manager::tests -- --nocapture
cargo test --manifest-path src-tauri/crates/credential-core/Cargo.toml
```

- [x] **Step 9: Commit/push/readback**

```bash
git add SubProject/Agent-Code/src-tauri/crates/credential-core
git -c commit.gpgsign=false commit -m "feat(agent-code): add secure credential vault lifecycle"
git push
git fetch origin
test "$(git rev-parse HEAD)" = "$(git rev-parse origin/feature/agent-code-key-vault-rotation)"
```

---

### Task 5: Implement deterministic round-robin rotation and the failure classifier

**Files:**
- Create: `SubProject/Agent-Code/src-tauri/crates/credential-core/src/classifier.rs`
- Create: `SubProject/Agent-Code/src-tauri/crates/credential-core/src/rotation.rs`
- Modify: `SubProject/Agent-Code/src-tauri/crates/credential-core/src/manager.rs`
- Modify: `SubProject/Agent-Code/src-tauri/crates/credential-core/src/lib.rs`
- Test: unit tests in `classifier.rs` and `rotation.rs`

**Interfaces:**
- Consumes: runtime key state from Task 4.
- Produces:
  - `RotationSession::new()`
  - `CredentialManager::acquire(&mut RotationSession, now_ms) -> Result<KeyLease, PoolUnavailable>`
  - `CredentialManager::report_outcome(lease, OutcomeSignal, now_ms)`
  - `classify_status(status, retry_hint) -> ClassifiedOutcome`
  - `RotationSnapshot`

- [x] **Step 1: Write the state-machine RED tests first**

Tests must explicitly prove:

```text
slots 0,1,2 -> acquire order 0,1,2,0 across independent sessions
same RotationSession never returns same key twice
DISABLED skipped
INVALID skipped
QUARANTINED skipped
UNVERIFIED skipped
EXHAUSTED skipped
COOLDOWN before deadline skipped
COOLDOWN after deadline reconciles to READY
empty/fully ineligible pool returns typed PoolUnavailable
scan terminates after <= pool length candidates
```

- [x] **Step 2: Write classifier RED tests**

Exact mapping:

```text
401 -> AUTH_INVALID, rotate=true
402 -> CREDIT_BLOCKED, rotate=true
403 -> PERMISSION_BLOCKED, rotate=true
429 -> RATE_LIMITED, rotate=true
400 -> REQUEST_INVALID, rotate=false
422 -> REQUEST_INVALID, rotate=false
408 -> PROVIDER_TRANSIENT, rotate=false
500 -> PROVIDER_TRANSIENT, rotate=false
502 -> PROVIDER_TRANSIENT, rotate=false
503 -> PROVIDER_TRANSIENT, rotate=false
524 -> PROVIDER_TRANSIENT, rotate=false
529 -> PROVIDER_TRANSIENT, rotate=false
other -> UNKNOWN, rotate=false
```

- [x] **Step 3: Run RED**

```bash
cargo test --manifest-path src-tauri/crates/credential-core/Cargo.toml rotation::tests classifier::tests -- --nocapture
```

- [x] **Step 4: Implement typed outcomes and no-recursion rotation**

Use structures equivalent to:

```rust
pub struct RotationSession {
    attempted: std::collections::BTreeSet<KeyId>,
}

pub struct KeyLease {
    pub lease_id: uuid::Uuid,
    pub key_id: KeyId,
    pub slot_index: i64,
}

// RuntimeKeyState additionally tracks `in_flight: u32`.
// RotationController owns `active_leases: BTreeMap<Uuid, KeyId>`.
// acquire() creates a unique lease and increments in_flight.
// report_outcome() consumes that lease exactly once and decrements in_flight.
// duplicate/unknown lease reports return a typed error without mutating counters.

pub enum OutcomeSignal {
    Success,
    Http { status: u16, retry_after_ms: Option<u64> },
    RequestInvalid,
    ProviderTransient,
    Unknown,
}
```

No retry method may call itself recursively.

- [x] **Step 5: Implement state transitions**

Rules:

```text
Success:
  consecutive_failures=0
  last_success_at=now
  availability remains READY

401:
  lifecycle=INVALID
  availability=UNVERIFIED

403:
  lifecycle=QUARANTINED
  availability=UNVERIFIED

402:
  availability=EXHAUSTED

429:
  availability=COOLDOWN
  cooldown_until = server hint OR deterministic bounded backoff

provider/request/unknown:
  do not change lifecycle/availability
```

For 429 fallback backoff use deterministic per-key behavior, not random runtime jitter:

```text
base = min(60_000ms, 1_000ms * 2^min(consecutive_failures, 5))
jitter = sha256(key_id UTF-8)[0..8] interpreted as big-endian u64 % 251ms
cooldown = base + jitter
```

Implement the jitter helper exactly as:

```rust
fn deterministic_jitter_ms(key_id: &KeyId) -> u64 {
    use sha2::{Digest, Sha256};
    let digest = Sha256::digest(key_id.0.as_bytes());
    let mut head = [0u8; 8];
    head.copy_from_slice(&digest[..8]);
    u64::from_be_bytes(head) % 251
}
```

- [x] **Step 6: Persist transitions and cursor atomically**

While holding the scheduler state lock, update the in-memory state and persist the same semantic transition through a short SQLite transaction. Release the lock before any later network operation.

No database lock/transaction may span an HTTP call.

- [x] **Step 7: Add restart-equivalence tests**

Execute a sequence containing success, 429, 401, disable, cursor movement; close/reopen the manager; assert the next acquisition and all persisted states match the pre-restart semantic snapshot.

- [x] **Step 8: Run focused + core regression**

```bash
cargo test --manifest-path src-tauri/crates/credential-core/Cargo.toml rotation::tests classifier::tests -- --nocapture
cargo test --manifest-path src-tauri/crates/credential-core/Cargo.toml
```

- [x] **Step 9: Commit/push/readback**

```bash
git add SubProject/Agent-Code/src-tauri/crates/credential-core
git -c commit.gpgsign=false commit -m "feat(agent-code): add deterministic key rotation core"
git push
git fetch origin
test "$(git rev-parse HEAD)" = "$(git rev-parse origin/feature/agent-code-key-vault-rotation)"
```

---

### Task 6: Build the deterministic synthetic rotation lab, property tests, and concurrency stress

**Files:**
- Create: `SubProject/Agent-Code/src-tauri/crates/credential-core/src/synthetic.rs`
- Modify: `SubProject/Agent-Code/src-tauri/crates/credential-core/src/lib.rs`
- Test: `synthetic.rs` unit/property/stress tests

**Interfaces:**
- Consumes: production `CredentialManager`, `RotationSession`, `OutcomeSignal`.
- Produces:
  - `run_synthetic_rotation_self_test() -> SyntheticRotationReport`
  - deterministic scripted scenario runner used by tests and later Tauri command

- [x] **Step 1: Write RED scenario tests**

Script these exact scenarios:

```text
Scenario A:
A READY, B READY
A -> 429 retry_after=30s
next acquire -> B
B -> success
A remains COOLDOWN

Scenario B:
A -> 401
B -> 402
C -> success
A INVALID
B EXHAUSTED
C READY

Scenario C:
A -> 503
no second key acquired for the same logical request
all key availability unchanged

Scenario D:
all keys unavailable
returns PoolUnavailable exactly once, no loop
```

- [x] **Step 2: Run RED**

```bash
cargo test --manifest-path src-tauri/crates/credential-core/Cargo.toml synthetic::tests -- --nocapture
```

- [x] **Step 3: Implement synthetic scripts using fake protected secrets only**

The report may contain:

```rust
pub struct SyntheticRotationReport {
    pub passed: bool,
    pub scenarios_run: u32,
    pub transitions_run: u64,
    pub duplicate_selection_violations: u64,
    pub ineligible_selection_violations: u64,
    pub provider_churn_violations: u64,
    pub deterministic_replay_equal: bool,
}
```

It must contain no secret fields and no raw HTTP headers.

- [x] **Step 4: Add the property-test dependency**

Add to `crates/credential-core/Cargo.toml` under `[dev-dependencies]`:

```toml
proptest = "1.9.0"
```

- [x] **Step 5: Add proptest state-machine invariants**

Generate pools of 1..32 keys and event sequences of 1..500 events. For every generated run assert:

```text
attempted set uniqueness per RotationSession
no selected key violates eligibility
all calls terminate
consecutive_failures stays bounded
cursor remains valid for current stable slot set
same seed/events -> same final snapshot
```

- [x] **Step 6: Add deterministic 100,000-transition stress mode**

Use a fixed PRNG/event seed in the test so the workload is replayable. Measure only in-memory selection separately from DB persistence.

Hard gates:

```text
transitions >= 100_000
duplicate_selection_violations = 0
ineligible_selection_violations = 0
provider_churn_violations = 0
deterministic_replay_equal = true
```

Record p50/p95 selection latency as evidence; target p95 `< 1 ms` on the Codespace/native test host, but do not weaken correctness gates if the virtualized host is noisy. If p95 misses, profile before changing design or threshold.

- [x] **Step 7: Add concurrency race tests**

Spawn 8 threads, each repeatedly performing manager operations through the same synchronized instance. Include acquire/report, disable, cooldown reconciliation, and delete of non-leased keys.

Hard invariants:

```text
no panic
no poisoned scheduler state
no negative/underflow in_flight counter
unique lease IDs
state snapshot remains parseable/persistable
```

- [x] **Step 8: Run stress/property/core suite**

```bash
cargo test --manifest-path src-tauri/crates/credential-core/Cargo.toml synthetic::tests -- --nocapture
cargo test --manifest-path src-tauri/crates/credential-core/Cargo.toml -- --nocapture
```

- [x] **Step 9: Commit/push/readback**

```bash
git add SubProject/Agent-Code/src-tauri/crates/credential-core
git -c commit.gpgsign=false commit -m "test(agent-code): certify synthetic key rotation"
git push
git fetch origin
test "$(git rev-parse HEAD)" = "$(git rev-parse origin/feature/agent-code-key-vault-rotation)"
```

---

### Task 7: Wire the Windows vault into Tauri with a metadata-only command surface

**Files:**
- Create: `SubProject/Agent-Code/src-tauri/src/credential/state.rs`
- Create: `SubProject/Agent-Code/src-tauri/src/credential/commands.rs`
- Modify: `SubProject/Agent-Code/src-tauri/src/credential/mod.rs`
- Modify: `SubProject/Agent-Code/src-tauri/src/main.rs`
- Modify: `SubProject/Agent-Code/src-tauri/Cargo.toml`
- Modify: `SubProject/Agent-Code/scripts/check-tauri-contract.mjs`
- Test: contract tests plus Rust unit tests for command mapping

**Interfaces:**
- Consumes: `CredentialManager<DpapiProtector>` and safe DTOs.
- Produces only these Tauri commands at this task:
  - `vault_add_openrouter_key`
  - `vault_list_openrouter_keys`
  - `vault_set_enabled`
  - `vault_delete_key`
  - `vault_run_native_self_test`
  - `rotation_get_snapshot`
  - `rotation_run_synthetic_self_test`
- `vault_validate_key` is added in Task 9 when the OpenRouter probe exists.

- [ ] **Step 1: Extend `check-tauri-contract.mjs` with a failing IPC allowlist test**

The contract must inspect `src-tauri/src/credential/commands.rs` and `main.rs` and assert:

```text
allowed command names are present
forbidden get_plaintext/reveal/export command names are absent
main.rs manages CredentialAppState
invoke_handler includes only approved vault/rotation commands
```

Run `npm run test:tauri-contract` and verify RED because the files do not exist.

- [ ] **Step 2: Add Tauri-boundary dependencies**

Add to root `src-tauri/Cargo.toml` `[dependencies]`:

```toml
serde = { version = "1.0.228", features = ["derive"] }
uuid = { version = "1.18.1", features = ["v4"] }
zeroize = "1.8.2"
```

These are direct dependencies because command deserialization, native canary generation, and immediate command-string zeroization occur in the Tauri crate rather than through transitive dependencies.

- [ ] **Step 3: Create `CredentialAppState`**

On Windows:

```rust
pub struct CredentialAppState {
    pub manager: std::sync::Arc<CredentialManager<DpapiProtector>>,
}
```

Initialization receives the resolved `app_local_data_dir` from Tauri and stores the DB at:

```text
<app_local_data_dir>/vault/vault.db
```

Do not hard-code `%LOCALAPPDATA%` manually.

- [ ] **Step 4: Add safe command request/error DTOs**

The add command may accept a raw string only at the command boundary:

```rust
#[derive(serde::Deserialize)]
pub struct AddOpenRouterKeyRequest {
    pub secret: String,
    pub label: String,
}
```

The first command statements must move/parse it into `SecretBytes` and zeroize the owned source `String` as soon as practical. No command result type may contain `SecretBytes` or `protected_blob`.

Errors returned to Tauri use stable codes such as:

```text
INVALID_INPUT
DUPLICATE_CREDENTIAL
VAULT_CORRUPT
KEY_NOT_FOUND
KEY_BUSY
PROTECTION_FAILED
UNSUPPORTED_PLATFORM
```

No provider body/header is included.

- [ ] **Step 5: Implement the native DPAPI self-test command**

The command must:

```text
generate random synthetic canary in native memory
DPAPI protect
assert ciphertext does not contain canary bytes
verify SHA-256 checksum
DPAPI unprotect
constant-time compare
zeroize both plaintext buffers
return { passed, error_class? }
```

It must not create a durable vault key row.

- [ ] **Step 6: Register commands in `main.rs`**

Use Tauri setup:

```rust
.setup(|app| {
    #[cfg(windows)]
    {
        let dir = app.path().app_local_data_dir()?;
        let state = credential::state::CredentialAppState::open(dir)?;
        app.manage(state);
    }
    Ok(())
})
.invoke_handler(tauri::generate_handler![
    credential::commands::vault_add_openrouter_key,
    credential::commands::vault_list_openrouter_keys,
    credential::commands::vault_set_enabled,
    credential::commands::vault_delete_key,
    credential::commands::vault_run_native_self_test,
    credential::commands::rotation_get_snapshot,
    credential::commands::rotation_run_synthetic_self_test,
])
```

Import `tauri::Manager` only where needed.

- [ ] **Step 7: Run contract/core/cross-build gates**

```bash
npm run test:tauri-contract
cargo test --manifest-path src-tauri/crates/credential-core/Cargo.toml
npm run build:windows:x64
```

The existing Windows artifact manifest/common-controls contract must remain PASS.

- [ ] **Step 9: Commit/push/readback**

```bash
git add SubProject/Agent-Code/src-tauri SubProject/Agent-Code/scripts/check-tauri-contract.mjs
git -c commit.gpgsign=false commit -m "feat(agent-code): expose secure credential vault commands"
git push
git fetch origin
test "$(git rev-parse HEAD)" = "$(git rev-parse origin/feature/agent-code-key-vault-rotation)"
```

---

### Task 8: Add the focused Credential Vault UI without turning Agent Code into a Settings app

**Files:**
- Create: `SubProject/Agent-Code/src/features/vault/vault-types.ts`
- Create: `SubProject/Agent-Code/src/features/vault/vault-api.ts`
- Create: `SubProject/Agent-Code/src/features/vault/CredentialVaultPanel.tsx`
- Create: `SubProject/Agent-Code/src/features/vault/CredentialVaultPanel.test.tsx`
- Modify: `SubProject/Agent-Code/src/app/AgentCodeApp.tsx`
- Modify: `SubProject/Agent-Code/src/components/Sidebar.tsx`
- Modify: `SubProject/Agent-Code/src/styles/app.css`
- Modify: `SubProject/Agent-Code/src/components/AgentCodeApp.test.tsx`
- Modify: `SubProject/Agent-Code/tests/visual/focused-console.spec.ts`

**Interfaces:**
- Consumes: metadata-only Tauri commands from Task 7.
- Produces: one `Credential Vault` shell surface and no general Settings system.

- [ ] **Step 1: Write UI RED tests before components**

Tests must prove:

```text
sidebar has "API Keys" action
opening it renders "Credential Vault"
import input type=password
autocomplete=off
spellcheck=false
full stored key never renders
no Reveal/Copy/Export button exists
list uses masked suffix only
submit clears DOM input after invoke settles
Disabled/Invalid/Cooldown/etc state badges are rendered from metadata
```

Mock `vault-api.ts`, not internal component state.

- [ ] **Step 2: Run RED**

```bash
npm test -- src/features/vault/CredentialVaultPanel.test.tsx src/components/AgentCodeApp.test.tsx
```

Expected: FAIL because the vault feature does not exist.

- [ ] **Step 3: Define frontend DTOs matching Rust metadata exactly**

`vault-types.ts`:

```ts
export type LifecycleState = 'ENABLED' | 'DISABLED' | 'INVALID' | 'QUARANTINED';
export type AvailabilityState = 'UNVERIFIED' | 'READY' | 'COOLDOWN' | 'EXHAUSTED';

export type KeySummary = {
  key_id: string;
  slot_index: number;
  label: string;
  masked_suffix: string;
  lifecycle_state: LifecycleState;
  availability_state: AvailabilityState;
  cooldown_until_utc_ms: number | null;
  consecutive_failures: number;
  last_success_at_utc_ms: number | null;
  last_probe_at_utc_ms: number | null;
  limit_value: number | null;
  limit_remaining: number | null;
  limit_reset: 'DAILY' | 'WEEKLY' | 'MONTHLY' | null;
  usage_daily: number | null;
  is_free_tier: boolean | null;
  expires_at_utc_ms: number | null;
};
```

There is intentionally no `secret`, `protected_blob`, or `authorization` field.

- [ ] **Step 4: Implement `vault-api.ts` with narrow invoke wrappers**

```ts
import { invoke } from '@tauri-apps/api/core';
import type { KeySummary } from './vault-types';

export const listKeys = () => invoke<KeySummary[]>('vault_list_openrouter_keys');
export const addKey = (secret: string, label: string) =>
  invoke<KeySummary>('vault_add_openrouter_key', { request: { secret, label } });
export const setKeyEnabled = (keyId: string, enabled: boolean) =>
  invoke<KeySummary>('vault_set_enabled', { keyId, enabled });
export const deleteKey = (keyId: string) => invoke<void>('vault_delete_key', { keyId });
```

Do not add a getter for plaintext.

- [ ] **Step 5: Implement an uncontrolled password input**

Use a ref, not `useState(secret)`:

```tsx
const secretInputRef = useRef<HTMLInputElement>(null);

<input
  ref={secretInputRef}
  type="password"
  autoComplete="off"
  spellCheck={false}
  aria-label="OpenRouter API key"
/>
```

At submit, read the current DOM value exactly once, start the invoke, immediately clear `input.value = ''`, and do not echo the submitted string into notifications/errors.

- [ ] **Step 6: Add vault navigation without altering local-session reducer semantics**

`AgentCodeApp` may own a small ephemeral surface state:

```ts
type AppSurface = 'workspace' | 'vault';
```

The existing `workspaceReducer` remains unchanged. Opening/closing the vault must not mutate session history.

- [ ] **Step 7: Add restrained vault styling**

Use existing CSS tokens. No dashboard cards, graphs, gradients, or general settings navigation. The surface should look like a focused credential list and import form.

- [ ] **Step 8: Run UI, type, build, existing visual gates**

```bash
npm test
npm run typecheck
npm run build
npm run test:visual
```

Add one vault visual acceptance screenshot only if the browser preview can render the surface deterministically without a native backend. If browser preview reports native-unavailable state, snapshot that state and keep the existing three Focused Console baselines unchanged.

- [ ] **Step 9: Commit/push/readback**

```bash
git add SubProject/Agent-Code/src SubProject/Agent-Code/tests/visual
git -c commit.gpgsign=false commit -m "feat(agent-code): add masked credential vault surface"
git push
git fetch origin
test "$(git rev-parse HEAD)" = "$(git rev-parse origin/feature/agent-code-key-vault-rotation)"
```

---

### Task 9: Add OpenRouter current-key validation without model inference

**Files:**
- Create: `SubProject/Agent-Code/src-tauri/crates/credential-core/src/openrouter.rs`
- Modify: `SubProject/Agent-Code/src-tauri/crates/credential-core/src/manager.rs`
- Modify: `SubProject/Agent-Code/src-tauri/crates/credential-core/src/lib.rs`
- Modify: `SubProject/Agent-Code/src-tauri/src/credential/commands.rs`
- Modify: `SubProject/Agent-Code/src-tauri/src/main.rs`
- Modify: `SubProject/Agent-Code/src/features/vault/vault-api.ts`
- Modify: `SubProject/Agent-Code/src/features/vault/CredentialVaultPanel.tsx`
- Test: Rust unit tests with a fake provider-specific transport; frontend command-mock tests

**Interfaces:**
- Consumes: secure secret resolution inside the core manager.
- Produces:
  - `OpenRouterProbeClient`
  - `CredentialManager::validate_openrouter_key(key_id, &OpenRouterProbeClient, now_ms)`
  - Tauri `vault_validate_key`

- [ ] **Step 1: Re-check current OpenRouter official docs before coding live behavior**

Confirm that `GET https://openrouter.ai/api/v1/key` still exists and verify the current response fields/error meanings. If the provider changed the endpoint/response, update the design spec and this task before implementation; do not silently substitute a model inference endpoint.

- [ ] **Step 2: Write RED probe parsing/classification tests**

Use a private provider-specific transport seam in `openrouter.rs` so tests can return synthetic HTTP results without network calls.

Required cases:

```text
200 metadata -> READY + bounded fields persisted
401 -> INVALID
402 -> EXHAUSTED
403 -> QUARANTINED
429 -> COOLDOWN only when appropriate to probe response
network timeout -> remains UNVERIFIED, not INVALID
503/529 -> remains UNVERIFIED/current health, no key churn
malformed JSON -> typed ProbeMalformed, no secret leakage
```

- [ ] **Step 3: Run RED**

```bash
cargo test --manifest-path src-tauri/crates/credential-core/Cargo.toml openrouter::tests -- --nocapture
```

- [ ] **Step 4: Add OpenRouter probe dependencies only now**

Add to `crates/credential-core/Cargo.toml`:

```toml
reqwest = { version = "0.12.23", default-features = false, features = ["blocking", "json", "rustls-tls"] }
time = { version = "0.3.44", features = ["parsing", "formatting"] }
```

Do not add an OpenRouter SDK or any other provider SDK.

- [ ] **Step 5: Implement bounded response DTOs**

Parse only fields needed by the spec. Do not persist the raw body.

Use an endpoint constant:

```rust
const OPENROUTER_CURRENT_KEY_URL: &str = "https://openrouter.ai/api/v1/key";
```

`OpenRouterProbeClient` uses a `reqwest::blocking::Client` with explicit connect/request timeouts. Do not log request headers.

- [ ] **Step 6: Keep secret inside the core during the request**

`CredentialManager::validate_openrouter_key` performs:

```text
lock -> load+verify ciphertext -> DPAPI/test unprotect into SecretBytes -> unlock
probe using &SecretBytes
SecretBytes drops/zeroizes
lock -> apply bounded metadata/outcome -> persist -> unlock
```

The method returns `KeySummary`, never the secret.

- [ ] **Step 7: Add Tauri command + UI Validate action**

Add `vault_validate_key` to the allowlist and `generate_handler!`. UI uses only returned `KeySummary` and refreshes the row.

- [ ] **Step 8: Run full non-live gates**

```bash
cargo test --manifest-path src-tauri/crates/credential-core/Cargo.toml
npm run test:tauri-contract
npm test
npm run typecheck
npm run build
```

No real key is required for this gate.

- [ ] **Step 9: Commit/push/readback**

```bash
git add SubProject/Agent-Code
git -c commit.gpgsign=false commit -m "feat(agent-code): validate OpenRouter credentials safely"
git push
git fetch origin
test "$(git rev-parse HEAD)" = "$(git rev-parse origin/feature/agent-code-key-vault-rotation)"
```

---

### Task 10: Add automated secret-boundary and corruption certification gates

**Files:**
- Create: `SubProject/Agent-Code/scripts/check-credential-security.mjs`
- Modify: `SubProject/Agent-Code/package.json`
- Extend tests in core/frontend/Tauri contract
- Modify: `SubProject/Agent-Code/README.md`

**Interfaces:**
- Consumes: all vault/rotation code.
- Produces: `npm run test:credential-security` as a stable release gate.

- [ ] **Step 1: Write the security script as a failing contract first**

The script must fail if tracked production source contains any forbidden public surface:

```text
vault_get_plaintext_key
vault_reveal_key
vault_export_plaintext
Reveal API Key
Copy API Key
localStorage.setItem( ... key ... )
CRYPTPROTECT_LOCAL_MACHINE
```

It must also assert production source contains no class/type named `PlaintextProtector` or `NoopProtector` outside test-only blocks/files.

- [ ] **Step 2: Add package scripts**

```json
"test:credential-core": "cargo test --manifest-path src-tauri/crates/credential-core/Cargo.toml -- --nocapture",
"test:credential-security": "node scripts/check-credential-security.mjs && npm run test:credential-core"
```

- [ ] **Step 3: Add dynamic canary coverage**

Synthetic canary must be asserted absent from:

```text
serialized KeySummary JSON
SQLite file bytes
manager error Display/Debug
synthetic report JSON
React DOM after add/list/error flows
native self-test result structure
```

Do not write the real user key to a test/log file to scan for it.

- [ ] **Step 4: Add tamper/decryption failure behavior**

Tests must mutate ciphertext/checksum and prove:

```text
checksum mismatch -> fail closed before unprotect
decryption error -> key transitions to QUARANTINED or vault returns explicit protected-record error
Agent Code shell itself is not crashed
bad record is not selectable
```

- [ ] **Step 5: Document the threat boundary and recovery consequence**

README must clearly say:

```text
keys are user/machine-bound by Windows DPAPI
Agent Code cannot reveal imported keys
loss of Windows user profile may make stored keys unrecoverable
users retain provider-side recovery/original credentials separately
OS/admin/debugger compromise is outside the local vault threat boundary
```

- [ ] **Step 6: Run security/full gates**

```bash
npm run test:credential-security
npm test
npm run typecheck
npm run build
npm run test:tauri-contract
npm run test:visual
```

- [ ] **Step 9: Commit/push/readback**

```bash
git add SubProject/Agent-Code
git -c commit.gpgsign=false commit -m "test(agent-code): enforce credential security boundaries"
git push
git fetch origin
test "$(git rev-parse HEAD)" = "$(git rev-parse origin/feature/agent-code-key-vault-rotation)"
```

---

### Task 11: Produce the Windows candidate and run native vault acceptance

**Files:**
- Modify only if acceptance finds a real defect.
- Evidence/update: `SubProject/Agent-Code/README.md` or a new `docs/superpowers/certification/2026-09-01-agent-code-vault-rotation.md` after factual tests complete.

**Interfaces:**
- Consumes: complete Linux-testable implementation.
- Produces: a Windows x64 NSIS candidate for user/native acceptance.

- [ ] **Step 1: Run fresh pre-candidate gates**

```bash
cd SubProject/Agent-Code
npm ci
npm run test:credential-security
npm test
npm run typecheck
npm run build
npm run test:tauri-contract
npm run test:visual
npm run build:windows:x64
```

Then verify:

```bash
file 'src-tauri/target/x86_64-pc-windows-msvc/release/agent-code.exe'
file 'src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/Agent Code_0.1.0_x64-setup.exe'
sha256sum 'src-tauri/target/x86_64-pc-windows-msvc/release/agent-code.exe' \
          'src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/Agent Code_0.1.0_x64-setup.exe'
bash scripts/check-windows-artifact.sh
```

Expected: PE32+ AMD64 app, NSIS installer, artifact contract PASS.

- [ ] **Step 2: Publish a clearly labeled prerelease candidate**

Use a new prerelease tag, not the old broken Preview 1 and not a stable tag. Example:

```text
agent-code-v0.1.0-vault-preview.1
Agent Code v0.1.0 Vault Preview 1
```

Upload installer, raw EXE, and SHA256 file. Do not overwrite an existing tag/asset silently.

- [ ] **Step 3: Run native Windows DPAPI self-test**

On actual Windows via Agent Code UI/native command:

```text
vault_run_native_self_test -> PASS
```

If FAIL, stop. Do not continue to live-key acceptance.

- [ ] **Step 4: Run native add/restart/no-reveal acceptance with a user-owned OpenRouter key**

Required manual/native evidence:

```text
add key succeeds
UI immediately clears import field
UI shows only masked suffix
no reveal/copy/export control exists
close Agent Code
reopen Agent Code
key row still exists and remains protected
vault.db byte/string inspection does not show plaintext credential
```

Do not ask the user to paste the key into chat or logs.

- [ ] **Step 5: Run bounded live current-key validation**

Use the stored key to call only `GET /api/v1/key` through Agent Code. Required:

```text
valid key -> READY + bounded metadata
no model inference request occurs
no raw provider body is persisted/logged
```

For invalid classification, use a disposable synthetic/temporary invalid token, not destructive exhaustion of a real account.

- [ ] **Step 6: Run synthetic rotation self-test on Windows**

```text
rotation_run_synthetic_self_test -> passed=true
100k offline stress evidence already PASS from Rust suite
```

- [ ] **Step 7: If any Windows failure occurs, return to TDD**

Create a failing regression test reproducing the native defect before production changes. Rebuild/publish a **new** preview number; do not mutate the existing prerelease artifact under the same identity.

---

### Task 12: Final Milestone 2A certification, parent regression, and integration

**Files:**
- Create: `SubProject/Agent-Code/docs/superpowers/certification/2026-09-01-agent-code-secure-key-vault-rotation.md`
- Modify: spec status to `Certified` only after all gates are factual
- Modify: implementation plan checkboxes as tasks complete
- No Super-Runtime changes

**Interfaces:**
- Consumes: all previous tasks plus native Windows evidence.
- Produces: certified Milestone 2A and a clean canonical `main` integration candidate.

- [ ] **Step 1: Run exact final Agent Code gate**

```bash
cd SubProject/Agent-Code
npm ci
npm run test:credential-security
npm test
npm run typecheck
npm run build
npm run test:tauri-contract
npm run test:visual
npm run build:windows:x64
bash scripts/check-windows-artifact.sh
```

Record exact counts and hashes; do not copy historical numbers if they changed.

- [ ] **Step 2: Run parent Agent-Core regression from repository root**

```bash
npm run build:codespace
npm test
npm run build
```

Expected: zero new failures. If root tests have moved due to concurrent work, report fresh counts rather than old `668` figures.

- [ ] **Step 3: Verify scope invariants**

Run:

```bash
git diff origin/main...HEAD -- SubProject/Super-Runtime
```

Expected: no output.

Also scan Agent Code production source for provider/model leakage:

```bash
grep -RniE 'Gemini|Anthropic|OpenAI-direct|Super-Runtime|llama\.cpp|GGML' \
  SubProject/Agent-Code/src \
  SubProject/Agent-Code/src-tauri/src \
  SubProject/Agent-Code/src-tauri/crates/credential-core/src || true
```

Expected: no integration hits; documentation/test strings are reviewed separately.

- [ ] **Step 4: Verify all 17 spec acceptance gates one by one**

Certification document must explicitly include factual evidence for:

```text
1  persistent plaintext secret = 0
2  plaintext read/reveal/export API = 0
3  canary leakage suite PASS
4  Windows DPAPI self-test PASS
5  restart persistence PASS
6  corrupt/tampered fail-closed PASS
7  deterministic rotation state machine PASS
8  provider transient no-pool-burn PASS
9  no duplicate key per RotationSession PASS
10 >=100k synthetic transitions PASS
11 concurrency state integrity PASS
12 live /api/v1/key validation PASS
13 Agent Code unit/type/build/visual PASS
14 Windows x64 cross-build PASS
15 native Windows add/restart/validate PASS
16 parent Agent-Core regression PASS
17 Super-Runtime diff EMPTY
```

If any one item lacks direct evidence, Milestone 2A remains `candidate`, not `stable`.

- [ ] **Step 5: Commit certification evidence and push the feature branch**

```bash
git add SubProject/Agent-Code/docs/superpowers \
        SubProject/Agent-Code/README.md
git -c commit.gpgsign=false commit -m "docs(agent-code): certify secure credential rotation"
git push
git fetch origin
test "$(git rev-parse HEAD)" = "$(git rev-parse origin/feature/agent-code-key-vault-rotation)"
```

- [ ] **Step 6: Integrate only by normal fast-forward/reconciliation**

Before touching `main`:

```bash
git fetch origin
BASE=$(git merge-base HEAD origin/main)
echo "BASE=$BASE"
git log --oneline HEAD..origin/main
git log --oneline origin/main..HEAD
```

If `origin/main` moved, rebase/reconcile the feature branch non-destructively, rerun the relevant full gates, and push normally. Never force-push.

Only fast-forward `main` after remote/current topology and verification are clean.

- [ ] **Step 7: Final post-integration readback**

Require:

```text
local main == origin/main
Agent Code credential gates PASS on merged SHA
working tree has no Agent Code uncommitted files
.vscode remains untouched
```

Keep an audit branch/commit available until the user explicitly requests cleanup.

---

## Execution Order and Stability Ratchet

Do not skip directly to the UI or real OpenRouter key. The intended ratchet is:

```text
Task 1  secret-safe contracts
  ↓
Task 2  DPAPI/protector boundary
  ↓
Task 3  transactional ciphertext store
  ↓
Task 4  secure CRUD/restart
  ↓
Task 5  deterministic rotation/classifier
  ↓
Task 6  synthetic/property/concurrency certification
  ↓
Task 7  narrow Tauri boundary
  ↓
Task 8  masked UI
  ↓
Task 9  bounded OpenRouter /api/v1/key validation
  ↓
Task 10 security/corruption gates
  ↓
Task 11 real Windows candidate acceptance
  ↓
Task 12 final certification + integration
```

A later task may not weaken an earlier security invariant to make integration easier. In particular, UI convenience must never introduce a reveal/export path, and live-provider behavior must never replace the synthetic lab as the authoritative rotation test.

## Plan Self-Review Results

### Spec coverage

All spec sections map to tasks:

- threat model / no absolute secrecy claim → Tasks 1, 10, 12;
- DPAPI current-user protection → Tasks 2, 7, 11;
- ciphertext checksum / tamper failure → Tasks 2, 3, 10;
- no plaintext fingerprint → Task 4;
- bounded plaintext lifecycle / zeroization → Tasks 1, 2, 7, 8, 9;
- transactional SQLite store / restart → Tasks 3, 4, 5;
- OpenRouter-only `/api/v1/key` → Task 9;
- deterministic rotation / anti-loop → Tasks 5, 6;
- failure semantics / provider no-churn → Tasks 5, 6;
- cooldown recovery → Task 5;
- minimal credential UI → Task 8;
- narrow Tauri commands → Task 7/9;
- Windows self-test → Tasks 7, 11;
- synthetic fault lab / 100k / properties → Task 6;
- corruption/degraded behavior → Tasks 3, 10;
- metadata-only logging → Tasks 1, 7, 9, 10;
- performance hot path → Tasks 5, 6;
- Windows native acceptance → Task 11;
- all 17 final gates → Task 12.

### Placeholder scan

Placeholder-pattern scan is clean across all implementation steps. Provider behavior is explicitly re-checked in Task 9 because it is external and time-sensitive; if it changes, the spec/plan must be amended before coding rather than guessed.

### Type consistency

The plan uses one stable naming chain throughout:

```text
SecretBytes
SecretProtector
ProtectedBlob
KeyId
KeySummary
CredentialManager
RotationSession
KeyLease
OutcomeSignal
FailureClass
SyntheticRotationReport
OpenRouterProbeClient
CredentialAppState
```

The WebView consumes only `KeySummary`/self-test/snapshot metadata. Stored plaintext is never a return type.
