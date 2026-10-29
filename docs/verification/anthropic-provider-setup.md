# Anthropic provider setup and launcher recovery

Task: `anthropic-provider-setup-20261028`. Date: 2026-10-28 (Asia/Tomsk).
Baseline source: `07c07d83ab5175b5fe15f49165a469b8d5b09a05`; initial tracked worktree was clean.

## Scope and decisions

- Extend the existing provider/config/readiness owners. Keep scheduler, persisted message contracts, UI route discovery and tool grants unchanged.
- The named `anthropic` route selects Messages wire conversion; no new SDK, dependencies, service, schema migration or provider abstraction.
- Append exactly three missing empty numbered Anthropic key slots to `.env`, preserving other bytes and existing values. Readback confirmed one occurrence of each slot and all three empty. No secret values were emitted.
- Existing `ANTHROPIC_MODEL` and `ANTHROPIC_BASE_URL` overrides are supported; the default model is `claude-sonnet-5-5`. Explicit routing order remains authoritative.

## Source inventory and workflow application

- Original publisher: Anthropic. [Official API overview](https://platform.claude.com/docs/en/api/overview), [Messages reference](https://platform.claude.com/docs/en/api/messages/create), [model metadata](https://platform.claude.com/docs/en/api/models/retrieve), [models overview](https://platform.claude.com/docs/en/models/overview), [API version history](https://platform.claude.com/docs/en/api/versioning), observed 2026-10-28.
- Official docs link the `anthropics/anthropic-sdk-typescript` repository. No SDK source was copied or installed; its revision/license is not an implementation dependency. Integration uses the documented public REST contract, pinned request header `anthropic-version: 2023-06-01`.
- `replica-recon` adapted to the user's bounded API integration: source inventory, request/tool flow, feature gaps and limits. The existing code had OpenAI-compatible transport only; Anthropic adoption-test filenames did not establish a Claude provider.
- `api-and-interface-design` applied: retain internal `AgentModelMessage`/response/error contracts, add conversion only at the external boundary and validate incoming tool/usage payloads.
- `debugging-and-error-recovery` applied: inspect direct startup evidence, check process identity and timing, run the sole official restart path once, then verify health independently.
- The initial ChatGPT connector handshake returned `Internal error`; local source reads were used without claiming native instruction delivery. The local Agent Core MCP surface subsequently became available: a fresh independent handshake, canonical Memory inspection and host-bound episode `ext-4760037be61a416e979c666662c35e95` succeeded. The selected native Skill bodies were then delivered contiguously through their final fragments. The unbound connector attempt was not reused as a task/session receipt.

## Launcher evidence

Observed startup error: `Agent Core Windows process-state query timed out.` at `2026-10-28T12:01:34Z`, in `GetOwnedServiceProcessesAsync` before Core launch. Port 8765 had no listener. A later isolated Windows PowerShell probe completed in 497 ms unfiltered and 401 ms with a Node-name filter; persistent slowness was not reproduced.

Official restart receipt: `runtime/restart/cd84a2947caa456ab20e6748023823a1.json`. One launcher was opened (PID 8060). The restart worker reported no HTTP answer within its 60-second readiness window; this was not treated as success evidence. Subsequent actual `/health` returned `status: ok`, version `1.6.0`. Activity Tracker recorded `service-listening` at `12:10:48Z`, execution available, gateway 8788 ready and tunnel ready at `12:11:05Z`.

Claim: the stopped runtime recovered; a permanent root-cause fix for intermittent Windows process-query timeout is not established.
Observed: startup timeout, bounded probe timings, restart receipt and subsequent HTTP/activity evidence above.
Inferred: the initial startup failed in process discovery; the underlying cause of transient latency is unknown.
Rival: a permanently invalid Node/configuration would continue failing after the restart; the recovered service argues against it.
Test: official restart and independent health observation recovered the runtime.
Flip condition: a recurring startup timeout or loss of HTTP readiness requires renewed process/host-load diagnosis; confidence is limited to the observed recovery.

## Verification status

- Initial focused provider/readiness/pool tests: 66/66 passed across three files.
- Anthropic transport/pool focused tests: 22/22 passed, including Sonnet/Opus 5.5 signed-block ordering and workspace header propagation. Initial seven-file integration run: 144 passed, 3 controller tests exceeded the existing 15-second deadline; cleanup raced unfinished timed-out work. The isolated controller run passed the new signed-content test but timed out in three different existing tests. Final seven-file run with one worker and a bounded 60-second test deadline: **149/149 passed**, 127.15 seconds; assertions were unchanged. No latency improvement is claimed.
- `npm run build`: passed. Path policy 506 authored files / 0 exceptions; Skill ownership 42 sources / 45 managed artifacts; project structure 471 directories matches its existing map. Open Browser Use transport was already current; TypeScript compilation exited zero. No dependencies, tools, launcher or UI builds were installed or changed.
- Review found and corrected two issues before activation: structured unsigned-input redaction handles escaped quotes without corrupting JSON, and absent workspace metadata preserves all existing readiness-cache digests. Regressions cover both. The graph provider reported current and bounded impact identified provider/pool/runtime completion consumers; exact current source and targeted tests remain authoritative because newly added fields were not established by old graph anchors.
- Final resident activation: completed through exactly one `restart_agent_core(capabilitiesChanged=false)` after the successful build. Receipt `runtime/restart/b49cd4e881094c96a283b8e7f5bb9bec.json` opened launcher PID 17656; its 60-second readiness sample again ended before Core became ready. Independent subsequent HTTP health: `ok`, Native `available`, Node PID 18776 started `2026-10-28T12:45:53.802Z`, newest dist `12:42:42Z`, `build.stale=false`. This is separate from the earlier incident-recovery restart. No client tool refresh was required for this internal provider change.
- Read-only resident SQLite verification matched each compiled configuration digest to its active readiness row: `anthropic:01`, `:02`, `:03` all `ready`, reason `MODEL_TOOL_PROBE_VERIFIED`, model `claude-sonnet-5-5`, context 1,000,000 / output 128,000. Real runtime tool probes completed at `12:47:47.133Z`, `12:47:48.284Z`, `12:47:49.247Z`. These exercised the compiled provider, workspace header and tool protocol after activation. The user subsequently authorized the Native chat extension below; visual UI rendering remains untested.
- Initial empty slots were subsequently populated by the user; values were used inside subprocesses and never displayed or stored in this report.

## User-authorized live API verification

All requests used the direct `api.anthropic.com` endpoint and `claude-sonnet-5-5`; no CLI managed key was copied. Requests with ambiguous transport outcomes would not be retried automatically.

| Slot | Observation | Inspectable request IDs |
| --- | --- | --- |
| 01 | Model metadata HTTP 200 (1,000,000 input / 128,000 output); initial message returned `Halo`, 23 input / 5 output tokens; two consecutive questions returned `42`, then `84`, HTTP 200 each. | `req_011CgUdydTw6DqRdq98AWXDK`, `req_011CgUdyfgNxVh1jk4ECnNXM`, `req_011CgUeCMPeurtDqhDxDBBw5`, `req_011CgUeCSKKBwttvK63czGkH` |
| 02 | Initially HTTP 400: organization-scoped key required `anthropic-workspace-id`. After using the workspace ID returned by slot 01's authenticated model response, the same two questions returned `42`, then `84`, HTTP 200 each. | Failure `req_011CgUeMaXgRHr2bS82RZWdA`; recovery `req_011CgUeSDcV1FpvvkcAsY4f1`, `req_011CgUeSJbNj5p3uLS4P7pav` |
| 03 | Two consecutive questions returned `42`, then `84`, HTTP 200 each. | `req_011CgUeMcEdHYkTbMYUvnrUs`, `req_011CgUeMh74jX36LWwGNBUBk` |

Each two-question test asked `Berapa hasil 17 + 25? Jawab angka saja.` followed by `Kalikan hasil jawabanmu sebelumnya dengan 2. Jawab angka saja.` with the first assistant content carried into the second request. Each successful pair reported 31 + 71 input tokens and 3 + 3 output tokens. The signed-block API settings match the new adapter: adaptive thinking, omitted display and the binding-controls beta with `drop_block`.

The verified workspace mapping was added as `ANTHROPIC_WORKSPACE_ID` in `.env` so the organization-scoped slot works in the existing pool. There are still exactly three numbered API-key slots; this fourth Anthropic setting is a workspace identifier, not a credential. The earlier manual-key `low balance` report was not reproduced; the observed slot-02 error was specifically workspace scoping. The local Claude CLI reported a `/login managed key` in a different organization ID, so its successful execution was not proof about the new manual keys' billing identity.

The screenshots show promotional credit applicable to API and an expiry of 2026-10-31 UTC. Successful inference proves API access, not which credit bucket was debited. That attribution requires matching these request IDs with the user's Console Usage/Billing view.

## User-authorized Native chat extension

Created persistent chat **Tes Claude Anthropic**, conversation `6ce8135a-5f1e-4ab0-b966-be02efc7d47c`, runtime session `7434f7aa-fc56-4877-9ced-ab69410fc36e`, using the existing `native_chat_bridge`. Two sends used distinct stable request IDs and explicit `providerId: anthropic`; neither was replayed. A separate readback returned all four persisted user/assistant messages and both finalized turns, with preferred provider/model `anthropic / claude-sonnet-5-5`.

| Turn | Result and identity | Observed metrics |
| --- | --- | --- |
| `ced75a2e-c33d-4777-8ae6-7aae74b57cdf` | First question answered `42`; runtime task `a1938dc3-1fdb-4f58-b8f1-ad6a958ee3cc`, one attempt on `anthropic:01`, Native Learning complete. | 20,742 input / 112 output tokens; model 9.697 s; recall 29.120 s; bridge elapsed 82.372 s. |
| `80d32211-9950-4d2f-834d-4a432b1c8800` | Follow-up answered `84`; runtime task `57437c29-ae47-43b5-af76-71c26cfec3e4`, kept `anthropic:01`, one attempt, Native Learning complete. | 21,735 input / 112 output tokens; model 7.719 s; recall 47.386 s; bridge elapsed 108.762 s. |

Each Native turn ran zero ordinary tool actions. `jobVerification: unavailable` is expected to remain distinct from these independently checked arithmetic answers and persisted chat evidence. The first final answer included two pre-existing host proposal reminders (`windows-powershell-host` revision `3571326a…`, `skill-authoring` revision `913088e3…`); neither was created, approved or activated by this integration. The second answer was exactly `84`.

Native inputs include Agent Core instructions/context, so the small direct API test cost does not represent Native-turn cost. The two Native turns observed 42,477 total input and 224 output tokens; a standard uncached estimate at the inspected Sonnet 5.5 rates ($2 / $10 per million input/output tokens) is about $0.0872. Actual credit-bucket debit and any caching adjustment were not read from Billing. The long observed recall/host overhead was not optimized in this task.

After the Native extension, the external Learning owner rejected the additional checkpoint with `LEARNING_EXTERNAL_SCOPE_UNAVAILABLE: scope-unavailable`. A read-before-retry recovery resumed the same external episode/task identity, but returned `memoryTask.status=unavailable`, `EXTERNAL_CONTINUITY_STALE_TASK`; status showed no additional pending checkpoint. A subsequent attempt was rejected before mutation with `LEARNING_EXTERNAL_SCOPE_UNAVAILABLE: no-task`. No further replay or task-identity substitution was attempted. The earlier provider-setup checkpoint/review is complete and both Native turns independently report `learningStatus=complete`; the additional external checkpoint and final canonical Memory task update remain unavailable. This fail-soft administrative limitation does not invalidate the persisted Native chat or verified provider result. Safe continuation is to inspect/reconcile this same host-bound task linkage before any retry, retaining this report and existing checkpoint history.

## Final action ledger and evidence identity

- Source/config changes: `src/agent-provider.ts`, `src/agent-provider-readiness.ts`, `src/config.ts`, `src/agent-controller.ts`, `src/agent-turn-checkpoint.ts`; `.env` gained three key slots initially and the verified workspace setting; user supplied all credential values. `.env.example` documents the format and optional overrides. Existing provider ordering was preserved; Anthropic is additionally available through the existing dynamic route selector.
- Checks: provider, readiness, pool, controller, durable continuation and compaction tests; build/path/ownership/structure checks; direct real API messages; independent HTTP health and read-only current-digest runtime qualification. Whitespace check passed with the repository's existing CRLF files recognized (`git -c core.whitespace=cr-at-eol diff --check`).
- Ordinary deliverables: this report, the relevant `docs/CODEBASE.md` owner-map entry and behavior paragraph, and pending minor release intent `.changeset/anthropic-native-provider.md`. No version application, commit, push, release publication, download, dependency install, UI/launcher source/configuration change, or additional service was performed.
- Canonical Memory task progress was checkpointed and read back after the local MCP recovered. The first attempted critical-item replacement was rejected with `MEMORY_PRESERVATION_REQUIRED`; it was reconciled by retaining/resolving the old item and appending the new evidence-linked action. There was no blind replay or alternate memory store. Learning completion is recorded separately by its owner.
- Learning finalization: task checkpoint `anthropic-provider-setup-20261028-complete`, reason `verified-recovery`, followed by exact-key semantic review. Review is complete with disposition `awaiting-verification`: one architecture candidate remained a proposal because the owner could not resolve sufficient evidence; no new durable knowledge or Skill was promoted. The task's actual tests/API/runtime results above remain separate from that Learning disposition. Recorded Skill applications retain host outcome `unavailable`; full delivery and workflow application are not claimed as independently measured benefit.
- Remaining limits: UI rendering was not tested; automatic prefix-block dropping can cost more tokens; the startup process-query timeout's host-level cause remains unknown; exact promotional bucket debit is not proven by successful API calls or dashboard cents.

SHA-256 at activation:

| Artifact | SHA-256 |
| --- | --- |
| `src/agent-provider.ts` | `445612208e4ae50a2b8005c8fb60f93d15fd80ff582a6bf46ab92cc094e0dbe9` |
| `dist/agent-provider.js` | `3f7ee454e48552086a9d1713d315ea7d075f384a6775fd8a7fbe66ba451fc011` |
| `src/config.ts` | `e7e8e5476662f8aad15738d0a0d46796339780ee74494079688c951b62df8081` |
| `dist/config.js` | `3bd55c2f7884484a90bac099c29199a946d114dbdc26897575614d8e939e3fb6` |
