# Canva-Penpot Semantic Bridge Execution Plan — 2026-10-01

## Status

**PLAN ACTIVE — TASK 1 COMPLETE; TASK 2 COMPLETE; TASK 3 COMPLETE; TASK 4 COMPLETE; TASK 5 COMPLETE; TASK 6 COMPLETE WITH GATE P4 PASS; TASK 7 NOT STARTED. Agent Core remains engineering support only and is not a Canva runtime/adapter dependency.**

This document defines the execution path for continuing the user's existing modified Penpot at:
`F:\Content Creator\Astra Content Factory\Toolchain\sources\penpot`

Agent Core is the engineering assistant that inspects, plans, implements, records failures, and preserves durable lessons. Agent Core is **not** the design editor and is not the runtime that should author the designs.

## End goal

Build a Penpot-to-Canva bridge that converts a design created in the modified Penpot into a Canva design that remains natively editable for the supported scope.

The target is not visual similarity alone. The target is preservation of document semantics where Canva exposes an equivalent concept.

Required end-state user flow:

```text
Design in modified Penpot
        ->
Export / Send to Canva
        ->
Canva design is created/opened
        ->
supported text, shapes, groups, image fills,
hierarchy, transforms and semantic fields remain editable
```
## Success definition

A conversion is successful only when all supported source semantics are accounted for.

For every source feature the bridge must report exactly one compatibility state:

- `NATIVE` — preserved using a supported Canva-native representation.
- `EMULATED` — behavior preserved through a documented bridge convention.
- `PARTIAL` — only a known subset can be preserved.
- `UNSUPPORTED` — cannot currently be represented safely.

No silent flattening is allowed in strict mode.

The long-term acceptance target for the supported template scope is:

```text
lost semantics = 0
silent approximations = 0
unreported unsupported features = 0
```

Visual screenshot comparison is secondary evidence. Structural read-back is the authority for editability.

## Grounded architecture decisions

1. The user's modified Penpot 2.17.0 tree is the source foundation.
2. Do not create another Penpot fork.
3. Do not replace Penpot with OpenDesign, Scenify or Layerhub by default.
4. Those projects may be used only as donor/reference material for concrete missing mechanisms.
5. Canva desktop private IPC and `documentContentBlob` are evidence, not integration contracts.
6. Public Canva developer surfaces are the target authority.
7. Penpot MCP/Plugin API is the first integration seam.
8. Penpot core modification is escalation-only when the Plugin API cannot expose a required semantic.
## Target architecture

```text
MODIFIED PENPOT
   |
   | Penpot Plugin API / MCP plugin
   v
Penpot Semantic Extractor
   |
   v
Canonical Design IR
   |
   +--> Compatibility Analyzer
   |      NATIVE / EMULATED / PARTIAL / UNSUPPORTED
   |
   v
Canva Compiler
   |
   +--> Asset Transport
   +--> Placeholder/Autofill Strategy
   |
   v
Supported Canva API / Canva App
   |
   v
Native Canva Design
   |
   v
Canva Read-back
   |
   v
Structural Comparator + Compatibility Report
```

The Canonical Design IR must not be a Canva-private blob and must not be the native Penpot file format. It is a versioned semantic interchange layer owned by this tool.

## Explicit non-goals

- Do not reverse engineer Canva credentials or private user data.
- Do not patch `Canva.exe` or depend on private desktop IPC.
- Do not treat SVG/PDF/PNG as the primary semantic transfer format.
- Do not rebuild Penpot from zero.
- Do not merge several editors into one codebase.
- Do not claim 100% Canva compatibility before read-back proves it.
# Phase 0 — Freeze the modified Penpot baseline

## Objective

Establish an exact source baseline before any implementation because the Penpot root is not a Git working tree.

## Actions

