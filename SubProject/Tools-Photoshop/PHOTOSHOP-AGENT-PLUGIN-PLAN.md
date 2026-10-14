# PHOTOSHOP AGENT PLUGIN — Architecture & Implementation Plan

Status: Planning baseline
Target platform first: Windows
Working project location: `D:\Games-kuyhAa\Agent-Core\SubProject\Tools-Photoshop\Photoshop-Agent-Plugin`
Upstream engines:
- `PhotoshopAPI` — file-level PSD/PSB engine
- `photoshop-python-api` — live Adobe Photoshop COM automation engine

## 1. Executive Decision

Jangan menggabungkan source code kedua upstream repository menjadi satu monolith dan jangan memodifikasi upstream pada tahap awal.

Bangun proyek ketiga, `Photoshop-Agent-Plugin`, sebagai orchestration layer dengan satu AI-facing tool surface dan dua backend adapter:

1. `File Engine` -> `PhotoshopAPI`
2. `Live Engine` -> `photoshop-python-api` melalui Windows COM
3. `Hybrid Engine` -> router/workflow layer yang dapat memakai keduanya secara berurutan dalam satu job

AI Agent tidak perlu mengetahui detail pybind11, COM, ActionDescriptor, atau struktur binary PSD. AI hanya melihat schema deklaratif yang stabil.

Target akhirnya adalah bukan sekadar "Python wrapper Photoshop", tetapi sebuah Photoshop capability fabric untuk AI Agent: inspect -> plan -> mutate -> render -> validate -> export.

## 2. Source-Derived Capability Map

### 2.1 PhotoshopAPI

Karakter utama:
- C++20 dengan Python bindings.
- Membaca/menulis PSD dan PSB langsung tanpa membuka aplikasi Photoshop.
- Layer editing adalah first-class use case.
- Mendukung 8/16/32-bit.
- Mendukung RGB, CMYK, Grayscale.
- Mendukung nested layer structure, image layers, editable text layers, smart objects, pixel masks, ICC profile, compression modes.
- Smart Object API mencakup replacement, extraction, warp, move, rotate, scale, dan projective transform/homography.
- Text Layer API sangat granular: text replacement, style runs, font, size, tracking, kerning, leading, fill/stroke, paragraph styling, direction, baseline, dan banyak atribut tipografi.
- Dapat memodifikasi image/channel data dengan NumPy.
- Contoh source menunjukkan layer grafting antar file, bit-depth conversion, canvas rescaling, group manipulation, mask operations, image replacement, dan smart object workflows.

Batas source yang penting:
- Adjustment Layers belum didukung.
- Vector Masks belum didukung.
- Lab dan Multichannel belum didukung.
- File hasil tulis tidak menyimpan valid merged image/composite menurut README upstream. Artinya beberapa aplikasi pihak ketiga yang membutuhkan merged image dapat bermasalah.
- Upstream menyatakan masih early development dan API dapat berubah.

Build/runtime:
- PhotoshopAPI version di source: 0.9.1.
- Python >=3.9.
- Runtime Python dependency utama: NumPy.
- Native build: CMake >=3.20, C++20, scikit-build-core, pybind11.
- Native dependencies: OpenImageIO, libdeflate, Eigen3, fmt, stduuid.
- Local submodules: vcpkg, pybind11, doctest, mio, simdutf, compressed-image.
- Clone saat audit belum menginisialisasi submodules; ini tidak masalah bila runtime memakai wheel/prebuilt package.

### 2.2 photoshop-python-api

