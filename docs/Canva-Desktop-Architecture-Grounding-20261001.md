# Canva Desktop Architecture Grounding — 2026-10-01

## Status

**GROUNDING COMPLETE — READ-ONLY INSTALLED-APP INSPECTION — NO CANVA MODIFICATION.**

Purpose: learn enough about the installed Canva desktop architecture to define the target contract for a future Canva-compatible design bridge before modifying Penpot, OpenDesign, Scenify/design-editor-family, Layerhub-style, or building an editor from scratch.

This report treats the installed desktop application as architectural evidence, not as an integration API. Private implementation details are not assumed stable or safe to depend on.

Inspected installation:
- Path: `C:\Users\Ikbal\AppData\Local\Programs\Canva`
- Product: Canva Desktop
- File/Product version: `1.126.0` / `1.126.0.0`
- Company metadata: Canva Pty Ltd
- `Canva.exe` SHA-256: `0dc441ddffdec90554414e6d61061c6bb0a187dceb9f0ebe91a4e7de7628f31f`
- `resources\app.asar` SHA-256: `fb10859f313068eabe03197490578bd9a6c1a26634ec537c354b37c3454d1094`

No user Canva profile, account token, browser/session database, credential store, or private user document was inspected.

## 1. High-confidence architecture

The Windows package is an Electron/Chromium desktop host. Evidence includes Electron licensing, Chromium resource packs, V8 snapshot, FFmpeg, EGL/GLES, `resources/app.asar`, and the package entrypoint `dist/main.js`.

The ASAR container is readable and contains 998 files. Its relevant top-level structure is `build_assets`, `dist`, and `package.json`.
The desktop package contains only three renderer families:
- `desktop_chrome_v2`
- `desktop_offline_fallback`
- `desktop_recording`

The local desktop chrome source map is dominated by desktop-shell concerns: tab bar, create-design menu, downloads UI, menu bar, offline state, window/tab drag-and-drop, app update UI, and desktop services.

`dist/preload.js` is a narrow page-to-Electron bridge. It exposes an `ElectronBridge` and transfers a MessagePort onto the `ElectronMessageBus` IPC channel. It does not expose a locally authored design scene graph.

`dist/main.js` hosts remote page content in Electron `WebContentsView` instances and explicitly distinguishes `web_home` from `web_editor`. It builds an editor route at `/design/editor/shell`.

A build manifest flag named `enableEditorShellCreateFlow` carries source provenance pointing into Canva's web repository route family (`web/src/routes/design/routes.ts`). This is strong evidence that the authoritative editor experience is web-owned while the desktop application is the privileged host.

**Architectural conclusion:** do not treat `Canva.exe`, desktop IPC, or the ASAR bundle as the canonical design-authoring target. The compatibility target must be Canva's web/design document contract and supported developer APIs.

## 2. Desktop host responsibilities observed

The desktop main process exposes RPC service families for:
- app chrome, tabs, windows, theme, auth and navigation;
- file drop;
- download and local file saving;
- local export and local rendering;
- recording;
- host capability discovery.

Relevant named services include `FileDropService`, `DownloadService`, `LocalExportService`, `LocalRendererService`, `HostCapabilitiesService`, and `TabManagementService`.
`FileDropService` exposes file-drop polling, not a design-object import scene graph.

The desktop package also owns deep-link/open-file handling, OS file associations, save dialogs, and download origins. Its file associations include common image/video types plus Apple Keynote/Pages/Numbers and SVG, but this is only OS-association evidence and must not be treated as Canva's complete import-support matrix.

Observed remote media/export origins include Canva upload/media/export-download domains. The desktop host therefore orchestrates remote Canva services rather than storing an obvious standalone editable Canva document file locally.

## 3. Local export/render boundary

`LocalExportService.localExport2` accepts a request containing:
- an opaque `documentContentBlob`;
- document summary/page count;
- render specification;
- media map;
- font/video/audio dependencies;
- embed/codelet references;
- scene/blueprint dependencies;
- font fallback metadata.

