# Local XLSX Projection Evidence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement task-by-task after Main approves the design. The assigned existing worker may implement; this plan does not authorize child agents. Steps use checkbox syntax.

**Goal:** preserve sparse XLSX/XLSM cell content and deliver bounded, SHA-256-bound source locations through existing local markdown `read_file`.

**Architecture:** extend the current ExcelJS converter with direct source addresses and emission-time output spans. One optional sidecar travels through existing projection/FileResult/handler/MCP owners; changed text invalidates spans. Preserve native Excel behavior and strict public URL admission.

**Tech Stack:** existing TypeScript/Node, ExcelJS, Vitest and Node crypto; no new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-26-weknora-xlsx-evidence-design.md` (APPROVED by Main with incremental byte admission and literal existing-owner first RED amendments).

## Global Constraints

- Phase 1: existing local XLSX/XLSM markdown reads only; no public URL/web-research expansion, formula recalculation, dependency installation or Memory integration.
- `XLSX_MAX_SHEETS=8`; `XLSX_MAX_ROWS_PER_SHEET=5,000` data-bearing rows; `XLSX_MAX_COLUMNS=128` physical columns.
- `XLSX_MAX_RENDERED_CELLS=65,536` global rectangular slots; `XLSX_MAX_CELL_CODEPOINTS=2,048`.
- `XLSX_EVIDENCE_MAX_CELLS=128`; `XLSX_EVIDENCE_MAX_EXCERPT_CODEPOINTS=160`; `XLSX_EVIDENCE_MAX_BYTES=16,384` compact UTF-8 JSON including coverage.
- Keep existing `DOCUMENT_OUTPUT_MAX_BYTES=4 MiB`, input/ZIP guards, cancellation, MCP envelope budget and non-persistable `read_file` policy.
- Enforce 4 MiB incrementally before retaining/appending cells/rows, with reserved omission-marker bytes. Only one bounded incomplete row may be staged; discard its pointers if the row cannot be admitted. Do not build the whole matrix then truncate.
- Source input SHA-256; exact Unicode-codepoint output spans only while their body binding remains exact. Clear spans after changed text/redaction/preview. No source spans for synthetic markup/notices/placeholders.
- Default/native Excel, `.xls`, input schemas, grants, tool names and capability descriptors remain unchanged. Main owns CODEBASE integration and final activation.

## Review Focus

- Sparse row/column indices must not be replaced by counts; test A1/Z100 and a distant physical row in Task 1.
- Repeated text and escaped/astral Unicode must map by emission, not text search; pin literal address/span assertions in Task 1.
- Shared strings, cached/missing formulas and merged references must not imply calculation or independent repeated facts; fixture flags in Task 1.
- Hidden content, oversized rows/cells/sheets and columns beyond DX must retain honest omission/visibility; boundary tests in Tasks 1–2.
- Redaction, forged evidence, repeated budgeting and escaped JSON envelope growth must never leave stale pointers or leak original marker payloads; tests in Task 3.

---

### Task 1: Direct sparse rendering and source-evidence contract

**Files:** create `src/rdc/document-projection/xlsx-evidence.ts`; modify `src/rdc/document-projection/office-converters.ts` and `types.ts`; create `tests/xlsx-projection-evidence.test.ts`.

**Interfaces:** export `XlsxEvidence`, the spec's exact limits, `XLSX_EVIDENCE_BLOCK` (internal symbol), and `finalizeXlsxEvidence(evidence: XlsxEvidence, options?: { maxBytes?: number; deliveredText?: string; outputTransformed?: boolean }): XlsxEvidence | undefined`. Add `ProjectionResult.xlsxEvidence?: XlsxEvidence`. Finalization must return a bounded copy, validate finite/integer coordinates and span equality, clear spans on changed binding, and never promote unknown coverage.

- [x] Obtain Main's approval of the linked design; recheck the current converter, helper and result-budget sources. Preserve unrelated changes and donor read-only status.
- [x] Write failing fixture tests for literal A1=`Header`, Z100=`Sparse 😀 | \\ value` and a second sheet with the same value at B7. Add a distant physical row with only a few populated rows. Assert every intended value survives, source addresses equal the literal fixture map, SHA equals `createHash('sha256').update(inputBytes)`, and every span equals the exact delivered escaped substring. The oracle must not use the renderer/finalizer to calculate expected addresses or text.
- [x] Add tiny OpenXML/ExcelJS fixtures covering inline and shared-string storage, cached formula value, missing formula cache, hidden sheet/row/column and merged slave/master. Assert the spec's fidelity/flags; never assert that a cached result is a recalculated truth. Assert no evidence on table delimiters or empty/synthetic cells.
- [x] Run only the new suite and confirm the sparse-content/evidence tests fail against the current converter: `node node_modules/vitest/vitest.mjs run tests/xlsx-projection-evidence.test.ts`.
- [x] Implement the contract module and direct emission inside the existing XLSX converter. Enumerate actual data-bearing row references, use genuine addresses, compute capped physical width once, use non-mutating cell access, and preserve one sheet-wide column grid. Enforce the spec's row/column/global slot/cell-text bounds before rendering allocations. Produce offsets while appending already escaped strings; do not search output text.
- [x] Run the focused suite and the existing converter suite: `node node_modules/vitest/vitest.mjs run tests/xlsx-projection-evidence.test.ts tests/document-projection.test.ts`. Require the independent sparse fixture and unchanged native/default Excel cases to pass before proceeding.

### Task 2: Projection bounds and local FileResult delivery

**Files:** modify `src/rdc/document-projection/service.ts`, `src/rdc/utils/files/base.ts`, `src/rdc/tools/filesystem.ts`; extend the focused suite.

**Interfaces:** `FileMetadata.xlsxEvidence?: XlsxEvidence`. Change private `projectionToFileResult(result: ProjectionResult, options?: { includeXlsxEvidence?: boolean }): FileResult`; only the local `projectLocalFile` call enables it. Existing URL call sites leave it disabled.

- [x] Write failing tests at every specified row/sheet/column/global-cell/cell-text/evidence-byte limit. Include a source cell beyond DX, evidence record 129, repeated values after an omitted region and a projection crossing the existing 4 MiB output bound. Assert known omission reasons, absence of invented totals, valid compact JSON ≤16,384 bytes, and no spans after a changed body binding.
- [x] Add `readFileFromDisk` integration assertions: an explicit local markdown read carries `metadata.xlsxEvidence`, normal/native Excel output does not; input path/source-byte identity remains the already admitted snapshot. Test cancellation still propagates through the existing owner. No URL fetching is necessary.
- [x] Run the new suite RED, then wire the optional metadata and re-finalize evidence after `boundMarkdown`. On any changed body, clear all output spans and mark `output-transformed`; do not infer a valid suffix or search repeated text. Preserve original input SHA and decoded source coordinates.
- [x] Run the focused suite and `tests/document-projection.test.ts` GREEN. Verify only the local call enables metadata; strict `public-url.ts`, web-research service and schemas have no production diff.

### Task 3: Handler/MCP budgets and final acceptance

**Files:** modify `src/rdc/handlers/filesystem-handlers.ts`, `src/mcp/result-budget.ts`; extend `tests/xlsx-projection-evidence.test.ts` and `tests/mcp-result-budget.test.ts`. Main updates `docs/CODEBASE.md`.

**Interfaces:** model-facing local markdown `read_file` adds an owner-marked text block `{xlsxEvidence}`; UI preview omits this block. Extend the existing result-budget owner to recognize only `XLSX_EVIDENCE_BLOCK`, sanitize evidence/body, and preserve or invalidate binding as specified. No new public input option or tool schema.

- [x] Write failing end-to-end tests invoking actual `handleReadFile`, then actual `applyResultBudget('read_file', ...)`. Assert exact small-response body/span binding; metadata-only shrink leaves admissible text unchanged; body preview/redaction clears all spans and marks partial; the actual escaped JSON envelope stays within a 16 KiB test budget. A tiny unfit header may be omitted whole; no truncated JSON or stale pointers.
- [x] Test owner-marker protection: ordinary file JSON containing an `xlsxEvidence` key receives no privileged treatment. Test repeated budget application and a secret-pattern cell/sheet label; no unredacted copy may be reintroduced from a marker. Use only synthetic fixture strings, not real credentials. Verify no tool-result artifact is persisted.
- [x] Implement the smallest XLSX-specific delivery path, preserving PDF logic and existing policy. Do not add a generic evidence registry or UI component. Run: `node node_modules/vitest/vitest.mjs run tests/xlsx-projection-evidence.test.ts tests/document-projection.test.ts tests/mcp-result-budget.test.ts tests/agixt-public-url-adoption.test.ts`.
- [x] Inspect the final diff for the exact file list and unrelated changes. Main records the sparse-content fix, bounded sidecar, fidelity/omission rules and runtime evidence in CODEBASE; then run the normal approved build, `npm run build`, once required checks pass.
- [x] Main reviews the independent fixture assertions and final serialized response. If activating this exact scope, use the official restart with `capabilitiesChanged=false` because tool definitions/catalog descriptors are unchanged; separately verify resident health and a non-secret local XLSX markdown response. Record functional benefit as recovery of the fixture's previously missing sparse content and valid citation coordinates, not measured speedup or semantic/formula correctness.

**Execution boundary:** Main approved source implementation and targeted TDD. Raka does not build, restart or activate; Main owns integrated diff review, build, CODEBASE and final activation. Existing shared checkout is explicitly authorized; no child agents, commits, donor services or unrelated changes. Runtime evidence and execution ledger live under `runtime/build/weknora-donor-20261026/`.
