# Grafel + Semantic IDE Health Repair — 2026-09-24

> **Status:** COMPLETE — LIVE VERIFIED.
> **Product version:** 0.12.0 unchanged.
> **Scope:** repair Grafel Code Intelligence `index=unknown` degradation and Semantic IDE PowerShell version-probe degradation.
> **Release action:** none; no `release:apply`, version bump, commit, push, publish, or deploy.

## Grafel diagnosis and repair

The first Grafel degradation was not missing source or a deleted graph. Runtime evidence showed stale/duplicate daemon ownership during the earlier Core restart: the daemon attempted pidfile reclaim and then failed named-pipe listen with `Access is denied`. A manually started Grafel instance also used the shell environment rather than Agent Core's isolated `GRAFEL_HOME/GRAFEL_DAEMON_ROOT`, explaining why the native facade could not see it.

Grafel was restarted with the exact isolation environment owned by `GrafelRuntime`. A synchronous project-local index then completed successfully: **411 files, 6,607 entities, 35,540 relationships**, exit 0. Direct provider status became `state=current`; a fresh provider MCP client exposed **22 tools** and loaded the graph successfully.

A second issue remained in the already-running Node service: read-only Grafel provider probes could retain a stale bridge across daemon replacement. `src/code-intelligence/service.ts` now performs **at most one retry only for read-only** `grafel_index_status` and `grafel_orient(view=stats)` probes. Mutation/index/pattern/repair operations do not use this retry helper, so mutation replay semantics are unchanged.

Focused verification was RED before the source change (new stale-bridge case failed while 9 existing health tests passed), then GREEN after the repair: **25/25 PASS** across `code-intelligence-health-refresh.test.ts` and `code-intelligence-exact-graph.test.ts`. TypeScript current-source staging build exited 0.

RF-P2 expected-active CAS installed only `dist/code-intelligence/service.js` and its sourcemap. Cutover result: `runtime/tmp/grafel-health-repair-cutover-result-20260924.json`; backup: `runtime/backups/grafel-health-repair-cutover-20260924/`. Installed `service.js` SHA-256 is `86560fc8541fa81e3c8f778f997d19328b1c8573a65de77e358961077b9765d3`.

## Semantic IDE / PowerShell

The managed PowerShell binary itself returned `PowerShell 7.6.6` with exit 0. The degradation was transient provider-probe state, not a broken PowerShell installation. Explicit `reload_providers` re-probed the installed provider and returned `observedVersion=7.6.6`, `compatibility=compatible`; no Semantic IDE source patch or provider reinstall was required.

## Final live readback

After Core reconnection, project-local Node PID **15404** runs `dist/index.js`. `/health` returns top-level `ok`, Execution and Memory available, Memory issueCount 0. Code Intelligence is **available/current**, issueCount 0; Semantic IDE is **available**, issueCount 0; Learning is available with both Memory and Grafel-pattern sinks available.

Live `code_orient(status)` reports graphAvailability `available=true`, reason `provider-graph-loaded`, and complete group coverage (1/1 current). A live substring graph query for `CodeIntelligenceService` returned two graph entities, proving the facade is not only reading a health sidecar.

The only remaining top-level degraded sibling observed in this readback is Hermes Partner with `HERMES_HOME_NOT_FOUND`; it is outside this repair scope.