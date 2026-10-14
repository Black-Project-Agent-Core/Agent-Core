# Agent Core Codebase Audit Repair Plan — 2026-09-28

Status: **COMPLETE — LIVE-ACTIVATED — INSTALLED-RUNTIME VERIFIED — RELEASE EXECUTION STILL DEFERRED**

## Objective

Close every actionable issue from the 2026-09-28 codebase review without running release apply, packaging, tagging, pushing, publishing, or deployment.

## Repair scope

### AR-P1 — Launcher single-instance race and stale launcher cleanup

Observed:
- same Windows session contained root launcher PID 3152 with no main window and active launcher PID 5316;
- active launcher PID 5316 owns Node 12484 and tunnel 12448;
- current `Program.Main` calls `ApplicationConfiguration.Initialize()` before acquiring `Local\AgentCoreDesktop`.

Repair:
- acquire the named launcher mutex immediately after native-helper dispatch and before WinForms application initialization;
- keep the existing helper-mode bypass and current single-instance name;
- terminate only the proven stale root PID 3152 after exact path/session/child/port-owner guards;
- do not terminate PID 5316, Node 12484, tunnel 12448, or helper 12536.

Acceptance:
- stale PID 3152 absent;
- PID 5316/12484/12448 remain alive;
- Core /health remains ok;
- future normal launcher startup holds the single-instance mutex before WinForms initialization can hang.

### AR-P2 — Launcher security-analysis ambiguity

Observed:
- Grafel taint analysis reported command-injection/path-traversal signals inside `AgentCoreRuntime.StartHidden`;
- exact source did not confirm a vulnerability: executable/arguments are owned paths and `ArgumentList` is used, while the only environment-tainted value is inherited child PATH.

Repair:
- split project-owned runtime-directory/npmrc preparation and child-environment configuration out of `StartHidden`;
- keep `StartHidden` limited to process-start construction, argument binding, environment helper invocation, start, ownership assignment, and exit observation;
- preserve behavior and environment values exactly.

Acceptance:
- exact source retains `UseShellExecute=false` and `ArgumentList`;
- no shell command construction is introduced;
- Grafel security re-analysis no longer conflates inherited PATH with the process executable/file-write sinks, or any residual finding is explicitly source-verified before closure.

### AR-P3 — Semantic IDE type-only import cycle

Observed:
- Grafel reports a two-node cycle between `semantic-ide/freshness.ts` and `semantic-ide/types.ts`;
- exact source proves both cycle edges are type-only.

Repair:
- make `WorkspaceFreshnessResult` owned by `semantic-ide/types.ts`;
- import that type into `freshness.ts` and `language-server.ts`;
- remove the reverse `types.ts -> freshness.ts` type import.

Acceptance:
- no `types.ts -> freshness.ts` import remains;
- public/internal result shape is unchanged;
- Grafel cycle analysis no longer reports the two-file cycle after graph refresh.

### AR-P4 — Code Intelligence advisory-truth boundary

Observed:
- Grafel single-group dead-code analysis classified at least `MemoryService.initialize` as test-only although exact `src/index.ts` calls it;
- provider debt/security output is useful evidence but not deletion/vulnerability authority.

Repair:
- strengthen the public `code_analysis` tool description so debt/security findings explicitly require exact-source verification before code deletion or vulnerability claims;
- do not add a second analyzer or automatic delete/filter mechanism;
- retain source-as-authority behavior.

Acceptance:
- MCP metadata states the advisory boundary;
- no schema/tool count change;
- no behavior gate is added.

## Verification boundary

Implementation activation requires:
- TypeScript root build/path-policy because AR-P3/AR-P4 affect Node source;
- launcher publish/build because AR-P1/AR-P2 affect the native desktop host;
- structural Grafel refresh/readback for cycle/security signals;
- live process and /health readback after stale PID cleanup.

No broad regression suite is authorized by this plan. Any targeted product test beyond compilation/build must be separately authorized by the user.

## Release boundary

Release execution is explicitly deferred until audit blockers are closed. A release-intent changeset may be recorded as required project metadata, but do not run `release:apply`, version synchronization for a release, packaging, commit, tag, push, publish, or deploy.

## Implementation record

### AR-P1 result

- `Program.Main` now acquires `Local\AgentCoreDesktop` immediately after native-helper dispatch and **before** `ApplicationConfiguration.Initialize()`. This closes the pre-mutex WinForms-initialization race that could leave an invisible root launcher alive without owning the single-instance mutex.
- PID `3152` was rechecked immediately before termination: exact executable was `E:\Projects\Agent-Core\Agent Core.exe`, same user session, no child processes, and no listening ports. It was terminated successfully.
- Post-cleanup identity: visible launcher PID `5316` remains parent of Node `12484`, tunnel `12448`, and native-dump helper `12536`; ports 8765/8787 remain owned by 12484/12448; `/health=ok`.
- New launcher candidate published as `runtime/build/codebase-audit-repair-launcher-20260928-r2/Agent Core.exe`, FileVersion `0.13.0.0`, ProductVersion `0.13.0`, SHA-256 `C6A17A4CD7C9F17710E7485C6D8F3581D806C4E69C43181B0422A8FBD0A747DB`.
- Current root launcher on disk was atomically staged without killing the active launcher: the running old image was renamed to `runtime/backups/codebase-audit-repair-20260928/Agent Core.running-5316.exe`, and the candidate now occupies `<PROJECT_ROOT>\Agent Core.exe` with the candidate hash. The active PID 5316 still executes its pre-cutover loaded image until one user-controlled close/reopen.