The local renderer receives the opaque document blob plus those external dependencies and renders through a local `local-renderer` page. This is evidence of a structured internal document representation, but **not** evidence that the representation is a stable public file format we should generate.

In this desktop build, the local export implementation supports PNG and JPG. Other enumerated output families are explicitly not handled by this local implementation. Therefore desktop local export is an optimization/capability lane, not the general Canva import/export contract.

The bundle also contains an internal document-support result shape with concepts equivalent to:
- supported features;
- unsupported features;
- partially supported features;
- strict-blocking partial features;
- strict vs relaxed checking.

The corresponding support-check capability is not observed as an active LocalExportService method in this build. We should copy the **compatibility-checking idea**, not depend on the private interface.
## 4. Implications for the Canva bridge

The bridge should not be designed as:

```text
External editor
  -> private Canva desktop blob
  -> Canva.exe IPC
```

That route is private, version-bound, incomplete, and unsupported.

The preferred architecture is:

```text
Source editor
  -> semantic source traversal
  -> Canonical Design IR
  -> Canva semantic compiler
  -> supported Canva API/app surface
  -> native Canva design
  -> read-back / structural verification
```

The Canonical Design IR should be editor-neutral. Penpot, OpenDesign, Scenify/design-editor-family, and Layerhub-style editors should be judged only by how completely and cleanly they can populate this IR.

Minimum IR families to model before choosing/forking an editor:
- document, page and page dimensions;
- hierarchy/grouping and z-order;
- text content, runs, typography and alignment;
- rectangle/vector/path geometry;
- fills, strokes and transparency;
- image/media fill, crop/mask and replaceability semantics;
- position, size, rotation and locking;
- effects with explicit degradation policy;
- asset/font dependency identity;
- semantic image/text placeholders;
- source metadata needed for round-trip comparison.
## 5. Compatibility compiler requirement

Every source feature should produce an explicit mapping status:

```text
NATIVE
EMULATED
PARTIAL
UNSUPPORTED
```

No silent flattening is acceptable for the lossless target.

The compiler should support strict and relaxed modes:
- **strict:** block export when a required semantic cannot be preserved;
- **relaxed:** permit explicitly reported approximations/emulations.

Every conversion should generate a compatibility report that counts native, emulated, partial, unsupported, and lost semantics. The long-term acceptance target for the supported template scope is `lost = 0`.

After writing into Canva, read back the design through supported APIs where possible and compare structural facts against the source IR. Screenshot similarity is useful only as secondary visual evidence; structural round-trip is the authority for editability.

## 6. Public Canva API corroboration

Current official Canva developer documentation aligns with the local architectural evidence:
- Design Editing API reads/edits pages and supported elements; supported interactive element types include groups, rects, shapes, text and embeds.
- Images/videos are represented through rect fills rather than independent image/video element types.
- Design Import API can convert several external document formats into editable Canva designs, but that is an importer and not a lossless semantic guarantee.
- Autofill datasets expose semantic image/text/chart/sheet fields, but fields are created/tagged through Canva's Autofill workflow rather than an unrestricted generic placeholder-creation API.

Therefore placeholder fidelity must be treated as a separate capability track from ordinary text/shape/image-fill fidelity.

## 7. Editor selection consequence

Do **not** combine Penpot + OpenDesign + Scenify + Layerhub before the target matrix exists.

First audit Penpot because:
- it is already a mature structured editor;
- the existing Penpot -> Figma success proves the source side can support semantic export;
- a plugin/exporter can be attempted before maintaining a large Penpot fork.

Only move to a Penpot fork if the plugin/public model cannot expose required semantics.
OpenDesign, Scenify/design-editor-family and Layerhub-style should remain challenger/fallback foundations. They should be measured against the same Canva capability matrix, not chosen because their code is easier to modify in isolation.

