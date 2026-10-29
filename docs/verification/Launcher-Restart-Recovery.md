# Launcher and restart recovery — 2026-10-29

## Additional continuation and composer work

The later user instruction raises this bundle's functional-test cap to two invocations and requests a scoped commit. The specification is in [Launcher-Migration.md](../plans/Launcher-Migration.md). Recovered turns now remain resumable after startup; only explicit Continue runs their existing checkpoint/task. Session selection and drafts are independent of another session's execution, and host state/errors carry conversation/request ownership. Uncorrelated read snapshots cannot clear a pending send/resume. Raka independently found that stale-read race during a read-only source review; no partner test or additional model task was started.

Goals mode is one composer toggle and persisted metadata on the existing chat turn. Its bar displays the actual user instruction, state and wall-clock elapsed time, with safe checkpoint Pause, Continue, Stop and expansion. Pause allows the current operation to finish and saves a checkpoint before stopping; it does not restart a pending mutating effect. This implements the requested task bar, while standalone Goals & Plans CRUD/milestones remain deferred. Focus styling is on the outer rounded composer; the textarea no longer adds an overlapping cyan outline.

Verification for this bundle: attempt 1 failed before test execution because the combined projects used conflicting worker settings. Attempt 2 passed the one Native manual-continuation regression (startup calls no controller, pause schedules no retry, explicit continuation retains the task identity and finalization is not repeated), but UI workers could not start because the root Vitest runner could not resolve UI-local `jsdom`. Logs are preserved at `runtime/launcher/continuation-single-attempt-20261029.log` and `continuation-final-attempt-20261029.log`. The UI race fixture was extended after source review and was not rerun. No third functional-test invocation was made. Root TypeScript staging, UI typecheck/production build, and self-contained native publication succeeded; these are compilation results, not UI regression acceptance. No dependency was downloaded or installed.

The candidate native SHA-256 is `86db3fcd843a78146c38d84d5752c3996d30c7f56b05e72aec4e36793f577af8`; UI bundle is `index-_rrOjgUb.js` with `index-B434OqGo.css`. The twelve exact Core JS/map artifacts and the native candidate have verified pre-activation backups under `runtime/launcher/backups`; source-map paths were normalized for their installed `dist` location. The one-time cutover uses the existing exit signal and official restart worker; it preserves canonical Memory/chat data and does not press Continue or resurrect stopped partner tasks.

Activation completed at `2026-10-29T08:41:52Z`: launcher PID3772, Core PID20264, readiness `siap`, cold-start readiness 78 seconds, `dist` not stale, exactly one launch. Resident health reports zero running turns and one resumable turn. Background Windows UI Automation through the elevated existing Agent Core owner observed the composer, Goals mode, Chat history and exactly one provider/model selector. No new instruction was submitted and Continue was not pressed. [Activation receipt](Launcher-Continuation-Activation.json). The live provider-backed goal bar and full-restart window-size acceptance were not exercised.

`agent-skills:spec-driven-development` was adapted by writing acceptance and owner/dependency mapping in the existing migration plan before implementation, then comparing the implementation and outcome ledger with it. Existing explicit user authorization replaced redundant upstream approval steps. Raka's source review led to the correlated-request race correction. This is evidence of workflow application, not measured comparative benefit. The test-runner failure remains a verification limitation; no additional dependency or test invocation was used to conceal it.

The user requested repair of the broken launcher and restart script, with a maximum of one verification attempt and no unrelated tasks. This is an operational repair; prototype/backend expansion remains deferred.

## Cause and changes

The first launcher package used an ordinary apphost with a self-contained runtime configuration. Its host trace reported missing `hostpolicy.dll`, and browser native-messaging retries repeatedly opened the runtime-install dialog. The corrected package uses the already installed matching single-file host. The broken executable and interrupted/pending/build candidates were preserved in `runtime/launcher/backups`; no runtime was downloaded or installed. The installed package SHA-256 is `c72a25e0e023aa3abed0b0942bb5a1cf45a0d67f43108a3a7fac59047653b8c4`.

The restart worker previously treated any main window as startup success and treated failed Core readiness as report-only. A runtime error dialog could therefore produce exit code 0 and `Selesai: ok` while Core was down. `scripts/windows/Restart-Agent-Core.ps1` now requires the `Agent Core` window, rejects the known `Agent Core.exe` error dialog, requires Core PID/start-time metadata from a fresh healthy response, and throws on failed readiness so the existing outer failure/receipt path returns failure. It still launches exactly once, never retries a launch, and preserves existing authentication, process-identity and shutdown boundaries.

