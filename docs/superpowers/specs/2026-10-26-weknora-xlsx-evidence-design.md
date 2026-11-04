# Local XLSX projection evidence — design for review

**Status:** IMPLEMENTED AND RESIDENT-ACTIVE, 2026-10-26. Main approved the assigned Raka implementation with incremental output-byte admission and an existing-owner sparse-workbook first RED. Targeted tests, integrated build and official restart completed; a real resident plugin read verifies sparse text and four exact source locations. Phase1 covers existing local XLSX/XLSM markdown reads only. No donor service, public URL expansion, formula recalculation, dependency installation or Memory architecture change is included. See the execution ledger and main audit for exact evidence and limits.

**Required amendment:** enforce the existing 4 MiB output-byte limit during rendering, before retaining/appending cell/row text; reserve the omission marker. Never construct the whole bounded-by-cell-count matrix and truncate afterward. Commit evidence spans only for admitted complete rows; omission reasons do not invent omitted totals.

**Outcome:** a model using existing `read_file(path, options: { projection: 'markdown' })` can cite the workbook sheet and genuine cell address behind delivered text, including sparse layouts. Input bytes are SHA-256-bound. Unsupported interpretation and omitted evidence stay explicit.

## Current behavior and concrete oracle

- `src/rdc/document-projection/office-converters.ts:276–320` loads XLSX/XLSM with existing ExcelJS, then converts sheets to markdown tables.
- At `:295`, `actualRowCount` is used as the highest physical row index. ExcelJS's local `worksheet.js:378–385` defines it as the **number of nonempty rows**. A workbook containing A1 and Z100 therefore has two data-bearing rows; looping physical rows 1–2 can lose row 100.
- At `:299`, `actualColumnCount` is used as width. `worksheet.js:321–333` counts **distinct used columns**, not the highest column number, and rescans cells on every access. Sparse A/Z can lose column Z; calling the getter per rendered row also repeats worksheet-wide work.
- These are source-derived defects, not executed reproductions in this design task. A tiny workbook with known A1 and Z100 contents supplies an independent functional acceptance oracle. It does not require a model or benchmark.
- Existing flow is `xlsxConverter → DocumentProjectionService.projectBytes → projectionToFileResult (filesystem.ts:362–377) → FileMetadata (utils/files/base.ts:108–174) → handleReadFile (filesystem-handlers.ts:79–255) → applyResultBudget (mcp/result-budget.ts)`.
- PDF evidence provides a useful owner-marked delivery pattern. Workbook offsets differ from PDF coordinates: if delivered text changes, its workbook output pointers must be invalidated.

## Approaches

1. **Direct addresses during the existing ExcelJS conversion — proposed.** Read source row numbers and cell addresses while rendering, recording exact positions as strings are appended. Reuse current parser and guards. This directly fixes the sparse count/coordinate error and avoids ambiguous text matching.
2. Post-hoc alignment of markdown with a second OpenXML/Go/Python reader. The donor's strict alignment is useful prior art, but duplicate values, escaping and parser disagreement add uncertainty and a new owner. Unnecessary for this phase.
3. Generic Office evidence abstraction now. Potentially reusable, but Word/PowerPoint locations and delivery fidelity have different contracts. Defer until a real consumer needs them.

Main's requested direct-local approach is the scope; the exact proposed limits and result shape below are Raka's design calls for review.

## Rendering and bounded work

Preserve XLSX/XLSM's existing opt-in markdown route; native/default Excel reads, `.xls`, sheet/range editing, and input/tool schemas remain unchanged.

| Proposed constant | Value | Meaning |
| --- | ---: | --- |
| `XLSX_MAX_SHEETS` | 8 | First worksheets in workbook order, including hidden sheets with explicit visibility metadata. |
| `XLSX_MAX_ROWS_PER_SHEET` | 5,000 | Data-bearing source rows, not maximum physical row number. |
| `XLSX_MAX_COLUMNS` | 128 | Physical columns A–DX; later columns are explicitly omitted. |
| `XLSX_MAX_RENDERED_CELLS` | 65,536 | Global rectangular table slots, including empty placeholders; enforce before allocating/rendering a rectangle. |
| `XLSX_MAX_CELL_CODEPOINTS` | 2,048 | Rendered source-cell text per cell; a separate synthetic truncation notice has no source span. |
| `XLSX_EVIDENCE_MAX_CELLS` | 128 | Maximum location entries across the workbook. |
| `XLSX_EVIDENCE_MAX_EXCERPT_CODEPOINTS` | 160 | Each entry's exact markdown-escaped excerpt. |
| `XLSX_EVIDENCE_MAX_BYTES` | 16,384 | Compact UTF-8 JSON, including its coverage header. |

Keep existing `DOCUMENT_OUTPUT_MAX_BYTES = 4 MiB`, document input/ZIP limits and the actual MCP envelope budget. The evidence cap is additional, not extra unmetered output. This bounds rendering and evidence after ExcelJS load; it does not claim to sandbox or bound the parser's internal peak memory.

Use actual data-bearing row numbers from the worksheet iterator. Gather at most the admitted row references; do not manufacture blank rows through `getRow(1..actualRowCount)`. Compute width once from admitted rows' highest physical cell index, capped at 128. Use `findCell` or equivalent non-mutating access so blank table slots do not become source cells. Preserve one shared column grid for a sheet; do not compact each row independently. Stop allocating rows/cells when the global slot budget is exhausted. Count omissions only when known; otherwise report a stop reason without an invented total.

