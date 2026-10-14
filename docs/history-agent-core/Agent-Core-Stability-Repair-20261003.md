# Agent Core Stability Repair — 2026-10-03

Status: SOURCE IMPLEMENTED — BUILD VERIFIED — RESIDENT-ACTIVATED — LIVE-VERIFIED

Observed failures:
- Node exited code 1 after uncaught `proper-lockfile` ECOMPROMISED: `Unable to update lock within the stale threshold`.
- Launcher status refresh repeatedly timed out in `GetPortProcessInfoAsync` and produced false OFF/ON state transitions while MCP calls still succeeded.
- Overlapping 3-second async UI refreshes plus 6-second CIM queries triggered UI heartbeat stalls and hang dumps.

Scoped repair:
- Memory lock lease is lengthened and `onCompromised` is converted from a process-killing throw into a fail-closed `MEMORY_LOCK_COMPROMISED` operation error.
- MainForm permits only one status refresh at a time.
- Passive health/tunnel status uses a bounded 10-second last-known-good grace; explicit lifecycle ownership checks remain strict.
- Passive Core process metrics use a 2-second fail-soft process probe; lifecycle start/stop queries retain the strict default timeout.

Checkpoint before changes: `3db2cd65-8ef1-4450-a421-0f8981705693`.
Canonical DTC-1 Memory synchronization remains intentionally paused until this stability repair is live and observed stable.
Build evidence:
- `npm run build` PASS; path policy 302 authored files / 0 exceptions.
- Launcher self-contained publish PASS to `runtime/build/stability-launcher-20261003`.
- Active launcher SHA-256 before cutover: `6A59E3E2540469975C772D1770A5AA150C34D701BFFFAC42ECEE64037897C2CD`.
- Candidate launcher SHA-256: `778138C355B38CD12F8C68B6D471CEC7C850B1D0E88E9E3B75A0B35507AEB251`; FileVersion/ProductVersion remain 0.14.0.
- Compiled `dist/memory/lock.js` SHA-256: `2437D8035F1150CB7451BCBB28DE3687BE85D0C815A69A71C8275228A2B49B91`.
- `release:check-intent` PASS and includes `.changeset/20261003-runtime-stability-lock-launcher.md`.

Activation helper: `APPLY-STABILITY-REPAIR-20261003.cmd`. It refuses to act while any Agent Core process is still running, verifies active/candidate hashes, backs up the launcher, installs the candidate, and starts Agent Core. It never kills processes itself.
Resident activation and stability closure:
- User applied the prepared hash-checked cutover and reopened Agent Core.
- Active root launcher SHA-256 is `778138C355B38CD12F8C68B6D471CEC7C850B1D0E88E9E3B75A0B35507AEB251`; FileVersion/ProductVersion remain 0.14.0.
- Resident launcher PID 18984 and Core PID 11932 started at 17:37 local time; `/health=ok` on Agent Core v0.14.0.
- Memory health is available with canonicalComplete=true, issueCount=0, index/embedding/intelligence available.
- Tracker observation from the repaired launcher start reached 88 events with 0 error events, 2 bounded fail-soft `process-metrics-probe-timeout` warnings, and 0 targeted hits for proper-lockfile compromise, Node exit code 1, UI heartbeat stall, tunnel OFF, connection OFF, or execution unavailable. The two warnings confirm the new fallback path: HTTP health remained authoritative while slow Windows metrics probes were discarded.
- The previously deferred canonical DTC-1 `memory_update` succeeded in-place and Core remained healthy. A subsequent Learning review also performed two additional canonical Memory captures without changing Core PID or producing a failure event.
- Canonical DTC-1 Memory record `57b16ddb-31a1-4fec-9da4-7326b342a68b` now reflects resident activation, live verification, and the stability repair. Learning captured reusable reflections `64464e88-c4b0-49fa-b158-2350a1841aa4` (Memory lock compromise must fail closed) and `31c0a6e4-055b-4559-84e2-165733606d81` (launcher status probes must be single-flight).
Second-stage passive status hardening:
- Final observation found one 3-second `Execution changed to UNAVAILABLE` sample at 10:51:28Z, immediately returning AVAILABLE at 10:51:31Z while Core/MCP stayed healthy.
- `/health.execution` is derived from `configManager.health()`, so one transient config-read miss can produce a single unavailable sample even though the Execution engine and Core remain operational.
- `AgentCoreRuntime.StabilizePassiveStatus()` now applies the existing 10-second passive grace to Execution and Game Mode negative samples. Explicit lifecycle checks and the raw `/health` value are unchanged.
- r2 launcher publish PASS; candidate SHA-256 `67C9A88E6C75AFE6F6E32219B8489C9E6C0B4C3C7D6803243D9A75480E7B604B`, version 0.14.0.
- r2 was user-cut over and is resident-active. Active launcher SHA-256 is `67C9A88E6C75AFE6F6E32219B8489C9E6C0B4C3C7D6803243D9A75480E7B604B`; launcher PID `1916`, Core PID `22436`.
- Final r2 observation reached at least 73 tracker events with 0 errors, only bounded rate-limited fail-soft `process-metrics-probe-timeout` warnings, and 0 targeted crash/flapping hits. A dedicated 15-sample health run returned 15/15 `status=ok`, 15/15 `execution=available`, and 15/15 `memory=available`.
- Canonical DTC-1 Memory mutation succeeded on r2 without changing Core PID or producing a failure event. r2 is LIVE-VERIFIED for the scoped stability repair.