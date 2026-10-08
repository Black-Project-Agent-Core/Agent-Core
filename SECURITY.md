# Security

## Supported versions

The source baseline reviewed on 2026-10-08 declares **0.14.0** in `package.json`. Source changes after that release are tracked by pending `.changeset/` intents; the package version alone does not prove a particular release asset or installed runtime contains them. Security work targets the current source line. Older release assets are historical recovery snapshots; their availability and GitHub Latest status were not rechecked by this documentation refresh.

## Reporting a vulnerability

Use the repository **Security** tab / private security advisory flow when available. If that path is unavailable, contact the repository owner through a private channel. Do not place exploit details, credentials, OAuth tokens, API keys, private memory, or sensitive machine data in a normal issue.

Include the affected Agent Core version, subsystem, reproduction conditions, impact, and the smallest sanitized evidence needed to reproduce the problem. Do not test destructive behavior outside systems you are authorized to control.

Agent Core includes an authenticated MCP machine bridge and an optional Native AI controller with persistent chat, provider scheduling and task-scoped tool grants. Both controllers reuse the existing capability and knowledge owners. Provider configuration, a discoverable tool and an active task grant are distinct states; do not treat model output or retrieved content as authorization.

The listener is loopback-bound by default. Remote ChatGPT access uses the existing authenticated MCP tunnel rather than exposing the local port directly.

API-key hashes and OAuth state are stored in the effective Agent Core data directory (default `runtime/bridge-auth`, override `AGENT_CORE_DATA_DIR`); raw secrets must not be committed or printed. The MCP endpoint requires a valid Agent Core API key or OAuth access token.

OAuth protected-resource identity is independent from the local listener identity. External connector deployments may set `AGENT_CORE_OAUTH_PROTECTED_RESOURCE_URL` to the externally reachable MCP resource while the local listener remains `http://127.0.0.1:8765/mcp`.

Launcher `Reset OAuth / Re-auth` resolves the same effective data directory as the Node core, backs up `oauth.json`, preserves registered OAuth clients and the separate `keys.json` API-key store, and clears authorization codes plus access/refresh-token grants before restarting the core.

Filesystem access follows the Agent Core machine-control `allowedDirectories` configuration under `runtime/rdc`. Terminal/process execution follows the same internal machine-control blocked-command policy and session/process controls. The `rdc` path/name reflects vendored implementation lineage; it is not the external Remote Desktop Commander profile/configuration.

Memory and Learning are sibling knowledge services; they do not authorize or route ordinary machine-control calls. Native controller execution does enforce its configured tool/capability policy and task-scoped grants. The selected Memory owner is initialized by `src/memory/host-runtime.ts`: without an activation marker it uses the existing file-backed store; an explicitly activated Experience v2 host loads `SubProject/agent-core-memory` at `runtime/memory-v2` after marker/backup validation. The two writers must not share one canonical root. Runtime Memory data and activation backups remain private, regardless of which owner is selected.

The Agent Core machine-control layer under `src/rdc` is vendored RDC-derived code and has upstream cloud telemetry disabled. External Remote Desktop Commander—including its hosted remote-device service, Device ID/session/channel state, launcher checks, and external profile—is a separate operator tool and is not an Agent Core subsystem.

`secrets/`, the effective Agent Core auth/OAuth data directory, tunnel credentials, and Agent Core internal machine-control configuration are operator-sensitive and must stay outside published artifacts. External RDC credentials/session/device state follow the external tool's own security boundary and must never be treated as Agent Core credentials or Agent Core health state.
