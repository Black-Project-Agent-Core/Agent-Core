# Launcher migration

> Koreksi pengguna 2026-10-29: hasil ini tidak diterima sebagai arah visual baru. Bukti teknis historis tetap dipertahankan. Target prototype-first dan verifikasi lanjut ada di ../verification/Launcher-Prototype-Parity.md.

Date: 2026-10-29. Status: COMPLETE. Existing capabilities migrated; unsupported prototype functions reported. Final source/build, resident navigation and diagnostic cleanup evidence are linked in [verification](../verification/Launcher-Migration.md).

The user requests migration using `E:\Projects\Launcher`, preserves icons in `E:\Projects\Agent-Core\assets`, and clarifies: migrate existing capabilities first, then report prototype functions that remain placeholders or lack codebase/UI support. No new backend feature, grant, secret editor, dependency or public release is implied.

## Source and scope

The direct source is the local user-supplied React/Vite AI Studio export, not a verified public third-party upstream. README links an AI Studio app; metadata is generic. No claim of public publisher ownership or license verification is made. Only source files under `src` and declared package/config files are inspected; browser profiles, caches, environment files and bundled ZIPs are excluded. Existing icon assets remain authoritative. This is authorized source-derived UI adaptation, not a clean-room clone.

Replica recon is adapted here: inventory the prototype screens/flows and map them to actual Agent Core owners. Prototype layout: slate/cyan44px top bar, grouped224px collapsible navigation, central workspace, workspace-only288px inspector, compact cards and controls. Target keeps native Windows chrome and fills the real client area; no nested simulated desktop window.

## Feature/flow map

| Prototype area | Migration consumer / existing owner | Guardrail |
| --- | --- | --- |
| Workspace/chat | Existing App host state and ChatPage | Preserve provider/model/effort, history, drafts, resume/cancel/archive and inquiry evidence; no timer-generated response. |
| Dashboard/runtime/diagnostics/settings/activity | Existing pages, DesktopSnapshot and onAction | Real health/process state only; preserve actions and unknown/failed states. |
| Tools Hub | Existing SystemsPage and systems projection | Do not turn subsystem counts into tool/grant counts; no simulated MCP registration. |
| Models | Existing chat provider/model descriptors and callbacks | Selection affects actual next turn; no localStorage credentials or invented context capacity. |
| Memory | Existing canonical health and selected conversation memory-use records | Label the scope; no fabricated canonical note list or silent edits. |
| Goals/plans | Existing selected conversation turns and decision evidence | Read-only task/decision view; standalone goal CRUD/milestones are report items. |
| Artifacts | Existing task-changes panel and checkpoint attribution | Keep task binding, redaction and external-change attribution. |
| Learning/Dreaming | Existing Learning health/sinks/pending-finalization projection | Read-only overview; no fake dreaming job or proposal promotion. |
| Workflows | Existing WorkflowsPage | Preserve this functional page although absent from prototype navigation. |

Main owns all edits. Native partner owns a bounded read-only host-compatibility review in conversation `3646f490-d273-4f3a-8b8e-72d75ef11e9d`; no shared controller receipt/task head. Baseline checkpoint: `8cf7bc5f-0b51-4bfb-99a5-ed2470b7b88d`.

## Implementation and verification

1. Keep the native host protocol and current App event reducer; migrate presentation and URL routing incrementally.
2. Use existing `src/ui/src` files/components, installed React/lucide/CSS and the current icon. Add only task-owned files in that existing home.
3. Add real-data read views for prototype navigation; expose no mock mutation controls.
4. Verify characterization tests for chat/recovery/changes/workflows plus meaningful new navigation/model/scope tests. Build/typecheck UI; verify icon hashes.
5. Inspect rendered reference/result and responsive states; use available browser/desktop surfaces truthfully. Activate through the official restart only after readiness checks, preserve rollback and verify resident health/UI.
6. Deliver `docs/verification/Launcher-Migration.md` including the placeholder/owner matrix, actual test results, changed files, activation and limitations. Finalize canonical Memory/Learning; no new proposal is required for this authorized migration.

