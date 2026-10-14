# Penpot Semantic Coverage Matrix — 2026-10-02

## Status

**TASK 4 COMPLETE — GATE P2 PASS FOR THE STRICT SUPPORTED V1 SOURCE SCOPE.**

**TASK 5 NOT STARTED.**

This document maps the exact modified Penpot Plugin API surface to the Canva capability/runtime evidence from TASK 2–3.

## 1. Product boundary

```text
Modified Penpot
  -> Penpot Semantic Extractor
  -> Canonical Design IR (TASK 5, not started)
  -> Penpot-to-Canva compiler/app
  -> Canva
```

Agent Core remains engineering support only.

## 2. Critical model decision: Penpot Board -> Canva Page

A Penpot `Page` is a workspace/grouping container. It can contain multiple boards/screens.

A Penpot `Board` owns the semantics that correspond to a fixed Canva page:

- stable shape ID;
- name;
- width/height;
- fills/background;
- child hierarchy;
- z-order;
- geometry.

Therefore the v1 mapping is:

```text
Penpot File
  -> Penpot Page (source section/grouping metadata)
      -> top-level Board
          -> Canva Page
```

Strict v1 exports **top-level Boards only** as Canva pages. Loose root-level shapes outside a Board are compatibility findings, not silently wrapped into synthetic pages.

## 3. Page ordering

Penpot exposes `currentFile.pages` as an ordered array.

Inside a Penpot Page, Board z-order is available, but Penpot has no first-class "slide sequence" semantic for multiple spatial Boards.

Therefore page sequence is:

1. preserve Penpot File.pages order;
2. for Boards inside one Penpot Page, use explicit Penpot-to-Canva PluginData order when present;
3. a deterministic spatial fallback may be proposed later, but it must be classified as normalization/emulation, never native source order.

This does **not** require a Penpot core change.

## 4. Existing extraction seam

Current authority:

```text
execute_code
  -> penpot global Plugin API
  -> PenpotUtils
```

`ExecuteCodeTaskHandler` already:

- exposes `penpot`, `penpotUtils`, persistent storage and captured console;
- enables `penpot.flags.naturalChildOrdering = true` during execution;
- enables validation errors;
- waits for layout update when available.

This is sufficient for a read-only Penpot semantic extractor.

## 5. Supported v1 source matrix

| Canva target | Penpot source | Plugin API extraction | TASK 4 classification | v1 |
|---|---|---|---|---|
| Canva Page | top-level `Board` | Board id/name/width/height/fills/children | DIRECT_NORMALIZATION | INCLUDE |
| Multi-page | `File.pages -> Page.root -> Board` | ordered file pages + tree traversal | DIRECT_NORMALIZATION | INCLUDE, board-order policy required |
| Page dimensions | Board width/height | read-only geometry | DIRECT | INCLUDE at create time |
| Page background | Board fills | Fill solid/image data | DIRECT_CONDITIONAL | INCLUDE supported subset |
| Rect | `Rectangle` | geometry/fills/strokes/radii | DIRECT | INCLUDE |
| Vector shape | `Path`, `Boolean`, `Ellipse` | Path/Boolean `d`; ellipse geometry | DIRECT_NORMALIZATION | INCLUDE supported subset |
| Group | `Group` | children + parent/parentIndex | DIRECT_CONDITIONAL | INCLUDE non-mask groups |
| Rich text | `Text` + `TextRange` | characters + getRange + typography/fills | DIRECT_NORMALIZATION | INCLUDE |
| Position | ShapeBase x/y/parentX/parentY | direct | DIRECT | INCLUDE |
| Rotation | ShapeBase rotation | direct | DIRECT | INCLUDE |
| Transparency | ShapeBase opacity | direct | DIRECT | INCLUDE |
| Element size | ShapeBase width/height | direct read | DIRECT | INCLUDE at target creation |
| Layer order | children + parentIndex | naturalChildOrdering=true | DIRECT | INCLUDE |
| Solid fill | `Fill.fillColor/fillOpacity` | direct | DIRECT_CONDITIONAL | INCLUDE simple supported fill |
| Image fill | `Fill.fillImage` | ImageData | DIRECT | INCLUDE |
| Image asset bytes | `ImageData.data()` | bytes + MIME + dimensions + ID | DIRECT | INCLUDE |
| Replaceable media role | no native semantic | PluginData candidate | EMULATION_METADATA | awaiting explicit approval |
| Solid stroke | `Stroke` | width/color/opacity/style/etc. | DIRECT_CONDITIONAL | INCLUDE solid subset |
| Source identity | Page/Board/Shape `id` | direct | DIRECT | INCLUDE as `sourceId` |
| Locked source state | ShapeBase `blocked` | direct | DIRECT | preserve/report only |

