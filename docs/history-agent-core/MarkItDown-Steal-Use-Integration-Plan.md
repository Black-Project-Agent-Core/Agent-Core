# MarkItDown Steal/Use Integration Plan

Status: **COMPLETE — LIVE-ACTIVATED — INSTALLED-RUNTIME VERIFIED**

Date: 2026-09-28

Reference:
- Current path: `DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT\Consumer\markitdown`
- Grounding path before final disposition: `DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT\markitdown`
- Upstream: `https://github.com/microsoft/markitdown.git`
- Branch: `main`
- Audited HEAD: `b8f79c57ebc0044be41323d89b2a45d3fda8460e`
- Working tree at grounding: clean
- Top-level license: MIT; MarkItDown core also carries third-party attribution for bundled Apache-2.0-derived DOCX math code.

## 1. Purpose

Ground Microsoft MarkItDown from executable source/tests against current Agent Core and identify only mechanisms that add real current value.
This document is a selection plan. It does not authorize installation by itself.
Existing Agent Core owners remain authoritative unless a selected proposal explicitly changes ownership.
No MarkItDown Python runtime, MCP server, plugin loader, cloud provider, OCR model, or dependency has been installed by this grounding pass.

## 2. Grounding method

The audit used exact source and tests, not README claims, as feature authority.
Examined repository families:
- MarkItDown core: 42 tracked source files and 73 tracked test/fixture files under the core package.
- MarkItDown MCP package: 11 tracked files.
- MarkItDown OCR package: 47 tracked files.
- MarkItDown sample plugin: 9 tracked files.

Source families inspected include dispatcher/stream inference, URI handling, converter base/contracts, Office/PDF/EPUB/MSG/IPYNB/HTML/RSS/CSV/ZIP/image/audio/YouTube converters, MCP transport/error handling, OCR registration/service, and representative regression tests.

A request-scoped Grafel registration was attempted only as a second opinion and was platform-blocked before mutation. No retry/bypass was attempted. Exact source remained sufficient and authoritative.

Current Agent Core dependency scan found zero `markitdown` references in active `src`, `tests`, or `scripts`. The checkout is therefore reference-only today.

## 3. Current Agent Core baseline

Agent Core already owns:
- `read_file` / `read_multiple_files` and the file-handler factory.
- Text, image, PDF, DOCX, and Excel/XLS/XLSM handling.
- DOCX raw/editable XML workflow; this is an editing authority and must not be replaced by a Markdown-only reader.
- PDF page/text/image extraction plus PDF creation/editing.
- Excel sheet/range read/edit.
- bounded URL fetch with Agent Core retry/timeout/response-size policy.
- regular-file/reparse/path validation.
- robust ZIP/archive limits in the Skills subsystem: bounded files/expanded bytes, compression/encryption checks, and symlink refusal.
- host-model image vision through image content blocks.

Observed gaps relative to MarkItDown source:
- no native PPTX semantic reader in `read_file`;
- no EPUB, IPYNB, or Outlook MSG semantic reader;
- remote HTML/RSS/Atom normally returns raw text rather than normalized Markdown;
- fixed handler routing has no general priority/fallback converter negotiation;
- ordinary text detection is primarily UTF-8/UTF-16LE rather than bounded legacy-charset inference;
- generic binary files still fall back to manual `start_process` guidance.

## 4. Source-backed capability census

### Directly valuable now

1. **Converter negotiation and evidence**
   MarkItDown combines extension/MIME/content guesses, stable priority ordering, seek-position invariants, fallback converters, and aggregated failed attempts.
   This is materially richer than Agent Core's current first-match file-handler routing.

2. **PPTX semantic projection**
   Source preserves slide order, titles/text, grouped-shape order, tables, chart values, notes, alt text, and SVG-only embedded images.
   Agent Core currently has no dedicated PPTX reader.

3. **Long-tail knowledge formats**
   - EPUB: OPF metadata + spine-order XHTML conversion.
   - IPYNB: notebook markdown/code projection without raw nbformat noise.
   - Outlook MSG: sender/recipient/subject/body plus declared Windows codepage handling.
   These are current binary-reader gaps.

4. **Structured text/web projection**
   HTML, RSS/Atom, and CSV are normalized into Markdown rather than returned as raw markup/text.
   RSS/Atom code resolves XML base URLs and has bounded plain-text fallback for deeply nested markup.
   CSV source safely escapes Markdown table pipes/newlines and detects legacy charsets.

5. **Safe semantic archive projection**
   MarkItDown recursively routes ZIP members through their own converters and prevents outer archive metadata from overriding member metadata.
   The recursive dispatch idea is useful, but MarkItDown's raw ZIP implementation lacks Agent Core-grade archive limits and cannot be copied unchanged.

