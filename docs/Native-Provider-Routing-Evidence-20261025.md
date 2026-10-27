# Native provider routing evidence — 2026-10-25

**Status (updated 2026-10-25 10:10): SOURCE PASS · FIXTURE PASS · BUILT · INSTALLED · RESIDENT since 09:46:21 · ONE LIVE NATIVE TASK ON `atria` OBSERVED · LIVE KEY ROTATION UNDER INDUCED LIMITS NOT OBSERVED.** Sections 1-13 are the 07:50 snapshot and stay as written; sections 14-22 record the later work (final-build evidence levels, stuck-session repair, Duanyan switch, activation, live observations, reviewer reconciliation, token accounting). Snapshot status at 07:50: **SOURCE PASS · FIXTURE PASS (3 unrelated failures, section 6) · BUILT · RESIDENT · LIVE ROTATION NOT OBSERVED.**

Explicit user task: complete Native provider/key rotation by adapting selected 9Router concepts inside the existing owners. This file is the evidence report; [CODEBASE.md](CODEBASE.md) keeps the implemented-state map. Nothing here is a plan.

## 1. Evidence levels

| Level | State | Basis |
| --- | --- | --- |
| SOURCE | Done | 7 owner modules, one UI label and the Native chat bridge projection; no SQLite DDL change |
| FIXTURE | Pass for every routing suite | Mock HTTP providers and temporary stores; no real provider and no model call |
| BUILD | Done | `dist/` emitted 06:49:26, `dist/ui` 06:52:48; `npx tsc --noEmit` exit 0 at 07:39 |
| RESIDENT | Running | Official restart 06:57:38 (receipt `3e0bbd23cf80445ebfe15dad76bc6673`, exit 0); the launcher relaunched Core at 07:22:22 (PID 12100) from the same `dist`; `/health` ok, version 0.15.0 |
| LIVE | **Not observed** | No real provider limit or key rotation by the new code, no `provider.route.decision` event from the resident, no Native task after the restart |

Snapshot note: the table above is the 07:50 state. For the final build (INSTALLED, RESIDENT since 09:46:21, one LIVE Native task) see sections 14 and 18.

## 2. Scope and constraints

- Donor: `9router-rotasi-fallback-terpilih-f39d8f0_1.zip` (sha256 `f6638392ad097f4f74c9610a8c5a4306a2cd25eac4320bd63065c594ad53c565`, MIT). Read-only; no code copied, no overlay. Used for behaviors only: sibling-first account fallback, typed per-key reasons, explicit "all limited" versus mixed reporting.
- No second retry worker, no second logging database, no new rotation owner.
- Final verification was manual and local (user instruction 2026-10-25 05:53): no model/API call with provider keys from `.env`. Fixtures use local mock servers. Superseded for one provider only: from 08:04 the user allowed model calls through Duanyan (route `atria`, all of its keys) and through nothing else; those calls are recorded in sections 18 and 20.
- Native Agent Core was used for test authoring only (section 7); the user asked to be told before any further Native call.

## 3. What existed and was kept, and what was missing

| Required behavior | Pre-existing owner (kept, unchanged) |
| --- | --- |
| Success keeps provider and key | Sticky global cursor in `provider_pool_state` (revision/CAS) |
| A/key1 → A/key2 → all A siblings → B | `PersistentCredentialScheduler` + `OpenAICompatibleProviderPool` |
| Separate failure classes and scopes | `classifyAgentProviderFailure`: REQUEST_INVALID, AUTH_INVALID, RATE_LIMIT, QUOTA_EXHAUSTED, CREDIT_EXHAUSTED, MODEL_ACCESS, MODEL_NOT_FOUND, MODEL_CAPACITY, PROVIDER_TRANSIENT, TRANSPORT_TRANSIENT, INTERNAL_CONTRACT; scopes request, credential, model-credential, model-provider, provider; breaker threshold 3 |
| Pinned models preserved | Pool replacement protection |
| Attempt-budget windows continue | `scheduleProviderResume` in `AgentChatService` + `provider-wait` checkpoint |

Gap fixed: a pause or switch could not say, per key, why a key was skipped, and "all keys limited" could not be distinguished from a mixed state. Selection order, classification, cursor/CAS and the schema were not changed.

## 4. What was added

