# WeKnora provider transport implementation plan

> Agentic workers: execute the bounded task below with test-first implementation; Main owns integration and Native is the donor audit partner.

**Goal:** Keep recoverable body-read transport failures within the existing provider retry classification.

**Architecture:** Add a private bounded `hasTransientTransportCause(error: unknown): boolean` in the existing classifier owner. Preserve status precedence, deterministic refusal and scheduler budgets.

**Tech Stack:** TypeScript, Node fetch/Undici, Vitest. No new dependency.

**Spec:** [design](../specs/2026-10-26-weknora-provider-transport-design.md).

## Constraints and review focus

Known transport code required; bare messages stay unchanged. Bound depth/cycles. Preserve HTTP 4xx/size/decode/caller cancellation behavior. Do not log cause contents or credentials. All source changes remain in the current local working tree without commit/push.

## Task W-02

- [x] Add `tests/agent-provider-response-transport.test.ts`: real server writes JSON prefix, flushes it, then closes; `complete` rejects, classifier must return TRANSPORT_TRANSIENT. Also cover structured nested codes, unknown/bare/deep/cyclic errors, and deterministic size/decode cases.
- [x] Run `node node_modules/vitest/vitest.mjs run tests/agent-provider-response-transport.test.ts` and observe expected RED classification failure, not fixture/setup failure.
- [x] Implement the private helper and call it in the existing transport branch. Keep existing cooldown and scope.
- [x] Run the new test plus provider, pool, scheduler, health/readiness and outbound request tests as relevant. Preserve RED/GREEN evidence under runtime/build/weknora-donor-20261026.
- [x] Update CODEBASE, donor adoption ledger, MIT attribution note, patch release intent. Build passed and official restart activated W-02 to support Native research. Scope later expanded to a separate accepted XLSX adaptation; its final integrated build/restart belongs to that plan.