- Inventory relevant source files and hashes.
- Record Penpot version and package/toolchain versions.
- Record the current MCP/plugin/exporter structure.
- Identify existing custom modifications that must not regress.
- Create Agent Core file checkpoints for every file before it is changed.
- Keep the existing Penpot-to-Figma behavior out of scope unless a shared file is touched.

Initial relevant areas:

```text
mcp/packages/plugin/
mcp/packages/server/
mcp/packages/common/
common/
frontend/
exporter/
render-wasm/
```

Only the MCP/plugin areas should be considered writable initially.

## Deliverables

- Penpot baseline manifest.
- Relevant-file SHA-256 inventory.
- Ownership map for Canva bridge files.
- List of known existing custom behavior.

## Gate P0

Do not implement the Canva bridge until the baseline can distinguish pre-existing Penpot state from new Canva work.

### TASK 1 closure — 2026-10-02

**COMPLETE — READ-ONLY BASELINE ESTABLISHED — GATE P0 PASS.** The authoritative report is `docs/Penpot-Exact-Baseline-Manifest-20261002.md`; machine-readable evidence is under `runtime/tmp/penpot-baseline-20261002/`. The current Penpot tree was not modified. Exact SHA-256 inventories now cover the source authority, focused Phase-0 areas, MCP resident build, ownership-area digests, and the separately protected Penpot→Figma adapter boundary. Because the Penpot root has no `.git`, current local bytes are the baseline authority; official Penpot `2.17.0` (`bdce5817...`) was used only as a reference comparison and is not treated as a custom-modification ledger. No authored Canva bridge implementation was identified. **TASK 2 was subsequently completed as a documentation-grounded capability matrix; see its Phase 1 closure below.**

# Phase 1 — Build the Canva Target Capability Matrix

## Objective

Determine exactly what Canva can currently read, create, update and preserve through supported developer APIs.

## Matrix dimensions

For every semantic record:

```text
Can read?
Can create?
Can update?
Can delete?
Can reorder?
Can round-trip?
Can remain user-editable?
Can preserve identity?
Can preserve grouping/hierarchy?
```

Initial capability families:

- pages and page dimensions/background;
- text and rich-text runs;
- rects;
- vector/custom shapes;
- groups;
- element ordering/z-order;
- position, size, rotation, transparency and lock state;
- image fills and crop behavior;
- strokes/fills/gradients;
- masks/clipping;
- effects/shadows/blur;
- embedded content;
- asset identity;
- semantic image/text placeholders;
- Autofill fields;
- tables/charts/sheets;
- animations and unsupported Canva-only types.

## Current known boundary

The current Design Editing API supports absolute pages and CRUD for a subset including groups, rects, shapes, text and embeds. Image/video content is represented through fills rather than a dedicated Design Editing image/video element. Tables are not currently supported by that API.
### TASK 2 closure — 2026-10-02

**COMPLETE — DOCUMENTATION-GROUNDED CANVA TARGET CAPABILITY MATRIX ESTABLISHED.** Authority artifacts: `docs/Canva-Target-Capability-Matrix-20261002.md` and `.json`; evidence snapshot: `runtime/tmp/canva-target-capability-matrix-20261002/evidence.json`. Production classification uses GA Canva Developers SDK/REST contracts only; Preview/Beta capabilities are recorded separately and are not production authority. Key findings: GA native candidates exist for absolute/multi-page editing, rect/shape/group/embed/richtext, list ordering, solid/media fills, solid strokes, assets, and user-replaceable media frames via shape `dropTarget`; current Design Editing explicitly lacks gradient fills and tables; no GA contracts were found for arbitrary crop, masks/clipping, effects/shadows/blur, existing-page delete/reorder/resize, or direct chart/sheet structural CRUD. Existing Autofill dataset read/fill/update is GA, while programmatic creation/connection of text/fill data-field mappings via `getDataFieldFor().set({label})` is Preview only. Stable PageId is GA; stable ElementId must not yet be assumed GA. **TASK 3 is NOT STARTED. Gate P1 remains OPEN until controlled runtime read/write/read-back evidence exists.**

