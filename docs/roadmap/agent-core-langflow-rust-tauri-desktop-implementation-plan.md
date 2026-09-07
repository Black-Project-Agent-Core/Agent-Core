# Agent Core Langflow Rust/Tauri Desktop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the cloned Langflow 1.12.0 source into a private Windows desktop application with one visible `.exe`, a Rust/Tauri + WebView2 shell, a supervised local Python Langflow backend, tray lifecycle control, local/private defaults, and a bounded future Agent Core integration.

**Architecture:** Keep Langflow's Python backend and React/Vite frontend as the flow engine and visual canvas. Add a Tauri 2 desktop boundary under `SubProject/langflow/desktop` that owns Windows process lifecycle, local port selection, startup health checks, tray behavior, runtime provisioning, logging, and shutdown. Agent Core remains an independent authority for memory, capability routing, execution, continuity, and auditing; the desktop shell and Langflow consume Agent Core through an explicit loopback bridge instead of embedding Agent Core internals into Langflow.

**Tech Stack:** Rust stable, Cargo, Tauri 2, Microsoft Edge WebView2, Windows 10/11 x64, Node.js >=20.19.0, React/Vite Langflow frontend 1.12.0, Python >=3.10,<3.15, `uv`, SQLite for local Langflow state, PowerShell 5.1+ for Windows build/provisioning scripts.

**Spec:** `SubProject/langflow/DEVELOPMENT.md`, `SubProject/langflow/docs/docs/Develop/environment-variables.mdx`, `SubProject/langflow/docs/docs/Support/troubleshooting.mdx`, and the architecture/constraints in this plan. The cloned Langflow documentation already describes Langflow Desktop as Tauri-based; this plan creates our private source-controlled desktop boundary rather than modifying the removed MSI installation.

## Current Verified Baseline

- Langflow source: `F:\Projects\Agent-Core\SubProject\langflow`.
- Source version: `1.12.0`.
- Baseline branch: `main`.
- Baseline HEAD: `e3abffc1b8da1e38cc2f21a9cf1b23b4a21c15d5`.
- Python source environment exists at `SubProject/langflow/.venv`.
- Frontend production build exists at `SubProject/langflow/src/frontend/build`.
- Source runtime has already passed `HTTP 200 {"status":"ok"}` on `127.0.0.1:7860`.
- Anonymous usage telemetry is already disabled in the current source runtime with `DO_NOT_TRACK` / `LANGFLOW_DO_NOT_TRACK`.
- The removed official MSI/Desktop installation is not a dependency of this plan.

## Global Constraints

- Do not restore or depend on the removed Langflow MSI installation.
- Preserve the cloned Langflow Git history and keep upstream-compatible source changes small and isolated.
- Do not rewrite the Langflow Python engine in Rust or C++ in v1.
- Rust owns desktop lifecycle; Python owns Langflow application behavior; Agent Core owns Agent Core memory/execution authority.
- Bind the Langflow backend to loopback only by default: `127.0.0.1`.
- Never expose the backend to LAN/Internet unless a later explicit configuration enables it.
- Never hard-code the final application to drive `F:`. Development may use an F-drive override, but packaged runtime paths must be resolved from configuration/application data roots.
- Do not give the Langflow web page unrestricted native Tauri IPC access. The local web UI must not automatically inherit filesystem/process privileges from the desktop shell.
- `Close Completely` must terminate the supervised Langflow backend. `Hide to Tray` must keep the backend alive. Normal minimize behavior must remain normal minimize behavior.
- Private defaults must include telemetry off, system-browser auto-open off, and uncontrolled external model-catalog refresh off unless explicitly enabled.
- The first stable desktop milestone must work when Agent Core is unavailable. Agent Core connectivity is additive, not required for Langflow startup.
- Preserve MIT license/copyright notices for Langflow-derived source.
- No remote Git mutation is part of implementation unless separately requested.
- Do not declare the desktop build stable from compilation alone; stable requires lifecycle, health, persistence, tray, restart, and clean-exit acceptance gates.

