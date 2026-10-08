> HISTORICAL / RETIRED — restored snapshot. This is a dated acceptance artifact, not a current task list or active subsystem description. The legacy Hermes-backed Partner bridge was fully retired from Agent Core on 2026-09-27. Status/OPEN/PLANNED statements below are historical only. Current truth is in `docs/CODEBASE.md` section 0.1.41 and `docs/Hermes-Legacy-Partner-Removal-Plan.md`. The separate, subsequently implemented Agent Core-owned Native runtime remains outside this retired bridge plan; see [Native chat](Agent-Core-Interactive-Agent-Chat-Plan-20261002.md) and [current architecture](../CODEBASE.md).
> Source: runtime/backups/hermes-a2a-finalize-20260919-094033/Hermes-A2A-Partner-Bridge-Plan.md; original payload SHA-256: 6915b15786bc3e50d0d3b1167c642c53326ccabce43f4e73324c5ec8288b1c54.

# Hermes A2A Partner Bridge — Agent Core

> **Status:** IMPLEMENTED — LIVE-ACTIVATED — FUNCTIONAL ACCEPTANCE PARTIAL (22 PASS / 2 BLOCKED)
> **Created:** 2026-09-18
> **Agent Core baseline:** 0.9.0
> **Hermes runtime home:** resolved dynamically as `<HERMES_HOME>`
> **Hermes active source:** resolved dynamically as `<HERMES_SOURCE_ROOT>`
> **Grounded active Hermes commit:** `d177b119e9c56c9ddc0b7379ffce52341ec06584`
> **Hermes license:** MIT — Nous Research
> **Goal:** controller-led A2A collaboration where Agent Core/controller keeps final authority and Hermes acts only as partner/advisor/executor.

## 1. Required authority model

```text
User
  |
  v
Connected AI/controller
  |  lead / planner / verifier / integrator / final authority
  v
Agent Core
  |
  +--> normal direct tools (lead workstream ~50%)
  |
  +--> partner MCP facade
         |
         v
     Hermes partner (partner workstream ~50%)
         |
         +--> proposal / risks / suggestions
         +--> assigned execution only
         +--> evidence + result
         |
         v
Connected AI/controller verifies + integrates
  |
  v
User
```

The 50/50 rule is approximate responsibility ownership, not token/time/tool-call accounting.
Atomic work is not artificially split; Hermes may instead perform independent review/adversarial analysis.

## 2. Grounded Hermes seams

### 2.1 Native Runs API — selected first-wave transport

Hermes active source exposes:

- `POST /v1/runs`
- `GET /v1/runs/{run_id}`
- `GET /v1/runs/{run_id}/events`
- `POST /v1/runs/{run_id}/steer`
- `POST /v1/runs/{run_id}/approval`
- `POST /v1/runs/{run_id}/stop`

The Runs API provides:

- durable/idempotent admission;
- session continuity through `X-Hermes-Session-Key`;
- asynchronous execution;
- run status;
- event streaming;
- active-run steering;
- explicit approval resolution;
- cooperative stop.

### 2.2 Hermes delegate_task — internal evidence, not bridge transport

Hermes internal `delegate_task` proves the intended subordinate-worker model:
children have isolated contexts/terminals; parent receives summaries; parent must verify side effects; running children support list/steer/stop.

Agent Core does **not** couple directly to this internal function.

### 2.3 Hosted Room / peer discussion — design evidence

Hermes Hosted Room includes:

- bounded discussion rounds;
- deterministic roster/turn order;
- authenticated peer dispatch;
- task/execution generation identity;
- scoped grants;
- capability/execution-policy digests;
- idempotent remote-run receipts;
- steer/status/stop.

Agent Core does not impersonate a full Hermes peer in first wave because Agent Core is not itself an autonomous model. The useful discussion/authority semantics are adapted at the controller boundary.

### 2.4 ACP — deferred secondary transport