- `agent-provider-state.ts`: `ProviderSkipReason` (excluded, invalid, disabled, rate-limit, quota, model-unavailable, cooldown, readiness, context, transient), `ProviderRouteStatus` (available, all-limit-or-quota, mixed, provider-open), `summarizeCredentialVerdicts`, `evaluateCredential`, read-only `diagnoseCredentials`; `selectCredential` accepts `excludedReasons`.
- Precedence in `evaluateCredential`: invalid, disabled, active cooldown or quota block (by cooldown reason), scope block (class mapped to reason), request-quota window (`rate-limit`), excluded. Class mapping: RATE_LIMIT → rate-limit; QUOTA/CREDIT_EXHAUSTED → quota; AUTH_INVALID → invalid; MODEL_ACCESS/NOT_FOUND/CAPACITY → model-unavailable; others → cooldown.
- Status rule: `provider-open` if the breaker is open; else `available` if any key is eligible; else `all-limit-or-quota` only when every key is rate-limit or quota; else `mixed` (an empty pool is `mixed`, eligible 0).
- `agent-provider-scheduler.ts`: read-only `diagnose(...)`.
- `agent-provider.ts`: `onRouting` events `attempt | failure | success | skip | paused` with transitions `initial | keep | sibling-key | provider-switch`; keys carry the public credential alias, never the secret; the paused error carries per-route diagnostics.
- `agent-controller.ts` / `agent-turn-events.ts` / `agent-turn-checkpoint.ts`: `noteRouting` emits secret-free `provider.route.decision` turn events and a bounded `routeTrail` (at most 32 JSON lines of 1000 characters) in the `provider-wait` checkpoint, restored by the next window.
- `agent-chat-service.ts`: `requestId` in the chat envelope. `src/ui/src/pages.tsx`: label "Rotating provider route". `scripts/external/native-chat-bridge.mjs`: projects `routing` and `requestId`.
- Release intent: `.changeset/native-provider-routing-evidence.md` (patch).

Fields asserted by the end-to-end fixture for a provider switch (illustrative, not a captured production event): `type=attempt`, `transition=provider-switch`, `attempt=1`, `attemptLimit=2`, `totalAttempts=3`, `from={a, a:02}`, `to={b, b:01, model-b}`, `left={providerId a, reason siblings-unavailable, diagnostics {configured 2, eligible 0, status all-limit-or-quota}}`.

## 5. Verification matrix → tests

| # | Requirement | Tests (file) |
| --- | --- | --- |
| 1 | Repeated success keeps key and provider | `keeps the successful global credential across sessions and reconstruction` (pool); `keeps the selected credential after success and reconstruction` (scheduler); `announces the sticky provider key once per turn and never rotates while it succeeds` (chat service) |
| 2 | A1 limited → A2 serves, B not called | `records key rotation inside a provider with cause, retry time and sibling counts` (pool); `rotates sibling keys, continues through the next attempt window and leaves secret-free evidence` (chat service: provider b receives no request in window 1) |
| 3 | All A siblings limited → B, exact cause | `leaves a provider only after every sibling is limited and states why in the switch` (pool); window 2 of the chat-service test; `starts another provider at its first eligible key despite its older rotation` (scheduler) |
| 4 | Mixed states never claim "all quota" | `reports mixed key states as mixed and never as all limited`, `reports all-limit-or-quota only when every key is a limit or quota`, `pauses an incomplete provider scan without claiming all keys are exhausted or jumping provider` (pool); 6 `summarizeCredentialVerdicts` cases and `PersistentCredentialScheduler routing diagnostics` (3) |
| 5 | 401/403/404/429/quota/5xx/timeout/payload/context kept apart; body signal beats status | `classifyAgentProviderFailure matrix` (15 cases, including `429 + insufficient_quota` and `403 + body quota/billing`); `separates limit, quota, authentication, model access, provider outage and attempt budget` (pool) |
| 6 | Window smaller than key count continues through chat resume | `does not claim exhaustion when the attempt window ends with an untried sibling` (pool); `skips cached readiness waits across attempt windows and reaches a compatible provider` (pool); chat-service window test |
| 7 | Restart, reconstruction, concurrency | `persists rate-limit failover across restart without a recovered key preempting it`, `serializes concurrent selections without rotating an eligible credential`, `shares a sticky failover key across sessions and restart without late outcomes moving it back`, `rejects a stale pool revision before any credential or rotation mutation`, `admits only one concurrent provider switch from the same pool revision` (scheduler) |
| 8 | Model pin, continuation, cancellation, replay | `does not silently upgrade a pinned OpenRouter model for a larger task`, `exhausts sibling keys on a pinned provider before selecting a different provider` (pool); existing, unmodified suites `native-chat-reliability` (8) and `native-provider-wait` (5); `stops a turn at a controller boundary without starting a provider request` (chat service) |
| 9 | No secrets in log, health, error, checkpoint, report | `no raw secrets in JSON.stringify(diagnostics)` (scheduler/state); the chat-service test asserts no `fixture-*` secret or `Bearer` text in events and window states; `keeps recovered or replaced keys behind the active pool key and stores no raw secrets` (scheduler) |

