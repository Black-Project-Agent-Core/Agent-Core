# OpenRouter Free Models and Three-Provider R4 Selection
Date: 2026-10-24 | Status: SOURCE-VERIFIED RECOMMENDATIONS; NO ACTIVE PROVIDER CONFIG CHANGE

## Goal and decision
Select exact free OpenRouter models that fit Agent Core's text-based OpenAI Chat Completions + tool_calls loop, without relying on the moving `openrouter/free` alias. Preserve existing Gonka, Atria (potential Duanyan adapter), and OpenRouter routes and the user-declared independent-account, one-key-per-account credential design.

**Primary candidate for deep agentic reasoning / long research:** `nvidia/nemotron-3-ultra-550b-a55b:free`. Listed free, text 1M context, 65,536 max output, accepts `tools`/`tool_choice`; OpenRouter says `response_format` is NOT supported on this FREE endpoint. This is a candidate, not a measured best model for this repo.
**Alternate exact-model agent/control trial:** `nvidia/nemotron-3-super-120b-a12b:free`. Listed free, 262,144 context, accepts tools/tool_choice AND JSON-schema `response_format`. Current Agent Core code does not emit `response_format`, so that latter feature does NOT currently improve Native correctness by itself.
**Structured-output/coding alternative:** `qwen/qwen3.8-27b:free` (262,144 context, tools/tool_choice, JSON-schema response_format); use as independent candidate, not mixed within one omit/reuse experimental pair.
**Coding-agent alternative:** `thinkingmachines/inkling-small:free` (1,048,576 context, tools, no `response_format`). The free page restricts usage to agentic harnesses; no free-model performance gain is claimed locally.
**Lightweight coding alternative:** `cohere/north-mini-code:free` (256,000 context, tools/tool_choice, no response_format).
**High-throughput lightweight option:** `nvidia/nemotron-3.5-lightning:free` (1M context, tools/tool_choice, no response_format), useful only after readiness verification.

## Current listing caveats
- MiniMax `minimax/minimax-m3.1-flash:free` debuted 2026-10-19, but its official listing states the free launch period ended 2026-10-22 12:00 UTC, despite other cached cards still showing free. Do not treat as stable guaranteed-free endpoint.
- Poolside `poolside/laguna-s-2.1:free` is officially marked going away 2026-10-31. Do not choose it for a long-lived R4 baseline.
- OpenRouter free-model usage charts rank traffic, NOT quality. Free endpoint uptime/availability values vary over time and sometimes across page snapshots; only a current endpoint test can qualify real task readiness.
- OpenRouter official pricing/docs: free requests are generally limited to 50/day and 20/min on an uncredited account, or 1000/day with an account that has purchased at least $10 credits. Quotas are scoped to account, not multiplied by adding keys **within that account**. The user states each configured key maps to a distinct account; do not collapse those accounts into one.
- Free NVIDIA and Thinking Machines endpoints provide their own data-handling disclosures. Check suitability for private source or personal data when selecting where real tasks are routed.

## Actual Agent Core owner mapping (source read)
- `src/config.ts`: named routes `atria`, `gonka`, `openrouter`; per-provider numbered `*_API_KEY_01..20`, excluding blank/repeated key values. No key value read by this task.
- `src/agent-provider.ts::credentialList` stores distinct credential IDs/ordinals, and `src/agent-provider-scheduler.ts` selects credential candidates using persisted provider state.
- `src/agent-provider-readiness.ts` reads `/models` metadata and issues a bounded tool-call probe before marking model/key ready; listing alone does not prove a specific key can call tools.
- `src/agent-provider.ts::OpenAICompatibleProvider.complete` currently sends `{model,messages,tools,tool_choice:'auto',stream:false}` for tool tasks and accepts `tool_calls` in responses; it does not send `response_format`.
- Local resident read-only health observed 3 configured providers, Core `ok`, Native/Memory `available`. The specific number of currently eligible/live keys per provider was NOT verified from their secret-bearing configuration.
- R4 owner report `docs/history-agent-core/Native-Architecture-Integration-Revision-4-Execution.md` notes cached historical Gonka pending, Atria unavailable, OpenRouter ready; cache state is NOT current-key/tool readiness and does NOT prove the account has failed.

## R4 experimental use (not yet dispatched)
1. Keep production global sticky multi-provider cursor and all independent account key slots as-is. For ordinary operations, use existing qualified routing/failover; an observed model mismatch on provider fallback is normal operational evidence.
2. For the scientific omit/reuse comparison, PRESELECT one exact provider/model in an isolated evaluated task environment, and hold model ID, controller settings, tool contracts, oracle, case digest and measurement definition fixed across the pair.
3. Before any long cohort, use an authorized bounded readiness probe for exact model+credential without sending sensitive repo content. Record returned provider-reported resolved model, tool-call behavior, context and errors. Free listing and account counts are not equivalent to access validation.
4. Freeze route/model per pair; if any run changes model/provider or encounters HTTP400, mark the pair incomparable/failed and diagnose instead of silently swapping providers within the comparison.
5. Compare outcomes and actual Memory-use receipts using independent oracles, retain failures, record latency/tokens only when observed. No causal Memory improvement can be claimed from source integration or an unpaired successful task.
6. Existing `scripts/verify/native-memory-reuse.mjs` does not pin a per-evaluation provider/model. Isolated routing is an OPEN prerequisite; no active config, credentials or runtime were changed by this model research.

## Primary-source references checked Oct 24, 2026
- https://openrouter.ai/collections/free-models
- https://openrouter.ai/nvidia/nemotron-3-ultra-550b-a55b:free
- https://openrouter.ai/nvidia/nemotron-3-super-120b-a12b:free
- https://openrouter.ai/qwen/qwen3.8-27b:free
- https://openrouter.ai/thinkingmachines/inkling-small:free
- https://openrouter.ai/cohere/north-mini-code:free
- https://openrouter.ai/nvidia/nemotron-3.5-lightning:free
- https://openrouter.ai/minimax/minimax-m3.1-flash:free
- https://openrouter.ai/poolside/laguna-s-2.1:free
- https://openrouter.ai/pricing

Evidence boundary: public catalog metadata, current local source and sanitized `/health`; NO current-key authenticated tool-inference probe, no actual model-comparison performance run, no provider model mutation and no credentials were read. Results are recommendations, not measured model quality ranking.
