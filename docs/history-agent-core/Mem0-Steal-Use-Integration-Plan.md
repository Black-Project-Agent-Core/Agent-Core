# Mem0 Steal / Use Integration Plan

> **Status:** M0-P1 COMPLETE — TARGETED VERIFIED — LIVE-ACTIVATED — INSTALLED-RUNTIME VERIFIED — REFERENCE RETIRED
> **Grounded:** 2026-09-27
> **Reference:** `DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT\memory\17-mem0`
> **Repository:** `https://github.com/mem0ai/mem0.git`
> **Revision:** `b51f7692f002d4f8719dd5c0f23d4d129003757d`
> **Branch:** `main`
> **License:** Apache-2.0

## 1. Source-first evidence

Fresh census found 1,787 non-Git files, 1,022 executable-code files and 292 test files. The main source audit covered `mem0/memory/main.py`, history/storage/config/factory paths and direct search/add/update/delete behavior.

The checkout had pre-existing tracked deletions of multiple `CLAUDE.md` files before this audit. They are user-existing state and must not be restored. Temporary Grafel markers are audit-only.

## 2. M0-P1 — non-destructive canonical Memory expiry

**Disposition:** STRONG CURRENT-FIT PROPOSAL — user selection required.
Source evidence:
- `_normalize_expiration_date` and `_payload_is_expired` in `mem0/memory/main.py`;
- add/update accept an expiration date;
- default get/search paths exclude expired payloads while preserving stored history;
- expiry controls retrieval visibility rather than causing immediate hard deletion.

Verified Agent Core gap:
- Agent Core has temporal validity on Memory links, but not on a Memory record itself;
- retention scoring and retirement review are advisory and age/access based, not an explicit controller-declared expiry contract;
- no record-level `expiresAt` field currently filters `memory_search`.

Proposed adaptation:
- add optional canonical `expiresAt` metadata to non-pinned Memory records;
- validate as an offset-aware/UTC timestamp and reject invalid values;
- pinned foundational Memory cannot expire through ordinary APIs;
- expired records remain canonical/history-readable by exact ID and exportable as historical evidence, but are excluded from ordinary active `memory_search` and linked expansion;
- `memory_list/page` expose expiry state without silently deleting records;
- `memory_retirement_review` may surface expired records as high-signal review candidates, but no auto-delete occurs;
- transfer/import/revisions/provenance preserve expiry;
- update/delete remain explicit controller-authorized actions.
Acceptance:
- old records without `expiresAt` behave identically;
- expired records are excluded deterministically from active recall but remain readable by ID;
- activation/expiry depends only on timestamp evidence, never model judgment;
- linked expansion cannot resurrect an expired target;
- pinned foundation cannot be expired;
- import/export round-trips expiry without widening workspace authority;
- no background timer/worker is required.

## 3. Covered / rejected source families

Already covered or stronger:
- canonical revisions/history: native bounded revisions + evolution history;
- BM25/embedding/reranking: native legacy/BM25/fusion + qualified embedding path;
- provenance/workspace scoping: native provenance/workspace filtering;
- relationship graph: typed Memory links + Grafel;
- explicit feedback and retirement review: native Memory feedback/retirement.

Rejected:
- LLM-driven automatic fact extraction and autonomous ADD/UPDATE/DELETE decisions;
- alternate vector/database/SQLite canonical stores;
- telemetry pipeline and second entity graph authority;
- provider factories and second embedding/reranker/LLM runtime;
- automatic decay that mutates/deletes canonical records without explicit controller review.

## 4. Reference disposition

**RETAIN.** M0-P1 is a current-fit source-backed proposal awaiting review. No implementation, dependency install, build, restart or release action is part of this grounding pass.

## 5. Approved execution result — 2026-09-27

M0-P1 is present in current source/dist as optional canonical `expiresAt` with active-recall filtering and historical exact-read preservation. Direct wave acceptance verified expired Memory remains canonical/readable while excluded from active recall.

The reference was freshly re-cloned/pinned for execution grounding, then retired after post-adoption census found no active dependency or remaining current-fit residual. Full evidence is in `docs/Memory-Reference-Wave-16-21-Adoption-Execution-20260927.md`.

Live resident activation is complete after the user-controlled restart/reconnect; installed-runtime acceptance is recorded in `docs/Memory-Reference-Wave-16-21-Adoption-Execution-20260927.md`.