6. **Conversion error privacy**
   MarkItDown MCP tests distinguish safe client-input diagnostics from private path/network/converter details.
   Agent Core should reuse its own error/redaction infrastructure but adopt the conversion-specific evidence boundary.

### Already covered or lower-value

- Existing Agent Core PDF, DOCX, XLS/XLSX and image owners are not replaced wholesale.
- MarkItDown PDF form/table heuristics and Office semantic renderers may be used only as bounded optional projections/fallbacks where they improve extraction.
- Generic Wikipedia and Bing-specific HTML converters are site-specific specializations; general HTML projection plus existing browser/web capabilities cover the core need.
- Plain JSON/text conversion is already covered except for charset inference improvements.

### Conditional only

- **OCR/vision enhancement**: MarkItDown OCR calls an externally supplied OpenAI-compatible vision client. Activate only when Agent Core has an explicit owned multimodal AI/provider consumer. Never add a hidden model call from `read_file`.
- **Audio transcription**: raw source uses SpeechRecognition/pydub and Google recognition. Activate only behind an explicit transcription provider/product with reviewed privacy/network policy.
- **Azure Document Intelligence / Content Understanding**: activate only if Agent Core gains a real configured Azure document-analysis consumer.
- **YouTube transcript specialization**: activate only if a dedicated content-ingestion workflow needs it and existing web/browser retrieval is insufficient.

## 5. Rejected adoption paths

- Do not run `markitdown-mcp` as a second MCP server. Its HTTP mode can be unauthenticated and Agent Core already owns authenticated MCP.
- Do not import the full Python MarkItDown runtime as a second general file authority unless native implementation proves impractical for a specifically approved format.
- Do not enable arbitrary Python entry-point plugins. Agent Core must keep a static reviewed converter registry.
- Do not copy MarkItDown's unbounded HTTP buffering or unbounded ZIP recursion.
- Do not add implicit image-caption/OCR model calls.
- Do not let semantic reading replace Agent Core's existing editable DOCX/Excel/PDF surfaces.

## 6. Proposed adoption set

### MID-P1 — Native document projection dispatcher

Add an Agent Core-owned projection layer alongside the current file-handler factory.
Requirements:
- bounded stream/file sampling;
- extension + MIME + content-signature evidence;
- stable priority and fallback ordering;
- converter `accepts` checks must not consume/alter the reusable input state;
- failed converter attempts are retained as bounded internal evidence;
- unsupported format remains explicit;
- current edit/write handler ownership remains unchanged.

Preferred ownership: `src/rdc/document-projection/*` or a similarly scoped sibling under the existing RDC file subsystem.
No new public MCP tool is required; existing `read_file` remains the public facade.

### MID-P2 — Office/PDF semantic Markdown projection

Add semantic projection for PPTX as a first-class new reader and optional semantic views for DOCX/XLS/XLSX/PDF without replacing their native/editable modes.
PPTX acceptance must cover:
- slide sequence and slide markers;
- title/body order;
- grouped shapes;
- tables and chart data;
- notes;
- alt text;
- embedded SVG with no raster fallback.

PDF adoption is limited to demonstrably useful table/form heuristics that complement, not replace, the existing page/image parser.

### MID-P3 — Long-tail document readers

Add bounded semantic readers for:
- `.epub`: metadata + spine-order content;
- `.ipynb`: markdown/code cells with notebook container metadata suppressed;
- `.msg`: safe header/body extraction with declared/fallback codepage handling.

Each reader must:
- use existing regular-file/path safety;
- use bounded input/output limits;
- never execute embedded code, macros, scripts, formulas, or attachments;
- expose provenance/type metadata;
- fail-soft to the existing binary guidance when unsupported or dependency-free implementation is unavailable.

### MID-P4 — URL/markup Markdown projection

Extend existing bounded `read_file(isUrl=true)` with an explicit semantic/Markdown projection for:
- HTML/XHTML;
- RSS/Atom;
- CSV/text with non-UTF legacy charset evidence.

Reuse Agent Core's `fetchWithPolicy`, timeout, redirect/security, and bounded-response ownership.
Do not copy MarkItDown's raw `requests.get(...)` full-buffer behavior.
Resolve relative links against source URL without performing extra hidden fetches.

### MID-P5 — Safe recursive archive projection

Add explicit ZIP semantic projection using MarkItDown's member-dispatch semantics but Agent Core's stricter archive safety:
- max archive bytes;
- max entry count;
- max expanded bytes;
- per-member cap;
- max recursion depth;
- reject encrypted/unsupported compression;
- refuse symlink/reparse/path traversal;
- preserve member-local extension/type evidence.

