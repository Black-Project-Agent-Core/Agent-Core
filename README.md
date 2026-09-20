<p align="center">
  <img src="assets/agent-core.png" width="96" alt="Agent Core logo">
</p>

<h1 align="center">Agent Core</h1>

<p align="center">
  Local-first authenticated MCP control plane for Windows with machine control, durable semantic memory, code intelligence, Semantic IDE/LSP, learning, Game Mode, and Hermes partner workflows.
</p>

<p align="center">
  <strong>Stable: v0.12.0</strong> · <strong>62 MCP tools</strong> · <strong>Windows-first</strong> · <strong>Private recovery mirror</strong>
</p>

## What Agent Core is

Agent Core is the machine-side control layer for a connected AI/controller. It exposes a local authenticated MCP surface, keeps execution and memory local by default, and integrates optional sibling capabilities without turning them into execution gates.

The current line is intentionally source-first: the local project is authoritative, while this GitHub repository is maintained as a recovery mirror. Live credentials, private runtime state, browser profiles, forensic backups, and protected research/reference trees are excluded from Git.

## Current capability surface

| Capability | Public tools | Purpose |
| --- | ---: | --- |
| Machine control | 26 | Filesystem, process, terminal, search, edit, config, and local desktop-adjacent operations |
| Memory | 11 | Durable file-native memory, semantic retrieval, evolution preview, consolidation, provenance, and revisions |
| Game Mode | 14 | Android/phone control through Agent Core-managed transports |
| Code Intelligence | 7 | Grafel-backed orientation, graph, surface, analysis, patterns, workspace, and repair |
| Semantic IDE | 2 | LSP-backed symbol/refactor workflows with multi-root/provider support |
| Learning | 1 | Controller-reviewed durable learning checkpoints and sinks |
| Hermes Partner | 1 | Optional A2A collaboration through Hermes' authenticated Runs API |

Total public MCP surface: **62 tools**.

## Architecture at a glance

```text
AI / MCP client
      |
      v
Agent Core :8765
  |-- machine control (src/rdc)
  |-- MemoryService
  |-- Game Mode / phone
  |-- Grafel Code Intelligence
  |-- Semantic IDE / LSP
  |-- Learning
  |-- Hermes Partner
  |
  +-- optional authenticated tunnel for remote ChatGPT access
```

Subsystems are siblings. Memory, Code Intelligence, Learning, Semantic IDE, Game Mode, and Hermes Partner do not become hidden routing or authorization gates for normal machine-control operations.

## Install / recovery

### Recommended: stable Windows release

1. Open the [latest GitHub release](https://github.com/Black-Project-Agent-Core/Agent-Core/releases/latest).
2. Download `Agent-Core-v0.12.0.zip`.
3. Verify the SHA-256 published with the release.
4. Extract the archive to the desired project directory.
5. Configure local secrets/runtime state locally; never commit them.
6. Start Agent Core with the packaged launcher/runtime.

The stable package intentionally excludes live `.env`, secrets, OAuth/API-key state, user memory notes, tracker logs, browser profiles, backups, Git metadata, and protected reference repositories.

### Build the core from source

Requirements:

- Windows
- Node.js **>= 24.15.0**
- npm
- .NET SDK only when rebuilding the native launcher

```powershell
Copy-Item .env.example .env
npm ci
npm run build
npm start
```

For the web UI:

```powershell
Set-Location src\ui
npm ci
npm run build
```

Do not copy credentials from another machine blindly. Recreate machine-local authentication/runtime state as appropriate.

## MCP and authentication

The local listener is loopback-bound by default at `127.0.0.1:8765`. The MCP endpoint requires a valid Agent Core API key or OAuth access token.
Remote ChatGPT access uses the authenticated tunnel path rather than exposing the local listener directly.

See [SECURITY.md](SECURITY.md) for the security boundary and credential-handling rules.

## Repository / recovery policy

This repository's `main` branch is a **recovery mirror of the current local Agent Core source line**. It is not a source that should be merged into a newer local tree merely because the histories differ.

The Git mirror intentionally excludes:

- `.env` and credential backups
- `secrets/`
- private runtime memory/auth/tracker/browser state
- `runtime/backups/` and forensic corruption artifacts
- protected `DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT/` reference trees
- browser/RDC profiles and caches
- generated `bin/`, `obj/`, temporary build outputs, and large packaged binaries

Large stable binaries are stored as GitHub Release assets instead of normal Git objects.

## Documentation

- [Architecture source of truth](docs/CODEBASE.md)
- [Security policy](SECURITY.md)
- [Maintenance notes](Maintenance.md)
- [Changelog](CHANGELOG.md)
- [Release artifacts](release/README.md)
- [Contributing](CONTRIBUTING.md)
- [Support](SUPPORT.md)

## Development and verification

Common commands:

```powershell
npm run build
npm test
npm run release:plan
npm run release:compat
```

Tests and broader verification are run deliberately according to the task scope; the presence of a test command does not make every test suite an automatic execution gate.

## License

No public open-source license is declared for this private repository. Do not assume redistribution rights from source visibility alone.
