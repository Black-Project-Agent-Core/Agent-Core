# Activity Log Request/Response — Implementation Evidence (2026-10-21)

Status: SOURCE IMPLEMENTED / TARGETED VERIFIED / NOT LIVE-ACTIVATED.
Scope: External MCP controller tool invocations, existing tracker/journal and existing Activity Log inspector.

## Source-grounded gap
- `src/tracker/tool-invocation.ts`: stable invocation IDs and start/terminal status were already recorded.
- `src/mcp/external-controller-tool-support.ts`: wrapper sees actual request and returned tool result, but previously retained metadata only.
- `src/tracker/activity-tracker.ts`: existing bounded journal under `runtime/tracker` provides persistence and redaction.
- `src/launcher/ActivityJournal.cs`: old reader discarded event kind/context; `src/ui/src/host.ts` had five-field event type.
- `src/ui/src/pages.tsx`: existing inspector rendered only metadata and JSON rather than actionable Request/Response.

## Implemented path (candidate only)
External MCP registerTool wrapper → stable invocation event + sanitized bounded phase chunks → existing activity.jsonl
→ ActivityJournal correlated lifecycle and read-on-select → trusted MainForm WebView bridge
→ ToolExecutionDetail inside existing Activity Log LogInspector.

- One invocation ID identifies one card; concurrent same-named calls remain distinct.
- Tool-call `success` is not process completion. Missing terminal is `running`, interrupted without proof is `unknown`.
- Request and Response use plain-text DOM rendering, word-wrap, bounded scroll, safe copy, JSON property tint and proposed-only diff for edit_block.
- Supported tools: start_process command/shell/working directory if supplied, captured result and PID if provider returns them;
  interact_with_process input and result, read_process_output offset/length and result;
  write_file path/mode/content as proposal, edit_block requested before/after proposal and actual result, generic fallback for other external tools.
- No new engine, DB, replay, HTML execution, live process inspection, or automatic model-context injection.
- Process output is stored per **tool invocation**; no cross-invocation PID grouping without verified process identity.

## Privacy / bounds
- New payload values are sanitized before tracker storage and UI transport; fake credentials are tested.
- Original evidence capture policy is observed. Browser conversation/image/artifact and credential paths are omitted.
- Each Request is capped at 12,000 characters; Response at 24,000; journal chunks 1,400; UI pages 4,096.
- Poll list scans at most the latest 16 MiB of the existing journal and displays at most 200 cards.
- Existing journal retention / cutoff unchanged. `truncated`, `redacted`, `omitted`, `expired`, `unavailable` distinguished.
- Historical records have no manufactured payload; show `Detail not recorded in this version`.

## Verification actually executed
- `npm run native:check`: PASS, 31 frozen files / 78 protected shared sections.
- Root TypeScript `tsc -p tsconfig.json --noEmit`: PASS (after two patch-local compiler corrections).
- UI `npm run typecheck`: PASS.
- `dotnet build src/launcher/AgentCore.Launcher.csproj --no-restore`: PASS, 0 errors.
- `tests/activity-tool-detail.test.ts`: 3/3 PASS, fixture redaction, truncation, same tool concurrency.
- `ToolExecutionDetail.test.tsx`: 3/3 PASS, safe text/copy, partial loads, legacy, no tool replay.
- `ActivityLogScreenshot.test.tsx`: 1/1 PASS, actual React markup rendered with benign fixture.
- Independent .NET ActivityJournal fixture in `tests/activity-visual-capture`: PASS, two same-named calls, pending, terminal duration and redacted read.
- xUnit launcher suite `src/launcher.tests/ActivityExecutionJournalTests.cs` added but not executed:
  local `xunit.analyzers 1.16.0` unavailable (NETSDK1064). No dependency downloaded.
- Screenshot (fixture, not live): `runtime/tmp/activity-log-request-response-fixture-v2.png` (1440 × 900).

