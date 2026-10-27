# Security

## Supported versions

The supported security baseline is the latest accepted stable [GitHub Release](https://github.com/Black-Project-Agent-Core/Agent-Core/releases/latest). Candidates require their release-specific verification and package-acceptance evidence. A source version, successful build or candidate download does not establish stable acceptance.

## Reporting a vulnerability

Use the repository **Security** tab / private security advisory flow when available. If that path is unavailable, contact the repository owner through a private channel. Do not place exploit details, credentials, OAuth tokens, API keys, private memory, or sensitive machine data in a normal issue.

Include the affected Agent Core version, subsystem, reproduction conditions, impact, and the smallest sanitized evidence needed to reproduce the problem. Do not test destructive behavior outside systems you are authorized to control.

Agent Core is a local machine bridge, not an autonomous agent framework.

The listener is loopback-bound by default. Remote ChatGPT access uses the existing authenticated MCP tunnel rather than exposing the local port directly. A Cloudflare named tunnel is the supported second public path (`docs/Cloudflare-Tunnel.md`); only `/mcp` and the OAuth routes may be published on it, because tunnel traffic appears as loopback to the listener.

API-key hashes and OAuth state are stored in the effective Agent Core data directory (default `runtime/bridge-auth`, override `AGENT_CORE_DATA_DIR`); raw secrets must not be committed or printed. The MCP endpoint requires a valid Agent Core API key or OAuth access token.

OAuth protected-resource identity is independent from the local listener identity. External connector deployments may set `AGENT_CORE_OAUTH_PROTECTED_RESOURCE_URL` to the externally reachable MCP resource while the local listener remains `http://127.0.0.1:8765/mcp`.

Launcher `Reset OAuth / Re-auth` resolves the same effective data directory as the Node core, backs up `oauth.json`, preserves registered OAuth clients and the separate `keys.json` API-key store, and clears authorization codes plus access/refresh-token grants before restarting the core.

Filesystem access follows the Agent Core machine-control `allowedDirectories` configuration under `runtime/rdc`. Terminal/process execution follows the same internal machine-control blocked-command policy and session/process controls. The `rdc` path/name reflects vendored implementation lineage; it is not the external Remote Desktop Commander profile/configuration.

External MCP access requires valid authentication, the credential's effective tool grants, and a current `controller_contract` acknowledgement before ordinary tools run. Existing filesystem/process controls and task/workspace-bound Memory and Learning admission remain enforced by their owners. Memory and Learning retain scoped knowledge and continuity; they do not grant machine-control permissions.

The `src/memory` owner resolves canonical Memory through the validated activation under `<PROJECT_ROOT>/runtime/memory`. Fresh initialization, migration and recovery must use that owner's documented workflow. Native and external development use the same authenticated, task-scoped authority and protected-path requirements; development status is not an operating-system sandbox or proof of controller compliance.

The Agent Core machine-control layer under `src/rdc` is vendored RDC-derived code and has upstream cloud telemetry disabled. External Remote Desktop Commander—including its hosted remote-device service, Device ID/session/channel state, launcher checks, and external profile—is a separate operator tool and is not an Agent Core subsystem.

`secrets/`, the effective Agent Core auth/OAuth data directory, tunnel credentials, and Agent Core internal machine-control configuration are operator-sensitive and must stay outside published artifacts. External RDC credentials/session/device state follow the external tool's own security boundary and must never be treated as Agent Core credentials or Agent Core health state.
