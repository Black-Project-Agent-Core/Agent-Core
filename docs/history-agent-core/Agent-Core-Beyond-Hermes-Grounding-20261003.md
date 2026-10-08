# Agent Core Beyond Hermes — Source Grounding and Comparison

**Status:** READ-ONLY RESEARCH / DESIGN INPUT — NOT IMPLEMENTED  
**Prepared:** 2026-10-03  
**Agent Core authority root actually found:** `E:\Projects\Agent-Core`  
**User-supplied last-known root:** `F:\Projects\Agent-Core` — **NOT FOUND**  
**P8:** explicitly deferred; no P8 run was performed.

---

## 1. Audit snapshot

Agent Core source snapshot:

- observed at: `2026-10-03T11:39:03+07:00`
- repository: `E:\Projects\Agent-Core`
- branch: `main`
- HEAD: `639cdf77fd7288a722131862e22eecaff4a90f07`
- worktree: dirty, 208 porcelain entries at snapshot time

Important source hashes:

| File | SHA-256 |
|---|---|
| `AGENTS.md` | `91b7cf67572abbc80588f54609614a738a599b44f2f2b9ae463296725c07d286` |
| `docs\Agent-Core-Product-Direction.md` | `e7c360876a7c74be40303453f07e6af00928e6b6b50214e7e2c2d064e9ba999b` |
| `docs\CODEBASE.md` | `a71bde6e2824bbcb822799a991f02c7645e1a9321a1344a888d1b487988bfe12` |
| `docs\Agent-Core-Native-Agent-Capability-Parity-Plan-20261002.md` | `f76aa5f6c1c3f6f7a5e8092479fc43db5a52fffeefd9c26621bbb1943f6547e7` |
| `src\agent-controller.ts` | `0d638f84b923863ef5ac62e932b2d047278ae399d754e8dbbdddcff96b615885` |
| `src\agent-runtime.ts` | `66d2d4459035e4873f4cf660a384de46fce31ba5b021feb44fc39457e81f0eb2` |
| `src\agent-provider.ts` | `d9b4d9d9957299c663fa526935836c1f2209fae21b36e6127dc1f697509132fd` |
| `src\agent-provider-scheduler.ts` | `5fbcb9e103ee503bb31c7da6f957ad7229836915c831a475bde49e74b1308a2e` |
| `src\agent-provider-state.ts` | `ffa0ffa4a726304d61d3fd6479c793f9081de9afa581c53a1e1e9e71adf6c984` |
| `src\agent-chat-service.ts` | `25f88024414ad0af88febd00de2621fd170788ee65718075e79d1f1e3c824ecc` |
| `src\memory\service.ts` | `01c355e67619646e0b742907409971f95383eaf18952ca38ac4dc34cbdbd56ed` |
| `src\learning\service.ts` | `4251ce551861a10ed527435c0692f78bdca72aba881eb6fe04cdd0383a89e75c` |
| `src\mcp\mutation-safety.ts` | `426d20bf0f067881f2480efb455fbc13b27248ea13674fb7aaa5647e0b55df87` |

Source determines implementation. Historical acceptance/trace determines what has actually run. A source feature is not upgraded to runtime-proven merely because it exists.

---

## 2. Preserved Agent Core baselines

These are not reopened by this design task.

### EC cumulative learning

Canonical authority:
`fdecdd4a-9ec6-43ff-ac60-d2092326ade8`

Accepted on its historical scope:
- EC-8 evaluator PASS.
- EC-9 graduation PASS.
- A/B supported a procedure that materialized a Skill.
- C/D demonstrated later reuse/adaptation and evidence-driven strategy change.
- repeatedFailures=0 in the four-episode evaluator.
- Learning closure and artifact-use attribution were present.

Evidence limitation:
- Sessions C/D were not no-hint benchmarks; their prompts supplied Skill/recovery clues.
- reduced tool-call counts were observational and are not universal intelligence proof.

