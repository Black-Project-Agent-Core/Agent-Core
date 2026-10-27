# External Learning scope recovery

Date: 2026-10-22. Scope: external AI controllers only.

The retained activity journal contains 13 exact `LEARNING_EXTERNAL_SCOPE_UNAVAILABLE` failures before this repair. The latest three inspectable invocation records report `scope-unavailable`, `observer-unavailable` and `no-task`. The latest is invocation `e4fd4c4a80ee464996dec9c6edbf796c` at `2026-10-22T03:06:04.355Z`, captured as unbound/no-task. Earlier entries lack equivalent invocation detail; their causes remain unknown.

Headerless HTTP Learning namespaces change hourly. Contract receipts remain valid under their independent digest check (they no longer lapse when idle), so contract acknowledgement alone does not preserve the Learning head. A fresh acknowledgement can also create an inferred bootstrap episode. Separately, optional invocation capture races state loading against 100 ms, even for operations that require authoritative task scope. Production external state measured 7,098,809 bytes during diagnosis; no state-load latency or general speedup is inferred from that size.

## Implemented behavior

- External Learning checkpoint/review/receipt waits for authoritative capture. Ordinary observations retain the existing 100 ms capture and 250 ms observation budgets.
- An exact supplied `taskId` reconnects only an existing open explicit episode owned by the authenticated credential, with a current registered workspace. Reconnection occurs in the existing serialized state mutation owner.
- Reconnection requires an absent mapped head. A current transport-root inferred episode without Memory binding is preserved. Different explicit heads, stale mappings, unknown/closed/foreign targets and workspace mismatches fail closed.
- Schema-invalid requests, missing or blank checkpoint keys, empty reviews without a disposition and already cancelled requests cannot reconnect. Request cancellation is checked again inside queued admission. A structurally valid request may reconnect before later semantic operation checks fail; reconnection does not establish that a checkpoint or review succeeded.
- Learning rechecks task currency and cancellation after scope resolution. The original error code now includes a bounded cause and recovery instructions. No uncertain mutation is replayed automatically.

The change introduces no new tool/schema, dependency, credential, Memory writer or background process. Native AI Agent Core is available for active development and operation. It does not isolate two chats that deliberately use the same transport namespace, reopen closed tasks, or select the latest task. When another explicit head exists, resume the intended task through `controller_learning` with its stable task key before finalizing.

## Verification and activation

Initial directed reproduction demonstrated three scope failures after a synthetic 180 ms state read. A separate pre-fix run demonstrated checkpoint writes after rotation and cancellation during scope resolution. Other initial negative cases had a test setup error (an absent initial Learning state file); those are not product failures.

Evidence files: `runtime/build/learning-external-scope-before.json` and `runtime/build/learning-external-scope-rotation-before.json` preserve the failing reproductions.

Final directed results cover 60 distinct passing tests across separate runs: 26 scope admission/reconnection tests (`learning-external-scope-final.json`), 23 Memory/task reconnect HTTP tests (`learning-external-reconnect-serial.json`), seven contract tests and four invocation-evidence tests (the corresponding passing files in `learning-external-scope-directed.json`). These were not one combined green command. The initial combined run recorded 41 passes and 14 failures in the integration file, with 15-second test deadlines and subsequent `ENOTEMPTY` cleanup failures. The complete integration file passed when rerun serially with a 60-second per-test allowance; source behavior and project timeout configuration were unchanged. No broad full-repository acceptance was run.

The ordinary build passed historical governance checks (31 files / 78 shared sections), path policy (459 authored files / zero exceptions), the existing browser transport check and TypeScript. One initial compile error about optional binding narrowing was corrected before the successful build. Product version remains 0.15.0. The pending patch changeset was not applied; no commit, push, dependency installation, configuration change or release publication occurred. Existing unrelated dirty source was preserved, and the ordinary build used the current checkout.

One official restart was requested through `restart_agent_core(capabilitiesChanged=false)`. Receipt `runtime/restart/9aa6f90c30b842a7997c83a1d867c975.json` completed with exit 0 at `2026-10-22T04:48:26.0029914Z`; the launcher remained byte-identical to its pre-restart SHA-256 in `learning-external-scope-hashes.json`. Resident Node PID 13936 started after the compiled modules. At `2026-10-22T04:50:01.894Z`, local HTTP health returned 200/ok, version 0.15.0, Memory available/zero issues and Learning available/zero issues. A fresh unchanged-contract handshake, canonical Memory inspection and resume returned the same task `ext-92731d0f1e244225b0122f1967a1f30b` with its existing Memory episode/revision. No tool refresh was required.

