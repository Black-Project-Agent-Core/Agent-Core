# Canva Target Capability Matrix — 2026-10-02

## Status

**TASK 2 COMPLETE — DOCUMENTATION-GROUNDED CAPABILITY MATRIX ESTABLISHED.**

**Historical TASK 2 snapshot.** The later [TASK 3 runtime acceptance](Penpot-to-Canva-Task3-Runtime-Acceptance-20261002.md) supersedes this document's initial TASK 3 / Gate P1 pending state for the specifically tested scope. See the [bridge execution plan](Canva-Penpot-Semantic-Bridge-Execution-Plan-20261001.md) for the latest recorded sequence. Public API versions and capabilities below remain the 2026-10-02 research snapshot; they were not rechecked against the web in the 2026-10-08 documentation review.

This report is the TASK 2 authority for the Canva–Penpot Semantic Bridge plan. It records what the current public Canva developer surfaces document as of 2026-10-02. It does **not** claim runtime round-trip fidelity; that proof belongs to TASK 3.

## 1. Authority policy

Production decisions use only current **GA** Canva Developers SDK / REST API contracts. Preview/Beta APIs are recorded separately because they materially affect the architecture, but Canva explicitly states public apps cannot be released using Preview APIs.

At this TASK 2 checkpoint, every semantic was labeled `PENDING TASK 3`. Later runtime proof is scoped by the linked TASK 3 report; it must not be generalized to unsupported semantics. No Penpot mapping becomes `NATIVE` only because documentation suggests a matching Canva concept.

## 2. Current public Canva versions relevant to the bridge

```text
@canva/design 2.13.1  2026-09-21  current GA line
2.12.0                 2026-08-12  stable PageId
2.11.0                 2026-08-10  line-height + letter-spacing GA
2.10.0                 2026-06-12  multi-page Design Editing GA
2.6.1                  2025-06-24  Design Editing API GA
```

REST Autofill milestones:

```text
2026-08-25  get-design-dataset, create_from_design, update_design,
            chart/sheet/video field modes GA
2026-09-21  Autofill extended to Pro and Teams in addition to Enterprise
2026-09-23  chart fields + video autofill GA
```

## 3. Capability matrix

| Semantic | Read | Create | Update | Delete | Reorder | Production status |
|---|---|---|---|---|---|---|
| Absolute page | YES | YES | PARTIAL | DOC_GAP | DOC_GAP | Native candidate |
| Multi-page traversal/editing | YES | N/A | YES | DOC_GAP | DOC_GAP | Native candidate |
| Stable PageId | YES | returned on create | N/A | N/A | N/A | GA |
| Add page | YES | YES | N/A | DOC_GAP | N/A | Native candidate |
| Insert new page at chosen position | N/A | PREVIEW | N/A | N/A | PREVIEW | Preview only |
| Duplicate page | N/A | PREVIEW | N/A | N/A | PREVIEW | Preview only |
| Delete existing page | N/A | N/A | N/A | DOC_GAP | N/A | Blocked |
| Reorder existing page | YES | N/A | N/A | N/A | DOC_GAP | Blocked |
| Page dimensions | YES | YES on new page | DOC_GAP existing | N/A | N/A | Partial |
| Page background | YES | YES | YES | YES/clear | N/A | Native candidate |
| Rect | YES | YES | YES | YES | YES | Native candidate |
| Shape/vector | YES | YES | PARTIAL | YES | YES | Partial/native candidate |
| Group | YES | YES | YES | YES | YES | Native candidate |
| Embed | YES | YES | YES | YES | YES | Native candidate |
| Rich text | YES | YES | YES | YES | YES | Native candidate |
| Position / rotation / transparency | YES | YES | YES | N/A | N/A | Native candidate |
| Width/height/resizing | YES | YES | PARTIAL/type-specific | N/A | N/A | Needs probe |
| Locked state | YES | DOC_GAP | NO public toggle found | N/A | N/A | Read-only |
| Element layer order | YES | YES | YES | YES | YES | Native candidate |
| Solid fill | YES | YES | YES | YES | N/A | Native candidate |
| Image/video fill | YES | YES | YES | YES | N/A | Native candidate |
| Image/video asset transport | YES | YES/upload | N/A | PARTIAL | N/A | Native candidate |
| User-replaceable media frame | YES | YES | YES | YES | N/A | **Native candidate** |
| Image crop/imageBox | DOC_GAP | DOC_GAP | DOC_GAP | N/A | N/A | Blocked |
| Solid stroke | YES | YES | YES | YES | N/A | Native candidate |
| Gradient fill | NO | NO | NO | N/A | N/A | Unsupported currently |
| Gradient stroke | NO | NO | NO | N/A | N/A | Unsupported currently |
| Mask/clipping | DOC_GAP | DOC_GAP | DOC_GAP | N/A | N/A | Blocked |
| Effects/shadows/blur | DOC_GAP | DOC_GAP | DOC_GAP | N/A | N/A | Blocked |
| Table | NO via Design Editing | YES via Table API | PARTIAL | DOC_GAP | PARTIAL | Partial |
| Chart | YES as Autofill field | no direct element CRUD found | YES via Autofill | DOC_GAP | DOC_GAP | Partial |
| Sheet | YES as Autofill field | no direct element CRUD found | YES via Autofill | DOC_GAP | DOC_GAP | Partial |
| Existing Autofill fields | YES | new design from tagged source | YES/in-place | N/A | N/A | Native candidate |
| Create/connect Autofill field mapping | PREVIEW | PREVIEW | PREVIEW | PREVIEW/Unset | N/A | **Preview only** |
| App Element metadata carrier | app-owned | YES | app-owned | YES | YES | Emulation fallback |
| Stable ElementId | PREVIEW evidence | N/A | N/A | N/A | N/A | Do not depend on GA yet |
| Canva Docs/non-absolute pages | NO Design Editing | PARTIAL cursor APIs | NO structural edit | NO | N/A | Out of v1 scope |