## Open gates
- Source candidate is not installed into resident Node Core or Agent Core.exe. No restart/deploy/release performed.
- No live end-to-end process streaming/restart/reuse test; cancelled/timeout branches need explicit host evidence.
- Historical before/after diff is unavailable if not present in the tool response; do not reconstruct from later file state.
- Distinct child-process identity beyond PID is not represented in this card yet; no unsafe implicit merges.
- Project has unrelated pre-existing dirty/untracked files; this task did not reset/stage/change them.

## Pre-cutover refinement — 2026-10-21 (new evidence)

Status: **CANDIDATE REFINED / STAGING BUILD VERIFIED / LIVE CUTOVER NOT AUTHORIZED**.
Authority: exact current source and observed isolated tests; older historical records are not substituted for live evidence.

### Source refinement
- `src/ui/src/ToolExecutionDetail.tsx`: existing inspector presents two separate status cards, tool-call and child-process; explicit unverified process identity; bounded stored-page loading, copy of loaded sanitized text, optional Raw sanitized JSON and capture budget labels.
- `src/ui/src/ToolReadableCode.tsx` (new): safe React text-only highlighted code for PowerShell, Bash, JS, TS, Python, JSON, proposed diffs; unknown cmd/other shells remain plain text. No new dependency, execution, HTML injection or replay.
- `src/ui/src/pages.tsx`: resizable inspector width slider (320–760 CSS pixels), Expand/Restore mode, session snapshot wording instead of false real-time claim.
- `src/ui/src/index.css`: responsive inspector columns, bounded scroll, code wrapping, syntax token colors and diff colors. No Native frozen section modified.
- `src/ui/src/ToolExecutionDetail.test.tsx` updated to reflect honest status/omission labels.
- `src/ui/src/ToolExecutionEnhancement.test.tsx` (new): 7 functional assertions for size/expand, multiline syntax, long write, proposed edit on failure, truncated pagination/copy, >capture request and PID reuse uncertainty.
- `src/ui/src/ActivityLogVisualVariants.test.tsx` (new): 4 source-component visual fixtures, one each for multiline, edit_block, long write_file and over-budget read_process_output.

### Visual evidence (benign fixtures, not live)
- `runtime/tmp/activity-log-multiline-fixture.png` — expanded Request/Response with PowerShell syntax.
- `runtime/tmp/activity-log-diff-fixture.png` — proposed-only edit diff and failed tool response.
- `runtime/tmp/activity-log-longWrite-fixture.png` — scrollable 7.9k-character proposed TypeScript content.
- `runtime/tmp/activity-log-oversized-fixture.png` — truncated-response banner; no promise to retrieve omitted original bytes.
- Four captures rendered with the existing local WebView2 fixture harness at 1440×900; visually inspected. No running Agent Core UI was opened or manipulated.

### Verification observed
- Native freeze: PASS, 31 files + 78 frozen shared sections. Path policy: PASS, 456 scanned files, 0 exceptions.
- `src/ui` typecheck: PASS. UI targeted tests: **15/15 PASS** across four test files.
- Backend TypeScript compile (noEmit) and `tests/activity-tool-detail.test.ts`: PASS, **3/3 tests**.
- Launcher .NET ordinary build: PASS, 0 errors; standalone journal .NET integration fixture: `ACTIVITY_JOURNAL_INTEGRATION_PASS`.
- Isolated Vite production build: PASS, 1683 modules transformed; output `runtime/build/activity-log-inspector-20261021/ui/`.
- Isolated backend TypeScript staging build: PASS; output `runtime/build/activity-log-inspector-20261021/dist/`.
- UI source fixture and static screenshots are mock/isolated visual verification; **not** installed-app acceptance, realtime streaming, or live process evidence.
- The xUnit test project remains BLOCKED by missing project-local NuGet package `xunit.analyzers` 1.16.0. No restore/install performed.

