> **Historical document, superseded for current Memory placement on 16 October 2026.** Preserve the dated evidence below; do not recreate its old SubProject, MCP-owned memory files, or storage locations. Current ownership and installation status: [Memory consolidation](../CONSOLIDATION.md).

# Codebase Memory MCP — Steal / Use Integration Plan

> **Status:** CBM-P1 COMPLETE — TARGETED VERIFIED — LIVE-ACTIVATED — INSTALLED-RUNTIME VERIFIED — CBM-C1 CONSUMER-ONLY — REFERENCE MOVED TO `Consumer`
> **Grounded:** 2026-09-27
> **Reference:** `DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT\Consumer\codebase-memory-mcp`
> **Repository:** `https://github.com/Black-Project-Agent-Core/codebase-memory-mcp.git`
> **Revision:** `4d8ac9e1cea0d645a02f876f47536c54a5bfa406`
> **Branch:** `main`
> **License:** MIT
> **Checkout state:** shallow; pre-existing tracked deletion `Formula` and untracked audit ZIP preserved untouched.

## 1. Source-first scope

The checkout was grounded from executable C source and tests, not README claims. The audit covered daemon/bootstrap/lifetime coordination, project locks, exact build cohort, MCP supervisor, activation transaction, incremental/delta graph updates, compact output, runtime trace helpers and MCP dispatch.

Current Agent Core comparison authority is the live v0.13.0 architecture: Grafel remains the sole structural code graph provider; Agent Core already owns provider isolation, version/wire compatibility, process lifecycle, request-scoped workspaces, staged Semantic IDE provisioning, mutation safety and health reporting.

## 2. CBM-P1 — exact-build Code Intelligence provider cohort attestation

**Disposition:** STRONG CURRENT-FIT PROPOSAL — user selection required.
Reference evidence:
- `src/daemon/version_cohort.h/.c` admits peers by semantic version + build fingerprint + cache/protocol/store/feature ABI and rejects mismatched active cohorts;
- daemon-generation ownership is represented by an owned marker, not file existence;
- mutation admission is separated from lifetime admission;
- direct daemon/bootstrap tests exercise matching/mismatched build fingerprints, coordinated vs uncoordinated daemon presence and cleanup paths.

Verified Agent Core gap:
- `runtime/grafel/provider.json` already records the selected provider commit and `executableSha256`;
- Code Intelligence currently verifies configured binary existence, CLI version, provider wire compatibility, isolation and index readiness;
- health does not verify that the installed executable still matches `provider.json.executableSha256`;
- health also does not attest that a resident daemon/process belongs to the same selected build cohort, so a stale same-version daemon can be harder to distinguish from the qualified build.

Proposed Agent Core adaptation:
- keep Grafel as the only graph provider; do not import CBM graph/store/daemon;
- add Agent Core-owned read-only provider identity attestation:
  - SHA-256 the configured Grafel executable and compare with provider metadata;
  - compare selected source commit/version metadata with the observed CLI/provider status identity where available;
  - inspect only Agent Core-owned Grafel processes when proving resident executable path/identity;
  - report `current`, `metadata-mismatch`, `resident-mismatch`, or `unverifiable`;
- mismatches degrade Code Intelligence health and block **Code Intelligence provider mutation/startover only**; they never gate normal machine-control or Memory;
- no global process scan, second provider registry, or CBM lock hierarchy.
Acceptance:
- unchanged qualified provider reports exact-build current;
- modified/replaced executable is detected even if its version string is unchanged;
- a resident Agent Core-owned provider process whose executable identity does not match selected metadata is surfaced as mismatch rather than healthy;
- unavailable process metadata fails soft as `unverifiable`, never fabricates a digest;
- source/Grafel query results remain usable only according to existing health/fail-soft policy;
- exact source remains final authority.

## 3. CBM-C1 — bounded provider maintenance cohort barrier

**Disposition:** CONDITIONAL; only if Agent Core later owns an in-process Grafel install/update operation.

The reference's shared-lifetime/exclusive-maintenance admission is strong, but current Agent Core does not expose a public Grafel binary updater. Do not add a dormant global lock system now. If provider install/update becomes Agent Core-owned, adapt a small provider-local drain/exclusive mutation barrier so an update cannot race active Agent Core-owned Grafel calls.

This barrier must remain local to Code Intelligence and must never become a machine-control/workflow gate.

## 4. Explicitly rejected / covered source families

- CBM graph database, parser pipeline, FTS, semantic store and incremental graph patcher: REJECT as duplicate graph authority; Grafel remains provider.
- MCP graph/search/trace tools: COVERED by Agent Core Code Intelligence/Grafel surfaces.
- `ingest_traces`: NOT ADOPTABLE from this revision; exact handler returns `Runtime edge creation from traces not yet implemented`.
- OTLP trace parsing helpers without a working graph-ingest consumer: REJECT as orphan machinery.
- compact text/tree output: already covered by bounded MCP/result projection patterns; no second formatter subsystem.
- activation transaction: mostly covered by current staged provider provisioning/checkpoints/rollback patterns; no separate installer authority.
- project lock/index-worker supervisor: provider-owned behavior, not a second Agent Core daemon supervisor.

## 5. Reference disposition

**CONSUMER-ONLY / MOVED.** CBM-P1 is already adopted/live. The only surviving source-backed value is CBM-C1, gated on a future Agent Core-owned Grafel binary install/update mutation that does not exist today. The checkout is not a corpse, but it is no longer an active adoption candidate and belongs under the protected `Consumer` holding area.

## 6. Approved execution result — 2026-09-27

CBM-P1 is implemented in current source/dist. Code Intelligence now attests the qualified Grafel executable digest and resident daemon build identity, exposes attestation in health/diagnostics, and blocks provider mutation/startover on a proven metadata/resident mismatch while keeping unverifiable evidence fail-soft.

Targeted qualification is recorded in `docs/CBM-SpecKit-Adoption-Execution-20260927.md`. Compiled readback against the real provider returned `state=current` with exact executable SHA-256 and resident engine PID 26676.

CBM-C1 remains approved but conditional because Agent Core still does not own a Grafel binary install/update mutation. The reference remains preserved under `Consumer` for that explicit future condition. CBM-P1 live activation is complete and installed-runtime verified; evidence is recorded in `docs/CBM-SpecKit-Adoption-Execution-20260927.md`.

## 7. Final lifecycle re-grounding — 2026-09-27

Current Code Intelligence source was rechecked after CBM-P1 live activation. Agent Core still has no owned Grafel binary install/update mutation; CBM-C1 therefore remains consumer-bound maintenance evidence only. The duplicate CBM graph/store/parser/runtime families remain rejected or covered by Grafel.

The exact checkout was moved from the active protected root to `Consumer\codebase-memory-mcp`, preserving HEAD `4d8ac9e1cea0d645a02f876f47536c54a5bfa406`, the pre-existing tracked deletion `Formula`, and the pre-existing audit ZIP unchanged.

No Code Intelligence runtime behavior, provider binary, Grafel registration, build, restart, or release state was changed.
