# Spec-Kit Steal/Use Integration Plan

Status: **PRIOR SPK-P1/P2 COMPLETE/LIVE — SPK-P3 COMPLETE — TARGETED VERIFIED — LIVE-ACTIVATED — INSTALLED-RUNTIME VERIFIED — SPK-C2/C3 CONSUMER-ONLY — REFERENCE MOVED TO `Consumer`**

Reference: `DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT\Consumer\spec-kit`
Upstream: `https://github.com/github/spec-kit.git`
Observed branch/ref: `main` / `307b3a537fb39721adc7c00aa18adfa1582649aa`.
License: MIT.
Post-clone Git readback: clean working tree.

## Grounding basis

This audit used executable source/tests as authority. The checkout contains 832 tracked files; `src/specify_cli` alone spans the workflow, integrations, extensions, presets, bundles, events, artifacts, authentication and core CLI families. Representative and high-risk source was read directly rather than treating documentation as implementation proof.

Key source/test evidence reviewed includes:
- `src/specify_cli/_download_security.py` plus `tests/test_download_security.py`;
- workflow engine/base/expression/run-ownership and overlay implementation;
- artifact catalog/resolution and preset layered resolver/manager;
- bundle resolver/validator/installer and transactional extension updater;
- agent/integration registration and integration-state/runtime modules;
- feature/spec/plan/task prerequisite scripts plus no-overwrite/read-only-path tests;
- runtime events dispatcher and authenticated download helpers.

Current Agent Core comparison used `src/semantic-ide/provider-provisioning.ts`, `src/net/outbound-request.ts`, `src/mcp`, `src/rdc`, `src/learning`, existing release/verification scripts, and the maintained CODEBASE.

## SPK-P1 — close residual archive/acquisition preflight gaps

**ADOPT — focused security delta only; do not import Spec-Kit's installer/package system.**
Agent Core's Semantic IDE provisioner already has strong controls: explicit allowed hosts, HTTPS/loopback policy, redirect revalidation, streamed download limits, SHA-256, traversal/link refusal, entry/expanded-size bounds, destination collision checks, staged promotion, tree digest and rollback. Spec-Kit still contains source-backed preflight defenses not currently present as equivalent checks.

Adapt only these missing classes into Agent Core-owned archive preflight:
- verify declared archive format against actual bytes and, where meaningful, response metadata before extraction;
- reject ZIP64/unsupported extractor-version structures when the chosen extractor path is intentionally bounded to legacy ZIP semantics;
- bound ZIP central-directory metadata before the ZIP library materializes it;
- explicitly allow only bounded compression methods supported by the chosen extraction implementation;
- enforce portable per-component and full archive-path byte ceilings;
- reject Windows device/reserved names, trailing dot/space, alternate-data-stream style colon names, invalid/control characters and Unicode/case-normalized destination collisions before writing;
- retain existing Agent Core SHA/host/stage/rollback ownership; no second downloader database or installer.

Implementation should first extract the minimum reusable preflight helper only if there is more than one Agent Core-owned archive consumer. Otherwise keep the checks local to `src/semantic-ide/provider-provisioning.ts` to avoid premature abstraction.

### SPK-P1 targeted acceptance

1. suffix/content-type/signature mismatch fails before extraction;
2. oversized central-directory metadata fails before ZIP library expansion;
3. unsupported/unsafe ZIP64 or compression forms fail before member extraction;
4. Windows reserved/nonportable names and Unicode/case destination collisions fail before any destination write;
5. existing traversal, link, entry-count, expanded-byte, SHA-256, host and redirect tests stay intact;
6. a normal currently supported provider archive still provisions identically;
7. failure leaves no promoted partial provider tree and preserves prior valid installation;
8. no public MCP schema or tool count changes.

## SPK-P2 — advisory adoption-plan readiness inspector

**ADOPT — offline/read-only tooling; no runtime workflow gate.**
Spec-Kit's feature/plan scripts provide a useful small pattern separate from its workflow engine: explicit feature context, prerequisite checks, no-overwrite semantics, read-only path resolution, and machine-readable JSON output. Agent Core currently has many source-first steal/use plans but no script under `scripts` that validates one explicit adoption plan before implementation.

Adapt this as an explicit inspector under `scripts/inspect` or `scripts/verify`, not a new MCP runtime:
- input is one explicit plan path and, optionally, one explicit protected reference path; never scan the whole drive/project implicitly;
- validate proposal status, source/upstream/ref pin, license note, current Agent Core owner, proposal IDs, target ownership/files, verification/acceptance section, activation boundary, release/compat impact, rejected/deferred families and reference disposition;
- when a reference path is supplied, report existence plus best-effort branch/HEAD/dirty evidence without mutating Git trust configuration; Git degradation yields `incomplete`, not a fabricated PASS;
- emit deterministic JSON plus concise human output; diagnostics go to stderr while JSON stdout remains parseable;
- inspector is advisory evidence only: it never blocks MCP calls, installs code, edits plans, creates branches, changes AGENTS.md, or advances release state.