### Storage limits and guaranteed behavior
- Existing Node journal `runtime/tracker/activity.jsonl`: bounded at 128 MiB / 200,000 records; existing retention/cutoff unchanged.
- Each sanitized Request stores at most 12,000 JavaScript characters; each sanitized Response at most 24,000. 1,400-char journal segments and 4,096-char UI pages.
- Desktop Activity list reads at most a 16 MiB journal tail / returns last 200 cards; details are requested by invocation ID on selection.
- Truncated, redacted, omitted, expired/incomplete and unavailable are separate labels. Load-more operates **only on stored segments** and disappears at saved end-of-content; copy uses loaded sanitized text only.
- Original responses may already have provider/result-budget omissions. Even a `complete` stored detail is not proof of complete underlying process output.
- `start_process` MCP success does not imply child exit; `read_process_output` is a saved snapshot, not a continuous stream.

### Process association: EXPLICITLY DEFERRED
- `src/rdc/process-ledger.ts` records a random ledger ID plus process image and creation timestamp and validates live identity, but that verified identifier is not passed through the external tool-invocation Event → ActivityJournal → UI contract.
- PID alone is insufficient due to reuse. UI presents `CHILD PROCESS: Unverified` and `Process association: not established across calls` for process tools. No grouping of interact/read_output with start_process by PID or time.
- A follow-up implementation would require validated ledger identity to be carried in sanitized event context and lifecycle semantics, with PID-reuse regression fixtures; no such link is claimed or installed by this candidate.

### Cutover preflight, impact and rollback (NOT EXECUTED)
- Reconfirm primary launcher ownership and active process identity first. At audit time three `E:\Projects\Agent-Core\Agent Core.exe` processes were observed (PIDs 9452, 11804, 12704); one is a child of another. Do not kill all processes named `Agent Core`.
- Current active `Agent Core.exe` SHA-256: `45FC4BCB64EC3700A65410AB8CC18522F542340BAEABB7742992C21BC2221F8E`.
- Current `dist/index.js`: `5EE512CAE563AD424A6549CD12B0EA3D1A8568BFF6B0C4312790676B1028681C`; current `dist/ui/index.html`: `AB9540AA76D5D1379A17DFB54BC1C2E3A11293A68D2D2F97ADB48770764D2FAC`.
- Candidate UI hash: `index-Blrae2W8.js` = `C9BD23EC57F9A5AA9117C13CAD03E651DEDA7CA10EF561A9C8762F328B95B278`; CSS `index-DlNDux49.css` = `618844E6DEBFF935B1757596801EA13B8A6E5B9D81C5BB50D65AD8CBCAD25EC1`.
- Candidate new Node module: `runtime/build/activity-log-inspector-20261021/dist/tracker/tool-detail.js` hash `EE52CB985B4014C67FC4734B027EA54C29D9629E1334F6C3043D6426E2C954DA`; no matching active `dist/tracker/tool-detail.js` exists.
- Proposed target replacements only after scoped permission: root `Agent Core.exe` (updated ActivityJournal/bridge compiled launcher), `dist/ui/index.html` and its referenced hashed JS/CSS assets, `dist/mcp/external-controller-tool-support.js` + sourcemap, `dist/tracker/tool-detail.js` + sourcemap, and verified dependency closure as necessary. Do not replace the complete Node `dist` tree merely because candidate build contains it.
- Before action: compute fresh active + candidate hashes, validate frozen sections and Native ownership, create scoped byte backups and a per-file expected-active CAS manifest; verify no concurrent edits and exact launcher/Node owners.
- Expected runtime impact when **later approved**: closing/replacing primary launcher and restarting owned Node Core can interrupt current MCP connections/in-flight tool calls, reset session-visible Activity Log and require connector reconnect. Existing Activity JSONL and retention must not be deleted.
- Acceptance after future restart: owned process identity + `/health`; fresh external MCP handshake; trusted UI Request/Response with safe fixtures and one explicitly authorized real non-sensitive tool; no replay/copy side effects; unknown-vs-process status; rollback on regression.
- Rollback: stop only exact owned processes, restore original EXE/UI/wrapper bytes from validated scoped backup, remove only newly installed detail module if its hash matches candidate, restart with the official one-shot owner path, re-verify `/health` and app UI. No release/push/deploy or credential/policy changes.
- Installation/dependency restore and live cutover/restart remain separate **explicit approval gates**. Nothing in this report is authorization or proof of those actions.

