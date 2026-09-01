use std::path::PathBuf;
use std::sync::Arc;

use agent_code_credential_core::{CredentialManager, VaultStore};

use super::dpapi::DpapiProtector;

pub struct CredentialAppState {
    pub manager: Arc<CredentialManager<DpapiProtector>>,
}

impl CredentialAppState {
    pub fn open(app_local_data_dir: PathBuf) -> Result<Self, &'static str> {
        let vault_dir = app_local_data_dir.join("vault");
        std::fs::create_dir_all(&vault_dir).map_err(|_| "VAULT_INIT_FAILED")?;
        let store = VaultStore::open(vault_dir.join("vault.db")).map_err(|_| "VAULT_INIT_FAILED")?;
        let manager = CredentialManager::open(store, DpapiProtector).map_err(|_| "VAULT_INIT_FAILED")?;
        Ok(Self {
            manager: Arc::new(manager),
        })
    }
}
