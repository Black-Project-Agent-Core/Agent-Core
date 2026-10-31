# Machine control

[Mandatory entry](../../AGENTS.md). Global scope/safety still apply. Code-quoted paths are project-root-relative.

## Tool model

Agent Core is a direct local MCP machine bridge. Its machine-control implementation is internal Agent Core code under `src\rdc`, derived from Desktop Commander compatibility; this does **not** make the external Remote Desktop Commander product/device part of Agent Core. Capabilities are a visible tool list to use when needed, not routing choices.

Expected model:

**AI → MCP tools/list → MCP tools/call → Agent Core machine-control handler (`src\rdc`, vendored RDC-derived code) → local machine**

Do not introduce routing gates, capability-selection gates, workflow gates, memory gates, execution DAG gates, postflight locks, or similar cross-locking systems unless the user explicitly requests them.
AGENTS.md bootstrap loads this operating contract. The explicitly requested external-controller session gate precedes ordinary tool access, including Memory. After acknowledgement, Memory inspection is the first ordinary local action.

## Remote Desktop Commander boundary

Remote Desktop Commander (RDC) is an **external operator tool**, not an Agent Core subsystem. `Start-Desktop-Commander.bat`, `Apply-Desktop-Commander-Allowlist.ps1`, `Desktop-Commander-Allowlist.txt`, the root `rdc\` package/profile, `.desktop-commander` device/session state, remote Device IDs/channels, and `@wonderwhy-er/desktop-commander` belong to that external tool.

- Never use external RDC device/session/version/health as proof that Agent Core is healthy, working, portable, or verified.
- `Start-Desktop-Commander.bat --check` verifies **only external Remote Desktop Commander**. It is not an Agent Core health check or Agent Core acceptance test.
- Agent Core verification must use Agent Core's own runtime surfaces: `Agent Core.exe`, Node core/`/health`, Agent Core tunnel, memory subsystem, Agent Core build/tests, and other Agent Core-owned checks relevant to the task.
- Internal `src\rdc` is vendored RDC-derived machine-control code compiled into Agent Core. To avoid ambiguity, refer to it as the **Agent Core machine-control layer**, not as the external RDC device/service.
- Do not couple install state, lifecycle, self-repair, profile/session state, Device IDs, or acceptance criteria between external RDC and Agent Core unless the user explicitly requests an integration.
