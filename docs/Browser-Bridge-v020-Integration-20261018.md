# Browser Bridge v0.2.0 — integration and activation record

Date: 2026-10-18 WIB (2026-10-17 UTC). Target: E:\Projects\Agent-Core.

## Outcome

SOURCE INTEGRATION, OFFICIAL BUILD, ISOLATED TESTS AND PLUGIN PACKAGE COMPLETE. RESIDENT ACTIVATION, CHATGPT UPDATE AND REAL TEST-CHAT APPROVAL PENDING.

The existing external browser_control capability now reaches the exact Browser Bridge 0.2.0 semantic commands through the existing browser service, grant queue and HTTP owner. There is no new production server, browser engine, parallel adapter, SubProject, model, daemon or recurring monitor.

## Exact donor and contract

Source archive supplied by the user: E:\Projects\Agent-Core-Browser-Bridge-v0.2.0-Source.zip.
Size: 20928 bytes. SHA-256: 341e323661d82e991616fe1551ed6c132774669967c77c2983aaa00f6818a590.

INTEGRATION.md, DELIVERY.md, worker.js, conversation.js, protocol.js, popup behavior and all donor tests were inspected from that archive. The verifier pins its hash and extracts only required members into a disposable fixture directory. The repository's old extension copy was not substituted for the donor or claimed to be the currently installed extension.

| External browser_control action | Existing server path | Exact extension method |
| --- | --- | --- |
| conversation_read | BrowserControlService.conversation → ExtensionBrowserClient.conversation → existing queue | AgentCore.conversationRead |
| conversation_draft | Same owner and queue, with read/URL/revision guards | AgentCore.conversationDraft |
| conversation_status | Same owner, current extension status or explicitly stale closed metadata | AgentCore.conversationStatus |
| close | BrowserControlService.close → ExtensionBrowserClient.detach | AgentCore.detach |

The call path is AI → existing Agent Core ChatGPT plugin/authenticated MCP → src/mcp/server.ts external browser_control registration → existing browser handler/service → loopback browser bridge → extension poll dispatcher → scoped Conversation/page functions. Popup review/edit/approve remains local to the user.

## Behavior and limits

- Explicit extension open with mode=conversation binds the user-selected tab and canonical ChatGPT conversation URL. Pairing still uses the original code/tabId/url envelope and fresh session/token result. Pairing does not advertise mode/version; modeConfirmed requires a valid semantic response.
- Reconnecting the same extension/tab revokes old pending work and tokens. The exact donor also discards late old poll responses and blocks unfinished/unconfirmed detach before reconnect.
- One cursor and bounded observation window belong to each grant. Reads expose initial/delta/reset, coverage, message/window truncation, busy, paused and errors. windowExits never means proven deletion; completeHistory stays false.
- Drafts require exact URL/revision from a read. Popup edits create a new ID; approval is consumed once and cannot be transferred to edited text or another session.
- Navigation latches the scope paused until a fresh pairing. Generic Runtime/Input/observe/act access and remote approve are refused for that grant. No generic-command fallback is implemented.
- Donor draft states are review, sending, submitted, confirmed and unknown. Command refusal is tracked separately as failed; unknown or timeout never triggers a retry.
- A confirmed receipt requires the extension's observation of a new nontruncated user message with the approved text. Queue acceptance, staging and insertion are not delivery confirmation.
- The donor can close scoped grants before its detach command reply is sent. Agent Core truthfully reports grant closure with detach=uncertain rather than inventing a debugger acknowledgement.
- Conversation payloads do not enter normal tool history/failure-learning contents or result-spill artifacts. A scoped poll permits at most 1 MiB to accommodate JSON escaping of the bounded 48k-character window; ordinary browser/pair/disconnect retain 256 KiB.

[Browser-Control.md](Browser-Control.md) is the operational guide and contains exact calling examples, result interpretation and activation order.

## Files changed by this task

Paths below are relative to E:\Projects\Agent-Core.