Hermes has a rich ACP stdio adapter with sessions, prompt, cancel, fork/load/resume, streaming updates, permissions, active-turn steering, and queued prompts.

Current deployment evidence:
- `hermes-acp.exe --check` fails because its uv trampoline path is stale;
- direct active Hermes Python currently lacks optional `agent-client-protocol`;
- Hermes pins `agent-client-protocol==0.9.0` as optional extra.

No dependency is installed automatically by this integration. ACP may become a future alternate transport only after explicit dependency/deployment authorization.

## 3. First-wave implementation

Agent Core adds one sibling subsystem:

```text
src/partner/
  types.ts
  hermes-runtime.ts
  hermes-client.ts
  service.ts

src/mcp/
  partner-schemas.ts
  partner-tools.ts
```

One public MCP tool is added:

```text
partner
```

Planned/implemented actions:

- `status`
- `align`
- `discuss`
- `approve_alignment`
- `delegate`
- `collect`
- `steer`
- `approve`
- `stop`
- `close`

Public production tool surface becomes **60 tools** when all current siblings are enabled.

## 4. Transport ownership

Agent Core owns a **loopback-only standalone Hermes APIServerAdapter child process**.

It does not launch the full Hermes gateway and therefore does not take ownership of Telegram/Discord/etc.

Runtime process bootstrap:

1. resolve `<HERMES_HOME>` relative to Agent Core root unless overridden;
2. resolve active `<HERMES_SOURCE_ROOT>`;
3. locate portable Hermes CPython under `.hermes-runtime/python`, fallback to Hermes venv;
4. reuse Hermes venv site-packages through `PYTHONPATH`;
5. load Hermes home `.env` inside the Hermes child only;
6. generate a random 256-bit API key in Agent Core process memory;
7. bind Hermes API adapter to `127.0.0.1` on an available private port starting at 18642;
8. never persist/expose the generated key;
9. stop only the child adapter owned by Agent Core during normal shutdown.

Runtime state lives under:

```text
runtime/partner/hermes/
```

No credentials are intentionally persisted there.

## 5. Collaboration protocol

### Phase A — decomposition

Controller defines:

- overall user goal;
- lead-owned workstream;
- Hermes-owned workstream;
- workspace;
- constraints;
- path scope;
- expected Hermes evidence/deliverable.

### Phase B — alignment

`partner(action=align)`

Hermes receives a discussion-only system contract and must:

- restate understanding;
- identify dependencies;
- identify ambiguity/misunderstanding risk;
- propose its execution approach;
- provide suggestions.

No execution is authorized.

### Phase C — bounded discussion

`partner(action=discuss)`

Maximum default: 3 rounds.

Any new discussion invalidates prior lead approval.

### Phase D — explicit lead approval

`partner(action=approve_alignment)`

Only the connected controller can approve alignment.

### Phase E — parallel execution

`partner(action=delegate)`

Hermes runs asynchronously by default.
The controller continues its own coherent workstream instead of waiting.

### Phase F — intervention

- `steer` corrects an active Hermes run.
- `approve` resolves one exact Hermes approval request with only `once` or `deny`.
- `stop` interrupts partner execution.

The bridge intentionally does not expose session/permanent approval escalation.

### Phase G — collect + verify

`partner(action=collect)`

Hermes output is marked `verificationRequired=true`.

The controller must independently verify material partner claims before integration/final response.

## 6. Authority/safety boundaries

Hermes may:
- inspect assigned context;
- propose alternatives;
- challenge assumptions with evidence;
- execute its approved partner workstream;
- return evidence and integration suggestions.

Hermes may not independently:
- redefine the overall task;
- broaden scope;
- authorize tests;
- authorize destructive actions;
- commit/tag/push;
- publish/deploy/release;
- change credentials;
- decide overall completion;
- speak to the user as final authority.

Normal Agent Core tools remain direct. Partner availability is never an execution gate.

