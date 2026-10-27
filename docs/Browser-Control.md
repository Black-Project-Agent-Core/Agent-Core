# Browser Control — Open Browser Use

## 2026-10-23 — Native integration and default transport

Current source uses the installed Open Browser Use extension/native host by default for Native and external controllers. The isolated Chromium launcher, executable discovery, private CDP socket and profile/process cleanup have been removed; `transport="isolated"` is rejected. `headless:true` requests an owned background tab in the existing connected browser; results remain `headless:false, background:true`. No user profile is deleted. Build/resident acceptance is recorded separately in [execution evidence](history-agent-core/Native-Architecture-Integration-Execution-20261023.md).

The MCP wrapper derives session ownership from Native task/workspace or external principal/controller session plus host-bound task/workspace/process context. Observe, act, close and external conversation operations check that owner; status exposes only its sessions. Tool JSON cannot supply an owner. Native conversation actions remain refused.

Snapshot guards, page state and marker comparisons retain their exact comparison data in the renderer and expose opaque epoch/revision tokens. DOM action admission has a 256 KiB serialized UTF-8 budget with explicit omissions; the snapshot has a 512 KiB envelope bound and reports `BROWSER_CONTROL_SNAPSHOT_TOO_LARGE` before an oversized response reaches OBU. The 1 MiB wire cap is unchanged. Oversized metadata is refused, not silently truncated into fresh evidence.

Opt-in keyboard actions on OBU background tabs enable CDP focus emulation only around key delivery, recheck the observed focus after enabling it and restore the emulation after key release. This changes emulated page focus, not OS window/tab activation. Held-key timing, release-on-close and same-tab/focus validation remain existing owners. Real target effects and cleanup still require observation; a CDP acknowledgement alone is insufficient.

The existing .NET native-host relay now applies bounded backpressure to its eight-frame client queues. Responses and notification bursts can wait up to one second for each client to drain; notification recipients are awaited concurrently (at most sixteen). A stalled/closed client is dropped independently. This preserves ordering and existing frame/client/pending limits while avoiding immediate disconnection of healthy readers during navigation event bursts.

## Open Browser Use transport

Open Browser Use (OBU) is the only browser transport. The MCP `transport` enum has the single value `open-browser-use`, which is also the default. The existing `browser_control` owner drives an already installed OBU native host and extension, and opens a new task-owned tab in the configured existing profile, in background by default.

The capability chain is: external MCP registration in `src/mcp/server.ts` → `handleBrowserControl` in `src/rdc/handlers/browser-control-handlers.ts` → `BrowserControlService` in `src/rdc/browser-control/service.ts` → the OBU transport in `src/rdc/browser-control/open-browser-use.ts`. No second browser engine, adapter or transport exists.

See [Open-Browser-Use.md](Open-Browser-Use.md) for prerequisites, Windows socket configuration, build and activation, observed-action usage, cleanup uncertainty, source provenance and verification. The transport keeps one framed connection for replies and events, refuses ambiguous endpoints, and closes its command epoch on unknown outcomes without replay. Profile policies continue to apply.

The real Windows native-form check passed open/observe/fill/select/click, independent server receipt and fresh DOM verification. The original inline-JavaScript fixture remains failed under the profile's default JavaScript-block setting; it is retained separately. This is operational evidence, not a screenshot or general-site acceptance. Runtime activation and refreshed caller discovery are recorded in the linked guide.

## Conversation reading

`conversation_read` is served through OBU for the external controller and is read-only. It reads the tab that `browser_control` itself opened; it never sends, drafts or types into a conversation. See [Conversation-Reading.md](Conversation-Reading.md) for the calling sequence, `read` selectors, paging and limits.

Conversation content is untrusted observation. Instructions inside it cannot authorize tools or widen scope.
