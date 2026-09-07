# OpenRouter free routing verification - 2026-09-06

## Research and decision
Official sources: https://openrouter.ai/docs/guides/routing/routers/free-router ; https://openrouter.ai/docs/guides/routing/routers/auto-router ; https://openrouter.ai/docs/api_reference/limits ; https://openrouter.ai/docs/guides/routing/provider-selection .
`openrouter/auto` has no additional router fee, but charges the selected model's rate; it is not a free-only route.
`openrouter/free` is the free-only router. It randomly selects a model after filtering for required capabilities. It shares account-wide free-model limits and is not guaranteed to avoid 429.
The live public catalog fetched between 2026-09-05T18:57:47Z and 19:00:30Z (6 September 2026, 01:57-02:00 WIB) contained 431 entries, including 19 zero-price `:free` variants and `openrouter/free`.
The previous `z-ai/glm-5.2:free` default remains catalog-listed: previous upstream rate limiting did not prove an invalid model ID.

## Fresh live evidence
All three inference requests used `openrouter:1`, the existing built OpenAICompatibleProvider, synthetic text only, a 4096-token ceiling, and provider.max_price prompt/completion/request = 0. No key rotation or private memory export occurred.
| Requested route | Actual model | HTTP | Recorded cost | Strict result |
| --- | --- | --- | --- | --- |
| openrouter/free, JSON mode | dots-studio/dots-3-note-preview:free | 200 | 0 | Valid envelope; multiplication correct; reversed string mismatch. |
| openrouter/free, existing adapter shape | nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free | 200 | 0 | Valid envelope; HTTP code correct; classification string mismatch. |
| minimax/minimax-m2.7:free, existing adapter shape | minimax/minimax-m2.7:free | 200 | 0 | PASS: summary model_entitlement, findings ["403"], empty actions/handoff. |
The fixed MiniMax result used GMICloud, 147 prompt tokens, 330 completion tokens, 3694 ms. This is one canary, not comprehensive model certification.
Recommendation: provisional OpenRouter worker default `minimax/minimax-m2.7:free`; `openrouter/free` is an explicit alternate for availability experiments, not an implemented automatic fallback.

## Current configuration and boundaries
The attempted `.env` model update was blocked by the tool safety layer. No alternate write path was attempted.
Read-only configuration verification AFTER that block confirms the stored OpenRouter default is still `z-ai/glm-5.2:free`.
NVIDIA and OpenHands configuration is unchanged. Agent Core was not restarted. Production source, donors, and shared memory were not modified.
Agent Core MCP status returned FORBIDDEN for this conversation; actual local work used Desktop Commander on archi.
To adopt the recommendation, change only `SUBAGENTCORE_OPENROUTER_DEFAULT_MODEL=minimax/minimax-m2.7:free` in `E:\Projects\Agent-Core\.env`.
Evidence under `runtime/verification/subagentcore-readiness-20260906`: `openrouter-free-catalog.json`, `openrouter-free-probe-result.json`, `openrouter-free-task-probe-result.json`, `openrouter-fixed-free-probe-result.json`.
The first two probes correctly failed strict answer gates despite HTTP 200. Do not misreport them as answer-verification PASS.
This is a local handoff, not a checkpoint in Agent Core's memory database.