## Target Repository Structure

The desktop boundary should be additive and concentrated in one directory so future upstream merges do not spread Tauri-specific changes across Langflow.

```text
SubProject/langflow/
├── desktop/
│   ├── package.json
│   ├── README.md
│   ├── ui/
│   │   ├── index.html
│   │   ├── loading.js
│   │   └── loading.css
│   ├── config/
│   │   └── private-defaults.env
│   ├── scripts/
│   │   ├── build-desktop.ps1
│   │   ├── provision-runtime.ps1
│   │   └── smoke-desktop.ps1
│   └── src-tauri/
│       ├── Cargo.toml
│       ├── Cargo.lock
│       ├── build.rs
│       ├── tauri.conf.json
│       ├── capabilities/
│       │   └── default.json
│       ├── icons/
│       ├── src/
│       │   ├── main.rs
│       │   ├── lib.rs
│       │   ├── app_paths.rs
│       │   ├── backend.rs
│       │   ├── health.rs
│       │   ├── port.rs
│       │   ├── process.rs
│       │   ├── tray.rs
│       │   ├── private_mode.rs
│       │   └── agent_core.rs
│       └── tests/
│           ├── path_policy.rs
│           ├── port_selection.rs
│           ├── backend_lifecycle.rs
│           ├── private_mode.rs
│           └── agent_core_bridge.rs
├── src/frontend/
├── src/backend/
├── src/lfx/
└── ...
```

Only private-mode requirements that cannot be enforced safely from the Rust child-process environment may modify Langflow source outside `desktop/`. Such modifications must have focused upstream-style tests.

---

## Phase A — Desktop Shell and Existing Source Runtime

### Task 1: Freeze the pre-desktop baseline

**Files:**
- Create: `SubProject/langflow/desktop/README.md`
- Test evidence only: existing `SubProject/langflow/.venv`, `SubProject/langflow/src/frontend/build`

**Interfaces:**
- Consumes: current Langflow source checkout and production frontend build.
- Produces: a written baseline contract that later tasks can compare against.

- [ ] **Step 1: Record current branch, HEAD, source version, Python version, frontend build presence, and `git status --short`.**

Run from `SubProject/langflow`:

```powershell
git branch --show-current
git rev-parse HEAD
.\.venv\Scripts\python.exe --version
.\.venv\Scripts\python.exe -c "import langflow; print(langflow.__version__)"
Test-Path .\src\frontend\build\index.html
git status --short
```

Expected: branch `main`, HEAD `e3abffc1b8da1e38cc2f21a9cf1b23b4a21c15d5`, Langflow `1.12.0`, frontend index present, and no unexplained source modifications.

- [ ] **Step 2: Add the verified baseline and desktop boundary rules to `desktop/README.md`.**

The README must explicitly state that `desktop/` is a private additive boundary, the MSI install is not used, and Langflow's web/backend engine remains Python/React.

- [ ] **Step 3: Re-run the baseline commands and verify creating documentation alone did not change application behavior.**

- [ ] **Step 4: Commit only if the user explicitly requests local commits.**

Suggested commit message if authorized:

```text
chore(desktop): record source desktop baseline
```

### Task 2: Scaffold the Tauri 2 Windows shell

**Files:**
- Create: `SubProject/langflow/desktop/package.json`
- Create: `SubProject/langflow/desktop/ui/index.html`
- Create: `SubProject/langflow/desktop/ui/loading.js`
- Create: `SubProject/langflow/desktop/ui/loading.css`
- Create: `SubProject/langflow/desktop/src-tauri/Cargo.toml`
- Create: `SubProject/langflow/desktop/src-tauri/build.rs`
- Create: `SubProject/langflow/desktop/src-tauri/tauri.conf.json`
- Create: `SubProject/langflow/desktop/src-tauri/capabilities/default.json`
- Create: `SubProject/langflow/desktop/src-tauri/src/main.rs`
- Create: `SubProject/langflow/desktop/src-tauri/src/lib.rs`

