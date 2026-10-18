# Browser Bridge — pairing and DOM-reader repair

## 2026-10-18 — Browser Bridge 0.2.3 observed-marker adapter; live read OPEN

Current evidence supersedes the older activation/path notes below. Live 0.2.2 structural diagnostics found user-bubble text and assistant code-source text under the same generic whitespace class. The existing selectChatTurns/pageRead owner now recognizes data-user-message-bubble and selection-scoped data-markdown-text-style, checks the conversation-selection ID, uses real message/source/selection or one search-message ID, and filters control/sidebar/composer/tool content. No role alternation, positional IDs, whole-page extraction or frame/shadow traversal was added.

The actual Brave registration is djnpklbndhblfgjbolnjmmgeikmogbpn at runtime/build/browser-reader-completion-20261018/agent-core-browser-bridge. Six relevant files matched the pre-patch baseline before the existing extracted copy received the same four changed runtime/version files as the standalone source. The manager then visibly displayed 0.2.3 after Reload. Existing identities, permissions, worker protocol and Core public schema are unchanged. No Core restart/build or plugin update was performed or required by this marker patch.

Qualification: final real isolated Chromium synthetic DOM 18/18 (original 15-case baseline: 10 failed/5 passed); Windows extension regression 38/38; existing read-only MCP/HTTP/worker and status-contract selection 11 passed/14 unselected skipped, exit 0. Changed function hashes match across the Chromium-qualified and installed source. Full conversation.js SHA-256 is 41079b6a61fde6304d2b7813585238de179c626e14d8ee1a86c7052e1f006e86. Cases semantic digest is 2a7a01f4946221c5d18d5d1fa80c94f8bb2ce48f2bc89bc21638d3ab1d0d5640. Evidence lives under runtime/build/browser-markers-20261018; backups under runtime/backups/browser-markers-20261018.

The latest attempted post-update binding expired without attachment: closed/current=false/revision=0/BROWSER_CONTROL_SESSION_CLOSED. No post-update target message/role acceptance or real send is proved. A fresh user-selected tab binding remains required; this is activation, not a selector remedy. No draft/message was created or sent to a real chat. The current task remains OPEN until actual target read/status and visible-message comparison succeed. Older completion/activation counts below are historical.


Date: 2026-10-18 WIB.
Target: `E:\Projects\agent-core-browser-bridge`.
Status: **MATCHING CORE BUILD RESTARTED; 0.2.2 EXTENSION RELOAD/PAIRING PENDING. REAL TARGET MESSAGE READING STILL OPEN.**

## 0.2.2 current work — controller-readable diagnostics and status correctness

The actual Brave registration identifies extension `lmhnhemmpokcmhjilcliaoelfcehobme` at the target folder. Its popup was independently observed at 0.2.1 with the exact authorized target preview. The old grant was first observed attached/paused with revision 0, a DOM_NOT_READY error, and an incorrect current=true. It subsequently expired/disconnected. A replacement pairing request was made but was still pending at the last status read. No real message body/role/ID extraction has succeeded, and the structure of the 14 formatting-class matches remains unknown.

The hardcoded status current=true is fixed in src/rdc/browser-control/extension-bridge.ts. src/rdc/browser-control/conversation-contract.ts now accepts strict bounded optional diagnostics on existing read/status results, rejects unknown/pageText fields, and retains normal revision/coverage validation. The existing extension worker calls the existing fixed dom-diagnostic.js on an explicit unpaused error read/status only, keeping grant/URL/rebind checks. There is no new public command or arbitrary expression/selector. conversation.js separates loading/unsupported/invisible/incomplete/wrong-frame errors; the actual message selector was not guessed or replaced.

Current changed files: Core extension-bridge.ts and conversation-contract.ts; tests/browser-conversation-status-error.test.ts, browser-conversation-fixture.ts, browser-conversation-integration.test.ts; extension conversation.js, worker.js, version fields in manifest.json/package.json/popup.html, tests/reader-error-report.test.js and the matching fixture import in tests/pairing-repair.test.js; relevant README/DELIVERY/INTEGRATION and Core guide/map; .changeset/20261018-browser-read-status-diagnostics.md. dom-diagnostic.js itself is reused unchanged.