Archive conversion must never silently skip security failures. Unsupported members may be reported as bounded omissions; corrupt/suspicious archive conditions fail closed.

### MID-P6 — Conversion diagnostics/privacy contract

Add conversion-specific diagnostics using existing Agent Core redaction/evidence infrastructure:
- client-controlled invalid format/hint errors may be specific;
- internal paths, network topology, provider details, and converter stack traces stay private;
- retain bounded internal failure-family/evidence for debugging;
- never expose raw secrets or full exception chains through MCP.

This proposal should be implemented together with MID-P1 if MID-P1 is selected; it is separable only for review clarity.

## 7. Public API strategy

Default goal: **no additional public MCP tool**.
Prefer additive behavior under `read_file` / `read_multiple_files`:
- automatic semantic handling for formats that currently only fall into generic binary guidance;
- explicit `options` projection/profile for alternate Markdown views of formats that already have strong native/editable handlers;
- preserve existing `offset/length/sheet/range` behavior and existing UI-origin preview contracts.

If implementation proves a distinct long-running conversion lifecycle is necessary, a new internal service is allowed, but the public surface should remain the existing file-reading facade unless a separate tool has a demonstrable usability or contract advantage.

## 8. Dependency policy

Prefer native TypeScript and already-installed Agent Core dependencies.
Do not add Python merely to mirror MarkItDown architecture.
A new dependency is acceptable only when:
- selected capability cannot be implemented safely/reasonably with current primitives;
- it is project-local;
- license/provenance is recorded;
- its attack/maintenance surface is smaller than implementing an equivalent parser incorrectly.

If code/logic is ported or closely derived, update `THIRD_PARTY_NOTICES.md` for Microsoft MIT provenance and preserve any applicable third-party notice obligations, including the Apache-2.0-derived DOCX math material if that material is actually adopted.

## 9. Verification plan after user selection

Verification is proposal-scoped; do not run it during this planning pass.

For selected direct capabilities:
1. compile/path-policy gate;
2. format-specific fixtures copied or recreated from source-backed behaviors;
3. negative malformed/truncated/oversized inputs;
4. archive bomb/path traversal/encryption/symlink cases for MID-P5;
5. converter fallback and stream-position invariants for MID-P1;
6. error-detail privacy checks for MID-P6;
7. existing DOCX/Excel/PDF editing/read contracts remain unchanged;
8. MCP descriptor/manifest compatibility if schema options change;
9. installed-runtime readback only after separate activation authorization.

No broad regression suite is implied unless explicitly authorized.

## 10. Final source census / disposition

Post-implementation source census found the selected **direct current-fit value exhausted for the approved scope**.
MID-P1 through MID-P6 are implemented in Agent Core. Remaining upstream-only value is consumer/provider-gated or deliberately rejected:
- OCR/vision enhancement requires an explicit owned multimodal provider/consumer;
- audio transcription requires an explicit transcription provider/product and privacy policy;
- Azure Document Intelligence / Content Understanding requires a configured Azure consumer;
- YouTube transcript specialization remains conditional on a dedicated ingestion need;
- Bing/Wikipedia specializations, arbitrary Python plugins, a second MarkItDown MCP server, and hidden model calls remain rejected/lower-value relative to existing Agent Core owners.

The reference checkout was clean before lifecycle disposition and no active `src`, `tests`, or `scripts` path depended on its protected location.
Per the user's lifecycle rule, it was moved to:
`DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT\Consumer\markitdown`.

It is **not corpse** because conditional consumer-gated evidence remains, but it is no longer an active direct-adoption reference.
If a gated consumer becomes real, re-ground the exact retained pin before any further adoption.

## 11. Approved implementation record — 2026-09-28

User approval activated MID-P1 through MID-P6. Implementation remains inside the existing Agent Core `read_file` / `read_multiple_files` authority; no second public MCP tool was added.

