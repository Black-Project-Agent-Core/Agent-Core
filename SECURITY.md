# Security

Agent Core is a local machine bridge, not an autonomous agent framework.

The listener is loopback-bound by default. Remote ChatGPT access uses the existing authenticated MCP tunnel rather than exposing the local port directly.

API-key hashes and OAuth state are stored in the effective Agent Core data directory (default `runtime/bridge-auth`, override `AGENT_CORE_DATA_DIR`); raw secrets must not be committed or printed. The MCP endpoint requires a valid Agent Core API key or OAuth access token.

OAuth protected-resource identity is independent from the local listener identity. External connector deployments may set `AGENT_CORE_OAUTH_PROTECTED_RESOURCE_URL` to the externally reachable MCP resource while the local listener remains `http://127.0.0.1:8765/mcp`.

Launcher `Reset OAuth / Re-auth` resolves the same effective data directory as the Node core, backs up `oauth.json`, preserves registered OAuth clients and the separate `keys.json` API-key store, and clears authorization codes plus access/refresh-token grants before restarting the core.

Filesystem access follows the Agent Core machine-control `allowedDirectories` configuration under `runtime/rdc`. Terminal/process execution follows the same internal machine-control blocked-command policy and session/process controls. The `rdc` path/name reflects vendored implementation lineage; it is not the external Remote Desktop Commander profile/configuration.

There is no route context, capability-authority gate, workflow gate, continuity gate, memory routing gate, or execution-plan permission layer. The native file-backed `MemoryService` is a sibling subsystem for explicit memory operations and selective recall; it does not authorize, route, or gate normal Agent Core machine-control tools.

The Agent Core machine-control layer under `src/rdc` is vendored RDC-derived code and has upstream cloud telemetry disabled. External Remote Desktop Commander—including its hosted remote-device service, Device ID/session/channel state, launcher checks, and external profile—is a separate operator tool and is not an Agent Core subsystem.

`secrets/`, the effective Agent Core auth/OAuth data directory, tunnel credentials, and Agent Core internal machine-control configuration are operator-sensitive and must stay outside published artifacts. External RDC credentials/session/device state follow the external tool's own security boundary and must never be treated as Agent Core credentials or Agent Core health state.
