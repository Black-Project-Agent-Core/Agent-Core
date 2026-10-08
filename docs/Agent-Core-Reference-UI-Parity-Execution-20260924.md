# Agent Core Reference UI Parity Execution — 2026-09-24

> **Status:** COMPLETE — BUILT — LIVE-ACTIVATED — SIX-ROUTE SIDE-BY-SIDE VISUAL REVIEW COMPLETE.
> **Product version:** 0.12.0 unchanged.
> **Visual authority:** six PNG references under `docs/UI Agent Core/`.
> **Verification boundary:** implementation/build/live startup and manual side-by-side review are verified; numerical pixel-diff identity is intentionally not claimed because live runtime values may differ from static reference samples.

## Delivered surface

The active WebView2 UI now exposes the reference-derived six-page shell:

- Dashboard
- Core Runtime
- Systems
- Activity Log
- Diagnostics
- Settings

Shared shell and page composition are owned by `src/ui/src/App.tsx`, `components.tsx`, `pages.tsx`, `model.ts`, `systems.ts`, and `index.css`. Native live data comes through the sanitized snapshot contract in `host.ts` / `DesktopSnapshot.cs` / `AgentCoreRuntime.cs`; `MainForm.cs` remains the WebView2/native-window owner.

## Truth-preserving implementation

Reference layout was separated from reference sample values. PID, version, uptime, ports, subsystem state, issue counts, device state and logs remain live. CPU/memory sparklines now accumulate bounded real snapshot samples rather than synthetic arrays. Integrations/Auth are Unknown without a dedicated health surface. Diagnostic durations are Unknown rather than fabricated. Unsupported/destructive controls remain disabled.

## Toolchain recovery

The pre-existing UI dependency tree was physically incomplete. Execution preserved the damaged tree at `src/ui/node_modules.partial-20260924-1910` and repaired only missing exact-version package bodies needed by the existing lock/manifest: Rollup 4.63.3, @esbuild/win32-x64 0.25.12, enhanced-resolve 5.25.1 and react-dom 19.3.0. No dependency/version was added to `src/ui/package.json`; temporary npm script-approval metadata was removed.

## Build and activation evidence

- Vite production build succeeded: 1678 modules transformed; active output written to `dist/ui`.
- Launcher Release build succeeded with 0 warnings / 0 errors.
- win-x64 self-contained single-file publish: `runtime/launcher-publish-ui-20260924/Agent Core.exe`.
- Published/root installed SHA-256: `DD68D32058A47A3ACF1900D1063584ED8239D903FF4BB577C4A2D349524BA65A`.
- Version metadata: FileVersion 0.12.0.0 / ProductVersion 0.12.0.
- Old launcher backup: `runtime/backups/reference-ui-parity-20260924/Agent Core.exe`, SHA-256 `ABBC80B6D3DFB7E30B931930100A25A79C37823FA7E8A9D00C2F8001F2FDECE8`.
- Cutover evidence: `runtime/tmp/reference-ui-parity-cutover-result.json`.
- Old launcher PIDs 380 and 13304 were stopped; new launcher PID 9044 started.
- Node Core PID 15404 and tunnel PID 7336 remained alive through launcher cutover.
- Fresh Activity Journal records desktop initialization and successful Core+tunnel reachability; no UI/WebView startup error appeared in the inspected post-cutover window.

## Release/integrity boundary

Changeset: `.changeset/20260924-reference-ui-parity.md` with minor intent.

No release:apply, package version bump, commit, tag, push, publish or deployment occurred. No broad test suite was run.

## Reference-side visual tightening

A follow-up side-by-side review was completed against all six reference PNGs. The tightening pass corrected the remaining visually proven drift without changing Agent Core runtime authority:

- shared topbar now uses the reference-derived Agent Core mark from src/ui/public/agent-core-reference-logo.png;
- the brand separator is CSS-rendered, avoiding encoding-sensitive text glyphs;
- Dashboard subsystem cards use a compact two-metadata-row presentation so Recent Activity and System Health remain visible at the canonical 1536x1024 viewport;
- breadcrumb/log/pagination/diagnostic glyphs now use Lucide SVGs or ASCII-safe fallbacks, eliminating the observed mojibake;
- Systems cold-start inspector selects a real degraded/warning/error subsystem when present;
- Activity Log selects the newest real event when log data arrives after route mount;
- native MainForm remains the sole window-caption owner; no unsupported React window action contract was shipped.

Development-only capture helper: runtime/tmp/capture-reference-ui-parity.mjs.
Final captures: runtime/tmp/reference-ui-parity-captures/.