Karakter utama:
- Python API yang mengontrol Adobe Photoshop melalui Windows COM (`comtypes`).
- Windows only.
- Membaca registry Adobe Photoshop dan membuat COM object `Photoshop.Application` atau versioned ProgID.
- Source mapping mencakup Photoshop 2017-2025.
- Local registry saat audit memiliki Photoshop IDs 170/180/190, yang pada source mapping berarti Photoshop 2023/2024/2025.
- Menyediakan Session abstraction dan akses ke Application, Document, Layers, LayerSets, Selection, Channels, TextItem, colors, save/export options, ActionDescriptor/Reference/List, dan Photoshop Actions.
- Dapat menjalankan fitur Photoshop yang tidak tersedia pada file parser: filters, adjustments, selections, rasterization, artboards, export/save-for-web, menu/actions, layer comps, dan renderer Photoshop asli.
- Memiliki jalur Action Manager dan JavaScript untuk fungsi tingkat lanjut.

Batas source yang penting:
- Membutuhkan Adobe Photoshop terinstall dan COM tersedia.
- Banyak integration behavior membutuhkan Photoshop sungguhan; test suite upstream memiliki manual tests.
- COM object model dan scripting surface sangat luas serta dapat menimbulkan side effect jika diberikan mentah kepada AI.
- Source `Application.system(command)` memanggil `os.system`; fungsi ini tidak boleh diekspos oleh plugin AI.
- `doJavaScript`, `executeAction`, dan raw Action Manager tidak boleh menjadi public default tools bagi AI.

Build/runtime:
- Version: 0.24.2.
- Python >=3.8,<4.
- Explicit classifiers sampai Python 3.12.
- Dependency utama: `comtypes`.
- Development upstream menggunakan Poetry dan pytest.
- License: MIT.

## 3. Why the Two Engines Are Complementary

Mereka tidak perlu saling menggantikan.

`PhotoshopAPI` unggul ketika:
- inspect PSD/PSB tanpa Photoshop;
- batch processing besar;
- membaca struktur layer dengan cepat;
- mengganti text/image/smart object secara headless;
- memodifikasi mask/layer properties;
- membuat PSD/PSB secara programmatic;
- kerja 8/16/32-bit;
- AI membutuhkan structured document graph tanpa UI state.

`photoshop-python-api` unggul ketika:
- operasi membutuhkan Photoshop renderer;
- adjustment/filter/rasterization diperlukan;
- selection atau Action Manager diperlukan;
- artboard, Photoshop Action, save/export native diperlukan;
- hasil akhir harus divalidasi lewat Photoshop sungguhan;
- fitur belum didukung PhotoshopAPI.

`Hybrid` diperlukan ketika satu objective menyentuh kedua dunia.

Contoh:
1. Inspect dan bulk-edit 50 text/smart-object layers menggunakan File Engine.
2. Simpan hasil ke working copy.
3. Buka working copy di Photoshop melalui Live Engine.
4. Jalankan render-dependent operation/export.
5. Save As final PSD.
6. Export preview PNG/JPG.
7. Validasi final structure + artifacts.

Catatan eksperimen wajib: README PhotoshopAPI menyatakan output tidak memiliki valid merged image. Perlu test khusus untuk membuktikan apakah membuka lalu Save As dengan Photoshop dapat menghasilkan kembali merged/composite yang kompatibel. Jangan menganggap ini benar sampai diuji.

## 4. Target Architecture

```text
AI Agent / ChatGPT / Codex / Claude / Agent Code
                     |
                     v
          Photoshop Agent Plugin API
                     |
        +------------+------------+
        |                         |
        v                         v
  Policy + Schema             Job/Transaction
        |                         |
        +------------+------------+
                     |
                Hybrid Router
             /        |        \
            /         |         \
           v          v          v
    File Engine   Live Engine   Validator
   PhotoshopAPI   COM/Photoshop  + Preview
           \          /
            \        /
             v      v
          PSD/PSB + Export Artifacts
```

Design rule: transport harus dipisahkan dari Photoshop core logic.

- Core package tidak bergantung langsung pada Agent Core.
- Adapter MCP menjadi AI-facing transport pertama.
- Di masa depan adapter lain dapat ditambah tanpa mengubah backend: local HTTP/JSON-RPC, CLI, Agent Code native bridge, atau SDK Python.
- Agent Core dapat menjadi launcher/consumer/orchestrator, bukan satu-satunya runtime yang membuat plugin tidak dapat digunakan agent lain.

