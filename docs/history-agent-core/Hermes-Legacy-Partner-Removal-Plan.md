# Hermes Legacy Partner Removal Plan

> **Status:** COMPLETE — TARGETED VERIFIED — LIVE-ACTIVATED — LEGACY PARTNER RETIRED
> **Date:** 2026-09-27
> **Scope:** Remove only the legacy Hermes-backed Partner bridge that emits `HERMES_HOME_NOT_FOUND`.
> **Protected boundary:** Preserve the generic/native `Agent Core AI` / `agentRuntime` UI and any future Agent Core-owned runtime work.

## Goal

Remove the old Hermes Partner integration cleanly so Agent Core no longer:
- resolves `AGENT_CORE_HERMES_*` paths;
- starts or health-checks `HermesPartnerService`;
- exposes the legacy public MCP `partner` tool;
- emits `partner` / `HERMES_HOME_NOT_FOUND` in live health;
- keeps obsolete launcher/UI health fields for the Hermes bridge;
- retains legacy Hermes runtime state under `runtime/partner/hermes`.

The removal must not modify external Hermes projects, future native Agent Core runtime work, Memory, Learning, Grafel, Semantic IDE, Phone/Game Mode, Execution, Auth/OAuth, tunnel, or unrelated UI behavior.

## Structural evidence

Grafel index is current with complete registered-workspace coverage.
Impact analysis shows `registerPartnerTools` reaches the MCP server factory, HTTP handler, release manifest checks, and MCP tests. `HermesPartnerService` is otherwise bounded to the legacy partner subsystem/composition root.

## Removal surface

1. Composition/config
   - `src/index.ts`
   - `src/config.ts`
2. Public MCP surface
   - `src/mcp/server.ts`
   - `src/mcp/handler.ts`
   - delete `src/mcp/partner-tools.ts`
   - delete `src/mcp/partner-schemas.ts`
3. Legacy implementation
   - delete `src/partner/hermes-runtime.ts`
   - delete `src/partner/hermes-client.ts`
   - delete `src/partner/service.ts`
   - delete `src/partner/types.ts`
4. Desktop health compatibility
   - `src/launcher/DesktopSnapshot.cs`
   - `src/launcher/AgentCoreRuntime.cs`
   - `src/ui/src/host.ts`
   - update UI fixtures only; preserve `SystemId='partner'` and the `Agent Core AI` card because those belong to future `agentRuntime`, not Hermes.
5. Verification/release support
   - `tests/mcp-manifest-contract.test.ts`
   - `tests/semantic-ide-mcp.test.ts`
   - `scripts/release/release-compat.mjs`
   - `.env.example`
6. Runtime state
   - remove only `runtime/partner/hermes` after process/port checks prove no live legacy child depends on it.
   - do not delete external `E:\Projects\hermes*` paths.

## Acceptance

- TypeScript build succeeds.
- Launcher compiles after health-contract removal.
- UI type/test build succeeds for the health shape.
- Targeted MCP manifest tests pass.
- Fresh live MCP manifest no longer contains `partner`.
- Fresh `/health` contains no legacy `partner` object and no `HERMES_HOME_NOT_FOUND`.
- Memory, Grafel, Semantic IDE, Learning, Skills, Execution, Phone/Game Mode remain healthy/available.
- Generic `Agent Core AI` UI placeholder remains present.
- No legacy Hermes Partner source or compiled runtime artifact remains in active `src`/`dist`.
- No external Hermes installation/project is modified.
- CODEBASE and local canonical memory record the retirement.

## Release boundary

This intentionally removes a public legacy MCP tool. Record a release intent; do not run `release:apply`, commit, tag, push, publish, or deploy unless separately authorized.

## Implementation and live closure — 2026-09-27

**COMPLETE — TARGETED VERIFIED — LIVE-ACTIVATED — LEGACY PARTNER RETIRED.**

Implemented exactly within the removal surface above. The generic/native `Agent Core AI` / optional `agentRuntime` surface was preserved and was not renamed, implemented, or otherwise modified beyond removing the obsolete legacy Partner health field.

Evidence:
- active source scans for `HermesPartner`, `AGENT_CORE_HERMES_`, and `HERMES_HOME_NOT_FOUND`: zero matches;
- active `src\\partner`, `dist\\partner`, `runtime\\partner\\hermes`, and compiled `dist\\mcp\\partner-*`: absent;
- root TypeScript staging compile: PASS;
- targeted MCP contract tests: 5/5 PASS;
- launcher build: 0 warnings / 0 errors;
- UI TypeScript typecheck: PASS;
- UI App test itself is independently blocked before test execution by the separate in-progress native-runtime import `src/pages.tsx -> ./chat`; that future-runtime work was explicitly out of scope and was not touched;
- path policy: PASS (250 authored files / 0 exceptions);
- `release:check-intent`: `ok=true`;
- `release:compat` intentionally reports breaking evidence because the public legacy `partner` tool was removed; no HTTP route was removed and the 64-tool manifest remains within budget;
- CAS Node cutover completed with guarded pre-removal hashes and no final rollback;
- root launcher was republished and live-captured with SHA-256 `003D6DB7A12A9B9907F7E27B5A51E72F1AA00A4D134140A47C89780D70D4618B`;
- live launcher PID `11520`, live Node Core PID `21448`, `/health=ok`;
- fresh authenticated MCP acceptance: 64 tools, `partner` absent, `skills` present;
- live health: no `partner` object, no `HERMES_HOME_NOT_FOUND`, Memory available issueCount 0, Grafel available/current, Semantic IDE/Learning/Skills available;
- temporary acceptance credential revoked;
- external Hermes processes observed under `D:\\Ver-0-0-1\\Hermes\\...` were not modified or terminated.

Two activation-helper failures occurred before final success; both triggered automatic runtime/launcher rollback before retry. The successful third activation is the current runtime. These were helper-validation failures, not product-source failures.

Backup: `runtime\\backups\\hermes-legacy-partner-removal-20260927`.
Live activation evidence: `runtime\\tmp\\hermes-legacy-partner-live-activation-20260927.json`.
Changeset: `.changeset/20260927-hermes-legacy-partner-removal.md` (minor). Stable product version remains `0.13.0`; release apply/commit/tag/push/publish/deploy were not run.