## Controlled Canva reference design

Create one dedicated test design in Canva containing representative cases for every target semantic.

Examples:

```text
Page A
  text
  rich text
  rect
  custom vector
  group
  nested group
  image fill
  rotation
  transparency
  lock
  background

Page B
  crop/mask candidates
  effects
  gradients
  multiple image fills
  z-order edge cases

Page C
  Autofill text field
  Autofill image field
  chart/sheet fields if available
```

Read the design through supported APIs, mutate a copy, then read it back.

### TASK 3 runtime status — 2026-10-02

**COMPLETE — GATE P1 PASS FOR THE SUPPORTED V1 SCOPE.** Runtime authority is `docs/Penpot-to-Canva-Task3-Runtime-Acceptance-20261002.md` + `.json`, with machine evidence under `runtime/tmp/penpot-to-canva-task3-20261002/`. The correct product boundary is modified Penpot → `Penpot-to-Canva` bridge/app → Canva; Agent Core remains engineering support only. Local Preview correctly uses Canva's documented Development URL `http://localhost:8080/`; the Toolchain dev server root returns the JavaScript bundle directly as `text/javascript`, while Developer Portal bundle upload remains a separate review/release path. Actual runtime proof now covers absolute-page read, opened-page PageId, multi-page traversal/openPage, page background mutation, `addPage()` with native text/image elements, rect/richtext/shape CRUD, media-editable path semantics, transform/fill/stroke updates, z-order, asset upload/data URL, native image fill, group/ungroup, delete/cleanup, and deep multi-page structural read-back. Images added through `addPage()` are observed by Design Editing as rect elements with native image media fills. A real lifecycle failure was isolated: rapid `sync()` calls can return `RATE_LIMITED`, and chaining group→ungroup→delete inside one long-lived `openDesign` callback can return Canva `INTERNAL_ERROR` at finalization even after intermediate syncs succeed. The verified correction is split-session execution: create/sync/close → group/sync/close → ungroup/sync/close → delete/sync/close. Autofill remains a separate tagged-design/OAuth track and is not promoted by TASK 3. **TASK 4 remains NOT STARTED pending user review.**

## Deliverables

- `Canva-Target-Capability-Matrix.md/json`
- controlled Canva reference-design specification;
- read/create/update/delete/read-back evidence;
- explicit list of public API gaps.

## Gate P1

**PASS for the supported v1 scope.** A Penpot-side mapping may be declared native only for semantics with TASK 3 runtime proof or explicit Canva GA documentation; unsupported/documentation-gap and deferred Autofill semantics remain outside the proven native scope.
# Phase 2 — Determine Penpot semantic coverage

## Objective

Map the modified Penpot's Plugin API to the Canva capability matrix before changing Penpot core.

## First authority

Use the existing MCP Plugin path:

```text
execute_code
  -> Penpot Plugin API
  -> penpot
  -> PenpotUtils
```

Existing source already exposes semantic access to pages, shape hierarchy/types, flex/grid layout, component instances, geometry, text bounds, image fills, tokens and variants.

## Actions

For every Canva target semantic, record:

```text
Penpot source concept
Plugin API property/method
Can extract without mutation?
Can identify stable parent/child order?
Can recover required assets?
Can reconstruct required text/style information?
Needs common/frontend/core access?
```

Do not change core merely because internal source offers more data. Escalate only when the public/plugin path is insufficient for a required supported Canva semantic.

## Deliverables

- `Penpot-Semantic-Coverage-Matrix.md/json`
- list of Plugin API gaps;
- list of true core-change candidates;
- source file ownership map for each gap.

### TASK 4 closure — 2026-10-02

