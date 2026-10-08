# CBM / Spec-Kit Approved Adoption Execution — 2026-09-27

> **Status:** COMPLETE — SOURCE/DIST TARGETED VERIFIED — LIVE-ACTIVATED — INSTALLED-RUNTIME VERIFIED
> **Product version:** stable `0.13.0`; no release apply/version bump.
> **Approved planning wave:** Supermemory, Codebase Memory MCP, Continuous Claude, Spec-Kit conditional/current-fit residuals.
> **Implemented now:** CBM-P1 + SPK-P3.
> **Approved but condition not met:** SM-C1/SM-C2, CBM-C1, CCLAUDE-C1, SPK-C2/SPK-C3.

## 1. Consumer/condition gate

Canonical Memory and current source were re-read before implementation.

The native Agent Core AI direction remains a separate future workstream. Current `src` contains UI/status `agentRuntime` contracts but no native model/provider prompt/session execution owner. Therefore:
- Supermemory SM-C1/SM-C2 remain deferred;
- Continuous Claude CCLAUDE-C1 remains deferred;
- no prompt injector, conversation database, provider loop, autonomous Git loop or hidden orchestration system was created.

Code Intelligence does not own an in-process Grafel binary installer/updater, so CBM-C1 remains deferred.

Skills is a real current artifact consumer, so SPK-P3 is active. Existing qualified Grafel runtime metadata/process evidence makes CBM-P1 active.
## 2. CBM-P1 — exact-build Grafel/provider cohort attestation

Implemented inside existing Code Intelligence ownership:
- `src/code-intelligence/types.ts`
- `src/code-intelligence/grafel-runtime.ts`
- `src/code-intelligence/service.ts`

Agent Core now compares:
- qualified `runtime/grafel/provider.json.executableSha256`;
- SHA-256 of the configured project-local Grafel executable;
- selected provider version/source commit metadata;
- daemon-reported version/build commit and `engine_pid`.

Attestation states:
- `current`
- `metadata-mismatch`
- `resident-mismatch`
- `unverifiable`

Real mismatches degrade Code Intelligence health and refuse Code Intelligence provider mutations/startover paths. `unverifiable` remains fail-soft and is recorded as evidence. This never gates Memory or general machine control.

No CBM graph/store/parser/daemon runtime was imported.
Mutation protection is wired to explicit Code Intelligence provider mutations:
- workspace registration/unregistration;
- applied stale-workspace pruning;
- indexing requests;
- ref pin/unpin and applied ref pruning;
- quarantine mutation;
- provider bootstrap/start and bootstrap index refresh.

Diagnostics now expose the provider attestation alongside existing provider metadata.

Compiled candidate readback against the real qualified Grafel runtime returned:
- state: `current`;
- expected/observed executable SHA-256: `7c83af3dd0a8870abd07174792b8f1666319b20111ec4bfda06bb2e18d4bcff3`;
- expected source commit: `45f9745d02f3662a8516fb35cd2d0624acf82cbf`;
- resident reported commit prefix: `45f9745d0`;
- resident engine PID: **26676**.

## 3. SPK-P3 — deterministic external-agent Skill export

Implemented inside existing artifact-only Skills ownership:
- `src/skills/service.ts`
- `src/mcp/skills-schemas.ts`
- `src/mcp/skills-tools.ts`
The existing `skills` MCP tool gains one additive action: `render_export`.

Reviewed profiles:
- `claude` -> target layout `.claude/skills/<skill>/...`
- `codex` -> target layout `.agents/skills/<skill>/...`

Exports are written only under Agent Core-owned:
`runtime/skills/exports/<profile>/<skill>/`

Each export contains:
- the active Skill files;
- deterministic per-file SHA-256/size records;
- `manifest.json` with profile, target-relative root, active Skill digest and source provenance;
- deterministic manifest digest.

The renderer does not write project/home `.claude`, `.agents`, editor config or other AI-host configuration. It does not invoke Claude/Codex and grants no execution authority.

Active Skill catalog/revision state is unchanged by rendering.
## 4. Targeted verification

Authorized affected-scope verification:
- `tests/cbm-speckit-adoption-wave.test.ts`: **3/3 PASS**;
- `tests/code-intelligence-health-refresh.test.ts`: **12/12 PASS**;
- `tests/code-intelligence-finalization.test.ts`: **8/8 PASS**;
- `tests/mcp-schema-contract.test.ts`: **2/2 PASS**;
- `tests/mcp-manifest-contract.test.ts`: **2/2 PASS**;
- combined targeted result: **27/27 PASS**.