## 5. Normalized AI Document Model

AI tidak boleh menerima opaque COM object atau pybind object.

Gunakan normalized model seperti:

```json
{
  "document": {
    "path": "...",
    "format": "psd",
    "width": 3000,
    "height": 2000,
    "dpi": 300,
    "bit_depth": 8,
    "color_mode": "RGB",
    "layers": [],
    "capabilities": {},
    "warnings": []
  }
}
```

Setiap `LayerNode` minimal memiliki:
- stable job-local id;
- canonical layer path;
- name;
- type: image/group/text/smart_object/other;
- parent/children;
- visible/locked;
- opacity/fill/blend mode;
- bounds/position;
- text metadata jika tersedia;
- smart object metadata jika tersedia;
- mask metadata jika tersedia;
- `backend_support`: file/live/both;
- warnings/lossiness flags.

Ini menjadi bahasa bersama kedua engine.

## 6. AI-Facing Tool Surface

Jangan mengekspos seluruh API upstream satu-per-satu. Tool harus semantic, bounded, dan mudah direncanakan AI.

### 6.1 Status & Discovery

`photoshop_status()`
- plugin version;
- Python runtime;
- File Engine readiness;
- Photoshop installed versions;
- COM readiness;
- active Photoshop document jika ada;
- current queue/job state;
- safety mode.

`photoshop_capabilities()`
- capability matrix;
- operasi supported/unsupported;
- backend yang digunakan;
- limitations/warnings.

### 6.2 Inspection

`psd_inspect(path, options)`
- document metadata;
- normalized layer tree;
- text layers;
- smart object metadata;
- masks;
- warnings.

`psd_get_layer(path, layer_path)`
- satu layer secara detail.

`psd_find_layers(path, query, types)`
- semantic/structured selection by exact name, type, path, visibility, etc.

### 6.3 Safe File Mutations

`psd_edit_text(...)`
`psd_set_layer_properties(...)`
`psd_move_layer(...)`
`psd_add_image_layer(...)`
`psd_replace_image_layer(...)`
`psd_replace_smart_object(...)`
`psd_transform_smart_object(...)`
`psd_set_mask(...)`
`psd_create_document(...)`
`psd_batch_apply(...)`

Semua mutation menerima minimal:
- `input_path`;
- declarative params;
- `output_path` atau output policy;
- `dry_run`;
- `overwrite=false` by default.

### 6.4 Live Photoshop Operations

`photoshop_open(path)`
`photoshop_document_state()`
`photoshop_apply_filter(layer, filter_name, params)`
`photoshop_adjust_layer(layer, adjustment, params)`
`photoshop_selection(operation, params)`
`photoshop_run_action(action_name, action_set)`
`photoshop_export(format, output_path, options)`
`photoshop_save_as(output_path, options)`
`photoshop_close(save_mode)`

Advanced raw JavaScript/Action Manager must NOT be default public tools.

If an advanced escape hatch is ever needed, create a separately disabled-by-default capability with explicit policy and allowlisted operations. Never expose shell/process execution.

### 6.5 Preferred High-Level Agent Tool

`photoshop_transform_document(input_path, operations[], output_path, backend="auto", render=false, validate=true, dry_run=false)`

Ini harus menjadi tool utama bagi AI Agent.

AI mengirim intent sebagai list deklaratif, contoh:

```json
{
  "input_path": "template.psd",
  "output_path": "result.psd",
  "backend": "auto",
  "operations": [
    {"op": "replace_text", "layer": "Hero/Title", "text": "NEW TITLE"},
    {"op": "replace_smart_object", "layer": "Hero/Image", "source": "photo.jpg"},
    {"op": "set_opacity", "layer": "Texture", "value": 0.65},
    {"op": "gaussian_blur", "layer": "Glow", "radius": 6}
  ],
  "render": true,
  "validate": true
}
```

