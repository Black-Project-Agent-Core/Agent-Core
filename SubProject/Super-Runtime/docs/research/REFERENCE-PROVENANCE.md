# Research Reference Provenance

These repositories are runtime/substrate references. Downstream AI-tool repositories are intentionally excluded from the current research set.

| Reference | Pinned revision | License observed in reference | Intended research use |
|---|---|---|---|
| kimi-k3-in-c | `117e9d29bde14db9742f54fb66a191fd0bf03903` | Apache-2.0 | low-memory/out-of-core design, correctness methodology |
| llama.cpp | `daef7b6874397a5a7c3d7e38b55e2ee0adf7da38` | MIT | multi-architecture graph/compute/backend/memory substrate |

## Policy

1. Keep reference code isolated under `research/references/`.
2. Pin exact revisions so architectural claims can be reproduced.
3. Prefer shallow submodule checkout to avoid downloading irrelevant history after a fresh build host clone.
4. Do not copy code from a reference into production merely because it is locally available.
5. Any production reuse must preserve its applicable license/notice obligations.
6. Source provenance must remain explicit if an algorithm or implementation is adapted rather than independently reimplemented from a documented concept.
