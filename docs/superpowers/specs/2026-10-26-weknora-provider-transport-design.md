# WeKnora-inspired provider response transport classification

User goal: deep donor audit and useful Agent Core upgrades, with execution authorized. This is a bounded change within that approved goal; no new user approval ritual is needed.

## Problem and evidence

During the Native donor audit, task `a0e9ab8c-78f6-4cb5-bf2e-df9465f80647` failed after successful tool calls with message `terminated`, classified as `INTERNAL_CONTRACT`. The exact network cause of that historical failure is unavailable. A live loopback truncated HTTP body must independently reproduce the relevant Undici error shape before treating the interpretation as established.

Donor `internal/models/api/endpoint.go::roundTrip` wraps body-read failures as `TransportError`, while a deterministic response-size cap and JSON decode failure are kept separate. Core already has a bounded response reader that preserves thrown causes and a bounded persistent provider scheduler. Its classifier checks the outer message but does not inspect structured cause codes.

## Alternatives and selected approach

1. Match every message `terminated`: too broad; a genuine local contract error could have that message.
2. Introduce a provider client/retry runtime from donor: unnecessary ownership and dependency change.
3. Inspect a bounded cycle-safe chain of structured transport codes in the existing classifier. Selected: recognizes actual network read failures without retrying malformed complete JSON or size-limit failures; existing scheduler controls retry/cooldown and caller cancellation.

## Contract

- Update only `src/agent-provider-errors.ts`, focused tests, affected CODEBASE and donor attribution/release intent.
- A known transport error code on the error/cause chain maps to existing `TRANSPORT_TRANSIENT`, provider scope, existing 30-second cooldown and breaker behavior.
- Traversal has a fixed maximum of eight objects and detects cycles; unknown codes and a bare `terminated` remain `INTERNAL_CONTRACT`.
- HTTP status classification keeps precedence. A complete malformed JSON/size-limit error remains deterministic. No new retries in `fetchWithPolicy`, no replay of admitted machine tools, no new config/schema/dependency.
- Verify with a real locally truncated response through `OpenAICompatibleProvider.complete`, then structured-code positive cases and deterministic/cycle/depth negatives. No provider secrets or public inference calls required for this regression.

The historical Native failure remains a bounded hypothesis unless its exact cause is recovered; the new behavior is justified by the independently reproducible transport case.