Cold startup receives up to 300 seconds; `scripts/windows/Invoke-Agent-Core-Restart.ps1` now budgets 305 seconds for that phase. Scheduled-task registration, identity, triggers and arguments are unchanged. These script edits are used on the next explicit restart and require no launcher rebuild or task re-registration.

## Operational recovery

Repeated earlier shutdown/startup attempts left an orphaned `.memory.lock`; another startup failed on a Windows process-query timeout. Inspection found no active Core writer and an expired empty proper-lockfile lease. No Memory file or lock was manually deleted. Start Core was requested once through the current launcher, and the existing Memory owner reclaimed its expired lease. The journal then recorded Core service startup and, at `2026-10-29T06:57:08Z`, `RDC bridge changed to ON` and `Execution changed to AVAILABLE`. This establishes recovery of the local Core; external gateway/tunnel and provider availability are not accepted by this observation.

## Single verification attempt

Exactly one invocation was made for this restart-script repair:

```text
node node_modules/vitest/vitest.mjs run tests/restart-readiness.test.ts --testTimeout 90000
```

Result: one file passed, five checks passed, 19.40 seconds. The existing readiness/receipt fixtures exercise healthy, invalid, stale/missing-identity, unavailable and slow-start responses without restarting the resident launcher. Output: `runtime/launcher/restart-readiness-once-20261029.log`. The test was not repeated. No live restart was performed after these script edits.

`agent-skills:debugging-and-error-recovery` was applied by preserving the host trace, identifying the package and false-success causes, correcting their owners, and performing the one focused verification above. Broader suites and repeated live restart checks were omitted at the user's explicit request. Window-size full-restart acceptance remains inconclusive in [its report](Launcher-Window-Size.md); Native partner results remain outstanding, without an unsupported completion claim.

Canonical Memory listing and contract acknowledgement recovered, but `controller_learning` episode start for stable key `launcher-restart-recovery-20261029` did not return. Waiting was stopped; the mutation outcome remains unknown and must be reconciled before retry. Learning checkpoint/review for this repair remains pending; this report is engineering evidence, not a substitute Memory owner.

## Explicit additional request: duplicate model selector

The user supplied a composer screenshot showing both `anthropic · <model>` and `Default · <model>` and explicitly requested removal of the duplication. `src/ui/src/pages.tsx` now renders one provider/model select. Provider defaults retain their existing values; alternative Anthropic catalog models are options in the same select. The existing provider/model callbacks, per-message payload validation, reasoning qualification and running/recovery lock remain in place. No second model selector is rendered. Related expectations in `App.test.tsx` and `NativeChatReliability.test.tsx` were adjusted.

For this additional request, one targeted test case was invoked once: `App.test.tsx` / `selects catalog Anthropic models per message and guards reasoning by the selected model`; it passed (11.36 seconds). No other test was run for this change. One production Vite build succeeded (9.29 seconds), producing `dist/ui/assets/index-Cj7-3VP6.js`. Previous index/JS/CSS files were preserved under `runtime/launcher/backups/composer-before-b19b615bf7fc4109b049ecb61759a472-*`. The current resident page needs a normal UI reload to load the new bundle; no launcher/Core restart or speculative desktop-input automation was performed.

### Resident activation completed after the user's completion correction

The user explicitly rejected leaving the new bundle waiting for a manual reload. A background refresh request did not replace the old page. One official activation restart then replaced launcher PID 17212 with PID 16088. Receipt `aa7afd8863594b43ba42e6090f592434` returned exit 0, `Kesiapan: siap`, fresh Core PID 20200 and non-stale dist. The restart worker now also allows an orphaned canonical Memory directory lease to expire naturally before launch, checks that it is not a reparse point and aborts if another writer changes it; it never deletes/touches the lease or Memory data. This safeguard uses the existing Memory owner's 120-second stale lease. No additional test run or benchmark was made for this activation.

The initial post-restart composer assertion ran before the relevant Workspace page was open and therefore found no composer. Opening **AI Workspace** through the existing navigation exposed the resident new composer: exactly one `Provider dan model` combo, no `Anthropic model` duplicate, and a present `Message Agent Core` field. The UI activation is now complete; the earlier manual-reload limitation is superseded. [Resident activation receipt](Launcher-Composer-Activation.json). The on-screen Core status was Ready. This proves the installed UI change and restart readiness; it does not claim a new provider inference or unrelated feature acceptance.

Readonly reconciliation found that the previously timed-out Learning start had in fact created `ext-e32cffdf8a0b46db9f01016033c0804d` for `launcher-restart-recovery-20261029`. Resume this exact episode through its owner; do not create a replacement or duplicate.
