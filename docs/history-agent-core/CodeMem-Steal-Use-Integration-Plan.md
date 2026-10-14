# CodeMem Steal / Use Integration Plan

> **Status:** COMPLETE — TARGETED VERIFIED — LIVE-ACTIVATED — INSTALLED-RUNTIME VERIFIED — REFERENCE RETIRED
> **Grounded:** 2026-09-27
> **Reference:** `DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT\memory\15-codemem`
> **Revision:** `bd78c065e0fc7155195a920225655bdcf24b2fae` (main, clean before inspection marker)
> **License:** MIT
> **Runtime dependency:** NONE
> **Scope exclusion:** New Chat, prompt injection/runtime recall, model/session runtime.

## 1. Grounding evidence

Fresh source census: 1,264 files, 968 executable-code files, 389 test-code files, 23,884,627 bytes, 0 reparse points.

The main executable families were inspected across:
- `packages/core` (357 code files): retrieval ledgers, outcome evidence, attribution, export/import, extraction/distillation, storage/sync/scope/session logic;
- `packages/cli`, `packages/mcp-server`, Claude/Codex/OpenCode plugins: alternate adapters/surfaces;
- coordinator/cloud/device replication packages;
- embeddings;
- UI/viewer;
- e2e/evaluation/scripts.

Grafel registration succeeded but this checkout's graph was unavailable in the current provider session, so exact source/tests are the sole authority for this plan.

Current Agent Core overlap:
- Memory retrieval has BM25/fusion/scoring and updates aggregate `retrievalCount/lastAccessedAt`;
- Activity Tracker records bounded/redacted events and typed feature outcomes;
- Memory feedback records bounded explicit helpful/not-helpful/stale/wrong salience;
- there is **no persisted per-retrieval attempt/exposure ledger**, no conservative retrieval attribution report, and no canonical Memory export/import contract.

## 2. Selected proposals

### CODEMEM-P1 — bounded Memory retrieval exposure ledger

Source mechanisms:
- `retrieval-ledger.ts` / `retrieval-surface-ledger.ts`;
- strict attempt/exposure contracts, bounded score summaries/reason codes, idempotency conflict handling, explicit retrieval vs delivery state, retention bounds and query hashing.

Agent Core adaptation:
- add an Agent Core-owned bounded auxiliary retrieval ledger under existing Memory/tracker state; use existing crash-safe bounded event-log primitives rather than SQLite;
- record one stable attempt ID for explicit Memory searches and other reviewed Memory retrieval surfaces;
- capture only bounded metadata:
  - surface/trigger;
  - start/completion;
  - retrieval status and controller-delivery status;
  - candidate/selected counts;
  - workspace/ranking profile/limit/budget;
  - SHA-256 query digest + character/token estimate, not raw query by default;
  - bounded exposures for selected/dropped/deduped/trimmed results;
  - Memory ID, rank, current updated/fingerprint evidence, score components/reason codes;
  - failure stage/category when applicable;
- define `delivery=returned-to-controller` narrowly; never claim the model read or used returned Memory;
- obey current workspace evidence-capture policy/redaction;
- bounded retention and compaction; no new DB or background worker.

Acceptance:
- one idempotent attempt cannot be recorded twice with conflicting content;
- raw sensitive query/body content is not required;
- retrieval failure and delivery failure remain distinct;
- exposure count/size limits fail closed or truncate explicitly;
- ordinary retrieval correctness does not depend on ledger availability;
- old Memory state remains valid.

### CODEMEM-P2 — conservative Memory retrieval attribution diagnostics

**Depends on CODEMEM-P1 if selected.**

Source mechanisms:
- `attribution-assessment.ts`, `attribution-diagnostics.ts`, `outcome-evidence.ts`;
- explicit distinction between retrieval handoff and actual model use;
- observational vs randomized evidence;
- unassessed vs validated-unknown vs known;
- invalid/omitted rows reported as incomplete/indeterminate rather than silently ignored;
- bounded overhead and stale/harmful findings.

Agent Core adaptation:
- read-only diagnostics joining:
  - retrieval ledger attempts/exposures;
  - explicit `memory_feedback`;
  - bounded Activity Tracker feature outcomes;
  - source/provenance evidence where available;
- report lifecycle counts, evidence completeness, overhead samples and stale/harmful review findings;
- expose limitations in the result contract;
- classify ordinary evidence as observational only;
- never infer causal benefit from correlation or from `returned-to-controller`;
- optional Learning curator integration is **proposal-only**: diagnostics may produce review evidence refs but never reweight/delete/update Memory automatically.

