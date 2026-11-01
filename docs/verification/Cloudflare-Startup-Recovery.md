# Cloudflare public startup recovery

Date: 2026-11-01 (Asia/Tomsk).
Status: activated; public checks and bounded gateway-loss recovery verified.

## Failure and implemented change

The launcher journal recorded `Agent Core bridge did not become healthy within 180 seconds.` at `2026-11-01T08:01:40.2913651Z` (activity `e15b7b987c1f4f25b2f42fcddbe58814`). Core began listening 11.7 seconds later, at `08:01:52.036Z` (activity `fc6feccdb9044c16ba3f0090011dccb0`). Initialization had already stopped before starting gateway port 8788 and the watchdog. The public Worker returned HTTP 502 even though the independent Cloudflared service had four edge connections.

`AgentCoreRuntime.InitializeAsync` now starts one tracked recovery task before attempting bring-up. The existing lifecycle lock prevents overlap with startup, user actions and shutdown. After a failed initial attempt, the watchdog can wait for the existing Core, restore the gateway, reuse/start Cloudflared, and restore the separate OpenAI tunnel. Explicit Core stop remains authoritative; cancellation stops recovery on disposal.

`CloudflaredLaunch.ServiceQueryScript` verifies the exact project executable inside PowerShell before returning only service name, state and PID. A matching stopped service can be started; running/starting services are reused. An unavailable identity is an error, not proof of absence. Token-bearing service arguments are never emitted. Launcher stop/restart and residual cleanup leave the service-managed executable to SCM, rather than relying on a PID snapshot that can change during service recovery. Optional Cloudflare recovery failures do not prevent the separate OpenAI tunnel recovery. No service installation, startup-mode change, token edit or external Cloudflare deployment is included.

## Scope and owners

- Product: `src/launcher/AgentCoreRuntime.cs`, `src/launcher/CloudflaredLaunch.cs`.
- Checks: existing `CloudflaredLaunchTests.cs`, new `StartupRecoveryTests.cs`, existing package verification script.
- Documentation: this report, `docs/Cloudflare-Tunnel.md`, affected `docs/CODEBASE.md` entry, Unreleased changelog and one pending patch intent.
- Existing Native normalization-cache source changes and pending proposal remain separate. No Node build is needed or performed for this launcher fix.

## Verification before activation

- Startup regression failed on the original code because the recovery loop was absent after bring-up failure, then passed with the fix. It also checks one loop across repeated failure and cancellation on disposal. The disposable fixture never starts/stops a real service.
- Cloudflared focused checks: 15/15 pass, including quoted/unquoted exact path, case, spaces/apostrophes, suffix/foreign-root rejection, service state, stopped-service start, query failure and safe output.
- An initial no-restore attempt could not find a package under the stale generated `C:/Users/ADMIN/.nuget/packages` path. Restore used the existing project `runtime/nuget-packages` cache offline; no package or toolchain was added.
- Three service-fixture assertions initially saw PowerShell CLIXML progress (`Preparing modules for first use.`). The test helper now suppresses progress; assertions remain intact. No unrelated suite was run.
- Launcher published with the existing project SDK and matching installed 8.0.31 single-file host/runtime packs. `scripts/verify/launcher-package.mjs` passed with shared-runtime lookup disabled; compilation alone was not treated as package proof.
- Build path/Skill storage/structure checks passed: 535 authored files, zero path exceptions, 473 directories matching the map.

## Original-source inventory and bounded Replica application

`replica-recon` was adapted to integration mapping, without an app clone or third-party code copy:

| Source | Ownership / revision | Evidence and boundary |
|---|---|---|
| [Cloudflare downloads](https://developers.cloudflare.com/tunnel/downloads/) | Cloudflare official documentation, inspected 2026-11-01 | Links the official upstream repository/releases. |
| [cloudflare/cloudflared](https://github.com/cloudflare/cloudflared) | Cloudflare; Apache-2.0; existing local binary 2026.10.1, built 2026-10-15 | Publisher/source verified; binary was not upgraded or decompiled. |
| [Cloudflare service documentation](https://developers.cloudflare.com/tunnel/features/locally-managed-tunnels/as-a-service/) | Cloudflare official documentation | SCM service operation is distinct from a launcher-owned child. |
| Local launcher and gateway source | Agent Core existing owners | Core → gateway8788 → Cloudflared/VPC → public Worker; preserve OAuth/MCP allowlist and authentication. |

Observed state, inferred cause and successful recovery are recorded separately. A running service or a ready edge connection does not prove origin/public MCP readiness. Actual Worker configuration is outside this code change.

## Activation and live acceptance

One official `restart_agent_core(capabilitiesChanged=false)` was requested. Request log: `runtime/restart/mcp-78d99c02-cca3-4efa-bc7d-30265bb6ebdd.log`. The existing elevated Scheduled Task completed with receipt `runtime/restart/020124b4e003494a9b93bc6623ce580f.json`, exit code 0, readiness `siap (PID 14404 mulai 2026-11-01T09:21:28Z; dist basi: tidak; 111 dtk)`. No second restart or implicit Continue was issued. A fresh contract handshake and canonical Memory read succeeded after reconnect.

| Artifact / process | Verified value |
|---|---|
| Previous launcher SHA-256 | `1ca8dc45cdb4597c8b8cb8ee84d7eb84ef19f6c252bd9f4712c8709561d0291c` |
| Published / staged / active launcher SHA-256 | `91ce94384edbc989b36012a0ebbba766066c369dd7830ab31b10c196630bd8eb` |
| Old launcher rollback copy | `runtime/launcher/backups/launcher-a6c3e84af9c94bf0bd8fcf776ccbb833.exe` (retained by official worker) |
| New launcher / Core | PID 15236 / 14404 |
| Initial gateway / separate OpenAI tunnel | PID 1848 on8788 / PID 16172 on8787 |
| Cloudflared SCM service | PID3056, Running, Auto, unchanged across activation and fault probe; exactly one connector process |
| Node runtime module SHA-256 | `1fda14482718b6817c58e89565fca8b7b25a7bfa9c92db31401d967df8034d79`, unchanged |

The previous pending launcher had the same hash as the old root executable and no activation marker before staging, so no distinct pending change was discarded. The official worker consumed the new hash marker and preserved the previous root through its existing rollback owner. Existing startup registration was repaired by the launcher's own relocation logic for this project location.

Public acceptance after activation and again after fault recovery used the existing `Start-Cloudflare-Tunnel.ps1 -Action Verify -Url https://agent-core-mcp.joefreccejunior50.workers.dev`; the explicit URL avoids reading `.env`. All seven checks passed:

| Probe | Result |
|---|---|
| OAuth protected-resource metadata | HTTP200 |
| OAuth authorization-server metadata | HTTP200 |
| Unauthenticated MCP POST | HTTP401 |
| Empty authorization request | HTTP400 |
| Excluded `/health` | HTTP404 |
| Excluded `/agent/chat/conversations` | HTTP404 |
| OAuth resource identity | Exact Worker `/mcp` URL |

For the bounded fault probe, the external unelevated shell could not read the elevated gateway image/command line. The Agent Core-owned terminal independently verified PID1848, exact Node executable and first gateway-script argument, parent15236, creation ticks and current8788 listener; all were rechecked before stopping only that gateway. No unknown process was terminated.

The gateway stopped at `2026-11-01T09:26:08.148074Z`. Local connection failure and public HTTP502 were observed. Watchdog event `0e986a6973124ddcac9193af3a7afe34` detected the missing gateway at `09:26:20.527Z`; new gateway PID17388 was listening at `09:26:23.8466546Z` (activity `574f3ac30b43429a883d0d18bf438230`), approximately 15.7 seconds after the injected failure. Local and public MCP returned401 again. The Cloudflared service PID remained3056. This demonstrates one automatic gateway recovery; it is not a latency benchmark or a universal 16-second bound.

`debugging-and-error-recovery` was applied through preserved failure evidence, a failing startup regression, the source repair, service safety checks and actual public recovery. `mind-control` separated service/edge readiness from public-origin readiness and prompted the independent cleanup-race review; no general causal Skill benefit is claimed. Raka's review caught and Main corrected the service PID-change race before final publication. The review changes were compiled, package-checked and exercised in the live path; the targeted test totals above are not a claim that the full suite ran after every edit.

No Windows reboot or real network outage is planned. Availability still depends on Windows permissions, network and Cloudflare; the change provides automatic recovery, not a guarantee during external outages.