| Area | Files |
| --- | --- |
| Existing browser capability | src/rdc/browser-control/extension-bridge.ts; src/rdc/browser-control/service.ts; src/rdc/handlers/browser-control-handlers.ts |
| Shared semantic contract | src/rdc/browser-control/conversation-contract.ts (new) |
| Existing HTTP boundary | src/http/browser-bridge.ts |
| External MCP registration/schema/guidance | src/mcp/server.ts; src/mcp/rdc-schemas.ts; src/mcp/rdc-tool-metadata.ts |
| Privacy and bounded delivery | src/mcp/result-budget.ts; src/rdc/utils/toolHistory.ts |
| Reproducible verification | scripts/verify/browser-bridge-v020.mjs (new); tests/browser-conversation-fixture.ts (new); tests/browser-conversation-integration.test.ts (new); tests/mcp-manifest-contract.test.ts |
| Documentation and release intent | docs/CODEBASE.md; docs/Browser-Control.md; docs/Browser-Bridge-v020-Integration-20261018.md; docs/memory/project-continuity.md; .changeset/20261018-browser-bridge-conversation.md |
| Generated contract | docs/memory/Browser-Bridge-v020-MCP-Manifest-20261018.json |
| Generated runtime/package artifacts | Official dist build; runtime/build/browser-bridge-v020 logs, verification, plugin-source manifests, plugin ZIP and validation |

The working tree already contained other sessions' edits at baseline commit e69bcf5d3bd4c597a9e8a0c2735c044324b5c120. Surgical changes preserve that work; the official build compiles the current working tree. Baseline File Checkpoint: 0fad7fab-775a-4989-8935-263c65e62ee4. No reset, whole-tree replacement, commit, push, release apply, dependency installation, Native development or additional agent invocation was performed.

## Verification results

| Verification | Result | Evidence |
| --- | --- | --- |
| Exact donor Node tests | 20/20 pass | runtime/build/browser-bridge-v020/donor-tests.log |
| MCP + actual HTTP bridge + exact worker/page functions, synthetic DOM and popup | 16/16 pass | tests/browser-conversation-integration.test.ts; server-extension-tests.log |
| Existing bridge compatibility/boundaries | 14/14 pass | tests/browser-extension-bridge.test.ts |
| Existing worker/protocol compatibility | 3/3 and 2/2 pass | tests/browser-extension-worker.test.ts; tests/browser-extension-protocol.test.ts |
| Public manifest including Native descriptor/schema preservation | 5/5 pass | tests/mcp-manifest-contract.test.ts |
| Combined targeted Agent Core tests | 40/40 pass, five files | runtime/build/browser-bridge-v020/server-extension-tests.log |
| Official npm run build | Exit 0 | runtime/build/browser-bridge-v020/build.log |
| Native freeze and path policy | 31 files / 78 shared sections; 433 authored files, zero exceptions | Official build log |
| Compiled optional MCP manifest | 82 tools, 131010 bytes; below 131072-byte budget | docs/memory/Browser-Bridge-v020-MCP-Manifest-20261018.json |
| Real browser pairing and real send | NOT PERFORMED | Await selected test chat and popup approval |

The 16 integration checks cover initial/unchanged/delta/reset/per-grant cursors, bounded escaped payloads, wrong URL, stale revision, navigation latch, remote approval/generic refusals, mode mismatch, nonempty/whitespace composer, edited review identity, sending/submitted/confirmed status, busy/expiry/attachments, unknown delivery without resend, delivered timeout without replay, reconnect with pending old commands, old token rejection and uncertain scoped detach.

The final verifier receipt is dated 2026-10-17T19:14:16.843Z and marks fixtureOnly=true, realBrowserSendTested=false. Earlier failures were repaired: MCP contractSession composition, manifest size, and JSON-expanded DOM payload handling. The final fixture/build evidence is separate from live activation.

Compiled manifest SHA-256: c558362e97ab31e5b0d5ce41762250e4e6ca1fa1d02593af80d065796e88d8b1.
Product version remains 0.15.0-beta.3; the minor release intent is pending, not applied.

## ChatGPT plugin update ZIP

Current selected plugin source was retrieved through Plugin Creator for plugin_asdk_app_6ad1239cdf308191a3ccb8ba0cd49503, current release PluginRelease_24acf0e1d2848191a7ac19c812855776, USER/private, version 1.0.0.

Prepared package: E:\Projects\Agent-Core\runtime\build\browser-bridge-v020\Agent-Core-ChatGPT-Plugin-v1.1.0.zip.
Version: 1.1.0. Size: 541 bytes.
SHA-256: bbdede5c8211907ff2f92c2a755acc461bd84b9e50729916fdb79e4781a54dd9.