## 2026-10-29 continuation and goal-composer specification

The user explicitly added manual Continue after restart, session switching during execution, a goal-mode composer bar matching the supplied screenshots, a contained focus border, and a scoped commit. Existing standing Agent Core authorization covers implementation; no separate approval gate or duplicate specification hierarchy is introduced.

| Capability | Existing owner | Depends on |
| --- | --- | --- |
| manual-continuation | AgentChatService/Store checkpoints and authenticated resume endpoint | Existing Native task execution |
| session-navigation | App host reducer and ChatPage drafts | Conversation/request identity |
| goal-composer | Existing chat turn, goal-mode metadata and pause/resume owner | manual-continuation, session-navigation |
| composer-focus | launcher.css | Existing composer container |

Build order: continuation → session routing → goal-mode metadata/control → focus styling → one final focused verification, activation and scoped commit.

### Objective and acceptance

1. Restart parks checkpointed running/provider-wait turns. No recovered turn calls a provider until the user selects Continue. Resume preserves task/turn identity, budgets and side-effect reconciliation. Stop remains terminal.
2. A running session does not disable opening another chat. Background progress/results/errors cannot select or overwrite another chat; unsent drafts stay with their conversation. A pending conversation creation cannot send its draft into a delayed foreign response.
3. Goals is a single composer toggle. Sending while active creates exactly the existing Native task, marked as goal mode in the existing chat store. The goal bar shows the actual prompt and state, survives reopen, and provides Pause, Continue and Stop against that same turn. No second scheduler, mock goal, duplicate prompt or separate Memory store is created.
4. Pause stops at a durably saved checkpoint, allowing the current operation to finish safely. The bar distinguishes Pausing from Paused. Continue is explicit; neither manual pause nor restart schedules an automatic retry. Existing finalization and attempt limits remain in force.
5. The focus indicator belongs to the outer rounded composer. The textarea does not draw an overlapping cyan outline over the toolbar; keyboard focus remains visible on other controls.
6. Activate all changed Core/native/UI artifacts together, preserve rollback and prior user data, then commit task-owned changes without staging unrelated work.

### Commands, structure and verification

Use existing TypeScript/React/C# style and source owners under `src/agent-chat-*`, `src/http`, `src/launcher`, and `src/ui/src`; fixtures remain in their current test files. Builds: `node node_modules/typescript/bin/tsc -p tsconfig.json --outDir runtime/build/manual-continuation-20261029`; UI `tsc --noEmit` and production Vite build; native publish with existing installed 8.0.29 packs and explicit matching single-file host, without restore/download. Example state guard: `if (turn.status !== 'resumable') throw new Error('AGENT_CHAT_TURN_NOT_RESUMABLE');`.

The latest user cap is two verification attempts. Attempt 1 stopped in runner configuration before tests ran; the worker mismatch was corrected without rerunning it. Reserve attempt 2 for `node node_modules/vitest/vitest.mjs run --config runtime/launcher/continuation-once.config.mjs -t 'manual continuation'`, covering checkpoint/manual resume, per-session routing/drafts, and goal-mode controls. No benchmark, unrelated task, provider-costing demonstration, new dependency or automatic continuation is authorized. Compilation/activation records must state actual results separately from test acceptance.

Outcome: attempt 2 passed the Native fixture, but the combined runner could not resolve UI-local `jsdom`; UI assertions did not execute. The later stale-read race fixture remains unexecuted. No third attempt was made. Core/native/UI builds and the one-launch cutover completed; resident UI Automation observed the Goals control and one model selector, while health reports no running turns. See [the exact receipt](../verification/Launcher-Continuation-Activation.json). This records partial test coverage rather than declaring every acceptance criterion experimentally proven.
