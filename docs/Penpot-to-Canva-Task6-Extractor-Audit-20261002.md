# Penpot-to-Canva TASK 6 Extractor Audit / Acceptance — 2026-10-02

## Status

**AUDIT COMPLETE.**

**Gate P4: PASS.**

**Full TASK 6 acceptance: OPEN — one blocking requirement remains.**

**TASK 7: NOT STARTED.**

The audited implementation is the existing Penpot -> Canonical Design IR v1 extractor already present under the modified Penpot MCP source. This audit did not create a second extractor and did not reset or replace the existing source.

## Audited source surface

mcp/packages/common/src/CanvaIr.ts
mcp/packages/common/src/index.ts
mcp/packages/plugin/src/CanvaIrExtractor.ts
mcp/packages/plugin/src/CanvaIrExtractor.test.ts
mcp/packages/plugin/src/task-handlers/ExportCanvaIrTaskHandler.ts
mcp/packages/plugin/src/plugin.ts
mcp/packages/server/src/tasks/ExportCanvaIrPluginTask.ts
mcp/packages/server/src/tools/ExportCanvaIrTool.ts
mcp/packages/server/src/PenpotMcpServer.ts

The compiled common/plugin/server artifacts were also audited after targeted builds.

## Plan requirement result

| TASK 6 requirement | Result |
|---|---|
| deterministic traversal | PASS |
| stable page / child ordering | PASS |
| stable source IDs | PASS |
| explicit asset references | PASS |
| no design mutation | PASS |
| bounded output | **PARTIAL / BLOCKER** |
| explicit unsupported semantic list | PASS |
| versioned IR output | PASS |

## Gate P4

The plan defines Gate P4 as repeated reads of an unchanged controlled Penpot file producing structurally identical IR.

Existing targeted unit test executes the same frozen controlled fixture twice and asserts identical IR object, identical SHA-256, identical canonical byte length, fixed expected digest, strictReady=true, and no blocking diagnostics.

Result: tests 2, pass 2, fail 0.

Representative deterministic digest:
616f3c34092600430982a524c67722389f7eb4059cbcb380b5aa113a5ca4588a

Therefore **Gate P4 passes**.

## Read-only behavior

The controlled unit fixture is deep-frozen before extraction. Both repeated extractions pass against the frozen object tree.

Source review also shows the extractor reads penpot.currentFile, File/Page/Board/Shape/Text/ImageData properties, Text.getRange(), and ImageData.data(). It does not mutate the Penpot document.

The task handler temporarily sets naturalChildOrdering=true and throwValidationErrors=true and restores both in finally.

## Ordering and identity

Top-level Boards become Canonical Pages. Source section order follows file.pages. Child order uses source child arrays while the task handler forces naturalChildOrdering=true.

Canonical IDs are deterministic and source-derived for document, section, page, element and asset IDs.

Multiple Boards in one Penpot Page use deterministic root child order and emit BOARD_ORDER_FROM_ROOT_Z_ORDER as an explicit normalization.

## Rich text

Text is decomposed by JavaScript/UTF-16 code-unit offsets. The extractor walks code points, calls Text.getRange(start,end), reads range-level typography/fill, canonicalizes styles, and coalesces adjacent identical styles.

One non-blocking review item remains: if a TextRange fill cannot be represented as one supported solid fill but the shape-level text fill can, the extractor emits TEXT_RANGE_FILL_FALLBACK_TO_SHAPE and normalizes to the shape fill. This is explicit, not silent, but currently remains a warning and does not set strictReady=false.

## Fail-closed unsupported semantics

An independent acceptance probe outside the product source tested a loose root shape outside a Board, a mask group, and a rectangle with multiple fills.

Observed strictReady=false with blocking reasons MASK_GROUP_UNSUPPORTED, MULTIPLE_FILLS_UNSUPPORTED, ROOT_SHAPE_OUTSIDE_BOARD. omittedSourceIds contained loose-1 and mask-1.

The source also explicitly blocks or reports gradients, unsupported stroke styles/alignment/caps, nested Boards, raw SVG, unsupported shape types, shadows/blur/background blur, non-normal blend modes, component linkage and interactions.

Layout-child and design-token semantics are explicitly normalized to resolved values rather than silently preserved as links.

## Asset behavior

Image assets are source-derived and deduplicated by canonical asset ID. The extractor computes raw-byte SHA-256, MIME type, dimensions and deterministic source ID.

Asset content is either inline-base64 or transfer-ref.

Inline image bytes are bounded by maxTotalAssetBytes <= 6 MiB. Exceeding the budget produces ASSET_INLINE_BUDGET_EXCEEDED and strictReady=false.

## Blocking acceptance finding — total response is not mode-independently bounded

TASK 6 explicitly requires bounded output.

Current extractor bounds asset bytes, but page count, element count, text content and final canonical IR bytes have no extractor-level hard limit.

There is an existing transport guard MAX_TASK_RESPONSE_SIZE_REMOTE_MCP = 15,000,000 in the plugin UI transport, but it is applied only when isIntegratedRemoteMcp === true.

Local/manual plugin mode does not apply the same response-size cap. Server-side TextResponse also does not truncate or cap export_canva_ir; it serializes the full result data.

Therefore a large local Penpot file can still generate an unbounded local/manual IR response even though image bytes are bounded.

This is the single blocker preventing full TASK 6 acceptance.

### Required correction

Do not silently truncate Canonical IR.

Add a mode-independent output bound: extract/canonicalize, evaluate canonical/result size against an explicit bound, and if over the bound fail closed with an explicit error or diagnostic. Do not return a partial IR as strict-ready.

The bound should stay below the existing remote transport ceiling and should have a targeted acceptance test.

## Targeted verification

CanvaIrExtractor.test.ts: PASS 2 / 2
negative acceptance probe: PASS
common types:check: PASS
plugin types:check: PASS
server types:check: PASS
common build: PASS
plugin build: PASS
server build: PASS

Compiled wiring verification:
server dist contains export_canva_ir
plugin dist contains exportCanvaIr
common dist contains ExportCanvaIrTaskResultData

## Live runtime

No Penpot MCP listeners were active on ports 4401/4402 during this audit. The audit did not start, restart, or mutate a Penpot runtime merely to obtain live evidence.

Therefore this acceptance does not claim a live installed-runtime invocation of export_canva_ir.

## Current acceptance state

TASK 5 COMPLETE
TASK 6 SOURCE PRESENT
TASK 6 AUDIT COMPLETE
Gate P4 PASS
TASK 6 FULL OPEN — bounded-output blocker
TASK 7 NOT STARTED

The existing extractor is structurally sound and deterministic for the audited strict-v1 scope, but should not be marked fully accepted until the mode-independent output bound is implemented and targeted-verified.