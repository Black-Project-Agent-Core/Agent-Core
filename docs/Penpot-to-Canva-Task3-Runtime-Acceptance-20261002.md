# Penpot-to-Canva TASK 3 Runtime Acceptance — 2026-10-02

## Status

**TASK 3 COMPLETE.**

**Gate P1: PASS for the supported v1 scope.**

**TASK 4: NOT STARTED.**

The runtime target is the Canva Developer App **Penpot-to-Canva**. Agent Core remains engineering support only and is not a Canva runtime/adapter dependency.

## Correct development-preview model

Canva local development uses:

```text
Development URL
http://localhost:8080/
```

That URL is correct and should remain configured during active local development. The local server must return the app JavaScript directly from the root URL. The Penpot-to-Canva probe server now returns:

```text
HTTP 200
Content-Type: text/javascript
```

The uploaded JavaScript bundle is a separate review/release path and does not replace the Development URL during active local preview.

## Proven runtime capabilities

The following are demonstrated by actual Canva read/create/update/delete/read-back evidence:

- absolute-page read;
- stable PageId on opened absolute pages;
- multi-page traversal and `helpers.openPage` deep read-back;
- page background update/read-back;
- `addPage()` with title, dimensions, background and native elements;
- rect create/read/update/delete;
- rich-text region preservation including font weight, color, font size, alignment, line height and letter spacing;
- vector shape/path creation/read-back;
- media-editable path semantic through `PathFill.isMediaEditable`;
- position, rotation and transparency updates;
- solid fill updates;
- solid stroke weight/color updates;
- element list reordering;
- group and ungroup;
- asset upload from a data URL;
- native image fill through `mediaContainer: { type: "image", imageRef }`;
- cleanup and final structural read-back.

A page created through `addPage()` with text + image was later opened through `openDesign({type:"all_pages"}) -> helpers.openPage(...)`. The page was read back with two elements: `text` and `rect`; the image is represented by Design Editing as a rect containing an image media fill.

## Session-lifecycle fix

Two failures were reproduced and bounded:

1. Rapid repeated `session.sync()` calls produced `RATE_LIMITED: Sync rate limit exceeded`.
2. Even with throttled syncs, chaining `group -> ungroup -> delete` inside one long-lived `openDesign` callback produced a Canva `INTERNAL_ERROR` when the callback finalized, despite intermediate syncs and cleanup succeeding.

The successful correction is to split complex lifecycle operations across sessions:

```text
openDesign -> create -> sync -> close
openDesign -> group -> sync -> close
openDesign -> ungroup -> sync -> close
openDesign -> delete -> sync -> close
```

That split-session lifecycle passed without error.

## Runtime observations that are not promoted to public-contract guarantees

- Element IDs were observed on rect/text/shape/group elements and remained stable across tested updates, but they are still treated as runtime evidence rather than a guaranteed GA schema contract.
- `PageRef` itself did not expose PageId in the tested runtime; opened pages and design metadata did expose stable PageIds.
- Post-creation element width/height resizing was not tested because the GA Design Editing type contract exposes those dimensions as read-only.

## Explicitly outside the proven TASK 3 scope

These remain unsupported/documentation gaps or later tracks:

- existing-page delete;
- arbitrary existing-page reorder;
- existing-page resize;
- crop/imageBox;
- gradient fill/stroke;
- mask/clipping;
- effects/shadows/blur;
- Design Editing table round-trip;
- direct chart/sheet structural CRUD;
- Autofill/data-field runtime proof, which remains a separate tagged-design/OAuth track;
- Preview-only `getDataFieldFor` field creation.

## Evidence

```text
runtime/tmp/penpot-to-canva-task3-20261002/
  semantic-probe-v4-report.json
  postcheck-pass.json
  sync-rate-limit-isolation.json
  same-session-group-finalization-fail.json
  group-split-pass.json
  asset-page-pass.json
  multipage-deep-readback-pass.json
```

## Protected-boundary verification

Penpot source remains identical to the TASK 1 baseline:

```text
5d70ab81d45b97e97a858135f15a5b60a3c438cfabaff668a021de5a48253268
MATCH = true
```

Penpot MCP resident build:

```text
2ad61958540d2df7eed9c372cead55d6a4b34534c4dcdd701e352bc31fed2610
MATCH = true
```

Existing Penpot-to-Figma adapter:

```text
159208b5a228d91d1f562a6ab32e3c352f4d55d6e18462f520d04932ddce50ef
MATCH = true
```

No Penpot source or existing Figma converter file was modified by TASK 3.

Initial Penpot-to-Canva adapter baseline after TASK 3:

```text
F:\\Content Creator\\Astra Content Factory\\Toolchain\\adapters\\penpot-to-canva
8 files
SHA-256 tree:
de0e0bd374c68b23929794993fbb7855d0e7031b0055a01405439f4bf5c1001e
```

## Next gate

```text
TASK 1  COMPLETE
TASK 2  COMPLETE
TASK 3  COMPLETE
Gate P1 PASS for supported v1 scope
TASK 4  NOT STARTED
```