### Persistent credential rotation

Canonical authority:
`bea06bd2-d696-4c2a-a31c-b8eba42e4631`

Accepted baseline:
- source implemented;
- targeted-qualified;
- resident activated;
- bounded real-provider acceptance passed;
- operational provider/key state is runtime state, not semantic Memory.

### IAC / NACP

IAC-9 restart continuity is already resident verified. NACP body parity and shared canonical knowledge are already verified on their accepted scopes.

P8 remains open and was not activated during this task.

---

## 3. Official Hermes identity

Official project selected:

- organization: Nous Research
- repository: `https://github.com/NousResearch/hermes-agent`
- official documentation domain observed: `hermes-agent.nousresearch.com`
- comparison commit: `bd0affe5e5f723579df8902852f5d0c47795f355`
- commit date observed from GitHub: 2026-10-03 04:22:55Z
- local clean exact checkout: `F:\Workflow\Hermes-Official-20261003`
- branch: `main`
- remote: `https://github.com/NousResearch/hermes-agent.git`
- checkout worktree: clean
- license: MIT

Permalink base:
`https://github.com/NousResearch/hermes-agent/blob/bd0affe5e5f723579df8902852f5d0c47795f355/`

The existing `F:\Workflow\Hermes` root is **not** the official Hermes Git repository; it is a different Git worktree whose remote is `rendevouz999/NeuraCore.git`. Its nested `hermes-agent` checkout is official but is at `45af7a71fcd420b4422d2c074b1ce58b9ce0d048`, about 24,776 commits behind the selected upstream snapshot. It is therefore not the comparison authority.

Hermes `pyproject.toml` declares version `0.0.0`; that value is not useful as a release identity. This comparison is commit-pinned.

---

## 4. Router reference snapshots

The user explicitly authorized read-only source inspection under the protected Agent Core reference folder.

| Reference | Commit | Remote | Worktree | License |
|---|---|---|---|---|
| OmniRoute | `ea0cdc559ccc087d723f311a4217598cee4bb2b8` | `https://github.com/devolkus/omniroute.git` | clean | MIT |
| 9Router | `a99cf57239ff778b61e434c2786009d5ed1c412c` | `https://github.com/decolua/9router.git` | clean | MIT |
| FreeLLMAPI | `cc886c7c0be48731f7be10ab6bb42563e936f3b5` | `https://github.com/leiworm/freellmapi.git` | clean | MIT |

No code from these three references was executed. No `.env`, auth store or credential value was read.

Because all four donor repositories are MIT, selective code reuse is legally possible subject to preserving required copyright/license notices. This report still recommends **mechanism adaptation rather than code copying** unless a later implementation review finds literal reuse materially safer/smaller.

---

# 5. Comparison matrix

Classification vocabulary:

- **IMPLEMENTED** — production source exists.
- **WIRED** — reachable from production composition/call path.
- **MOCK-TESTED** — relevant test uses mocked network/dependency.
- **INTEGRATION-TESTED** — test uses real local persistence/component boundary.
- **RUNTIME-OBSERVED** — historical/live acceptance has exercised the behavior.
- **UNKNOWN** — evidence inspected here is insufficient.