**Interfaces:**
- Produces: a Tauri application that opens a local loading shell without starting Langflow yet.
- Native application identifier: `com.blackprojectagentcore.langflowprivate`.
- Working product name: `Langflow Private Desktop`. This is a technical working name, not a claim of original Langflow authorship.

- [ ] **Step 1: Write a Rust smoke test that initializes desktop configuration without creating a backend process.**

Test target: `desktop/src-tauri/tests/path_policy.rs` initially verifies the crate loads and the application identifier/data-root resolver is available.

- [ ] **Step 2: Run `cargo test` and verify the test fails before the desktop crate exists.**

- [ ] **Step 3: Create the minimal Tauri 2 crate and static loading UI.**

`desktop/package.json` scripts must expose:

```json
{
  "scripts": {
    "tauri": "tauri",
    "dev": "tauri dev",
    "build": "tauri build"
  }
}
```

The Tauri window must initially load `desktop/ui/index.html`; it must not open Chrome/Edge as a separate browser window.

- [ ] **Step 4: Run the shell with no Langflow integration and verify one native window appears.**

- [ ] **Step 5: Run `cargo test` and verify the scaffold test passes.**

### Task 3: Implement deterministic application/data path policy

**Files:**
- Create: `SubProject/langflow/desktop/src-tauri/src/app_paths.rs`
- Create: `SubProject/langflow/desktop/src-tauri/tests/path_policy.rs`
- Create: `SubProject/langflow/desktop/config/private-defaults.env`

**Interfaces:**

```rust
pub struct AppPaths {
    pub app_data: PathBuf,
    pub config_dir: PathBuf,
    pub logs_dir: PathBuf,
    pub cache_dir: PathBuf,
    pub runtime_dir: PathBuf,
}

pub fn resolve_app_paths(override_root: Option<PathBuf>) -> Result<AppPaths, PathError>;
```

Path precedence:
1. Explicit process/config override `AGENT_CORE_LANGFLOW_DATA_ROOT`.
2. Tauri-resolved per-user application-data root for packaged builds.
3. Fail closed if neither can be resolved.

- [ ] **Step 1: Write failing tests for default path resolution, explicit F-drive development override, invalid/unwritable root, and directory separation.**

- [ ] **Step 2: Implement `resolve_app_paths` without hard-coded drive letters.**

- [ ] **Step 3: Create directories lazily only during application startup, never during pure resolver tests.**

- [ ] **Step 4: Verify development can use:**

```text
F:\Projects\Agent-Core\SubProject\.runtime\langflow-desktop
```

through configuration, while packaged code remains portable.

- [ ] **Step 5: Run focused Rust tests and confirm all path-policy cases pass.**

---

## Phase B — Rust Backend Supervisor

### Task 4: Implement loopback port selection

**Files:**
- Create: `SubProject/langflow/desktop/src-tauri/src/port.rs`
- Create: `SubProject/langflow/desktop/src-tauri/tests/port_selection.rs`

**Interfaces:**

```rust
pub fn select_loopback_port(preferred: u16, scan_end: u16) -> Result<u16, PortError>;
```

Policy: prefer `7860`, then scan `7861..=7890`, loopback only.

- [ ] **Step 1: Write tests proving `7860` is selected when free, a used port is skipped, and exhaustion fails clearly.**
- [ ] **Step 2: Implement selection with `TcpListener` probes bound to `127.0.0.1`.**
- [ ] **Step 3: Add a startup log line recording the selected port without credentials or secrets.**
- [ ] **Step 4: Run tests repeatedly to detect flaky port-race behavior.**

### Task 5: Implement backend process construction and hidden Windows launch

**Files:**
- Create: `SubProject/langflow/desktop/src-tauri/src/process.rs`
- Create: `SubProject/langflow/desktop/src-tauri/src/private_mode.rs`
- Create: `SubProject/langflow/desktop/src-tauri/tests/private_mode.rs`