## 6. Rich text coverage

The Plugin API exposes:

```text
Text.characters
Text.fontId
Text.fontFamily
Text.fontVariantId
Text.fontSize
Text.fontWeight
Text.fontStyle
Text.lineHeight
Text.letterSpacing
Text.align
Text.verticalAlign
Text.textBounds
Text.getRange(start, end)

TextRange:
  characters
  fontId
  fontFamily
  fontVariantId
  fontSize
  fontWeight
  fontStyle
  lineHeight
  letterSpacing
  textTransform
  textDecoration
  direction
  fills
  align
  verticalAlign
```

When Text-level attributes are `mixed`, the extractor can read character ranges and coalesce adjacent equal style tuples.

No Penpot core change is required for rich-text extraction.

Target-side font availability is still a compatibility concern: Penpot can identify the family/variant, but Canva must have a compatible font available.

## 7. Image semantics

Modern Penpot images are not normally standalone Image nodes. They are stored as:

```text
Shape
  -> fills[]
      -> fillImage: ImageData
```

`ImageData` exposes:

```text
id
name
width
height
mtype
keepAspectRatio
data() -> Uint8Array
```

This is a strong match for the Canva model proven in TASK 3:

```text
frame/container
  +
Canva ImageRef media fill
```

Image bytes can be transferred without SVG/PDF/PPTX as the authoritative intermediate.

## 8. Real Plugin API gap: image crop transform

Internal Penpot `common` schema contains:

```text
ImageTransform
  x
  y
  width
  height
```

at:

```text
common/src/app/common/types/color.cljc
```

and `schema:image` has optional `:transform`.

But public `@penpot/plugin-types 1.5.0` `ImageData` does **not** expose that transform.

Therefore exact image crop/transform is a real Plugin API boundary gap.

It is **not a TASK 4 blocker** because Canva crop/imageBox is also outside the proven target v1 scope.

Future owner if scope changes:

```text
common/src/app/common/types/color.cljc
common/src/app/common/types/fills.cljc
Penpot Plugin API implementation/types
```

The frontend authoring implementation is absent from this runtime-pruned Penpot snapshot, so TASK 4 does not invent or edit a missing owner.

## 9. Placeholder / semantic-role strategy

There is no built-in Penpot semantic equivalent to a Canva replaceable-media slot.

However `Page`, `Shape`, `File`, etc. implement `PluginData`:

```text
getPluginData(key)
setPluginData(key, value)
getPluginDataKeys()

getSharedPluginData(namespace, key)
setSharedPluginData(namespace, key, value)
```

So a future Penpot-to-Canva UX can mark a frame explicitly, e.g.:

```text
role = image-placeholder
```

without changing Penpot core.

This remains **EMULATION_METADATA** and is not admitted to strict v1 until explicitly approved.

The same mechanism can later hold:

- explicit Canva page/export order;
- Autofill label/type;
- other bridge-owned semantic roles.

Name-based heuristics are not authority.

## 10. Source semantics available but blocked on Canva side

Penpot can extract these, but Canva v1 cannot preserve them structurally today:

