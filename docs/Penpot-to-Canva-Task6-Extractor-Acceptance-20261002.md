# Penpot-to-Canva TASK 6 Extractor Acceptance — 2026-10-02

## Status

**TASK 6 COMPLETE.**

**Full acceptance: PASS.**

**Gate P4: PASS.**

**TASK 7: NOT STARTED.**

This closure preserves the earlier audit report as historical evidence of the bounded-output blocker. The blocker has now been fixed and targeted-verified.

## Closed blocker

Former blocker: `UNBOUNDED_LOCAL_IR_RESPONSE`.

The accepted implementation now defines one shared hard ceiling:

`MAX_CANVA_IR_TASK_RESULT_BYTES = 12,000,000` UTF-8 bytes.

The cap is mode-independent.

### Plugin boundary

Before `task.sendSuccess()`, the plugin measures the exact successful response envelope:

`{ id, success: true, data: result }`

in UTF-8 bytes.

If the response exceeds 12,000,000 bytes, export throws before transmission. It does not truncate, drop pages, cut text, or silently omit elements.

### Server/MCP boundary

`export_canva_ir` no longer pretty-prints the result. It emits compact JSON and independently measures the final TextResponse JSON payload in UTF-8 bytes using the same 12,000,000-byte limit.

If the final MCP text payload exceeds the ceiling, the server fails closed before response emission. Canonical IR is never truncated.

The accepted ceiling remains below the existing integrated-remote transport guard of 15,000,000 serialized characters, leaving protocol headroom.

## Targeted tests

Plugin response-limit tests:

- exact UTF-8 response-envelope measurement: PASS
- response at the configured bound: PASS
- one byte over the bound fails closed with no truncation: PASS

Result: **3 PASS / 0 FAIL**.

Server response-limit tests:

- compact UTF-8 JSON measurement: PASS
- response at the bound preserves complete JSON: PASS
- one byte over the bound fails closed with no truncation: PASS

Result: **3 PASS / 0 FAIL**.

Existing extractor determinism regression:

- repeated frozen fixture read: PASS
- bounded asset transfer-ref behavior: PASS

Result: **2 PASS / 0 FAIL**.

The independent negative acceptance probe from the audit also remains valid: loose root shapes, mask groups, and multiple fills produce blocking diagnostics and `strictReady=false`.

## Typecheck/build

- common `types:check`: PASS
- plugin `types:check`: PASS
- server `types:check`: PASS after rebuilding shared common dist
- common build: PASS
- plugin build: PASS
- server build: PASS

The initial server typecheck before rebuilding `mcp-common` failed only because the workspace dependency still exposed the old compiled common contract. After the required common-first build, the same server typecheck passed. No source correction was needed for that build-order event.

## Compiled artifact verification

Compiled plugin contains the 12 MB response guard and the explicit fail-closed message:

`Export aborted before response transmission; Canonical IR was not truncated.`

Compiled server contains the second boundary and message:

`Export aborted before MCP response emission; Canonical IR was not truncated.`

Compiled common exports:

`MAX_CANVA_IR_TASK_RESULT_BYTES = 12000000`

The server tool description also advertises the hard mode-independent bound.

## Gate P4

Gate P4 remains PASS. The unchanged controlled Penpot fixture produces structurally identical IR for repeated reads with deterministic digest:

`616f3c34092600430982a524c67722389f7eb4059cbcb380b5aa113a5ca4588a`

The bounded-output fix does not alter canonical IR generation or that digest.

## Read-only and strict behavior

The extractor remains read-only with respect to the Penpot design. It still restores temporary execution flags in `finally`.

Unsupported strict-v1 semantics remain explicit blocking diagnostics. No compatibility policy was relaxed to close the output blocker.

## Protected boundaries

Unchanged after TASK 6 closure:

- Penpot-to-Figma adapter: `159208b5a228d91d1f562a6ab32e3c352f4d55d6e18462f520d04932ddce50ef`
- Canonical IR v1 product contract: `ddc3e06eb958b08cee635e69214a42b29e2a2a230028520aacbb97a695571192`
- Penpot-to-Canva product adapter: `b50650c8cbad0d1c4f4630367c51b690cd71e194dc868b6ef77582cbdc2fcb74`

Accepted modified Penpot baselines after TASK 6:

- source: `d1297b63fe2a5d636c1a6f55a97a63c836f77b0542eab366fc37e86fb35dd9b3` (2209 files)
- MCP runtime build: `6185e9b02a4ef5a58471a2060459b491a2bd9ea35320912666d8ffc40d997d67` (23 files)

Baseline evidence:

`runtime/tmp/penpot-to-canva-task6-audit-20261002/task6-accepted-baseline.json`

## Repository policy note

Penpot `AGENTS.md` was read during closure. `.serena/memories` is absent from this runtime-pruned snapshot, so project module memories could not be loaded. `CHANGES.md` was not edited. The repo root has no existing `.changeset` directory, so no foreign Changesets workflow was introduced.

## Live runtime

Penpot MCP ports 4401/4402 were not active during this task. No Penpot runtime was started or restarted solely for acceptance. This report therefore claims source/test/build/compiled acceptance, not a resident live invocation.

## Final state

```text
TASK 1  COMPLETE
TASK 2  COMPLETE
TASK 3  COMPLETE
TASK 4  COMPLETE
TASK 5  COMPLETE
TASK 6  COMPLETE

Gate P4  PASS

TASK 7  NOT STARTED
```