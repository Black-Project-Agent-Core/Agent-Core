# Pinned Archify architecture viewer

Upstream: https://github.com/tt-a1i/archify (verified from the supplied checkout remote).
Pinned commit: 7f483b61e8f68d0d5c3219d2c943c5381c8db0b1. Version: 3.0.1.

Included only architecture renderer, shared dependencies and generated classic HTML template. MIT and THIRD_PARTY_NOTICES.md retained; embedded JetBrains Mono OFL notices remain in template.html. No CLI, update-check code, examples, binaries, repository history or package dependencies copied.

Local modifications:
- shared/cli.mjs: AGENT_CORE_WORKFLOWS=1 selects fixed architecture.json/canvas.html under a fresh private temporary cwd, schema validation, disabled repository references and exclusive output write. This narrow path avoids upstream filesystem-wide identity probes incompatible with the integration's Node filesystem permission sandbox. The parent owns temp creation and disposal. No generic arbitrary-output capability is exposed.
- shared/brand-marks.mjs: the same mode rejects brands and skips all captures/network resolution.

Parent integration creates generated diagram metadata only, launches directly with filesystem permissions and no inherited credentials, and applies display-only CSP/navigation guards to the returned HTML. No runtime user Memory or source content is passed to Archify; only component names, relative file paths/counts and dependency relationships.
- architecture/render-architecture.mjs: in embedding mode only, allow the specific `clean-flow/edge-through-node` aesthetic diagnostic for dense static dependency maps. All other layout, endpoint and schema checks still run. Parent CSS reveals only a selected node's neighborhood edges, starts on Memory host, and states clearly that edges may cross unrelated nodes. No claim of clean-routed geometry is made.

Node filesystem permissions are not an operating-system network sandbox. Offline behavior comes from the audited fixed-input renderer path with brand capture bypassed; browser network access is independently blocked by CSP.
