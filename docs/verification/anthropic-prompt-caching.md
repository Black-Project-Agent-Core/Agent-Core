# Anthropic prompt caching — implementation and acceptance

Date: 2026-10-29 (Asia/Tomsk)
Status: source implemented and resident active; focused test, build and real cache write/read acceptance complete. Canonical continuity/Learning use external task key `anthropic-prompt-caching`; they remain separate from product acceptance.

## Authorized scope and baseline

The user approved Anthropic-first prefix caching, compatible-provider usage observation, a stable Native prefix, durable metrics, focused tests, one official activation and limited real-provider acceptance. Semantic response caching, proxy services, Redis, local KV serving and new dependencies are outside scope.

The initial worktree already contained the Anthropic provider, reasoning-effort and trusted-proposal changes. These were preserved. Source baseline HEAD: `07c07d83ab5175b5fe15f49165a469b8d5b09a05`, branch `feature/claude-donor-up01-up14`. Existing uncommitted changes are not attributed to this task.

## Implementation and owner

- Existing provider transport owns Anthropic automatic caching plus one explicit stable system boundary, both with the default five-minute TTL. `ANTHROPIC_PROMPT_CACHING=false` disables all outgoing cache markers and retains legacy system-string serialization. Readiness qualification explicitly disables caching.
- Native controller composes its instructions and current Skill guidance into the first system message. Memory, synthesis, task decisions and conversation summaries follow. Resume refreshes the marked instruction block; unmarked legacy checkpoints retain their context and existing separate-guidance refresh. Model/tool/effort changes may invalidate the cache normally.
- Internal `AgentModelMessage.cacheControl` is system-only, checkpoint-validated and stripped from compatible-provider messages. Ordered Anthropic signed blocks and tool/result handling are preserved.
- Provider usage exposes optional `cacheReadInputTokens` and `cacheWriteInputTokens`. Task metrics additionally track independent `cacheReadObservedCalls` and `cacheWriteObservedCalls`; both controller completion paths, runtime state normalization and final-result validation preserve them. Missing fields are unknown; explicit zero is observed. Anthropic total input includes cache read/write, whereas compatible-provider totals already include them. Invalid optional compatible counters are omitted. Legacy Anthropic null cache counts still contribute zero to total input but are not asserted as observed zero.
- No output response is reused locally. No warming, cache-miss retry, credential selection or grant changes were added.

## Source verification and workflow application

`replica-recon` was adapted during planning to inventory original sources and distinguish prefix/KV reuse from semantic answer reuse. `mind-control` and `performance-oriented-software-engineering` separated observed facts from the hypothesis of lower cost/latency. `incremental-implementation` was adapted to a complete usage/persistence slice followed by prompt/transport changes and targeted acceptance; no commit was inferred from the workflow.

Primary references checked during planning:

- [Anthropic prompt caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching): combined explicit and automatic markers, exact prefixes, five-minute default, usage accounting and workspace isolation. Five-minute writes have a premium; hits do not prove end-to-end speedup.
- [OpenRouter cache usage](https://openrouter.ai/docs/guides/best-practices/prompt-caching): compatible `prompt_tokens_details.cached_tokens` and `cache_write_tokens`.
- [OpenAI prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching): model-dependent API contract; the research report's `cache_prompt=True` example was not adopted.
- [vCache paper](https://arxiv.org/abs/2502.03771), [VectorQ v1](https://arxiv.org/abs/2502.03771v1), [repository license](https://github.com/vcache-project/vCache/blob/master/LICENSE): semantic response cache; earlier/later versions of the same paper; CC BY-NC-ND 3.0 observed rather than the report's MIT claim. No upstream code was copied or executed.

## Verification

- Initial complete usage/persistence slice: focused controller test passed, including reinitializing runtime state and reading cache totals/coverage back. One selected test passed; twenty were skipped by the name filter. Cold import took 110 seconds; this is test-host evidence, not product latency.
- Independent transport run before the null additions: two provider files, 69/69 tests passed. Later source/test additions require the final integration run below.
- Targeted integration: 190 passed and one failed across eight files / 191 cases. The failing assertion still searched for standalone Skill guidance; the test was updated to inspect the guidance inside the first stable system block. Its focused rerun passed (1 passed, 21 intentionally skipped). No production code changed after the integration run. Evidence: `runtime/tmp/anthropic-prompt-caching-tests.json` and `runtime/tmp/anthropic-prompt-caching-controller-recheck.json`; the original failure is retained.
- `npm run build`: exit 0. Path policy passed (506 authored files, zero exceptions), Skill ownership passed (42 sources / 46 managed artifacts), project structure passed (471 directories), browser transport current, TypeScript compilation succeeded. Whitespace check passed with existing CRLF recognized.
- Activation: exactly one `restart_agent_core(capabilitiesChanged=false)` request. Worker receipt `runtime/restart/2ca79d1f44a74a9a8782274abf7efee4.json` exited 0, but its 61-second health sample had not answered; this was not treated as readiness proof. Independent subsequent HTTP health returned `ok`, version `1.6.0`, `build.stale=false`, Native available/zero issues and canonical Memory available/zero issues. The new listener on port 8765 belongs to Node PID 20328, created after the build. Source/dist SHA-256 evidence is in `runtime/tmp/anthropic-prompt-caching-resident.json`. A later bounded health snapshot timed out its build and Memory probes while HTTP and Native remained available; it is preserved in that file, with follow-up recorded separately below. Startup tracker also logged one unobserved I/O-task exception; no launcher/runtime failure followed in the acceptance window. No second restart was used.
- Health follow-up: build remained non-stale and Native available. Memory's bounded health probe alternated between available/zero issues and `HEALTH_PROBE_TIMEOUT`; normal canonical Memory and Learning calls continued. This is a retained health-observability limitation, not evidence of Memory data loss or a claim that the underlying cause was repaired. No Memory/health source or timeout setting was changed. The external episode's independent host-verifier status is also `unavailable`; concrete test/API/chat readback evidence remains separately inspectable.

## Real provider acceptance

Direct adapter evidence: `runtime/tmp/anthropic-prompt-caching-live.json`. Exactly two task-issued direct completions used the same synthetic prefix, model `claude-sonnet-5-5`, workspace, low effort and five-minute TTL. Cold: write 6,925 / read 0 / total input 6,929 tokens, response `CACHE_COLD_OK`, adapter elapsed 1,639 ms. Warm with a different final user request: read 6,906 / write 19 / total input 6,929, response `CACHE_WARM_OK`, elapsed 1,309 ms. These two samples prove cache activity, not general latency improvement.

Native evidence: `runtime/tmp/anthropic-prompt-caching-native.json`. Conversation `a19e6f30-c4db-4243-93dd-1d334cdd88e9` (title **Tes Prompt Caching Anthropic**) used distinct request IDs and no replay. Both turns stayed on `anthropic:01 / claude-sonnet-5-5`, completed with one model call and zero ordinary tool calls, and reported Native Learning complete.

| Turn | Answer | Cache read / write | Total input | Model / recall | Bridge elapsed |
| --- | --- | --- | --- | --- | --- |
| `e442f8d1-b3f6-42ba-83b7-39e917929905` | `42` | 0 / 15,553 | 15,557 | 5,856 / 17,949 ms | 64,396 ms |
| `9d704522-223d-447c-904e-0b7a4fec258b` | `84` | 6,866 / 9,181 | 16,051 | 6,323 / 22,637 ms | 77,648 ms |

Independent chat readback returned all four persisted messages, both finalized turns and matching cache metrics/observation counts. The answers were independently checked as arithmetic; `jobVerification=unavailable` remains the Native host's separate job-verifier status and is not relabeled. Fixture coverage additionally proves runtime-reload durability; no second resident restart was necessary to establish it.

## Action ledger

Changed provider/config, Native prompt composition, checkpoint validation, task metrics normalization and corresponding focused tests; updated `.env.example`, `docs/CODEBASE.md`, this report and one minor changeset. Wrote bounded task evidence under existing `runtime/tmp`, created the named test chat, performed two direct completions and two Native turns, and requested one official restart. No dependency installation, new folder/storage owner, credential-value edit, release application, version change, commit, push or deployment occurred. Existing unrelated worktree changes were preserved.

The bounded structural review identified the ordinary completion and readiness-construction callers; exact current source confirmed that each preserves its intended caching setting. Graph line anchors predated the current source, so source and focused tests took precedence. Canonical Memory checkpoint readback established task continuity before activation. An attempted Memory evidence capture of `runtime/tmp` correctly returned `excluded-path`; no alternate tool was used to bypass that exclusion.

## Limits and rollback

No percentage saving or latency improvement is established by source changes or fixtures. Record model, recall and whole-operation durations separately; the nonstreaming transport does not measure TTFT. Provider token counts and priced estimates are not proof of invoice or promotional-credit debit.

Disable the feature with `ANTHROPIC_PROMPT_CACHING=false` and use the official restart path when applying that configuration. Durable additive metrics and legacy checkpoints remain readable. Do not reset or delete Memory, provider state or chat history to roll back caching.

## Model ownership clarification — 2026-10-29

The user accepts the initial cache-write premium and asked whether Haiku could be the default caching model while leaving the interaction model freely selectable. The linked [prompt-caching documentation](https://platform.claude.com/docs/en/build-with-claude/prompt-caching) describes caching inside the selected model's Messages request, not a separate cache-model parameter. Anthropic's [official explanation, Prompt cache section](https://claude.com/resources/articles/reducing-cost-and-improving-performance-with-claude-platform#prompt-cache), explicitly states that the cache is pinned to a specific model. Haiku therefore cannot populate a prompt cache for a later Opus/Sonnet/Fable request. Freely selectable interaction models each use their own eligible cache; switching models can require a new write. The five-minute write premium is 25% on the input tokens actually written to cache, not a blanket increase on the whole request. Reuse still requires a matching eligible prefix within TTL; initial expense alone does not guarantee later savings.

`source-driven-development` was adapted to check the actual provider contract against both current official sources. No source, default-model configuration, prewarming, inference, install or restart was performed for this clarification. The existing Sonnet default and model selector remain as previously accepted; no independent Haiku cache worker was added. This is a documented API limitation, not a new cross-model live experiment or a claim of measured savings.
