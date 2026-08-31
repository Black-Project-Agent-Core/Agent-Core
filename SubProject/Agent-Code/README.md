# Agent Code

Agent Code is a Windows-oriented desktop coding-agent shell. Milestone 1 intentionally builds only the premium **Focused Console** interface, deterministic local workspace/session state, and a minimal Tauri desktop boundary.

The first milestone is deliberately UI-first. Super-Runtime, model execution, shell/process execution, file-agent actions, authentication, remote services, persistence, and synthetic AI responses are absent by design.

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

## Codespace bootstrap

A fresh Linux Codespace can install the project-local native prerequisites with:

```bash
bash scripts/codespace-bootstrap.sh
source "$HOME/.cargo/env"
```

The bootstrap installs the stable Rust toolchain through `rustup` when necessary, restores npm dependencies using the committed lockfile, and installs the pinned Playwright Chromium build used by the visual acceptance suite.

## Tauri desktop shell

Milestone 1 uses Tauri 2 only for the native application window, application metadata, package configuration, and icons. There are intentionally no Tauri commands exposed to the React frontend.

The main window contract is:

- title: `Agent Code`
- initial size: `1280 × 800`
- minimum size: `900 × 620`
- resizable native decorations enabled
- identifier: `com.pitchlook.agentcode`

The command-prompt Agent Code mark is used as the native application icon. The AC monogram is reserved for the welcome state, while the premium orbit/ribbon emblem is stored as secondary brand artwork and is not permanently rendered in the main workspace.

## Platform verification boundary

The Codespace is Ubuntu 20.04 Linux. It verifies the React/Vite build, Tauri configuration, Cargo metadata, Rust toolchain, generated Windows icon assets, and browser-based visual acceptance at 1280×800, 1440×900, and 980×680. Tauri reports that this host lacks WebKitGTK 4.1/rsvg graphical prerequisites; Ubuntu 20.04 does not provide the required WebKitGTK 4.1 development package in its configured repositories. Those Linux graphical libraries are not installed because Agent Code Milestone 1 targets Windows and does not claim a native Linux desktop build.

The Codespace therefore **cannot truthfully certify a Windows `.exe` bundle or native Windows launch**. That packaging/runtime check belongs on a Windows build host when one is available.

## Milestone 1 non-goals

Milestone 1 does not contain:

- Super-Runtime integration
- llama.cpp/GGML invocation
- real coding-agent execution
- terminal or process execution
- file explorer/editor implementation
- Git integration
- model picker
- settings page
- authentication or cloud sync
- multi-agent orchestration
- plugin/extension system
- production persistence

The next backend boundary will be designed only after this UI shell is visually stable.