New tests: pool 6, chat service 2, scheduler 3 (controller-authored) + 15 + 21 (Native-authored, controller-corrected).

## 6. Commands and results on the final source

Last modification of my source files: 05:55:06. All times are local (UTC+7).

| Time | Command / run | Result |
| --- | --- | --- |
| 05:15 | Full suite on an **intermediate** source version | 23 of 313 files and 62 of 3302 tests failed (browser, memory, conversation-reading and similar families under CPU load). Not a final-version result and not re-run in full |
| ~05:56 | 11 affected files, final source | 151 of 152 passed; failure: `agent-controller` "expands a dynamic task-scoped grant…" (test later fixed by another session at 06:25:54) |
| 06:49 | `npm run build` | Log tail: path policy 470 files, 0 exceptions; browser transport current; `dist/` emitted 06:49:26. The exit-code line was not retained in the log |
| 06:52 | UI typecheck + vite build | `dist/ui` emitted 06:52:48; the bundle contains "Rotating provider route" |
| 07:39 | `npx tsc --noEmit` | exit 0 (4 s, incremental) |
| 07:39 | 15 Native-adjacent files, 133 s | 12 files passed; 169 of 173 tests passed; 4 failures below |
| 07:44 | `agent-chat-service.test.ts` alone | 7 of 8; same failure |
| 07:45–07:48 | Same file after the test-only fix, two runs | 8 of 8 and 8 of 8 |

Latest per-file results: scheduler 63/63, pool 22/22, controller 8/8 (the earlier failure is gone), chat service 8/8 (after the fix), bridge 3/3, provider-wait 5/5, readiness 13/13, provider 13/13, health 8/8, reliability 8/8, runtime integration 1/1, cumulative-learning 5/5, capability-disclosure 5/5. Combined from the 07:39 run and the two re-runs; the 15 files were not re-run together after the fix.

Failures at 07:39:

1. **Mine, test-only.** The end-to-end window test ended while the resumed run still held its execution slot; teardown `rm` failed with ENOTEMPTY (passed at 05:56, failed at 07:39 and 07:44). Fixed in the test by waiting for `chat.health().runningTurnCount === 0`; no product code changed.
2. **Not routing: `agent-capability-execution-parity`** (1 test): `approvedFamilies` returned 9 families where 3 were expected.
3. **Not routing: `native-donor-workflows`** (2 of 10): a debug copy of the test showed the scripted provider's own assertions failing — `read_file` succeeded where the test expected `AGENT_RUNTIME_TOOL_NOT_GRANTED`, and the browser call hit "Input validation error" instead of the expected action-restriction code — which makes the turn `resumable`. `agent-capability-resolver.ts` was last modified 2026-10-24 22:22, before this task; these tests were not updated. That they failed before my change is inferred, not measured. The temporary debug test file was deleted.

Memory suites: a 12-file batch (memory engine files, `memory-outcome-runner`, four Native-adjacent files) stalled. `memory-outcome-runner` finished in 490 s with 1 failed (`preserves a blocked partial run under independently replayable canonical names`) and 1 skipped of 12; no other per-file result line was written, the vitest process showed no CPU change and no output for 7+ minutes, and I terminated it at 07:39. The seven memory engine files were **not** re-run to completion. No file under `src/memory` or `tests/memory` imports `agent-provider*`, `agent-controller`, `agent-turn-events`, `agent-turn-checkpoint` or `agent-chat-service`; another session edited two of them at 06:24–06:25.

## 7. Contributions