Proposal status:
- **MID-P1 IMPLEMENTED** — `src/rdc/document-projection/service.ts` owns bounded converter negotiation, extension/MIME/signature evidence, stable priorities, reusable immutable input bytes, fallback attempts, and bounded sanitized internal failure evidence.
- **MID-P2 IMPLEMENTED** — automatic PPTX semantic projection covers slide order, title/body text, grouped shapes, tables, chart values, notes, alt text and SVG-only embedded images. Explicit `projection=markdown` views exist for DOCX, XLS, XLSX/XLSM and PDF while native/editable defaults remain authoritative.
- **MID-P3 IMPLEMENTED** — EPUB metadata/spine projection, IPYNB markdown/code/raw-cell projection without execution/output replay, and Outlook MSG sender/recipient/subject/body extraction with codepage-aware ANSI fallback.
- **MID-P4 IMPLEMENTED** — explicit HTML/XHTML, RSS/Atom, CSV and legacy-charset Markdown projection; URL reads reuse Agent Core `fetchWithPolicy` and bounded-response ownership, and relative links resolve against the source URL without hidden extra fetches.
- **MID-P5 IMPLEMENTED** — recursive ZIP member projection with entry/member/expanded-byte/depth budgets and fail-closed traversal, encryption, unsupported compression and symlink checks. ZIP-based document packages also receive bounded archive preflight before OOXML/EPUB parsing.
- **MID-P6 IMPLEMENTED** — conversion failures expose generic safe client messages while bounded converter/failure-family evidence remains internal; raw paths, stack traces and transport topology are not returned by the projection facade.

Implementation dependencies were installed project-locally and pinned exactly:
- `@xmldom/xmldom 0.9.12` — MIT;
- `node-html-markdown 2.0.0` — MIT;
- `chardet 2.2.0` — MIT;
- `cfb 1.2.2` — Apache-2.0;
- `@e965/xlsx 0.20.3` — Apache-2.0, used for bounded legacy BIFF/XLS semantic reading.

`THIRD_PARTY_NOTICES.md` records Microsoft MarkItDown revision `b8f79c57ebc0044be41323d89b2a45d3fda8460e` and the added helper dependencies. No upstream Python runtime or bundled MarkItDown DOCX-math code was transplanted.

Build/contract evidence:
- final `npm run build`: **PASS**, path policy **267 authored files / 0 documented exceptions**, TypeScript exit 0;
- `tests/document-projection.test.ts` + `tests/rdc-safe-regular-file.test.ts`: **12 / 12 PASS** after correcting two test-fixture/expectation defects exposed by the first run;
- `tests/mcp-manifest-contract.test.ts` + `tests/mcp-schema-contract.test.ts`: **4 / 4 PASS**;
- the same final combined run therefore has **4 relevant files / 16 tests PASS**.

Source-backed fixture acceptance against the retained MarkItDown pin passed expected-content checks for upstream `test.pptx`, `test.epub`, `test_notebook.ipynb`, `test_outlook_msg.msg`, `test_files.zip`, `test.docx`, `test.xlsx`, `test.xls`, and `test.pdf`.

Security acceptance includes real ZIP fixtures for traversal, encrypted entries, symlink metadata and an over-limit highly compressible member. All fail closed with stable internal error codes and the generic public message `Document projection refused unsafe input.`

Dependency audit after installation still reports the same three existing findings: `exceljs`/transitive `uuid` moderate and `sharp` high. None of the newly added MarkItDown-adoption dependencies appears in the vulnerability set. No forced audit repair or unrelated dependency downgrade/upgrade was performed.

Structural review used a freshly requested/current Grafel graph after implementation. `readFileFromDisk` remains the high-fan-in shared surface; impact reaches existing `readFile`, `readMultipleFiles`, Excel operations and related callers. Exact-source verification confirms the projection branch is additive before the existing handler factory, default native behavior is preserved for established formats, and the new subsystem has no separate execution authority.

A separately run legacy `tests/rdc-parity.test.ts` exposed pre-existing test drift: it expects 39 registrations but current source registers 45 because six newer Memory tools (`memory_page`, `memory_retrieval_diagnostics`, `memory_export`, `memory_import`, `memory_feedback`, `memory_retirement_review`) are absent from that test's static list. This is unrelated to MarkItDown adoption and was intentionally not modified in this task.

Release intent: `.changeset/20260928-markitdown-document-projection.md` (**minor**). During the implementation pass no `release:apply`, commit, tag, push, publish, deploy, or runtime restart was performed.

**Installed-runtime activation evidence:** after the user-controlled restart/reconnect, Node Core PID **12484** started at `2026-09-28T05:26:46.7632180Z`, after `dist/rdc/document-projection/service.js` was written at `2026-09-28T05:03:52Z`, proving the compiled projection build is resident. `/health` is `ok`; Code Intelligence remains `available/current` with complete graph coverage `1/1`. Live MCP `read_file` acceptance then exercised three installed paths: automatic PPTX projection returned slide markers, grouped-shape text, tables, chart values and image alt text; explicit DOCX `options.projection="markdown"` returned semantic headings/table content while bypassing the native outline only for that request; automatic IPYNB projection returned Markdown/code cells without notebook container noise. This closes the activation boundary as **LIVE-ACTIVATED — INSTALLED-RUNTIME VERIFIED**. No release apply, commit, tag, push, publish or deploy followed.
