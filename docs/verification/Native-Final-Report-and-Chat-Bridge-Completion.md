# Native Final Report and Chat Bridge — completion evidence

Date: 2026-10-27 (Asia/Bangkok). Status: COMPLETED — full implementation,
acceptance, activation and Learning review recorded below.

User scope: complete both named proposals, not partial completion. Main owns the
iteration-limit report and integration validation; Raka owns the external chat facade.
Main takes over bridge integration after its report implementation passes.

## Performance contract

- Workload: ordinary Native chat turns plus the exceptional path reaching the fixed
  tool-iteration budget; external list/read/create/send/cancel via the existing loopback
  chat service. Historical provider latency is not a target or a new measurement.
- Objective: preserve findings and next-turn continuity with bounded exceptional work;
  preserve addressable/idempotent bridge operations without unbounded buffering or retries.
- Limits: at most one additional no-tool provider attempt if budget remains; report
  persisted within 4,000 characters and 250 words including its incomplete label;
  no extra tool calls and no normal-turn report call.
  The bridge bounds HTTP response, stream line, record and total output; child process
  startup is measured separately from provider latency.
- Measurement boundary: deterministic provider fixture → controller → transactional
  chat store → reopen/replay/next context; bridge child start → bounded JSON envelope.
  Fixture duration is not an end-to-end provider speedup or a production percentile.
- Guardrails: turn remains failed/unverified; stop/stale claims cannot write late reports;
  exact request IDs prevent duplicate messages; external messages cannot mint operator
  approval evidence; no Native capability/grant expansion or new service/store.

## Root causes and source changes

- The old controller emitted a report on `turn.failed`, then emitted a second failure
  without text. ChatService discarded the report while failing the turn; context selected
  only finalized assistant messages. Red regressions demonstrated all three failures.
- Main retains a single failure event and transactionally stores the labelled incomplete
  report using existing tables. The same failed turn replays once and contributes its
  report to later bounded context, without becoming finalized or resumable.
- External loopback sends previously reached trusted operator command handlers.
  Explicit external origin now bypasses both artifact and Skill approval handlers.
  An additive nullable turn-origin column preserves new provenance; old history stays
  unknown. Existing local-operator behavior and schema-version compatibility remain.
- Main found and repaired missing release support for the adapter script with an exact
  file allowlist, not a copy of the external-scripts directory or operational state.
- Independent Raka review found recovery could redispatch the optional report after a
  crash. The optional schema-1 checkpoint now durably records its attempt before network
  dispatch and its bounded response before terminalization. Recovery uses that marker,
  counts provider/model/usage work correctly, and never redispatches a recorded attempt.
- A secret fixture demonstrated the old CLI only removed the UI token. The adapter now
  applies the existing general redactor to every emitted record as well as the UI token.

## Verification results

- Main RED: four targeted failures (duplicate events, missing persistence, external
  operator impersonation). Initial GREEN: 49/49 controller/chat/store/report tests.
- Packaging RED: adapter missing from stage; secret-redaction RED: three failures with
  `password=not-a-real-password`. Both repaired through existing owners.
- Final [scoped raw tests](native-chat-and-limit-report-tests.json): **120/120 PASS**,
  10 files: controller, chat service/store, report persistence, CLI/facade, HTTP transport,
  MCP manifest, release staging and durable continuation. Includes an explicit assertion
  that the incomplete label counts toward the 250-word persisted limit.
- [Recovery raw tests](native-limit-report-recovery-tests.json): **44/44 PASS** from the
  pre-activation controller/checkpoint/store run. Recovery simulates a crash after durable
  report response and verifies unchanged total provider calls after resume.
- [UI raw tests](native-chat-ui-tests.json): **11/11 PASS**, including external list/active
  transcript refresh, saved failed report visibility and preserved composer draft.
- Final focused escaped-preview bound check: `npx vitest run tests/native-chat-bridge.test.ts
  -t 'bounds a truncated record' --reporter=dot`, **1 PASS / 4 skipped**, exit 0,
  2026-10-27 04:15:34 local. Ten assistant messages with 20,000 backslashes each
  produce an explicit truncated JSON record within 128 KiB after preview escaping.
  This additional assurance required no product-source change or second activation.
- `npm run build` passed; project-local .NET launcher publish passed. Installed EXE SHA256:
  `1de9fab04567408137881bb5ac95d0a4de459a07105e50be676fa201f17e49d4`.
- One official restart: `runtime/restart/dbf3f721e738486889b63f925c869412.json`, exit 0,
  no error; new core PID 1664 started 2026-10-26T20:56:38.381Z. Post-activation `/health`
  is `ok`, build stale=false, compiled dist newest 2026-10-26T20:56:02Z. No second restart
  for client caching.

## Resident facade acceptance

[Raw resident receipt](native-chat-resident-acceptance.json), generated by
`scripts/verify/native-chat-completion.mjs --api-key`, records actual authenticated
MCP discovery and tool calls against the existing resident, not an imported mock.

