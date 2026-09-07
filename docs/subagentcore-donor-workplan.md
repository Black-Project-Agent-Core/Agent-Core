# SubAgentCore: Ordered Six-Donor Workplan

Status: LOCAL_PREPARATION; live worker dispatch has NOT run in this session.
Operator workspace: `E:\Projects\Agent-Core`.
Credential file: `E:\Projects\Agent-Core\.env` (not the historical Langflow .env).
The historical `F:\Projects\Agent-Core` path is not available on this host.

## Team and authority

| Agent | Role on each donor | Default provider |
| --- | --- | --- |
| JOE | Sole leader; reads source, owns design, edits native code, runs checks, accepts or rejects claims | Current assistant |
| Astra | Source/config/test scout; reports file/line evidence and existing internal reuse options | OpenRouter |
| Forge | Proposes bounded native implementation and tests only after JOE accepts the design | OpenHands |
| Sentinel | Challenges claims, reproduces edge cases through leader-owned tools, reviews secret boundaries | NVIDIA |
| Scribe | Produces bounded handoff candidates: evidence, failures, decisions, unresolved work | OpenRouter |

Worker tool requests are proposals. They do not grant direct access to this Windows filesystem.
Only the leader executes local tool requests and decides final acceptance.
Every dispatch preflights the same principal/project MemoryService; no second memory database is introduced.
The existing service persists sanitized worker handoffs as observations. An observation is not proof that a claim is verified.
Never promote a worker assertion to an accepted project fact without JOE's evidence review.

## Fixed donor order

| Order | Public repository | Local folder | Investigation objective |
| --- | --- | --- | --- |
| 1 | dietrichgebert/ponytail | referensi/01-ponytail | Internal-first engineering and per-worker policy/context injection |
| 2 | scanaislop/aislop | referensi/02-aislop | Deterministic findings, typed skip/failure, false-positive control |
| 3 | miqdadbadjuber/anti-slop | referensi/03-anti-slop-miqdad | Purpose and delivery gates with testable evidence |
| 4 | dmmulroy/anti-slop | referensi/04-anti-slop-dmmulroy | Selective TypeScript/JavaScript evidence-preserving rules |
| 5 | decolua/9router | referensi/05-9router | Baseline provider-specific slot selection, cooldown, retry and failover |
| 6 | diegosouzapw/OmniRoute | referensi/06-OmniRoute | Compare stronger resilience and concurrency controls after #5 |

These objectives come from the accepted historical task; they are NOT fresh certification of all six codebases.
Do not start donor N+1 until JOE has recorded donor N's evidence, recommendation, rejected mechanisms and open questions.
Within one donor: Astra investigation -> JOE source check -> Sentinel challenge -> JOE design decision -> Forge patch proposal -> JOE implementation/tests -> Scribe handoff -> JOE checkpoint.
Use existing Agent Core continuity/checkpoint facilities when the connector works; this file is a work packet, not another runtime ledger.

## Evidence and mutation boundaries

- Read source, config and tests first. Documentation supports rather than replaces implementation evidence.
- Record repository HEAD and relevant source path, line range and hash for each finding.
- No npm/pip installation, build, test execution or application execution inside any donor repository.
- Implement and run tests only in our own native Agent Core/Langflow boundary after acceptance.
- Do not import/require a donor source file, launch donor hooks, or make a donor a runtime dependency/submodule.
- Compare the mechanism with existing internal capabilities before adding code.
- Preserve license/provenance for any literal reuse; do not silently copy whole donor subsystems.
- Keep all six raw directories until native implementation and stability gates pass. No cleanup in this session.
- `referensi/Graft` and `referensi/codebase-memory-mcp` are outside this six-donor task; leave them untouched.
- Do not confuse 403 entitlement denial with quota/rate limit. Respect account/provider/global limits; slot rotation is not quota bypass.

## First source review performed by JOE in this session

Read, not executed: `01-ponytail/hooks/ponytail-instructions.js`, `hooks/ponytail-subagent.js`, `hooks/claude-codex-hooks.json`, `tests/behavior.test.js`.
The instruction builder contains a reuse ladder; the subagent hook injects the rules independently at SubagentStart.
Agent Core already has `buildWorkerSystemPrompt` and a shared-memory preflight on every dispatch; reuse those primitives rather than install donor hooks.
This is a bounded first-pass source finding, not completion of all Ponytail analysis or transplant certification.
No Astra/Forge/Sentinel/Scribe model was called: all six credential slots were empty when inspected.

## Operator setup

Fill only the secret values in the existing root `.env`; do not replace its entire contents:
```env
SUBAGENTCORE_OPENROUTER_API_KEY_1=
SUBAGENTCORE_OPENROUTER_API_KEY_2=
SUBAGENTCORE_NVIDIA_API_KEY_1=
SUBAGENTCORE_NVIDIA_API_KEY_2=
SUBAGENTCORE_OPENHANDS_API_KEY_1=
SUBAGENTCORE_OPENHANDS_API_KEY_2=
```
Slot 2 is optional; additional positive-number slots are discovered automatically.
Provider default models are currently blank. Set `SUBAGENTCORE_<PROVIDER>_DEFAULT_MODEL`, or let JOE provide an explicit model on dispatch.
Readiness checks the default bindings only; a blank default does not prevent a leader-specified model.
OpenHands uses a Cloud API key for the conversation API, not an OpenHands LLM-proxy key.
After saving `.env`, restart the existing Agent Core instance in a controlled way because the service reads configuration at construction.
Run `node scripts/subagentcore-check.mjs` from the project root to inspect local configuration safely.
Exit 0 means CONFIGURED_NOT_LIVE_TESTED; exit 2 means configuration is missing/disabled; exit 1 means the check failed.
The checker never calls a model, writes key-state, or opens the memory database. It does not certify account entitlement or loaded live-runtime configuration.

## Provider research and data boundary

Official catalog checks confirm candidate IDs `nvidia/nemotron-3-super-120b-a12b` (NVIDIA) and `nvidia/nemotron-3-super-120b-a12b:free` (OpenRouter).
These are candidates, not preconfigured defaults or live account-entitlement evidence. The root `.env` was left unchanged.
Sources: https://build.nvidia.com/nvidia/nemotron-3-super-120b-a12b/build ; https://openrouter.ai/nvidia/nemotron-3-super-120b-a12b:free ; https://docs.openhands.dev/openhands/usage/llms/openhands-llms
The NVIDIA free-endpoint notice prohibits confidential/personal data and discloses session logging. Do not send a private memory dump or private project source to that endpoint.
For public donor analysis, prepare a reviewed public-source task packet and a suitably scoped shared-memory context; the worker must never receive `.env` or the raw memory database.
The historical OpenHands DeepSeek V4 Flash success is recorded in the supplied transcript; its current availability must be verified with the configured account before any success claim.