| Actor | Work | Identity | Result |
| --- | --- | --- | --- |
| Controller (this Claude session) | Audit, design, evidence layer, pool/chat/scheduler-diagnostics tests, corrections to Native's tests, build, activation, docs | — | Sections 3–6 |
| Native round 1 | Draft test matrix | conversation `9e3ab1ea-50e2-49ad-a298-30c9500734f7`, turn `ee21b515-7076-4965-b858-7708ba48eada`, task `041b3f66-90bb-4096-8c54-2084b2a97986` | Started 04:47; `resumable`, `AGENT_RUNTIME_CONTINUATION_SIDE_EFFECT_RESULT_UNAVAILABLE` (side-effect guard); my own full test run starved the CPU at the time |
| Native round 2 | Write classifier and store-diagnostics tests | conversation `a3b976cd-e3ec-4940-be24-83c7d6deff3b`, turn `e37fbbc7-dd9d-4b51-854c-8e7b8bf76dfc`, task `c04dbca6-0554-4f8f-86aa-8a886e2d3931` | 04:58–05:14; `failed`, `AGENT_RUNTIME_MAX_TOOL_ITERATIONS_EXCEEDED`; no report; the test code it wrote was kept |
| Native round 3 | Finish the tests | same conversation, turn `ecb119d5-a29b-4fd5-9af3-485b459be5ea`, task `cabde6a2-23ba-4780-8e65-fdf71a4e7d32` | 05:16–05:23; `failed`, same code; no report. I fixed the remaining tests myself (corrections D1–D7) and moved Native's scratch scripts out of the repo root |

Native delivered no written report; its durable output is test code (classifier matrix, store diagnostics). The three rounds ran on the configured provider pool and consumed provider requests; per-request origin is not logged.

## 8. Orders observed in fixtures, with cause

Chat-service window test (provider a: keys a:01, a:02 both answer 429; provider b: b:01 answers 200; window of 2 attempts):

1. attempt a:01 → failure `RATE_LIMIT`.
2. attempt a:02 (`sibling-key`, cause `RATE_LIMIT`, total 2 of 8) → failure.
3. paused (`attempt-budget`, 2 of 2). Route a: configured 2, eligible 0, `all-limit-or-quota`, 2 attempts; route b: configured 1, eligible 1, `available`, 0 attempts. Provider b received no request; the checkpoint holds the five-line `routeTrail`.
4. Window 2, resumed through the chat timer: attempt b:01 (`provider-switch`, total 3), leaving a because `siblings-unavailable`; assistant text `window-two-result`. Provider a saw only `a1`, `a2`; provider b saw `b1`.

Pool and scheduler fixtures cover the other branches: success keeps the key; a mixed invalid/rate-limited pair reports `mixed`; an outage reports `provider-open` and marks no key quota-exhausted; a request-scoped failure rotates and cools nothing.

## 9. Pre-change production observations (DB evidence, read-only, 07:1x)

- OpenRouter free-tier daily windows reset at 00:00Z (07:00 local). At startup, readiness probing re-checks credentials whose readiness is missing or expired: openrouter:01–04 reported remaining 0 at 06:57:58 and probed `ready` at 07:22:5x. Older quota-class rows for keys 01–04 date from 10/24.
- The Native turns of section 7 produced no limit-class error; their only failures were transport timeouts on keys 05, 06 and 07, which opened and closed the OpenRouter breaker.
- The origin of an individual request is not logged, so the link between startup probes and the "limited" keys the user saw is *consistent with*, not proven. Whether the 20 OpenRouter keys share an account-level quota is unknown.
- gonka (18 keys, `pending / MODEL_CONTEXT_OR_TOOLS_UNPROVEN`) and atria (18 keys, `unavailable / MODEL_CATALOG_AUTH_UNCONFIRMED`) are re-checked at every start and at least every 60 s on selection; this is catalog-level, not an OpenRouter quota drain.

## 10. Findings left unchanged

- **OPEN — startup readiness cost.** `agent-runtime.ts` calls `provider.prepareReadiness()` at runtime creation; `ProviderModelReadinessService.ensure` performs a catalog fetch plus a real tool-probe model call per credential, cached 24 h if ready and 60 s otherwise; `agent-provider.ts` retriggers it when an expired non-ready record is selected. Every Core restart therefore spends free-tier requests. Whether to skip probes for keys known to be at a quota window is a user decision.
- **OPEN — HTTP 413 scope.** 413 and context-length text classify as MODEL_CAPACITY, scope model-provider, 10-minute cooldown. The fixture pins this as observed behavior, not as a design decision.

## 11. Not observed

Any live model call; a real rate-limit or quota event handled by the new code; a `provider.route.decision` event from the resident; the Native tool path and the UI after the restart (the label is only verified in the built bundle); the complete suite on the final source; the seven memory engine files; the exit code of the 06:49 build log. Update 10:10: the `provider.route.decision` event from the resident, a Native task after a restart and a model call are now observed (section 18); the other items stay unobserved (section 21).

