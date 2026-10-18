# B reads the tab it created for A

Active external interface, verified through the resident Agent Core MCP capability on the user's selected conversation. Activation and evidence are recorded in CODEBASE.

The human talks to A in the same ChatGPT tab created by B with Agent Core Open Browser Use. B reads that owned tab on demand, using the already connected OBU extension. No copied tab, arbitrary tab claim, additional extension, model, screenshot reader or recurring monitor is required.

## Calling sequence

1. `browser_control({action:'open',transport:'open-browser-use',headless:true,url:'https://chatgpt.com/'})` creates the owned background tab. The human can bring it forward and select or start A. The same session remains the target.
2. `browser_control({action:'conversation_read',sessionId,read:{kind:'index'}})` lists loaded messages in chronological pages. On the homepage it reports no-conversation until an actual `/c/...` URL exists. Follow `nextCursor` with another index request to cover all indexed loaded messages.
3. Select an observed `messageRef`, then call `conversation_read` with `read:{kind:'message',messageRef,offset:0}`. Continue at each `nextOffset` until `eof:true`. This can retrieve the tail beyond the former6,000-character limit.
4. Start a fresh index when new messages or revisions are needed. Edited/streaming bodies, branch changes, navigation and reload can invalidate references; never append chunks belonging to different versions. A fresh index explicitly starts from the current conversation in this same owned tab.

The `read` selector belongs only to external OBU `conversation_read`. The legacy paired Bridge retains its separate `sinceRevision` interface and existing popup-only draft/send policy. Native browser behavior and grants stay frozen. This feature adds no sending or composer permission.

## What completeness means

The index describes loaded bodies; it does not prove that the website has mounted every historical turn. `completeHistory:false` remains explicit. Coverage reports bounded scans, unreadable/unsupported content and capture limits. Older app-turn wrappers without reliable author evidence are included as `role:'unknown',authorKnown:false`, with explicit ambiguity counts. Generic formatting outside those wrappers is excluded. Document-local refs are read-only handles, not proof of original message IDs.

On browsers with the Navigation API, a metadata-only URL listener invalidates refs even after a SPA navigation away and back without a read between. `coverage.navigationEpoch:'current-url-only'` reports the weaker fallback when that API is absent: an unobserved SPA round trip cannot be detected there. No History API is patched and no transcript observer runs.

B can read a chosen long message through bounded chunks rather than forcing the entire transcript into one model response. Rendered-text provenance is distinct from original Markdown. Code whitespace is preserved; original file/attachment contents, hidden reasoning and unmounted history are not fabricated. Reading does not scroll, focus, navigate, type or click. Loading earlier history through ordinary observed scroll actions is a separate operation that can affect the human's viewport.

Private chat bodies are transport-only: conversation calls use metadata-only durable history and no result spill. No automatic copy to canonical Memory, Learning candidates or evidence files is part of this reader. Tests/evidence retain synthetic text or real aggregate metrics only. Model context remains bounded; paging is not unlimited memory or an automatic model wake mechanism.

Current OBU ownership and30-minute lifetime remain in force. Expired/moved scope must not be silently reclaimed. Session observation budgets apply to semantic reads too. Close retains the browser but normally closes its owned task tab; do not close a human's ongoing conversation/draft merely as test cleanup.

## Verified real limits on 2026-10-18

Before activation, the selected tab exposed six loaded groups/20,153 rendered characters. After the official restart and reopening the same exact conversation URL in a new owned background tab, the site mounted ten groups. Actual resident MCP index plus ten message reads returned 27,042 characters, all at EOF, including a 10,067-character answer previously capped at6,000. Two groups had unknown authors. Independent metadata snapshots before/after those resident reads showed identical hidden/focus/draft/scroll state. No real chat body was persisted in these evidence files.

The site's mounted window changed between loads. These counts describe each measured window, not deletion or proof of whole-history capture. Unsupported content count8 was reported; attachment/file contents were not retrieved. Synthetic Chromium tests separately prove105 loaded-turn pagination and multi-chunk long Unicode reconstruction. The current controller's descriptor remained cached after the visible Refresh tools click/loading/return-to-enabled sequence, while its actual MCP calls accepted and exercised the new `read` selector. Fresh client descriptor discovery is not claimed. Evidence is under `runtime/build/conversation-coverage-20261018`.