**Interfaces:**

```rust
pub struct BackendLaunchSpec {
    pub python_exe: PathBuf,
    pub frontend_path: PathBuf,
    pub port: u16,
    pub paths: AppPaths,
}

pub fn build_backend_command(spec: &BackendLaunchSpec) -> Result<std::process::Command, LaunchError>;
```

The command must launch the equivalent of:

```text
python.exe -m langflow run --host 127.0.0.1 --port <selected> --frontend-path <frontend-build> --no-open-browser
```

Required child environment defaults:

```text
DO_NOT_TRACK=true
LANGFLOW_DO_NOT_TRACK=true
LANGFLOW_OPEN_BROWSER=false
LANGFLOW_HOST=127.0.0.1
LANGFLOW_PORT=<selected>
LANGFLOW_CONFIG_DIR=<resolved config dir>
LANGFLOW_SAVE_DB_IN_CONFIG_DIR=true
LANGFLOW_LOG_FILE=<resolved logs dir>\langflow.log
LANGFLOW_MODELS_DEV_REFRESH=false
```

- [ ] **Step 1: Write tests that inspect the generated command/env without spawning Python.**
- [ ] **Step 2: Implement `build_backend_command`.**
- [ ] **Step 3: On Windows set `CREATE_NO_WINDOW` for the backend process so no console window flashes during normal launch.**
- [ ] **Step 4: Verify secrets are never serialized into desktop startup logs.**
- [ ] **Step 5: Run private-mode and command-construction tests.**

### Task 6: Implement health-driven backend lifecycle supervision

**Files:**
- Create: `SubProject/langflow/desktop/src-tauri/src/health.rs`
- Create: `SubProject/langflow/desktop/src-tauri/src/backend.rs`
- Create: `SubProject/langflow/desktop/src-tauri/tests/backend_lifecycle.rs`

**Interfaces:**

```rust
pub enum BackendState {
    Stopped,
    Starting,
    Healthy { port: u16 },
    Unhealthy { reason: String },
    Stopping,
}

pub struct BackendSupervisor { /* private fields */ }

impl BackendSupervisor {
    pub async fn start(&self) -> Result<BackendState, BackendError>;
    pub async fn restart(&self) -> Result<BackendState, BackendError>;
    pub async fn stop(&self) -> Result<(), BackendError>;
    pub async fn state(&self) -> BackendState;
}
```

Health endpoint: `GET http://127.0.0.1:<port>/health`, success only on HTTP 200 with status `ok`.

- [ ] **Step 1: Write failing tests using a disposable child process/test HTTP server for healthy startup, startup timeout, child crash, restart, and stop.**
- [ ] **Step 2: Implement explicit state transitions and bounded startup retries.**
- [ ] **Step 3: Ensure `stop()` kills only the child process tree owned by this desktop instance, never arbitrary processes merely using the same port.**
- [ ] **Step 4: Ensure abnormal desktop termination cannot leave a normally started child intentionally detached. Use a Windows Job Object or equivalent owned-process-tree strategy.**
- [ ] **Step 5: Run lifecycle tests and verify no owned child remains after the suite.**

### Task 7: Integrate supervisor with the Tauri loading window

**Files:**
- Modify: `SubProject/langflow/desktop/src-tauri/src/lib.rs`
- Modify: `SubProject/langflow/desktop/ui/loading.js`
- Modify: `SubProject/langflow/desktop/ui/index.html`

**Interfaces:**
- Rust launches backend during setup.
- Loading UI remains visible while state is `Starting`.
- After health passes, the WebView navigates to `http://127.0.0.1:<selected-port>/`.

Security rule: the Langflow page loaded over loopback HTTP must not receive unrestricted Tauri native IPC permissions.