At the original TASK 2 checkpoint every row above had structural round-trip status **PENDING TASK 3**. Current recorded proof for tested rows is in the linked TASK 3 acceptance report; untested semantics remain outside that proof.

## 4. Production-v1 candidate surface

Current GA APIs provide a credible semantic path for:

```text
Page / stable PageId
Page background
Multi-page traversal

Rect
Shape (within Canva path constraints)
Group
Embed
Rich Text

Position
Rotation
Transparency
Layer order

Solid fill
Image/video fill
Solid stroke
Image/video assets
Replaceable media frame

Existing Autofill dataset read/fill/update
```

Images and videos in Design Editing are represented as media fills rather than dedicated image/video nodes. This supports the bridge decision to keep **frame/container semantics separate from asset identity** in the future IR.

## 5. Important discovery — native replaceable media frame is GA

Canva's GA shape API exposes `fill.dropTarget`. When `dropTarget = true`, users can replace the fill by dropping an image or video onto it. A drop target with no initial color/image/video acts as a frame. The read side also exposes `Path.isMediaEditable` and `mediaContainer.set(...)`.

Potential future mapping:

```text
Penpot ImagePlaceholder
        ↓
IR ImageFrame { replaceable = true }
        ↓
Canva Shape Path Fill { dropTarget = true }
```

This is a **GA native candidate**, subject to TASK 3 runtime proof. It is not the same semantic as an Autofill data field.

## 6. Autofill — strong GA fill path, Preview field-creation path

Current GA REST APIs can read existing design/brand-template datasets and fill fields of type:

```text
image  (an image field can also accept video)
text
chart
sheet
```

Current GA job modes include:

```text
create_from_brand_template
create_from_design
update_design
```

Therefore an already-tagged design can be read, cloned/filled, or updated in place.

The Preview SDK adds `openDesign(...).helpers.getDataFieldFor({ target })`. Its accessor can `get()` a field label, `set({ label })` to connect to **or create** a field, and `set({ label: Unset })` to remove the mapping. Preview targets include `TextElement`, `RectElement`, and `PathFillWithEditableMedia`.

This is architecturally important but remains **Preview only** and cannot be a production dependency until GA.

## 7. Placeholder is now two separate semantics

### A. Replaceable media slot

User manually replaces an image/video while keeping its frame. Current status: **GA candidate via shape fill `dropTarget`**.

### B. Dataset / Autofill field

An automated workflow addresses a named field such as `HERO` or `TITLE`.

```text
Read existing field      = GA
Fill existing field      = GA
Update design in-place   = GA
Create/tag field mapping = Preview
```

The future IR and compatibility report must keep these two concepts separate.

## 8. Explicit blockers and gaps

### Page lifecycle
- GA: read pages, multi-page traversal, stable PageId, add page.
- Not found as GA contracts: arbitrary existing-page delete, move/reorder, resize.
- Positioned insertion and duplication are currently Preview.

### Gradient
Design Editing explicitly supports color/image/video fills and states gradients will be supported in the future. Current Stroke API exposes solid color only. Gradient fill/stroke are therefore **unsupported currently**, not just untested.