### SPK-P2 targeted acceptance

1. explicit complete plan returns structured ready evidence without modifying plan/reference;
2. missing source pin, proposal boundary, acceptance criteria, activation boundary or reference disposition is reported precisely;
3. unreadable/degraded Git/reference evidence produces `incomplete`, never `ready` by assumption;
4. read-only inspection leaves plan/reference hashes and Git status unchanged;
5. JSON output remains parseable with status/warnings separated from stdout;
6. no resident service, database, MCP tool or workflow scheduler is added.

## Implementation result — 2026-09-26

SPK-P1 is implemented inside the existing `src/semantic-ide/provider-provisioning.ts` authority. No Spec-Kit installer/package/runtime was imported. Added preflight covers response Content-Type contradiction, archive byte-signature contradiction, bounded ZIP central-directory metadata, multi-disk/ZIP64 sentinels, extractor-version/compression refusal, UTF-8 component/path ceilings, Windows reserved/invalid/trailing names, and NFC/case destination collisions before writes. Existing allowed-host, redirect, compressed/expanded byte, entry-count, SHA-256, staging, tree-digest and rollback behavior remains the owner.

SPK-P2 is implemented as `scripts/inspect/adoption-plan-readiness.mjs`. It inspects one explicit plan and optional explicit reference, emits advisory JSON/human evidence, uses per-command Git `safe.directory` without global trust mutation, reports degraded Git as incomplete, and never edits plans, references, runtime state or release state.

Targeted verification: `tests/semantic-ide-provisioning.test.ts` **13/13 PASS** and `tests/adoption-plan-readiness.test.ts` **3/3 PASS**. Final TypeScript compilation completed with exit 0. `release-compat.mjs` reports no breaking evidence; SPK-P1/SPK-P2 add no separate MCP public surface.

## Conditional residuals — do not install in this wave

- **SPK-C1 — external-agent command/skill renderer:** Spec-Kit has broad Claude/Codex/Gemini/Copilot/Cursor/etc. command rendering and invocation adaptation. Revisit only if Agent Core gets an explicit product requirement to materialize its own approved workflows into third-party agent configuration. It must never silently mutate external AI-host config.
- **SPK-C2 — layered preset/artifact provenance:** replace/wrap/merge layers and provenance hashes are useful only if Agent Core first gains a real user-facing template/preset consumer. Do not create that consumer just to adopt the mechanism.
- **SPK-C3 — runtime event adapters:** pre/post tool/session event dispatch is only useful if Agent Core explicitly chooses a cross-agent hook product. Current Activity Tracker/Learning/controller contracts remain authority; no hook bus is justified now.
## Explicitly rejected current-fit Spec-Kit families

- full YAML workflow/DAG engine, branch/loop/fan-out/fan-in/gate runtime: **REJECT** — would create a second orchestration/workflow authority beside the external controller and contradict Agent Core's deliberately direct machine bridge.
- shell/prompt/gate workflow execution and resume state: **REJECT** for the same ownership reason; no hidden autonomous execution fabric.
- extension/preset/bundle marketplace and package lifecycle: **REJECT** — no current Agent Core package consumer; duplicative installer/registry/version/conflict state.
- transactional extension updater: **REJECT as subsystem** — its safety properties are already substantially owned by existing Agent Core staged provider provisioning; only SPK-P1 residual preflight is retained.
- layered command/template overrides as a replacement for root `AGENTS.md`: **REJECT** — mandatory Agent Core contract remains singular authority.
- Spec-Kit constitution/memory directory model: **REJECT** — conflicts with Agent Core canonical Memory/Learning ownership.
- integration state and multi-agent default routing: **REJECT for runtime** — no hidden/default controller routing should be introduced.
- authenticated catalog downloader/auth store: **REJECT** — Agent Core already has its own auth/OAuth and outbound ownership; do not create a second credential authority.
- feature branch numbering and Spec-Kit project directory conventions: **REJECT as product behavior** — only the no-overwrite/read-only/prerequisite inspection pattern is used in SPK-P2.

## Integration boundary

SPK-P1 owner: existing artifact provisioning/security code; internal only unless reuse proves a tiny shared security helper is warranted.
SPK-P2 owner: explicit offline `scripts/inspect`/`scripts/verify` tooling only.
Conditional SPK-C1/C2/C3 require a future explicit consumer before any implementation proposal can become active.
No Python Spec-Kit runtime, `.specify` project authority, YAML workflow engine, extension registry, package marketplace, event daemon, or hidden controller is imported.
SPK-P1 is normally patch/internal. SPK-P2 is tooling-only/patch unless a public report schema becomes a supported contract. No release/activation action occurs during grounding.

