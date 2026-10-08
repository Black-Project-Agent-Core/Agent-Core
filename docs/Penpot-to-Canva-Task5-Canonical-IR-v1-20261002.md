# Penpot-to-Canva TASK 5 — Canonical Design IR v1 — 2026-10-02

## Status

**TASK 5 COMPLETE.**

**Gate P3: PASS.**

**TASK 6: NOT STARTED.**

The Canonical Design IR is a product-side contract stored under:

```text
F:\Content Creator\Astra Content Factory\Toolchain\adapters\penpot-to-canva\ir-v1
```

Agent Core remains engineering support/evidence only.

## Product contract

IR v1 is intentionally not a serialized Penpot object and not a Canva document clone.

```text
Penpot Plugin API
  -> semantic extraction
  -> Canonical Design IR v1
  -> compatibility analysis
  -> Canva compiler
```

It contains only semantic data required by the selected v1 bridge scope plus explicit forward-compatible extension points.

## Core files

```text
ir-v1/
  canonical-design-ir-v1.schema.json
  compatibility-report-v1.schema.json
  coverage-map-v1.json
  types.ts
  README.md
  examples/
    text.example.json
    rect.example.json
    shape.example.json
    group.example.json
    image-fill.example.json
    representative-document.example.json
    compatibility-report.example.json
```

## Model decisions

### Page model

One top-level Penpot Board becomes one Canonical Page.

```text
Penpot File
  -> Penpot Page / source section
      -> top-level Board
          -> Canonical Page
```

Penpot Page ID/name/order are preserved separately as source-section metadata.

Loose shapes outside Boards are not silently wrapped into pages in strict v1.

### Element families

Strict v1 tree element types are:

```text
text
rect
shape
group
```

`Embed` from the earlier planning sketch is not admitted because TASK 4 found no first-class Penpot Embed source semantic in the strict scope.

Image is not a standalone tree type:

```text
Rect / Shape
  -> ImageFill.assetId
      -> ImageAsset
```

This preserves the modern Penpot image-fill model and the Canva media-fill model.

### Identity

Extractor IDs are deterministic and source-derived:

```text
document:penpot:<fileId>
section:penpot:<penpotPageId>
page:penpot:<boardId>
element:penpot:<shapeId>
asset:penpot:<imageId>
```

Raw Penpot IDs are also retained in `sourceId`.

No random UUID is required for TASK 6.

### Coordinates

Geometry is parent-relative.

```text
top-level element:
  x/y relative to Canonical Page / Penpot Board

nested element:
  x/y relative to parent Group
```

`transform.coordinateSpace = "parent"`.

Transform contains:

```text
x
y
width
height
rotation
flipX
flipY
```

Opacity, locked state and visibility are separate semantic fields.

### Ordering

Every Page and sibling collection uses explicit zero-based `order`.

Required invariants:

- Page order contiguous from 0.
- Sibling order contiguous from 0.
- Array order equals explicit `order`.
- `parentId` equals the containing Page/Group ID.
- Canonical IDs are globally unique inside a document.

This prevents TASK 6 or TASK 7 from reconstructing z-order heuristically.

## Rich text contract

Text stores content once plus ordered style runs.

Run offsets use:

```text
UTF-16 code units
[start, end)
```

This is deliberate because both Penpot plugin execution and Canva SDK execution occur in JavaScript string semantics.

Each run stores:

```text
fontFamily
fontVariantId
fontSizePx
fontWeight
fontStyle
lineHeightEm
letterSpacingEm
color
opacity
align
verticalAlign
direction
textTransform
textDecoration
```

Validation requires runs to:

- cover all non-empty content;
- be contiguous;
- never overlap;
- contain no zero-length spans;
- coalesce adjacent identical styles.

Empty text is represented with an empty run list.

## Fill / asset contract

Strict v1 fill types:

```text
solid
image
```

Strict v1 stroke:

```text
solid
```

Image fill points to a separate ImageAsset.

ImageAsset stores:

```text
id
sourceId
name
mimeType
width
height
sha256
content
```

Content may be:

```text
inline-base64
transfer-ref
```

The SHA-256 is always calculated from raw decoded image bytes.

No Penpot internal image-transform/crop data is smuggled into v1 because that semantic is not available through the public Plugin API and Canva crop is not in target scope.

## Compatibility contract

Each Page and Element carries:

```text
unassessed
native
emulated
partial
unsupported
```