**COMPLETE — PENPOT SEMANTIC COVERAGE MATRIX ESTABLISHED.** Authority artifacts: `docs/Penpot-Semantic-Coverage-Matrix-20261002.md` + `.json`; source evidence: `runtime/tmp/penpot-semantic-coverage-20261002/source-evidence.json`; result: `runtime/tmp/penpot-semantic-coverage-20261002/task4-result.json`. The critical source-model decision is **top-level Penpot Board -> Canva Page**, while Penpot Page remains source section/grouping metadata. The existing `execute_code -> penpot -> PenpotUtils` seam can extract every strict-v1 source semantic without Penpot core changes. Rich text is recoverable through `Text`/`TextRange`; image bytes through `ImageData.data()`; hierarchy/z-order through `children`, `parentIndex`, and the existing `naturalChildOrdering` execution flag. No strict-v1 Penpot core change is required. A future-only Plugin API gap exists for image crop: internal `common` image schema has `transform{x,y,width,height}`, while public `ImageData` omits it; this is not a blocker because Canva crop is also outside the proven target scope. Placeholder/page-order/Autofill roles can be carried by `PluginData` without core changes, but remain emulation candidates requiring explicit approval before entering strict implementation. **TASK 5 is NOT STARTED.**

## Gate P2

**PASS for the strict supported v1 source scope.** The first implementation scope is limited to semantics supported on both sides: top-level Board pages, supported background subset, Rectangle, Path/Boolean plus bounded Ellipse normalization, non-mask Groups, Rich Text, geometry/transforms, creation-time size, z-order, solid fill/stroke subset, image fills/assets, and source IDs. Metadata-emulated placeholder/order/Autofill roles are not admitted until explicitly approved.
# Phase 3 — Define Canonical Design IR v1

## Objective

Create a stable semantic schema between Penpot and Canva.

## Minimum document model

```text
Document
  metadata
  assets
  pages[]

Page
  id
  name
  width / height
  background
  children[]

Element
  id
  sourceId
  type
  parentId
  order
  transform
  opacity
  locked
  visible
  compatibility
  semanticRole?
```

Final TASK 5 element families for strict v1:

```text
Text
Rect
Shape
Group
```

Image is represented as an `ImageFill` referencing a separate `ImageAsset`, not as a standalone tree node. `Embed` is excluded from strict v1 because TASK 4 found no first-class Penpot Embed source semantic. The IR reserves generic `semanticRole` / `extensions` space for future placeholder/autofill strategies without coupling the base schema to Canva private internals.
## Text representation

Preserve text at the richest level proven by both systems:

- content;
- rich-text ranges;
- font family/style/weight;
- size;
- line height;
- letter spacing;
- horizontal/vertical alignment where available;
- text box dimensions;
- transformation.

## Image representation

TASK 5 finalizes image representation as frame/container + fill + separate asset:

```text
Rect / Shape
  geometry
  ImageFill
    assetId
    opacity
    keepAspectRatio?

ImageAsset
  id / sourceId
  mimeType
  dimensions
  sha256
  inline bytes or transfer reference
```

Exact crop/mask data is intentionally outside IR v1 because Penpot Plugin API omits internal image transform and Canva crop/mask semantics are outside the proven strict target scope.

## Compatibility metadata

Every IR element must carry conversion status after target analysis:

```text
native
emulated
partial
unsupported
```

with reason codes and no silent fallback.

## Deliverables

- versioned IR JSON schema/types;
- examples for each element family;
- deterministic serialization rules;
- compatibility-report schema.

### TASK 5 closure — 2026-10-02