## 7. Failure semantics

Partner degradation must be fail-soft.

Examples:

- Hermes home/source unavailable;
- Python runtime unavailable;
- standalone API child fails to start;
- provider/model failure;
- run timeout;
- steering rejected;
- partner approval pending.

In all cases:
- machine control remains available;
- Memory remains available;
- Grafel remains independent;
- Learning remains independent;
- controller may continue locally.

## 8. Current implementation evidence

- Active Hermes source grounded at `d177b119...`.
- Standalone `APIServerAdapter` feasibility probe succeeded on loopback.
- Probe `GET /health` returned `status=ok`, Hermes `version=0.21.3`.
- Root Agent Core TypeScript build after bridge implementation exited 0.

## 9. Verification gates

Run only with explicit user authorization.

1. Agent Core live health remains top-level ok.
2. `/health.partner.status=available`.
3. MCP manifest exposes exactly one new `partner` tool.
4. Existing 59 tools remain intact.
5. Interactive Hermes TUI remains running and unaffected.
6. Partner child is loopback-only.
7. No partner API key is persisted in Memory/docs/logs/tool output.
8. `align` receives a real Hermes proposal without source mutation.
9. `delegate` before `approve_alignment` is refused.
10. `discuss` invalidates prior alignment approval.
11. discussion round cap is enforced.
12. approved delegation returns a real run id.
13. controller can perform local work while Hermes run is active.
14. `steer` changes an active partner run when Hermes accepts steering.
15. `collect` returns terminal result/evidence.
16. partner results remain labelled verification-required.
17. `stop` interrupts an active run.
18. approval bridge accepts only one-shot approve/deny.
19. Hermes failure does not degrade Execution/Memory/Grafel/Learning.
20. Agent Core shutdown stops only its owned API child.
21. Agent Core restart does not require hardcoded drive letters.
22. no full Hermes gateway/messaging platform is started by the bridge.
23. no ACP dependency was installed implicitly.
24. no broad tests/release/deploy occur without user authorization.

## 10. Release/version integrity

This is material shipped behavior and requires one **minor** Agent Core changeset.

Current release baseline is 0.9.0, so normal future release aggregation would target 0.10.0.

`release:apply` remains separately authorized.

## 11. Current status

Implementation source exists, builds, and is live-activated. Functional acceptance has been authorized and executed against the current 0.9.0 runtime.

Current result: **22 PASS / 2 BLOCKED**.

Blocked gates are external-observation prerequisites rather than observed runtime defects:
- Gate 3: this already-initialized controller session still exposes the cached pre-partner 59-tool manifest and therefore cannot prove the refreshed external MCP manifest includes `partner`; reconnect/re-OAuth is required.
- Gate 5: no interactive Hermes TUI process was running during this acceptance pass, so "TUI remains running and unaffected" had no active baseline to compare.

Do not mark this plan COMPLETE until those two gates receive real external evidence.

## 12. Functional acceptance record — 2026-09-19

Authorized functional acceptance was executed with real Hermes runs plus isolated fail-soft/shutdown fixtures. No broad regression suite, release apply, commit, tag, push, publish, deploy, or credential mutation was performed.