Router dapat menentukan:
- tiga operasi pertama -> File Engine;
- Gaussian Blur -> Live Engine;
- render/export -> Live Engine.

Return harus menjelaskan route decision, outputs, warnings, dan evidence.

## 7. Hybrid Routing Rules

Parameter umum:
- `backend="auto" | "file" | "live"`

Default: `auto`.

Routing awal:

File Engine preferred:
- inspect/read layer tree;
- text creation/replacement/styling yang didukung;
- image channel changes;
- group/add/move/remove layers;
- layer property changes;
- pixel masks;
- smart object replacement/warp/transform;
- batch PSD/PSB structure mutation.

Live Engine required/preferred:
- adjustment layers;
- vector masks;
- Photoshop filters;
- selection-dependent operation;
- layer comps/artboards;
- native Photoshop Actions;
- rasterization;
- native export/save-for-web;
- exact Photoshop rendering validation;
- unsupported color/document features.

Hybrid:
- operation list mengandung capability dari dua engine;
- final result membutuhkan Photoshop-native render/save setelah fast structural edits;
- file engine produces warning requiring live finalization.

Router tidak boleh silently downgrade unsupported operation. Return structured `unsupported_operation` atau escalate ke Live Engine jika policy mengizinkan.

## 8. Transaction & Data-Safety Model

Setiap mutation workflow:

1. Resolve dan validate workspace path.
2. Inspect input.
3. Compile requested operations menjadi execution plan.
4. Return plan pada dry-run.
5. Buat working copy/temp artifact.
6. Apply File Engine stage bila diperlukan.
7. Validate structure.
8. Apply Live Engine stage bila diperlukan.
9. Save/export ke staged output.
10. Re-inspect final PSD bila memungkinkan.
11. Validate required artifacts.
12. Promote staged output ke requested destination.
13. Return operation evidence.

Rules:
- Input tidak ditimpa default.
- `overwrite=false` default.
- Temp/working output memiliki deterministic job ID.
- Existing output tidak dihapus tanpa explicit overwrite.
- Semua path harus berada di allowed roots.
- Hash input/output dapat dicatat untuk provenance.
- Live Photoshop mutation harus memanfaatkan duplicate document atau `suspendHistory` bila feasible agar rollback/undo lebih aman.

## 9. Live COM Worker Model

Jangan menjalankan arbitrary concurrent COM mutation terhadap satu Photoshop instance.

Recommended engineering design:
- Dedicated Windows worker process untuk COM.
- Satu worker memiliki satu COM apartment/lifecycle yang jelas.
- Mutating live jobs diproses serial melalui queue.
- Read-only status dapat dipisahkan bila aman.
- Worker melakukan heartbeat dan reconnect bila Photoshop restart.
- Photoshop version dapat dipilih secara eksplisit.
- Timeout per operation.
- Crash COM tidak boleh menjatuhkan plugin server utama.

Ini adalah engineering design decision, bukan jaminan dari upstream repository, dan harus dibuktikan lewat integration tests.

## 10. Security Boundary for AI

Hard deny:
- `Application.system` / `os.system`;
- arbitrary shell command;
- unrestricted process launch;
- unrestricted arbitrary JavaScript;
- unrestricted raw Action Manager descriptors;
- file operations di luar allowed workspace;
- silent overwrite/delete original source.

Allowlist wrappers:
- filters dengan known parameter schema;
- known Photoshop actions jika action set sudah diizinkan;
- save/export options;
- semantic layer operations;
- bounded transforms/selections.

Every tool response:
- `status`;
- `backend_used`;
- `mutated`;
- `input` safe metadata;
- `output_artifacts`;
- `warnings`;
- `validation`;
- `duration`;
- `job_id`.

## 11. Dependency Strategy

Recommended plugin runtime: Python 3.12.

Reason:
- PhotoshopAPI requires >=3.9 and advertises modern Python support.
- photoshop-python-api requires >=3.8 and its explicit classifiers extend through Python 3.12.
- Python 3.12 is already installed locally.
- Current default Python 3.14 is outside the explicit classifier range of photoshop-python-api, so do not use 3.14 as the initial production runtime.

