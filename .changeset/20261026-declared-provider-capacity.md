---
"agent-core": patch
---

Named Native providers accept an owner-declared capacity, `<PROVIDER>_CONTEXT_WINDOW_TOKENS` and `<PROVIDER>_MAX_OUTPUT_TOKENS` (for `ATRIA_`, `GONKA_` and `OPENROUTER_`), used by model readiness only when the provider's `/models` entry for the pinned model carries no limits. Since about 2026-10-23 gonkarouter lists models with only `id` and `object`, so every gonka key stayed `MODEL_CONTEXT_OR_TOOLS_UNPROVEN` and the route was skipped although the keys authenticate. Both values are required, and each key still has to pass the live tool probe before it is used. Without the variables nothing changes.
