# Browser use without foreground takeover

**Goal:** Use the existing connected OBU extension on an inactive owned tab without bringing its window/tab forward or sending desktop input.

**Architecture:** The existing external `headless=true` argument means background intent for OBU; the installed browser remains physically headed, reported as `headless:false, background:true`. Explicit `headless=false` retains foreground behavior. Background connects require an existing unambiguous connection and cannot start a fallback browser. Preserve scoped CDP, observation freshness, element visibility and unknown-outcome rules.

**Spec:** User request in this conversation: use Agent Core browser use without taking over the screen; reuse the connected extension.

**Workload:** At most four sessions, bounded RPC/observations/actions. Reuse the existing connection and bounded host settle delay; avoid additional background readiness loops or workers. No speedup claim.

- [x] Add failing regressions in `tests/open-browser-use.test.ts`: hidden document open/fill without activation; unfocused editable field refuses insertion; background connection does not launch a browser; explicit foreground remains supported.
- [x] Update `open-browser-use.ts` for background readiness and activation refusal; `service.ts` forwards intent, focuses/verifies the DOM field and uses guarded native HTML activation for background clicks. Update only the external descriptor in `rdc-tool-metadata.ts`.
- [x] Run 48 focused browser/manifest tests and official build; package launcher. Two official restarts completed exit 0, the correction after user reaffirmed Agent Core auto-approval. Native sections stay frozen.
- [x] Through the actual Agent Core capability, open/read/fill/submit a local native form while a read-only foreground-window monitor records the same window throughout. Independent receipt/fresh result matched; 380 samples, one unchanged foreground window. Successful task-tab close acknowledged.
- [x] Attempt required background browser-use Refresh tools and report the concrete nested-pane limitation: PageDown acknowledged, no SCROLL/visible Refresh control; settings task tab closed. CODEBASE/guide and evidence updated; Learning checkpoint 429/scoped review finalized.

Raka reviews source/risks independently; Main owns edits, activation, actual MCP acceptance and Learning. No new packages, browser downloads or existing-user-tab claims.