## P1/P2 staging completion — 2026-10-21 (supersedes earlier blocked build evidence)

**Status: STAGING ARTIFACTS VERIFIED; CUTOVER B NOT AUTHORIZED; LIVE NOT VERIFIED.**

### P1 — official RID restore and isolated publish
- Approved RID-only `dotnet restore` from `https://api.nuget.org/v3/index.json` succeeded with `net8.0-windows7.0/win-x64` present in `src/launcher/obj/project.assets.json`. Packages stayed under `runtime/nuget-packages`; no package versions/project or global NuGet configuration changed.
- Production-equivalent `Release -r win-x64 --self-contained true -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true --no-restore` publish succeeded **after P2** into `runtime/build/activity-log-inspector-20261021/launcher/`.
- Final staged `Agent Core.exe`: **162,983,698 bytes**, SHA-256 `66AC14BE36FA64DC53DF1DB3B7F689FC3F056A57221DB9F25EA0BB3D422469A8`; root active EXE preserved at `45FC4BCB64EC3700A65410AB8CC18522F542340BAEABB7742992C21BC2221F8E`.
- Node TypeScript and UI Vite staging builds also re-run after final P2 source. UI assets: `index-DJ6hRKFv.js` and `index-CBeBCMxf.css` under staging UI assets.

### P2 — lifecycle evidence separated from outcome
- `src/launcher/ActivityJournal.cs`: correlated tool records retain an observed start timestamp separately from terminal outcome/time. Terminal success with no start yields `Status=success`, `Lifecycle=incomplete`, `StartedAt=null`, `DurationMs=null`, `TerminalAt` from terminal. Missing start does not establish cause (16 MiB window, earlier retention, or other unknown).
- Start-only yields `Status=running` as **last observed event**, `Lifecycle=start-only`, no terminal or duration, and a UI statement that present-time execution is unknown. Complete start+terminal retains both timestamps, outcome, and recorded terminal duration. Legacy non-invocation events remain unmodified/unreconstructed.
- `src/launcher/ActivityEntry.cs`, `src/ui/src/host.ts`, `src/ui/src/pages.tsx`, and `src/ui/src/ToolExecutionDetail.tsx` convey lifecycle separate from tool-call outcome. The card and inspector explicitly show `Lifecycle incomplete · start unavailable`. HTML/script output remains rendered as escaped text. Read-only Request/Response capture limits and copy sanitation retained.
- `src/ui/src/index.css` adds limited warning/unknown lifecycle styling; **no changes to `MarkCleared()`**, existing journal/retention, tool approval or Native frozen sections.

### Observed tests, including previous failure evidence
- Native freeze PASS: 31 files / 78 protected sections; path policy PASS: 456 authored files, 0 exceptions; scoped `git diff --check` exit 0.
- UI typecheck PASS, UI targeted 20/20 PASS; backend TypeScript typecheck/build PASS, redaction tests 3/3 PASS.
- Full launcher suite initially 29/30 due transient Windows process-identity query timeout in `WindowsTcpListenerTests.ProcessProbeRetainsIdentityWithinPassiveBudget`, while P2 lifecycle regressions passed. No production code change made to mask that failure.
- Corrected patch-local C# compilation scoping/import issues and optimized fixture structure; repeated **full launcher suite 30/30 PASS** in 44.96 s, including the prior failing Windows probe (4 s). Earlier failure remains in evidence.
- New `ActivityLifecycleEvidenceTests.cs` tests complete lifecycle, terminal without start outside 16 MiB, start-only, concurrent same-named calls, and legacy records. Existing launcher regression suite was retained.
- Safe WebView2 fixture screenshot `runtime/tmp/activity-log-incomplete-fixture.png` (1440x900), SHA-256 `CEE6DB9AACFD18729C5FE33080565418FB33A3410309F67F811B8168EFCB3A56`, visually shows **both card and inspector** with outcome success, incomplete lifecycle, unavailable start/duration. Mock/fixture only, not active application proof.