The ZIP contains exactly .app.json and .codex-plugin/plugin.json at the package root with normalized ZIP paths. .app.json remains byte-for-byte identical and references asdk_app_6ad1239cdf308191a3ccb8ba0cd49503. The package name remains dev-6ad1239cdf308191a3ccb8ba0cd49503. The version advances 1.0.0 → 1.1.0; unused defaultPrompt=null is omitted following the existing project package convention. Existing app identity, presentation, audience, endpoint and authentication remain unchanged.

Packaging uses the project's existing two-manifest .NET ZIP workflow with explicit forward-slash entry names; the temporary invalid-layout candidate was removed. No runtime, source archive, credentials, memory, conversation data or logs are included. This is a ChatGPT plugin update, not the browser-extension ZIP. The compiled tool schema is produced from the same source registration and retained separately; this app-backed package has no independent static MCP schema copy.

Public tool name changes: none. External browser_control adds three action values; mode, sinceRevision and revision fields; conversation text limit 6000 with legacy 2000 retained; and scoped read/review/receipt instructions. The Native schema/descriptor are preserved. Other pre-existing working-tree edits are not attributed to this integration.

ZIP validation: runtime/build/browser-bridge-v020/plugin-validation.json. Uploaded=false; runtimeRestarted=false.

## Actual activation and remaining user steps

The latest connected browser_control.status returned sessions=[], so no user tab is paired through the resident. The connected tool inventory still exposes only open/observe/act/close/status; the three new actions are not yet exposed in this ChatGPT session.

A final local netstat read confirmed 127.0.0.1:8765 (PID 12204) and 127.0.0.1:8787 (PID 14660), consistent with the task's initial listener/configuration inspection. Pairing/polling stays on 8765. This does not prove the rebuilt semantic implementation is loaded; no restart or plugin update was performed. A subsequent direct loopback /health read returned HTTP 200, status=ok, version=0.15.0-beta.3; this is resident health evidence, not semantic feature activation.

1. User authorizes one restart of the verified candidate that changes public schema. The standing schema-unchanged restart permission is not used, per task requirement 9.
2. Use the existing restart owner with capabilitiesChanged=true; verify its receipt/health and re-acknowledge the controller contract.
3. User selects the same Agent Core plugin and uses Update plugin / Upload new version with the v1.1.0 ZIP. If client discovery remains cached, use Refresh tools on that existing app.
4. Verify the tools actually visible to the controlling AI include conversation_read, conversation_draft and conversation_status on browser_control.
5. User chooses an actual test conversation, then selects that tab and conversation mode and pairs using a fresh one-use code. Read → stage → local review/edit/approve → status receipt → detach can then be checked in the real browser.

No plugin removal/re-registration, tunnel replacement or API-key change is needed if the update succeeds. A stale descriptor does not justify another restart or reconnect attempt without inspecting the previous result.

## Proactive behavior boundary and cleanup

The exact worker's sampler/poll loop only updates RAM and answers requested commands. Existing external Learning/skill/capability notices are response capsules during an active tool call; src/learning/skill-proposal-notification.ts and src/mcp/external-controller-tool-support.ts do not schedule ChatGPT turns. src/agent-provider-scheduler.ts chooses Native provider credentials, not external-model wakeups. No authorized browser-to-external-ChatGPT wake mechanism was found in the inspected owners. Proactive scheduling remains a separate scoped stage.

Fixture extraction is removed by the verifier's finally block. The invalid ZIP candidate was removed after successful corrected packaging. Final evidence, plugin-source manifests, ZIP and baseline checkpoints are retained. No tokens or private conversation content are recorded here.

## Continuity finalization

Canonical Memory: 98e3cc00-cd27-4708-bc9f-689e90e4332b. Learning checkpoint 415, key browser-bridge-v020-source-fixture-package-20261018, task ext-55bd7560a47445ea886387d35f37f3b8; task-scoped review complete=true with disposition awaiting-verification. This keeps live activation/real-browser acceptance explicitly pending and leaves other sessions' pending reviews untouched. Final source/test hashes are in runtime/build/browser-bridge-v020/source-hashes.json. The final whitespace-only cleanup was followed by another successful official build and scoped git diff --check; functional source/tests are unchanged from the 40/40 fixture run.
