#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod agent_core;

use agent_core::{AgentCoreActionResult, AgentCoreControlStatus, AgentCoreEngine};
use std::sync::Arc;
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager, State, WindowEvent,
};

const CLOSE_REQUESTED_EVENT: &str = "agent-code://close-requested";
const CLOSE_ERROR_EVENT: &str = "agent-code://close-error";

#[tauri::command]
fn agent_core_control_status(
    engine: State<'_, Arc<AgentCoreEngine>>,
) -> Result<AgentCoreControlStatus, String> {
    engine.status()
}

#[tauri::command]
fn agent_core_start(
    engine: State<'_, Arc<AgentCoreEngine>>,
) -> Result<AgentCoreActionResult, String> {
    engine.start_bundle()
}

#[tauri::command]
fn agent_core_open_folder(engine: State<'_, Arc<AgentCoreEngine>>) -> Result<(), String> {
    engine.open_folder()
}

#[tauri::command]
fn agent_core_open_tunnel_admin(engine: State<'_, Arc<AgentCoreEngine>>) -> Result<(), String> {
    engine.open_tunnel_admin()
}

#[tauri::command]
fn agent_core_restart_mcp(
    engine: State<'_, Arc<AgentCoreEngine>>,
) -> Result<AgentCoreActionResult, String> {
    engine.restart_agent_core()
}

#[tauri::command]
fn agent_core_restart_tunnel(
    engine: State<'_, Arc<AgentCoreEngine>>,
) -> Result<AgentCoreActionResult, String> {
    engine.restart_tunnel()
}

#[tauri::command]
fn agent_core_restart_all(
    engine: State<'_, Arc<AgentCoreEngine>>,
) -> Result<AgentCoreActionResult, String> {
    engine.restart_all()
}

#[tauri::command]
fn agent_core_reset_oauth(
    engine: State<'_, Arc<AgentCoreEngine>>,
) -> Result<AgentCoreActionResult, String> {
    engine.reset_oauth()
}

#[tauri::command]
fn agent_core_toggle_autostart(
    engine: State<'_, Arc<AgentCoreEngine>>,
) -> Result<AgentCoreActionResult, String> {
    engine.toggle_autostart()
}

#[tauri::command]
fn agent_core_exit(
    engine: State<'_, Arc<AgentCoreEngine>>,
) -> Result<AgentCoreActionResult, String> {
    engine.exit_agent_core()
}

fn show_main_window(app: &tauri::AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "Agent Code main window is unavailable".to_string())?;
    window
        .unminimize()
        .map_err(|error| format!("Failed to restore Agent Code window: {error}"))?;
    window
        .show()
        .map_err(|error| format!("Failed to show Agent Code window: {error}"))?;
    window
        .set_focus()
        .map_err(|error| format!("Failed to focus Agent Code window: {error}"))?;
    Ok(())
}

fn hide_main_window(app: &tauri::AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "Agent Code main window is unavailable".to_string())?;
    window
        .hide()
        .map_err(|error| format!("Failed to hide Agent Code to tray: {error}"))
}

fn close_completely(app: &tauri::AppHandle) -> Result<(), String> {
    let engine = app.state::<Arc<AgentCoreEngine>>();
    engine.exit_agent_core()?;
    app.exit(0);
    Ok(())
}

#[tauri::command]
fn app_hide_to_tray(app: tauri::AppHandle) -> Result<(), String> {
    hide_main_window(&app)
}

#[tauri::command]
fn app_close_completely(app: tauri::AppHandle) -> Result<(), String> {
    close_completely(&app)
}

fn main() {
    let background_mode = std::env::args().any(|argument| argument == "--agent-core-background");
    let engine = Arc::new(AgentCoreEngine::discover().expect("failed to locate Agent Core runtime"));
    let watchdog_engine = Arc::clone(&engine);

    tauri::Builder::default()
        .manage(engine)
        .invoke_handler(tauri::generate_handler![
            agent_core_control_status,
            agent_core_start,
            agent_core_open_folder,
            agent_core_open_tunnel_admin,
            agent_core_restart_mcp,
            agent_core_restart_tunnel,
            agent_core_restart_all,
            agent_core_reset_oauth,
            agent_core_toggle_autostart,
            agent_core_exit,
            app_hide_to_tray,
            app_close_completely,
        ])
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.emit(CLOSE_REQUESTED_EVENT, ());
            }
        })
        .setup(move |app| {
            let open_item = MenuItemBuilder::with_id("open-agent-code", "Open Agent Code").build(app)?;
            let close_item = MenuItemBuilder::with_id("close-completely", "Close Completely").build(app)?;
            let menu = MenuBuilder::new(app)
                .items(&[&open_item, &close_item])
                .build()?;

            let mut tray_builder = TrayIconBuilder::new()
                .tooltip("Agent Code")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "open-agent-code" => {
                        let _ = show_main_window(app);
                    }
                    "close-completely" => {
                        if let Err(error) = close_completely(app) {
                            let _ = show_main_window(app);
                            let _ = app.emit(CLOSE_ERROR_EVENT, error);
                        }
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let _ = show_main_window(tray.app_handle());
                    }
                });

            if let Some(icon) = app.default_window_icon() {
                tray_builder = tray_builder.icon(icon.clone());
            }
            tray_builder.build(app)?;

            if background_mode {
                hide_main_window(app.handle())?;
            }
            let _ = watchdog_engine.request_running_on_app_launch();
            watchdog_engine.spawn_watchdog();
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("failed to run Agent Code");
}