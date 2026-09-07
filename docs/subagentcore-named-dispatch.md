# SubAgentCore named dispatch contract

Contract version: `named-v1`.
JOE remains the sole leader. Workers return findings and tool-use proposals, not unrestricted local actions.

| Name | Canonical ID | Default provider | Purpose |
| --- | --- | --- | --- |
| Astra | astra | OpenRouter | Architecture and context inspection |
| Forge | forge | OpenHands | Focused implementation proposals |
| Sentinel | sentinel | NVIDIA | Verification and safety review |
| Scribe | scribe | OpenRouter | Reviewed knowledge and handoff preparation |

## Calling a worker
Use the existing single MCP tool `subagentcore`, not separate tools or plugins per worker.
First obtain an owned `routeContextId` through `capability_route`.
Then call:
```json
{
  "operation": "dispatch",
  "routeContextId": "<owned route UUID>",
  "workerName": "Astra",
  "task": "Inspect the supplied architecture and report findings."
}
```
`workerId` remains supported. Names/IDs are exact after trimming and case normalization; ambiguous name/ID combinations and unknown names are rejected. JOE cannot be dispatched as a worker.
Operations remain `status`, `team`, `dispatch`, `reset_slot`.
Status exposes `contractVersion: named-v1`, never raw credentials.

## One scoped memory, explicit export
Every dispatch performs local preflight against the same Agent Core MemoryService and its principal/project guardrails.
Cloud export is restricted to leader-selected `sharedMemoryIds` (up to 16 active, accessible records; 2000 characters each). Omit the field to export no memory. The leader must select only provider-appropriate, non-confidential records and task context. No absence of export is interpreted as an empty memory database.
The result reports the exported IDs and context ID. Cross-principal/project IDs fail before provider invocation.
A worker returns `memoryHandoff` with `memoryHandoffStatus: PENDING_LEADER_REVIEW`; dispatch never automatically makes the candidate durable. The leader verifies it and uses existing memory operations to persist only justified knowledge. Scribe and other workers can subsequently receive that reviewed record through the same shared scope.

## Provider binding and resilience
Provider/model/slot defaults are read from the main repository `.env` at runtime creation.
Current selected defaults: `minimax/minimax-m2.7:free`, `nvidia/nemotron-3-ultra-550b-a55b`, `openhands/deepseek-v4-flash`.
The configured pool has OpenRouter slots 1-18, NVIDIA slot 1 and OpenHands slots 1-2. Loading a slot is not proof its credential is valid.
OpenRouter accepts only `:free` models or `openrouter/free`, enforces zero-price provider ceilings, rejects paid `openrouter/auto`, and never silently chooses paid inference. Chat completion output is capped at 8192 tokens.
Known key-scoped 429 failures may rotate. Unscoped/provider 429 applies a persisted provider-wide cooldown rather than firing requests through all keys. Slot reset does not remove a provider cooldown.
Concurrent initialization shares one loading promise, so workers cannot bypass restored cooldown.
OpenHands terminal metadata may precede final export availability. The adapter retries the SAME export up to sixteen times with capped backoff under the existing overall deadline, without starting another inference.
Output exposes `requestedModel`, actual `model` where provided, and available token/cost usage. It never treats zero/missing usage as universal free service.

## Verification boundaries
Offline tests exercise routing ownership, name mapping, memory isolation/export, handoff review, rate scope, recovery, concurrent initialization, response parsing and redaction.
Live certification uses a disposable authenticated Agent Core HTTP/MCP instance and synthetic shared memory with real provider adapters. It does not read or replace the production MCP authentication key or production memory database.
The current chat's Agent Core connector availability is a separate host capability, not proved by a local provider canary.
No finite test certifies all model answers, all credentials, or perpetual upstream availability. A worker answer is advisory until the leader verifies it.