Observed qualification: 12/12 extension read-only fixtures on version-0.2.2 source; 8/8 status/reply-contract; 5/5 public manifest; 3 selected actual worker/HTTP/MCP read-only cases passed, 14 unselected cases skipped. The status bug had 3 failing tests before correction, and optional-diagnostic replies had 2 failing tests before validator alignment. Official npm run build exited 0, Native freeze 31 files/78 sections and path policy 434 files/0 exceptions. No live drafts/sends, general-mode bypass, extra agent, dependencies, tunnel/auth changes, push or release application occurred.

Evidence: runtime/build/browser-reader-completion-20261018 (v022-extension-read-only.log, v022-contract-manifest.log, server-extension-read-only.log, official-build.log). Baseline backup: runtime/backups/browser-reader-completion-22efb869e82c4131a1fa66970da7bce1. Active plugin source was inspected through Plugin Creator as version 1.1.0; same-app update 1.1.1 is prepared for the additive reply metadata. Actual activation and ZIP hashes are recorded separately after packaging. Do not treat packaging or matching input descriptors as proof of runtime activation.

The steps below describe historical 0.2.1 work and its evidence; they are not a claim that the current live target is fixed.

## Current live correction — generic body matches (OPEN)

The user reports a complete, visible main frame and matching URL with zero candidate/role/turnRole/markdown matches, but 14 userBody matches. Exact source inspection confirms that userBody means `.whitespace-pre-wrap`, a generic formatting class, not a semantic role. One iframe and four sampled open shadow roots are clues only; neither their presence nor the SAVEAI-CHAT-EXPORT-BTN tag proves cause.

The existing local popup diagnostic now includes `diagnosticRevision: userbody-structure-v1` and `userBodyStructure`: at most 16 matching elements, 12 levels per ancestry path, 96 unique structural nodes and 16,000 serialized node characters, within its existing time budget. It records bounded tag/class/attribute metadata, shared-container links, form/editability flags and exclusion reasons. Raw IDs are replaced by report-local references; these are not message IDs or proof of stable identity. Message text, HTML, composer values, storage and sensitive attribute values are not collected. Frames and shadow interiors are not entered. Partial coverage remains explicit.

Only dom-diagnostic.js, the popup explanatory label, and tests/dom-diagnostic.test.js changed in this focused step. conversation.js, worker.js and manifest.json hashes remain the previously recorded values. No reader selector, pairing, remote tool, permission, receipt/send policy or product version changed. The source patch does not establish the actual structure of the 14 live matches; that still requires the local Inspect DOM click and its returned report.

Directed synthetic diagnostic verification: before the change, 3 failures / 1 pass; after, 8 passes / 0 failures, process exit 0. Evidence: runtime/build/browser-bridge-repair-20261018/userbody-structure-tests.log. This verifies diagnostic collection/limits/privacy and URL refusal, not live message compatibility. The prior diagnostic source is backed up in runtime/backups/browser-bridge-userbody-probe-20261018/dom-diagnostic.js. Existing backups and unrelated work remain intact.

## Observed symptoms and evidence limits

The user supplied repeated HTTP 400 pairing logs and a prior successful scoped connection whose first conversation read returned zero messages. The connected Agent Core inventory now exposes the semantic conversation actions. At initial inspection its prior conversation grant was closed, not a currently readable target.

The initial extension source was version 0.2.0. Its generic invalid-route error mentioned share links, the code input had maxlength=32 before trimming, and message selection depended on the layout box of the role wrapper. A wrapper with display:contents can have visible child text but no own layout box. The code also accepted a zero-match DOM as an empty successful snapshot.

During investigation, another writer changed conversation.js, worker.js, popup.js, popup.html and README.md. Those changes were detected by baseline hash comparisons and preserved as the new starting snapshot. This repair reused the added selectChatTurns helper and selected-tab preview; it did not reset the folder to the original ZIP. Final installation refused any additional drift and backed up the exact current bytes first.

The private target DOM was not inspected directly in this run. The defects below were reproduced against the actual source in synthetic fixtures, including a real isolated Chromium DOM. They establish concrete defects and corrections, not a claim that every possible live ChatGPT layout is supported.

## Installed corrections