Keep the existing table style (first data row rendered as a header). Table separators, empty placeholders, sheet headings and truncation notices never acquire cell source spans. The builder measures code-point offsets from the exact strings it emits, after markdown escaping/line-break handling. It never reconstructs offsets by searching repeated text.

## Minimal optional result contract

Add one optional `xlsxEvidence` field to `ProjectionResult` and `FileMetadata`, and one model-facing text block `{ "xlsxEvidence": ... }` to an existing local markdown `read_file` response. No new input field, tool, permission, catalog action or model provider.

Proposed version-1 shape:

```ts
interface XlsxEvidence {
  version: 1;
  sourceSha256: string;
  sourceBytes: number;
  extractor: 'exceljs-cell-text/v1';
  output: { sha256: string; unit: 'unicode-codepoint'; binding: 'exact' | 'unavailable' };
  coverage: {
    content: 'complete' | 'partial' | 'empty';
    locations: 'complete' | 'partial' | 'empty';
    stopReasons: string[]; // versioned finite owner codes, not exception text
  };
  cells: Array<{
    sheetId: number; sheet: string; row: number; column: number; address: string;
    excerpt: string; span?: { start: number; end: number };
    valueKind: 'cell-text' | 'cached-formula';
    hidden: boolean;
    mergedMaster?: string;
  }>;
  limitations: string[]; // fixed bounded statements below
}
```

`output.sha256` identifies the exact projection body, not the outer JSON or a filesystem path. Half-open spans address its Unicode code points; `excerpt` must equal that body's span. A worksheet ID/address is a library-decoded source coordinate, never a ZIP-member byte offset. Identical values on different sheets/rows remain separate entries.

Fidelity: text comes from ExcelJS `cell.text`, including decoded shared strings/rich text and stored formula results. No formulas, external links or macros are evaluated. Cached formula values may be stale; absent caches are unknown, not a calculated blank/zero. Hidden sheet/row/column state is disclosed, not treated as a permission boundary. Merged references identify the actual master and must not present repeated slave values as independent source facts. Formatting fidelity, recalculated results, and semantic verification are not claimed. Plain and shared-string forms must both pass the same address oracle.

Keep these contracts in one small owner module, `document-projection/xlsx-evidence.ts`; rendering remains in the XLSX converter. This is a bounded projection sidecar, not a general spreadsheet ingestion engine.

## Delivery, redaction and truncation

1. The converter hashes the already admitted input snapshot once and emits text plus bounded source entries. `DocumentProjectionService` re-finalizes the evidence after its existing output bounder.
2. If projection output changed, conservatively clear **all output spans**, set `output.binding='unavailable'`, and mark location coverage partial with `output-transformed`. Source coordinates can remain as independently labeled decoded locations. Do not leave a pointer to text that was clipped or moved.
3. `projectionToFileResult` carries the optional sidecar only for the local projection call. The two URL call sites keep their current behavior; no XLSX metadata route is added there.
4. The model-facing filesystem handler emits an internally marked `XLSX_EVIDENCE_BLOCK`, analogous to the PDF marker. Arbitrary JSON in a file cannot opt into trusted evidence handling. Do not append the evidence block to `origin:'ui'` previews.
5. `applyResultBudget` extracts the owner-marked payload before ordinary serialization. Apply existing redaction to body and evidence. Reinsert only the sanitized evidence, never the original unredacted marker payload. Any redaction or preview transformation affecting the body/excerpt clears output spans. If the body fits, shrink evidence first; evidence must not evict previously admissible text. If even its header cannot fit, omit the optional sidecar whole (absence means unavailable), preserving the body. If the body is previewed, retained evidence is explicitly partial/unbound. Never cut evidence JSON.
6. `read_file` remains non-persistable. Count the final escaped JSON envelope in UTF-8 bytes. Repeated budget application must be safe: serialized or forged evidence without an owner marker is ordinary text, never re-admitted.

Strict `readPublicDocument`/`web_open` currently admits text/image/PDF and deliberately avoids generic binary document dispatch. XLSX is outside that route; public URL and web-research changes are unwarranted in phase 1.

## Proposed files and acceptance

Implemented production scope: `src/rdc/document-projection/xlsx-evidence.ts`, `office-converters.ts`, `types.ts`, `service.ts`, `src/rdc/utils/files/base.ts`, `src/rdc/tools/filesystem.ts`, `src/rdc/handlers/filesystem-handlers.ts`, `src/mcp/result-budget.ts`; Main updated the corresponding `docs/CODEBASE.md` owner note. No new package or runtime.

The focused tests use literal worksheet/address/value expectations for source SHA, sparse and distant addresses, repeats, Unicode/escaping, limits, shared/inline strings, cached/missing formulas, hidden/merged flags and actual handler/MCP transformations. Source/TDD evidence is recorded in `runtime/build/weknora-donor-20261026/xlsx-execution.md`. Main completed integrated build, official activation and resident plugin read, plus parsed-PDF owner-marker/manifest regressions. These checks do not establish PDF extraction fidelity, formula truth, parser peak memory or speedup. Exact counts/results and limits are in the main audit.

**Tool/public contract impact:** additive optional output evidence under existing `read_file`; default native Excel output remains unchanged. No registered tool name/input schema, permission or capability descriptor needs changing. Under `restart-tool.ts`'s `refreshToolsRequired = capabilitiesChanged` meaning, the proposed scope requires **`capabilitiesChanged=false`**; if Main separately changes advertised tool definitions/catalog descriptors, that additional change would require reevaluation. A build/restart cannot substitute for the functional oracle.
