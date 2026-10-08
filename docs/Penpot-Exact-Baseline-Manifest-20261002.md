# Penpot Exact Baseline Manifest — 2026-10-02

**Task:** Canva–Penpot Semantic Bridge — TASK 1 / Phase 0  
**Status:** COMPLETE — READ-ONLY BASELINE ESTABLISHED  
**Penpot behavior changed:** NO  
**TASK 2 started:** NO

## 1. Source authority

Current Penpot source authority:

```text
F:\Content Creator\Astra Content Factory\Toolchain\sources\penpot
```

The root has **no `.git` metadata**. Therefore the exact current bytes, not a Git commit or upstream tag, are the baseline authority.

Observed identity:

- root `package.json`: Penpot **2.17.0**
- declared Node: **v24.21.0**
- declared package manager: **pnpm 12.5.1**
- Toolchain manifest carries historical provenance `source_commit=9d08e26...` and label `develop snapshot`; this is useful provenance but cannot identify the current tree byte-for-byte because `.git` is absent.

## 2. Exact baseline

Source authority inventory excludes dependency/cache/build noise such as `.git`, `node_modules`, `.pnpm-store`, `target`, caches and logs. MCP package `dist` is recorded separately as resident build evidence.

| Baseline | Files | Bytes | SHA-256 tree digest |
|---|---:|---:|---|
| Source authority inventory | 2,199 | 274,782,801 | `5d70ab81d45b97e97a858135f15a5b60a3c438cfabaff668a021de5a48253268` |
| Focused Phase-0 inventory | 1,338 | 262,582,214 | `c101d50ee9ad2c902998ec741941f971c7281c6f402b419d9817e300015d66e5` |
| MCP resident build evidence | 19 | 1,384,391 | `2ad61958540d2df7eed9c372cead55d6a4b34534c4dcdd701e352bc31fed2610` |

Machine-readable inventories:

```text
E:\Projects\Agent-Core\runtime\tmp\penpot-baseline-20261002\
  baseline-manifest.json
  summary.json
  penpot-source-inventory.jsonl
  penpot-focused-inventory.jsonl
  penpot-mcp-runtime-build-inventory.jsonl
  area-summary.json
  mcp-inventory.jsonl
  fig-exporter-inventory.jsonl
  penpot-adapter-inventory.jsonl
```

## 3. Area ownership and digests

| Area | Role for Canva bridge | Files | Tree digest |
|---|---|---:|---|
| `mcp` | **Primary semantic seam** | 115 | `191c4f519247c0b22ecece1a400c8e67cbfb37ecadb7eae9ec9f1b4545d9764a` |
| `common` | Shared document/geometry semantics; escalation only | 310 | `df9c80414901f140b7e1bf08c4e6bce259d4c7c520eea9b2d3f3ffea33aad333` |
| `frontend` | Editor/runtime UI; not first semantic seam | 814 | `288ecbb2b6d9b1115c06b2888ca416f1f1030fb203510976c66bbdabdbaa1529` |
| `exporter` | Visual export/render evidence; not semantic authority | 57 | `63199e5820df36582e99ed264ac9d8335557711b91dafc4a66c7eb0111c79e2b` |
| `render-wasm` | Rendering fidelity; escalation only | 236 | `5d3ed60a6ab91da4de54ee27f1ef7c1330087d4377123cf9cd6d7812e4b95b90` |
| Toolchain `adapters/fig-exporter` | **Protected existing Penpot→Figma boundary** | 39 | `159208b5a228d91d1f562a6ab32e3c352f4d55d6e18462f520d04932ddce50ef` |
| Toolchain `adapters/penpot` | Penpot Windows/toolchain integration | 16 | `a81a3cb52e87d30c5a2973f363a4cdf7d813535729f2265669875efe0ef96dc0` |

### Initial write boundary

The first Canva implementation wave should remain inside:

```text
mcp/packages/plugin/
mcp/packages/server/
mcp/packages/common/
```

`common`, `frontend`, `exporter`, and `render-wasm` are escalation targets only when a proven semantic gap cannot be solved through the Plugin API/MCP seam.

## 4. Current MCP/plugin architecture to preserve

### MCP server

`mcp/packages/server` owns the external MCP surface and task transport.

Current standard tools include:

- `execute_code`
- high-level Penpot overview/API information
- shape export
- image import in local mode
- development-only CLJS/import/compiler/parenthesis/Taiga helpers where allowed

The server supports local and multi-user modes, request-scoped user-token context, optional Redis multi-instance routing, bounded plugin-task timeout, and explicit remote/filesystem boundaries.

### Plugin

`mcp/packages/plugin` runs in Penpot's Plugin API context.

The plugin manifest currently requests:

```text
content:read
content:write
library:read
library:write
comment:read
comment:write
```

`execute_code` exposes these context objects:

```text
penpot
penpotUtils
storage
console
```

`storage` persists between execute-code calls within the plugin task-handler lifetime.

Current execution behavior also:

- waits for a Penpot layout update when the API exposes it;
- temporarily enables natural child ordering and validation errors;
- restores those flags after execution;
- captures console output separately;
- converts top-level `Uint8Array` results into a compact base64 envelope.

This is the preferred seam for the future Penpot Semantic Extractor.