| Capability | Hermes @ bd0affe5 | Agent Core @ 639cdf77 | Evidence-grounded assessment |
|---|---|---|---|
| Persistent cross-session conversation recall | `tools/session_search_tool.py:619`; FTS5 SQLite over actual messages; real temp SQLite tests | canonical Memory fusion search + retrieval ledger; chat transcript persistence | Both implemented. Hermes has stronger raw-session-history retrieval UX; Agent Core has stronger semantic authority/provenance/use receipts. |
| Durable semantic Memory | MEMORY/USER files + optional memory providers; session search is transcript retrieval | `MemoryService.search`, authority/freshness/links, retrieval evidence, knowledge-use receipts | Agent Core is stronger on explicit evidence-attributed semantic knowledge lifecycle. Runtime superiority not benchmarked. |
| Skill CRUD | `tools/skill_manager_tool.py:_create_skill:415`; guarded writes, security scan, atomic rollback | SkillService artifact store + procedure materialization path | Both implemented. Hermes has broader foreground/background skill-management ergonomics. |
| Autonomous skill review | `agent/background_review.py:_SKILL_REVIEW_PROMPT:440`; background review + curator | procedure support/materialization exists; Native controller can surface/use artifacts | Hermes is stronger in shipped autonomous review breadth. Much selection remains review-model prompt driven; server guards enforce write boundaries. |
| Reject stale/wrong learned guidance | background review prompt explicitly patches wrong/outdated loaded skills; curator archive/stale lifecycle | Memory authority/supersession/contradiction + negative procedure evidence can block/refine promotion | Agent Core has stronger typed knowledge authority primitives; Hermes has stronger automatic skill-curation workflow. Held-out behavior comparison is untested. |
| Failure -> adaptive recall -> changed strategy | Hermes has loop/error recovery mechanisms and session recall; exact contribution varies by path | `NativeAgentController:530+` adaptive recall; failed strategy fingerprint block; EC C/D historical evidence | Agent Core mechanism is explicit and evidence-attributed. No fair no-hint Hermes runtime comparison yet. |
| Same-provider key rotation | large CredentialPool with concurrency and token refresh | PersistentCredentialScheduler + SQLite state | Both strong. Hermes handles more credential-source complexity; Agent Core already has required basic substrate. |
| Provider failover | broad provider adapters and retry logic | provider pool route failover in `src/agent-provider.ts:462+` | Both implemented. Agent Core currently lacks explicit route capability compatibility descriptors. |
| Persistent provider cooldown/quota/breaker | CredentialPool status/cooldown; provider-specific handling | ProviderStateStore SQLite: credential, scope, quota, breaker tables | Agent Core is already strong; adding another router is unjustified. |
| Session/provider affinity | multiple runtime/session mechanisms; broad prompt cache identity handling | chat DB persists preferred_provider_id/model; session affinity restored before turn | Both implemented. Agent Core affinity is sufficient at completed-turn boundary. |
| Mid-turn crash-safe tool-call persistence | Hermes flushes assistant tool_calls/session progress before tool execution; tested by `test_text_turn_incremental_persistence.py:108+` | chat DB persists only user/assistant final messages; runtime episodes persist summaries/evidence, not canonical provider replay transcript | **Important Agent Core gap. Hermes is demonstrably stronger here.** |
| Side-effect replay safety | Hermes has persistence/recovery guards across tool loop | McpMutationSafety durable invocation journal: pending receipt prevents replay | Agent Core has unusually strong idempotency/uncertain-replay primitive; gap is integrating it with durable turn continuation. |
| Partial-stream provider transition | Hermes has extensive stream recovery; exact per-path behavior varies | Native Agent provider interface is non-streaming response-oriented today | Hermes stronger in current streaming robustness. Agent Core should define transition semantics before adding broad streaming failover. |
| Long-context compression | highly developed `context_compressor.py`; provider-aware replay/token/image budgets | bounded 24-message/48k chat context + 12k Memory recall; no comparable canonical compaction subsystem in current Native chat | **Hermes clearly stronger in shipped long-context engineering.** |
| Prompt/cache cost controls | stable prompt prefix, cache pressure, compression budgets, account usage | provider attempts/tool metrics exist; no equivalent mature prompt-cache optimization layer | Hermes stronger. This is secondary to correctness/safety for first slice. |
| Verification ledger | `verification_evidence.py:456,557`; stale after edit, scope full/targeted; terminal commands can record evidence | task terminal outcome + evidenceRefs + verificationRef + Learning closure | Different strengths. Hermes stronger for coding-workspace verification state; Agent Core stronger at task/knowledge-use finalization integration. |
| Schema validation | delegate output JSON Schema validation + bounded correction retry | tool schemas and task verification exist; no generic final-answer schema contract at controller level | Hermes stronger for structured delegated output. |
| Independent truth verification | command/schema evidence still only proves the property checked, not universal correctness | same limitation; verificationRef is not truth by itself | Neither can claim universal correctness. Both require task-specific verifiers. |
| Cost-budgeted background learning | background review has hard aggregate token/iteration budgets and cancellation | Learning is mandatory/fail-soft; cumulative evaluator tracks tool calls/failures but no comparable review-token budget | Hermes stronger today. |