| Penpot semantic | Plugin API | Canva state |
|---|---|---|
| Gradient fill | `Fill.fillColorGradient` | unsupported |
| Gradient stroke | `Stroke.strokeColorGradient` | unsupported |
| Mask | `Group.isMask()` | target gap |
| Board clipping | `Board.clipContent` | target gap |
| Drop/inner shadow | ShapeBase `shadows` | target gap |
| Blur | ShapeBase `blur` | target gap |
| Background blur | ShapeBase `backgroundBlur` | target gap |
| Blend modes | ShapeBase `blendMode` | not in proven v1 |

These are compatibility-report findings, not reasons to modify Penpot.

## 11. Source-side concepts absent from strict semantic API

### Embed

The Penpot Shape union has:

```text
Board
Group
Boolean
Rectangle
Path
Text
Ellipse
SvgRaw
Image (legacy)
```

There is no first-class Embed node.

Strict v1 excludes Canva Embed.

### Video

Installed `@penpot/plugin-types 1.5.0` exposes image media but no first-class video asset/fill semantic.

Strict v1 supports image assets only.

### Table / chart / sheet

There are no first-class semantic Table, Chart or Sheet nodes.

A Penpot GridLayout is layout structure, **not** evidence of a semantic table.

Strict mode must not infer those semantics from visual appearance.

## 12. True core-change candidates

### Required for strict v1

**None.**

All strict-v1 source semantics can be extracted through the current Plugin API/MCP seam.

### Future-only candidates

1. **Image crop/transform exposure**
   - internal model already has `image.transform`;
   - public Plugin API omits it;
   - activate only if Canva exposes target crop and exact crop fidelity becomes required.

2. **Native video media**
   - no Plugin API video semantic now;
   - activate only if Penpot itself gains/needs native video source content.

First-class Embed/Table/Chart/Sheet would be product-scope additions rather than fixes required for the current bridge.

## 13. Source ownership map

| Concern | Current owner/evidence |
|---|---|
| MCP semantic execution | `mcp/packages/plugin/src/task-handlers/ExecuteCodeTaskHandler.ts` |
| Traversal/helpers | `mcp/packages/plugin/src/PenpotUtils.ts` |
| Installed Plugin API contract | `mcp/packages/plugin/node_modules/@penpot/plugin-types/index.d.ts` |
| Internal image transform | `common/src/app/common/types/color.cljc` |
| Fill model | `common/src/app/common/types/fills.cljc` |
| Plugin metadata schema | `common/src/app/common/types/plugins.cljc` |
| Shape/effect internals | `common/src/app/common/types/shape*.cljc` |
| Text/typography internals | `common/src/app/common/types/text.cljc`, `typography.cljc`, `shape/text.cljc` |
| Frontend Plugin API authoring implementation | **not present in this runtime-pruned snapshot** |

## 14. Gate P2 first implementation scope

### Include

```text
top-level Board -> Canva Page
Board name/dimensions
supported Board background
Rectangle
Path / Boolean
Ellipse -> path normalization
non-mask Group
Rich Text
position / rotation / opacity
creation-time size
z-order
single solid fill
image fill
image asset bytes
solid stroke subset
Penpot source IDs
```

### Conditional

```text
Board sequence
  -> explicit PluginData preferred

multiple fills
  -> compatibility finding

font unavailable in Canva
  -> compatibility finding/fallback policy required later

nested Board
  -> needs explicit normalization rule
  -> clipping variants rejected in strict v1
```

### Exclude/defer

```text
Embed
Video
Crop
Gradients
Masks/clipping
Shadows/blur/effects
Tables
Charts/Sheets as semantic objects
existing Canva page delete/reorder/resize
Canva Docs
Autofill runtime/data-field creation
```

### Emulation candidates awaiting approval

```text
image-placeholder role via PluginData
explicit Canva page order via Board PluginData
Autofill label/type via PluginData
```

## 15. Gate result

```text
TASK 1 COMPLETE
TASK 2 COMPLETE
TASK 3 COMPLETE
TASK 4 COMPLETE

Gate P0 PASS
Gate P1 PASS for supported v1 scope
Gate P2 PASS for strict source scope

TASK 5 NOT STARTED
```

Gate P2 passes because the initial implementation can be built entirely from semantics supported by both the Penpot Plugin API and the proven Canva target surface, without changing Penpot core.