### Final staging manifest and operational gates
- Final **non-executable** CAS-style manifest: `runtime/build/activity-log-inspector-20261021/candidate-manifest.STAGED.json`, SHA-256 `8DB01545A193B74B084AE1C8C3D276C53760360E3FD43E6796DA2D04437686AF`.
- Manifest includes six *required* runtime files: root EXE, UI index + two hashed assets, Node wrapper, new tool-detail module; two optional source maps. Seven unchanged Node dependencies match active hashes; active path+expected SHA-256 and staged path+SHA-256 pinned individually.
- Prior `candidate-manifest.BLOCKED.json` preserved strictly as historical evidence; it is **superseded** and must not drive a cutover.
- Recent read-only process check: launcher 12704, native helper 9452, Node 15124 and tunnel 1368 remained live with previously observed creation times; browser-use PID 11804 absent (cause not inferred). Both CMD/Python REPL sessions remained live. PID identity must be re-verified immediately before any B.
- `/health` was `ok`, v0.15.0 with `agentRuntime.runningSessionCount=16` (active session records, not proof of 16 executing tasks) and `agentChat.runningTurnCount=0`. Pending ledger state was not changed; no process/session terminated.
- **Baseline restart impact:** `MarkCleared()` writes a new Activity cutoff and empties text mirror while preserving JSONL. EXE/cutoff/mirror backups alone cannot restore earlier on-screen history across launcher restart because in-memory `_visibleAfter` resets. Treat visible-history reset as a known impact, preserve JSONL/new records, and do not overwrite a newer journal.
- **B remains a separate decision**: approve only after fresh process+ledger readiness/drain, verified active hashes, byte backups/CAS, maintenance window and controlled rollback plan. Expected MCP/browser/terminal disconnection may last minutes; streaming/live acceptance has not happened.
- No active root EXE, active `dist`, live Activity JSONL, cutoff marker, text mirror, approval policy, process/helper, or deployment/release was modified during P1/P2.

## B cutover trial / independent rollback — 2026-10-21

**Outcome: ROLLED BACK; original installed Agent Core runtime restored. Staging candidate remains available but NOT active.**