- [ ] **Step 1: Add a failing integration smoke check proving the initial page is the local loading shell and navigation happens only after `/health` succeeds.**
- [ ] **Step 2: Wire Tauri startup to `BackendSupervisor::start`.**
- [ ] **Step 3: Navigate the WebView to the Langflow loopback URL only after health success.**
- [ ] **Step 4: If startup fails, keep the native shell open and show a bounded error state with `Retry` and `Open Logs`; do not open a terminal.**
- [ ] **Step 5: Verify Langflow frontend/API work same-origin because the Python backend serves the built frontend.**

---

## Phase C — Windows Tray and Lifecycle UX

### Task 8: Implement tray lifecycle and close semantics

**Files:**
- Create: `SubProject/langflow/desktop/src-tauri/src/tray.rs`
- Modify: `SubProject/langflow/desktop/src-tauri/src/lib.rs`

**Interfaces:**
Tray actions:
- `Open Langflow`
- `Backend Status`
- `Restart Backend`
- `Hide to Tray`
- `Close Completely`

Window behavior:
- Minimize button: normal Windows minimize behavior.
- Close button: show two explicit choices: `Hide to Tray` and `Close Completely`.
- `Hide to Tray`: hide window, keep backend alive.
- `Close Completely`: stop backend/process tree, then exit desktop process.

- [ ] **Step 1: Write lifecycle tests against a mocked supervisor proving hide does not call `stop()` and full close does.**
- [ ] **Step 2: Implement tray menu and window visibility commands.**
- [ ] **Step 3: Implement close interception without changing minimize semantics.**
- [ ] **Step 4: Verify `Restart Backend` performs a health-checked stop/start cycle and the WebView reloads the new loopback URL if the port changes.**
- [ ] **Step 5: Manual Windows acceptance: hide/open repeatedly, then full close and verify no Langflow Python process remains.**

---

## Phase D — Reproducible Python Runtime Provisioning

### Task 9: Separate development runtime from packaged runtime

**Files:**
- Create: `SubProject/langflow/desktop/scripts/provision-runtime.ps1`
- Modify: `SubProject/langflow/desktop/src-tauri/src/app_paths.rs`
- Modify: `SubProject/langflow/desktop/src-tauri/src/process.rs`
- Modify: `SubProject/langflow/desktop/README.md`

**Interfaces:**
Two explicit runtime modes:

```text
Development:
  SubProject/langflow/.venv/Scripts/python.exe

Packaged/private runtime:
  <app-data>/runtime/python + <app-data>/runtime/venv
```

Provisioning uses `uv`; it must never install Langflow globally.

- [ ] **Step 1: Write a PowerShell contract test that provisions into a temporary directory and verifies system Python/global site-packages are unchanged.**
- [ ] **Step 2: Make `provision-runtime.ps1` verify `uv`, install/manage a supported Python under the application data root, create a private venv, and install the local Langflow source build into that venv.**
- [ ] **Step 3: Pin the runtime from the source lock/build metadata rather than `pip install langflow latest`. The packaged app must run the private fork version it was built with.**
- [ ] **Step 4: Write a runtime manifest containing Langflow version, source commit, Python version, and provisioning schema version.**
- [ ] **Step 5: On later launches skip provisioning only when manifest + executable + `python -c "import langflow"` verification all pass.**
- [ ] **Step 6: Corrupt the temporary venv deliberately and verify the provisioning path repairs only its owned runtime directory.**

### Task 10: Bundle or acquire `uv` deterministically

**Files:**
- Create: `SubProject/langflow/desktop/scripts/build-desktop.ps1`
- Modify: `SubProject/langflow/desktop/src-tauri/tauri.conf.json`
- Modify: `SubProject/langflow/desktop/scripts/provision-runtime.ps1`

**Interfaces:**
- Development may use `SubProject/.tools/uv` when explicitly configured.
- Release staging must contain a verified `uv.exe` owned by the desktop build or fail with a clear actionable error.

