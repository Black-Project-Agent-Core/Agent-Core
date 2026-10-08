# Jev Ultrafast Steal/Use Integration Plan

Status: **COMPLETE — LIVE ACTIVATED — VERIFIED FOR APPROVED SCOPE**

Reference: `DO NOT TOUCH WITHOUT INSTRUCTION EXPLICIT\jev-ultrafast`
Upstream: `https://github.com/browser-use/jev-ultrafast.git`
Observed branch/ref: `main` / `1231850a0bf1a0c0341fe408ef1668dbbfdfac46`.
License: MIT.
Post-clone Git readback: clean working tree.

## Grounding basis

This proposal was derived from executable source/tests rather than README claims. Direct source reviewed includes:
- `jev_ultrafast/{agent,browser,model,questions}.py` and `snapshot.js`;
- `tests/test_agent.py`;
- `scripts/check_guards.py`, `smoke.py`, `measure_flights.py`, `record_flights.py`;
- `examples/flights.py` independent final-state verifier;
- `demo.py` loopback inspector boundary.

Current Agent Core comparison used `src/rdc`, `src/mcp/server.ts`, MCP schemas/metadata, tracker/tool history, `src/net/outbound-request.ts`, package dependencies, and current CODEBASE ownership. Agent Core currently has no structured DOM browser-control lane under `src/rdc` and no Playwright/browser-harness runtime dependency.

## JEV-P1 — native structured browser action lane

**ADOPT — high value; new optional machine-control subsystem is justified.**
Adapt Jev's strongest mechanism into Agent Core ownership rather than embedding Jev's Python/model runtime:
- add a browser-control module under existing `src/rdc` ownership, with explicit MCP browser observe/act/session lifecycle surfaces;
- one observation atomically returns visible text plus a bounded indexed set of supported DOM/ARIA actions and an opaque observation/freshness token;
- every action ID must map to a code-owned observed DOM node; the controller never supplies CSS/XPath selectors, coordinates, JavaScript, or executable code;
- expose only operation-compatible actions for each observed element: click, text fill, native select, scroll and bounded wait; exclude password/file/hidden values from the action space;
- before mutation, recheck document/page identity, safe form state, selected-node semantic guard, enabled/read-only/visibility state, current geometry and hit-test occlusion;
- stale observations fail closed and require re-observation; do not execute a decision made against a changed page;
- consume a mutation request once and never blindly replay click/fill/select after an uncertain mutation outcome;
- retain bounded candidate/text/action budgets so a browser run cannot grow without limit;
- after input, use short state-aware settling rather than fixed long sleeps; combobox/autocomplete may wait briefly for visible options;
- route invocation evidence through existing Activity Tracker/tool history; do not create a second browser trace database.

### Controller boundary

Agent Core should expose legal observed actions and execute the selected one. The external AI/controller remains the reasoning authority. Do **not** import TypeSafe Jev, its operation model, or its text-helper model as a hidden routing authority. Text to enter is supplied explicitly by the controller to the act call.

### Transport decision required at implementation review

Current Agent Core has no CDP client/browser-harness dependency. Implementation must choose the smallest native transport after source inspection:
1. a minimal maintained CDP/browser dependency if direct protocol ownership would otherwise be brittle; or
2. an Agent Core-owned CDP connection path if it can be implemented without importing a large browser automation framework.

`@puppeteer/browsers` is currently a browser acquisition package, not evidence that a CDP execution client already exists. Dependency installation is therefore a proposal decision, not assumed.

### JEV-P1 targeted acceptance

1. observation exposes only supported visible/safe controls and stable code-owned action IDs;
2. password/file/hidden inputs and model/controller-generated selectors cannot enter execution;
3. replaced/disabled/hidden/read-only/nearby-semantic changes invalidate the relevant action;
4. unrelated geometry movement uses freshly resolved geometry without forcing a new decision;
5. an overlay covering a target blocks input even when semantic state is otherwise unchanged;
6. navigation/replaced document rejects old observations;
7. uncertain native-select or equivalent mutation is not automatically replayed;
8. autocomplete settling observes asynchronously appearing options within a strict bound;
9. action and observation budgets stop runaway loops;
10. existing non-browser machine-control tools and public behavior remain unchanged.
## Verification/evidence shape if selected

- port Jev's guard cases as Agent Core-owned local-browser fixtures without paid/model calls;
- include stale-node, moved target, overlay, changed form state, native select, text replacement, autocomplete and navigation cases;
- add an independent task-level verifier fixture whose PASS is computed from final browser state, never from a controller `DONE` declaration;
- do not run paid external model benchmarks as implementation acceptance;
- any performance claim must record source hash/revision, browser version, protocol-call counts and explicit timing boundaries.

## Implementation result — 2026-09-26

