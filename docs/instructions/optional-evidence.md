# Optional evidence

[Mandatory entry](../../AGENTS.md). Global scope/safety still apply. Code-quoted paths are project-root-relative.

## Optional Batch 9/10 source-evidence workflows — 2026-10-15

For a bounded report whose author explicitly lists claim IDs and local source anchors, use the **existing** `scripts/verify/verify-evidence-links.mjs` with `--root <authorized-absolute-root> --manifest <existing-v2-manifest> --output <new-persistent-report>`. Schema v2 needs 1–32 `expectedClaims` plus declared `claims` tied to bounded `documents/links`; `claimCoverage.complete` establishes structural anchor binding only, never semantic entailment, truth, or automatic approval. v1 callers remain supported. Do **not** make this an obligatory audit, new gate, or excuse to read unauthorized paths.

For a real local raster preview with **known actual text source files**, `image_inspect({action:"overview",path:<local-image>,sourceFiles:[<local-html-css-js-paths>]})` can capture up to eight declared UTF-8 dependencies. Crop inherits the original baseline; review checks freshness against that same baseline. The `sourceDependencies` current/changed/unavailable status applies **only to declared local text bytes**, not complete dependency closure, renderer lineage, visual quality or export permission. A cached external client schema without `sourceFiles` needs connector refresh; this is not proof the resident lacks the field. No fabricated preview, forced mutation, unauthorized file access, or extra test suite is warranted.
