# Duanyan TokenPlan configuration for Agent Core

Verified: 2026-10-23. Scope: provider-format investigation and an inactive, secret-free 18-slot template. The live `.env`, credentials, provider order and scheduler are unchanged. No restart or Duanyan inference request was performed.

## Result

The existing Atria route can use Duanyan's OpenAI Chat Completions interface without a new adapter or environment-variable schema. Update its base URL, select an exact Duanyan model ID, and replace its credential values with Duanyan-issued keys. Agent Core's internal provider ID remains `atria`.

| Setting | Prepared value |
| --- | --- |
| `ATRIA_BASE_URL` | `https://discovery-api.intern-ai.org.cn/v1` |
| `ATRIA_MODEL` | `Atria-Dawn` |
| Credential slots | `ATRIA_API_KEY_01` through `ATRIA_API_KEY_18` |
| Authorization | Adapter sends `Authorization: Bearer <key>`; paste only the key value |
| Full request endpoint | `POST https://discovery-api.intern-ai.org.cn/v1/chat/completions` |

The [prepared template](../.env.duanyan.example) contains 18 empty slots. Replace the existing ATRIA block rather than appending duplicate settings. Keep unused slots empty. The current parser reads `ATRIA_*`; creating `DUANYAN_*` or copying the documentation's generic `TOKENPLAN_API_KEY` name alone would not configure this route. Existing OpenRouter/Gonka settings remain independent.

## Protocol and model evidence

- The [official Atria site](https://api.atria-asi.ai/) links Duanyan TokenPlan and explains its tightened website quota. Its [Chat Completions documentation](https://api.atria-asi.ai/docs) uses Bearer authentication and `model`/`messages` input.
- Duanyan's [API overview](https://discovery.intern-ai.org.cn/token-plan/home?tabIndex=3&dockey=01-overview.md) gives the OpenAI base URL above, `/v1/chat/completions`, JSON requests, and Bearer authentication. The [Chat Completions reference](https://discovery.intern-ai.org.cn/token-plan/home?tabIndex=3&dockey=03-chat-completions.md) lists `model`, `messages`, `stream`, `tools`, `tool_choice`, and tool-result messages with `tool_call_id`. Tool availability remains model-dependent.
- The live [model list](https://discovery.intern-ai.org.cn/token-plan/home?tabIndex=1) matched the user's screenshots: `Agents-A1` (256K, text/image), `Atria-Dawn` (512K, text), and `Sage-A1.5` (256K, text/image) were marked free and listed OpenAI Chat. This is a dated catalog observation, not a permanent price or capability guarantee. Older search-cached documentation still listed Preview names; the fresh catalog was used for this template.
- The [API-key page](https://discovery.intern-ai.org.cn/token-plan/home?tabIndex=0) and live authentication documentation state a maximum of 10 keys per user. All those keys share account credits, RPM and TPM. Eighteen local slots do not imply 18 provider-issued keys or additional quota. Fill only credentials legitimately available to the account; the remaining slots stay blank.

Source comparison: `src/config.ts::numberedCredentials` reads zero-padded slots 01–20, skipping blanks and duplicate values. `src/agent-provider.ts::OpenAICompatibleProvider.complete` already sends the documented endpoint/header/message/tool shape. Its current Native controller uses text messages; selecting a multimodal model does not add image-input support to that controller.

## Verification and limits

The template was parsed using Node's built-in `parseEnv`, then passed to the actual compiled `loadConfig` with 18 synthetic distinct key values. Assertions verified 18 empty template slots, 18 parsed synthetic credentials, the exact base URL/model and the resulting endpoint. No live key was read or sent by this check; no package installation or network call occurred. An initial optional `dotenv` import was unavailable; the existing Node built-in parser was used instead.

Public documentation and models were observed through task-owned background OBU tabs, all closed with acknowledged cleanup. Transient `BROWSER_CONTROL_SESSION_NOT_FOUND` responses were reconciled through a fresh observation before further document navigation; no credential/account action was performed.

Duanyan authentication, actual key permissions, per-model tool output and a complete Native task are **not yet live-tested** because the new keys have not been supplied. After the user fills the block, verify `/v1/models` and one bounded tool call before repeating the existing Native nonce/read-file/sum/persisted-final oracle. Let the existing credential-revision owner reconcile changed keys; do not reset the provider scheduler to force availability.

The preceding Native reliability integration has a separate [execution report](history-agent-core/Native-Architecture-Integration-Execution-20261023.md): its guided real Native task passed through OpenRouter, not Duanyan. Its later causal-learning and performance waves remain open.

## Update 2026-10-25: live configuration

- Project `.env` now uses this note's values: `ATRIA_BASE_URL=https://discovery-api.intern-ai.org.cn/v1` and `ATRIA_MODEL=Atria-Dawn` (two lines changed by a scripted edit with a before/after hash check; nothing else in the file changed). The provider order is `atria,gonka,openrouter` (OpenRouter last, at the user's request).
- The 18 `ATRIA_API_KEY_nn` slots hold the user's Duanyan keys. The user states that each key belongs to a different account (one account, one key), so the "keys share account credits" caveat above does not apply between these slots. This is the user's statement; the controller did not verify it.
- Duanyan's catalog uses schema 2.x with nested per-modality objects (`input_modalities` / `output_modalities` entries carrying `max_context_length`, `supported_parameters` and `max_length`). The readiness parser before 2026-10-25 did not read that layout; it does now. `Atria-Dawn` resolves to context 524288 and output 524288 (the catalog's output value equals its context value).
- Readiness after the 09:46 restart: 17 of 18 credentials `ready` (`MODEL_TOOL_PROBE_VERIFIED`) at the first pass; `atria:06` first reported `MODEL_CATALOG_UNAVAILABLE` (transient) and was `ready` at its re-probe (09:55:54). At 10:00 all 18 were `ready`.
- One Native Chat task ran on this route (read-only, one tool call): provider `atria`, model `Atria-Dawn`, route decision attempt 1 `keep` on `atria:01`, 5 model calls, 59,005 input plus 776 output tokens (59,781 total) as reported by the provider. See sections 14-22 of the [evidence report](Native-Provider-Routing-Evidence-20261025.md).
- Still unverified: Duanyan's behavior at its RPM, TPM and credit limits (the 429 body shape, and whether it uses codes such as `quota_exceeded`), long-context tasks, multi-tool tasks and sustained use. The readiness probes also spent tokens on each credential at every start; that cost was estimated at a few thousand tokens in total and was not measured.