## 8. Required next grounding before editor modification

1. Build a **Canva Target Capability Matrix** from current official Design Editing, Design Import, Autofill/Brand Template, asset and export APIs.
2. Create one controlled Canva reference design containing representative objects: page, text runs, groups, vectors/shapes, image fills/crops, layering, lock state, effects and semantic autofill fields where available.
3. Read that reference design through the supported Canva developer surface and record exactly what is readable, creatable, updateable and round-trippable.
4. Define the Canonical Design IR only from semantics that we can name and verify.
5. Audit Penpot plugin/document access against that IR.
6. Audit OpenDesign/Scenify/Layerhub only for gaps Penpot cannot cover cleanly.
7. Prototype a narrow path first: page + text + rect/shape + group + image fill + transforms.
8. Add placeholder/autofill semantics as a separate prototype.
9. Require structural read-back before calling any mapping lossless.
10. Fork/modify an editor only after the matrix identifies a concrete source-side limitation.

## 9. What this inspection does not prove

This installed application does not reveal the complete private Canva document schema or server-side editor implementation.

It does not prove that the opaque `documentContentBlob` can or should be generated externally.

It does not prove that every desktop-associated file type imports with full editability.

It does not prove that private RPC/protobuf-like schemas are stable between Canva releases.

It does not establish 100% placeholder creation through public APIs.

Those questions must be resolved with supported API capability/read-back experiments rather than private desktop coupling.

## Decision

**Source foundation is now fixed to the user's existing modified Penpot tree:** `F:\Content Creator\Astra Content Factory\Toolchain\sources\penpot`. Do not create a new Penpot fork and do not replace this foundation with OpenDesign/Scenify/Layerhub by default.

Initial source grounding shows this is a full Penpot 2.17.0 monorepo with `frontend`, `backend`, `common`, `exporter`, `render-wasm`, `library`, and the official-style `mcp` subproject. The root is not a Git working tree, so future changes need an explicit file/hash baseline rather than assuming Git history can identify user modifications.

The preferred first integration seam is the existing Penpot MCP Plugin path. Its `execute_code` task runs JavaScript in the Penpot Plugin API context with `penpot`, persistent `storage`, and `PenpotUtils`. Existing utilities already expose semantic traversal and properties such as pages, shape hierarchy/types, flex/grid layout, component instances, text bounds, geometry, image fills, tokens and variants. Therefore a Canva bridge can first be implemented as semantic traversal -> Canonical Design IR -> Canva compiler without modifying Penpot's renderer or document core.

`exporter` remains useful for visual/export evidence but is not the semantic bridge authority; it renders bitmap/SVG/PDF outputs and would discard semantics if used as the primary interchange layer.

Next work remains the Canva Target Capability Matrix + controlled Canva read/write/read-back probe. After the target matrix is known, continue improvement directly in this existing Penpot tree, starting with the MCP/plugin adapter. Modify deeper Penpot core only for a concrete semantic gap that the Plugin API cannot expose. OpenDesign, Scenify/design-editor-family and Layerhub-style are retained only as donor/reference candidates for missing mechanisms, not as replacement foundations.

## 10. External corroboration sources

Official Canva developer references checked on 2026-10-01:
- Design Editing API: https://www.canva.dev/docs/apps/design-editing/
- Design Import REST API: https://www.canva.dev/docs/apps/rest-apis/reference/design-imports/
- Autofill REST API: https://www.canva.dev/docs/apps/rest-apis/reference/autofills/
- Get design dataset: https://www.canva.dev/docs/apps/rest-apis/reference/designs/get-design-dataset/
- Get brand template dataset: https://www.canva.dev/docs/apps/rest-apis/reference/brand-templates/get-brand-template-dataset/

These public contracts, not private desktop RPC names, are the prospective integration authority. The installed desktop inspection is used to understand architectural boundaries and design requirements only.