**COMPLETE — CANONICAL DESIGN IR v1 ESTABLISHED.** Product-side contract lives at `F:\Content Creator\Astra Content Factory\Toolchain\adapters\penpot-to-canva\ir-v1\`. Authority report: `docs/Penpot-to-Canva-Task5-Canonical-IR-v1-20261002.md` + `.json`; validation evidence: `runtime/tmp/canonical-design-ir-v1-20261002/validation-result.json` and `artifact-hashes.json`. IR v1 defines deterministic source-derived identity, parent-relative geometry, explicit sibling order, recursive Text/Rect/Shape/Group trees, rich-text UTF-16 runs, Fill->Asset image semantics, versioned compatibility state/reporting, deterministic canonical serialization and zero private Penpot/Canva document-format dependencies. `coverage-map-v1.json` maps all 20 selected TASK 4 strict-v1 semantics to explicit IR fields. The representative two-page fixture contains all strict tree element families plus image asset/fill and passes ID/reference/order/text-run/asset-hash/determinism invariants. TypeScript contract checking passed with the existing Penpot TypeScript installation and no new dependency. **TASK 6 is NOT STARTED.**

## Gate P3

**PASS.** A representative strict-v1 Penpot semantic document can be represented completely by Canonical Design IR v1 for the selected Canva scope without losing required source information or depending on Penpot/Canva private document formats. Excluded semantics remain explicit compatibility findings rather than silent fallback.
# Phase 4 — Implement Penpot -> IR extractor

## Objective

Extract the current Penpot document semantically without modifying the design.

## Preferred implementation location

Start in the existing MCP/plugin family, not `exporter/`.

Candidate production shape:

```text
mcp/packages/common/
  Canva/IR types

mcp/packages/plugin/
  Penpot semantic serializer

mcp/packages/server/
  export_canva_ir or equivalent tool/task
```

Naming will be chosen after grounding current conventions; this plan does not authorize exact filenames.

## Required behavior

- deterministic traversal;
- stable page and child ordering;
- stable source IDs;
- explicit asset references;
- no design mutation;
- bounded output;
- explicit unsupported semantic list;
- versioned IR output.

## Prototype scope

Only:

```text
page
text
rect
shape
group
image fill
transform
lock
opacity
layer order
```

Do not add effects/placeholders yet.

### TASK 6 extractor acceptance — 2026-10-02

**COMPLETE — FULL ACCEPTANCE PASS.** Audit authority remains `docs/Penpot-to-Canva-Task6-Extractor-Audit-20261002.md` + `.json`; closure authority is `docs/Penpot-to-Canva-Task6-Extractor-Acceptance-20261002.md` + `.json`; accepted baseline is `runtime/tmp/penpot-to-canva-task6-audit-20261002/task6-accepted-baseline.json`.

The former bounded-output blocker is closed with a shared hard ceiling of **12,000,000 UTF-8 bytes**. Before `task.sendSuccess()`, the plugin measures the exact successful response envelope `{id, success:true, data}` in every plugin mode and fails closed when the ceiling is exceeded. Canonical IR is never truncated. The server `export_canva_ir` path also emits compact JSON and independently enforces the same UTF-8 byte ceiling before `TextResponse`, eliminating pretty-print expansion as a second output-growth path. The bound remains below the existing integrated-remote 15,000,000-character transport guard.

Targeted response-boundary tests pass 3/3 on the plugin side and 3/3 on the server side. Existing extractor determinism tests remain 2/2 PASS. Common/plugin/server typechecks pass; common/plugin/server builds pass; compiled plugin/server/common artifacts contain the hard bound and fail-closed paths. The earlier negative fail-closed acceptance probe remains valid. No live runtime invocation is claimed because Penpot MCP ports 4401/4402 were inactive and no restart was required for Gate P4 acceptance. **TASK 7 is NOT STARTED.**

## Gate P4

**PASS.** Repeated reads of an unchanged controlled Penpot file produce structurally identical Canonical IR, and TASK 6 output is now mode-independently bounded without silent truncation.
# Phase 5 — Implement Canva IR compiler

## Objective

Create native Canva elements from IR v1 using supported Canva APIs.

## Compiler responsibilities

- create/read target pages within API limits;
- create text, rect, shape, group and embed elements;
- apply transforms and common properties;
- reproduce layer order using Canva element-list ordering;
- resolve image assets into Canva assets/fills;
- preserve source-to-target mapping IDs in bridge-owned metadata where supported;
- report unsupported mappings before mutation in strict mode.

The compiler should apply a conversion as one logical operation where Canva's editing model permits, so users get predictable undo behavior.

## Strict mode

Before writing:

```text
analyze all IR
-> build compatibility report
-> if blocking unsupported semantic exists
-> do not mutate target
```

## Relaxed mode

Allow only explicitly named approximations, and list each one in the result.

## Gate P5

A minimal reference design must be created in Canva using native editable elements with no flattening for the v1 scope.
# Phase 6 — Solve asset and transport flow

## Objective

Move IR and media from the Penpot tool into the Canva-side compiler without coupling to Canva desktop internals.

This phase intentionally remains transport-neutral until the controlled probe proves the cheapest reliable path.

Candidate transport families:

1. Bridge package selected by the user in the Canva app.
2. Short-lived bridge service/job containing IR and assets.
3. Direct Canva REST asset upload plus design-side import job.
4. Small data-URL assets for development-only prototypes.

Current Canva asset APIs can upload image/video assets. Apps inside Canva can upload assets from HTTPS or data URLs, while REST APIs also provide asset-upload jobs.

## Requirements

- no secret in the IR;
- asset hashes for identity/deduplication;
- deterministic MIME/dimension metadata;
- bounded temporary storage;
- explicit cleanup;
- no permanent dependency on the installed Canva desktop app.

## Gate P6

The same controlled design must import with its image assets on a clean second run without manually repairing paths.
# Phase 7 — Placeholder / Autofill semantic track

## Objective

Resolve the user's highest-risk requirement: image/text placeholders must remain meaningful after conversion.

This is separate from normal image fills.

## Known Canva boundary

Canva Autofill datasets can expose image, text, chart and sheet fields. Current official workflow expects fields to already be tagged through Canva's Data Autofill workflow before REST Autofill jobs use them.

Therefore this phase must answer:

```text
Can our app create the needed native semantic field?
If not:
  can a reusable Canva template seed those fields?