1. **Message bodies, not wrapper boxes.** The shared selectChatTurns adapter accepts visible body text under boxless wrappers, a body selector on the role node itself, and explicit user/assistant turn roles. It excludes known hidden/tool/dialog/sidebar content and keeps the existing bounded body-only selection. No whole-page text scraping, private API, caller script or credential access was added.
2. **Stable identities.** Reads and send preflight use the same message/turn identity selection. Real data-message-id/data-turn-id is required; positional conversation-turn indexes are not substituted as stable message IDs. Missing/ambiguous IDs are reported explicitly.
3. **Unknown is not empty.** Initial status always has valid incomplete coverage and a DOM_NOT_READ error. DOM_NOT_READY/DOM_INCOMPLETE report bounded counts rather than private text. An incomplete attempt does not erase the previous good window, advance its revision or manufacture window exits. Draft/approval guards reject an unreadable current observation.
4. **Pairing and read readiness are separate.** A valid paired connection survives DOM-not-ready snapshots and can recover through its existing observation/read path, without generating another pairing code. Navigation during the first read is latched before results can be accepted. Refreshes share one per-grant in-flight observation; old/closed/navigation-invalid results cannot overwrite current state.
5. **Preview is binding.** The popup sends the exact previewed tab/window/URL; the worker validates that selection before consuming a pairing code. It does not silently select another window's tab. The loopback HTTP pairing envelope is unchanged.
6. **Clear input/errors.** Share-link wording is reserved for an actual share route. Pair-code errors and wrong-tab errors remain separate. The input allows surrounding-whitespace paste without truncating the 32 hexadecimal characters; trimming/lowercasing occurs before validation. URLs are never accepted as pairing codes. Status requests no longer carry the code/draft text.
7. **Popup state.** The popup shows the observed-message count and read error. Unsaved edits survive status refresh, and restoring original text does not re-enable approval while the conversation is busy, paused, stale or unreadable.

Existing once-only local approval, exact URL/revision, composer preservation, timeout/unknown no-retry, scoped generic-command refusal and detach behavior remain. No new remote method, public MCP schema, permission, host permission, service-worker owner, tunnel, authentication or model was introduced.

## Files

Installed in the extension folder:
- conversation.js
- worker.js
- popup.js
- popup.html
- manifest.json and package.json: 0.2.0 → **0.2.1**
- tests/pairing-repair.test.js and tests/popup.test.js

Core verification-only support:
- tests/browser-conversation-fixture.ts: optional fixed-helper import and accurate mixed-role selector fixture; still supports original 0.2.0.
- tests/browser-bridge-dom-cases.js: synthetic real-DOM regression cases.
- scripts/verify/browser-bridge-dom.mjs: generates a self-contained isolated HTML fixture; generation itself is not a test pass.

Core runtime source and public schema are unchanged. No Core build/restart, plugin upload, dependency installation, delegation, release, commit or push was performed for this repair.

## Verification

| Check | Observed result |
| --- | --- |
| Extension state/worker/popup tests, actual installed folder | **32 passed, 0 failed**, process exit 0 |
| Actual MCP + existing HTTP bridge + installed worker/page-function fixture | **16 passed** |
| Existing bridge compatibility/boundaries | **14 passed** |
| MCP manifest contract | **5 passed** |
| Combined Core selection against installed extension | **35 passed, 0 failed**, process exit 0 |
| Real isolated Chromium synthetic DOM | Before: **8 passed / 13 failed**. Corrected: **21 passed / 0 failed** |
| Function-source equivalence | All six exported functions/classes in the PC candidate match the Chromium-tested function-source SHA-256 values after LF normalization |
| Installation readback | **8/8 installed files match**; permissions/host permissions/background/key unchanged |
| Real selected ChatGPT tab | **Not yet verified after reload** |

The earlier Windows isolated-browser bootstrap exited before reader assertions (BROWSER_CONTROL_BROWSER_EXITED_0). Those attempts are not reader-test passes or evidence of a live-page failure. Real DOM qualification instead used isolated Linux Chromium through Playwright with synthetic content and no account; final worker/server tests ran on the user's Windows PC. The synthetic fixture never sends a message to a real chat.

Primary evidence: `runtime/build/browser-bridge-repair-20261018/installation.json`, `installed-extension-tests.log`, `installed-core-integration.log`, and `dom-verification.json`. Original and pre-install backups remain under `runtime/backups/browser-bridge-pairing-dom-20261018`; final pre-install snapshot is `preinstall-CSYVfy`. The qualified candidate remains in the build directory as a reproducible artifact.

Installed conversation.js SHA-256: `9877665f7d0260c7cfec17d1e17c652822718e67002de2eb6905ac9cfc01ea11`.
Installed worker.js SHA-256: `811d26f32545267872f562c014560fa294cdcae18418f719b678f10dcff3ac69`.

