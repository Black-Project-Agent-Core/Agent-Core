# SubAgentCore live provider verification - 2026-09-06

## Scope and configuration
- Machine: archi. Config: `E:\Projects\Agent-Core\.env`.
- Confirmed loaded slots: OpenRouter 1-18; NVIDIA 1; OpenHands 1-2.
- Corrected NVIDIA variable name from `SUBAGENTCORE_NVIDIA_API` to `SUBAGENTCORE_NVIDIA_API_KEY_1`; key value unchanged.
- Restored model defaults: `z-ai/glm-5.2:free`, `nvidia/nemotron-3-ultra-550b-a55b`, `openhands/deepseek-v4-flash`.
- `.env` was verified ignored and untracked when models were restored. No key values were printed.

## Actual live outcomes
- NVIDIA slot 1: initial strict answer mismatch; diagnostic retry HTTP 200, summary `21199`, findings `["EROCTNEGA"]`, verified correct.
- OpenRouter slot 1: authentication HTTP 200. GLM 5.2 free returned HTTP 429 twice.
- One MiniMax M3 free alternative returned HTTP 429; upstream metadata identified GMICloud temporary rate limiting, Retry-After 60 seconds. No cycling through the other 17 keys.
- OpenHands slot 1: DeepSeek completed. Its exported assistant MessageEvent was recovered and verified: `21199`, `["EROCTNEGA"]`.
- OpenHands slot 2: fresh post-fix adapter invocation returned a valid worker envelope, but strict answer verification failed: `21199`, `["EROC TNEGA"]` (an extra space). This is not an authentication failure.

## Parser correction
- Actual export used pretty-printed JSON MessageEvent with nested `llm_message.content` text blocks; the old parser read JSONL only.
- Updated `src/subagentcore/providers/openhands.ts`; added regressions in `tests/subagentcore-providers.test.ts`.
- State snapshots and system-prompt examples are excluded from final-answer recovery.
- RED: 3 failures / 11 passed. GREEN provider suite: 14 passed. Root build: PASS. Related regression: 11 files / 51 tests passed.
- Source readback and scoped whitespace check passed. Backup and manifest are under `runtime/verification/subagentcore-readiness-20260906`.

## Boundaries and evidence
- No Agent Core runtime restart, live MCP worker dispatch, shared-memory access, donor changes, or Git publishing occurred.
- Tests used synthetic text only, not private repository content or private memory.
- OpenRouter slots 2-18 were loaded but not individually authenticated or inference-tested.
- Do not declare all providers or the full SubAgentCore team stable from these checks.
- Evidence files: `model-canary-result.json`, `model-diagnostics-result.json`, `openrouter-fallback-result.json`, `openhands-readback-result.json`, `openhands-final-slot2-result.json`, `openhands-slot2-readback-result.json`, `export-parser-manifest.json`, and `export-parser-regression.log`, all under the verification directory above.
- A final combined-report/config-recheck command was blocked by the tool safety check. The proposed `live-provider-verification-summary.json` was not created; rely on the individual verified evidence files instead.
- This document is a local handoff, not a checkpoint committed to Agent Core's memory database.