Acceptance:
- no assessment can become known/helpful/harmful without valid linked evidence;
- omitted/invalid evidence produces explicit incomplete/indeterminate status;
- no per-memory ROI or synthetic productivity score;
- diagnostics do not mutate Memory, Learning, ranking weights or feedback state;
- bounded rows/time window prevent unbounded scans.

### CODEMEM-P3 — portable canonical Memory export/import contract

Source mechanisms:
- `export-import.ts` and its direct tests;
- versioned export payload;
- scope-aware export;
- dry-run import;
- stable idempotent import keys;
- project remap/source metadata preservation;
- locally authorized-scope enforcement;
- no-op repeat import.

Agent Core adaptation:
- introduce an explicit, versioned Agent Core Memory transfer format containing canonical non-pinned Memory records and required relationship/provenance metadata;
- export is explicit/controller-requested and workspace-scopeable; never automatic;
- import defaults to dry-run/preview and reports:
  - creations;
  - exact duplicates;
  - ID/link remaps;
  - conflicts/rejections;
  - unsafe or unauthorized records;
- stable source import keys make identical re-import a no-op;
- import never overwrites pinned foundation;
- all apply-mode canonical mutations use existing Memory transaction coordinator/batch semantics and fail all-or-nothing;
- source identity/provenance is preserved as historical data, never instruction authority;
- collision remapping must repair links deterministically;
- explicit apply confirmation is required; no import can silently widen workspace authority.

Acceptance:
- repeated identical import creates zero duplicates;
- dry-run changes nothing;
- malformed/unsupported payload version fails before mutation;
- pinned foundation cannot be replaced;
- link remapping is deterministic and referentially complete;
- unauthorized scope/provenance widening fails closed;
- partial apply failure rolls back;
- no Codemem DB/session/runtime dependency is added.

## 3. Covered / rejected families

Covered:
- Memory BM25/fusion/redundancy search;
- file-native canonical storage and embedding;
- Activity Tracker feature outcome pool;
- Memory feedback and retention review.

Rejected:
- automatic recall/prompt injection/session hooks;
- model-driven extraction/distillation and autonomous memory generation;
- alternate SQLite/vector/schema persistence;
- cloud coordinator/device replication/sync authority;
- alternate MCP server/CLI/Claude/Codex/OpenCode adapters;
- UI/viewer surfaces;
- alternate embedding providers.

Support/evidence:
- e2e/evaluation fixtures used only as source evidence for selected contracts.

## 4. Reference disposition

**RETIRED/DELETED 2026-09-27.** CODEMEM-P1/P2/P3 were independently implemented and targeted-verified. Fresh post-adoption census found zero current `src`/`scripts` path dependencies, zero non-shell live consumers, and no remaining current-fit ecosystem family. Retirement evidence: `runtime/tmp/graphiti-claude-codemem-tencent-post-adoption-retirement-20260927.json`.

## 5. Approved implementation closure — 2026-09-27

- **CODEMEM-P1:** `src/memory/retrieval-ledger.ts` provides bounded crash-safe auxiliary retrieval attempt/exposure evidence with stable attempt IDs, query SHA-256 (not raw query), retrieval-vs-controller-delivery status, bounded score/reason evidence, idempotency conflict detection, and fail-soft persistence.
- **CODEMEM-P2:** `memory_retrieval_diagnostics` joins bounded retrieval evidence with explicit Memory feedback and local Activity Tracker outcomes. It reports incomplete/observational limitations and never claims model use, causation, ROI, automatic reranking, or automatic Memory mutation.
- **CODEMEM-P3:** `src/memory/transfer.ts` plus `memory_export`/`memory_import` provide versioned portable canonical Memory transfer, preview-by-default, explicit `APPLY_MEMORY_IMPORT` apply confirmation, stable import keys, deterministic ID/link/evidence remapping, scope authorization, pinned-foundation preservation, and existing canonical transaction authority.

No CodeMem DB, session runtime, prompt injection, cloud coordinator, adapter, UI, or model/embedding stack was added.

Verification: targeted adoption/regression/manifest suite 12/12 PASS; raw query absence is directly tested; transfer preview/apply/re-import/link remap is directly tested; build PASS; path policy 258/0. After the user-controlled restart/reconnect, resident Core PID 1624 is running `runtime\node\node.exe -> dist\index.js`, `/health` is `ok`, the fresh connector exposes 70 tools, and `memory_retrieval_diagnostics`, `memory_export`, and `memory_import(mode=preview)` all execute live. CODEMEM-P1/P2/P3 are therefore live-activated and installed-runtime verified.