## Activation

Reload the existing unpacked extension that points to `E:\Projects\agent-core-browser-bridge` in the browser's extensions manager. Confirm version **0.2.1**. This patch does not require another Core restart or a new ChatGPT plugin ZIP because no public server schema changed.

After reload, the user selects the intended conversation tab and checks its URL in the popup. A fresh one-use code is needed for a new binding when the previous grant is closed/consumed. Then verify conversation_read returns message bodies or a specific bounded DOM diagnostic. Do not repeatedly re-pair to remedy a DOM_NOT_READY/DOM_INCOMPLETE result on a still-valid connection. Any real send still requires local popup review and approval.

No real-chat send was performed, no repeating monitor was created, and extension polling is not represented as model wakeup.

## 0.2.2 package and activation handoff

Full extension ZIP: `runtime/build/browser-reader-completion-20261018/Agent-Core-Browser-Bridge-v0.2.2-Source.zip` — 37,055 bytes; SHA-256 `63fa2502fafde644f82cb2a1df608144dffd4241e22c1cf9f4d461235617028f`. Contains 18 allowlisted source/doc/test files under agent-core-browser-bridge/. Source hashes were checked for drift during packaging.

Same-app custom-plugin ZIP: `runtime/build/browser-reader-completion-20261018/Agent-Core-ChatGPT-Plugin-v1.1.1.zip` — 541 bytes; SHA-256 `1c7adff37bb26e81c715574576ef8ebaad64432b5cc0ccc4a3ac155c07c6c631`. Live plugin source was read as 1.1.0; app identity and presentation are preserved. The archive contains only .app.json and .codex-plugin/plugin.json, not an extension or separate MCP schema. No plugin upload was performed. Names/actions/input schema are unchanged; optional read/status reply diagnostics are the additive contract change.

Packaging receipt: runtime/build/browser-reader-completion-20261018/packaging.json describes the state at packaging time. Subsequently, one official restart_agent_core(capabilitiesChanged=false) was requested for the authorized activation; tool names/actions/input descriptors are unchanged, so no discovery refresh was required. Restart receipt runtime/restart/53ffba47929643b9ae903de45c9f9446.json records exit 0. The new tool-host/bridge process is PID15484, started 2026-10-17T22:11:01Z, running E:\Projects\Agent-Core\dist\index.js after the official build. A fresh contract handshake succeeded and browser_control.status returned sessions=[]. The launcher receipt by itself was not used as health proof. Separate /health probes on 8787 and 8765 returned 404 and timeout respectively; no HTTP-health PASS is claimed. The actual MCP calls are responding. No second restart was attempted.

Extension reload and new pairing remain manual and unperformed. Plugin ZIP1.1.1 is prepared but not uploaded; it versions the additive reply contract, without adding a tool/input schema or a new client-discovery prerequisite. The pre-restart replacement pairing request expired without attachment and its last native status was closed/current=false/revision=0/error=BROWSER_CONTROL_SESSION_CLOSED; old codes must not be reused. After the user reloads the same extension to 0.2.2, use one fresh target pairing before reading its structural diagnostics.

After activation, obtain one fresh selected-tab pairing and call the existing semantic read/status. The controller, not the user, consumes the bounded diagnostics and determines real message body/role/ID structure before any selector adaptation. No drafts or sends are authorized for this acceptance. The remaining unknown is the real structure and correct extraction of the target messages, not pairing availability alone. The temporary popup screenshot created for this task was removed; source backups and all unrelated work remain.

## 0.2.3 packaged handoff

Full extension archive: `runtime/build/browser-markers-20261018/Agent-Core-Browser-Bridge-v0.2.3-Source.zip`; 41,755 bytes, 20 allowlisted source/documentation/synthetic-test entries. SHA-256: `ef2d5b8cbf1404de0c8a28d7ca2fc18684cc7bb5e0e2313bac232276f8ee7a3c`. Every entry was compared against the source hash, and the source matched the actually registered loaded copy. `packaging.json` records the checked state. No custom-plugin update is required for this unchanged wire/tool schema.

The observed manager version is 0.2.3. Actual post-update conversation extraction remains unverified while the target has no attached grant. No old pairing code is reusable. Bind only the already authorized target, then verify read/status and compare actual visible user/assistant messages without drafting or sending.
