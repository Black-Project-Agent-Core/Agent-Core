# SubAgentCore named dispatch: stable

Verified on 6 September 2026, machine archi. Main project: `E:\Projects\Agent-Core`.
Scope: named worker implementation and tested Agent Core MCP integration, not every repository subsystem or perpetual provider availability.

## Final evidence
- Main project build: PASS.
- Related regression: 16 files, 96 tests PASS, 0 failures.
- Verified application: 19 scoped files, backups retained, source readback PASS.
- Candidate versus deployed compiled JavaScript: 14 files identical.
- Real provider calls through isolated authenticated Agent Core MCP: Astra PASS, Forge PASS, Sentinel PASS, Scribe PASS.
- The final canary specified workerName and task, without provider/model overrides; .env bindings were used.
- All four workers read synthetic shared memory through the same scoped MemoryService.
- Scribe read the leader-reviewed Astra handoff through that same memory.
- Production runtime restarted through existing tray adoption/restart mechanisms.
- Post-restart Agent Core listener: PID 10292; previous PID 20172 absent.
- Memory healthy, schema 4, integrity ok; execution healthy, integrity ok; active runs 0; tunnel HTTP 200.

## Team
| Name | ID | Provider | Default model |
| --- | --- | --- | --- |
| Astra | astra | OpenRouter | minimax/minimax-m2.7:free |
| Forge | forge | OpenHands | openhands/deepseek-v4-flash |
| Sentinel | sentinel | NVIDIA | nvidia/nemotron-3-ultra-550b-a55b |
| Scribe | scribe | OpenRouter | minimax/minimax-m2.7:free |

JOE remains the sole leader. Worker results are proposals and require verification before acceptance.

## Invocation and memory contract
Use the existing `subagentcore` tool with `operation: dispatch`, an owned routeContextId from capability_route, `workerName: Astra|Forge|Sentinel|Scribe`, and the task. Lower-case canonical workerId remains supported. Invalid names, conflicting name/ID selectors and unauthorized routes fail before dispatch.
All workers preflight the same local MemoryService. Export only explicitly selected provider-appropriate `sharedMemoryIds`; never dump private memory automatically. Returned handoffs are `PENDING_LEADER_REVIEW`, not automatic durable writes.
Details: [Named dispatch contract](subagentcore-named-dispatch.md).

## Repairs delivered
Named dispatch resolution/discovery, explicit memory export, leader-reviewed handoffs, actual-model/usage provenance, zero-price OpenRouter policy, provider-scoped rate limits, restored cooldown concurrency, and bounded OpenHands export settling.
The export trace proved early OpenHands downloads had 6 files and no assistant event; a later download of the SAME conversation had 10 files including the correct final response. No new inference was started by export retries.
The existing tray initially reported port_in_use_unowned. Its built-in ControlledTakeover verified and adopted the correct Agent Core/tunnel processes, after which normal restart succeeded. No authentication or permission bypass was used.

## Boundaries
The current ChatGPT session does not expose the Agent Core connector tools. Direct production authenticated MCP probing was blocked by tooling, and no alternate production credential-read route was attempted.
Named calls were proved through a disposable authenticated instance of the same Agent Core code, with real providers and synthetic shared memory; production build parity and post-restart health were verified separately.
The main .env now contains the MiniMax M2.7 Free OpenRouter default. All key values and other model configurations were preserved. Slots loaded: OpenRouter 1-18, NVIDIA 1, OpenHands 1-2; not every key was individually inference-tested.
OpenHands early usage can be provisional zero; do not infer free billing from it.
No production memory was exported, donor repositories were untouched, and no Git publication or unrelated source changes were performed.

## Evidence paths
`runtime/verification/subagentcore-stable-20260906/final-report.json`
`runtime/verification/subagentcore-stable-20260906/named-live-result.json`
`runtime/verification/subagentcore-stable-20260906/root-regression.log`
`runtime/verification/subagentcore-stable-20260906/apply-manifest.json`
`runtime/verification/subagentcore-stable-20260906/live-health.json`
Prior failed canaries remain in the same evidence directory; their verdicts were not changed to PASS.