- [ ] **Step 1: Add checksum verification for the staged `uv.exe`; never silently execute an unverified downloaded binary.**
- [ ] **Step 2: Configure Tauri resources so release builds can locate the staged `uv.exe` without relying on global PATH.**
- [ ] **Step 3: Verify a clean-user simulation with `uv` removed from PATH can still provision the private runtime from the staged tool.**
- [ ] **Step 4: Verify provisioning failure leaves the prior healthy runtime intact and writes a diagnostic log.**

---

## Phase E — Private Mode Hardening

### Task 11: Formalize private defaults as code, not user convention

**Files:**
- Modify: `SubProject/langflow/desktop/config/private-defaults.env`
- Modify: `SubProject/langflow/desktop/src-tauri/src/private_mode.rs`
- Test: `SubProject/langflow/desktop/src-tauri/tests/private_mode.rs`

**Interfaces:**

```rust
pub fn private_environment(paths: &AppPaths, port: u16) -> Vec<(OsString, OsString)>;
```

Mandatory defaults:
- telemetry disabled;
- browser auto-open disabled;
- backend loopback-only;
- database/config/log roots private to the application;
- `models.dev` background refresh disabled by default;
- no automatic Agent Core connection to non-loopback endpoints;
- no secret values written to logs.

- [ ] **Step 1: Write tests for every mandatory environment variable and loopback invariant.**
- [ ] **Step 2: Implement the environment policy centrally; do not scatter private defaults across unrelated modules.**
- [ ] **Step 3: Add a diagnostic command that prints only non-secret effective policy keys for troubleshooting.**
- [ ] **Step 4: Run the desktop and confirm the Langflow startup banner reports anonymous usage data is not collected.**

### Task 12: Move Langflow's models.dev disk cache under explicit private cache control

**Files:**
- Modify: `SubProject/langflow/src/lfx/src/lfx/base/models/models_dev_catalog.py`
- Modify/Create test in: `SubProject/langflow/src/lfx/tests/unit/base/models/test_models_dev_catalog.py`

**Interfaces:**
Add a Langflow-private override:

```text
LANGFLOW_CACHE_DIR=<absolute cache root>
```

Resolution policy:
1. `LANGFLOW_CACHE_DIR` when set.
2. Existing `platformdirs.user_cache_dir("langflow", "langflow")` behavior otherwise.

- [ ] **Step 1: Write a failing Python test proving `LANGFLOW_CACHE_DIR` controls `models_dev/snapshot.json` location.**
- [ ] **Step 2: Implement the smallest source change in `_snapshot_dir()` while preserving upstream default behavior.**
- [ ] **Step 3: Run focused LFX model-catalog tests.**
- [ ] **Step 4: Launch desktop with `LANGFLOW_CACHE_DIR=<AppPaths.cache_dir>` and verify no new `models_dev` cache is created in unrelated LocalAppData locations.**

---

## Phase F — Agent Core Bridge Boundary

### Task 13: Add Agent Core connection state without making it a startup dependency

**Files:**
- Create: `SubProject/langflow/desktop/src-tauri/src/agent_core.rs`
- Create: `SubProject/langflow/desktop/src-tauri/tests/agent_core_bridge.rs`
- Modify: `SubProject/langflow/desktop/src-tauri/src/lib.rs`

**Interfaces:**

```rust
pub enum AgentCoreState {
    Disabled,
    Disconnected,
    Healthy,
    Degraded { reason: String },
}

pub struct AgentCoreEndpoint {
    pub base_url: Url,
}

pub async fn probe_agent_core(endpoint: &AgentCoreEndpoint) -> AgentCoreState;
```

Rules:
- No hard-coded Agent Core port.
- Default endpoint must be loopback or disabled.
- Agent Core authentication material must come from the existing Agent Core secret/config boundary, never be copied into Langflow flow JSON.
- Langflow Desktop must remain usable when Agent Core is offline.

- [ ] **Step 1: Write tests for disabled, healthy loopback, connection refused, timeout, and non-loopback rejection.**
- [ ] **Step 2: Implement read-only health probing first. No execution capability is exposed in this task.**
- [ ] **Step 3: Surface connection state in tray/status diagnostics only.**
- [ ] **Step 4: Verify Agent Core shutdown does not crash Langflow Desktop or terminate the Langflow backend.**