## 12. Activation, rollback, side effects

- Backup before activation: `runtime/backups/routing-integration-20261025-064908` (previous `dist`, 745 files, and the 13 changed source files). Rollback: copy `dist` back, then one official restart.
- One official restart (06:57:38). It also stopped the manually started public MCP gateway and quick tunnel, so the Claude connector returned 502 afterwards; the local `agent-core` MCP route in the Claude Desktop configuration replaces it for this machine. An in-flight `start_process` was lost with the restart and recovered as outcome-unknown.
- The launcher relaunched Core at 07:22:22 on its own (no new receipt). I made no further build or restart.

## 13. Files changed

`src/agent-provider-state.ts`, `src/agent-provider-scheduler.ts`, `src/agent-provider.ts`, `src/agent-turn-events.ts`, `src/agent-turn-checkpoint.ts`, `src/agent-controller.ts`, `src/agent-chat-service.ts`, `src/ui/src/pages.tsx`, `scripts/external/native-chat-bridge.mjs`, `tests/agent-provider-pool.test.ts`, `tests/agent-provider-scheduler.test.ts`, `tests/agent-chat-service.test.ts` (including the 07:45 teardown wait), `.changeset/native-provider-routing-evidence.md`, `docs/CODEBASE.md`, this file. Files changed later the same day: section 22.

## 14. Evidence levels of the final build

| Level | State | Basis |
| --- | --- | --- |
| SOURCE | Done | Six source files and four test files changed after section 13 (section 22) |
| FIXTURE | Pass | 164 of 164 tests in the seven affected files, with mock providers and temporary stores. `native-donor-workflows` has two known failures outside the routing path (section 17; that they predate this work is inferred, not measured, see section 6) |
| BUILD | Done | `tsc --noEmit` exit 0; staging build exit 0, path policy 470 files and 0 exceptions |
| INSTALLED | Done | Six compiled files and their source maps; hashes identical to the staging build and unchanged at the 10:00 re-check |
| RESIDENT | Running | Node listener PID 18552 since 09:46:21 after one official restart; `/health` `ok`, version 0.15.0 at 10:00 |
| LIVE | Partly observed | One Native task ran end to end on Duanyan (`atria`) and emitted a `provider.route.decision` event; two orphan tasks were settled; all 18 `atria` credentials are ready (section 18). **Not observed:** rotation under a real limit, a sibling or provider switch, an attempt-window resume (section 21) |

## 15. Stuck sessions: finding, cause, repair (07:49 onward)

Trigger: the user could not archive two Native R4 sessions (`AGENT_RUNTIME_SESSION_HAS_RUNNING_TASK`, screenshot).

- Cause (SOURCE and DB): `AgentRuntimeService.ensureActiveSession` and `closeSession` refuse a session that has a `running` task. A stop that arrived between task creation and the model loop ended the chat turn (`stopped`) but never ended its runtime task, and nothing settled it afterwards. The two orphans: task `68a97484…` (conversation `dd74e9b6…`, "Native R4 resident readiness 20261024") and task `b9698d6c…` (conversation `86fcf373…`, "Native R4 resident readiness v4"), both `running` since 10/23.
- Controller (`agent-controller.ts`): the `model-ready` checkpoint now sits inside the main try block, so a stop before the model loop ends the task through the normal terminal path.
- Chat layer (`agent-chat-service.ts`): `settleEndedTurnTask` settles the runtime task of a `stopped`, `failed` or `interrupted` turn. One in-flight settle per task (concurrent callers join it); `markTerminal` (`failed`, reason `task-complete`) only while the task is `running`; `finalizeTask(awaiting-verification)` only by the settler that ended the task; waits bounded to 10 s (`settleWaitMs`); errors logged by code (`AGENT_CHAT_TASK_FINALIZE_FAILED`, `AGENT_CHAT_TASK_SWEEP_FAILED`); it never rejects. It runs at startup, before send and archive (on a running-task conflict: sweep, then exactly one retry), on stop, and when an executor ends (the executor removes only its own `activeTurns` entry). It makes no model call and replays no tool.
- Store (`agent-chat-store.ts`): `listEndedTurnTasks` ignores turns whose runtime task id is empty.
- Tests added: six in `agent-chat-service.test.ts` (archive right after stop, concurrent archive joins the settle, no finalize when another settler ended the task, failing store query at startup, hanging finalization with `settleWaitMs=25`, newer executor registration kept) and one in `native-chat-reliability.test.ts` (empty runtime task id ignored).