If not:
  can we emulate replaceability without falsely calling it native?
```

## Required strategies to evaluate

- native Autofill field;
- pre-seeded brand/design template field;
- Canva-native frame/fill behavior if available through supported API;
- bridge-owned emulated placeholder metadata as a final fallback.

## Rule

Never label an emulated placeholder as native Canva Autofill.

## Gate P7

Placeholder acceptance requires user-replaceable behavior plus read-back evidence of the exact mechanism used.
# Phase 8 — Structural round-trip verifier

## Objective

Prove semantic fidelity rather than relying on screenshots.

## Verification model

```text
Penpot
  -> IR source snapshot
  -> Canva compile
  -> Canva read-back
  -> normalized target graph
  -> semantic diff
```

Compare at minimum:

- page count/order;
- node count;
- element types;
- parent/child relationships;
- ordering;
- text content/runs;
- transforms;
- dimensions;
- fills/strokes where supported;
- image asset identity;
- lock/transparency state;
- placeholder semantics;
- explicit approximation list.

## Output

```text
native: N
emulated: N
partial: N
unsupported: N
lost: N
unexpected: N
```

For the declared supported scope, release acceptance requires `lost = 0` and `unexpected = 0`.

## Gate P8

No feature can be advertised as lossless until it passes structural round-trip against controlled fixtures.
# Phase 9 — Expand the supported semantic scope

Only after v1 is stable, evaluate additional families in this order:

1. gradients and advanced fills;
2. clipping/masks/crop edge cases;
3. text edge cases and font substitution;
4. strokes and compound vectors;
5. effects/shadows/blur;
6. layout semantics;
7. components/variants;
8. charts/tables/sheets;
9. animations/video;
10. additional Canva-specific constructs.

Each family repeats the same loop:

```text
Canva capability proof
-> Penpot capability proof
-> IR extension
-> extractor
-> compiler
-> read-back
-> compatibility report
```

Never add a family by visual approximation alone.

# Phase 10 — Product workflow

After semantic fidelity is proven, define the final user-facing operation.

Target experience:

```text
Penpot
  [Send to Canva]
      |
      +--> strict compatibility preflight
      +--> clear blocking errors
      +--> transfer IR/assets
      +--> create/open Canva design
      +--> show conversion report