### Task 14: Define the Langflow-to-Agent-Core capability contract

**Files:**
- Create: `SubProject/langflow/desktop/AGENT_CORE_BRIDGE.md`
- Create later implementation root: `SubProject/langflow/src/bundles/agent_core/`

**Interfaces:**
The first bridge contract may expose only bounded Agent Core operations already governed by Agent Core's own routing/authorization layer:

```text
health/status
memory recall
memory commit/revise
capability route
file read/search
explicit command/process execution
continuity checkpoint/status
execution DAG submit/status/log refs
```

The Langflow side must never bypass Agent Core route contexts or destructive gates.

- [ ] **Step 1: Document request/response boundaries, authentication handling, route-context lifecycle, timeout behavior, and secret redaction.**
- [ ] **Step 2: Explicitly document that Agent Core remains the authority and Langflow is a client/visual orchestration surface.**
- [ ] **Step 3: Define failure behavior: rejected capability, expired route, disconnected Agent Core, and partial execution must remain visible rather than being silently converted to success.**
- [ ] **Step 4: Gate creation of actual Agent Core Langflow nodes behind approval of this contract and passing read-only connectivity tests.**

### Task 15: Add the first read-only Agent Core Langflow bundle

**Files:**
- Create: `SubProject/langflow/src/bundles/agent_core/pyproject.toml`
- Create: `SubProject/langflow/src/bundles/agent_core/src/lfx_agent_core/__init__.py`
- Create: `SubProject/langflow/src/bundles/agent_core/src/lfx_agent_core/health.py`
- Create: `SubProject/langflow/src/bundles/agent_core/src/lfx_agent_core/memory_recall.py`
- Create: `SubProject/langflow/src/bundles/agent_core/tests/test_health.py`
- Create: `SubProject/langflow/src/bundles/agent_core/tests/test_memory_recall.py`
- Modify: root `pyproject.toml` workspace/bundle declarations only after focused bundle tests pass.

**Interfaces:**
First bundle is read-only: `Agent Core Health` and `Memory Recall`. Command execution is not introduced in the first bridge milestone.

- [ ] **Step 1: Write failing component tests using a local fake Agent Core endpoint.**
- [ ] **Step 2: Implement health and recall components with explicit timeout and route/auth errors.**
- [ ] **Step 3: Register the bundle in the workspace using the same bounded dependency pattern as existing LFX bundles.**
- [ ] **Step 4: Build a simple flow using `Agent Core Health` and verify it can render successful and disconnected states without leaking credentials.**
- [ ] **Step 5: Only after this milestone is stable may write/execute Agent Core components be planned separately.**

---

## Phase G — Portable `.exe` Build and Stability Gate

### Task 16: Produce a Windows release executable without MSI dependency

**Files:**
- Modify: `SubProject/langflow/desktop/src-tauri/tauri.conf.json`
- Modify: `SubProject/langflow/desktop/scripts/build-desktop.ps1`
- Create output staging root: `SubProject/langflow/desktop/dist/portable/` (generated, ignored by Git)

**Interfaces:**
Primary v1 deliverable:

```text
desktop/dist/portable/
├── Langflow Private Desktop.exe
└── resources/
```

The application is one visible user-launched `.exe`; internal runtime/resources may remain as an owned folder. A truly single-file offline binary is explicitly not required for v1 because Langflow's Python dependency graph is large and dynamic.

- [ ] **Step 1: Configure Tauri Windows release metadata, icon resources, and WebView2 runtime mode.**
- [ ] **Step 2: Make `build-desktop.ps1` run frontend build, Rust tests, Python focused tests, Tauri release build, and portable staging in a fixed order.**
- [ ] **Step 3: Do not require creation/installation of an MSI. The release `.exe` must be runnable from the portable staging directory.**
- [ ] **Step 4: Write build metadata containing source HEAD and Langflow version next to the release artifact.**
- [ ] **Step 5: Launch the staged `.exe` from a path containing spaces and verify path resolution remains correct.**