All six routes captured with errors=[] and with page/body dimensions equal to the reference viewport, so no page-level overflow remained. Vite rebuilt dist/ui with 1678 transformed modules; final JS is ~295.20 kB and CSS ~27.65 kB. The previous dist/ui is backed up at runtime/backups/ui-parity-visual-tightening-20260924/dist-ui-before-tightening/.

This execution now includes independent manual screenshot side-by-side review. It does not claim numerical pixel identity because live/runtime truth is intentionally allowed to differ from static sample values.

The tightened UI was then reloaded in the native launcher. Primary launcher PID changed from 9044 to 12884 while Node Core PID 15404 remained alive; `/health` returned `ok` on version 0.12.0. Active `dist/ui/index.html` points to `assets/index-HjFZI-sP.js` (SHA-256 `2D7D2DD69706B964B0E9C40EC57E646E8A4A8E86BE6238035D75CC9D5FC51DEC`) and `assets/index-Dplt5ICP.css` (SHA-256 `BD19386DD9B95201F691A7149B231C520D9A28D7B762D2C62AAD4F75D745A9D5`). The fresh Activity Journal records desktop initialization and Core+tunnel reachability without a UI/WebView2 runtime error in the inspected post-reload window.

A native-window capture after reload (`runtime/tmp/reference-ui-parity-captures/live-native-after-tightening.png`, SHA-256 `A61F078EE0DF313FAC658C3339F41D59055A6869CD6BB37146FD48A811D595A9`) confirms the WebView window is rendering the tightened reference logo, compact Dashboard cards, and lower Dashboard panels from the rebuilt UI. An unrelated always-on-top window partially covered the top-right of that desktop capture; it is not part of Agent Core.

Read-only `release:check-intent` could not produce its normal verdict because `refs/agent-core/current-line-baseline` is absent locally (`git rev-parse ... failed`). No baseline ref was created or changed. The existing UI changeset remains present and `release:plan` still includes it; no release operation was applied.

## Native-window responsive refinement — 2026-09-24

A final visual-only continuation addressed density problems visible in the real 1536-wide maximized Agent Core window but not in the canonical browser captures. The native title bar reduces available WebView height; Systems additionally remained too dense when a four-column catalog shared width with the details inspector.

Only `src/ui/src/index.css` changed. A scoped 1180–1599 px / <=1000 px native-window media query applies conservative 5–10% compaction to page internals, keeps the existing shell/topbar/sidebar geometry, changes the constrained Systems catalog to three columns with a 330 px inspector, and tightens Activity/Diagnostics/Settings/Core Runtime spacing enough to avoid clipping without changing component ownership or icon artwork.

Targeted visual capture at 1536x993 covered all six routes. Every capture returned `errors=[]` and document/body scroll dimensions exactly matched the viewport. Evidence: `runtime/tmp/reference-ui-native-density-captures/`. Backup: `runtime/backups/ui-responsive-refinement-20260924/`.

Vite rebuilt 1678 modules. Active JS SHA-256 remains `2D7D2DD69706B964B0E9C40EC57E646E8A4A8E86BE6238035D75CC9D5FC51DEC`; active CSS is `assets/index-DwHCpg-1.css` SHA-256 `4ED4E741C59DBF0FC3E08C2306FEE2061A9E579ED8F78423B61CF40CD9F2AD7D`.

Launcher-only reload moved primary PID 12884 -> 4428 and helper 10408 -> 11804 while Node Core PID 15404 remained running. `/health` stayed `ok` on 0.12.0. No backend/source authority, dependency, product version or release state changed.

## Official product logo restoration — 2026-09-24

The active topbar now uses the official `assets/agent-core.png` asset rather than the reference-derived logo. `src/ui/public/agent-core.png` is byte-identical to the canonical asset and Vite copies it to `dist/ui/agent-core.png`.

Because the official 512×512 PNG has large transparent margins, the UI uses a fixed `.brand-logo-frame` with an enlarged contained image to crop the transparent canvas visually while leaving the original image bytes unchanged.

The launcher native icon already uses `assets/agent-core.ico` through `ApplicationIcon`; no native icon source change was needed.

PNG SHA-256: `4E0FE25FD14837B941D5A62FF47E0EC66E8B96910A22544767D620B7AE346806`. ICO SHA-256: `4A318B3889B5417400C620BDB286BCE2EAD96CC9B5FA9427986D8761266B5C02`.

Vite build passed with 1678 modules. Six-route 1536×993 capture verification returned no page errors/overflow. Backup: `runtime/backups/official-logo-20260924/`.
