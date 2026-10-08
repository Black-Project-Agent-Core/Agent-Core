# Reference Wave — Supermemory / Codebase Memory MCP / Continuous Claude / Obsidian API / SIE / Spec-Kit

> **Status:** SOURCE-FIRST GROUNDING COMPLETE — CBM-P1/SPK-P3 ADOPTED + LIVE-VERIFIED — CONDITIONALS RETAINED
> **Grounded:** 2026-09-27
> **Authority:** exact source/tests first; current Agent Core source/runtime second; Grafel only a structural second opinion.

## 1. Scope and current Agent Core baseline

The audit compared six protected references against Agent Core v0.13.0 / 70-tool architecture. Existing owners include file-native Memory, Learning review/evidence, artifact-only Skills, Grafel Code Intelligence, Semantic IDE/LSP, Activity Tracker/Reflexion, MCP mutation safety and bounded result handling.

The audit did not treat README/product claims as implementation proof. A temporary request-scoped Grafel workspace was allowed on protected paths. Supermemory graph coverage became available; the other registered reference graphs remained unavailable, so exact source stayed final authority.

Active Agent Core `src`, `scripts`, and `tests` contain zero path dependency on any of the six reference checkouts.

## 2. Reference disposition summary

| Reference | Revision | Planning result | Reference state |
| --- | --- | --- | --- |
| Supermemory | `2415a5c796d62c7ea9d709bc9337a6e1b6f6d837` | SM-P1 already live; SM-C1 + SM-C2 conditional on real native AI prompt/session consumers | RETAIN |
| Codebase Memory MCP | `4d8ac9e1cea0d645a02f876f47536c54a5bfa406` | CBM-P1 current-fit exact-build provider cohort attestation; CBM-C1 conditional provider-maintenance barrier | RETAIN |
| Continuous Claude | `b9d8ccf9343905d33a1296583114e3326fe102d3` | CCLAUDE-C1 conditional native Agent Runtime continuation envelope | RETAIN |
| Obsidian API | `cc1744324150c632416857c98964f87b1574a5fc` | declaration-only package; no implementation-backed adoption | RETIRED / DELETED |
| Self-Improving Agent Ecosystem | `f06504750b32c3b6a6e06b56ee6e69dc4476f333` | exact historical snapshot already exhaustively adopted/rejected; no new value | RETIRED / DELETED AGAIN |
| Spec-Kit | `307b3a537fb39721adc7c00aa18adfa1582649aa` | prior SPK-P1/P2 live; SPK-P3 current-fit external Skill renderer/export; SPK-C2/C3 conditional | RETAIN |
## 3. Important source corrections and exclusions

### Codebase Memory MCP
- graph/store/parser/index pipeline is not adopted because Grafel is the maintained structural provider;
- `ingest_traces` is not a real graph-enrichment implementation in this revision: its exact handler returns `Runtime edge creation from traces not yet implemented`;
- the strongest surviving mechanism is exact-build cohort identity/admission. Current Agent Core already stores Grafel `executableSha256` in `runtime/grafel/provider.json`, but health does not attest installed/resident provider identity against that qualified metadata.

### Continuous Claude
- bounded run/time/cost/call/stall/error/completion mechanisms are executable source, not README-only;
- dangerous permission/sandbox bypass, autonomous Git commit/PR/merge, and a hidden current MCP provider loop are explicitly rejected;
- current Agent Core has no native prompt/model execution owner under `src`, so continuation mechanics remain conditional on the future Agent Core AI workstream.

### Supermemory
- SM-P1 forget/restore is already native/live;
- owned Memory-context replacement remains conditional because no prompt assembler exists;
- source tests additionally substantiate tool-call/tool-result conversation normalization and fail-soft handling of non-serializable tool inputs; this is retained only for a future durable conversation/session consumer.

### Spec-Kit
- the existing Agent Core Skills subsystem now creates a real consumer for the previously conditional external-agent renderer idea;
- SPK-P3 is preview/export only: no external host configuration mutation and no execution authority;
- layered preset and hook/event products remain conditional.

## 4. Zero-value retirement evidence

Self-Improving Agent Ecosystem:
- current HEAD equals the prior retired revision;
- after removing the audit marker, current source is **48/48 byte-identical** with the historical per-file SHA-256 retirement inventory;
- no active source/script/test dependency and no external process consumer;
- deleted again under the explicit corpse rule.

Obsidian API:
- package declares `main: ""` and `types: obsidian.d.ts`;
- tracked behavior surface is declarations only (`obsidian.d.ts`, `canvas.d.ts`, `publish.d.ts`), with no runtime implementation/tests;
- an Obsidian integration built from these declarations would be a new product design, not steal/use of executable behavior;
- no active dependency/process consumer; deleted under the corpse rule.

## 5. Audit cleanup / safety boundary

The temporary Grafel workspace `audit-steal-use-wave-20260927b` was unregistered. Repo-local audit markers were removed.

Retained checkout state after audit:
- Supermemory: clean;
- Spec-Kit: clean;
- Codebase Memory MCP: only the pre-existing tracked deletion `Formula` plus pre-existing/untracked audit ZIP remain;
- Continuous Claude: only the pre-existing/untracked audit ZIP remains.

This pass writes/updates plans and retires zero-value references only. It does **not** implement proposals, install dependencies, build/restart Agent Core, run product test suites, apply releases, commit, tag, push, publish or deploy.

## 6. Approved execution supersession — 2026-09-27

The user subsequently approved the review surface. Current-fit CBM-P1 and SPK-P3 are now source/dist implemented and targeted verified. Current execution authority is `docs/CBM-SpecKit-Adoption-Execution-20260927.md` and CODEBASE section 0.1.52.

SM-C1/SM-C2, CBM-C1, CCLAUDE-C1 and SPK-C2/SPK-C3 are approved but remain conditionally deferred because their explicit native consumers are still absent. No hidden consumer subsystem was created solely to force adoption.

The four retained references remain retained after post-adoption census because each still has genuine source-backed conditional value. CBM-P1/SPK-P3 resident activation is now complete and installed-runtime verified; activation evidence is recorded in `runtime/tmp/cbm-speckit-live-activation-closure-20260927.md`.
