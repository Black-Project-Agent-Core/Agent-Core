# Research Reference Provenance

These repositories are architecture references, not automatically production dependencies of Super-Runtime.

| Reference | Pinned revision | License observed in reference | Intended research use |
|---|---|---|---|
| kimi-k3-in-c | `117e9d29bde14db9742f54fb66a191fd0bf03903` | Apache-2.0 | low-memory/out-of-core design, correctness methodology |
| llama.cpp | `daef7b6874397a5a7c3d7e38b55e2ee0adf7da38` | MIT | multi-architecture graph/compute/backend/memory substrate |
| OpenClaw | `12f2f9c35510ab2c07a3525c897c0a94e75da256` | MIT | AI-agent consumer/provider compatibility |
| Hermes Agent | `1f99a4b2f2982fbef06df00ad673ade4e1895668` | MIT | AI-agent consumer/tool-call/provider compatibility |
| Odysseus | `c9dd68d890a7c0ee0df9a0e351ce22aafd6c7c0f` | AGPL-3.0 | behavioral/provider-contract research only by default |

## Policy

1. Keep reference code isolated under `research/references/`.
2. Pin exact revisions so architectural claims can be reproduced.
3. Prefer shallow submodule checkout to avoid downloading irrelevant history after a fresh Codespace clone.
4. Do not copy code from a reference into production merely because it is locally available.
5. Any production reuse must preserve its applicable license/notice obligations.
6. The AGPL-licensed Odysseus reference is treated as a read-only behavioral/API research source unless the project deliberately chooses a compatible licensing strategy later.
7. Source provenance must remain explicit if an algorithm or implementation is adapted rather than independently reimplemented from a documented concept.