- User-approved exact six-artifact cutover ran from an independently parented WMI/Windows worker in desktop session 1. No additional scheduler task or security change was made. Existing official `Restart-Agent-Core.ps1` performed both graceful restart cycles.
- Manifest `runtime/build/activity-log-inspector-20261021/candidate-manifest.STAGED.json` SHA-256 `8DB01545A193B74B084AE1C8C3D276C53760360E3FD43E6796DA2D04437686AF` was checked; 6 candidates + expected-active hashes had 0 drift before install.
- Validated backup: 9 original paths (six runtime targets plus cutoff/text mirror/pending EXE) with 0 SHA-256 mismatch. Journal JSONL was not overwritten, backed up into a replaceable state, or deleted.
- The two verified CMD/Python interactive sessions (PID 17268 and 16016) and screenshot harness PowerShell (PID 8048) received graceful `exit` / `exit()`; all three returned exit code 0 and their child Python PIDs were subsequently absent. One ledger `pending` record was left untouched.
- Independent worker was launched through Win32_Process.Create; parent was WmiPrvSE.exe, desktop session 1, separate from Node Core. Official `Restart-Agent-Core.ps1 -WhatIf` had already passed independently.
- Active six candidate hashes were checked after restart and matched exactly, including approved EXE SHA-256 `66AC14BE36FA64DC53DF1DB3B7F689FC3F056A57221DB9F25EA0BB3D422469A8`. New launcher PID 3432, Node listener PID 19872, tunnel listener PID 4024 at acceptance; `/health` reported v0.15.0 `ok`.
- Live backend evidence: correlated sanitized Request/Response events were persisted for multiline `start_process`, `write_file`, and `edit_block`. Credential-shaped dummy Authorization/password in the originating multiline call were redacted in stored Request/Response. 15,101-char write request produced `truncated` storage state and displayed maximum 12,000-character capture preview. No claim of complete upstream output.
- Live UI was actually loaded and captured through handle-bound `PrintWindow` on launcher PID 3432. `runtime/tmp/activity-log-live-panel-20261021.png` SHA-256 `78BA939C71413A4867E46177683E40D737FD94D75F124484711DB5A5F78015DD` shows Activity Log cards, Request/Response, tool vs child process status, and current events; `activity-log-live-expanded-20261021.png` is a second capture, **not proof Expand succeeded**.
- **Not accepted:** UI automation could not substantiate live Copy sanitized or Expand button effects, or visually verify UI pagination/truncation end-to-end. UIA invocation returned but expected clipboard content and expanded state were not proved. Backend and safe-fixture tests had passed earlier, but do not substitute for live acceptance. The screenshot that accidentally captured an unrelated foreground window was removed after exact-hash verification; it is not evidence.
- As requested for incomplete core acceptance, `RequestRollback` was issued at 2026-10-21T09:27:59Z and acknowledged. Independent worker recorded `ROLLED_BACK` at 2026-10-21T09:31:39Z. `independent-worker-exit.txt` contains exit code 1 as a deliberate transaction failure/rollback, **not rollback failure**.
- Post-rollback direct SHA verification: 6/6 targets match expected original states; original root `Agent Core.exe` SHA-256 `45FC4BCB64EC3700A65410AB8CC18522F542340BAEABB7742992C21BC2221F8E` restored; new hashed UI JS/CSS and `dist/tracker/tool-detail.js` absent, original UI index and MCP wrapper restored. Pending activation marker absent.
- Recovered launcher PID 13800, Node listener 18484 on port 8765, tunnel listener 17216 on port 8787; `/health` = `ok`, v0.15.0. Revalidate these identities at any future maintenance; they are snapshot evidence only.
- Journal at pre-stop backup: 32,659,764 bytes; after rollback: 32,818,859 bytes. The rollback did not overwrite journal data; it grew rather than being restored to an older snapshot. Baseline `MarkCleared` updated Activity cutoff again at recovery (file modified 2026-10-21T09:29:56Z). Visible history may reset, not recoverable by backing up cutoff alone.
- Local independent transaction script: `scripts/windows/Invoke-ActivityLog-Cutover.ps1`; backups, state, worker log and original hashes: `runtime/build/activity-log-inspector-20261021/transaction-activitylog-b-20261021-8db01545/`. The transaction's state is final `ROLLED_BACK`, not a deploy/release.
- Safe temporary acceptance text file `runtime/tmp/activity-log-live-acceptance-20261021.txt` remains for evidence and does not affect runtime. No push, release publication, dependency install or unrelated process termination occurred.
- Next cutover would require a new decision and verified way to exercise and observe live UI actions (copy, expand, pagination), not a blind retry. Preserve candidate and backup evidence; do not silently reapply.

## Current resident outcome — Activity Log activation accepted (2026-10-21)

**FINAL STATUS: ACCEPTED / LIVE ON AGENT CORE, not rolled back.** Earlier `ROLLED_BACK` entries in this file describe historical trials only; they do **not** describe the current installed state.