## 5. PenpotUtils semantic surface observed

Current public static helpers include:

```text
shapeStructure
findShapes
findShape
findShapeById
findPage
getPages
getPageById
getPageByName
getPageForShape
generateCss
getBounds
isContainedIn
setParentXY
addFlexLayout
base64ToByteArray
findTokensByName
findTokenByName
getTokenSet
createVariantContainer
tokenOverview
```

This confirms that Phase 0 does not need a second editor or a second traversal engine before TASK 2 establishes the actual Canva target semantics.

## 6. Existing local behavior that must not regress

The following is **pre-existing local behavior**. Some items may originate from a newer upstream snapshot rather than user-authored patches; because current root Git history is absent, they are protected by behavior/hash, not by authorship claims.

1. **MCP execute-code semantic access**
   - direct Penpot Plugin API access;
   - persistent task storage;
   - `PenpotUtils` semantic helpers.

2. **MCP reliability**
   - plugin heartbeat/freeze detection;
   - bounded task timeouts and correlation cleanup;
   - single-user/multi-user routing;
   - duplicate user-token rejection;
   - optional Redis multi-instance task routing;
   - terminal WebSocket policy-violation reconnect handling.

3. **Geometry/color compatibility already present**
   - conservative `merge-touching-subpaths` for adjacent SVG subpaths, explicitly documented for Figma-origin paths;
   - HSB conversion using the Figma/Sketch/Adobe XD brightness convention.

4. **Existing Penpot→Figma path**
   - normal Penpot v3 export snapshot remains the source;
   - isolated FIG service converts to Figma Kiwi v106;
   - output is validated before delivery;
   - unsupported semantics fail closed instead of silently flattening/corrupting;
   - Penpot receives only a thin File→Export integration.

The Figma adapter reports previously accepted semantics including document/page/frame hierarchy, primitives, editable text, image fills and groups, with broader local checks for gradients, strokes, shadows, blur, clipping, masks, transforms and editable path geometry. This behavior is explicitly outside the Canva bridge unless a shared contract must be changed.

## 7. Upstream comparison — reference only

A shallow read-only checkout of official Penpot tag `2.17.0` was created temporarily at commit:

```text
bdce5817ea86d028db29113d9ecdadcf07097b36
```

Focused comparison produced:

```text
identical      149
modified       380
local-only     992
upstream-only 2468
unreadable       0
```

Within `mcp/` specifically:

```text
modified    24
local-only   7
```

This comparison **cannot be used as a custom-modification ledger**. The local tree is structurally different from the official 2.17.0 tag and the Toolchain manifest calls its provenance a develop snapshot. Therefore:

> Current exact local bytes are authority. Upstream 2.17.0 is only a reference lens.

The detailed comparison remains in:

```text
upstream-2.17.0-diff.jsonl
upstream-2.17.0-changes.json
upstream-diff-summary.json
mcp-upstream-delta.json
```

under the Phase-0 evidence directory.

## 8. Canva-specific pre-existing code

An exact-token scan corrected an earlier false positive where `Canva` matched the substring `canvas`.

After correction:

- exact Canva mentions are confined to generated translation assets;
- the authored source markers outside generated translations are Figma-related only;
- **no existing authored Canva bridge implementation was identified**.

Therefore future Canva bridge files can be distinguished from this baseline without pretending a pre-existing Canva implementation exists.

## 9. Toolchain baseline

Project-local portable runtime:

```text
Node          v24.21.0
Clojure CLI   1.12.5.1664
Java          OpenJDK 25.0.4.1 LTS
```

Observed host/runtime helpers:

```text
pnpm          12.6.0
rustc         1.98.0
cargo         1.98.0
```

Declared Penpot package versions remain authoritative for reproducible project intent:

```text
Node .nvmrc       v24.21.0
pnpm declaration  12.5.1
```

The host `clojure` command is not on PATH; the Toolchain-local Clojure wrapper is healthy and is the intended portable route.

## 10. Baseline/checkpoint rule for future changes

No Penpot source file was changed during TASK 1, so no per-file pre-edit checkpoint was required yet.

For every future Penpot edit:

1. read the exact current file;
2. compare its SHA-256 with this baseline or the most recent accepted successor baseline;
3. create an Agent Core file checkpoint before mutation;
4. edit only the approved owner;
5. read back and record the post-edit hash;
6. if a shared Figma boundary file changes, run the specifically authorized Penpot→Figma compatibility verification before claiming no regression.

A mismatch before an intended edit is **source drift**, not permission to overwrite.

## 11. Gate P0 result

**PASS.**

The current Penpot state is now distinguishable from future Canva work through:

- exact file-level SHA-256 inventory;
- tree digests per owner;
- machine-readable baseline manifest;
- explicit ownership/write boundaries;
- protected pre-existing behavior list;
- separately hashed Penpot→Figma adapter boundary;
- upstream comparison that is correctly treated as reference-only.

## 12. Next gate

```text
TASK 1 / Phase 0 : COMPLETE
TASK 2 / Phase 1 : NOT STARTED
```

TASK 2 remains **Canva Target Capability Matrix + controlled read/write/read-back probe** and must not begin until the user explicitly continues after reviewing this report.