### Crop
No GA `imageBox`/crop contract was found in current GA `addElementAtPoint` or Design Editing references. Historical Preview documentation mentions `imageBox` for video, which does not establish a GA image-crop contract.

### Masks / clipping
No GA arbitrary mask/clipping CRUD contract was found.

### Effects / shadows / blur
No GA structural Design Editing contract was found for Penpot-style shadow/blur/effect semantics.

### Tables
Tables can be created via the Table API, but Design Editing explicitly says tables are not currently supported. This prevents a complete structural read/write/read-back contract.

### Chart / sheet
These are GA Autofill field types, but no equivalent general Design Editing element CRUD contract was identified.

## 9. Stable identity

`PageId` is GA and stable.

`Element.id` / `ElementId` appears in the Preview changelog, but the current GA `AbsoluteElement` reference inspected during TASK 2 did not expose `id`. The bridge must **not depend on stable GA element IDs yet**. TASK 3 must inspect the actual GA session/package behavior before an identity strategy is finalized.

## 10. App Elements remain fallback only

App Elements can carry up to 5 KB app metadata, but users cannot select individual children, ungroup them, or edit them except through the creating app. They also cannot contain groups, tables, videos, or other App Elements, and effects are unavailable.

Therefore:

```text
App Element = semantic/emulation escape hatch
App Element ≠ default Canva compiler target
```

## 11. Strict-v1 exclusions until stronger proof exists

```text
existing-page delete/reorder
existing-page resize
arbitrary crop
gradient fill/stroke
mask/clipping
shadow/blur/effects
full table round-trip
direct chart/sheet structural CRUD
GA data-field creation/tagging
GA stable element identity
Canva Docs structural editing
```

## 12. TASK 3 probe queue

TASK 3 is **not started**. TASK 2 only defines what TASK 3 must prove:

1. Multi-page PageId + page→elements read-back.
2. Rect full CRUD and ordering.
3. Shape path creation + geometry read-back.
4. Group/ungroup and nested hierarchy.
5. Rich-text runs, font, line-height, letter-spacing, alignment.
6. Transform numeric fidelity.
7. Width/height resizing mechanism per element type.
8. Image/video fill asset identity.
9. `dropTarget` frame → replacement → read-back.
10. Solid stroke.
11. Actual GA ElementId availability.
12. Existing Autofill dataset read/fill/update.
13. Preview `getDataFieldFor` only as a separate non-production research probe if enabled.
14. Negative behavior for gradient, table Design Editing, crop, masks, and effects.

## 13. Gate status

```text
TASK 1 / P0  COMPLETE
TASK 2       COMPLETE
TASK 3       NOT STARTED
```

At the original TASK 2 checkpoint, the public target surface was classified and Gate P1 remained open pending controlled read/create/update/delete/read-back evidence. The later TASK 3 report supersedes that gate status for its tested scope. Documentation-backed candidates outside that proof must not be advertised as lossless/native mappings.

## 14. Official authority URLs

- https://www.canva.dev/docs/apps/design-editing/
- https://www.canva.dev/docs/apps/api/latest/design-open-design/
- https://www.canva.dev/docs/apps/api/latest/design-changelog/
- https://www.canva.dev/docs/apps/api/latest/design-add-page/
- https://www.canva.dev/docs/apps/api/latest/design-types-element-list/
- https://www.canva.dev/docs/apps/api/latest/design-types-absolute-element/
- https://www.canva.dev/docs/apps/api/latest/design-types-path/
- https://www.canva.dev/docs/apps/api/latest/design-types-stroke/
- https://www.canva.dev/docs/apps/api/latest/design-create-richtext-range/
- https://www.canva.dev/docs/apps/creating-shapes/
- https://www.canva.dev/docs/apps/creating-tables/
- https://www.canva.dev/docs/apps/creating-app-elements/
- https://www.canva.dev/docs/apps/uploading-assets/
- https://www.canva.dev/docs/apps/rest-apis/reference/designs/get-design-dataset/
- https://www.canva.dev/docs/apps/rest-apis/reference/autofills/
- https://www.canva.dev/docs/apps/rest-apis/reference/autofills/create-design-autofill-job/
- https://www.canva.dev/docs/apps/rest-apis/changelog/
- https://www.canva.dev/docs/apps/api/preview/design-changelog/
- https://www.canva.dev/docs/apps/api/preview/design-duplicate-page/
- https://www.canva.dev/docs/apps/api/preview/design-set-data-field-label-visibility/