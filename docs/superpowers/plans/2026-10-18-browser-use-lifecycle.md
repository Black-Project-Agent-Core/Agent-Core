# Browser Use lifecycle implementation plan

> **For agentic workers:** Use the current Main/Raka split; Main integrates and verifies each deliverable.

**Goal:** Prefer a live supported browser extension automatically, recover owned-tab focus, and provide a self-starting dedicated browser fallback.

**Architecture:** Preserve BrowserControlService and its scoped OBU RPC transport. Agent Core.exe supplies a bounded native-messaging helper role; Node owns fallback browser startup and shutdown. Discover live endpoints at each new session, prefer one unambiguous external extension, and otherwise select the dedicated fallback. Never attach existing user tabs.

**Tech stack:** Existing TypeScript/Node, .NET 8 launcher, Chromium extension and installed project Chrome for Testing.

**Spec:** User request in this conversation, including preference for automatic active-extension detection with dedicated Agent Core browser fallback; existing docs/Open-Browser-Use.md.

## Constraints and review focus

- External controller only; preserve Native frozen sections and unrelated working-tree changes.
- No new toolchain, global package, service, or browser download. Use project-owned browser/profile paths.
- Multiple or stale endpoints must not silently select a user profile.
- Concurrent opens must share one fallback browser; a crashed startup must remain recoverable.
- Focus recovery can change DOM; check observation freshness again before page input.
- Disconnect/unknown action results never permit replay; shutdown touches only the owned fallback browser.
- Native host helper must bypass launcher UI/mutex, correlate multiple clients, bound frames/queues, and close on extension EOF.

## Task 1: Scoped focus recovery (Raka)

Files: src/rdc/browser-control/open-browser-use.ts, tests/open-browser-use.test.ts.

- [x] Add failing regressions for lost focus and unavailable focus probes.
- [x] Restore only the owned task target once and verify actual focus boundedly.
- [x] Run directed tests: initial 4 failed / 21 passed, then 25 passed.
- [x] Main revalidates DOM freshness after activation and verifies live behavior.

## Task 2: Embedded native host (Raka)

Files: src/launcher/BrowserUseNativeHost.cs and a standalone executable .NET test harness.

- [x] Write executable frame/socket regressions and observe missing behavior.
- [x] Relay native frames through unique project-owned AF_UNIX endpoints; preserve exact request ownership and bounds.
- [x] Verify real streams, duplicate caller IDs, disconnect, invalid/oversized frames and cancellation (18 passing tests).

## Task 3: Detection and managed fallback (Main)

Files: open-browser-use-runtime.ts, existing transport/service/index/Program, dedicated extension assets, tests, docs and changeset.

- [x] Add regressions for unambiguous external selection, ambiguous fallback, config/path normalization, single startup and owned cleanup.
- [x] Register project-native host manifests without overwriting unrelated registrations; package extension assets with attribution.
- [x] Warm connection after Core begins listening; launch a project browser only when needed, and close owned browser on shutdown.
- [x] Build Node and launcher, verify Native/path guards, and run relevant focused tests.
- [x] Activate with official restart capability; inspect receipt/health and verify actual browser flow. Initial activation exposed a Windows socket interop failure; a second deliberate restart activated the independently tested embedded connector correction.
- [x] Use the direct ChatGPT settings link and mandatory scroll to visible Refresh tools; click once and distinguish settled UI from still-cached client descriptors.
- [x] Update CODEBASE/Open-Browser-Use, retain verification evidence, and finalize the current Learning episode (checkpoint 428, scoped review complete, no-new-knowledge).

Live acceptance used the existing connected extension; it intentionally did not launch a second browser. Fallback lifecycle is covered by directed fixtures, not a live fallback acceptance claim. Evidence: `runtime/build/browser-use-lifecycle-20261018`.
