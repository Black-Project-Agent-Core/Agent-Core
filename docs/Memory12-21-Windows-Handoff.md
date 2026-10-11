# Memory12–21 Windows integration handoff

## Publication prerequisite: BLOCKED until a real SHA is recorded

Repository: `https://github.com/Black-Project-Agent-Core/Agent-Core`.
Source candidate: `0.15.0-beta.3`, existing prerelease train; no stable release, tag or package publication is implied.
Implementation branch and full 40-character pushed commit: **pending publisher verification**. Do not fetch a placeholder or use the baseline `fe2268cc48ee867c4f2efdac21ae281c8a830fc8` as the implementation revision.

The publisher must fill these fields from an actual remote readback, with the final scoped inventory and test ledger. The Linux checkout's `origin` is a local mirror, not evidence of GitHub publication. This document does not itself authorize release, deployment or activation.

## 1. Protect the current installation and local work

1. Resolve the existing canonical project root, active executable path, process command line, Git branch/remotes and installed/running version. Keep the prior beta.2 launcher/UI alignment separate and preserve it. A beta.2 version label is not proof that Plans06–11 source and runtime wiring are complete. Before integrating beta.3, verify those prerequisites against the actual scoped source/build identity and the [Plans06–11 functional ledger](verification/memory06-11-source-functional-2026-10-10.md), including its host wiring and targeted tests. Resolve any partial prerequisite integration before attributing beta.3 failures or success.
2. Inspect `git status --short` and diffs for the incoming changed-file inventory. Unrelated dirty files are not a runtime error or integration blocker. Do not reset, clean, stash, create an alternate active clone/worktree/runtime or overwrite overlapping work. Because local disk capacity is constrained, do not create new local backups, whole-project copies or additional project trees. Preserve existing files in place and use the scoped inventory/diff for reconciliation; a backup step is not implicitly authorized.
3. Fetch only the verified implementation branch from the verified GitHub remote. Check the exact fetched object against the publisher's 40-character SHA and inspect its scoped diff. Reconcile overlapping source files selectively. Stop only the affected unresolved conflict rather than discarding local work.
4. Record source commit, modified-file fingerprints and version surfaces separately from installed binary and process identity. An uncommitted merge result needs its own file inventory; never label it the pristine published commit.

## 2. Persistence and provider safety

- Retain the current host-owned activation marker and canonical Memory root. This work does not authorize migration, opt-in activation, production fixtures or a second writer.
- Plan13 extends strict episode/receipt structures with ingestion metadata. Plan14 adds revision knowledge intervals and optional host publication watermark metadata. Old data is read without invented history; older strict binaries can reject newly written fields. That rejection is a safe stop. Do not strip metadata, reset stores or force an old writer to make downgrade appear compatible.
- Publication metadata is generated only by valid existing owner mutation. Read/query/startup must not initialize historical evidence. Verify this with synthetic roots before considering production use.
- Preserve existing provider configuration. If startup/index inspection predicts re-embedding or any new paid/transmitted-data call, stop for the specific provider, data scope, volume and cost approval. No approval is inferred from this handoff or source version.

## 3. Canonical builds

Use installed approved Node >=24.15.0 and existing locked dependencies. If required dependencies are missing, report the exact prerequisite; do not silently install a donor/runtime/toolchain.

From the verified canonical root:

- `npm --prefix SubProject/agent-core-memory run build`
- `npm run build` (includes the portability guard)
- `npm --prefix src/ui run build` when synchronizing the versioned UI bundle

For the Windows launcher, first check executable locks and an independent recovery/control route. When separately authorized, publish the existing `src/launcher/AgentCore.Launcher.csproj` in Release/win-x64, self-contained single-file form, with `IncludeNativeLibrariesForSelfExtract=true`, directly to the verified canonical project root. Never use an alternate temporary runtime or development-build helper that starts one. Do not overwrite a locked resident executable.

Before replacing resident build outputs or restarting, record the exact currently running process and establish an independently usable recovery route. Do not let an old process dynamically load a mixture of old and new modules; use the authorized safe stop/build/start sequence on the canonical installation. Do not cut the only MCP/control connection. If no independent route is verified, ask the user for the one required manual stop/start action. The user owns browser testing; do not take over their browser.

## 4. Functional acceptance

Run the exact focused commands in the [source ledger](verification/memory12-21-source-functional-2026-10-11.md), using isolated synthetic roots. Repeat the following through the installed host only where separately authorized:

- 12: interrupted bootstrap, current/stale/missing capsule, tiny budgets, cross-controller exact episode continuation; paused/completed/user stop never auto-resume
- 13: capture/append acknowledgment retry, digest and sequence conflict, unavailable evidence, restart cursor and transfer receipt integrity
- 14: current validAt, historical knownAt, retroactive correction, same-time writes, clock rollback and old/unproven history; no future information leaks
- 15: exact claim citations, changed/unavailable dependencies, stale gate, nested-cycle rejection and promotion replay
- 16/17: candidate-purpose evidence boundaries, delta replay/stale target/partial failure, pending counterexamples, preservation of critical items and source lineage
- 18: explicit cue observation, reschedule/cancel, same-operation replay, current episode revision, poisoned keys and undersized budget; no scheduler/action call
- 19: offline experiment CLI only; no launcher restart or production graph mutation required. Even positive results remain further-study/benefitProven=false
- 20/21: original diagnostic fixture runner and independent packaged replay; scripted controller labels are not real Native/external model execution

Confirm `src`, Memory `dist`, root `dist`, versioned UI, `Agent Core.exe` and resident process all correspond to the recorded source/build identity. A successful build or push is not installed-process evidence. Report each gate as PASS, FAIL, BLOCKED or NOT RUN; do not convert missing evidence to PASS.

## 5. Complete sanitized report

Save the report in the permanent reports location already used on that machine (for example the existing `E:\Projects\Agent-Core-Reports` if verified). Include source/build/process identities, exact commands and exit codes, all failures/corrections, relevant user-provided screenshots, changed-file inventory, synthetic traces, status ledger and a per-file path/size/SHA-256 manifest. Do not include credentials, private Memory content, entire project copies, browser profiles or provider state.

Package the report ZIP, extract it into a fresh permanent report directory and recompute every member's size/hash. Re-run the independent diagnostic/reconsolidation verifier against the extracted synthetic artifacts. Preserve the immutable original reports. Windows acceptance remains NOT RUN until that exact evidence is returned and reviewed.