- `tools/list`: 83 tools, including `native_chat_bridge`; same facade create/list/read/send
  path used by production MCP registration. Native exclusion and 128 KiB schema budget
  remain verified by the real server manifest fixture.
- Isolated conversation `c9f1cb50-fed2-40e6-92ac-b314732020de`, turn
  `0233c066-dec8-4a93-baaa-05ab74b79c5e`, request
  `native-bridge-full-acceptance-20261027`: actual response `BRIDGE_PHASE_B_OK`, finalized,
  external-controller origin. One user + one assistant message, one model call, zero tools,
  Native Learning complete. This proves conversation transport, not software-task reasoning.
- Same request replay returns `replayed:true`; repeated readback still one turn/two messages.
  List contains the same canonical conversation ID.
- Missing conversation read returns bounded `agent_chat_conversation_not_found`; missing
  turn cancel returns bounded `HTTP_404` (`stopped:false` from existing API). Both are
  `isError:true`, respectively 61 and 36 output bytes in the final run. No turn added.
- Host API/UI token values were compared in-process against serialized evidence and absent.
  Values were not printed, copied into evidence, changed or sent off loopback.

The configured Codex MCP key was rejected by the resident. Its already-configured host
API key succeeded; no credential was provisioned or grant bypassed. The first negative
validator expected a not-found string for cancel, while the API uses HTTP_404; corrected
expectation passed with the same isolated conversation and stable request ID.

The current Codex tool cache still exposes 82 tools without the facade after the user
reported plugin refresh. The actual protocol client above discovers and executes all
83 resident tools. This is a host-cache limitation, not a claim of new-tool exposure in
this chat. No undocumented cache manipulation or restart was used.

## Performance evidence and limits

Main and Raka applied the active `performance-oriented-software-engineering` revision
`sha256:ad530ab0a8350ddb9a82fd2ceedfcc74a4d778e060a9fe9cb90554cf4ae9115a` to bound the
exceptional work, reuse existing owners and separate provider time from transport.

Latest raw fixture measurement: `runtime/build/native-chat-bridge-phase-b-metrics.json`,
2026-10-26T21:07:10.529Z, list of 20 conversations, five serial children:
1958/466/613/1055/1748 ms; median 1055 ms, range 466–1958 ms; each 1,585 stdout bytes.
The integrated suites and live acceptance ran concurrently, so environment load is
uncontrolled. These are child-spawn→loopback JSON→exit timings, not production percentiles,
provider latency or isolated startup benchmarks. CPU/peak RSS/throughput were not measured.

The real provider was not deliberately driven to 24 iterations. Deterministic provider
fixtures exercise the exceptional report, failure fallback, persistence and crash recovery;
the live call proves normal delegation after activation. Current R2 UI source is unchanged:
historical real WebView before/after images remain at `runtime/tmp/native-chat-r2-realtime-before.png`
and `runtime/tmp/native-chat-r2-realtime-after.png`; current UI regressions pass. No fresh
elevated UI input or foreground takeover is claimed.

## Delivery and rollback

Existing owners changed: controller/checkpoint, chat service/store, HTTP origin handling,
external MCP registration/facade, adapter, release-support allowlist, relevant tests,
CODEBASE, proposal/evidence documentation and pending changeset metadata. No authored
directory, dependency, service, store, credential, provider/grant change, install, push,
release apply or deploy was introduced. Existing dirty worktree changes remain preserved.

Rollback through those source owners and the existing build/official activation path;
preserve chat/history data. Nullable `turn_origin` and optional schema-1 report checkpoint
retain old-history compatibility. Adapter rollback removes its exact package dependency,
not sibling scripts or operational state. R2 rollback is limited to its UI refresh effect.

## Closure record

[Learning receipt](native-chat-learning-closure.json): task
`ext-12be7cffc1ac43d6b8fd6bdff69c5750`, checkpoint
`native-report-bridge-full-completion-20261027`, advanced=true. Exact checkpoint review
completed `no-new-knowledge`, complete=true at 2026-10-26T21:13:09.571Z. Applied performance
Skill receipt recorded; comparative-benefit result remains unavailable. Episode verification
returned `EXTERNAL_EPISODE_VERIFICATION_SCOPE_UNAVAILABLE` before and after task reconnect;
it is not counted as successful validation and no oracle/scope bypass was attempted.
Learning checkpoint/review succeeded through the existing exact-task reconnection path.

Original decisions, historical failures and current evidence are preserved in:
[report proposal archive](../history-agent-core/Native-Final-Report-At-Tool-Iteration-Limit.md)
and [bridge proposal archive](../history-agent-core/External-Native-Chat-Bridge.md).
Path policy PASS (476 authored files, zero exceptions), Skill ownership PASS
(40 sources/43 managed artifacts), structure PASS (445 directories), release intent
check ok=true. Pending intents remain metadata only.

Cleanup of the earlier background plugin-settings browser session returned
`BROWSER_CONTROL_SESSION_NOT_FOUND`; that handle is no longer present and tab closure
is unconfirmed. No repeated close/restart or input into elevated Native UI was attempted.

No general cognitive-quality, provider-latency or production-throughput benefit is claimed.