JEV-P1 is implemented natively under `src/rdc/browser-control/service.ts`, with `browser_control` MCP schema/metadata/handler/registration owned by the existing Agent Core machine-control layer. The implementation uses Node 24's native WebSocket transport over loopback CDP; TypeSafe, Browser Harness, Playwright, and a hidden text model were not added.

A project-local Chrome Headless Shell was acquired through the already-installed `@puppeteer/browsers` helper. The upstream installer returned an EBUSY cleanup error after extraction, but exact executable readback and runtime use succeeded at `Google Chrome for Testing 154.0.8037.57`. The incomplete full-Chrome acquisition cache was removed. The native resolver prefers the usable project-local headless shell and can use an explicit `AGENT_CORE_BROWSER_EXECUTABLE` override or an installed Chrome/Edge when present.

Targeted verification: `tests/browser-control.test.ts` **3/3 PASS**. Coverage proves safe observed action exposure, password/file/hidden exclusion, caller-supplied text, autocomplete settling, native select, current-geometry click execution, overlay/stale/replaced/context/navigation refusal, consume-once semantics, action/observation budgets, and independent final-state verification. Final TypeScript compilation completed with exit 0.

Public compatibility: `release-compat.mjs` reports **64 current tools**, no removed tools/routes, `browser_control` additive, `breakingEvidence=false`, fresh compiled manifest, and handshake budget 115,376 bytes / ~28,844 tokens (within 120,000 / 30,000 limits).

## Explicitly rejected/deferred Jev families

- TypeSafe `jev-latest` decision API: **REJECT** — hidden second model/router; controller already owns reasoning.
- OpenAI-compatible field text helper: **REJECT** — controller can supply typed text directly; no second model credential/runtime.
- Python `Agent` loop as a resident subsystem: **REJECT** — duplicate orchestration/runtime rather than native Agent Core ownership.
- demo HTTP inspector/static UI: **REJECT** — Agent Core already owns its UI/auth lifecycle; no second loopback control plane.
- Google Flights/site-specific examples and verifier logic: **REFERENCE TEST EVIDENCE ONLY**.
- screencast/demo rendering pipeline: **REJECT as runtime feature**; optional diagnostics can use existing evidence surfaces if later required.
- screenshot-first/vision browser agent: **DEFER** — JEV-P1 is intentionally a structured-DOM fast lane; visual computer-use is a separate concern.
- shadow-root/frame/canvas/upload/popup/nested-scroll/complex-keyboard expansion: **DEFER** until a concrete consumer requires each capability; current Jev source does not implement them.

## Integration boundary

Owner: existing Agent Core machine-control layer `src/rdc` plus MCP schema/metadata/registration. Do not introduce a generic capability router or autonomous workflow engine.
Public MCP additions are additive and would require structural review plus `release:compat`; release intent should be minor if new browser tools are exposed.
Activation/restart remains a separate explicit step after implementation and targeted qualification.

## Reference disposition

**RETIRED / DELETED AFTER ADOPTION.** A fresh post-JEV-P1 census found zero current-fit residuals beyond the families already rejected/deferred without a current consumer, zero `src/scripts/tests` dependency on the checkout, and no reparse boundary. Pre-delete inventory was 66 files / 18 directories / 7,138,197 logical bytes. Source-byte provenance is preserved in `THIRD_PARTY_NOTICES.md`. The first deletion attempt was blocked by a read-only Git pack; after inspecting that evidence, only read-only attributes inside this already-authorized corpse were cleared and exact-path deletion succeeded. The protected `jev-ultrafast` checkout is absent.

## Live activation closure — 2026-09-26

The approved activation was executed against the existing launcher-owned Core boundary. Pre-cutover listener PID `8708` was replaced by PID `20956`; exact process readback shows `E:\\Projects\\Agent-Core\\runtime\\node\\node.exe` running `E:\\Projects\\Agent-Core\\dist\\index.js`. Tunnel listener `127.0.0.1:8787` remained up and did not require restart.

Fresh `/health` after cutover reports top-level `status=ok`, version `0.13.0`, Memory/Execution/Grafel/Learning available. Semantic IDE separately reports one PowerShell provider version-probe degradation; this is not a JEV-P1 browser-control failure and is not counted as plan acceptance evidence.

A post-cutover compiled-runtime browser smoke imported `dist/rdc/browser-control/service.js`, opened an isolated Chromium session, observed the fixture, executed observed action `e1`, re-observed final state, and returned `{ok:true, sessionOpened:true}`. This proves the compiled JEV-P1 browser lane can execute after cutover. The current ChatGPT conversation retains its pre-restart MCP tool-schema cache, so direct in-chat invocation of the newly added tool is not used as activation evidence. A loopback external MCP acceptance attempt without its dedicated bearer token correctly returned `unauthorized` and is explicitly not counted as PASS.

JEV-P1 is therefore **COMPLETE — LIVE ACTIVATED — VERIFIED FOR APPROVED SCOPE**. No release apply, version bump, publish, deploy, or tunnel restart was performed.