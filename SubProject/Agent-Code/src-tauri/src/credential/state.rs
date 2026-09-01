use std::path::PathBuf;
use std::sync::Arc;

use agent_code_credential_core::{CredentialManager, ShadowHealthMonitor, VaultStore};

use super::dpapi::DpapiProtector;

pub struct CredentialAppState {
    pub manager: Arc<CredentialManager<DpapiProtector>>,
    _monitor: ShadowHealthMonitor,
}

impl CredentialAppState {
    pub fn open(app_local_data_dir: PathBuf) -> Result<Self, &'static str> {
        let vault_dir = app_local_data_dir.join("vault");
        std::fs::create_dir_all(&vault_dir).map_err(|_| "VAULT_INIT_FAILED")?;
        let store = VaultStore::open(vault_dir.join("vault.db")).map_err(|_| "VAULT_INIT_FAILED")?;
        let manager = Arc::new(
            CredentialManager::open(store, DpapiProtector).map_err(|_| "VAULT_INIT_FAILED")?,
        );
        let monitor = ShadowHealthMonitor::start(manager.clone())
            .map_err(|_| "VAULT_MONITOR_INIT_FAILED")?;
        Ok(Self {
            manager,
            _monitor: monitor,
        })
    }
}
