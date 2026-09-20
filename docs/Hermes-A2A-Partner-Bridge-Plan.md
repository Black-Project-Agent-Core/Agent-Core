# Hermes A2A Partner Bridge Plan

> **Status:** COMPLETE — VERIFIED FOR APPROVED SCOPE
> **Acceptance:** 24 / 24 PASS
> **Recovered:** 2026-09-20 after docs filesystem corruption
> **Authority:** Agent Core connected AI/controller remains lead and final authority.

## Goal

Provide an Agent Core → Hermes A2A partner bridge that lets the lead controller split suitable work with Hermes while retaining responsibility for scope, decisions, verification, and final user-facing output.

Hermes is a partner/delegate/advisor, not an orchestrator above Agent Core and not a co-equal authority.

## Implemented contract

- One public MCP facade named partner.
- Transport uses an owned loopback Hermes Runs API child.
- Alignment/discussion precedes delegation.
- Delegation before approved alignment is refused.
- New discussion invalidates prior approval.
- Discussion rounds are bounded.
- Delegated work runs asynchronously while the lead continues its work.
- Lead can steer, collect, approve/deny bounded requests, and stop the correct run.
- Hermes results remain verification-required until independently verified.
- Partner failure is fail-soft; Execution/Memory/Grafel/Learning stay independent.
## Security and lifecycle boundaries

- Listener is loopback only.
- Bridge does not launch the full Hermes gateway.
- Ephemeral partner API key remains process-local and was audited for persistence leakage.
- Owned Hermes child is terminated with the owning Partner service.
- Existing interactive Hermes TUI remains independent and coexistence was verified.
- Agent Core startup readiness does not wait for optional Hermes Partner bootstrap.
- External Remote Desktop Commander is not part of this bridge or its health criteria.
- Project/Hermes paths are dynamically resolved; drive letter is not project identity.

## Acceptance summary

Verified live behavior included real Hermes alignment, approval gating, bounded discussion, real async delegation, parallel Agent Core activity, steer/collect/stop, bounded approval choices, degraded-partner isolation, child cleanup, loopback binding, no persisted ephemeral key, refreshed MCP manifest including partner, and interactive TUI coexistence.

Final completion state was 24 / 24 PASS with Partner available and issueCount 0.
## Current stability repair — 2026-09-20

Latest recovery restored Hermes as both a standalone assistant through `E:\Projects\hermes\Hermes.cmd` and an Agent Core subordinate partner, without changing the A2A authority contract:

- Hermes/9Router local API-key wiring was refreshed through the existing project-local `wire-hermes-key.cjs`; the previous 401 path was eliminated without exposing the key;
- 9Router remained loopback-only on `127.0.0.1:20128` and provider synchronization completed; OpenRouter Nemotron 3 Ultra free and Poolside Laguna S 2.1 free both returned `ROUTER_OK`, while Gemini 3.5 Flash Lite also returned `ROUTER_OK` as a cross-provider fallback;
- Hermes default is `openrouter/nvidia/nemotron-3-ultra-550b-a55b:free` through provider `9router`; configured fallbacks are `openrouter/poolside/laguna-s-2.1:free` and `gemini/gemini-3.5-flash-lite`;
- Hermes `state.db` had corruption in FTS shadow B-trees; native repair failed safely, the corrupt database plus backups were preserved under `E:\Projects\hermes\backups\state-recovery-20260920`, and the active state store was recreated cleanly rather than rolling back to an empty legacy backup;
- the corrupt root `tmp` directory was quarantined under `E:\Projects\hermes\backups\partner-stability-20260920` and replaced with a writable temp directory; `Hermes-9Router.cmd` now uses `runtime\hermes-tmp` for TEMP/TMP;
- `Hermes.cmd -z` returned exactly `HERMES_OK` after the repair;
- Agent Core source discovery preserves explicit `AGENT_CORE_HERMES_SOURCE_ROOT`, otherwise prefers the sibling `..\hermes-agent` tree when it contains `gateway\platforms\api_server.py`, then falls back to `<HERMES_HOME>\hermes-agent`. Filesystem corruption had made all 40 tracked files under the sibling v0.21.3 `gateway\platforms` directory and all 30 tracked files under `cron` unreadable/deleted from Git's perspective; both directories were quarantined and restored exactly from local Git HEAD, and a direct `APIServerAdapter` import probe passed afterward;
- final rebuilt Agent Core Node Core is PID 11172; `/health` is `ok`; Partner is `available` on loopback port 18642, reports Hermes version 0.21.3, sourceRoot `E:\Projects\hermes-agent`, and issueCount 0;
- a final harmless v0.21.3 A2A acceptance completed alignment and approval, then delegated execution reached terminal `completed`; its readiness output confirmed Hermes 0.21.3 is ready under the lead-verified acceptance criteria. The run took roughly one minute on the free-model route but completed normally and was not cancelled.

The old corrupt Hermes session database remains forensic evidence; the active session store is fresh, so old transcript recovery is a separate optional task and is not required for Partner/inference stability. The optional `E:\Projects\hermes\plugins\ponytail` directory still returns OS-level `Access is denied` even to ownership/ACL repair attempts; this can produce a non-blocking `on_session_end` hook warning but did not prevent standalone inference or the final A2A acceptance. No drive-level repair was attempted.

## Open items

NONE for the approved A2A Partner scope. Future expansion requires a new explicit request and must not silently promote Hermes from partner to lead/orchestrator authority.