---

# 6. Source anchors

## Agent Core

- Native controller:  
  `E:\Projects\Agent-Core\src\agent-controller.ts`, `NativeAgentController`, line 418.  
  adaptive recall starts line 530; provider route event line 583.  
  SHA-256 `0d638f84b923863ef5ac62e932b2d047278ae399d754e8dbbdddcff96b615885`.

- Memory context return:  
  `E:\Projects\Agent-Core\src\agent-runtime.ts`, `assembleMemoryContext`, line 597.  
  task episode recording line 724; `finalizeTask` line 1073.  
  SHA-256 `66d2d4459035e4873f4cf660a384de46fce31ba5b021feb44fc39457e81f0eb2`.

- Chat persistence:  
  `E:\Projects\Agent-Core\src\agent-chat-store.ts`, `chat_messages` schema line 187; `finalizeTurn` line 354.  
  SHA-256 `5c63482d98555f2f2621a128264f04fe226afb6ad588bfa619f78f6c8a2c7013`.

- Turn orchestration:  
  `E:\Projects\Agent-Core\src\agent-chat-service.ts`, `runTurn`, line 177.  
  SHA-256 `25f88024414ad0af88febd00de2621fd170788ee65718075e79d1f1e3c824ecc`.

- Provider pool:  
  `E:\Projects\Agent-Core\src\agent-provider.ts`, provider `complete`; pool implementation is the later `complete` overload around lines 462–569.  
  SHA-256 `d9b4d9d9957299c663fa526935836c1f2209fae21b36e6127dc1f697509132fd`.

- Credential scheduler:  
  `src\agent-provider-scheduler.ts`, `PersistentCredentialScheduler`, line 54.  
  SHA-256 `5fbcb9e103ee503bb31c7da6f957ad7229836915c831a475bde49e74b1308a2e`.

- Provider state:  
  `src\agent-provider-state.ts`, `ProviderStateStore`, line 102.  
  SHA-256 `ffa0ffa4a726304d61d3fd6479c793f9081de9afa581c53a1e1e9e71adf6c984`.

- Mutation safety:  
  `src\mcp\mutation-safety.ts`, `McpMutationSafety`, line 79.  
  SHA-256 `426d20bf0f067881f2480efb455fbc13b27248ea13674fb7aaa5647e0b55df87`.

## Hermes

All permalinks below use commit:
`bd0affe5e5f723579df8902852f5d0c47795f355`.

- Session search: `tools/session_search_tool.py:619`.  
  Permalink: `https://github.com/NousResearch/hermes-agent/blob/bd0affe5e5f723579df8902852f5d0c47795f355/tools/session_search_tool.py#L619`.  
  Local SHA-256 `7fd4104121d1a05e10c0562d4cac615fd0aaed1567dbb827e9edb4d1bc97d2b4`.

- Skill creation: `tools/skill_manager_tool.py:415`.  
  Permalink: `https://github.com/NousResearch/hermes-agent/blob/bd0affe5e5f723579df8902852f5d0c47795f355/tools/skill_manager_tool.py#L415`.  
  SHA-256 `a5103fa5849fb2e7055cf95e1aa22b2a1790f7e7ee355278340ded979bc68475`.