TASK 6 extraction emits `unassessed`.

Target analysis later sets the final status and reason codes before Canva mutation.

A separate versioned compatibility report schema records:

- global counts;
- per-page counts;
- issues;
- reason codes;
- strict rejection/normalization/emulation action.

No target-specific compatibility decision changes the source IR identity.

## Strict-mode behavior

No silent degradation is allowed.

```text
unsupported > 0
  -> reject before target mutation

partial > 0
  -> reject unless current policy explicitly allows it

emulated > 0
  -> use only explicitly approved emulation
```

Bridge metadata candidates such as image-placeholder, explicit page order and Autofill labels remain unapproved and are not enabled by TASK 5.

## Deterministic serialization

Canonical bytes follow these rules:

1. UTF-8, no BOM.
2. LF line endings.
3. Object keys sorted lexicographically.
4. Arrays preserve semantic order.
5. Assets sorted by canonical ID.
6. Source sections sorted by `order`, then ID.
7. Pages sorted by `order`, then ID.
8. Children sorted by `order`, then ID.
9. Text runs sorted by `start`, then `end`.
10. Compatibility reason codes sorted lexicographically.
11. Finite numbers only.
12. Negative zero normalized to zero.
13. No insignificant whitespace in canonical bytes.

Canonical document digest:

```text
SHA-256(canonical UTF-8 JSON bytes)
```

Asset digest remains SHA-256 over raw asset bytes.

## Coverage proof

TASK 4 selected **20 strict-v1 semantic requirements**.

`coverage-map-v1.json` maps all 20 to explicit IR fields.

Result:

```text
strictV1MappingCount = 20
privateFormatDependencyCount = 0
unrepresentedSelectedSemantics = 0
```

No Penpot binary schema, Canva private object format, PDF, SVG or PPTX is required as the semantic authority.

SVG path `d` is used only as the canonical vector-path geometry representation, not as a document transport format.

## Representative Gate P3 fixture

`representative-document.example.json` contains:

- 2 Canonical Pages;
- source section metadata;
- Text with multiple rich-text runs;
- Rect;
- vector Shape;
- Group with nested ordered children;
- image fill;
- separate ImageAsset;
- source IDs;
- transforms;
- opacity;
- lock/visibility state.

Targeted validation result:

```text
status = PASS
pageCount = 2
assetCount = 1
elementFamilies =
  group
  rect
  shape
  text

strictV1MappingCount = 20
privateFormatDependencyCount = 0
```

Representative canonical digest:

```text
bb831443d6e2ae2f6d05911d3d665c9feef603ac2697d273ea793b30409b152b
```

Validation checks include:

- unique IDs;
- parent references;
- contiguous page/child order;
- UTF-16 run coverage;
- asset references;
- inline asset SHA-256;
- finite numerics;
- deterministic serialization idempotence;
- strict-v1 field coverage;
- zero private-format dependencies.

TypeScript contract validation also completed with exit code 0 using the existing Penpot TypeScript installation; no dependency was added.

## Artifact hashes

Canonical IR folder after TASK 5:

```text
12 files
SHA-256 tree:
ddc3e06eb958b08cee635e69214a42b29e2a2a230028520aacbb97a695571192
```

Whole Penpot-to-Canva adapter after TASK 5:

```text
20 files
SHA-256 tree:
b50650c8cbad0d1c4f4630367c51b690cd71e194dc868b6ef77582cbdc2fcb74
```

The existing TASK 3 probe subtree remains exactly identical to its pre-TASK-5 baseline:

```text
de0e0bd374c68b23929794993fbb7855d0e7031b0055a01405439f4bf5c1001e
MATCH = true
```

## Protected boundaries

Penpot source:

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

No Penpot source or existing Figma exporter file was changed.

## Gate P3

**PASS.**

A representative strict-v1 Penpot semantic document can be represented completely by Canonical Design IR v1 for the selected Canva scope without requiring Penpot/Canva private document formats.

This does **not** claim support for excluded semantics such as gradients, masks, crop, effects, tables, video, placeholder emulation or Autofill.

## Next state

```text
TASK 1 COMPLETE
TASK 2 COMPLETE
TASK 3 COMPLETE
TASK 4 COMPLETE
TASK 5 COMPLETE

Gate P0 PASS
Gate P1 PASS
Gate P2 PASS
Gate P3 PASS

TASK 6 NOT STARTED
```