### AR-P2 result

- Child runtime-directory/npmrc preparation and inherited child-environment construction were split out of `StartHidden` into `PrepareOwnedChildRuntime` and `ApplyOwnedChildEnvironment`.
- `StartHidden` still uses `ProcessStartInfo(executable)`, `UseShellExecute=false`, and `ArgumentList`; no shell-string execution was introduced.
- After Grafel refresh, security analysis at min confidence 0.7 reports **0 findings**, closing the prior false-positive command/path taint signals.

### AR-P3 result

- `WorkspaceFreshnessResult` is now owned by `semantic-ide/types.ts`.
- `freshness.ts` imports/re-exports the type; `language-server.ts` imports it from `types.ts`; the reverse `types.ts -> freshness.ts` dependency is removed.
- Fresh Grafel cycle analysis reports **0 cycles**.

### AR-P4 result

- Public `code_analysis` metadata now states that provider debt/security findings are advisory evidence and exact current source/callers must be verified before deletion, vulnerability claims, or architectural conclusions.
- Tool/schema count is unchanged by source design. The raw provider dead-code analysis can still emit extraction false positives; this is now an explicit evidence boundary rather than deletion authority.

### Build / static verification

- Root `npm run build`: **PASS**.
- Path policy: **267 authored files / 0 documented exceptions**.
- TypeScript compile: PASS.
- Grafel reindex: `current`, registered-workspace coverage **1/1 complete**.
- Post-change Grafel cycle analysis: **0**.
- Post-change Grafel security analysis: **0 findings** at min confidence 0.7.
- Launcher publish: PASS using the project-local full SDK `runtime/toolchains/dotnet-sdk-8` and existing restored assets with `--no-restore`.
- No broad regression/product test suite was run.

### Build failure / corrected method

The first launcher publish used the older partial `runtime/dotnet-sdk` plus `runtime/nuget-packages` and failed because the 8.0.31 WindowsDesktop runtime package tree was incomplete. A second restore attempt with the full SDK hit a NuGet file-already-exists collision. The successful correction reused the now-correct project assets and the full `runtime/toolchains/dotnet-sdk-8` with `runtime/dotnet-packages` under `--no-restore`; publish then completed successfully.

## Remaining activation gate

Release is still intentionally deferred.

The only remaining repair gate is **one normal user-controlled full Agent Core launcher close/reopen**. That restart must:
1. load the new root launcher hash `C6A17A...`;
2. load the rebuilt Node `dist`;
3. prove one root launcher only;
4. prove Node/tunnel parentage and ports remain correct;
5. prove `/health=ok`, 70-tool MCP exposure, Code Intelligence current, and no reappearance of the stale launcher;
6. permit cleanup of the old renamed running-image backup after its process is gone.

No release apply/package/version bump/commit/tag/push/publish/deploy should occur before that readback closes.

## Post-restart installed-runtime closure

User-controlled full launcher close/reopen completed.

Fresh installed-runtime evidence:
- root `Agent Core.exe` SHA-256 remains `C6A17A4CD7C9F17710E7485C6D8F3581D806C4E69C43181B0422A8FBD0A747DB`, FileVersion `0.13.0.0`, ProductVersion `0.13.0`;
- active root launcher PID `16168` started at `2026-09-28T06:25:47.7132925Z`, after the root candidate write time `2026-09-28T06:11:42Z`, proving the new launcher image is resident;
- exactly one root launcher is active; the only second `Agent Core.exe` process is native-dump helper PID `16940` parented by launcher `16168`;
- Node PID `12220` and tunnel PID `10984` are both parented by launcher `16168`, owning ports 8765 and 8787 respectively;
- `/health=ok` on product `0.13.0`; Memory, Code Intelligence, Semantic IDE, Learning, Skills and Execution are available;
- Code Intelligence is `current` with registered-workspace coverage **1/1 complete**;
- current connector exposure contains **70 Agent Core tools**;
- rebuilt `dist/mcp/code-intelligence-tools.js` contains the AR-P4 advisory metadata, and live Node PID `12220` started after that compiled artifact, proving the rebuilt tool metadata code is resident.

The obsolete renamed running-image file `runtime/backups/codebase-audit-repair-20260928/Agent Core.running-5316.exe` was removed only after confirming no process executable path referenced it. The pristine scoped rollback backup `runtime/backups/codebase-audit-repair-20260928/Agent Core.exe` remains.

Audit repair is now **COMPLETE — LIVE-ACTIVATED — INSTALLED-RUNTIME VERIFIED**.

Release execution remains separate and still requires explicit user authorization.