- Background skill review prompt: `agent/background_review.py:440`.  
  Permalink: `https://github.com/NousResearch/hermes-agent/blob/bd0affe5e5f723579df8902852f5d0c47795f355/agent/background_review.py#L440`.  
  SHA-256 `5f6c503f54e87d3fbeb637fbd583371e1eee4c64b72a48b87755f2199360dc86`.

- Credential pool: `agent/credential_pool.py:1006`, selection line 2002.  
  Permalink: `https://github.com/NousResearch/hermes-agent/blob/bd0affe5e5f723579df8902852f5d0c47795f355/agent/credential_pool.py#L1006`.  
  SHA-256 `111d8e0d990630341a42dc2fa4a740f16746d5963e8d6900cfd25c54d109da66`.

- Verification ledger: `agent/verification_evidence.py:456` and status line 557.  
  Permalink: `https://github.com/NousResearch/hermes-agent/blob/bd0affe5e5f723579df8902852f5d0c47795f355/agent/verification_evidence.py#L456`.  
  SHA-256 `24a5f3d2dd3e60ca8fad685df17daaa2a7f545396ede0925af5ce79cee4de09c`.

- Verify-on-stop: `agent/verification_stop.py:53`.  
  Permalink: `https://github.com/NousResearch/hermes-agent/blob/bd0affe5e5f723579df8902852f5d0c47795f355/agent/verification_stop.py#L53`.

- Context budget accounting: `agent/context_compressor.py:1323`.  
  Permalink: `https://github.com/NousResearch/hermes-agent/blob/bd0affe5e5f723579df8902852f5d0c47795f355/agent/context_compressor.py#L1323`.  
  SHA-256 `1231ecb560a7eac9b2e0fcda656b3053a5e20f1065d5ddf86be0805b34ea42b9`.

- Incremental turn persistence test: `tests/agent/test_text_turn_incremental_persistence.py:108`.  
  Permalink: `https://github.com/NousResearch/hermes-agent/blob/bd0affe5e5f723579df8902852f5d0c47795f355/tests/agent/test_text_turn_incremental_persistence.py#L108`.  
  SHA-256 `d97b61e3ba4136ee73c7c55b80eccdc1eb9463cd8874a2294ed9c22dfded5c69`.

## Router references

### OmniRoute

- cooldown decision: `src\sse\services\cooldownAwareRetry.ts:107`; SHA-256 `49786ae9ed8215802f8e75cf64ae472555192ca6c648033e0193e07d326473f5`.
- session affinity: `src\sse\services\sessionAffinityPin.ts:94`; SHA-256 `a964f085a6a931cb797fadcf755fa3bf2b5ed37be0e5102bc03d7b1b8fe83f4b`.

### FreeLLMAPI

- streaming failover boundary: `server\src\services\fusion.ts:272`, `runJudgeStreaming`; SHA-256 `9fd8596f10474e57a7ac9e5ece92765062cfa6718767591fda2770e65ba295c1`.
- persistent per-model/key cooldown: `server\src\services\ratelimit.ts:393`; SHA-256 `cc1fce9f7af2a86f3b78869b2cb7222b936f727ce9310d62cb2a807271511085`.
- context handoff module: `server\src\services\context-handoff.ts`; SHA-256 `3f1811c2da67b7e3d9f08858be125771864cb29f6366cde419da7f4a0764af99`.
- tool-call rescue: `server\src\lib\tool-call-rescue.ts`; SHA-256 `5045941d52bdb2a9a9bc7069664d1d075c6dd5ee8a5b32266b2040c7f82c836a`.

### 9Router

- account fallback: `open-sse\services\accountFallback.js`; SHA-256 `dd7c6be2c2e516802d2f4daf7cc3644e8561d93b8efa7a6450e422abac5431cd`.
- error/cooldown configuration: `open-sse\config\errorConfig.js`; SHA-256 `8c77d8cbfed9593657c9db616b6845a6a9287dc6da95da2d355d0bcbbcf20c4b`.
- quota handling: `src\sse\services\antigravityQuota.js`; SHA-256 `2b84d1b6c574e013bd5bb42d179b94f62a33e500c971113aaf7f17d78545992b`.

