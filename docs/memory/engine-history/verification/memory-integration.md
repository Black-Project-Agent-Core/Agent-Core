> **Historical document, superseded for current Memory placement on 16 October 2026.** Preserve the dated evidence below; do not recreate its old SubProject, MCP-owned memory files, or storage locations. Current ownership and installation status: [Memory consolidation](../../CONSOLIDATION.md).

# Final cross-phase integration correction

Status: **Final integrated acceptance PASS, 2026-10-07 23:19 UTC**, within the documented synthetic Linux and isolated-restore scope. FI-1 and FI-2 passed independent scoped re-review. This does not claim live autonomous-controller reliability, Windows support, release or deployment readiness.

Base: `cb433fce97b034dbfab6b1844ec82b47f1decf4e`, `feat/memory-evolution`.

## FI-1: complete saved-plan schema

The independent integration review found that ordinary pending and applied consolidation documents include `eligibleIds`, while the strict schema exposed to transfer omitted that field. Complete export therefore rejected engine-written state. The field is now a required safe-ID array in the single promotion-owned saved schema. All three runtime readers and transfer reuse it directly; strict unknown-field rejection remains enabled.

The six public-API pending/applied cases for retain, value-bearing creation and T6 temporal transition all failed against the preserved pre-fix installed package with `MEMORY_TRANSFER_SCHEMA_INVALID`. Five negative tests were intentionally outside that selected RED run. An earlier fixture mistakenly attempted typed creation through legacy `remember()`; it was corrected to use reviewed public promotions, and those fixture errors are not counted as product defects.

## FI-2: projected outputs versus retained sources

After the schema-only repair, the pending temporal case exposed a related defect: transfer treated a plan's transition `audit.after` references as already published archive objects and rejected a valid pending plan with `MEMORY_TRANSFER_UNRESOLVED_REF`.

The promotion owner now supplies an inspection-only reference view for saved plans and prepare-operation receipts. It validates the complete strict shape, plan digest, saved snapshot binding, projected output identities, scope, and exact semantic hashes before excluding only the planned `audit.after` references from retained-source traversal. Original persisted bytes remain untouched. Actual inputs, saved receipts and applied archive output references remain required. This is not a blanket exclusion of fields named `after`, and does not treat a proposed result as published evidence.

## Public cross-phase fixtures

All production operations import only the package-root public API. Synthetic filesystem edits are limited to explicit corruption fixtures and byte-equality assertions.

- Pending and applied retain, value-bearing create and temporal transition: complete export, preview, isolated restore, restored pending apply, operation replay, public continuation, and a second complete restore.
- Temporal records are created through reviewed public promotion; `asOf` answers assert the original and successor states on either side of the transition.
- Each transferred file is compared byte-for-byte. Planned outputs are absent from `retainedRefs` before apply, while actual outputs are retained afterward.
- Missing, null, string and unsafe-ID `eligibleIds`, plus an unknown saved-document field, are rejected before destination activation and by the runtime reader.
- A checksum-valid projected-output hash mismatch (with the plan digest recomputed), a missing actual input revision and a missing applied output manifest are rejected. No source data or activation marker is silently invented.

Verification passed: build + **503/503 tests on 27 files**, terminal exit 0, in **240.50s**; broader targeted **192/192 on eight files**, exit 0, in **30.29s**. No failed/pending/todo in either final run. The 14 public cross-phase cases also passed against the actual installed package. The original reviewer proof now exports successfully before, during and after consolidation. Fixed T8 1000-record median/p95 ratios remained PASS at **0.4339 / 0.4495**, with thresholds unchanged.

The real 301-file package passed fresh offline named-package runtime and declaration consumers, complete pending/applied promotion restore and replay, and the earlier retained-workspace scope regression. Runtime/test/archive/private environment-path scans were empty. Source hashes and command receipts are recorded in [machine-readable evidence](memory-integration.json).

## Scope and remaining boundaries

No dependency or extraction-provenance change, monolith edit, push, release or deployment. Saved plans, proposed records and historical timestamps are preserved without rewriting. Host review policy is re-established at a restored destination, not imported as authority. Planned-reference integrity is not proof of natural-language truth or authorization.

Live autonomous controller A→B: **NOT RUN**. Separate Windows matrix: **NOT RUN**. Final integrated acceptance requires scoped independent re-review of these corrections.


## Final acceptance

Independent re-review of e97534dc22e1b6c483eaa93f1eb507dda39a7664 passed. Reviewer reran all14 cross-phase cases and original proof, verified full503/targeted192/installed14 terminal evidence, source hashes, installed source/build equality and package digest. No unresolved blocking finding remains within the approved implementation and tested Linux scope. Live autonomous controllers and native Windows remain NOT RUN.
