#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{
    env,
    io::{Read, Write},
    net::{SocketAddr, TcpStream},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{Arc, Mutex},
    thread,
    time::Duration,
};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

use tauri::{RunEvent, WebviewUrl, WebviewWindowBuilder};

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

const HOST: &str = "127.0.0.1";
const PORT: u16 = 7860;

fn health_ok() -> bool {
    let addr = SocketAddr::from(([127, 0, 0, 1], PORT));
    let Ok(mut stream) = TcpStream::connect_timeout(&addr, Duration::from_millis(600)) else {
        return false;
    };
    let _ = stream.set_read_timeout(Some(Duration::from_millis(900)));
    let _ = stream.set_write_timeout(Some(Duration::from_millis(900)));

    let request = b"GET /health HTTP/1.1\r\nHost: 127.0.0.1:7860\r\nConnection: close\r\n\r\n";
    if stream.write_all(request).is_err() {
        return false;
    }

    let mut response = String::new();
    if stream.read_to_string(&mut response).is_err() {
        return false;
    }

    (response.starts_with("HTTP/1.1 200") || response.starts_with("HTTP/1.0 200"))
        && response.contains("\"status\":\"ok\"")
}

fn resolve_langflow_root() -> Result<PathBuf, String> {
    if let Ok(explicit) = env::var("LANGFLOW_SOURCE_ROOT") {
        let path = PathBuf::from(explicit);
        if path.join("pyproject.toml").is_file() {
            return Ok(path);
        }
    }

    if let Ok(exe) = env::current_exe() {
        if let Some(mvp_dir) = exe.parent() {
            if let Some(subproject_dir) = mvp_dir.parent() {
                let candidate = subproject_dir.join("langflow");
                if candidate.join("pyproject.toml").is_file() {
                    return Ok(candidate);
                }
            }
        }
    }

    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    if let Some(subproject_dir) = manifest_dir.parent() {
        let candidate = subproject_dir.join("langflow");
        if candidate.join("pyproject.toml").is_file() {
            return Ok(candidate);
        }
    }

    Err("Unable to locate the sibling Langflow source checkout".to_string())
}

fn runtime_root(langflow_root: &Path) -> Result<PathBuf, String> {
    let subproject = langflow_root
        .parent()
        .ok_or_else(|| "Langflow source has no parent directory".to_string())?;
    Ok(subproject.join(".runtime").join("langflow-source"))
}

fn spawn_backend(langflow_root: &Path) -> Result<Child, String> {
    let python = langflow_root.join(".venv").join("Scripts").join("python.exe");
    let frontend = langflow_root.join("src").join("frontend").join("build");
    let runtime = runtime_root(langflow_root)?;
    let config = runtime.join("config");
    let logs = runtime.join("logs");
    std::fs::create_dir_all(&config).map_err(|e| format!("Create config dir failed: {e}"))?;
    std::fs::create_dir_all(&logs).map_err(|e| format!("Create log dir failed: {e}"))?;
    let log_file = logs.join("langflow-desktop-mvp.log");

    if !python.is_file() {
        return Err(format!("Python runtime not found: {}", python.display()));
    }
    if !frontend.join("index.html").is_file() {
        return Err(format!("Frontend build not found: {}", frontend.display()));
    }

    let mut command = Command::new(&python);
    command
        .current_dir(langflow_root)
        .arg("-m")
        .arg("langflow")
        .arg("run")
        .arg("--host")
        .arg(HOST)
        .arg("--port")
        .arg(PORT.to_string())
        .arg("--frontend-path")
        .arg(&frontend)
        .arg("--no-open-browser")
        .arg("--log-level")
        .arg("info")
        .arg("--log-file")
        .arg(&log_file)
        .env("DO_NOT_TRACK", "true")
        .env("LANGFLOW_DO_NOT_TRACK", "true")
        .env("LANGFLOW_CONFIG_DIR", &config)
        .env("LANGFLOW_SAVE_DB_IN_CONFIG_DIR", "true")
        .env("LANGFLOW_MODELS_DEV_REFRESH", "false")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .stdin(Stdio::null());

    #[cfg(windows)]
    command.creation_flags(CREATE_NO_WINDOW);

    command
        .spawn()
        .map_err(|e| format!("Unable to start Langflow backend: {e}"))
}

fn ensure_backend() -> Result<Option<Child>, String> {
    if health_ok() {
        return Ok(None);
    }

    let langflow_root = resolve_langflow_root()?;
    let mut child = spawn_backend(&langflow_root)?;

    for _ in 0..180 {
        if health_ok() {
            return Ok(Some(child));
        }
        if let Ok(Some(status)) = child.try_wait() {
            return Err(format!("Langflow backend exited during startup: {status}"));
        }
        thread::sleep(Duration::from_millis(500));
    }

    let _ = child.kill();
    let _ = child.wait();
    Err("Timed out waiting for Langflow health endpoint".to_string())
}

fn stop_owned_backend(backend: &Arc<Mutex<Option<Child>>>) {
    if let Ok(mut guard) = backend.lock() {
        if let Some(mut child) = guard.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

fn main() {
    let backend = Arc::new(Mutex::new(None::<Child>));
    let backend_for_setup = Arc::clone(&backend);
    let backend_for_exit = Arc::clone(&backend);

    let app = tauri::Builder::default()
        .setup(move |app| {
            let child = ensure_backend().map_err(std::io::Error::other)?;
            if let Ok(mut guard) = backend_for_setup.lock() {
                *guard = child;
            }

            let url = format!("http://{HOST}:{PORT}")
                .parse()
                .map_err(|e| std::io::Error::other(format!("Invalid UI URL: {e}")))?;

            WebviewWindowBuilder::new(app, "main", WebviewUrl::External(url))
                .title("Langflow Desktop MVP")
                .inner_size(1440.0, 900.0)
                .min_inner_size(960.0, 640.0)
                .center()
                .build()?;

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("Failed to build Langflow Desktop MVP");

    app.run(move |_app_handle, event| {
        if matches!(event, RunEvent::Exit) {
            stop_owned_backend(&backend_for_exit);
        }
    });
}