---

# 7. Where Agent Core is already strong

## 7.1 Evidence-attributed cumulative learning

Agent Core already has a stronger-than-typical distinction between:
- retrieval,
- declared knowledge use,
- verified outcome,
- artifact-use outcome,
- Learning finalization.

This is important because merely retrieving a Skill/Memory does not prove it helped.

The target advantage should preserve this discipline rather than replace it with an always-update background prompt.

## 7.2 Provider operational state

Agent Core already has:
- stable credential identity;
- persistent rotation checkpoint;
- provider-scoped selection serialization;
- cooldowns;
- invalid credential persistence;
- model/provider scope blocks;
- quota observations;
- circuit breaker;
- bounded provider attempts;
- resident real-provider acceptance.

A new router subsystem would duplicate working ownership.

## 7.3 Mutation replay safety

`McpMutationSafety` is a valuable differentiator:
- a received invocation without a terminal receipt becomes **uncertain**;
- Agent Core refuses blind replay;
- already completed invocation is not executed again.

The missing step is to make provider/turn recovery consult and preserve this state as part of the canonical continuation contract.

## 7.4 Shared external/native body

External controller and Native Agent use the same Agent Core MCP body, canonical Memory/Learning and provider substrate. That makes cross-controller learning/verification possible without synchronization between two agent stacks.

---

# 8. Where Hermes is demonstrably stronger today

These are source-grounded strengths, not marketing rankings.

1. **Mid-turn durable conversation/tool persistence.**  
   Hermes deliberately flushes tool-call progress before side effects. Agent Core's chat DB currently stores only user/final-assistant text.

2. **Long-context compression and replay accounting.**  
   Hermes has model/provider-aware context budgeting, compaction state, tool envelope accounting, image retirement and many anti-thrash safeguards.

3. **Prompt-cache/session cost engineering.**  
   Hermes devotes substantial production code and evals to cache-stable prompt prefixes and conversation compression.

4. **Autonomous skill curation breadth.**  
   Hermes has background review, skill usage telemetry, stale/archive/pin/adopt lifecycle and a curator. Agent Core's verified procedure→Skill mechanism is narrower and more evidence-gated.

5. **Credential-source complexity.**  
   Hermes CredentialPool handles broad OAuth/key source refresh and cross-process token lifecycle beyond Agent Core's current env-backed credential set.

6. **Coding verification UX.**  
   Hermes has a passive SQLite verification ledger, edit-staleness, verify-on-stop and `hermes verify`.

These strengths do **not** prove Hermes achieves higher verified real-task success. Runtime comparison has not been run.

---

# 9. Where comparison is currently UNKNOWN

- No fair matched-model/budget system benchmark has been run.
- No no-hint held-out learning benchmark has compared Hermes vs Agent Core.
- No matched mid-turn provider-failure benchmark has compared both systems.
- No matched cost/token benchmark has been run.
- No evidence supports saying either system is universally "more intelligent".
- Hermes background review is partly model/prompt-driven; its source existence does not guarantee the resulting skill is correct.
- Agent Core procedureCount=0 with skillCount=1 remains a provenance/continuity evidence gap, not proof of lost knowledge.

---

# 10. Strategic conclusion

The highest-leverage route to surpass Hermes is **not** to reproduce its entire curator/router/context-engine stack.

The first defensible target is:

> Make Agent Core's already-strong verified learning + provider rotation + mutation safety survive a provider/key/interruption boundary **inside an active turn**, with a canonical durable continuation state and a compatibility/reconciliation gate.

That target exploits existing Agent Core strengths and directly attacks the clearest Hermes advantage: crash-safe turn/tool continuity.

The companion documents define:
- the provider/key continuity contract;
- a fair benchmark;
- the first minimal vertical slice.

No implementation is authorized by this report.