Environment audit:
- Python 3.12: installed.
- Python 3.14: installed/default.
- Visual Studio Build Tools with VC tool component: installed.
- Photoshop COM registrations: present.
- NumPy: present in default environment, but plugin will use its own venv.
- `photoshopapi`: not currently installed in default Python.
- `photoshop`: not currently installed.
- `comtypes`: not currently installed.
- CMake: not currently on PATH.
- Poetry: not currently installed.
- Ninja: not currently installed.
- PhotoshopAPI git submodules: not initialized.

MVP dependency policy:
1. Create isolated Python 3.12 `.venv` under plugin project.
2. Prefer installing `PhotoshopAPI` prebuilt wheel/package rather than compiling C++ source.
3. Install `photoshop-python-api` and `comtypes` in same venv.
4. Add schema/test/server dependencies only as required.
5. Do NOT install native compiler dependencies just because upstream has C++ source.
6. If native PhotoshopAPI modification/build becomes necessary later:
   - initialize submodules recursively;
   - install/activate CMake >=3.20 and Ninja if useful;
   - use existing Visual Studio Build Tools;
   - build through scikit-build/vcpkg;
   - preserve upstream clone separately from plugin adapter.

User has authorized automatic installation of genuinely required build/development tooling; implementation can proceed without separate approval for those dependencies while still respecting system/security constraints.

## 12. Proposed Project Structure

```text
Tools-Photoshop/
  PhotoshopAPI/                  # upstream clone, preserved
  photoshop-python-api/          # upstream clone, preserved
  Photoshop-Agent-Plugin/        # new custom plugin
    pyproject.toml
    README.md
    THIRD_PARTY_NOTICES.md
    config/
      capabilities.yaml
      policy.yaml
    src/photoshop_agent_plugin/
      server.py
      router.py
      schemas.py
      errors.py
      policy.py
      models/
        document.py
        layer.py
        operations.py
        result.py
      backends/
        base.py
        file_engine.py
        live_engine.py
        hybrid_engine.py
      live_worker/
        worker.py
        protocol.py
        lifecycle.py
      services/
        workspace.py
        transactions.py
        validation.py
        preview.py
        jobs.py
      tools/
        status.py
        inspect.py
        mutate.py
        live.py
        workflow.py
    tests/
      unit/
      file_engine/
      mocked_live/
      live_smoke/
      hybrid/
      fixtures/
```

## 13. Transport / Custom Plugin Surface

First transport: MCP-compatible tool server because AI Agents can consume semantic tools cleanly.

Architecture must keep MCP as adapter only:

```text
MCP adapter -> Plugin Core -> Router -> Engines
```

Not:

```text
MCP logic mixed directly into COM/file manipulation code
```

This permits reuse from Agent Code, CLI, local services, or another AI host later.

## 14. Implementation Plan

### Phase 0 — Freeze Baseline & Contracts

Tasks:
- Record upstream commit hashes and licenses.
- Keep both upstream working trees clean.
- Create `Photoshop-Agent-Plugin` sibling project.
- Create architecture decision records.
- Define normalized Document/Layer/Operation/Result schemas.
- Define allowed workspace policy.

Gate:
- no upstream modifications;
- schema fixtures validate;
- license notices documented.

### Phase 1 — Bootstrap Runtime

Tasks:
- Create Python 3.12 venv.
- Install required runtime/test dependencies automatically.
- Install/preflight PhotoshopAPI Python package.
- Install/preflight photoshop-python-api + comtypes.
- Add `photoshop_status` and `photoshop_capabilities`.
- Detect Photoshop registry/COM without changing documents.

Gate:
- both imports succeed;
- Photoshop detection succeeds;
- File Engine health and Live Engine health are independently reportable;
- failure of one engine does not crash the other.

### Phase 2 — Normalized Read-Only File Engine

