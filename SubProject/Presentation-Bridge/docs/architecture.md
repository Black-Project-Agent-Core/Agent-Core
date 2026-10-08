# Architecture

Source is colocated at `SubProject/Presentation-Bridge` but remains an independent package/runtime. Agent Core host source does not automatically integrate this converter. The package version is owned by its own `package.json`, separately from Agent Core's product version.

## Thesis

Native import first. Evidence second. Bounded repair third.

```text
PPTX
  │
  ├─ secure package preflight ──> source-manifest.json + Presentation IR
  │
  └─ conversion orchestrator
       ├─ Google adapter ──> Drive native import ──> Slides verification
       └─ Keynote adapter ──> macOS worker ──> Keynote native save
                    │
                    └─ structural / visual evidence
```

The IR is an evidence layer, not a replacement presentation format. The converter deliberately avoids reconstructing every slide from scratch when a target-native importer preserves more semantics.

## Core modules

- `src/pptx/opc`: safe ZIP parser, no extraction to arbitrary filesystem paths.
- `src/pptx/preflight`: read-only OOXML inventory.
- `src/pptx/ir`: normalized evidence representation.
- `src/converters/google`: OAuth + Drive/Slides REST-native conversion.
- `src/workers/keynote`: macOS availability/scripting gate + native worker.
- `src/fidelity`: structural and raster visual evidence.
- `src/repairs`: bounded, allowlisted repair operations.
- `src/jobs`: deterministic state/artifact lifecycle.
- `src/reports`: machine-readable JSON + human-readable HTML evidence.
- `desktop/`: Electron main/preload integration and bounded native pickers.
- `ui/`: shared React/Vite desktop and hosted interface.
- `src/application` and `src/hosted`: application service and browser transport; consult exact source paths for the current owner layout.

## Persistence

V1 stores durable job state in job folders. Recovery and history use the persisted job manifests.
