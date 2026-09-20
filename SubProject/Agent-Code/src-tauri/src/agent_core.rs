use fs2::FileExt;
use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::env;
use std::ffi::OsStr;
use std::fs::{self, File, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Output, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use zip::ZipArchive;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

const AGENT_CORE_PORT: u16 = 8765;
const TUNNEL_PORT: u16 = 8787;
const WATCHDOG_INTERVAL_SECONDS: u64 = 10;
const FAILURE_THRESHOLD: u32 = 3;
const RESTART_LIMIT: usize = 3;
const RESTART_WINDOW_MS: u64 = 300_000;
const BOOTSTRAP_SCHEMA_VERSION: u32 = 1;
const MINIMUM_NODE_VERSION: (u32, u32, u32) = (24, 15, 0);
const PREFERRED_NODE_VERSION: &str = "24.16.0";
const NATIVE_AUTOSTART_TASK: &str = "Agent Code Agent Core Controller";

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

#[derive(Clone)]
pub struct AgentCoreEngine {
    root: PathBuf,
    lifecycle_mutex: Arc<Mutex<()>>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentCoreControlStatus {
    pub overall: String,
    pub mcp_server: String,
    pub memory: String,
    pub execution: String,
    pub tunnel: String,
    pub autostart: bool,
    pub desired_running: bool,
    pub root: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentCoreActionResult {
    pub ok: bool,
    pub message: String,
    pub status: AgentCoreControlStatus,
}

#[derive(Debug, Clone, Deserialize)]
struct ProcessInfo {
    #[serde(rename = "ProcessId")]
    process_id: u32,
    #[serde(rename = "ExecutablePath", default)]
    executable_path: Option<String>,
    #[serde(rename = "CommandLine", default)]
    command_line: Option<String>,
}

impl ProcessInfo {
    // CIM can withhold these fields for processes running with another access token.
    // The PID still exists; unavailable metadata must never authorize lifecycle actions.
    fn identity_fields(&self) -> Option<(&str, &str)> {
        let executable = self.executable_path.as_deref().filter(|value| !value.trim().is_empty())?;
        let command = self.command_line.as_deref().filter(|value| !value.trim().is_empty())?;
        Some((executable, command))
    }
}

#[derive(Debug, Clone)]
struct ServiceProbe {
    pid: Option<u32>,
    identity_available: bool,
    identity_match: bool,
    healthy: bool,
    memory: String,
    execution: String,
}

#[derive(Debug, Clone)]
struct RuntimeTools {
    node: PathBuf,
    npm: PathBuf,
    tunnel: PathBuf,
    gh: Option<PathBuf>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct NativeServiceState {
    role: String,
    pid: u32,
    origin: String,
    started_at: String,
    health_state: String,
    consecutive_failures: u32,
    restart_history: Vec<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct NativeControllerState {
    #[serde(default = "default_true")]
    desired_running: bool,
    #[serde(default)]
    services: BTreeMap<String, NativeServiceState>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct NativeBootstrapState {
    schema_version: u32,
    root: String,
    machine: String,
    user_sid: String,
    architecture: String,
    node_version: String,
    updated_at: String,
}

impl Default for NativeControllerState {
    fn default() -> Self {
        Self {
            desired_running: true,
            services: BTreeMap::new(),
        }
    }
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Copy)]
enum ServiceRole {
    AgentCore,
    Tunnel,
}

impl ServiceRole {
    fn key(self) -> &'static str {
        match self {
            Self::AgentCore => "agentCore",
            Self::Tunnel => "tunnel",
        }
    }

    fn port(self) -> u16 {
        match self {
            Self::AgentCore => AGENT_CORE_PORT,
            Self::Tunnel => TUNNEL_PORT,
        }
    }
}

impl AgentCoreEngine {
    pub fn root_path(&self) -> &Path { &self.root }
    pub fn discover() -> Result<Self, String> {
        Ok(Self {
            root: discover_agent_core_root()?,
            lifecycle_mutex: Arc::new(Mutex::new(())),
        })
    }

    pub fn request_running_on_app_launch(&self) -> Result<(), String> {
        self.with_lifecycle_lock(|| self.set_desired_running(true))
    }

    pub fn status(&self) -> Result<AgentCoreControlStatus, String> {
        let agent = self.probe(ServiceRole::AgentCore)?;
        let tunnel = self.probe(ServiceRole::Tunnel)?;
        let state = self.read_state();
        let agent_faulted = service_faulted(&state, ServiceRole::AgentCore);
        let tunnel_faulted = service_faulted(&state, ServiceRole::Tunnel);
        let faulted = agent_faulted || tunnel_faulted;

        let mcp_status = display_service_status(&agent, agent_faulted);
        let tunnel_status = display_service_status(&tunnel, tunnel_faulted);
        let overall = if faulted {
            "Faulted"
        } else if mcp_status == "Running" && tunnel_status == "Running" {
            "Running"
        } else if !state.desired_running && agent.pid.is_none() && tunnel.pid.is_none() {
            "Stopped"
        } else {
            "Degraded"
        };

        Ok(AgentCoreControlStatus {
            overall: overall.to_string(),
            mcp_server: mcp_status,
            memory: agent.memory,
            execution: agent.execution,
            tunnel: tunnel_status,
            autostart: task_exists(NATIVE_AUTOSTART_TASK),
            desired_running: state.desired_running,
            root: self.root.to_string_lossy().to_string(),
        })
    }

    pub fn open_folder(&self) -> Result<(), String> {
        hidden_command("explorer.exe")
            .arg(&self.root)
            .spawn()
            .map_err(|error| format!("Failed to open Agent Core folder: {error}"))?;
        Ok(())
    }

    pub fn open_tunnel_admin(&self) -> Result<(), String> {
        let url = format!("http://127.0.0.1:{TUNNEL_PORT}/ui");
        hidden_command("cmd.exe")
            .args(["/D", "/S", "/C", "start", "", &url])
            .spawn()
            .map_err(|error| format!("Failed to open Tunnel Admin UI: {error}"))?;
        Ok(())
    }

    pub fn start_bundle(&self) -> Result<AgentCoreActionResult, String> {
        self.with_lifecycle_lock(|| {
            self.set_desired_running(true)?;
            let tools = self.prepare_runtime()?;
            self.start_service(ServiceRole::AgentCore, &tools)?;
            self.start_service(ServiceRole::Tunnel, &tools)?;
            self.action_result("Agent Core bundle is running")
        })
    }

    pub fn restart_agent_core(&self) -> Result<AgentCoreActionResult, String> {
        self.with_lifecycle_lock(|| {
            self.set_desired_running(true)?;
            let tools = self.ensure_runtime_tools()?;
            self.adopt_existing_if_safe(ServiceRole::AgentCore, &tools)?;
            self.stop_service(ServiceRole::AgentCore, &tools)?;
            self.start_service(ServiceRole::AgentCore, &tools)?;
            self.action_result("Agent Core MCP server restarted")
        })
    }

    pub fn restart_tunnel(&self) -> Result<AgentCoreActionResult, String> {
        self.with_lifecycle_lock(|| {
            self.set_desired_running(true)?;
            let tools = self.ensure_runtime_tools()?;
            self.adopt_existing_if_safe(ServiceRole::Tunnel, &tools)?;
            self.stop_service(ServiceRole::Tunnel, &tools)?;
            self.start_service(ServiceRole::Tunnel, &tools)?;
            self.action_result("Agent Core tunnel restarted")
        })
    }

    pub fn restart_all(&self) -> Result<AgentCoreActionResult, String> {
        self.with_lifecycle_lock(|| {
            self.set_desired_running(true)?;
            let tools = self.prepare_runtime()?;
            self.adopt_existing_if_safe(ServiceRole::AgentCore, &tools)?;
            self.adopt_existing_if_safe(ServiceRole::Tunnel, &tools)?;
            self.stop_service(ServiceRole::Tunnel, &tools)?;
            self.stop_service(ServiceRole::AgentCore, &tools)?;
            self.start_service(ServiceRole::AgentCore, &tools)?;
            self.start_service(ServiceRole::Tunnel, &tools)?;
            self.action_result("Agent Core MCP server and tunnel restarted")
        })
    }

    pub fn reset_oauth(&self) -> Result<AgentCoreActionResult, String> {
        self.with_lifecycle_lock(|| {
            self.set_desired_running(true)?;
            let tools = self.ensure_runtime_tools()?;
            self.adopt_existing_if_safe(ServiceRole::AgentCore, &tools)?;
            self.stop_service(ServiceRole::AgentCore, &tools)?;

            let cli = self.root.join("dist").join("cli.js");
            if !cli.exists() {
                self.prepare_runtime()?;
            }
            if !cli.exists() {
                return Err(format!("Agent Core CLI is missing: {}", cli.display()));
            }

            let data_dir = self.root.join("runtime").join("data");
            let import_data_dir = self.root.join("runtime").join("data-current");
            let mut command = hidden_command(&tools.node);
            command
                .arg(&cli)
                .arg("reset-oauth")
                .arg(&import_data_dir)
                .current_dir(&self.root)
                .env("AGENT_CORE_DATA_DIR", &data_dir);
            let output = command
                .output()
                .map_err(|error| format!("Failed to run Agent Core OAuth reset: {error}"))?;
            if !output.status.success() {
                let _ = self.start_service(ServiceRole::AgentCore, &tools);
                let detail: String = String::from_utf8_lossy(&output.stderr)
                    .trim()
                    .chars()
                    .take(500)
                    .collect();
                return Err(if detail.is_empty() {
                    format!(
                        "Agent Core OAuth reset failed with exit code {}",
                        output.status.code().unwrap_or(-1)
                    )
                } else {
                    format!(
                        "Agent Core OAuth reset failed with exit code {}: {}",
                        output.status.code().unwrap_or(-1),
                        detail
                    )
                });
            }

            self.start_service(ServiceRole::AgentCore, &tools)?;
            self.action_result("OAuth state reset; Agent Core is ready for re-authentication")
        })
    }

    pub fn exit_agent_core(&self) -> Result<AgentCoreActionResult, String> {
        self.with_lifecycle_lock(|| {
            let tools = self.ensure_runtime_tools()?;
            self.adopt_existing_if_safe(ServiceRole::AgentCore, &tools)?;
            self.adopt_existing_if_safe(ServiceRole::Tunnel, &tools)?;
            self.set_desired_running(false)?;
            self.stop_service(ServiceRole::Tunnel, &tools)?;
            self.stop_service(ServiceRole::AgentCore, &tools)?;
            self.action_result("Agent Core services stopped; Agent Code remains open")
        })
    }

    pub fn toggle_autostart(&self) -> Result<AgentCoreActionResult, String> {
        let enabled = task_exists(NATIVE_AUTOSTART_TASK);
        if enabled {
            delete_task(NATIVE_AUTOSTART_TASK);
        } else {
            let executable = preferred_agent_code_executable()?;
            create_agent_code_autostart_task(&executable)?;
        }
        self.action_result(if enabled {
            "Start with Windows disabled"
        } else {
            "Start with Windows enabled through Agent Code"
        })
    }

    pub fn spawn_watchdog(self: Arc<Self>) {
        thread::spawn(move || {
            let runtime = self.controller_runtime_dir();
            if fs::create_dir_all(&runtime).is_err() {
                return;
            }
            let leader_lock = match OpenOptions::new()
                .create(true)
                .read(true)
                .write(true)
                .open(runtime.join("watchdog.lock"))
            {
                Ok(file) => file,
                Err(_) => return,
            };
            if FileExt::try_lock_exclusive(&leader_lock).is_err() {
                return;
            }

            let _ = self.start_desired_bundle();

            loop {
                thread::sleep(Duration::from_secs(WATCHDOG_INTERVAL_SECONDS));
                if !self.read_state().desired_running {
                    continue;
                }
                let _ = self.watchdog_tick();
            }
        });
    }

    fn start_desired_bundle(&self) -> Result<(), String> {
        self.with_lifecycle_lock(|| {
            if !self.read_state().desired_running {
                return Ok(());
            }
            let tools = self.prepare_runtime()?;
            self.start_service(ServiceRole::AgentCore, &tools)?;
            self.start_service(ServiceRole::Tunnel, &tools)?;
            Ok(())
        })
    }

    fn watchdog_tick(&self) -> Result<(), String> {
        self.with_lifecycle_lock(|| {
            if !self.read_state().desired_running {
                return Ok(());
            }
            let tools = self.ensure_runtime_tools()?;
            for role in [ServiceRole::AgentCore, ServiceRole::Tunnel] {
                self.watchdog_service_tick(role, &tools)?;
            }
            Ok(())
        })
    }

    fn watchdog_service_tick(&self, role: ServiceRole, tools: &RuntimeTools) -> Result<(), String> {
        let probe = self.probe(role)?;
        if probe.pid.is_some() && !probe.identity_available {
            return Err(process_identity_unavailable(role));
        }
        let mut state = self.read_state();

        if probe.identity_match && probe.healthy {
            let entry = state.services.entry(role.key().to_string()).or_insert_with(|| {
                new_service_state(role, probe.pid.unwrap_or(0), "adopted")
            });
            if let Some(pid) = probe.pid {
                entry.pid = pid;
            }
            entry.health_state = "Running".to_string();
            entry.consecutive_failures = 0;
            self.write_state(&state)?;
            return Ok(());
        }

        let entry = state.services.entry(role.key().to_string()).or_insert_with(|| {
            new_service_state(role, probe.pid.unwrap_or(0), "watchdog")
        });
        entry.consecutive_failures = entry.consecutive_failures.saturating_add(1);
        entry.health_state = "Degraded".to_string();
        prune_restart_history(&mut entry.restart_history);

        if entry.consecutive_failures < FAILURE_THRESHOLD {
            self.write_state(&state)?;
            return Ok(());
        }

        if entry.restart_history.len() >= RESTART_LIMIT {
            entry.health_state = "Faulted".to_string();
            self.write_state(&state)?;
            return Ok(());
        }

        entry.restart_history.push(now_millis());
        let restart_history = entry.restart_history.clone();
        self.write_state(&state)?;

        if probe.pid.is_some() && probe.identity_match {
            self.stop_service(role, tools)?;
        } else if probe.pid.is_some() && !probe.identity_match {
            return Ok(());
        } else {
            self.clear_service_state(role)?;
        }

        if self.start_service(role, tools).is_ok() {
            let mut fresh = self.read_state();
            if let Some(entry) = fresh.services.get_mut(role.key()) {
                entry.restart_history = restart_history;
                entry.consecutive_failures = 0;
                entry.health_state = "Running".to_string();
            }
            self.write_state(&fresh)?;
        }
        Ok(())
    }

    fn action_result(&self, message: &str) -> Result<AgentCoreActionResult, String> {
        Ok(AgentCoreActionResult {
            ok: true,
            message: message.to_string(),
            status: self.status()?,
        })
    }

    fn with_lifecycle_lock<T>(&self, operation: impl FnOnce() -> Result<T, String>) -> Result<T, String> {
        let _guard = self
            .lifecycle_mutex
            .lock()
            .map_err(|_| "Agent Core lifecycle mutex is poisoned".to_string())?;
        let runtime = self.controller_runtime_dir();
        fs::create_dir_all(&runtime)
            .map_err(|error| format!("Failed to create controller runtime directory: {error}"))?;
        let lock_path = runtime.join("lifecycle.lock");
        let lock_file = OpenOptions::new()
            .create(true)
            .read(true)
            .write(true)
            .open(&lock_path)
            .map_err(|error| format!("Failed to open lifecycle lock: {error}"))?;

        let deadline = SystemTime::now() + Duration::from_secs(20);
        loop {
            if FileExt::try_lock_exclusive(&lock_file).is_ok() {
                break;
            }
            if SystemTime::now() >= deadline {
                return Err("Another Agent Code process is performing an Agent Core lifecycle action".to_string());
            }
            thread::sleep(Duration::from_millis(100));
        }

        let result = operation();
        let _ = FileExt::unlock(&lock_file);
        result
    }

    fn prepare_runtime(&self) -> Result<RuntimeTools, String> {
        if pack_lock_active(&self.root)? {
            return Err(
                "Agent Core portable package operation is active. Runtime preparation is blocked until packaging finishes."
                    .to_string(),
            );
        }

        let tools = self.ensure_runtime_tools()?;
        self.reconcile_bootstrap_state(&tools.node)?;
        self.write_locator_root()?;

        let launcher_dir = self.root.join("runtime").join("launcher");
        let npm_cache = launcher_dir.join("npm-cache");
        let temp_dir = launcher_dir.join("tmp");
        fs::create_dir_all(&npm_cache)
            .map_err(|error| format!("Failed to create npm cache directory: {error}"))?;
        fs::create_dir_all(&temp_dir)
            .map_err(|error| format!("Failed to create launcher temp directory: {error}"))?;

        let common_env = [
            ("npm_config_cache", npm_cache.as_os_str()),
            ("NPM_CONFIG_CACHE", npm_cache.as_os_str()),
            ("TEMP", temp_dir.as_os_str()),
            ("TMP", temp_dir.as_os_str()),
        ];

        let dependency_check = run_program(
            &tools.npm,
            &["ls", "--depth=0", "--silent"],
            &self.root,
            &common_env,
        );
        if dependency_check.as_ref().map(|output| output.status.success()).unwrap_or(false) == false {
            let verb = if self.root.join("package-lock.json").exists() {
                "ci"
            } else {
                "install"
            };
            let output = run_program(&tools.npm, &[verb], &self.root, &common_env)?;
            self.append_bootstrap_log("npm dependency restore", &output)?;
            if !output.status.success() {
                return Err(format!(
                    "Agent Core dependency installation failed with exit code {}",
                    output.status.code().unwrap_or(-1)
                ));
            }
        }

        let output = run_program(&tools.npm, &["run", "build"], &self.root, &common_env)?;
        self.append_bootstrap_log("npm run build", &output)?;
        if !output.status.success() {
            return Err(format!(
                "Agent Core build failed with exit code {}",
                output.status.code().unwrap_or(-1)
            ));
        }

        Ok(tools)
    }

    fn append_bootstrap_log(&self, label: &str, output: &Output) -> Result<(), String> {
        let dir = self.controller_runtime_dir();
        fs::create_dir_all(&dir)
            .map_err(|error| format!("Failed to create controller runtime directory: {error}"))?;
        let mut file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(dir.join("bootstrap.log"))
            .map_err(|error| format!("Failed to open bootstrap log: {error}"))?;
        writeln!(file, "\n=== {label} @ {} ===", now_iso_like())
            .map_err(|error| format!("Failed to write bootstrap log: {error}"))?;
        file.write_all(&output.stdout)
            .and_then(|_| file.write_all(&output.stderr))
            .map_err(|error| format!("Failed to write bootstrap log output: {error}"))?;
        Ok(())
    }

    fn ensure_runtime_tools(&self) -> Result<RuntimeTools, String> {
        let node = ensure_node_runtime(&self.root)?;
        let npm = resolve_npm_for_node(&node)
            .ok_or_else(|| format!("npm.cmd was not found beside {}", node.display()))?;
        let tunnel = resolve_existing_tunnel(&self.root)?;
        let gh = resolve_gh_executable();
        Ok(RuntimeTools {
            node,
            npm,
            tunnel,
            gh,
        })
    }

    fn start_service(&self, role: ServiceRole, tools: &RuntimeTools) -> Result<(), String> {
        let current = self.probe(role)?;
        if current.pid.is_some() {
            if !current.identity_available {
                return Err(process_identity_unavailable(role));
            }
            if current.identity_match && current.healthy {
                self.set_service_state(role, current.pid.unwrap_or(0), "adopted")?;
                return Ok(());
            }
            return Err(format!(
                "Port {} is already in use by a process that Agent Code will not take over",
                role.port()
            ));
        }

        match role {
            ServiceRole::AgentCore => self.spawn_agent_core(tools)?,
            ServiceRole::Tunnel => self.spawn_tunnel(tools)?,
        }

        let deadline = SystemTime::now() + Duration::from_secs(12);
        loop {
            let probe = self.probe(role)?;
            if probe.pid.is_some() && probe.identity_match && probe.healthy {
                self.set_service_state(role, probe.pid.unwrap_or(0), "started")?;
                return Ok(());
            }
            if SystemTime::now() >= deadline {
                return Err(format!("{} did not become healthy in time", role.key()));
            }
            thread::sleep(Duration::from_millis(150));
        }
    }

    fn spawn_agent_core(&self, tools: &RuntimeTools) -> Result<(), String> {
        let entry = self.root.join("dist").join("index.js");
        if !entry.exists() {
            return Err(format!("Agent Core entry is missing: {}", entry.display()));
        }

        let tray_runtime = self.root.join("runtime").join("tray");
        fs::create_dir_all(&tray_runtime)
            .map_err(|error| format!("Failed to create Agent Core runtime log directory: {error}"))?;
        let shutdown_request = tray_runtime.join("agent-core.shutdown.request");
        let _ = fs::remove_file(&shutdown_request);

        let stdout = open_log_file(&tray_runtime.join("agent-core.stdout.log"))?;
        let stderr = open_log_file(&tray_runtime.join("agent-core.stderr.log"))?;
        let allowed_roots = resolve_allowed_roots(&self.root).join(";");
        let oauth_url = resolve_oauth_protected_resource_url(&self.root)?;
        let gh_enabled = tools.gh.as_ref().map(|path| path.exists()).unwrap_or(false);

        let mut command = hidden_command(&tools.node);
        command
            .arg(&entry)
            .current_dir(&self.root)
            .stdin(Stdio::null())
            .stdout(Stdio::from(stdout))
            .stderr(Stdio::from(stderr))
            .env("AGENT_CORE_HOME", &self.root)
            .env("AGENT_CORE_NODE_EXE", &tools.node)
            .env("AGENT_CORE_NPM_EXE", &tools.npm)
            .env("AGENT_CORE_TUNNEL_EXE", &tools.tunnel)
            .env("AGENT_CORE_DATA_DIR", self.root.join("runtime").join("data"))
            .env("AGENT_CORE_LOG_DIR", self.root.join("runtime").join("logs"))
            .env("AGENT_CORE_CAPABILITY_DIR", self.root.join("capabilities"))
            .env("AGENT_CORE_ALLOWED_ROOTS", allowed_roots)
            .env("AGENT_CORE_HOST", "127.0.0.1")
            .env("AGENT_CORE_PORT", AGENT_CORE_PORT.to_string())
            .env("AGENT_CORE_MEMORY_ENABLED", "true")
            .env("AGENT_CORE_SHUTDOWN_REQUEST_PATH", &shutdown_request)
            .env("AGENT_CORE_GITHUB_USE_GH_CLI", if gh_enabled { "true" } else { "false" });

        if let Some(url) = oauth_url {
            command.env("AGENT_CORE_OAUTH_PROTECTED_RESOURCE_URL", url);
        }
        if let Some(gh) = &tools.gh {
            command.env("AGENT_CORE_GH_EXE", gh);
        }

        command
            .spawn()
            .map_err(|error| format!("Failed to start Agent Core MCP server: {error}"))?;
        Ok(())
    }

    fn spawn_tunnel(&self, tools: &RuntimeTools) -> Result<(), String> {
        let profile = self.root.join("tunnel-client").join("agent-core.yaml");
        if !profile.exists() {
            return Err(format!("Tunnel profile is missing: {}", profile.display()));
        }
        // tunnel-client exits at config parse time on a bad profile (wrong channel, log format, missing key file);
        // without this preflight the only symptom would be a 12s wait ending in "did not become healthy in time".
        let profile_arg = profile.to_string_lossy().to_string();
        let doctor = run_program(&tools.tunnel, &["doctor", "--profile-file", &profile_arg], &self.root, &[])?;
        if !doctor.status.success() {
            let report = String::from_utf8_lossy(&doctor.stdout);
            let failures: Vec<&str> = report
                .lines()
                .filter(|line| line.contains(" FAIL "))
                .map(str::trim)
                .collect();
            let detail = if failures.is_empty() { report.trim().to_string() } else { failures.join("; ") };
            return Err(format!("Tunnel profile failed tunnel-client doctor: {detail}"));
        }
        let tray_runtime = self.root.join("runtime").join("tray");
        fs::create_dir_all(&tray_runtime)
            .map_err(|error| format!("Failed to create tunnel runtime directory: {error}"))?;
        let stdout = open_log_file(&tray_runtime.join("tunnel.stdout.log"))?;
        let stderr = open_log_file(&tray_runtime.join("tunnel.stderr.log"))?;

        let mut command = hidden_command(&tools.tunnel);
        command
            .arg("run")
            .arg("--profile-file")
            .arg(&profile)
            .arg("--harpoon.allow-plaintext-http")
            .current_dir(&self.root)
            .env("AGENT_CORE_HOME", &self.root)
            .env("AGENT_CORE_NODE_EXE", &tools.node)
            .env("AGENT_CORE_NPM_EXE", &tools.npm)
            .env("AGENT_CORE_TUNNEL_EXE", &tools.tunnel)
            .stdin(Stdio::null())
            .stdout(Stdio::from(stdout))
            .stderr(Stdio::from(stderr))
            .spawn()
            .map_err(|error| format!("Failed to start Agent Core tunnel: {error}"))?;
        Ok(())
    }

    fn adopt_existing_if_safe(&self, role: ServiceRole, tools: &RuntimeTools) -> Result<(), String> {
        let probe = self.probe_with_tools(role, tools)?;
        if probe.pid.is_some() && probe.identity_match && probe.healthy {
            self.set_service_state(role, probe.pid.unwrap_or(0), "adopted")?;
        }
        Ok(())
    }

    fn stop_service(&self, role: ServiceRole, tools: &RuntimeTools) -> Result<(), String> {
        let probe = self.probe_with_tools(role, tools)?;
        let state = self.read_state();
        let entry = match state.services.get(role.key()) {
            Some(entry) => entry.clone(),
            None => return Ok(()),
        };

        if probe.pid.is_some() && !probe.identity_available {
            return Err(process_identity_unavailable(role));
        }
        if probe.pid != Some(entry.pid) || !probe.identity_match {
            self.clear_service_state(role)?;
            return Err(format!(
                "Refused to stop {} because the recorded process identity no longer matches",
                role.key()
            ));
        }

        let mut graceful = false;
        if matches!(role, ServiceRole::AgentCore) {
            let shutdown_request = self
                .root
                .join("runtime")
                .join("tray")
                .join("agent-core.shutdown.request");
            if let Some(parent) = shutdown_request.parent() {
                let _ = fs::create_dir_all(parent);
            }
            if fs::write(&shutdown_request, b"stop\n").is_ok() {
                graceful = wait_process_exit(entry.pid, Duration::from_secs(5));
            }
            let _ = fs::remove_file(&shutdown_request);
        }

        if !graceful && self.confirm_owned_process(entry.pid, role, tools)? {
            let _ = taskkill(entry.pid, false);
            if !wait_process_exit(entry.pid, Duration::from_secs(3)) {
                if self.confirm_owned_process(entry.pid, role, tools)? {
                    taskkill(entry.pid, true)?;
                }
                if !wait_process_exit(entry.pid, Duration::from_secs(2)) {
                    return Err(format!("{} process exit could not be confirmed; ownership was preserved", role.key()));
                }
            }
        }

        self.clear_service_state(role)?;
        Ok(())
    }

    fn confirm_owned_process(&self, pid: u32, role: ServiceRole, tools: &RuntimeTools) -> Result<bool, String> {
        let Some(process) = process_info_by_pid(pid)? else {
            return Ok(false);
        };
        if process.identity_fields().is_none() {
            return Err(process_identity_unavailable(role));
        }
        let matches = match role {
            ServiceRole::AgentCore => is_agent_core_identity(&process, &tools.node, &self.root),
            ServiceRole::Tunnel => is_tunnel_identity(&process, &tools.tunnel, &self.root),
        };
        if !matches {
            return Err(format!("Refused to stop {} because the recorded process identity no longer matches", role.key()));
        }
        Ok(true)
    }

    fn probe(&self, role: ServiceRole) -> Result<ServiceProbe, String> {
        let tools = self.ensure_runtime_tools_without_install();
        match tools {
            Ok(tools) => self.probe_with_tools(role, &tools),
            Err(_) => {
                let health = if matches!(role, ServiceRole::AgentCore) {
                    agent_health_details()
                } else {
                    (tunnel_health(), "Unavailable".to_string(), "Unavailable".to_string())
                };
                Ok(ServiceProbe {
                    pid: port_owner_process(role.port())?.map(|process| process.process_id),
                    identity_available: false,
                    identity_match: false,
                    healthy: health.0,
                    memory: health.1,
                    execution: health.2,
                })
            }
        }
    }

    fn probe_with_tools(&self, role: ServiceRole, tools: &RuntimeTools) -> Result<ServiceProbe, String> {
        let owner = match port_owner_process(role.port())? {
            Some(owner) => Some(owner),
            None => match self.read_state().services.get(role.key()) {
                Some(entry) if entry.pid != 0 => process_info_by_pid(entry.pid)?,
                _ => None,
            },
        };
        if owner.is_none() {
            return Ok(ServiceProbe {
                pid: None,
                identity_available: false,
                identity_match: false,
                healthy: false,
                memory: if matches!(role, ServiceRole::AgentCore) {
                    "Unavailable".to_string()
                } else {
                    "Unknown".to_string()
                },
                execution: if matches!(role, ServiceRole::AgentCore) {
                    "Unavailable".to_string()
                } else {
                    "Unknown".to_string()
                },
            });
        }
        let owner = owner.unwrap();
        let identity_match = match role {
            ServiceRole::AgentCore => is_agent_core_identity(&owner, &tools.node, &self.root),
            ServiceRole::Tunnel => is_tunnel_identity(&owner, &tools.tunnel, &self.root),
        };
        let (healthy, memory, execution) = match role {
            ServiceRole::AgentCore => agent_health_details(),
            ServiceRole::Tunnel => (
                tunnel_health(),
                "Unknown".to_string(),
                "Unknown".to_string(),
            ),
        };
        Ok(ServiceProbe {
            pid: Some(owner.process_id),
            identity_available: owner.identity_fields().is_some(),
            identity_match,
            healthy,
            memory,
            execution,
        })
    }

    fn ensure_runtime_tools_without_install(&self) -> Result<RuntimeTools, String> {
        let node = resolve_compatible_node(&self.root)
            .ok_or_else(|| "Compatible Node.js runtime is not currently available".to_string())?;
        let npm = resolve_npm_for_node(&node)
            .ok_or_else(|| "npm.cmd is not currently available".to_string())?;
        let tunnel = resolve_existing_tunnel(&self.root)?;
        Ok(RuntimeTools {
            node,
            npm,
            tunnel,
            gh: resolve_gh_executable(),
        })
    }

    fn controller_runtime_dir(&self) -> PathBuf {
        self.root.join("runtime").join("agent-code-controller")
    }

    fn state_path(&self) -> PathBuf {
        self.controller_runtime_dir().join("state.json")
    }

    fn read_state(&self) -> NativeControllerState {
        let path = self.state_path();
        fs::read_to_string(path)
            .ok()
            .and_then(|text| serde_json::from_str(&text).ok())
            .unwrap_or_default()
    }

    fn write_state(&self, state: &NativeControllerState) -> Result<(), String> {
        let dir = self.controller_runtime_dir();
        fs::create_dir_all(&dir)
            .map_err(|error| format!("Failed to create controller runtime directory: {error}"))?;
        let json = serde_json::to_vec_pretty(state)
            .map_err(|error| format!("Failed to serialize Agent Core controller state: {error}"))?;
        fs::write(self.state_path(), json)
            .map_err(|error| format!("Failed to write Agent Core controller state: {error}"))?;
        Ok(())
    }

    fn set_desired_running(&self, desired: bool) -> Result<(), String> {
        let mut state = self.read_state();
        state.desired_running = desired;
        self.write_state(&state)
    }

    fn set_service_state(&self, role: ServiceRole, pid: u32, origin: &str) -> Result<(), String> {
        let mut state = self.read_state();
        let previous_history = state
            .services
            .get(role.key())
            .map(|entry| entry.restart_history.clone())
            .unwrap_or_default();
        let mut entry = new_service_state(role, pid, origin);
        entry.restart_history = previous_history;
        state.services.insert(role.key().to_string(), entry);
        self.write_state(&state)
    }

    fn clear_service_state(&self, role: ServiceRole) -> Result<(), String> {
        let mut state = self.read_state();
        state.services.remove(role.key());
        self.write_state(&state)
    }

    fn reconcile_bootstrap_state(&self, node: &Path) -> Result<(), String> {
        let bootstrap_dir = self.root.join("runtime").join("bootstrap");
        fs::create_dir_all(&bootstrap_dir)
            .map_err(|error| format!("Failed to create Agent Core bootstrap directory: {error}"))?;
        let install_state_path = bootstrap_dir.join("install-state.json");
        let machine = env::var("COMPUTERNAME").unwrap_or_else(|_| "unknown".to_string());
        let user_sid = current_user_sid();
        let architecture = node_architecture().to_string();
        let node_version = node_version_string(node).unwrap_or_else(|| "unknown".to_string());

        let previous = fs::read_to_string(&install_state_path)
            .ok()
            .and_then(|text| serde_json::from_str::<NativeBootstrapState>(&text).ok());
        let relocated = previous.as_ref().map(|state| {
            state.schema_version != BOOTSTRAP_SCHEMA_VERSION
                || !same_path_str(&state.root, &self.root)
                || !state.machine.eq_ignore_ascii_case(&machine)
                || !state.user_sid.eq_ignore_ascii_case(&user_sid)
                || !state.architecture.eq_ignore_ascii_case(&architecture)
        }).unwrap_or(false);

        if relocated {
            let _ = fs::remove_file(self.state_path());
        }

        let state = NativeBootstrapState {
            schema_version: BOOTSTRAP_SCHEMA_VERSION,
            root: self.root.to_string_lossy().to_string(),
            machine,
            user_sid,
            architecture,
            node_version,
            updated_at: now_iso_like(),
        };
        let json = serde_json::to_vec_pretty(&state)
            .map_err(|error| format!("Failed to serialize Agent Core bootstrap state: {error}"))?;
        fs::write(&install_state_path, json)
            .map_err(|error| format!("Failed to write Agent Core bootstrap state: {error}"))?;
        Ok(())
    }

    fn write_locator_root(&self) -> Result<(), String> {
        let local_app_data = local_app_data_dir()?;
        let locator_dir = local_app_data.join("AgentCore");
        fs::create_dir_all(&locator_dir)
            .map_err(|error| format!("Failed to create Agent Core locator directory: {error}"))?;
        fs::write(locator_dir.join("root.txt"), self.root.to_string_lossy().as_bytes())
            .map_err(|error| format!("Failed to write Agent Core root locator: {error}"))?;
        Ok(())
    }
}

// Faulted is per service: a tunnel that cannot start must not relabel a healthy MCP server.
fn service_faulted(state: &NativeControllerState, role: ServiceRole) -> bool {
    state
        .services
        .get(role.key())
        .map(|entry| entry.health_state.eq_ignore_ascii_case("Faulted"))
        .unwrap_or(false)
}

fn display_service_status(probe: &ServiceProbe, faulted: bool) -> String {
    if probe.pid.is_some() && !probe.identity_available {
        "Identity unavailable".to_string()
    } else if faulted {
        "Faulted".to_string()
    } else if probe.pid.is_some() && probe.identity_match && probe.healthy {
        "Running".to_string()
    } else {
        "Degraded".to_string()
    }
}

fn process_identity_unavailable(role: ServiceRole) -> String {
    format!(
        "Windows did not provide process identity on port {}. Close the other Agent Code instance and reopen Agent Code with the same Windows permissions as its services. No process was taken over or stopped.",
        role.port()
    )
}

fn new_service_state(role: ServiceRole, pid: u32, origin: &str) -> NativeServiceState {
    NativeServiceState {
        role: role.key().to_string(),
        pid,
        origin: origin.to_string(),
        started_at: now_iso_like(),
        health_state: "Running".to_string(),
        consecutive_failures: 0,
        restart_history: Vec::new(),
    }
}

fn prune_restart_history(history: &mut Vec<u64>) {
    let cutoff = now_millis().saturating_sub(RESTART_WINDOW_MS);
    history.retain(|timestamp| *timestamp >= cutoff && *timestamp <= now_millis());
}

fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn now_iso_like() -> String {
    format!("unix-ms:{}", now_millis())
}

fn discover_agent_core_root() -> Result<PathBuf, String> {
    if let Ok(value) = env::var("AGENT_CORE_HOME") {
        let candidate = PathBuf::from(value);
        if is_agent_core_root(&candidate) {
            return Ok(normalize_absolute(candidate)?);
        }
    }

    if let Ok(exe) = env::current_exe() {
        for ancestor in exe.ancestors() {
            if is_agent_core_root(ancestor) {
                return Ok(normalize_absolute(ancestor.to_path_buf())?);
            }
        }
    }

    if let Ok(current) = env::current_dir() {
        for ancestor in current.ancestors() {
            if is_agent_core_root(ancestor) {
                return Ok(normalize_absolute(ancestor.to_path_buf())?);
            }
        }
    }

    if let Ok(local) = local_app_data_dir() {
        let root_file = local.join("AgentCore").join("root.txt");
        if let Ok(text) = fs::read_to_string(root_file) {
            let candidate = PathBuf::from(text.trim());
            if is_agent_core_root(&candidate) {
                return Ok(normalize_absolute(candidate)?);
            }
        }
    }

    Err("Agent Code could not locate the Agent Core root. Set AGENT_CORE_HOME or run Agent Code from inside the Agent Core package.".to_string())
}

fn is_agent_core_root(path: &Path) -> bool {
    path.join("package.json").exists()
        && path
            .join("tunnel-client")
            .join("agent-core.yaml")
            .exists()
        && path.join("src").join("rdc").exists()
        && path.join("src").join("index.ts").exists()
}

fn normalize_absolute(path: PathBuf) -> Result<PathBuf, String> {
    if path.is_absolute() {
        Ok(path)
    } else {
        env::current_dir()
            .map(|current| current.join(path))
            .map_err(|error| format!("Failed to normalize path: {error}"))
    }
}

fn local_app_data_dir() -> Result<PathBuf, String> {
    if let Some(value) = env::var_os("AGENT_CORE_LOCAL_APP_DATA_ROOT") {
        if !value.is_empty() {
            return Ok(PathBuf::from(value));
        }
    }
    env::var_os("LOCALAPPDATA")
        .map(PathBuf::from)
        .ok_or_else(|| "LOCALAPPDATA is unavailable".to_string())
}

fn current_user_sid() -> String {
    let script = "try { [Security.Principal.WindowsIdentity]::GetCurrent().User.Value } catch { '' }";
    if let Ok(output) = hidden_command("powershell.exe")
        .args(["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script])
        .output()
    {
        let value = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if !value.is_empty() {
            return value;
        }
    }
    let domain = env::var("USERDOMAIN").unwrap_or_default();
    let user = env::var("USERNAME").unwrap_or_else(|_| "unknown".to_string());
    if domain.is_empty() {
        user
    } else {
        format!("{domain}\\{user}")
    }
}

fn preferred_agent_code_executable() -> Result<PathBuf, String> {
    env::current_exe().map_err(|error| format!("Failed to resolve Agent Code executable: {error}"))
}

fn hidden_command(program: impl AsRef<OsStr>) -> Command {
    let mut command = Command::new(program);
    #[cfg(windows)]
    command.creation_flags(CREATE_NO_WINDOW);
    command
}

fn find_in_path(name: &str) -> Option<PathBuf> {
    let path = env::var_os("PATH")?;
    for directory in env::split_paths(&path) {
        let candidate = directory.join(name);
        if candidate.exists() {
            return Some(candidate);
        }
    }
    None
}

fn resolve_compatible_node(root: &Path) -> Option<PathBuf> {
    let mut candidates = Vec::new();
    if let Ok(value) = env::var("AGENT_CORE_NODE_EXE") {
        candidates.push(PathBuf::from(value));
    }
    if let Some(path) = find_in_path("node.exe") {
        candidates.push(path);
    }
    if let Some(program_files) = env::var_os("ProgramFiles") {
        candidates.push(PathBuf::from(program_files).join("nodejs").join("node.exe"));
    }
    candidates.push(
        root.join("runtime")
            .join("tools")
            .join(format!("node-v{PREFERRED_NODE_VERSION}-win-{}", node_architecture()))
            .join("node.exe"),
    );

    candidates
        .into_iter()
        .find(|candidate| candidate.exists() && node_version_compatible(candidate))
}

fn node_version_string(node: &Path) -> Option<String> {
    let output = hidden_command(node).arg("--version").output().ok()?;
    if !output.status.success() {
        return None;
    }
    let text = String::from_utf8_lossy(&output.stdout);
    let version = text.trim().trim_start_matches('v');
    if version.is_empty() {
        None
    } else {
        Some(version.to_string())
    }
}

fn node_version_compatible(node: &Path) -> bool {
    node_version_string(node)
        .as_deref()
        .and_then(version_tuple)
        .map(|actual| actual >= MINIMUM_NODE_VERSION)
        .unwrap_or(false)
}

fn version_tuple(value: &str) -> Option<(u32, u32, u32)> {
    let mut parts = value.split('.');
    Some((
        parts.next()?.parse().ok()?,
        parts.next()?.parse().ok()?,
        parts.next()?.split('-').next()?.parse().ok()?,
    ))
}

fn resolve_npm_for_node(node: &Path) -> Option<PathBuf> {
    if let Ok(value) = env::var("AGENT_CORE_NPM_EXE") {
        let candidate = PathBuf::from(value);
        if candidate.exists() {
            return Some(candidate);
        }
    }
    if let Some(parent) = node.parent() {
        let sibling = parent.join("npm.cmd");
        if sibling.exists() {
            return Some(sibling);
        }
    }
    find_in_path("npm.cmd")
}

fn ensure_node_runtime(root: &Path) -> Result<PathBuf, String> {
    if let Some(node) = resolve_compatible_node(root) {
        return Ok(node);
    }
    install_portable_node(root)
}

fn node_architecture() -> &'static str {
    match env::consts::ARCH {
        "aarch64" => "arm64",
        _ => "x64",
    }
}

fn install_portable_node(root: &Path) -> Result<PathBuf, String> {
    let folder = format!("node-v{PREFERRED_NODE_VERSION}-win-{}", node_architecture());
    let destination = root.join("runtime").join("tools").join(&folder);
    let executable = destination.join("node.exe");
    if executable.exists() && node_version_compatible(&executable) {
        return Ok(executable);
    }
    if env::var("AGENT_CORE_BOOTSTRAP_NO_DOWNLOAD").ok().as_deref() == Some("1") {
        return Err("Compatible Node.js runtime is unavailable and Agent Core bootstrap downloads are disabled".to_string());
    }
    let archive = format!("{folder}.zip");
    let base = format!("https://nodejs.org/dist/v{PREFERRED_NODE_VERSION}");
    install_verified_zip(
        root,
        &format!("{base}/{archive}"),
        &format!("{base}/SHASUMS256.txt"),
        &archive,
        &destination,
        &PathBuf::from(&folder).join("node.exe"),
    )?;
    if !node_version_compatible(&executable) {
        return Err("Downloaded Node.js runtime does not satisfy Agent Core requirements".to_string());
    }
    Ok(executable)
}

fn resolve_existing_tunnel(root: &Path) -> Result<PathBuf, String> {
    resolve_tunnel_runtime(root, env::var_os("AGENT_CORE_TUNNEL_EXE").as_deref())
}

fn resolve_tunnel_runtime(root: &Path, explicit_override: Option<&OsStr>) -> Result<PathBuf, String> {
    let candidate = if let Some(value) = explicit_override {
        let configured = PathBuf::from(value);
        let candidate = if configured.is_absolute() { configured } else { root.join(configured) };
        if value.is_empty() || !is_tunnel_executable(&candidate) {
            return Err("AGENT_CORE_TUNNEL_EXE must identify an existing .exe file; relative paths are resolved from the Agent Core root".to_string());
        }
        candidate
    } else {
        let bundled = root.join("tunnel-client").join("tunnel-client.exe");
        if !is_tunnel_executable(&bundled) {
            return Err("Bundled admin tunnel runtime is missing at tunnel-client/tunnel-client.exe. Rebuild with scripts/tunnel/build-admin-client.ps1, then install its verified candidate at that path, or set AGENT_CORE_TUNNEL_EXE explicitly.".to_string());
        }
        bundled
    };
    Ok(candidate)
}

fn is_tunnel_executable(path: &Path) -> bool {
    path.is_file()
        && path.extension().and_then(OsStr::to_str)
            .map(|extension| extension.eq_ignore_ascii_case("exe"))
            .unwrap_or(false)
}

fn install_verified_zip(
    root: &Path,
    archive_url: &str,
    checksum_url: &str,
    archive_name: &str,
    destination: &Path,
    expected_executable_relative: &Path,
) -> Result<(), String> {
    let bootstrap = root.join("runtime").join("bootstrap");
    let downloads = bootstrap.join("downloads");
    fs::create_dir_all(&downloads)
        .map_err(|error| format!("Failed to create bootstrap download directory: {error}"))?;
    let archive_path = downloads.join(archive_name);

    let client = Client::builder()
        .timeout(Duration::from_secs(180))
        .build()
        .map_err(|error| format!("Failed to initialize downloader: {error}"))?;
    let checksum_text = client
        .get(checksum_url)
        .send()
        .and_then(|response| response.error_for_status())
        .map_err(|error| format!("Failed to download checksum manifest: {error}"))?
        .text()
        .map_err(|error| format!("Failed to read checksum manifest: {error}"))?;
    let expected_hash = checksum_for_file(&checksum_text, archive_name)
        .ok_or_else(|| format!("Checksum entry missing for {archive_name}"))?;
    let bytes = client
        .get(archive_url)
        .send()
        .and_then(|response| response.error_for_status())
        .map_err(|error| format!("Failed to download {archive_name}: {error}"))?
        .bytes()
        .map_err(|error| format!("Failed to read {archive_name}: {error}"))?;
    fs::write(&archive_path, &bytes)
        .map_err(|error| format!("Failed to store {archive_name}: {error}"))?;

    let actual_hash = sha256_bytes(&bytes);
    if !actual_hash.eq_ignore_ascii_case(&expected_hash) {
        return Err(format!("Checksum mismatch for {archive_name}"));
    }

    let staging = bootstrap.join(format!("staging-{}-{}", std::process::id(), now_millis()));
    if staging.exists() {
        let _ = fs::remove_dir_all(&staging);
    }
    fs::create_dir_all(&staging)
        .map_err(|error| format!("Failed to create bootstrap staging directory: {error}"))?;
    extract_zip(&archive_path, &staging)?;

    let expected = staging.join(expected_executable_relative);
    if !expected.exists() {
        let _ = fs::remove_dir_all(&staging);
        return Err(format!(
            "Downloaded archive layout is invalid; missing {}",
            expected_executable_relative.display()
        ));
    }
    if destination.exists() {
        fs::remove_dir_all(destination)
            .map_err(|error| format!("Failed to replace runtime directory: {error}"))?;
    }
    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Failed to create runtime tools directory: {error}"))?;
    }

    let source_dir = if expected_executable_relative.components().count() > 1 {
        expected
            .parent()
            .ok_or_else(|| "Invalid archive layout".to_string())?
            .to_path_buf()
    } else {
        staging.clone()
    };
    fs::rename(&source_dir, destination)
        .map_err(|error| format!("Failed to install downloaded runtime: {error}"))?;
    if staging.exists() {
        let _ = fs::remove_dir_all(&staging);
    }
    Ok(())
}

fn extract_zip(archive_path: &Path, destination: &Path) -> Result<(), String> {
    let file = File::open(archive_path)
        .map_err(|error| format!("Failed to open downloaded archive: {error}"))?;
    let mut archive = ZipArchive::new(file)
        .map_err(|error| format!("Failed to parse downloaded ZIP: {error}"))?;
    for index in 0..archive.len() {
        let mut entry = archive
            .by_index(index)
            .map_err(|error| format!("Failed to read ZIP entry: {error}"))?;
        let enclosed = entry
            .enclosed_name()
            .ok_or_else(|| "ZIP contains an unsafe path".to_string())?;
        let output_path = destination.join(enclosed);
        if entry.is_dir() {
            fs::create_dir_all(&output_path)
                .map_err(|error| format!("Failed to create extracted directory: {error}"))?;
            continue;
        }
        if let Some(parent) = output_path.parent() {
            fs::create_dir_all(parent)
                .map_err(|error| format!("Failed to create extracted parent directory: {error}"))?;
        }
        let mut output = File::create(&output_path)
            .map_err(|error| format!("Failed to create extracted file: {error}"))?;
        std::io::copy(&mut entry, &mut output)
            .map_err(|error| format!("Failed to extract ZIP entry: {error}"))?;
    }
    Ok(())
}

fn checksum_for_file(manifest: &str, filename: &str) -> Option<String> {
    manifest.lines().find_map(|line| {
        let mut parts = line.split_whitespace();
        let hash = parts.next()?;
        let name = parts.next()?.trim_start_matches('*');
        if name == filename && hash.len() == 64 {
            Some(hash.to_string())
        } else {
            None
        }
    })
}

fn sha256_bytes(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    format!("{:x}", hasher.finalize())
}

fn resolve_gh_executable() -> Option<PathBuf> {
    if let Ok(value) = env::var("AGENT_CORE_GH_EXE") {
        let candidate = PathBuf::from(value);
        if candidate.exists() {
            return Some(candidate);
        }
    }
    if let Some(path) = find_in_path("gh.exe") {
        return Some(path);
    }
    env::var_os("ProgramFiles")
        .map(PathBuf::from)
        .map(|path| path.join("GitHub CLI").join("gh.exe"))
        .filter(|path| path.exists())
}

fn run_program(
    executable: &Path,
    args: &[&str],
    cwd: &Path,
    environment: &[(&str, &OsStr)],
) -> Result<Output, String> {
    let extension = executable
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    let mut command = if extension == "cmd" || extension == "bat" {
        let mut script = format!(
            "& {}",
            quote_powershell_literal(executable.to_string_lossy().as_ref())
        );
        for arg in args {
            script.push(' ');
            script.push_str(&quote_powershell_literal(arg));
        }
        script.push_str("; exit $LASTEXITCODE");
        let mut command = hidden_command("powershell.exe");
        command.args(["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", &script]);
        command
    } else {
        let mut command = hidden_command(executable);
        command.args(args);
        command
    };
    command.current_dir(cwd);
    for (name, value) in environment {
        command.env(name, value);
    }
    command
        .output()
        .map_err(|error| format!("Failed to run {}: {error}", executable.display()))
}

fn quote_powershell_literal(value: &str) -> String {
    format!("'{}'", value.replace('\'', "''"))
}

fn open_log_file(path: &Path) -> Result<File, String> {
    OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .map_err(|error| format!("Failed to open log file {}: {error}", path.display()))
}

fn resolve_allowed_roots(root: &Path) -> Vec<String> {
    let mut roots = vec![root.to_string_lossy().to_string()];
    let allowlist = root.join("Agent-Core-Allowlist.txt");
    if let Ok(text) = fs::read_to_string(allowlist) {
        for raw in text.lines() {
            let line = raw.trim();
            if line.is_empty() || line.starts_with('#') || line.contains(';') {
                continue;
            }
            let path = PathBuf::from(line);
            if !path.is_absolute() {
                continue;
            }
            let normalized = path.to_string_lossy().to_string();
            if !roots.iter().any(|existing| existing.eq_ignore_ascii_case(&normalized)) {
                roots.push(normalized);
            }
        }
    }
    roots
}

fn resolve_oauth_protected_resource_url(root: &Path) -> Result<Option<String>, String> {
    if let Ok(value) = env::var("AGENT_CORE_OAUTH_PROTECTED_RESOURCE_URL") {
        let trimmed = value.trim();
        if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
            if !trimmed.contains('@') && !trimmed.contains('?') && !trimmed.contains('#') {
                return Ok(Some(trimmed.to_string()));
            }
        }
        return Err("AGENT_CORE_OAUTH_PROTECTED_RESOURCE_URL is invalid".to_string());
    }
    let profile = root.join("tunnel-client").join("agent-core.yaml");
    let text = match fs::read_to_string(profile) {
        Ok(text) => text,
        Err(_) => return Ok(None),
    };
    for line in text.lines() {
        let trimmed = line.trim();
        if let Some(value) = trimmed.strip_prefix("tunnel_id:") {
            let tunnel_id = value.trim().trim_matches('"').trim_matches('\'');
            let valid = tunnel_id.starts_with("tunnel_")
                && tunnel_id
                    .chars()
                    .all(|ch| ch.is_ascii_alphanumeric() || ch == '_' || ch == '-');
            if !valid {
                return Err("Tunnel profile contains an invalid tunnel_id".to_string());
            }
            return Ok(Some(format!(
                "https://tunnel-service.gateway.unified-0.internal.api.openai.org/v1/mcp/{tunnel_id}"
            )));
        }
    }
    Ok(None)
}

fn http_client(timeout: Duration) -> Option<Client> {
    Client::builder().timeout(timeout).build().ok()
}

fn agent_health_details() -> (bool, String, String) {
    let Some(client) = http_client(Duration::from_secs(2)) else {
        return (false, "Unavailable".to_string(), "Unavailable".to_string());
    };
    let url = format!("http://127.0.0.1:{AGENT_CORE_PORT}/health");
    let response = client.get(url).send().and_then(|response| response.error_for_status());
    let Ok(response) = response else {
        return (false, "Unavailable".to_string(), "Unavailable".to_string());
    };
    let Ok(json) = response.json::<Value>() else {
        return (false, "Unavailable".to_string(), "Unavailable".to_string());
    };
    agent_health_from_json(&json)
}

fn agent_health_from_json(json: &Value) -> (bool, String, String) {
    let healthy = json.get("status").and_then(Value::as_str) == Some("ok");
    let rdc_bridge = json.get("service").and_then(Value::as_str) == Some("agent-core-rdc-bridge")
        && json
            .get("toolSurface")
            .and_then(Value::as_str)
            .map(|value| value.starts_with("desktop-commander-"))
            .unwrap_or(false);
    let memory = if rdc_bridge {
        "Not Used".to_string()
    } else {
        subsystem_health_label(json.get("memory"))
    };
    let execution = if healthy && rdc_bridge {
        "Available".to_string()
    } else {
        subsystem_health_label(json.get("execution"))
    };
    (healthy, memory, execution)
}

fn subsystem_health_label(value: Option<&Value>) -> String {
    let Some(value) = value else {
        return "Unknown".to_string();
    };
    if value.get("enabled").and_then(Value::as_bool) == Some(false) {
        "Disabled".to_string()
    } else if value.get("healthy").and_then(Value::as_bool) == Some(true) {
        "Healthy".to_string()
    } else {
        "Degraded".to_string()
    }
}

fn tunnel_health() -> bool {
    let Some(client) = http_client(Duration::from_secs(2)) else {
        return false;
    };
    let url = format!("http://127.0.0.1:{TUNNEL_PORT}/readyz");
    client
        .get(url)
        .send()
        .map(|response| response.status().is_success())
        .unwrap_or(false)
}

fn port_owner_process(port: u16) -> Result<Option<ProcessInfo>, String> {
    let script = format!(
        "$ErrorActionPreference='Stop'; try {{$c=Get-NetTCPConnection -LocalPort {port} -State Listen -ErrorAction Stop | Select-Object -First 1}} catch {{if($_.FullyQualifiedErrorId -like 'CmdletizationQuery_NotFound*'){{exit 0}} else {{throw}}}}; if($c){{$p=Get-CimInstance Win32_Process -Filter ('ProcessId='+[int]$c.OwningProcess) -ErrorAction Stop; if($p){{$p | Select-Object ProcessId,ExecutablePath,CommandLine | ConvertTo-Json -Compress}} else {{[pscustomobject]@{{ProcessId=[int]$c.OwningProcess;ExecutablePath=$null;CommandLine=$null}} | ConvertTo-Json -Compress}}}}"
    );
    powershell_process_query(&script)
}

fn process_info_by_pid(pid: u32) -> Result<Option<ProcessInfo>, String> {
    let script = format!(
        "$ErrorActionPreference='Stop'; $p=Get-CimInstance Win32_Process -Filter 'ProcessId={pid}' -ErrorAction Stop; if($p){{$p | Select-Object ProcessId,ExecutablePath,CommandLine | ConvertTo-Json -Compress}}"
    );
    powershell_process_query(&script)
}

fn powershell_process_query(script: &str) -> Result<Option<ProcessInfo>, String> {
    let output = hidden_command("powershell.exe")
        .args(["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script])
        .output()
        .map_err(|error| format!("Failed to query Windows process state: {error}"))?;
    if !output.status.success() {
        return Err("Windows process query failed".to_string());
    }
    parse_process_query_output(&String::from_utf8_lossy(&output.stdout))
}

fn parse_process_query_output(output: &str) -> Result<Option<ProcessInfo>, String> {
    let text = output.trim();
    if text.is_empty() {
        return Ok(None);
    }
    serde_json::from_str::<ProcessInfo>(&text)
        .map(Some)
        .map_err(|error| format!("Failed to parse Windows process query: {error}"))
}

fn is_agent_core_identity(process: &ProcessInfo, node: &Path, root: &Path) -> bool {
    let Some((executable, command_line)) = process.identity_fields() else {
        return false;
    };
    if !same_path_str(executable, node) {
        return false;
    }
    let absolute = root.join("dist").join("index.js").to_string_lossy().to_string();
    contains_path_token(command_line, &absolute)
}

fn is_tunnel_identity(process: &ProcessInfo, tunnel: &Path, root: &Path) -> bool {
    let Some((executable, command_line)) = process.identity_fields() else {
        return false;
    };
    if !same_path_str(executable, tunnel) {
        return false;
    }
    let profile = root
        .join("tunnel-client")
        .join("agent-core.yaml")
        .to_string_lossy()
        .to_string();
    command_line.to_ascii_lowercase().contains("--profile-file")
        && contains_path_token(command_line, &profile)
}

fn same_path_str(left: &str, right: &Path) -> bool {
    normalize_path_string(left) == normalize_path_string(right.to_string_lossy().as_ref())
}

fn contains_path_token(command_line: &str, path: &str) -> bool {
    let command = command_line.replace('/', "\\").to_ascii_lowercase();
    let target = normalize_path_string(path);
    command.match_indices(&target).any(|(start, matched)| {
        let before = command[..start].chars().next_back();
        let after = command[start + matched.len()..].chars().next();
        before.map_or(true, |ch| ch == '"' || ch.is_whitespace())
            && after.map_or(true, |ch| ch == '"' || ch.is_whitespace())
    })
}

fn normalize_path_string(value: &str) -> String {
    value
        .replace('/', "\\")
        .trim_matches('"')
        .trim_end_matches('\\')
        .to_ascii_lowercase()
}

fn wait_process_exit(pid: u32, timeout: Duration) -> bool {
    let deadline = SystemTime::now() + timeout;
    loop {
        if matches!(process_info_by_pid(pid), Ok(None)) {
            return true;
        }
        if SystemTime::now() >= deadline {
            return false;
        }
        thread::sleep(Duration::from_millis(100));
    }
}

fn taskkill(pid: u32, force: bool) -> Result<(), String> {
    let mut command = hidden_command("taskkill.exe");
    command.args(["/PID", &pid.to_string(), "/T"]);
    if force {
        command.arg("/F");
    }
    let output = command
        .output()
        .map_err(|error| format!("Failed to terminate process {pid}: {error}"))?;
    if output.status.success() || process_info_by_pid(pid)?.is_none() {
        Ok(())
    } else {
        Err(format!("Windows refused to terminate process {pid}"))
    }
}

fn pack_lock_active(root: &Path) -> Result<bool, String> {
    let path = root.join("runtime").join("transfer").join("pack.lock");
    if !path.exists() {
        return Ok(false);
    }
    let text = fs::read_to_string(&path)
        .map_err(|error| format!("Failed to read Agent Core package lock: {error}"))?;
    let value: Value = match serde_json::from_str(&text) {
        Ok(value) => value,
        Err(_) => return Ok(true),
    };
    let pid = value.get("pid").and_then(Value::as_u64).map(|value| value as u32);
    let machine = value.get("machine").and_then(Value::as_str);
    let Some(pid) = pid else {
        return Ok(true);
    };
    let current_machine = env::var("COMPUTERNAME").unwrap_or_default();
    if let Some(machine) = machine {
        if !machine.eq_ignore_ascii_case(&current_machine) {
            let _ = fs::remove_file(path);
            return Ok(false);
        }
    } else {
        return Ok(true);
    }
    if let Some(process) = process_info_by_pid(pid)? {
        // Keep the lock when CIM cannot establish what the live process is running.
        let Some(command_line) = process.command_line.as_deref().filter(|value| !value.trim().is_empty()) else {
            return Ok(true);
        };
        if command_line.to_ascii_lowercase().contains("agent-core-pack.ps1") {
            return Ok(true);
        }
    }
    let _ = fs::remove_file(path);
    Ok(false)
}

fn task_exists(task_name: &str) -> bool {
    hidden_command("schtasks.exe")
        .args(["/Query", "/TN", task_name, "/FO", "LIST"])
        .output()
        .map(|output| output.status.success())
        .unwrap_or(false)
}

fn delete_task(task_name: &str) {
    let _ = hidden_command("schtasks.exe")
        .args(["/Delete", "/TN", task_name, "/F"])
        .output();
}

fn create_agent_code_autostart_task(executable: &Path) -> Result<(), String> {
    let executable = executable.to_string_lossy().replace('\'', "''");
    let task_name = NATIVE_AUTOSTART_TASK.replace('\'', "''");
    let script = format!(
        "$ErrorActionPreference='Stop'; $currentUser=[Security.Principal.WindowsIdentity]::GetCurrent().Name; $action=New-ScheduledTaskAction -Execute '{executable}' -Argument '--agent-core-background'; $trigger=New-ScheduledTaskTrigger -AtLogOn -User $currentUser; $principal=New-ScheduledTaskPrincipal -UserId $currentUser -LogonType Interactive -RunLevel Limited; Register-ScheduledTask -TaskName '{task_name}' -Action $action -Trigger $trigger -Principal $principal -Force | Out-Null"
    );
    let output = hidden_command("powershell.exe")
        .args(["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", &script])
        .output()
        .map_err(|error| format!("Failed to configure Agent Code autostart: {error}"))?;
    if !output.status.success() {
        let details = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if details.is_empty() {
            format!(
                "Windows Task Scheduler rejected Agent Code autostart with exit code {}",
                output.status.code().unwrap_or(-1)
            )
        } else {
            format!("Windows Task Scheduler rejected Agent Code autostart: {details}")
        });
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rdc_bridge_health_reports_machine_execution_available() {
        let json = serde_json::json!({
            "status": "ok",
            "service": "agent-core-rdc-bridge",
            "toolSurface": "desktop-commander-0.2.50-local"
        });
        let (healthy, memory, execution) = agent_health_from_json(&json);
        assert!(healthy);
        assert_eq!(memory, "Not Used");
        assert_eq!(execution, "Available");
    }

    #[test]
    fn nullable_process_metadata_preserves_pid_without_granting_identity() {
        for fields in [
            r#""ExecutablePath":null,"CommandLine":null"#,
            r#""ExecutablePath":"node.exe","CommandLine":null"#,
            r#""ExecutablePath":null,"CommandLine":"dist/index.js""#,
            r#""ExecutablePath":"","CommandLine":" ""#,
            r#""ExecutablePath":" ","CommandLine":"dist/index.js""#,
        ] {
            let payload = format!(r#"{{"ProcessId":42,{fields}}}"#);
            let process = parse_process_query_output(&payload).unwrap().unwrap();
            assert_eq!(process.process_id, 42);
            assert!(process.identity_fields().is_none());
            assert!(!is_agent_core_identity(&process, Path::new("node.exe"), Path::new("project")));
            assert!(!is_tunnel_identity(&process, Path::new("node.exe"), Path::new("project")));
        }
        let omitted = parse_process_query_output(r#"{"ProcessId":42}"#).unwrap().unwrap();
        assert!(omitted.identity_fields().is_none());
    }

    #[test]
    fn process_query_distinguishes_missing_process_from_invalid_response() {
        assert!(parse_process_query_output(" \r\n").unwrap().is_none());
        for payload in [
            "null", "{}", "[]", "not json",
            r#"{"ProcessId":null}"#,
            r#"{"ProcessId":"42"}"#,
            r#"{"ProcessId":42,"ExecutablePath":123}"#,
            r#"{"ProcessId":42,"CommandLine":false}"#,
        ] {
            assert!(parse_process_query_output(payload).is_err(), "invalid response: {payload}");
        }
    }

    #[test]
    fn process_identity_requires_current_project_entry_and_complete_path_token() {
        let root = std::env::temp_dir().join("agent-core-identity-fixture");
        let node = root.join("runtime").join("node").join("node.exe");
        let entry = root.join("dist").join("index.js");
        let foreign_entry = root.with_file_name("agent-core-foreign-fixture").join("dist").join("index.js");
        let mut process = ProcessInfo {
            process_id: 42,
            executable_path: Some(node.to_string_lossy().to_string()),
            command_line: Some(format!(r#""{}" "{}""#, node.display(), entry.display())),
        };
        assert!(is_agent_core_identity(&process, &node, &root));
        for command in [
            format!(r#"node "{}""#, foreign_entry.display()),
            "node dist/index.js".to_string(),
            format!(r#"node "{}.backup""#, entry.display()),
            format!(r#"node "prefix{}""#, entry.display()),
        ] {
            process.command_line = Some(command.clone());
            assert!(!is_agent_core_identity(&process, &node, &root), "foreign entry: {command}");
        }
        let tunnel = root.join("tunnel-client").join("tunnel-client.exe");
        process.executable_path = Some(tunnel.to_string_lossy().to_string());
        process.command_line = Some(format!(r#""{}" run --profile-file "{}""#, tunnel.display(), root.join("tunnel-client").join("agent-core.yaml").display()));
        assert!(is_tunnel_identity(&process, &tunnel, &root));
        process.command_line = Some(process.command_line.unwrap().replace("agent-core.yaml\"", "agent-core.yaml.other\""));
        assert!(!is_tunnel_identity(&process, &tunnel, &root));
    }

    #[test]
    fn unknown_process_identity_does_not_hide_independent_health_results() {
        let probe = ServiceProbe {
            pid: Some(42), identity_available: false, identity_match: false,
            healthy: true, memory: "Healthy".to_string(), execution: "Healthy".to_string(),
        };
        assert_eq!(display_service_status(&probe, false), "Identity unavailable");
        assert_eq!(probe.memory, "Healthy");
        assert_eq!(probe.execution, "Healthy");
        assert!(!probe.identity_match);
    }

    #[test]
    fn faulted_tunnel_does_not_relabel_a_running_agent_core() {
        let mut state = NativeControllerState::default();
        state.services.insert("agentCore".to_string(), new_service_state(ServiceRole::AgentCore, 1, "started"));
        let mut tunnel = new_service_state(ServiceRole::Tunnel, 0, "watchdog");
        tunnel.health_state = "Faulted".to_string();
        state.services.insert("tunnel".to_string(), tunnel);
        assert!(!service_faulted(&state, ServiceRole::AgentCore));
        assert!(service_faulted(&state, ServiceRole::Tunnel));
        let probe = ServiceProbe {
            pid: Some(42), identity_available: true, identity_match: true,
            healthy: true, memory: "Healthy".to_string(), execution: "Healthy".to_string(),
        };
        assert_eq!(display_service_status(&probe, service_faulted(&state, ServiceRole::AgentCore)), "Running");
    }

    #[cfg(windows)]
    #[test]
    fn windows_query_accepts_cim_null_fields_and_preserves_query_failure() {
        let process = powershell_process_query("[pscustomobject]@{ProcessId=42;ExecutablePath=$null;CommandLine=$null} | ConvertTo-Json -Compress")
            .expect("CIM nulls are valid metadata").expect("PID is still present");
        assert_eq!(process.process_id, 42);
        assert!(process.identity_fields().is_none());
        assert!(powershell_process_query("$ErrorActionPreference='Stop'; throw 'fixture query failure'").is_err());
    }

    #[test]
    fn queued_watchdog_respects_stop_after_acquiring_lifecycle_lock() {
        let root = env::temp_dir().join(format!("agent-code-watchdog-stop-{}", now_millis()));
        let engine = Arc::new(AgentCoreEngine {
            root: root.clone(),
            lifecycle_mutex: Arc::new(Mutex::new(())),
        });
        engine.set_desired_running(true).expect("seed desired running");
        let guard = engine.lifecycle_mutex.lock().expect("hold lifecycle mutation");
        let queued_engine = Arc::clone(&engine);
        let (ready_tx, ready_rx) = std::sync::mpsc::channel();
        let queued = thread::spawn(move || {
            ready_tx.send(()).expect("announce queued watchdog");
            queued_engine.watchdog_tick()
        });
        ready_rx.recv().expect("watchdog scheduled");
        engine.set_desired_running(false).expect("stop while watchdog waits");
        drop(guard);
        queued.join().expect("watchdog thread").expect("stopped watchdog is a no-op");
        engine.start_desired_bundle().expect("startup respects stopped state");
        assert!(!engine.read_state().desired_running);
        assert!(engine.read_state().services.is_empty());
        assert!(!root.join("node_modules").exists());
        fs::remove_dir_all(&root).expect("remove isolated watchdog fixture");
    }

    #[test]
    fn parses_node_version_tuple() {
        assert_eq!(version_tuple("24.16.0"), Some((24, 16, 0)));
        assert_eq!(version_tuple("24.15.0-rc.1"), Some((24, 15, 0)));
        assert!(version_tuple("bad").is_none());
    }

    #[test]
    fn missing_bundled_tunnel_does_not_use_cached_runtime_or_download() {
        let root = env::temp_dir().join(format!("agent-code-tunnel-missing-{}", now_millis()));
        for relative in [
            "tools/tunnel-client/tunnel-client.exe",
            "runtime/tools/tunnel-client-v0.0.13-windows-amd64/tunnel-client.exe",
        ] {
            let file = root.join(relative);
            fs::create_dir_all(file.parent().unwrap()).expect("create unrelated runtime directory");
            fs::write(file, b"unselected runtime").expect("seed unrelated runtime");
        }
        let error = resolve_tunnel_runtime(&root, None).expect_err("require the bundled runtime");
        assert!(error.contains("scripts/tunnel/build-admin-client.ps1"));
        assert!(!root.join("runtime/bootstrap").exists(), "resolution must not begin a download");
        assert!(!root.join("tunnel-client/tunnel-client.exe").exists());
        fs::remove_dir_all(root).expect("remove isolated tunnel fixture");
    }

    #[test]
    fn tunnel_runtime_requires_bundle_or_valid_explicit_override() {
        let root = env::temp_dir().join(format!("agent-code-tunnel-override-{}", now_millis()));
        let bundled = root.join("tunnel-client/tunnel-client.exe");
        fs::create_dir_all(bundled.parent().unwrap()).expect("create bundle directory");
        fs::write(&bundled, b"bundled runtime").expect("seed bundle");
        assert_eq!(resolve_tunnel_runtime(&root, None).unwrap(), bundled);

        let configured = root.join("operator-runtime.EXE");
        fs::write(&configured, b"operator runtime").expect("seed explicit override");
        assert_eq!(resolve_tunnel_runtime(&root, Some(configured.as_os_str())).unwrap(), configured);
        assert_eq!(resolve_tunnel_runtime(&root, Some(OsStr::new("operator-runtime.EXE"))).unwrap(), configured);
        for invalid in [OsStr::new(""), OsStr::new("missing.exe"), OsStr::new("tunnel-client")] {
            let error = resolve_tunnel_runtime(&root, Some(invalid)).expect_err("invalid override must fail explicitly");
            assert!(error.contains("AGENT_CORE_TUNNEL_EXE"));
        }
        fs::remove_dir_all(root).expect("remove isolated tunnel fixture");
    }

    #[test]
    fn relocated_root_preserves_durable_files_and_rebinds_native_state() {
        let root = env::temp_dir().join(format!("agent code relocation {}", now_millis()));
        let engine = AgentCoreEngine {
            root: root.clone(),
            lifecycle_mutex: Arc::new(Mutex::new(())),
        };
        // Stale lifecycle state carried over from the previous root: must be discarded.
        engine.set_desired_running(false).expect("seed native controller state");
        assert!(engine.state_path().exists());
        // Durable state: must survive the move byte-for-byte.
        let durable = [
            "runtime/data/identity.txt",
            "runtime/memory/vault/note.md",
            "runtime/execution/state/run.json",
            "secrets/key.txt",
        ];
        for relative in durable {
            let file = root.join(relative);
            fs::create_dir_all(file.parent().unwrap()).expect("create durable directory");
            fs::write(file, b"preserve exactly").expect("seed durable file");
        }
        let bootstrap = root.join("runtime").join("bootstrap").join("install-state.json");
        fs::create_dir_all(bootstrap.parent().unwrap()).expect("create bootstrap directory");
        let foreign = NativeBootstrapState {
            schema_version: BOOTSTRAP_SCHEMA_VERSION,
            root: root.join("previous-root").to_string_lossy().into_owned(),
            machine: "previous-machine".to_string(),
            user_sid: "previous-user".to_string(),
            architecture: node_architecture().to_string(),
            node_version: "unknown".to_string(),
            updated_at: now_iso_like(),
        };
        fs::write(&bootstrap, serde_json::to_vec(&foreign).unwrap())
            .expect("seed foreign bootstrap state");

        let result = engine.reconcile_bootstrap_state(&root.join("missing-node.exe"));

        let stale_state_exists = engine.state_path().exists();
        let survivors: Vec<(&str, Option<Vec<u8>>)> = durable
            .iter()
            .map(|relative| (*relative, fs::read(root.join(relative)).ok()))
            .collect();
        let rebound = fs::read(&bootstrap)
            .ok()
            .and_then(|text| serde_json::from_slice::<NativeBootstrapState>(&text).ok());
        let _ = fs::remove_dir_all(&root);

        result.expect("rebind relocated root");
        assert!(!stale_state_exists, "stale controller state must be discarded on relocation");
        for (relative, content) in survivors {
            assert_eq!(
                content,
                Some(b"preserve exactly".to_vec()),
                "{relative} must survive relocation intact"
            );
        }
        let rebound = rebound.expect("bootstrap state must be rewritten");
        assert!(same_path_str(&rebound.root, &root));
    }

    #[test]
    fn resolves_checksum_manifest_entry() {
        let manifest = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa  first.zip\nbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb *target.zip\n";
        assert_eq!(
            checksum_for_file(manifest, "target.zip"),
            Some("bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb".to_string())
        );
    }

    #[test]
    fn allowed_roots_always_begin_with_root() {
        let root = PathBuf::from(r"D:\Agent-Core");
        let roots = resolve_allowed_roots(&root);
        assert_eq!(roots.first().map(String::as_str), Some(r"D:\Agent-Core"));
    }
    #[test]
    fn app_launch_rearms_desired_running_without_starting_services() {
        let root = env::temp_dir().join(format!("agent code launch rearm {}", now_millis()));
        let engine = AgentCoreEngine {
            root: root.clone(),
            lifecycle_mutex: Arc::new(Mutex::new(())),
        };
        engine.set_desired_running(false).expect("seed stopped state");

        engine
            .request_running_on_app_launch()
            .expect("rearm desired-running on app launch");

        let state = engine.read_state();
        let _ = fs::remove_dir_all(&root);
        assert!(state.desired_running);
        assert!(state.services.is_empty());
    }

    #[test]
    fn run_program_executes_cmd_from_path_with_spaces() {
        let dir = env::temp_dir().join(format!("agent code cmd test {}", now_millis()));
        fs::create_dir_all(&dir).expect("create temp cmd directory");
        let script = dir.join("probe.cmd");
        fs::write(&script, "@echo off\r\necho ok\r\n").expect("write probe cmd");
        let output = run_program(&script, &[], &dir, &[]).expect("run probe cmd");
        let _ = fs::remove_dir_all(&dir);
        assert!(
            output.status.success(),
            "cmd helper failed: {}",
            String::from_utf8_lossy(&output.stderr)
        );
        assert!(String::from_utf8_lossy(&output.stdout).contains("ok"));
    }
}