## Reference disposition

**CONSUMER-ONLY / MOVED.** SPK-P1/P2/P3 are implemented/live. The remaining SPK-C2 layered preset/artifact provenance and SPK-C3 cross-agent runtime event adapters require explicit products that current Agent Core does not own. The checkout is not a corpse, but it is no longer an active adoption candidate and is preserved under protected `Consumer`.

Live Node Core was not restarted. SPK-P1 source and compiled `dist` are qualified; runtime activation waits for the same separate explicit core restart as JEV-P1. SPK-P2 is an offline script and is directly usable without a core restart.
## Residual re-grounding — 2026-09-27

The same pinned Spec-Kit source was re-grounded after Agent Core gained a native artifact-only Skills subsystem. This changes the status of the old SPK-C1 condition: Agent Core now has a real current consumer for deterministic Skill artifact rendering/export.

### SPK-P3 — deterministic external-agent Skill renderer/export

**Disposition:** CURRENT-FIT PROPOSAL — user review required.

Reference source/tests substantiate:
- integration-specific command/skill layouts are explicit, validated and deterministic;
- agent integrations declare invocation separators/layout modes rather than relying on ad-hoc filename guessing;
- unsupported per-step runtime options fail closed instead of being silently ignored;
- extension Skill registration resolves placeholders and enforces stable names/layouts in direct tests.

Current Agent Core gap:
- `SkillService` can validate/import/inspect/revision/package Agent Core-owned Skill artifacts;
- it does not render a selected active Skill into an explicitly chosen external-agent layout;
- current `package` output is Agent Core's native archive, not a Claude/Codex/other command/Skill projection.

Proposed adaptation:
- add an Agent Core-owned **preview/export renderer** over active Skill artifacts;
- target a small reviewed set of external layout profiles rather than importing Spec-Kit's whole workflow engine;
- default to preview under `runtime/skills/exports`; do not write into `.claude`, `.codex`, editor config, home directories or other AI-host locations automatically;
- preserve source digest/provenance and include a deterministic render manifest;
- external rendering grants no execution authority and never invokes the target agent;
- explicit export destination, if later exposed, must remain path-bounded and user-authorized;
- reuse the existing `skills` tool if manifest budget permits; otherwise prefer an offline Agent Core script/artifact surface over adding a new MCP tool.

Acceptance:
- same active Skill + same profile produces byte-identical rendered output/manifest;
- unsupported metadata/options fail closed;
- rendering cannot alter the active Skill catalog or revision history;
- no external host config is modified by preview;
- source provenance/digest remains traceable from rendered artifact back to the active Skill;
- MCP manifest remains inside its reviewed budget if the public schema changes.

### Conditional residuals after SPK-P3

- **SPK-C2 layered presets/artifacts:** remains conditional; Agent Core has no user-facing preset/template product requiring layered preset resolution.
- **SPK-C3 runtime event adapters:** remains conditional; Agent Core has no approved cross-agent hook/event product.
- Spec-Kit workflow engine, issue/task orchestration, auth providers, extension marketplace and direct external-agent dispatch remain rejected as parallel workflow/runtime authorities.

**Reference disposition: CONSUMER-ONLY.** SPK-P3 is now adopted/live; SPK-C2/C3 remain source-backed conditional evidence, so the checkout is preserved under protected `Consumer` rather than treated as an active adoption reference or corpse.

## SPK-P3 approved execution result — 2026-09-27

SPK-P3 is implemented in current source/dist through the existing artifact-only Skills owner. The existing `skills` MCP tool gains additive `render_export` with reviewed `claude` and `codex` profiles.

Rendered artifacts remain under `runtime/skills/exports`, carry deterministic source/provenance manifests, do not mutate external host configuration, and grant no execution authority. Targeted and compiled-dist acceptance are recorded in `docs/CBM-SpecKit-Adoption-Execution-20260927.md`.

SPK-C2/C3 remain approved but conditional because no preset/template product or cross-agent hook product exists. Spec-Kit remains preserved under protected `Consumer`. SPK-P3 live activation is complete and installed-runtime verified; evidence is recorded in `docs/CBM-SpecKit-Adoption-Execution-20260927.md`.

## Final lifecycle re-grounding — 2026-09-27

SPK-P1/P2/P3 are already implemented/live. Current Agent Core still has no user-facing layered preset/template product and no approved cross-agent hook/event product, so SPK-C2/C3 are consumer-only residuals rather than active adoption work.

The exact clean checkout was moved from `spec-kit` to `Consumer\spec-kit` with HEAD unchanged at `307b3a537fb39721adc7c00aa18adfa1582649aa`.

No Spec-Kit Python runtime, workflow engine, preset marketplace, hook bus, dependency, build, restart, or release action was introduced.