### Task 17: End-to-end desktop acceptance matrix

**Files:**
- Create: `SubProject/langflow/desktop/scripts/smoke-desktop.ps1`
- Update: `SubProject/langflow/desktop/README.md`

**Acceptance scenarios:**

1. Fresh launch with no backend running.
2. Preferred port `7860` already occupied.
3. Hide to tray and reopen.
4. Normal minimize and restore.
5. Backend restart from tray.
6. Full exit and child-process cleanup.
7. Backend crash and bounded recovery/error display.
8. Existing Langflow database persists across desktop restart.
9. Private-mode telemetry/model-refresh defaults remain enforced.
10. Agent Core disabled/offline does not block Langflow.
11. Agent Core read-only health probe succeeds when configured.
12. No system browser or terminal is spawned during normal use.

- [ ] **Step 1: Automate process/health/log checks in `smoke-desktop.ps1` wherever deterministic.**
- [ ] **Step 2: Run the complete matrix from the portable staging directory.**
- [ ] **Step 3: Verify after `Close Completely` there is no owned Python Langflow backend and no stale runtime PID state.**
- [ ] **Step 4: Verify `git status --short` contains only intended source changes and no generated runtime/build artifacts.**
- [ ] **Step 5: Record exact test/build/health evidence before using the word `stable`.**

## Stable v1 Definition

The desktop derivative may be declared **stable v1** only when all of the following are factual:

- Rust/Tauri release build succeeds from a clean development shell.
- A user launches Langflow through a Windows `.exe`, not through a browser command or MSI installation.
- WebView2 displays the Langflow UI inside the native application window.
- The Rust supervisor starts the private Python backend without a visible console.
- `/health` returns HTTP 200 before the UI is considered ready.
- Port conflict fallback works.
- Database/config/log paths are deterministic and owned by the application.
- Telemetry and uncontrolled model-catalog refresh are disabled by default.
- Hide-to-tray keeps the backend alive.
- Close-completely terminates the backend/process tree.
- Backend restart is health-checked.
- Data persists across restart.
- Agent Core absence does not break normal Langflow startup.
- Read-only Agent Core bridge, if enabled in v1, fails closed and does not bypass Agent Core routing/authentication.
- No secrets appear in desktop logs, flow JSON, or diagnostic output.
- Generated build/runtime artifacts are excluded from source commits.

## Explicitly Deferred Beyond Stable v1

These are separate future plans, not prerequisites for the first stable desktop executable:

- Rewriting the Langflow backend in Rust or C++.
- A truly single-file, fully offline binary containing the entire Python dependency graph.
- Automatic LAN/Internet exposure of Langflow or Agent Core.
- Unrestricted Tauri IPC from the Langflow web page.
- Self-updating production releases.
- Agent Core command/process write nodes before the read-only bridge contract is proven stable.
- AI self-modification of the Langflow graph.
- Public rebranding/distribution or marketplace packaging.

## Recommended Execution Order

```text
A1 baseline
  ↓
A2 Tauri shell
  ↓
A3 path policy
  ↓
B4 port selection
  ↓
B5 process/private command
  ↓
B6 supervisor
  ↓
B7 WebView navigation
  ↓
C8 tray lifecycle
  ↓
D9-D10 private Python runtime provisioning
  ↓
E11-E12 private-mode hardening
  ↓
G16 portable EXE
  ↓
G17 stability matrix
  ↓
STABLE DESKTOP BASELINE
  ↓
F13-F15 Agent Core read-only bridge
  ↓
SECOND STABILITY GATE
```

This order deliberately proves the desktop application independently before Agent Core integration. If the bridge causes a regression, the stable desktop baseline remains available and Agent Core can be repaired without destabilizing Langflow's core desktop lifecycle.
