> **Historical document, superseded for current Memory placement on 16 October 2026.** Preserve the dated evidence below; do not recreate its old SubProject, MCP-owned memory files, or storage locations. Current ownership and installation status: [Memory consolidation](CONSOLIDATION.md).

# Memory12–21 Windows integration handoff

## Verified source publication; Windows work deferred

Repository: `https://github.com/Black-Project-Agent-Core/Agent-Core`. Branch: `main`.
Published implementation commit: **`60e504f9bf1c876934146dfa7298f1a270e99a14`**.
Source candidate: `0.15.0-beta.3`, existing prerelease train. The implementation commit and full tree were read back from GitHub after a guarded fast-forward update. A later documentation-only main head is recorded separately in the delivered publication receipt; use the implementation SHA above for runtime-source identity.

The Linux checkout's `origin` is a local mirror, not the GitHub remote. No stable release, tag, package publication, deployment or activation is implied.

**Windows integration and tests are deferred until the user returns.** Prior beta.2 Plans06–11 integration is partial and paused; verify actual source, host wiring and targeted prerequisite tests rather than its version label. Limited restart setup has reached preflight only and is not ready. Do not trigger UAC, restart, stop a resident process or perform browser work from this handoff. The following is a deferred checklist, not current execution authorization.

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