Tasks:
- Wrap `LayeredFile.read`.
- Convert layer tree into normalized JSON.
- Support image/group/text/smart-object/mask inspection.
- Add `psd_inspect`, `psd_get_layer`, `psd_find_layers`.
- Add fixture corpus from upstream sample PSD/PSB files.

Gate:
- deterministic normalized output;
- 8/16/32-bit fixture coverage where available;
- no source mutation in read-only tools.

### Phase 3 — Transactional File Mutations

Tasks:
- Implement working-copy transaction service.
- Add semantic text/layer/image/smart-object/mask operations.
- Add dry-run compiler.
- Add batch processing.
- Re-inspect output after every job.

Gate:
- original input hash unchanged unless explicit overwrite;
- output PSD/PSB structurally reloads successfully;
- required layer changes are asserted in tests;
- error midway does not promote partial output.

### Phase 4 — Live Photoshop Worker

Tasks:
- Create isolated COM worker process.
- Version-aware Photoshop connection.
- Add status/open/document-state/save/export/close wrappers.
- Add queue and timeouts.
- Add safe action/filter wrappers.
- Explicitly omit shell/raw-JS public surface.

Gate:
- connect to installed Photoshop;
- open known fixture;
- inspect active document;
- export preview;
- close without leaving unsaved test state;
- worker crash/restart handled cleanly.

### Phase 5 — Hybrid Router

Tasks:
- Capability registry maps each operation to file/live/both.
- Compile operation sequence into stages.
- Execute file stage then live stage when needed.
- Preserve job evidence across stages.
- Add backend override for debugging.

Gate:
- mixed workflow automatically routes correctly;
- unsupported operation cannot disappear silently;
- route decision returned to AI.

### Phase 6 — Photoshop-Native Advanced Wrappers

Prioritize wrappers, not raw scripting:
- adjustment operations;
- blur/sharpen/filter families;
- selection operations;
- artboard export;
- actions/action sets;
- rasterization;
- layer comps;
- save-for-web/native format export.

Gate:
- every operation has typed schema and bounded parameter validation;
- regression fixture or live integration test exists.

### Phase 7 — Finalization & Visual Validation

Tasks:
- Add preview export after mutation.
- Add optional before/after preview artifacts.
- Add structural validation.
- Experiment: PhotoshopAPI output -> Photoshop open/save -> inspect third-party/merged composite behavior.
- Record known lossy transformations.

Gate:
- agent receives machine-readable validation plus preview artifact paths;
- no claim of Photoshop-native compatibility without successful evidence.

### Phase 8 — Plugin Hardening & Agent Integration

Tasks:
- MCP tool schemas finalized.
- Structured errors and stable result envelope.
- resource/time limits.
- audit log without secret/raw binary leakage.
- packaging/launcher.
- integrate as Agent Core/Agent Code optional Photoshop capability.
- end-to-end AI workflow tests.

Gate:
- clean install/bootstrap;
- one-command start;
- status green;
- sample AI objectives execute end-to-end;
- failure recovery verified;
- source repos remain independently updateable.

## 15. Test Strategy

### Unit
- schema validation;
- router decisions;
- path/workspace policy;
- operation compiler;
- transaction state;
- result envelope;
- deny rules.

### File Engine Integration
- upstream PSD/PSB fixtures;
- read -> mutate working copy -> read again;
- text replacement;
- layer tree move/add/remove;
- mask;
- image data;
- smart object replacement/transform;
- 8/16/32 bit when fixtures permit.

### Live Engine Mocked
- COM adapter contract;
- worker protocol;
- timeout/reconnect;
- queue ordering;
- no raw system invocation.

### Live Photoshop Smoke
Run only on Windows machine with Photoshop:
- connect version;
- create/open doc;
- add/edit layer;
- apply one safe filter;
- export PNG/JPG;
- save copy;
- close test document.

### Hybrid E2E
- File Engine replaces text + smart object.
- Live Engine applies filter/export.
- Validate output PSD + preview.
- Confirm original untouched.

