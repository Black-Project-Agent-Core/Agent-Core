#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod credential;

#[cfg(windows)]
use tauri::Manager;

fn main() {
    let builder = tauri::Builder::default();

    #[cfg(windows)]
    let builder = builder
        .setup(|app| {
            let dir = app.path().app_local_data_dir()?;
            let state = credential::state::CredentialAppState::open(dir)
                .map_err(std::io::Error::other)?;
            app.manage(state);
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
        ]);

    builder
        .run(tauri::generate_context!())
        .expect("failed to run Agent Code");
}