## 16. Provider-side changes made while moving to Duanyan

- Readiness (`agent-provider-readiness.ts`): Duanyan's catalog uses schema 2.x with per-modality objects (`input_modalities` / `output_modalities` entries carrying `max_context_length`, `supported_parameters` and `max_length` / `max_tokens`). The parser before this change did not read that layout. Context, output limit and tools support are now taken from the text-output entry (top-level catalog fields still win); entries whose `output_modalities` objects contain no text modality (embedding, reranker, speech) are skipped and never probed; `tools` counts as supported only if the key exists and is not `false`, `null` or `{supported:false}`. `Atria-Dawn` resolves to context 524288 and output 524288.
- Errors (`agent-provider-errors.ts`): `quota_exceeded` and `insufficient_quota` are matched as whole tokens instead of substrings, so a 429 with `tpm_quota_exceeded`, `rpm_quota_exceeded` or `concurrency_quota_exceeded` is RATE_LIMIT (90 s) and no longer a long quota cooldown.
- Config (`config.ts`): default `requestTimeoutMs` 60 s to 180 s (the environment override is unchanged); readiness catalog requests use `min(requestTimeoutMs, 15 s)`.
- `.env` (two lines changed by a scripted edit with a before/after hash check; sha256 prefix `d4c58643631050c0` to `861034d9d9e59367`): `ATRIA_BASE_URL=https://discovery-api.intern-ai.org.cn/v1`, `ATRIA_MODEL=Atria-Dawn`. Provider order `atria,gonka,openrouter` (OpenRouter last, user instruction 08:12); `AGENT_CORE_AI_MAX_PROVIDER_ATTEMPTS=18`. The user states that each Duanyan key belongs to its own account; the controller did not verify that.
- Tests added: readiness (an embedding model is never probed; `tools` `false`, `null` and `{supported:false}` stay unproven; `{type:'boolean'}`, `true` and `{supported:true}` are ready) and errors/scheduler (the three per-minute and concurrency quota codes are RATE_LIMIT; a word-boundary case).

## 17. Verification and activation of the final version

Local times (UTC+7). Results are for the final source. The complete suite was not re-run.

| Step | Result |
| --- | --- |
| `npx tsc --noEmit` | exit 0 |
| Seven affected test files | 164 of 164 passed, including 19 new tests |
| Five further files that import the changed modules | all passed |
| `native-donor-workflows`, alone | 8 passed, 2 failed: the known failures (dynamic `read_file` family discovery; a restricted browser action ending `resumable`). A third failure ("binds a verified seed revision…") appeared once while the staging build ran at the same time (74 s run) and did not reproduce alone, so it is load-dependent, not a regression |
| Staging build (`dist-staging`) | exit 0; path policy 470 files, 0 exceptions |
| Backup before install | `runtime/backups/native-activation-20261025-0947`: previous compiled files, changed sources and tests, `.env` before, `state.json`, `chat.sqlite`, `provider-state.sqlite`; manifest `backup-manifest3.json` |
| Install | six compiled files and their source maps, copied with a compare-and-swap check; installed hashes identical to the staging build (`config.js` `1fa962dc…`, `agent-provider-errors.js` `0a3e4e2f…`, `agent-chat-service.js` `247a54c2…`, `agent-chat-store.js` `dd3cdd60…`, `agent-provider-readiness.js` `66c3b57c…`, `agent-controller.js` `ffb3728e…`); import closure 331 files, 0 missing |
| Restart | one official restart; new Node listener PID 18552, started 09:46:21 |
| Re-check at 10:00 | `/health` `ok`, version 0.15.0; PID 18552 unchanged; the six installed hashes still match |

Rollback: copy the previous compiled files from the backup (and `config\env.before` only if the Duanyan switch must be undone), then one official restart. Earlier backups: `routing-integration-20261025-064908`, `stuck-session-duanyan-20261025-082729`, `native-activation-20261025-0854`.

## 18. Live observations after the restart