## 16. Licensing & Upstream Maintenance

`PhotoshopAPI`: BSD-3-Clause.
`photoshop-python-api`: MIT.

Requirements:
- retain license/copyright notices;
- add `THIRD_PARTY_NOTICES.md`;
- keep adapter boundaries so upstream can be updated/replaced independently;
- do not present upstream projects as proprietary original code;
- avoid using upstream author names for endorsement.

Preferred source strategy:
- upstream repos remain untouched references/vendor sources;
- plugin code belongs only in new sibling project;
- pin tested versions/commit hashes;
- add compatibility tests before upgrading either engine.

## 17. Main Risks and Mitigations

Risk: PhotoshopAPI early-development API changes.
Mitigation: adapter layer + version pin + contract tests.

Risk: PhotoshopAPI output lacks merged image.
Mitigation: warning flag + optional live Photoshop finalization + dedicated compatibility experiment.

Risk: COM instability/statefulness.
Mitigation: dedicated worker process + serial mutation queue + timeout/reconnect + deterministic cleanup.

Risk: AI calls overly powerful scripting surface.
Mitigation: semantic typed tools, no `system`, no default raw JS/Action Manager, allowlist policy.

Risk: accidental overwrite/destructive edit.
Mitigation: copy-on-write transaction, `overwrite=false`, staged promotion, hashes, validation.

Risk: mismatch between file-engine representation and Photoshop-native behavior.
Mitigation: normalized model explicitly records backend support and warnings; use live validation for renderer-dependent cases.

Risk: Python compatibility.
Mitigation: production venv pinned to Python 3.12 rather than default Python 3.14.

Risk: native build complexity.
Mitigation: use prebuilt PhotoshopAPI wheel for MVP; only activate CMake/vcpkg/MSVC pipeline when native source modification is genuinely required.

## 18. Definition of MVP

MVP dianggap berhasil bila AI Agent dapat melakukan workflow berikut dengan satu plugin:

1. `photoshop_status` menemukan File Engine dan Photoshop Live Engine.
2. AI memanggil `psd_inspect` pada sebuah PSD.
3. AI menerima normalized layer graph.
4. AI mengganti text layer secara deklaratif.
5. AI mengganti satu Smart Object/image secara deklaratif.
6. Plugin menulis working-copy PSD tanpa merusak original.
7. Plugin membuka hasil di Photoshop bila live finalization diminta.
8. Plugin mengekspor preview PNG/JPG menggunakan Photoshop.
9. Plugin melakukan final structural validation.
10. AI menerima output PSD, preview, backend route, warnings, dan evidence.

Tidak diperlukan raw JavaScript bagi AI untuk mencapai MVP.

## 19. Expansion Horizon

Setelah MVP stabil, plugin dapat berkembang menjadi Photoshop-native design execution engine untuk AI:
- template population dari structured design brief;
- semantic layer role detection;
- batch personalization/adaptation;
- smart-object driven mockup automation;
- typography replacement with run-preserving styles;
- PSD linting dan preflight;
- design token application;
- automated marketplace preview generation;
- iterative visual QA loop: mutate -> Photoshop render -> vision critique -> mutate;
- operation recipes/capability packs yang dapat dikombinasikan tanpa memperluas raw scripting access.

Prinsip jangka panjang: AI menyatakan intent desain, plugin menerjemahkan intent menjadi Photoshop-safe execution graph.

## 20. Recommended Immediate Next Task

Implement Phase 0 + Phase 1 sebagai satu milestone:

`Bootstrap Photoshop-Agent-Plugin with Python 3.12, isolated environment, typed schemas, dual-engine health checks, MCP-facing status/capabilities tools, and safe policy boundary.`

Jangan memulai dari filter atau raw Photoshop scripting. Bangun contract, router, transaction boundary, dan health surface terlebih dahulu; setelah itu kemampuan kedua repository dapat ditambahkan sebagai capability modules secara terukur.