```

The product UX comes after the compiler contract, not before it.
# Testing and verification policy

The user's existing Agent Core rule remains in force: broad tests or unrelated regression suites are not run automatically.

For each implementation phase, propose only the smallest exact verification needed for that phase and wait for authorization when it exceeds activation-required checks.

Examples of targeted future checks:

- schema serialization fixture;
- deterministic extractor fixture;
- Canva API capability probe;
- one controlled read/write/read-back case;
- one asset transfer fixture;
- one placeholder fixture;
- one structural-diff fixture.

No full Penpot test suite is implied by this plan.

# Failure-learning policy

When a real failure occurs:

```text
failure evidence
-> bounded diagnosis
-> changed attempt
-> verified correction
-> only then durable Memory promotion if reusable
```

Do not memorize hypotheses as facts.

Canva API limitations, Penpot Plugin API limitations and successful mapping recipes should become durable Agent Core Memory only after source/read-back evidence supports them.
# Implementation boundaries

## Penpot files

Initial allowed modification family after approval:

```text
F:\Content Creator\Astra Content Factory\Toolchain\sources\penpot\mcp
```

Do not change `common`, `frontend`, `backend`, `render-wasm` or `exporter` merely for convenience.

A deeper Penpot edit requires a written gap:

```text
required semantic
+ Canva supports it
+ Plugin API cannot expose it
+ exact Penpot owner located
= core modification justified
```

## Canva

Use public Developer SDK/REST APIs as production authority.

Private desktop findings may guide research but cannot become a release dependency.

## Agent Core

Agent Core stores plans/evidence/lessons and helps implement. It is not shipped as part of the design bridge unless the user explicitly makes that a separate product decision.

# Plan completion criteria

This entire project is considered complete only when:

1. modified Penpot remains the design source;
2. supported Canva scope is explicitly documented;
3. conversion produces native editable Canva elements for native mappings;
4. unsupported mappings are reported before destructive conversion;
5. placeholder behavior is classified and proven;
6. assets transfer reliably;
7. structural read-back confirms the supported scope;
8. compatibility report shows no silent loss;
9. existing unrelated Penpot behavior is preserved;
10. all claims are backed by current source/API evidence.
# Recommended execution order

The next tasks should be executed in this exact order:

```text
TASK 1  Penpot exact baseline manifest
TASK 2  Canva Target Capability Matrix
TASK 3  Controlled Canva read/write/read-back probe
TASK 4  Penpot Semantic Coverage Matrix
TASK 5  Canonical Design IR v1
TASK 6  Penpot -> IR extractor
TASK 7  Canva IR compiler
TASK 8  Asset transport
TASK 9  Placeholder/Autofill track
TASK 10 Structural round-trip verifier
TASK 11 Expand semantic scope
TASK 12 Product UX / Send to Canva
```

Tasks 1-5 are architecture/grounding work. Tasks 6 onward are implementation work.

## Immediate next task

**TASK 1: build an exact baseline manifest of the existing modified Penpot tree, focused first on `mcp` and all files that already support the custom workflow.**

TASK 1 must not modify Penpot behavior.

After TASK 1, proceed to the Canva Target Capability Matrix rather than writing the converter immediately.

## References

Local grounding:
- `docs/Canva-Desktop-Architecture-Grounding-20261001.md`

Current public Canva surfaces checked for this plan:
- https://www.canva.dev/docs/apps/design-editing/
- https://www.canva.dev/docs/apps/rest-apis/reference/design-imports/
- https://www.canva.dev/docs/apps/rest-apis/reference/autofills/
- https://www.canva.dev/docs/apps/uploading-assets/