| Gate | Result | Evidence |
| --- | --- | --- |
| 1 | PASS | Live Agent Core `/health` remained `status=ok`, version `0.9.0`. |
| 2 | PASS | `/health.partner.status=available`, Hermes `0.21.3`, transport `loopback-runs-api`. |
| 3 | BLOCKED | Current controller connector still exposes the cached 59-tool pre-partner manifest; `partner` is not visible until connector reconnect/re-OAuth. Live source/server registration defines it. |
| 4 | PASS | The current connector still exposes all pre-existing 59 Agent Core tools; no existing tool disappeared. |
| 5 | BLOCKED | No interactive Hermes TUI process was running during this acceptance pass, so TUI-survival could not be observed live. |
| 6 | PASS | Production partner listener bound only to `127.0.0.1` on its private port. |
| 7 | PASS | Exact ephemeral-key audit scanned 133 bounded files across partner runtime/tracker/logs/memory/docs and found `0` exact matches; key value was never printed. |
| 8 | PASS | Real `align` run returned a Hermes proposal with role understanding, dependencies, ambiguities, execution proposal, and integration suggestions. Source mtimes remained pre-acceptance. |
| 9 | PASS | `delegate` before alignment approval was refused (`PARTNER_ALIGNMENT_PENDING` / approval gate active). |
| 10 | PASS | After an approved alignment, a new `discuss` round immediately reset `alignmentApproved=false` and locked execution while alignment was pending. |
| 11 | PASS | Initial alignment + two discussion rounds consumed the configured three-round budget; a fourth discussion was refused with `PARTNER_DISCUSSION_ROUND_LIMIT_REACHED`. |
| 12 | PASS | Approved delegation returned a real Hermes run id and entered `running`. |
| 13 | PASS | While Hermes delegation was live, lead-side `memory_status` and `list_processes` succeeded; Memory remained available with issueCount 0. |
| 14 | PASS | `steer` against the active Hermes run returned `accepted=true`. |
| 15 | PASS | `collect` returned a terminal `completed` Hermes run with real output/usage evidence. |
| 16 | PASS | Collected partner execution returned `verificationRequired=true` and `finalAuthority=Agent Core connected AI/controller`. |
| 17 | PASS | A second active Hermes run accepted `stop`; terminal collection returned `status=cancelled`, `interrupted=true`, `turn_exit_reason=interrupted_by_user`. |
| 18 | PASS | Public partner schema accepts only approval choices `once` and `deny`; synthetic `always` was rejected by schema parsing. |
| 19 | PASS | An isolated partner configured with a missing Hermes source returned degraded `HERMES_SOURCE_NOT_FOUND`; live Agent Core remained ok with Execution/Memory/Grafel/Learning available. |
| 20 | PASS | Isolated owned partner listener was reachable before `close()` and unreachable after; the production partner remained healthy afterward. |
| 21 | PASS | `src/partner` and `src/config.ts` contain no `F:\Projects\...` runtime hardcodes; current absolute paths are runtime-resolved. |
| 22 | PASS | Process inspection showed the bridge-owned `hermes_partner_api.py` child and zero full `hermes gateway` processes started by the bridge. |
| 23 | PASS | Bridge source has no ACP imports/install path. ACP may exist in the Hermes environment independently, but the A2A bridge does not install or use it implicitly. |
| 24 | PASS | Acceptance used targeted live/isolated harnesses only; release plan remains `0.9.0 -> 0.10.0` with one pending minor intent and `release:check-intent ok=true`; no release/deploy occurred. |

Additional live evidence:
- Real alignment/discussion demonstrated the intended two-way clarification behavior: Hermes identified ambiguities, accepted lead clarification, revised its proposal, and explicitly waited for lead approval before execution.
- Real execution demonstrated the intended parallel-work contract: Hermes ran asynchronously while the lead continued normal Agent Core operations.
- Real steering changed the active partner instruction and was acknowledged by Hermes.
- Real stop/cancel was scoped to the selected partner run.
- Production partner process command is the portable Hermes Python executing Agent-Core-owned `runtime\partner\hermes\hermes_partner_api.py`; no full Hermes messaging gateway was observed.
- Runtime helper persists only bootstrap source and environment variable names; the generated partner API key remains process-only.

Completion rule:
- Reconnect/re-OAuth the Agent Core custom connector and prove the external manifest now exposes exactly 60 tools including one `partner` tool.
- Run an interactive Hermes TUI baseline, invoke a harmless partner alignment/run, and prove the TUI process/session remains alive and usable.
- Only after both blocked gates PASS may this plan become `COMPLETE — VERIFIED FOR APPROVED SCOPE`.
