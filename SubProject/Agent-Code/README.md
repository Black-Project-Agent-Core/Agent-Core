# Agent Code

Agent Code is a Windows-oriented desktop coding-agent shell. The application keeps the premium **Focused Console** interface and deterministic local workspace/session state, while its Tauri boundary now also owns the native Agent Core launcher/control surface.

Real coding-agent execution, editor/file-agent actions, model execution, conversation persistence, and synthetic AI responses are still outside this milestone. The native backend added here is deliberately scoped to Agent Core bootstrap, lifecycle, health, watchdog, OAuth reset, tunnel control, and Windows autostart.

## Development

```bash
npm run dev
npm test
npm run typecheck
npm run build
npm run test:tauri-contract
npm run test:visual
```

The Vite development server listens on port `1420` because that is the URL configured for the Tauri development shell.

## Native Agent Core controller

The sidebar contains an expandable **Agent Core** control surface that replaces the old launcher/tray workflow as the long-term runtime controller. Agent Code does **not** invoke `Start-Agent-Core.bat`.

The Tauri/Rust backend provides:

- Agent Core MCP, Memory, Execution, and Tunnel status
- native bootstrap checks for Node.js, npm, and tunnel-client
- checksum-verified portable Node.js/tunnel-client fallback installation
- Agent Core dependency restore and production build when startup repair is required
- MCP server and tunnel process startup with canonical environment configuration
- safe process/port identity checks before adoption or termination
- restart Agent Core, restart tunnel, and restart all
- OAuth reset/re-auth preparation while preserving registered custom Agent Core API keys
- watchdog health checks with bounded automatic restart attempts
- Windows autostart through an Agent Code scheduled task
- Open Agent Core Folder and Open Tunnel Admin UI utilities
- Exit Agent Core, which stops the MCP/tunnel bundle while Agent Code remains open

During migration, the old PowerShell launcher/tray files remain available as fallback artifacts. If Agent Code detects an already-running legacy `agent-core-tray.ps1 -Mode Tray` controller at startup, that Agent Code process enters **safe passive mode**: it may display status and open utility locations, but native lifecycle mutations are locked so the healthy existing Agent Core instance is not disturbed. Relaunch Agent Code after the legacy tray has been retired to activate the native controller.

## Window close and tray behavior

Agent Code keeps the native Windows minimize button unchanged: minimizing leaves the window on the taskbar as a normal minimized application. The native close `X` is intercepted and presents two explicit choices instead of terminating immediately:

- **Close Completely** stops Agent Core MCP, the tunnel, and Agent Code itself while preserving the configured Windows autostart preference.
- **Hide to Tray** removes the main window from the taskbar while keeping Agent Code, Agent Core, the tunnel, and watchdog running.

The Agent Code tray icon can restore and focus the main window with a left click. Its context menu exposes only **Open Agent Code** and **Close Completely**. Launching Agent Code again after a complete close re-arms the Agent Core bundle and starts its managed services normally.
Native controller state is stored under:

```text
runtime/agent-code-controller/
```

## Codespace bootstrap

A fresh Linux Codespace can install the project-local native prerequisites with:

```bash
bash scripts/codespace-bootstrap.sh
source "$HOME/.cargo/env"
```

The bootstrap installs the stable Rust toolchain through `rustup` when necessary, restores npm dependencies using the committed lockfile, installs the pinned Playwright Chromium build used by the visual acceptance suite, and provisions the Windows cross-build toolchain: LLVM/LLD 20, the `x86_64-pc-windows-msvc` Rust target, `cargo-xwin` 0.23.1, Ubuntu NSIS, and the pinned NSIS 3.08 support tree required by the current Tauri installer template.

To build the Windows x64 application and NSIS installer from Linux:

```bash
npm run build:windows:x64
```

The installer is emitted at:

```text
src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/Agent Code_0.1.0_x64-setup.exe
```

## Tauri desktop shell

The main window contract is:

- title: `Agent Code`
- initial size: `1280 × 800`
- minimum size: `900 × 620`
- resizable native decorations enabled
- identifier: `com.pitchlook.agentcode`

The command-prompt Agent Code mark is used as the native application icon. The AC monogram is reserved for the welcome state, while the premium orbit/ribbon emblem is stored as secondary brand artwork and is not permanently rendered in the main workspace.

The React frontend communicates with the native Agent Core controller only through explicitly registered Tauri commands. The launcher migration does not turn the React UI into an unrestricted shell/process bridge.

## Platform verification boundary

The Codespace is Ubuntu 20.04 Linux. It verifies the React/Vite build, Tauri configuration, Cargo metadata, Rust toolchain, generated Windows icon assets, browser-based visual acceptance at 1280×800, 1440×900, and 980×680, and a cross-compiled Windows x64 Tauri artifact. The Windows application is verified as PE32+ / `IMAGE_FILE_MACHINE_AMD64`, and Tauri completes the NSIS bundle as a Windows installer.

Cross-platform Tauri compilation is still experimental and the Linux host cannot execute the resulting desktop application natively. The installer is also unsigned because standard Windows code signing is not configured. Native Windows launch/install behavior therefore remains a separate acceptance gate that must be exercised on an actual Windows machine.

## Current non-goals

This milestone does not contain:

- Super-Runtime/model execution integration
- llama.cpp/GGML invocation
- real coding-agent execution
- general-purpose terminal/process execution exposed to React
- file explorer/editor implementation
- Git integration
- model picker
- settings page
- cloud sync
- multi-agent orchestration
- plugin/extension system
- production conversation persistence

The Agent Core controller is a narrow native subsystem intended to replace the external BAT/tray launch path without broadening the application into an unrestricted command runner.