- Final one-shot transaction: `activitylog-b4-20261021-8f346a2f` under `runtime/build/activity-log-inspector-20261021/transaction-activitylog-b4-20261021-8f346a2f/`. Independent Windows worker wrote `transaction-state.json` `status=ACCEPTED`; `independent-worker-exit.txt` contained **0**.
- Final manifest: `runtime/build/activity-log-inspector-20261021/candidate-manifest.REDACTION-v3.json` SHA-256 **`8F346A2F0EAFB5A94147C322CB8DED26BC8D1658D475019D7C787D590A767FC8`**. Six required installed runtime paths exactly matched final candidate hashes (0 drift). Sourcemaps remained optional; entire `dist` was never overlaid.
- Root `Agent Core.exe` candidate hash **`8A42451942E550E43AD86C7CA951062A50B3E094D06C7F2F00AD7ED967B8B7E8`**. Node `dist/tracker/tool-detail.js` candidate hash **`C4E1E2346AA07446AA5EB614C2C5741135C1A273118BA9718BDB069916655BEB`**.
- User-authorized maintenance chronology has four transactions: initial B, retries B2/B3, and final accepted B4. Each previous unsuccessful attempt was independently rolled back to baseline with its own original-byte backups; final B4 has its own verified nine-object backups and successful acceptance. No future re-use of previous one-shot transaction IDs.
- New source correction 1: `src/tracker/tool-detail.ts` sanitizes raw property names/values before JSON serialization, and does not run a regex again against serialized escaped JSON. Regression `tests/activity-tool-detail.test.ts`: **5/5 PASS** including safe content after dummy Authorization and truncated capture.
- New source correction 2: `src/launcher/ActivityDetailReader.cs` performs transport defense-in-depth with escaped-JSON-aware header matching; it redacts Authorization while retaining subsequent command lines (`\n` escape boundaries). `src/launcher.tests/ActivityExecutionJournalTests.cs` contains the regression. **Full launcher suite 31/31 PASS**.
- Unchanged Activity Log inspector and UI bundle retain code highlighting, resizable/expandable Request/Response, call/child-process status separation, bounded 12,000/24,000-character sanitized capture, stored-page pagination, and legacy/incomplete lifecycle labels.
- Live UI acceptance via Windows UI Automation observed **Expand→Restore**, **Load More 4,096→6,315 stored characters**, **Copy sanitized** (actual clipboard changed to 6,319 chars, fake-secret marker absent, UI success status), and direct WebView2 window screenshot. UI automation synthetic clipboard acceptance was intermittent across attempts; a later targeted retry passed. Do not claim browser clipboard capability is universally reliable or associate PID-only processes across invocations.
- Final live screenshot: `runtime/build/activity-log-inspector-20261021/activity-log-live-accepted-v3.png`, SHA-256 **`0BBB615B2D38DBF6EF93BD816749E58DBD3E81A3C9C588526474B77C3895B92B`** (1552×999). Image actually shows the running Agent Core Activity Log with sanitized PowerShell command, token markers redacted, and `6,315 / 6,315 stored characters`.
- Final direct runtime readback: `/health` `ok`, v0.15.0; port 8765 Node owner PID 12916, tunnel port 8787 owner PID 13784 (PIDs are snapshots, not durable identities). Installed hashes 6/6 pass, no pending activation marker, worker receipt 0, 1 launcher active during live acceptance.
- Final governance: Native freeze 31 frozen files / 78 sections PASS, path policy 459 files / 0 exceptions PASS, `git diff --check` exit 0. No release publication, push, additional packages, or unrelated process termination.
- Journal JSONL was not restored from old backups. B4 backup snapshot observed 33,200,908 bytes; final journal observed 33,268,930 bytes. **File-size growth does not establish per-record bitwise integrity**, but the rollback procedure does not overwrite the original JSONL. `MarkCleared()` remains baseline and may reset visible history on launcher restart; backup metadata alone cannot restore `_visibleAfter`.
- Remaining explicit limits: Activity Log uses journal snapshot/polling, not streaming; child-process state is not inferred from tool success and PID-only cross-call associations remain unverified. The UI may require an actual user gesture for clipboard access under some environments.