The pre-restart health probe timed out after five seconds; an early reconnect attempt before the new listener became ready also failed. Both observations remain separate from the later successful health/handshake. There was no repeated restart. The startup journal reported `BROWSER_OBU_BACKGROUND_CONNECTION_REQUIRED` until a supported existing browser extension connects; browser repair and browser acceptance were outside this task.

## Remaining limits

Scope failure is still correct for a missing task selector, another explicit active head, foreign or unavailable state, task closure, and cancellation. An exact repeated review after a terminal episode has closed still follows the existing closed-task refusal path; no closed task was reopened. The held synthetic HTTP hour transition proves the reconnect behavior without waiting for a real production clock rollover. Sustained post-repair error frequency has not been measured.

Main used structural Code Intelligence for scope/impact orientation and Raka for independent read-only diagnosis and security review. The digest-bound performance Skill informed separation of optional observation budgets from required task authority; no measured speedup is claimed.

Canonical Memory episode `eb5bac20-b1dd-4a5f-89b5-524e6f4fafd2` retained progress at revision 4 with a read-back checkpoint. The activated resident accepted actual Learning checkpoint 454 (`learning-external-scope-recovery-verified`, reason `verified-recovery`) for the same external task. Its exact keyed review completed with `no-new-knowledge` and recorded episode linkage at `2026-10-22T04:52:52.620Z`. Unrelated pending reviews were preserved. This task's durable progress/report is distinct from automatic promotion of a new general lesson.

## Episode-start diagnostics — 2026-10-27

The `MEMORY_CONTROLLER_SCOPE_UNAVAILABLE` returned while cloning `herdr` was an
episode-start admission refusal, not evidence of a failed Learning checkpoint or
lost Memory write. That call omitted `workspace`; the external handler requires
both a stable `taskKey` and an explicitly selected registered workspace before
calling `startEpisode`. An unrelated task must not silently inherit `agent-core`.
The current Agent Core upgrade task started successfully with workspace
`agent-core` and returned a linked Memory task.

The diagnostic defect was that missing owner, missing/blank task key,
missing/blank workspace and an unavailable registry identity all produced the
same opaque error. `src/mcp/controller-learning-tools.ts` now preserves the
`MEMORY_CONTROLLER_SCOPE_UNAVAILABLE` prefix while adding one bounded cause:
`owner-unavailable`, `task-key-required`, `workspace-required`, or
`workspace-unregistered-or-unavailable`, followed by recovery instructions.
Registry exception text is not returned. The host-owned owner/workspace binding,
registered-workspace requirement and fail-closed behavior are unchanged; no
workspace inference, automatic registration, tool/schema or retry was added.

Directed red/green evidence: six new facade tests first failed because the old
handler returned only the generic error; the valid registered request already
passed. After the diagnostic change, all 33 tests in
`tests/learning-external-scope.test.ts` pass with
`node node_modules/vitest/vitest.mjs run tests/learning-external-scope.test.ts --testTimeout=60000 --hookTimeout=60000`.
The six refusals assert that `startEpisode` is never called, the external state
file remains byte-identical and the prior head remains selected. The positive
case asserts the host-owned binding and linked Memory task. Build and resident
activation are separate Main-controller checks; this section records source and
directed-test evidence only until those checks are completed.

An additional serial run of that file together with
`tests/memory/memory-task-binding.test.ts` passed 47/47 tests (two files), including
the existing credential ownership, registered-workspace and task-binding checks.

Main completion checks: the combined Skill/scope/task-binding run passes 56/56 across
five files; `npm run build` passes. Official restart receipt
`6f2833c1b5cd4a3b82f245e8f0d098f9` exits 0 with readiness `siap`; resident PID 16472
starts at `2026-10-26T20:15:46.099Z`, health is `ok` and build is not stale.
The plugin route now returns `MEMORY_CONTROLLER_SCOPE_UNAVAILABLE: workspace-required`
for the same missing-workspace shape, and the subsequent status keeps the original
task `ext-92fc11fb47044a58905e11bdb48c82e0`. A correctly scoped start links Memory;
the task's Learning checkpoint and semantic review also complete successfully.
[Inspectable readback](history-agent-core/mind-control-upgrade-evidence.json).
