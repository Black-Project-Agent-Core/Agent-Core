# SubAgentCore model selection - 2026-09-06

## Applied local configuration
Host accessed: archi via Remote Desktop Commander.
Root: E:\Projects\Agent-Core
Only three DEFAULT_MODEL values in the root .env were changed.
All non-model bytes were verified unchanged; .env is Git-ignored and untracked.

| Provider | Default model | Worker bindings |
| --- | --- | --- |
| OpenRouter | z-ai/glm-5.2:free | Astra, Scribe |
| NVIDIA | nvidia/nemotron-3-ultra-550b-a55b | Sentinel |
| OpenHands | openhands/deepseek-v4-flash | Forge |

OpenRouter free GLM 5.2 was found in the live public /api/v1/models catalog (256000 context, prompt/completion pricing 0). Selected for a cost-bounded coding/agent baseline, not declared the best model or inference-tested.
NVIDIA official model build page confirms the exact model ID.
OpenHands selection follows the user instruction and historical DeepSeek-only entitlement; current entitlement was not re-tested.

## Verification boundary
Root loader resolves all four worker models: no MODEL_MISSING blockers remain.
All three providers still have zero populated key slots in the accessed root .env.
Root contains only example key slots 1 and 2 per provider, not the user's reported filled 18/1/2 pool.
Direct file reading succeeded; no SUBAGENTCORE process-environment overrides were found.
Two legacy OpenHands credential variables are populated in SubProject\langflow\.env; they were NOT copied or used.
Model canary result: NOT_RUN_MISSING_KEY for all three providers. Live inference calls: 0.
No service restart, memory database access, donor changes, or Git publication occurred.

Evidence: runtime\verification\subagentcore-readiness-20260906\model-selection.json
Evidence: runtime\verification\subagentcore-readiness-20260906\model-canary-result.json
Next action: resolve the actual location/save state of the user-populated .env, then rerun the bounded canary before claiming live availability.