Build:
- `npm run build`: **PASS**;
- path policy: **260 authored files / 0 exceptions**.

Compiled-dist probes:
- real Grafel exact-build attestation: **current**;
- isolated compiled Skill Claude/Codex export: **PASS**, active/export source digest identical.

MCP manifest:
- **70 tools**;
- **116,215 bytes / ~29,054 tokens**;
- within reviewed **120,000-byte / 30,000-token** budget.
Release:
- `release:check-intent`: **ok=true**;
- intent: `.changeset/20260927-cbm-speckit-provider-skill-adoption.md` (minor);
- `release:compat` remains `ok=false` because the current-line baseline still includes intentionally retired legacy `partner`;
- HTTP routes unchanged;
- this wave removes no MCP tool/route and adds no new tool name.

Structural review:
- Agent Core Grafel graph explicitly reindexed and returned current/complete **1/1**;
- providerAttestation impact reaches health/bootstrap/provider mutation surfaces;
- renderExport impact reaches SkillService/MCP Skills wiring and the new direct test scope;
- Grafel test-reachability reports 0% because no TESTS/coverage edges are ingested for this group, so that metric is not used as a quality claim; exact source + direct tests remain authority.

## 5. Post-adoption reference census

Retain:
- `codebase-memory-mcp`: CBM-P1 adopted; CBM-C1 remains genuine conditional value if Agent Core later owns provider install/update mutation;
- `spec-kit`: SPK-P3 adopted; SPK-C2/SPK-C3 remain genuine conditional value;
- `memory/19-supermemory`: SM-C1/SM-C2 remain conditional on real native AI prompt/session consumers;
- `continuous-claude`: CCLAUDE-C1 remains conditional on the separate native Agent Core AI runtime.
No retained reference is a corpse after this wave because each still has a source-backed conditional mechanism with an explicit future consumer condition. No new reference deletion is justified.

Previously retired Obsidian API and Self-Improving Agent Ecosystem remain absent.

## 6. Activation closure

The user restarted/reconnected Agent Core after source/dist qualification. Installed-runtime acceptance is complete.

Live resident evidence:
- launcher PID **8056**, Node Core PID **20336**, native dump helper PID **16888**, tunnel PID **8336**;
- Node Core runs project-local `runtime\node\node.exe -> dist\index.js`;
- `/health=ok` on Agent Core **v0.13.0**;
- Memory remains available with `issueCount=0`.

CBM-P1 live acceptance:
- Code Intelligence health is `available`, index `current`, provider `issueCount=0`;
- health and `code_orient(diagnostics)` expose `providerAttestation.state=current`;
- expected/observed executable SHA-256 match exactly at `7c83af3dd0a8870abd07174792b8f1666319b20111ec4bfda06bb2e18d4bcff3`;
- selected source commit `45f9745d02f3662a8516fb35cd2d0624acf82cbf` matches resident build prefix `45f9745d0`;
- resident Grafel engine PID is **6056**.

SPK-P3 live acceptance:
- fresh authenticated direct MCP `tools/list` returns **70 tools**;
- fresh `skills` descriptor exposes `render_export` plus `profile=claude|codex`;
- fresh descriptor fingerprint is `sha256:31e712d8a4f6e2e91e4246a9b5732cf7da79408438f9a8bb2bd67dc5063b2c94`;
- temporary live Skill import/inspect/render to Claude and Codex both succeeded with the same active source digest;
- exports stayed under Agent Core-owned `runtime/skills/exports`;
- cleanup removed the temporary source, catalog artifact, Claude export and Codex export;
- post-cleanup `skills status` returned `skillCount=0`, `executionAuthority=false`, export profiles `claude/codex`.

The tool schema embedded in this already-open ChatGPT conversation still carries the pre-restart cached Skills action enum. That cache is not authoritative for installed state; the fresh authenticated resident MCP descriptor above proves `render_export` is live.

Current state:

**COMPLETE — TARGETED VERIFIED — LIVE-ACTIVATED — INSTALLED-RUNTIME VERIFIED.**

Activation evidence: `runtime/tmp/cbm-speckit-live-activation-closure-20260927.md`.

Approved conditional items remain deferred for their explicit future consumers; no hidden consumer system was created.

No dependency installation was required. No release apply, version bump, commit, tag, push, publish or deploy occurred.