- Orphan tasks (`state.json`, read-only): `68a97484…` and `b9698d6c…` became `finalized` with finalization `complete`; running tasks went from 2 to 0. A later read shows 74 tasks `finalized` and 1 `awaiting-review` (`7ee2f008…`, not one of the orphans), 0 running. Both conversations now have status `archived` in `chat.sqlite` and no ended turn is left in an active conversation (the sweep scope). The controller did not archive them, and the database does not record who did.
- Readiness (provider state, read-only): at the first pass after the restart 17 of 18 `atria` credentials were `ready` (`MODEL_TOOL_PROBE_VERIFIED`, `Atria-Dawn`, context 524288, output 524288) and `atria:06` was `MODEL_CATALOG_UNAVAILABLE`; at 10:00 all 18 are `ready` (`atria:06` re-probed at 09:55:54). The `provider_pool_state` cursor is `atria:01`, revision 124.
- Native task on the final build. The controller ran `scripts/external/native-chat-bridge.mjs` from the Core shell, which carries the UI token in its environment; the controller never read, printed or stored the value, and the bridge redacts it. Brief: read the first five lines of `subagents/CLAUDE_CODE_HOST.md`, answer with its title in one sentence, at most two tool calls, no writes.
  - Identities: conversation `0f053c14-e70a-4dbd-b25e-d774955a283c`, runtime session `26e7cb8d-dd10-48ad-88f4-23528be9cd4c`, turn `bac62fcb-217f-420c-886b-9924878faaed`, task `6055d59c-0dd5-4731-b1c8-e6a13c8a7b4f`, request id `controller-smoke-20261025-1`; 09:55:30 to 09:57:16.
  - Events in order: `turn.accepted`, memory recall (3 items), `agent.planning`, one `provider.route.decision` (attempt 1 of 18, transition `keep`, no cause, `atria:01` to `atria:01`, model `Atria-Dawn`, 18 configured, 17 eligible, skipped `{readiness: 1}`, breaker `CLOSED`, status `available`, total attempts 1 of 432), `read_file` started and completed with success, verification and Learning finalization, `assistant.final`. No failure, skip, pause or switch event.
  - Result: `finalized`; 5 iterations and 5 model calls, all identified as `atria` / `Atria-Dawn`; 1 tool call, 0 tool failures; `learningStatus` `complete`; `jobVerification` `unavailable`. The answer is correct ("Raka di host Claude Code dan model Anthropic", the first heading of the file). Model time 85.2 s, recall 6.1 s, tools 0.03 s.
  - Tokens, as reported by the provider on 5 of 5 calls: input 59,005, output 776, total 59,781.
  - Reading: the final build runs a Native task end to end on Duanyan, emits the secret-free routing event and keeps provider and key while calls succeed. The key chosen, `atria:01`, is both the stored cursor and the first configured key, so this run does not show that the sticky cursor outranks the `.env` order. The conversation `0f053c14…` is still `active` (its turn is finalized) and can be archived from the UI.

## 19. Reviewer reconciliation

One independent review by a Claude subagent that received only the text of the `dist` to `dist-staging` diff and the acceptance criteria (C1 stuck-session repair, C2 nested catalog, C3 `quota_exceeded`, C4 timeout). It ran no tools and executed no code. It is not a cross-model review: no non-Claude reviewer was used. Its 12 findings (finding 11 had two scenarios, listed as 11a and 11b) and the disposition recorded here:

| # | Finding (severity) | Disposition |
| --- | --- | --- |
| 1 | Send or archive right after Stop can still hit the running-task error because the retry needs `settled > 0` (medium) | Fixed: one retry after the sweep regardless of the count; the sweep joins the in-flight settle. Tests: archive after stop, concurrent archive |
| 2 | Settlers not deduplicated; `finalizeTask` ran even when `markTerminal` failed (medium) | Fixed: in-flight map per task; finalize only by the settler that ended the task. Test: no finalize when another settler ended it |
| 3 | Nested parsing qualified non-chat models and `tools: false/null` (medium) | Fixed (section 16); tests added |
| 4 | Nested output limit is not capped by the context window (medium) | **Declined.** The reviewer could not establish what `max_length` means. Live: `Atria-Dawn` reports output 524288 equal to context 524288 and five calls on it succeeded, so no rejection was observed; capping would change healthy flows without evidence. Residual: a catalog whose `max_length` is a total sequence length, on a provider with a smaller output cap, could receive an oversized `max_tokens` |
| 5 | `settleOrphanedTasks` had no error guard (medium-low) | Fixed: the store query is guarded (`AGENT_CHAT_TASK_SWEEP_FAILED`). Test: failing query at startup |
| 6 | The startup sweep re-checks all history; turn end waits on runtime I/O without a limit (medium-low) | Fixed in part: empty task ids are filtered and waits are bounded to 10 s (test: hanging finalization). Not done: loading the set of running tasks once. The scan covers only active conversations (0 turns in scope at the post-task read, section 18) |
| 7 | A running task that no ended turn references is never settled (medium-low) | **Declined.** The fix needs a registry of live task ids (a new owner) and the reviewer could not show the creation order that produces such a task. Residual: such a task would keep blocking archive and would have to be found by hand |
| 8 | Nested catalog values now outrank a pinned route's configured values (low-medium) | Accepted and documented: when the catalog provides nested values they take priority over the route's configured continuation values (top-level catalog fields still come first); a pinned model whose nested parameters lack a `tools` entry is reported unready and never substituted |
| 9 | The `agent.planning` emit is still outside the try (low) | Accepted and documented: the chat-layer settle when the executor ends is the backstop, and it acts only when the turn row is already in an ended status at that moment |
| 10 | `quota_exceeded` matched as free text (low) | Fixed (section 16); tests added |
| 11a | The executor `finally` deleted its `activeTurns` entry unconditionally (low) | Fixed: delete only if the entry is still this executor's controller. Test: newer registration kept |
| 11b | A staged build run against the live data folder (low) | Declined as a code change. Operating rule: do not run a staged build on the live data folder. None was run |
| 12 | The longer timeout lengthens the stuck window; readiness may share the timeout (low) | Accepted and documented: catalog requests now cap at 15 s; that the stop signal reaches the provider fetch, and the probe timeout, were not verified |

Minor notes from the reviewer, not changed: reason `task-complete` is recorded with a failed outcome for stopped turns (Learning wording); the `status` field returned by `listEndedTurnTasks` is unused.

## 20. Token accounting

| Item | Tokens | Basis |
| --- | --- | --- |
| Native task on Duanyan (section 18) | 59,781 (59,005 in, 776 out) | measured: provider usage on 5 of 5 calls |
| Duanyan readiness probes (17 credentials at the first pass, `atria:06` again at 09:55:54) | not measured; estimated at a few thousand in total | estimate from a few hundred tokens per tool probe, not a measurement |
| Raka smoke test (Claude Code subagent with `raka.md` pasted into its brief) | 86,374 | measured by the subagent runner; Claude-side, not Duanyan; about ten times the earlier estimate |
| Review subagent (section 19) | not recorded | |
| Native rounds 1 to 3 (section 7) | not recorded | ran on the provider pool of that time |

## 21. Not observed, and residual risks

Not observed on the final build: a real rate-limit or quota response from Duanyan handled by the new code; key rotation from `atria:01` to `atria:02`, a sibling switch or a provider switch outside fixtures; an attempt-budget pause and its resume through `scheduleProviderResume`; the `mixed` versus `all-limit-or-quota` classification on a live provider; the sticky cursor outranking the `.env` order (the cursor and the first key coincide); replay protection for side-effect tools beyond fixtures; the complete test suite and the seven memory engine files; a stop-then-archive sequence run by the controller on a live session (the two old sessions are archived, but the database shows the result, not the sequence); Raka resume through `SendMessage`.

Residual risks: reviewer findings 4, 7 and 11b (declined) and 8, 9 and 12 (accepted) in section 19; the open items of section 10 (startup readiness spends one tool-probe call per credential at each restart, 18 for Duanyan, and the 413 scope); the failures listed in section 6 that are outside the routing work were not investigated here; the controller's shell carries the Core UI token in its environment, so any process started through `start_process` can authenticate to the UI endpoints.

## 22. Files changed after section 13

Source: `src/agent-chat-service.ts`, `src/agent-chat-store.ts`, `src/agent-controller.ts` (the `model-ready` checkpoint inside the try block), `src/agent-provider-errors.ts`, `src/agent-provider-readiness.ts`, `src/config.ts`. Tests edited: `tests/agent-chat-service.test.ts`, `tests/agent-provider-scheduler.test.ts`, `tests/agent-provider-readiness.test.ts`, `tests/native-chat-reliability.test.ts` (the other affected test files ran unchanged). Configuration: project `.env` (two lines). Documentation: `docs/CODEBASE.md`, `docs/Duanyan-Provider-Configuration-20261023.md`, this file, `subagents/README.md`, `subagents/CLAUDE_CODE_HOST.md` (new guide for calling Raka from a Claude Code host), `.changeset/native-stuck-session-duanyan.md`.
